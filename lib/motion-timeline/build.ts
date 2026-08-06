/**
 * Deterministic timeline construction.
 *
 * Given the sync manifest (what enters on which word) and the word-level
 * transcript (when each word is actually spoken), the timeline is arithmetic —
 * there is nothing left for a model to decide. Running it here instead of in a
 * second chat removes the pipeline's whole token bottleneck and, more
 * importantly, removes the class of error where the choreography is right and
 * the milliseconds are wrong.
 */

import { bindBeatToSlide, layersOf, slideIndexForBeat, type Binding, type SyncManifest } from "./manifest";
import { findWordTime, type TranscriptWord } from "./transcript";
// Shared with the compiler so a timeline built here and a timeline snapped
// there put an entrance at exactly the same instant.
import { DEFAULT_LEAD_IN_MS as LEAD_IN_MS, type TimelineSlideLike } from "./compile";
import type { AuthoredCue, AuthoredScene, AuthoredTimeline, AuthoredTrack, WipeDirection } from "./types";
import { TIMELINE_FORMAT } from "./types";
import { CUE_NAMES } from "./cues";

export interface BuildOptions {
  /** Silence held after the last spoken word, so the video does not snap shut. */
  tailMs?: number;
  /** Ambient camera push on every scene. Set 0 to leave the frame still. */
  kenBurnsTo?: number;
}

export interface BuildReport {
  warnings: string[];
  /** Elements that bound to a layer, over elements the manifest declared. */
  boundElements: number;
  totalElements: number;
  /** Trigger words the transcript did not contain. */
  unmatchedWords: string[];
  /** Beats whose spoken line could not be located in the transcript. */
  unlocatedBeats: string[];
}

export interface BuildResult {
  timeline: AuthoredTimeline | null;
  report: BuildReport;
}

const DEFAULT_TAIL_MS = 600;
/**
 * A scene opens slightly before its first spoken word. Entrances carry a
 * lead-in so they have landed by the time the syllable is heard, and without
 * this head-room that lead-in would fall in the previous scene — where the
 * element does not exist. Must stay above the compiler's lead-in.
 */
const PRE_ROLL_MS = 140;
const ENTRANCE_MS = 380;
const EXIT_MS = 300;
const EMPHASIS_MS = 360;
/**
 * Paper mode, same rule as autosync's (see autosync.ts): a decomposed graphic
 * has no words of its own to be "read" in step with the voice, so pacing its
 * entrance against one is guesswork, not sync. It lands with its slide
 * instead. Multiple graphics in one beat are dealt in quick succession, a
 * stack of sheets rather than a single cut, so it still reads as deliberate.
 */
const GRAPHIC_STAGGER_MS = 75;
/** Every graphic in a beat is down within this long, however many there are. */
const GRAPHIC_WINDOW_MS = 460;
/**
 * How long after a graphic has settled its own bound word must still fall to
 * earn it a pulse. Any closer and the pulse collides with the entrance that
 * just played, reading as one confused beat instead of two.
 */
const EMPHASIS_MIN_GAP_MS = 500;

/** Entrances that already start from invisible — no `hide` needed before them. */
const SELF_HIDING = new Set([
  "fadeIn", "fadeInUp", "fadeInDown", "fadeInLeft", "fadeInRight",
  "popIn", "blurIn", "wipeIn", "zoomIn", "zigzagIn",
]);

/**
 * Locates the first word of a beat's spoken line in the transcript, scanning
 * forward from where the previous beat started so a repeated opener ("Dekho")
 * cannot throw the scene order backwards.
 */
function findLineStart(words: TranscriptWord[], line: string, fromMs: number): number | null {
  const tokens = line.split(/\s+/).filter(Boolean).slice(0, 6);
  for (const token of tokens) {
    const match = findWordTime(words, token, fromMs, fromMs);
    if (match && match.startMs >= fromMs - 1) return match.startMs;
  }
  return null;
}

export function buildTimelineFromManifest(
  manifest: SyncManifest,
  slides: TimelineSlideLike[],
  transcript: TranscriptWord[],
  options: BuildOptions = {}
): BuildResult {
  const warnings: string[] = [];
  const unmatchedWords: string[] = [];
  const unlocatedBeats: string[] = [];
  const tailMs = options.tailMs ?? DEFAULT_TAIL_MS;
  const kenBurnsTo = options.kenBurnsTo ?? 1.05;

  const empty = (): BuildResult => ({
    timeline: null,
    report: { warnings, boundElements: 0, totalElements: 0, unmatchedWords, unlocatedBeats },
  });

  if (slides.length === 0) {
    warnings.push("Decompose your posters first — there are no slides to animate.");
    return empty();
  }
  if (transcript.length === 0) {
    warnings.push("Load the word-level transcript CSV — without it there is nothing to sync to.");
    return empty();
  }

  const audioEndMs = transcript[transcript.length - 1].endMs;

  /* ── Scene windows ────────────────────────────────────────────────────
     A beat owns the audio from where its own line starts until the next
     beat's line starts. Boundaries come from the transcript, never from the
     model's estimate, so scenes tile the audio exactly by construction. */
  const starts: number[] = [];
  // The floor for the next beat's search. It must sit STRICTLY after the word
  // that opened this beat, or a script that opens three beats with "Dekho" —
  // which §5 of the video prompt actively encourages — matches the same
  // occurrence every time and collapses every later scene onto it.
  let cursor = 0;
  manifest.beats.forEach((beat, i) => {
    const located = beat.line ? findLineStart(transcript, beat.line, cursor) : null;
    // Fall back to the beat's first trigger word, then to an even split — a
    // beat with an unreadable line still gets a sane window instead of
    // collapsing onto its neighbour.
    const viaWord =
      located === null && beat.elements.length > 0
        ? findWordTime(transcript, beat.elements[0].word, cursor, cursor)?.startMs ?? null
        : null;

    const spokenAt = located ?? viaWord;
    let start = spokenAt;
    if (start === null) {
      if (i > 0) unlocatedBeats.push(beat.label);
      start = i === 0 ? 0 : cursor + (audioEndMs - cursor) / Math.max(1, manifest.beats.length - i);
    }
    // The cut lands just ahead of the word so the first entrance's lead-in has
    // somewhere to live. Monotonic: a beat can never start before the one
    // before it.
    start = i === 0 ? 0 : Math.max(start - PRE_ROLL_MS, starts[i - 1] + 400);
    starts.push(Math.round(start));
    cursor = (spokenAt ?? start) + 1;
  });

  const scenes: AuthoredScene[] = [];
  let boundElements = 0;
  let totalElements = 0;
  let lastEndMs = 0;

  manifest.beats.forEach((beat, i) => {
    const startMs = starts[i];
    const endMs = i + 1 < starts.length ? starts[i + 1] : Math.round(audioEndMs + tailMs);
    if (endMs <= startMs) {
      warnings.push(`${beat.label} would have zero length — skipped.`);
      return;
    }

    const slideIndex = slideIndexForBeat(beat, i, slides.length);
    const slideLayers = layersOf(slides[slideIndex]);
    const bindings: Binding[] = bindBeatToSlide(beat.elements, slideLayers);
    const layerById = new Map(slideLayers.map((l) => [l.id, l] as const));

    const tracks: AuthoredTrack[] = [];
    let graphicCount = 0;
    bindings.forEach((binding) => {
      totalElements++;
      const { element, layerId } = binding;
      if (!layerId) {
        warnings.push(
          `${beat.label} · "${element.label}" (${element.kind}, ${element.pos}) matched no decomposed layer on slide ${slideIndex + 1} — nothing animates for it.`
        );
        return;
      }
      boundElements++;

      // A decomposed graphic has no words of its own to be "read" in step
      // with the voice — gating it behind element.word the same way a
      // caption is gated left the slide's own artwork missing until the
      // narration happened to name it, sometimes seconds in, so the cut
      // opened on bare background. It lands WITH the slide instead, same as
      // autosync's paper mode; only text still waits for its word, because
      // reading along with speech is the point for text.
      const isGraphic = (layerById.get(layerId)?.type ?? "graphic") !== "text";

      const cues: AuthoredCue[] = [];
      let enterMs: number;
      let wipeFrom: WipeDirection | undefined;

      if (isGraphic) {
        // Always a torn-paper zigzag reveal, not whatever entrance the
        // manifest asked for — that choice was made for an element syncing
        // to speech, which this one deliberately no longer does. Alternating
        // which side the tear sweeps in from is what makes a stack of
        // graphics on one slide read as dealt sheets rather than a template
        // repeating itself.
        enterMs = Math.min(startMs + graphicCount * GRAPHIC_STAGGER_MS, startMs + GRAPHIC_WINDOW_MS);
        wipeFrom = graphicCount % 2 === 0 ? "left" : "right";
        graphicCount++;
        cues.push({ action: "zigzagIn", atMs: enterMs, durMs: ENTRANCE_MS });
      } else {
        const entrance = CUE_NAMES.includes(element.in) ? element.in : "fadeInUp";
        if (!CUE_NAMES.includes(element.in)) {
          warnings.push(`${beat.label} · "${element.label}" asked for unknown cue "${element.in}" — used fadeInUp.`);
        }

        // Times are resolved here, not left for the compiler to snap: the
        // document is saved to history and later re-compiled with no transcript
        // loaded, and a timeline that only works while a CSV happens to be open
        // is not a timeline. `word` rides along so the compiler can re-verify —
        // and re-snap — whenever a transcript IS present.
        // Floored at the scene start: a manifest word belongs to this beat's own
        // line, so an earlier occurrence elsewhere in the reel is never the one
        // meant — without the floor a repeated noun ("gullak" in beat 1 and
        // again in beat 3) drags the cue back outside its own scene.
        const entranceAt = findWordTime(transcript, element.word, startMs, startMs);
        if (!entranceAt) {
          if (!unmatchedWords.includes(element.word)) unmatchedWords.push(element.word);
          warnings.push(
            `${beat.label} · "${element.label}" is keyed to "${element.word}", which is not spoken — it enters at the scene start instead.`
          );
        }
        enterMs = Math.max(startMs, (entranceAt?.startMs ?? startMs + PRE_ROLL_MS) - LEAD_IN_MS);

        // The renderer draws an untracked element fully visible, so anything
        // that should arrive later must be explicitly hidden at the scene start.
        if (!SELF_HIDING.has(entrance)) cues.push({ action: "hide", atMs: startMs });
        cues.push({ action: entrance, atMs: enterMs, durMs: ENTRANCE_MS, word: element.word });
      }

      // A hit or an exit comes after the element has entered, and still inside
      // the scene — anything else is a cue firing on a slide that is gone.
      if (element.hit) {
        const hit = findWordTime(transcript, element.hit, enterMs, enterMs);
        if (hit && hit.startMs < endMs) {
          cues.push({ action: "emphasize", atMs: hit.startMs, durMs: EMPHASIS_MS, amount: 1.06, word: element.hit });
        } else if (!unmatchedWords.includes(element.hit)) unmatchedWords.push(element.hit);
      } else if (isGraphic) {
        // The word that used to gate this graphic's entrance still earns it a
        // pulse once the narration actually reaches it — the sync is not
        // lost, it just no longer holds the slide empty while it waits.
        const named = findWordTime(transcript, element.word, enterMs, enterMs);
        if (named && named.startMs < endMs && named.startMs > enterMs + ENTRANCE_MS + EMPHASIS_MIN_GAP_MS) {
          cues.push({ action: "emphasize", atMs: named.startMs, durMs: EMPHASIS_MS, amount: 1.06, word: element.word });
        }
      }
      if (element.out) {
        const out = findWordTime(transcript, element.out, enterMs, enterMs);
        if (out && out.startMs < endMs) {
          cues.push({ action: "fadeOut", atMs: out.startMs, durMs: EXIT_MS, word: element.out });
        } else if (!unmatchedWords.includes(element.out)) unmatchedWords.push(element.out);
      }

      tracks.push({ id: layerId, name: element.label, cues, ...(wipeFrom ? { wipeFrom } : {}) });
    });

    lastEndMs = endMs;
    scenes.push({
      slide: slideIndex + 1,
      label: beat.label,
      startMs,
      endMs,
      enter: i === 0 ? { type: "fade", durationMs: 320 } : { type: "cut", durationMs: 0 },
      exit: i === manifest.beats.length - 1 ? { type: "fade", durationMs: 400 } : { type: "cut", durationMs: 0 },
      camera:
        kenBurnsTo > 1
          ? { cues: [{ action: "kenBurns", atMs: startMs, durMs: endMs - startMs, from: 1, to: kenBurnsTo, panXPct: 1.2 }] }
          : undefined,
      tracks,
    });
  });

  if (scenes.length === 0) {
    warnings.push("No beat produced a usable scene.");
    return empty();
  }

  return {
    timeline: {
      format: TIMELINE_FORMAT,
      version: 1,
      fps: 60,
      durationMs: lastEndMs,
      timeBase: "absolute",
      defaults: { ease: "easeOutCubic", distancePct: 4 },
      scenes,
    } as AuthoredTimeline,
    report: { warnings, boundElements, totalElements, unmatchedWords, unlocatedBeats },
  };
}
