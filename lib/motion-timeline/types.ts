import type { EaseName } from "./easing";

/* ────────────────────────────────────────────────────────────────────────────
 * Authored shape — what an external AI writes and the user pastes in.
 * Everything here is deliberately permissive: `parse.ts` is what turns a
 * loosely-typed blob into the strict compiled form below.
 * ──────────────────────────────────────────────────────────────────────────*/

export const TIMELINE_FORMAT = "stratix.motion.timeline";
export const TIMELINE_VERSION = 1;

/** Every animatable scalar. One independent keyframe channel each. */
export type ChannelName = "opacity" | "xPct" | "yPct" | "scale" | "rotate" | "blur" | "wipe";

export type CameraChannel = "zoom" | "panXPct" | "panYPct";

export type WipeDirection = "left" | "right" | "top" | "bottom";

export interface AuthoredKeyframe {
  tMs?: number;
  t?: number;
  at?: number;
  atMs?: number;
  ease?: string;
  opacity?: number;
  xPct?: number;
  yPct?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  rotation?: number;
  blur?: number;
  wipe?: number;
  wipeFrom?: string;
  [key: string]: unknown;
}

export interface AuthoredCue {
  action?: string;
  type?: string;
  name?: string;
  atMs?: number;
  at?: number;
  tMs?: number;
  t?: number;
  durMs?: number;
  durationMs?: number;
  duration?: number;
  ease?: string;
  [key: string]: unknown;
}

export interface AuthoredTrack {
  id?: string;
  element?: string;
  elementId?: string;
  target?: string;
  slug?: string;
  name?: string;
  visible?: boolean;
  wipeFrom?: string;
  cues?: AuthoredCue[];
  keyframes?: AuthoredKeyframe[];
  [key: string]: unknown;
}

export interface AuthoredTransition {
  type?: string;
  durationMs?: number;
  durMs?: number;
  duration?: number;
}

export interface AuthoredScene {
  slide?: number;
  slideIndex?: number;
  startMs?: number;
  start?: number;
  endMs?: number;
  end?: number;
  label?: string;
  note?: string;
  enter?: AuthoredTransition | string;
  exit?: AuthoredTransition | string;
  camera?: { cues?: AuthoredCue[]; keyframes?: AuthoredKeyframe[] } | AuthoredKeyframe[];
  background?: AuthoredTrack;
  tracks?: AuthoredTrack[];
  elements?: AuthoredTrack[];
  layers?: AuthoredTrack[];
  [key: string]: unknown;
}

export interface AuthoredTimeline {
  format?: string;
  version?: number;
  fps?: number;
  durationMs?: number;
  duration?: number;
  timeBase?: string;
  canvas?: { width?: number; height?: number };
  defaults?: { ease?: string; distancePct?: number };
  scenes?: AuthoredScene[];
  [key: string]: unknown;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Compiled shape — strict, sorted, ready to sample every frame.
 * ──────────────────────────────────────────────────────────────────────────*/

export interface Keyframe {
  tMs: number;
  value: number;
  /** Curve used to travel *into* this keyframe from the previous one. */
  ease: EaseName;
  /** Cue that produced it — powers the "which cue conflicts" warning. */
  source: string;
}

export type Channels = Partial<Record<ChannelName, Keyframe[]>>;

export interface CompiledTrack {
  /** Resolved layer id as it exists on the slide (e.g. "layer_3"). */
  id: string;
  /** What the author wrote, kept for the report when the two differ. */
  authoredId: string;
  label: string;
  visible: boolean;
  wipeFrom: WipeDirection;
  channels: Channels;
}

export type TransitionType = "cut" | "fade" | "dipToBlack";

export interface Transition {
  type: TransitionType;
  durationMs: number;
}

export interface CompiledScene {
  index: number;
  /** 0-based index into the motion slides array. */
  slideIndex: number;
  startMs: number;
  endMs: number;
  label: string;
  enter: Transition;
  exit: Transition;
  camera: Partial<Record<CameraChannel, Keyframe[]>>;
  background: Channels;
  tracks: CompiledTrack[];
}

export interface CompiledTimeline {
  fps: number;
  durationMs: number;
  canvas: { width: number; height: number } | null;
  scenes: CompiledScene[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sampled shape — one frame, handed straight to the canvas renderer.
 * ──────────────────────────────────────────────────────────────────────────*/

export interface LayerState {
  opacity: number;
  xPct: number;
  yPct: number;
  scale: number;
  rotate: number;
  blur: number;
  wipe: number;
  wipeFrom: WipeDirection;
}

export interface CameraState {
  zoom: number;
  panXPct: number;
  panYPct: number;
}

export interface SceneRenderState {
  sceneIndex: number;
  slideIndex: number;
  /** Composite alpha for this scene — <1 only during a transition. */
  alpha: number;
  camera: CameraState;
  background: LayerState;
  layers: Record<string, LayerState>;
}

export interface TimelineFrame {
  timeMs: number;
  /** Painter's order: index 0 is drawn first (outgoing scene during a fade). */
  scenes: SceneRenderState[];
  /** The scene that owns this instant — the one hit-testing should use. */
  activeSceneIndex: number;
  activeSlideIndex: number;
}

export const REST_LAYER_STATE: LayerState = {
  opacity: 1,
  xPct: 0,
  yPct: 0,
  scale: 1,
  rotate: 0,
  blur: 0,
  wipe: 1,
  wipeFrom: "left",
};

export const REST_CAMERA: CameraState = { zoom: 1, panXPct: 0, panYPct: 0 };

/** Rest value per channel — used whenever a channel has no keyframes at all. */
export const CHANNEL_DEFAULTS: Record<ChannelName, number> = {
  opacity: 1,
  xPct: 0,
  yPct: 0,
  scale: 1,
  rotate: 0,
  blur: 0,
  wipe: 1,
};

export const CAMERA_DEFAULTS: Record<CameraChannel, number> = {
  zoom: 1,
  panXPct: 0,
  panYPct: 0,
};

/* ────────────────────────────────────────────────────────────────────────────
 * Validation report
 * ──────────────────────────────────────────────────────────────────────────*/

export interface TimelineIssue {
  level: "error" | "warning";
  message: string;
  /** "scene 2 · layer_4" style breadcrumb, when the issue has a location. */
  where?: string;
}

export interface TimelineReport {
  issues: TimelineIssue[];
  sceneCount: number;
  trackCount: number;
  cueCount: number;
  keyframeCount: number;
  durationMs: number;
  /** Authored ids that matched no layer on the target slide. */
  unmatchedIds: string[];
  /** Layers on used slides that the timeline never mentions. */
  untouchedLayers: string[];
}

export interface ParsedTimelineResult {
  timeline: CompiledTimeline | null;
  report: TimelineReport;
}
