"use client";

import { DollarSign, Clock, CheckCircle2, Target } from "lucide-react";

interface StatsCardsProps {
  totalPnL: number;
  unrealized: number;
  realized: number;
  winRate: number;
  openTrades: number;
  closedTrades: number;
  totalTrades: number;
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function StatsCards({
  totalPnL,
  unrealized,
  realized,
  winRate,
  openTrades,
  closedTrades,
  totalTrades,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Total P&L */}
      <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-600/10 to-blue-900/5 p-4 relative overflow-hidden">
        <div className="absolute top-3 right-3 h-9 w-9 rounded-full bg-blue-600/20 flex items-center justify-center">
          <DollarSign className="h-4 w-4 text-blue-400" />
        </div>
        <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-widest text-blue-400/70 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
          TOTAL
        </span>
        <p className="mt-7 text-[11px] uppercase tracking-wider text-white/40 font-medium">Total P&L</p>
        <p className={`text-[22px] font-bold mt-0.5 ${totalPnL >= 0 ? "text-white" : "text-red-400"}`}>
          {fmt(totalPnL)}
        </p>
        <p className="text-[11px] text-blue-400/80 mt-1">
          → {totalTrades} trade{totalTrades !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Unrealized */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#141720] p-4 relative overflow-hidden">
        <div className="absolute top-3 right-3 h-9 w-9 rounded-full bg-amber-600/15 flex items-center justify-center">
          <Clock className="h-4 w-4 text-amber-400" />
        </div>
        <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mt-7">Unrealized</p>
        <p className={`text-[22px] font-bold mt-0.5 ${unrealized >= 0 ? "text-white" : "text-red-400"}`}>
          {fmt(unrealized)}
        </p>
        <p className="text-[11px] text-white/30 mt-1">{openTrades} open position{openTrades !== 1 ? "s" : ""}</p>
      </div>

      {/* Realized */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#141720] p-4 relative overflow-hidden">
        <div className="absolute top-3 right-3 h-9 w-9 rounded-full bg-emerald-600/15 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mt-7">Realized</p>
        <p className={`text-[22px] font-bold mt-0.5 ${realized >= 0 ? "text-white" : "text-red-400"}`}>
          {fmt(realized)}
        </p>
        <p className="text-[11px] text-white/30 mt-1">{closedTrades} closed trade{closedTrades !== 1 ? "s" : ""}</p>
      </div>

      {/* Win Rate */}
      <div className="rounded-2xl border border-white/[0.07] bg-[#141720] p-4 relative overflow-hidden">
        <div className="absolute top-3 right-3 h-9 w-9 rounded-full bg-violet-600/15 flex items-center justify-center">
          <Target className="h-4 w-4 text-violet-400" />
        </div>
        <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mt-7">Win Rate</p>
        <p className="text-[22px] font-bold mt-0.5 text-white">{winRate}%</p>
        <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-700"
            style={{ width: `${winRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}
