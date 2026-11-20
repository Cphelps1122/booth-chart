"""Ball pass test (branch ball-test only). Compares ball detection on quiz film:
   A) current tracker: whole frame, one Roboflow call
   B) supervision tiling: frame upscaled 2x, cut into overlapping tiles, one call per tile
Writes results/summary.md and a few marked-up frames. Does not touch the app or Firebase data."""
import json, os, sys, time
import cv2, numpy as np, requests
import supervision as sv
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "track"))
from track import roboflow_detect, MODEL  # noqa: E402

SHARE = "https://cardinal-booth-default-rtdb.firebaseio.com/share/022lmq5563h48f2f3mnkart9.json"
CLIPS = [int(c) for c in os.environ.get("BALL_CLIPS", "1,4,7,10").split(",")]
FRAMES = int(os.environ.get("BALL_FRAMES", "16"))
BALL = {"football", "ball"}
OUT = "results"; os.makedirs(OUT, exist_ok=True)

def balls(preds, dx=0, dy=0, scale=1.0):
    out = []
    for p in preds:
        if str(p.get("class", "")).lower() in BALL:
            x, y, w, h = p["x"] + dx, p["y"] + dy, p["width"], p["height"]
            out.append([(x - w/2)/scale, (y - h/2)/scale, (x + w/2)/scale, (y + h/2)/scale, p.get("confidence", 0)])
    return out

def main():
    key = os.environ["ROBOFLOW_API_KEY"].strip()
    det = roboflow_detect(key, confidence=int(os.environ.get("BALL_CONF", "20")))
    share = json.loads(requests.get(SHARE, timeout=30).json()["items"])
    rows, total = [], {"a": 0, "b": 0, "n": 0, "calls_a": 0, "calls_b": 0}
    for ci in CLIPS:
        c = share["clips"][ci - 1]
        path = "clip%d.mp4" % ci
        open(path, "wb").write(requests.get(c["url"], timeout=120).content)
        cap = cv2.VideoCapture(path); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        idx = np.linspace(0, n - 1, FRAMES).astype(int)
        hit_a = hit_b = 0; saved = 0
        for k, fi in enumerate(idx):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(fi)); ok, img = cap.read()
            if not ok: continue
            a = balls(det(img)); total["calls_a"] += 1
            big = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            calls = [0]
            def cb(tile):
                calls[0] += 1
                p = balls(det(tile))
                if not p: return sv.Detections.empty()
                arr = np.array(p)
                return sv.Detections(xyxy=arr[:, :4], confidence=arr[:, 4], class_id=np.zeros(len(arr), int))
            sl = sv.InferenceSlicer(callback=cb, slice_wh=(640, 360), overlap_ratio_wh=None, overlap_wh=(128, 72),
                                    overlap_filter=sv.OverlapFilter.NON_MAX_SUPPRESSION, iou_threshold=0.3)
            d = sl(big); total["calls_b"] += calls[0]
            b = [[*(xy / 2), cf] for xy, cf in zip(d.xyxy, d.confidence)] if len(d) else []
            hit_a += bool(a); hit_b += bool(b); total["n"] += 1
            if (a or b) and saved < 3 or (k == FRAMES // 2 and saved < 4):
                vis = img.copy()
                for x1, y1, x2, y2, cf in a:
                    cv2.rectangle(vis, (int(x1)-3, int(y1)-3), (int(x2)+3, int(y2)+3), (0, 0, 255), 2)
                for x1, y1, x2, y2, cf in b:
                    cv2.rectangle(vis, (int(x1)-6, int(y1)-6), (int(x2)+6, int(y2)+6), (38, 201, 110), 2)
                    cv2.putText(vis, "%.2f" % cf, (int(x1), int(y1) - 9), 0, 0.4, (38, 201, 110), 1)
                cv2.putText(vis, "%s  f%d  red=whole frame  green=tiled" % (c["clip"], fi), (8, 18), 0, 0.5, (255, 255, 255), 1)
                cv2.imwrite(os.path.join(OUT, "clip%02d_f%03d.jpg" % (ci, fi)), cv2.resize(vis, None, fx=2, fy=2)); saved += 1
        total["a"] += hit_a; total["b"] += hit_b
        rows.append("| %s | %s | %d/%d | %d/%d |" % (c["clip"], c.get("sit", ""), hit_a, len(idx), hit_b, len(idx)))
    md = ["# Ball pass test", "", "Model: `%s`, frames per clip: %d" % (MODEL, FRAMES), "",
          "| Clip | Situation | Ball found: whole frame | Ball found: tiled |", "|---|---|---|---|", *rows, "",
          "Total: whole frame %d/%d, tiled %d/%d" % (total["a"], total["n"], total["b"], total["n"]),
          "Roboflow calls: whole frame %d, tiled %d" % (total["calls_a"], total["calls_b"])]
    open(os.path.join(OUT, "summary.md"), "w").write("\n".join(md) + "\n")
    print("\n".join(md))

if __name__ == "__main__":
    main()
