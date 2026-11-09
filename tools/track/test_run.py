"""
Test run for the track-auto branch: tracks up to 4 of the newest Hudl test clips with the new code.

Results go to a separate game ("autotest"), so real tracking and the original test
results aren't overwritten. Each clip is marked done before it's listed in that game,
so the live tracking job never picks it up. Change TEST_RUN to track the clips again.

This repo is public, so the log only ever prints counts.
"""
import json
import os
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from presnap import MODEL as PRESNAP_MODEL  # noqa: E402
from run import DB_URL, download, log  # noqa: E402
from track import KeyProblem, process, roboflow_detect  # noqa: E402

SOURCE, DEST = "hudltest", "autotest"
MAX_CLIPS = 4
TEST_RUN = os.environ.get("TEST_RUN", "1")


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
    root = "schools/%s/" % school
    for i, (at, _, play, rec) in enumerate(jobs, 1):
        status = db.reference(root + "tracking/%s/%s" % (DEST, play))
        old = status.get()
        if isinstance(old, dict) and old.get("status") == "done" and old.get("testRun") == TEST_RUN:
            log("clip %d: already done in this test run" % i)
            continue
        path = None
        try:
            path = download(rec["url"], rec.get("type"))
            out = process(path, detect, a=rec.get("a"), b=rec.get("b"), snap=rec.get("snap"), presnap_detect=pre)
            db.reference(root + "trackdata/%s/%s" % (DEST, play)).set(json.dumps(out, separators=(",", ":")))
            status.set({"status": "done", "at": int(time.time() * 1000), "clipAt": at, "tries": 1, "testRun": TEST_RUN,
                        "players": len(out["tracks"]), "snap": out["snap"]})
            db.reference(root + "games/%s/clips/%s" % (DEST, play)).set(rec)
            f = out["field"]
            log("clip %d: %d players, roles %s, %d relabeled, yards %s, drift %s over %s checks" % (
                i, len(out["tracks"]), dict(Counter(t.get("role", "none") for t in out["tracks"])), out["pre"].get("fixed", -1),
                "ok" if f.get("ok") else "no", f.get("drift"), f.get("driftChecks")))
        except KeyProblem as e:
            sys.exit(str(e))
        except Exception as e:
            log("clip %d: couldn't track (%s)" % (i, str(e)[:120] if isinstance(e, RuntimeError) else type(e).__name__))
        finally:
            if path and os.path.exists(path):
                os.remove(path)


if __name__ == "__main__":
    main()
