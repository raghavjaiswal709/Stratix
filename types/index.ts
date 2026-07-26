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
  muted?: string;        // subtle surface tint
  secondary?: string;    // secondary button/badge background tint
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
    background: "#0f1110", card: "#151816", border: "#232925", muted: "#1a1e1b", secondary: "#212723", text: "#e2e8e4", textMuted: "#8a968f",
    positive: "#4ade80", negative: "#f87171", accent: "#84a98c", icon: "#a3b18a", badge: "#b5838d" },
  { id: "moss-moor",       name: "Moss & Moor", mode: "dark",
    background: "#0e100e", card: "#141714", border: "#222822", muted: "#1a1f1a", secondary: "#202620", text: "#e1e7e1", textMuted: "#889488",
    positive: "#4ade80", negative: "#f87171", accent: "#709775", icon: "#a3b18a", badge: "#588157" },
  { id: "rosewood-study",  name: "Rosewood Study", mode: "dark",
    background: "#110f10", card: "#171416", border: "#292125", muted: "#1f191d", secondary: "#271e23", text: "#eae4e7", textMuted: "#998b92",
    positive: "#4ade80", negative: "#f87171", accent: "#b5838d", icon: "#d4a373", badge: "#e56b6f" },
  { id: "golden-hour",     name: "Golden Hour", mode: "dark",
    background: "#11100d", card: "#171511", border: "#2a251b", muted: "#201d16", secondary: "#28231a", text: "#ece6da", textMuted: "#9a9181",
    positive: "#4ade80", negative: "#f87171", accent: "#d4a373", icon: "#e9c46a", badge: "#dda15e" },
  { id: "amber-dusk",      name: "Amber Dusk", mode: "dark",
    background: "#100e0d", card: "#161311", border: "#28211b", muted: "#1f1a16", secondary: "#26201a", text: "#eae4df", textMuted: "#998e84",
    positive: "#4ade80", negative: "#f87171", accent: "#e09f67", icon: "#f4a261", badge: "#e76f51" },
  { id: "terracotta-studio", name: "Terracotta Studio", mode: "dark",
    background: "#110e0e", card: "#171313", border: "#2a2020", muted: "#201919", secondary: "#271e1e", text: "#eae3e3", textMuted: "#9a8b8b",
    positive: "#4ade80", negative: "#f87171", accent: "#c97a63", icon: "#e07a5f", badge: "#d62828" },
  { id: "olive-grove",     name: "Olive Grove", mode: "dark",
    background: "#10110e", card: "#151713", border: "#24281f", muted: "#1b1e18", secondary: "#22261e", text: "#e4e6df", textMuted: "#8e9284",
    positive: "#4ade80", negative: "#f87171", accent: "#90a955", icon: "#aacc00", badge: "#31572c" },
  { id: "copper-patina",   name: "Copper Patina", mode: "dark",
    background: "#0d1010", card: "#121616", border: "#1e2626", muted: "#171d1d", secondary: "#1e2626", text: "#e1e7e7", textMuted: "#869494",
    positive: "#34d399", negative: "#f87171", accent: "#52b788", icon: "#74c69d", badge: "#b7b7a4" },
  { id: "autumn-ember",    name: "Autumn Ember", mode: "dark",
    background: "#110d0c", card: "#171210", border: "#2b1d19", muted: "#211613", secondary: "#291b17", text: "#eae2e0", textMuted: "#9c8985",
    positive: "#4ade80", negative: "#f87171", accent: "#f3722c", icon: "#f8961e", badge: "#f94144" },
  { id: "muted-rose",      name: "Muted Rose", mode: "dark",
    background: "#110d0f", card: "#171215", border: "#291e24", muted: "#20161b", secondary: "#271b22", text: "#eae2e5", textMuted: "#9b8890",
    positive: "#4ade80", negative: "#f87171", accent: "#cdb4db", icon: "#ffc8dd", badge: "#ffafcc" },

  // ── Dark Mode Palettes · Oceanic (blue / indigo / violet) ──
  { id: "deep-abyss",      name: "Deep Abyss", mode: "dark",
    background: "#090d14", card: "#0f1420", border: "#1b2334", muted: "#131b2c", secondary: "#182236", text: "#e2e8f0", textMuted: "#8493a8",
    positive: "#34d399", negative: "#f87171", accent: "#38bdf8", icon: "#0ea5e9", badge: "#0284c7" },
  { id: "midnight-tide",   name: "Midnight Tide", mode: "dark",
    background: "#0b0a17", card: "#111024", border: "#1f1c3c", muted: "#171530", secondary: "#1d1a3e", text: "#e2e1f5", textMuted: "#8984b5",
    positive: "#34d399", negative: "#f87171", accent: "#818cf8", icon: "#6366f1", badge: "#4f46e5" },
  { id: "violet-depths",   name: "Violet Depths", mode: "dark",
    background: "#0d0915", card: "#140f21", border: "#241a38", muted: "#1c132d", secondary: "#231839", text: "#eae4f5", textMuted: "#9385b5",
    positive: "#34d399", negative: "#f87171", accent: "#6b5b95", icon: "#584a7d", badge: "#463a68" },

  // ── Light Mode Palettes ──
  { id: "porcelain-mint",    name: "Porcelain & Mint", mode: "light",
    background: "#f4f7f6", card: "#ffffff", border: "#e2e8e5", muted: "#eaf0ed", secondary: "#e4ece8", text: "#18221f", textMuted: "#576861",
    positive: "#059669", negative: "#dc2626", accent: "#0d9488", icon: "#0f766e", badge: "#14b8a6" },
  { id: "parchment-ink",     name: "Parchment & Ink", mode: "light",
    background: "#f9f8f6", card: "#ffffff", border: "#eae7e1", muted: "#f2efe9", secondary: "#ece8df", text: "#24211d", textMuted: "#696156",
    positive: "#16a34a", negative: "#dc2626", accent: "#d97706", icon: "#b45309", badge: "#f59e0b" },
  { id: "alabaster-rose",    name: "Alabaster & Rose", mode: "light",
    background: "#fcf7f8", card: "#ffffff", border: "#f3e6e8", muted: "#f9eaed", secondary: "#f5e2e6", text: "#291e21", textMuted: "#735b62",
    positive: "#16a34a", negative: "#dc2626", accent: "#e11d48", icon: "#be123c", badge: "#fb7185" },
  { id: "sandstone-slate",   name: "Sandstone & Slate", mode: "light",
    background: "#faf7f5", card: "#ffffff", border: "#ebdcd4", muted: "#f5ece6", secondary: "#f0e3db", text: "#29231f", textMuted: "#706259",
    positive: "#16a34a", negative: "#ea580c", accent: "#c2410c", icon: "#9a3412", badge: "#f97316" },
  { id: "linen-oats",        name: "Linen & Oats", mode: "light",
    background: "#f8f6f2", card: "#ffffff", border: "#e8e4dc", muted: "#f1ede5", secondary: "#ebe6db", text: "#24211c", textMuted: "#696257",
    positive: "#16a34a", negative: "#dc2626", accent: "#78350f", icon: "#92400e", badge: "#b45309" },
  { id: "chalk-clay",        name: "Chalk & Clay", mode: "light",
    background: "#faf8f7", card: "#ffffff", border: "#eee5e2", muted: "#f6edea", secondary: "#f2e5e1", text: "#291f1c", textMuted: "#735f59",
    positive: "#16a34a", negative: "#dc2626", accent: "#9a3412", icon: "#7c2d12", badge: "#ea580c" },
  { id: "morning-mist",      name: "Morning Mist", mode: "light",
    background: "#f4f6f8", card: "#ffffff", border: "#e2e8f0", muted: "#edf2f7", secondary: "#e2e8f0", text: "#0f172a", textMuted: "#475569",
    positive: "#16a34a", negative: "#dc2626", accent: "#0284c7", icon: "#0369a1", badge: "#38bdf8" },
  { id: "silk-pewter",       name: "Silk & Pewter", mode: "light",
    background: "#f8fafc", card: "#ffffff", border: "#e2e8f0", muted: "#f1f5f9", secondary: "#e2e8f0", text: "#0f172a", textMuted: "#64748b",
    positive: "#16a34a", negative: "#dc2626", accent: "#475569", icon: "#334155", badge: "#64748b" },
  { id: "soft-sage",         name: "Soft Sage", mode: "light",
    background: "#f4f7f4", card: "#ffffff", border: "#e1e8e1", muted: "#eaf0ea", secondary: "#e2ebe2", text: "#192419", textMuted: "#536353",
    positive: "#16a34a", negative: "#ea580c", accent: "#15803d", icon: "#166534", badge: "#22c55e" },
  { id: "apricot-cream",     name: "Apricot Cream", mode: "light",
    background: "#fdf8f5", card: "#ffffff", border: "#f7e8df", muted: "#fcefe8", secondary: "#fae7db", text: "#291f1a", textMuted: "#735e54",
    positive: "#16a34a", negative: "#dc2626", accent: "#ea580c", icon: "#c2410c", badge: "#fb923c" },

  // ── Light Mode Palettes · Oceanic (blue / indigo / violet) ──
  { id: "sea-glass",         name: "Sea Glass", mode: "light",
    background: "#f3f8fa", card: "#ffffff", border: "#dce8ed", muted: "#e7f1f5", secondary: "#deeef5", text: "#0f2229", textMuted: "#4d6770",
    positive: "#059669", negative: "#dc2626", accent: "#0284c7", icon: "#0369a1", badge: "#06b6d4" },
  { id: "coastal-breeze",    name: "Coastal Breeze", mode: "light",
    background: "#f4f6fb", card: "#ffffff", border: "#e0e6f5", muted: "#ebf0fa", secondary: "#e2e9f7", text: "#131b2e", textMuted: "#4e5d7c",
    positive: "#16a34a", negative: "#dc2626", accent: "#4f46e5", icon: "#4338ca", badge: "#6366f1" },
  { id: "lavender-mist",     name: "Lavender Mist", mode: "light",
    background: "#f7f4fc", card: "#ffffff", border: "#eae0f7", muted: "#f2eafd", secondary: "#eadefa", text: "#201530", textMuted: "#604e78",
    positive: "#16a34a", negative: "#e11d48", accent: "#8b5cf6", icon: "#7c3aed", badge: "#a78bfa" },
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
    marketCalendar?: boolean;
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
  screenshotMeta?: {
    url: string;
    caption?: string;
    timeframe?: string;
  }[];
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
