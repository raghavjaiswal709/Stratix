// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for every dashboard trade metric.
//
// This module is intentionally pure and deterministic: the exact same numbers it
// produces on the server (when persisting to the TradeMetrics collection) are the
// numbers the dashboard renders. The formulas here are copied verbatim from the
// previous client-side calculations in:
//   - app/dashboard/page.tsx              (StatsCards summary)
//   - components/trade/dashboard/trading-insights.tsx (performance insights)
//   - components/trade/dashboard/performance-chart.tsx / monthly-calendar.tsx (series)
// so the migration to DB-backed metrics changes WHERE they are computed, never the
// resulting values.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal trade shape required to compute every metric. */
export interface MetricsTrade {
  _id?: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  profit: number;
  swap?: number | null;
  commission?: number | null;
  fee?: number | null;
  status: "open" | "closed";
  entryTime: string | Date;
  exitTime?: string | Date | null;
}

/** Top stat cards (Total P&L, Unrealized, Realized, Win Rate). */
export interface StatsSummary {
  totalPnL: number;
  unrealized: number;
  realized: number;
  /** Rounded integer %. wins / (wins + losses) on a net basis (breakeven excluded). */
  winRate: number;
  openTrades: number;
  closedTrades: number;
  totalTrades: number;
}

export interface DirectionStat {
  count: number;
  net: number;
  winRate: number;
}

export interface SymbolStat {
  symbol: string;
  net: number;
  count: number;
  wins: number;
  winRate: number;
}

/** Everything rendered by the Trading Insights panel. */
export interface InsightsSummary {
  // Cost breakdown (across all trades)
  grossProfit: number;
  totalCommission: number;
  totalSwap: number;
  totalFees: number;
  totalCosts: number;
  netTotal: number;
  costRatio: number;
  // Win/loss on a net basis (closed trades)
  /** Unrounded %. wins / closed (breakeven included in denominator). */
  winRate: number;
  /** null represents an infinite profit factor (gross loss = 0, gross win > 0). */
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  largestWin: number;
  largestLoss: number;
  winCount: number;
  lossCount: number;
  closedCount: number;
  // Direction + symbol breakdowns
  longs: DirectionStat;
  shorts: DirectionStat;
  symbols: SymbolStat[];
  // Volume, duration, streaks
  totalVolume: number;
  avgDuration: number; // milliseconds
  bestWinStreak: number;
  worstLossStreak: number;
  curStreak: number; // positive = win streak, negative = loss streak, 0 = none
}

/** One point per trade, used to drive the equity curve + monthly calendar. */
export interface ChartPoint {
  /** entryTime as epoch ms — the client buckets by local calendar day exactly as before. */
  t: number;
  /** net P&L for the trade (profit + swap + commission + fee). */
  net: number;
}

export interface OpenPosition {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  entryTime: string;
}

/** The full precomputed payload persisted per (user, profile) and read by the dashboard. */
export interface TradeMetrics {
  stats: StatsSummary;
  insights: InsightsSummary;
  series: ChartPoint[];
  openPositions: OpenPosition[];
  totalTrades: number;
}

const toMs = (d: string | Date | null | undefined): number =>
  d ? new Date(d).getTime() : NaN;

/** Net P&L of a trade. fee is always absent on the current schema (defaults to 0). */
const netOf = (t: MetricsTrade): number =>
  t.profit + (t.swap || 0) + (t.commission || 0) + (t.fee || 0);

/**
 * Compute the complete metrics payload for a set of trades.
 * Pure — no I/O, no Date.now(), no randomness.
 */
export function computeTradeMetrics(trades: MetricsTrade[]): TradeMetrics {
  const closed = trades.filter((t) => t.status === "closed");
  const open = trades.filter((t) => t.status === "open");

  // ── Stat cards summary ──────────────────────────────────────────────────────
  const realized = closed.reduce((s, t) => s + netOf(t), 0);
  const unrealized = open.reduce((s, t) => s + netOf(t), 0);
  const sWins = closed.filter((t) => netOf(t) > 0).length;
  const sLosses = closed.filter((t) => netOf(t) < 0).length;
  const statsWinRate =
    sWins + sLosses > 0 ? Math.round((sWins / (sWins + sLosses)) * 100) : 0;

  const stats: StatsSummary = {
    totalPnL: realized + unrealized,
    unrealized,
    realized,
    winRate: statsWinRate,
    openTrades: open.length,
    closedTrades: closed.length,
    totalTrades: trades.length,
  };

  // ── Cost breakdown (across ALL trades) ──────────────────────────────────────
  const grossProfit = trades.reduce((s, t) => s + t.profit, 0);
  const totalCommission = trades.reduce((s, t) => s + (t.commission || 0), 0);
  const totalSwap = trades.reduce((s, t) => s + (t.swap || 0), 0);
  const totalFees = trades.reduce((s, t) => s + (t.fee || 0), 0);
  const netTotal = grossProfit + totalCommission + totalSwap + totalFees;
  const totalCosts = totalCommission + totalSwap + totalFees;
  const costRatio =
    Math.abs(grossProfit) > 0
      ? (Math.abs(totalCosts) / Math.abs(grossProfit)) * 100
      : 0;

  // ── Win/loss on a NET basis (closed trades) ─────────────────────────────────
  const nets = closed.map(netOf);
  const winsArr = nets.filter((n) => n > 0);
  const lossesArr = nets.filter((n) => n < 0);
  const grossWin = winsArr.reduce((s, n) => s + n, 0);
  const grossLoss = Math.abs(lossesArr.reduce((s, n) => s + n, 0));
  const insightsWinRate = closed.length ? (winsArr.length / closed.length) * 100 : 0;
  const profitFactor =
    grossLoss === 0 ? (grossWin > 0 ? null : 0) : grossWin / grossLoss;
  const avgWin = winsArr.length ? grossWin / winsArr.length : 0;
  const avgLoss = lossesArr.length ? grossLoss / lossesArr.length : 0;
  const netClosedTotal = nets.reduce((s, n) => s + n, 0);
  const expectancy = closed.length ? netClosedTotal / closed.length : 0;
  const largestWin = winsArr.length
    ? winsArr.reduce((mx, w) => (w > mx ? w : mx), winsArr[0])
    : 0;
  const largestLoss = lossesArr.length
    ? lossesArr.reduce((mn, l) => (l < mn ? l : mn), lossesArr[0])
    : 0;

  // ── Direction split (closed trades) ─────────────────────────────────────────
  const dir = (d: "buy" | "sell"): DirectionStat => {
    const set = closed.filter((t) => t.direction === d);
    const w = set.filter((t) => netOf(t) > 0).length;
    return {
      count: set.length,
      net: set.reduce((s, t) => s + netOf(t), 0),
      winRate: set.length ? (w / set.length) * 100 : 0,
    };
  };
  const longs = dir("buy");
  const shorts = dir("sell");

  // ── Per-symbol breakdown (closed trades) ────────────────────────────────────
  const bySym = new Map<string, { net: number; count: number; wins: number }>();
  for (const t of closed) {
    const cur = bySym.get(t.symbol) || { net: 0, count: 0, wins: 0 };
    cur.net += netOf(t);
    cur.count += 1;
    if (netOf(t) > 0) cur.wins += 1;
    bySym.set(t.symbol, cur);
  }
  const symbols: SymbolStat[] = Array.from(bySym.entries())
    .map(([symbol, v]) => ({
      symbol,
      ...v,
      winRate: v.count ? (v.wins / v.count) * 100 : 0,
    }))
    .sort((a, b) => b.net - a.net);

  // ── Volume & duration ───────────────────────────────────────────────────────
  const totalVolume = trades.reduce((s, t) => s + (t.lots || 0), 0);
  const durations = closed
    .filter((t) => t.exitTime && t.entryTime)
    .map((t) => toMs(t.exitTime) - toMs(t.entryTime))
    .filter((d) => d > 0);
  const avgDuration = durations.length
    ? durations.reduce((s, d) => s + d, 0) / durations.length
    : 0;

  // ── Streaks (closed, chronological by exit/entry time) ──────────────────────
  const chrono = [...closed].sort((a, b) => {
    const ta = toMs(a.exitTime || a.entryTime);
    const tb = toMs(b.exitTime || b.entryTime);
    return ta - tb;
  });
  let bestWinStreak = 0,
    worstLossStreak = 0,
    curW = 0,
    curL = 0,
    curStreak = 0;
  for (const t of chrono) {
    const n = netOf(t);
    if (n > 0) {
      curW++;
      curL = 0;
      bestWinStreak = Math.max(bestWinStreak, curW);
    } else if (n < 0) {
      curL++;
      curW = 0;
      worstLossStreak = Math.max(worstLossStreak, curL);
    }
  }
  // current streak measured from the most recent trade backwards
  for (let i = chrono.length - 1; i >= 0; i--) {
    const n = netOf(chrono[i]);
    if (n === 0) continue;
    if (curStreak === 0) curStreak = n > 0 ? 1 : -1;
    else if ((curStreak > 0 && n > 0) || (curStreak < 0 && n < 0))
      curStreak += n > 0 ? 1 : -1;
    else break;
  }

  const insights: InsightsSummary = {
    grossProfit,
    totalCommission,
    totalSwap,
    totalFees,
    totalCosts,
    netTotal,
    costRatio,
    winRate: insightsWinRate,
    profitFactor,
    avgWin,
    avgLoss,
    expectancy,
    largestWin,
    largestLoss,
    winCount: winsArr.length,
    lossCount: lossesArr.length,
    closedCount: closed.length,
    longs,
    shorts,
    symbols,
    totalVolume,
    avgDuration,
    bestWinStreak,
    worstLossStreak,
    curStreak,
  };

  // ── Chart series — one point per trade (open + closed), keyed by entryTime ───
  // The client buckets these by local calendar day, identical to the previous
  // per-trade bucketing, so the equity curve + monthly calendar are unchanged.
  const series: ChartPoint[] = trades
    .map((t) => ({ t: toMs(t.entryTime), net: netOf(t) }))
    .filter((p) => !Number.isNaN(p.t));

  // ── Open positions snapshot ─────────────────────────────────────────────────
  const openPositions: OpenPosition[] = open.map((t) => ({
    _id: String(t._id ?? ""),
    symbol: t.symbol,
    direction: t.direction,
    lots: t.lots,
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss ?? undefined,
    takeProfit: t.takeProfit ?? undefined,
    profit: t.profit,
    entryTime:
      typeof t.entryTime === "string"
        ? t.entryTime
        : new Date(t.entryTime).toISOString(),
  }));

  return { stats, insights, series, openPositions, totalTrades: trades.length };
}

/** An empty metrics payload — used when a scope has no trades. */
export function emptyTradeMetrics(): TradeMetrics {
  return computeTradeMetrics([]);
}
