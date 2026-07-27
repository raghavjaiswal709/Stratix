"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays, CalendarClock, ShieldCheck, NotebookPen, Star, TrendingDown, Sparkles,
} from "lucide-react";
import { deriveAdvanced, type DashboardStats } from "@/lib/trades/dashboard-stats";

interface Props {
  stats: DashboardStats;
}

const money = (n: number, withSign = false) => {
  const sign = n > 0 && withSign ? "+" : n < 0 ? "-" : withSign ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AdvancedInsights({ stats }: Props) {
  // Weekday Performance defaults to the current IST calendar week (Mon-Sun to
  // date) since that's what traders actually want to check day-to-day; "All
  // Time" is available for the full-history breakdown. Both tables are rolled
  // up server-side, so flipping the toggle is a lookup, not a recompute.
  const [weekdayScope, setWeekdayScope] = useState<"week" | "all">("week");

  const m = useMemo(() => deriveAdvanced(stats, weekdayScope), [stats, weekdayScope]);

  if (m.closedCount === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Best / Worst Day + Max Drawdown */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-white/55" />
            Best &amp; Worst Days
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            <DayCell label="Best Day" cell={m.bestDay} tone="pos" />
            <DayCell label="Worst Day" cell={m.worstDay} tone="neg" />
            <div className="rounded-xl border border-border bg-muted/30 p-2.5 md:p-3">
              <p className="text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Max Drawdown
              </p>
              <p className="mt-1 text-[14px] md:text-[18px] font-bold leading-tight text-red-400">
                {money(m.maxDrawdown)}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">peak-to-trough equity</p>
            </div>
          </div>
        </div>

        {/* Weekday performance */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-white/55" />
              Weekday Performance
            </h3>
            <div className="flex rounded-md bg-muted p-0.5 gap-px shrink-0">
              {(["week", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setWeekdayScope(s)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    weekdayScope === s ? "bg-white/[0.09] text-white" : "text-muted-foreground hover:text-foreground/65"
                  }`}
                >
                  {s === "week" ? "This Week" : "All Time"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {WEEKDAYS.map((label, i) => {
              const w = m.weekday[i];
              const winRate = w.count ? (w.wins / w.count) * 100 : 0;
              const barPct = Math.min(100, (Math.abs(w.net) / m.maxAbsWeekdayNet) * 100);
              return (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="w-8 shrink-0 text-[10px] font-medium text-muted-foreground">{label}</span>
                  <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden relative">
                    {w.count > 0 && (
                      <div
                        className={`h-full rounded-full ${w.net >= 0 ? "bg-emerald-500/60" : "bg-red-500/60"}`}
                        style={{ width: `${barPct}%` }}
                      />
                    )}
                  </div>
                  <span className={`w-16 shrink-0 text-right text-[10px] font-mono font-semibold ${w.count === 0 ? "text-muted-foreground" : w.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {w.count ? money(w.net, true) : "—"}
                  </span>
                  <span className="w-14 shrink-0 text-right text-[9px] text-muted-foreground">
                    {w.count ? `${winRate.toFixed(0)}% WR` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Risk discipline */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-white/55" />
            Risk Discipline
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            <Metric label="Avg Planned R:R" value={m.avgPlannedRR ? `1:${m.avgPlannedRR.toFixed(2)}` : "—"} />
            <Metric label="Stop Loss Set" value={`${m.slSetPct.toFixed(0)}%`} tone={m.slSetPct >= 80 ? "pos" : m.slSetPct >= 50 ? "neutral" : "neg"} />
            <Metric label="Take Profit Set" value={`${m.tpSetPct.toFixed(0)}%`} tone={m.tpSetPct >= 80 ? "pos" : m.tpSetPct >= 50 ? "neutral" : "neg"} />
          </div>
        </div>

        {/* Journaling health */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-white/55" />
            Journaling Health
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            <Metric
              label="Trades Journaled"
              value={`${m.journaledPct.toFixed(0)}%`}
              tone={m.journaledPct >= 70 ? "pos" : m.journaledPct >= 40 ? "neutral" : "neg"}
              icon={<Sparkles className="h-3 w-3" />}
            />
            <Metric
              label="Avg Trade Rating"
              value={m.avgRating ? `${m.avgRating.toFixed(1)} / 10` : "—"}
              tone={m.avgRating >= 7 ? "pos" : m.avgRating >= 4 ? "neutral" : "neg"}
              icon={<Star className="h-3 w-3" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DayCell({ label, cell, tone }: { label: string; cell: { date: string; pnl: number } | null; tone: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-400" : "text-red-400";
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-2.5 md:p-3">
      <p className="text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className={`mt-1 text-[14px] md:text-[18px] font-bold leading-tight ${cell ? color : "text-muted-foreground"}`}>
        {cell ? money(cell.pnl, true) : "—"}
      </p>
      {cell && <p className="text-[9px] text-muted-foreground mt-0.5">{cell.date}</p>}
    </div>
  );
}

function Metric({
  label, value, tone = "neutral", icon,
}: { label: string; value: string; tone?: "pos" | "neg" | "neutral"; icon?: React.ReactNode }) {
  const color = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : "text-card-foreground";
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-2.5 md:p-3">
      <p className="text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className={`mt-1 text-[14px] md:text-[18px] font-bold leading-tight flex items-center gap-1 ${color}`}>
        {icon}{value}
      </p>
    </div>
  );
}
