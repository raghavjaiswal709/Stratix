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
}

export interface EditableTimeline {
  fps: number;
  durationMs: number;
  defaults: { ease: string; distancePct: number };
  scenes: EditableScene[];
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

  return {
    id: nextId("cue"),
    action,
    atMs: Math.round(num(at, 0)),
    durMs: Math.max(0, Math.round(num(dur, 320))),
    ease: str(raw.ease),
    word: str(raw.word) ?? str(raw.phrase) ?? str(raw.onWord),
    params,
  };
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

    return {
      id: nextId("scene"),
      slideIndex: Math.max(0, Math.min(Math.max(0, slideCount - 1), Number.isFinite(slideIndex) ? slideIndex : i)),
      label: str(s.label) ?? str(s.note) ?? `Scene ${i + 1}`,
      startMs: Math.round(num([s.startMs, s.start].find((v) => typeof v === "number"), 0)),
      endMs: Math.round(num([s.endMs, s.end].find((v) => typeof v === "number"), 0)),
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

  return normalize({
    fps: Math.round(num(doc.fps, 60)),
    durationMs: Math.round(num([doc.durationMs, doc.duration].find((v) => typeof v === "number"), 0)),
    defaults: {
      ease: str(doc.defaults?.ease) ?? "easeOutCubic",
      distancePct: num(doc.defaults?.distancePct, 3),
    },
    scenes,
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
      return scene;
    }),
  };
}

function cueToAuthored(c: EditableCue): AuthoredCue {
  const out: AuthoredCue = { action: c.action, atMs: Math.round(c.atMs) };
  if (c.durMs > 0) out.durMs = Math.round(c.durMs);
  if (c.ease) out.ease = c.ease;
  if (c.word) out.word = c.word;
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
 * Scenes are sorted and made contiguous, because a gap freezes the previous
 * scene on screen and an overlap makes two scenes fight over the same frame —
 * both of which the compiler reports as problems rather than fixing. Cues are
 * clamped into their own scene, because a cue outside its scene fires on a
 * slide that is not on screen.
 */
export function normalize(doc: EditableTimeline): EditableTimeline {
  const scenes = [...doc.scenes].sort((a, b) => a.startMs - b.startMs);

  let cursor = 0;
  const fixed: EditableScene[] = scenes.map((scene, i) => {
    const startMs = i === 0 ? Math.max(0, Math.round(scene.startMs)) : Math.max(cursor, Math.round(scene.startMs));
    const endMs = Math.max(startMs + MIN_SCENE_MS, Math.round(scene.endMs));
    cursor = endMs;
    return { ...scene, startMs, endMs };
  });

  // Close any hole a drag opened: a scene begins where the last one ended.
  for (let i = 1; i < fixed.length; i++) {
    if (fixed[i].startMs !== fixed[i - 1].endMs) {
      fixed[i] = { ...fixed[i], startMs: fixed[i - 1].endMs };
      if (fixed[i].endMs < fixed[i].startMs + MIN_SCENE_MS) {
        fixed[i] = { ...fixed[i], endMs: fixed[i].startMs + MIN_SCENE_MS };
      }
    }
  }

  const clamped = fixed.map((scene) => ({
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
    durationMs: clamped.length ? clamped[clamped.length - 1].endMs : 0,
  };
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

export function moveCue(doc: EditableTimeline, sceneId: string, trackId: string | null, cueId: string, atMs: number) {
  return mapCue(doc, sceneId, trackId, cueId, (c) => ({ ...c, atMs: Math.round(atMs) }));
}

export function resizeCue(doc: EditableTimeline, sceneId: string, trackId: string | null, cueId: string, durMs: number) {
  return mapCue(doc, sceneId, trackId, cueId, (c) => ({ ...c, durMs: Math.max(MIN_CUE_MS, Math.round(durMs)) }));
}

export function updateCue(
  doc: EditableTimeline,
  sceneId: string,
  trackId: string | null,
  cueId: string,
  patch: Partial<Pick<EditableCue, "action" | "ease" | "word" | "atMs" | "durMs">> & { params?: Record<string, number | string> }
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
      return [...cues, { ...src, id: nextId("cue"), atMs: src.atMs + Math.max(MIN_CUE_MS, src.durMs) }];
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
 * Moves the cut between scene `index - 1` and scene `index`.
 *
 * Only the two scenes either side move: a boundary drag is a trim, not a
 * ripple, so the rest of the reel stays locked to the audio it was synced to.
 * That is the behaviour that matters here — the whole point of the timeline is
 * that everything else is already right.
 */
export function moveSceneBoundary(doc: EditableTimeline, index: number, atMs: number): EditableTimeline {
  if (index <= 0 || index >= doc.scenes.length) return doc;

  const prev = doc.scenes[index - 1];
  const next = doc.scenes[index];
  const lo = prev.startMs + MIN_SCENE_MS;
  const hi = next.endMs - MIN_SCENE_MS;
  if (hi <= lo) return doc;

  const at = Math.round(Math.min(Math.max(atMs, lo), hi));
  const scenes = doc.scenes.map((s, i) => {
    if (i === index - 1) return { ...s, endMs: at };
    if (i === index) return { ...s, startMs: at };
    return s;
  });
  return normalize({ ...doc, scenes });
}

/** Moves the very end of the reel. */
export function setTimelineEnd(doc: EditableTimeline, endMs: number): EditableTimeline {
  if (doc.scenes.length === 0) return doc;
  const last = doc.scenes[doc.scenes.length - 1];
  const at = Math.max(last.startMs + MIN_SCENE_MS, Math.round(endMs));
  const scenes = doc.scenes.map((s, i) => (i === doc.scenes.length - 1 ? { ...s, endMs: at } : s));
  return normalize({ ...doc, scenes });
}

/**
 * Shifts a whole scene and everything in it.
 *
 * The cues move with the scene, which is what "this beat happens later" means;
 * clamping them individually would smear the choreography against the wall.
 */
export function shiftScene(doc: EditableTimeline, sceneId: string, deltaMs: number): EditableTimeline {
  const index = doc.scenes.findIndex((s) => s.id === sceneId);
  if (index < 0) return doc;

  const scene = doc.scenes[index];
  const prevEnd = index > 0 ? doc.scenes[index - 1].startMs + MIN_SCENE_MS : 0;
  const nextStart = index < doc.scenes.length - 1 ? doc.scenes[index + 1].endMs - MIN_SCENE_MS : Infinity;

  const length = scene.endMs - scene.startMs;
  const start = Math.round(Math.min(Math.max(scene.startMs + deltaMs, prevEnd), nextStart - length));
  const delta = start - scene.startMs;
  if (delta === 0) return doc;

  const shiftCue = (c: EditableCue) => ({ ...c, atMs: c.atMs + delta });
  const scenes = doc.scenes.map((s, i) => {
    if (i === index - 1) return { ...s, endMs: start };
    if (i === index + 1) return { ...s, startMs: start + length };
    if (i !== index) return s;
    return {
      ...s,
      startMs: start,
      endMs: start + length,
      camera: s.camera.map(shiftCue),
      tracks: s.tracks.map((t) => ({ ...t, cues: t.cues.map(shiftCue) })),
    };
  });
  return normalize({ ...doc, scenes });
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
