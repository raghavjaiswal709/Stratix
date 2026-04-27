"use client";

import { useEffect, useState, useMemo } from "react";
import { StatsCards } from "@/components/trade/dashboard/stats-cards";
import { PerformanceChart } from "@/components/trade/dashboard/performance-chart";
import { MonthlyCalendar } from "@/components/trade/dashboard/monthly-calendar";
import { OpenPositions } from "@/components/trade/dashboard/open-positions";
import { TradingQuotesModal } from "@/components/shared/trading-quotes";
import { format } from "date-fns";

interface Trade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  profit: number;
  status: "open" | "closed";
  stopLoss?: number;
  takeProfit?: number;
}

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trade")
      .then((r) => r.json())
      .then((data) => {
        setTrades(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.status === "closed");
    const open = trades.filter((t) => t.status === "open");
    const realized = closed.reduce((s, t) => s + t.profit, 0);
    const unrealized = open.reduce((s, t) => s + t.profit, 0);
    const wins = closed.filter((t) => t.profit > 0).length;
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
    return {
      totalPnL: realized + unrealized,
      unrealized,
      realized,
      winRate,
      openTrades: open.length,
      closedTrades: closed.length,
      totalTrades: trades.length,
    };
  }, [trades]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <TradingQuotesModal />
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-foreground">Dashboard</h1>
          <p className="text-[11px] md:text-[12px] text-muted-foreground">{format(today, "EEE, MMM d")}</p>
        </div>
      </div>

      {/* Stats cards */}
      <StatsCards {...stats} />

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4 md:gap-5">
        <PerformanceChart trades={trades} />
        <MonthlyCalendar trades={trades} />
      </div>

      {/* Open positions */}
      <OpenPositions trades={trades.filter((t) => t.status === "open")} />
    </div>
  );
}
