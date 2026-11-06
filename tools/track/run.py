"""
Finds game clips that haven't been tracked yet and tracks them.

Reads:   schools/<school>/games/<game>/clips/<play>     (written by the chart's film device)
Writes:  schools/<school>/tracking/<game>/<play>       status: waiting -> working -> done / error
         schools/<school>/trackdata/<game>/<play>      the trails, as one text value
It never writes anywhere the charting app reads or writes.

This repo is public, so the job's log is public too: it only ever prints
counts, never game codes, play ids, links or keys.
"""
import json
import os
import sys
import tempfile
import time
import traceback

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from track import KeyProblem, process, roboflow_detect  # noqa: E402

DB_URL = os.environ.get("FIREBASE_DB_URL", "https://cardinal-booth-default-rtdb.firebaseio.com")
SKIP_GAMES = {"practice", "local"}
MAX_TRIES = 2


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def download(url, kind):
    ext = ".mp4" if "mp4" in (kind or "") else ".webm"
    fd, path = tempfile.mkstemp(suffix=ext)
    try:
        with requests.get(url, stream=True, timeout=120) as r:
            if r.status_code != 200:
                raise RuntimeError("couldn't download the clip (HTTP %d)" % r.status_code)
            with os.fdopen(fd, "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    f.write(chunk)
    except requests.RequestException as e:          # the message would hold the clip's private link
        raise RuntimeError("couldn't download the clip (%s)" % type(e).__name__) from None
    return path


def find_jobs(db, since_ms):
    jobs = []
    allow = {s.strip() for s in os.environ.get("TRACK_SCHOOLS", "").split(",") if s.strip()}
    for school in (db.reference("schools").get(shallow=True) or {}):
        if allow and school not in allow:
            continue
        games = db.reference("schools/%s/games" % school).get(shallow=True) or {}
        for game in games:
            if game in SKIP_GAMES:
                continue
            clips = db.reference("schools/%s/games/%s/clips" % (school, game)).get()
            if not isinstance(clips, dict):
                continue
            seen = db.reference("schools/%s/tracking/%s" % (school, game)).get() or {}
            for play, rec in clips.items():
                if not isinstance(rec, dict) or not rec.get("url") or (rec.get("at") or 0) < since_ms:
                    continue
                st = seen.get(play) if isinstance(seen, dict) else None
                if isinstance(st, dict):
                    if st.get("status") == "done" and (st.get("clipAt") or 0) >= (rec.get("at") or 0):
                        continue
                    if st.get("status") == "error" and (st.get("tries") or 0) >= MAX_TRIES and (st.get("clipAt") or 0) >= (rec.get("at") or 0):
                        continue
                    if st.get("status") == "working" and time.time() * 1000 - (st.get("at") or 0) < 30 * 60e3:
                        continue
                jobs.append((rec.get("at") or 0, school, game, play, rec, st if isinstance(st, dict) else {}))
    jobs.sort(key=lambda j: j[0])
    return jobs


def main():
    sa, key = os.environ.get("FIREBASE_SERVICE_ACCOUNT", ""), os.environ.get("ROBOFLOW_API_KEY", "")
    if not sa.strip() or not key.strip():
        log("Not set up yet: add ROBOFLOW_API_KEY and FIREBASE_SERVICE_ACCOUNT in GitHub (Settings > Secrets and variables > Actions).")
        return
    import firebase_admin
    from firebase_admin import credentials, db
    try:
        cred = credentials.Certificate(json.loads(sa))
    except Exception:
        log("FIREBASE_SERVICE_ACCOUNT isn't the whole Firebase key file. Paste every line of the downloaded .json file.")
        sys.exit(1)
    firebase_admin.initialize_app(cred, {"databaseURL": DB_URL})

    deadline = time.time() + float(os.environ.get("TRACK_MINUTES", "22")) * 60
    since = time.time() * 1000 - float(os.environ.get("TRACK_DAYS", "3")) * 86400e3
    jobs = find_jobs(db, since)
    log("%d clip(s) to track" % len(jobs))
    detect = roboflow_detect(key.strip())
    done = failed = 0
    for i, (at, school, game, play, rec, st) in enumerate(jobs, 1):
        if time.time() > deadline:
            log("Out of time for this run; the rest go next run.")
            break
        status = db.reference("schools/%s/tracking/%s/%s" % (school, game, play))
        tries = (st.get("tries") or 0) + 1 if st.get("clipAt") == at else 1
        status.set({"status": "working", "at": int(time.time() * 1000), "clipAt": at, "tries": tries})
        path = None
        try:
            path = download(rec["url"], rec.get("type"))
            out = process(path, detect, a=rec.get("a"), b=rec.get("b"), snap=rec.get("snap"))
            db.reference("schools/%s/trackdata/%s/%s" % (school, game, play)).set(json.dumps(out, separators=(",", ":")))
            status.set({"status": "done", "at": int(time.time() * 1000), "clipAt": at, "tries": tries,
                        "players": len(out["tracks"]), "snap": out["snap"]})
            done += 1
            log("clip %d of %d: %d players, %d frames, %.0fs" % (i, len(jobs), len(out["tracks"]), out["calls"], out["secs"]))
        except KeyProblem as e:
            status.set({"status": "error", "at": int(time.time() * 1000), "clipAt": at, "tries": 0, "err": str(e)})
            log(str(e) + " Check ROBOFLOW_API_KEY in GitHub settings, or your Roboflow plan.")
            sys.exit(1)
        except Exception as e:
            failed += 1
            msg = str(e)[:200] if isinstance(e, RuntimeError) else type(e).__name__
            status.set({"status": "error", "at": int(time.time() * 1000), "clipAt": at, "tries": tries, "err": msg})
            log("clip %d of %d: couldn't track (%s)" % (i, len(jobs), msg))
            if os.environ.get("TRACK_DEBUG"):
                traceback.print_exc()
        finally:
            if path and os.path.exists(path):
                os.remove(path)
    log("Finished: %d tracked, %d couldn't be tracked." % (done, failed))


if __name__ == "__main__":
    main()
