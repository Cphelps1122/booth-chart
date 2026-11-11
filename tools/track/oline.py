"""
Offensive line numbers for a tracked play, from where players' feet are in field yards.

Everything is an estimate (about a yard, about 6 looks a second) and a value the
tracker can't stand behind is None, which the card shows as a dash.
"""
import math
import statistics

PRESSURE_YD, RUSH_WINDOW, POCKET_AT, PUSH_AT, CLIMB_YD, CLIMB_BY = 2.0, 1.25, 2.5, 1.0, 3.0, 2.0
NAMES = ["LT", "LG", "C", "RG", "RT"]


def measure(tracks, k0, times, sgn, los, pre, snap_found):
    t0 = times[k0]

    def pos(t, at):
        """(yards past the line, yards toward the offense's right) at a time, or None if he isn't seen within 0.3 s."""
        i = min(range(len(t["p"])), key=lambda j: abs(times[t["p"][j][0]] - at))
        if abs(times[t["p"][i][0]] - at) > 0.3:
            return None
        f = t["f"][i]
        return sgn * f[0] - los, sgn * f[1]

    ol = [(t, pos(t, t0)) for t in tracks if t.get("role") == "OL" and "f" in t]
    ol = sorted([(t, p) for t, p in ol if p and -2.5 <= p[0] <= 1.5], key=lambda x: x[1][1])     # a "lineman" deep in the backfield isn't one
    if len(ol) < 4 or not 3.0 <= ol[-1][1][1] - ol[0][1][1] <= 12.0:        # a real line is 4-5 men across roughly 5-9 yards
        return None
    out = {"n": len(ol)}
    names = NAMES if len(ol) == 5 else ["OL%d" % (i + 1) for i in range(len(ol))]
    de = [t for t in tracks if t.get("role") == "DEF" and "f" in t]
    de = [t for t in de for p in [pos(t, t0)] if p and p[0] >= -1.0]     # a "defender" who starts in the backfield is a mislabel
    qb = next((t for t in tracks if t.get("role") == "QB" and "f" in t), None)
    lo, hi = ol[0][1][1], ol[-1][1][1]

    def push(at):
        res = []
        for t, p in ol:
            q = pos(t, t0 + at)
            res.append(None if q is None else q[0] - p[0])
        return res
    p1 = push(PUSH_AT)
    seen = [v for v in p1 if v is not None]
    out["play"] = None if len(seen) < 3 or not snap_found else "run" if statistics.median(seen) >= 0.75 else "pass"
    third = max(1, len(ol) // 3)
    avg = lambda v: round(sum(v) / len(v), 1) if v else None
    out["push"] = {"left": avg([v for v in p1[:third + (len(ol) == 5)] if v is not None]),
                   "middle": avg([v for v in (p1[2:3] if len(ol) == 5 else p1[third:-third]) if v is not None]),
                   "right": avg([v for v in p1[-(third + (len(ol) == 5)):] if v is not None])}
    out["line"] = [{"pos": n, "push": None if v is None else round(v, 1)} for n, v in zip(names, p1)]
    if not snap_found:
        out["push"], out["line"] = {"left": None, "middle": None, "right": None}, [{"pos": n, "push": None} for n in names]

    steps = [k for k in range(k0, len(times)) if times[k] - t0 <= 4.5]
    climbed = set()
    for k in steps:
        if times[k] - t0 > CLIMB_BY:
            break
        for i, (t, _) in enumerate(ol):
            q = pos(t, times[k])
            if q and q[0] >= CLIMB_YD:
                climbed.add(i)
    out["secondLevel"] = len(climbed) if snap_found else None

    rush = set()                                    # at or behind the line, near the box, a beat after the snap: he's coming
    for t in de:
        q = pos(t, t0 + RUSH_WINDOW) or pos(t, t0 + RUSH_WINDOW - 0.35)
        if q and q[0] <= 1.0 and lo - 3 <= q[1] <= hi + 3:
            rush.add(t["id"])
    out["rushers"] = len(rush) if snap_found else None

    back = [q[0] - p[0] for t, p in ol for q in [pos(t, t0 + POCKET_AT)] if q]
    out["pocketBack"] = round(-statistics.median(back), 1) if len(back) >= 3 and snap_found and out["play"] == "pass" else None

    out["pressure"], out["gap"] = None, None

    def real(t, at):
        """A rusher can't average more than about 15 mph from a standstill: faster means the trail hopped players."""
        a, b = pos(t, t0), pos(t, at)
        seen = [times[q[0]] for q in t["p"] if at - 0.6 <= times[q[0]] <= at]
        if len(seen) < 3:                           # he has to be followed all the way in, not appear next to the QB
            return False
        return bool(a and b) and math.hypot(b[0] - a[0], b[1] - a[1]) <= 7.5 * max(0.1, at - t0)
    if qb is not None and snap_found and out["play"] == "pass":      # on a run look, a defender near the QB isn't pass pressure
        watched = 0.0
        for k in steps:
            qp = pos(qb, times[k])
            if not qp:
                continue
            if qp[0] > -2.0:                        # he's left the pocket for the line: a run or a scramble, not pressure
                break
            watched = times[k] - t0
            near = [(math.hypot(q[0] - qp[0], q[1] - qp[1]), t) for t in de for q in [pos(t, times[k])] if q]
            near = [x for x in near if x[0] <= PRESSURE_YD and real(x[1], times[k])]
            if near and watched >= 0.5:
                out["pressure"] = round(watched, 1)
                out["gap"] = gap_of(min(near, key=lambda x: x[0])[1], ol, names, pos, times, steps)
                break
        out["watched"] = round(watched, 1)
    out["box"] = pre.get("box")
    out["blockers"] = len(ol) + sum(1 for t in tracks if t.get("role") == "TE")
    return out


def gap_of(rusher, ol, names, pos, times, steps):
    """Where he came through the line: between which two linemen, or outside the end."""
    for k in steps:
        q = pos(rusher, times[k])
        if not q or q[0] > 0.5:
            continue
        lat = sorted([(p[1], n) for (t, _), n in zip(ol, names) for p in [pos(t, times[k])] if p])
        if len(lat) < 3:
            return None
        if q[1] < lat[0][0]:
            return "left edge"
        if q[1] > lat[-1][0]:
            return "right edge"
        for (a, na), (b, nb) in zip(lat, lat[1:]):
            if a <= q[1] <= b:
                return "%s–%s gap" % (na, nb)
    return None
