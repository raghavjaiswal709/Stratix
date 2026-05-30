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

export type InstrumentKey = "xauusd" | "btcusd";

export interface InstrumentInfo {
  key: InstrumentKey;
  label: string;
  description: string;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  { key: "xauusd", label: "XAUUSD", description: "Gold / US Dollar" },
  { key: "btcusd", label: "BTCUSD", description: "Bitcoin / US Dollar" },
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
