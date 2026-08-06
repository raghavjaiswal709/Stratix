import type { MotionLayer, MotionSlide } from "./types";

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
