#!/usr/bin/env python3
"""
Standalone Grok-watermark stripper.

The "Remove Watermark" button's batch tool - same corner-OCR-and-inpaint
pass motion_segment.py now runs automatically before decomposing a fresh
upload (see watermark.py), exposed here as its own pass over images that
were already decomposed before that existed, or that were never decomposed
at all. Runs at the source image's own resolution: this only ever touches a
small corner, so there is no reason to pay motion_segment's 2200px
decompose-pipeline downscale for it.

Usage
    remove_watermark.py IMG [IMG ...]   -> {"results": [ ... ]}  (one per image)
    cat img.png | remove_watermark.py   -> a single result object
"""

import sys
import json
import io

from motion_segment import _ocr_region, _background_data_url
from watermark import strip_grok_watermark


def process_image(input_bytes):
    try:
        import numpy as np
        from PIL import Image
    except ImportError as e:
        return {"error": "Missing python dependencies: {}".format(e)}

    try:
        import cv2
    except ImportError:
        return {"error": "opencv not installed - cannot detect or remove a watermark"}

    try:
        Image.MAX_IMAGE_PIXELS = None
        img_pil = Image.open(io.BytesIO(input_bytes)).convert("RGB")
    except Exception as e:
        return {"error": "Failed to decode image: {}".format(e)}

    arr = np.array(img_pil)  # RGB, uint8, full source resolution - no downscale
    box = strip_grok_watermark(np, cv2, arr, _ocr_region)

    return {
        "success": True,
        "width": int(arr.shape[1]),
        "height": int(arr.shape[0]),
        "watermarkRemoved": box is not None,
        "removedBox": (
            {"left": box[0], "top": box[1], "width": box[2], "height": box[3]} if box else None
        ),
        "imageUrl": _background_data_url(arr),
    }


def main():
    paths = sys.argv[1:]
    if not paths:
        data = sys.stdin.buffer.read()
        print(json.dumps(process_image(data)))
        return

    results = []
    for p in paths:
        try:
            with open(p, "rb") as f:
                results.append(process_image(f.read()))
        except Exception as e:
            results.append({"error": "Failed to read {}: {}".format(p, e)})

    if len(results) == 1:
        print(json.dumps(results[0]))
    else:
        print(json.dumps({"success": True, "results": results}))


if __name__ == "__main__":
    main()
