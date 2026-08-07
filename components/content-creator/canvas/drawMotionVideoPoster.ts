import type { PosterElement, MotionLayer, MotionVideoData } from "../types";
import { drawPaperFrame } from "./drawMotionTimelineFrame";

export type { MotionVideoData };

export function drawMotionVideoPoster(
  canvas: HTMLCanvasElement,
  data: MotionVideoData,
  ar: { w: number; h: number },
  bgImgEl: HTMLImageElement | null,
  layerImgEls: Record<string, HTMLImageElement> = {}
): PosterElement[] {
  const W = ar.w;
  const H = ar.h;
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const timeMs = data?.timeMs ?? 0;
  const layers = data?.layers || [];
  const activeLayerId = data?.activeLayerId;
  const isExporting = !!data?.isExporting;

  ctx.clearRect(0, 0, W, H);

  const hasActiveMotion = layers.some((l) => l.motionType && l.motionType !== "none");

  // 1. Background. Held perfectly still while nothing is animating, so an
  //    untouched poster renders byte-for-byte like the upload.
  const bgX = hasActiveMotion ? Math.sin(timeMs * 0.0008) * (W * 0.012) : 0;
  const bgY = hasActiveMotion ? Math.cos(timeMs * 0.0008) * (H * 0.008) : 0;
  const bgScale = hasActiveMotion ? 1.04 : 1.0;

  if (bgImgEl && bgImgEl.complete && bgImgEl.naturalWidth > 0) {
    if (!hasActiveMotion) {
      ctx.drawImage(bgImgEl, 0, 0, W, H);
    } else {
      ctx.save();
      ctx.translate(W / 2 + bgX, H / 2 + bgY);
      ctx.scale(bgScale, bgScale);
      ctx.drawImage(bgImgEl, -W / 2, -H / 2, W, H);
      ctx.restore();
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0F172A");
    grad.addColorStop(1, "#020617");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  const bounds: PosterElement[] = [];

  // 2. Layers, in the z-order the decomposer assigned.
  const ordered = [...layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  ordered.forEach((layer: MotionLayer) => {
    const imgEl = layerImgEls[layer.id];
    if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return;
    // Same as the timeline renderer: a bound caption's pixels already belong
    // to its part's cut-out, so painting it again only doubles its edges.
    if (layer.animatable === false) return;

    // Place by rounded edges rather than a rounded centre: at 1:1 this lands
    // the cut-out on the exact integer pixel it was taken from, so the browser
    // does no resampling and the poster at rest is identical to the original.
    const layerScale = layer.scale ?? 1;
    const restLeft = Math.round(layer.x * W);
    const restTop = Math.round(layer.y * H);
    const restW = Math.max(1, Math.round(layer.w * W * layerScale));
    const restH = Math.max(1, Math.round(layer.h * H * layerScale));

    let offsetX = 0;
    let offsetY = 0;
    let scaleMod = 1.0;
    let rotMod = 0;

    const speed = layer.motionSpeed ?? 1.0;
    const dist = layer.motionDistance ?? 20;

    switch (layer.motionType) {
      case "parallax":
        offsetX = -Math.sin(timeMs * 0.0012 * speed) * dist;
        offsetY = Math.cos(timeMs * 0.0015 * speed) * (dist * 0.7);
        break;
      case "float":
        offsetY = Math.sin(timeMs * 0.002 * speed) * dist;
        offsetX = Math.cos(timeMs * 0.0015 * speed) * (dist * 0.4);
        break;
      case "pulse":
        scaleMod = 1.0 + Math.sin(timeMs * 0.003 * speed) * 0.08;
        break;
      case "rotate":
        rotMod = Math.sin(timeMs * 0.002 * speed) * 0.12;
        break;
      case "slide_in": {
        const progress = Math.min(1, Math.max(0, timeMs / 1200));
        const easeOut = 1 - Math.pow(1 - progress, 3);
        offsetY = (1 - easeOut) * -H * 0.3;
        break;
      }
      case "none":
      default:
        break;
    }

    const curW = Math.max(1, Math.round(restW * scaleMod));
    const curH = Math.max(1, Math.round(restH * scaleMod));
    const curLeft = Math.round(restLeft + offsetX - (curW - restW) / 2);
    const curTop = Math.round(restTop + offsetY - (curH - restH) / 2);
    const curRot = (layer.rotation ?? 0) * (Math.PI / 180) + rotMod;

    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1.0;

    const isPaperCutPart = !!data?.paperCutStyle && layer.objectType === "collage-part";

    if (curRot !== 0) {
      ctx.translate(curLeft + curW / 2, curTop + curH / 2);
      ctx.rotate(curRot);
      if (isPaperCutPart) drawPaperFrame(ctx, -curW / 2, -curH / 2, curW, curH);
      ctx.drawImage(imgEl, -curW / 2, -curH / 2, curW, curH);
      ctx.translate(-(curLeft + curW / 2), -(curTop + curH / 2));
    } else {
      if (isPaperCutPart) drawPaperFrame(ctx, curLeft, curTop, curW, curH);
      ctx.drawImage(imgEl, curLeft, curTop, curW, curH);
    }

    // Selection chrome is editor-only — never bake it into an export.
    if (activeLayerId === layer.id && !isExporting) {
      ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = "#A855F7";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(curLeft - 3, curTop - 3, curW + 6, curH + 6);

      ctx.setLineDash([]);
      ctx.fillStyle = "#A855F7";
      const hSz = 6;
      [
        [curLeft - 3, curTop - 3],
        [curLeft + curW + 3, curTop - 3],
        [curLeft - 3, curTop + curH + 3],
        [curLeft + curW + 3, curTop + curH + 3],
      ].forEach(([hx, hy]) => {
        ctx.fillRect(hx - hSz / 2, hy - hSz / 2, hSz, hSz);
      });
    }
    ctx.restore();

    bounds.push({
      id: layer.id,
      label: layer.name || "Decomposed Element",
      x: curLeft,
      y: curTop,
      w: curW,
      h: curH,
    });
  });

  return bounds;
}
