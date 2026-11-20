"""Add the hand-placed ball boxes (class football) to frames already in full-field-read.
Re-sends each frame so Roboflow returns its image id, then attaches a VOC box. Never prints the key."""
import json, os, requests
key = os.environ["ROBOFLOW_API_KEY"].strip(); proj = "full-field-read"; here = os.path.dirname(__file__)
L = json.load(open(os.path.join(here, "labels.json")))
VOC = ('<annotation><filename>{f}</filename><size><width>1920</width><height>1080</height><depth>3</depth></size>'
       '<object><name>football</name><bndbox><xmin>{a}</xmin><ymin>{b}</ymin><xmax>{c}</xmax><ymax>{d}</ymax></bndbox></object></annotation>')
ok = 0
for f, (a, b, c, d) in L.items():
    with open(os.path.join(here, "frames", f), "rb") as fh:
        r = requests.post("https://api.roboflow.com/dataset/%s/upload" % proj, params={"api_key": key, "name": f,
                          "batch": "ball-tight-nov20", "split": "train"}, files={"file": (f, fh, "image/jpeg")}, timeout=120)
    j = r.json(); iid = j.get("id")
    if not iid: print("No image id for", f, r.status_code, {k: v for k, v in j.items() if k != "api_key"}); continue
    r2 = requests.post("https://api.roboflow.com/dataset/%s/annotate/%s" % (proj, iid),
                       params={"api_key": key, "name": f.replace(".jpg", ".xml")},
                       data=VOC.format(f=f, a=a, b=b, c=c, d=d), headers={"Content-Type": "text/plain"}, timeout=60)
    good = r2.status_code == 200 and r2.json().get("success")
    ok += bool(good); print(f, "duplicate" if j.get("duplicate") else "new", "labeled" if good else "FAILED %d %s" % (r2.status_code, r2.text[:200]))
print("Labeled %d of %d" % (ok, len(L)))
