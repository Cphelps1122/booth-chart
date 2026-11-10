"""
Sends frames from the Hudl test clips into a Roboflow project for labeling the ball and every player.

Takes frames from about 1 s before the snap through the play, 0.4 s apart. Uses no model calls. The project name is in
ball_project.txt; this test job runs when that file changes.
"""
import base64, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2, requests  # noqa: E402
from run import DB_URL, download, log  # noqa: E402
from test_run import SOURCE  # noqa: E402

PER_CLIP, STEP = 15, 0.4      # frames per clip, seconds apart: the whole play without near-copies


def main():
    import firebase_admin
    from firebase_admin import credentials, db
    here = os.path.dirname(os.path.abspath(__file__))
    project = open(os.path.join(here, "ball_project.txt")).read().strip()
    key = os.environ["ROBOFLOW_API_KEY"].strip()
    firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])), {"databaseURL": DB_URL})
    found = []
    for school in (db.reference("schools").get(shallow=True) or {}):
        clips = db.reference("schools/%s/games/%s/clips" % (school, SOURCE)).get()
        if isinstance(clips, dict):
            found += [(p, r) for p, r in clips.items() if isinstance(r, dict) and r.get("url")]
    log("%d clip(s)" % len(found))
    sent = bad = 0
    for i, (play, rec) in enumerate(found, 1):
        path = None
        try:
            path = download(rec["url"], rec.get("type"))
            cap = cv2.VideoCapture(path)
            end = (cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) / (cap.get(cv2.CAP_PROP_FPS) or 30)
            a = float(rec.get("a") or 0)
            start = max(a, float(rec["snap"]) - 1.0) if rec.get("snap") is not None else a + 0.3
            t = start
            for j in range(PER_CLIP):
                if t > min(end, float(rec.get("b") or end)):
                    break
                cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
                ok, img = cap.read()
                t += STEP
                if not ok:
                    continue
                buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])[1]
                r = requests.post("https://api.roboflow.com/dataset/%s/upload" % project,
                                  params={"api_key": key, "name": "clip%02d_%02d.jpg" % (i, j), "split": "train", "batch": "hudl-full-field-1"},
                                  data=base64.b64encode(buf.tobytes()), headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=60)
                if r.status_code == 200:
                    sent += 1
                else:
                    bad += 1
                    if bad == 1:
                        log("upload refused: HTTP %d" % r.status_code)
        except Exception as e:
            log("clip %d skipped (%s)" % (i, type(e).__name__))
        finally:
            if path and os.path.exists(path):
                os.remove(path)
    log("%d frame(s) sent to %s, %d refused" % (sent, project, bad))


if __name__ == "__main__":
    main()
