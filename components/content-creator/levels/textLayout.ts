"use client";

import { LEVELS_FONTS } from "./constants";
import type { LevelsSlide, LevelsTextBox } from "./types";

/**
 * One shared text-measuring pass for the editor and the exporter.
 *
 * The on-screen stage renders each wrapped line as its own element rather
 * than letting the browser re-wrap at display scale, because the exported
 * JPEG wraps with canvas `measureText`. Running both off the *same* line
 * breaking means what the user drags around is byte-for-byte what lands in
 * the download — a browser-wrapped preview drifts by a word near the box
 * edge as soon as the display scale isn't exactly 1.
 */

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === "undefined") return null;
  measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
}

// next/font hashes the family name, so the real one has to be read off the
// computed style of <html> once and cached (same trick as getAntonFontFamily).
const familyCache = new Map<string, string>();
export function resolveFontFamily(fontId: string): string {
  const preset = LEVELS_FONTS.find((f) => f.id === fontId) ?? LEVELS_FONTS[0];
  const cached = familyCache.get(preset.id);
  if (cached) return cached;
  let family: string = preset.fallback;
  if (typeof document !== "undefined" && preset.cssVar) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(preset.cssVar).trim();
    if (raw) family = `${raw}, ${preset.fallback}`;
  }
  familyCache.set(preset.id, family);
  return family;
}

/** Canvas `font` shorthand for a box, at `scale`x its authored size. */
export function fontStringFor(box: LevelsTextBox, scale = 1): string {
  const style = box.italic ? "italic " : "";
  const weight = box.bold ? "800" : "400";
  return `${style}${weight} ${box.fontSize * scale}px ${resolveFontFamily(box.fontFamily)}`;
}

export function displayText(box: LevelsTextBox): string {
  return box.uppercase ? box.text.toUpperCase() : box.text;
}

/**
 * Applies a box's font + letter spacing to a context. Chrome/Safari expose
 * `ctx.letterSpacing`, which also folds into `measureText`; where it is
 * missing we fall back to per-character drawing, so `nativeSpacing` tells the
 * caller which path measurement and drawing must take.
 */
export function applyTextStyle(
  ctx: CanvasRenderingContext2D,
  box: LevelsTextBox,
  scale = 1,
): { nativeSpacing: boolean } {
  ctx.font = fontStringFor(box, scale);
  const ls = box.letterSpacing * scale;
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${ls}px`;
    return { nativeSpacing: true };
  }
  return { nativeSpacing: ls === 0 };
}

function measureRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number,
  nativeSpacing: boolean,
): number {
  if (!text) return 0;
  const raw = ctx.measureText(text).width;
  // Without native support the spacing has to be added by hand; CSS adds it
  // after every character including the last, and so do we, so centered and
  // right-aligned lines land in the same place in both renderers.
  return nativeSpacing ? raw : raw + letterSpacing * text.length;
}

/** Width of one already-wrapped line, in canvas units. */
export function measureLine(ctx: CanvasRenderingContext2D, box: LevelsTextBox, line: string): number {
  const { nativeSpacing } = applyTextStyle(ctx, box, 1);
  return measureRun(ctx, line, box.letterSpacing, nativeSpacing);
}

/**
 * Greedy word wrap to `box.width`, honouring hard newlines. A single word
 * longer than the box (a long ticker or URL) is split per character rather
 * than allowed to bleed past the edge — same as CSS `overflow-wrap: anywhere`.
 */
export function wrapBoxText(box: LevelsTextBox): string[] {
  const text = displayText(box);
  const ctx = getMeasureCtx();
  if (!ctx) return text.split("\n");

  const { nativeSpacing } = applyTextStyle(ctx, box, 1);
  const maxW = Math.max(1, box.width);
  const out: string[] = [];

  for (const paragraph of text.split("\n")) {
    if (paragraph === "") { out.push(""); continue; }
    const words = paragraph.split(" ");
    let line = "";

    const pushBrokenWord = (word: string) => {
      let chunk = "";
      for (const ch of word) {
        const next = chunk + ch;
        if (chunk && measureRun(ctx, next, box.letterSpacing, nativeSpacing) > maxW) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    };

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || measureRun(ctx, candidate, box.letterSpacing, nativeSpacing) <= maxW) {
        line = candidate;
        continue;
      }
      out.push(line);
      if (measureRun(ctx, word, box.letterSpacing, nativeSpacing) > maxW) {
        pushBrokenWord(word);
      } else {
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export interface LaidOutLine {
  text: string;
  /** Start of the line after alignment, in canvas units. */
  x: number;
  /** Top of the line box, in canvas units. */
  y: number;
  width: number;
}

/**
 * Wrapped lines with their alignment already resolved to absolute positions.
 *
 * Both renderers place lines from this, rather than the editor leaning on CSS
 * `text-align` while the exporter does its own arithmetic. That matters for
 * any font whose metrics aren't linear in size — macOS `system-ui` swaps
 * SF Text for SF Display around 20px, so a centred line measured by CSS at
 * preview scale lands a couple of percent away from where the 1080px export
 * puts it. Positioning both off the same numbers removes the question.
 */
export function layoutBox(box: LevelsTextBox): LaidOutLine[] {
  const lines = wrapBoxText(box);
  const lineH = box.fontSize * box.lineHeight;
  const ctx = getMeasureCtx();
  if (!ctx) {
    return lines.map((text, i) => ({ text, x: box.x, y: box.y + i * lineH, width: box.width }));
  }
  const { nativeSpacing } = applyTextStyle(ctx, box, 1);
  return lines.map((text, i) => {
    const width = measureRun(ctx, text, box.letterSpacing, nativeSpacing);
    let x = box.x;
    if (box.align === "center") x = box.x + (box.width - width) / 2;
    else if (box.align === "right") x = box.x + (box.width - width);
    return { text, x, y: box.y + i * lineH, width };
  });
}

/** Rendered height of a box, in canvas units. */
export function boxHeight(box: LevelsTextBox, lineCount?: number): number {
  const lines = lineCount ?? wrapBoxText(box).length;
  return Math.max(1, lines) * box.fontSize * box.lineHeight;
}

/** Axis-aligned bounds of a box (ignoring rotation), in canvas units. */
export function boxRect(box: LevelsTextBox, lineCount?: number) {
  return { x: box.x, y: box.y, w: box.width, h: boxHeight(box, lineCount) };
}

/**
 * Where the image sits on the canvas.
 *
 * The baseline is a "contain" fit, so `scale: 1` shows a 1998x1080 chart whole
 * and centered with equal gaps above and below — the letterboxed look the
 * carousel is built around. `scale` grows from there and the offsets slide it
 * anywhere, including past the edges.
 */
export function computeImageRect(slide: LevelsSlide, canvasW: number, canvasH: number) {
  const imgW = slide.imgW || canvasW;
  const imgH = slide.imgH || canvasH;
  const fit = Math.min(canvasW / imgW, canvasH / imgH);
  const w = imgW * fit * slide.scale;
  const h = imgH * fit * slide.scale;
  return {
    x: (canvasW - w) / 2 + slide.offsetX,
    y: (canvasH - h) / 2 + slide.offsetY,
    w,
    h,
  };
}

/** `scale` value that makes the image cover the whole canvas with no gaps. */
export function coverScaleFor(slide: LevelsSlide, canvasW: number, canvasH: number): number {
  const imgW = slide.imgW || canvasW;
  const imgH = slide.imgH || canvasH;
  const fit = Math.min(canvasW / imgW, canvasH / imgH);
  const cover = Math.max(canvasW / imgW, canvasH / imgH);
  return fit > 0 ? cover / fit : 1;
}

/** `scale` value that makes the image span the full canvas width. */
export function widthScaleFor(slide: LevelsSlide, canvasW: number, canvasH: number): number {
  const imgW = slide.imgW || canvasW;
  const imgH = slide.imgH || canvasH;
  const fit = Math.min(canvasW / imgW, canvasH / imgH);
  return fit > 0 ? canvasW / imgW / fit : 1;
}
