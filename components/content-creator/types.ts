

export interface Metric  { label: string; value: string; }
export interface Section { label: string; content: string; }

export interface PosterData {
  category?: string;
  title?: string;
  subtitle?: string;
  index?: string;
  description?: string;
  sections?: Section[];
  metrics?: Metric[];
  formula?: string;
  tags?: string[];
  imageUrl?: string;
  footer?: string;
  date?: string;
}

export interface AnalysisData {
  category?: string;
  instrument: string;
  levelName: string;
  timeframe: string;
  session?: string;
  description: string;
  whatToDo?: string;
  keyLevels?: string;
  imageUrl?: string;
  layout?: "standard" | "split" | "banner";
  footer?: string;
  date?: string;
}

export interface NewsItem {
  title: string;
  description: string;
  imageUrl?: string;
  source?: string;
  date?: string;
  impact?: "High" | "Medium" | "Low";
  sentiment?: "Bullish" | "Bearish" | "Neutral";
  affectedAssets?: string;
  keyTakeaway?: string;
  /** Ready-to-paste Grok Imagine prompt for this poster's background image. */
  imagePrompt?: string;
  /** Exact substring of `title` the poster highlights with a colored chip. */
  highlightPhrase?: string;
  /** Exact substrings of `description` to bold+color-highlight — the trader-relevant numbers/entities. */
  descriptionHighlights?: string[];
  /** Per-instrument direction for this story — rendered as colored chips (e.g. "▲ XAUUSD" in emerald). */
  instrumentImpacts?: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral" }[];
  /** Horizontal focal point within the cover-fit image, 0 (left) - 1 (right), default 0.5 (centered). */
  imageFocusX?: number;
  /** Vertical focal point within the cover-fit image, 0 (top) - 1 (bottom), default 0.5 (centered). */
  imageFocusY?: number;
  /** Zoom multiplier on top of the cover-fit baseline, 1 (no zoom) - 2.5, default 1. */
  imageZoom?: number;
  /** Which of the 5 market-driver categories this story belongs to (Macro/Geopolitical/Corporate/Sentiment/Systemic) — used by the poster selection UI, not rendered on the poster itself. */
  category?: "Macro" | "Geopolitical" | "Corporate" | "Sentiment" | "Systemic";
  /** True only for the batch's slide #1 — the "last 24h" briefing cover. */
  isCover?: boolean;
  topAssets?: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral" }[];
  bulletHeadlines?: string[];
  /** True only for the batch's final slide — the calm brand sign-off. */
  isOutro?: boolean;
  /** Outro-only: the single rotating action phrase (e.g. "Follow for daily market briefings"). */
  cta?: string;
  /** Facts cards only: internal-use verification note, not rendered on the poster. */
  sourceNote?: string;
  /** Learnings batches only: the single concept the whole batch teaches, e.g. "Fair Value Gap (FVG)". */
  concept?: string;
  /** Learnings batches only: progress label for a slide, e.g. "Step 2 of 6". */
  stepLabel?: string;
  /** True only for a synthesized "explain it simply" companion card, inserted right after its parent story. */
  isBento?: boolean;
  /** Bento card: the story's headline in the title of the story this card explains (for continuity/context). */
  relatedTitle?: string;
  /** Bento card: kid-simple headline. */
  simpleHeadline?: string;
  /** Bento card: exact substring of simpleHeadline to highlight. */
  simpleHeadlineHighlight?: string;
  /** Bento card: plain-language "what happened". */
  whatHappened?: string;
  /** Bento card: plain-language "why it matters". */
  whyItMatters?: string;
  /** Bento card: plain-language per-market effect chips. */
  simpleImpacts?: { market: string; effect: string; direction: "up" | "down" | "neutral" }[];
  /** Instagram-ready caption for this story (or, on the cover, the whole carousel) — distinct voice from the on-poster "description". Not rendered on the poster itself. */
  caption?: string;
  /** 25+ hashtags: a fixed brand set plus deeply-researched, trending/relevant tags for this story. Not rendered on the poster itself. */
  hashtags?: string[];
  /** Logo Watermark properties */
  logoPosition?: LogoPosition;
  logoCustomX?: number;
  logoCustomY?: number;
  stratiColor?: string;
  xColor?: string;
  watermarkBgStyle?: "glass" | "light" | "dark" | "none" | "solid";
  logoScale?: number;
  showTagline?: boolean;
  taglineText?: string;
}

export type LogoPosition = "top-right" | "top-left" | "top-center" | "bottom-right" | "bottom-left" | "bottom-center" | "center" | "custom";

export interface AspectRatio { id: string; label: string; w: number; h: number; desc: string; }

export type CreatorMode = "analysis" | "news" | "indicator" | "facts" | "learnings" | "watermark" | "motion";

export interface PixelBounds { left: number; top: number; width: number; height: number; }

export interface MotionTextWord {
  text: string;
  confidence: number;
  pixelBounds: PixelBounds;
}

export interface MotionTextLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pixelBounds: PixelBounds;
  fontSizePx: number;
  words: MotionTextWord[];
}

export type MotionTextRole =
  | "title" | "heading" | "subtitle" | "body" | "caption"
  | "eyebrow" | "badge" | "tag" | "footer" | "footer-badge";

export interface MotionLayer {
  id: string;
  name: string;
  imageUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  scale: number;
  rotation: number;
  motionType: "parallax" | "float" | "pulse" | "rotate" | "slide_in" | "none";
  motionSpeed: number;
  motionDistance: number;

  /* Everything below is emitted by scripts/motion_segment.py. Optional so that
     layers restored from older saved generations still type-check. */
  type?: "text" | "graphic";
  role?: MotionTextRole | string;
  slug?: string;
  zIndex?: number;
  kind?: "text" | "graphic";
  hasAlpha?: boolean;
  hasBackground?: boolean;
  pixelBounds?: PixelBounds;
  sourceSize?: { width: number; height: number };
  positionLabel?: string;
  backgroundColor?: string;
  color?: string | null;
  aspectRatio?: number;

  /* Text layers only. */
  text?: string;
  textLines?: string[];
  lines?: MotionTextLine[];
  lineCount?: number;
  wordCount?: number;
  fontSizePx?: number;
  fontSizeRel?: number;
  isUppercase?: boolean;
  textAlign?: "left" | "center" | "right";
  ocrConfidence?: number;
}

/** One OCR'd text block, in reading order, with everything needed to place it. */
export interface MotionTextBlock {
  id: string;
  role: string;
  positionLabel?: string;
  text: string;
  textLines: string[];
  position: { x: number; y: number; w: number; h: number };
  pixelBounds: PixelBounds;
  fontSizePx: number;
  fontSizeRel: number;
  textAlign: string;
  color: string | null;
  backgroundColor: string;
  hasBackground?: boolean;
  isUppercase: boolean;
  ocrConfidence: number;
}

export interface MotionTextData {
  fullText: string;
  blockCount?: number;
  blocks: MotionTextBlock[];
}

export interface MotionMeta {
  ocr: string;
  wordsDetected?: number;
  linesDetected?: number;
  textLayers?: number;
  graphicLayers?: number;
  mattedLayers?: number;
  processedAtSourceResolution?: boolean;
  note?: string;
}

export interface MotionVideoData {
  backgroundUrl?: string;
  originalUrl?: string;
  layers: MotionLayer[];
  activeLayerId?: string;
  timeMs?: number;
  isExporting?: boolean;
  /** Decomposed pixel size — the canvas renders 1:1 with this so nothing is resampled. */
  width?: number;
  height?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  text?: MotionTextData;
  meta?: MotionMeta;
  fileName?: string;
}

/** One uploaded image in a motion batch. */
export interface MotionSlide extends MotionVideoData {
  slideId: string;
}

export interface HistoryListItem {
  _id: string;
  category: "news-batch" | "daily-analysis" | "indicator" | "facts-batch" | "learnings-batch" | "watermark-batch" | "motion-video";
  title: string;
  itemCount: number;
  createdAt: string;
  previewUrl?: string;
}

export interface PosterColors {
  bg: string;
  accent: string;
  text: string;
  muted: string;
  card: string;
  subtle: string;
}

export interface PosterConfig {
  showGrid: boolean;
  gridSize: number;
  gridOpacity: number;
  showBorder: boolean;
  borderWidth: number;
  showCrosses: boolean;
  crossSize: number;
  fontScale: number;
}

export interface PosterElement {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
