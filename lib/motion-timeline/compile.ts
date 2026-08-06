import { CAMERA_CUE_BUILDERS, CUE_BUILDERS, CUE_CHANNELS, type CueDefaults, type NormalizedCue } from "./cues";
import { DEFAULT_EASE, resolveEase, type EaseName } from "./easing";
import { parseLooseJson } from "./parse";
import { findWordTime, type TranscriptWord } from "./transcript";
import {
  TIMELINE_FORMAT,
  type AuthoredCue,
  type AuthoredKeyframe,
  type AuthoredScene,
  type AuthoredTimeline,
  type AuthoredTrack,
  type AuthoredTransition,
  type CameraChannel,
  type ChannelName,
  type Channels,
  type CompiledScene,
  type CompiledTrack,
  type Keyframe,
  type ParsedTimelineResult,
  type TimelineIssue,
  type Transition,
  type TransitionType,
  type WipeDirection,
  type WipeStyle,
} from "./types";

/** Structural view of a motion slide — keeps this module free of UI imports. */
export interface TimelineSlideLike {
  layers: Array<{
    id: string;
    name?: string;
    slug?: string;
    text?: string;
    zIndex?: number;
    /* Used by the manifest binder to identify a layer by what and where it is. */
    type?: string;
    role?: string;
    positionLabel?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    /* "collage-part" + its reading-order index — used to auto-choreograph an
       untracked collage part when CompileOptions.paperCutStyle is on. */
    objectType?: string;
    partIndex?: number;
  }>;
  width?: number;
  height?: number;
  fileName?: string;
}

const CHANNEL_KEYS: ChannelName[] = ["opacity", "xPct", "yPct", "scale", "rotate", "blur", "wipe"];

/** Aliases tolerated on keyframe objects, mapped to the real channel. */
const KEYFRAME_ALIASES: Record<string, ChannelName> = {
  opacity: "opacity",
  alpha: "opacity",
  x: "xPct",
  xPct: "xPct",
  offsetX: "xPct",
  y: "yPct",
  yPct: "yPct",
  offsetY: "yPct",
  scale: "scale",
  rotate: "rotate",
  rotation: "rotate",
  rotateDeg: "rotate",
  blur: "blur",
  blurPx: "blur",
  wipe: "wipe",
  reveal: "wipe",
};

/** Actions that are legal but intentionally do nothing. */
const NOOP_ACTIONS = new Set(["hold", "stay", "none", "keep", "static"]);

/** Cues that are instantaneous — a duration on them is meaningless. */
const INSTANT_ACTIONS = new Set(["show", "hide"]);

const DEFAULT_CUE_DURATION_MS = 400;

/**
 * How far ahead of its spoken word an entrance starts, so the element has
 * landed by the time the syllable is heard rather than arriving after it.
 */
export const DEFAULT_LEAD_IN_MS = 90;

/** Cues that should sit *on* the word, not ahead of it — they are the hit. */
const ON_BEAT_ACTIONS = new Set(["emphasize", "pulse", "shake", "tilt", "cameraPunch", "show", "hide"]);

/** Cues whose `word` marks the moment the element leaves, so no lead-in. */
const EXIT_ACTIONS = new Set([
  "fadeOut",
  "slideOutUp",
  "slideOutDown",
  "slideOutLeft",
  "slideOutRight",
  "popOut",
  "wipeOut",
  "blurOut",
  "dim",
]);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function firstNum(...values: unknown[]): number | null {
  for (const v of values) {
    if (isNum(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function firstStr(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** Like firstStr, but a bare number is a legal element key (its 1-based ordinal). */
function firstKey(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (isNum(v)) return String(v);
  }
  return null;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/* ──────────────────────────────────────────────────────────────────────────
 * Layer resolution
 * ────────────────────────────────────────────────────────────────────────*/

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Builds every alias by which a track may address a layer on one slide.
 * The AI is told to use `elements[].id`, but a paste can easily carry the
 * element's name, its slug, its literal text or its 1-based ordinal instead —
 * all of which identify the layer just as unambiguously.
 */
function buildLayerIndex(slide: TimelineSlideLike): Map<string, string> {
  const index = new Map<string, string>();
  const put = (key: string | undefined | null, id: string) => {
    if (!key) return;
    const k = normalizeKey(String(key));
    if (k && !index.has(k)) index.set(k, id);
  };

  slide.layers.forEach((layer, i) => {
    put(layer.id, layer.id);
    put(layer.slug, layer.id);
    put(layer.name, layer.id);
    put(layer.text, layer.id);
    put(String(i + 1), layer.id);
    put(`layer_${i + 1}`, layer.id);
    put(`layer ${i + 1}`, layer.id);
    put(`element_${i + 1}`, layer.id);
    if (isNum(layer.zIndex)) put(`z${layer.zIndex}`, layer.id);
  });

  return index;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Time normalisation
 * ────────────────────────────────────────────────────────────────────────*/

function collectTimeValues(authored: AuthoredTimeline): number[] {
  const times: number[] = [];
  const pushCueTimes = (cues: AuthoredCue[]) => {
    cues.forEach((c) => {
      const at = firstNum(c.atMs, c.at, c.tMs, c.t);
      if (at !== null) times.push(at);
    });
  };
  const pushKfTimes = (kfs: AuthoredKeyframe[]) => {
    kfs.forEach((k) => {
      const t = firstNum(k.tMs, k.t, k.atMs, k.at);
      if (t !== null) times.push(t);
    });
  };

  asArray<AuthoredScene>(authored.scenes).forEach((scene) => {
    const start = firstNum(scene.startMs, scene.start);
    const end = firstNum(scene.endMs, scene.end);
    if (start !== null) times.push(start);
    if (end !== null) times.push(end);

    const camera = Array.isArray(scene.camera) ? { keyframes: scene.camera } : scene.camera ?? {};
    pushCueTimes(asArray<AuthoredCue>(camera.cues));
    pushKfTimes(asArray<AuthoredKeyframe>(camera.keyframes));

    if (scene.background) {
      pushCueTimes(asArray<AuthoredCue>(scene.background.cues));
      pushKfTimes(asArray<AuthoredKeyframe>(scene.background.keyframes));
    }

    const tracks = asArray<AuthoredTrack>(scene.tracks ?? scene.elements ?? scene.layers);
    tracks.forEach((track) => {
      pushCueTimes(asArray<AuthoredCue>(track.cues));
      pushKfTimes(asArray<AuthoredKeyframe>(track.keyframes));
    });
  });

  const duration = firstNum(authored.durationMs, authored.duration);
  if (duration !== null) times.push(duration);
  return times;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Compilation
 * ────────────────────────────────────────────────────────────────────────*/

/** Everything the compiler needs beyond the document and the slides. */
export interface CompileOptions {
  /**
   * Word-level transcript of the voiceover. When present, any cue carrying a
   * `word` is retimed from it — the model's millisecond arithmetic stops
   * mattering and sync becomes a property of the audio.
   */
  transcript?: TranscriptWord[] | null;
  /** Lead-in for entrances, so they land *by* the word. Default 90ms. */
  leadInMs?: number;
  /**
   * When on, any "collage-part" layer the author's tracks never mention gets a
   * default staggered `paperDropIn` instead of rendering fully visible from
   * frame 1 — see the synthesis step in compileTimeline. Never overrides a
   * track someone actually authored for that layer.
   */
  paperCutStyle?: boolean;
  /** When true, images land at slide start; when false, images are paced across the slide alongside text. */
  textOnlySync?: boolean;
}

interface Ctx {
  issues: TimelineIssue[];
  defaults: CueDefaults;
  timeScale: number;
  cueCount: number;
  /** Word-level transcript, when one is loaded — enables trigger-word snapping. */
  transcript: TranscriptWord[] | null;
  leadInMs: number;
  wordKeyedCues: number;
  syncedCues: number;
  /** Trigger words the transcript does not contain, in first-seen order. */
  unmatchedWords: string[];
  /** Largest correction a snap applied, for the "how far off was it" readout. */
  maxDriftMs: number;
}

/**
 * Resolves a cue's `word` against the transcript and returns the time the cue
 * should actually fire at, or null when there is nothing to snap to.
 *
 * The authored `atMs` is kept as a hint rather than an answer: it disambiguates
 * a word spoken several times, and it survives untouched when no transcript is
 * loaded. This is the whole sync fix — the model only has to name the right
 * word, and the millisecond is computed here from real audio timings.
 */
function snapToWord(
  action: string,
  word: string,
  authoredAtMs: number,
  ctx: Ctx,
  where: string
): number | null {
  if (!ctx.transcript || ctx.transcript.length === 0) return null;

  const match = findWordTime(ctx.transcript, word, authoredAtMs);
  if (!match) {
    if (!ctx.unmatchedWords.includes(word)) ctx.unmatchedWords.push(word);
    addIssue(
      ctx,
      "warning",
      `Cue "${action}" is keyed to the word "${word}", which is not in the transcript — kept its authored time instead.`,
      where
    );
    return null;
  }

  // An exit is triggered BY the word, so it starts as the word lands. An
  // emphasis IS the word. Everything else is an entrance and must be finished
  // by the time the word is heard.
  const lead = ON_BEAT_ACTIONS.has(action) || EXIT_ACTIONS.has(action) ? 0 : ctx.leadInMs;
  const snapped = Math.max(0, match.startMs - lead);

  const drift = Math.abs(snapped - authoredAtMs);
  if (drift > ctx.maxDriftMs) ctx.maxDriftMs = drift;
  ctx.syncedCues++;

  if (match.kind === "prefix") {
    addIssue(
      ctx,
      "warning",
      `Trigger word "${word}" had no exact match — snapped to the closest spelling in the transcript.`,
      where
    );
  }
  return snapped;
}

function addIssue(ctx: Ctx, level: TimelineIssue["level"], message: string, where?: string) {
  // Identical repeated complaints (one per track, say) are noise — keep the first.
  if (ctx.issues.some((i) => i.message === message && i.where === where)) return;
  ctx.issues.push({ level, message, where });
}

function normalizeCue(raw: AuthoredCue, ctx: Ctx, offsetMs: number, where: string): NormalizedCue | null {
  const action = firstStr(raw.action, raw.type, raw.name);
  if (!action) {
    addIssue(ctx, "warning", "A cue has no `action` and was skipped.", where);
    return null;
  }

  const at = firstNum(raw.atMs, raw.at, raw.tMs, raw.t);
  if (at === null) {
    addIssue(ctx, "warning", `Cue "${action}" has no \`atMs\` and was skipped.`, where);
    return null;
  }

  const rawDur = firstNum(raw.durMs, raw.durationMs, raw.duration);
  const durMs = INSTANT_ACTIONS.has(action)
    ? 0
    : Math.max(0, (rawDur ?? DEFAULT_CUE_DURATION_MS) * ctx.timeScale);

  const easeName = firstStr(raw.ease);
  const ease = easeName ? resolveEase(easeName) : null;
  if (easeName && !ease) {
    addIssue(ctx, "warning", `Unknown easing "${easeName}" — using ${DEFAULT_EASE}.`, where);
  }

  // Everything that is not a reserved field is a cue parameter (amount,
  // distancePct, dxPct, …), passed straight through to the builder.
  const params: Record<string, number | string> = {};
  const reserved = new Set(["action", "type", "name", "atMs", "at", "tMs", "t", "durMs", "durationMs", "duration", "ease", "note", "word", "phrase", "onWord", "syllable", "comment"]);
  Object.entries(raw).forEach(([k, v]) => {
    if (reserved.has(k)) return;
    if (typeof v === "number" || typeof v === "string") params[k] = v;
  });

  const authoredAtMs = at * ctx.timeScale + offsetMs;

  // The trigger word outranks the authored millisecond whenever a transcript
  // is loaded — see snapToWord. A snapped time is already absolute, so it must
  // not be shifted again by a scene-relative offset.
  const word = firstStr(raw.word, raw.phrase, raw.onWord, raw.syllable);
  if (word) ctx.wordKeyedCues++;
  const snapped = word ? snapToWord(action, word, authoredAtMs, ctx, where) : null;

  return {
    action,
    atMs: snapped ?? authoredAtMs,
    durMs,
    ease: ease ?? undefined,
    params,
  };
}

function mergeChannels(target: Channels, incoming: Channels) {
  (Object.keys(incoming) as ChannelName[]).forEach((channel) => {
    const kfs = incoming[channel];
    if (!kfs?.length) return;
    (target[channel] ??= []).push(...kfs);
  });
}

/** Sorts each channel and resolves same-timestamp collisions (last wins). */
function finalizeChannels(channels: Channels, ctx: Ctx, where: string): Channels {
  const out: Channels = {};
  CHANNEL_KEYS.forEach((channel) => {
    const kfs = channels[channel];
    if (!kfs?.length) return;

    kfs.sort((a, b) => a.tMs - b.tMs);
    const deduped: Keyframe[] = [];
    kfs.forEach((k) => {
      const prev = deduped[deduped.length - 1];
      if (prev && Math.abs(prev.tMs - k.tMs) < 0.5) {
        if (Math.abs(prev.value - k.value) > 1e-6 && prev.source !== k.source) {
          addIssue(
            ctx,
            "warning",
            `Cues "${prev.source}" and "${k.source}" both set ${channel} at ${Math.round(k.tMs)}ms — the later one wins.`,
            where
          );
        }
        deduped[deduped.length - 1] = k;
        return;
      }
      deduped.push(k);
    });
    out[channel] = deduped;
  });
  return out;
}

function compileCueList(
  cues: AuthoredCue[],
  ctx: Ctx,
  offsetMs: number,
  where: string
): { channels: Channels; camera: Partial<Record<CameraChannel, Keyframe[]>> } {
  const channels: Channels = {};
  const camera: Partial<Record<CameraChannel, Keyframe[]>> = {};

  cues.forEach((raw) => {
    const cue = normalizeCue(raw, ctx, offsetMs, where);
    if (!cue) return;
    ctx.cueCount++;

    if (NOOP_ACTIONS.has(cue.action)) return;

    const builder = CUE_BUILDERS[cue.action];
    if (builder) {
      mergeChannels(channels, builder(cue, ctx.defaults).channels);
      return;
    }

    const cameraBuilder = CAMERA_CUE_BUILDERS[cue.action];
    if (cameraBuilder) {
      const produced = cameraBuilder(cue);
      (Object.keys(produced) as CameraChannel[]).forEach((ch) => {
        const kfs = produced[ch];
        if (kfs?.length) (camera[ch] ??= []).push(...kfs);
      });
      return;
    }

    addIssue(ctx, "warning", `Unknown cue action "${cue.action}" — skipped.`, where);
  });

  return { channels, camera };
}

function compileKeyframeList(kfs: AuthoredKeyframe[], ctx: Ctx, offsetMs: number, where: string): Channels {
  const channels: Channels = {};

  kfs.forEach((raw) => {
    const t = firstNum(raw.tMs, raw.t, raw.atMs, raw.at);
    if (t === null) {
      addIssue(ctx, "warning", "A keyframe has no `tMs` and was skipped.", where);
      return;
    }
    const easeName = firstStr(raw.ease);
    const ease: EaseName = (easeName ? resolveEase(easeName) : null) ?? ctx.defaults.ease;
    const authoredTMs = t * ctx.timeScale + offsetMs;

    // A keyframe may carry a trigger word too, so the escape hatch is no less
    // synced than the cue catalog. "keyframe" is not an entrance or an exit,
    // so it lands exactly on the word.
    const word = firstStr(raw.word, raw.phrase, raw.onWord, raw.syllable);
    const tMs = (word ? snapToWord("show", word, authoredTMs, ctx, where) : null) ?? authoredTMs;

    Object.entries(raw).forEach(([key, value]) => {
      const channel = KEYFRAME_ALIASES[key];
      if (!channel || !isNum(value)) return;
      (channels[channel] ??= []).push({ tMs, value, ease, source: "keyframe" });
    });
  });

  return channels;
}

function compileTrackBody(track: AuthoredTrack, ctx: Ctx, offsetMs: number, where: string): Channels {
  const fromCues = compileCueList(asArray<AuthoredCue>(track.cues), ctx, offsetMs, where);
  if (Object.keys(fromCues.camera).length > 0) {
    addIssue(ctx, "warning", "Camera cues belong on the scene's `camera`, not on an element track — ignored.", where);
  }
  const fromKeyframes = compileKeyframeList(asArray<AuthoredKeyframe>(track.keyframes), ctx, offsetMs, where);
  const merged: Channels = {};
  mergeChannels(merged, fromCues.channels);
  mergeChannels(merged, fromKeyframes);
  return finalizeChannels(merged, ctx, where);
}

function normalizeTransition(raw: AuthoredTransition | string | undefined, fallback: TransitionType): Transition {
  if (typeof raw === "string") {
    const type = raw.trim().toLowerCase();
    if (type === "cut" || type === "none") return { type: "cut", durationMs: 0 };
    if (type === "diptoblack" || type === "dip") return { type: "dipToBlack", durationMs: 500 };
    return { type: "fade", durationMs: 350 };
  }
  if (!raw || typeof raw !== "object") {
    return { type: fallback, durationMs: fallback === "cut" ? 0 : 350 };
  }
  const rawType = (firstStr(raw.type) ?? fallback).toLowerCase();
  const type: TransitionType =
    rawType === "cut" || rawType === "none" ? "cut" : rawType.startsWith("dip") ? "dipToBlack" : "fade";
  const durationMs = firstNum(raw.durationMs, raw.durMs, raw.duration) ?? (type === "cut" ? 0 : 350);
  return { type, durationMs: Math.max(0, durationMs) };
}

function resolveWipeDirection(raw: unknown): WipeDirection {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return v === "right" || v === "top" || v === "bottom" ? (v as WipeDirection) : "left";
}

/**
 * A track's wipe style isn't authored on the track itself (unlike wipeFrom) —
 * it falls out of which reveal cue the track actually uses. zigzagIn/Out and
 * wipeIn/Out drive the exact same `wipe` channel, so the renderer needs a
 * separate signal for which edge shape to cut, and the cue action already IS
 * that signal.
 */
function resolveWipeStyle(cues: AuthoredCue[]): WipeStyle {
  const usesZigzag = cues.some((c) => {
    const action = firstStr(c.action, c.type, c.name);
    return action === "zigzagIn" || action === "zigzagOut";
  });
  return usesZigzag ? "zigzag" : "straight";
}

/**
 * Turns whatever the user pasted into a timeline that can be sampled every
 * frame, plus a report of everything that looked wrong on the way.
 *
 * Errors mean "unplayable, nothing was applied". Warnings mean "played, but
 * here is what was assumed" — an id that matched nothing, a scene gap, a cue
 * that landed outside its own scene.
 */
export function compileTimeline(
  authoredInput: AuthoredTimeline,
  slides: TimelineSlideLike[],
  options: CompileOptions = {}
): ParsedTimelineResult {
  const ctx: Ctx = {
    issues: [],
    defaults: { ease: DEFAULT_EASE, distancePct: 4 },
    timeScale: 1,
    cueCount: 0,
    transcript: options.transcript?.length ? options.transcript : null,
    leadInMs: options.leadInMs ?? DEFAULT_LEAD_IN_MS,
    wordKeyedCues: 0,
    syncedCues: 0,
    unmatchedWords: [],
    maxDriftMs: 0,
  };

  const emptyReport = (extra?: Partial<ParsedTimelineResult["report"]>) => ({
    timeline: null,
    report: {
      issues: ctx.issues,
      sceneCount: 0,
      trackCount: 0,
      cueCount: 0,
      keyframeCount: 0,
      durationMs: 0,
      unmatchedIds: [],
      untouchedLayers: [],
      syncedCues: 0,
      wordKeyedCues: 0,
      unmatchedWords: [],
      maxDriftMs: 0,
      ...extra,
    },
  });

  const authored = authoredInput ?? {};

  if (authored.format && authored.format !== TIMELINE_FORMAT) {
    addIssue(ctx, "warning", `Unexpected format "${authored.format}" — expected "${TIMELINE_FORMAT}".`);
  }
  if (isNum(authored.version) && authored.version !== 1) {
    addIssue(ctx, "warning", `Timeline version ${authored.version} was written for a different renderer.`);
  }
  if (slides.length === 0) {
    addIssue(ctx, "error", "Decompose your images first — there are no slides for this timeline to drive.");
    return emptyReport();
  }

  const authoredScenes = asArray<AuthoredScene>(authored.scenes);
  if (authoredScenes.length === 0) {
    addIssue(ctx, "error", "No `scenes` array found. The timeline must contain at least one scene.");
    return emptyReport();
  }

  // A timeline written in seconds is a common paste; every real video is far
  // longer than 600 of *anything*, so a max below that can only be seconds.
  const times = collectTimeValues(authored);
  const maxTime = times.length ? Math.max(...times) : 0;
  if (maxTime > 0 && maxTime <= 600) {
    ctx.timeScale = 1000;
    addIssue(ctx, "warning", "Times looked like seconds, not milliseconds — every value was multiplied by 1000.");
  }

  const defaultEase = resolveEase(authored.defaults?.ease);
  if (defaultEase) ctx.defaults.ease = defaultEase;
  const defaultDistance = firstNum(authored.defaults?.distancePct);
  if (defaultDistance !== null) ctx.defaults.distancePct = clamp(defaultDistance, 0, 100);

  const declaredSceneRelative = (firstStr(authored.timeBase) ?? "absolute").toLowerCase().startsWith("scene");

  const unmatched = new Set<string>();
  const touched = new Set<string>();
  let keyframeCount = 0;

  const scenes: CompiledScene[] = [];

  authoredScenes.forEach((rawScene, i) => {
    const where = `scene ${i + 1}`;

    const slideNumber = firstNum(rawScene.slide, rawScene.slideIndex);
    if (slideNumber === null) {
      addIssue(ctx, "error", "Scene has no `slide` number.", where);
      return;
    }
    // `slide` is 1-based in the layout JSON; `slideIndex` (if that is what was
    // written) is 0-based. Both land on the same slide for slide 1, and the
    // range check below catches an off-by-one at the other end.
    const slideIndex = isNum(rawScene.slide) ? Math.round(rawScene.slide) - 1 : Math.round(slideNumber);
    if (slideIndex < 0 || slideIndex >= slides.length) {
      addIssue(
        ctx,
        "error",
        `Scene points at slide ${slideNumber}, but only ${slides.length} slide(s) are loaded.`,
        where
      );
      return;
    }

    const rawStart = firstNum(rawScene.startMs, rawScene.start);
    const rawEnd = firstNum(rawScene.endMs, rawScene.end);
    if (rawStart === null || rawEnd === null) {
      addIssue(ctx, "error", "Scene needs both `startMs` and `endMs`.", where);
      return;
    }
    const startMs = rawStart * ctx.timeScale;
    const endMs = rawEnd * ctx.timeScale;
    if (endMs <= startMs) {
      addIssue(ctx, "error", `Scene ends (${Math.round(endMs)}ms) at or before it starts (${Math.round(startMs)}ms).`, where);
      return;
    }

    const rawTracks = asArray<AuthoredTrack>(rawScene.tracks ?? rawScene.elements ?? rawScene.layers);

    // Scene-relative times: only when the evidence is unambiguous — something
    // starts before the scene does, and nothing runs past the scene's length.
    let offsetMs = 0;
    if (startMs > 0) {
      const sceneTimes: number[] = [];
      const collect = (cues: AuthoredCue[], kfs: AuthoredKeyframe[]) => {
        cues.forEach((c) => {
          const at = firstNum(c.atMs, c.at, c.tMs, c.t);
          if (at !== null) sceneTimes.push(at * ctx.timeScale);
        });
        kfs.forEach((k) => {
          const t = firstNum(k.tMs, k.t, k.atMs, k.at);
          if (t !== null) sceneTimes.push(t * ctx.timeScale);
        });
      };
      rawTracks.forEach((t) => collect(asArray<AuthoredCue>(t.cues), asArray<AuthoredKeyframe>(t.keyframes)));
      if (sceneTimes.length > 0) {
        const minT = Math.min(...sceneTimes);
        const maxT = Math.max(...sceneTimes);
        const sceneDur = endMs - startMs;
        if (declaredSceneRelative || (minT < startMs - 50 && maxT <= sceneDur + 50)) {
          offsetMs = startMs;
          addIssue(
            ctx,
            "warning",
            `Times in this scene were relative to its start — shifted by +${Math.round(startMs)}ms to become absolute.`,
            where
          );
        }
      }
    }

    const slide = slides[slideIndex];
    const layerIndex = buildLayerIndex(slide);

    const tracks: CompiledTrack[] = [];
    rawTracks.forEach((rawTrack, ti) => {
      const authoredId = firstKey(rawTrack.id, rawTrack.element, rawTrack.elementId, rawTrack.target, rawTrack.slug, rawTrack.name);
      if (!authoredId) {
        addIssue(ctx, "warning", `Track ${ti + 1} has no \`id\` and was skipped.`, where);
        return;
      }
      const resolved = layerIndex.get(normalizeKey(authoredId));
      if (!resolved) {
        unmatched.add(`${where}: ${authoredId}`);
        addIssue(
          ctx,
          "warning",
          `No element "${authoredId}" on slide ${slideIndex + 1} — that track was dropped.`,
          where
        );
        return;
      }

      const trackWhere = `${where} · ${authoredId}`;
      const channels = compileTrackBody(rawTrack, ctx, offsetMs, trackWhere);
      CHANNEL_KEYS.forEach((c) => {
        keyframeCount += channels[c]?.length ?? 0;
      });

      // Keyframes outside the scene window still resolve (sampling clamps to
      // the nearest one), but they almost always mean a mistimed cue.
      CHANNEL_KEYS.forEach((c) => {
        const kfs = channels[c];
        if (!kfs?.length) return;
        if (kfs[0].tMs < startMs - 1 || kfs[kfs.length - 1].tMs > endMs + 1) {
          addIssue(
            ctx,
            "warning",
            `Animation on "${authoredId}" runs outside its scene window (${Math.round(startMs)}–${Math.round(endMs)}ms).`,
            trackWhere
          );
        }
      });

      touched.add(`${slideIndex}:${resolved}`);
      tracks.push({
        id: resolved,
        authoredId,
        label: firstStr(rawTrack.name) ?? authoredId,
        visible: rawTrack.visible !== false,
        wipeFrom: resolveWipeDirection(rawTrack.wipeFrom),
        wipeStyle: resolveWipeStyle(asArray<AuthoredCue>(rawTrack.cues)),
        channels,
      });
    });

    // Collage parts nobody choreographed still deserve the paper-cut look
    // when it is switched on — this only fills a gap the author left (an
    // untouched id), it never overrides a track someone actually wrote.
    // Staggered by reading order so parts drop in one at a time rather than
    // all at once.
    if (options.paperCutStyle) {
      const untrackedParts = slide.layers
        .filter((l) => l.objectType === "collage-part" && !touched.has(`${slideIndex}:${l.id}`))
        .sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));

      const sceneDur = Math.max(800, endMs - startMs);
      const stepMs = (sceneDur * 0.7) / Math.max(1, untrackedParts.length);

      untrackedParts.forEach((layer, i) => {
        const trackWhere = `${where} · ${layer.id} (auto paper-cut)`;
        const atMs = options.textOnlySync
          ? startMs + i * 150
          : Math.round(startMs + 140 + i * stepMs);

        const hideCue: NormalizedCue = {
          action: "hide",
          atMs: startMs,
          durMs: 0,
          params: {},
        };
        const paperCue: NormalizedCue = {
          action: "paperDropIn",
          atMs,
          durMs: 460,
          params: {},
        };

        const hideChans = atMs > startMs + 10 ? CUE_BUILDERS.hide(hideCue, ctx.defaults).channels : {};
        const paperChans = CUE_BUILDERS.paperDropIn(paperCue, ctx.defaults).channels;
        const merged: Channels = {};
        mergeChannels(merged, hideChans);
        mergeChannels(merged, paperChans);

        const channels = finalizeChannels(merged, ctx, trackWhere);
        CHANNEL_KEYS.forEach((c) => {
          keyframeCount += channels[c]?.length ?? 0;
        });
        touched.add(`${slideIndex}:${layer.id}`);
        tracks.push({
          id: layer.id,
          authoredId: layer.id,
          label: layer.name || "collage part",
          visible: true,
          wipeFrom: "left",
          wipeStyle: "straight",
          channels,
        });
      });
    }

    const rawCamera = Array.isArray(rawScene.camera) ? { keyframes: rawScene.camera } : rawScene.camera ?? {};
    const cameraFromCues = compileCueList(asArray<AuthoredCue>(rawCamera.cues), ctx, offsetMs, `${where} · camera`);
    const camera: Partial<Record<CameraChannel, Keyframe[]>> = { ...cameraFromCues.camera };
    // Bare camera keyframes use their own channel names, not the layer ones.
    asArray<AuthoredKeyframe>(rawCamera.keyframes).forEach((raw) => {
      const t = firstNum(raw.tMs, raw.t, raw.atMs, raw.at);
      if (t === null) return;
      const easeName = firstStr(raw.ease);
      const ease: EaseName = (easeName ? resolveEase(easeName) : null) ?? ctx.defaults.ease;
      const tMs = t * ctx.timeScale + offsetMs;
      const put = (ch: CameraChannel, value: unknown) => {
        if (!isNum(value)) return;
        (camera[ch] ??= []).push({ tMs, value, ease, source: "camera" });
      };
      put("zoom", raw.zoom);
      put("panXPct", raw.panXPct ?? raw.panX ?? raw.x);
      put("panYPct", raw.panYPct ?? raw.panY ?? raw.y);
    });
    (Object.keys(camera) as CameraChannel[]).forEach((ch) => {
      camera[ch]?.sort((a, b) => a.tMs - b.tMs);
      keyframeCount += camera[ch]?.length ?? 0;
    });

    const background = rawScene.background
      ? compileTrackBody(rawScene.background, ctx, offsetMs, `${where} · background`)
      : {};
    CHANNEL_KEYS.forEach((c) => {
      keyframeCount += background[c]?.length ?? 0;
    });

    scenes.push({
      index: scenes.length,
      slideIndex,
      ...(typeof rawScene.intro === "string" && rawScene.intro.trim() ? { intro: rawScene.intro.trim() } : {}),
      startMs,
      endMs,
      label: firstStr(rawScene.label, rawScene.note) ?? `Scene ${i + 1}`,
      enter: normalizeTransition(rawScene.enter, i === 0 ? "fade" : "cut"),
      exit: normalizeTransition(rawScene.exit, "cut"),
      camera,
      background,
      tracks,
    });
  });

  if (ctx.issues.some((i) => i.level === "error")) return emptyReport();
  if (scenes.length === 0) {
    addIssue(ctx, "error", "No usable scenes after validation.");
    return emptyReport();
  }

  scenes.sort((a, b) => a.startMs - b.startMs);
  scenes.forEach((s, i) => (s.index = i));

  // Coverage: gaps freeze the previous scene, overlaps make two scenes fight
  // over the same instant. Both are survivable, neither is intended.
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const cur = scenes[i];
    const gap = cur.startMs - prev.endMs;
    if (gap > 1) {
      addIssue(
        ctx,
        "warning",
        `${Math.round(gap)}ms of dead air between scene ${i} and scene ${i + 1} — the last frame of scene ${i} holds.`,
        `scene ${i + 1}`
      );
    } else if (gap < -1) {
      addIssue(ctx, "warning", `Scene ${i + 1} starts ${Math.round(-gap)}ms before scene ${i} ends.`, `scene ${i + 1}`);
    }
  }

  const lastEnd = scenes[scenes.length - 1].endMs;
  const declaredDuration = firstNum(authored.durationMs, authored.duration);
  const durationMs = declaredDuration !== null ? declaredDuration * ctx.timeScale : lastEnd;
  if (declaredDuration !== null && Math.abs(durationMs - lastEnd) > 250) {
    addIssue(
      ctx,
      "warning",
      `Declared duration ${Math.round(durationMs)}ms but the last scene ends at ${Math.round(lastEnd)}ms.`
    );
  }
  if (scenes[0].startMs > 1) {
    addIssue(ctx, "warning", `The first scene starts at ${Math.round(scenes[0].startMs)}ms — nothing is on screen before that.`);
  }

  // Elements nobody animated still render, at rest — worth surfacing, since
  // it is usually an element the author forgot rather than a deliberate hold.
  const untouched: string[] = [];
  const usedSlides = new Set(scenes.map((s) => s.slideIndex));
  usedSlides.forEach((si) => {
    slides[si].layers.forEach((l) => {
      if (!touched.has(`${si}:${l.id}`)) untouched.push(`slide ${si + 1} · ${l.id}`);
    });
  });

  const fps = clamp(Math.round(firstNum(authored.fps) ?? 60), 12, 60);
  const canvasW = firstNum(authored.canvas?.width);
  const canvasH = firstNum(authored.canvas?.height);

  return {
    timeline: {
      fps,
      durationMs: Math.max(durationMs, lastEnd),
      canvas: canvasW && canvasH ? { width: canvasW, height: canvasH } : null,
      scenes,
    },
    report: {
      issues: ctx.issues,
      sceneCount: scenes.length,
      trackCount: scenes.reduce((n, s) => n + s.tracks.length, 0),
      cueCount: ctx.cueCount,
      keyframeCount,
      durationMs: Math.max(durationMs, lastEnd),
      unmatchedIds: [...unmatched],
      untouchedLayers: untouched,
      syncedCues: ctx.syncedCues,
      wordKeyedCues: ctx.wordKeyedCues,
      unmatchedWords: ctx.unmatchedWords,
      maxDriftMs: Math.round(ctx.maxDriftMs),
    },
  };
}

/** Text in, playable timeline out — the one call the UI needs. */
export function parseMotionTimeline(
  raw: string,
  slides: TimelineSlideLike[],
  options: CompileOptions = {}
): ParsedTimelineResult {
  const { value, error } = parseLooseJson<AuthoredTimeline>(raw);
  if (!value) {
    return {
      timeline: null,
      report: {
        issues: [{ level: "error", message: `Could not read the timeline as JSON. ${error ?? ""}`.trim() }],
        sceneCount: 0,
        trackCount: 0,
        cueCount: 0,
        keyframeCount: 0,
        durationMs: 0,
        unmatchedIds: [],
        untouchedLayers: [],
        syncedCues: 0,
        wordKeyedCues: 0,
        unmatchedWords: [],
        maxDriftMs: 0,
      },
    };
  }
  return compileTimeline(value, slides, options);
}

/** Unused channel keys are re-exported so the sampler stays in step. */
export { CHANNEL_KEYS, CUE_CHANNELS };
