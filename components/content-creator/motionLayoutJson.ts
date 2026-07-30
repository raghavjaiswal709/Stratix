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
