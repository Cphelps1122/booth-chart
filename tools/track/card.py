"""
Top-down field picture for a play card, made by flattening the film onto the field.

Taking the middle value of each spot across the play leaves the painted field
and removes the players. The Tracking card draws routes on top of it.
"""
import base64

import cv2
import numpy as np

SCALE, Y0, Y1, BACK = 14.0, -20.5, 33.8, 9.0     # pixels per yard; far and near sideline; yards shown behind the line
MIN_TOP, MARGIN = 15.0, 5.0


def extent(out):
    """Yards to show past and behind the line so every drawn route and its defender fits."""
    f, ids = out["field"], {t["id"]: t for t in out["tracks"]}
    k0 = out["snapK"] if out.get("snapK") is not None else out["preK"]
    drawn = [t for t in out["tracks"] if t.get("role") in ("WR", "Slot", "TE", "RB")]
    drawn += [ids[t["cover"]] for t in drawn if t.get("cover") in ids]
    dep = [f["dir"] * p[0] - f["los"] for t in drawn if "f" in t for q, p in zip(t["p"], t["f"]) if q[0] >= k0]
    if not dep:
        return MIN_TOP, BACK
    return min(50.0, max(MIN_TOP, max(dep) + MARGIN)), min(20.0, max(BACK, -min(dep) + MARGIN))


def make(frames, out, quality=70):
    """The field picture and how to place yards on it, or None without yards."""
    f = out.get("field") or {}
    if not f.get("ok"):
        return None
    F = np.array(f["F"] + [1.0], dtype=float).reshape(3, 3)
    d, los = float(f["dir"]), float(f["los"])
    top, back = extent(out)
    A = np.array([[0, SCALE, -Y0 * SCALE] if d > 0 else [0, -SCALE, Y1 * SCALE],
                  [-d * SCALE, 0, (top + los) * SCALE], [0, 0, 1]], dtype=float)
    W, H = int((Y1 - Y0) * SCALE), int((top + back) * SCALE)
    picks = list(range(0, len(frames), max(1, len(frames) // 14)))
    stack = []
    for k in picks:
        Hk = np.array(out["Hs"][k] + [1.0], dtype=float).reshape(3, 3)
        M = A @ F @ np.linalg.inv(Hk)
        img = cv2.warpPerspective(frames[k], M, (W, H), flags=cv2.INTER_LINEAR).astype(np.float32)
        seen = cv2.warpPerspective(np.ones(frames[k].shape[:2], np.uint8), M, (W, H), flags=cv2.INTER_NEAREST)
        img[seen == 0] = np.nan
        stack.append(img)
    with np.errstate(all="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            bg = np.nanmedian(np.stack(stack), axis=0)
    bg = np.nan_to_num(bg, nan=22.0).clip(0, 255).astype(np.uint8)
    ok, buf = cv2.imencode(".jpg", bg, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return {"bg": base64.b64encode(buf.tobytes()).decode("ascii"), "w": W, "h": H, "s": SCALE, "y0": Y0, "y1": Y1,
            "top": top, "dir": d, "los": los}
