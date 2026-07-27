import type { DashboardStats, StatsBucket } from "./stats-pipeline";

// ─── Server rollups → the shapes the dashboard components already render ────
//
// These used to be useMemo blocks reducing over every trade document in the
// browser. The reductions now happen in Mongo (lib/trades/stats-pipeline.ts);
// what's left here is the cheap final arithmetic — ratios, sorts, and the
// order-dependent streak walk — over a few dozen pre-grouped rows.
//
// Deliberately keeps each component's original field names and formulas so the
// JSX below them is untouched and the rendered numbers stay identical. Note
// two quirks preserved on purpose:
//   · TradingInsights' winRate divides by ALL closed trades, while the
//     StatsCards winRate divides by wins+losses (break-evens excluded).
//   · `fee` was never a field on TradeEntry, so the old `t.fee || 0` summed to
//     zero every time — totalFees stays 0 rather than silently disappearing.

export type { DashboardStats };

const bucket = <Id,>(rows: StatsBucket<Id>[], id: Id): StatsBucket<Id> =>
  rows.find((r) => r._id === id) ?? { _id: id, net: 0, count: 0, wins: 0 };

const pct = (num: number, den: number) => (den ? (num / den) * 100 : 0);

/** StatsCards + the dashboard page header. */
export function deriveTotals(s: DashboardStats) {
  const closed = s.totals.find((r) => r._id === "closed");
  const open = s.totals.find((r) => r._id === "open");
  const realized = closed?.net ?? 0;
  const unrealized = open?.net ?? 0;
  const wins = closed?.wins ?? 0;
  const losses = closed?.losses ?? 0;
  return {
    totalPnL: realized + unrealized,
    unrealized,
    realized,
    winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
    openTrades: open?.count ?? 0,
    closedTrades: closed?.count ?? 0,
    totalTrades: (open?.count ?? 0) + (closed?.count ?? 0),
  };
}

/** TradingInsights. */
export function deriveInsights(s: DashboardStats) {
  const i = s.insights;
  const grossLoss = Math.abs(i.grossLossRaw);
  // No `fee` field exists on TradeEntry — see note above.
  const totalFees = 0;
  const totalCosts = i.totalCommission + i.totalSwap + totalFees;
  const netTotal = i.grossProfit + i.totalCommission + i.totalSwap + totalFees;

  const dir = (d: "buy" | "sell") => {
    const b = bucket(s.byDirection, d);
    return { count: b.count, net: b.net, winRate: pct(b.wins, b.count) };
  };

  const symbols = s.bySymbol.map((b) => ({
    symbol: b._id,
    net: b.net,
    count: b.count,
    wins: b.wins,
    winRate: pct(b.wins, b.count),
  }));

  const { bestWinStreak, worstLossStreak, curStreak } = deriveStreaks(s.closedSigns);

  return {
    grossProfit: i.grossProfit,
    totalCommission: i.totalCommission,
    totalSwap: i.totalSwap,
    totalFees,
    totalCosts,
    netTotal,
    costRatio: Math.abs(i.grossProfit) > 0 ? (Math.abs(totalCosts) / Math.abs(i.grossProfit)) * 100 : 0,
    winRate: pct(i.winCount, i.closedCount),
    profitFactor: grossLoss === 0 ? (i.grossWin > 0 ? Infinity : 0) : i.grossWin / grossLoss,
    avgWin: i.winCount ? i.grossWin / i.winCount : 0,
    avgLoss: i.lossCount ? grossLoss / i.lossCount : 0,
    // Mean net over every closed trade, break-evens included.
    expectancy: i.closedCount ? (i.grossWin + i.grossLossRaw) / i.closedCount : 0,
    largestWin: i.largestWin ?? 0,
    largestLoss: i.largestLoss ?? 0,
    winCount: i.winCount,
    lossCount: i.lossCount,
    closedCount: i.closedCount,
    longs: dir("buy"),
    shorts: dir("sell"),
    symbols,
    bestSymbol: symbols[0],
    worstSymbol: symbols[symbols.length - 1],
    totalVolume: i.totalVolume,
    avgDuration: i.avgDuration,
    bestWinStreak,
    worstLossStreak,
    curStreak,
  };
}

/**
 * Win/loss streaks from the pipeline's chronological sign string ("+"/"-"/"0").
 * Streaks are inherently sequential, so this stays the original loop rather
 * than an aggregation — the string is ~4 KB for 3,400 closed trades.
 */
export function deriveStreaks(signs: string) {
  let bestWinStreak = 0, worstLossStreak = 0, curW = 0, curL = 0, curStreak = 0;
  for (const c of signs) {
    if (c === "+") { curW++; curL = 0; bestWinStreak = Math.max(bestWinStreak, curW); }
    else if (c === "-") { curL++; curW = 0; worstLossStreak = Math.max(worstLossStreak, curL); }
  }
  for (let i = signs.length - 1; i >= 0; i--) {
    const c = signs[i];
    if (c === "0") continue;
    const n = c === "+" ? 1 : -1;
    if (curStreak === 0) curStreak = n;
    else if ((curStreak > 0 && n > 0) || (curStreak < 0 && n < 0)) curStreak += n;
    else break;
  }
  return { bestWinStreak, worstLossStreak, curStreak };
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

export const SESSIONS = ["Asian", "London", "London/NY", "New York", "Late"] as const;
export const DURATION_BUCKETS = ["Scalp", "Intraday", "Swing"] as const;
export type Session = (typeof SESSIONS)[number];
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

/** PnlBreakdown. */
export function derivePnlBreakdown(s: DashboardStats) {
  const months = s.byMonth
    .map((b) => ({
      key: b._id,
      label: MONTH_FMT.format(new Date(`${b._id}-01T00:00:00`)),
      net: b.net,
      count: b.count,
      wins: b.wins,
    }))
    .slice(-6);

  const sessions = new Map<Session, { net: number; count: number; wins: number }>();
  for (const name of SESSIONS) {
    const b = bucket(s.bySession, name);
    sessions.set(name, { net: b.net, count: b.count, wins: b.wins });
  }

  const buckets = new Map<DurationBucket, { net: number; count: number; wins: number }>();
  for (const name of DURATION_BUCKETS) {
    const b = bucket(s.byDurationBucket, name);
    buckets.set(name, { net: b.net, count: b.count, wins: b.wins });
  }

  return {
    months,
    maxAbsMonthNet: Math.max(1, ...months.map((mo) => Math.abs(mo.net))),
    consistency: pct(s.closedByDay.filter((d) => d.pnl > 0).length, s.closedByDay.length),
    sessions,
    buckets,
    closedCount: s.insights.closedCount,
  };
}

/** AdvancedInsights. `scope` mirrors the component's week/all-time toggle. */
export function deriveAdvanced(s: DashboardStats, scope: "week" | "all") {
  const days = s.closedByDay.map((d) => ({ date: d._id, pnl: d.pnl }));
  const a = s.advanced;

  const rows = scope === "week" ? s.weekdayThisWeek : s.weekdayAllTime;
  const weekday = Array.from({ length: 7 }, (_, i) => {
    const b = bucket(rows, i);
    return { net: b.net, wins: b.wins, count: b.count };
  });

  return {
    bestDay: days.length ? days.reduce((x, y) => (y.pnl > x.pnl ? y : x)) : null,
    worstDay: days.length ? days.reduce((x, y) => (y.pnl < x.pnl ? y : x)) : null,
    weekday,
    maxAbsWeekdayNet: Math.max(1, ...weekday.map((w) => Math.abs(w.net))),
    maxDrawdown: a.maxDrawdown,
    avgPlannedRR: a.rrCount ? a.rrSum / a.rrCount : 0,
    slSetPct: pct(a.slSetCount, s.insights.closedCount),
    tpSetPct: pct(a.tpSetCount, s.insights.closedCount),
    journaledPct: pct(a.journaledCount, a.totalCount),
    avgRating: a.ratingCount ? a.ratingSum / a.ratingCount : 0,
    closedCount: s.insights.closedCount,
  };
}
