import type { MotionLayer, MotionSlide, MotionVideoData } from "./types";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Describe one decomposed element so the JSON stands on its own: what the
 * element *is* (its literal text), where it sits, how big the type is and what
 * colour it uses. Reading `elements[3].text === "Exploiting Market Structure"`
 * next to its box is the whole point — coordinates with no content attached
 * tell you nothing about which part of the poster they belong to.
 */
function describeElement(l: MotionLayer, canvasW: number, canvasH: number) {
  const base = {
    id: l.id,
    name: l.name,
    type: l.type ?? "graphic",
    role: l.role ?? null,
    zIndex: l.zIndex ?? null,
    position: l.positionLabel ?? null,
    normalizedPosition: { x: r3(l.x), y: r3(l.y), width: r3(l.w), height: r3(l.h) },
    pixelBounds: l.pixelBounds ?? {
      left: Math.round(l.x * canvasW),
      top: Math.round(l.y * canvasH),
      width: Math.round(l.w * canvasW),
      height: Math.round(l.h * canvasH),
    },
    motionSettings: {
      type: l.motionType,
      speed: l.motionSpeed,
      distance: l.motionDistance,
    },
  };

  if (l.type !== "text") {
    return { ...base, transparentBackground: l.hasAlpha ?? null, dominantColor: l.color ?? null };
  }

  return {
    ...base,
    text: l.text ?? "",
    textLines: l.textLines ?? [],
    style: {
      fontSizePx: l.fontSizePx ?? null,
      fontSizeRelativeToHeight: l.fontSizeRel ?? null,
      color: l.color ?? null,
      backgroundColor: l.backgroundColor ?? null,
      hasOwnBackground: l.hasBackground ?? false,
      textAlign: l.textAlign ?? null,
      isUppercase: l.isUppercase ?? null,
      lineCount: l.lineCount ?? null,
      wordCount: l.wordCount ?? null,
    },
    ocrConfidence: l.ocrConfidence ?? null,
    lines: (l.lines ?? []).map((line) => ({
      text: line.text,
      normalizedPosition: { x: r3(line.x), y: r3(line.y), width: r3(line.w), height: r3(line.h) },
      pixelBounds: line.pixelBounds,
      fontSizePx: line.fontSizePx,
    })),
  };
}

export function describeMotionSlide(slide: MotionVideoData, index: number) {
  const canvasW = slide.width ?? 0;
  const canvasH = slide.height ?? 0;
  const layers = slide.layers ?? [];

  return {
    slide: index + 1,
    fileName: slide.fileName ?? null,
    canvas: {
      width: canvasW,
      height: canvasH,
      sourceWidth: slide.sourceWidth ?? canvasW,
      sourceHeight: slide.sourceHeight ?? canvasH,
      aspectRatio: canvasH ? r3(canvasW / canvasH) : null,
    },
    extraction: slide.meta ?? null,
    totalElements: layers.length,
    textElements: layers.filter((l) => l.type === "text").length,
    graphicElements: layers.filter((l) => l.type !== "text").length,
    fullText: slide.text?.fullText ?? "",
    textBlocks: slide.text?.blocks ?? [],
    elements: layers.map((l) => describeElement(l, canvasW, canvasH)),
  };
}

/** The copyable layout JSON for a whole batch. */
export function buildMotionLayoutJson(slides: MotionVideoData[]) {
  return {
    version: 2,
    slideCount: slides.length,
    slides: slides.map(describeMotionSlide),
  };
}

export type MotionLayoutJson = ReturnType<typeof buildMotionLayoutJson>;
export type { MotionSlide };

/* ──────────────────────────────────────────────────────────────────────────
 * Lean layout — what actually goes to an AI
 *
 * The full layout above exists for humans and for round-tripping; pasted into
 * a chat it is ~11.8k characters per slide, and a 10-slide batch runs to
 * ~38k tokens before the prompt or the transcript is added. Most of that
 * weight cannot change any animation decision:
 *
 *   textBlocks[]  — a verbatim duplicate of the text already in elements[]
 *   lines[]       — per-line boxes; a track animates whole elements only
 *   pixelBounds   — normalizedPosition × canvas, and both are present
 *   motionSettings— the loop-preview settings, which a timeline overrides
 *   extraction, ocrConfidence, fontSizeRelativeToHeight, sourceWidth/Height
 *
 * Dropping those and printing compact leaves the same decisions available on
 * roughly a fifth of the tokens.
 * ────────────────────────────────────────────────────────────────────────*/

const r2 = (n: number) => Math.round(n * 100) / 100;

function leanElement(l: MotionLayer) {
  const box = [r2(l.x), r2(l.y), r2(l.w), r2(l.h)];
  if (l.type === "text") {
    return {
      id: l.id,
      kind: "text",
      role: l.role ?? null,
      at: l.positionLabel ?? null,
      box,
      text: l.text ?? "",
    };
  }
  return {
    id: l.id,
    kind: "graphic",
    role: l.role ?? null,
    at: l.positionLabel ?? null,
    box,
  };
}

/**
 * The slide list an AI needs to bind a sync manifest to real layer ids.
 * `box` is [x, y, w, h] normalised 0–1; `at` is the same nine-cell grid the
 * manifest uses, which is what makes a graphic bindable at all.
 */
export function buildLeanMotionLayout(slides: MotionVideoData[]) {
  return {
    version: 3,
    note: "box = [x,y,w,h] normalised 0-1. at = 9-cell grid. Graphics carry no text by nature — bind them by kind, at and box.",
    slides: slides.map((slide, i) => ({
      slide: i + 1,
      canvas: [slide.width ?? 0, slide.height ?? 0],
      elements: (slide.layers ?? []).map(leanElement),
    })),
  };
}
