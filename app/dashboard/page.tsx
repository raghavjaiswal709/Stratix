"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { StatsCards } from "@/components/trade/dashboard/stats-cards";
import { PerformanceChart } from "@/components/trade/dashboard/performance-chart";
import { MonthlyCalendar } from "@/components/trade/dashboard/monthly-calendar";
import { OpenPositions } from "@/components/trade/dashboard/open-positions";
import { TradingInsights } from "@/components/trade/dashboard/trading-insights";
import { LatestNewsWidget } from "@/components/trade/dashboard/latest-news";
import { ScheduledEventsPanel } from "@/components/market-calendar/ScheduledEventsPanel";
import { PortfolioAIWidget } from "@/components/trade/dashboard/portfolio-ai";
import { TradingQuotesModal } from "@/components/shared/trading-quotes";
import { SyncButton } from "@/components/trade/sync/sync-button";
import { TradesTable } from "@/components/trade/sync/trades-table";
import { ConnectMT5Form, DisconnectMT5Button } from "@/components/trade/mt5/connect-form";
import { format } from "date-fns";
import { useAppContext } from "@/lib/context";
import { compileTrades } from "@/lib/trades/compile";
import { AdvancedInsights } from "@/components/trade/dashboard/advanced-insights";
import { PnlBreakdown } from "@/components/trade/dashboard/pnl-breakdown";
import { DASHBOARD_PALETTES } from "@/types";
import { cachedFetch, invalidateApiCache } from "@/lib/api-cache";

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
  riskRatio?: number;
  rewardRatio?: number;
  rating?: number;
  journaled?: boolean;
  parentTradeId?: string;
  mergedTradeIds?: string[];
  source?: "manual" | "mt5";
}

interface MT5Info {
  connected: boolean;
  state: string;
  mt5Login?: string;
  mt5Server?: string;
  mt5AccountId?: string;
}

export default function DashboardPage({ viewUserId }: { viewUserId?: string } = {}) {
  // Admin "view as" mode — set only when rendered inside /admin/view/[userId].
  // Read-only: the interactive MT5 Sync section (connect/disconnect/sync) is
  // replaced with a plain status line, since those controls act on whichever
  // account the session belongs to (the admin's own), never the member being
  // viewed — showing them here would be actively misleading, not just risky.
  const readOnly = !!viewUserId;
  // metaLoading (not the full-content `loading`) — the dashboard only needs
  // preferences + profiles, which the server already resolved in initialMeta.
  // Gating on `loading` used to serialize this page behind the multi-MB
  // /api/user-data fetch it never reads.
  const { activeProfileId, tradingProfiles, metaLoading, sharedTrades, setSharedTrades, preferences } = useAppContext();
  // "default"/unset = no palette active; PerformanceChart falls back to its
  // own emerald/red defaults. The app-wide token overrides + CSS catch-alls
  // (card top-stripe, header icons, badge rows) already come from
  // app/client-layout.tsx, which wraps this page — nothing more is needed here.
  const dashPalette = preferences.dashboardPalette && preferences.dashboardPalette !== "default"
    ? DASHBOARD_PALETTES.find((p) => p.id === preferences.dashboardPalette)
    : undefined;
  const trades = sharedTrades;
  const [loading, setLoading] = useState(sharedTrades.length === 0);
  const [mt5Info, setMt5Info] = useState<MT5Info | null>(null);
  const [mt5Loading, setMt5Loading] = useState(true);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);

  // Tracked via ref so the fetch effect doesn't depend on sharedTrades —
  // having sharedTrades.length in the deps made the effect re-fire after its
  // own setSharedTrades, fetching /api/trade twice on every mount.
  const hasCachedTradesRef = useRef(sharedTrades.length > 0);
  useEffect(() => {
    hasCachedTradesRef.current = sharedTrades.length > 0;
  }, [sharedTrades]);

  // Load manual trades — re-fetch when active profile changes. Served from
  // the shared api-cache when a fresh copy already exists (instant revisit),
  // and re-fetched fresh whenever another page reports a trade mutation.
  // requestId guards against a slow, now-stale request (e.g. from a profile
  // the user has already switched away from) overwriting newer state.
  const requestIdRef = useRef(0);
  const loadTrades = useCallback(
    (profileId: string, opts: { force?: boolean; silent?: boolean } = {}) => {
      const requestId = ++requestIdRef.current;
      if (!opts.silent && !hasCachedTradesRef.current) setLoading(true);
      const params = new URLSearchParams();
      if (profileId) params.set("profileId", profileId);
      if (viewUserId) params.set("viewUserId", viewUserId);
      const qs = params.toString();
      const url = qs ? `/api/trade?${qs}` : "/api/trade";

      cachedFetch<Trade[]>(url, { ttlMs: 30_000, force: opts.force, persist: true })
        .then((data) => {
          if (requestId !== requestIdRef.current) return; // superseded by a newer request
          setSharedTrades(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    },
    [setSharedTrades, viewUserId]
  );

  useEffect(() => {
    if (metaLoading) return;
    loadTrades(activeProfileId);
  }, [activeProfileId, metaLoading, loadTrades]);

  // Any trade mutation elsewhere (Trades page, Journal, MT5 sync) invalidates
  // the cache and re-syncs in the background — silent so it never flashes
  // the full-page spinner over an already-rendered dashboard.
  useEffect(() => {
    const handler = () => {
      invalidateApiCache("/api/trade");
      loadTrades(activeProfileId, { force: true, silent: true });
    };
    window.addEventListener("refresh-trades", handler);
    return () => window.removeEventListener("refresh-trades", handler);
  }, [activeProfileId, loadTrades]);

  // Load MT5 status
  useEffect(() => {
    const url = viewUserId
      ? `/api/mt5/status?viewUserId=${encodeURIComponent(viewUserId)}`
      : "/api/mt5/status";
    cachedFetch<MT5Info>(url, { ttlMs: 30_000, persist: true })
      .then((data) => {
        setMt5Info(data);
        setMt5Loading(false);
      })
      .catch(() => setMt5Loading(false));
  }, [viewUserId]);

  // A manually-compiled ("merged") position must count as exactly ONE trade
  // everywhere on this page — without this, every stat card, chart, and
  // insight below would double/triple-count merged trades (parent + children).
  const compiledTrades = useMemo(() => compileTrades(trades), [trades]);

  const stats = useMemo(() => {
    const closed = compiledTrades.filter((t) => t.status === "closed");
    const open = compiledTrades.filter((t) => t.status === "open");
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
      totalTrades: compiledTrades.length,
    };
  }, [compiledTrades]);

  // Show full-page spinner while meta resolves OR while trades are loading.
  // This prevents stats/charts from flashing zeros before data arrives.
  if (metaLoading || loading) {
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
    <div className="flex-1 space-y-6 p-4 md:p-6 pb-24">
      <TradingQuotesModal />
      {!readOnly && (
        <PortfolioAIWidget profileId={activeProfileId} />
      )}

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

      {/* Stats — Scheduled Events takes the Unrealized/Realized cards' old slot */}
      <StatsCards {...stats}>
        <ScheduledEventsPanel variant="compact" className="col-span-2" />
      </StatsCards>

      {/* Charts — each handles its own loading state */}
      <div className="grid gap-4 md:grid-cols-2">
        <PerformanceChart trades={compiledTrades} loading={loading} positiveColor={dashPalette?.positive} negativeColor={dashPalette?.negative} />
        <MonthlyCalendar  trades={compiledTrades} loading={loading} />
      </div>

      {/* Costs, profit factor, direction & symbol insights */}
      <TradingInsights trades={compiledTrades} />

      {/* Monthly P&L rollup, trading sessions, trade duration buckets */}
      <PnlBreakdown trades={compiledTrades} />

      {/* Best/worst day, weekday performance, risk discipline, journaling health */}
      <AdvancedInsights trades={compiledTrades} />

      <OpenPositions trades={compiledTrades.filter((t) => t.status === "open")} />

      {/* ── Latest News ──────────────────────────────────────────────────── */}
      <LatestNewsWidget />

      {/* ── MT5 section ──────────────────────────────────────────────────── */}
      {readOnly ? (
        // Admin view-as: SyncButton/ConnectMT5Form/DisconnectMT5Button/TradesTable
        // all act on whichever MT5 account belongs to the current session (the
        // admin's own), never the member being viewed — showing them here would
        // silently operate on the wrong account. A plain status line instead.
        <div className="rounded-xl border border-border bg-card p-5 space-y-1">
          <h2 className="text-sm font-semibold">MT5 Status</h2>
          {mt5Loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-3.5 w-3.5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
              <span>Checking MT5 status…</span>
            </div>
          ) : mt5Connected && mt5Info ? (
            <p className="text-xs text-muted-foreground">
              Connected — {mt5Info.mt5Login ?? "—"} @ {mt5Info.mt5Server ?? "—"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Not connected.</p>
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
