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

# Alpha matte ramp, in 0-255 max-channel distance from the local background.
MATTE_LO = 3.0
MATTE_HI = 42.0
# How close the interior background has to be to the surrounding background
# before we trust a matte. Beyond this the element is a card/panel with its
# own fill, and it stays an opaque rectangle (which is the correct reading).
MATTE_AGREE_DIST = 14.0


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
    return False


def _ocr_words(np, cv2, arr_rgb):
    """Every readable word on the page, boxed in processed-image coordinates."""
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

    def run(image, config):
        try:
            return pytesseract.image_to_data(image, config=config, output_type=Output.DICT)
        except Exception:
            return None

    words = []

    def collect(data, pass_scale):
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
            if conf < MIN_WORD_CONF or _is_junk_word(txt, conf):
                continue
            bw = int(data["width"][i])
            bh = int(data["height"][i])
            if bw < 3 or bh < 5:
                continue
            box = (int(data["left"][i] / pass_scale), int(data["top"][i] / pass_scale),
                   int(bw / pass_scale), int(bh / pass_scale))
            if _area(box) <= 0:
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

    # sparse-text mode: posters are islands of text, not paragraphs
    collect(run(gray, "--oem 3 --psm 11"), scale)
    if len(words) < 3:
        collect(run(gray, "--oem 3 --psm 6"), scale)

    # Second look, enlarged. Small type - badges, page counters, footnotes -
    # is often below tesseract's comfortable size at native resolution; at
    # ~1.7x it reads cleanly. Anything already found above is kept as-is.
    up = scale * 1.7
    if max(w, h) * up <= 3400:
        big = cv2.resize(arr_rgb, (max(1, int(w * up)), max(1, int(h * up))),
                         interpolation=cv2.INTER_CUBIC)
        collect(run(cv2.cvtColor(big, cv2.COLOR_RGB2GRAY), "--oem 3 --psm 11"), up)

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
    hmax = float(max(a[3], b[3]))
    ca = a[1] + a[3] / 2.0
    cb = b[1] + b[3] / 2.0
    if abs(ca - cb) > 0.55 * hmax:
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

    if ratio >= 0.72 and font_rel >= 0.045:
        return "title"
    if ratio >= 0.42 or font_rel >= 0.034:
        return "heading"
    if has_bg and short:
        return "footer-badge" if rel_y > 0.86 else "badge"
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

def _detect_graphics(np, cv2, arr_rgb, text_mask):
    h, w = arr_rgb.shape[:2]
    total = float(w * h)

    gray = cv2.cvtColor(arr_rgb, cv2.COLOR_RGB2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)

    edges = cv2.Canny(blur, 30, 120)
    adapt = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 21, 6)
    combined = cv2.bitwise_or(edges, adapt)

    # anything OCR already claimed is not a graphic
    if text_mask is not None:
        pad = max(3, int(0.006 * min(w, h)))
        grown = cv2.dilate(text_mask, np.ones((pad, pad), np.uint8))
        combined[grown > 0] = 0

    k = max(5, int(0.014 * min(w, h)))
    if k % 2 == 0:
        k += 1
    closed = cv2.morphologyEx(combined, cv2.MORPH_CLOSE,
                              cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        a = bw * bh
        if a < total * 0.0008 or a > total * 0.30:
            continue
        if bw > w * 0.93 or bh > h * 0.93:
            continue
        if bw < 8 or bh < 8:
            continue
        boxes.append((x, y, bw, bh))
    return boxes


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

    # ---- graphics ---------------------------------------------------------
    graphic_items = _resolve_overlaps(
        [{"box": _clip(gb, W, H), "kind": "graphic"} for gb in _detect_graphics(np, cv2, arr, text_mask)]
    )

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
            read = _ocr_region(np, cv2, arr, g["box"])
            if read and _accept_region_text(read):
                text_items.append({
                    "box": g["box"],
                    "kind": "text",
                    "block": _block_from_region(np, read, g["box"]),
                    "hasBackground": True,
                })
                continue
        final_graphics.append(g)

    text_items = [t for t in text_items if not t.get("dropped")]
    final_graphics = [g for g in final_graphics
                      if not any(_contained(g["box"], t["box"]) for t in text_items)]

    # text first, so the cap never trades a headline for a decorative blob
    items = sorted(text_items, key=lambda it: -_area(it["box"])) + \
        sorted(final_graphics, key=lambda it: -_area(it["box"]))
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
            role = _graphic_role(rel_y, aspect, rel_area)
            layer.update({
                "type": "graphic",
                "role": role,
                "name": "{} ({})".format(role.replace("-", " ").title(), layer["positionLabel"]),
                "slug": "{}_{}".format(role.replace("-", "_"), idx + 1),
                "text": "",
                "textLines": [],
                "color": _hex(ink_col) if ink_col is not None else None,
                "aspectRatio": round(aspect, 3),
            })

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
        "layers": layers,
        "text": {
            "fullText": "\n".join(b["text"] for b in reading_order),
            "blockCount": len(reading_order),
            "blocks": reading_order,
        },
        "meta": {
            "ocr": ocr_engine,
            "wordsDetected": len(words),
            "linesDetected": len(lines),
            "textLayers": sum(1 for l in layers if l["type"] == "text"),
            "graphicLayers": sum(1 for l in layers if l["type"] == "graphic"),
            "mattedLayers": sum(1 for l in layers if l["hasAlpha"]),
            "processedAtSourceResolution": long_edge <= MAX_PROCESS_DIM,
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
