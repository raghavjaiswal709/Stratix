// ─── Shared TypeScript interfaces for the backtesting / replay engine ─────────

export interface Candle {
  time: number; // Unix timestamp in seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";

export type InstrumentKey =
  | "xauusd" | "xagusd"
  | "eurusd" | "gbpusd" | "usdcad" | "usdjpy" | "nzdusd" | "audusd" | "usdchf"
  | "ethusd" | "btcusdt"
  | "dxy" | "usoil" | "us100";

export interface InstrumentInfo {
  key: InstrumentKey;
  label: string;
  description: string;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  { key: "xauusd", label: "XAUUSD", description: "Gold / US Dollar" },
  { key: "xagusd", label: "XAGUSD", description: "Silver / US Dollar" },
  { key: "eurusd", label: "EURUSD", description: "Euro / US Dollar" },
  { key: "gbpusd", label: "GBPUSD", description: "Pound Sterling / US Dollar" },
  { key: "usdcad", label: "USDCAD", description: "US Dollar / Canadian Dollar" },
  { key: "usdjpy", label: "USDJPY", description: "US Dollar / Japanese Yen" },
  { key: "nzdusd", label: "NZDUSD", description: "New Zealand Dollar / US Dollar" },
  { key: "audusd", label: "AUDUSD", description: "Australian Dollar / US Dollar" },
  { key: "usdchf", label: "USDCHF", description: "US Dollar / Swiss Franc" },
  { key: "ethusd", label: "ETHUSD", description: "Ethereum / US Dollar" },
  { key: "btcusdt", label: "BTCUSDT", description: "Bitcoin / Tether" },
  { key: "dxy",    label: "DXY",    description: "US Dollar Index" },
  { key: "usoil",  label: "USOIL",  description: "WTI Crude Oil" },
  { key: "us100",  label: "US100",  description: "Nasdaq 100 Index" },
];

// ─── Manual replay trade ──────────────────────────────────────────────────────

export interface ManualTrade {
  id: number;
  direction: "LONG" | "SHORT";
  entryTime: number;
  entryPrice: number;
  lotSize: number;
  exitTime?: number;
  exitPrice?: number;
  pnl?: number;     // absolute USD
  pnlPct?: number;  // percentage
}

// ─── Replay engine state ──────────────────────────────────────────────────────

export type ReplaySpeed = 0.5 | 1 | 2 | 5 | 10 | "max";

export interface ReplayState {
  active: boolean;
  playing: boolean;
  startIdx: number;    // candle index where replay begins
  currentIdx: number;  // index of last visible candle
  speed: ReplaySpeed;
  selectingStart: boolean;
}

// ─── Live feed status ─────────────────────────────────────────────────────────

export type LiveStatus = "live" | "reconnecting" | "stopped";

// ─── Controls form state ─────────────────────────────────────────────────────

export interface ControlsState {
  instrument: InstrumentKey;
  fromDate: string;  // YYYY-MM-DD
  toDate: string;    // YYYY-MM-DD
  timeframe: Timeframe;
  lotSize: number;
}

// ─── Metrics computed from manual trades ─────────────────────────────────────

export interface ReplayMetrics {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  equityCurve: { time: number; value: number }[];
}

// ─── Drawing Tools & Coordinate Space ──────────────────────────────────────────

export type DrawingType = "trendline" | "rectangle" | "fib" | "long" | "short" | "text" | "cursor" | "eraser";

export interface TimePricePoint {
  time: number; // Unix-second timestamp
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: TimePricePoint[]; // points representing drawings in time-price space
  text?: string;
  color?: string;
  // Specific settings for long/short risk positions
  riskSettings?: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
  };
}

// ─── Backtest Session persistence ─────────────────────────────────────────────

export interface Session {
  id: string;
  name: string;
  description: string;
  strategy: string;
  symbol: InstrumentKey;
  startDate: string;
  endDate: string;
  startingBalance: number;
  leverage: string;
  createdAt: number;
  trades: ManualTrade[];
  drawings: Drawing[];
}

