"use client";

import { useMemo } from "react";
import { CalendarRange, Sun, Zap, Timer } from "lucide-react";
import {
  derivePnlBreakdown, SESSIONS, DURATION_BUCKETS, type DashboardStats,
} from "@/lib/trades/dashboard-stats";

interface Props {
  stats: DashboardStats;
}

const money = (n: number, withSign = false) => {
  const sign = n > 0 && withSign ? "+" : n < 0 ? "-" : withSign ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Session boundaries, duration thresholds and the month label formatter now
// live alongside the rollups in lib/trades/dashboard-stats.ts, so the bucket
// order here can't drift from the order the pipeline groups on.

export function PnlBreakdown({ stats }: Props) {
  // Monthly / session / duration rollups and the profitable-day ratio are all
  // grouped in Mongo now — see lib/trades/stats-pipeline.ts.
  const m = useMemo(() => derivePnlBreakdown(stats), [stats]);

  if (m.closedCount === 0) return null;

  return (
    <div className="space-y-4">
      {/* Monthly P&L rollup */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-white/55" />
            Monthly P&amp;L
          </h3>
          <span className="text-[10px] md:text-[11px] text-muted-foreground">
            <b className="text-white/70">{m.consistency.toFixed(0)}%</b> of days profitable
          </span>
        </div>
        <div className="space-y-1.5">
          {m.months.map((mo) => {
            const barPct = Math.min(100, (Math.abs(mo.net) / m.maxAbsMonthNet) * 100);
            const winRate = mo.count ? (mo.wins / mo.count) * 100 : 0;
            return (
              <div key={mo.key} className="flex items-center gap-2.5">
                <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground">{mo.label}</span>
                <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${mo.net >= 0 ? "bg-emerald-500/60" : "bg-red-500/60"}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className={`w-20 shrink-0 text-right text-[10px] font-mono font-semibold ${mo.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {money(mo.net, true)}
                </span>
                <span className="w-20 shrink-0 text-right text-[9px] text-muted-foreground">
                  {mo.count} trades · {winRate.toFixed(0)}% WR
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Trading sessions */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <Sun className="h-4 w-4 text-white/55" />
            Trading Sessions
          </h3>
          <div className="space-y-1.5">
            {SESSIONS.map((s) => {
              const v = m.sessions.get(s)!;
              const winRate = v.count ? (v.wins / v.count) * 100 : 0;
              return (
                <div key={s} className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11.5px] font-semibold text-card-foreground">{s}</span>
                    <span className="text-[9px] text-muted-foreground">{v.count ? `${v.count} · ${winRate.toFixed(0)}% WR` : "—"}</span>
                  </div>
                  <span className={`text-[11px] font-bold font-mono ${v.count === 0 ? "text-muted-foreground" : v.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {v.count ? money(v.net, true) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade duration buckets */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <Timer className="h-4 w-4 text-white/55" />
            Trade Duration
          </h3>
          <div className="space-y-1.5">
            {DURATION_BUCKETS.map((b) => {
              const v = m.buckets.get(b)!;
              const winRate = v.count ? (v.wins / v.count) * 100 : 0;
              return (
                <div key={b} className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="h-3 w-3 text-white/35 shrink-0" />
                    <span className="text-[11.5px] font-semibold text-card-foreground">{b}</span>
                    <span className="text-[9px] text-muted-foreground">{v.count ? `${v.count} · ${winRate.toFixed(0)}% WR` : "—"}</span>
                  </div>
                  <span className={`text-[11px] font-bold font-mono ${v.count === 0 ? "text-muted-foreground" : v.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {v.count ? money(v.net, true) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
