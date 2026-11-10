"""
Tries public Roboflow Universe field-point models on the Hudl test clips (track-auto test only).

Finds which project versions answer, then runs them on a few frames per clip.
Results are encrypted with debug_key.pem, since the log is public.
"""
import base64, io, json, os, sys, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2, requests  # noqa: E402
from run import DB_URL, download, log  # noqa: E402
from track import read_samples  # noqa: E402
from test_run import SOURCE  # noqa: E402

CANDIDATES = ["football-tracking/hash-yards-intersection", "putt3/hash-yards-intersection-rg4ku",
              "footballfield-juzbu/football_field_keypoint-sorted", "footballfield-juzbu/football_field_keypoint",
              "bronkscottema/football-field-numbers", "football-ytbzg/field-keypoints-detection",
              "footballtrackingv1/field-keypoints-vnt9c", "football-tracking-5ufxk/tracking-field-key-points"]


def call(key, model, img):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    r = requests.post("https://serverless.roboflow.com/" + model, params={"api_key": key, "confidence": 20},
                      data=base64.b64encode(buf.tobytes()), headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=60)
    return r.status_code, (r.json() if r.status_code == 200 else None)


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
    clips = []
    for _, play, rec in found[:4]:
        path = download(rec["url"], rec.get("type"))
        fr, _ = read_samples(path, rec.get("a"), rec.get("b"))
        clips.append(fr)
        os.remove(path)
    models, codes = [], []
    for c in CANDIDATES:
        for v in range(1, 7):
            slug = c.split("/")[-1]
            code, js = call(key, "%s/%d" % (slug, v), clips[0][len(clips[0]) // 3])
            codes.append(code)
            if code == 200:
                models.append("%s/%d" % (slug, v))
        log("%s: %s %s" % (c, [m for m in models if m.startswith(c.split("/")[-1])] or "no model answered", codes[-6:]))
    res = {}
    for m in models:
        for i, fr in enumerate(clips, 1):
            for k in sorted({0, len(fr) // 3, len(fr) // 2, 2 * len(fr) // 3, len(fr) - 1}):
                res["%s|%d|%d" % (m, i, k)] = call(key, m, fr[k])[1]
    log("%d model(s) answered, %d frames read" % (len(models), len(res)))
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    raw = json.dumps(res).encode()
    pub = serialization.load_pem_public_key(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_key.pem"), "rb").read())
    k, n = os.urandom(32), os.urandom(12)
    blob = base64.b64encode(pub.encrypt(k, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)) + n + AESGCM(k).encrypt(n, raw, None)).decode()
    for j in range(0, len(blob), 20000):
        print("DBG 9 %d %s" % (j // 20000, blob[j:j + 20000]), flush=True)


if __name__ == "__main__":
    main()
