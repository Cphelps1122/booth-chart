"""
Solutions play tracking: one game clip in, player trails out.

Runs on GitHub's computers (see .github/workflows/track.yml), never in the
charting app. For each clip:
  1. reads the video and keeps ~6 frames a second inside the clip's trim
  2. sends each kept frame to the Roboflow "Football Players" model
     (center, qb, skill, lb, db)
  3. follows the camera as it pans and zooms, so trails stay on the field
  4. links each player's boxes from frame to frame into a trail
  5. finds the snap and makes a pre-snap read from the frame before it
Everything it outputs is an estimate. Players can swap in piles and
crossings; there's no hand checking here.
"""
import base64
import math
import os
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
import requests
from scipy.optimize import linear_sum_assignment

import field as fieldmod
import presnap as presnapmod
import oline as olinemod
import card as cardmod

MODEL = os.environ.get("ROBOFLOW_MODEL", "softballtracker-sy17i/full-field-read-2-rfdetr-small-t1")     # Full Field Read v2: player, ref, football
NOT_PLAYERS = {"ref", "football", "ball"}
ROLE_OF = {"ol": "OL", "oline": "OL", "center": "OL", "c": "OL", "qb": "QB", "rb": "RB", "wr": "WR", "te": "TE", "dl": "DEF", "lb": "DEF", "db": "DEF"}
PROC_W = 960            # frames are shrunk to this width before anything else
SAMPLE_FPS = float(os.environ.get("TRACK_FPS", "6"))
MAX_SAMPLES = int(os.environ.get("TRACK_MAX_FRAMES", "90"))   # caps Roboflow calls per clip
OFF = {"center", "qb", "skill", "c", "oline", "ol", "rb", "wr", "te"}
DEF = {"lb", "db", "defense", "s", "cb", "dl"}


class KeyProblem(Exception):
    """Roboflow turned the key down: stop the whole run instead of failing every clip."""


# ---------------------------------------------------------------- video
def read_samples(path, a=None, b=None):
    """Keep about SAMPLE_FPS frames a second between a and b (seconds)."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("couldn't open the video")
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps < 5 or fps > 120:
        fps = 30.0
    a = float(a or 0)
    b = float(b) if b not in (None, "") else None
    span = (b - a) if b else None
    rate = SAMPLE_FPS
    if span and span * rate > MAX_SAMPLES:
        rate = MAX_SAMPLES / span
    frames, times, last_t, i, nxt = [], [], -1.0, 0, a
    while len(frames) < MAX_SAMPLES:
        ok, f = cap.read()
        if not ok:
            break
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if not t or t <= last_t:            # some recordings don't carry frame times
            t = last_t + 1.0 / fps if last_t >= 0 else i / fps
        last_t, i = t, i + 1
        if b is not None and t > b + 1e-3:
            break
        if t + 1e-3 < nxt:
            continue
        h, w = f.shape[:2]
        if w != PROC_W:
            f = cv2.resize(f, (PROC_W, int(round(h * PROC_W / w))), interpolation=cv2.INTER_AREA)
        frames.append(f)
        times.append(round(t, 3))
        nxt = t + 1.0 / rate
    cap.release()
    if len(frames) < 3:
        raise RuntimeError("clip too short to track")
    return frames, times


# ---------------------------------------------------------------- detection
def roboflow_detect(key, model=None, confidence=25):
    url = "https://serverless.roboflow.com/" + (model or MODEL)
    sess = requests.Session()

    def detect(img, t=None):
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        body = base64.b64encode(buf.tobytes()).decode("ascii")
        err = "no answer"
        for attempt in range(4):
            try:
                r = sess.post(url, params={"api_key": key, "confidence": confidence, "overlap": 40}, data=body,
                              headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=60)
            except requests.RequestException as e:      # never echo the request (it holds the key)
                err = type(e).__name__
                time.sleep(2 * (attempt + 1))
                continue
            if r.status_code == 200:
                return r.json().get("predictions", [])
            if r.status_code in (401, 403):
                raise KeyProblem("Roboflow turned down the API key (HTTP %d)" % r.status_code)
            if r.status_code == 402:
                raise KeyProblem("Roboflow says the account is out of credits (HTTP 402)")
            err = "HTTP %d" % r.status_code
            time.sleep(2 * (attempt + 1))
        raise RuntimeError("Roboflow didn't answer: " + err)
    return detect


def detect_all(frames, times, detect, workers=6):
    with ThreadPoolExecutor(workers) as ex:
        out = list(ex.map(lambda ft: detect(ft[0], ft[1]), zip(frames, times)))
    clean = []
    for preds in out:
        dets = []
        for p in preds or []:
            if str(p.get("class", "")).lower() in NOT_PLAYERS:     # officials and the ball aren't player trails
                continue
            try:
                dets.append({"x": float(p["x"]), "y": float(p["y"]), "w": float(p["width"]), "h": float(p["height"]),
                             "c": str(p.get("class", "")).lower(), "p": float(p.get("confidence", 0))})
            except (KeyError, TypeError, ValueError):
                pass
        dets.sort(key=lambda d: -d["p"])           # the model can box one player twice under two positions: keep the surer box
        kept = []
        for d in dets:
            if all(_overlap(d, e) < 0.7 for e in kept):         # nearly the same box; a receiver and his press corner stay two players
                kept.append(d)
        clean.append(kept)
    return clean


def _overlap(a, b):
    ix = max(0.0, min(a["x"] + a["w"] / 2, b["x"] + b["w"] / 2) - max(a["x"] - a["w"] / 2, b["x"] - b["w"] / 2))
    iy = max(0.0, min(a["y"] + a["h"] / 2, b["y"] + b["h"] / 2) - max(a["y"] - a["h"] / 2, b["y"] - b["h"] / 2))
    return ix * iy / max(1e-6, a["w"] * a["h"] + b["w"] * b["h"] - ix * iy)


# ---------------------------------------------------------------- camera motion
_orb = None


def _mask(shape, dets):
    m = np.full(shape[:2], 255, np.uint8)
    for d in dets:   # players move on their own: only the field and stands tell us how the camera moved
        x0, y0 = int(d["x"] - d["w"] * 0.7), int(d["y"] - d["h"] * 0.6)
        x1, y1 = int(d["x"] + d["w"] * 0.7), int(d["y"] + d["h"] * 0.6)
        cv2.rectangle(m, (x0, y0), (x1, y1), 0, -1)
    return m


def pair_motion(f0, f1, d0, d1):
    """Homography taking frame f0's pixels to frame f1's, or None."""
    global _orb
    if _orb is None:
        _orb = cv2.ORB_create(2000)
    g0, g1 = cv2.cvtColor(f0, cv2.COLOR_BGR2GRAY), cv2.cvtColor(f1, cv2.COLOR_BGR2GRAY)
    k0, e0 = _orb.detectAndCompute(g0, _mask(f0.shape, d0))
    k1, e1 = _orb.detectAndCompute(g1, _mask(f1.shape, d1))
    if e0 is None or e1 is None or len(k0) < 15 or len(k1) < 15:
        return None
    m = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(e0, e1)
    m = sorted(m, key=lambda x: x.distance)[:600]
    if len(m) < 15:
        return None
    src = np.float32([k0[x.queryIdx].pt for x in m]).reshape(-1, 1, 2)
    dst = np.float32([k1[x.trainIdx].pt for x in m]).reshape(-1, 1, 2)
    H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    if H is None or inl is None or int(inl.sum()) < 12:
        return None
    # a camera move between two frames 1/6 s apart is small: reject wild fits
    c = np.float32([[[0, 0]], [[f0.shape[1], 0]], [[0, f0.shape[0]]], [[f0.shape[1], f0.shape[0]]]])
    if np.abs(cv2.perspectiveTransform(c, H) - c).max() > f0.shape[1] * 0.35:
        return None
    return H


def camera_path(frames, dets):
    """Hs[k] takes the first kept frame's pixels to frame k's pixels."""
    Hs, fails = [np.eye(3)], 0
    for k in range(1, len(frames)):
        P = pair_motion(frames[k - 1], frames[k], dets[k - 1], dets[k])
        if P is None:
            fails += 1
            P = np.eye(3)
        H = P @ Hs[-1]
        Hs.append(H / H[2, 2])
    return Hs, fails


def to_ref(G, x, y):
    v = G @ np.array([x, y, 1.0])
    return v[0] / v[2], v[1] / v[2]


# ---------------------------------------------------------------- teams
def torso_lab(img, d):
    h, w = img.shape[:2]
    x0, x1 = int(max(0, d["x"] - d["w"] * 0.25)), int(min(w, d["x"] + d["w"] * 0.25))
    y0, y1 = int(max(0, d["y"] - d["h"] * 0.35)), int(min(h, d["y"] - d["h"] * 0.02))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return None
    lab = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2LAB).reshape(-1, 3)
    return np.median(lab, axis=0)


MODE = {"unsup": False, "player_only": False}


def side_model(frames, dets, upto):
    """Jersey colors for each side, learned from what the model labeled offense and defense before the snap."""
    o, d = [], []
    for k in range(0, max(1, upto)):
        for x in dets[k]:
            c = torso_lab(frames[k], x)
            if c is None:
                continue
            if x["c"] in OFF:
                o.append(c)
            elif x["c"] in DEF:
                d.append(c)
    MODE["unsup"] = False
    if not o and not d:                   # a model that only says "player": split the two jersey colors ourselves
        cols = [c for k in range(0, max(1, upto)) for x in dets[k] for c in [torso_lab(frames[k], x)] if c is not None]
        if len(cols) < 12:
            return None
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.5)
        _, lab, cen = cv2.kmeans(np.float32(cols), 2, None, crit, 6, cv2.KMEANS_PP_CENTERS)
        if np.linalg.norm(cen[0] - cen[1]) < 12 or min(np.bincount(lab.flatten(), minlength=2)) < 4:
            return None
        MODE["unsup"] = True              # which color is the offense gets settled from the alignment, in measure()
        return cen[0], cen[1]
    if len(o) < 4 or len(d) < 4:
        return None
    mo, md = np.median(o, axis=0), np.median(d, axis=0)
    if np.linalg.norm(mo - md) < 12:      # both teams look the same to the camera: fall back to labels
        return None
    return mo, md


def side_of(det, col, model):
    if model is not None and col is not None:
        do, dd = np.linalg.norm(col - model[0]), np.linalg.norm(col - model[1])
        if min(do, dd) > 60:
            return "x"
        return "o" if do <= dd else "d"
    return "o" if det["c"] in OFF else "d" if det["c"] in DEF else "x"


# ---------------------------------------------------------------- tracking
def link(frames, times, dets, Hs, model):
    Gs = [np.linalg.inv(H) for H in Hs]
    hs = [d["h"] * math.sqrt(abs(np.linalg.det(Gs[k][:2, :2]))) for k in range(len(dets)) for d in dets[k]]
    unit = float(np.median(hs)) if hs else 40.0           # a player's height, in reference pixels
    tracks, nid = [], 0
    for k, ds in enumerate(dets):
        pts = []
        for d in ds:
            col = torso_lab(frames[k], d)
            fx, fy = d["x"], d["y"] + d["h"] / 2            # feet: where he is on the field
            rx, ry = to_ref(Gs[k], fx, fy)
            pts.append({"rx": rx, "ry": ry, "side": side_of(d, col, model), "c": d["c"], "d": d})
        live = [t for t in tracks if k - t["last"] <= 4]
        cost = np.full((len(live), len(pts)), 1e6)
        for i, t in enumerate(live):
            gap = k - t["last"]
            px, py = t["p"][-1][1] + t["vx"] * gap, t["p"][-1][2] + t["vy"] * gap
            gate = 0.8 + 0.4 * gap              # a sprinter covers about 1/2 a body height per kept frame
            for j, q in enumerate(pts):
                dist = math.hypot(q["rx"] - px, q["ry"] - py) / unit
                if dist > gate:
                    continue
                ts = t["sides"].most_common(1)[0][0]
                if q["side"] != ts and "x" not in (q["side"], ts) and sum(t["sides"].values()) >= 3:
                    continue                                # jersey says other team: never the same player
                cost[i, j] = dist
        used = set()
        if live and pts:
            r, c = linear_sum_assignment(cost)
            for i, j in zip(r, c):
                if cost[i, j] >= 1e5:
                    continue
                t, q = live[i], pts[j]
                gap = k - t["last"]
                vx, vy = (q["rx"] - t["p"][-1][1]) / gap, (q["ry"] - t["p"][-1][2]) / gap
                t["vx"], t["vy"] = 0.3 * t["vx"] + 0.7 * vx, 0.3 * t["vy"] + 0.7 * vy
                t["p"].append([k, q["rx"], q["ry"]])
                t["last"] = k
                t["cls"][q["c"]] += 1
                t["sides"][q["side"]] += 1
                used.add(j)
        for j, q in enumerate(pts):
            if j in used:
                continue
            tracks.append({"id": nid, "p": [[k, q["rx"], q["ry"]]], "last": k, "vx": 0.0, "vy": 0.0,
                           "cls": Counter([q["c"]]), "sides": Counter([q["side"]])})
            nid += 1
    n = len(dets)
    tracks = stitch(tracks, unit)
    keep = [t for t in tracks if len(t["p"]) >= max(4, int(n * 0.2))]
    for t in keep:
        s = t["sides"].most_common(1)[0][0]
        t["side"] = s if s != "x" else ("o" if sum(t["cls"][c] for c in OFF) >= sum(t["cls"][c] for c in DEF) else "d")
    return keep, unit


def stitch(tracks, unit, max_gap=12):
    """Joins a trail that ended to one that started soon after nearby: the same player, lost for a moment."""
    pairs = []
    for i, a in enumerate(tracks):
        for j, b in enumerate(tracks):
            gap = b["p"][0][0] - a["last"]
            if i == j or gap <= 0 or gap > max_gap:
                continue
            sa, sb = a["sides"].most_common(1)[0][0], b["sides"].most_common(1)[0][0]
            if sa != sb and "x" not in (sa, sb):
                continue
            dist = math.hypot(b["p"][0][1] - a["p"][-1][1] - a["vx"] * gap, b["p"][0][2] - a["p"][-1][2] - a["vy"] * gap) / unit
            if dist <= 0.6 + 0.25 * gap:
                pairs.append((dist / gap, i, j))
    head, tail, into = set(), set(), {}
    for _, i, j in sorted(pairs):
        root = j
        while root in into:
            root = into[root]
        if i in tail or j in head or root == i:      # root check: never join a trail onto itself
            continue
        tail.add(i)
        head.add(j)
        into[i] = j
    gone = set()
    for i in sorted(into, key=lambda x: tracks[x]["p"][0][0]):
        a, b = tracks[i], tracks[into[i]]
        b["p"] = a["p"] + b["p"]
        b["cls"] += a["cls"]
        b["sides"] += a["sides"]
        gone.add(i)
    return [t for i, t in enumerate(tracks) if i not in gone]


def smooth(p):
    if len(p) < 3:
        return p
    out = [p[0]]
    for i in range(1, len(p) - 1):
        out.append([p[i][0], (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4, (p[i - 1][2] + 2 * p[i][2] + p[i + 1][2]) / 4])
    out.append(p[-1])
    return out


# ---------------------------------------------------------------- snap + pre-snap read
def find_snap(tracks, times, unit):
    """First moment most of the offense starts moving at once."""
    n = len(times)

    def frac(kk):
        moving = tot = 0
        for t in tracks:
            a = {q[0]: q for q in t["p"]}
            if kk in a and kk - 1 in a:
                tot += 1
                step = math.hypot(a[kk][1] - a[kk - 1][1], a[kk][2] - a[kk - 1][2]) / unit
                moving += step / max(1e-3, times[kk] - times[kk - 1]) > 0.8      # about 1.5+ yards a second
        return moving / tot if tot >= 5 else 0
    for k in range(1, n - 1):
        if frac(k) >= 0.4 and frac(k + 1) >= 0.4:   # both teams move at the snap, so count everyone
            return k
    return None


def presnap_read(dets_k):
    if not dets_k:
        return None
    cnt = Counter(d["c"] for d in dets_k)
    off = [d for d in dets_k if d["c"] in OFF]
    de = [d for d in dets_k if d["c"] in DEF]
    out = {"qb": cnt.get("qb", 0), "center": cnt.get("center", 0) + cnt.get("c", 0), "skill": cnt.get("skill", 0),
           "lb": cnt.get("lb", 0), "db": cnt.get("db", 0)}
    if len(off) < 3 or len(de) < 3:
        return out
    hgt = float(np.median([d["h"] for d in dets_k]))
    cen = [d for d in dets_k if d["c"] in ("center", "c")]
    oc = np.mean([[d["x"], d["y"] + d["h"] / 2] for d in off], axis=0)
    dc = np.mean([[d["x"], d["y"] + d["h"] / 2] for d in de], axis=0)
    c0 = np.array([cen[0]["x"], cen[0]["y"] + cen[0]["h"] / 2]) if cen else oc
    u = dc - oc
    if np.linalg.norm(u) < 1:
        return out
    u = u / np.linalg.norm(u)
    v = np.array([-u[1], u[0]])
    box = deep = 0
    for d in de:
        p = np.array([d["x"], d["y"] + d["h"] / 2]) - c0
        depth, lat = float(p @ u) / hgt, float(p @ v) / hgt
        if depth <= 4.0 and abs(lat) <= 2.6:
            box += 1
        if depth >= 5.0:
            deep += 1
    out.update({"box": box, "deep": deep, "shell": "0-high" if deep == 0 else "1-high" if deep == 1 else "2-high"})
    return out


# ---------------------------------------------------------------- yards
MPH = 3600 / 1760.0


HASH_MODEL = "hash-yards-intersection/4"
HASH = {"detect": None, "used": 0}


def hash_fit(img, t, seed):
    """Field ruler from the Hash Yards Intersection model: each mark is a yard line crossing a hash row.
    seed (image -> field) only says which line and row each mark is; the marks set the exact fit."""
    if HASH["detect"] is None:
        return None
    try:
        preds = HASH["detect"](img, t)
    except Exception:
        return None
    pts = [(p["x"], p["y"]) for p in preds or [] if p.get("confidence", 1) >= 0.3]
    if len(pts) < 6:
        return None
    img_p = np.float32(pts)
    fld = cv2.perspectiveTransform(img_p.reshape(-1, 1, 2), seed).reshape(-1, 2)
    rows = np.array([0.0, fieldmod.HASH_YARDS])
    snap = np.stack([5.0 * np.round(fld[:, 0] / 5.0), rows[np.argmin(np.abs(fld[:, 1:2] - rows), axis=1)]], axis=1)
    ok = np.hypot(*(fld - snap).T) < 2.0
    if ok.sum() < 6 or len(set(snap[ok, 1])) < 2 or len(set(snap[ok, 0])) < 2:
        # the crossings don't sit on the seed's 5-yard grid: the paint reading is off (it can skip every other
        # line and come out half scale). The crossings are the real grid, so read the field from them alone.
        M = fieldmod.fit_hash(pts, img.shape[1], img.shape[0], cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
        if M is not None:
            HASH["used"] += 1
            HASH["overruled"] = HASH.get("overruled", 0) + 1
        return M
    M, inl = cv2.findHomography(img_p[ok], np.float32(snap[ok]), cv2.RANSAC, 0.75)
    if M is None or inl.sum() < 6:
        return None
    HASH["used"] += 1
    return M


def hash_only(frames, times, Hs, tracks, k_pre):
    """Field ruler from hash crossings on a few frames; the reading most of them agree on wins. Returns (F, frame) or None."""
    if HASH["detect"] is None:
        return None
    n, cands = len(frames), []
    for k in dict.fromkeys([k_pre, max(0, k_pre - 4), min(n - 1, k_pre + 4), n // 3, (2 * n) // 3]):
        try:
            preds = HASH["detect"](frames[k], times[k])
        except Exception:
            continue
        pts = [(p["x"], p["y"]) for p in preds or [] if p.get("confidence", 1) >= 0.3]
        h, w = frames[k].shape[:2]
        M = fieldmod.fit_hash(pts, w, h, cv2.cvtColor(frames[k], cv2.COLOR_BGR2GRAY))
        if M is not None:
            F = M @ Hs[k]
            cands.append((F / F[2, 2], k))
    if not cands:
        return None
    P = np.float32([[q[1], q[2]] for t in tracks for q in t["p"][:1]]).reshape(-1, 1, 2)
    fld = [cv2.perspectiveTransform(P, F).reshape(-1, 2) for F, _ in cands]

    def same(a, b):
        dx, dy = a[:, 0] - b[:, 0], a[:, 1] - b[:, 1]
        return np.median(np.abs(dx - 5.0 * np.round(dx / 5.0))) < 1.0 and np.median(np.abs(dy)) < 1.0 \
            and np.std(dx) < 1.5
    votes = [sum(same(a, b) for b in fld) for a in fld]
    best = int(np.argmax(votes))
    if len(cands) > 1 and votes[best] < 2:          # no two frames agree: don't guess
        return None
    HASH["used"] += 1
    return cands[best]


def drift_fix(frames, dets, Hs, F, k0, every=8, times=None):
    """Re-reads the paint through the play and returns how far off the camera-follow has drifted, frame by frame.
    Paint only numbers yard lines from the first one it sees, so any 5-yard difference isn't drift."""
    n = len(frames)
    step = max(1, n // every)

    def walk(ks):
        px, py, got = 0.0, 0.0, []
        for k in ks:
            if len(dets[k]) < 4:
                continue
            M = hash_fit(frames[k], times[k] if times else None, F @ np.linalg.inv(Hs[k]))
            if M is None:
                res, _ = fieldmod.fit(frames[k], dets[k])
                if not res:
                    continue
                M = res["F"]
            P = np.float32([[d["x"], d["y"] + d["h"] / 2] for d in dets[k]]).reshape(-1, 1, 2)
            main = cv2.perspectiveTransform(P, F @ np.linalg.inv(Hs[k])).reshape(-1, 2)
            paint = cv2.perspectiveTransform(P, M).reshape(-1, 2)
            dx, dy = main[:, 0] - paint[:, 0], main[:, 1] - paint[:, 1]
            mx, my = float(np.median(dx)), float(np.median(dy))
            cx = mx - 5.0 * round((mx - px) / 5.0)
            if abs(my - py) > 2.5 or abs(cx - px) > 2.5 or max(np.std(dx), np.std(dy)) > 1.5:
                continue                                # this frame's paint read doesn't agree: ignore it
            px, py = cx, my
            got.append((k, cx, my))
        return got
    pts = walk(range(k0 + step, n, step)) + walk(range(k0 - step, -1, -step)) + [(k0, 0.0, 0.0)]
    pts.sort()
    ks = [p[0] for p in pts]
    return np.interp(range(n), ks, [p[1] for p in pts]), np.interp(range(n), ks, [p[2] for p in pts]), len(pts) - 1


def measure(frames, dets, Hs, times, tracks, k_pre, k_snap):
    """Field ruler from the yard lines, then depth, speed and position in yards for every trail point."""
    n = len(frames)
    order, why, fit = [], None, None
    for k in [k_pre, max(0, k_pre - 2), 0, min(n - 1, k_pre + 3), n // 2]:
        if k not in order:
            order.append(k)
    for k in order:
        fit, why = fieldmod.fit(frames[k], dets[k])
        if fit:
            M = hash_fit(frames[k], times[k], fit["F"])      # sharper ruler from the hash crossings when the model sees them
            F = (M if M is not None else fit["F"]) @ Hs[k]
            F = F / F[2, 2]
            break
    if not fit:                                     # paint too faint to read: build the ruler from the hash model alone
        got = hash_only(frames, times, Hs, tracks, k_pre)
        if got is None:
            return {"ok": False, "why": why}
        F, k = got
        fit = {"lines": None, "fromHash": True}
    for t in tracks:
        P = np.float32([[q[1], q[2]] for q in t["p"]]).reshape(-1, 1, 2)
        t["f"] = cv2.perspectiveTransform(P, F).reshape(-1, 2).tolist()
    cx, cy, checks = drift_fix(frames, dets, Hs, F, k, times=times)
    for t in tracks:
        t["f"] = [[f[0] - cx[q[0]], f[1] - cy[q[0]]] for q, f in zip(t["p"], t["f"])]

    def at(t, k):
        best = min(zip(t["p"], t["f"]), key=lambda x: abs(x[0][0] - k))
        return best[1] if abs(best[0][0] - k) <= 3 else None
    def teams():
        o = [f for f in (at(t, k_pre) for t in tracks if t["side"] == "o") if f]
        d = [f for f in (at(t, k_pre) for t in tracks if t["side"] == "d") if f]
        return o, d
    off, de = teams()
    if len(off) < 2 or len(de) < 3:
        return {"ok": False, "why": "couldn't see both teams before the snap"}
    if MODE["unsup"]:           # the offense puts 7 on the line and nobody deep; the defense has deep safeties
        s = 1.0 if np.median([f[0] for f in de]) > np.median([f[0] for f in off]) else -1.0
        mid = (np.percentile([s * f[0] for f in off], 85) + np.percentile([s * f[0] for f in de], 15)) / 2
        score = lambda dist: sum(1 for v in dist if v <= 2.0) - 2 * sum(1 for v in dist if v >= 7.5)
        if score([s * f[0] - mid for f in de]) > score([mid - s * f[0] for f in off]):
            for t in tracks:
                t["side"] = {"o": "d", "d": "o"}.get(t["side"], t["side"])
            off, de = teams()
    sgn = 1.0 if np.mean([f[0] for f in de]) > np.mean([f[0] for f in off]) else -1.0
    if MODE["player_only"]:
        los0 = (np.percentile([sgn * f[0] for f in off], 85) + np.percentile([sgn * f[0] for f in de], 15)) / 2
        for t in tracks:                            # before the snap everyone is on his own side of the ball
            f = at(t, k_pre)
            if f:
                d = sgn * f[0] - los0
                if t["side"] == "x" and abs(d) > 0.5 or abs(d) > 2.5:
                    t["side"] = "d" if d > 0 else "o"
        presnapmod.align_roles(tracks, lambda t: at(t, k_pre), sgn, los0)
    cen = [at(t, k_pre) for t in tracks if t["side"] == "o" and t["cls"].most_common(1)[0][0] in ("center", "c")]
    cen = [f for f in cen if f]
    ol = [at(t, k_pre) for t in tracks if t["side"] == "o" and (t.get("role") == "OL" if MODE["player_only"] else t["cls"].most_common(1)[0][0] in ("ol", "oline"))]
    ol = [f for f in ol if f]
    if cen:
        los = sgn * cen[0][0] + 0.5                 # the ball is just in front of the center's feet
    elif len(ol) >= 3:
        los = float(np.median([sgn * f[0] for f in ol])) + 0.5     # linemen stand just behind the ball
    else:
        los = (np.percentile([sgn * f[0] for f in off], 85) + np.percentile([sgn * f[0] for f in de], 15)) / 2
    k0 = k_snap if k_snap is not None else 0
    for t in tracks:                                # a jump no player could make means the trail hopped to someone else: cut it there
        ks, f = [q[0] for q in t["p"]], t["f"]
        i0 = min(range(len(ks)), key=lambda i: abs(ks[i] - (k_snap if k_snap is not None else k_pre)))

        def bad(i, j):
            dt = abs(times[ks[j]] - times[ks[i]])
            return dt > 0 and math.hypot(f[j][0] - f[i][0], f[j][1] - f[i][1]) / dt > 12.5      # yards a second, about 25 mph
        hi = next((i + 1 for i in range(i0, len(ks) - 2) if bad(i, i + 2)), len(ks))
        lo = next((i for i in range(i0, 1, -1) if bad(i, i - 2)), 0)
        if lo > 0 or hi < len(ks):
            t["p"], t["f"], t["cut"] = t["p"][lo:hi], t["f"][lo:hi], True
    for t in tracks:
        ks = [q[0] for q in t["p"]]
        mph = []
        for i in range(len(ks)):
            a, b = max(0, i - 2), min(len(ks) - 1, i + 2)
            dt = times[ks[b]] - times[ks[a]]
            if b - a < 2 or dt <= 0 or ks[b] - ks[a] > (b - a) + 2:
                mph.append(None)
                continue
            d = math.hypot(t["f"][b][0] - t["f"][a][0], t["f"][b][1] - t["f"][a][1])
            v = d / dt * MPH
            mph.append(round(v, 1) if v <= 24 else None)    # faster than any high schooler: a tracking glitch
        t["mph"] = mph
        after = [i for i, k in enumerate(ks) if k >= k0]
        dep = [sgn * t["f"][i][0] - los for i in after]
        sp = [mph[i] for i in after if mph[i] is not None]
        t["deep"] = round(max(dep), 1) if dep else None
        t["top"] = round(max(sp), 1) if sp else None
    return {"ok": True, "F": [round(float(x), 7) for x in F.flatten()[:8]], "dir": sgn, "los": round(float(los), 2),
            "dx": [round(float(x), 2) for x in cx], "dy": [round(float(x), 2) for x in cy],
            "hashFits": HASH["used"], "paintOverruled": HASH.get("overruled", 0), "drift": round(float(max(np.max(np.abs(cx)), np.max(np.abs(cy)))), 2), "driftChecks": checks, "lines": fit.get("lines"), "tick": fit.get("tick"), "rms": fit.get("rms"), "fromHash": bool(fit.get("fromHash")), "hashYards": round(fieldmod.HASH_YARDS, 2)}


# ---------------------------------------------------------------- one clip
def process(path, detect, a=None, b=None, snap=None, presnap_detect=None, hash_detect=None):
    t0 = time.time()
    HASH["detect"], HASH["used"], HASH["overruled"] = hash_detect, 0, 0
    frames, times = read_samples(path, a, b)
    dets = detect_all(frames, times, detect)
    Hs, fails = camera_path(frames, dets)
    n = len(frames)
    k_snap = None
    if snap not in (None, ""):
        try:
            k_snap = min(range(n), key=lambda i: abs(times[i] - float(snap)))
        except (TypeError, ValueError):
            k_snap = None
    upto = k_snap if k_snap else max(2, n // 4)
    model = side_model(frames, dets, upto)
    tracks, unit = link(frames, times, dets, Hs, model)
    if k_snap is None:
        k_snap = find_snap(tracks, times, unit)
    k_pre = max(0, (k_snap or 1) - 1)
    pre = presnap_read(dets[k_pre]) or {}
    info = None
    if presnap_detect is not None:
        try:
            to_field = None
            for j in sorted(range(n), key=lambda x: abs(x - k_pre)):      # the nearest frame the paint can be read on
                res, _ = fieldmod.fit(frames[j], dets[j])
                if res:
                    A = res["F"] @ Hs[j] @ np.linalg.inv(Hs[k_pre])
                    to_field = lambda p, A=A: cv2.perspectiveTransform(p.reshape(-1, 1, 2), A).reshape(-1, 2)
                    break
            info = presnapmod.read(presnap_detect(frames[k_pre], times[k_pre]), to_field, frames[k_pre])
        except KeyProblem:
            raise
        except Exception:                           # the extra read is a bonus: never lose the clip over it
            info = None
    tracks = presnapmod.apply(tracks, info, Hs[k_pre], k_pre, unit)
    for t in tracks:                # Full Field Read was trained on positions: its label wins; the pre-snap read only splits WR/Slot
        c = t["cls"].most_common(1)[0][0]
        if c in ROLE_OF and t["cls"][c] >= 0.5 * sum(t["cls"].values()):
            r = ROLE_OF[c]
            js, n = t["sides"].most_common(1)[0]
            if js != "x" and n >= 0.7 * sum(t["sides"].values()) and js != ("d" if r == "DEF" else "o"):
                # his jersey says the other team: trust the jersey. A "DB" in the offense's color is the receiver he lines up on.
                r = "DEF" if js == "d" else ("WR" if c == "db" else t.get("role") if t.get("role") in ("WR", "Slot", "TE", "RB") else None)
                t["side"] = js
                if r is None:
                    t.pop("role", None)
                    continue
            t["role"] = "Slot" if r == "WR" and t.get("role") == "Slot" else r
            t["side"] = "d" if r == "DEF" else "o"
    MODE["player_only"] = not any(c in OFF | DEF for d in dets for c in [x["c"] for x in d])
    if MODE["player_only"]:         # positions come from the alignment in measure(), teams from jersey color
        for t in tracks:
            t.pop("role", None)
            t["side"] = t["sides"].most_common(1)[0][0]
    if info:
        pre.update({x: info[x] for x in ("view", "splits", "personnel", "box", "deep", "shell", "fixed")})
    if (MODE["player_only"] and sum(1 for t in tracks if t["p"][0][0] <= k_pre + 1) >= 12) or info and sum(1 for t in tracks if t.get("role")) >= 6:     # good read: role-less trails starting after the snap are pieces
        tracks = [t for t in tracks if t["p"][0][0] <= k_pre + 1]
    for t in tracks:
        t["p"] = smooth(t["p"])
    fld = measure(frames, dets, Hs, times, tracks, k_pre, k_snap)
    if fld.get("ok"):
        k0 = k_snap if k_snap is not None else k_pre
        tracks = [t for t in tracks if -21.5 <= float(np.median([f[1] for f in t["f"]])) <= 34.8]     # on the field only
        tracks = presnapmod.tidy(tracks, k0)
        pre.update(presnapmod.formation(tracks, k0, fld["dir"], fld["los"]))
        presnapmod.cover(tracks, k0)
        presnapmod.routes(tracks, k0, fld["dir"], fld["los"])
        try:
            line = olinemod.measure(tracks, k0, times, fld["dir"], fld["los"], pre, k_snap is not None)
        except Exception:                           # line numbers are a bonus: never lose the clip over them
            line = None
    if not fld.get("ok"):
        line = None
    out_tracks = []
    for t in tracks:
        cls = [c for c, _ in t["cls"].most_common() if c in OFF | DEF]
        o = {"id": t["id"], "side": t["side"], "cls": cls[0] if cls else "",
             "p": [[q[0], round(q[1], 1), round(q[2], 1)] for q in t["p"]]}
        if fld.get("ok"):
            o["f"] = [[round(f[0], 2), round(f[1], 2)] for f in t["f"]]
            o["mph"], o["deep"], o["top"] = t["mph"], t["deep"], t["top"]
        for x in ("role", "route", "cover", "sepSnap", "dpos"):
            if x in t:
                o[x] = t[x]
        out_tracks.append(o)
    h, w = frames[0].shape[:2]
    out = {
        "v": 2, "model": MODEL, "W": w, "H": h, "t": times,
        "Hs": [[round(float(x), 6) for x in H.flatten()[:8]] for H in Hs],
        "snap": times[k_snap] if k_snap is not None else None, "snapK": k_snap, "snapFrom": "clip" if snap not in (None, "") else ("motion" if k_snap is not None else None),
        "preK": k_pre, "preDets": [[round(d["x"], 1), round(d["y"], 1), round(d["w"], 1), round(d["h"], 1), d["c"], round(d["p"], 2)] for d in dets[k_pre]],
        "pre": pre, "oline": line, "tracks": out_tracks, "field": fld, "unit": round(unit, 1), "camFails": fails,
        "calls": len(frames), "secs": round(time.time() - t0, 1), "teamColors": model is not None,
    }
    try:
        out["card"] = cardmod.make(frames, out)     # top-down field picture for the play card
    except Exception:                               # the card is a bonus: never lose the clip over it
        out["card"] = None
    return out
