import { REEL_W, REEL_H, type MotionIntensity, type TransitionStyle, type ReelTimeline } from "./reelTypes";

// ─── Easing ─────────────────────────────────────────────────────────────────
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

// ─── Ken Burns ──────────────────────────────────────────────────────────────
// Four preset "moves", cycled deterministically by slide index so consecutive
// slides don't all breathe the same way. Kept subtle by default so a poster's
// edge text/footer never drifts off-canvas.
interface KenBurnsMove { fromScale: number; toScale: number; fromPivot: [number, number]; toPivot: [number, number]; }

const INTENSITY_AMOUNT: Record<MotionIntensity, number> = { off: 0, subtle: 0.06, standard: 0.13 };
const INTENSITY_PAN: Record<MotionIntensity, number> = { off: 0, subtle: 0.03, standard: 0.07 };

function getKenBurnsMove(index: number, intensity: MotionIntensity): KenBurnsMove {
  if (intensity === "off") {
    return { fromScale: 1, toScale: 1, fromPivot: [0.5, 0.5], toPivot: [0.5, 0.5] };
  }
  const amt = INTENSITY_AMOUNT[intensity];
  const pan = INTENSITY_PAN[intensity];
  const variant = index % 4;
  switch (variant) {
    case 0: // slow zoom in, centered
      return { fromScale: 1, toScale: 1 + amt, fromPivot: [0.5, 0.5], toPivot: [0.5, 0.5] };
    case 1: // zoom in while panning toward top-right
      return { fromScale: 1, toScale: 1 + amt, fromPivot: [0.5 - pan, 0.5 + pan], toPivot: [0.5 + pan, 0.5 - pan] };
    case 2: // slow zoom out, centered (starts slightly zoomed)
      return { fromScale: 1 + amt, toScale: 1, fromPivot: [0.5, 0.5], toPivot: [0.5, 0.5] };
    default: // zoom in while panning toward bottom-left
      return { fromScale: 1, toScale: 1 + amt, fromPivot: [0.5 + pan, 0.5 - pan], toPivot: [0.5 - pan, 0.5 + pan] };
  }
}

interface KenBurnsFrame { scale: number; pivotX: number; pivotY: number; }

function computeKenBurnsFrame(index: number, intensity: MotionIntensity, progress: number): KenBurnsFrame {
  const move = getKenBurnsMove(index, intensity);
  const p = easeInOutCubic(clamp01(progress));
  return {
    scale: move.fromScale + (move.toScale - move.fromScale) * p,
    pivotX: move.fromPivot[0] + (move.toPivot[0] - move.fromPivot[0]) * p,
    pivotY: move.fromPivot[1] + (move.toPivot[1] - move.fromPivot[1]) * p,
  };
}

/** Draws a slide (already exactly REEL_W x REEL_H) with an optional extra
 *  punch-scale, pixel offset, and alpha — used both for the plain hold frame
 *  and for every transition variant below. */
function drawSlideKenBurns(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  kb: KenBurnsFrame,
  opts: { extraScale?: number; dx?: number; dy?: number; alpha?: number } = {}
) {
  const { extraScale = 1, dx = 0, dy = 0, alpha = 1 } = opts;
  const scale = kb.scale * extraScale;
  const dw = REEL_W * scale;
  const dh = REEL_H * scale;
  const offsetX = (REEL_W - dw) * kb.pivotX + dx;
  const offsetY = (REEL_H - dh) * kb.pivotY + dy;

  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.drawImage(img, offsetX, offsetY, dw, dh);
  ctx.restore();
}

/** Centered (not pivot-anchored) draw with rotation — used by spinZoom, which
 *  needs to rotate around the canvas center rather than pan toward an edge. */
function drawSlideCentered(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  kb: KenBurnsFrame,
  opts: { rotate?: number; extraScale?: number; alpha?: number } = {}
) {
  const { rotate = 0, extraScale = 1, alpha = 1 } = opts;
  const scale = kb.scale * extraScale;
  const dw = REEL_W * scale;
  const dh = REEL_H * scale;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.translate(REEL_W / 2, REEL_H / 2);
  ctx.rotate(rotate);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/** Horizontal-squeeze "card flip" — scaleX sweeps through 0 (edge-on) to fake
 *  a 3D flip cheaply in 2D canvas. */
function drawSlideFlip(ctx: CanvasRenderingContext2D, img: CanvasImageSource, kb: KenBurnsFrame, scaleX: number, alpha = 1) {
  const dw = REEL_W * kb.scale;
  const dh = REEL_H * kb.scale;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.translate(REEL_W / 2, REEL_H / 2);
  ctx.scale(Math.max(0.001, Math.abs(scaleX)), 1);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

// Deterministic pseudo-random, seeded so a given (time, slot) always produces
// the same jitter — reproducible across preview scrubbing and export, unlike
// Math.random() which would flicker differently every frame.
function seededRand(seed: number, slot: number): number {
  const x = Math.sin(seed * 12.9898 + slot * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Frame drawing ──────────────────────────────────────────────────────────

export interface DrawFrameParams {
  ctx: CanvasRenderingContext2D;
  images: CanvasImageSource[];
  timeline: ReelTimeline;
  time: number; // seconds, clamped to [0, totalDuration]
  motionIntensity: MotionIntensity;
  transitionStyle: TransitionStyle;
}

/** Finds which slide (hold) or slide pair (transition) `time` falls into. */
function locate(timeline: ReelTimeline, time: number): { kind: "hold"; index: number } | { kind: "transition"; a: number; b: number; localT: number } {
  const { slides, transitionDuration } = timeline;
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (time < s.holdEnd || i === slides.length - 1) {
      if (time >= s.holdStart || i === 0) return { kind: "hold", index: i };
      // time is before this slide's hold but after the previous slide's hold —
      // must be inside the transition leading into it.
      const prev = slides[i - 1];
      const localT = transitionDuration > 0 ? (time - prev.holdEnd) / transitionDuration : 1;
      return { kind: "transition", a: i - 1, b: i, localT: clamp01(localT) };
    }
  }
  return { kind: "hold", index: slides.length - 1 };
}

export function drawReelFrame({ ctx, images, timeline, time, motionIntensity, transitionStyle }: DrawFrameParams) {
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  ctx.restore();

  const loc = locate(timeline, time);

  if (loc.kind === "hold") {
    const s = timeline.slides[loc.index];
    const span = Math.max(1e-6, s.visibleEnd - s.visibleStart);
    const progress = (time - s.visibleStart) / span;
    const kb = computeKenBurnsFrame(loc.index, motionIntensity, progress);
    drawSlideKenBurns(ctx, images[loc.index], kb);
    return;
  }

  const { a, b, localT } = loc;
  const sa = timeline.slides[a];
  const sb = timeline.slides[b];
  const spanA = Math.max(1e-6, sa.visibleEnd - sa.visibleStart);
  const spanB = Math.max(1e-6, sb.visibleEnd - sb.visibleStart);
  const progressA = (time - sa.visibleStart) / spanA;
  const progressB = (time - sb.visibleStart) / spanB;
  const kbA = computeKenBurnsFrame(a, motionIntensity, progressA);
  const kbB = computeKenBurnsFrame(b, motionIntensity, progressB);

  switch (transitionStyle) {
    case "push": {
      const u = easeInOutCubic(localT);
      drawSlideKenBurns(ctx, images[a], kbA, { dx: -u * REEL_W });
      drawSlideKenBurns(ctx, images[b], kbB, { dx: (1 - u) * REEL_W });
      break;
    }
    case "zoomPunch": {
      const uIn = easeInCubic(localT);
      const uOut = easeOutCubic(localT);
      drawSlideKenBurns(ctx, images[a], kbA, { extraScale: 1 + 0.22 * uIn, alpha: 1 - localT });
      drawSlideKenBurns(ctx, images[b], kbB, { extraScale: 1.16 - 0.16 * uOut, alpha: localT });
      break;
    }
    case "whooshCut": {
      const dir = a % 2 === 0 ? 1 : -1; // alternate sweep direction per cut
      if (localT < 0.5) {
        const u = easeInCubic(localT / 0.5);
        drawSlideKenBurns(ctx, images[a], kbA, { dx: dir * u * REEL_W * 0.55 });
        // trailing motion-blur echoes
        for (let e = 1; e <= 3; e++) {
          drawSlideKenBurns(ctx, images[a], kbA, { dx: dir * u * REEL_W * 0.55 - dir * e * 26, alpha: 0.12 / e });
        }
      } else {
        const u = easeOutCubic((localT - 0.5) / 0.5);
        // b enters from the side opposite to where a exited, sliding to center.
        const dxB = -dir * REEL_W * 0.55 * (1 - u);
        drawSlideKenBurns(ctx, images[b], kbB, { dx: dxB });
        for (let e = 1; e <= 3; e++) {
          drawSlideKenBurns(ctx, images[b], kbB, { dx: dxB - dir * e * 20, alpha: 0.1 / e });
        }
      }
      // quick bright streak flash across the cut for punch
      const flash = 1 - Math.abs(localT - 0.5) * 2;
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha = flash * 0.35;
        const grad = ctx.createLinearGradient(0, 0, REEL_W, 0);
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, REEL_W, REEL_H);
        ctx.restore();
      }
      break;
    }
    case "slideUp": {
      const u = easeInOutCubic(localT);
      drawSlideKenBurns(ctx, images[a], kbA, { dy: -u * REEL_H });
      drawSlideKenBurns(ctx, images[b], kbB, { dy: (1 - u) * REEL_H });
      break;
    }
    case "slideDown": {
      const u = easeInOutCubic(localT);
      drawSlideKenBurns(ctx, images[a], kbA, { dy: u * REEL_H });
      drawSlideKenBurns(ctx, images[b], kbB, { dy: -(1 - u) * REEL_H });
      break;
    }
    case "irisCircle": {
      drawSlideKenBurns(ctx, images[a], kbA);
      const u = easeInOutCubic(localT);
      const maxR = (Math.hypot(REEL_W, REEL_H) / 2) * 1.05;
      ctx.save();
      ctx.beginPath();
      ctx.arc(REEL_W / 2, REEL_H / 2, Math.max(0.001, u * maxR), 0, Math.PI * 2);
      ctx.clip();
      drawSlideKenBurns(ctx, images[b], kbB);
      ctx.restore();
      break;
    }
    case "diagonalWipe": {
      drawSlideKenBurns(ctx, images[a], kbA);
      const u = easeInOutCubic(localT);
      // Right boundary of the revealed region at row y is `cx - y`; sweeping cx
      // from -H (nothing revealed) to W+H (fully revealed at every row) covers
      // the whole frame regardless of the 9:16 aspect's tall H vs narrow W.
      const cx = -REEL_H + u * (REEL_W + 2 * REEL_H);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(cx, 0);
      ctx.lineTo(cx - REEL_H, REEL_H);
      ctx.lineTo(0, REEL_H);
      ctx.closePath();
      ctx.clip();
      drawSlideKenBurns(ctx, images[b], kbB);
      ctx.restore();
      break;
    }
    case "flashCut": {
      // Hard cut bridged by a fast white flash — a common punchy, high-energy
      // short-form edit technique.
      const cutAt = 0.5;
      const beforeCut = localT < cutAt;
      drawSlideKenBurns(ctx, beforeCut ? images[a] : images[b], beforeCut ? kbA : kbB);
      const flashWindow = 0.22;
      const flash = clamp01(1 - Math.abs(localT - cutAt) / flashWindow);
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha = flash;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, REEL_W, REEL_H);
        ctx.restore();
      }
      break;
    }
    case "glitch": {
      const cutAt = 0.5;
      const beforeCut = localT < cutAt;
      const img = beforeCut ? images[a] : images[b];
      const kb = beforeCut ? kbA : kbB;
      const glitchWindow = 0.3;
      const glitchAmt = clamp01(1 - Math.abs(localT - cutAt) / glitchWindow);

      drawSlideKenBurns(ctx, img, kb);

      if (glitchAmt > 0.02) {
        const seed = Math.floor(localT * 977) + (beforeCut ? 0 : 500);
        const sliceCount = 8;
        for (let i = 0; i < sliceCount; i++) {
          const sy = (REEL_H / sliceCount) * i;
          const sh = REEL_H / sliceCount;
          const jitter = (seededRand(seed, i) - 0.5) * 70 * glitchAmt;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, sy, REEL_W, sh);
          ctx.clip();
          drawSlideKenBurns(ctx, img, kb, { dx: jitter });
          if (seededRand(seed, i + 50) > 0.55) {
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = 0.18 * glitchAmt;
            ctx.fillStyle = seededRand(seed, i + 20) > 0.5 ? "#ff2b6d" : "#2be6ff";
            ctx.fillRect(0, sy, REEL_W, sh);
          }
          ctx.restore();
        }
      }
      break;
    }
    case "blurDissolve": {
      // Directional ghost-trail crossfade (whip-pan blur feel), peaking at the
      // transition midpoint and resolving to a clean frame at both ends.
      const u = easeInOutCubic(localT);
      const dir = a % 2 === 0 ? 1 : -1;
      const blurSpread = 90;
      const blurAmt = Math.sin(Math.PI * clamp01(localT));
      const ghostCount = 5;
      for (let g = ghostCount; g >= 0; g--) {
        const gf = g / ghostCount;
        drawSlideKenBurns(ctx, images[a], kbA, {
          dx: dir * gf * blurSpread * blurAmt,
          alpha: (1 - u) * (1 - gf * 0.75) * (g === 0 ? 1 : 0.5),
        });
      }
      for (let g = ghostCount; g >= 0; g--) {
        const gf = g / ghostCount;
        drawSlideKenBurns(ctx, images[b], kbB, {
          dx: -dir * gf * blurSpread * blurAmt,
          alpha: u * (1 - gf * 0.75) * (g === 0 ? 1 : 0.5),
        });
      }
      break;
    }
    case "spinZoom": {
      const uIn = easeInCubic(localT);
      const uOut = easeOutCubic(localT);
      const dir = a % 2 === 0 ? 1 : -1;
      drawSlideCentered(ctx, images[a], kbA, { rotate: dir * uIn * 0.35, extraScale: 1 + 0.5 * uIn, alpha: 1 - localT });
      drawSlideCentered(ctx, images[b], kbB, { rotate: -dir * (1 - uOut) * 0.35, extraScale: 1.5 - 0.5 * uOut, alpha: localT });
      break;
    }
    case "splitReveal": {
      const u = easeInOutCubic(localT);
      drawSlideKenBurns(ctx, images[b], kbB);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, REEL_W, REEL_H / 2);
      ctx.clip();
      drawSlideKenBurns(ctx, images[a], kbA, { dy: -u * (REEL_H / 2) * 1.3 });
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, REEL_H / 2, REEL_W, REEL_H / 2);
      ctx.clip();
      drawSlideKenBurns(ctx, images[a], kbA, { dy: u * (REEL_H / 2) * 1.3 });
      ctx.restore();
      break;
    }
    case "cardFlip": {
      // A squeezes to edge-on (scaleX 1->0), then B unsqueezes (0->1).
      if (localT < 0.5) {
        drawSlideFlip(ctx, images[a], kbA, 1 - easeInCubic(localT / 0.5));
      } else {
        drawSlideFlip(ctx, images[b], kbB, easeOutCubic((localT - 0.5) / 0.5));
      }
      break;
    }
    case "crossfade":
    default: {
      const u = easeInOutCubic(localT);
      drawSlideKenBurns(ctx, images[a], kbA, { alpha: 1 - u });
      drawSlideKenBurns(ctx, images[b], kbB, { alpha: u });
      break;
    }
  }
}
