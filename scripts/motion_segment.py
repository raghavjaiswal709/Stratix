#!/usr/bin/env python3
"""
Stratix motion-video decomposer.

Splits a poster into independently movable layers WITHOUT degrading it:

  * Every pixel that is not covered by a detected element stays bit-identical
    to the source. Nothing is globally resized, re-encoded or inpainted.
  * Element cut-outs are lossless PNG crops taken straight from the source
    array, and the hole punched in the background is exactly the same
    rectangle - so the composite at rest reproduces the original.
  * Elements sitting on flat background get an un-premultiplied alpha matte.
    bg*(1-a) + color*a == original pixel, so at rest it is still exact, but
    once the layer moves it carries no background rectangle with it.
  * OCR (tesseract) supplies the literal text of every text layer together
    with its position, font size, colour and alignment, so the JSON explains
    itself: you can read it and know which numbers belong to which words.

Usage
    motion_segment.py IMG [IMG ...]   -> {"results": [ ... ]}  (one per image)
    cat img.png | motion_segment.py   -> a single result object
"""

import sys
import json
import base64
import io
import re

from watermark import strip_grok_watermark, _looks_like_grok

# Longest edge we do pixel work on. Bigger inputs are downscaled once, with
# LANCZOS, and everything (background + cut-outs) is derived from that single
# buffer so the layers and the background always agree pixel for pixel.
MAX_PROCESS_DIM = 2200

# OCR likes ~1100-2200px on the long edge. Smaller gets upscaled, bigger
# downscaled, purely for the tesseract pass - never for the output pixels.
OCR_MIN_DIM = 1100
OCR_MAX_DIM = 2200

MIN_WORD_CONF = 45.0
MAX_LAYERS = 40

# ---- object detection ----------------------------------------------------
# Floor for "this pixel differs from the page background", in 0-255 max-channel
# distance. Otsu decides the real level per poster; this only stops a perfectly
# flat page from thresholding on compression noise.
FOREGROUND_MIN_DIST = 10.0
# Morphological close, as a fraction of the short edge. Big enough to seal an
# outline icon, small enough not to weld neighbouring objects together.
OBJECT_CLOSE_FRAC = 0.011
# Fragments closer than this (short-edge fraction) and similar in colour are one
# object. Illustrations arrive as dozens of strokes; this reassembles them.
MERGE_GAP_FRAC = 0.018
MERGE_COLOR_DIST = 46.0
# A swarm of this many fragments within this reach is one object, whatever their
# colours - a chart, a photograph, a multi-coloured illustration.
CLUSTER_GAP_FRAC = 0.045
CLUSTER_MIN_MEMBERS = 3
# Below this share of the page an object is speckle.
MIN_OBJECT_PIXELS_FRAC = 0.00035
# Distinct 5-bit colours before something reads as photographic rather than drawn.
PHOTO_COLOR_COUNT = 220
MAX_OBJECTS = 28

# Alpha matte ramp, in 0-255 max-channel distance from the local background.
MATTE_LO = 3.0
MATTE_HI = 42.0
# How close the interior background has to be to the surrounding background
# before we trust a matte. Beyond this the element is a card/panel with its
# own fill, and it stays an opaque rectangle (which is the correct reading).
MATTE_AGREE_DIST = 14.0

# ---- collage layout (v2 design system) ------------------------------------
# A poster split into 1-4 caption-labelled parts by drawn dividers. Detected
# separately from - and more strictly than - the general-purpose "divider"
# object kind above: a real collage rule spans almost the whole canvas, where
# an ordinary in-page rule (the 0.18 threshold in _classify_object) does not.
COLLAGE_DIVIDER_SPAN_FRAC = 0.45
COLLAGE_DIVIDER_MAX_THICKNESS_FRAC = 0.045
COLLAGE_DIVIDER_POSITION_TOL = 0.25


# --------------------------------------------------------------------------
# encoding helpers
# --------------------------------------------------------------------------

def _png_data_url(arr, mode):
    buf = io.BytesIO()
    from PIL import Image
    Image.fromarray(arr, mode).save(buf, format="PNG", compress_level=6, optimize=False)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _background_data_url(arr_rgb):
    """PNG (lossless) unless the poster is photographic enough that PNG blows
    up, in which case a q95 JPEG - still far better than the old pipeline."""
    from PIL import Image
    buf = io.BytesIO()
    Image.fromarray(arr_rgb, "RGB").save(buf, format="PNG", compress_level=6)
    raw = buf.getvalue()
    if len(raw) <= 8 * 1024 * 1024:
        return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")
    buf = io.BytesIO()
    Image.fromarray(arr_rgb, "RGB").save(buf, format="JPEG", quality=95, subsampling=0)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


# --------------------------------------------------------------------------
# geometry helpers  (boxes are (x, y, w, h) in processed-image pixels)
# --------------------------------------------------------------------------

def _area(b):
    return max(0, b[2]) * max(0, b[3])


def _inter(a, b):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[0] + a[2], b[0] + b[2])
    y2 = min(a[1] + a[3], b[1] + b[3])
    if x2 <= x1 or y2 <= y1:
        return 0
    return (x2 - x1) * (y2 - y1)


def _iou(a, b):
    i = _inter(a, b)
    if i == 0:
        return 0.0
    return i / float(_area(a) + _area(b) - i)


def _contained(inner, outer, tol=0.88):
    """True when `inner` is essentially swallowed by `outer`."""
    ai = _area(inner)
    if ai == 0:
        return True
    return _inter(inner, outer) / float(ai) >= tol


def _union(a, b):
    x1 = min(a[0], b[0])
    y1 = min(a[1], b[1])
    x2 = max(a[0] + a[2], b[0] + b[2])
    y2 = max(a[1] + a[3], b[1] + b[3])
    return (x1, y1, x2 - x1, y2 - y1)


def _clip(b, w, h):
    x = max(0, min(w - 1, int(round(b[0]))))
    y = max(0, min(h - 1, int(round(b[1]))))
    bw = max(1, min(w - x, int(round(b[2]))))
    bh = max(1, min(h - y, int(round(b[3]))))
    return (x, y, bw, bh)


def _resolve_overlaps(items, iou_merge=0.30):
    """Drop contained boxes, merge heavy overlaps. Items are dicts with 'box'.

    This is the step the old pipeline was missing: two detection passes both
    pushed boxes for the same element, so elements were drawn twice and each
    fill erased its neighbour. Nested + overlapping boxes are collapsed here
    before a single pixel is touched.
    """
    items = sorted(items, key=lambda it: _area(it["box"]), reverse=True)
    kept = []
    for it in items:
        merged = False
        for k in kept:
            if _contained(it["box"], k["box"]):
                merged = True
                break
            if _iou(it["box"], k["box"]) >= iou_merge:
                # same element found twice - widen the survivor, keep its text
                k["box"] = _union(k["box"], it["box"])
                if not k.get("text") and it.get("text"):
                    k.update({key: it[key] for key in it if key != "box"})
                merged = True
                break
        if not merged:
            kept.append(it)
    return kept


# --------------------------------------------------------------------------
# colour helpers
# --------------------------------------------------------------------------

def _hex(c):
    return "#{:02X}{:02X}{:02X}".format(int(c[0]), int(c[1]), int(c[2]))


def _modal_color(np, pixels):
    """Most common colour of a pixel list, refined to the mean of its bin."""
    if pixels.size == 0:
        return None
    q = (pixels.astype(np.uint16) >> 4).astype(np.uint32)
    keys = (q[:, 0] << 16) | (q[:, 1] << 8) | q[:, 2]
    uniq, counts = np.unique(keys, return_counts=True)
    top = uniq[int(np.argmax(counts))]
    center = np.array([(top >> 16) & 0xFF, (top >> 8) & 0xFF, top & 0xFF], dtype=np.float32) * 16.0 + 8.0
    near = pixels[np.abs(pixels.astype(np.float32) - center).max(axis=1) <= 16]
    if near.size == 0:
        return center.astype(np.uint8)
    return near.mean(axis=0).astype(np.uint8)


def _ring_pixels(np, arr, box, union_mask, radius):
    """Background pixels in a frame just outside `box`, skipping anything that
    belongs to another element (that is what produced the ghosting before)."""
    h, w = arr.shape[:2]
    x, y, bw, bh = box
    ox1 = max(0, x - radius)
    oy1 = max(0, y - radius)
    ox2 = min(w, x + bw + radius)
    oy2 = min(h, y + bh + radius)

    frame = np.zeros((oy2 - oy1, ox2 - ox1), dtype=bool)
    frame[:, :] = True
    frame[y - oy1: y - oy1 + bh, x - ox1: x - ox1 + bw] = False

    patch = arr[oy1:oy2, ox1:ox2]
    clean = frame & (union_mask[oy1:oy2, ox1:ox2] == 0)
    px = patch[clean]
    if len(px) < 24:
        px = patch[frame]
    return px


def _ink_and_paper(np, cv2, crop_rgb):
    """Split a crop into ink (glyphs / strokes) and paper (its own background)
    with Otsu. Returns (ink_color, paper_color, ink_ratio)."""
    gray = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2GRAY)
    if gray.size == 0:
        return None, None, 0.0
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    flat = crop_rgb.reshape(-1, 3)
    m = mask.reshape(-1) > 0
    dark = flat[~m]
    light = flat[m]
    if len(dark) == 0 or len(light) == 0:
        return None, _modal_color(np, flat), 0.0
    # the minority side is the ink
    if len(dark) <= len(light):
        ink, paper, ratio = dark, light, len(dark) / float(len(flat))
    else:
        ink, paper, ratio = light, dark, len(light) / float(len(flat))
    return _modal_color(np, ink), _modal_color(np, paper), ratio


def _matte(np, crop_rgb, bg_color):
    """Un-premultiplied alpha matte against a flat local background.

    Compositing bg*(1-a) + color*a returns the source pixel exactly wherever
    a > 0, so the poster at rest is unchanged, while a moving layer no longer
    drags a coloured rectangle behind it.
    """
    bg = bg_color.astype(np.float32)
    src = crop_rgb.astype(np.float32)
    delta = src - bg
    dist = np.abs(delta).max(axis=2)

    a = np.clip((dist - MATTE_LO) / (MATTE_HI - MATTE_LO), 0.0, 1.0)
    a3 = a[:, :, None]
    safe = np.maximum(a3, 1.0 / 255.0)
    color = np.clip(bg + delta / safe, 0.0, 255.0)
    # keep fully transparent pixels at the background colour: better PNG
    # compression and no fringe if a viewer ignores alpha
    color = np.where(a3 > 0.0, color, bg)

    out = np.empty((crop_rgb.shape[0], crop_rgb.shape[1], 4), dtype=np.uint8)
    out[:, :, :3] = color.astype(np.uint8)
    out[:, :, 3] = (a * 255.0 + 0.5).astype(np.uint8)
    return out


# --------------------------------------------------------------------------
# OCR
# --------------------------------------------------------------------------

def _tesseract():
    try:
        import pytesseract
        from pytesseract import Output
        return pytesseract, Output
    except Exception:
        return None, None


def _is_junk_word(text, conf):
    """Reject OCR noise: icons read as glyphs, stray punctuation, bare symbols.

    A lightning bolt comes back as '4' at conf 77 and a circled badge as '©)';
    both would otherwise become bogus text layers.
    """
    alnum = sum(1 for c in text if c.isalnum())
    if alnum == 0:
        return True
    if alnum < 0.5 * len(text):
        return True
    if len(text) <= 2 and conf < 85.0:
        return True

    # One character repeated is a texture being spelled out, not a word.
    if len(text) >= 3 and len(set(text.lower())) == 1:
        return True
    return False


# Plausible width-to-height ratio of a single Latin glyph. Anything far outside
# this is not type.
MIN_GLYPH_ASPECT = 0.30
MAX_GLYPH_ASPECT = 2.20


def _implausible_word_box(text, box):
    """Reject 'words' whose box could not hold those letters.

    This is what stops drawn objects being read as type. A bar chart comes back
    as a confident "alll" in a 323x301 box - four characters in a box taller
    than it is wide, i.e. glyphs of aspect 0.27, which no font produces. Judging
    the geometry rather than the spelling keeps real words of any language and
    kills the confident nonsense that costs a whole region of the poster.
    """
    n = len(text.strip())
    if n < 3:
        return False
    bw, bh = box[2], box[3]
    if bh <= 0:
        return True
    per_glyph = (bw / float(n)) / float(bh)
    return per_glyph < MIN_GLYPH_ASPECT or per_glyph > MAX_GLYPH_ASPECT


def _ocr_prepare(cv2, gray):
    """Local contrast normalisation before OCR.

    Posters put type on gradients, photographs and coloured panels, where a
    single global threshold loses whichever end of the ramp it is not tuned for.
    CLAHE equalises in tiles, so pale type on a light wash and white type on a
    dark panel both come back with the contrast tesseract wants.
    """
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)


def _ocr_words(np, cv2, arr_rgb):
    """Every readable word on the page, boxed in processed-image coordinates.

    Several passes, deliberately ordered by trustworthiness: the native-scale
    sparse read first, then progressively more speculative ones that may only
    contribute words no earlier pass saw. Each pass is cheap relative to the CV
    work, and the failure they exist to prevent - a headline that decomposes as
    an anonymous rectangle because OCR never read it - is expensive.
    """
    pytesseract, Output = _tesseract()
    if pytesseract is None:
        return [], "pytesseract-missing"

    h, w = arr_rgb.shape[:2]
    long_edge = max(w, h)
    scale = 1.0
    if long_edge < OCR_MIN_DIM:
        scale = OCR_MIN_DIM / float(long_edge)
    elif long_edge > OCR_MAX_DIM:
        scale = OCR_MAX_DIM / float(long_edge)

    if abs(scale - 1.0) > 1e-3:
        interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
        ocr_img = cv2.resize(arr_rgb, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=interp)
    else:
        ocr_img = arr_rgb

    gray = cv2.cvtColor(ocr_img, cv2.COLOR_RGB2GRAY)
    even = _ocr_prepare(cv2, gray)

    def run(image, config):
        try:
            return pytesseract.image_to_data(image, config=config, output_type=Output.DICT)
        except Exception:
            return None

    words = []

    def collect(data, pass_scale, min_conf=MIN_WORD_CONF):
        if not data:
            return 0
        n = len(data.get("text", []))
        added = 0
        for i in range(n):
            txt = (data["text"][i] or "").strip()
            if not txt:
                continue
            try:
                conf = float(data["conf"][i])
            except (TypeError, ValueError):
                conf = -1.0
            if conf < min_conf or _is_junk_word(txt, conf):
                continue
            bw = int(data["width"][i])
            bh = int(data["height"][i])
            if bw < 3 or bh < 5:
                continue
            box = (int(data["left"][i] / pass_scale), int(data["top"][i] / pass_scale),
                   int(bw / pass_scale), int(bh / pass_scale))
            if _area(box) <= 0:
                continue
            if _implausible_word_box(txt, box):
                continue
            # Type too small to read at this resolution is usually a texture -
            # a dot grid, a hatch pattern - being spelled out. Let it through
            # only when tesseract is genuinely sure.
            if box[3] < 0.009 * h and conf < 80.0:
                continue
            # Earlier passes win: the native-resolution read is the trustworthy
            # one, later passes only get to contribute words it never saw.
            if any(_iou(ex["box"], box) > 0.5 for ex in words):
                continue
            words.append({"text": txt, "conf": round(conf, 1), "box": _clip(box, w, h)})
            added += 1
        return added

    # 1. Sparse text at native scale: posters are islands of type, not prose.
    collect(run(even, "--oem 3 --psm 11"), scale)
    # 2. Block and column modes, for decks that really are laid out as prose.
    if len(words) < 3:
        collect(run(even, "--oem 3 --psm 6"), scale)
        collect(run(even, "--oem 3 --psm 4"), scale)

    # 3. Inverted. Tesseract normalises polarity per region, but a page that is
    #    mostly dark with white type biases the sparse pass toward reading the
    #    light areas as background; the inverse image gives the same detector a
    #    conventional dark-on-light page.
    collect(run(cv2.bitwise_not(even), "--oem 3 --psm 11"), scale)

    # 4. Enlarged. Small type - badges, page counters, footnotes - sits below
    #    tesseract's comfortable size at native resolution and reads cleanly at
    #    ~1.7x. Anything found above is kept as-is.
    up = scale * 1.7
    if max(w, h) * up <= 3400:
        big = cv2.resize(arr_rgb, (max(1, int(w * up)), max(1, int(h * up))),
                         interpolation=cv2.INTER_CUBIC)
        big_even = _ocr_prepare(cv2, cv2.cvtColor(big, cv2.COLOR_RGB2GRAY))
        collect(run(big_even, "--oem 3 --psm 11"), up)
        collect(run(cv2.bitwise_not(big_even), "--oem 3 --psm 11"), up)

    return words, "tesseract"


def _accept_region_text(read):
    """Region OCR is speculative - it is aimed at panels we have no text for,
    so it has to clear a higher bar than the page pass before a graphic is
    reclassified as text. Two alphanumerics and real confidence: enough for
    "PART 2", "STRATIX" or "1/10", not enough for a lone glyph hallucinated
    out of an icon."""
    text = read["text"].strip()
    if sum(1 for c in text if c.isalnum()) < 2:
        return False
    return read["conf"] >= 70.0


def _extract_numeral_from_text(raw_text):
    if not raw_text or not isinstance(raw_text, str):
        return None
    t = raw_text.strip()
    if not t:
        return None
    circled = {'①':1, '②':2, '③':3, '④':4, '⑤':5, '⑥':6, '⑦':7, '⑧':8, '⑨':9, '⑩':10,
               '⑪':11, '⑫':12, '⑬':13, '⑭':14, '⑮':15, '⑯':16, '⑰':17, '⑱':18, '⑲':19, '⑳':20}
    for char, val in circled.items():
        if char in t:
            return val
    clean = re.sub(r'[\(\)\[\]\{\}\.\,]', '', t).strip()
    norm = clean.replace('O', '0').replace('o', '0').replace('I', '1').replace('l', '1').replace('Z', '2').replace('z', '2').replace('S', '5').replace('s', '5').replace('B', '8')
    m = re.search(r'\b\d{1,2}\b', norm)
    if m:
        val = int(m.group(0))
        if 1 <= val <= 99:
            return val
    m2 = re.search(r'\d{1,2}', norm)
    if m2:
        val = int(m2.group(0))
        if 1 <= val <= 99:
            return val
    return None


def _is_corner_badge_number(read, box, w, h):
    """Checks if `read` contains a plausible slide badge number in the top half."""
    text = read["text"].strip()
    num = _extract_numeral_from_text(text)
    if num is None:
        return False
    if read["conf"] < 30.0:
        return False
    x, y, bw, bh = box
    cx, cy = (x + bw / 2.0) / float(w), (y + bh / 2.0) / float(h)
    return cy < 0.42


# Crop tightnesses tried, in order, when reading a badge's own interior.
_BADGE_SHRINKS = (0.30, 0.40, 0.50, 0.60, 0.70)


def _locate_badge_ink(cv2, arr_rgb, search_box, exclude_boxes, w, h):
    """Finds the tight ink bounding box inside search_box."""
    sx, sy, sw, sh = search_box
    pad_x, pad_y = max(4, int(0.20 * sw)), max(4, int(0.20 * sh))
    sx, sy = sx - pad_x, sy - pad_y
    sw, sh = sw + 2 * pad_x, sh + 2 * pad_y
    sx, sy = max(0, sx), max(0, sy)
    sw, sh = min(sw, w - sx), min(sh, h - sy)
    if sw < 8 or sh < 8:
        return None

    crop_rgb = arr_rgb[sy:sy + sh, sx:sx + sw].copy()
    for ex, ey, ew, eh in exclude_boxes:
        x0, y0 = max(ex, sx) - sx, max(ey, sy) - sy
        x1, y1 = min(ex + ew, sx + sw) - sx, min(ey + eh, sy + sh) - sy
        if x1 > x0 and y1 > y0:
            crop_rgb[y0:y1, x0:x1] = 255

    gray = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2GRAY)
    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ys, xs = th.nonzero()
    if len(xs) < 15:
        return None

    ix0, ix1, iy0, iy1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    iw, ih = ix1 - ix0, iy1 - iy0
    if iw < 6 or ih < 6:
        return None
    if iw > 0.9 * sw or ih > 0.9 * sh:
        return None
    return (sx + ix0, sy + iy0, iw, ih)


def _read_badge_at(np, cv2, arr_rgb, search_box, exclude_boxes, w, h):
    """Locates the ink inside search_box and reads it with crop tightness voting."""
    ink = _locate_badge_ink(cv2, arr_rgb, search_box, exclude_boxes, w, h)
    if not ink:
        return None
    ix, iy, iw, ih = ink
    cx, cy = ix + iw / 2.0, iy + ih / 2.0

    votes = {}
    best_by_num = {}
    for shrink in _BADGE_SHRINKS:
        inner_w, inner_h = iw * shrink, ih * shrink
        ocr_box = _clip((int(cx - inner_w / 2), int(cy - inner_h / 2), int(inner_w), int(inner_h)), w, h)
        read = _ocr_region(np, cv2, arr_rgb, ocr_box, min_conf=30.0)
        if not read or not _is_corner_badge_number(read, ink, w, h):
            continue
        num = _extract_numeral_from_text(read["text"])
        if num is None:
            continue
        votes[num] = votes.get(num, 0) + 1
        if num not in best_by_num or read["conf"] > best_by_num[num]["conf"]:
            best_by_num[num] = read

    if not votes:
        return None
    best_num = max(votes.keys(), key=lambda k: (votes[k], best_by_num[k]["conf"]))
    best_read = best_by_num[best_num]
    best_read["text"] = str(best_num)
    return {"box": _clip(ink, w, h), "read": best_read}


def _ocr_region(np, cv2, arr_rgb, box, min_conf=52.0):
    """Read a single panel/badge. tesseract normalises polarity itself, so this
    picks up light-on-dark chips ("PART 2", "STRATIX", "1/10") that the
    page-level sparse pass walks straight past.

    Returns (text, confidence, per-word boxes in page coordinates).
    """
    pytesseract, Output = _tesseract()
    if pytesseract is None:
        return None

    H, W = arr_rgb.shape[:2]
    x, y, bw, bh = box
    pad = max(3, int(0.10 * min(bw, bh)))
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(W, x + bw + pad), min(H, y + bh + pad)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None

    gray = cv2.cvtColor(arr_rgb[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    s = min(6.0, max(1.0, 110.0 / float(max(8, gray.shape[0]))))
    if s > 1.01:
        gray = cv2.resize(gray, (int(gray.shape[1] * s), int(gray.shape[0] * s)),
                          interpolation=cv2.INTER_CUBIC)
    # quiet margin in the panel's own border colour - tesseract needs room
    edge = int(np.median([gray[0, :].mean(), gray[-1, :].mean(),
                          gray[:, 0].mean(), gray[:, -1].mean()]))
    m = 30
    gray = cv2.copyMakeBorder(gray, m, m, m, m, cv2.BORDER_CONSTANT, value=edge)

    # 7 = one text line, 6 = uniform block, 13 = raw line (no layout analysis).
    # Single-word mode (8) is deliberately absent: asked to find a word in an
    # arrow or a price ladder it will confidently invent one.
    for psm in ("7", "6", "13"):
        try:
            data = pytesseract.image_to_data(gray, config="--oem 3 --psm " + psm,
                                             output_type=Output.DICT)
        except Exception:
            continue
        got = []
        for i in range(len(data.get("text", []))):
            txt = (data["text"][i] or "").strip()
            if not txt:
                continue
            try:
                conf = float(data["conf"][i])
            except (TypeError, ValueError):
                continue
            if conf < min_conf or _is_junk_word(txt, conf):
                continue
            if _implausible_word_box(txt, (0, 0, int(data["width"][i] / s), int(data["height"][i] / s))):
                continue
            wx = x0 + int((data["left"][i] - m) / s)
            wy = y0 + int((data["top"][i] - m) / s)
            ww = max(1, int(data["width"][i] / s))
            wh = max(1, int(data["height"][i] / s))
            got.append({"text": txt, "conf": round(conf, 1), "box": _clip((wx, wy, ww, wh), W, H)})
        if got:
            got.sort(key=lambda g: g["box"][0])
            return {
                "text": " ".join(g["text"] for g in got),
                "conf": round(float(np.mean([g["conf"] for g in got])), 1),
                "words": got,
            }
    return None


def _line_from_words(np, members):
    members = sorted(members, key=lambda m: m["box"][0])
    box = members[0]["box"]
    for m in members[1:]:
        box = _union(box, m["box"])
    return {
        "text": " ".join(m["text"] for m in members),
        "box": box,
        "words": members,
        "conf": float(np.mean([m["conf"] for m in members])),
        # 75th percentile, not median and not max: the median under-reports
        # (x-height-only words like "order" are half the height of "Speed,")
        # while the max is hostage to one bad OCR box, which is enough to make
        # a subtitle look headline-sized and get merged into the headline.
        "height": float(np.percentile([m["box"][3] for m in members], 75)),
    }


def _same_visual_line(a, b):
    """Do two boxes sit on one printed line?

    Compares vertical centres, not overlap fractions. OCR boxes are tight to
    the glyphs, so "order" (no ascender, no descender) is barely half the
    height of "Speed," on the very same line - an overlap-fraction test
    splits them, a centre test does not. The horizontal gap keeps separate
    columns ("BID" / "ASK") apart.
    """
    ha, hb = float(a[3]), float(b[3])
    hmin = min(ha, hb)
    hmax = max(ha, hb)

    # Two boxes of wildly different height are not one printed line. Without
    # this, a single mis-read box tall enough to cover a whole region drags
    # every nearby word into its "line", and the block that results masks off
    # the part of the poster those words came from.
    if hmax > 2.4 * hmin:
        return False

    ca = a[1] + a[3] / 2.0
    cb = b[1] + b[3] / 2.0
    # Tolerance from the SMALLER box: a tall neighbour must not widen the window
    # it is allowed to capture short words through.
    if abs(ca - cb) > 0.6 * hmin:
        return False
    gap = max(a[0] - (b[0] + b[2]), b[0] - (a[0] + a[2]))
    return gap <= 1.8 * hmax


def _group_words_into_lines(np, words):
    """Words -> lines, geometrically.

    Tesseract's own block/par/line numbering is not usable here: in sparse
    mode (psm 11) it happily files a 132px headline and a 32px subtitle under
    one line id, which merges them into a single nonsense string.
    """
    if not words:
        return []

    ordered = sorted(words, key=lambda wd: (wd["box"][1], wd["box"][0]))
    runs = []
    for wd in ordered:
        for run in runs:
            if _same_visual_line(run["box"], wd["box"]):
                run["words"].append(wd)
                run["box"] = _union(run["box"], wd["box"])
                break
        else:
            runs.append({"words": [wd], "box": wd["box"]})

    lines = [_line_from_words(np, r["words"]) for r in runs]
    lines.sort(key=lambda l: (l["box"][1], l["box"][0]))
    return lines


def _group_lines_into_blocks(np, lines):
    """Lines -> blocks. Stacked lines of a similar size that share horizontal
    range become one block, so a 3-line headline is one movable element with
    one readable string ("Exploiting Market Structure")."""
    blocks = []
    for ln in lines:
        placed = False
        for blk in blocks:
            last = blk["lines"][-1]
            lb, cb = last["box"], ln["box"]
            vgap = cb[1] - (lb[1] + lb[3])
            # Measure the gap against the SMALLER type size. 59px of air is
            # normal leading under a 132px headline but a clear paragraph
            # break above a 32px subtitle - and it is the subtitle that
            # decides whether the two belong together.
            if vgap < -0.5 * lb[3] or vgap > 0.85 * min(last["height"], ln["height"]):
                continue
            hs = max(lb[0], cb[0])
            he = min(lb[0] + lb[2], cb[0] + cb[2])
            if he - hs < 0.30 * min(lb[2], cb[2]):
                continue
            ratio = max(last["height"], ln["height"]) / max(1.0, min(last["height"], ln["height"]))
            if ratio > 1.55:
                continue
            blk["lines"].append(ln)
            blk["box"] = _union(blk["box"], cb)
            placed = True
            break
        if not placed:
            blocks.append({"lines": [ln], "box": ln["box"]})

    out = []
    for blk in blocks:
        ls = blk["lines"]
        out.append({
            "box": blk["box"],
            "lines": ls,
            "text": " ".join(l["text"] for l in ls),
            "conf": round(float(np.mean([l["conf"] for l in ls])), 1),
            "fontPx": float(np.median([l["height"] for l in ls])),
        })
    return out


def _merge_blocks(np, blocks):
    """Fold several text blocks into one (used when a badge wraps them)."""
    lines = []
    for b in blocks:
        lines.extend(b["lines"])
    lines.sort(key=lambda l: (l["box"][1], l["box"][0]))
    box = lines[0]["box"]
    for l in lines[1:]:
        box = _union(box, l["box"])
    return {
        "box": box,
        "lines": lines,
        "text": " ".join(l["text"] for l in lines),
        "conf": round(float(np.mean([l["conf"] for l in lines])), 1),
        "fontPx": float(np.median([l["height"] for l in lines])),
    }


def _block_from_region(np, read, box):
    """Turn a single-panel OCR read into a normal text block."""
    wb = read["words"][0]["box"]
    for wd in read["words"][1:]:
        wb = _union(wb, wd["box"])
    height = float(np.median([wd["box"][3] for wd in read["words"]]))
    line = {"text": read["text"], "box": wb, "words": read["words"],
            "conf": read["conf"], "height": height}
    return {"box": box, "lines": [line], "text": read["text"],
            "conf": read["conf"], "fontPx": height}


def _text_align(block):
    """left / center / right, from how the lines sit inside the block."""
    ls = block["lines"]
    if len(ls) < 2:
        return "left"
    bx = block["box"]
    tol = max(2.0, 0.04 * bx[2])
    lefts = [l["box"][0] for l in ls]
    rights = [l["box"][0] + l["box"][2] for l in ls]
    centers = [l["box"][0] + l["box"][2] / 2.0 for l in ls]
    if max(centers) - min(centers) <= tol:
        return "center"
    if max(lefts) - min(lefts) <= tol:
        return "left"
    if max(rights) - min(rights) <= tol:
        return "right"
    return "left"


def _text_role(font_px, max_font_px, font_rel, rel_y, text, line_count, has_bg):
    """Name the role by how this text ranks against the biggest text on the
    page, not by absolute pixels - the same poster exported at two sizes then
    labels its elements identically."""
    ratio = font_px / max(1.0, max_font_px)
    letters = [c for c in text if c.isalpha()]
    all_caps = bool(letters) and all(c.isupper() for c in letters)
    short = len(text) <= 26

    # A chip/badge is drawn to be read, so its own glyph can be as tall as a
    # headline's - checked before the size ladder below, or a big bold page
    # number inside its circle (or "PART 2", "STRATIX") gets graded on type
    # size like it was competing to be the headline and comes out "heading"
    # instead of the badge it visibly is.
    if has_bg and short:
        return "footer-badge" if rel_y > 0.86 else "badge"
    if ratio >= 0.72 and font_rel >= 0.045:
        return "title"
    if ratio >= 0.42 or font_rel >= 0.034:
        return "heading"
    if all_caps and short:
        if rel_y < 0.22:
            return "eyebrow"
        return "footer" if rel_y > 0.86 else "tag"
    if rel_y > 0.86:
        return "footer"
    if ratio >= 0.20 or font_rel >= 0.020:
        return "subtitle" if line_count <= 3 else "body"
    return "body" if line_count >= 3 else "caption"


def _position_label(rel_cx, rel_cy):
    row = "top" if rel_cy < 0.33 else ("middle" if rel_cy < 0.70 else "bottom")
    col = "left" if rel_cx < 0.33 else ("center" if rel_cx < 0.67 else "right")
    return "{}-{}".format(row, col)


def _graphic_role(rel_y, aspect, rel_area):
    if aspect >= 2.6:
        return "banner"
    if 0.65 <= aspect <= 1.5 and rel_area < 0.03:
        return "icon"
    if rel_y > 0.72:
        return "footer-graphic"
    if rel_y < 0.16:
        return "header-graphic"
    return "graphic"


def _slug(text, fallback):
    keep = [c.lower() if c.isalnum() else "_" for c in text]
    s = "".join(keep)
    while "__" in s:
        s = s.replace("__", "_")
    s = s.strip("_")[:48]
    return s or fallback


# --------------------------------------------------------------------------
# graphic (non-text) element detection
# --------------------------------------------------------------------------

def _background_estimate(np, cv2, arr_rgb):
    """A model of the page behind everything, fitted globally and robustly.

    Posters have one background: a flat fill or a smooth wash across the whole
    canvas. So it is fitted as a single quadratic surface per channel, by least
    squares over pixels that currently look like background, re-selected a few
    times so that drawn objects - which are outliers, however large - fall out
    of the fit instead of bending it.

    Doing this *globally* is the whole point. Any local estimator (a blur, a
    block median) absorbs an object bigger than its own window, and then the
    object silently stops existing: a 200px circle vanished into a 24x-
    downsampled background and was never detected at all.
    """
    h, w = arr_rgb.shape[:2]

    # Fit on a subsampled grid - a quadratic has six coefficients and does not
    # need a million samples to pin them down.
    step = max(1, int(min(w, h) / 220))
    ys = np.arange(0, h, step)
    xs = np.arange(0, w, step)
    grid = arr_rgb[np.ix_(ys, xs)].astype(np.float32)
    gh, gw = grid.shape[:2]

    yy, xx = np.meshgrid(ys.astype(np.float32) / h, xs.astype(np.float32) / w, indexing="ij")
    basis = np.stack([np.ones_like(xx), xx, yy, xx * xx, yy * yy, xx * yy], axis=-1).reshape(-1, 6)
    flat = grid.reshape(-1, 3)

    # Seed from the border ring: whatever else a poster does, its outer frame is
    # nearly always page.
    border = np.concatenate([grid[0, :, :], grid[-1, :, :], grid[:, 0, :], grid[:, -1, :]], axis=0)
    seed = _modal_color(np, border.astype(np.uint8))
    if seed is None:
        seed = np.array([245, 245, 245], dtype=np.uint8)
    inliers = np.abs(flat - seed.astype(np.float32)).max(axis=1) < 48.0
    if inliers.sum() < 24:
        inliers = np.ones(len(flat), dtype=bool)

    coef = None
    for _ in range(3):
        try:
            coef, _res, _rank, _sv = np.linalg.lstsq(basis[inliers], flat[inliers], rcond=None)
        except np.linalg.LinAlgError:
            break
        resid = np.abs(flat - basis @ coef).max(axis=1)
        # Keep the well-explained majority; the threshold adapts so a busy page
        # does not throw away its own background.
        thr = max(12.0, float(np.percentile(resid, 60)) * 1.5)
        nxt = resid < thr
        if nxt.sum() < 24:
            break
        inliers = nxt

    if coef is None:
        return np.repeat(np.repeat(seed.reshape(1, 1, 3), h, axis=0), w, axis=1).astype(np.uint8)

    fitted = np.clip(basis @ coef, 0, 255).reshape(gh, gw, 3).astype(np.uint8)
    return cv2.resize(fitted, (w, h), interpolation=cv2.INTER_LINEAR)


def _foreground_mask(np, cv2, arr_rgb, text_mask):
    """Everything that is not page background, minus everything OCR claimed."""
    h, w = arr_rgb.shape[:2]

    bg = _background_estimate(np, cv2, arr_rgb)
    dist = np.abs(arr_rgb.astype(np.int16) - bg.astype(np.int16)).max(axis=2).astype(np.uint8)

    # Otsu picks the split between "page" and "ink" for this particular poster,
    # so a low-contrast pastel deck and a high-contrast dark one both work. The
    # floor stops a perfectly flat poster from thresholding on sensor noise.
    # Otsu splits "page" from "ink" for this poster; taking well under it keeps
    # low-contrast furniture - hairline rules, tinted panels, pale dividers -
    # which sit far closer to the page than the headline does and were being
    # thresholded away with it. Speckle from going this low is removed by the
    # opening and the minimum-area filter below.
    otsu, _ = cv2.threshold(dist, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    level = max(FOREGROUND_MIN_DIST, min(otsu * 0.5, 34.0))
    mask = (dist >= level).astype(np.uint8) * 255

    if text_mask is not None:
        pad = max(3, int(0.008 * min(w, h)))
        grown = cv2.dilate(text_mask, np.ones((pad, pad), np.uint8))
        mask[grown > 0] = 0

    # A full-bleed photograph or a heavy texture is not a surface any quadratic
    # can fit, so the residual lights up everywhere and "foreground" stops
    # meaning anything. Fall back to edges, which is the right tool for a page
    # that has no page colour.
    if float((mask > 0).sum()) / float(w * h) > 0.72:
        gray = cv2.cvtColor(arr_rgb, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 40, 130)
        if text_mask is not None:
            pad = max(3, int(0.008 * min(w, h)))
            edges[cv2.dilate(text_mask, np.ones((pad, pad), np.uint8)) > 0] = 0
        mask = edges

    # Close gaps inside one object (an outline icon, a dashed rule, the gap
    # between a chart's bars) without welding neighbouring objects together.
    k = max(3, int(OBJECT_CLOSE_FRAC * min(w, h)))
    if k % 2 == 0:
        k += 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    # Drop single-pixel speckle that survived the threshold.
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return mask


def _dominant_color(np, arr_rgb, mask, box):
    x, y, bw, bh = box
    patch = arr_rgb[y:y + bh, x:x + bw].reshape(-1, 3)
    sub = mask[y:y + bh, x:x + bw].reshape(-1) > 0
    px = patch[sub] if sub.any() else patch
    col = _modal_color(np, px)
    return col if col is not None else np.array([128, 128, 128], dtype=np.uint8)


def _merge_fragments(np, items, w, h):
    """Fold neighbouring fragments of one object back together.

    An illustration is not one connected component: it is a stack of strokes,
    highlights and shadows that morphology alone will not join without also
    welding it to whatever sits beside it. Distance plus colour agreement is the
    honest test - close AND similar means one object, close but differently
    coloured means two.
    """
    gap = max(4.0, MERGE_GAP_FRAC * min(w, h))
    changed = True
    while changed and len(items) > 1:
        changed = False
        for i in range(len(items)):
            if items[i] is None:
                continue
            for j in range(i + 1, len(items)):
                if items[j] is None:
                    continue
                a, b = items[i], items[j]
                ax, ay, aw, ah = a["box"]
                bx, by, bw_, bh_ = b["box"]
                dx = max(0, max(ax - (bx + bw_), bx - (ax + aw)))
                dy = max(0, max(ay - (by + bh_), by - (ay + ah)))
                if dx > gap or dy > gap:
                    continue
                colour_delta = float(np.abs(a["color"].astype(np.int16) - b["color"].astype(np.int16)).max())
                # Interleaved boxes are one object whatever their colours say -
                # that is a highlight sitting on a shape, or the speckle of a
                # photograph, not two separate things anyone would animate
                # apart. Colour only arbitrates between neighbours that merely
                # sit near each other.
                overlapping = _inter(a["box"], b["box"]) > 0
                if colour_delta > MERGE_COLOR_DIST and not overlapping:
                    continue
                merged = _union(a["box"], b["box"])
                # Never let merging manufacture a box that swallows the page.
                if merged[2] > 0.96 * w or merged[3] > 0.96 * h:
                    continue
                a["box"] = merged
                a["pixels"] += b["pixels"]
                items[j] = None
                changed = True
    return [it for it in items if it is not None]


def _merge_clusters(np, items, w, h):
    """Collapse a dense cluster of fragments into the one object it depicts.

    Colour agreement reassembles a single drawn shape, but it will not
    reassemble a bar chart (five bars, deliberately different colours) or a
    photograph (hundreds of unrelated colours). Those are still one thing to
    anyone watching, and one thing is what should animate: a chart that wipes on
    reads as a chart, whereas five bars arriving separately reads as a bug.

    So proximity alone merges, but only where fragments genuinely swarm - three
    or more within a short reach. Two isolated objects that happen to sit near
    each other are left alone.
    """
    reach = max(6.0, CLUSTER_GAP_FRAC * min(w, h))

    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            ax, ay, aw, ah = items[i]["box"]
            bx, by, bw_, bh_ = items[j]["box"]
            dx = max(0, max(ax - (bx + bw_), bx - (ax + aw)))
            dy = max(0, max(ay - (by + bh_), by - (ay + ah)))
            if dx <= reach and dy <= reach:
                union(i, j)

    groups = {}
    for i in range(len(items)):
        groups.setdefault(find(i), []).append(i)

    out = []
    for members in groups.values():
        if len(members) < CLUSTER_MIN_MEMBERS:
            out.extend(items[i] for i in members)
            continue
        box = items[members[0]]["box"]
        pixels = 0
        for i in members:
            box = _union(box, items[i]["box"])
            pixels += items[i]["pixels"]
        if box[2] > 0.96 * w or box[3] > 0.96 * h:
            out.extend(items[i] for i in members)
            continue
        out.append({"box": _clip(box, w, h), "pixels": pixels, "color": items[members[0]]["color"]})
    return out


def _classify_object(np, cv2, arr_rgb, mask, item, w, h):
    """Name the object from what it measurably is.

    Every field here is also emitted on the layer, because the animator reads
    them: a chart earns a wipe, an icon earns a pop, a full-bleed photograph
    earns a slow blur rather than either.
    """
    x, y, bw, bh = item["box"]
    sub = mask[y:y + bh, x:x + bw]
    patch = arr_rgb[y:y + bh, x:x + bw]
    area = float(max(1, bw * bh))
    total = float(w * h)

    fill = float((sub > 0).sum()) / area
    aspect = bw / float(max(1, bh))
    rel_area = area / total
    rel_y = y / float(h)

    # Shape descriptors from the largest contour in the component.
    circularity = 0.0
    solidity = 0.0
    contours, _ = cv2.findContours((sub > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        c = max(contours, key=cv2.contourArea)
        c_area = float(cv2.contourArea(c))
        perim = float(cv2.arcLength(c, True))
        if perim > 0:
            circularity = min(1.0, 4.0 * np.pi * c_area / (perim * perim))
        hull = cv2.convexHull(c)
        hull_area = float(cv2.contourArea(hull))
        if hull_area > 0:
            solidity = min(1.0, c_area / hull_area)

    # How many colours the object actually uses, at 5-bit precision. A flat icon
    # uses a handful; a photograph uses hundreds.
    q = (patch.astype(np.uint16) >> 3)
    keys = (q[:, :, 0].astype(np.uint32) << 10) | (q[:, :, 1].astype(np.uint32) << 5) | q[:, :, 2].astype(np.uint32)
    inside = keys[sub > 0] if (sub > 0).any() else keys.reshape(-1)
    color_count = int(np.unique(inside).size)

    gray = cv2.cvtColor(patch, cv2.COLOR_RGB2GRAY)
    edge_density = float((cv2.Canny(gray, 50, 150) > 0).sum()) / area

    thin = min(bw, bh) <= max(3.0, 0.012 * min(w, h))
    kind = "graphic"
    if thin and max(bw, bh) >= 0.18 * max(w, h):
        kind = "divider"
    elif circularity >= 0.78 and 0.7 <= aspect <= 1.4:
        kind = "circle"
    elif color_count >= PHOTO_COLOR_COUNT and edge_density >= 0.06 and fill >= 0.75:
        kind = "photo"
    elif fill >= 0.90 and solidity >= 0.95 and color_count <= 40 and rel_area >= 0.02:
        kind = "panel"
    elif aspect >= 2.6 or (aspect <= 0.38 and bh > bw):
        kind = "banner"
    elif rel_area <= 0.022 and color_count <= 60:
        kind = "icon"
    elif edge_density >= 0.10 and color_count >= 24:
        kind = "chart"
    elif color_count >= 24:
        kind = "illustration"

    # The role vocabulary the animator and the manifest binder already speak.
    if kind == "divider":
        role = "banner"
    elif kind == "icon":
        role = "icon"
    elif kind == "banner":
        role = "banner"
    elif rel_y > 0.72:
        role = "footer-graphic"
    elif rel_y < 0.16:
        role = "header-graphic"
    else:
        role = "graphic"

    return {
        "objectType": kind,
        "role": role,
        "fillRatio": round(fill, 4),
        "circularity": round(circularity, 4),
        "solidity": round(solidity, 4),
        "colorCount": color_count,
        "edgeDensity": round(edge_density, 4),
    }


def _detect_objects(np, cv2, arr_rgb, text_mask):
    """Discrete drawn objects on the page, classified.

    Returns dicts of {box, objectType, role, ...} rather than bare boxes: the
    measurements are made here, where the mask is in hand, and travel with the
    layer so nothing downstream has to re-derive them from pixels it no longer
    has.
    """
    h, w = arr_rgb.shape[:2]
    total = float(w * h)

    mask = _foreground_mask(np, cv2, arr_rgb, text_mask)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    items = []
    for i in range(1, count):
        x = int(stats[i, cv2.CC_STAT_LEFT])
        y = int(stats[i, cv2.CC_STAT_TOP])
        bw = int(stats[i, cv2.CC_STAT_WIDTH])
        bh = int(stats[i, cv2.CC_STAT_HEIGHT])
        pixels = int(stats[i, cv2.CC_STAT_AREA])
        if pixels < MIN_OBJECT_PIXELS_FRAC * total:
            continue
        if bw < 6 or bh < 6:
            continue
        # A component covering nearly the whole page is the background the
        # estimate failed to model, not an object anyone wants to animate.
        if bw > 0.96 * w and bh > 0.96 * h:
            continue
        box = _clip((x, y, bw, bh), w, h)
        items.append({"box": box, "pixels": pixels, "color": _dominant_color(np, arr_rgb, mask, box)})

    if not items:
        return []

    items = _merge_fragments(np, items, w, h)
    items = _merge_clusters(np, items, w, h)

    out = []
    for it in items:
        box = it["box"]
        if _area(box) > 0.55 * total:
            continue
        if _area(box) < 0.0006 * total:
            continue
        meta = _classify_object(np, cv2, arr_rgb, mask, it, w, h)
        # A box that is mostly empty is a bounding box around scattered noise,
        # not an object - except for dividers and outline art, which are
        # legitimately sparse.
        if meta["fillRatio"] < 0.10 and meta["objectType"] not in ("divider", "illustration", "chart"):
            continue
        entry = {"box": box}
        entry.update(meta)
        out.append(entry)

    # Biggest first, so the layer cap spends itself on the objects that carry
    # the page rather than on decoration.
    out.sort(key=lambda it: -_area(it["box"]))
    return out[:MAX_OBJECTS]


# --------------------------------------------------------------------------
# collage layout detection
#
# A poster built from the collage-architecture design system tiles the canvas
# into 1-4 caption-labelled parts instead of one flat illustration. When that
# specific layout is confidently recognised, process_image() takes each part
# whole - the opposite of the element-by-element decomposition above, and
# deliberately so: a collage part is one atomic block to the animator, never
# shredded into its own text/graphic sub-elements. Everything below is used
# only to find the divider lines and turn them into part boxes; any ambiguity
# returns None and the ordinary decomposition above runs completely unchanged.
# --------------------------------------------------------------------------

def _cluster_positions(vals, tol=0.03):
    """Collapses near-duplicate divider positions - tier 1 (a classified
    divider object) and tier 2 (the pixel-band probe) agreeing on the same
    line - into one."""
    vals = sorted(vals)
    clusters = []
    for v in vals:
        if clusters and v - clusters[-1][-1] <= tol:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [sum(c) / len(c) for c in clusters]


def _find_divider_bands(cv2, mask, axis, w, h):
    """Rows (axis="h") or columns (axis="v") that read as a divider: a thin,
    near-full-span band of foreground, found by closing gaps ALONG the band's
    own direction first - bridging a sketchy hand-drawn stroke the isotropic
    object-level close (OBJECT_CLOSE_FRAC) is not shaped to reach - then
    measuring coverage directly. This exists because _detect_objects' own
    bw<6/bh<6 floor (tuned for icons) drops a hairline pencil divider before
    it ever becomes an object at all.

    Returns candidate centres as a fraction 0-1 along the checked axis.
    """
    H, W = mask.shape[:2]
    if axis == "h":
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, int(0.05 * W)), 3))
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
        margin = int(0.04 * W)
        coverage = (closed[:, margin: W - margin] > 0).mean(axis=1)
        length, short_edge = H, min(W, H)
    else:
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, max(15, int(0.05 * H))))
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
        margin = int(0.04 * H)
        coverage = (closed[margin: H - margin, :] > 0).mean(axis=0)
        length, short_edge = W, min(W, H)

    lo = int(0.08 * length)
    hi = length - lo
    candidates = []
    i = lo
    lo = int(0.08 * length)
    hi = length - lo
    candidates = []
    i = lo
    while i < hi:
        if coverage[i] >= 0.58:
            j = i
            while j < hi and coverage[j] >= 0.58:
                j += 1
            thickness = j - i
            if thickness <= max(3, COLLAGE_DIVIDER_MAX_THICKNESS_FRAC * short_edge):
                candidates.append((i + j) / 2.0 / float(length))
            i = j
        else:
            i += 1
    return candidates


def _blocks_in_reading_order(blocks):
    """Joins OCR blocks into one string in reading order."""
    remaining = sorted(blocks, key=lambda b: b["box"][1])
    rows = []
    for b in remaining:
        by, bh = b["box"][1], b["box"][3]
        bc = by + bh / 2.0
        placed = False
        for row in rows:
            rc = row["y"] + row["h"] / 2.0
            if abs(bc - rc) <= 0.6 * min(bh, row["h"]):
                row["items"].append(b)
                row["y"] = min(row["y"], by)
                row["h"] = max(row["h"], bh)
                placed = True
                break
        if not placed:
            rows.append({"y": by, "h": bh, "items": [b]})
    rows.sort(key=lambda r: r["y"])
    out = []
    for row in rows:
        row["items"].sort(key=lambda b: b["box"][0])
        out.extend(b["text"] for b in row["items"])
    return " ".join(out)


def _detect_collage_layout(np, cv2, arr, text_mask, graphic_items, w, h):
    """Detects 1, 2, 3 or 4 collage partition zones from divider rules, major image regions,
    or color/luminance projection boundaries. Always returns a list of 1-4 fractional
    (x, y, w, h) zone boxes in reading order.
    """
    mask = _foreground_mask(np, cv2, arr, text_mask) if cv2 is not None else None

    # Tier 1 & 2: Divider lines (horizontal and vertical)
    obj_h, obj_v = [], []
    for d in graphic_items:
        if d.get("objectType") != "divider":
            continue
        x, y, bw, bh = d["box"]
        if bw >= COLLAGE_DIVIDER_SPAN_FRAC * w and bw >= bh * 2.5:
            obj_h.append((y + bh / 2.0) / float(h))
        elif bh >= COLLAGE_DIVIDER_SPAN_FRAC * h and bh >= bw * 2.5:
            obj_v.append((x + bw / 2.0) / float(w))

    if not obj_h and mask is not None:
        obj_h = _find_divider_bands(cv2, mask, "h", w, h)
    if not obj_v and mask is not None:
        obj_v = _find_divider_bands(cv2, mask, "v", w, h)

    h_pos = [p for p in _cluster_positions(obj_h, tol=0.04) if 0.15 <= p <= 0.85]
    v_pos = [p for p in _cluster_positions(obj_v, tol=0.04) if 0.15 <= p <= 0.85]

    # Tier 3: Major graphic/photo box clustering if no explicit divider rules found
    if not h_pos and not v_pos:
        major_boxes = [g["box"] for g in graphic_items if _area(g["box"]) >= 0.04 * w * h]
        if len(major_boxes) >= 2:
            centers_y = sorted([(b[1] + b[3] / 2.0) / float(h) for b in major_boxes])
            centers_x = sorted([(b[0] + b[2] / 2.0) / float(w) for b in major_boxes])

            y_gaps = []
            for idx in range(len(centers_y) - 1):
                y_gaps.append((centers_y[idx+1] - centers_y[idx], (centers_y[idx] + centers_y[idx+1]) / 2.0))
            y_gaps.sort(reverse=True, key=lambda g: g[0])

            x_gaps = []
            for idx in range(len(centers_x) - 1):
                x_gaps.append((centers_x[idx+1] - centers_x[idx], (centers_x[idx] + centers_x[idx+1]) / 2.0))
            x_gaps.sort(reverse=True, key=lambda g: g[0])

            if y_gaps and y_gaps[0][0] >= 0.12 and 0.20 <= y_gaps[0][1] <= 0.80:
                h_pos.append(y_gaps[0][1])
            if x_gaps and x_gaps[0][0] >= 0.12 and 0.20 <= x_gaps[0][1] <= 0.80:
                v_pos.append(x_gaps[0][1])

    # Tier 4: Color/Luminance projection gradient fallback if still no dividers
    if not h_pos and not v_pos and arr is not None and cv2 is not None:
        try:
            gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
            row_var = np.var(gray, axis=1)
            row_grad = np.abs(np.diff(row_var))
            H_arr = gray.shape[0]
            lo, hi = int(0.25 * H_arr), int(0.75 * H_arr)
            if hi > lo:
                sub_grad = row_grad[lo:hi]
                if len(sub_grad) > 0 and np.max(sub_grad) > 1.8 * (np.mean(sub_grad) + 1e-5):
                    best_idx = lo + int(np.argmax(sub_grad))
                    candidate_y = best_idx / float(H_arr)
                    if 0.28 <= candidate_y <= 0.72:
                        h_pos.append(candidate_y)
        except Exception:
            pass

    # Construct 1 to 4 clean partition layout
    # 4 parts: 2x2 grid
    if len(h_pos) >= 1 and len(v_pos) >= 1:
        y0, x0 = h_pos[0], v_pos[0]
        return [
            (0.0, 0.0, x0, y0),
            (x0, 0.0, 1.0 - x0, y0),
            (0.0, y0, x0, 1.0 - y0),
            (x0, y0, 1.0 - x0, 1.0 - y0),
        ]

    # 3 parts: 3 horizontal rows
    if len(h_pos) >= 2:
        h_sorted = sorted(h_pos)[:2]
        a, b = h_sorted[0], h_sorted[1]
        return [
            (0.0, 0.0, 1.0, a),
            (0.0, a, 1.0, b - a),
            (0.0, b, 1.0, 1.0 - b),
        ]

    # 3 parts: 3 vertical columns
    if len(v_pos) >= 2:
        v_sorted = sorted(v_pos)[:2]
        a, b = v_sorted[0], v_sorted[1]
        return [
            (0.0, 0.0, a, 1.0),
            (a, 0.0, b - a, 1.0),
            (b, 0.0, 1.0 - b, 1.0),
        ]

    # 2 parts: 1 horizontal split (top / bottom)
    if len(h_pos) == 1:
        y0 = h_pos[0]
        return [
            (0.0, 0.0, 1.0, y0),
            (0.0, y0, 1.0, 1.0 - y0),
        ]

    # 2 parts: 1 vertical split (left / right)
    if len(v_pos) == 1:
        x0 = v_pos[0]
        return [
            (0.0, 0.0, x0, 1.0),
            (x0, 0.0, 1.0 - x0, 1.0),
        ]

    # 1 part: single full canvas zone
    return [(0.0, 0.0, 1.0, 1.0)]


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def process_image(input_bytes):
    try:
        import numpy as np
        from PIL import Image
    except ImportError as e:
        return {"error": "Missing python dependencies: {}".format(e)}

    try:
        import cv2
    except ImportError:
        cv2 = None

    try:
        Image.MAX_IMAGE_PIXELS = None
        img_pil = Image.open(io.BytesIO(input_bytes))
        img_pil = img_pil.convert("RGB")
    except Exception as e:
        return {"error": "Failed to decode image: {}".format(e)}

    src_w, src_h = img_pil.size

    if cv2 is None:
        url = _background_data_url(np.array(img_pil))
        return {
            "success": True, "width": src_w, "height": src_h,
            "backgroundUrl": url, "originalUrl": url, "layers": [],
            "text": {"fullText": "", "blocks": []},
            "meta": {"ocr": "unavailable", "note": "opencv not installed - no decomposition"},
        }

    # Single downscale (if any) - background and cut-outs both come from this
    # exact buffer, so they can never disagree.
    long_edge = max(src_w, src_h)
    if long_edge > MAX_PROCESS_DIM:
        s = MAX_PROCESS_DIM / float(long_edge)
        proc = img_pil.resize((max(1, int(src_w * s)), max(1, int(src_h * s))), Image.Resampling.LANCZOS)
    else:
        proc = img_pil
    arr = np.array(proc)                     # RGB, uint8, this is the truth
    H, W = arr.shape[:2]
    total = float(W * H)

    # Erase a Grok Imagine watermark before anything else touches `arr` -
    # the background, originalUrl and every layer crop below all derive from
    # this exact buffer, so cleaning it here is what keeps the mark out of
    # all three at once instead of chasing it back out of the OCR/object
    # passes individually. Bottom footer band only; the design system's own
    # slide-number badge lives in a fixed spot top-right (see the corner
    # search near the end of this function) and this pass never goes near it.
    watermark_box = strip_grok_watermark(np, cv2, arr, _ocr_region)

    # ---- text -------------------------------------------------------------
    words, ocr_engine = _ocr_words(np, cv2, arr)
    lines = _group_words_into_lines(np, words)
    blocks = _group_lines_into_blocks(np, lines)

    text_mask = np.zeros((H, W), np.uint8)
    for b in blocks:
        x, y, bw, bh = _clip(b["box"], W, H)
        text_mask[y:y + bh, x:x + bw] = 255

    text_items = []
    for b in blocks:
        pad = max(2, int(0.10 * b["fontPx"]))
        box = _clip((b["box"][0] - pad, b["box"][1] - pad,
                     b["box"][2] + 2 * pad, b["box"][3] + 2 * pad), W, H)
        text_items.append({"box": box, "kind": "text", "block": b, "hasBackground": False})
    text_items = _resolve_overlaps(text_items)

    # ---- objects ----------------------------------------------------------
    detected = _detect_objects(np, cv2, arr, text_mask)
    graphic_items = _resolve_overlaps(
        [
            {
                "box": _clip(d["box"], W, H),
                "kind": "graphic",
                "objectType": d["objectType"],
                "objectRole": d["role"],
                "fillRatio": d["fillRatio"],
                "circularity": d["circularity"],
                "solidity": d["solidity"],
                "colorCount": d["colorCount"],
                "edgeDensity": d["edgeDensity"],
            }
            for d in detected
        ]
    )

    # ---- collage layout (optional) -----------------------------------------
    # When the collage-architecture layout is confidently recognised, each
    # part becomes ONE atomic layer below and the ordinary per-element
    # reconcile/decompose pass that follows is left with nothing to do (its
    # inputs are emptied here), rather than being restructured to skip it.
    collage_regions = _detect_collage_layout(np, cv2, arr, text_mask, graphic_items, W, H)
    collage_parts = []
    if collage_regions:
        for i, (rx, ry, rw, rh) in enumerate(collage_regions):
            box = _clip((int(round(rx * W)), int(round(ry * H)), int(round(rw * W)), int(round(rh * H))), W, H)
            bx, by, bbw, bbh = box
            # Reuse the page-level OCR blocks already found above, rather than
            # a fresh region read - a part is mostly illustration with one
            # caption line, and the multi-pass page OCR that produced `blocks`
            # is far more reliable on that than a single tight region read.
            inside_blocks = [
                b for b in blocks
                if bx <= b["box"][0] + b["box"][2] / 2.0 <= bx + bbw
                and by <= b["box"][1] + b["box"][3] / 2.0 <= by + bbh
            ]
            caption = _blocks_in_reading_order(inside_blocks).strip()
            collage_parts.append({
                "box": box,
                "kind": "graphic",
                "objectType": "collage-part",
                "objectRole": "collage-part",
                "hasBackground": True,
                "collagePartIndex": i,
                "collageCaption": caption,
            })
        # The parts tile the whole canvas now - nothing is left over for the
        # ordinary per-element pass below to find.
        text_items = []
        graphic_items = []

    # ---- reconcile text and graphics -------------------------------------
    # Resolving these two sets against each other by area alone is what used to
    # lose badges: the pill around "PART 2" is bigger than the words, so the
    # words vanished into an anonymous rectangle. Instead a panel that wraps
    # text becomes one labelled element, and a panel with no known text is
    # read directly before it is written off as a graphic.
    final_graphics = []
    region_reads = 0
    for g in graphic_items:
        inside = [t for t in text_items if _contained(t["box"], g["box"], 0.72)]
        if inside:
            tu = inside[0]["box"]
            for t in inside[1:]:
                tu = _union(tu, t["box"])
            if _area(g["box"]) <= 4.0 * _area(tu):
                host = max(inside, key=lambda t: _area(t["box"]))
                host["box"] = _clip(_union(host["box"], g["box"]), W, H)
                host["hasBackground"] = True
                for t in inside:
                    if t is not host:
                        host["block"] = _merge_blocks(np, [host["block"], t["block"]])
                        t["dropped"] = True
            else:
                final_graphics.append(g)          # a card; its text rides on top
            continue

        if any(_inter(g["box"], t["box"]) > 0.5 * _area(g["box"]) for t in text_items):
            continue                               # overlaps text - text wins

        if _area(g["box"]) >= 0.0015 * total and region_reads < 16:
            region_reads += 1
            ocr_box = g["box"]
            # A ring sits close enough to a numeral drawn inside it that
            # tesseract reads the two together as one glyph ("3" inside a
            # circle comes back as garbage like "ro}") - cropping to the
            # circle's own interior, clear of its stroke, is what actually
            # lets a slide-number badge be read at all.
            if g.get("objectType") == "circle":
                bx, by, bbw, bbh = ocr_box
                icx, icy = bx + bbw / 2.0, by + bbh / 2.0
                iw, ih = bbw * 0.5, bbh * 0.5
                ocr_box = _clip((int(icx - iw / 2), int(icy - ih / 2), int(iw), int(ih)), W, H)
            read = _ocr_region(np, cv2, arr, ocr_box)
            if read and (_accept_region_text(read) or _is_corner_badge_number(read, g["box"], W, H)):
                text_items.append({
                    "box": g["box"],
                    "kind": "text",
                    "block": _block_from_region(np, read, g["box"]),
                    "hasBackground": True,
                })
                continue
        final_graphics.append(g)

    # graphic_items was emptied above when a collage layout was found, so the
    # loop just above never ran and final_graphics is still [] here - this is
    # where the whole parts actually enter the pipeline.
    final_graphics.extend(collage_parts)

    def _is_watermark_item(item, w_box, W, H):
        # A collage part is never itself a watermark - it is a whole design
        # region, orders of magnitude bigger than one. The "intersects w_box"
        # check below is sized for a small candidate roughly the watermark's
        # own footprint; against a part spanning half the canvas, a watermark
        # sitting anywhere inside it reads as "100% of w_box overlaps" and the
        # whole part would otherwise be dropped. Any actual watermark pixels
        # inside the part were already cleaned in `arr` by strip_grok_watermark
        # before OCR ever ran, so there is nothing left here to catch.
        if item.get("objectType") == "collage-part":
            return False
        box = item.get("box")
        if not box:
            return False
        x, y, bw, bh = box
        cx, cy = x + bw / 2.0, y + bh / 2.0

        # 1. Text block matches Grok or watermark vocabulary
        if item.get("kind") == "text" and item.get("block"):
            txt = item["block"].get("text", "")
            if _looks_like_grok(txt) or "watermark" in txt.lower():
                return True

        # 2. Intersects with the detected watermark_box
        if w_box:
            wx, wy, ww, wh = w_box
            inter_x0 = max(x, wx)
            inter_y0 = max(y, wy)
            inter_x1 = min(x + bw, wx + ww)
            inter_y1 = min(y + bh, wy + wh)
            if inter_x1 > inter_x0 and inter_y1 > inter_y0:
                inter_area = (inter_x1 - inter_x0) * (inter_y1 - inter_y0)
                if inter_area > 0.05 * (bw * bh) or inter_area > 0.05 * (ww * wh):
                    return True

        # 3. Positioned in bottom footer watermark zone (y > 68% H, bottom-left or bottom-right)
        if cy > 0.68 * H and (cx < 0.40 * W or cx > 0.60 * W):
            if bw < 0.35 * W and bh < 0.12 * H:
                if item.get("kind") == "text":
                    txt = item["block"].get("text", "")
                    if _looks_like_grok(txt) or not txt.strip() or len(txt) <= 6:
                        return True
                elif item.get("kind") == "graphic":
                    if w_box and (abs(y - w_box[1]) < 0.15 * H and abs(x - w_box[0]) < 0.25 * W):
                        return True
        return False

    text_items = [t for t in text_items if not t.get("dropped") and not _is_watermark_item(t, watermark_box, W, H)]
    final_graphics = [g for g in final_graphics
                      if not any(_contained(g["box"], t["box"]) for t in text_items) and not _is_watermark_item(g, watermark_box, W, H)]

    # One more look at the fixed corner the slide-number badge always lives
    # in. _read_badge_at reads a badge far more reliably than the generic
    # per-object pass above, which can settle for a noisier read ("a3)"
    # instead of "13") or miss the badge entirely when its ring fragments too
    # small to become an object at all (see MIN_OBJECT_PIXELS_FRAC) - so a
    # confident digit read here replaces whatever the generic pass already
    # left in that corner, rather than only filling a gap it left empty.
    # A prior claim in the badge zone can be either kind: a text block (the
    # page-level OCR pass took a swing at the digit) or a graphic (the ring
    # survived object detection but _classify_object called its shape
    # "chart" or "illustration" rather than "circle" - the box is right, only
    # the label is wrong). Either way it is very likely the badge itself.
    prior_candidates = [
        t for t in text_items + final_graphics
        if t.get("objectType") != "collage-part"
        and (t["box"][0] + t["box"][2] / 2.0) / W > 0.72 and (t["box"][1] + t["box"][3] / 2.0) / H < 0.25
    ]
    prior_ids = {id(t) for t in prior_candidates}
    # Everything ELSE already claimed (a decorative corner icon, a chart
    # flourish, a big illustration whose edge merely reaches into the corner)
    # must not be folded into the badge's own ink - see _locate_badge_ink.
    exclude_boxes = [it["box"] for it in (text_items + final_graphics) if id(it) not in prior_ids]

    replacement = None
    already_resolved = False

    for prior in prior_candidates:
        if prior.get("hasBackground") and _is_corner_badge_number(
            {"text": prior["block"]["text"], "conf": prior["block"]["conf"]}, prior["box"], W, H
        ):
            already_resolved = True  # already a clean, confident badge - leave it alone
            break
        replacement = _read_badge_at(np, cv2, arr, prior["box"], exclude_boxes, W, H)
        if replacement:
            break

    # Nothing claimed the corner yet, or nothing there could be read - try
    # the fixed zone directly, for a ring too thin to ever become an object
    # (or generate any OCR read at all) in the first place.
    # A collage part's own badge (if any) is baked into its pixels by design -
    # requirement 2 is that a part is never decomposed further, so this whole
    # corner-zone probe, which would otherwise manufacture a redundant floating
    # badge layer on top of it, is skipped outright for a collage-mode slide.
    if not replacement and not already_resolved and not collage_regions:
        corner_zone = (int(0.78 * W), 0, int(0.22 * W), int(0.13 * H))
        replacement = _read_badge_at(np, cv2, arr, corner_zone, exclude_boxes, W, H)

    if replacement:
        text_items = [t for t in text_items if id(t) not in prior_ids]
        final_graphics = [g for g in final_graphics if id(g) not in prior_ids]
        text_items.append({
            "box": replacement["box"],
            "kind": "text",
            "block": _block_from_region(np, replacement["read"], replacement["box"]),
            "hasBackground": True,
        })

    # Purge any watermark item one final time
    text_items = [t for t in text_items if not _is_watermark_item(t, watermark_box, W, H)]
    final_graphics = [g for g in final_graphics if not _is_watermark_item(g, watermark_box, W, H)]

    # text first, so the cap never trades a headline for a decorative blob
    items = sorted(text_items, key=lambda it: -_area(it["box"])) + \
        sorted(final_graphics, key=lambda it: -_area(it["box"]))
    items = [it for it in items if not _is_watermark_item(it, watermark_box, W, H)]
    items = items[:MAX_LAYERS]
    items.sort(key=lambda it: (it["box"][1], it["box"][0]))

    union_mask = np.zeros((H, W), np.uint8)
    for it in items:
        x, y, bw, bh = it["box"]
        union_mask[y:y + bh, x:x + bw] = 255

    max_font = max([it["block"]["fontPx"] for it in items if it["kind"] == "text"] or [1.0])

    # ---- build layers + background ---------------------------------------
    background = arr.copy()
    ring_r = max(6, int(0.012 * min(W, H)))
    layers = []
    text_blocks_json = []

    for idx, it in enumerate(items):
        x, y, bw, bh = it["box"]
        crop = arr[y:y + bh, x:x + bw]

        ring_px = _ring_pixels(np, arr, it["box"], union_mask, ring_r)
        ring_col = _modal_color(np, ring_px)
        if ring_col is None:
            ring_col = np.array([245, 245, 245], dtype=np.uint8)

        ink_col, paper_col, ink_ratio = _ink_and_paper(np, cv2, crop)
        if paper_col is None:
            paper_col = ring_col

        agree = float(np.abs(paper_col.astype(np.float32) - ring_col.astype(np.float32)).max())
        # An element with its own fill (a pill, a card) IS that rectangle -
        # matting it away would leave the poster's colour showing through.
        use_matte = (agree <= MATTE_AGREE_DIST and ink_ratio < 0.62
                     and not it.get("hasBackground"))

        if use_matte:
            rgba = _matte(np, crop, ring_col)
            background[y:y + bh, x:x + bw] = ring_col
        else:
            rgba = np.empty((bh, bw, 4), dtype=np.uint8)
            rgba[:, :, :3] = crop
            rgba[:, :, 3] = 255
            # Opaque panel. Flat surroundings (the usual poster case) get a flat
            # fill, which is exactly right and adds no blur. Textured
            # surroundings get a Telea inpaint computed on a small padded ROI -
            # and only the box interior is written back, so every pixel outside
            # the element stays bit-identical to the source.
            ring_var = float(ring_px.astype(np.float32).std()) if len(ring_px) else 0.0
            p = min(12, x, y, W - (x + bw), H - (y + bh))
            if ring_var > 12.0 and p >= 3:
                roi = np.ascontiguousarray(background[y - p:y + bh + p, x - p:x + bw + p])
                m = np.zeros(roi.shape[:2], np.uint8)
                m[p:p + bh, p:p + bw] = 255
                painted = cv2.inpaint(cv2.cvtColor(roi, cv2.COLOR_RGB2BGR), m, 3, cv2.INPAINT_TELEA)
                background[y:y + bh, x:x + bw] = cv2.cvtColor(painted, cv2.COLOR_BGR2RGB)[p:p + bh, p:p + bw]
            else:
                background[y:y + bh, x:x + bw] = ring_col

        rel_x = x / float(W)
        rel_y = y / float(H)
        rel_w = bw / float(W)
        rel_h = bh / float(H)
        rel_area = (bw * bh) / total
        aspect = bw / float(bh)

        layer = {
            "id": "layer_{}".format(idx + 1),
            "imageUrl": _png_data_url(rgba, "RGBA"),
            "x": round(rel_x, 6),
            "y": round(rel_y, 6),
            "w": round(rel_w, 6),
            "h": round(rel_h, 6),
            "opacity": 1.0,
            "scale": 1.0,
            "rotation": 0,
            "motionType": "none",
            "motionSpeed": 1.0,
            "motionDistance": 0,
            "zIndex": idx + 1,
            "kind": it["kind"],
            "hasAlpha": bool(use_matte),
            "hasBackground": bool(it.get("hasBackground")),
            "pixelBounds": {"left": x, "top": y, "width": bw, "height": bh},
            "sourceSize": {"width": W, "height": H},
            "backgroundColor": _hex(ring_col),
            "positionLabel": _position_label(rel_x + rel_w / 2, rel_y + rel_h / 2),
        }

        if it["kind"] == "text":
            b = it["block"]
            font_px = b["fontPx"]
            font_rel = font_px / float(H)
            role = _text_role(font_px, max_font, font_rel, rel_y, b["text"],
                              len(b["lines"]), it.get("hasBackground"))
            align = _text_align(b)
            letters = [c for c in b["text"] if c.isalpha()]
            layer.update({
                "type": "text",
                "role": role,
                "name": b["text"][:60],
                "slug": _slug(b["text"], "text_{}".format(idx + 1)),
                "text": b["text"],
                "textLines": [l["text"] for l in b["lines"]],
                "lineCount": len(b["lines"]),
                "wordCount": sum(len(l["words"]) for l in b["lines"]),
                "fontSizePx": round(font_px, 1),
                "fontSizeRel": round(font_rel, 5),
                "isUppercase": bool(letters) and all(c.isupper() for c in letters),
                "textAlign": align,
                "color": _hex(ink_col) if ink_col is not None else None,
                "ocrConfidence": b["conf"],
                "lines": [
                    {
                        "text": l["text"],
                        "x": round(l["box"][0] / float(W), 6),
                        "y": round(l["box"][1] / float(H), 6),
                        "w": round(l["box"][2] / float(W), 6),
                        "h": round(l["box"][3] / float(H), 6),
                        "pixelBounds": {"left": l["box"][0], "top": l["box"][1],
                                        "width": l["box"][2], "height": l["box"][3]},
                        "fontSizePx": round(l["height"], 1),
                        "words": [
                            {
                                "text": wd["text"],
                                "confidence": wd["conf"],
                                "pixelBounds": {"left": wd["box"][0], "top": wd["box"][1],
                                                "width": wd["box"][2], "height": wd["box"][3]},
                            }
                            for wd in l["words"]
                        ],
                    }
                    for l in b["lines"]
                ],
            })
            text_blocks_json.append({
                "id": layer["id"],
                "role": role,
                "positionLabel": layer["positionLabel"],
                "text": b["text"],
                "textLines": layer["textLines"],
                "position": {"x": layer["x"], "y": layer["y"], "w": layer["w"], "h": layer["h"]},
                "pixelBounds": layer["pixelBounds"],
                "fontSizePx": layer["fontSizePx"],
                "fontSizeRel": layer["fontSizeRel"],
                "textAlign": align,
                "color": layer["color"],
                "backgroundColor": layer["backgroundColor"],
                "hasBackground": layer["hasBackground"],
                "isUppercase": layer["isUppercase"],
                "ocrConfidence": b["conf"],
            })
        else:
            # The classifier measured this object against its own mask; fall
            # back to geometry only for boxes that never went through it (a
            # panel that swallowed its text, say).
            object_type = it.get("objectType", "graphic")
            role = it.get("objectRole") or _graphic_role(rel_y, aspect, rel_area)
            label = object_type if object_type != "graphic" else role
            # A collage part carries its own verbatim caption (found above,
            # from the page-level OCR blocks that fall inside its box) - every
            # other graphic kind has none, hence the "" everyone else gets.
            is_collage_part = object_type == "collage-part"
            caption = it.get("collageCaption", "") if is_collage_part else ""
            layer.update({
                "type": "graphic",
                "role": role,
                "objectType": object_type,
                "name": caption[:60] if caption else "{} ({})".format(label.replace("-", " ").title(), layer["positionLabel"]),
                "slug": "{}_{}".format(object_type.replace("-", "_"), idx + 1),
                "text": caption,
                "textLines": [caption] if caption else [],
                "color": _hex(ink_col) if ink_col is not None else None,
                "aspectRatio": round(aspect, 3),
                "fillRatio": it.get("fillRatio"),
                "circularity": it.get("circularity"),
                "solidity": it.get("solidity"),
                "colorCount": it.get("colorCount"),
                "edgeDensity": it.get("edgeDensity"),
            })
            if is_collage_part:
                layer["partIndex"] = it.get("collagePartIndex")

        layers.append(layer)

    reading_order = sorted(text_blocks_json, key=lambda b: (b["position"]["y"], b["position"]["x"]))
    original_url = _background_data_url(arr)

    return {
        "success": True,
        "width": W,
        "height": H,
        "sourceWidth": src_w,
        "sourceHeight": src_h,
        "backgroundUrl": _background_data_url(background),
        "originalUrl": original_url,
        "watermarkRemoved": watermark_box is not None,
        "layers": layers,
        "text": {
            "fullText": "\n".join(b["text"] for b in reading_order),
            "blockCount": len(reading_order),
            "blocks": reading_order,
        },
        "meta": {
            "ocr": ocr_engine,
            "watermarkRemoved": watermark_box is not None,
            "wordsDetected": len(words),
            "linesDetected": len(lines),
            "textLayers": sum(1 for l in layers if l["type"] == "text"),
            "graphicLayers": sum(1 for l in layers if l["type"] == "graphic"),
            "mattedLayers": sum(1 for l in layers if l["hasAlpha"]),
            "objectsDetected": len(detected),
            "objectTypes": sorted({l.get("objectType") for l in layers if l["type"] == "graphic" and l.get("objectType")}),
            "processedAtSourceResolution": long_edge <= MAX_PROCESS_DIM,
            "collageParts": len(collage_parts),
        },
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
