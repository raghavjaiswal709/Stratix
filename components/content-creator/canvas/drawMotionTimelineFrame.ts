import type { ActiveOverlayState, LayerState, SceneRenderState, TimelineFrame } from "@/lib/motion-timeline";
import { REST_LAYER_STATE } from "@/lib/motion-timeline";
import type { MotionLayer, MotionSlide, PosterElement } from "../types";
import { drawVideoCover, rrect } from "./canvasUtils";

/**
 * Timeline-driven frame renderer.
 *
 * The procedural renderer (drawMotionVideoPoster) derives motion from the
 * clock itself, so it can only ever loop. This one is handed a fully sampled
 * frame — every element's opacity/offset/scale/rotation/blur/reveal already
 * resolved for this exact millisecond — and just paints it. All the sync lives
 * upstream in the timeline; nothing here knows what time it is.
 */

export interface TimelineRenderAssets {
  slides: MotionSlide[];
  /** slideId → layerId → decoded <img>. */
  layerImgEls: Record<string, Record<string, HTMLImageElement>>;
  /** image URL → decoded <img>, for slide backgrounds. */
  bgImgs: Record<string, HTMLImageElement>;
  /** Overlay clip id → its <video>, kept playing/seeked in sync by the caller. */
  overlayVideoEls: Record<string, HTMLVideoElement>;
}

export interface TimelineRenderOptions {
  activeLayerId?: string;
  showSelection?: boolean;
  /**
   * Word-level transcript, for the burnt-in captions and for lighting the
   * intro card word by word. Optional — nothing else in the renderer needs it.
   */
  words?: Array<{ text: string; startMs: number; endMs: number }>;
  captions?: boolean;
  /** Draws a white "cut paper" margin behind every collage-part layer. */
  paperCutStyle?: boolean;
  /**
   * On by default. Every decomposed part holds its rest position, scale and
   * rotation — a track's xPct/yPct/scale/rotate keyframes are ignored — so
   * the collage reads as one photo with the camera moving over it instead of
   * its cut-out pieces drifting apart from each other. Graphics keep their
   * opacity/wipe entrance on top of that held position. Text goes further
   * still: a caption is treated as baked into the artwork, not as an element
   * with its own cue, so it ignores opacity/wipe/blur too and is simply
   * present at rest from frame 0 — never fades or wipes in, never moves on
   * its own. Camera pan/zoom is untouched either way, for every layer
   * including text, since that is what "the whole image" moving means.
   */
  wholeImageMotion?: boolean;
  /**
   * On by default. Every non-text (graphic/photo) layer gets a small,
   * continuous rotational wobble — a deterministic per-layer "dance" in
   * place, no drift — layered on top of whatever wholeImageMotion allows.
   * Text layers are never wobbled. See zigzagWobbleDeg.
   */
  zigzagMotion?: boolean;
  /**
   * Off by default. A collage-part's own caption strip is baked into that
   * part's cut-out pixels — see the animatable:false "part-caption" layer
   * bound to it, whose words are still what the auto-sync matcher reads.
   * When this is on, that strip is painted over with an opaque cover (sized
   * from the caption layer's own rest position relative to its parent, so it
   * tracks the parent's live rotation/scale/position exactly) purely as a
   * render-time step — nothing about the caption's text or its timing
   * changes, so sync is untouched. See drawCaptionCovers.
   */
  hideImageCaptions?: boolean;
  /**
   * layer id → the timeline ms its entrance was detected at (opacity·wipe
   * crossing up through visible — see ContentCreatorPage's render effect,
   * which is the only thing with frame-to-frame memory to detect that
   * crossing with). A light-streak sweep + flash plays over any layer whose
   * entry is still within ZONE_FLOURISH_MS of here — see drawZoneFlourish —
   * so the "zone appearing" whoosh has something on screen to land on, the
   * same way the scene-level whoosh lands on the motion-streak flash during
   * a scene cut. Position and opacity only, deliberately: no scale, so it
   * never reads as a zoom or a pulse.
   */
  zoneFlourishes?: Record<string, number>;
  /**
   * Burnt-in captions (and the intro card's word-lighting) light up this many
   * ms before the CSV/transcript timing says the word starts — reading a
   * caption takes a beat, so a caption that appears exactly on the word
   * always feels a step behind it. Default 200. Negative delays it instead.
   */
  captionLeadMs?: number;
  /**
   * Id of the single layer currently treated as "the" active zone, or null
   * when none is. Exactly one at a time — see ContentCreatorPage's render
   * effect for how it picks a winner when more than one big zone is on
   * screen at once (most-recently-appeared wins, falling back to any other
   * still-visible big zone if that one leaves). Drawn with
   * drawActiveZoneOverlay, which — unlike zoneFlourishes above — runs for
   * the layer's whole on-screen duration, not just its entrance.
   */
  currentZoneLayerId?: string | null;
}

/** How long the on-entrance sweep-then-flash lasts, in ms, once a zone appears. */
const ZONE_FLOURISH_MS = 340;
/** Share of ZONE_FLOURISH_MS spent on the sweep before the flash takes over. */
const ZONE_FLOURISH_SWEEP_SHARE = 0.55;

/** Dash length/gap for the current-zone rotating border, in unzoomed px. */
const ZONE_ACTIVE_BORDER_DASH = 10;
const ZONE_ACTIVE_BORDER_GAP = 7;
/** How fast the dashes appear to travel around the perimeter, in unzoomed px/sec. */
const ZONE_ACTIVE_BORDER_SPEED = 55;
/** One full corner-to-corner shine sweep, in ms. */
const ZONE_SHINE_PERIOD_MS = 1800;
/** Half-width of the soft shine band, as a fraction of the zone's own diagonal. */
const ZONE_SHINE_BAND_FRACTION = 0.22;

/**
 * Canvas font stack.
 *
 * A CSS custom property is not valid inside the canvas `font` shorthand — the
 * whole assignment is silently dropped and text renders at the 10px default,
 * which on a 1350px frame is invisible. Concrete families only here.
 */
const CANVAS_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Wraps `text` to `maxWidth`, measuring with the context's current font. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((w) => {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/**
 * The series intro: black frame, white type, lit word by word.
 *
 * The words are drawn from the transcript rather than laid out on a timer, so
 * the card reads in step with the voice saying it — the same contract as every
 * other element on screen.
 */
function drawIntroCard(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  text: string,
  timeMs: number,
  words: TimelineRenderOptions["words"],
  alpha: number,
  leadMs: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  const size = Math.round(H * 0.052);
  ctx.font = `700 ${size}px ${CANVAS_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = W * 0.82;
  const lines = wrapLines(ctx, text, maxWidth);
  const lineHeight = size * 1.35;
  const top = H / 2 - ((lines.length - 1) * lineHeight) / 2;

  // How far the narration has got through the card's own text.
  const spoken = words ? words.filter((w) => w.startMs <= timeMs + leadMs).length : Number.MAX_SAFE_INTEGER;
  let index = 0;

  lines.forEach((line, li) => {
    const parts = line.split(" ");
    const widths = parts.map((p) => ctx.measureText(`${p} `).width);
    const total = widths.reduce((a, b) => a + b, 0) - (widths.length ? ctx.measureText(" ").width : 0);
    let x = W / 2 - total / 2;
    const y = top + li * lineHeight;
    parts.forEach((part, pi) => {
      // Words already spoken burn in; the rest sit back, so the card reads
      // ahead without giving the whole line away at once.
      ctx.fillStyle = index < spoken ? "#FFFFFF" : "rgba(255,255,255,0.32)";
      ctx.textAlign = "left";
      ctx.fillText(part, x, y);
      x += widths[pi];
      index++;
    });
  });

  ctx.restore();
}

/** How many words ride together in one caption burst. */
const CAPTION_GROUP_SIZE = 3;
/** A pause this long always starts a new burst — two clauses either side of a breath never share one. */
const CAPTION_GROUP_GAP_MS = 550;

/**
 * Phrase-burst boundaries for the burnt-in captions, memoized per transcript
 * array so a 60fps render loop does not re-walk the whole transcript every
 * frame. `starts[i]` is the index of the first word in word i's burst.
 */
const captionGroupCache = new WeakMap<NonNullable<TimelineRenderOptions["words"]>, number[]>();

function captionGroupStarts(words: NonNullable<TimelineRenderOptions["words"]>): number[] {
  const cached = captionGroupCache.get(words);
  if (cached) return cached;

  const starts: number[] = new Array(words.length);
  let groupStart = 0;
  for (let i = 0; i < words.length; i++) {
    if (i > groupStart) {
      const gap = words[i].startMs - words[i - 1].endMs;
      if (i - groupStart >= CAPTION_GROUP_SIZE || gap > CAPTION_GROUP_GAP_MS) groupStart = i;
    }
    starts[i] = groupStart;
  }
  captionGroupCache.set(words, starts);
  return starts;
}

/**
 * Burnt-in captions: a couple-word burst at a time, on an opaque black
 * banner spanning the full top of the frame — edge to edge on the left,
 * right and top, so it reads as a title-safe area built into the video
 * rather than a label sitting on it. Only the bottom edge follows the
 * text, so the banner is exactly as tall as the current burst needs. Fixed
 * at the same spot whether that is inside the letterbox bar (a slide
 * shorter than the 9:16 canvas) or directly over a slide that already
 * fills it, since the banner is what the caption reads against now, not
 * whatever happens to be behind it. The whole burst stays on screen
 * together; only the word actually being spoken lights up full white, the
 * rest of its burst rides along faded, so it reads as one phrase with a
 * moving highlight rather than a word-by-word timer.
 */
function drawCaption(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  timeMs: number,
  words: NonNullable<TimelineRenderOptions["words"]>,
  leadMs: number
) {
  // Reading ahead of the transcript by leadMs, so a caption always lands a
  // beat before the word rather than exactly on it — see captionLeadMs.
  const t = timeMs + leadMs;

  // The word being spoken now, or the one just spoken while a gap runs.
  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].startMs > t) break;
    idx = i;
  }
  if (idx < 0) return;

  const starts = captionGroupStarts(words);
  const groupStart = starts[idx];
  let groupEnd = idx;
  while (groupEnd + 1 < words.length && starts[groupEnd + 1] === groupStart) groupEnd++;

  // Do not leave the last burst hanging through a long silence.
  if (t > words[groupEnd].endMs + 700) return;

  const phrase = words.slice(groupStart, groupEnd + 1).map((w) => w.text.trim());
  if (!phrase.some(Boolean)) return;
  const activeIdx = idx - groupStart;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Shrink to fit rather than wrap — a caption burst reads best as one line.
  // The banner itself is always the full frame width regardless, so this is
  // purely about not letting the text touch the very edges.
  let size = Math.round(H * 0.042);
  ctx.font = `italic 800 ${size}px ${CANVAS_FONT_STACK}`;
  const widthOf = (list: string[]) =>
    list.reduce((sum, w) => sum + ctx.measureText(w).width, 0) + ctx.measureText(" ").width * Math.max(0, list.length - 1);
  const maxWidth = W * 0.88;
  let total = widthOf(phrase);
  if (total > maxWidth) {
    size = Math.max(10, Math.floor(size * (maxWidth / total)));
    ctx.font = `italic 800 ${size}px ${CANVAS_FONT_STACK}`;
    total = widthOf(phrase);
  }

  // Higher than a hugging pill needed to sit, since the banner now reads as
  // part of the frame's own top edge rather than a chip floating over it.
  const y = H * 0.065;
  const spaceW = ctx.measureText(" ").width;

  // The banner: opaque black, full width, flush with the top — only its
  // bottom edge tracks the text, so it is exactly as tall as this burst
  // needs and no taller.
  const padBottom = size * 0.34;
  const boxH = y + padBottom;

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, boxH);

  let x = W / 2 - total / 2;
  phrase.forEach((word, i) => {
    ctx.globalAlpha = i === activeIdx ? 1 : 0.42;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(word, x, y);
    x += ctx.measureText(word).width + spaceW;
  });

  ctx.restore();
}

/**
 * The caption's "big" treatment while an overlay clip with captionOverlay is
 * active — same word-burst grouping and mid-burst highlight as drawCaption,
 * but centred lower-third, much larger, and on its own rounded semi-opaque
 * backing rather than the fixed opaque top banner. A video's own brightness
 * is unpredictable in a way a slide's authored background never is, so unlike
 * the top banner (which can just be flush and opaque) this one needs a
 * backing that reads over *anything* without pinning it to an edge.
 */
function drawBigOverlayCaption(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  timeMs: number,
  words: NonNullable<TimelineRenderOptions["words"]>,
  leadMs: number
) {
  const t = timeMs + leadMs;

  let idx = -1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].startMs > t) break;
    idx = i;
  }
  if (idx < 0) return;

  const starts = captionGroupStarts(words);
  const groupStart = starts[idx];
  let groupEnd = idx;
  while (groupEnd + 1 < words.length && starts[groupEnd + 1] === groupStart) groupEnd++;
  if (t > words[groupEnd].endMs + 700) return;

  const phrase = words.slice(groupStart, groupEnd + 1).map((w) => w.text.trim());
  if (!phrase.some(Boolean)) return;
  const activeIdx = idx - groupStart;

  ctx.save();

  let size = Math.round(H * 0.06);
  ctx.font = `italic 800 ${size}px ${CANVAS_FONT_STACK}`;
  const maxWidth = W * 0.86;
  const widthOf = (list: string[]) =>
    list.reduce((sum, w) => sum + ctx.measureText(w).width, 0) + ctx.measureText(" ").width * Math.max(0, list.length - 1);
  let total = widthOf(phrase);
  if (total > maxWidth) {
    size = Math.max(16, Math.floor(size * (maxWidth / total)));
    ctx.font = `italic 800 ${size}px ${CANVAS_FONT_STACK}`;
    total = widthOf(phrase);
  }

  const y = H * 0.78;
  const padX = size * 0.9;
  const padY = size * 0.55;
  const boxW = Math.min(W * 0.94, total + padX * 2);
  const boxH = size + padY * 2;

  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  rrect(ctx, W / 2 - boxW / 2, y - boxH / 2, boxW, boxH, boxH * 0.22);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const spaceW = ctx.measureText(" ").width;
  let x = W / 2 - total / 2;
  phrase.forEach((word, i) => {
    ctx.globalAlpha = i === activeIdx ? 1 : 0.5;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(word, x, y);
    x += ctx.measureText(word).width + spaceW;
  });

  ctx.restore();
}

const ready = (img: HTMLImageElement | undefined | null): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/** Camera is scale-about-centre plus a pan, so a rect maps to a rect exactly. */
function makeCameraMap(W: number, H: number, camera: SceneRenderState["camera"]) {
  const z = camera.zoom;
  const panX = (camera.panXPct / 100) * W;
  const panY = (camera.panYPct / 100) * H;
  return {
    x: (x: number) => (x - W / 2 - panX) * z + W / 2,
    y: (y: number) => (y - H / 2 - panY) * z + H / 2,
    z,
    panX,
    panY,
  };
}

/** Points for a jagged line from (x, yStart) to (x, yEnd), alternating ±amp either side of x. */
function zigzagRun(x: number, yStart: number, yEnd: number, teeth: number, amp: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const step = (yEnd - yStart) / teeth;
  for (let i = 0; i <= teeth; i++) {
    const y = yStart + step * i;
    const d = i === 0 || i === teeth ? 0 : i % 2 === 1 ? amp : -amp;
    pts.push([x + d, y]);
  }
  return pts;
}

/**
 * The torn-paper edge for `zigzagIn`/`zigzagOut`.
 *
 * Same contract as applyWipeClip — clips to the revealed fraction of the
 * element — but the boundary that is actually sweeping across is cut jagged
 * instead of straight, so a decomposed graphic reads as a sheet being slid
 * into place rather than a window opening on it.
 */
function applyZigzagClip(
  ctx: CanvasRenderingContext2D,
  state: LayerState,
  left: number,
  top: number,
  width: number,
  height: number
) {
  const reveal = state.wipe;
  const teethV = Math.max(3, Math.round(height / 22));
  const ampV = Math.min(18, Math.max(3, width * 0.03));
  const teethH = Math.max(3, Math.round(width / 22));
  const ampH = Math.min(18, Math.max(3, height * 0.03));

  ctx.beginPath();
  switch (state.wipeFrom) {
    case "right": {
      const edgeX = left + width * (1 - reveal);
      ctx.moveTo(left + width, top);
      zigzagRun(edgeX, top, top + height, teethV, ampV).forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(left + width, top + height);
      break;
    }
    // top/bottom run the same helper on the other axis — zigzagRun's own
    // (x, yStart, yEnd) become (edgeY, left, left+width) here, so its [x, y]
    // output is actually [y, x] in canvas terms; the destructure below undoes
    // that swap rather than duplicating the loop horizontally.
    case "top": {
      const edgeY = top + height * reveal;
      ctx.moveTo(left, top);
      zigzagRun(edgeY, left, left + width, teethH, ampH).forEach(([y, x]) => ctx.lineTo(x, y));
      ctx.lineTo(left + width, top);
      break;
    }
    case "bottom": {
      const edgeY = top + height * (1 - reveal);
      ctx.moveTo(left, top + height);
      zigzagRun(edgeY, left, left + width, teethH, ampH).forEach(([y, x]) => ctx.lineTo(x, y));
      ctx.lineTo(left + width, top + height);
      break;
    }
    case "left":
    default: {
      const edgeX = left + width * reveal;
      ctx.moveTo(left, top);
      zigzagRun(edgeX, top, top + height, teethV, ampV).forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(left, top + height);
      break;
    }
  }
  ctx.closePath();
  ctx.clip();
}

function applyWipeClip(
  ctx: CanvasRenderingContext2D,
  state: LayerState,
  left: number,
  top: number,
  width: number,
  height: number
) {
  if (state.wipe >= 0.999) return;
  if (state.wipeStyle === "zigzag") {
    applyZigzagClip(ctx, state, left, top, width, height);
    return;
  }
  const w = Math.max(0, width * state.wipe);
  const h = Math.max(0, height * state.wipe);
  ctx.beginPath();
  switch (state.wipeFrom) {
    case "right":
      ctx.rect(left + width - w, top, w, height);
      break;
    case "top":
      ctx.rect(left, top, width, h);
      break;
    case "bottom":
      ctx.rect(left, top + height - h, width, h);
      break;
    case "left":
    default:
      ctx.rect(left, top, w, height);
      break;
  }
  ctx.clip();
}

/**
 * The white "cut paper" margin behind a collage-part layer, on when
 * paperCutStyle is on. Sized off the layer's own footprint so it scales with
 * the block rather than the canvas, and drawn before the image so the image
 * sits on top of it like a photo dropped onto its own backing card.
 */
export function drawPaperFrame(ctx: CanvasRenderingContext2D, left: number, top: number, width: number, height: number) {
  const margin = Math.max(6, Math.round(Math.min(width, height) * 0.035));
  const radius = Math.max(2, margin * 0.4);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = margin * 1.4;
  ctx.shadowOffsetY = margin * 0.5;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(left - margin, top - margin, width + margin * 2, height + margin * 2, radius);
  ctx.fill();
  ctx.restore();
}

/**
 * The visual half of the "zone appearing" whoosh — sound half in
 * ContentCreatorPage's render effect — over a layer that just appeared.
 * Two beats, both confined to the layer's own footprint and drawn before its
 * clip/image so an in-progress wipe reveal never cuts either one off:
 *
 *   1. A light streak sweeps left → right across the layer — a miniature of
 *      the scene-transition's own direction, never the reverse.
 *   2. As the streak clears the right edge, a quick flash lands and fades.
 *
 * Position and opacity only — nothing here ever touches scale, so it can
 * never read as a pulse or a zoom.
 */
function drawZoneFlourish(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
  progress: number
) {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();

  if (progress < ZONE_FLOURISH_SWEEP_SHARE) {
    const sp = progress / ZONE_FLOURISH_SWEEP_SHARE;
    const bandW = Math.max(width * 0.4, 24);
    // Runs fully clear of the box on both ends so the streak reads as
    // passing through rather than materialising inside it.
    const x = left - bandW + sp * (width + bandW * 2);
    const grad = ctx.createLinearGradient(x, 0, x + bandW, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(left, top, width, height);
  }

  const flashStart = ZONE_FLOURISH_SWEEP_SHARE - 0.08;
  if (progress >= flashStart) {
    const fp = Math.min(1, (progress - flashStart) / (1 - flashStart));
    // Sharp rise, slower fade — a landing hit, not a breathing glow.
    const flashAlpha = fp < 0.25 ? fp / 0.25 : 1 - (fp - 0.25) / 0.75;
    if (flashAlpha > 0.01) {
      ctx.globalAlpha = flashAlpha * 0.75;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(left, top, width, height);
    }
  }

  ctx.restore();
}

/**
 * The persistent "this is the current zone" treatment — unlike drawZoneFlourish
 * above (a brief one-shot entrance beat drawn *before* the clip/image so an
 * in-progress wipe never cuts it off), this has to stay visible for the
 * zone's entire on-screen duration, so it is painted *after* ctx.drawImage
 * instead: once a wipe finishes revealing, the opaque drawImage call would
 * otherwise paint straight over anything drawn earlier in the layer's own
 * save/restore block. Two parts, both confined to the zone's exact rectangle
 * — no outset, unlike the padded purple editor-selection box below:
 *
 *   1. A thin black dashed border traced exactly on the rect's own edge, its
 *      dash offset animating continuously so it reads as rotating around the
 *      perimeter forever.
 *   2. A soft diagonal white shine swept from the top-left corner to the
 *      bottom-right, clipped to the rect, looping forever.
 *
 * Both are pure functions of timeMs (see zigzagWobbleDeg for the same
 * contract), so they play back identically in live preview and in the
 * exported file with no extra wiring.
 */
function drawActiveZoneOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  timeMs: number,
  camZoom: number
) {
  if (w <= 0 || h <= 0) return;

  // 1. Rotating border — exact bounds, thin, zoom-compensated so it reads as
  // the same on-screen thickness at any camera zoom.
  ctx.save();
  ctx.globalAlpha = 1;
  const dash = ZONE_ACTIVE_BORDER_DASH / camZoom;
  const gap = ZONE_ACTIVE_BORDER_GAP / camZoom;
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2 / camZoom;
  ctx.setLineDash([dash, gap]);
  ctx.lineDashOffset = -((timeMs / 1000) * ZONE_ACTIVE_BORDER_SPEED) % (dash + gap);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  // 2. Diagonal shine — clipped to the exact rect, swept along the true
  // top-left→bottom-right diagonal so it always travels corner to corner
  // regardless of the zone's own aspect ratio.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const diag = Math.hypot(w, h);
  const band = Math.max(1, diag * ZONE_SHINE_BAND_FRACTION);
  const loopT = (timeMs % ZONE_SHINE_PERIOD_MS) / ZONE_SHINE_PERIOD_MS;
  const pos = -band + loopT * (diag + 2 * band);
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(h, w));
  const grad = ctx.createLinearGradient(pos - band, 0, pos + band, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  // Generously oversized so the band fully covers the rect after the
  // rotation above no matter its aspect ratio — the clip is what actually
  // keeps the shine inside the zone's own edges.
  ctx.fillRect(-diag, -diag, diag * 3, diag * 3);
  ctx.restore();
}

/**
 * Paints over a collage-part's own baked-in caption strip(s) — the opposite
 * of drawing something new, so it must be called from inside the exact same
 * local coordinate space (and, critically, the same clip path from
 * applyWipeClip) that the parent's own drawImage call just used, whether
 * that space is rotated or not. `left`/`top`/`curW`/`curH` are that space's
 * own draw rectangle, unchanged from what the caller just handed drawImage.
 *
 * The cover's own rectangle is computed once from each caption's REST
 * position as a fraction of its parent's REST position — both static,
 * authored values — rather than from any live pixel measurement, so it
 * tracks the parent's actual live scale/rotation/position for free: the
 * fraction is constant, only the space it is applied in moves. Filled with
 * the caption layer's own detected paper colour (see captionBounds /
 * artBounds in scripts/motion_segment.py), with a small uniform overscan so
 * a sub-pixel rounding gap at the split can never leave a sliver showing.
 */
function drawCaptionCovers(
  ctx: CanvasRenderingContext2D,
  parent: MotionLayer,
  captions: MotionLayer[],
  left: number,
  top: number,
  curW: number,
  curH: number
) {
  if (!parent.w || !parent.h) return;
  const padX = curW * 0.006;
  const padY = curH * 0.006;

  captions.forEach((caption) => {
    const relX = (caption.x - parent.x) / parent.w;
    const relY = (caption.y - parent.y) / parent.h;
    const relW = caption.w / parent.w;
    const relH = caption.h / parent.h;

    ctx.fillStyle = caption.backgroundColor || "#F5F5F5";
    ctx.fillRect(
      left + relX * curW - padX,
      top + relY * curH - padY,
      relW * curW + padX * 2,
      relH * curH + padY * 2
    );
  });
}

/** Cheap deterministic string hash → [0,1), so a layer's own wobble is stable across seeks, replays and exports rather than reseeding every frame. */
function hashUnit(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * A small, continuous rotational "dance" for one graphic layer — a pure
 * function of time rather than a random walk, so scrubbing the timeline or
 * exporting reproduces the exact same shake every time. Each layer draws its
 * own period (1-2s) and amplitude (5-10deg) from a hash of its id, so a batch
 * of parts doesn't shake in lockstep; summing two incommensurate frequencies
 * and sharpening the wave (more time near the extremes, a snap through the
 * middle) keeps it reading as an irregular shake rather than a smooth,
 * metronomic sway. Pure rotation — never touches position or scale.
 */
function zigzagWobbleDeg(layerId: string, timeMs: number): number {
  const periodMs = 1000 + hashUnit(layerId + ":period") * 1000;
  const ampDeg = 5 + hashUnit(layerId + ":amp") * 5;
  const phase = hashUnit(layerId + ":phase") * Math.PI * 2;
  const w = (Math.PI * 2) / periodMs;
  const s = Math.sin(timeMs * w + phase) * 0.7 + Math.sin(timeMs * w * 2.37 - phase) * 0.3;
  const sharp = Math.sign(s) * Math.pow(Math.abs(s), 0.6);
  return sharp * ampDeg;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: SceneRenderState,
  timeMs: number,
  assets: TimelineRenderAssets,
  opts: TimelineRenderOptions,
  collectBounds: boolean
): PosterElement[] {
  const slide = assets.slides[scene.slideIndex];
  if (!slide) return [];

  const sw = slide.width || W;
  const sh = slide.height || H;
  // Slides in a batch are normally identical in size, so this is a no-op; when
  // they are not, contain-fit keeps every element registered with its own
  // background instead of stretching one slide to another's aspect ratio.
  const fit = Math.min(W / sw, H / sh);
  const originX = (W - sw * fit) / 2;
  const originY = (H - sh * fit) / 2;

  const cam = makeCameraMap(W, H, scene.camera);
  const bounds: PosterElement[] = [];

  ctx.save();
  ctx.globalAlpha = scene.alpha;
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-W / 2 - cam.panX, -H / 2 - cam.panY);

  // 1. Background — animatable like any other element (dim it, drift it, blur
  //    it behind a foreground beat) but never selectable.
  const flatImg = slide.originalUrl ? assets.bgImgs[slide.originalUrl] : null;
  const bgUrl = slide.backgroundUrl || slide.originalUrl;
  // The punched-out background is preferred, but the flattened poster stands in
  // while it is still decoding — anything is better than a hole.
  const bgImg = ready(bgUrl ? assets.bgImgs[bgUrl] : null) ? assets.bgImgs[bgUrl!] : flatImg;
  const bg = scene.background;

  const paintBase = (image: HTMLImageElement) => {
    const bw = sw * fit * bg.scale;
    const bh = sh * fit * bg.scale;
    const bx = originX - (bw - sw * fit) / 2 + (bg.xPct / 100) * W;
    const by = originY - (bh - sh * fit) / 2 + (bg.yPct / 100) * H;
    ctx.save();
    ctx.globalAlpha = scene.alpha * bg.opacity;
    if (bg.blur > 0.01) ctx.filter = `blur(${bg.blur}px)`;
    ctx.drawImage(image, bx, by, bw, bh);
    ctx.restore();
  };

  const perSlide = assets.layerImgEls[slide.slideId] || {};
  const allLayers = slide.layers || [];

  // A slide whose cut-outs have not all decoded cannot be composited: the
  // background has holes exactly where those elements belong, so drawing the
  // ready ones leaves gaps in the poster. The flattened original is the same
  // artwork with nothing missing, so it is painted whole instead — the frame
  // still moves with the camera, it simply holds until the pieces arrive.
  const incomplete = allLayers.some((l) => l.imageUrl && !ready(perSlide[l.id]));
  if (incomplete) {
    if (ready(flatImg)) paintBase(flatImg);
    else if (ready(bgImg)) paintBase(bgImg);
    ctx.restore();
    return [];
  }

  if (ready(bgImg) && bg.opacity > 0.001) paintBase(bgImg);

  // 2. Elements, in the z-order the decomposer assigned.
  const ordered = [...allLayers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  // Collage-part id → the caption layer(s) bound to it, only built when the
  // toggle is actually on. The matcher upstream still reads every caption's
  // own text/timing completely unchanged — this only decides what gets
  // painted over it, after the fact, at render time.
  const captionsByParent = new Map<string, MotionLayer[]>();
  if (opts.hideImageCaptions) {
    allLayers.forEach((l) => {
      if (l.animatable === false && l.boundTo) {
        const arr = captionsByParent.get(l.boundTo);
        if (arr) arr.push(l);
        else captionsByParent.set(l.boundTo, [l]);
      }
    });
  }

  const wholeImageMotionOn = opts.wholeImageMotion !== false;

  const isBigCollageElement = (layer: MotionLayer): boolean => {
    const area = (layer.w ?? 0) * (layer.h ?? 0);
    const objType = layer.objectType || "";
    if (objType === "collage-part" || objType === "photo" || objType === "illustration" || objType === "panel" || objType === "banner") {
      return true;
    }
    return area >= 0.10;
  };

  ordered.forEach((layer: MotionLayer) => {
    const img = perSlide[layer.id];
    if (!ready(img)) return;
    // A part's caption is already inside that part's own cut-out. It is a
    // layer so its words are addressable, not so it can be painted a second
    // time — drawing it again would double its edges the moment the part it
    // belongs to moves out from under it.
    if (layer.animatable === false) return;

    const isTextLayer = layer.type === "text";
    const isBig = isBigCollageElement(layer);
    const HIDDEN_LAYER_STATE: LayerState = { ...REST_LAYER_STATE, opacity: 0 };

    // Under wholeImageMotion:
    // Small elements (icons, badges, small text) stay static at rest from frame 0.
    // Bigger elements (collage parts, photos, panels, illustrations) appear and move
    // according to their CSV timeline sync!
    const isSmallStatic = wholeImageMotionOn && !isBig;
    const state = isSmallStatic
      ? REST_LAYER_STATE
      : scene.layers[layer.id] ?? (isTextLayer ? REST_LAYER_STATE : HIDDEN_LAYER_STATE);
    if (state.opacity <= 0.001) return;

    const restLeft = originX + layer.x * sw * fit;
    const restTop = originY + layer.y * sh * fit;
    const baseW = Math.max(1, layer.w * sw * fit * (layer.scale ?? 1));
    const baseH = Math.max(1, layer.h * sh * fit * (layer.scale ?? 1));

    // Small elements hold still at rest under wholeImageMotion.
    // Bigger collage elements move (scale, xPct, yPct, rotate) according to CSV timeline cues.
    const partScale = isSmallStatic ? 1 : state.scale;
    const partXPct = isSmallStatic ? 0 : state.xPct;
    const partYPct = isSmallStatic ? 0 : state.yPct;
    const partRotate = isSmallStatic ? 0 : state.rotate;

    // A small ambient rotational shake for graphic parts only — independent
    // of wholeImageMotion, additive on top of it. See zigzagWobbleDeg.
    const zigzagOn = opts.zigzagMotion !== false && !isTextLayer;
    const wobbleDeg = zigzagOn ? zigzagWobbleDeg(layer.id, timeMs) : 0;

    const curW = Math.max(1, baseW * partScale);
    const curH = Math.max(1, baseH * partScale);
    // Scale about the element's own centre, then displace.
    const left = restLeft - (curW - baseW) / 2 + (partXPct / 100) * W;
    const top = restTop - (curH - baseH) / 2 + (partYPct / 100) * H;
    const rot = ((layer.rotation ?? 0) + partRotate + wobbleDeg) * (Math.PI / 180);

    ctx.save();
    ctx.globalAlpha = scene.alpha * state.opacity * (layer.opacity ?? 1);
    if (state.blur > 0.01) ctx.filter = `blur(${state.blur}px)`;

    const isPaperCutPart = !!opts.paperCutStyle && layer.objectType === "collage-part";

    const flourishStart = opts.zoneFlourishes?.[layer.id];
    const sinceFlourish = flourishStart != null ? timeMs - flourishStart : Infinity;
    const flourishProgress = sinceFlourish >= 0 && sinceFlourish < ZONE_FLOURISH_MS ? sinceFlourish / ZONE_FLOURISH_MS : -1;

    const boundCaptions = captionsByParent.get(layer.id);

    if (rot !== 0) {
      ctx.translate(left + curW / 2, top + curH / 2);
      ctx.rotate(rot);
      if (flourishProgress >= 0) drawZoneFlourish(ctx, -curW / 2, -curH / 2, curW, curH, flourishProgress);
      if (isPaperCutPart) drawPaperFrame(ctx, -curW / 2, -curH / 2, curW, curH);
      applyWipeClip(ctx, state, -curW / 2, -curH / 2, curW, curH);
      ctx.drawImage(img, -curW / 2, -curH / 2, curW, curH);
      if (boundCaptions) drawCaptionCovers(ctx, layer, boundCaptions, -curW / 2, -curH / 2, curW, curH);
    } else {
      if (flourishProgress >= 0) drawZoneFlourish(ctx, left, top, curW, curH, flourishProgress);
      if (isPaperCutPart) drawPaperFrame(ctx, left, top, curW, curH);
      applyWipeClip(ctx, state, left, top, curW, curH);
      ctx.drawImage(img, left, top, curW, curH);
      if (boundCaptions) drawCaptionCovers(ctx, layer, boundCaptions, left, top, curW, curH);
    }
    ctx.restore();

    if (opts.currentZoneLayerId === layer.id) {
      ctx.save();
      if (rot !== 0) {
        ctx.translate(left + curW / 2, top + curH / 2);
        ctx.rotate(rot);
        drawActiveZoneOverlay(ctx, -curW / 2, -curH / 2, curW, curH, timeMs, cam.z);
      } else {
        drawActiveZoneOverlay(ctx, left, top, curW, curH, timeMs, cam.z);
      }
      ctx.restore();
    }

    if (collectBounds) {
      // Bounds are consumed by the DOM overlay, which lives outside the canvas
      // transform — so hand back post-camera coordinates.
      bounds.push({
        id: layer.id,
        label: layer.name || "Decomposed Element",
        x: cam.x(left),
        y: cam.y(top),
        w: curW * cam.z,
        h: curH * cam.z,
      });
    }

    if (collectBounds && opts.showSelection && opts.activeLayerId === layer.id) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#A855F7";
      ctx.lineWidth = 2.5 / cam.z;
      ctx.setLineDash([6 / cam.z, 4 / cam.z]);
      ctx.strokeRect(left - 3, top - 3, curW + 6, curH + 6);
      ctx.restore();
    }
  });

  ctx.restore();
  return bounds;
}

/** An overlay whose <video> hasn't decoded a first frame yet paints nothing, rather than a stale or black frame. */
function drawOverlayClip(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  overlay: ActiveOverlayState,
  assets: TimelineRenderAssets
) {
  const video = assets.overlayVideoEls[overlay.id];
  if (!video || video.readyState < 2) return;
  ctx.save();
  drawVideoCover(ctx, video, W, H);
  ctx.restore();
}

/**
 * `overlays` is already ascending by zIndex (see sample.ts's activeOverlaysAt)
 * — negative sits behind the whole slide composition (a background
 * replacement), zero-or-above sits in front of it. Splitting on that sign is
 * the entirety of "customized depth" for now: precise interleaving with one
 * specific slide layer would need drawScene's own per-layer sort to know
 * about overlays too, which isn't worth the coupling for what is normally a
 * full-frame clip sitting behind or in front of an entire slide.
 */
function drawOverlays(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  overlays: ActiveOverlayState[],
  assets: TimelineRenderAssets,
  side: "behind" | "front"
) {
  overlays.filter((o) => (side === "behind" ? o.zIndex < 0 : o.zIndex >= 0)).forEach((o) => drawOverlayClip(ctx, W, H, o, assets));
}

/**
 * Whichever caption style applies this frame — the big centred overlay
 * treatment while a captionOverlay clip is active, the normal top banner
 * otherwise. Always the very last thing painted, after every front overlay,
 * so a caption can never be obscured by one.
 */
function drawActiveCaption(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  timeMs: number,
  opts: TimelineRenderOptions,
  activeOverlays: ActiveOverlayState[],
  showingIntro: boolean
) {
  if (!opts.captions || !opts.words?.length || showingIntro) return;
  const leadMs = opts.captionLeadMs ?? 200;
  const overlayClip = activeOverlays.find((o) => o.captionOverlay);
  if (overlayClip) drawBigOverlayCaption(ctx, W, H, timeMs, opts.words, leadMs);
  else drawCaption(ctx, W, H, timeMs, opts.words, leadMs);
}

export function drawMotionTimelineFrame(
  canvas: HTMLCanvasElement,
  frame: TimelineFrame,
  assets: TimelineRenderAssets,
  size: { w: number; h: number },
  opts: TimelineRenderOptions = {},
  /** Scene index → title-card text, for scenes that are cards rather than slides. */
  introFor?: (sceneIndex: number) => string | undefined
): PosterElement[] {
  const W = Math.max(1, Math.round(size.w));
  const H = Math.max(1, Math.round(size.h));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 1;
  ctx.filter = "none";

  // Black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  const leadMs = opts.captionLeadMs ?? 200;
  drawOverlays(ctx, W, H, frame.activeOverlays, assets, "behind");

  let bounds: PosterElement[] = [];
  // The intro card carries its own big centred text, already lit up word by
  // word — the top burst caption would just double it, so it stays off for
  // as long as any card is actually on screen, including mid-transition.
  let showingIntro = false;

  // Single scene or plain fade/cut
  if (frame.scenes.length <= 1) {
    frame.scenes.forEach((scene, i) => {
      const isTop = i === frame.scenes.length - 1;
      const intro = introFor?.(scene.sceneIndex);
      if (intro) {
        showingIntro = true;
        drawIntroCard(ctx, W, H, intro, frame.timeMs, opts.words, scene.alpha, leadMs);
        if (isTop) bounds = [];
        return;
      }
      const result = drawScene(ctx, W, H, scene, frame.timeMs, assets, opts, isTop);
      if (isTop) bounds = result;
    });

    drawOverlays(ctx, W, H, frame.activeOverlays, assets, "front");
    drawActiveCaption(ctx, W, H, frame.timeMs, opts, frame.activeOverlays, showingIntro);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    return bounds;
  }

  // Multi-scene transition (outgoing scene A, incoming scene B)
  const sceneA = frame.scenes[0];
  const sceneB = frame.scenes[1];
  const localT = sceneA.transitionProgress ?? frame.transitionProgress ?? 0.5;
  const style = sceneA.transitionStyle ?? frame.transitionStyle ?? "whooshCut";

  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeIn = (t: number) => t * t * t;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  const clamp = (n: number) => Math.min(1, Math.max(0, n));

  // A scene is either painted as a normal frame or, when introFor flags it,
  // as the title card — every transition case below goes through this
  // instead of calling drawScene directly, so cutting away from (or into)
  // the card is never a special case any one style has to remember.
  const introA = introFor?.(sceneA.sceneIndex);
  const introB = introFor?.(sceneB.sceneIndex);
  showingIntro = !!introA || !!introB;
  const paintScene = (scene: SceneRenderState, intro: string | undefined, collectBounds: boolean): PosterElement[] => {
    if (intro) {
      drawIntroCard(ctx, W, H, intro, frame.timeMs, opts.words, scene.alpha, leadMs);
      return [];
    }
    return drawScene(ctx, W, H, scene, frame.timeMs, assets, opts, collectBounds);
  };

  ctx.save();

  switch (style) {
    case "whooshCut": {
      // Motion Slide with horizontal sweep & blur trailing lines. Direction
      // is fixed, never alternating by scene index: the outgoing scene
      // always exits left and the incoming one always enters from the
      // right, so every cut reads as advancing to the next slide — an
      // alternating direction made every other cut look like going back to
      // the previous one instead.
      const dir = 1;
      const u = easeInOut(localT);

      // Draw outgoing scene sliding out
      ctx.save();
      ctx.translate(-dir * u * W * 0.85, 0);
      paintScene(sceneA, introA, false);
      ctx.restore();

      // Draw incoming scene sliding in
      ctx.save();
      ctx.translate(dir * (1 - u) * W * 0.85, 0);
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();

      // Motion streak flash burst across mid-cut
      const flash = 1 - Math.abs(localT - 0.5) * 2;
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha = flash * 0.45;
        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.95)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      break;
    }
    case "glitch": {
      // Cyber RGB Split Glitch
      const beforeCut = localT < 0.5;
      const curScene = beforeCut ? sceneA : sceneB;
      bounds = paintScene(curScene, beforeCut ? introA : introB, !beforeCut);

      const glitchWindow = 0.35;
      const glitchAmt = clamp(1 - Math.abs(localT - 0.5) / glitchWindow);
      if (glitchAmt > 0.02) {
        const sliceCount = 10;
        const seed = Math.floor(frame.timeMs / 40);
        for (let s = 0; s < sliceCount; s++) {
          const sy = (H / sliceCount) * s;
          const sh = H / sliceCount;
          const shiftX = (Math.sin(seed * 12.9898 + s * 78.233) * 0.5) * 80 * glitchAmt;

          ctx.save();
          ctx.beginPath();
          ctx.rect(0, sy, W, sh);
          ctx.clip();
          ctx.translate(shiftX, 0);
          paintScene(curScene, beforeCut ? introA : introB, false);

          if (s % 3 === 0) {
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = 0.25 * glitchAmt;
            ctx.fillStyle = s % 2 === 0 ? "#ff0055" : "#00f0ff";
            ctx.fillRect(0, sy, W, sh);
          }
          ctx.restore();
        }
      }
      break;
    }
    case "flashCut": {
      // Camera Flash Strobe Cut
      const beforeCut = localT < 0.5;
      const curScene = beforeCut ? sceneA : sceneB;
      bounds = paintScene(curScene, beforeCut ? introA : introB, !beforeCut);

      const flashAmt = clamp(1 - Math.abs(localT - 0.5) / 0.25);
      if (flashAmt > 0) {
        ctx.save();
        ctx.globalAlpha = flashAmt;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      break;
    }
    case "zoomPunch": {
      // Dynamic Zoom Punch
      const uIn = easeIn(localT);
      const uOut = easeOut(localT);

      ctx.save();
      ctx.globalAlpha = 1 - localT;
      ctx.translate(W / 2, H / 2);
      ctx.scale(1 + 0.25 * uIn, 1 + 0.25 * uIn);
      ctx.translate(-W / 2, -H / 2);
      paintScene(sceneA, introA, false);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = localT;
      ctx.translate(W / 2, H / 2);
      ctx.scale(1.18 - 0.18 * uOut, 1.18 - 0.18 * uOut);
      ctx.translate(-W / 2, -H / 2);
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
    case "spinZoom": {
      // Vortex Spin Swish
      const uIn = easeIn(localT);
      const uOut = easeOut(localT);
      const dir = sceneA.sceneIndex % 2 === 0 ? 1 : -1;

      ctx.save();
      ctx.globalAlpha = 1 - localT;
      ctx.translate(W / 2, H / 2);
      ctx.rotate(dir * uIn * 0.4);
      ctx.scale(1 + 0.4 * uIn, 1 + 0.4 * uIn);
      ctx.translate(-W / 2, -H / 2);
      paintScene(sceneA, introA, false);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = localT;
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-dir * (1 - uOut) * 0.4);
      ctx.scale(1.4 - 0.4 * uOut, 1.4 - 0.4 * uOut);
      ctx.translate(-W / 2, -H / 2);
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
    case "blurDissolve": {
      // Ghost Motion Blur Dissolve
      const u = easeInOut(localT);
      const blurAmt = Math.sin(Math.PI * localT) * 12;

      ctx.save();
      ctx.globalAlpha = 1 - u;
      if (blurAmt > 0.5) ctx.filter = `blur(${blurAmt}px)`;
      paintScene(sceneA, introA, false);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = u;
      if (blurAmt > 0.5) ctx.filter = `blur(${blurAmt}px)`;
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
    case "slideUp": {
      // Vertical Slide Up
      const u = easeInOut(localT);

      ctx.save();
      ctx.translate(0, -u * H);
      paintScene(sceneA, introA, false);
      ctx.restore();

      ctx.save();
      ctx.translate(0, (1 - u) * H);
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
    case "slideDown": {
      // Vertical Slide Down
      const u = easeInOut(localT);

      ctx.save();
      ctx.translate(0, u * H);
      paintScene(sceneA, introA, false);
      ctx.restore();

      ctx.save();
      ctx.translate(0, -(1 - u) * H);
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
    case "irisCircle": {
      // Iris Lens Wipe
      paintScene(sceneA, introA, false);

      const u = easeInOut(localT);
      const maxR = (Math.hypot(W, H) / 2) * 1.05;
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.max(0.001, u * maxR), 0, Math.PI * 2);
      ctx.clip();
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
    case "diagonalWipe": {
      // Angular Diagonal Sweep
      paintScene(sceneA, introA, false);

      const u = easeInOut(localT);
      const cx = -H + u * (W + 2 * H);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cx, 0);
      ctx.lineTo(cx - H, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.clip();
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
    case "splitReveal": {
      // Curtain Split Reveal
      const u = easeInOut(localT);
      bounds = paintScene(sceneB, introB, true);

      // Top half of scene A moves up
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H / 2);
      ctx.clip();
      ctx.translate(0, -u * (H / 2) * 1.25);
      paintScene(sceneA, introA, false);
      ctx.restore();

      // Bottom half of scene A moves down
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, H / 2, W, H / 2);
      ctx.clip();
      ctx.translate(0, u * (H / 2) * 1.25);
      paintScene(sceneA, introA, false);
      ctx.restore();
      break;
    }
    case "cardFlip": {
      // 3D Card Flip Squeeze
      if (localT < 0.5) {
        const u = easeIn(localT / 0.5);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(Math.max(0.001, 1 - u), 1);
        ctx.translate(-W / 2, -H / 2);
        paintScene(sceneA, introA, false);
        ctx.restore();
      } else {
        const u = easeOut((localT - 0.5) / 0.5);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(Math.max(0.001, u), 1);
        ctx.translate(-W / 2, -H / 2);
        bounds = paintScene(sceneB, introB, true);
        ctx.restore();
      }
      break;
    }
    case "fade":
    default: {
      // Standard crossfade
      const u = easeInOut(localT);
      ctx.save();
      ctx.globalAlpha = 1 - u;
      paintScene(sceneA, introA, false);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = u;
      bounds = paintScene(sceneB, introB, true);
      ctx.restore();
      break;
    }
  }

  ctx.restore();

  drawOverlays(ctx, W, H, frame.activeOverlays, assets, "front");
  drawActiveCaption(ctx, W, H, frame.timeMs, opts, frame.activeOverlays, showingIntro);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  return bounds;
}
