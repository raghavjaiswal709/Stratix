"use client";

import {
  Receipt, Repeat, Scale, Crown, Flame, Snowflake,
  ArrowUpRight, ArrowDownRight, Layers, Clock3, Activity,
} from "lucide-react";
import type { InsightsSummary } from "@/lib/trade-metrics";

interface Props {
  // Precomputed on the server (lib/trade-metrics.ts) and fetched from the DB —
  // this component no longer derives any numbers itself.
  insights: InsightsSummary;
}

const money = (n: number, withSign = false) => {
  const sign = n > 0 && withSign ? "+" : n < 0 ? "-" : withSign ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDuration = (ms: number) => {
  if (!isFinite(ms) || ms <= 0) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
};

export function TradingInsights({ insights: m }: Props) {
  if (m.closedCount === 0) return null;

  const costShare = (v: number) =>
    m.totalCosts !== 0 ? `${((Math.abs(v) / Math.abs(m.totalCosts)) * 100).toFixed(0)}%` : "0%";

  return (
    <div className="space-y-4">
      {/* ── Net Result Breakdown ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground flex items-center gap-2">
            <Receipt className="h-4 w-4 text-white/55" />
            Net Result Breakdown
          </h3>
          <span className="text-[10px] md:text-[11px] text-muted-foreground">
            Costs are <b className="text-white/70">{m.costRatio.toFixed(1)}%</b> of gross
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
          <BreakdownCell label="Gross Profit" value={m.grossProfit} sub="before costs" icon={<Activity className="h-3.5 w-3.5" />} />
          <BreakdownCell label="Commission" value={m.totalCommission} sub={costShare(m.totalCommission) + " of costs"} icon={<Receipt className="h-3.5 w-3.5" />} muted />
          <BreakdownCell label="Swap" value={m.totalSwap} sub={costShare(m.totalSwap) + " of costs"} icon={<Repeat className="h-3.5 w-3.5" />} muted />
          <BreakdownCell label="Fees" value={m.totalFees} sub={costShare(m.totalFees) + " of costs"} icon={<Scale className="h-3.5 w-3.5" />} muted />
          <BreakdownCell label="Net P&L" value={m.netTotal} sub="after all costs" highlight icon={<ArrowUpRight className="h-3.5 w-3.5" />} />
        </div>

        {/* Cost composition bar */}
        {m.totalCosts !== 0 && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden flex">
              <div className="h-full bg-white/45" style={{ width: `${(Math.abs(m.totalCommission) / Math.abs(m.totalCosts)) * 100}%` }} title="Commission" />
              <div className="h-full bg-white/25" style={{ width: `${(Math.abs(m.totalSwap) / Math.abs(m.totalCosts)) * 100}%` }} title="Swap" />
              <div className="h-full bg-white/15" style={{ width: `${(Math.abs(m.totalFees) / Math.abs(m.totalCosts)) * 100}%` }} title="Fees" />
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground">
              <Legend dot="bg-white/45" label="Commission" />
              <Legend dot="bg-white/25" label="Swap" />
              <Legend dot="bg-white/15" label="Fees" />
              <span className="ml-auto">Total cost {money(m.totalCosts, true)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Performance metrics ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
          <Crown className="h-4 w-4 text-white/55" />
          Performance Insights
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Metric label="Profit Factor" value={m.profitFactor === null ? "∞" : m.profitFactor.toFixed(2)} tone={m.profitFactor === null || m.profitFactor >= 1 ? "pos" : "neg"} />
          <Metric label="Expectancy / trade" value={money(m.expectancy, true)} tone={m.expectancy >= 0 ? "pos" : "neg"} />
          <Metric label="Avg Win" value={money(m.avgWin, true)} tone="pos" />
          <Metric label="Avg Loss" value={money(-m.avgLoss, true)} tone="neg" />
          <Metric label="Largest Win" value={money(m.largestWin, true)} tone="pos" />
          <Metric label="Largest Loss" value={money(m.largestLoss, true)} tone="neg" />
          <Metric label="Wins / Losses" value={`${m.winCount} / ${m.lossCount}`} sub={`${m.closedCount} closed`} />
          <Metric
            label="Current Streak"
            value={m.curStreak === 0 ? "—" : `${Math.abs(m.curStreak)} ${m.curStreak > 0 ? "W" : "L"}`}
            tone={m.curStreak > 0 ? "pos" : m.curStreak < 0 ? "neg" : "neutral"}
            icon={m.curStreak > 0 ? <Flame className="h-3 w-3" /> : m.curStreak < 0 ? <Snowflake className="h-3 w-3" /> : undefined}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-2.5">
          <Metric label="Total Volume" value={`${m.totalVolume.toFixed(2)} lots`} icon={<Layers className="h-3 w-3" />} />
          <Metric label="Avg Hold Time" value={fmtDuration(m.avgDuration)} icon={<Clock3 className="h-3 w-3" />} />
          <Metric label="Best Win Streak" value={`${m.bestWinStreak} W`} tone="pos" />
          <Metric label="Worst Loss Streak" value={`${m.worstLossStreak} L`} tone="neg" />
        </div>
      </div>

      {/* ── Direction + Symbols ──────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Long vs Short */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 flex items-center gap-2">
            <Scale className="h-4 w-4 text-white/55" />
            Long vs Short
          </h3>
          <div className="space-y-2.5">
            <DirectionRow label="Long" icon={<ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />} data={m.longs} />
            <DirectionRow label="Short" icon={<ArrowDownRight className="h-3.5 w-3.5 text-red-400" />} data={m.shorts} />
          </div>
        </div>

        {/* Top symbols */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-white/55" />
            Symbol Performance
          </h3>
          <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
            {m.symbols.slice(0, 8).map((s) => (
              <div key={s.symbol} className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-semibold text-card-foreground">{s.symbol}</span>
                  <span className="text-[10px] text-muted-foreground">{s.count} · {s.winRate.toFixed(0)}% WR</span>
                </div>
                <span className={`text-[12px] font-bold font-mono ${s.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {money(s.net, true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function BreakdownCell({
  label, value, sub, icon, highlight, muted,
}: { label: string; value: number; sub?: string; icon?: React.ReactNode; highlight?: boolean; muted?: boolean }) {
  const tone = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-white/70";
  return (
    <div className={`rounded-xl p-2.5 md:p-3 border ${highlight ? "border-white/[0.16] bg-white/[0.05]" : "border-border bg-muted/30"}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className={muted ? "text-white/35" : "text-white/55"}>{icon}</span>
        <span className="text-[9px] md:text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className={`mt-1 text-[14px] md:text-[17px] font-bold font-mono leading-tight ${tone}`}>
        {money(value, true)}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Metric({
  label, value, sub, tone = "neutral", icon,
}: { label: string; value: string; sub?: string; tone?: "pos" | "neg" | "neutral"; icon?: React.ReactNode }) {
  const color = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : "text-card-foreground";
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-2.5 md:p-3">
      <p className="text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className={`mt-1 text-[14px] md:text-[18px] font-bold leading-tight flex items-center gap-1 ${color}`}>
        {icon}{value}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function DirectionRow({ label, icon, data }: { label: string; icon: React.ReactNode; data: { count: number; net: number; winRate: number } }) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-card-foreground">{icon}{label}</span>
        <span className={`text-[13px] font-bold font-mono ${data.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(data.net, true)}</span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{data.count} trade{data.count !== 1 ? "s" : ""}</span>
        <span>{data.winRate.toFixed(1)}% win rate</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-white/30 transition-all duration-700" style={{ width: `${data.winRate}%` }} />
      </div>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
