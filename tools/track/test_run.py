"""
Test run for the track-auto branch: tracks up to 4 of the newest Hudl test clips with the new code.

Results go to a separate game ("autotest"), so real tracking and the original test
results aren't overwritten. Each clip is marked done before it's listed in that game,
so the live tracking job never picks it up. Change TEST_RUN to track the clips again.

This repo is public, so the log only ever prints counts.
"""
import base64
import io
import json
import os
import sys
import time
import zipfile
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from presnap import MODEL as PRESNAP_MODEL  # noqa: E402
from track import HASH_MODEL  # noqa: E402
from run import DB_URL, download, log  # noqa: E402
from track import KeyProblem, process, read_samples, roboflow_detect  # noqa: E402

SOURCE, DEST = "hudltest", "autotest"
MAX_CLIPS = 4
TEST_RUN = os.environ.get("TEST_RUN", "1")


def cached(detect, store, prefix, fresh):
    """Uses detections saved from an earlier run, so re-tests don't spend Roboflow credits."""
    def go(img, t=None):
        k = prefix + ("%.3f" % t).replace(".", "_")
        if k not in store:
            store[k] = detect(img, t)
            fresh.append(k)
        return store[k]
    return go


def send_debug(path, rec, store, out, i):
    """Prints the clip's frames and detections to the log, encrypted with debug_key.pem.
    The log is public, so nothing readable goes in it. Only the holder of the private key can open this."""
    import cv2
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    frames, times = read_samples(path, rec.get("a"), rec.get("b"))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("detections.json", json.dumps({"store": store, "times": times, "a": rec.get("a"), "b": rec.get("b"), "snap": rec.get("snap")}))
        z.writestr("out.json", json.dumps(out))
        for k, f in enumerate(frames):
            z.writestr("f%03d.jpg" % k, cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 60])[1].tobytes())
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_key.pem"), "rb") as fh:
        pub = serialization.load_pem_public_key(fh.read())
    key, nonce = os.urandom(32), os.urandom(12)
    wrapped = pub.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    blob = base64.b64encode(wrapped + nonce + AESGCM(key).encrypt(nonce, buf.getvalue(), None)).decode("ascii")
    size = 20000
    for n in range(0, len(blob), size):
        print("DBG %d %d %s" % (i, n // size, blob[n:n + size]), flush=True)


def main():
    sa, key = os.environ.get("FIREBASE_SERVICE_ACCOUNT", ""), os.environ.get("ROBOFLOW_API_KEY", "")
    if not sa.strip() or not key.strip():
        sys.exit("Missing a GitHub secret.")
    import firebase_admin
    from firebase_admin import credentials, db
    firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)), {"databaseURL": DB_URL})
    found = []
    for school in (db.reference("schools").get(shallow=True) or {}):
        clips = db.reference("schools/%s/games/%s/clips" % (school, SOURCE)).get()
        if isinstance(clips, dict):
            found += [(r.get("at") or 0, school, p, r) for p, r in clips.items() if isinstance(r, dict) and r.get("url")]
    if not found:
        log("No Hudl test clips found.")
        return
    found.sort(key=lambda j: j[0], reverse=True)
    school = found[0][1]                                # only the school with the newest clip
    jobs = [j for j in found if j[1] == school][:MAX_CLIPS]
    log("%d clip(s) to track" % len(jobs))
    detect = roboflow_detect(key.strip())
    pre = roboflow_detect(key.strip(), model=PRESNAP_MODEL, confidence=15)
    hsh = roboflow_detect(key.strip(), model=HASH_MODEL, confidence=30)
    root = "schools/%s/" % school
    for i, (at, _, play, rec) in enumerate(jobs, 1):
        status = db.reference(root + "tracking/%s/%s" % (DEST, play))
        old = status.get()
        if isinstance(old, dict) and old.get("status") == "done" and old.get("testRun") == TEST_RUN:
            log("clip %d: already done in this test run" % i)
            continue
        path = None
        cache = db.reference(root + "trackcache/%s/%s" % (DEST, play))
        store, fresh = cache.get() or {}, []
        try:
            path = download(rec["url"], rec.get("type"))
            out = process(path, cached(detect, store, "f", fresh), a=rec.get("a"), b=rec.get("b"), snap=rec.get("snap"),
                          presnap_detect=cached(pre, store, "p", fresh), hash_detect=cached(hsh, store, "h", fresh))
            if fresh:
                cache.set(store)
            log("clip %d: %d new Roboflow calls, %d reused, %d camera misses" % (i, len(fresh), len(store) - len(fresh), out["camFails"]))
            if os.environ.get("TEST_DEBUG"):
                send_debug(path, rec, store, out, i)
            db.reference(root + "trackdata/%s/%s" % (DEST, play)).set(json.dumps(out, separators=(",", ":")))
            status.set({"status": "done", "at": int(time.time() * 1000), "clipAt": at, "tries": 1, "testRun": TEST_RUN,
                        "players": len(out["tracks"]), "snap": out["snap"]})
            db.reference(root + "games/%s/clips/%s" % (DEST, play)).set(rec)
            f = out["field"]
            log("clip %d: %d players, roles %s, %d relabeled, yards %s, drift %s over %s checks" % (
                i, len(out["tracks"]), dict(Counter(t.get("role", "none") for t in out["tracks"])), out["pre"].get("fixed", -1),
                "ok" if f.get("ok") else "no", f.get("drift"), f.get("driftChecks")))
            log("clip %d: %s hash-model fits; los %s" % (i, f.get("hashFits"), f.get("los")))
        except KeyProblem as e:
            sys.exit(str(e))
        except Exception as e:
            log("clip %d: couldn't track (%s)" % (i, str(e)[:120] if isinstance(e, RuntimeError) else type(e).__name__))
        finally:
            if path and os.path.exists(path):
                os.remove(path)


if __name__ == "__main__":
    main()
