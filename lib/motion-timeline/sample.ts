import { applyEase } from "./easing";
import {
  CAMERA_DEFAULTS,
  CHANNEL_DEFAULTS,
  REST_LAYER_STATE,
  type ActiveOverlayState,
  type CameraChannel,
  type CameraState,
  type Channels,
  type CompiledScene,
  type CompiledTimeline,
  type Keyframe,
  type LayerState,
  type SceneRenderState,
  type TimelineFrame,
} from "./types";

/**
 * Reads one channel at time t.
 *
 * Outside the keyframe range the value is *clamped*, never extrapolated: an
 * element holds its first authored state before its first keyframe and its
 * last state forever after. That is what makes "fade in at 3.2s" behave the
 * way anyone reading it expects — invisible until 3.2s, not half-visible.
 */
export function sampleChannel(kfs: Keyframe[] | undefined, tMs: number, fallback: number): number {
  if (!kfs || kfs.length === 0) return fallback;
  if (tMs <= kfs[0].tMs) return kfs[0].value;

  const last = kfs[kfs.length - 1];
  if (tMs >= last.tMs) return last.value;

  // Binary search for the segment containing t.
  let lo = 0;
  let hi = kfs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (kfs[mid].tMs <= tMs) lo = mid;
    else hi = mid;
  }

  const a = kfs[lo];
  const b = kfs[hi];
  const span = b.tMs - a.tMs;
  if (span <= 0) return b.value;
  return a.value + (b.value - a.value) * applyEase(b.ease, (tMs - a.tMs) / span);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function sampleChannels(
  channels: Channels,
  tMs: number,
  wipeFrom: LayerState["wipeFrom"],
  wipeStyle: LayerState["wipeStyle"]
): LayerState {
  return {
    opacity: clamp01(sampleChannel(channels.opacity, tMs, CHANNEL_DEFAULTS.opacity)),
    xPct: sampleChannel(channels.xPct, tMs, CHANNEL_DEFAULTS.xPct),
    yPct: sampleChannel(channels.yPct, tMs, CHANNEL_DEFAULTS.yPct),
    scale: sampleChannel(channels.scale, tMs, CHANNEL_DEFAULTS.scale),
    rotate: sampleChannel(channels.rotate, tMs, CHANNEL_DEFAULTS.rotate),
    blur: Math.max(0, sampleChannel(channels.blur, tMs, CHANNEL_DEFAULTS.blur)),
    wipe: clamp01(sampleChannel(channels.wipe, tMs, CHANNEL_DEFAULTS.wipe)),
    wipeFrom,
    wipeStyle,
  };
}

function sampleCamera(scene: CompiledScene, tMs: number): CameraState {
  const get = (ch: CameraChannel) => sampleChannel(scene.camera[ch], tMs, CAMERA_DEFAULTS[ch]);
  return { zoom: Math.max(0.01, get("zoom")), panXPct: get("panXPct"), panYPct: get("panYPct") };
}

function sceneState(scene: CompiledScene, tMs: number, alpha: number): SceneRenderState {
  const layers: Record<string, LayerState> = {};
  scene.tracks.forEach((track) => {
    const state = sampleChannels(track.channels, tMs, track.wipeFrom, track.wipeStyle);
    layers[track.id] = track.visible ? state : { ...state, opacity: 0 };
  });

  return {
    sceneIndex: scene.index,
    slideIndex: scene.slideIndex,
    alpha,
    camera: sampleCamera(scene, tMs),
    background: sampleChannels(scene.background, tMs, "left", "straight"),
    layers,
  };
}

/** Index of the scene that owns `tMs` (the last one that has started). */
export function findSceneIndex(timeline: CompiledTimeline, tMs: number): number {
  const { scenes } = timeline;
  let idx = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (scenes[i].startMs <= tMs) idx = i;
    else break;
  }
  return idx;
}

/**
 * Overlay clips whose own [startMs, startMs+durationMs) window contains `t`,
 * ascending by zIndex so the renderer can just paint them in array order.
 * `localTimeMs` is elapsed time since the clip's own start — the renderer
 * mods it by the <video>'s native duration to loop a clip run longer than
 * its source, since that duration isn't known until the element decodes it.
 */
function activeOverlaysAt(timeline: CompiledTimeline, t: number): ActiveOverlayState[] {
  return timeline.overlays
    .filter((o) => t >= o.startMs && t < o.startMs + o.durationMs)
    .map((o) => ({
      id: o.id,
      videoUrl: o.videoUrl,
      zIndex: o.zIndex,
      captionOverlay: o.captionOverlay,
      localTimeMs: t - o.startMs,
    }))
    .sort((a, b) => a.zIndex - b.zIndex);
}

/**
 * Everything the renderer needs for one instant.
 *
 * Returns one scene normally and two mid-transition — the outgoing scene
 * underneath, the incoming one dissolving over it — so a cross-dissolve is a
 * plain painter's-order draw rather than a special case in the canvas code.
 */
export function sampleTimeline(timeline: CompiledTimeline, timeMs: number): TimelineFrame {
  const { scenes } = timeline;
  const t = Math.max(0, Math.min(timeMs, timeline.durationMs));

  const activeIdx = findSceneIndex(timeline, t);
  const scene = scenes[activeIdx];
  const prev = activeIdx > 0 ? scenes[activeIdx - 1] : null;
  const next = activeIdx < scenes.length - 1 ? scenes[activeIdx + 1] : null;

  const out: SceneRenderState[] = [];
  const enter = scene.enter;
  const sinceStart = t - scene.startMs;

  let alpha = 1;
  let transProgress: number | undefined = undefined;
  let transStyle = enter.type;

  if (enter.type !== "cut" && enter.durationMs > 0 && sinceStart < enter.durationMs) {
    const p = clamp01(sinceStart / enter.durationMs);
    transProgress = p;

    if (enter.type === "dipToBlack") {
      // First half fades the outgoing scene to black, second half brings the
      // incoming one up — the two never overlap.
      if (p < 0.5 && prev) {
        const prevScene = sceneState(prev, t, 1 - p * 2);
        prevScene.transitionProgress = p;
        prevScene.transitionStyle = enter.type;
        out.push(prevScene);
        alpha = 0;
      } else {
        alpha = clamp01((p - 0.5) * 2);
      }
    } else {
      // Overlapping scene transition (motion slide, glitch, flash, zoom, spin, etc.)
      if (prev) {
        const prevScene = sceneState(prev, t, 1);
        prevScene.transitionProgress = p;
        prevScene.transitionStyle = enter.type;
        out.push(prevScene);
      }
      alpha = p;
    }
  }

  // A scene only plays its own exit when nothing dissolves in over it — either
  // it is the last scene, or there is a hole before the next one starts.
  const gapAfter = next ? next.startMs - scene.endMs : Infinity;
  const exitApplies = scene.exit.type !== "cut" && scene.exit.durationMs > 0 && (!next || gapAfter > 1);
  if (exitApplies) {
    const untilEnd = scene.endMs - t;
    if (untilEnd < scene.exit.durationMs) {
      alpha = Math.min(alpha, clamp01(untilEnd / scene.exit.durationMs));
    }
  }

  const currentScene = sceneState(scene, t, clamp01(alpha));
  if (transProgress !== undefined) {
    currentScene.transitionProgress = transProgress;
    currentScene.transitionStyle = transStyle;
  }
  out.push(currentScene);

  return {
    timeMs: t,
    scenes: out,
    activeSceneIndex: activeIdx,
    activeSlideIndex: scene.slideIndex,
    transitionProgress: transProgress,
    transitionStyle: transProgress !== undefined ? transStyle : undefined,
    activeOverlays: activeOverlaysAt(timeline, t),
  };
}

export { REST_LAYER_STATE };
