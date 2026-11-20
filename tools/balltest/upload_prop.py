"""Upload tracked ball frames with full labels: our checked ball box + the current model's
player/ref boxes (conf >= 0.5, its own ball guesses dropped) so player training isn't hurt."""
import json, os, sys, requests, cv2
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "track"))
from track import roboflow_detect, MODEL  # noqa
here = os.path.dirname(__file__); key = os.environ["ROBOFLOW_API_KEY"].strip(); proj = "full-field-read"
det = roboflow_detect(key, confidence=50)
FILES = {"prop_good.json": "prop", "truth.json": None}
def find(f, d):
    for sub in ([d] if d else []) + ["frames", "frames2", "prop"]:
        p = os.path.join(here, sub, f)
        if os.path.exists(p): return p
def obj(n, a, b, c, d): return ("<object><name>%s</name><bndbox><xmin>%d</xmin><ymin>%d</ymin><xmax>%d</xmax>"
                                "<ymax>%d</ymax></bndbox></object>" % (n, a, b, c, d))
ok = 0; tot = 0; classes = {}
for jf, sub in FILES.items():
    for f, (a, b, c, d) in json.load(open(os.path.join(here, jf))).items():
        tot += 1; p = find(f, sub); img = cv2.imread(p); H, W = img.shape[:2]
        objs = [obj("football", a, b, c, d)]
        for q in det(img):
            cl = str(q.get("class", "")).lower()
            if "ball" in cl or cl == "football": continue
            classes[cl] = classes.get(cl, 0) + 1
            objs.append(obj(q["class"], q["x"] - q["width"] / 2, q["y"] - q["height"] / 2, q["x"] + q["width"] / 2, q["y"] + q["height"] / 2))
        with open(p, "rb") as fh:
            r = requests.post("https://api.roboflow.com/dataset/%s/upload" % proj, params={"api_key": key, "name": f,
                              "batch": "ball-tracked-nov20", "split": "train"}, files={"file": (f, fh, "image/jpeg")}, timeout=120)
        iid = r.json().get("id")
        if not iid: print("no id", f, r.status_code); continue
        xml = ("<annotation><filename>%s</filename><size><width>%d</width><height>%d</height><depth>3</depth></size>%s</annotation>"
               % (f, W, H, "".join(objs)))
        r2 = requests.post("https://api.roboflow.com/dataset/%s/annotate/%s" % (proj, iid), params={"api_key": key,
                           "name": f.replace(".jpg", ".xml"), "overwrite": "true"}, data=xml, headers={"Content-Type": "text/plain"}, timeout=60)
        good = r2.status_code == 200 and r2.json().get("success"); ok += bool(good)
        if not good: print("annotate failed", f, r2.status_code, r2.text[:150])
print("Player classes added:", classes)
print("Uploaded with labels: %d of %d" % (ok, tot))
