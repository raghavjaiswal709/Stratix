import type { Trade, TradeResult } from "@/types";
import { parseISO, differenceInMinutes, format, getDay } from "date-fns";

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function calculatePnL(trade: Partial<Trade>): number {
  const { entryPrice, exitPrice, quantity, tradeType } = trade;
  if (!entryPrice || !exitPrice || !quantity) return 0;
  if (tradeType === "long") {
    return (exitPrice - entryPrice) * quantity;
  }
  return (entryPrice - exitPrice) * quantity;
}

export function calculatePnLPercent(trade: Partial<Trade>): number {
  const { entryPrice, exitPrice, tradeType } = trade;
  if (!entryPrice || !exitPrice) return 0;
  if (tradeType === "long") {
    return ((exitPrice - entryPrice) / entryPrice) * 100;
  }
  return ((entryPrice - exitPrice) / entryPrice) * 100;
}

export function calculateRRR(trade: Partial<Trade>): number {
  const { entryPrice, stopLoss, takeProfit, tradeType } = trade;
  if (!entryPrice || !stopLoss || !takeProfit) return 0;
  const risk =
    tradeType === "long"
      ? entryPrice - stopLoss
      : stopLoss - entryPrice;
  const reward =
    tradeType === "long"
      ? takeProfit - entryPrice
      : entryPrice - takeProfit;
  if (risk <= 0) return 0;
  return Math.round((reward / risk) * 100) / 100;
}

export function determineResult(pnl: number): TradeResult {
  if (pnl > 0) return "win";
  if (pnl < 0) return "loss";
  return "breakeven";
}

// Performance Metrics
export function getWinRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter((t) => t.result === "win").length;
  return Math.round((wins / trades.length) * 100);
}

export function getTotalPnL(trades: Trade[]): number {
  return trades.reduce((sum, t) => sum + t.pnl, 0);
}

export function getAvgPnL(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  return getTotalPnL(trades) / trades.length;
}

export function getAvgWin(trades: Trade[]): number {
  const wins = trades.filter((t) => t.result === "win");
  if (wins.length === 0) return 0;
  return wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
}

export function getAvgLoss(trades: Trade[]): number {
  const losses = trades.filter((t) => t.result === "loss");
  if (losses.length === 0) return 0;
  return losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length;
}

export function getProfitFactor(trades: Trade[]): number {
  const grossProfit = trades
    .filter((t) => t.pnl > 0)
    .reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(
    trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0)
  );
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return Math.round((grossProfit / grossLoss) * 100) / 100;
}

export function getExpectancy(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const winRate = getWinRate(trades) / 100;
  const avgW = getAvgWin(trades);
  const avgL = Math.abs(getAvgLoss(trades));
  return winRate * avgW - (1 - winRate) * avgL;
}

export function getMaxDrawdown(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const sorted = [...trades].sort(
    (a, b) => new Date(a.exitDate).getTime() - new Date(b.exitDate).getTime()
  );
  let peak = 0;
  let cumPnl = 0;
  let maxDD = 0;
  for (const trade of sorted) {
    cumPnl += trade.pnl;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function getMaxConsecutive(
  trades: Trade[],
  type: "win" | "loss"
): number {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.exitDate).getTime() - new Date(b.exitDate).getTime()
  );
  let max = 0;
  let current = 0;
  for (const trade of sorted) {
    if (trade.result === type) {
      current++;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

export function getBestTrade(trades: Trade[]): Trade | null {
  if (trades.length === 0) return null;
  return trades.reduce((best, t) => (t.pnl > best.pnl ? t : best), trades[0]);
}

export function getWorstTrade(trades: Trade[]): Trade | null {
  if (trades.length === 0) return null;
  return trades.reduce(
    (worst, t) => (t.pnl < worst.pnl ? t : worst),
    trades[0]
  );
}

export function getAvgHoldDuration(trades: Trade[]): string {
  if (trades.length === 0) return "0m";
  const totalMinutes = trades.reduce((sum, t) => {
    const entry = parseISO(t.entryDate);
    const exit = parseISO(t.exitDate);
    return sum + differenceInMinutes(exit, entry);
  }, 0);
  const avgMin = totalMinutes / trades.length;
  if (avgMin < 60) return `${Math.round(avgMin)}m`;
  if (avgMin < 1440) return `${Math.round(avgMin / 60)}h`;
  return `${Math.round(avgMin / 1440)}d`;
}

export function getEquityCurve(
  trades: Trade[]
): { date: string; cumPnl: number }[] {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.exitDate).getTime() - new Date(b.exitDate).getTime()
  );
  let cumPnl = 0;
  return sorted.map((t) => {
    cumPnl += t.pnl;
    return { date: format(parseISO(t.exitDate), "MMM dd"), cumPnl };
  });
}

export function getPnLByDayOfWeek(
  trades: Trade[]
): { day: string; pnl: number }[] {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDay: Record<string, number[]> = {};
  days.forEach((d) => (byDay[d] = []));

  trades.forEach((t) => {
    const dayIndex = getDay(parseISO(t.entryDate));
    byDay[days[dayIndex]].push(t.pnl);
  });

  return days.map((d) => ({
    day: d,
    pnl: byDay[d].length > 0
      ? byDay[d].reduce((a, b) => a + b, 0)
      : 0,
  }));
}

export function getPnLByAssetClass(
  trades: Trade[]
): { assetClass: string; pnl: number }[] {
  const map: Record<string, number> = {};
  trades.forEach((t) => {
    map[t.assetClass] = (map[t.assetClass] || 0) + t.pnl;
  });
  return Object.entries(map).map(([assetClass, pnl]) => ({
    assetClass,
    pnl,
  }));
}

export function getPnLByStrategy(
  trades: Trade[]
): { strategy: string; pnl: number }[] {
  const map: Record<string, number> = {};
  trades.forEach((t) => {
    if (t.strategy) {
      map[t.strategy] = (map[t.strategy] || 0) + t.pnl;
    }
  });
  return Object.entries(map).map(([strategy, pnl]) => ({
    strategy,
    pnl,
  }));
}

export function getPnLByEmotion(
  trades: Trade[]
): { emotion: string; avgPnl: number }[] {
  const map: Record<string, number[]> = {};
  trades.forEach((t) => {
    if (t.emotionalState) {
      if (!map[t.emotionalState]) map[t.emotionalState] = [];
      map[t.emotionalState].push(t.pnl);
    }
  });
  return Object.entries(map).map(([emotion, pnls]) => ({
    emotion,
    avgPnl:
      pnls.length > 0
        ? Math.round(pnls.reduce((a, b) => a + b, 0) / pnls.length)
        : 0,
  }));
}

export function getWinLossDistribution(
  trades: Trade[]
): { name: string; value: number }[] {
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const breakeven = trades.filter((t) => t.result === "breakeven").length;
  return [
    { name: "Wins", value: wins },
    { name: "Losses", value: losses },
    { name: "Breakeven", value: breakeven },
  ];
}

export function getRRRDistribution(
  trades: Trade[]
): { range: string; count: number }[] {
  const ranges = [
    { range: "0-0.5", min: 0, max: 0.5 },
    { range: "0.5-1", min: 0.5, max: 1 },
    { range: "1-1.5", min: 1, max: 1.5 },
    { range: "1.5-2", min: 1.5, max: 2 },
    { range: "2-3", min: 2, max: 3 },
    { range: "3+", min: 3, max: Infinity },
  ];
  return ranges.map(({ range, min, max }) => ({
    range,
    count: trades.filter((t) => t.rrr >= min && t.rrr < max).length,
  }));
}

export function getStopLossHitRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const hits = trades.filter((t) => {
    if (t.tradeType === "long") return t.exitPrice <= t.stopLoss;
    return t.exitPrice >= t.stopLoss;
  }).length;
  return Math.round((hits / trades.length) * 100);
}

export function getTargetHitRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const hits = trades.filter((t) => {
    if (t.tradeType === "long") return t.exitPrice >= t.takeProfit;
    return t.exitPrice <= t.takeProfit;
  }).length;
  return Math.round((hits / trades.length) * 100);
}

export function getEntryAccuracy(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const accurate = trades.filter((t) => t.result === "win").length;
  return Math.round((accurate / trades.length) * 100);
}
