export interface CompilableTrade {
  _id: string;
  lots: number;
  profit: number;
  swap?: number;
  commission?: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string | Date;
  exitTime?: string | Date;
  parentTradeId?: string;
  mergedTradeIds?: string[];
}

// Manually-compiled ("merged") trades must count as exactly ONE trade in every
// stat — mirrors the aggregation app/trades/page.tsx already uses for display
// (sum profit/lots, weighted-avg entry/exit, earliest entry / latest exit).
// Without this, a 3-way compiled position gets counted (and its PnL summed)
// once per child plus once for the parent. Shared by the dashboard and the
// journal AI report so neither double-counts.
export function compileTrades<T extends CompilableTrade>(rawTrades: T[]): T[] {
  const byId = new Map(rawTrades.map((t) => [t._id, t]));
  const parents = rawTrades.filter((t) => !t.parentTradeId);

  return parents.map((parent) => {
    const children = (parent.mergedTradeIds ?? [])
      .map((id) => byId.get(id))
      .filter((t): t is T => !!t);
    if (children.length === 0) return parent;

    const group = [parent, ...children];
    let totalLots = 0, totalProfit = 0, totalSwap = 0, totalCommission = 0, weightedEntrySum = 0, weightedExitSum = 0, exitLots = 0;
    let earliestEntry = parent.entryTime, latestExit = parent.exitTime;

    for (const t of group) {
      totalLots += t.lots;
      totalProfit += t.profit;
      totalSwap += t.swap || 0;
      totalCommission += t.commission || 0;
      weightedEntrySum += t.entryPrice * t.lots;
      if (t.exitPrice) { weightedExitSum += t.exitPrice * t.lots; exitLots += t.lots; }
      if (new Date(t.entryTime) < new Date(earliestEntry)) earliestEntry = t.entryTime;
      if (t.exitTime && (!latestExit || new Date(t.exitTime) > new Date(latestExit))) latestExit = t.exitTime;
    }

    return {
      ...parent,
      lots: Number(totalLots.toFixed(2)),
      profit: Number(totalProfit.toFixed(2)),
      swap: Number(totalSwap.toFixed(2)),
      commission: Number(totalCommission.toFixed(2)),
      entryPrice: Number((weightedEntrySum / totalLots).toFixed(5)),
      exitPrice: exitLots > 0 ? Number((weightedExitSum / exitLots).toFixed(5)) : parent.exitPrice,
      entryTime: earliestEntry,
      exitTime: latestExit,
    };
  });
}
