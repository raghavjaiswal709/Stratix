"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays, CalendarClock, ShieldCheck, NotebookPen, Star, TrendingDown, Sparkles,
} from "lucide-react";
import { getISTDateKey, getISTWeekday, getStartOfISTWeek, toIST } from "@/lib/utils/ist-time";

interface Trade {
  _id: string;
  direction: "buy" | "sell";
  profit: number;
  swap?: number;
  commission?: number;
  status: "open" | "closed";
  entryTime: string;
  exitTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  riskRatio?: number;
  rewardRatio?: number;
  rating?: number;
  journaled?: boolean;
  source?: "manual" | "mt5";
}

interface Props {
  trades: Trade[];
}

const money = (n: number, withSign = false) => {
  const sign = n > 0 && withSign ? "+" : n < 0 ? "-" : withSign ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// JS getDay(): 0=Sun..6=Sat — remap to a Mon-first index.
const toMonFirst = (jsDay: number) => (jsDay + 6) % 7;

export function AdvancedInsights({ trades }: Props) {
  // Weekday Performance defaults to the current IST calendar week (Mon-Sun to
  // date) since that's what traders actually want to check day-to-day; "All
  // Time" is available for the full-history breakdown.
  const [weekdayScope, setWeekdayScope] = useState<"week" | "all">("week");

  const m = useMemo(() => {
    const net = (t: Trade) => t.profit + (t.swap || 0) + (t.commission || 0);
    const closed = trades.filter((t) => t.status === "closed");

    // ── Best / worst single trading day (calendar day in true IST) ────────
    const byDay = new Map<string, number>();
    for (const t of closed) {
      const key = getISTDateKey(t.exitTime || t.entryTime, t.source);
      byDay.set(key, (byDay.get(key) || 0) + net(t));
    }
    const days = Array.from(byDay.entries()).map(([date, pnl]) => ({ date, pnl }));
    const bestDay = days.length ? days.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null;
    const worstDay = days.length ? days.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null;

    // ── Weekday performance (weekday in true IST) ──────────────────────────
    // Computed twice — this-week and all-time — so switching the toggle is
    // instant with no recompute needed.
    const weekStart = getStartOfISTWeek(new Date()).getTime();
    const buildWeekday = (source: Trade[]) => {
      const arr = Array.from({ length: 7 }, () => ({ net: 0, wins: 0, count: 0 }));
      for (const t of source) {
        const idx = toMonFirst(getISTWeekday(t.entryTime, t.source));
        const n = net(t);
        arr[idx].net += n;
        arr[idx].count += 1;
        if (n > 0) arr[idx].wins += 1;
      }
      return arr;
    };
    const closedThisWeek = closed.filter((t) => toIST(t.entryTime, t.source).getTime() >= weekStart);
    const weekdayThisWeek = buildWeekday(closedThisWeek);
    const weekdayAllTime = buildWeekday(closed);
    const weekday = weekdayScope === "week" ? weekdayThisWeek : weekdayAllTime;
    const maxAbsWeekdayNet = Math.max(1, ...weekday.map((w) => Math.abs(w.net)));

    // ── Max drawdown (peak-to-trough of cumulative equity, chronological) ──
    const chrono = [...closed].sort((a, b) =>
      new Date(a.exitTime || a.entryTime).getTime() - new Date(b.exitTime || b.entryTime).getTime()
    );
    let equity = 0, peak = 0, maxDrawdown = 0;
    for (const t of chrono) {
      equity += net(t);
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, equity - peak);
    }

    // ── Risk discipline ────────────────────────────────────────────────────
    const withPlan = closed.filter((t) => t.riskRatio && t.rewardRatio);
    const avgPlannedRR = withPlan.length
      ? withPlan.reduce((s, t) => s + (t.rewardRatio! / t.riskRatio!), 0) / withPlan.length
      : 0;
    const slSetPct = closed.length ? (closed.filter((t) => t.stopLoss).length / closed.length) * 100 : 0;
    const tpSetPct = closed.length ? (closed.filter((t) => t.takeProfit).length / closed.length) * 100 : 0;

    // ── Journaling health ──────────────────────────────────────────────────
    const journaledPct = trades.length ? (trades.filter((t) => t.journaled).length / trades.length) * 100 : 0;
    const rated = closed.filter((t) => typeof t.rating === "number" && t.rating! > 0);
    const avgRating = rated.length ? rated.reduce((s, t) => s + (t.rating || 0), 0) / rated.length : 0;

    return { bestDay, worstDay, weekday, maxAbsWeekdayNet, maxDrawdown, avgPlannedRR, slSetPct, tpSetPct, journaledPct, avgRating, closedCount: closed.length };
  }, [trades, weekdayScope]);

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
