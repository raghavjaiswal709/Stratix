/**
 * The editable model.
 *
 * Playback runs on the *compiled* timeline, which has already expanded every
 * cue into keyframes — a one-way transform. So an editor cannot round-trip
 * through it: "move this fadeInUp 200ms later" is not a question you can ask a
 * keyframe array. Editing therefore happens on the authored document, and this
 * module is the layer that makes that document safe to edit:
 *
 *   • `toEditable` gives every scene, track and cue a stable id and resolved
 *     numbers, so the UI can address one cue across re-renders and undo steps.
 *   • Every operation returns a NEW document — undo/redo is then just a stack
 *     of references, with no snapshot cost and no aliasing bugs.
 *   • `normalize` re-establishes the invariants the compiler depends on
 *     (ordered, contiguous scenes; cues inside their own scene) after every
 *     edit, so no sequence of drags can produce a timeline that fails to
 *     compile.
 */

import type {
  AuthoredCue,
  AuthoredOverlayClip,
  AuthoredScene,
  AuthoredTimeline,
  AuthoredTrack,
  TransitionType,
  WipeDirection,
} from "./types";
import { TIMELINE_FORMAT } from "./types";

/** Shortest cue anyone can drag to — below this it is not a visible event. */
export const MIN_CUE_MS = 60;
/** Shortest scene. Matches the auto-syncer's own floor. */
export const MIN_SCENE_MS = 400;

export interface EditableCue {
  /** Stable within a session; regenerated on load. */
  id: string;
  action: string;
  atMs: number;
  durMs: number;
  ease?: string;
  /** Trigger word, when this cue is locked to the transcript. */
  word?: string;
  /** Everything else the cue carries (distancePct, amount, fromScale…). */
  params: Record<string, number | string>;
  /** True once a user has hand-dragged this cue — see moveCue/resizeCue and cueToAuthored's word-detach gate. */
  manual: boolean;
  /** atMs/durMs from just before the first manual edit — what "reset" restores. */
  autoAtMs: number;
  autoDurMs: number;
}

export interface EditableTrack {
  id: string;
  /** Layer id on the slide — what the cue actually addresses. */
  layerId: string;
  name: string;
  visible: boolean;
  wipeFrom?: WipeDirection;
  cues: EditableCue[];
}

export interface EditableTransition {
  type: TransitionType;
  durationMs: number;
}

export interface EditableScene {
  id: string;
  /** 0-based index into the slides array. */
  slideIndex: number;
  label: string;
  startMs: number;
  endMs: number;
  enter: EditableTransition;
  exit: EditableTransition;
  /** Camera cues live on the scene, not on a track. */
  camera: EditableCue[];
  tracks: EditableTrack[];
  /** Title-card text; when set, this scene paints as a card, not a slide. */
  intro?: string;
  /** True once a user has hand-overridden this scene's timing — see shiftScene/resizeSceneStart/resizeSceneEnd. */
  manual: boolean;
  /** startMs/endMs from just before the first manual edit — what "reset" restores. */
  autoStartMs: number;
  autoEndMs: number;
}

/** A clip inserted at an arbitrary point on the timeline — see AuthoredOverlayClip. */
export interface EditableOverlayClip {
  id: string;
  label: string;
  videoUrl: string;
  startMs: number;
  durationMs: number;
  zIndex: number;
  captionOverlay: boolean;
  /** True once a user has hand-dragged this clip — see updateOverlay. */
  manual: boolean;
  /** startMs/durationMs from just before the first manual edit — what "reset" restores. */
  autoStartMs: number;
  autoDurationMs: number;
}

export interface EditableTimeline {
  fps: number;
  durationMs: number;
  defaults: { ease: string; distancePct: number };
  scenes: EditableScene[];
  overlays: EditableOverlayClip[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Conversion
 * ──────────────────────────────────────────────────────────────────────────*/

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${(idCounter += 1).toString(36)}`;

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const RESERVED_CUE_KEYS = new Set([
  "action", "type", "name", "atMs", "at", "tMs", "t",
  "durMs", "durationMs", "duration", "ease", "word", "phrase", "onWord", "syllable", "note", "comment",
  "manual", "autoAtMs", "autoDurMs",
]);

function cueToEditable(raw: AuthoredCue): EditableCue | null {
  const action = str(raw.action) ?? str(raw.type) ?? str(raw.name);
  if (!action) return null;

  const at = [raw.atMs, raw.at, raw.tMs, raw.t].find((v) => typeof v === "number" && Number.isFinite(v));
  const dur = [raw.durMs, raw.durationMs, raw.duration].find((v) => typeof v === "number" && Number.isFinite(v));

  const params: Record<string, number | string> = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (RESERVED_CUE_KEYS.has(k)) return;
    if (typeof v === "number" || typeof v === "string") params[k] = v;
  });

  const atMs = Math.round(num(at, 0));
  const durMs = Math.max(0, Math.round(num(dur, 320)));

  return {
    id: nextId("cue"),
    action,
    atMs,
    durMs,
    ease: str(raw.ease),
    word: str(raw.word) ?? str(raw.phrase) ?? str(raw.onWord),
    params,
    manual: raw.manual === true,
    // A fresh (never-yet-manual) cue has no baseline to speak of — default it
    // to its own current timing so it's ready the instant it becomes manual.
    autoAtMs: Math.round(num(raw.autoAtMs, atMs)),
    autoDurMs: Math.round(num(raw.autoDurMs, durMs)),
  };
}

function overlayToEditable(raw: AuthoredOverlayClip): EditableOverlayClip | null {
  const videoUrl = str(raw.videoUrl) ?? str(raw.url) ?? str(raw.src);
  if (!videoUrl) return null;
  const startMs = [raw.startMs, raw.start].find((v) => typeof v === "number");
  const durationMs = [raw.durationMs, raw.duration].find((v) => typeof v === "number");
  const resolvedStartMs = Math.max(0, Math.round(num(startMs, 0)));
  const resolvedDurationMs = Math.max(100, Math.round(num(durationMs, 3000)));
  return {
    // Preserved from the authored id when present — compileOverlays (see
    // compile.ts) does the same, so the editable doc and the compiled
    // timeline agree on overlay ids for anything parsed from the same
    // source (a reload from history, an AI-authored timeline). Losing that
    // agreement is what used to tear down and rebuild every overlay's
    // <video> element (see the lifecycle effect in useMotionCore.ts) the
    // moment a saved project's first edit landed: the editable doc would
    // mint fresh ids no compiled overlay had ever used, so the very next
    // recompile looked like every single clip had just been deleted and a
    // brand-new one added in its place.
    id: str(raw.id) ?? nextId("overlay"),
    label: str(raw.label) ?? "Clip",
    videoUrl,
    startMs: resolvedStartMs,
    durationMs: resolvedDurationMs,
    zIndex: Math.round(num(raw.zIndex, 0)),
    captionOverlay: raw.captionOverlay === true,
    manual: raw.manual === true,
    autoStartMs: Math.round(num(raw.autoStartMs, resolvedStartMs)),
    autoDurationMs: Math.round(num(raw.autoDurationMs, resolvedDurationMs)),
  };
}

function overlayToAuthored(o: EditableOverlayClip): AuthoredOverlayClip {
  const out: AuthoredOverlayClip = {
    id: o.id,
    label: o.label,
    videoUrl: o.videoUrl,
    startMs: Math.round(o.startMs),
    durationMs: Math.round(o.durationMs),
    zIndex: o.zIndex,
    captionOverlay: o.captionOverlay,
  };
  if (o.manual) {
    out.manual = true;
    out.autoStartMs = Math.round(o.autoStartMs);
    out.autoDurationMs = Math.round(o.autoDurationMs);
  }
  return out;
}

function transitionToEditable(raw: unknown, fallback: TransitionType): EditableTransition {
  if (typeof raw === "string") {
    const t = raw.toLowerCase();
    const type: TransitionType = t.includes("dip") ? "dipToBlack" : t.includes("fade") || t.includes("dissolve") ? "fade" : "cut";
    return { type, durationMs: type === "cut" ? 0 : 320 };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const rawType = (str(o.type) ?? fallback).toLowerCase();
    const type: TransitionType = rawType.includes("dip")
      ? "dipToBlack"
      : rawType.includes("fade") || rawType.includes("dissolve")
      ? "fade"
      : "cut";
    const d = [o.durationMs, o.durMs, o.duration].find((v) => typeof v === "number");
    return { type, durationMs: type === "cut" ? 0 : Math.max(0, Math.round(num(d, 320))) };
  }
  return { type: fallback, durationMs: fallback === "cut" ? 0 : 320 };
}

export function toEditable(doc: AuthoredTimeline, slideCount: number): EditableTimeline {
  const rawScenes = Array.isArray(doc.scenes) ? doc.scenes : [];

  const scenes: EditableScene[] = rawScenes.map((s: AuthoredScene, i) => {
    const slideRaw = [s.slide, s.slideIndex].find((v) => typeof v === "number");
    // `slide` is 1-based in the authored document, `slideIndex` 0-based.
    const slideIndex =
      typeof s.slide === "number" ? s.slide - 1 : typeof s.slideIndex === "number" ? s.slideIndex : i;

    const rawTracks: AuthoredTrack[] = [
      ...(Array.isArray(s.tracks) ? s.tracks : []),
      ...(Array.isArray(s.elements) ? s.elements : []),
      ...(Array.isArray(s.layers) ? s.layers : []),
    ];

    const cameraSource = Array.isArray(s.camera)
      ? []
      : (s.camera as { cues?: AuthoredCue[] } | undefined)?.cues ?? [];

    const startMs = Math.round(num([s.startMs, s.start].find((v) => typeof v === "number"), 0));
    const endMs = Math.round(num([s.endMs, s.end].find((v) => typeof v === "number"), 0));

    return {
      id: nextId("scene"),
      slideIndex: Math.max(0, Math.min(Math.max(0, slideCount - 1), Number.isFinite(slideIndex) ? slideIndex : i)),
      label: str(s.label) ?? str(s.note) ?? `Scene ${i + 1}`,
      startMs,
      endMs,
      manual: s.manual === true,
      autoStartMs: Math.round(num(s.autoStartMs, startMs)),
      autoEndMs: Math.round(num(s.autoEndMs, endMs)),
      enter: transitionToEditable(s.enter, i === 0 ? "fade" : "cut"),
      exit: transitionToEditable(s.exit, "cut"),
      camera: cameraSource.map(cueToEditable).filter((c): c is EditableCue => c !== null),
      tracks: rawTracks
        .map((t): EditableTrack | null => {
          const layerId = str(t.id) ?? str(t.element) ?? str(t.elementId) ?? str(t.target) ?? str(t.slug);
          if (!layerId) return null;
          const cues = (Array.isArray(t.cues) ? t.cues : [])
            .map(cueToEditable)
            .filter((c): c is EditableCue => c !== null);
          return {
            id: nextId("track"),
            layerId,
            name: str(t.name) ?? layerId,
            visible: t.visible !== false,
            wipeFrom: str(t.wipeFrom) as WipeDirection | undefined,
            cues,
          };
        })
        .filter((t): t is EditableTrack => t !== null),
      intro: str(s.intro),
      _slideRaw: slideRaw,
    } as EditableScene;
  });

  const overlays = (Array.isArray(doc.overlays) ? doc.overlays : [])
    .map(overlayToEditable)
    .filter((o): o is EditableOverlayClip => o !== null);

  return normalize({
    fps: Math.round(num(doc.fps, 60)),
    durationMs: Math.round(num([doc.durationMs, doc.duration].find((v) => typeof v === "number"), 0)),
    defaults: {
      ease: str(doc.defaults?.ease) ?? "easeOutCubic",
      distancePct: num(doc.defaults?.distancePct, 3),
    },
    scenes,
    overlays,
  });
}

export function toAuthored(doc: EditableTimeline): AuthoredTimeline {
  return {
    format: TIMELINE_FORMAT,
    version: 1,
    fps: doc.fps,
    durationMs: doc.durationMs,
    timeBase: "absolute",
    defaults: doc.defaults,
    scenes: doc.scenes.map((s) => {
      const scene: AuthoredScene = {
        slide: s.slideIndex + 1,
        label: s.label,
        startMs: Math.round(s.startMs),
        endMs: Math.round(s.endMs),
        enter: { type: s.enter.type, durationMs: s.enter.durationMs },
        exit: { type: s.exit.type, durationMs: s.exit.durationMs },
        tracks: s.tracks.map((t) => {
          const track: AuthoredTrack = {
            id: t.layerId,
            name: t.name,
            cues: t.cues.map(cueToAuthored),
          };
          if (t.wipeFrom) track.wipeFrom = t.wipeFrom;
          if (!t.visible) track.visible = false;
          return track;
        }),
      };
      if (s.camera.length > 0) scene.camera = { cues: s.camera.map(cueToAuthored) };
      if (s.intro) scene.intro = s.intro;
      if (s.manual) {
        scene.manual = true;
        scene.autoStartMs = Math.round(s.autoStartMs);
        scene.autoEndMs = Math.round(s.autoEndMs);
      }
      return scene;
    }),
    overlays: doc.overlays.map(overlayToAuthored),
  };
}

function cueToAuthored(c: EditableCue): AuthoredCue {
  const out: AuthoredCue = { action: c.action, atMs: Math.round(c.atMs) };
  if (c.durMs > 0) out.durMs = Math.round(c.durMs);
  if (c.ease) out.ease = c.ease;
  // A manually-retimed cue must stop being re-derived from its transcript
  // word on the next compile — see compile.ts's snapToWord, which otherwise
  // unconditionally overwrites atMs from the transcript on every recompile,
  // silently undoing a drag one frame after it happens. `c.word` itself is
  // left untouched on the editable doc (not cleared) so that resetting
  // `manual` alone is enough to re-attach it — see resetAllModifications.
  if (c.word && !c.manual) out.word = c.word;
  if (c.manual) {
    out.manual = true;
    out.autoAtMs = Math.round(c.autoAtMs);
    out.autoDurMs = Math.round(c.autoDurMs);
  }
  Object.entries(c.params).forEach(([k, v]) => {
    (out as Record<string, unknown>)[k] = v;
  });
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Invariants
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * Re-establishes everything the compiler assumes, after any edit.
 *
 * Scenes are deliberately NOT forced contiguous here — no gap-closing, no
 * pushing a scene forward to avoid an overlap. Moving or resizing one scene
 * must never resize or reposition any other scene; that ripple was the bug
 * (a neighbor's own window would change shape without its content being told
 * to adapt, so its elements looked "left behind"). Overlap and gaps are both
 * already meaningful to the player: sample.ts's findSceneIndex resolves an
 * overlap by picking whichever scene started most recently, and a gap simply
 * freezes the previous scene on screen until the next one starts — neither
 * needs the editor to prevent it. Scenes ARE still sorted by startMs, purely
 * for a stable render/gutter order and because findSceneIndex's "last scene
 * that has started" rule depends on it. Cues are still clamped into their
 * own scene's window, because a cue outside it fires on a slide that scene
 * isn't even showing at that instant.
 */
export function normalize(doc: EditableTimeline): EditableTimeline {
  const scenes = [...doc.scenes]
    .sort((a, b) => a.startMs - b.startMs)
    .map((scene) => {
      const startMs = Math.max(0, Math.round(scene.startMs));
      const endMs = Math.max(startMs + MIN_SCENE_MS, Math.round(scene.endMs));
      if (startMs === scene.startMs && endMs === scene.endMs) return scene;
      return { ...scene, startMs, endMs };
    });

  const clamped = scenes.map((scene) => ({
    ...scene,
    camera: scene.camera.map((c) => clampCue(c, scene)),
    tracks: scene.tracks.map((t) => ({
      ...t,
      cues: [...t.cues].map((c) => clampCue(c, scene)).sort((a, b) => a.atMs - b.atMs),
    })),
  }));

  return {
    ...doc,
    scenes: clamped,
    overlays: doc.overlays.map(clampOverlay),
    // The last scene by START isn't necessarily the last one to END once
    // overlap/gaps are allowed, so the reel's length is the latest of any of them.
    durationMs: clamped.length ? Math.max(...clamped.map((s) => s.endMs)) : 0,
  };
}

/** An overlay has no scene to live inside, so unlike a cue it only needs its own two numbers kept sane. */
function clampOverlay(o: EditableOverlayClip): EditableOverlayClip {
  const startMs = Math.max(0, Math.round(o.startMs));
  const durationMs = Math.max(100, Math.round(o.durationMs));
  if (startMs === o.startMs && durationMs === o.durationMs) return o;
  return { ...o, startMs, durationMs };
}

function clampCue(cue: EditableCue, scene: EditableScene): EditableCue {
  const maxDur = Math.max(MIN_CUE_MS, scene.endMs - scene.startMs);
  const durMs = Math.min(Math.max(cue.durMs === 0 ? 0 : MIN_CUE_MS, cue.durMs), maxDur);
  const latest = Math.max(scene.startMs, scene.endMs - Math.max(durMs, 1));
  const atMs = Math.min(Math.max(Math.round(cue.atMs), scene.startMs), latest);
  if (atMs === cue.atMs && durMs === cue.durMs) return cue;
  return { ...cue, atMs, durMs };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Operations — every one returns a new document
 * ──────────────────────────────────────────────────────────────────────────*/

function mapScene(
  doc: EditableTimeline,
  sceneId: string,
  fn: (scene: EditableScene) => EditableScene
): EditableTimeline {
  return normalize({ ...doc, scenes: doc.scenes.map((s) => (s.id === sceneId ? fn(s) : s)) });
}

function mapCue(
  doc: EditableTimeline,
  sceneId: string,
  trackId: string | null,
  cueId: string,
  fn: (cue: EditableCue) => EditableCue
): EditableTimeline {
  return mapScene(doc, sceneId, (scene) => {
    if (trackId === null) {
      return { ...scene, camera: scene.camera.map((c) => (c.id === cueId ? fn(c) : c)) };
    }
    return {
      ...scene,
      tracks: scene.tracks.map((t) =>
        t.id === trackId ? { ...t, cues: t.cues.map((c) => (c.id === cueId ? fn(c) : c)) } : t
      ),
    };
  });
}

/** A cue's first manual timing edit locks in its pre-edit atMs/durMs as the reset baseline; later edits leave that baseline alone. */
function markCueManual(c: EditableCue): Pick<EditableCue, "manual" | "autoAtMs" | "autoDurMs"> {
  return c.manual
    ? { manual: true, autoAtMs: c.autoAtMs, autoDurMs: c.autoDurMs }
    : { manual: true, autoAtMs: c.atMs, autoDurMs: c.durMs };
}

export function moveCue(doc: EditableTimeline, sceneId: string, trackId: string | null, cueId: string, atMs: number) {
  return mapCue(doc, sceneId, trackId, cueId, (c) => ({ ...c, ...markCueManual(c), atMs: Math.round(atMs) }));
}

export function resizeCue(doc: EditableTimeline, sceneId: string, trackId: string | null, cueId: string, durMs: number) {
  return mapCue(doc, sceneId, trackId, cueId, (c) => ({
    ...c,
    ...markCueManual(c),
    durMs: Math.max(MIN_CUE_MS, Math.round(durMs)),
  }));
}

export function updateCue(
  doc: EditableTimeline,
  sceneId: string,
  trackId: string | null,
  cueId: string,
  patch: Partial<Pick<EditableCue, "action" | "ease" | "word">> & { params?: Record<string, number | string> }
) {
  return mapCue(doc, sceneId, trackId, cueId, (c) => ({
    ...c,
    ...patch,
    params: patch.params ? { ...c.params, ...patch.params } : c.params,
  }));
}

export function deleteCue(doc: EditableTimeline, sceneId: string, trackId: string | null, cueId: string) {
  return mapScene(doc, sceneId, (scene) =>
    trackId === null
      ? { ...scene, camera: scene.camera.filter((c) => c.id !== cueId) }
      : {
          ...scene,
          tracks: scene.tracks.map((t) => (t.id === trackId ? { ...t, cues: t.cues.filter((c) => c.id !== cueId) } : t)),
        }
  );
}

export function addCue(
  doc: EditableTimeline,
  sceneId: string,
  trackId: string,
  cue: Omit<EditableCue, "id">
): EditableTimeline {
  return mapScene(doc, sceneId, (scene) => ({
    ...scene,
    tracks: scene.tracks.map((t) =>
      t.id === trackId ? { ...t, cues: [...t.cues, { ...cue, id: nextId("cue") }] } : t
    ),
  }));
}

export function duplicateCue(doc: EditableTimeline, sceneId: string, trackId: string | null, cueId: string) {
  return mapScene(doc, sceneId, (scene) => {
    const clone = (cues: EditableCue[]) => {
      const src = cues.find((c) => c.id === cueId);
      if (!src) return cues;
      const atMs = src.atMs + Math.max(MIN_CUE_MS, src.durMs);
      // A word-bound source would otherwise hand its transcript binding to
      // the copy too — which then resnaps right back onto the ORIGINAL
      // cue's time on the next compile, since both would target the same
      // word. Detach the copy immediately so it stays where it was placed.
      const dup: EditableCue = src.word
        ? { ...src, id: nextId("cue"), atMs, manual: true, autoAtMs: atMs, autoDurMs: src.durMs }
        : { ...src, id: nextId("cue"), atMs };
      return [...cues, dup];
    };
    if (trackId === null) return { ...scene, camera: clone(scene.camera) };
    return {
      ...scene,
      tracks: scene.tracks.map((t) => (t.id === trackId ? { ...t, cues: clone(t.cues) } : t)),
    };
  });
}

export function setTrackVisible(doc: EditableTimeline, sceneId: string, trackId: string, visible: boolean) {
  return mapScene(doc, sceneId, (scene) => ({
    ...scene,
    tracks: scene.tracks.map((t) => (t.id === trackId ? { ...t, visible } : t)),
  }));
}

export function setTransition(
  doc: EditableTimeline,
  sceneId: string,
  which: "enter" | "exit",
  patch: Partial<EditableTransition>
) {
  return mapScene(doc, sceneId, (scene) => {
    const next = { ...scene[which], ...patch };
    // A cut has no duration by definition; keeping a stale one would show up
    // as a dissolve the moment the type was switched back.
    if (next.type === "cut") next.durationMs = 0;
    else if (next.durationMs <= 0) next.durationMs = 320;
    return { ...scene, [which]: next };
  });
}

export function setSceneSlide(doc: EditableTimeline, sceneId: string, slideIndex: number) {
  return mapScene(doc, sceneId, (scene) => ({ ...scene, slideIndex: Math.max(0, Math.round(slideIndex)) }));
}

export function setSceneLabel(doc: EditableTimeline, sceneId: string, label: string) {
  return mapScene(doc, sceneId, (scene) => ({ ...scene, label }));
}

/**
 * Detaches a cue from its transcript word so a scene-level timing override
 * actually sticks — pairs with cueToAuthored's `!c.manual` gate, which is
 * what stops compile.ts's snapToWord from re-pinning it to the old time on
 * the very next recompile. A no-op for cues with no word, or already manual.
 */
function detachIfWordBound(c: EditableCue): EditableCue {
  if (!c.word || c.manual) return c;
  return { ...c, manual: true, autoAtMs: c.atMs, autoDurMs: c.durMs };
}

/**
 * Applies a startMs/endMs patch to a scene as a manual override: captures
 * the pre-override baseline once (kept stable across repeated edits), and
 * detaches the scene's own word-bound cues so they don't fight the new
 * placement on the next compile.
 */
function overrideSceneTiming(scene: EditableScene, patch: Partial<Pick<EditableScene, "startMs" | "endMs">>): EditableScene {
  return {
    ...scene,
    ...patch,
    manual: true,
    autoStartMs: scene.manual ? scene.autoStartMs : scene.startMs,
    autoEndMs: scene.manual ? scene.autoEndMs : scene.endMs,
    camera: scene.camera.map(detachIfWordBound),
    tracks: scene.tracks.map((t) => ({ ...t, cues: t.cues.map(detachIfWordBound) })),
  };
}

/**
 * Grows or shrinks a scene from its LEFT edge only — this scene's own
 * startMs changes, its endMs and every other scene are untouched. Content
 * inside doesn't move (this reshapes the window, it isn't "this beat happens
 * later" — see shiftScene for that); a cue left outside the new, narrower
 * window is clamped back into it by normalize(), same as any other edit.
 */
export function resizeSceneStart(doc: EditableTimeline, sceneId: string, newStartMs: number): EditableTimeline {
  return mapScene(doc, sceneId, (scene) => {
    const startMs = Math.max(0, Math.min(Math.round(newStartMs), scene.endMs - MIN_SCENE_MS));
    if (startMs === scene.startMs) return scene;
    return overrideSceneTiming(scene, { startMs });
  });
}

/** Grows or shrinks a scene from its RIGHT edge only — mirror of resizeSceneStart. */
export function resizeSceneEnd(doc: EditableTimeline, sceneId: string, newEndMs: number): EditableTimeline {
  return mapScene(doc, sceneId, (scene) => {
    const endMs = Math.max(scene.startMs + MIN_SCENE_MS, Math.round(newEndMs));
    if (endMs === scene.endMs) return scene;
    return overrideSceneTiming(scene, { endMs });
  });
}

/**
 * Shifts a whole scene and everything in it — freely, in either direction,
 * with no regard for any other scene. Overlap and gaps are both fine (see
 * normalize()'s doc comment: sample.ts already resolves both sensibly); the
 * only floor is 0, so a scene can't be dragged to start before the reel does.
 *
 * The cues move with the scene, which is what "this beat happens later"
 * means; clamping them individually would smear the choreography against
 * the wall. No other scene is read, touched, or even looked at here.
 */
export function shiftScene(doc: EditableTimeline, sceneId: string, deltaMs: number): EditableTimeline {
  const scene = doc.scenes.find((s) => s.id === sceneId);
  if (!scene) return doc;

  const length = scene.endMs - scene.startMs;
  const start = Math.max(0, Math.round(scene.startMs + deltaMs));
  const delta = start - scene.startMs;
  if (delta === 0) return doc;

  // Shifts a cue by the scene's own delta, then detaches it from its
  // transcript word (if any) — baseline is the cue's PRE-shift time, i.e.
  // its own last auto/word-derived position, not the shifted one.
  const shiftCue = (c: EditableCue): EditableCue => {
    if (!c.word || c.manual) return { ...c, atMs: c.atMs + delta };
    return { ...c, atMs: c.atMs + delta, manual: true, autoAtMs: c.atMs, autoDurMs: c.durMs };
  };
  const scenes = doc.scenes.map((s) => {
    if (s.id !== sceneId) return s;
    return {
      ...s,
      startMs: start,
      endMs: start + length,
      manual: true,
      autoStartMs: s.manual ? s.autoStartMs : s.startMs,
      autoEndMs: s.manual ? s.autoEndMs : s.endMs,
      camera: s.camera.map(shiftCue),
      tracks: s.tracks.map((t) => ({ ...t, cues: t.cues.map(shiftCue) })),
    };
  });
  return normalize({ ...doc, scenes });
}

/** Inserted at `overlay.startMs` — the caller decides where (typically the playhead). */
export function addOverlay(doc: EditableTimeline, overlay: Omit<EditableOverlayClip, "id">): EditableTimeline {
  return normalize({ ...doc, overlays: [...doc.overlays, { ...overlay, id: nextId("overlay") }] });
}

export function updateOverlay(
  doc: EditableTimeline,
  id: string,
  patch: Partial<Omit<EditableOverlayClip, "id">>
): EditableTimeline {
  // Every current caller only ever patches startMs/durationMs (drag, resize,
  // keyboard nudge) — treat those as manual timing overrides, same as a cue.
  const isTimingEdit = patch.startMs !== undefined || patch.durationMs !== undefined;
  return normalize({
    ...doc,
    overlays: doc.overlays.map((o) => {
      if (o.id !== id) return o;
      if (!isTimingEdit) return { ...o, ...patch };
      return {
        ...o,
        ...patch,
        manual: true,
        autoStartMs: o.manual ? o.autoStartMs : o.startMs,
        autoDurationMs: o.manual ? o.autoDurationMs : o.durationMs,
      };
    }),
  });
}

export function deleteOverlay(doc: EditableTimeline, id: string): EditableTimeline {
  return normalize({ ...doc, overlays: doc.overlays.filter((o) => o.id !== id) });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Reset — undoes manual overrides, restoring auto-sync/transcript timing.
 * Distinct from undo/redo: this targets *which things are manually timed*,
 * not *how many gestures ago* — useful after several edits, or after a
 * reload (manual/auto* survive the round-trip through toAuthored/toEditable,
 * unlike the in-memory undo stack).
 * ──────────────────────────────────────────────────────────────────────────*/

/** Restores one cue to its pre-manual-edit timing, if it has any override to undo. */
function resetCue(c: EditableCue): EditableCue {
  if (!c.manual) return c;
  return { ...c, manual: false, atMs: c.autoAtMs, durMs: c.autoDurMs };
}

/**
 * Restores a scene's own timing plus every cue inside it. Reverting a scene
 * reverts what happened to it as a whole, including the word-detach cascade
 * shiftScene/resizeSceneStart/resizeSceneEnd applied — leaving a cue's own
 * manual override in place while its scene snapped back would strand it at a
 * now-meaningless offset, clamped into a scene window it was never actually
 * placed against.
 */
function resetScene(scene: EditableScene): EditableScene {
  const hasCueOverride = scene.camera.some((c) => c.manual) || scene.tracks.some((t) => t.cues.some((c) => c.manual));
  if (!scene.manual && !hasCueOverride) return scene;
  return {
    ...scene,
    manual: false,
    startMs: scene.manual ? scene.autoStartMs : scene.startMs,
    endMs: scene.manual ? scene.autoEndMs : scene.endMs,
    camera: scene.camera.map(resetCue),
    tracks: scene.tracks.map((t) => ({ ...t, cues: t.cues.map(resetCue) })),
  };
}

function resetOverlay(o: EditableOverlayClip): EditableOverlayClip {
  if (!o.manual) return o;
  return { ...o, manual: false, startMs: o.autoStartMs, durationMs: o.autoDurationMs };
}

/** Restores every manually-overridden scene, cue and overlay to its pre-edit timing — the toolbar's "Reset all" action. */
export function resetAllModifications(doc: EditableTimeline): EditableTimeline {
  return normalize({ ...doc, scenes: doc.scenes.map(resetScene), overlays: doc.overlays.map(resetOverlay) });
}

/** Restores just one scene (and its own cues) — the per-item revert in the timeline's yellow tooltip. */
export function resetSceneModification(doc: EditableTimeline, sceneId: string): EditableTimeline {
  return mapScene(doc, sceneId, resetScene);
}

/** Restores just one cue — the per-item revert in the timeline's yellow tooltip. */
export function resetCueModification(doc: EditableTimeline, sceneId: string, trackId: string | null, cueId: string): EditableTimeline {
  return mapCue(doc, sceneId, trackId, cueId, resetCue);
}

/** Restores just one overlay clip — the per-item revert on a manually-timed overlay. */
export function resetOverlayModification(doc: EditableTimeline, id: string): EditableTimeline {
  return normalize({ ...doc, overlays: doc.overlays.map((o) => (o.id === id ? resetOverlay(o) : o)) });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Snapping
 * ──────────────────────────────────────────────────────────────────────────*/

export interface SnapTarget {
  atMs: number;
  kind: "word" | "scene" | "cue" | "playhead";
  label?: string;
}

/**
 * Pulls a dragged time onto whatever it is nearly touching.
 *
 * Word starts are first-class targets, and that is the point: this is a sync
 * tool, so "on the word" has to be easier to hit than 12ms either side of it.
 */
export function snapTime(t: number, targets: SnapTarget[], toleranceMs: number): { atMs: number; hit: SnapTarget | null } {
  let best: SnapTarget | null = null;
  let bestDist = Infinity;
  for (const target of targets) {
    const d = Math.abs(target.atMs - t);
    if (d < bestDist && d <= toleranceMs) {
      bestDist = d;
      best = target;
    }
  }
  return best ? { atMs: best.atMs, hit: best } : { atMs: Math.round(t), hit: null };
}

/** Everything worth snapping to, for one scene. */
export function snapTargetsFor(
  doc: EditableTimeline,
  sceneId: string,
  words: Array<{ text: string; startMs: number }>,
  excludeCueId?: string
): SnapTarget[] {
  const out: SnapTarget[] = [];
  doc.scenes.forEach((s) => {
    out.push({ atMs: s.startMs, kind: "scene", label: s.label });
    out.push({ atMs: s.endMs, kind: "scene", label: s.label });
  });

  const scene = doc.scenes.find((s) => s.id === sceneId);
  if (scene) {
    const from = scene.startMs - 250;
    const to = scene.endMs + 250;
    words.forEach((w) => {
      if (w.startMs >= from && w.startMs <= to) out.push({ atMs: w.startMs, kind: "word", label: w.text });
    });
    scene.tracks.forEach((t) =>
      t.cues.forEach((c) => {
        if (c.id === excludeCueId) return;
        out.push({ atMs: c.atMs, kind: "cue", label: c.action });
        if (c.durMs > 0) out.push({ atMs: c.atMs + c.durMs, kind: "cue", label: c.action });
      })
    );
  }
  return out;
}

/** Total cue count — for the editor's header, and for tests. */
export function countCues(doc: EditableTimeline): number {
  return doc.scenes.reduce(
    (n, s) => n + s.camera.length + s.tracks.reduce((m, t) => m + t.cues.length, 0),
    0
  );
}
