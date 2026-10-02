import type { LevelsSettings, LevelsTextBox } from "./types";

/** Export sizes. Instagram downsizes anything wider than 1080, so 1080 is the width everywhere. */
export const LEVELS_RATIOS = [
  { id: "portrait", label: "4:5", w: 1080, h: 1350, desc: "Carousel" },
  { id: "square",   label: "1:1", w: 1080, h: 1080, desc: "Post" },
  { id: "story",    label: "9:16", w: 1080, h: 1920, desc: "Story" },
] as const;

export function levelsRatio(id: string) {
  return LEVELS_RATIOS.find((r) => r.id === id) ?? LEVELS_RATIOS[0];
}

/**
 * Font choices. `cssVar` is resolved at runtime because next/font hashes the
 * real family name — canvas can't read a CSS custom property out of a font
 * shorthand, so it has to be looked up off the documentElement first.
 */
export const LEVELS_FONTS = [
  { id: "sans",    label: "Inter",   cssVar: "--font-sans",    fallback: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
  { id: "display", label: "Anton",   cssVar: "--font-display", fallback: '"Arial Narrow Bold", "Arial Black", sans-serif' },
  { id: "mono",    label: "Mono",    cssVar: "--font-mono",    fallback: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { id: "serif",   label: "Serif",   cssVar: null,             fallback: 'Georgia, "Times New Roman", serif' },
] as const;

/** Instruments the levels posts actually cover. Free text is allowed on top of these. */
export const LEVELS_INSTRUMENTS = [
  "XAUUSD", "XAGUSD", "BTCUSD", "ETHUSD",
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
  "GBPJPY", "EURJPY", "US30", "NAS100", "SPX500", "USOIL", "DXY",
];

/** Same vocabulary the journal's Levels checklist uses, so a post matches the journal entry. */
export const LEVELS_TAGS = [
  "QML", "SBR/RBS", "DB/DT", "L1", "L2", "L3", "L4", "TJL1", "TJL 2",
  "CHoCH", "BOS", "Supply", "Demand",
];

export const LEVELS_TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN"];

/** Named color swatches for text — white first, since that is the default. */
export const LEVELS_TEXT_COLORS = [
  "#ffffff", "#000000", "#d4d4d4", "#a3a3a3",
  "#10b981", "#ef4444", "#f59e0b", "#facc15",
];

export const LEVELS_BG_COLORS = [
  "#000000", "#0a0a0a", "#111111", "#1c1c1c",
  "#ffffff", "#f5f5f0", "#bd533c", "#0f2e22",
];

/**
 * Statement templates. Placeholders are substituted from the slide's own
 * instrument / timeframe / levels / bias selection.
 */
export const LEVELS_STATEMENT_TEMPLATES = [
  { id: "key",     label: "Key levels for …",   pattern: "KEY LEVELS FOR {INSTRUMENT} ON {TIMEFRAME}" },
  { id: "compact", label: "XAUUSD · H1 — QML",  pattern: "{INSTRUMENT} · {TIMEFRAME} — {LEVELS}" },
  { id: "watch",   label: "Levels to watch",    pattern: "{INSTRUMENT} {TIMEFRAME} — LEVELS TO WATCH: {LEVELS}" },
  { id: "bias",    label: "With bias",          pattern: "{INSTRUMENT} {TIMEFRAME} · {BIAS} · {LEVELS}" },
  { id: "plain",   label: "Instrument only",    pattern: "{INSTRUMENT} {TIMEFRAME}" },
];

export const DEFAULT_LEVELS_SETTINGS: LevelsSettings = {
  ratioId: "portrait",
  bgMode: "solid",
  bgColor: "#000000",
  bgColor2: "#1c1c1c",
  blurStrength: 48,
  blurDim: 0.35,
  imageRadius: 0,
  imageShadow: false,
  imageBorder: false,
  imageBorderColor: "#ffffff",
  showCounter: false,
  counterColor: "#ffffff",
  statementTemplate: "key",
};

/** Everything a text box needs except identity, position and content. */
export const DEFAULT_TEXT_BOX: Omit<LevelsTextBox, "id" | "text" | "x" | "y"> = {
  width: 900,
  fontFamily: "sans",
  fontSize: 52,
  bold: true,
  italic: false,
  underline: false,
  uppercase: false,
  color: "#ffffff",
  opacity: 1,
  align: "center",
  lineHeight: 1.2,
  letterSpacing: 0,
  rotation: 0,
  shadow: true,
  outline: false,
  outlineColor: "#000000",
  bgColor: null,
  bgOpacity: 0.55,
  bgPadding: 22,
  bgRadius: 14,
  locked: false,
};

export const LEVELS_FONT_SIZE_MIN = 12;
export const LEVELS_FONT_SIZE_MAX = 220;

export function levelsUid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
