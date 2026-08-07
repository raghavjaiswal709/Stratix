#!/usr/bin/env python3
"""
Collage-layout reader for the carousel/video design system.

The posters this reads are generated from a written contract (see
lib/prompt-templates/video-template.ts §8, "LAYOUT BY PART COUNT"):

    1 part  -> one full-frame image, no divider
    2 parts -> one full-WIDTH horizontal rule across the middle
    3 parts -> two full-width horizontal rules, three stacked bands
    4 parts -> one full-width horizontal + one full-HEIGHT vertical rule (2x2)

    "A divider is a thin hand-drawn pencil rule ... spanning the FULL width
     (horizontal) or FULL height (vertical) of the frame - never partial, and
     never appearing anywhere else on a multi-part frame."

and every part carries

    "Its own caption, set in small clean sans type sitting at the bottom of
     that part's own region - the exact, full, verbatim words of that part of
     the line."

Two facts fall out of that contract and this module is built on them:

  * A divider spans the FULL width. So it is found by measuring coverage
    directly against the page colour - no morphology, no Otsu, no guessing
    from where the illustrations happen to sit. A band that does not reach
    ~edge to ~edge is not a divider, full stop.
  * A caption sits on the flat PAGE background, while everything a part draws
    sits on its own hatched illustration ground. So "is this text the caption
    or is it lettering inside the drawing?" is answered by looking at what
    surrounds it, not by where its box happens to land.

That second point is the whole reason this file exists: reading a part's
caption as "every OCR word whose centre lands inside the part" mixes the
drawn-in signage ("EXCHANGE", "USD 1 = 82.50") into the caption and makes it
useless for matching a slide against the script CSV.

Coordinates are pixels in whatever array is passed in; callers that analyse a
downscaled copy scale the boxes back themselves.
"""

# A divider must cover at least this share of the width (measured inside a 3%
# margin, so a rule that stops just short of the bleed still counts).
RULE_MIN_COVERAGE = 0.95
# ...and stay this thin. A pencil rule is 2-6px on a 1448px poster; anything
# thicker that spans the full width is a drawn band, not a divider.
RULE_MAX_THICKNESS_FRAC = 0.010
# Rows the rule bleeds into at its soft edges, still counted as part of it.
RULE_EDGE_COVERAGE = 0.80

# Max-channel distance from the page colour before a pixel counts as drawn.
PAGE_TOLERANCE = 14

# Type, as distinct from the pencil a drawing is made of.
#
# This pair of thresholds is what stops a caption's box from being dragged out
# to the poster's edge. A part's illustration bleeds a few rows of blue
# cross-hatching down into the strip its caption sits in, and any "differs from
# the page" test lights that hatching up just as brightly as the words: the
# caption then reads as one line spanning the full width, tesseract is handed a
# crop that opens with a drawing, and the first word of the caption is lost
# inside whatever it makes of it.
#
# Type is not merely different from the page - it is much DARKER than it, and
# solidly so. Measured on the design system's own output, a caption row is 18%
# type by area under the pair below while the hatching bleeding into the same
# rows is 0.7%: a 25x separation, where distance alone gives 4x.
TYPE_MIN_DARKNESS = 95      # how far below the page's luma type has to sit
TYPE_MIN_DISTANCE = 110     # ...and how far from its colour

# A row is "illustration" when this little of it is bare page.
ART_PAGE_FRAC = 0.45
# The illustration body has to be at least this tall, or what we found is a
# caption's own low-page-fraction rows rather than a drawing.
ART_MIN_HEIGHT_FRAC = 0.10

# A caption line: wide, short, and sitting low in its zone.
CAPTION_MIN_WIDTH_FRAC = 0.10
CAPTION_MAX_HEIGHT_FRAC = 0.060
# Two caption lines of a wrapped caption sit within this much of each other.
CAPTION_LINE_GAP_FRAC = 0.022

# A zone shorter than this is page furniture (the handle / "Swipe ->" strip),
# not a collage part.
MIN_ZONE_HEIGHT_FRAC = 0.09


# --------------------------------------------------------------------------
# page background
# --------------------------------------------------------------------------

def page_background(np, arr_rgb):
    """The poster's flat paper colour, from the modal colour of its border.

    The border is the one region the design system guarantees is bare page:
    every part is inset from the bleed. Taking the mode of a 5-bit histogram
    and then averaging that bin's real pixels keeps the sub-level precision
    that a plain histogram peak throws away, which matters because every test
    downstream is a tolerance around this value.
    """
    h, w = arr_rgb.shape[:2]
    b = max(3, int(0.004 * min(w, h)))
    ring = np.concatenate([
        arr_rgb[:b].reshape(-1, 3), arr_rgb[-b:].reshape(-1, 3),
        arr_rgb[:, :b].reshape(-1, 3), arr_rgb[:, -b:].reshape(-1, 3),
    ])
    q = (ring.astype(np.uint16) >> 3).astype(np.uint32)
    keys = (q[:, 0] << 10) | (q[:, 1] << 5) | q[:, 2]
    vals, counts = np.unique(keys, return_counts=True)
    sel = keys == vals[counts.argmax()]
    return ring[sel].mean(axis=0), float(sel.mean())


def page_distance(np, arr_rgb, bg):
    """Per-pixel max-channel distance from the page colour."""
    return np.abs(arr_rgb.astype(np.int16) - bg.astype(np.int16)).max(axis=2)


def _luma(np, arr_rgb):
    return (0.299 * arr_rgb[:, :, 0].astype(np.float32)
            + 0.587 * arr_rgb[:, :, 1].astype(np.float32)
            + 0.114 * arr_rgb[:, :, 2].astype(np.float32))


def type_mask(np, arr_rgb, dist, bg):
    """Pixels that are type (or a hard-edged drawn rule), not pencil shading."""
    page_luma = float(0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2])
    return ((_luma(np, arr_rgb) <= page_luma - TYPE_MIN_DARKNESS)
            & (dist > TYPE_MIN_DISTANCE)).astype(np.uint8)


# --------------------------------------------------------------------------
# dividers
# --------------------------------------------------------------------------

def _runs_over(profile, length, min_cov, edge_cov, max_thickness):
    """Contiguous bands that peak above `min_cov` and stay above `edge_cov`."""
    out = []
    i = 0
    while i < length:
        if profile[i] >= min_cov:
            a = i
            while a > 0 and profile[a - 1] >= edge_cov:
                a -= 1
            b = i
            while b < length and profile[b] >= edge_cov:
                b += 1
            if b - a <= max_thickness:
                out.append((a, b - 1))
            i = b
        else:
            i += 1
    return out


def find_rules(np, drawn, w, h):
    """Full-span horizontal and vertical pencil rules.

    Returns (horizontal, vertical) as lists of (start, end) pixel bands.
    """
    mx, my = int(0.03 * w), int(0.03 * h)
    rows = drawn[:, mx:w - mx].mean(axis=1) if w - 2 * mx > 0 else np.zeros(h)
    cols = drawn[my:h - my, :].mean(axis=0) if h - 2 * my > 0 else np.zeros(w)
    return (
        _runs_over(rows, h, RULE_MIN_COVERAGE, RULE_EDGE_COVERAGE,
                   max(2, int(RULE_MAX_THICKNESS_FRAC * h))),
        _runs_over(cols, w, RULE_MIN_COVERAGE, RULE_EDGE_COVERAGE,
                   max(2, int(RULE_MAX_THICKNESS_FRAC * w))),
    )


def zone_boxes(np, drawn, w, h):
    """The collage part regions, in reading order, as (x, y, w, h) boxes.

    Rules that are not part of the collage grid - the thin rule the handle
    sits under, which the design system draws in the footer strip and nowhere
    else - fall out on their own: the strip they cut off is too short to be a
    part, so it is dropped rather than special-cased.

    Returns (boxes, meta). An empty list means the poster does not read as a
    collage at all and the caller should not force one.
    """
    h_rules, v_rules = find_rules(np, drawn, w, h)

    def cut(rules, length):
        edges = [0]
        for a, b in rules:
            edges.append((a + b) // 2 + 1)
        edges.append(length)
        return [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]

    rows = [s for s in cut(h_rules, h) if s[1] - s[0] >= MIN_ZONE_HEIGHT_FRAC * h]
    cols = [s for s in cut(v_rules, w) if s[1] - s[0] >= MIN_ZONE_HEIGHT_FRAC * w]

    # A grid has to actually divide something.
    #
    # The design system's 1-part beat is "a single full-frame image, no
    # divider" — which is, by construction, indistinguishable from any poster
    # that is not a collage at all. Claiming one anyway is the worst failure
    # this module can have: the whole canvas becomes a single atomic block that
    # is never decomposed into anything, and whatever text happens to sit
    # lowest on the page (the handle, the "Swipe ->" cue) is read as its
    # caption. So no rule, no collage — a single-part beat is decomposed
    # element by element by the general pass instead, which still finds its
    # caption, just as a text layer rather than a bound one.
    if not rows or not cols or len(rows) * len(cols) < 2:
        return [], {"hRules": h_rules, "vRules": v_rules, "grid": "none"}

    # The contract only ever produces a 1xN stack or a 2x2. Anything else means
    # something was read as a rule that is not one, and forcing a grid onto it
    # would be worse than not claiming a collage at all.
    if len(cols) > 1 and (len(cols) != 2 or len(rows) != 2):
        cols = [(0, w)]
    if len(rows) > 4:
        return [], {"hRules": h_rules, "vRules": v_rules, "grid": "unreadable"}

    boxes = []
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            boxes.append((x0, y0, x1 - x0, y1 - y0))

    grid = "{}x{}".format(len(rows), len(cols))
    return boxes, {"hRules": h_rules, "vRules": v_rules, "grid": grid}


# --------------------------------------------------------------------------
# inside one zone: the caption, and the drawing above it
# --------------------------------------------------------------------------

def _content_bounds(np, mask, box):
    """Tight box around everything drawn inside `box`, in page coordinates."""
    x, y, bw, bh = box
    sub = mask[y:y + bh, x:x + bw]
    ys = np.where(sub.any(axis=1))[0]
    xs = np.where(sub.any(axis=0))[0]
    if len(ys) == 0 or len(xs) == 0:
        return None
    return (x + int(xs[0]), y + int(ys[0]),
            int(xs[-1] - xs[0] + 1), int(ys[-1] - ys[0] + 1))


def _caption_lines(np, cv2, typ, box, w, h):
    """Text lines inside `box`, bottom-most first.

    Words are closed into a line along the writing direction only, so two
    stacked lines of a wrapped caption stay two lines and can be read - and
    concatenated - in the order they are written. Reading a two-line caption as
    one block returns its words interleaved by column, which is the difference
    between a caption that matches its script row and one that matches nothing.
    """
    x, y, bw, bh = box
    if bw <= 0 or bh <= 0:
        return []
    sub = typ[y:y + bh, x:x + bw]
    if not sub.any():
        return []

    k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(0.026 * w)), 1))
    joined = cv2.morphologyEx(sub, cv2.MORPH_CLOSE, k)

    n, _, stats, _ = cv2.connectedComponentsWithStats(joined, 8)
    lines = []
    for i in range(1, n):
        cx, cy, cw, ch, area = stats[i]
        if cw < CAPTION_MIN_WIDTH_FRAC * w:
            continue
        if ch > CAPTION_MAX_HEIGHT_FRAC * h or ch < 0.006 * h:
            continue
        lines.append({"box": (x + int(cx), y + int(cy), int(cw), int(ch)), "area": int(area)})

    # Fragments of one line that the close did not reach across - an em-dash, a
    # word set apart by a highlight - are merged back by baseline rather than
    # left as separate short lines that fail the width test above.
    lines.sort(key=lambda l: l["box"][1])
    merged = []
    for l in lines:
        lx, ly, lw, lh = l["box"]
        hit = None
        for m in merged:
            mx, my, mw, mh = m["box"]
            overlap = min(ly + lh, my + mh) - max(ly, my)
            if overlap > 0.55 * min(lh, mh):
                hit = m
                break
        if hit is None:
            merged.append({"box": l["box"], "area": l["area"]})
        else:
            mx, my, mw, mh = hit["box"]
            hit["box"] = (min(mx, lx), min(my, ly),
                          max(mx + mw, lx + lw) - min(mx, lx),
                          max(my + mh, ly + lh) - min(my, ly))
            hit["area"] += l["area"]

    merged.sort(key=lambda l: -(l["box"][1] + l["box"][3]))
    return merged


def _rule_rows(np, typ, box):
    """Rows of `box` that are a drawn rule rather than type.

    The design system underscores an emphasised caption with a thin alert-red
    rule. It belongs to the caption's pixels but not to its words, so OCR is
    handed a crop with it removed while the layer keeps it.
    """
    x, y, bw, bh = box
    if bw <= 0:
        return set()
    cov = typ[y:y + bh, x:x + bw].mean(axis=1)
    return {y + i for i in range(bh) if cov[i] >= 0.85}


def read_zone(np, cv2, arr_rgb, dist, drawn, typ, box, w, h):
    """Split one collage part into its drawing and its caption.

    Returns a dict with:
        contentBox   - everything drawn in the zone, tight
        artBox       - the illustration alone, edge to edge
        captionBox   - the caption's own pixels, or None
        captionLines - one box per written line, top to bottom, rules removed
    """
    content = _content_bounds(np, drawn, box)
    if content is None:
        return None

    cx, cy, cw, ch = content

    # Where does the drawing stop? Row by row, over the content's own columns:
    # a row the illustration covers has almost no bare page left in it, and one
    # the caption sits on is nearly all page with letters punched through.
    page_frac = (dist[cy:cy + ch, cx:cx + cw] <= PAGE_TOLERANCE).mean(axis=1)
    art_rows = page_frac < ART_PAGE_FRAC

    best = None
    i = 0
    while i < ch:
        if art_rows[i]:
            j = i
            while j < ch and art_rows[j]:
                j += 1
            if best is None or (j - i) > (best[1] - best[0]):
                best = (i, j)
            i = j
        else:
            i += 1

    # Below the drawing is where a caption can be. When no run is long enough
    # to be a drawing at all, the whole zone is searched rather than none of
    # it - a part that is mostly type is unusual but not impossible.
    if best is not None and (best[1] - best[0]) >= ART_MIN_HEIGHT_FRAC * h:
        search_top = cy + best[1]
    else:
        search_top = cy

    zy1 = box[1] + box[3]
    search = (cx, search_top, cw, max(0, zy1 - search_top))
    lines = _caption_lines(np, cv2, typ, search, w, h)

    keep = []
    if lines:
        keep = [lines[0]]
        # A caption that wrapped is two lines a hair apart, set in the same size
        # and centred on the same axis. Anything else sitting just above the
        # last line is a piece of the drawing that happened to survive the type
        # test - a label inside the illustration, the dark edge of a prop - and
        # it gets read as words and prepended to the caption if it is let
        # through. Measured across the design system's own output the two are
        # never close: real wrapped lines match to within 1% of the width on
        # centre and are the same height to the pixel, while the intruders miss
        # the centre by a quarter of the page or come in at half the size.
        base = lines[0]["box"]
        base_cx = (base[0] + base[2] / 2.0) / float(w)
        for cand in lines[1:]:
            cb = cand["box"]
            gap = base[1] - (cb[1] + cb[3])
            if not (0 <= gap <= CAPTION_LINE_GAP_FRAC * h):
                break
            ratio = cb[3] / float(max(1, base[3]))
            if not (0.62 <= ratio <= 1.60):
                break
            if abs((cb[0] + cb[2] / 2.0) / float(w) - base_cx) > 0.06:
                break
            keep.append(cand)
            base = cb

    caption_box = None
    if keep:
        x0 = min(l["box"][0] for l in keep)
        y0 = min(l["box"][1] for l in keep)
        x1 = max(l["box"][0] + l["box"][2] for l in keep)
        y1 = max(l["box"][1] + l["box"][3] for l in keep)
        caption_box = (x0, y0, x1 - x0, y1 - y0)

    if caption_box is not None:
        art_h = caption_box[1] - cy
        art_box = (cx, cy, cw, art_h) if art_h >= 0.04 * h else None
        # A caption with no drawing above it is a misread - the "caption" is
        # the part's own artwork. Keep it as art and claim no caption.
        if art_box is None:
            caption_box, art_box, keep = None, content, []
    else:
        art_box = content

    # One box per written line, top to bottom, with any drawn rule trimmed off
    # so the crop handed to OCR holds words and nothing else.
    caption_lines = []
    for l in sorted(keep, key=lambda l: l["box"][1]):
        lx, ly, lw, lh = l["box"]
        skip = _rule_rows(np, typ, l["box"])
        ys = [ly + i for i in range(lh) if (ly + i) not in skip]
        if not ys:
            continue
        caption_lines.append((lx, ys[0], lw, ys[-1] - ys[0] + 1))

    return {
        "contentBox": content,
        "artBox": art_box,
        "captionBox": caption_box,
        "captionLines": caption_lines,
    }


# --------------------------------------------------------------------------
# reading a caption
# --------------------------------------------------------------------------

# Comfortable cap height for tesseract. A caption is set small - 30-50px on a
# 1448px poster - and reads measurably better enlarged to about this.
OCR_TARGET_LINE_PX = 46.0
OCR_MAX_UPSCALE = 4.0
# Page-segmentation modes tried per line, best read wins. 7 is "one text line",
# which is exactly what a caption line is; the others cover a line tesseract
# decides is really two, and one it decides is raw unstructured text.
OCR_LINE_MODES = ("7", "6", "13")
OCR_MIN_WORD_CONF = 25.0


def _looks_like_junk(text):
    """A token with no letters or digits carries no meaning to match on."""
    alnum = sum(1 for c in text if c.isalnum())
    return alnum == 0 or (len(text) > 2 and alnum < 0.4 * len(text))


def _read_line(pytesseract, Output, np, cv2, crop_rgb):
    """Best available read of one crop known to hold a single line of type."""
    h, w = crop_rgb.shape[:2]
    if h < 2 or w < 2:
        return None
    s = max(1.0, min(OCR_MAX_UPSCALE, OCR_TARGET_LINE_PX / float(h)))
    if s > 1.001:
        crop_rgb = cv2.resize(crop_rgb, (int(w * s), int(h * s)), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2GRAY)
    # Words within this much of each other vertically are on the same line.
    # Measured against THIS crop rather than a fixed number of pixels: a crop is
    # only ever one written line, so a little over half its height cannot span
    # two - whereas a constant sized for a 1000px-wide poster splits the same
    # caption into several rows on a 3000px one, and the words come back
    # reordered ("baad mein woh mehenga ho jaata hai, aur").
    band = max(8, int(0.55 * crop_rgb.shape[0]))

    best = None
    for psm in OCR_LINE_MODES:
        try:
            data = pytesseract.image_to_data(
                gray, config="--oem 1 --psm {}".format(psm), output_type=Output.DICT)
        except Exception:
            continue
        words = []
        for i in range(len(data.get("text", []))):
            txt = (data["text"][i] or "").strip()
            if not txt:
                continue
            try:
                conf = float(data["conf"][i])
            except (TypeError, ValueError):
                continue
            if conf < OCR_MIN_WORD_CONF or _looks_like_junk(txt):
                continue
            words.append((int(data["left"][i]), int(data["top"][i]), txt, conf))
        if not words:
            continue
        # Left to right, banded by row so a mode that split the crop into two
        # lines still returns them in the order they are written.
        words.sort(key=lambda t: (t[1] // band, t[0]))
        text = " ".join(t[2] for t in words)
        conf = float(np.mean([t[3] for t in words]))
        # Longer wins ties: a mode that dropped half the line can be very
        # confident about the half it kept, and that is the failure to avoid.
        score = conf * (len(text) ** 0.3)
        if best is None or score > best["score"]:
            best = {"text": text, "conf": round(conf, 1), "psm": psm, "score": score,
                    "wordCount": len(words)}
    return best


def read_caption(pytesseract, Output, np, cv2, arr_rgb, line_boxes, pad=4):
    """The verbatim caption, read line by line and joined in writing order."""
    if not line_boxes:
        return None
    h, w = arr_rgb.shape[:2]
    texts, confs, modes = [], [], []
    for (x, y, bw, bh) in line_boxes:
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(w, x + bw + pad), min(h, y + bh + pad)
        got = _read_line(pytesseract, Output, np, cv2, arr_rgb[y0:y1, x0:x1])
        if not got:
            continue
        texts.append(got["text"])
        confs.append(got["conf"])
        modes.append(got["psm"])
    if not texts:
        return None
    return {
        "text": " ".join(texts),
        "lines": texts,
        "conf": round(float(np.mean(confs)), 1),
        "psm": "+".join(modes),
    }


# --------------------------------------------------------------------------
# decomposition strength
# --------------------------------------------------------------------------
#
# One knob the user sets before a batch is decomposed, because the right answer
# genuinely differs by intent and no single setting serves all three:
#
#   low       The design system's own unit of meaning. A part is ONE element -
#             "a collage part is addressed as ONE element by its caption text,
#             never decomposed into the objects drawn inside it" - so a 3-part
#             poster yields exactly 3 animatable parts plus their 3 captions.
#   standard  The part, plus the handful of objects actually drawn in it. Enough
#             to animate a scene, not so many that the timeline is unreadable.
#   high      Every distinct shape in the part, down to the props and accents.
#
# `close` is the fraction of the zone's short edge that strokes are welded
# across: large joins a hatched drawing into one object, small keeps its pieces
# apart. `minArea` is the share of the ZONE (not the page) below which a
# fragment is speckle. Both are relative, so they behave the same on a 1000px
# poster and a 4000px one.

STRENGTH_PROFILES = {
    "low": {
        "subObjects": False,
        "close": 0.0, "minArea": 0.0, "mergeGap": 0.0, "clusterGap": 0.0,
        "maxPerZone": 0, "maxLayers": 24,
    },
    "standard": {
        "subObjects": True,
        "close": 0.016, "minArea": 0.010, "mergeGap": 0.030, "clusterGap": 0,
        "maxAreaFrac": 0.42, "mergeOverlaps": False,
        "maxPerZone": 5, "maxLayers": 48,
    },
    "high": {
        "subObjects": True,
        "close": 0.006, "minArea": 0.0022, "mergeGap": 0.010, "clusterGap": 0,
        "maxAreaFrac": 0.55, "mergeOverlaps": False,
        "maxPerZone": 24, "maxLayers": 140,
    },
}

DEFAULT_STRENGTH = "low"


def resolve_strength(name):
    """The named profile, falling back to `low` for anything unrecognised."""
    key = (name or "").strip().lower()
    if key not in STRENGTH_PROFILES:
        key = DEFAULT_STRENGTH
    profile = dict(STRENGTH_PROFILES[key])
    profile["name"] = key
    return profile


# --------------------------------------------------------------------------
# the whole read, as items the layer builder consumes
# --------------------------------------------------------------------------

def _union_box(a, b):
    if a is None:
        return b
    if b is None:
        return a
    x0 = min(a[0], b[0])
    y0 = min(a[1], b[1])
    x1 = max(a[0] + a[2], b[0] + b[2])
    y1 = max(a[1] + a[3], b[1] + b[3])
    return (x0, y0, x1 - x0, y1 - y0)


def find_zones(np, arr_rgb):
    """The grid, read before anything is allowed to retouch the pixels.

    Deliberately separate from `decompose` so the caller can run it on the
    image exactly as uploaded. The watermark pass that follows inpaints a band
    across the bottom of the poster, and the design system draws the handle's
    own thin rule inside that band - erase it first and the last part's zone
    runs on to the foot of the page, taking the handle for its caption.
    """
    h, w = arr_rgb.shape[:2]
    bg, _share = page_background(np, arr_rgb)
    drawn = (page_distance(np, arr_rgb, bg) > PAGE_TOLERANCE).astype(np.uint8)
    return zone_boxes(np, drawn, w, h)


def decompose(np, cv2, arr_rgb, profile, zones=None, ocr=None, detect_objects=None):
    """Read a collage poster into parts, captions and (optionally) sub-objects.

    `ocr` is (pytesseract, Output) or None; `detect_objects` is a callable
    (arr_rgb, tune) -> [{box, objectType, role, ...}] used only above `low`,
    so this module stays free of the classifier's own dependencies.

    Returns (items, meta), or (None, meta) when the poster is not a collage -
    the caller then runs its own general-purpose decomposition instead of
    having a grid forced onto a layout that does not have one.
    """
    h, w = arr_rgb.shape[:2]
    bg, bg_share = page_background(np, arr_rgb)
    dist = page_distance(np, arr_rgb, bg)
    drawn = (dist > PAGE_TOLERANCE).astype(np.uint8)
    typ = type_mask(np, arr_rgb, dist, bg)

    boxes, geometry = zones if zones is not None else zone_boxes(np, drawn, w, h)
    meta = {
        "grid": geometry["grid"],
        "pageColor": "#{:02X}{:02X}{:02X}".format(int(bg[0]), int(bg[1]), int(bg[2])),
        "pageShare": round(bg_share, 3),
        "horizontalRules": len(geometry["hRules"]),
        "verticalRules": len(geometry["vRules"]),
        "strength": profile["name"],
    }
    if not boxes:
        return None, meta

    items = []
    parts = 0
    captions = 0
    sub_objects = 0

    for index, zone in enumerate(boxes):
        read = read_zone(np, cv2, arr_rgb, dist, drawn, typ, zone, w, h)
        if read is None:
            continue

        art = read["artBox"]
        caption_box = read["captionBox"]
        part_box = _union_box(art, caption_box) or read["contentBox"]

        caption_text = ""
        caption_read = None
        if ocr is not None and read["captionLines"]:
            caption_read = read_caption(ocr[0], ocr[1], np, cv2, arr_rgb, read["captionLines"])
            if caption_read:
                caption_text = caption_read["text"]

        part = {
            "box": part_box,
            "kind": "graphic",
            "objectType": "collage-part",
            "objectRole": "collage-part",
            "hasBackground": True,
            "collagePartIndex": index,
            "collageCaption": caption_text,
            "artBox": art,
            "captionBox": caption_box,
            "children": [],
        }
        items.append(part)
        parts += 1

        # The caption is its own element - the script CSV is matched against
        # its literal words - but never its own animation: it is part of what
        # the reader sees as one card, so it travels with the drawing above it
        # rather than sliding in on a beat of its own.
        if caption_box is not None and caption_read is not None:
            items.append({
                "box": caption_box,
                "kind": "text",
                "objectType": "part-caption",
                "objectRole": "part-caption",
                "hasBackground": True,
                "boundTo": index,
                "collagePartIndex": index,
                "captionRead": caption_read,
                "captionLines": read["captionLines"],
            })
            captions += 1

        if not profile["subObjects"] or detect_objects is None or art is None:
            continue

        ax, ay, aw, ah = art
        if aw < 24 or ah < 24:
            continue
        found = detect_objects(arr_rgb[ay:ay + ah, ax:ax + aw], profile) or []
        for obj in found[: profile["maxPerZone"]]:
            ox, oy, ow, oh = obj["box"]
            child = dict(obj)
            child.update({
                "box": (ax + ox, ay + oy, ow, oh),
                "kind": "graphic",
                "objectRole": obj.get("role") or "object",
                "partIndex": index,
                "hasBackground": False,
            })
            part["children"].append(child)
            items.append(child)
            sub_objects += 1

    meta.update({
        "collageParts": parts,
        "captions": captions,
        "subObjects": sub_objects,
    })
    return items, meta
