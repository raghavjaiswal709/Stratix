"use client";

import { useEffect, useState, useMemo } from "react";
import { StatsCards } from "@/components/trade/dashboard/stats-cards";
import { PerformanceChart } from "@/components/trade/dashboard/performance-chart";
import { MonthlyCalendar } from "@/components/trade/dashboard/monthly-calendar";
import { OpenPositions } from "@/components/trade/dashboard/open-positions";
import { TradingInsights } from "@/components/trade/dashboard/trading-insights";
import { TradingQuotesModal } from "@/components/shared/trading-quotes";
import { SyncButton } from "@/components/trade/sync/sync-button";
import { TradesTable } from "@/components/trade/sync/trades-table";
import { ConnectMT5Form, DisconnectMT5Button } from "@/components/trade/mt5/connect-form";
import { format } from "date-fns";
import { useAppContext } from "@/lib/context";

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
  swap?: number;
  commission?: number;
  status: "open" | "closed";
  stopLoss?: number;
  takeProfit?: number;
}

interface MT5Info {
  connected: boolean;
  state: string;
  mt5Login?: string;
  mt5Server?: string;
  mt5AccountId?: string;
}

export default function DashboardPage() {
  const { activeProfileId, tradingProfiles, loading: contextLoading, sharedTrades, setSharedTrades } = useAppContext();
  const trades = sharedTrades;
  const [loading, setLoading] = useState(sharedTrades.length === 0);
  const [mt5Info, setMt5Info] = useState<MT5Info | null>(null);
  const [mt5Loading, setMt5Loading] = useState(true);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);

  // Load manual trades — re-fetch when active profile changes.
  // AbortController cancels in-flight requests when the profile switches so
  // stale data from a previous profile never flashes on screen.
  useEffect(() => {
    if (contextLoading) return;

    const controller = new AbortController();
    if (sharedTrades.length === 0) {
      setLoading(true);
    }
    const url = activeProfileId
      ? `/api/trade?profileId=${encodeURIComponent(activeProfileId)}`
      : "/api/trade";

    fetch(url, { 
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    })
      .then((r) => r.json())
      .then((data) => {
        setSharedTrades(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });

    return () => controller.abort();
  }, [activeProfileId, contextLoading, setSharedTrades, sharedTrades.length]);

  // Load MT5 status
  useEffect(() => {
    fetch("/api/mt5/status")
      .then((r) => r.json())
      .then((data: MT5Info) => {
        setMt5Info(data);
        setMt5Loading(false);
      })
      .catch(() => setMt5Loading(false));
  }, []);

  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.status === "closed");
    const open = trades.filter((t) => t.status === "open");
    const netProfit = (t: Trade) => t.profit + (t.swap || 0) + (t.commission || 0);
    const realized = closed.reduce((s, t) => s + netProfit(t), 0);
    const unrealized = open.reduce((s, t) => s + netProfit(t), 0);
    const wins = closed.filter((t) => netProfit(t) > 0).length;
    const losses = closed.filter((t) => netProfit(t) < 0).length;
    const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
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

  // Show full-page spinner while context resolves OR while trades are loading.
  // This prevents stats/charts from flashing zeros before data arrives.
  if (contextLoading || loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  const today = new Date();
  const mt5Connected = mt5Info?.connected === true;
  const activeProfile = tradingProfiles.find((p) => p.id === activeProfileId);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6">
      <TradingQuotesModal />

      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {format(today, "EEEE, MMMM d")}
            {activeProfile && (
              <span className="ml-2 text-white/40">
                · {activeProfile.name}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Stats */}
      <StatsCards {...stats} />

      {/* Charts — each handles its own loading state */}
      <div className="grid gap-4 md:grid-cols-2">
        <PerformanceChart trades={trades} loading={loading} />
        <MonthlyCalendar  trades={trades} loading={loading} />
      </div>

      {/* Costs, profit factor, direction & symbol insights */}
      <TradingInsights trades={trades} />

      <OpenPositions trades={trades.filter((t) => t.status === "open")} />

      {/* ── MT5 section ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">MT5 Sync</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect your MetaTrader 5 account to sync your trade history.
            </p>
          </div>

          {/* Show sync button + disconnect when connected */}
          {mt5Connected && mt5Info && (
            <div className="flex items-center gap-3 shrink-0">
              <SyncButton onComplete={() => setSyncRefreshKey((k) => k + 1)} />
            </div>
          )}
        </div>

        {mt5Loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-3.5 w-3.5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
            <span>Checking MT5 status…</span>
          </div>
        ) : mt5Connected && mt5Info ? (
          <>
            <DisconnectMT5Button
              mt5Login={mt5Info.mt5Login ?? ""}
              mt5Server={mt5Info.mt5Server ?? ""}
              onDisconnected={() => setMt5Info({ state: "NONE", connected: false })}
            />
            <TradesTable refreshKey={syncRefreshKey} />
          </>
        ) : (
          <ConnectMT5Form
            deployingAccountId={
              mt5Info?.mt5AccountId && mt5Info.state !== "NONE" && !mt5Info.connected
                ? mt5Info.mt5AccountId
                : undefined
            }
            onConnected={(info) =>
              setMt5Info({
                state: "DEPLOYED",
                connected: true,
                mt5Login: info.mt5Login,
                mt5Server: info.mt5Server,
                mt5AccountId: info.mt5AccountId,
              })
            }
          />
        )}
      </div>
    </div>
  );
}
