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
import { AdvancedInsights } from "@/components/trade/dashboard/advanced-insights";
import { PnlBreakdown } from "@/components/trade/dashboard/pnl-breakdown";
import { DASHBOARD_PALETTES } from "@/types";
import { cachedFetch, invalidateApiCache } from "@/lib/api-cache";
import { deriveTotals, type DashboardStats } from "@/lib/trades/dashboard-stats";

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
  const { activeProfileId, tradingProfiles, metaLoading, preferences } = useAppContext();
  // "default"/unset = no palette active; PerformanceChart falls back to its
  // own emerald/red defaults. The app-wide token overrides + CSS catch-alls
  // (card top-stripe, header icons, badge rows) already come from
  // app/client-layout.tsx, which wraps this page — nothing more is needed here.
  const dashPalette = preferences.dashboardPalette && preferences.dashboardPalette !== "default"
    ? DASHBOARD_PALETTES.find((p) => p.id === preferences.dashboardPalette)
    : undefined;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [mt5Info, setMt5Info] = useState<MT5Info | null>(null);
  const [mt5Loading, setMt5Loading] = useState(true);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);

  // Tracked via ref so the fetch effect doesn't depend on `stats` — putting it
  // in the deps would re-fire the effect after its own setStats, fetching twice
  // on every mount.
  const hasStatsRef = useRef(false);
  useEffect(() => {
    hasStatsRef.current = stats !== null;
  }, [stats]);

  // Load the pre-rolled dashboard numbers — re-fetch when the active profile
  // changes. This used to pull every trade document (3.62 MB / ~3.7s) purely to
  // reduce it in the browser; /api/trade/stats does the rollups in Mongo and
  // returns ~76 KB. Served from the shared api-cache when a fresh copy exists,
  // and re-fetched whenever another page reports a trade mutation. requestId
  // guards against a slow, now-stale request (e.g. from a profile the user has
  // already switched away from) overwriting newer state.
  const requestIdRef = useRef(0);
  const loadStats = useCallback(
    (profileId: string, opts: { force?: boolean; silent?: boolean } = {}) => {
      const requestId = ++requestIdRef.current;
      if (!opts.silent && !hasStatsRef.current) setLoading(true);
      const params = new URLSearchParams();
      if (profileId) params.set("profileId", profileId);
      if (viewUserId) params.set("viewUserId", viewUserId);
      const qs = params.toString();
      const url = qs ? `/api/trade/stats?${qs}` : "/api/trade/stats";

      cachedFetch<DashboardStats>(url, { ttlMs: 30_000, force: opts.force, persist: true })
        .then((data) => {
          if (requestId !== requestIdRef.current) return; // superseded by a newer request
          setStats(data ?? null);
          setLoading(false);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    },
    [viewUserId]
  );

  useEffect(() => {
    if (metaLoading) return;
    loadStats(activeProfileId);
  }, [activeProfileId, metaLoading, loadStats]);

  // Any trade mutation elsewhere (Trades page, Journal, MT5 sync) invalidates
  // the cache and re-syncs in the background — silent so it never flashes
  // the full-page spinner over an already-rendered dashboard.
  useEffect(() => {
    const handler = () => {
      invalidateApiCache("/api/trade");
      loadStats(activeProfileId, { force: true, silent: true });
    };
    window.addEventListener("refresh-trades", handler);
    return () => window.removeEventListener("refresh-trades", handler);
  }, [activeProfileId, loadStats]);

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

  // Merged ("compiled") positions already count as exactly ONE trade here —
  // the aggregation collapses parent + children before any rollup runs, so
  // nothing on this page double-counts them.
  const totals = useMemo(() => (stats ? deriveTotals(stats) : null), [stats]);

  // Show full-page spinner while meta resolves OR while stats are loading.
  // This prevents stats/charts from flashing zeros before data arrives.
  if (metaLoading || loading || !stats || !totals) {
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
      <StatsCards {...totals}>
        <ScheduledEventsPanel variant="compact" className="col-span-2" />
      </StatsCards>

      {/* Charts — each handles its own loading state */}
      <div className="grid gap-4 md:grid-cols-2">
        <PerformanceChart byEntryDay={stats.byEntryDay} loading={loading} positiveColor={dashPalette?.positive} negativeColor={dashPalette?.negative} />
        <MonthlyCalendar byEntryDay={stats.byEntryDay} loading={loading} profileId={activeProfileId} viewUserId={viewUserId} />
      </div>

      {/* Costs, profit factor, direction & symbol insights */}
      <TradingInsights stats={stats} />

      {/* Monthly P&L rollup, trading sessions, trade duration buckets */}
      <PnlBreakdown stats={stats} />

      {/* Best/worst day, weekday performance, risk discipline, journaling health */}
      <AdvancedInsights stats={stats} />

      <OpenPositions trades={stats.openPositions} />

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
