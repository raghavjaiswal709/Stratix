import type { MotionLayer, MotionSlide } from "./types";

/**
 * Fixing a shuffled batch.
 *
 * Every poster in this design system carries its own slide number, printed
 * top-right inside a thin ink circle (see lib/prompt-templates/design-system.ts
 * · SLIDE NUMBER). scripts/motion_segment.py decomposes that circle into its
 * own text layer with role "badge" — small text sitting on a filled shape,
 * which is exactly how a hand-drawn circle-and-numeral reads to the OCR pass.
 *
 * So a shuffled upload is fixable without asking the user anything: read each
 * slide's own badge, sort by it. The only honest failure mode is a badge OCR
 * could not read cleanly — a circled digit is small and often comes back as
 * noise (see motion_segment.py's own note: a circled "3" can OCR as "©)").
 * Those slides are never guessed at; they are left for the user to drag into
 * place themselves.
 */

/** Slide numbers this design ever prints — a bare 1-2 digit numeral, nothing else. */
const MAX_PLAUSIBLE_BADGE = 99;

function isTopRight(layer: MotionLayer): boolean {
  if (layer.positionLabel) return layer.positionLabel === "top-right";
  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  return cx > 0.62 && cy < 0.3;
}

/** The one layer on this slide that is plausibly its printed page badge. */
export function findBadgeLayer(slide: MotionSlide): MotionLayer | undefined {
  return (slide.layers || []).find(
    (l) => l.type === "text" && l.role === "badge" && !!l.text && isTopRight(l)
  );
}

/**
 * Pulls a slide number out of a badge's OCR text, or null if the text is not
 * confidently a bare number. Deliberately strict: a false "recognition" that
 * silently misplaces a slide is worse than an honest "could not read it".
 */
export function extractBadgeNumber(text: string): number | null {
  const trimmed = text.trim();
  // A page badge is a numeral and at most a stray OCR character around it
  // ("07", "(3)", "1."). Anything longer is body text that happens to
  // contain a digit, not a page badge.
  if (!trimmed || trimmed.length > 5) return null;
  const match = trimmed.match(/\d{1,2}/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return n >= 1 && n <= MAX_PLAUSIBLE_BADGE ? n : null;
}

export interface SlideOrderEntry {
  slide: MotionSlide;
  /** Position in the array as handed to analyzeSlideOrder — stable identity for drag state. */
  originalIndex: number;
  /** What the badge appears to say, before cross-checking against the rest of the batch. */
  detectedNumber: number | null;
  /** True only when detectedNumber is unique in this batch and within 1..slideCount. */
  resolved: boolean;
}

export interface SlideOrderAnalysis {
  /** One entry per slide, in the ORIGINAL upload order. */
  entries: SlideOrderEntry[];
  /** originalIndex values in the proposed corrected order — resolved slides first, by number. */
  suggestedOrder: number[];
  recognizedCount: number;
  unresolvedCount: number;
  /** True when every slide resolved and the upload was already in the right order. */
  alreadyInOrder: boolean;
}

export function analyzeSlideOrder(slides: MotionSlide[]): SlideOrderAnalysis {
  const read = slides.map((slide, originalIndex) => {
    const badge = findBadgeLayer(slide);
    const raw = badge?.text ? extractBadgeNumber(badge.text) : null;
    const detectedNumber = raw !== null && raw <= slides.length ? raw : null;
    return { slide, originalIndex, detectedNumber };
  });

  // Two slides cannot both be "3" — when a number collides, neither claim is
  // trustworthy, so a single bad OCR read can never bump a genuinely correct
  // slide out of its place.
  const counts = new Map<number, number>();
  read.forEach(({ detectedNumber }) => {
    if (detectedNumber !== null) counts.set(detectedNumber, (counts.get(detectedNumber) ?? 0) + 1);
  });

  const entries: SlideOrderEntry[] = read.map((e) => ({
    ...e,
    resolved: e.detectedNumber !== null && counts.get(e.detectedNumber) === 1,
  }));

  const resolved = entries
    .filter((e) => e.resolved)
    .sort((a, b) => (a.detectedNumber as number) - (b.detectedNumber as number));
  const unresolved = entries.filter((e) => !e.resolved);

  // Unresolved slides keep their original relative order and land at the end
  // — a predictable, visible parking spot rather than a guessed position.
  const suggestedOrder = [...resolved, ...unresolved].map((e) => e.originalIndex);

  return {
    entries,
    suggestedOrder,
    recognizedCount: resolved.length,
    unresolvedCount: unresolved.length,
    alreadyInOrder: unresolved.length === 0 && suggestedOrder.every((idx, pos) => idx === pos),
  };
}

/** Moves the item at `from` to sit at `to`, shifting the rest — plain array splice. */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
