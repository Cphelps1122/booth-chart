"""
Pre-snap read for one frame, and what it tells the tracker.

Uses the Roboflow "Football Presnap Tracker" model (oline, qb, skill, defense,
ref). The label fixes and formation logic come from presnap_scout.py /
presnap_phone.py. On top of those, this file names each skill player, drops
refs from the trails, pairs receivers with defenders, and names routes.
Everything here is an estimate from where players stand and run.
"""
import math
import statistics

import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment

MODEL = "football-presnap-tracker/6"
CONF, QB_CONF = 0.40, 0.15
CB_DEPTH, BOX_DEPTH, DEEP_DEPTH = 1.0, 5.5, 10.0     # yards
RECEIVERS = ("WR", "Slot", "TE", "RB")
COVER_MAX_YD = 15.0


def _mean(v):
    return sum(v) / len(v)


def keep(preds):
    return [p for p in preds or [] if p.get("confidence", 0) >= (QB_CONF if p.get("class") == "qb" else CONF)]


def _yardify(preds, ol, to_field):
    """Sets _a (along the field) and _b (across it) in yards on every player. Works with the field on a diagonal."""
    feet = np.float32([[p["x"], p["y"] + p["height"] / 2] for p in preds]).reshape(-1, 2)
    if to_field is not None:
        out = to_field(feet)
    else:                       # no paint read: use the line itself as the ruler (tackle to tackle is about 8 yards)
        pts = np.array([[p["x"], p["y"] + p["height"] / 2] for p in ol], dtype=float)
        qbs = [p for p in preds if p["class"] == "qb"]
        if len(ol) < 4 or not qbs:
            return False
        c = pts.mean(axis=0)
        u = np.linalg.svd(pts - c)[2][0]
        span = float(np.ptp((pts - c) @ u))
        q = min(qbs, key=lambda p: -p.get("confidence", 0))
        v = np.array([q["x"], q["y"] + q["height"] / 2]) - c
        m = np.array([v, u * span / 8.0 * 5.0]).T       # QB assumed about 5 yards deep
        if span < 8 or abs(np.linalg.det(m)) < 1:
            return False
        out = (np.linalg.inv(m) @ (feet - c).T).T * 5.0
    for p, f in zip(preds, out):
        p["_a"], p["_b"] = float(f[0]), float(f[1])
    return True


def geometry(preds, to_field=None):
    ol = [p for p in preds if p["class"] == "oline"]
    de = [p for p in preds if p["class"] == "defense"]
    if len(ol) < 3 or not de or not _yardify(preds, ol, to_field):
        return None
    g = {"los": _mean([p["_a"] for p in ol])}
    g["toward_d"] = 1 if _mean([p["_a"] for p in de]) > g["los"] else -1
    g["center"] = statistics.median([p["_b"] for p in ol])
    g["ol_lo"] = min(p["_b"] for p in ol) - 0.5
    g["ol_hi"] = max(p["_b"] for p in ol) + 0.5
    g["box_lo"], g["box_hi"] = g["ol_lo"] - 2.0, g["ol_hi"] + 2.0
    g["view"] = "field yards" if to_field is not None else "line ruler"
    return g


def depth_of(p, g):
    """Yards from the line (+ = defense side)."""
    return (p["_a"] - g["los"]) * g["toward_d"]


def _iou(a, b):
    ax, ay = a["x"] - a["width"] / 2, a["y"] - a["height"] / 2
    bx, by = b["x"] - b["width"] / 2, b["y"] - b["height"] / 2
    ix = max(0, min(ax + a["width"], bx + b["width"]) - max(ax, bx))
    iy = max(0, min(ay + a["height"], by + b["height"]) - max(ay, by))
    u = a["width"] * a["height"] + b["width"] * b["height"] - ix * iy
    return ix * iy / u if u else 0


def fix_classes(preds, to_field=None):
    """Correct the model's common mix-ups. Returns (predictions, number relabeled)."""
    preds = [dict(p) for p in preds]
    drop = set()
    for i, a in enumerate(preds):
        for j, b in enumerate(preds):
            if i >= j:
                continue
            pair = {a["class"], b["class"]}
            if (pair == {"skill", "defense"} and _iou(a, b) > 0.5) or (pair <= {"qb", "skill"} and _iou(a, b) > 0.6):
                drop.add(i if a.get("confidence", 0) < b.get("confidence", 0) else j)
    preds = [p for k, p in enumerate(preds) if k not in drop]
    g = geometry(preds, to_field)
    if g is None:
        return preds, 0
    d = lambda p: depth_of(p, g)
    fixed = 0
    for p in preds:
        if p["class"] == "skill" and d(p) > CB_DEPTH:
            p["class"] = "defense"
            fixed += 1
    lat, center = "_b", g["center"]
    qbs = [p for p in preds if p["class"] == "qb"]
    if len(qbs) > 1:
        best = min(qbs, key=lambda p: abs(p[lat] - center))
        for p in qbs:
            if p is not best:
                p["class"] = "skill"
                fixed += 1
    elif not qbs:
        back = [p for p in preds if p["class"] == "skill" and d(p) < -0.5
                and g["ol_lo"] - 1.5 <= p[lat] <= g["ol_hi"] + 1.5]
        if back:
            min(back, key=lambda p: (abs(p[lat] - center) > 1.5, -d(p), abs(p[lat] - center)))["class"] = "qb"
            fixed += 1
    sk = sorted([p for p in preds if p["class"] == "skill"], key=d, reverse=True)
    for p in sk[:max(0, len(sk) - 5)]:
        if d(p) > -1.0:
            p["class"] = "defense"
            fixed += 1
    n = sum(1 for p in preds if p["class"] == "skill")
    for p in sorted([p for p in preds if p["class"] == "defense"], key=d):
        if n >= 5 or d(p) > -2.0:
            break
        p["class"] = "skill"
        n += 1
        fixed += 1
    return preds, fixed


def read(preds, to_field=None):
    """Formation info plus a role on every player. None if the frame can't be read."""
    preds, fixed = fix_classes(keep(preds), to_field)
    g = geometry(preds, to_field)
    if g is None:
        return None
    lat, center = "_b", g["center"]
    names = {"oline": "OL", "qb": "QB", "defense": "DEF", "ref": "REF"}
    left, right = [], []
    backs = inline = 0
    for p in preds:
        if p["class"] != "skill":
            p["role"] = names.get(p["class"], "")
            continue
        inside, d = g["box_lo"] <= p[lat] <= g["box_hi"], depth_of(p, g)
        if inside and d < -1.5:
            p["role"], backs = "RB", backs + 1
        elif inside:
            p["role"], inline = "TE", inline + 1
        else:
            (left if p[lat] < center else right).append(p)
    for side in (left, right):
        side.sort(key=lambda p: abs(p[lat] - center), reverse=True)
        for i, p in enumerate(side):
            p["role"] = "WR" if i == 0 else "Slot"
    sl = len(left) + sum(1 for p in preds if p.get("role") == "TE" and p[lat] < center)
    sr = len(right) + sum(1 for p in preds if p.get("role") == "TE" and p[lat] >= center)
    de = [p for p in preds if p["class"] == "defense"]
    box = sum(1 for p in de if g["box_lo"] <= p[lat] <= g["box_hi"] and 0 < depth_of(p, g) <= BOX_DEPTH)
    deep = sum(1 for p in de if depth_of(p, g) > DEEP_DEPTH)
    return {"preds": preds, "fixed": fixed, "view": g["view"], "splits": "%dx%d" % (max(sl, sr), min(sl, sr)),
            "personnel": "%d%d" % (backs, inline), "box": box, "deep": deep,
            "shell": "0-high" if deep == 0 else "1-high" if deep == 1 else "2-high"}


def apply(tracks, info, H_k, k, unit):
    """Give trails their pre-snap roles and teams, and remove refs. Returns the tracks to keep."""
    if not info:
        return tracks
    G = np.linalg.inv(np.array(H_k, dtype=float))
    pts = []
    for p in info["preds"]:
        v = G @ np.array([p["x"], p["y"] + p["height"] / 2, 1.0])
        pts.append((v[0] / v[2], v[1] / v[2], p))
    near, idx = [], []
    for i, t in enumerate(tracks):
        q = min(t["p"], key=lambda a: abs(a[0] - k))
        if abs(q[0] - k) <= 3:
            near.append(q)
            idx.append(i)
    if not near or not pts:
        return tracks
    cost = np.array([[math.hypot(q[1] - a[0], q[2] - a[1]) / unit for a in pts] for q in near])
    gone = set()
    for r, c in zip(*linear_sum_assignment(cost)):
        if cost[r, c] > 1.0:
            continue
        t, role = tracks[idx[r]], pts[c][2].get("role", "")
        if role == "REF":
            gone.add(idx[r])
        elif role:
            t["role"], t["side"] = role, "d" if role == "DEF" else "o"
    return [t for i, t in enumerate(tracks) if i not in gone]


def _at(t, k):
    for q, f in zip(t["p"], t["f"]):
        if q[0] == k:
            return f
    return None


def cover(tracks, k):
    """Pairs each receiver with the defender closest to him at the snap. Sets cover and sepSnap (yards)."""
    rec = [(t, _at(t, k)) for t in tracks if t.get("role") in RECEIVERS and "f" in t]
    de = [(t, _at(t, k)) for t in tracks if t.get("side") == "d" and "f" in t]
    rec, de = [r for r in rec if r[1]], [d for d in de if d[1]]
    if not rec or not de:
        return
    cost = np.array([[math.hypot(a[1][0] - b[1][0], a[1][1] - b[1][1]) for b in de] for a in rec])
    for r, c in zip(*linear_sum_assignment(cost)):
        if cost[r, c] <= COVER_MAX_YD:
            rec[r][0]["cover"], rec[r][0]["sepSnap"] = de[c][0]["id"], round(float(cost[r, c]), 1)


def route_name(path):
    """path = [(depth yards past the line, yards outward toward the sideline), ...] from the snap on, starting at 0 out."""
    if len(path) < 4:
        return ""
    peak = max(p[0] for p in path)
    end_d, out = path[-1]
    gain = end_d - path[0][0]
    if gain < 2.5 and peak - path[0][0] < 3:
        return "flat" if out >= 2 else "under" if out <= -2 else "stay"
    if peak >= 10:
        return "post" if out <= -4 else "corner" if out >= 4 else "go"
    if peak - end_d >= 1.5:
        return "curl"
    if peak >= 5:
        return "out" if out >= 5 else "dig" if out <= -5 else "hitch"
    return "out" if out >= 3 else "slant" if out <= -3 else "hitch"


def routes(tracks, k, sgn, los):
    """Names each receiver's route from his field trail. The route is only a label, not a measurement."""
    ol = [_at(t, k) for t in tracks if t.get("role") == "OL" and "f" in t]
    ol = [f for f in ol if f]
    if not ol:
        return
    cy = float(np.median([f[1] for f in ol]))
    for t in tracks:
        if t.get("role") not in RECEIVERS[:3] or "f" not in t:
            continue
        pts = [f for q, f in zip(t["p"], t["f"]) if q[0] >= k]
        if len(pts) < 4:
            continue
        way = 1.0 if pts[0][1] >= cy else -1.0
        t["route"] = route_name([(sgn * f[0] - los, way * (f[1] - pts[0][1])) for f in pts])
