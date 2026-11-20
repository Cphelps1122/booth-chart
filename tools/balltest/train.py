"""Make a new full-field-read version (2x2 tiles so the ball is bigger) and start training it.
The app keeps using the pinned version until a coach approves switching."""
import os, json, roboflow
rf = roboflow.Roboflow(api_key=os.environ["ROBOFLOW_API_KEY"].strip())
proj = rf.workspace("softballtracker-sy17i").project("full-field-read")
vers = proj.versions(); print("Existing versions:", [v.version for v in vers])
last = vers[0] if vers else None
if last is not None:
    print("Latest version settings:", json.dumps({"preprocessing": getattr(last, "preprocessing", None),
          "augmentation": getattr(last, "augmentation", None), "model": getattr(last, "model_format", None)})[:800])
settings = {"preprocessing": {"auto-orient": True, "tile": {"rows": 2, "columns": 2},
                              "resize": {"width": 640, "height": 640, "format": "Fit (black edges) in"}},
            "augmentation": {"brightness": {"brighten": True, "darken": True, "percent": 15}}}
v = proj.generate_version(settings); print("New version:", v)
ver = proj.version(v)
for mt in [os.environ.get("RF_MODEL_TYPE", "rfdetr-small"), "rf-detr-small", None]:
    try:
        r = ver.train(model_type=mt) if mt else ver.train()
        print("Training started, model type:", mt); break
    except Exception as e:
        print("train(%s) failed: %s" % (mt, str(e)[:300]))
