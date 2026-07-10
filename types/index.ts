// TypeScript types for the entire application

// ============ USER ============
export interface UserData {
  id: string;
  email: string;
  name: string;
  image?: string;
}

// ============ HABITS ============
export interface SubHabit {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  weekDays?: number[];
  weight?: number;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  icon?: string;        // lucide icon key e.g. "Dumbbell"
  weekDays?: number[];  // 0=Sun..6=Sat; undefined/empty = all days
  category: string;
  weight: number;       // 1-5 stars
  createdAt: string;
  subHabits?: SubHabit[];
}

export interface HabitLog {
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  completedSubHabits?: string[]; // IDs of completed sub-habits
  note?: string; // Optional free-text note for this habit on this day
}

export const HABIT_CATEGORIES = [
  "Health",
  "Fitness",
  "Mind",
  "Work",
  "Learning",
  "Sleep",
  "Social",
  "Finance",
  "Creativity",
  "Spiritual",
] as const;

export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

/** Uncategorized habits fall under this label */
export const UNCATEGORIZED_CATEGORY = "General";

export interface HabitData {
  habits: Habit[];
  logs: HabitLog[];
}

// ============ TODOS ============
export type Priority = "low" | "medium" | "high" | "urgent";
export type TodoStatus = "active" | "completed" | "dropped";

export const TODO_CATEGORIES = [
  "Work",
  "Personal",
  "Health",
  "Finance",
  "Learning",
  "Shopping",
  "Errands",
  "Goals",
  "Other",
] as const;

export type TodoCategory = (typeof TODO_CATEGORIES)[number];

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Todo {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string; // YYYY-MM-DD or "" for general todos
  dueTime: string;
  completed: boolean;
  status: TodoStatus;
  dropReason?: string;
  category: string;
  subtasks: SubTask[];
  order: number;
  color?: string; // user-assigned color for visual categorization
  tags: string[];
  createdAt: string;
  completedAt?: string; // ISO timestamp when marked done
}

export interface TodoData {
  todos: Todo[];
  tags: string[]; // user-defined reusable tags
}

// ============ DIARY ============
export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiaryData {
  entries: DiaryEntry[];
}

// ============ NOTES ============
export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  color?: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotesData {
  notes: Note[];
}

// ============ USER PREFERENCES ============
export interface AccentPreset {
  name: string;
  value: string;
  /** Best-contrast text color for solid fills using this accent (buttons, active nav). */
  foreground: string;
  /** Which theme mode this swatch is tuned for — vivid for dark backgrounds, deep/saturated for light. */
  mode: "dark" | "light";
}

// 26 curated accent palettes — 13 tuned for dark mode (vivid, pop against
// near-black surfaces), 13 tuned for light mode (deeper/richer shades that
// stay legible against white). Includes an oceanic blue/violet/purple family
// alongside the original warm-neutral set — all still opt-in single tints,
// same convention as the Application Color Palette re-skins below.
export const ACCENT_PRESETS: AccentPreset[] = [
  // ── Dark mode ──
  { name: "Emerald",  value: "#10b981", foreground: "#ffffff", mode: "dark" },
  { name: "Lime",     value: "#84cc16", foreground: "#000000", mode: "dark" },
  { name: "Amber",    value: "#f59e0b", foreground: "#000000", mode: "dark" },
  { name: "Sunset",   value: "#f97316", foreground: "#ffffff", mode: "dark" },
  { name: "Crimson",  value: "#ef4444", foreground: "#ffffff", mode: "dark" },
  { name: "Rose",     value: "#f43f5e", foreground: "#ffffff", mode: "dark" },
  { name: "Magenta",  value: "#ec4899", foreground: "#ffffff", mode: "dark" },
  { name: "Orchid",   value: "#d946ef", foreground: "#ffffff", mode: "dark" },
  { name: "Gold",     value: "#eab308", foreground: "#000000", mode: "dark" },
  { name: "Coral",    value: "#fb7185", foreground: "#000000", mode: "dark" },
  // ── Dark mode · Oceanic ──
  { name: "Azure",    value: "#0ea5e9", foreground: "#ffffff", mode: "dark" },
  { name: "Indigo",   value: "#6366f1", foreground: "#ffffff", mode: "dark" },
  { name: "Violet",   value: "#8b5cf6", foreground: "#ffffff", mode: "dark" },
  // ── Light mode ──
  { name: "Forest",     value: "#059669", foreground: "#ffffff", mode: "light" },
  { name: "Olive",      value: "#4d7c0f", foreground: "#ffffff", mode: "light" },
  { name: "Honey",      value: "#b45309", foreground: "#ffffff", mode: "light" },
  { name: "Terracotta", value: "#c2410c", foreground: "#ffffff", mode: "light" },
  { name: "Ruby",       value: "#dc2626", foreground: "#ffffff", mode: "light" },
  { name: "Garnet",     value: "#e11d48", foreground: "#ffffff", mode: "light" },
  { name: "Berry",      value: "#be185d", foreground: "#ffffff", mode: "light" },
  { name: "Plum",       value: "#a21caf", foreground: "#ffffff", mode: "light" },
  { name: "Bronze",     value: "#a16207", foreground: "#ffffff", mode: "light" },
  { name: "Maroon",     value: "#9f1239", foreground: "#ffffff", mode: "light" },
  // ── Light mode · Oceanic ──
  { name: "Sapphire",   value: "#0369a1", foreground: "#ffffff", mode: "light" },
  { name: "Cobalt",     value: "#4338ca", foreground: "#ffffff", mode: "light" },
  { name: "Amethyst",   value: "#7e22ce", foreground: "#ffffff", mode: "light" },
];

// ── Application Color Palette ─────────────────────────────────────────────
// A FULL re-skin, app-wide: every role below replaces the app's normal
// background/card/border/text tokens entirely while a palette is active.
// "default" is a reserved id meaning "no palette — use the normal dark/light
// + accent-color theme"; it is NOT in DASHBOARD_PALETTES (there's nothing to
// look up), callers just treat an unset/"default" preference as "off".
// Mutually exclusive with the single-tint Accent Color system: picking an
// accent resets this to "default", and picking a palette here supersedes
// the accent entirely while active. `positive`/`negative` stay green/red
// family (for financial-data legibility) but muted — every color below is
// deliberately desaturated/low-contrast, editor-theme style, not neon.
export const DEFAULT_DASHBOARD_PALETTE_ID = "default";

export interface DashboardPalette {
  id: string;
  name: string;
  mode: "dark" | "light";
  background: string;    // page background
  card: string;          // card/section surface
  border: string;        // card borders, row borders
  text: string;           // primary heading/value text
  textMuted: string;      // secondary/label text
  positive: string;       // profit/win color (muted green-family)
  negative: string;       // loss color (muted red-family)
  accent: string;         // primary buttons/progress fills/chart accents
  icon: string;           // section-header icons
  badge: string;          // breakdown-row left accent / tag color
}

export const DASHBOARD_PALETTES: DashboardPalette[] = [
  // ── Dark Mode Palettes ──
  { id: "sage-clay",       name: "Sage & Clay", mode: "dark",
    background: "#1c1b19", card: "#24221f", border: "#3a352f", text: "#e8e3d8", textMuted: "#a39c8c",
    positive: "#8fae7a", negative: "#c1666b", accent: "#c9a35c", icon: "#a68a64", badge: "#b98b73" },
  { id: "moss-moor",       name: "Moss & Moor", mode: "dark",
    background: "#191d19", card: "#202521", border: "#333a33", text: "#e2e8de", textMuted: "#9aa696",
    positive: "#7fa373", negative: "#b56258", accent: "#94ab7c", icon: "#c2a24f", badge: "#7d9471" },
  { id: "rosewood-study",  name: "Rosewood Study", mode: "dark",
    background: "#1d1817", card: "#26201e", border: "#3d322e", text: "#ecdfd9", textMuted: "#b09a91",
    positive: "#8ba888", negative: "#b9645c", accent: "#c48b7f", icon: "#cf9a72", badge: "#a56b62" },
  { id: "golden-hour",     name: "Golden Hour", mode: "dark",
    background: "#1d1a14", card: "#25211a", border: "#40392b", text: "#f0e6d2", textMuted: "#b8a888",
    positive: "#9cae6f", negative: "#c1705a", accent: "#cc9c4f", icon: "#d4b06a", badge: "#b8823f" },
  { id: "amber-dusk",      name: "Amber Dusk", mode: "dark",
    background: "#1c1815", card: "#24201b", border: "#3e352a", text: "#ecdfd0", textMuted: "#ab9a83",
    positive: "#93a878", negative: "#bd6f5e", accent: "#ce9152", icon: "#d1a35f", badge: "#a8703f" },
  { id: "terracotta-studio", name: "Terracotta Studio", mode: "dark",
    background: "#1b1614", card: "#251e1a", border: "#3d2f27", text: "#efe2d6", textMuted: "#b39d8c",
    positive: "#8fa878", negative: "#b8604f", accent: "#c07a56", icon: "#cc8f63", badge: "#a15b45" },
  { id: "olive-grove",     name: "Olive Grove", mode: "dark",
    background: "#191a15", card: "#21221b", border: "#383a2d", text: "#e6e6d6", textMuted: "#a3a48c",
    positive: "#8a9e5e", negative: "#b06256", accent: "#9ba85e", icon: "#b3a555", badge: "#7c8a4f" },
  { id: "copper-patina",   name: "Copper Patina", mode: "dark",
    background: "#171a18", card: "#1f2320", border: "#333c35", text: "#dde8e0", textMuted: "#94a89b",
    positive: "#7fae8f", negative: "#b06a58", accent: "#a67c5b", icon: "#8fa888", badge: "#8a6a4d" },
  { id: "autumn-ember",    name: "Autumn Ember", mode: "dark",
    background: "#1a1613", card: "#221c18", border: "#3d2f24", text: "#ecdfce", textMuted: "#ac9781",
    positive: "#93a06a", negative: "#bb5d47", accent: "#c17d3e", icon: "#cf9853", badge: "#954f38" },
  { id: "muted-rose",      name: "Muted Rose", mode: "dark",
    background: "#1c1618", card: "#251d20", border: "#3d2e33", text: "#ecdfe2", textMuted: "#ab949c",
    positive: "#8ba88f", negative: "#b16471", accent: "#b17d8c", icon: "#c99aa6", badge: "#8f5b68" },

  // ── Dark Mode Palettes · Oceanic (blue / indigo / violet) ──
  { id: "deep-abyss",      name: "Deep Abyss", mode: "dark",
    background: "#0f1720", card: "#152030", border: "#28394d", text: "#dde8f4", textMuted: "#8ea3ba",
    positive: "#6ba888", negative: "#c1666b", accent: "#4f8fc4", icon: "#5fa3d6", badge: "#3d6f9c" },
  { id: "midnight-tide",   name: "Midnight Tide", mode: "dark",
    background: "#141328", card: "#1c1a35", border: "#332f57", text: "#e5e2f6", textMuted: "#9d97c0",
    positive: "#6fab8c", negative: "#c1707a", accent: "#7c7ce0", icon: "#8f8cec", badge: "#6259b8" },
  { id: "violet-depths",   name: "Violet Depths", mode: "dark",
    background: "#180f22", card: "#22162f", border: "#3b2a4c", text: "#ecdff6", textMuted: "#ac96bd",
    positive: "#71ab8f", negative: "#c16f8c", accent: "#a563d1", icon: "#c48fe0", badge: "#8b4fb8" },

  // ── Light Mode Palettes ──
  { id: "porcelain-mint",    name: "Porcelain & Mint", mode: "light",
    background: "#f3f7f5", card: "#ffffff", border: "#dbe7e1", text: "#1e2925", textMuted: "#5c6f67",
    positive: "#059669", negative: "#dc2626", accent: "#0f766e", icon: "#0f766e", badge: "#14b8a6" },
  { id: "parchment-ink",     name: "Parchment & Ink", mode: "light",
    background: "#faf8f5", card: "#ffffff", border: "#e9e4dc", text: "#26231f", textMuted: "#6b6359",
    positive: "#15803d", negative: "#b91c1c", accent: "#a16207", icon: "#a16207", badge: "#b45309" },
  { id: "alabaster-rose",    name: "Alabaster & Rose", mode: "light",
    background: "#fdf8f7", card: "#ffffff", border: "#f3e6e3", text: "#372521", textMuted: "#7c605a",
    positive: "#16a34a", negative: "#dc2626", accent: "#be123c", icon: "#e11d48", badge: "#fb7185" },
  { id: "sandstone-slate",   name: "Sandstone & Slate", mode: "light",
    background: "#fcf9f5", card: "#ffffff", border: "#ebdcd0", text: "#362e28", textMuted: "#7d6e64",
    positive: "#16a34a", negative: "#d97706", accent: "#c2410c", icon: "#b45309", badge: "#dd6b20" },
  { id: "linen-oats",        name: "Linen & Oats", mode: "light",
    background: "#f9f6f0", card: "#ffffff", border: "#eae4d8", text: "#2d2924", textMuted: "#766e63",
    positive: "#2e7d32", negative: "#c62828", accent: "#8d6e63", icon: "#8d6e63", badge: "#795548" },
  { id: "chalk-clay",        name: "Chalk & Clay", mode: "light",
    background: "#fcfaf9", card: "#ffffff", border: "#f0e5e0", text: "#3a2820", textMuted: "#806359",
    positive: "#1b5e20", negative: "#b71c1c", accent: "#a73a24", icon: "#a73a24", badge: "#c05c46" },
  { id: "morning-mist",      name: "Morning Mist", mode: "light",
    background: "#f4f6f8", card: "#ffffff", border: "#e2e8f0", text: "#0f172a", textMuted: "#475569",
    positive: "#16a34a", negative: "#dc2626", accent: "#0284c7", icon: "#0f766e", badge: "#06b6d4" },
  { id: "silk-pewter",       name: "Silk & Pewter", mode: "light",
    background: "#fafafa", card: "#ffffff", border: "#e5e5e5", text: "#171717", textMuted: "#525252",
    positive: "#16a34a", negative: "#dc2626", accent: "#404040", icon: "#404040", badge: "#737373" },
  { id: "soft-sage",         name: "Soft Sage", mode: "light",
    background: "#f4f6f3", card: "#ffffff", border: "#e1e6de", text: "#1f291a", textMuted: "#566150",
    positive: "#15803d", negative: "#c2410c", accent: "#4f6b3e", icon: "#4f6b3e", badge: "#708a5e" },
  { id: "apricot-cream",     name: "Apricot Cream", mode: "light",
    background: "#fefaf6", card: "#ffffff", border: "#faedd8", text: "#382e22", textMuted: "#80705d",
    positive: "#2e7d32", negative: "#c62828", accent: "#ea580c", icon: "#ea580c", badge: "#f97316" },

  // ── Light Mode Palettes · Oceanic (blue / indigo / violet) ──
  { id: "sea-glass",         name: "Sea Glass", mode: "light",
    background: "#f4f8fb", card: "#ffffff", border: "#dbe7f0", text: "#0f2436", textMuted: "#5a7386",
    positive: "#0f766e", negative: "#dc2626", accent: "#0369a1", icon: "#0369a1", badge: "#0891b2" },
  { id: "coastal-breeze",    name: "Coastal Breeze", mode: "light",
    background: "#f5f7fc", card: "#ffffff", border: "#dee3f5", text: "#1c2340", textMuted: "#5e6690",
    positive: "#15803d", negative: "#dc2626", accent: "#4338ca", icon: "#4f46e5", badge: "#6366f1" },
  { id: "lavender-mist",     name: "Lavender Mist", mode: "light",
    background: "#f8f5fc", card: "#ffffff", border: "#ecdff5", text: "#2c1f3d", textMuted: "#73647f",
    positive: "#15803d", negative: "#c2185b", accent: "#7e22ce", icon: "#9333ea", badge: "#a855f7" },
];

export interface TradesSortFilterPrefs {
  sortBy: "date" | "pnl" | "symbol" | "lots";
  sortDir: "asc" | "desc";
  filterSymbol: string;
  filterDirection: "all" | "buy" | "sell";
  filterStatus: "all" | "open" | "closed";
  filterSource: "all" | "manual" | "mt5";
}

export interface JournalSortFilterPrefs {
  sortBy: "date" | "pnl" | "symbol";
  sortDir: "asc" | "desc";
  filterSymbol: string;
  filterDirection: "all" | "buy" | "sell";
  filterOutcome: "all" | "winner" | "loser" | "open";
}

export interface UserPreferences {
  accentColor: string;       // hex color for primary tint
  dashboardPalette?: string; // DASHBOARD_PALETTES id — 7-color scheme scoped to the Dashboard page
  defaultPage: string;       // e.g. "/trade/trades" | "/productivity"
  defaultTab: string;        // default tab within landing page
  sectionOrder: string[];    // ordered list of tab values
  tradesSortFilter?: TradesSortFilterPrefs;
  journalSortFilter?: JournalSortFilterPrefs;
  showQuotes?: boolean;
  sidebarItems?: {
    dashboard: boolean;
    trades: boolean;
    journal: boolean;
    tradeNotes: boolean;
    backtesting: boolean;
    data?: boolean;
    newsAnalysis: boolean;
    liveData?: boolean;
    chart?: boolean;
    aiReport?: boolean;
    todo: boolean;
    habits: boolean;
    diary: boolean;
    notes: boolean;
    contentCreator?: boolean;
  };
}

// ============ TRADES ============
export type TradeType = "long" | "short";
export type AssetClass = "equity" | "futures" | "options" | "forex" | "crypto" | "commodity";
export type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "Daily";
export type EmotionalState = "confident" | "anxious" | "fomo" | "neutral" | "fearful";
export type TradeResult = "win" | "loss" | "breakeven";

export interface Trade {
  id: string;
  symbol: string;
  tradeType: TradeType;
  assetClass: AssetClass;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  pnlPercent: number;
  rrr: number;
  result: TradeResult;
  strategy: string;
  setup: string;
  timeframe: Timeframe;
  emotionalState: EmotionalState;
  preTradeNotes: string;
  postTradeReview: string;
  tags: string[];
  images: string[]; // base64 encoded
  createdAt: string;
}

// ============ TRADING NOTES ============
export interface TradeNoteCategory {
  id: string;
  name: string;
  color: string;
  icon: string; // lucide icon key
}

export interface TradeNote {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeNoteData {
  notes: TradeNote[];
  categories: TradeNoteCategory[];
}

export interface TradeData {
  trades: Trade[];
  customStrategies: string[];
  tradeNotes?: TradeNoteData;
}

// ============ SCORE ============
export interface ScoreWeights {
  habitWeight: number;
  todoWeight: number;
}

// ============ TIME FRAME ============
export type TimeFrame = "this-week" | "this-month" | "last-3-months" | "last-6-months" | "this-year" | "all-time";

// ============ API TRADE (MongoDB response shape) ============
// Shared canonical shape used as the cross-page in-memory cache.
// Both the trades page's local Trade and journal page's JournalDetailTrade
// are compatible subsets of this interface.
export interface ApiTrade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  timeframe?: string;
  profit: number;
  status: "open" | "closed";
  journaled?: boolean;
  source?: "manual" | "mt5";
  leverage?: number;
  margin?: number;
  executionChecklist?: { item: string; checked: boolean }[];
  screenshots?: string[];
  preTradeAnalysis?: string;
  postTradeReview?: string;
  riskRatio?: number;
  rewardRatio?: number;
  emotions?: string;
  lessonsLearned?: string;
  tags?: string[];
  rating?: number;
  mistakes?: string;
  lessons?: string;
  _deleted?: boolean;
  parentTradeId?: string;
  mergedTradeIds?: string[];
}

// ============ TRADING PROFILES ============
export interface TradingProfile {
  id: string;
  name: string;
  broker?: string;
  accountType: "live" | "demo" | "paper";
  currency: string;
  color: string;        // hex color for visual identification
  initialBalance?: number;
  description?: string;
  createdAt: string;
}
