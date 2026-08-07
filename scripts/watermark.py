"""
Grok-watermark detection + removal.

Grok Imagine stamps its wordmark small, low-contrast, somewhere in the
bottom footer of every image it generates - never up where this design
system's own slide-number badge lives, which is always a fixed spot
top-right (see slideOrder.ts / analyzeSlideOrder and motion_segment.py's
_is_corner_badge_number). Different zone, different job: the badge is read
and then kept as its own text layer; this is read and then erased outright,
via the same "OCR a fixed zone" technique, so the two passes never step on
each other or get confused for one another.

Shared by motion_segment.py (runs this once, automatically, on every image
before it is decomposed - see process_image) and remove_watermark.py (the
standalone "Remove Watermark" button's batch tool, for slides that were
decomposed before this pass existed).

Callers supply their own `np`/`cv2` modules and an `ocr_region_fn` matching
motion_segment.py's `_ocr_region(np, cv2, arr_rgb, box, min_conf=...)` -
this module never imports numpy/opencv/tesseract itself, so it costs nothing
to import when those are unavailable.
"""

import re

# Fraction of (W, H) searched for the wordmark: (x, y, w, h). Generous bottom band
# (y from 0.65 to 1.0) so poster variations in aspect ratio (vertical, 4:5, 1:1)
# never slice off a slightly higher watermark.
WATERMARK_ZONE = (0.0, 0.65, 1.0, 0.35)

# Lower than a normal panel read (_ocr_region's own default is 52) - a
# semi-transparent wordmark sitting over a photo is inherently lower-contrast
# than printed poster type. Safe to relax because position (the fixed zone)
# and vocabulary both have to agree before anything is touched.
WATERMARK_MIN_CONF = 15.0

# Ink-cluster dilation, as a fraction of the zone's width: merges the glyphs
# inside "Grok" into one blob without bridging the much larger gap to a
# neighbouring, unrelated piece of footer text.
_CLUSTER_DILATE_FRAC = 0.006
_CLUSTER_MIN_PX = 3
# How many blobs Pass 1 will spend an OCR call on, after _plausible_wordmark has
# already thrown out everything the wrong shape or in the wrong place. Each one
# costs up to three tesseract spawns, so this is a time budget rather than a
# correctness knob — the mark, if it is there, is among the largest survivors.
_MAX_CLUSTERS = 12


def _levenshtein(s1, s2):
    """Compute edit distance between two strings."""
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def _looks_like_grok(text):
    """True if `text` is or fuzzy-matches "grok", "imagine", "x.ai", or common
    OCR misread typos like "qrok", "gr0k", "crok", "9rok", "orok", "grak", "gro",
    "gick", "g r o k", etc.
    """
    if not text or not isinstance(text, str):
        return False
    raw = text.lower().strip()
    if "grok" in raw or "imagine" in raw or "x.ai" in raw or "grokai" in raw:
        return True

    letters = re.sub(r"[^a-z0-9]", "", raw)
    if not letters:
        return False
    if "grok" in letters:
        return True

    # Common OCR letter/digit misrecognitions: 0->o, 9->g, q->g, c->g at start
    norm = letters.replace("0", "o").replace("9", "g").replace("q", "g")
    if norm.startswith("c") and len(norm) >= 4:
        norm = "g" + norm[1:]
    if "grok" in norm:
        return True

    # Check individual words or tokens
    tokens = re.split(r"[\s_\-\./\\]+", raw)
    for token in tokens:
        clean_tok = re.sub(r"[^a-z0-9]", "", token)
        if not clean_tok:
            continue
        norm_tok = clean_tok.replace("0", "o").replace("9", "g").replace("q", "g")
        if norm_tok.startswith("c") and len(norm_tok) >= 4:
            norm_tok = "g" + norm_tok[1:]
        if norm_tok in ("grok", "gro", "rok", "grk", "gok", "qrok", "orok", "crok", "grak", "9rok"):
            return True
        if 3 <= len(norm_tok) <= 6:
            if _levenshtein(norm_tok, "grok") <= 1:
                return True
    return False


def _union_box(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x0, y0 = min(ax, bx), min(ay, by)
    x1, y1 = max(ax + aw, bx + bw), max(ay + ah, by + bh)
    return (x0, y0, x1 - x0, y1 - y0)


def _words_to_box(words):
    box = words[0]["box"]
    for wd in words[1:]:
        box = _union_box(box, wd["box"])
    return box


def _plausible_wordmark(box, w, h):
    """Could this ink blob be the wordmark at all?

    Every candidate that gets past here costs a tesseract spawn, and the zone
    routinely yields dozens of blobs - the poster's own footer type, the tail of
    an illustration, hatching. Grok stamps a small, wide, bottom-corner mark of
    a very particular size, so checking that first is what keeps the pass at a
    handful of reads instead of a couple of hundred. (Before this filter a
    poster with a *tidy* footer was the slow case: too few blobs to trip the
    _MAX_CLUSTERS bail-out, so all of them were read - 24s a slide, against 0.5s
    for a busy one that skipped the pass entirely.)
    """
    x, y, bw, bh = box
    if not (0.008 * h <= bh <= 0.040 * h):
        return False
    if not (0.015 * w <= bw <= 0.220 * w):
        return False
    if not (0.8 <= bw / float(max(1, bh)) <= 8.0):
        return False
    return (y + bh / 2.0) > 0.78 * h


def _ink_clusters(cv2, zone_gray, zx, zy):
    """Connected ink components inside a zone crop, each merged at
    word-scale and returned as a tight box in page coordinates, largest first.
    """
    zh, zw = zone_gray.shape[:2]
    k = max(2, int(_CLUSTER_DILATE_FRAC * zw))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, max(1, k // 2)))

    boxes = []
    _, mask_inv = cv2.threshold(zone_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    _, mask_std = cv2.threshold(zone_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    for mask in (mask_inv, mask_std):
        dilated = cv2.dilate(mask, kernel, iterations=1)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            if bw < _CLUSTER_MIN_PX or bh < _CLUSTER_MIN_PX:
                continue
            boxes.append((zx + x, zy + y, bw, bh))
    boxes.sort(key=lambda b: -(b[2] * b[3]))
    return boxes


def _cv_fallback_watermark_box(cv2, arr_rgb, W, H):
    """Computer Vision fallback: searches extreme bottom-left and bottom-right
    corners for isolated horizontal ink clusters matching Grok's logo + wordmark
    geometry when OCR returns no text.
    """
    zy = int(0.70 * H)
    zone_gray = cv2.cvtColor(arr_rgb[zy:H, 0:W], cv2.COLOR_RGB2GRAY)
    k = max(2, int(0.008 * W))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, max(1, k // 2)))

    _, mask_inv = cv2.threshold(zone_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    _, mask_std = cv2.threshold(zone_gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    candidates = []
    for mask in (mask_inv, mask_std):
        dilated = cv2.dilate(mask, kernel, iterations=1)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            x, y, bw, bh = cv2.boundingRect(c)
            page_y = zy + y
            if page_y + bh / 2.0 < 0.75 * H:
                continue
            # Must sit in bottom left or bottom right
            if not (x + bw / 2.0 < 0.35 * W or x + bw / 2.0 > 0.65 * W):
                continue
            aspect = float(bw) / float(max(1, bh))
            if 1.2 <= aspect <= 7.0 and 8 <= bh <= 0.08 * H and 20 <= bw <= 0.25 * W:
                candidates.append((x, page_y, bw, bh))

    if candidates:
        # Return candidate in extreme bottom corner
        candidates.sort(key=lambda b: (-(b[1] + b[3]), -(b[2] * b[3])))
        return candidates[0]
    return None


def find_watermark_box(np, cv2, arr_rgb, ocr_region_fn):
    """Looks for "grok" inside the fixed bottom zone and returns the tight
    box around whichever OCR word(s) or ink blob spelled it, in page coordinates,
    or a CV fallback box if OCR failed.
    """
    h, w = arr_rgb.shape[:2]
    fx, fy, fw, fh = WATERMARK_ZONE
    zx, zy, zw, zh = int(fx * w), int(fy * h), int(fw * w), int(fh * h)
    if zw < 8 or zh < 8:
        return None

    zone_gray = cv2.cvtColor(arr_rgb[zy:zy + zh, zx:zx + zw], cv2.COLOR_RGB2GRAY)
    clusters = [c for c in _ink_clusters(cv2, zone_gray, zx, zy)
                if _plausible_wordmark(c, w, h)][:_MAX_CLUSTERS]

    # Pass 1: OCR each ink blob on its own tight crop
    if clusters:
        for cx, cy, cw, ch in clusters:
            pad = max(2, int(0.5 * ch))
            candidates = [(cx, cy, cw, ch)]
            for keep_frac in (0.75, 0.55):
                trim = int(cw * (1 - keep_frac))
                if trim > 0:
                    candidates.append((cx + trim, cy, cw - trim, ch))
            for bx, by, bw, bh in candidates:
                box = (max(0, bx - pad), max(0, by - pad), bw + 2 * pad, bh + 2 * pad)
                read = ocr_region_fn(np, cv2, arr_rgb, box, min_conf=WATERMARK_MIN_CONF)
                if not read:
                    continue
                words = [wd for wd in read["words"] if _looks_like_grok(wd["text"])]
                if words:
                    return _words_to_box(words)
                if _looks_like_grok(read["text"]) and len(read["words"]) <= 3:
                    return (bx, by, bw, bh)

    # Pass 2: Whole zone OCR pass
    read = ocr_region_fn(np, cv2, arr_rgb, (zx, zy, zw, zh), min_conf=WATERMARK_MIN_CONF)
    if read:
        words = [wd for wd in read["words"] if _looks_like_grok(wd["text"])]
        if not words and _looks_like_grok(read["text"]) and len(read["words"]) <= 4:
            words = read["words"]
        if words:
            return _words_to_box(words)

    # Pass 3: Dedicated bottom corner crops (bottom-left & bottom-right)
    corners = [
        (int(0.0 * w), int(0.70 * h), int(0.40 * w), int(0.30 * h)),  # bottom-left
        (int(0.60 * w), int(0.70 * h), int(0.40 * w), int(0.30 * h)),  # bottom-right
    ]
    for cbox in corners:
        read = ocr_region_fn(np, cv2, arr_rgb, cbox, min_conf=WATERMARK_MIN_CONF)
        if read:
            words = [wd for wd in read["words"] if _looks_like_grok(wd["text"])]
            if words:
                return _words_to_box(words)
            if _looks_like_grok(read["text"]) and len(read["words"]) <= 4:
                return _words_to_box(read["words"]) if read["words"] else cbox

    # Pass 4: Computer Vision contour fallback.
    #
    # This pass has no evidence the ink it found spells anything - it matches on
    # geometry alone, and the design system draws its own furniture in exactly
    # the corners it searches. So whatever it picks is read back before it is
    # erased: type that comes out as a confident, ordinary word is the poster's
    # own footer (the handle, the "Swipe ->" cue) and is left alone, while a
    # wordmark faint enough that nothing above could read it stays a watermark.
    # Without this check every slide in the carousel design system loses its
    # "Swipe ->" cue to a pass that was only ever meant to catch Grok's mark.
    box = _cv_fallback_watermark_box(cv2, arr_rgb, w, h)
    if box is None:
        return None
    bx, by, bw, bh = box
    pad = max(2, int(0.4 * bh))
    read = ocr_region_fn(np, cv2, arr_rgb,
                         (max(0, bx - pad), max(0, by - pad), bw + 2 * pad, bh + 2 * pad),
                         min_conf=55.0)
    if read:
        legible = [wd for wd in read["words"]
                   if len(re.sub(r"[^a-z0-9]", "", wd["text"].lower())) >= 3]
        if legible and not any(_looks_like_grok(wd["text"]) for wd in legible):
            return None
    return box


def _pad_for_icon(box, w, h):
    """Pads the detected watermark box generously left, right, top, and bottom
    to completely enclose Grok's logo icon glyph (slashed square) regardless of
    whether it sits left or right of the text wordmark.
    """
    x, y, bw, bh = box
    pad_x = int(bh * 2.2)
    pad_y = int(bh * 0.4)
    margin = max(5, int(bh * 0.3))
    x0 = max(0, x - pad_x - margin)
    y0 = max(0, y - pad_y - margin)
    x1 = min(w, x + bw + pad_x + margin)
    y1 = min(h, y + bh + pad_y + margin)
    return (x0, y0, x1 - x0, y1 - y0)


def _inpaint_box(np, cv2, arr_rgb, box):
    """Telea-inpaints `box` out of arr_rgb in place."""
    h_img, w_img = arr_rgb.shape[:2]
    x, y, bw, bh = box
    p = max(4, min(30, x, y, w_img - (x + bw), h_img - (y + bh)))
    x0, y0 = max(0, x - p), max(0, y - p)
    x1, y1 = min(w_img, x + bw + p), min(h_img, y + bh + p)

    roi = np.ascontiguousarray(arr_rgb[y0:y1, x0:x1])
    mask = np.zeros(roi.shape[:2], np.uint8)
    mx0, my0 = x - x0, y - y0
    mask[my0:my0 + bh, mx0:mx0 + bw] = 255

    painted = cv2.inpaint(cv2.cvtColor(roi, cv2.COLOR_RGB2BGR), mask, 5, cv2.INPAINT_TELEA)
    arr_rgb[y0:y1, x0:x1] = cv2.cvtColor(painted, cv2.COLOR_BGR2RGB)


def strip_grok_watermark(np, cv2, arr_rgb, ocr_region_fn):
    """Finds and inpaints away a Grok Imagine watermark in arr_rgb's bottom
    footer band, in place. Returns the removed (padded) box, or None if no
    watermark was found.
    """
    h, w = arr_rgb.shape[:2]
    box = find_watermark_box(np, cv2, arr_rgb, ocr_region_fn)
    if not box:
        return None
    padded = _pad_for_icon(box, w, h)
    _inpaint_box(np, cv2, arr_rgb, padded)
    return padded

