/**
 * Auto-sync: slides + transcript → a finished timeline, with nothing in between.
 *
 * The manifest path (build.ts) still needs a model to say which element enters
 * on which word. This one does not ask, because it does not have to: the
 * decomposer has already read every word printed on every poster, and the CSV
 * says when every word is spoken. If the script was written for these images in
 * this order — the premise of the whole format — then the slide's own words
 * appear in the narration, and where they appear IS the sync.
 *
 * Three deterministic stages:
 *
 *   1. Segmentation. Each slide claims a contiguous span of the audio. Chosen
 *      by dynamic programming over the whole reel at once, scoring how much of
 *      each slide's printed text is spoken inside its own span, how close the
 *      span is to the slide's fair share of the runtime, and whether the cut
 *      lands in a pause. Solving it globally rather than greedily is what stops
 *      one confident match on slide 2 from shoving slides 3–8 off the road.
 *
 *   2. Scheduling. Inside a span, a text element enters on the word it prints.
 *      Elements with nothing quotable (graphics, icons) are dealt into the gaps
 *      between those anchors in reading order and snapped to word starts, so
 *      even an unanchored entrance lands on speech instead of between it.
 *
 *   3. Choreography. The cue is read off the element itself — role, position,
 *      size, aspect — by a fixed table. Same poster in, same animation out.
 *
 * Nothing here is heuristic about *time*: every millisecond traces back to a
 * row in the CSV.
 */

import { DEFAULT_LEAD_IN_MS as LEAD_IN_MS, type TimelineSlideLike } from "./compile";
import { CUE_NAMES } from "./cues";
import {
  buildTranscriptIndex,
  locatePhrase,
  nearestWordIndex,
  normalizeToken,
  strongestSpokenToken,
  weighPhrase,
  type TranscriptIndex,
} from "./text-match";
import type { TranscriptWord } from "./transcript";
import { TIMELINE_FORMAT, type AuthoredCue, type AuthoredScene, type AuthoredTimeline, type AuthoredTrack, type WipeDirection } from "./types";

/* ────────────────────────────────────────────────────────────────────────────
 * Tunables
 * ──────────────────────────────────────────────────────────────────────────*/

/** Silence held after the last spoken word so the video does not snap shut. */
const DEFAULT_TAIL_MS = 600;
/**
 * A scene opens slightly ahead of its first spoken word, so the first
 * entrance's lead-in has somewhere to live. Without it that lead-in would fall
 * inside the previous scene, where the element does not exist.
 */
const PRE_ROLL_MS = 140;
/**
 * Shortest span a slide may own.
 *
 * This is a hard rejection in the search, so it is also a way for arithmetic to
 * overrule the audio: if the narration genuinely spends 600ms on a slide, a
 * higher floor makes the correct cut illegal and pushes it somewhere the CSV
 * never suggested. Kept low enough that the transcript decides, high enough
 * that a cut is still a scene rather than a single frame.
 */
const MIN_SCENE_MS = 420;
/** Two elements closer together than this read as one event, not two. */
const DEFAULT_STAGGER_MS = 190;
/** Rhythm for elements with nothing to anchor to, compressed only if it must. */
const IDEAL_STEP_MS = 430;
/**
 * Paper mode. Images land as the slide opens, dealt rather than fired at once —
 * a stack of sheets put down in quick succession reads as deliberate, whereas a
 * dozen things appearing on the same frame reads as a cut.
 */
const PAPER_STAGGER_MS = 75;
/** Everything is down within this long, however many images there are. */
const PAPER_WINDOW_MS = 460;
/** How long the intro card holds when slide 1 gives it nothing to hand over on. */
const INTRO_FALLBACK_MS = 2600;
/** Unanchored elements must all be in place by this share of their scene. */
const SETTLE_FRACTION = 0.82;

/** Anchoring thresholds — how much of an element's text must be spoken. */
const ANCHOR_MIN_SCORE = 0.5;
const ANCHOR_MIN_WEIGHT = 1.4;
/** A slide's window is judged on the same evidence, a little more leniently. */
const SEGMENT_MIN_WEIGHT = 0.6;
/** Coverage at which a slide is taken to have placed itself. */
const TEXT_CONFIDENT_COVERAGE = 0.35;
/**
 * Second-chance anchoring. A slide that matched nothing at the strict bar is
 * retried here before being given up on — a weak anchor inside the right scene
 * still beats arithmetic, and it is reported at its real confidence rather
 * than dressed up as a certainty.
 */
const ANCHOR_RELAXED_SCORE = 0.32;
const ANCHOR_RELAXED_WEIGHT = 0.8;

/** DP scoring weights. Coverage dominates when there is text to go on. */
const W_COVERAGE = 10;
/**
 * Penalty for holding audio that demonstrably belongs to another slide. Sits
 * just under the coverage reward, so a window will always rather contain its
 * own words than avoid somebody else's — but between two windows that both
 * cover their slide, the tighter one wins.
 */
const W_FOREIGN = 8;
const W_DURATION = 3.2;
/**
 * Reward for a scene starting exactly where its slide is first spoken about.
 * The strongest term in the score, because it is the one that answers the only
 * question segmentation is really asking: when does this image come up?
 */
const W_ANCHOR = 14;
/** How many words into the scene still count as "it opens here". */
const ANCHOR_TAPER_WORDS = 4;
/**
 * Share of a slide's total evidence that must land in those opening words for
 * the anchor to count fully. A third is enough to say the narration has turned
 * to this slide, without demanding it say everything at once.
 */
const ANCHOR_LEAD_SHARE = 0.34;
const W_GAP = 1.7;
const W_SENTENCE = 1.3;

/** Cut candidates are decimated above this many words to bound the DP. */
const MAX_CUT_CANDIDATES = 420;
/**
 * How far the proportional prior stands down when a slide's own words were
 * found. At 0.85 a fully-evidenced slide keeps a sliver of the prior — enough
 * to break ties between equally-good windows, not enough to overrule the audio.
 */
const PRIOR_YIELD = 0.85;

/* ────────────────────────────────────────────────────────────────────────────
 * Public shape
 * ──────────────────────────────────────────────────────────────────────────*/

export interface AutoSyncOptions {
  /** Silence held after the last spoken word. Default 600ms. */
  tailMs?: number;
  /** Ambient camera push. 1 leaves the frame still. Default 1.05. */
  kenBurnsTo?: number;
  /** Gentle idle drift on the biggest graphic of a long scene. Default true. */
  ambient?: boolean;
  /** How far a slide may stray from its proportional share, 0–1. Default 0.3. */
  bandFraction?: number;
  /** Minimum spacing between two entrances. Default 190ms. */
  minStaggerMs?: number;
  /**
   * Sync only the words; let the artwork arrive with its slide. Default true.
   *
   * A graphic has nothing quotable in it, so pacing it across the slide is
   * guesswork dressed up as choreography — the bank illustration slides in
   * halfway through a sentence for no reason anybody watching can hear. With
   * this on, every image is simply *there* from the top of its slide, settling
   * into place like a sheet of paper being laid down, and only the text waits
   * for the word it belongs to.
   */
  textOnlySync?: boolean;
  /**
   * Open on a title card — black frame, white type — over the series recap,
   * before the first poster appears. The card owns the audio up to the moment
   * the narration first says something printed on slide 1, so slide 1 still
   * enters on its own words rather than animating unseen behind the card.
   */
  introCard?: boolean;
}

export interface AutoSyncSceneReport {
  slideIndex: number;
  label: string;
  startMs: number;
  endMs: number;
  /**
   * How this slide's window was decided.
   *
   *   "text"      — its own printed words were found in the narration.
   *   "bracketed" — its own text was not matched, but both its edges are real:
   *                 pinned by a confident neighbour, by the start of the audio,
   *                 or by its end. The timing is as exact as the anchors it sits
   *                 between, which is very different from a guess.
   *   "paced"     — genuinely nothing to go on: no text of its own AND no
   *                 confident neighbour on either side.
   */
  placedBy: "text" | "bracketed" | "paced";
  /** Which of this scene's two edges are anchored to something real. */
  edges: { start: "audio" | "anchor" | "estimate"; end: "audio" | "anchor" | "estimate" };
  /** Share of this slide's spoken text that falls inside its own window, 0–1. */
  coverage: number;
  elementCount: number;
  /** Elements that entered on a word they actually print. */
  anchoredCount: number;
  /** The first few words spoken under this slide — proof of where the cut fell. */
  openingLine: string;
}

export interface AutoSyncReport {
  scenes: AutoSyncSceneReport[];
  durationMs: number;
  totalElements: number;
  /** Elements whose entrance landed on their own printed words. */
  anchoredElements: number;
  /** Elements placed by pacing and snapped to a word start. */
  pacedElements: number;
  /** Text elements whose printed words are nowhere in the transcript. */
  silentText: string[];
  /** Weighted mean coverage — one number for "did this work". */
  confidence: number;
  warnings: string[];
}

export interface AutoSyncResult {
  timeline: AuthoredTimeline | null;
  report: AutoSyncReport;
}

/** A decomposed layer, as much of it as the scheduler reads. */
interface AutoLayer {
  id: string;
  label: string;
  type: "text" | "graphic";
  role: string;
  text: string;
  lineCount: number;
  /** What the detector measured a graphic to be — "chart", "circle", "photo"… */
  objectType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Reading-order rank inside its slide. */
  order: number;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Layer reading
 * ──────────────────────────────────────────────────────────────────────────*/

const FURNITURE_ROLES = new Set(["footer", "footer-badge", "footer-graphic", "logo", "watermark"]);

/**
 * Brand furniture — the handle, the page counter, the logo — is part of the
 * frame rather than part of the argument. It arrives with the slide instead of
 * consuming one of the sync slots the actual content needs.
 */
function isFurniture(layer: AutoLayer): boolean {
  if (FURNITURE_ROLES.has(layer.role)) return true;
  // Anything tiny pinned to the very bottom edge is decoration by position,
  // whatever the decomposer decided to call it.
  return layer.y + layer.h > 0.93 && layer.w < 0.4 && layer.h < 0.07;
}

function readLayers(slide: TimelineSlideLike): AutoLayer[] {
  const raw: AutoLayer[] = [];
  (slide.layers ?? []).forEach((l, i) => {
    try {
      raw.push(readLayer(l, i));
    } catch {
      // A layer whose own fields cannot be read is skipped. Losing one element's
      // animation is recoverable; losing the slide is not.
    }
  });

  return orderForReading(raw);
}

function readLayer(l: TimelineSlideLike["layers"][number], i: number): AutoLayer {
  {
    const anyLayer = l as Record<string, unknown>;
    const text = typeof anyLayer.text === "string" ? anyLayer.text : "";
    const lines = Array.isArray(anyLayer.textLines) ? anyLayer.textLines.length : 0;
    return {
      id: l.id,
      label: (typeof anyLayer.name === "string" && anyLayer.name) || text.slice(0, 40) || l.id,
      type: (l.type === "text" ? "text" : "graphic") as "text" | "graphic",
      role: typeof l.role === "string" ? l.role : "graphic",
      objectType: typeof anyLayer.objectType === "string" ? anyLayer.objectType : "graphic",
      text,
      lineCount: Math.max(1, lines),
      x: numOr(l.x, 0),
      y: numOr(l.y, 0),
      w: numOr(l.w, 0.1),
      h: numOr(l.h, 0.1),
      order: i,
    };
  }
}

const numOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Reading order: down the page, then across.
 *
 * Rows are banded rather than compared exactly, because two elements sitting
 * side by side are never pixel-aligned — without the band a caption 4px lower
 * than the icon beside it would be treated as a whole row later and the pair
 * would animate out of order.
 */
function orderForReading(layers: AutoLayer[]): AutoLayer[] {
  const sorted = [...layers].sort((a, b) => {
    const ca = a.y + a.h / 2;
    const cb = b.y + b.h / 2;
    const band = Math.max(0.045, Math.min(a.h, b.h) * 0.6);
    if (Math.abs(ca - cb) > band) return ca - cb;
    return a.x - b.x;
  });
  return sorted.map((l, i) => ({ ...l, order: i }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage 1 — segmentation
 * ──────────────────────────────────────────────────────────────────────────*/

/** Everything the DP needs to know about one slide. */
interface SlideProfile {
  slideIndex: number;
  layers: AutoLayer[];
  content: AutoLayer[];
  furniture: AutoLayer[];
  /** Distinct spoken tokens this slide prints, with prefix counts over words. */
  tokens: Array<{ weight: number; prefix: Uint32Array }>;
  /** Sum of the weights above — total evidence available for this slide. */
  tokenWeight: number;
  /** How much of the runtime this slide deserves, before any text is consulted. */
  shareWeight: number;
  /** Layers the reader could not make sense of and skipped. */
  droppedLayers: number;
  /**
   * Every transcript position at which this slide's own words are spoken.
   * These are the cuts the CSV is actually proposing, and they are admitted to
   * the search whatever the proportional prior thinks.
   */
  positions: number[];
}

function profileSlides(slides: TimelineSlideLike[], index: TranscriptIndex, warnings: string[]): SlideProfile[] {
  const W = index.words.length;

  const blank = (slideIndex: number): SlideProfile => ({
    slideIndex, layers: [], content: [], furniture: [], tokens: [], tokenWeight: 0, shareWeight: 8, droppedLayers: 0, positions: [],
  });

  return slides.map((slide, slideIndex) => {
    try {
      return profileSlide(slide, slideIndex, index, W);
    } catch (err) {
      warnings.push(
        `Slide ${slideIndex + 1} could not be read (${err instanceof Error ? err.message : "unknown error"}) — it holds its span as a still.`
      );
      return blank(slideIndex);
    }
  });
}

function profileSlide(slide: TimelineSlideLike, slideIndex: number, index: TranscriptIndex, W: number): SlideProfile {
  {
    const layers = readLayers(slide);
    const furniture = layers.filter(isFurniture);
    const content = layers.filter((l) => !isFurniture(l));

    // Furniture text ("@stratix", "1/10") is on every slide, so it identifies
    // none of them — the segmenter only reads what the slide is actually about.
    const printed = content
      .filter((l) => l.type === "text" && l.text)
      .map((l) => l.text)
      .join(" ");

    const seen = new Set<string>();
    const tokens: SlideProfile["tokens"] = [];
    const spokenAt = new Set<number>();
    let tokenWeight = 0;

    weighPhrase(index, printed).forEach((wt) => {
      if (wt.positions.length === 0 || seen.has(wt.token)) return;
      seen.add(wt.token);
      // Prefix counts make "is this token spoken inside [a, b)?" a subtraction,
      // which is what keeps the O(cuts²) inner loop affordable. `positions` is
      // ascending, so one cursor walk builds the whole array.
      const prefix = new Uint32Array(W + 1);
      let cursor = 0;
      let seenCount = 0;
      for (let i = 0; i < W; i++) {
        prefix[i] = seenCount;
        if (cursor < wt.positions.length && wt.positions[cursor] === i) {
          seenCount++;
          cursor++;
        }
      }
      prefix[W] = seenCount;
      wt.positions.forEach((pos) => spokenAt.add(pos));
      tokens.push({ weight: wt.weight, prefix });
      tokenWeight += wt.weight;
    });

    const chars = content.reduce((sum, l) => sum + (l.type === "text" ? l.text.length : 0), 0);
    // A fair share, before the audio gets a say: how much there is to read out,
    // plus a floor so a wordless slide still gets screen time.
    const shareWeight = 8 + chars * 0.45 + content.length * 2.5;

    const droppedLayers = Math.max(0, (slide.layers?.length ?? 0) - layers.length);
    return {
      slideIndex, layers, content, furniture, tokens, tokenWeight, shareWeight, droppedLayers,
      positions: [...spokenAt].sort((a, b) => a - b),
    };
  }
}

/** Share of this slide's evidence spoken inside `[a, b)`, 0–1. */
function coverageOf(profile: SlideProfile, a: number, b: number): number {
  if (profile.tokenWeight <= 0) return 0;
  let hit = 0;
  for (const t of profile.tokens) {
    if (t.prefix[b] - t.prefix[a] > 0) hit += t.weight;
  }
  return hit / profile.tokenWeight;
}

/**
 * Where the cuts are allowed to fall.
 *
 * Every word boundary is a legal cut, but evaluating all of them is quadratic
 * for no gain — two adjacent boundaries in the middle of a phrase score the
 * same. So the candidates are a stride through the reel, plus every boundary
 * that is interesting on its own terms: a real pause, or the end of a sentence.
 * Those are exactly the cuts a human editor would reach for, so they are never
 * decimated away.
 */
function cutCandidates(index: TranscriptIndex): number[] {
  const W = index.words.length;
  const stride = Math.max(1, Math.ceil(W / MAX_CUT_CANDIDATES));
  const set = new Set<number>([0, W]);

  for (let i = stride; i < W; i += stride) set.add(i);
  for (let i = 1; i < W; i++) {
    if (index.gapBeforeMs[i] >= 220 || index.sentenceEndBefore[i]) set.add(i);
  }

  return [...set].sort((a, b) => a - b);
}

interface Segmentation {
  /** N+1 word indices: slide i owns words [cuts[i], cuts[i+1]). */
  cuts: number[];
  coverages: number[];
}

/** Index of the cut candidate sitting closest to a given word. */
function nearestCandidate(candidates: number[], wordIndex: number): number {
  let lo = 0;
  let hi = candidates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candidates[mid] < wordIndex) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(candidates[lo - 1] - wordIndex) <= Math.abs(candidates[lo] - wordIndex)) return lo - 1;
  return lo;
}

function segment(
  profiles: SlideProfile[],
  index: TranscriptIndex,
  bandFraction: number,
  tailMs: number
): Segmentation {
  const N = profiles.length;
  const W = index.words.length;
  const candidates = cutCandidates(index);
  const C = candidates.length;

  // The reel runs past its last word by the tail, and the closing scene owns
  // that silence. Measuring it to the last word instead made a final scene of
  // one short word compute as ~300ms — under the minimum, so the search threw
  // out the correct cut and moved the last image change earlier than the CSV
  // ever asked for.
  const endOfReel = index.durationMs + tailMs;
  const startMs = (i: number) => (i >= W ? endOfReel : index.words[i].startMs);
  const totalMs = Math.max(1, index.durationMs);

  /* ── Contamination ────────────────────────────────────────────────────
     Coverage only asks whether a slide's words are inside its window. It never
     objects to a window that keeps going long after those words have run out,
     so a slide could annex the next slide's audio for free and the prior — the
     only thing left with an opinion — would happily let it, on the grounds
     that the slide has a lot of ink on it.

     This is the missing half: how much of the window belongs to somebody else.
     A span carrying another slide's distinctive words is a span that slide is
     still talking through, and cutting there is what "follow the CSV" means. */
  const ownAt = profiles.map((profile) => {
    const arr = new Float64Array(W);
    profile.tokens.forEach((t) => {
      for (let p = 0; p < W; p++) {
        if (t.prefix[p + 1] - t.prefix[p] > 0) arr[p] += t.weight;
      }
    });
    return arr;
  });
  const totalAt = new Float64Array(W);
  ownAt.forEach((arr) => {
    for (let p = 0; p < W; p++) totalAt[p] += arr[p];
  });
  const foreignPrefix = ownAt.map((own) => {
    const pre = new Float64Array(W + 1);
    for (let p = 0; p < W; p++) pre[p + 1] = pre[p] + Math.max(0, totalAt[p] - own[p]);
    return pre;
  });
  const foreignTotal = foreignPrefix.map((pre) => pre[W]);

  // Fair-share cumulative fractions — the spine the band is drawn around.
  const totalShare = profiles.reduce((s, p) => s + p.shareWeight, 0) || 1;
  const expected: number[] = [0];
  profiles.forEach((p) => expected.push(expected[expected.length - 1] + p.shareWeight / totalShare));

  const allowed: number[][] = [];
  for (let i = 0; i <= N; i++) {
    if (i === 0) {
      allowed.push([0]);
      continue;
    }
    if (i === N) {
      allowed.push([C - 1]);
      continue;
    }
    let band = bandFraction;
    let list: number[] = [];
    // Widen rather than fail: a badly proportioned deck still has to produce a
    // timeline, it just gets less help from the prior.
    while (list.length === 0 && band <= 1) {
      list = [];
      for (let c = 0; c < C; c++) {
        const frac = startMs(candidates[c]) / totalMs;
        if (Math.abs(frac - expected[i]) <= band && candidates[c] > 0 && candidates[c] < W) list.push(c);
      }
      band += 0.15;
    }

    // The band is a proportional guess, and a hard one — a cut outside it was
    // simply unreachable, so where the CSV disagreed with the proportions the
    // CSV lost and could not even be considered. Every position at which this
    // slide's own words begin is therefore admitted regardless of the band:
    // the prior may still prefer something else, but the evidence is always on
    // the ballot.
    const evidencePositions = profiles[i].positions;
    if (evidencePositions.length > 0) {
      const admitted = new Set(list);
      evidencePositions.forEach((wordIndex) => {
        const c = nearestCandidate(candidates, wordIndex);
        if (c > 0 && c < C - 1) admitted.add(c);
      });
      list = [...admitted].sort((a, b) => a - b);
    }

    allowed.push(list.length ? list : [Math.floor(C / 2)]);
  }

  const boundaryBonus = (c: number): number => {
    const wordIdx = candidates[c];
    if (wordIdx <= 0 || wordIdx >= W) return 0;
    const gap = Math.min(1, index.gapBeforeMs[wordIdx] / 450);
    return W_GAP * gap + W_SENTENCE * index.sentenceEndBefore[wordIdx];
  };

  const sceneScore = (slide: number, ca: number, cb: number): number => {
    const a = candidates[ca];
    const b = candidates[cb];
    if (b <= a) return -Infinity;

    const durMs = startMs(b) - startMs(a);
    if (durMs < MIN_SCENE_MS) return -Infinity;

    const profile = profiles[slide];
    const own = ownAt[slide];
    const coverage = coverageOf(profile, a, b);
    // A slide with two readable words cannot outvote one with a paragraph, so
    // its coverage is scaled by how much evidence it brought.
    const evidence = Math.min(1, profile.tokenWeight / 5);

    const expectedMs = (profile.shareWeight / totalShare) * totalMs;
    const rawDev = (durMs - expectedMs) / Math.max(expectedMs, 900);
    // Saturating, not quadratic. An unbounded dev² let the prior reach scores
    // in the twenties — it could out-shout the audio by an order of magnitude
    // purely because a slide had more ink on it than its narration deserved.
    // Bounded, it can say "this looks off" and nothing louder.
    const dev = (rawDev * rawDev) / (1 + rawDev * rawDev);

    // The prior is a guess made from how much ink is on the slide — it knows
    // nothing about the audio. So it only gets a say where the audio is silent
    // on the matter: a slide whose own words were found is judged on those
    // words, and is allowed to run as long or as short as the narration
    // actually runs. Leaving this at full strength was forcing a text-heavy
    // slide to occupy a long span even when the voiceover passed over it in a
    // second.
    const priorWeight = W_DURATION * (1 - PRIOR_YIELD * evidence);

    // Share of every OTHER slide's evidence that this window has swallowed.
    const foreign =
      foreignTotal[slide] > 0
        ? (foreignPrefix[slide][b] - foreignPrefix[slide][a]) / foreignTotal[slide]
        : 0;

    /* The rule the CSV actually states: a slide owns the audio from the moment
       the narration starts talking about it. So a window is rewarded for
       BEGINNING on its slide's own first spoken word — which is the thing that
       decides where an image changes — and the reward falls off within a few
       words either side. Coverage alone could not express this: it saturates
       at 1.0, so a window that starts on the right word and one that starts
       eight words early scored identically, and the ink-based prior broke the
       tie. */
    // Weighted by how MUCH of the slide's evidence arrives in those first few
    // words, not merely whether something did. A single common word from the
    // body copy happening to fall near the cut is not the narration turning to
    // this slide; a cluster of its own vocabulary is.
    let leadWeight = 0;
    const leadEnd = Math.min(b, a + ANCHOR_TAPER_WORDS);
    for (let p = a; p < leadEnd; p++) leadWeight += own[p];
    const anchorBonus = W_ANCHOR * Math.min(1, leadWeight / Math.max(1, profile.tokenWeight * ANCHOR_LEAD_SHARE));

    return W_COVERAGE * coverage * evidence + anchorBonus - W_FOREIGN * foreign - priorWeight * dev;
  };

  // dp[i][j]: best score for placing slides 0..i-1 with a cut at candidates[j].
  const NEG = -Infinity;
  const dp: Float64Array[] = [];
  const back: Int32Array[] = [];
  for (let i = 0; i <= N; i++) {
    dp.push(new Float64Array(C).fill(NEG));
    back.push(new Int32Array(C).fill(-1));
  }
  dp[0][0] = 0;

  for (let i = 1; i <= N; i++) {
    for (const j of allowed[i]) {
      let best = NEG;
      let bestFrom = -1;
      for (const k of allowed[i - 1]) {
        const prev = dp[i - 1][k];
        if (prev === NEG) continue;
        const s = sceneScore(i - 1, k, j);
        if (s === NEG) continue;
        const total = prev + s;
        if (total > best) {
          best = total;
          bestFrom = k;
        }
      }
      if (bestFrom >= 0) {
        dp[i][j] = best + boundaryBonus(j);
        back[i][j] = bestFrom;
      }
    }
  }

  // Backtrack. If the constraints made the exact solution unreachable — a reel
  // too short for its slide count, say — fall back to an even split rather
  // than returning nothing.
  const cuts: number[] = new Array(N + 1);
  const endCandidate = C - 1;
  if (dp[N][endCandidate] === NEG) {
    for (let i = 0; i <= N; i++) cuts[i] = Math.round((i / N) * W);
  } else {
    let j = endCandidate;
    for (let i = N; i >= 1; i--) {
      cuts[i] = candidates[j];
      j = back[i][j];
      if (j < 0) {
        for (let k = i - 1; k >= 0; k--) cuts[k] = Math.round((k / N) * W);
        j = 0;
        break;
      }
    }
    cuts[0] = 0;
  }

  // Guarantee strict monotonicity even on the fallback paths above.
  for (let i = 1; i <= N; i++) {
    if (cuts[i] <= cuts[i - 1]) cuts[i] = Math.min(W, cuts[i - 1] + 1);
  }
  cuts[N] = W;
  for (let i = N - 1; i >= 1; i--) {
    if (cuts[i] >= cuts[i + 1]) cuts[i] = Math.max(0, cuts[i + 1] - 1);
  }

  const coverages = profiles.map((p, i) => coverageOf(p, cuts[i], cuts[i + 1]));
  return { cuts, coverages };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage 2 — scheduling inside one scene
 * ──────────────────────────────────────────────────────────────────────────*/

interface Placement {
  layer: AutoLayer;
  /** Time the element should be fully arrived — the word it lands on. */
  onMs: number;
  /** Transcript index it was locked to, or null when it is pure pacing. */
  wordIndex: number | null;
  anchored: boolean;
  /** Second mention of the element's strongest word, for an emphasis hit. */
  hitWordIndex: number | null;
  /** Laid down with the slide rather than scheduled against a word. */
  paper?: boolean;
}

/**
 * Anchors every element that prints something the narration says.
 *
 * No consistency filter against reading order, deliberately. If the script
 * names the sub-line before the headline then the sub-line *should* arrive
 * first — that is what syncing to speech means, and the premise of the whole
 * format is that the script was written for these images. Reading order is the
 * fallback for elements with nothing quotable, not an order to be enforced on
 * elements that have earned a time of their own.
 */
function anchorElements(
  content: AutoLayer[],
  index: TranscriptIndex,
  from: number,
  to: number
): Map<number, { wordIndex: number; score: number }> {
  const found = new Map<number, { wordIndex: number; score: number }>();

  content.forEach((layer, i) => {
    if (layer.type !== "text" || !layer.text.trim()) return;
    const hit = locatePhrase(index, layer.text, {
      fromIndex: from,
      toIndex: to,
      minScore: ANCHOR_MIN_SCORE,
      minWeight: ANCHOR_MIN_WEIGHT,
    });
    if (hit) found.set(i, { wordIndex: hit.index, score: hit.score });
  });

  // Second chance, only for what the strict bar rejected. A caption that shares
  // one distinctive word with the line being spoken is still better evidence
  // than dividing the scene into equal parts — and because the search is
  // confined to this scene's own words, a weak match can only be slightly wrong
  // rather than somewhere else in the reel.
  if (found.size < content.filter((l) => l.type === "text" && l.text.trim()).length) {
    content.forEach((layer, i) => {
      if (found.has(i) || layer.type !== "text" || !layer.text.trim()) return;
      const hit = locatePhrase(index, layer.text, {
        fromIndex: from,
        toIndex: to,
        minScore: ANCHOR_RELAXED_SCORE,
        minWeight: ANCHOR_RELAXED_WEIGHT,
      });
      if (hit) found.set(i, { wordIndex: hit.index, score: hit.score * 0.6 });
    });
  }

  // Two elements cannot both own the same word. The more confident reading
  // keeps it; the other falls back to pacing, where it will be dealt into the
  // gap beside its neighbour anyway.
  const byWord = new Map<number, number>();
  [...found.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0] - b[0])
    .forEach(([order, hit]) => {
      const holder = byWord.get(hit.wordIndex);
      if (holder === undefined) byWord.set(hit.wordIndex, order);
      else found.delete(order);
    });

  return found;
}

/**
 * Fills the gaps between anchors.
 *
 * Unanchored elements are spread evenly through the speech their neighbours
 * leave free, then pulled onto the nearest word start. That last step is what
 * separates this from a slideshow timer: an icon with nothing quotable about it
 * still enters *on* a word, so it reads as deliberate rather than arbitrary.
 */
function schedule(
  content: AutoLayer[],
  index: TranscriptIndex,
  from: number,
  to: number,
  sceneStartMs: number,
  sceneEndMs: number,
  staggerMs: number
): Placement[] {
  const anchors = anchorElements(content, index, from, to);
  const n = content.length;
  if (n === 0) return [];

  const windowMs = Math.max(1, sceneEndMs - sceneStartMs);
  const settleMs = sceneStartMs + windowMs * SETTLE_FRACTION;
  const firstWordMs = index.words[Math.min(from, index.words.length - 1)]?.startMs ?? sceneStartMs;

  const onMs = new Array<number | null>(n).fill(null);
  const wordIdx = new Array<number | null>(n).fill(null);

  anchors.forEach((a, order) => {
    onMs[order] = index.words[a.wordIndex].startMs;
    wordIdx[order] = a.wordIndex;
  });

  // Walk each unanchored run and deal it into the time its neighbours left.
  let i = 0;
  while (i < n) {
    if (onMs[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && onMs[j] === null) j++;

    const runLength = j - i;
    const lowerMs = i === 0 ? firstWordMs : (onMs[i - 1] as number) + staggerMs;
    const upperMs = j < n ? (onMs[j] as number) - staggerMs : Math.max(lowerMs, Math.min(settleMs, sceneEndMs));
    const span = Math.max(0, upperMs - lowerMs);

    // Pace at a fixed rhythm and only compress when the span cannot hold it, so
    // a 3-second scene and a 12-second one stagger their elements the same way
    // instead of one crawling. The run keeps a gap at whichever end abuts an
    // anchor; where it abuts the scene opening, the first element enters with
    // the slide.
    const leading = i === 0 ? 0 : 1;
    const trailing = j < n ? 1 : 0;
    const gaps = Math.max(1, runLength - 1 + leading + trailing);
    const step = Math.min(IDEAL_STEP_MS, span / gaps);

    for (let k = 0; k < runLength; k++) {
      const t = lowerMs + step * (leading + k);
      const snapTo = nearestWordIndex(index, t, from, to);
      onMs[i + k] = snapTo >= 0 ? index.words[snapTo].startMs : t;
      wordIdx[i + k] = snapTo >= 0 ? snapTo : null;
    }
    i = j;
  }

  // Elements now enter in the order they are *spoken about*, not the order they
  // are printed. Reading order survives as the tie-break inside one beat, so
  // two elements the narration reaches in the same breath still animate top
  // to bottom rather than by a few milliseconds of transcription noise.
  const BEAT_MS = 250;
  const plan = content
    .map((layer, k) => ({
      layer,
      onMs: onMs[k] as number,
      wordIndex: wordIdx[k],
      anchored: anchors.has(k),
      readingOrder: k,
    }))
    .sort((a, b) => {
      const beatDelta = Math.round(a.onMs / BEAT_MS) - Math.round(b.onMs / BEAT_MS);
      return beatDelta !== 0 ? beatDelta : a.readingOrder - b.readingOrder;
    });

  // Monotonic and never bunched: snapping can land two elements on the same
  // word, and an entrance that has not visibly happened is a wasted one.
  plan.forEach((p, k) => {
    const floor = k === 0 ? sceneStartMs : plan[k - 1].onMs + staggerMs;
    if (p.onMs < floor) {
      p.onMs = floor;
      // The time no longer belongs to the word it was snapped to — unless the
      // element was anchored, in which case its own words outrank the spacing.
      if (!p.anchored) p.wordIndex = null;
    }
  });

  // A slide with more elements than its span can stagger would push the last of
  // them past the cut, where they would never be seen. Squeeze the whole run
  // back inside instead: crowded is recoverable, invisible is not.
  const lastAllowedMs = sceneEndMs - 200;
  if (plan[n - 1].onMs > lastAllowedMs) {
    const first = plan[0].onMs;
    const spanMs = Math.max(1, plan[n - 1].onMs - first);
    const squeeze = Math.max(0, (lastAllowedMs - first) / spanMs);
    for (let k = 1; k < n; k++) {
      const shifted = first + (plan[k].onMs - first) * squeeze;
      plan[k].onMs = Math.min(plan[k].onMs, Math.max(sceneStartMs, shifted));
      // Squeezed times no longer sit on the word they were resolved from, so
      // the anchor is dropped rather than reported as a sync that held.
      plan[k].wordIndex = null;
      plan[k].anchored = false;
    }
  }

  return plan.map((p) => {
    // An emphasis hit only exists when the element's own key word comes back
    // later in the same scene — a second mention the viewer can be pointed at.
    let hitWordIndex: number | null = null;
    if (p.anchored && p.layer.text) {
      const after = nearestWordIndex(index, p.onMs + 700, from, to);
      const again = strongestSpokenToken(index, p.layer.text, Math.max(after, (p.wordIndex ?? from) + 1), to);
      if (
        again &&
        index.words[again.wordIndex].startMs > p.onMs + 700 &&
        index.words[again.wordIndex].startMs < sceneEndMs - 300
      ) {
        hitWordIndex = again.wordIndex;
      }
    }

    return { layer: p.layer, onMs: p.onMs, wordIndex: p.wordIndex, anchored: p.anchored, hitWordIndex };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage 3 — choreography
 * ──────────────────────────────────────────────────────────────────────────*/

interface Entrance {
  action: string;
  durMs: number;
  wipeFrom?: WipeDirection;
  params: Record<string, number>;
  /**
   * A second cue fired at the same instant, on channels the first one does not
   * touch. That is the only way to compose a richer move out of the existing
   * catalog without inventing a cue the renderer would have to learn.
   */
  extra?: { action: string; durMs: number; params: Record<string, number> };
}

/**
 * A sheet of paper being laid down.
 *
 * `popIn` settles the scale from slightly oversized while fading up — the way
 * something coming toward the page reads — and `tilt` rotates a couple of
 * degrees back to square. The two write to different channels (opacity+scale
 * versus rotate), so they compose instead of fighting. Alternating the lean by
 * index means a stack of images lands like dealt sheets rather than a set of
 * identical stamps.
 */
function paperEntrance(index: number): Entrance {
  const lean = index % 2 === 0 ? -1.8 : 1.8;
  return {
    action: "popIn",
    durMs: 520,
    params: { fromScale: 1.05 },
    extra: { action: "tilt", durMs: 560, params: { deg: lean } },
  };
}

/**
 * The cue an element gets, read off the element.
 *
 * Fixed table, no randomness: the same poster always animates the same way, so
 * a re-run after fixing one slide does not reshuffle the other nine. Direction
 * comes from where the element sits — something on the left edge enters from
 * the left, because that is where it came from.
 */
function chooseEntrance(layer: AutoLayer): Entrance {
  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  const area = Math.max(0.0001, layer.w * layer.h);
  const aspect = layer.w / Math.max(0.0001, layer.h);

  // Small type travels further than big type: 3% of the frame is a nudge under
  // a headline and a real move under a caption.
  const distancePct = layer.h <= 0.05 ? 3.6 : layer.h <= 0.12 ? 2.8 : 2.0;
  const base = Math.round(340 + Math.min(160, area * 900));

  if (layer.type === "text") {
    const role = layer.role;
    if (role === "title" || role === "heading") {
      // A single wide line reads best written on rather than moved in.
      if (layer.lineCount === 1 && layer.w >= 0.55) {
        return { action: "wipeIn", durMs: 520, wipeFrom: "left", params: {} };
      }
      return { action: cy < 0.18 ? "fadeInDown" : "fadeInUp", durMs: base, params: { distancePct } };
    }
    if (role === "badge" || role === "eyebrow" || role === "tag" || role === "footer-badge") {
      return { action: "popIn", durMs: 360, params: { fromScale: 0.82 } };
    }
    if (role === "footer") return { action: "fadeIn", durMs: 320, params: {} };
    return { action: cy < 0.18 ? "fadeInDown" : "fadeInUp", durMs: base, params: { distancePct } };
  }

  // The detector measured what this object is; use it before falling back to
  // geometry. A chart that wipes on, a rule that draws itself and a photograph
  // that resolves out of blur each read as deliberate — the same three objects
  // all sliding in from the left read as a template.
  switch (layer.objectType) {
    case "divider":
      // A rule draws itself along its own length.
      return {
        action: "wipeIn",
        durMs: 420,
        wipeFrom: layer.w >= layer.h ? (cx <= 0.5 ? "left" : "right") : "top",
        params: {},
      };
    case "chart":
      // Bars and columns grow from their baseline.
      return { action: "wipeIn", durMs: 620, wipeFrom: aspect >= 1 ? "left" : "bottom", params: {} };
    case "circle":
      return { action: "popIn", durMs: 420, params: { fromScale: 0.7 } };
    case "icon":
      return { action: "popIn", durMs: 340, params: { fromScale: 0.78 } };
    case "photo":
      return { action: "blurIn", durMs: 640, params: { amount: 14 } };
    case "panel":
      // A card is a surface: it arrives as one plane, from the nearest edge.
      return cx <= 0.34
        ? { action: "fadeInLeft", durMs: 460, params: { distancePct: 2.4 } }
        : cx >= 0.66
        ? { action: "fadeInRight", durMs: 460, params: { distancePct: 2.4 } }
        : { action: "fadeInUp", durMs: 460, params: { distancePct: 2.2 } };
    case "banner":
      return { action: "wipeIn", durMs: 500, wipeFrom: cx <= 0.5 ? "left" : "right", params: {} };
    case "illustration":
      return { action: "blurIn", durMs: 560, params: { amount: 10 } };
    default:
      break;
  }

  if (aspect >= 2.6) {
    return { action: "wipeIn", durMs: 460, wipeFrom: cx <= 0.5 ? "left" : "right", params: {} };
  }
  if (area <= 0.02) return { action: "popIn", durMs: 340, params: { fromScale: 0.8 } };
  if (cx <= 0.34) return { action: "fadeInLeft", durMs: base, params: { distancePct } };
  if (cx >= 0.66) return { action: "fadeInRight", durMs: base, params: { distancePct } };
  if (area >= 0.1) return { action: "blurIn", durMs: 520, params: { amount: 10 } };
  return { action: "popIn", durMs: base, params: { fromScale: 0.88 } };
}

/** Entrances that already start invisible — no `hide` needed before them. */
const SELF_HIDING = new Set([
  "fadeIn", "fadeInUp", "fadeInDown", "fadeInLeft", "fadeInRight",
  "popIn", "blurIn", "wipeIn",
]);

/* ────────────────────────────────────────────────────────────────────────────
 * The engine
 * ──────────────────────────────────────────────────────────────────────────*/

export function autoSyncTimeline(
  slides: TimelineSlideLike[],
  transcript: TranscriptWord[],
  options: AutoSyncOptions = {}
): AutoSyncResult {
  const warnings: string[] = [];
  const empty = (): AutoSyncResult => ({
    timeline: null,
    report: {
      scenes: [],
      durationMs: 0,
      totalElements: 0,
      anchoredElements: 0,
      pacedElements: 0,
      silentText: [],
      confidence: 0,
      warnings,
    },
  });

  if (slides.length === 0) {
    warnings.push("Upload and decompose your posters first — there are no slides to animate.");
    return empty();
  }
  if (transcript.length === 0) {
    warnings.push("Load the word-level transcript CSV — without it there is nothing to sync to.");
    return empty();
  }

  const tailMs = options.tailMs ?? DEFAULT_TAIL_MS;
  const kenBurnsTo = options.kenBurnsTo ?? 1.05;
  const ambient = options.ambient ?? true;
  const staggerMs = options.minStaggerMs ?? DEFAULT_STAGGER_MS;
  const bandFraction = options.bandFraction ?? 0.3;
  const textOnlySync = options.textOnlySync ?? true;
  const introCard = options.introCard ?? false;

  const index = buildTranscriptIndex(transcript);
  const audioEndMs = index.durationMs;

  if (audioEndMs < slides.length * MIN_SCENE_MS) {
    warnings.push(
      `${slides.length} slides in ${(audioEndMs / 1000).toFixed(1)}s of audio leaves under ${MIN_SCENE_MS}ms each — the scenes will be tight.`
    );
  }

  const profiles = profileSlides(slides, index, warnings);
  const { cuts, coverages } = segment(profiles, index, bandFraction, tailMs);

  /* ── How much each slide's window can be trusted ──────────────────────
     A slide is "confident" when its own printed words were found inside its
     own span. That verdict then propagates outwards: a slide with nothing
     matchable still has exact edges if the things either side of it are
     confident, and the two ends of the reel are exact by construction — the
     audio starts and stops where it starts and stops. Reporting those as
     guesses was the bug: a hook or a call-to-action rarely repeats itself
     verbatim in the narration, so the first and last slides were the most
     likely to be mislabelled and the least likely to deserve it. */
  const confident = profiles.map(
    (p, i) => coverages[i] >= TEXT_CONFIDENT_COVERAGE && p.tokenWeight >= SEGMENT_MIN_WEIGHT
  );
  const edgeOf = (i: number, side: "start" | "end"): "audio" | "anchor" | "estimate" => {
    if (side === "start") {
      if (i === 0) return "audio";
      return confident[i] || confident[i - 1] ? "anchor" : "estimate";
    }
    if (i === profiles.length - 1) return "audio";
    return confident[i] || confident[i + 1] ? "anchor" : "estimate";
  };

  const scenes: AuthoredScene[] = [];
  const sceneReports: AutoSyncSceneReport[] = [];
  const silentText: string[] = [];
  let totalElements = 0;
  let anchoredElements = 0;
  let pacedElements = 0;

  // Scene boundaries in ms, taken from the words the cuts landed on and pulled
  // back so the first entrance's lead-in lives inside its own scene.
  const boundaries: number[] = cuts.map((c, i) => {
    if (i === 0) return 0;
    if (c >= index.words.length) return Math.round(audioEndMs + tailMs);
    return Math.round(Math.max(0, index.words[c].startMs - PRE_ROLL_MS));
  });
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) boundaries[i] = boundaries[i - 1] + MIN_SCENE_MS;
  }
  boundaries[boundaries.length - 1] = Math.max(
    boundaries[boundaries.length - 1],
    Math.round(audioEndMs + tailMs)
  );

  profiles.forEach((profile, i) => {
    try {
      buildScene(profile, i);
    } catch (err) {
      // Containment. One malformed slide — a layer with a broken box, a text
      // block that upsets the matcher — must cost that slide its choreography
      // and nothing else. It still holds its span as a still frame, in the
      // right place, and every other slide is untouched.
      warnings.push(
        `Slide ${i + 1} could not be choreographed (${err instanceof Error ? err.message : "unknown error"}) — it holds as a still for its full span.`
      );
      const startMs = boundaries[i];
      const endMs = boundaries[i + 1];
      scenes.push({
        slide: i + 1,
        label: sceneLabel(profile, i),
        startMs,
        endMs,
        enter: i === 0 ? { type: "fade", durationMs: 320 } : { type: "cut", durationMs: 0 },
        exit: i === profiles.length - 1 ? { type: "fade", durationMs: 400 } : { type: "cut", durationMs: 0 },
        tracks: [],
      });
      sceneReports.push({
        slideIndex: i,
        label: sceneLabel(profile, i),
        startMs,
        endMs,
        placedBy: confident[i] ? "text" : "paced",
        edges: { start: edgeOf(i, "start"), end: edgeOf(i, "end") },
        coverage: coverages[i],
        elementCount: profile.content.length + profile.furniture.length,
        anchoredCount: 0,
        openingLine: index.words.slice(from(i), Math.min(to(i), from(i) + 7)).map((w) => w.text).join(" "),
      });
    }
  });

  function from(i: number) { return cuts[i]; }
  function to(i: number) { return cuts[i + 1]; }

  function buildScene(profile: SlideProfile, i: number) {
    const startMs = boundaries[i];
    const endMs = boundaries[i + 1];
    const from = cuts[i];
    const to = cuts[i + 1];

    // In paper mode the artwork is not scheduled at all — it belongs to the
    // slide, not to a word — so only the text goes through anchoring and
    // pacing. Everything else is laid down as the scene opens.
    const scheduledLayers = textOnlySync ? profile.content.filter((l) => l.type === "text") : profile.content;
    const paperLayers = textOnlySync ? profile.content.filter((l) => l.type !== "text") : [];

    const placements = schedule(scheduledLayers, index, from, to, startMs, endMs, staggerMs);
    const paperPlacements: Placement[] = paperLayers.map((layer, k) => ({
      layer,
      onMs: startMs + Math.min(k * PAPER_STAGGER_MS, PAPER_WINDOW_MS),
      wordIndex: null,
      anchored: false,
      hitWordIndex: null,
      paper: true,
    }));

    // Artwork first: it is the ground the words land on.
    const allPlacements = [...paperPlacements, ...placements];
    const tracks: AuthoredTrack[] = [];

    // Furniture is simply present: a quick fade at the top of the scene, out of
    // the way of the sync.
    profile.furniture.forEach((layer) => {
      totalElements++;
      pacedElements++;
      tracks.push({
        id: layer.id,
        name: layer.label,
        cues: [{ action: "fadeIn", atMs: startMs, durMs: 300 }],
      });
    });

    allPlacements.forEach((p) => {
      totalElements++;
      if (p.anchored) anchoredElements++;
      else pacedElements++;

      if (p.layer.type === "text" && p.layer.text.trim() && !p.anchored) {
        const spoken = weighPhrase(index, p.layer.text).some((w) => w.positions.length > 0);
        if (!spoken && !silentText.includes(p.layer.text)) silentText.push(p.layer.text);
      }

      const entrance = p.paper ? paperEntrance(paperLayers.indexOf(p.layer)) : chooseEntrance(p.layer);
      if (!CUE_NAMES.includes(entrance.action)) {
        warnings.push(`Unknown cue "${entrance.action}" — used fadeInUp instead.`);
        entrance.action = "fadeInUp";
      }

      // The entrance starts before the word so it has landed by the time the
      // word is heard. Never before the scene opens.
      const enterAt = Math.max(startMs, Math.round(p.onMs - LEAD_IN_MS));
      // And it must finish inside its own scene, however tight the scene is.
      const durMs = Math.max(140, Math.min(entrance.durMs, endMs - enterAt - 40));

      const cues: AuthoredCue[] = [];
      if (!SELF_HIDING.has(entrance.action)) cues.push({ action: "hide", atMs: startMs });

      // The trigger word rides along in the transcript's own spelling, so the
      // compiler can re-verify the timing against the CSV on every reload —
      // see compile.ts · snapToWord.
      const triggerWord =
        p.wordIndex !== null && normalizeToken(index.words[p.wordIndex].text)
          ? index.words[p.wordIndex].text
          : undefined;

      cues.push({
        action: entrance.action,
        atMs: enterAt,
        durMs,
        ...(triggerWord ? { word: triggerWord } : {}),
        ...entrance.params,
      });

      // The companion cue rides the same instant on a different channel.
      if (entrance.extra) {
        cues.push({
          action: entrance.extra.action,
          atMs: enterAt,
          durMs: Math.max(140, Math.min(entrance.extra.durMs, endMs - enterAt - 40)),
          ...entrance.extra.params,
        });
      }

      if (p.hitWordIndex !== null) {
        const hit = index.words[p.hitWordIndex];
        const hitWord = normalizeToken(hit.text) ? hit.text : undefined;
        cues.push({
          action: "emphasize",
          atMs: Math.round(hit.startMs),
          durMs: 360,
          amount: 1.06,
          ...(hitWord ? { word: hitWord } : {}),
        });
      }

      // A slow idle drift on the scene's largest graphic, once it has settled.
      // Only on scenes long enough to look still without it.
      if (
        ambient &&
        p.layer.type === "graphic" &&
        p.layer.w * p.layer.h >= 0.06 &&
        endMs - (enterAt + durMs) > 2600 &&
        p.hitWordIndex === null &&
        !allPlacements.some((q) => q !== p && q.layer.type === "graphic" && q.layer.w * q.layer.h > p.layer.w * p.layer.h)
      ) {
        const floatStart = enterAt + durMs + 120;
        const floatDur = Math.max(1800, endMs - floatStart - 120);
        cues.push({
          action: "float",
          atMs: Math.round(floatStart),
          durMs: Math.round(floatDur),
          amountPct: 0.55,
          cycles: Math.max(1, Math.round(floatDur / 2600)),
        });
      }

      const track: AuthoredTrack = { id: p.layer.id, name: p.layer.label, cues };
      if (entrance.wipeFrom) track.wipeFrom = entrance.wipeFrom;
      tracks.push(track);
    });

    // Ken Burns pans toward whatever the slide put on screen, and alternates
    // direction between slides so a long reel does not feel like one long push.
    const camera = buildCamera(profile.content, startMs, endMs, i, kenBurnsTo);

    // A cut is the default; a real pause in the narration earns a short
    // dissolve, because the speaker already signalled the beat.
    const gapBefore = i === 0 ? Infinity : index.gapBeforeMs[from] ?? 0;
    const enter =
      i === 0
        ? { type: "fade", durationMs: 320 }
        : gapBefore >= 350
        ? { type: "fade", durationMs: 200 }
        : { type: "cut", durationMs: 0 };

    scenes.push({
      slide: i + 1,
      label: sceneLabel(profile, i),
      startMs,
      endMs,
      enter,
      exit: i === profiles.length - 1 ? { type: "fade", durationMs: 400 } : { type: "cut", durationMs: 0 },
      camera,
      tracks,
    });

    sceneReports.push({
      slideIndex: i,
      label: sceneLabel(profile, i),
      startMs,
      endMs,
      placedBy: (() => {
        if (confident[i]) return "text" as const;
        const start = edgeOf(i, "start");
        const end = edgeOf(i, "end");
        return start !== "estimate" && end !== "estimate" ? ("bracketed" as const) : ("paced" as const);
      })(),
      edges: { start: edgeOf(i, "start"), end: edgeOf(i, "end") },
      coverage: coverages[i],
      elementCount: profile.content.length + profile.furniture.length,
      anchoredCount: allPlacements.filter((p) => p.anchored).length,
      openingLine: index.words
        .slice(from, Math.min(to, from + 7))
        .map((w) => w.text)
        .join(" "),
    });

    if (profile.droppedLayers > 0) {
      warnings.push(
        `Slide ${i + 1}: ${profile.droppedLayers} element${profile.droppedLayers === 1 ? "" : "s"} could not be read and ${
          profile.droppedLayers === 1 ? "was" : "were"
        } skipped — the rest of the slide animates normally.`
      );
    }
    if (profile.content.length === 0 && profile.droppedLayers === 0) {
      warnings.push(`Slide ${i + 1} has no decomposed elements — it holds as a still.`);
    }
  }

  if (scenes.length === 0) {
    warnings.push("No slide produced a usable scene.");
    return empty();
  }

  /* ── The intro card ───────────────────────────────────────────────────
     It takes its span from the transcript like everything else: the card runs
     until the narration first says a word printed on slide 1. Splitting slide
     1's window rather than shifting the reel keeps every later cut exactly
     where the CSV put it. */
  if (introCard) {
    const firstOwn = profiles[0].positions.find((p) => p >= cuts[0] && p < cuts[1]);
    const handoverMs =
      firstOwn !== undefined
        ? Math.max(0, index.words[firstOwn].startMs - PRE_ROLL_MS)
        : Math.min(scenes[0].endMs! - MIN_SCENE_MS, INTRO_FALLBACK_MS);

    if (handoverMs >= MIN_SCENE_MS && handoverMs <= (scenes[0].endMs ?? 0) - MIN_SCENE_MS) {
      const spoken = index.words
        .filter((w) => w.startMs < handoverMs)
        .map((w) => w.text)
        .join(" ")
        .trim();

      // Everything in slide 1's scene that was scheduled inside the card's span
      // belongs after it now — the slide is not on screen until the card lifts.
      const first = scenes[0];
      first.startMs = handoverMs;
      first.enter = { type: "fade", durationMs: 320 };
      (first.tracks ?? []).forEach((track) => {
        (track.cues ?? []).forEach((cue) => {
          if (typeof cue.atMs === "number" && cue.atMs < handoverMs) cue.atMs = handoverMs;
        });
      });

      scenes.unshift({
        slide: 1,
        intro: spoken || "…",
        label: "Intro card",
        startMs: 0,
        endMs: handoverMs,
        enter: { type: "fade", durationMs: 260 },
        exit: { type: "cut", durationMs: 0 },
        tracks: [],
      });
      sceneReports.unshift({
        slideIndex: 0,
        label: "Intro card",
        startMs: 0,
        endMs: handoverMs,
        placedBy: firstOwn !== undefined ? "bracketed" : "paced",
        edges: { start: "audio", end: firstOwn !== undefined ? "anchor" : "estimate" },
        coverage: 0,
        elementCount: 0,
        anchoredCount: 0,
        openingLine: spoken.split(/\s+/).slice(0, 7).join(" "),
      });
    } else {
      warnings.push("Not enough opening narration for an intro card — it was skipped.");
    }
  }

  const durationMs = scenes[scenes.length - 1].endMs ?? Math.round(audioEndMs + tailMs);
  const totalWindow = scenes.reduce((s, sc) => s + ((sc.endMs ?? 0) - (sc.startMs ?? 0)), 0) || 1;
  const confidence =
    sceneReports.reduce((s, r) => s + r.coverage * (r.endMs - r.startMs), 0) / totalWindow;

  if (silentText.length > 0) {
    warnings.push(
      `${silentText.length} text element${silentText.length === 1 ? "" : "s"} print words that are never spoken — they were paced instead of anchored.`
    );
  }

  return {
    timeline: {
      format: TIMELINE_FORMAT,
      version: 1,
      fps: 60,
      durationMs,
      timeBase: "absolute",
      defaults: { ease: "easeOutCubic", distancePct: 3 },
      scenes,
    } as AuthoredTimeline,
    report: {
      scenes: sceneReports,
      durationMs,
      totalElements,
      anchoredElements,
      pacedElements,
      silentText,
      confidence,
      warnings,
    },
  };
}

function sceneLabel(profile: SlideProfile, i: number): string {
  const headline = profile.content.find((l) => l.type === "text" && (l.role === "title" || l.role === "heading"));
  const text = headline?.text?.trim();
  return text ? `Slide ${i + 1} · ${text.slice(0, 32)}` : `Slide ${i + 1}`;
}

function buildCamera(
  content: AutoLayer[],
  startMs: number,
  endMs: number,
  sceneIndex: number,
  kenBurnsTo: number
): AuthoredScene["camera"] {
  if (kenBurnsTo <= 1) return undefined;

  // Area-weighted centre of everything on the slide.
  let wx = 0;
  let wy = 0;
  let mass = 0;
  content.forEach((l) => {
    const a = l.w * l.h;
    wx += (l.x + l.w / 2) * a;
    wy += (l.y + l.h / 2) * a;
    mass += a;
  });
  const cx = mass > 0 ? wx / mass : 0.5;
  const cy = mass > 0 ? wy / mass : 0.5;

  const clamp = (n: number) => Math.max(-1.5, Math.min(1.5, n));
  // Positive panX moves the view right, so pushing toward content on the left
  // means a negative pan.
  const panXPct = Number(clamp((cx - 0.5) * 3).toFixed(2));
  const panYPct = Number(clamp((cy - 0.5) * 2).toFixed(2));

  // Alternate push-in and pull-out so consecutive slides do not share a move.
  const pushIn = sceneIndex % 2 === 0;
  return {
    cues: [
      {
        action: "kenBurns",
        atMs: startMs,
        durMs: Math.max(400, endMs - startMs),
        from: pushIn ? 1 : kenBurnsTo,
        to: pushIn ? kenBurnsTo : 1,
        panXPct: pushIn ? panXPct : -panXPct,
        panYPct: pushIn ? panYPct : -panYPct,
      },
    ],
  };
}
