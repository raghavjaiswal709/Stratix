// ─── tradeTracker.ts ─────────────────────────────────────────────────────────
// Tracks manually placed trades during bar replay.
// BUY = enter LONG (or flip from SHORT); SELL = enter SHORT (or flip from LONG).

import type { Candle, ManualTrade, ReplayMetrics } from "./types";

export class TradeTracker {
  private nextId = 1;
  open:   ManualTrade | null  = null;
  closed: ManualTrade[]       = [];

  // Enter a trade — if already in the same direction, ignore; if opposite, close then open
  enter(direction: "LONG" | "SHORT", candle: Candle, lotSize: number): boolean {
    if (this.open?.direction === direction) return false; // already in this direction, ignore
    if (this.open) this.close(candle);                   // flip: close opposite first

    this.open = {
      id:         this.nextId++,
      direction,
      entryTime:  candle.time,
      entryPrice: candle.close,
      lotSize,
    };
    return true;
  }

  // Close the open trade at the given candle's close price
  close(candle: Candle): ManualTrade | null {
    if (!this.open) return null;

    const mult     = this.open.direction === "LONG" ? 1 : -1;
    const priceDiff = (candle.close - this.open.entryPrice) * mult;
    const pnl      = (priceDiff / this.open.entryPrice) * this.open.lotSize;
    const pnlPct   = (priceDiff / this.open.entryPrice) * 100;

    const closed: ManualTrade = {
      ...this.open,
      exitTime:  candle.time,
      exitPrice: candle.close,
      pnl,
      pnlPct,
    };

    this.closed.push(closed);
    this.open = null;
    return closed;
  }

  // Compute unrealized P&L for the open trade at the current price
  unrealizedPnl(currentPrice: number): number {
    if (!this.open) return 0;
    const mult = this.open.direction === "LONG" ? 1 : -1;
    return mult * ((currentPrice - this.open.entryPrice) / this.open.entryPrice) * this.open.lotSize;
  }

  // Reset all trade state
  reset(): void {
    this.open   = null;
    this.closed = [];
    this.nextId = 1;
  }
}

// Compute summary metrics from a list of closed manual trades
export function computeMetrics(trades: ManualTrade[], initialCapital: number): ReplayMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, totalPnl: 0,
      profitFactor: 0, avgWin: 0, avgLoss: 0,
      bestTrade: 0, worstTrade: 0, equityCurve: [],
    };
  }

  const pnls   = trades.map(t => t.pnl ?? 0);
  const wins   = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p <= 0);
  const totalPnl = pnls.reduce((a, b) => a + b, 0);

  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss   = Math.abs(losses.reduce((a, b) => a + b, 0));

  // Build equity curve over time
  let equity = initialCapital;
  const equityCurve = trades.map(t => {
    equity += t.pnl ?? 0;
    return { time: t.exitTime!, value: equity };
  });

  return {
    totalTrades:  trades.length,
    winRate:      (wins.length / trades.length) * 100,
    totalPnl,
    profitFactor: grossLoss === 0 ? 999 : grossProfit / grossLoss,
    avgWin:       wins.length   ? grossProfit / wins.length   : 0,
    avgLoss:      losses.length ? grossLoss   / losses.length : 0,
    bestTrade:    Math.max(...pnls),
    worstTrade:   Math.min(...pnls),
    equityCurve,
  };
}
