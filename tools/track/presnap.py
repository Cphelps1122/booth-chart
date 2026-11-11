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
CONF, QB_CONF, OL_CONF = 0.40, 0.15, 0.25     # linemen overlap, so the model is less sure of them
CB_DEPTH, BOX_DEPTH, DEEP_DEPTH = 1.0, 5.5, 10.0     # yards
RECEIVERS = ("WR", "Slot", "TE", "RB")
COVER_MAX_YD = 15.0


def _mean(v):
    return sum(v) / len(v)


def keep(preds):
    floor = {"qb": QB_CONF, "oline": OL_CONF}
    return [p for p in preds or [] if p.get("confidence", 0) >= floor.get(p.get("class"), CONF)]


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


def _jersey(img, p):
    h, w = img.shape[:2]
    x0, x1 = int(max(0, p["x"] - p["width"] * 0.25)), int(min(w, p["x"] + p["width"] * 0.25))
    y0, y1 = int(max(0, p["y"] - p["height"] * 0.35)), int(min(h, p["y"] - p["height"] * 0.02))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return None
    return np.median(cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2LAB).reshape(-1, 3), axis=0)


def fix_by_jersey(preds, img):
    """The O-line's jersey color is the offense's. Anyone in the other color is defense, whatever the model called him."""
    people = [p for p in preds if p["class"] in ("skill", "defense", "qb")]
    ol = [c for c in (_jersey(img, p) for p in preds if p["class"] == "oline") if c is not None]
    cols = [(p, _jersey(img, p)) for p in people]
    cols = [(p, c) for p, c in cols if c is not None]
    if len(ol) < 2 or len(cols) < 6:
        return 0
    data = np.float32([c for _, c in cols])
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, lab, cen = cv2.kmeans(data, 2, None, crit, 5, cv2.KMEANS_PP_CENTERS)
    if np.linalg.norm(cen[0] - cen[1]) < 18:        # the two teams look alike on this film: leave the labels alone
        return 0
    off = int(np.argmin(np.linalg.norm(cen - np.median(ol, axis=0), axis=1)))
    fixed = 0
    for (p, _), g in zip(cols, lab.flatten()):
        want = "skill" if g == off else "defense"
        if p["class"] == "qb" and want == "defense":
            p["class"] = "defense"
            fixed += 1
        elif p["class"] in ("skill", "defense") and p["class"] != want:
            p["class"] = want
            fixed += 1
    return fixed


def fix_classes(preds, to_field=None, img=None):
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
    if to_field is not None and preds:          # coaches and people on the sideline aren't in the formation
        feet = np.float32([[p["x"], p["y"] + p["height"] / 2] for p in preds])
        preds = [p for p, f in zip(preds, to_field(feet)) if -21.5 <= f[1] <= 34.8]
    by_color = fix_by_jersey(preds, img) if img is not None else 0
    g = geometry(preds, to_field)
    if g is None:
        return preds, by_color
    d = lambda p: depth_of(p, g)
    fixed = by_color
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


def read(preds, to_field=None, img=None):
    """Formation info plus a role on every player. None if the frame can't be read."""
    preds, fixed = fix_classes(keep(preds), to_field, img)
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
    best = min(zip(t["p"], t["f"]), key=lambda x: abs(x[0][0] - k))
    return best[1] if abs(best[0][0] - k) <= 3 else None


def align_roles(tracks, at, sgn, los):
    """Positions from where each player lines up, for a model that only says "player". Sets role on every trail it can place."""
    off = []
    for t in tracks:
        f = at(t)
        if not f:
            continue
        if t.get("side") == "d":
            t["role"] = "DEF"
        elif t.get("side") == "o":
            off.append((t, sgn * f[0] - los, f[1]))
    front = sorted([x for x in off if x[1] >= -3.5], key=lambda x: x[2])      # tackles in a pass stance sit a couple of yards back
    line = None
    for n in (5, 4, 3):                             # the tightest five across are the line; settle for fewer if one is hidden
        if len(front) < n:
            continue
        i = min(range(len(front) - n + 1), key=lambda j: front[j + n - 1][2] - front[j][2])
        if front[i + n - 1][2] - front[i][2] <= 2.2 * (n - 1) + 1.0:
            line = front[i:i + n]
            break
    if not line:
        return
    for t, _, _ in line:
        t["role"] = "OL"
    ids = {id(t) for t, _, _ in line}
    cy, lo, hi = statistics.median([y for _, _, y in line]), line[0][2], line[-1][2]
    back = sorted([x for x in off if id(x[0]) not in ids and x[1] < -1.0 and lo - 3.0 <= x[2] <= hi + 3.0],
                  key=lambda x: (abs(x[2] - cy) > 1.5, abs(x[2] - cy)))
    for j, (t, _, _) in enumerate(back):
        t["role"] = "QB" if j == 0 else "RB"          # the one behind the center takes the snap
    for t, d, y in off:
        if id(t) in ids or t.get("role") in ("QB", "RB"):
            continue
        t["role"] = "TE" if lo - 2.5 <= y <= hi + 2.5 else "WR"


LIMITS = (("OL",), 5), (("QB",), 1), (("WR", "Slot", "TE", "RB"), 5), (("DEF",), 11)


def tidy(tracks, k):
    """Removes doubles of the same player and anyone past what a team can have on the field."""
    gone = set()
    for i, a in enumerate(tracks):
        for j in range(i + 1, len(tracks)):
            b = tracks[j]
            if a.get("side") != b.get("side") or i in gone or j in gone:
                continue
            fa = {q[0]: f for q, f in zip(a["p"], a["f"])}
            d = [math.hypot(fa[q[0]][0] - f[0], fa[q[0]][1] - f[1]) for q, f in zip(b["p"], b["f"]) if q[0] in fa]
            if len(d) >= 4 and statistics.median(d) < 1.0:
                gone.add(i if (bool(a.get("role")), len(a["p"])) < (bool(b.get("role")), len(b["p"])) else j)
    tracks = [t for i, t in enumerate(tracks) if i not in gone]
    out = []
    for roles, most in LIMITS:
        grp = [t for t in tracks if t.get("role") in roles]
        grp.sort(key=lambda t: (_at(t, k) is None, -len(t["p"])))       # on screen at the snap first, then the longest trails
        out += grp[:most]
    return out + [t for t in tracks if not t.get("role")]


def formation(tracks, k, sgn, los):
    """Snap read from the tracked positions, in field yards. Also names the outside receiver WR and inside ones Slot."""
    at = lambda roles: [(t, _at(t, k)) for t in tracks if t.get("role") in roles and _at(t, k)]
    ol = at(("OL",)) or at(("QB",))
    if not ol:
        return {}
    ys = [f[1] for _, f in ol]
    cy, lo, hi = statistics.median(ys), min(ys) - 2.5, max(ys) + 2.5
    sides = {-1: [], 1: []}
    for t, f in at(("WR", "Slot")):
        sides[-1 if f[1] < cy else 1].append((abs(f[1] - cy), t))
    for grp in sides.values():
        for n, (_, t) in enumerate(sorted(grp, key=lambda x: -x[0])):
            t["role"] = "WR" if n == 0 else "Slot"
    te = at(("TE",))
    a = len(sides[-1]) + sum(1 for _, f in te if f[1] < cy)
    b = len(sides[1]) + sum(1 for _, f in te if f[1] >= cy)
    de = [(sgn * f[0] - los, f[1]) for _, f in at(("DEF",))]
    box = sum(1 for d, y in de if lo <= y <= hi and -0.5 <= d <= BOX_DEPTH)
    deep = sum(1 for d, y in de if d > DEEP_DEPTH)
    return {"view": "tracked positions", "splits": "%dx%d" % (max(a, b), min(a, b)), "personnel": "%d%d" % (len(at(("RB",))), len(te)),
            "box": box, "deep": deep, "shell": "0-high" if deep == 0 else "1-high" if deep == 1 else "2-high"}


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
    ol = [_at(t, k) for t in tracks if t.get("role") in ("OL", "QB") and "f" in t]   # the middle of the formation
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
