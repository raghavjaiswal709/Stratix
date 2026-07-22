import type { PosterColors, PosterConfig, PosterElement, AspectRatio, CreatorMode } from "../types";
import { GRADIENT_PRESETS } from "../constants";
import type { GradientPreset } from "../constants";
import type { SentimentScheme, EditorialTheme } from "./canvasUtils";
import { drawOutroCard, drawBentoExplainerCard } from "./drawOutroAndBento";
import { drawBoldPoster } from "./drawBoldPoster";
import { drawTradingNewsPoster } from "./drawTradingNewsPoster";
import { drawEducationalCard } from "./drawEducationalCard";
import { drawChaseStylePoster } from "./drawChaseStylePoster";


export function drawPoster(
  canvas: HTMLCanvasElement,
  data: any,
  ar: AspectRatio,
  colors: PosterColors,
  config: PosterConfig,
  img: HTMLImageElement | null | undefined,
  mode: CreatorMode = "analysis",
  activeNewsIndex: number = 0,
  totalNewsCount: number = 1,
  posterStyle: "editorial" | "bold" = "editorial",
  gradient: GradientPreset = GRADIENT_PRESETS[0],
  editorialTheme: EditorialTheme = "light",
  fadeIntensity: number = 100,
  sentimentScheme: SentimentScheme = "emerald"
): PosterElement[] {
  const W = ar.w, H = ar.h;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const S = Math.min(W, H) / 720;
  const land = ar.id === "landscape";

  const r = (n: number) => Math.round(n * S);
  const font = {
    label: (sz = 9,  bold = false) => `${bold ? "bold " : ""}${r(sz * config.fontScale)}px "Inter", system-ui, -apple-system, sans-serif`,
    body:  (sz = 12, bold = false) => `${bold ? "bold " : ""}${r(sz * config.fontScale)}px "Impact", "Arial Black", sans-serif`,
    serif: (sz = 16, bold = false) => `${bold ? "bold " : ""}${r(sz * config.fontScale)}px "Inter", system-ui, -apple-system, sans-serif`,
  };

  const PAD = r(24);
  const GUT = r(24);
  const CX = PAD + GUT, CXR = W - PAD - GUT, CW = CXR - CX;

  // Outro is a batch-level card kind, not a creator mode — check it first so
  // News/Facts/Learnings all close on the exact same brand sign-off.
  if (data?.isOutro) {
    return drawOutroCard(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, posterStyle === "bold" ? gradient : undefined);
  }

  // Same idea as isOutro — a bento explainer is a card kind, not a style, so
  // it always renders in its own plain-language grid regardless of whether
  // the batch is Editorial or Bold.
  if (data?.isBento) {
    return drawBentoExplainerCard(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, posterStyle === "bold" ? gradient : undefined, sentimentScheme);
  }

  if (mode === "news") {
    return posterStyle === "bold"
      ? drawBoldPoster(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, "news", gradient, fadeIntensity, sentimentScheme)
      : drawTradingNewsPoster(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, editorialTheme, fadeIntensity, sentimentScheme);
  }

  if (mode === "facts" || mode === "learnings") {
    return posterStyle === "bold"
      ? drawBoldPoster(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, mode, gradient, fadeIntensity, sentimentScheme)
      : drawEducationalCard(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, mode, editorialTheme, fadeIntensity);
  }

  return drawChaseStylePoster(
    ctx,
    data,
    img,
    W,
    H,
    S,
    PAD,
    CX,
    CXR,
    CW,
    GUT,
    r,
    font,
    colors,
    config,
    mode,
    activeNewsIndex,
    totalNewsCount,
    land
  );
}
