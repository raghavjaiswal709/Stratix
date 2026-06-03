// ─── tradeTracker.ts ─────────────────────────────────────────────────────────
// Tracks manually placed trades during bar replay.
// P&L is calculated with proper MT5-style formulas using LotSpec.

import type { Candle, ManualTrade, ReplayMetrics } from "./types";
import { getLotSpec, calcPnl, calcUnrealisedPnl } from "./lotSpecs";

export class TradeTracker {
  private nextId = 1;
  private symbol = "xauusd";   // tracks which instrument we're on
  open:   ManualTrade | null = null;
  closed: ManualTrade[]      = [];

  setSymbol(symbol: string): void {
    this.symbol = symbol.toLowerCase();
  }

  // Enter a trade. If already in the same direction, ignore.
  // If opposite direction, close then open.
  enter(direction: "LONG" | "SHORT", candle: Candle, lotSize: number, stopLoss?: number, takeProfit?: number): boolean {
    if (this.open?.direction === direction) return false;
    if (this.open) this.close(candle);

    this.open = {
      id:         this.nextId++,
      direction,
      entryTime:  candle.time,
      entryPrice: candle.close,
      lotSize,
      stopLoss,
      takeProfit,
    };
    return true;
  }

  // Close the open trade at the given candle's close price (or exact exit price if provided).
  close(candle: Candle, exactExitPrice?: number): ManualTrade | null {
    if (!this.open) return null;

    const exitPrice = exactExitPrice ?? candle.close;
    const spec = getLotSpec(this.symbol);
    const pnl  = calcPnl(
      this.open.direction,
      this.open.entryPrice,
      exitPrice,
      this.open.lotSize,
      spec,
    );
    const pnlPct = ((exitPrice - this.open.entryPrice) / this.open.entryPrice) *
      (this.open.direction === "LONG" ? 100 : -100);

    const closed: ManualTrade = {
      ...this.open,
      exitTime:  candle.time,
      exitPrice,
      pnl,
      pnlPct,
    };

    this.closed.push(closed);
    this.open = null;
    return closed;
  }

  // Unrealised P&L for the open trade at the current price.
  unrealizedPnl(currentPrice: number): number {
    if (!this.open) return 0;
    const spec = getLotSpec(this.symbol);
    return calcUnrealisedPnl(
      this.open.direction,
      this.open.entryPrice,
      currentPrice,
      this.open.lotSize,
      spec,
    );
  }

  /** Restore a session's historical closed trades and advance nextId past them. */
  initFromTrades(trades: ManualTrade[]): void {
    this.closed = [...trades];
    this.nextId = trades.length > 0
      ? trades.reduce((max, t) => t.id > max ? t.id : max, trades[0].id) + 1
      : 1;
  }

  reset(): void {
    this.open   = null;
    this.closed = [];
    this.nextId = 1;
  }
}

// Compute summary metrics from a list of closed manual trades.
export function computeMetrics(trades: ManualTrade[], initialCapital: number): ReplayMetrics {
  // Only use properly closed trades that have a real numeric pnl.
  // Trades with undefined/null pnl would default to 0 and silently dilute win rate.
  const validTrades = trades.filter(t => t.exitTime != null && t.pnl != null);

  if (validTrades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, totalPnl: 0,
      profitFactor: 0, avgWin: 0, avgLoss: 0,
      bestTrade: 0, worstTrade: 0, equityCurve: [],
    };
  }

  const pnls        = validTrades.map(t => t.pnl!);
  const wins        = pnls.filter(p => p > 0);   // strictly positive = win
  const losses      = pnls.filter(p => p < 0);   // strictly negative = loss (breakeven excluded)
  const totalPnl    = pnls.reduce((a, b) => a + b, 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss   = Math.abs(losses.reduce((a, b) => a + b, 0));

  let equity = initialCapital;
  const equityCurve = validTrades.map(t => {
    equity += t.pnl!;
    return { time: t.exitTime!, value: equity };
  });

  return {
    totalTrades:  validTrades.length,
    winRate:      (wins.length / validTrades.length) * 100,
    totalPnl,
    profitFactor: grossLoss === 0 ? 999 : grossProfit / grossLoss,
    avgWin:       wins.length   ? grossProfit / wins.length   : 0,
    avgLoss:      losses.length ? grossLoss   / losses.length : 0,
    bestTrade:    pnls.reduce((max, p) => p > max ? p : max, pnls[0]),
    worstTrade:   pnls.reduce((min, p) => p < min ? p : min, pnls[0]),
    equityCurve,
  };
}
