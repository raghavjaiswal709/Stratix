"use client";

import { levelsRatio } from "./constants";
import {
  applyTextStyle,
  boxHeight,
  computeImageRect,
  layoutBox,
} from "./textLayout";
import type { LevelsSettings, LevelsSlide, LevelsTextBox } from "./types";

/**
 * Export-side renderer for one carousel slide.
 *
 * Geometry here is deliberately identical to what LevelsCanvasStage paints in
 * the DOM: same image rect, same wrapped lines, same baselines. The stage is
 * just this at `stageWidth / canvasW` scale.
 */

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Paints the letterbox background — flat, gradient, or a blurred blow-up of the chart itself. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  settings: LevelsSettings,
  img: HTMLImageElement | null,
  cw: number,
  ch: number,
) {
  if (settings.bgMode === "gradient") {
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, settings.bgColor);
    grad.addColorStop(1, settings.bgColor2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);
    return;
  }

  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(0, 0, cw, ch);

  if (settings.bgMode === "blur" && img) {
    // Cover-fit the source, blur it, then dim it so foreground text still wins.
    const cover = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * cover;
    const h = img.naturalHeight * cover;
    ctx.save();
    ctx.filter = `blur(${settings.blurStrength}px)`;
    // Overdraw past the edges so the blur kernel doesn't sample transparent
    // pixels and leave a pale halo around the border.
    const bleed = settings.blurStrength * 2;
    ctx.drawImage(img, (cw - w) / 2 - bleed, (ch - h) / 2 - bleed, w + bleed * 2, h + bleed * 2);
    ctx.restore();
    if (settings.blurDim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${settings.blurDim})`;
      ctx.fillRect(0, 0, cw, ch);
    }
  }
}

function drawSlideImage(
  ctx: CanvasRenderingContext2D,
  slide: LevelsSlide,
  settings: LevelsSettings,
  img: HTMLImageElement,
  cw: number,
  ch: number,
) {
  const rect = computeImageRect(slide, cw, ch);
  ctx.save();
  if (settings.imageShadow) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 48;
    ctx.shadowOffsetY = 14;
  }
  if (settings.imageRadius > 0) {
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, settings.imageRadius);
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  } else {
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();

  if (settings.imageBorder) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(settings.imageBorderColor, 0.35);
    ctx.lineWidth = 2;
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, settings.imageRadius);
    ctx.stroke();
    ctx.restore();
  }
}

/** Draws one line, hand-spacing the glyphs where `ctx.letterSpacing` is unavailable. */
function paintLine(
  ctx: CanvasRenderingContext2D,
  box: LevelsTextBox,
  line: string,
  startX: number,
  baselineY: number,
  nativeSpacing: boolean,
  stroke: boolean,
) {
  if (nativeSpacing || box.letterSpacing === 0) {
    if (stroke) ctx.strokeText(line, startX, baselineY);
    else ctx.fillText(line, startX, baselineY);
    return;
  }
  let cursor = startX;
  for (const ch of line) {
    if (stroke) ctx.strokeText(ch, cursor, baselineY);
    else ctx.fillText(ch, cursor, baselineY);
    cursor += ctx.measureText(ch).width + box.letterSpacing;
  }
}

export function drawTextBox(ctx: CanvasRenderingContext2D, box: LevelsTextBox) {
  if (!box.text.trim()) return;
  const lines = layoutBox(box);
  const lineH = box.fontSize * box.lineHeight;
  const h = boxHeight(box, lines.length);

  ctx.save();
  // Rotate about the box centre so the handle in the editor matches.
  if (box.rotation) {
    const cx = box.x + box.width / 2;
    const cy = box.y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.globalAlpha = box.opacity;

  if (box.bgColor) {
    ctx.fillStyle = hexToRgba(box.bgColor, box.bgOpacity);
    roundRectPath(
      ctx,
      box.x - box.bgPadding,
      box.y - box.bgPadding,
      box.width + box.bgPadding * 2,
      h + box.bgPadding * 2,
      box.bgRadius,
    );
    ctx.fill();
  }

  const { nativeSpacing } = applyTextStyle(ctx, box, 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left"; // alignment is resolved by hand so it matches the DOM stage exactly

  lines.forEach((line) => {
    const startX = line.x;
    // Centre the glyphs inside the line box, matching CSS half-leading.
    const baselineY = line.y + lineH / 2 + box.fontSize * 0.35;

    if (box.shadow) {
      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowBlur = box.fontSize * 0.35;
      ctx.shadowOffsetY = box.fontSize * 0.06;
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }

    if (box.outline) {
      ctx.strokeStyle = box.outlineColor;
      ctx.lineWidth = Math.max(2, box.fontSize * 0.09);
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      paintLine(ctx, box, line.text, startX, baselineY, nativeSpacing, true);
    }

    ctx.fillStyle = box.color;
    paintLine(ctx, box, line.text, startX, baselineY, nativeSpacing, false);

    if (box.underline) {
      ctx.shadowColor = "transparent";
      ctx.fillRect(startX, baselineY + box.fontSize * 0.16, line.width, Math.max(1.5, box.fontSize * 0.055));
    }
  });

  ctx.restore();
}

function drawCounter(
  ctx: CanvasRenderingContext2D,
  settings: LevelsSettings,
  index: number,
  total: number,
  cw: number,
) {
  ctx.save();
  ctx.font = `700 ${Math.round(cw * 0.026)}px ${getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() || "system-ui"}, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.globalAlpha = 0.75;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = settings.counterColor;
  ctx.fillText(`${index + 1}/${total}`, cw - cw * 0.05, cw * 0.05);
  ctx.restore();
}

/** Loads a data-URL / object-URL into a decoded `HTMLImageElement`. */
export function loadImageEl(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Renders a slide into `canvas` at full export resolution. */
export async function drawLevelsSlide(
  canvas: HTMLCanvasElement,
  slide: LevelsSlide,
  settings: LevelsSettings,
  index: number,
  total: number,
  preloaded?: HTMLImageElement | null,
) {
  const ratio = levelsRatio(settings.ratioId);
  canvas.width = ratio.w;
  canvas.height = ratio.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = preloaded ?? (await loadImageEl(slide.src));

  ctx.clearRect(0, 0, ratio.w, ratio.h);
  drawBackground(ctx, settings, img, ratio.w, ratio.h);
  if (img) drawSlideImage(ctx, slide, settings, img, ratio.w, ratio.h);
  for (const box of slide.texts) drawTextBox(ctx, box);
  if (settings.showCounter && total > 1) drawCounter(ctx, settings, index, total, ratio.w);
}
