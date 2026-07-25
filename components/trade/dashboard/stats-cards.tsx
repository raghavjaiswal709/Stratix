"use client";

import type { ReactNode } from "react";
import { DollarSign, Target } from "lucide-react";

interface StatsCardsProps {
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  /** Extra grid cells rendered after Win Rate — e.g. ScheduledEventsPanel
   *  taking the width freed up by the removed Unrealized/Realized cards. */
  children?: ReactNode;
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function StatsCards({
  totalPnL,
  winRate,
  totalTrades,
  children,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3">
      {/* Total P&L */}
      <div className="h-full flex flex-col rounded-xl md:rounded-2xl border border-white/[0.10] bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-3 md:p-4 relative overflow-hidden">
        <div
          className="absolute top-2.5 right-2.5 h-7 w-7 md:h-9 md:w-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--dash-total, #fff) 18%, transparent)" }}
        >
          <DollarSign className="h-3.5 w-3.5 md:h-4 md:w-4" style={{ color: "var(--dash-total, rgba(255,255,255,0.65))" }} />
        </div>
        <span className="inline-block shrink-0 self-start text-[9px] md:text-[10px] font-semibold uppercase tracking-widest text-white/40 bg-white/[0.06] px-1.5 py-0.5 rounded-full border border-white/[0.10]">
          TOTAL
        </span>
        {/* Stretches to fill any extra row height (e.g. next to a taller Scheduled Events card) instead of leaving a dead gap below. */}
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[10px] md:text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Total P&L</p>
          <p className={`text-[16px] md:text-[22px] font-bold mt-0.5 leading-tight ${totalPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmt(totalPnL)}
          </p>
          <p className="text-[10px] md:text-[11px] text-white/50 mt-1">
            {totalTrades} trade{totalTrades !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Win Rate */}
      <div className="h-full flex flex-col rounded-xl md:rounded-2xl border border-border bg-card p-3 md:p-4 relative overflow-hidden">
        <div
          className="absolute top-2.5 right-2.5 h-7 w-7 md:h-9 md:w-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "color-mix(in srgb, var(--dash-metric, #fff) 15%, transparent)" }}
        >
          <Target className="h-3.5 w-3.5 md:h-4 md:w-4" style={{ color: "var(--dash-metric, rgba(255,255,255,0.55))" }} />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[10px] md:text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Win Rate</p>
          <p className="text-[16px] md:text-[22px] font-bold mt-0.5 leading-tight text-card-foreground">{winRate}%</p>
          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${winRate}%`, backgroundColor: "var(--dash-metric, rgba(255,255,255,0.08))" }}
            />
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
