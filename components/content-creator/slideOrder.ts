import type { MotionLayer, MotionSlide } from "./types";
import { tokenize, tokensMatch } from "@/lib/motion-timeline/text-match";

/**
 * Fixing a shuffled batch.
 *
 * Every poster in this design system carries its own slide number, printed
 * top-right (or top-left/center) inside an ink circle or header badge.
 * scripts/motion_segment.py decomposes that element into a text layer.
 */

/** Slide numbers this design ever prints — 1 to 99. */
const MAX_PLAUSIBLE_BADGE = 99;

function normalizeOcrDigits(str: string): string {
  return str
    .replace(/[oOqQ]/g, "0")
    .replace(/[iIl!|]/g, "1")
    .replace(/[zZ]/g, "2")
    .replace(/[sS]/g, "5")
    .replace(/[bB]/g, "8");
}

/**
 * Robustly pulls a slide number out of OCR text.
 * Handles: "1", "01", "(3)", "SLIDE 02", "PART 4", "PAGE 5", "STEP 1", "3/10", "3 of 10",
 * circled digits ①..⑳, and common OCR letter/digit substitutions (O->0, l->1, Z->2).
 */
export function extractBadgeNumber(text: string): number | null {
  if (!text || typeof text !== "string") return null;
  const raw = text.trim();
  if (!raw) return null;

  // 1. Check unicode circled digits (①..⑳, ❶..❿)
  const circledMap: Record<string, number> = {
    "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
    "⑪": 11, "⑫": 12, "⑬": 13, "⑭": 14, "⑮": 15, "⑯": 16, "⑰": 17, "⑱": 18, "⑲": 19, "⑳": 20,
    "❶": 1, "❷": 2, "❸": 3, "❹": 4, "❺": 5, "❻": 6, "❼": 7, "❽": 8, "❾": 9, "❿": 10,
  };
  for (const [char, val] of Object.entries(circledMap)) {
    if (raw.includes(char)) return val;
  }

  const clean = raw.toLowerCase();

  // 2. Labeled patterns: "SLIDE 03", "PART 2", "PAGE 4", "STEP 1", "STAGE 5", "#6", "NO. 7"
  const labeledMatch = clean.match(/(?:slide|part|page|step|stage|no|num|\#)\s*[\:\.\-\#]?\s*([0-9oqi|lsbzg]{1,3})/i);
  if (labeledMatch) {
    const numStr = normalizeOcrDigits(labeledMatch[1]);
    const parsed = parseInt(numStr, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= MAX_PLAUSIBLE_BADGE) return parsed;
  }

  // 3. Fraction pattern: "3/10", "03 of 10"
  const fracMatch = clean.match(/^([0-9oqi|lsbzg]{1,2})\s*(?:\/|of)\s*\d{1,2}/i);
  if (fracMatch) {
    const numStr = normalizeOcrDigits(fracMatch[1]);
    const parsed = parseInt(numStr, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= MAX_PLAUSIBLE_BADGE) return parsed;
  }

  // 4. Isolated numeral e.g. "(03)", "[3]", "3.", "03-", "03"
  const isolatedMatch = clean.match(/(?:^|[\(\[\{\s])([0-9oqi|lsbzg]{1,2})(?:[\)\]\}\.\-\s,;:]|$)/i);
  if (isolatedMatch) {
    const numStr = normalizeOcrDigits(isolatedMatch[1]);
    const parsed = parseInt(numStr, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= MAX_PLAUSIBLE_BADGE) return parsed;
  }

  // 5. Fallback: any 1-2 digit sequence in text
  const fallbackDigits = raw.match(/\d{1,2}/);
  if (fallbackDigits) {
    const parsed = parseInt(fallbackDigits[0], 10);
    if (parsed >= 1 && parsed <= MAX_PLAUSIBLE_BADGE) return parsed;
  }

  return null;
}

/** Extracts slide number from filename like "slide_03.png", "poster-4.jpg", "02.png" */
export function extractBadgeNumberFromFileName(fileName?: string): number | null {
  if (!fileName || typeof fileName !== "string") return null;
  const clean = fileName.replace(/\.[^.]+$/, "");
  const match = clean.match(/(?:slide|poster|frame|img|image)?[\s_\-\.]*(\d{1,2})/i);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= MAX_PLAUSIBLE_BADGE) return n;
  }
  return null;
}

/** Multi-priority finder for slide badge text */
export function findBadgeLayer(slide: MotionSlide): { layer?: MotionLayer; text?: string } | undefined {
  const layers = slide.layers || [];

  // Priority 1: layer with role === "badge"
  const badgeLayer = layers.find((l) => l.type === "text" && l.role === "badge" && !!l.text);
  if (badgeLayer) return { layer: badgeLayer, text: badgeLayer.text };

  // Priority 2: text layer in top region (cy < 0.40 or y < 0.35)
  const topTextLayer = layers.find((l) => {
    if (l.type !== "text" || !l.text) return false;
    const cy = l.y + (l.h || 0) / 2;
    const isTop = (l.positionLabel && l.positionLabel.startsWith("top")) || cy < 0.40 || l.y < 0.35;
    return isTop && extractBadgeNumber(l.text) !== null;
  });
  if (topTextLayer) return { layer: topTextLayer, text: topTextLayer.text };

  // Priority 3: ANY text layer matching badge keywords / numbers
  const anyTextLayer = layers.find((l) => {
    if (l.type !== "text" || !l.text) return false;
    return extractBadgeNumber(l.text) !== null;
  });
  if (anyTextLayer) return { layer: anyTextLayer, text: anyTextLayer.text };

  // Priority 4: full text blocks
  if (slide.text?.blocks && Array.isArray(slide.text.blocks)) {
    for (const b of slide.text.blocks) {
      if (b.text && extractBadgeNumber(b.text) !== null) {
        return { text: b.text };
      }
    }
  }
  if (slide.text?.fullText && extractBadgeNumber(slide.text.fullText) !== null) {
    return { text: slide.text.fullText };
  }

  // Priority 5: filename
  if (slide.fileName) {
    const fileNum = extractBadgeNumberFromFileName(slide.fileName);
    if (fileNum !== null) {
      return { text: `File: ${fileNum}` };
    }
  }

  return undefined;
}

export interface SlideOrderEntry {
  slide: MotionSlide;
  /** Position in the array as handed to analyzeSlideOrder — stable identity for drag state. */
  originalIndex: number;
  /** What the badge appears to say, before cross-checking against the rest of the batch. */
  detectedNumber: number | null;
  /** Badge text string that yielded detectedNumber */
  badgeText?: string;
  /** Target slot index (0-based) for this slide if resolved */
  targetSlot: number | null;
  /** True only when detectedNumber is unique in this batch and within 1..slideCount. */
  resolved: boolean;
}

export interface SlideOrderAnalysis {
  /** One entry per slide, in the ORIGINAL upload order. */
  entries: SlideOrderEntry[];
  /** originalIndex values in the proposed corrected order — resolved slides locked to their slot. */
  suggestedOrder: number[];
  recognizedCount: number;
  unresolvedCount: number;
  /** True when every slide resolved and the upload was already in the right order. */
  alreadyInOrder: boolean;
}

export function analyzeSlideOrder(slides: MotionSlide[]): SlideOrderAnalysis {
  const read = slides.map((slide, originalIndex) => {
    const badgeRes = findBadgeLayer(slide);
    let detectedNumber: number | null = null;
    if (badgeRes?.text) {
      detectedNumber = extractBadgeNumber(badgeRes.text);
    }
    if (detectedNumber === null && slide.fileName) {
      detectedNumber = extractBadgeNumberFromFileName(slide.fileName);
    }
    if (detectedNumber !== null && (detectedNumber < 1 || detectedNumber > Math.max(slides.length, 99))) {
      detectedNumber = null;
    }
    return { slide, originalIndex, detectedNumber, badgeText: badgeRes?.text };
  });

  const N = slides.length;
  // Count frequency of detected numbers in range 1..N
  const counts = new Map<number, number>();
  read.forEach(({ detectedNumber }) => {
    if (detectedNumber !== null && detectedNumber >= 1 && detectedNumber <= N) {
      counts.set(detectedNumber, (counts.get(detectedNumber) ?? 0) + 1);
    }
  });

  const entries: SlideOrderEntry[] = read.map((e) => {
    const isUniqueValid = e.detectedNumber !== null &&
      e.detectedNumber >= 1 &&
      e.detectedNumber <= N &&
      counts.get(e.detectedNumber) === 1;
    return {
      ...e,
      resolved: isUniqueValid,
      targetSlot: isUniqueValid ? (e.detectedNumber as number) - 1 : null,
    };
  });

  // Build suggested order:
  // Resolved slides land at index (detectedNumber - 1)
  const suggestedOrder: number[] = new Array(N).fill(-1);
  const unresolvedEntries: SlideOrderEntry[] = [];

  entries.forEach((entry) => {
    if (entry.resolved && entry.targetSlot !== null && entry.targetSlot >= 0 && entry.targetSlot < N) {
      suggestedOrder[entry.targetSlot] = entry.originalIndex;
    } else {
      unresolvedEntries.push(entry);
    }
  });

  // Fill unassigned slots with unresolved slides in original relative order
  let unresIdx = 0;
  for (let slot = 0; slot < N; slot++) {
    if (suggestedOrder[slot] === -1) {
      if (unresIdx < unresolvedEntries.length) {
        suggestedOrder[slot] = unresolvedEntries[unresIdx].originalIndex;
        unresIdx++;
      }
    }
  }

  const recognizedCount = entries.filter((e) => e.resolved).length;
  const unresolvedCount = N - recognizedCount;
  const alreadyInOrder = unresolvedCount === 0 && suggestedOrder.every((idx, pos) => idx === pos);

  return {
    entries,
    suggestedOrder,
    recognizedCount,
    unresolvedCount,
    alreadyInOrder,
  };
}

/** Swaps items at `from` and `to` 1-to-1 without shifting any other items. */
export function swapItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const temp = next[from];
  next[from] = next[to];
  next[to] = temp;
  return next;
}

/** Plain splice move. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Matching slides to the script, part by part.
 *
 * Independent of — and tried before — the badge-number path above. A collage
 * slide (see motion_segment.py's collage layout detection) carries no printed
 * slide number to read: the corner-badge rescan is skipped outright for a
 * collage-mode slide, since a badge baked into a part's own pixels is never
 * pulled out as its own layer. What it does carry is the beat's caption,
 * split verbatim across its collage-part layers in reading order.
 *
 * The reference is `ScriptSegment[]` — one entry per spoken part, in order
 * (see scriptSegments.ts). That inversion is the point: the SCRIPT decides
 * how many slides there should be, so a part with no image is a first-class,
 * reportable result rather than something that silently disappears because
 * the batch happened to be short. Matching is therefore an assignment
 * problem over a known grid, not a search for an unknown quote in a blob.
 * ────────────────────────────────────────────────────────────────────────*/

/** A slide's own full caption, in reading order — collage parts joined by partIndex, or the plain OCR'd text for a non-collage slide. */
export function slideCaption(slide: MotionSlide): string {
  const parts = (slide.layers || [])
    .filter((l) => l.objectType === "collage-part" && typeof l.partIndex === "number")
    .sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0))
    .map((l) => (l.text || "").trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return (slide.text?.fullText || "").trim();
}

/**
 * Inverse document frequency over the script's own parts.
 *
 * This is what makes Hinglish captions matchable at all. A plain token-overlap
 * score is dominated by the words every single part contains — "hai", "ka",
 * "mein", "koi", "yeh" — so two completely different parts score nearly the
 * same against any caption, and the assignment becomes a coin flip. Weighting
 * each token by how rare it is across the parts means "rupaya" and "dollar"
 * decide the match and the filler contributes almost nothing, without anyone
 * having to write down a stopword list for a language mix that has none.
 */
function buildSegmentIdf(segmentTokens: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  segmentTokens.forEach((tokens) => {
    new Set(tokens).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
  });
  const n = Math.max(1, segmentTokens.length);
  const idf = new Map<string, number>();
  df.forEach((count, token) => {
    // +1 smoothing keeps a token present in every part at a small positive
    // weight rather than exactly zero — it should barely count, not be unable
    // to break a tie between two otherwise identical candidates.
    const raw = Math.log((n + 1) / (count + 0.5));
    const lengthFactor = token.length >= 4 ? 1 : token.length === 3 ? 0.7 : 0.35;
    idf.set(token, Math.max(0.05, raw) * lengthFactor);
  });
  return idf;
}

/** Length of the longest common subsequence of two token lists. */
function lcsLength(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] || tokensMatch(a[i - 1], b[j - 1])
        ? prev[j - 1] + 1
        : Math.max(prev[j], cur[j - 1]);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
    cur.fill(0);
  }
  return prev[b.length];
}

/** Resolves one caption token against a segment's vocabulary, exactly or fuzzily. */
function findToken(token: string, segSet: Set<string>): string | null {
  if (segSet.has(token)) return token;
  for (const st of segSet) if (tokensMatch(token, st)) return st;
  return null;
}

/**
 * How well one caption agrees with one script part, 0–1.
 *
 * Two independent readings, combined:
 *   • an IDF-weighted F1 — what share of the part's meaningful words the
 *     caption carries, AND what share of the caption's the part accounts
 *     for. Symmetric on purpose: recall alone lets a long caption match every
 *     short part, precision alone lets a two-word caption match anything.
 *   • the longest common subsequence, which is the only term that reads word
 *     ORDER. Two parts built from the same vocabulary in a different order
 *     ("dollar mehenga", "mehenga dollar") are indistinguishable to any bag
 *     of words, and this separates them.
 */
function scoreCaptionAgainstSegment(
  captionTokens: string[],
  segmentTokens: string[],
  idf: Map<string, number>
): number {
  if (captionTokens.length === 0 || segmentTokens.length === 0) return 0;

  const segSet = new Set(segmentTokens);
  const capSet = new Set(captionTokens);
  /**
   * A token the script never says anywhere carries no information about WHICH
   * part this image belongs to, so it is worth almost nothing — it is the
   * handle, the watermark, the page number, the "Swipe →" cue, the OCR debris.
   * Pricing those like real words (the obvious `?? 1`) makes every slide look
   * like a poor match for its own part, because a poster is mostly furniture
   * by token count and none of it is in the script.
   */
  const weightOf = (t: string) => idf.get(t) ?? 0.03;

  let matchedCaptionWeight = 0;
  let captionWeight = 0;
  capSet.forEach((t) => {
    const w = weightOf(t);
    captionWeight += w;
    if (findToken(t, segSet)) matchedCaptionWeight += w;
  });

  let matchedSegmentWeight = 0;
  let segmentWeight = 0;
  segSet.forEach((t) => {
    const w = weightOf(t);
    segmentWeight += w;
    if (findToken(t, capSet)) matchedSegmentWeight += w;
  });

  const precision = captionWeight > 0 ? matchedCaptionWeight / captionWeight : 0;
  const recall = segmentWeight > 0 ? matchedSegmentWeight / segmentWeight : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const lcs = lcsLength(captionTokens, segmentTokens) / Math.max(1, Math.min(captionTokens.length, segmentTokens.length));

  return 0.72 * f1 + 0.28 * Math.min(1, lcs);
}

/**
 * Hungarian (Kuhn–Munkres) optimal assignment on a square cost matrix.
 *
 * Greedy "claim the strongest pair first" is wrong here in a way that shows
 * up constantly on real decks: two adjacent parts of one sentence share most
 * of their vocabulary, so the slide that fits BOTH slightly better steals the
 * one its neighbour needed, and the neighbour is then reported missing while
 * a perfectly good image sits in the wrong slot. Optimising the whole
 * assignment at once is what makes the result stable — and at these sizes
 * (tens of slides) the cubic cost is irrelevant.
 *
 * Returns, per row, the column it was assigned.
 */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const INF = Infinity;
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1); // p[j] = row matched to column j (1-based)
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(INF);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/** Confidence bands. Below WEAK a pair is not a match at all. */
const SCORE_CONFIDENT = 0.55;
const SCORE_WEAK = 0.3;

export type SlotStatus = "matched" | "weak" | "missing";

export interface ScriptSlot {
  segmentIndex: number;
  /** The spoken part this slot stands for — always shown, matched or not. */
  text: string;
  /** slideId of the image covering this part, or null when nothing does. */
  slideId: string | null;
  score: number;
  status: SlotStatus;
  /** True when the user placed this by hand rather than the matcher. */
  manual: boolean;
}

export interface SlideOrderPlan {
  slots: ScriptSlot[];
  /** slideIds that matched no part — spare images, kept rather than dropped. */
  extras: string[];
  matchedCount: number;
  weakCount: number;
  missingCount: number;
}

export interface PlanOptions {
  /** segmentIndex → slideId, pinned by the user; never overruled by the matcher. */
  overrides?: Record<number, string>;
  /** slideIds the user pulled out of a slot — kept out until they place them again. */
  excluded?: Set<string>;
}

/**
 * Assigns every slide to the script part it covers, and reports the parts
 * nothing covers.
 *
 * Manual placements are honoured first and removed from the problem, so the
 * matcher only ever competes for what is still unclaimed — dragging one
 * image into place can therefore never dislodge another.
 */
export function buildSlideOrderPlan(
  slides: MotionSlide[],
  segments: { text: string }[],
  options: PlanOptions = {}
): SlideOrderPlan {
  const overrides = options.overrides ?? {};
  const excluded = options.excluded ?? new Set<string>();

  const slotOf = new Map<number, { slideId: string; score: number; manual: boolean }>();
  const claimed = new Set<string>();

  Object.entries(overrides).forEach(([segIdx, slideId]) => {
    const segmentIndex = Number(segIdx);
    if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segments.length) return;
    if (!slides.some((s) => s.slideId === slideId)) return;
    slotOf.set(segmentIndex, { slideId, score: 1, manual: true });
    claimed.add(slideId);
  });

  const freeSlides = slides.filter((s) => !claimed.has(s.slideId) && !excluded.has(s.slideId));
  const freeSegments = segments
    .map((s, i) => ({ ...s, index: i }))
    .filter((s) => !slotOf.has(s.index));

  if (freeSlides.length > 0 && freeSegments.length > 0) {
    const segmentTokens = segments.map((s) => tokenize(s.text));
    const idf = buildSegmentIdf(segmentTokens);
    const captionTokens = new Map(freeSlides.map((s) => [s.slideId, tokenize(slideCaption(s))]));

    const scores = freeSlides.map((slide) =>
      freeSegments.map((seg) =>
        scoreCaptionAgainstSegment(captionTokens.get(slide.slideId) ?? [], segmentTokens[seg.index], idf)
      )
    );

    // Square the matrix so Hungarian can run: padded cells cost the maximum,
    // so a row landing on one simply means "this slide matched nothing".
    const size = Math.max(freeSlides.length, freeSegments.length);
    const cost: number[][] = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) =>
        r < freeSlides.length && c < freeSegments.length ? 1 - scores[r][c] : 1
      )
    );

    hungarian(cost).forEach((col, row) => {
      if (row >= freeSlides.length || col < 0 || col >= freeSegments.length) return;
      const score = scores[row][col];
      if (score < SCORE_WEAK) return; // not a match — leave the part missing
      slotOf.set(freeSegments[col].index, {
        slideId: freeSlides[row].slideId,
        score,
        manual: false,
      });
      claimed.add(freeSlides[row].slideId);
    });
  }

  const slots: ScriptSlot[] = segments.map((seg, segmentIndex) => {
    const hit = slotOf.get(segmentIndex);
    if (!hit) {
      return { segmentIndex, text: seg.text, slideId: null, score: 0, status: "missing" as const, manual: false };
    }
    return {
      segmentIndex,
      text: seg.text,
      slideId: hit.slideId,
      score: hit.score,
      status: hit.manual || hit.score >= SCORE_CONFIDENT ? ("matched" as const) : ("weak" as const),
      manual: hit.manual,
    };
  });

  return {
    slots,
    extras: slides.filter((s) => !claimed.has(s.slideId)).map((s) => s.slideId),
    matchedCount: slots.filter((s) => s.status === "matched").length,
    weakCount: slots.filter((s) => s.status === "weak").length,
    missingCount: slots.filter((s) => s.status === "missing").length,
  };
}

/** The slides a plan implies, in script order, with unmatched extras kept at the end. */
export function planToSlides(plan: SlideOrderPlan, slides: MotionSlide[]): MotionSlide[] {
  const byId = new Map(slides.map((s) => [s.slideId, s]));
  const ordered: MotionSlide[] = [];
  plan.slots.forEach((slot) => {
    const slide = slot.slideId ? byId.get(slot.slideId) : undefined;
    if (slide) ordered.push(slide);
  });
  plan.extras.forEach((id) => {
    const slide = byId.get(id);
    if (slide) ordered.push(slide);
  });
  return ordered;
}

export interface ScriptOrderMatch {
  /** originalIndex values in the order the script implies. */
  order: number[];
  resolvedCount: number;
  missingCount: number;
}

/**
 * The silent auto-reorder used right after an upload.
 *
 * Deliberately strict: it applies without asking, so it only reports an order
 * when every uploaded slide found a part of its own. A partial match is still
 * useful information, but it belongs in the Fix Order modal where the user
 * can see which parts are missing — not applied behind their back.
 */
export function matchSlideOrderToScript(
  slides: MotionSlide[],
  segments: { text: string }[]
): ScriptOrderMatch | null {
  if (slides.length === 0 || segments.length === 0) return null;

  const plan = buildSlideOrderPlan(slides, segments);
  if (plan.extras.length > 0) return null;

  const indexById = new Map(slides.map((s, i) => [s.slideId, i]));
  const order: number[] = [];
  plan.slots.forEach((slot) => {
    if (!slot.slideId) return;
    const idx = indexById.get(slot.slideId);
    if (idx !== undefined) order.push(idx);
  });
  if (order.length !== slides.length) return null;

  return { order, resolvedCount: order.length, missingCount: plan.missingCount };
}
