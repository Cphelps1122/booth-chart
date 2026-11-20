"""Draw each player model's boxes on the same tight + wide frames, one sheet per model, plus box counts."""
import json, os, sys, cv2, numpy as np, requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "track"))
from track import roboflow_detect  # noqa
here = os.path.dirname(__file__); key = os.environ["ROBOFLOW_API_KEY"].strip(); os.makedirs("results", exist_ok=True)
share = json.loads(requests.get("https://cardinal-booth-default-rtdb.firebaseio.com/share/022lmq5563h48f2f3mnkart9.json", timeout=30).json()["items"])
imgs = [cv2.imread(os.path.join(here, "frames", f)) for f in ("tight093_f109.jpg", "tight362_f022.jpg")]
for ci in (1, 7):
    open("w.mp4", "wb").write(requests.get(share["clips"][ci - 1]["url"], timeout=120).content)
    cap = cv2.VideoCapture("w.mp4"); cap.set(1, 20); ok, im = cap.read(); imgs.append(im)
COL = {}
rows = ["| Model | Tight A | Tight B | Wide A | Wide B | Classes |", "|---|---|---|---|---|---|"]
for m in os.environ["BENCH_MODELS"].split(","):
    det = roboflow_detect(key, model=m, confidence=40); panels = []; counts = []; cls = set()
    for im in imgs:
        try: preds = det(im)
        except Exception as e: preds = None; err = str(e)[:50]
        v = im.copy()
        if preds is None: cv2.putText(v, "ERROR " + err, (10, 40), 0, 0.8, (0, 0, 255), 2); counts.append("err")
        else:
            n = 0
            for p in preds:
                c = str(p["class"]); cls.add(c); col = COL.setdefault(c.lower(), tuple(int(x) for x in np.random.RandomState(len(COL) + 3).randint(60, 255, 3)))
                if "ball" in c.lower() or "football" == c.lower(): continue
                n += 1; x, y, w, h = p["x"], p["y"], p["width"], p["height"]
                cv2.rectangle(v, (int(x - w / 2), int(y - h / 2)), (int(x + w / 2), int(y + h / 2)), col, max(1, v.shape[1] // 640))
            counts.append(str(n))
        panels.append(cv2.resize(v, (960, 540)))
    sheet = np.vstack([np.hstack(panels[:2]), np.hstack(panels[2:])])
    cv2.putText(sheet, m, (10, 1070), 0, 1.0, (0, 255, 255), 2)
    cv2.imwrite("results/players_%s.jpg" % m.replace("/", "_"), sheet)
    rows.append("| %s | %s | %s |" % (m, " | ".join(counts), ", ".join(sorted(cls))))
print("\n".join(rows)); open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a").write("\n".join(rows) + "\n")
