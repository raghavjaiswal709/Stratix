"use client";

import { useEffect, useState, useMemo } from "react";
import { StatsCards } from "@/components/trade/dashboard/stats-cards";
import { PerformanceChart } from "@/components/trade/dashboard/performance-chart";
import { MonthlyCalendar } from "@/components/trade/dashboard/monthly-calendar";
import { OpenPositions } from "@/components/trade/dashboard/open-positions";
import { TradingInsights } from "@/components/trade/dashboard/trading-insights";
import { TradingQuotesModal } from "@/components/shared/trading-quotes";
import { SyncButton } from "@/components/trade/sync/sync-button";

import { ConnectMT5Form, DisconnectMT5Button } from "@/components/trade/mt5/connect-form";
import { format } from "date-fns";
import { useAppContext } from "@/lib/context";
import type { TradeMetrics } from "@/lib/trade-metrics";

interface MT5Info {
  connected: boolean;
  state: string;
  mt5Login?: string;
  mt5Server?: string;
  mt5AccountId?: string;
}

export default function DashboardPage() {
  const { activeProfileId, tradingProfiles, loading: contextLoading } = useAppContext();
  const [metrics, setMetrics] = useState<TradeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [mt5Info, setMt5Info] = useState<MT5Info | null>(null);
  const [mt5Loading, setMt5Loading] = useState(true);
  

  // Load precomputed metrics for the active profile. The numbers (win rate,
  // profit factor, P&L, streaks, …) are computed once and stored in the DB on
  // every trade mutation, so the dashboard never recalculates them on load.
  // AbortController cancels in-flight requests when the profile switches so
  // stale data from a previous profile never flashes on screen.
  useEffect(() => {
    if (contextLoading) return;

    const controller = new AbortController();
    const url =
      activeProfileId && activeProfileId !== "all"
        ? `/api/trade/metrics?profileId=${encodeURIComponent(activeProfileId)}`
        : "/api/trade/metrics";

    fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: TradeMetrics) => {
        // Guard against error payloads (e.g. 401) so a bad response can't crash render.
        if (data && data.stats) setMetrics(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });

    return () => controller.abort();
  }, [activeProfileId, contextLoading]);

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

  // Reconstruct lightweight per-trade points from the precomputed series so the
  // equity curve + calendar bucket by local calendar day exactly as before —
  // net P&L is carried on `profit`, with swap/commission already folded in.
  const chartTrades = useMemo(
    () =>
      (metrics?.series ?? []).map((p, i) => ({
        _id: `s${i}`,
        entryTime: new Date(p.t).toISOString(),
        profit: p.net,
        swap: 0,
        commission: 0,
        status: "closed" as const,
      })),
    [metrics]
  );

  // Show full-page spinner while context resolves OR while metrics are loading.
  // This prevents stats/charts from flashing zeros before data arrives.
  if (contextLoading || loading || !metrics) {
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
      <StatsCards {...metrics.stats} />

      {/* Charts — driven by the precomputed series */}
      <div className="grid gap-4 md:grid-cols-2">
        <PerformanceChart trades={chartTrades} loading={false} />
        <MonthlyCalendar trades={chartTrades} loading={false} />
      </div>

      {/* Costs, profit factor, direction & symbol insights */}
      <TradingInsights insights={metrics.insights} />

      <OpenPositions trades={metrics.openPositions} />

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
              <SyncButton />
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
