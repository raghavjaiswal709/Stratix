import type { TranscriptWord } from "@/lib/motion-timeline/transcript";

/**
 * Cutting the script into the parts a slide can be matched against.
 *
 * The collage format's premise is one spoken sentence → one image, so the
 * script's own list of sentences IS the list of slides the batch should
 * contain. Recovering that list is what makes "which part has no image?" a
 * question with an answer.
 *
 * The hard case, and the one that broke matching outright, is a word-level
 * transcript CSV: one row per word, and most exporters put no punctuation in
 * the word cell at all. Splitting such a transcript on sentence-enders finds
 * zero boundaries and returns the whole reel as a single segment — at which
 * point every slide "matches" the one segment and the result is worthless.
 * So punctuation is only the first of four tiers, and the timing column,
 * which such a CSV always has, carries the fallback: people pause between
 * sentences, and those pauses are in the data.
 */

export type ScriptSegmentSource =
  | "manifest"
  | "transcript-punctuation"
  | "transcript-pauses"
  | "transcript-even"
  | "none";

export interface ScriptSegment {
  index: number;
  text: string;
  /** Present only for transcript-derived segments. */
  startMs?: number;
  endMs?: number;
}

export interface ScriptSegmentation {
  segments: ScriptSegment[];
  source: ScriptSegmentSource;
  /** One line for the UI: where these parts came from, and how. */
  label: string;
}

export const EMPTY_SEGMENTATION: ScriptSegmentation = { segments: [], source: "none", label: "" };

/** Sentence-enders across the scripts this app actually sees (mirrors text-match.ts). */
const SENTENCE_END = /[.!?…।؟。]["')\]]?$/;

/** Shortest run of words that can stand as its own spoken part. */
const MIN_SEGMENT_WORDS = 3;
/** Longest a part may run before it is more likely two sentences than one. */
const MAX_SEGMENT_WORDS = 45;

function toSegments(texts: string[]): ScriptSegment[] {
  return texts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, index) => ({ index, text }));
}

/** Word runs → segments, carrying the timing of the words they were cut from. */
function runsToSegments(words: TranscriptWord[], boundaries: number[]): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  for (let b = 0; b < boundaries.length - 1; b++) {
    const from = boundaries[b];
    const to = boundaries[b + 1];
    const run = words.slice(from, to);
    const text = run.map((w) => w.text).join(" ").trim();
    if (!text) continue;
    out.push({
      index: out.length,
      text,
      startMs: run[0]?.startMs,
      endMs: run[run.length - 1]?.endMs,
    });
  }
  return out;
}

/**
 * Folds runs shorter than MIN_SEGMENT_WORDS into the neighbour they most
 * likely belong to. A stray "Haan." on its own is a fragment of the sentence
 * beside it, not a slide of its own — and left alone it would be reported as
 * a missing part forever, since no image will ever match it.
 */
function mergeShortRuns(boundaries: number[], words: TranscriptWord[]): number[] {
  if (boundaries.length <= 2) return boundaries;
  const out = [...boundaries];
  let i = 1;
  while (i < out.length - 1) {
    const len = out[i + 1] - out[i];
    const prevLen = out[i] - out[i - 1];
    if (len >= MIN_SEGMENT_WORDS || out.length <= 2) {
      i++;
      continue;
    }
    // Merge with whichever side keeps segment lengths more even — merging a
    // 2-word tail into an already-huge run just moves the problem.
    if (prevLen <= len || i === out.length - 2) out.splice(i, 1);
    else out.splice(i + 1, 1);
    if (i > 1) i--;
  }
  void words;
  return out;
}

function averageWords(boundaries: number[]): number {
  const segs = boundaries.length - 1;
  return segs > 0 ? (boundaries[boundaries.length - 1] - boundaries[0]) / segs : Infinity;
}

/** Tier 2 — real punctuation in the word cells. */
function splitOnPunctuation(words: TranscriptWord[]): number[] | null {
  const boundaries: number[] = [0];
  for (let i = 1; i < words.length; i++) {
    if (SENTENCE_END.test(words[i - 1].text.trim())) boundaries.push(i);
  }
  boundaries.push(words.length);
  const merged = mergeShortRuns(boundaries, words);
  const count = merged.length - 1;
  // One segment means no punctuation was found at all; an average run longer
  // than a paragraph means the punctuation that exists is not sentence-level.
  if (count < 2 || averageWords(merged) > MAX_SEGMENT_WORDS) return null;
  return merged;
}

/**
 * Tier 3 — silence.
 *
 * The threshold is chosen from the data rather than fixed: a fast Hinglish
 * read pauses ~250ms between sentences where a slow one pauses ~700ms, and a
 * single constant gets one of them badly wrong. Candidate thresholds are
 * walked from generous to tight, and the first that yields plausibly-sized
 * parts — at least as many as the batch has slides, when that hint is
 * available — wins.
 */
function splitOnPauses(words: TranscriptWord[], hintCount: number | undefined): { boundaries: number[]; thresholdMs: number } | null {
  if (words.length < MIN_SEGMENT_WORDS * 2) return null;

  const gaps: number[] = [0];
  for (let i = 1; i < words.length; i++) {
    gaps.push(Math.max(0, words[i].startMs - words[i - 1].endMs));
  }
  const spoken = gaps.filter((g) => g > 0).sort((a, b) => b - a);
  if (spoken.length === 0) return null;

  // Thresholds drawn from the transcript's own gap distribution, plus a few
  // absolute ones so a transcript with unusually uniform gaps still splits.
  const pct = (p: number) => spoken[Math.min(spoken.length - 1, Math.floor(spoken.length * p))] ?? 0;
  const candidates = [...new Set([pct(0.02), pct(0.05), pct(0.1), pct(0.15), pct(0.25), 600, 450, 350, 280, 220, 170].map((n) => Math.round(n)))]
    .filter((n) => n >= 90)
    .sort((a, b) => b - a);

  let best: { boundaries: number[]; thresholdMs: number; score: number } | null = null;

  for (const thresholdMs of candidates) {
    const raw: number[] = [0];
    for (let i = 1; i < words.length; i++) if (gaps[i] >= thresholdMs) raw.push(i);
    raw.push(words.length);
    const boundaries = mergeShortRuns(raw, words);
    const count = boundaries.length - 1;
    if (count < 2) continue;
    const avg = averageWords(boundaries);
    if (avg > MAX_SEGMENT_WORDS) continue;

    // Prefer a count at or just above the slide count — a part with no image
    // is exactly what this feature exists to surface, so under-splitting
    // (which hides a missing part) is worse than mild over-splitting.
    const target = hintCount && hintCount >= 2 ? hintCount : Math.max(2, Math.round(words.length / 14));
    const shortfall = Math.max(0, target - count);
    const excess = Math.max(0, count - target);
    const score = shortfall * 2 + excess;
    if (!best || score < best.score) best = { boundaries, thresholdMs, score };
    if (score === 0) break;
  }

  return best ? { boundaries: best.boundaries, thresholdMs: best.thresholdMs } : null;
}

/** Tier 4 — no punctuation, no usable pauses: even runs, so the UI still works. */
function splitEvenly(words: TranscriptWord[], hintCount: number | undefined): number[] {
  const target = Math.max(2, Math.min(hintCount && hintCount >= 2 ? hintCount : Math.round(words.length / 14), Math.floor(words.length / MIN_SEGMENT_WORDS)));
  const boundaries: number[] = [];
  for (let i = 0; i < target; i++) boundaries.push(Math.round((i * words.length) / target));
  boundaries.push(words.length);
  return [...new Set(boundaries)].sort((a, b) => a - b);
}

export interface DeriveSegmentsInput {
  /** One line per beat, straight from the sync manifest — authoritative when present. */
  manifestLines?: string[];
  transcript?: TranscriptWord[] | null;
  /** How many slides are loaded, used only to pick a sensible split granularity. */
  hintCount?: number;
}

/**
 * The script's parts, in speaking order — the canonical list every slide is
 * matched against.
 *
 * Tiered by how directly each source states the answer: the sync manifest
 * literally lists one line per beat, so it is used verbatim whenever present.
 * A transcript has to be cut, and the tiers below it degrade from "the writer
 * punctuated it" through "the speaker paused" to "split it evenly and let the
 * user see what happened" — never returning nothing while a transcript exists.
 */
export function deriveScriptSegments(input: DeriveSegmentsInput): ScriptSegmentation {
  const manifestLines = (input.manifestLines ?? []).map((l) => l.trim()).filter(Boolean);
  if (manifestLines.length > 0) {
    const segments = toSegments(manifestLines);
    return {
      segments,
      source: "manifest",
      label: `${segments.length} part${segments.length === 1 ? "" : "s"} from the sync manifest`,
    };
  }

  const words = (input.transcript ?? []).filter((w) => w.text.trim());
  if (words.length === 0) return EMPTY_SEGMENTATION;

  const punctuation = splitOnPunctuation(words);
  if (punctuation) {
    const segments = runsToSegments(words, punctuation);
    if (segments.length >= 2) {
      return {
        segments,
        source: "transcript-punctuation",
        label: `${segments.length} parts from the transcript's sentence punctuation`,
      };
    }
  }

  const pauses = splitOnPauses(words, input.hintCount);
  if (pauses) {
    const segments = runsToSegments(words, pauses.boundaries);
    if (segments.length >= 2) {
      return {
        segments,
        source: "transcript-pauses",
        label: `${segments.length} parts from the transcript, split at pauses of ${pauses.thresholdMs}ms or more`,
      };
    }
  }

  const segments = runsToSegments(words, splitEvenly(words, input.hintCount));
  if (segments.length < 2) {
    return {
      segments: toSegments([words.map((w) => w.text).join(" ")]),
      source: "transcript-even",
      label: "The transcript could not be split into parts — it is being treated as one.",
    };
  }
  return {
    segments,
    source: "transcript-even",
    label: `${segments.length} parts split evenly — the transcript has no punctuation or pauses to cut on`,
  };
}
