

export function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.lineTo(x + w - R, y); ctx.arcTo(x + w, y, x + w, y + R, R);
  ctx.lineTo(x + w, y + h - R); ctx.arcTo(x + w, y + h, x + w - R, y + h, R);
  ctx.lineTo(x + R, y + h); ctx.arcTo(x, y + h, x, y + h - R, R);
  ctx.lineTo(x, y + R); ctx.arcTo(x, y, x + R, y, R);
  ctx.closePath();
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ─── Extreme-poster visual system ──────────────────────────────────────────
// Shared decorative primitives for the Bold and Bento carousel cards: film
// grain, corner crop-marks, icon badges, and a segmented pagination rail —
// one shared visual language so the two card kinds read as a single system
// instead of two unrelated templates. Grain uses a deterministic PRNG (not
// Math.random) so re-rendering the same data during live editing never
// makes the texture visibly "crawl" between frames.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const grainTileCache = new Map<number, HTMLCanvasElement>();
export function getGrainTile(size: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cached = grainTileCache.get(size);
  if (cached) return cached;
  const tile = document.createElement("canvas");
  tile.width = size; tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;
  const rand = mulberry32(1337);
  const dots = Math.round(size * size * 0.16);
  for (let i = 0; i < dots; i++) {
    const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
    const a = rand() * 0.5;
    tctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    tctx.fillRect(x, y, 1, 1);
  }
  grainTileCache.set(size, tile);
  return tile;
}

// Full-bleed film-grain pass — the cheapest way to turn a flat gradient into
// a textured, "printed" surface instead of a CSS-flat background.
export function paintGrain(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number) {
  const tile = getGrainTile(128);
  if (!tile) return;
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Small filled circle + centered glyph — the shared icon-badge primitive
// fused to chips and section labels across the Bold and Bento cards.
export function drawIconBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, d: number, bg: string, fg: string, glyph: string, glyphSize: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = `800 ${glyphSize}px "Inter", sans-serif`;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy + glyphSize * 0.04);
}

// Plain "STRATI" + accent-colored "X" wordmark — the brand mark, themed to
// whichever gradient/theme is active instead of a fixed badge, matching the
// treatment the Outro card always used. Shared by every card kind (Bold
// story, Bento, Outro) so the batch reads as one consistent brand across
// the whole carousel. Returns the total rendered width.
export function drawWordmark(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  fontSize: number,
  fgColor: string,
  accentColor: string,
  align: "left" | "center" = "left",
  baseline: CanvasTextBaseline = "alphabetic"
): number {
  ctx.font = `800 ${fontSize}px "Inter", sans-serif`;
  ctx.textBaseline = baseline;
  const stratiW = ctx.measureText("STRATI").width;
  const xW = ctx.measureText("X").width;
  const totalW = stratiW + xW;
  const startX = align === "center" ? x - totalW / 2 : x;
  ctx.textAlign = "left";
  ctx.fillStyle = fgColor;
  ctx.fillText("STRATI", startX, y);
  ctx.fillStyle = accentColor;
  ctx.fillText("X", startX + stratiW, y);
  return totalW;
}

// "JUL 21 · 2:47 PM" — the render-time timestamp stamped opposite the logo
// on every card. Always "now" (the moment the poster is drawn/exported),
// not a field from the data, so every export is naturally dated.
export function formatPosterTimestamp(d: Date = new Date()): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";
  return `${months[d.getMonth()]} ${d.getDate()} · ${hours12}:${minutes} ${ampm}`;
}

// Segmented "story progress" rail — replaces a loose row of dots with the
// wide-rail convention from Stories UIs; reads as one continuous strip and
// makes the active slide unmistakable at a glance, at any slide count.
export function drawSegmentedPagination(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  count: number, activeIndex: number,
  activeColor: string, inactiveColor: string
) {
  if (count <= 1) return;
  const gap = h * 0.9;
  const segW = (w - gap * (count - 1)) / count;
  let cx = x;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i === activeIndex ? activeColor : inactiveColor;
    rrect(ctx, cx, y, Math.max(1, segW), h, h / 2);
    ctx.fill();
    cx += segW + gap;
  }
}

// Best-effort letter tracking — Canvas2D's `letterSpacing` shipped in
// Chromium ~2022 and Safari 17.4; on older engines the assignment is simply
// ignored (no throw), so this is safe progressive enhancement, not a
// dependency the layout math relies on.
export function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* unsupported */ }
}

export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxH: number,
  minSize: number,
  maxSize: number
): { lines: string[]; fontSize: number; lineSpacing: number } {
  let bestFontSize = minSize;
  let bestLines: string[] = [];
  let bestLineSpacing = minSize * 1.5;

  // Search for the largest font size that fits within maxH
  for (let sz = minSize; sz <= maxSize; sz += 0.5) {
    ctx.font = `500 ${sz}px "Inter", system-ui, -apple-system, sans-serif`;
    const lines = wrap(ctx, text, maxW);
    const spacing = sz * 1.5;
    const totalH = lines.length * spacing;

    if (totalH <= maxH) {
      bestFontSize = sz;
      bestLines = lines;
      bestLineSpacing = spacing;
    } else {
      break;
    }
  }

  // Fallback if no size fits
  if (bestLines.length === 0) {
    ctx.font = `500 ${minSize}px "Inter", system-ui, -apple-system, sans-serif`;
    bestLines = wrap(ctx, text, maxW);
    bestFontSize = minSize;
    bestLineSpacing = minSize * 1.5;
  }

  return { lines: bestLines, fontSize: bestFontSize, lineSpacing: bestLineSpacing };
}
// The selectable "poster text color" combination — only the positive/
// bullish tint actually changes between the two; negative/bearish stays red
// and neutral body text stays white in both, per the user's request.
export type SentimentScheme = "emerald" | "skyblue";

export function sentimentPalette(sentiment?: string, scheme: SentimentScheme = "emerald"): { bg: string; fg: string } {
  if (sentiment === "Bullish") return { bg: scheme === "skyblue" ? "#0284c7" : "#10b981", fg: "#ffffff" };
  if (sentiment === "Bearish") return { bg: "#ef4444", fg: "#ffffff" };
  return { bg: "#f59e0b", fg: "#111111" };
}

export interface HLToken { text: string; isHL: boolean; }

// Splits `title` into word tokens, keeping `highlight` (an exact substring)
// as ONE atomic token so it never breaks across a line — it renders as a
// single colored chip, like the boxed phrase in a tabloid-style headline.
export function tokenizeHighlight(title: string, highlight: string): HLToken[] {
  const clean = (s: string) => s.split(" ").filter(Boolean).map((t) => ({ text: t, isHL: false }));
  if (!highlight || !title.includes(highlight)) return clean(title);
  const idx = title.indexOf(highlight);
  const before = title.slice(0, idx).trim();
  const after = title.slice(idx + highlight.length).trim();
  const tokens: HLToken[] = [];
  if (before) tokens.push(...clean(before));
  tokens.push({ text: highlight, isHL: true });
  if (after) tokens.push(...clean(after));
  return tokens;
}

export function measureToken(ctx: CanvasRenderingContext2D, tok: HLToken, font: string, hlPadX: number): number {
  ctx.font = font;
  return ctx.measureText(tok.text).width + (tok.isHL ? hlPadX * 2 : 0);
}

export function wrapHighlightLine(
  ctx: CanvasRenderingContext2D,
  tokens: HLToken[],
  maxW: number,
  font: string,
  hlPadX: number
): HLToken[][] {
  ctx.font = font;
  const spaceW = ctx.measureText(" ").width;
  const lines: HLToken[][] = [];
  let cur: HLToken[] = [];
  let curW = 0;
  for (const tok of tokens) {
    const w = measureToken(ctx, tok, font, hlPadX);
    const addW = cur.length > 0 ? spaceW + w : w;
    if (curW + addW > maxW && cur.length > 0) {
      lines.push(cur);
      cur = [tok];
      curW = w;
    } else {
      cur.push(tok);
      curW += addW;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function measureLineWidth(ctx: CanvasRenderingContext2D, line: HLToken[], font: string, hlPadX: number): number {
  ctx.font = font;
  const spaceW = ctx.measureText(" ").width;
  const widths = line.map((tok) => measureToken(ctx, tok, font, hlPadX));
  return widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, line.length - 1);
}

// `wrapHighlightLine` keeps a highlighted phrase as one unbreakable token, so
// if that phrase alone is wider than `maxW` it still gets placed on its own
// line — silently overflowing the card it's drawn on (the highlight's boxed
// background bleeding past the rounded card behind it). This splits it into
// per-word highlighted tokens (still colored, just breakable) as a fallback
// so a long phrase wraps like normal text instead of overflowing.
function splitHighlightToken(tokens: HLToken[]): HLToken[] {
  const out: HLToken[] = [];
  for (const tok of tokens) {
    if (tok.isHL && tok.text.includes(" ")) {
      for (const word of tok.text.split(" ").filter(Boolean)) out.push({ text: word, isHL: true });
    } else {
      out.push(tok);
    }
  }
  return out;
}

// Searches font sizes from large to small and returns the first (largest)
// that wraps within maxH AND whose widest line actually fits maxW — headlines
// should fill their band, not float small, but never at the cost of a line
// (or an atomic highlight token) overflowing its box. Falls back to breaking
// an oversized highlight phrase into per-word tokens if no size fits it whole.
export function fitHighlightTitle(
  ctx: CanvasRenderingContext2D,
  tokens: HLToken[],
  maxW: number,
  maxH: number,
  minSize: number,
  maxSize: number,
  fontFamily: string = '"Inter", "Arial Black", sans-serif',
  fontWeight: string = "900",
  lineHeightMult: number = 1.16
): { lines: HLToken[][]; fontSize: number; lineH: number; font: string } {
  const attempt = (toks: HLToken[], sz: number) => {
    const font = `${fontWeight} ${sz}px ${fontFamily}`;
    const lines = wrapHighlightLine(ctx, toks, maxW, font, sz * 0.26);
    const lineH = sz * lineHeightMult;
    const fitsHeight = lines.length * lineH <= maxH;
    const fitsWidth = lines.every((line) => measureLineWidth(ctx, line, font, sz * 0.26) <= maxW + 0.5);
    return { lines, lineH, font, ok: fitsHeight && fitsWidth };
  };

  for (let sz = maxSize; sz >= minSize; sz -= 1) {
    const result = attempt(tokens, sz);
    if (result.ok) return { lines: result.lines, fontSize: sz, lineH: result.lineH, font: result.font };
  }

  const splitTokens = splitHighlightToken(tokens);
  for (let sz = maxSize; sz >= minSize; sz -= 1) {
    const result = attempt(splitTokens, sz);
    if (result.ok) return { lines: result.lines, fontSize: sz, lineH: result.lineH, font: result.font };
  }

  const font = `${fontWeight} ${minSize}px ${fontFamily}`;
  return { lines: wrapHighlightLine(ctx, splitTokens, maxW, font, minSize * 0.26), fontSize: minSize, lineH: minSize * lineHeightMult, font };
}

// Draws center-aligned headline lines, rendering the highlighted token as a
// solid colored chip with contrasting text — the "CHINA FLOODS TRIGGER…"
// tabloid look — and everything else as plain bold black text.
export function drawHighlightLines(
  ctx: CanvasRenderingContext2D,
  lines: HLToken[][],
  font: string,
  fontSize: number,
  lineH: number,
  centerX: number,
  startY: number,
  hlPadX: number,
  hlColor: { bg: string; fg: string },
  textColor: string
) {
  ctx.font = font;
  ctx.textBaseline = "middle";
  const spaceW = ctx.measureText(" ").width;

  lines.forEach((line, i) => {
    const widths = line.map((tok) => measureToken(ctx, tok, font, hlPadX));
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, line.length - 1);
    let x = centerX - totalW / 2;
    const y = startY + i * lineH + lineH / 2;

    line.forEach((tok, ti) => {
      const w = widths[ti];
      if (tok.isHL) {
        const boxH = fontSize * 1.12;
        rrect(ctx, x, y - boxH / 2, w, boxH, Math.min(fontSize * 0.16, 8));
        ctx.fillStyle = hlColor.bg;
        ctx.fill();
        ctx.font = font;
        ctx.fillStyle = hlColor.fg;
        ctx.textAlign = "left";
        ctx.fillText(tok.text, x + hlPadX, y + fontSize * 0.02);
      } else {
        ctx.font = font;
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.fillText(tok.text, x, y + fontSize * 0.02);
      }
      x += w + spaceW;
    });
  });
}

// ─── Body-paragraph highlighting ───────────────────────────────────────────
// Unlike the headline's single boxed chip, body text can carry several
// highlight terms (numbers, entity names) — these render as bold colored
// words inline, not boxes, so a whole paragraph doesn't turn into a wall of
// chips. Words wrap normally; a highlighted phrase can break across lines.

// Finds each `highlights` term's first (non-overlapping) occurrence in
// `text` and splits it into plain/highlighted word tokens in reading order.
export function tokenizeParagraphHighlights(text: string, highlights: string[]): HLToken[] {
  const words = (s: string) => s.split(" ").filter(Boolean).map((t) => ({ text: t, isHL: false as boolean }));
  if (!highlights || highlights.length === 0) return words(text);

  type Range = { start: number; end: number };
  const ranges: Range[] = [];
  for (const term of highlights) {
    if (!term) continue;
    const idx = text.indexOf(term);
    if (idx === -1) continue;
    const start = idx, end = idx + term.length;
    if (ranges.some((r) => start < r.end && end > r.start)) continue; // no overlaps
    ranges.push({ start, end });
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.length === 0) return words(text);

  const tokens: HLToken[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) tokens.push(...words(text.slice(cursor, range.start)));
    tokens.push(...text.slice(range.start, range.end).split(" ").filter(Boolean).map((t) => ({ text: t, isHL: true })));
    cursor = range.end;
  }
  if (cursor < text.length) tokens.push(...words(text.slice(cursor)));
  return tokens;
}

// Plain word-wrap (no atomic grouping, no chip padding) — highlighted words
// just render bold+colored in place, so wrapping is identical to normal text.
export function wrapParagraphTokens(
  ctx: CanvasRenderingContext2D,
  tokens: HLToken[],
  maxW: number,
  normalFont: string,
  boldFont: string
): HLToken[][] {
  ctx.font = normalFont;
  const spaceW = ctx.measureText(" ").width;
  const lines: HLToken[][] = [];
  let cur: HLToken[] = [];
  let curW = 0;
  for (const tok of tokens) {
    ctx.font = tok.isHL ? boldFont : normalFont;
    const w = ctx.measureText(tok.text).width;
    const addW = cur.length > 0 ? spaceW + w : w;
    if (curW + addW > maxW && cur.length > 0) {
      lines.push(cur);
      cur = [tok];
      curW = w;
    } else {
      cur.push(tok);
      curW += addW;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

export function drawParagraphLines(
  ctx: CanvasRenderingContext2D,
  lines: HLToken[][],
  normalFont: string,
  boldFont: string,
  lineH: number,
  x: number,
  startY: number,
  normalColor: string,
  hlColor: string,
  align: "left" | "center" = "left",
  centerX?: number
) {
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    const y = startY + i * lineH + lineH / 2;
    const widths = line.map((tok) => {
      ctx.font = tok.isHL ? boldFont : normalFont;
      return ctx.measureText(tok.text).width;
    });
    ctx.font = normalFont;
    const spaceW = ctx.measureText(" ").width;
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, line.length - 1);
    let curX = align === "center" ? (centerX ?? x) - totalW / 2 : x;
    line.forEach((tok, ti) => {
      ctx.font = tok.isHL ? boldFont : normalFont;
      ctx.fillStyle = tok.isHL ? hlColor : normalColor;
      ctx.textAlign = "left";
      ctx.fillText(tok.text, curX, y);
      curX += widths[ti] + spaceW;
    });
  });
}

// Cover-fit math shared between the canvas renderer and the click-drag pan
// handler, so dragging the poster image always matches exactly what gets
// drawn — one axis fills the frame exactly at zoom 1, the other overflows;
// zoom scales both up from there, producing the "slack" (in px) available
// to pan along each axis.
export function computeCoverFitSlack(imgAspect: number, frameW: number, frameH: number, zoom: number) {
  const frameAspect = frameW / frameH;
  let baseW = frameW, baseH = frameH;
  if (imgAspect > frameAspect) { baseH = frameH; baseW = frameH * imgAspect; }
  else { baseW = frameW; baseH = frameW / imgAspect; }
  const z = Math.max(1, Math.min(2.5, zoom || 1));
  return { slackX: baseW * z - frameW, slackY: baseH * z - frameH };
}

// Shared headline sizing — the SAME min/max font-size range (in unscaled px,
// multiply by `r()` at each call site) is used by every poster renderer
// (editorial story/cover, Facts/Learnings, Bold) so a given headline length
// lands at the same visual size regardless of which style generated it.
export const HEADLINE_MIN_PX = 24;
export const HEADLINE_MAX_PX = 52;

// Editorial "paper band" palette — light (default cream paper) or dark
// (near-black card). Drives band fill, text/muted/divider colors, and the
// rgb the photo seam fades into so the dissolve matches the band in both.
export type EditorialTheme = "light" | "dark";
export function editorialPalette(theme: EditorialTheme) {
  return theme === "dark"
    ? { band: "#000000", bandRgb: "0,0,0", text: "#ffffff", textSoft: "rgba(255,255,255,0.82)", muted: "rgba(255,255,255,0.5)", divider: "rgba(255,255,255,0.14)", bullet: "#f5f5f5" }
    : { band: "#FAFAF7", bandRgb: "250,250,247", text: "#111111", textSoft: "rgba(17,17,17,0.76)", muted: "rgba(17,17,17,0.5)", divider: "rgba(17,17,17,0.12)", bullet: "#1a1a1a" };
}
// Resolves the actual (possibly hashed) font-family string next/font/google
// assigned to the Anton display face, via the `--font-display` CSS variable
// set on <html> in app/layout.tsx. Canvas can't read CSS custom properties
// inside a font shorthand string, so this reads the computed value once and
// falls back to a heavy condensed system stack if it's ever unavailable
// (e.g. during SSR — this file is client-only, but defensive regardless).
export let cachedAntonFamily: string | null = null;
export function getAntonFontFamily(): string {
  if (cachedAntonFamily) return cachedAntonFamily;
  const fallback = '"Arial Narrow Bold", "Arial Black", sans-serif';
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  cachedAntonFamily = raw ? `${raw}, ${fallback}` : fallback;
  return cachedAntonFamily;
}
// #RRGGBB -> "rgba(r,g,b,alpha)" — used to tint the outro's Bold-style CTA
// pill with whichever gradient accent is active, without a full color lib.
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const rr = (bigint >> 16) & 255, gg = (bigint >> 8) & 255, bb = bigint & 255;
  return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
}

// Picks a guaranteed-legible text color for text painted on top of an
// arbitrary fill color — needed anywhere a gradient preset's `accent` (which
// can be near-white on light/monochrome presets) is used as a pill/chip
// background, so the label on top never goes white-on-white or black-on-black.
export function contrastTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const rr = (bigint >> 16) & 255, gg = (bigint >> 8) & 255, bb = bigint & 255;
  const luminance = (0.299 * rr + 0.587 * gg + 0.114 * bb) / 255;
  return luminance > 0.6 ? "#0a0a0a" : "#ffffff";
}
export type FontFns = { label: (sz?: number, bold?: boolean) => string; body: (sz?: number, bold?: boolean) => string; serif: (sz?: number, bold?: boolean) => string; };
export type Rfn = (n: number) => number;

// Draws a <video> frame into a W×H box, cropping (never stretching) to fill
// it exactly — same contract as CSS `object-fit: cover`. Used for the hook
// clip pre-roll, whose own resolution/aspect ratio may not match the fixed
// export canvas.
export function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  W: number,
  H: number,
) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(W / vw, H / vh);
  const sw = W / scale, sh = H / scale;
  const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
}
