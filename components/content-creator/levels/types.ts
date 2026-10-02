/**
 * Instagram "Key Levels" carousel — the daily levels post.
 *
 * A carousel is an ordered list of slides. Every slide is one chart
 * screenshot placed on a fixed Instagram-ratio canvas (4:5 by default) plus
 * any number of free-floating text boxes. Both the image placement and every
 * text box live in *canvas units* (the exported pixel space, 1080 wide), so
 * the on-screen editor and the exported JPEG are the same geometry at two
 * different scales — nothing is ever stored in screen pixels.
 */

export type LevelsAlign = "left" | "center" | "right";

/** A single free-positioned text box drawn on top of a slide. */
export interface LevelsTextBox {
  id: string;
  text: string;

  /** Top-left corner + wrap width, in canvas units. Height is derived from the wrapped lines. */
  x: number;
  y: number;
  width: number;

  fontFamily: string;   // key into LEVELS_FONTS
  fontSize: number;     // canvas units
  bold: boolean;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;

  color: string;
  opacity: number;      // 0..1
  align: LevelsAlign;
  lineHeight: number;   // multiplier of fontSize
  letterSpacing: number; // canvas units, can be negative
  rotation: number;     // degrees

  /** Drop shadow — the thing that keeps white text readable over a light chart. */
  shadow: boolean;
  /** Dark outline around each glyph, for the same reason but heavier. */
  outline: boolean;
  outlineColor: string;

  /** Optional filled pill behind the text. `null` = transparent. */
  bgColor: string | null;
  bgOpacity: number;
  bgPadding: number;
  bgRadius: number;

  locked: boolean;
}

/** One chart image + its level metadata + its text boxes. */
export interface LevelsSlide {
  id: string;
  name: string;

  /** Data URL of the chart screenshot. */
  src: string;
  imgW: number;
  imgH: number;

  /**
   * Placement of the image on the canvas. `scale` is a multiplier on the
   * "contain" fit, so 1 means the whole screenshot is visible with letterbox
   * gaps, and the offsets slide it anywhere from there.
   */
  offsetX: number;
  offsetY: number;
  scale: number;

  // ── Level metadata — drives the auto-built statement ──
  instrument: string;
  timeframe: string;
  levels: string[];
  bias: "" | "Bullish" | "Bearish" | "Neutral";
  note: string;

  texts: LevelsTextBox[];
}

export type LevelsBgMode = "solid" | "gradient" | "blur";

/** Carousel-wide look: canvas ratio and how the letterbox gaps are filled. */
export interface LevelsSettings {
  ratioId: string;          // key into LEVELS_RATIOS
  bgMode: LevelsBgMode;
  bgColor: string;
  bgColor2: string;         // second stop for "gradient"
  blurStrength: number;     // px of blur for "blur", in canvas units
  blurDim: number;          // 0..1 black scrim over the blurred fill
  imageRadius: number;      // corner radius on the placed image, canvas units
  imageShadow: boolean;
  imageBorder: boolean;
  imageBorderColor: string;
  /** Slide counter ("1/7") burned into the corner of every exported slide. */
  showCounter: boolean;
  counterColor: string;
  /** Statement template applied by the "Add statement" button. */
  statementTemplate: string;
}
