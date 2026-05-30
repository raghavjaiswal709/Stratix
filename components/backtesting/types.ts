// ─── Shared TypeScript interfaces for the backtesting engine ─────────────────

export interface Candle {
  time: number; // Unix timestamp in seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";

export type StrategyName = "SMA_CROSSOVER" | "RSI_REVERSAL" | "BREAKOUT";

// ─── Strategy parameter shapes ────────────────────────────────────────────────

export interface SMAParams {
  fastPeriod: number;
  slowPeriod: number;
}

export interface RSIParams {
  period: number;
  oversold: number;
  overbought: number;
}

export interface BreakoutParams {
  lookback: number;
}

export type StrategyParams = SMAParams | RSIParams | BreakoutParams;

// ─── Trade & signal types ─────────────────────────────────────────────────────

export interface Trade {
  id: number;
  type: "LONG" | "SHORT";
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  pnl: number;      // USD P&L
  pnlPct: number;   // % P&L
}

export interface Signal {
  time: number;
  type: "BUY" | "SELL";
  price: number;
}

export interface IndicatorLine {
  name: string;
  color: string;
  data: { time: number; value: number }[];
}

// ─── Backtest result types ────────────────────────────────────────────────────

export interface BacktestMetrics {
  totalReturn: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
}

export interface BacktestResult {
  trades: Trade[];
  equityCurve: { time: number; value: number }[];
  signals: Signal[];
  indicators: IndicatorLine[];
  metrics: BacktestMetrics;
}

// ─── Backtest config ──────────────────────────────────────────────────────────

export interface BacktestConfig {
  candles: Candle[];
  strategy: StrategyName;
  params: StrategyParams;
  initialCapital: number;
  lotSize: number; // fixed USD amount per trade
}

// ─── Controls form state ─────────────────────────────────────────────────────

export interface ControlsState {
  fromDate: string;       // YYYY-MM-DD
  toDate: string;         // YYYY-MM-DD
  timeframe: Timeframe;
  strategy: StrategyName;
  params: StrategyParams;
  initialCapital: number;
  lotSize: number;
}
