"""Draw yard-number model detections (with class names) on wide Desoto frames; one sheet per model."""
import json, os, sys, cv2, numpy as np, requests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "track"))
from track import roboflow_detect  # noqa
key = os.environ["ROBOFLOW_API_KEY"].strip(); os.makedirs("results", exist_ok=True)
share = json.loads(requests.get("https://cardinal-booth-default-rtdb.firebaseio.com/share/022lmq5563h48f2f3mnkart9.json", timeout=30).json()["items"])
imgs = []
for ci in (1, 4, 7, 13):
    open("w.mp4", "wb").write(requests.get(share["clips"][ci - 1]["url"], timeout=120).content)
    cap = cv2.VideoCapture("w.mp4"); cap.set(1, 5); ok, im = cap.read()
    imgs.append(cv2.resize(im, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC))   # 1280x720
rows = []
for m in os.environ["BENCH_MODELS"].split(","):
    det = roboflow_detect(key, model=m, confidence=25); panels = []; found = []
    for im in imgs:
        v = im.copy()
        try:
            for p in det(im):
                x, y, w, h = p["x"], p["y"], p["width"], p["height"]; c = str(p["class"])
                if c.lower() in ("field",): continue
                cv2.rectangle(v, (int(x - w / 2), int(y - h / 2)), (int(x + w / 2), int(y + h / 2)), (0, 0, 255), 2)
                cv2.putText(v, "%s %.2f" % (c, p.get("confidence", 0)), (int(x - w / 2), int(y - h / 2) - 4), 0, 0.6, (0, 255, 255), 2)
                found.append(c)
        except Exception as e:
            cv2.putText(v, "ERROR " + str(e)[:40], (10, 40), 0, 1, (0, 0, 255), 2); found.append("ERR")
        panels.append(cv2.resize(v, (960, 540)))
    sheet = np.vstack([np.hstack(panels[:2]), np.hstack(panels[2:])]); cv2.putText(sheet, m, (10, 1070), 0, 1, (0, 255, 255), 2)
    cv2.imwrite("results/num_%s.jpg" % m.replace("/", "_"), sheet); rows.append("%s: %s" % (m, sorted(set(found))))
print("\n".join(rows))
