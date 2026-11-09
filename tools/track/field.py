"""
Field ruler: turns pixels into yards from the white paint on the field.

Finds the yard lines (every 5 yards) and the two rows of hash marks in one
frame, then fits a mapping from that frame's pixels to field yards:
  X = yards along the field (yard lines are X = 0, 5, 10, ... from the
      first line found; only distances matter, not which yard line it is)
  Y = yards across the field (far hash row = 0, near hash row = HASH_YARDS)
Texas (UIL) plays NCAA rules, so hash rows are 40 ft (13.33 yd) apart by
default. Set HASH_YARDS=17.78 for fields marked with NFHS hashes.
"""
import math
import os

import cv2
import numpy as np

HASH_YARDS = float(os.environ.get("HASH_YARDS", str(40 / 3)))


def white_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    grass = ((h >= 30) & (h <= 95) & (s >= 50) & (v >= 40)).astype(np.uint8) * 255
    field = cv2.morphologyEx(grass, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    field = cv2.dilate(field, np.ones((9, 9), np.uint8))
    white = ((v >= 165) & (s <= 70)).astype(np.uint8) * 255
    return cv2.bitwise_and(white, field), field


def _line_x_at(l, y):
    (x1, y1, x2, y2) = l
    if y2 == y1:
        return None
    return x1 + (x2 - x1) * (y - y1) / (y2 - y1)


def yard_lines(wm, players=()):
    """Long, steep white lines, merged into one entry per painted yard line: [(vx, vy, x0, y0), ...]."""
    H, W = wm.shape
    m = wm.copy()
    for d in players:   # jerseys and pants are white too
        cv2.rectangle(m, (int(d["x"] - d["w"] * .6), int(d["y"] - d["h"] * .6)), (int(d["x"] + d["w"] * .6), int(d["y"] + d["h"] * .6)), 0, -1)
    segs = cv2.HoughLinesP(m, 1, np.pi / 360, threshold=40, minLineLength=int(H * 0.12), maxLineGap=int(H * 0.04))
    if segs is None:
        return []
    ym = H * 0.6
    cand = []
    for x1, y1, x2, y2 in segs.reshape(-1, 4):
        ang = math.degrees(math.atan2(abs(y2 - y1), abs(x2 - x1) + 1e-6))
        if ang < 24:          # sidelines, hash rows and numbers are flat: yard lines are steeper, even on diagonal film
            continue
        xm = _line_x_at((x1, y1, x2, y2), ym)
        if xm is None:
            continue
        cand.append((xm, (x1, y1, x2, y2), math.hypot(x2 - x1, y2 - y1)))
    cand.sort()
    groups = []
    for xm, l, ln in cand:
        if groups and abs(xm - groups[-1]["xm"]) < max(8, W * 0.012):
            g = groups[-1]
            g["pts"] += [(l[0], l[1]), (l[2], l[3])]
            g["len"] += ln
            g["xm"] = (g["xm"] + xm) / 2
        else:
            groups.append({"xm": xm, "pts": [(l[0], l[1]), (l[2], l[3])], "len": ln})
    out = []
    for g in groups:
        ys = [p[1] for p in g["pts"]]
        if g["len"] < H * 0.25 or max(ys) - min(ys) < H * 0.2:
            continue
        vx, vy, x0, y0 = cv2.fitLine(np.float32(g["pts"]), cv2.DIST_L2, 0, 0.01, 0.01).flatten()
        out.append((float(vx), float(vy), float(x0), float(y0)))
    return out


def _dist_to_line(p, L):
    vx, vy, x0, y0 = L
    return abs((p[0] - x0) * vy - (p[1] - y0) * vx)


def hash_rows(wm, lines, players=()):
    """The two rows of short hash ticks between the yard lines, as lines: [(vx, vy, x0, y0), ...] far first."""
    H, W = wm.shape
    m = wm.copy()
    for L in lines:            # take the yard lines and players out, keep the small marks
        vx, vy, x0, y0 = L
        cv2.line(m, (int(x0 - vx * 3000), int(y0 - vy * 3000)), (int(x0 + vx * 3000), int(y0 + vy * 3000)), 0, 7)
    for d in players:
        cv2.rectangle(m, (int(d["x"] - d["w"] * .6), int(d["y"] - d["h"] * .6)), (int(d["x"] + d["w"] * .6), int(d["y"] + d["h"] * .6)), 0, -1)
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
    pts = []
    for i in range(1, n):
        a, w, h = st[i, cv2.CC_STAT_AREA], st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT]
        if 2 <= a <= max(60, W * W / 6000) and w <= W * 0.03 and h <= H * 0.03:
            pts.append(cen[i])
    pts = np.float32(pts)
    rows = []
    rng = np.random.default_rng(7)
    left = pts.copy()
    for _ in range(4):
        if len(left) < 8:
            break
        best, bi = None, None
        for _ in range(600):
            a, b = left[rng.choice(len(left), 2, replace=False)]
            d = b - a
            if np.hypot(*d) < W * 0.05 or abs(d[1]) > abs(d[0]) * 0.45:   # hash rows run across the screen
                continue
            u = d / np.hypot(*d)
            dist = np.abs((left[:, 0] - a[0]) * u[1] - (left[:, 1] - a[1]) * u[0])
            inl = dist < max(2.5, H * 0.005)
            if best is None or inl.sum() > best:
                best, bi = inl.sum(), inl
        if best is None or best < 8:
            break
        P = left[bi]
        vx, vy, x0, y0 = cv2.fitLine(P, cv2.DIST_L2, 0, 0.01, 0.01).flatten()
        span = P[:, 0].max() - P[:, 0].min()
        rows.append({"L": (float(vx), float(vy), float(x0), float(y0)), "n": int(best), "span": float(span), "pts": P})
        left = left[~bi]
    # real hash rows: crossed by most of the yard lines, with ticks between them
    good = []
    for r in rows:
        crossed = sum(1 for L in lines if _cross(L, r["L"]) is not None and 0 <= _cross(L, r["L"])[0] <= W)
        if r["span"] > W * 0.25 and crossed >= 2:
            good.append(r)
    good.sort(key=lambda r: -r["n"])
    good = good[:2]
    good.sort(key=lambda r: r["L"][3] + (W / 2 - r["L"][2]) * r["L"][1] / (r["L"][0] or 1e-6))
    return good


def _cross(A, B):
    ax, ay, ax0, ay0 = A
    bx, by, bx0, by0 = B
    den = ax * by - ay * bx
    if abs(den) < 1e-9:
        return None
    t = ((bx0 - ax0) * by - (by0 - ay0) * bx) / den
    return (ax0 + ax * t, ay0 + ay * t)


def real_lines(lines, rows, wm):
    """Keep lines that follow white paint from one hash row to the other; one per painted line."""
    H, W = wm.shape
    fat = cv2.dilate(wm, np.ones((5, 5), np.uint8))
    keep = []
    for L in lines:
        p0, p1 = _cross(L, rows[0]["L"]), _cross(L, rows[1]["L"])
        if p0 is None or p1 is None:
            continue
        if not (-5 <= p0[0] <= W + 5 and -5 <= p1[0] <= W + 5 and 0 <= p0[1] <= H and 0 <= p1[1] <= H):
            continue
        n, on = 0, 0
        for s in np.linspace(0, 1, 50):
            x, y = int(p0[0] + (p1[0] - p0[0]) * s), int(p0[1] + (p1[1] - p0[1]) * s)
            if 0 <= x < W and 0 <= y < H:
                n += 1
                on += fat[y, x] > 0
        if n >= 20 and on / n >= 0.55:
            keep.append(((float(p1[0] - p0[0]), float(p1[1] - p0[1]), float(p0[0]), float(p0[1])), on / n, p0[0]))
    keep.sort(key=lambda k: k[2])
    out = []
    for k in keep:                         # the same painted line found twice: keep the better one
        if out and abs(k[2] - out[-1][2]) < max(6, W * 0.01):
            if k[1] > out[-1][1]:
                out[-1] = k
            continue
        out.append(k)
    while len(out) >= 3:                   # a gap far smaller than the rest means one line isn't real
        gaps = np.diff([k[2] for k in out])
        unit = float(np.median(gaps))
        i = int(np.argmin(gaps))
        if gaps[i] >= unit * 0.6:
            break
        out.pop(i if out[i][1] < out[i + 1][1] else i + 1)
    return [(k[0], k[1]) for k in out]


def fit(img, players=()):
    """Mapping from this frame's pixels to field yards, or None with a reason."""
    wm, _ = white_mask(img)
    lines = yard_lines(wm, players)
    if len(lines) < 2:
        return None, "fewer than 2 yard lines found"
    rows = hash_rows(wm, lines, players)
    if len(rows) < 2:
        return None, "hash marks not found"
    H, W = wm.shape
    lines = real_lines(lines, rows, wm)
    if len(lines) < 2:
        return None, "fewer than 2 yard lines cross the hash marks"
    # order yard lines left to right along the far hash row, number them by the gaps between them
    xs = []
    for L, _ in lines:
        p = _cross(L, rows[0]["L"])
        if p is not None:
            xs.append((p[0], L))
    xs.sort(key=lambda z: z[0])
    gaps = np.diff([x for x, _ in xs])
    if len(gaps) and gaps.min() < 5:
        return None, "yard lines too close together"
    unit = float(np.median(gaps)) if len(gaps) else None
    idx, k = [0], 0
    for g in gaps:
        k += max(1, int(round(g / unit)))
        idx.append(k)
    src, dst = [], []
    for (x, L), i in zip(xs, idx):
        for r, yy in ((rows[0], 0.0), (rows[1], HASH_YARDS)):
            p = _cross(L, r["L"])
            if p is not None and -W * 0.5 <= p[0] <= W * 1.5 and -H * 0.5 <= p[1] <= H * 1.5:
                src.append(p)
                dst.append((5.0 * i, yy))
    if len(src) < 4:
        return None, "not enough line crossings"
    F, inl = cv2.findHomography(np.float32(src), np.float32(dst), cv2.RANSAC, 0.75)
    if F is None or int(inl.sum()) < 4:
        return None, "field fit failed"
    err = np.abs(cv2.perspectiveTransform(np.float32(src).reshape(-1, 1, 2), F).reshape(-1, 2) - np.float32(dst))
    rms = float(np.sqrt((err[inl.ravel() == 1] ** 2).mean()))
    if rms > 0.8:
        return None, "field fit too loose"
    # check the ticks: hash marks are 1 yard apart along the row
    tick = []
    for r in rows:
        f = cv2.perspectiveTransform(r["pts"].reshape(-1, 1, 2), F).reshape(-1, 2)[:, 0]
        f.sort()
        d = np.diff(f)
        d = d[(d > 0.7) & (d < 1.3)]
        if len(d):
            tick.append(float(np.median(d)))
    return {"F": F, "lines": len(lines), "rows": [r["n"] for r in rows], "rms": round(rms, 2),
            "tick": round(float(np.median(tick)), 2) if tick else None, "xs": [float(x) for x, _ in xs], "idx": idx}, None
