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
export const ACCENT_PRESETS = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Emerald", value: "#10b981" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Pink", value: "#ec4899" },
] as const;

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
  defaultPage: string;       // e.g. "/trade/trades" | "/productivity"
  defaultTab: string;        // default tab within landing page
  sectionOrder: string[];    // ordered list of tab values
  tradesSortFilter?: TradesSortFilterPrefs;
  journalSortFilter?: JournalSortFilterPrefs;
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
  tags?: string[];
  rating?: number;
  mistakes?: string;
  lessons?: string;
}
