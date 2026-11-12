"""
Tries a ball model on the newest Hudl test clips (track-auto test only): whole frames at two sizes, and 2x2 tiles.
Prints counts; predictions and one clip's frames go out encrypted with debug_key.pem.
"""
import base64, io, json, os, sys, zipfile
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2  # noqa: E402
from field_probe import call  # noqa: E402
from run import DB_URL, download, log  # noqa: E402
from test_run import SOURCE  # noqa: E402

MODEL = "softballtracker-sy17i/full-field-read-3-rfdetr-nas-t1--81e540"
BALL = ("football", "ball")


def tiles(img):
    h, w = img.shape[:2]
    tw, th = int(w * 0.55), int(h * 0.55)
    for y in (0, h - th):
        for x in (0, w - tw):
            yield x, y, img[y:y + th, x:x + tw]


def main():
    import firebase_admin
    from firebase_admin import credentials, db
    key = os.environ["ROBOFLOW_API_KEY"].strip()
    firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])), {"databaseURL": DB_URL})
    found = []
    for school in (db.reference("schools").get(shallow=True) or {}):
        clips = db.reference("schools/%s/games/%s/clips" % (school, SOURCE)).get()
        if isinstance(clips, dict):
            found += [(r.get("at") or 0, p, r) for p, r in clips.items() if isinstance(r, dict) and r.get("url")]
    found.sort(key=lambda j: j[0], reverse=True)
    res, keep = {}, {}
    for i, (_, play, rec) in enumerate(found[:4], 1):
        path = download(rec["url"], rec.get("type"))
        cap = cv2.VideoCapture(path)
        end = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / (cap.get(cv2.CAP_PROP_FPS) or 30)
        a, b = float(rec.get("a") or 0), min(end, float(rec.get("b") or end))
        t, n, hit, cls = a, 0, Counter(), Counter()
        while t < b and n < 30:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, img = cap.read()
            t += max(0.33, (b - a) / 30)
            if not ok:
                continue
            small = cv2.resize(img, (960, int(img.shape[0] * 960 / img.shape[1])))
            out = {"full": (call(key, MODEL, img)[1] or {}).get("predictions", []),
                   "small": (call(key, MODEL, small)[1] or {}).get("predictions", []), "tiles": []}
            for x, y, tile in tiles(img):
                for p in (call(key, MODEL, tile)[1] or {}).get("predictions", []):
                    out["tiles"].append(dict(p, x=p["x"] + x, y=p["y"] + y))
            for how, preds in out.items():
                cls.update(p["class"] for p in preds)
                hit[how] += any(p["class"].lower() in BALL and p["confidence"] >= 0.3 for p in preds)
            res["%d|%d" % (i, n)] = out
            if i == 1:
                keep["f%03d.jpg" % n] = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()
            n += 1
        os.remove(path)
        log("clip %d (%dx%d): %d frames; ball seen: full size %d, small %d, tiles %d; classes %s" % (
            i, int(cap.get(3)), int(cap.get(4)), n, hit["full"], hit["small"], hit["tiles"], dict(cls)))
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("preds.json", json.dumps(res))
        for name, data in keep.items():
            z.writestr(name, data)
    pub = serialization.load_pem_public_key(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_key.pem"), "rb").read())
    k, nn = os.urandom(32), os.urandom(12)
    blob = base64.b64encode(pub.encrypt(k, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)) + nn + AESGCM(k).encrypt(nn, buf.getvalue(), None)).decode()
    for j in range(0, len(blob), 20000):
        print("DBG 8 %d %s" % (j // 20000, blob[j:j + 20000]), flush=True)


if __name__ == "__main__":
    main()
