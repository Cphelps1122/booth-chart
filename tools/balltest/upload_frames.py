"""Send the tight-film frames to the Roboflow full-field-read project as one batch to label.
Images only (no pre-made boxes). Never prints the key."""
import glob, os, sys, requests
key = os.environ["ROBOFLOW_API_KEY"].strip()
WS = "softballtracker-sy17i"
BATCH = os.environ.get("RF_BATCH", "ball-tight-nov20")
ws = requests.get("https://api.roboflow.com/" + WS, params={"api_key": key}, timeout=30)
if ws.status_code != 200:
    sys.exit("Roboflow workspace lookup failed: HTTP %d" % ws.status_code)
projects = ws.json().get("workspace", {}).get("projects", [])
print("Projects:", [p.get("id") for p in projects])
pick = [p for p in projects if p.get("id", "").split("/")[-1] == "full-field-read"] or \
       [p for p in projects if "full-field-read" in p.get("id", "")]
if len(pick) != 1:
    sys.exit("Couldn't pick exactly one full-field-read project; not uploading.")
proj = pick[0]["id"].split("/")[-1]
print("Uploading to project:", proj, "batch:", BATCH)
ok = bad = 0
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), "frames", "*.jpg"))):
    with open(f, "rb") as fh:
        r = requests.post("https://api.roboflow.com/dataset/%s/upload" % proj,
                          params={"api_key": key, "name": os.path.basename(f), "batch": BATCH, "split": "train"},
                          files={"file": (os.path.basename(f), fh, "image/jpeg")}, timeout=120)
    if r.status_code == 200 and not r.json().get("error"): ok += 1
    else: bad += 1; print("Failed:", os.path.basename(f), r.status_code)
print("Uploaded %d, failed %d" % (ok, bad))
open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a").write(
    "Uploaded %d frames to `%s` (batch `%s`), failed %d\n" % (ok, proj, BATCH, bad))
