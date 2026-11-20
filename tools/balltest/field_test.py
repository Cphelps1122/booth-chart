"""Read LOS yard line, hash and gain from wide film; score against the quiz's listed spots.
Field fit (tracker's field.py) + yard-number model (footballcompvis/football-field-numbers-lvwhb/1)
+ player model for the LOS. Writes results/field_summary.md and a debug frame per clip."""
import json, os, re, sys, cv2, numpy as np, requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "track"))
import field  # noqa
from track import roboflow_detect, MODEL  # noqa
key = os.environ["ROBOFLOW_API_KEY"].strip(); os.makedirs("results", exist_ok=True)
NUM = os.environ.get("NUM_MODEL", "football-field-numbers-lvwhb/1")
numdet = roboflow_detect(key, model=NUM, confidence=20); pdet = roboflow_detect(key, confidence=40)
share = json.loads(requests.get("https://cardinal-booth-default-rtdb.firebaseio.com/share/022lmq5563h48f2f3mnkart9.json", timeout=30).json()["items"])

def lines_and_rows(img):
    wm, _ = field.white_mask(img); L = field.yard_lines(wm); R = field.hash_rows(wm, L)
    if len(L) < 2 or len(R) < 2: return None
    L = field.real_lines(L, R, wm); xs = []
    for l, _ in L:
        p = field._cross(l, R[0]["L"])
        if p is not None: xs.append((p[0], l))
    xs.sort(key=lambda z: z[0]); g = np.diff([x for x, _ in xs])
    if not len(g): return None
    u = float(np.median(g)); idx, k = [0], 0
    for d in g: k += max(1, int(round(d / u))); idx.append(k)
    return [(l, i) for (_, l), i in zip(xs, idx)], u

def read(img):
    r, why = field.fit(img)
    if not r: return None, why
    lr = lines_and_rows(img)
    if not lr: return None, "lines"
    lines, unit = lr; F = r["F"]
    big = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    votes = {}; arrows = []; nums = []
    for p in numdet(big):
        c = str(p["class"]); x, y = p["x"] / 2, p["y"] / 2
        d = [(field._dist_to_line((x, y), l), i) for l, i in lines]; dist, i = min(d)
        if dist > unit * 0.55: continue
        if c.startswith("PTR"): arrows.append((i, c[-1], p["confidence"])); continue
        m = re.match(r"(\d)", c)
        if m and m.group(1) != "0":
            votes.setdefault(i, {}); votes[i][int(m.group(1))] = votes[i].get(int(m.group(1)), 0) + p["confidence"]; nums.append((x, y, c))
    # G (yards from the left-hand goal) = s * X + c, X = 5 * line index
    best = None
    for s in (1, -1):
        cand = {}
        for i, v in votes.items():
            for dgt, w in v.items():
                for G in {10 * dgt, 100 - 10 * dgt}:
                    cc = G - s * 5 * i; cand[cc] = cand.get(cc, 0) + w
        for i, side, w in arrows:                      # arrow points toward the nearer goal
            for cc in list(cand):
                G = s * 5 * i + cc
                if 0 < G < 50 and ((side == "L") == (s == 1)): cand[cc] += 0.5 * w
                if 50 < G < 100 and ((side == "R") == (s == 1)): cand[cc] += 0.5 * w
        for cc, w in cand.items():
            if best is None or w > best[0]: best = (w, s, cc)
    if not best: return None, "no numbers read"
    _, s, c0 = best
    # players -> LOS and ball Y
    pl = []
    for p in pdet(img):
        if str(p["class"]).lower() in ("ref", "football", "ball"): continue
        f = cv2.perspectiveTransform(np.float32([[[p["x"], p["y"] + p["height"] / 2]]]), F)[0, 0]
        if -4 < f[1] < 18: pl.append(f)
    if len(pl) < 8: return None, "too few players"
    pl = np.array(pl); xs = np.linspace(pl[:, 0].min(), pl[:, 0].max(), 400)
    dens = [np.exp(-((pl[:, 0] - x) ** 2) / 2).sum() for x in xs]; Xlos = float(xs[int(np.argmax(dens))])
    near = pl[np.abs(pl[:, 0] - Xlos) < 1.5]; Yb = float(np.median(near[:, 1]))
    G = s * Xlos + c0
    return {"G": G, "yard": round(G if G <= 50 else 100 - G), "s": s, "Yb": Yb, "hashraw": "far" if Yb < 3.5 else "near" if Yb > 9.8 else "middle",
            "nums": nums, "F": F, "Xlos": Xlos}, None

rows, prev = [], None
for ci, c in enumerate(share["clips"], 1):
    if not c["clip"].startswith("Wide"): continue
    m = re.search(r"on (-?\d+)", c.get("sit", "")); truth = int(m.group(1)) if m else None
    open("w.mp4", "wb").write(requests.get(c["url"], timeout=120).content); cap = cv2.VideoCapture("w.mp4")
    out, why = None, ""
    for k in (5, 15, 25, 35):
        cap.set(1, k); ok, im = cap.read()
        if not ok: continue
        out, why = read(im)
        if out: break
    if out:
        v = im.copy(); cv2.putText(v, "read %d (%s)  truth %s" % (out["yard"], out["hashraw"], truth), (5, 20), 0, 0.6, (0, 255, 255), 2)
        Fi = np.linalg.inv(out["F"])
        a = cv2.perspectiveTransform(np.float32([[[out["Xlos"], -2]], [[out["Xlos"], 15]]]), Fi).reshape(-1, 2).astype(int)
        cv2.line(v, tuple(a[0]), tuple(a[1]), (0, 0, 255), 2); cv2.imwrite("results/field_%02d.jpg" % ci, v)
    rows.append((ci, c.get("sit", ""), truth, out, why))
md = ["| Clip | Quiz says | Read yard line | Right? | Hash (raw) | Read gain | Quiz gain |", "|---|---|---|---|---|---|---|"]
for n, (ci, sit, truth, out, why) in enumerate(rows):
    nxt = rows[n + 1] if n + 1 < len(rows) else None
    qg = rg = ""
    if nxt and truth is not None and nxt[2] is not None:
        def pos(t): return t if t < 0 else 100 - t if t > 0 else 50   # own side negative -> yards from own goal
        q = (100 + truth if truth < 0 else 100 - truth); q2 = (100 + nxt[2] if nxt[2] < 0 else 100 - nxt[2])
        qg = str(-(q2 - q)) if abs(q2 - q) < 40 else ""
        if out and nxt[3]: rg = "%.0f" % abs(nxt[3]["G"] - out["G"])
    md.append("| %d | %s | %s | %s | %s | %s | %s |" % (ci, sit, out["yard"] if out else "— (%s)" % why,
              ("yes" if out and truth is not None and abs(out["yard"] - abs(truth)) <= 1 else "no") if out else "", out["hashraw"] if out else "", rg, qg))
open("results/field_summary.md", "w").write("\n".join(md) + "\n"); print("\n".join(md))
open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a").write("\n".join(md) + "\n")
