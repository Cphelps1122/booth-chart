"""
Runs the Full Field Read model on the 4 Hudl test clips (track-auto test only).
Prints counts; full predictions go out encrypted with debug_key.pem.
"""
import base64, json, os, sys
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from field_probe import call  # noqa: E402
from run import DB_URL, download, log  # noqa: E402
from track import read_samples  # noqa: E402
from test_run import SOURCE  # noqa: E402

IDS = ["softballtracker-sy17i/full-field-read-2-rfdetr-small-t1", "softballtracker-sy17i/full-field-read-2-rfdetr-small-t2", "full-field-read/2"]


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
        clips.append(read_samples(path, rec.get("a"), rec.get("b"))[0])
        os.remove(path)
    model = None
    for m in IDS:
        code, _ = call(key, m, clips[0][0])
        log("%s -> %d" % (m, code))
        if code == 200:
            model = m
            break
    if not model:
        return
    res = {}
    for i, fr in enumerate(clips, 1):
        c, ball = Counter(), 0
        for k in range(0, len(fr), 2):
            p = (call(key, model, fr[k])[1] or {}).get("predictions", [])
            res["%d|%d" % (i, k)] = p
            c.update(x["class"] for x in p if x["confidence"] >= 0.4)
            ball += any(x["class"] == "football" and x["confidence"] >= 0.25 for x in p)
        n = len(range(0, len(fr), 2))
        log("clip %d: %d frames, ball seen in %d, avg per frame %s" % (i, n, ball, {k: round(v / n, 1) for k, v in sorted(c.items())}))
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    pub = serialization.load_pem_public_key(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_key.pem"), "rb").read())
    k, n = os.urandom(32), os.urandom(12)
    blob = base64.b64encode(pub.encrypt(k, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)) + n + AESGCM(k).encrypt(n, json.dumps(res).encode(), None)).decode()
    for j in range(0, len(blob), 20000):
        print("DBG 9 %d %s" % (j // 20000, blob[j:j + 20000]), flush=True)


if __name__ == "__main__":
    main()
