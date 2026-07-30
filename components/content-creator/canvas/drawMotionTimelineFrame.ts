import type { LayerState, SceneRenderState, TimelineFrame } from "@/lib/motion-timeline";
import { REST_LAYER_STATE } from "@/lib/motion-timeline";
import type { MotionLayer, MotionSlide, PosterElement } from "../types";

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
}

export interface TimelineRenderOptions {
  activeLayerId?: string;
  showSelection?: boolean;
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

function applyWipeClip(
  ctx: CanvasRenderingContext2D,
  state: LayerState,
  left: number,
  top: number,
  width: number,
  height: number
) {
  if (state.wipe >= 0.999) return;
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

function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  scene: SceneRenderState,
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
  const bgUrl = slide.backgroundUrl || slide.originalUrl;
  const bgImg = bgUrl ? assets.bgImgs[bgUrl] : null;
  const bg = scene.background;
  if (ready(bgImg) && bg.opacity > 0.001) {
    const bw = sw * fit * bg.scale;
    const bh = sh * fit * bg.scale;
    const bx = originX - (bw - sw * fit) / 2 + (bg.xPct / 100) * W;
    const by = originY - (bh - sh * fit) / 2 + (bg.yPct / 100) * H;
    ctx.save();
    ctx.globalAlpha = scene.alpha * bg.opacity;
    if (bg.blur > 0.01) ctx.filter = `blur(${bg.blur}px)`;
    ctx.drawImage(bgImg, bx, by, bw, bh);
    ctx.restore();
  }

  // 2. Elements, in the z-order the decomposer assigned.
  const perSlide = assets.layerImgEls[slide.slideId] || {};
  const ordered = [...(slide.layers || [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  ordered.forEach((layer: MotionLayer) => {
    const img = perSlide[layer.id];
    if (!ready(img)) return;

    // Untracked elements sit at rest — an unmentioned element still renders
    // exactly as it was uploaded rather than vanishing.
    const state = scene.layers[layer.id] ?? REST_LAYER_STATE;
    if (state.opacity <= 0.001) return;

    const restLeft = originX + layer.x * sw * fit;
    const restTop = originY + layer.y * sh * fit;
    const baseW = Math.max(1, layer.w * sw * fit * (layer.scale ?? 1));
    const baseH = Math.max(1, layer.h * sh * fit * (layer.scale ?? 1));

    const curW = Math.max(1, baseW * state.scale);
    const curH = Math.max(1, baseH * state.scale);
    // Scale about the element's own centre, then displace.
    const left = restLeft - (curW - baseW) / 2 + (state.xPct / 100) * W;
    const top = restTop - (curH - baseH) / 2 + (state.yPct / 100) * H;
    const rot = ((layer.rotation ?? 0) + state.rotate) * (Math.PI / 180);

    ctx.save();
    ctx.globalAlpha = scene.alpha * state.opacity * (layer.opacity ?? 1);
    if (state.blur > 0.01) ctx.filter = `blur(${state.blur}px)`;

    if (rot !== 0) {
      ctx.translate(left + curW / 2, top + curH / 2);
      ctx.rotate(rot);
      applyWipeClip(ctx, state, -curW / 2, -curH / 2, curW, curH);
      ctx.drawImage(img, -curW / 2, -curH / 2, curW, curH);
    } else {
      applyWipeClip(ctx, state, left, top, curW, curH);
      ctx.drawImage(img, left, top, curW, curH);
    }
    ctx.restore();

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

export function drawMotionTimelineFrame(
  canvas: HTMLCanvasElement,
  frame: TimelineFrame,
  assets: TimelineRenderAssets,
  size: { w: number; h: number },
  opts: TimelineRenderOptions = {}
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

  // Black, not transparent: a fade-in or a dip-to-black has to resolve against
  // something, and a recorded WebM of a transparent canvas is undefined.
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  let bounds: PosterElement[] = [];
  frame.scenes.forEach((scene, i) => {
    const isTop = i === frame.scenes.length - 1;
    const result = drawScene(ctx, W, H, scene, assets, opts, isTop);
    if (isTop) bounds = result;
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  return bounds;
}
