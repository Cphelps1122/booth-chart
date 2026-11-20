"""Score ball models against the hand-boxed frames in truth.json. Whole frame and 2x2 tiles."""
import json, os, sys, cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "track"))
from track import roboflow_detect, KeyProblem  # noqa
here = os.path.dirname(__file__); T = json.load(open(os.path.join(here, "truth.json")))
key = os.environ["ROBOFLOW_API_KEY"].strip()
CANDS = os.environ["BENCH_MODELS"].split(",")
def isball(c): c = str(c).lower(); return "ball" in c or "football" in c
def path(f):
    p = os.path.join(here, "frames", f); return p if os.path.exists(p) else os.path.join(here, "frames2", f)
out = ["| Model | Mode | Real balls found | False boxes | Avg conf on real |", "|---|---|---|---|---|"]
for m in CANDS:
    det = roboflow_detect(key, model=m, confidence=15)
    try: det(np.zeros((64, 64, 3), np.uint8))
    except Exception as e: out.append("| %s | - | not usable (%s) | | |" % (m, str(e)[:60])); continue
    for mode in ("whole", "tiles"):
        hit = fp = 0; confs = []
        for f, (a, b, c, d) in T.items():
            img = cv2.imread(path(f)); H, W = img.shape[:2]; preds = []
            parts = [(0, 0, img)] if mode == "whole" else [(x, y, img[y:y + 600, x:x + 1040]) for y in (0, 480) for x in (0, 880)]
            for dx, dy, im in parts:
                for p in det(im):
                    if isball(p.get("class")): preds.append((p["x"] + dx, p["y"] + dy, p.get("confidence", 0)))
            got = [p for p in preds if a - 12 <= p[0] <= c + 12 and b - 12 <= p[1] <= d + 12]
            hit += bool(got); confs += [max(g[2] for g in got)] if got else []
            fp += len(preds) - len(got)
        out.append("| %s | %s | %d/%d | %d | %s |" % (m, mode, hit, len(T), fp, "%.2f" % np.mean(confs) if confs else "-"))
    print(out[-2]); print(out[-1])
open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a").write("\n".join(out) + "\n")
print("\n".join(out))
