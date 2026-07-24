"use client";

import { useEffect, useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachWeekOfInterval,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addYears,
  subYears,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getISTDateKey } from "@/lib/utils/ist-time";

interface Trade {
  _id: string;
  entryTime: string;
  profit: number;
  swap?: number;
  commission?: number;
  status: string;
  symbol: string;
  journaled?: boolean;
  lots?: number;
  direction?: string;
  source?: "manual" | "mt5";
}

interface MonthlyCalendarProps {
  trades: Trade[];
  loading?: boolean;
}

type ViewMode = "week" | "month" | "3m" | "year";
const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "3m", label: "3M" },
  { id: "year", label: "Year" },
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function net(t: Trade): number {
  return t.profit + (t.swap || 0) + (t.commission || 0);
}

function fmt(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MonthlyCalendar({ trades, loading }: MonthlyCalendarProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [viewDate, setViewDate] = useState(new Date());
  // Which day's trade list is open — click-driven, not hover, so it doesn't
  // pop up every time the mouse passes over a cell.
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  useEffect(() => setSelectedDayKey(null), [viewMode, viewDate]);

  // ── Range + navigation, per mode ─────────────────────────────────────────
  const { rangeStart, rangeEnd, headerLabel, goPrev, goNext } = useMemo(() => {
    if (viewMode === "week") {
      const s = startOfWeek(viewDate, { weekStartsOn: 1 });
      const e = endOfWeek(viewDate, { weekStartsOn: 1 });
      return {
        rangeStart: s,
        rangeEnd: e,
        headerLabel: `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`,
        goPrev: () => subWeeks(viewDate, 1),
        goNext: () => addWeeks(viewDate, 1),
      };
    }
    if (viewMode === "3m") {
      const s = startOfMonth(subMonths(viewDate, 2));
      const e = endOfMonth(viewDate);
      return {
        rangeStart: s,
        rangeEnd: e,
        headerLabel: `${format(s, "MMM")} – ${format(e, "MMM yyyy")}`,
        goPrev: () => subMonths(viewDate, 3),
        goNext: () => addMonths(viewDate, 3),
      };
    }
    if (viewMode === "year") {
      const s = startOfYear(viewDate);
      const e = endOfYear(viewDate);
      return {
        rangeStart: s,
        rangeEnd: e,
        headerLabel: format(viewDate, "yyyy"),
        goPrev: () => subYears(viewDate, 1),
        goNext: () => addYears(viewDate, 1),
      };
    }
    // month (default)
    const s = startOfMonth(viewDate);
    const e = endOfMonth(viewDate);
    return {
      rangeStart: s,
      rangeEnd: e,
      headerLabel: format(viewDate, "MMM yyyy"),
      goPrev: () => subMonths(viewDate, 1),
      goNext: () => addMonths(viewDate, 1),
    };
  }, [viewMode, viewDate]);

  // Per-day P&L/count lookup — shared by both the cell grid and the heatmap.
  const dayStats = useMemo(() => {
    const map = new Map<string, { pnl: number; count: number; trades: Trade[] }>();
    for (const t of trades) {
      const key = getISTDateKey(t.entryTime, t.source);
      const cur = map.get(key) || { pnl: 0, count: 0, trades: [] as Trade[] };
      cur.pnl += net(t);
      cur.count += 1;
      cur.trades.push(t);
      map.set(key, cur);
    }
    return map;
  }, [trades]);

  const getDay = (date: Date) => {
    const key = dayKey(date);
    return dayStats.get(key) || { pnl: 0, count: 0, trades: [] as Trade[] };
  };

  const rangeTotal = useMemo(() => {
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).reduce(
      (sum, day) => sum + getDay(day).pnl,
      0
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, dayStats]);

  const isCellView = viewMode === "week" || viewMode === "month";

  // Weeks covering the range, Monday-start, for the cell-grid views.
  const weeks = useMemo(
    () => eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 }),
    [rangeStart, rangeEnd]
  );

  // Heatmap normalization (3M / Year views).
  const maxAbsHeatPnL = useMemo(() => {
    if (viewMode !== "year") return 1;
    let max = 1;
    for (const day of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
      max = Math.max(max, Math.abs(getDay(day).pnl));
    }
    return max;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, dayStats, viewMode]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      {/* Click-away backdrop for the open day popover — sits below it (z-20 vs
          the popover's z-30) so clicking anywhere else on the page closes it. */}
      {selectedDayKey && (
        <div className="fixed inset-0 z-20" onClick={() => setSelectedDayKey(null)} />
      )}
      {/* Header */}
      <div className="mb-3 md:mb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground">
            Trades Calendar
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md bg-muted p-0.5 gap-px">
              {VIEW_MODES.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className={cn(
                    "px-2 py-1 rounded text-[10px] font-medium transition-colors",
                    viewMode === v.id ? "bg-white/[0.09] text-white" : "text-muted-foreground hover:text-foreground/65"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewDate(goPrev())}
                className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground/80 hover:bg-muted transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] md:text-[12px] text-muted-foreground font-medium min-w-[92px] text-center">
                {headerLabel}
              </span>
              <button
                onClick={() => setViewDate(goNext())}
                className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground/80 hover:bg-muted transition"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <span
          className={`text-[11px] font-bold mt-0.5 inline-block ${
            rangeTotal >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          Total: {fmt(rangeTotal)}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-4 w-4 rounded-full border-[1.5px] border-white/20 border-t-white/60 animate-spin" />
        </div>
      ) : isCellView ? (
        <div className="min-h-[270px] flex flex-col justify-center">
          {/* Day labels */}
          <div className="grid gap-px mb-1" style={{ gridTemplateColumns: "repeat(7, 1fr) 56px" }}>
            {DAY_LABELS.map((d, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">
                {d}
              </div>
            ))}
            <div className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">WK</div>
          </div>

          <div className="space-y-px">
            {weeks.map((weekStart) => {
              const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
              const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

              let weekPnL = 0;
              let weekCount = 0;

              const cells = days.map((day) => {
                const inRange = day >= rangeStart && day <= rangeEnd;
                const stat = inRange ? getDay(day) : { pnl: 0, count: 0, trades: [] as Trade[] };
                if (inRange) {
                  weekPnL += stat.pnl;
                  weekCount += stat.count;
                }
                return { day, inRange, ...stat, hasTraded: inRange && stat.count > 0 };
              });

              return (
                <div key={weekStart.toISOString()} className="grid gap-px" style={{ gridTemplateColumns: "repeat(7, 1fr) 56px" }}>
                  {cells.map(({ day, inRange, pnl, hasTraded, trades: dayTrades }) => {
                    const key = dayKey(day);
                    const isOpen = hasTraded && selectedDayKey === key;
                    return (
                    <div
                      key={day.toISOString()}
                      onClick={() => hasTraded && setSelectedDayKey((prev) => (prev === key ? null : key))}
                      className={cn(
                        "relative min-h-[42px] flex flex-col items-center justify-center rounded-lg text-center p-1 transition",
                        !inRange && "opacity-0 pointer-events-none",
                        hasTraded && "cursor-pointer",
                        hasTraded && pnl >= 0 && "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20",
                        hasTraded && pnl < 0 && "bg-red-500/10 border border-red-500/20 hover:bg-red-500/20",
                        !hasTraded && inRange && "bg-muted/30 border border-transparent"
                      )}
                    >
                      <span className="text-[10px] text-muted-foreground font-medium leading-none">
                        {format(day, "d")}
                      </span>
                      {hasTraded && (
                        <span className={cn("text-[9px] font-bold leading-tight mt-0.5", pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {fmt(pnl)}
                        </span>
                      )}

                      {/* Trades list — opens on click, not hover */}
                      {isOpen && dayTrades.length > 0 && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 flex flex-col w-56 rounded-xl border border-white/[0.08] bg-[#0c0c0c] shadow-2xl p-2 z-30 text-left"
                        >
                          <div className="px-2 py-1.5 border-b border-white/[0.06] mb-1.5 relative z-10">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                              Trades on {format(day, "MMM d, yyyy")}
                            </span>
                          </div>
                          <div className="space-y-1 max-h-[160px] overflow-y-auto pr-0.5">
                            {dayTrades.map((trade) => {
                              const tradeNet = net(trade);
                              return (
                                <div
                                  key={trade._id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(`/journal?tradeId=${trade._id}`, "_blank");
                                  }}
                                  className="flex items-center justify-between rounded-lg bg-white/[0.02] hover:bg-white/[0.08] border border-white/[0.04] hover:border-white/[0.12] px-2 py-1.5 cursor-pointer transition"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {trade.journaled ? (
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Journaled" />
                                    ) : (
                                      <span className="h-1.5 w-1.5 rounded-full bg-white/10 shrink-0" />
                                    )}
                                    <span className="text-[11px] font-bold text-white uppercase truncate">{trade.symbol}</span>
                                    {trade.lots && trade.direction && (
                                      <span className="text-[9px] text-white/30 font-medium">
                                        {trade.direction === "buy" ? "🟢" : "🔴"} {trade.lots.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                  <span className={cn("text-[10px] font-bold font-mono", tradeNet >= 0 ? "text-emerald-400" : "text-red-400")}>
                                    {fmt(tradeNet)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* Weekly summary */}
                  <div className="min-h-[42px] w-[56px] flex flex-col items-center justify-center">
                    <span className={cn("text-[11px] font-bold", weekPnL > 0 ? "text-emerald-400" : weekPnL < 0 ? "text-red-400" : "text-muted-foreground")}>
                      {weekCount > 0 ? fmt(weekPnL) : "—"}
                    </span>
                    {weekCount > 0 && <span className="text-[9px] text-muted-foreground">{weekCount}t</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === "3m" ? (
        // ── 3M: three compact side-by-side mini month-grids, numbers visible ──
        <div className="min-h-[270px] flex items-center">
          <div className="grid grid-cols-3 gap-3 w-full">
            {[2, 1, 0].map((n) => {
              const monthDate = subMonths(viewDate, n);
              const mStart = startOfMonth(monthDate);
              const mEnd = endOfMonth(monthDate);
              const mWeeks = eachWeekOfInterval({ start: mStart, end: mEnd }, { weekStartsOn: 1 });
              return (
                <div key={n} className="rounded-lg border border-border/60 p-1.5">
                  <div className="text-center text-[10px] font-semibold text-card-foreground mb-1">
                    {format(monthDate, "MMM yyyy")}
                  </div>
                  <div className="grid grid-cols-7 gap-px mb-0.5">
                    {DAY_LABELS.map((d, i) => (
                      <div key={i} className="text-center text-[7px] font-semibold text-muted-foreground/70 uppercase">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-px">
                    {mWeeks.map((weekStart) => {
                      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
                      const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
                      return (
                        <div key={weekStart.toISOString()} className="grid grid-cols-7 gap-px">
                          {days.map((day) => {
                            const inMonth = isSameMonth(day, monthDate);
                            const stat = inMonth ? getDay(day) : { pnl: 0, count: 0, trades: [] as Trade[] };
                            const hasTraded = inMonth && stat.count > 0;
                            return (
                              <div
                                key={day.toISOString()}
                                title={hasTraded ? `${format(day, "MMM d")}: ${fmt(stat.pnl)} · ${stat.count} trade${stat.count > 1 ? "s" : ""}` : undefined}
                                className={cn(
                                  "min-h-[26px] flex flex-col items-center justify-center rounded",
                                  !inMonth && "opacity-0 pointer-events-none",
                                  hasTraded && stat.pnl >= 0 && "bg-emerald-500/10",
                                  hasTraded && stat.pnl < 0 && "bg-red-500/10"
                                )}
                              >
                                <span className="text-[7px] text-muted-foreground/60 leading-none">{format(day, "d")}</span>
                                {hasTraded && (
                                  <span className={cn("text-[7.5px] font-bold leading-tight", stat.pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                                    {fmt(stat.pnl)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // ── Year: compact GitHub-style heatmap — same card footprint ─────────
        <div className="min-h-[270px] flex flex-col justify-center overflow-x-auto">
          <div className="flex items-start gap-2">
            <div className="flex flex-col gap-[3px] pt-[15px] shrink-0">
              {DAY_LABELS.map((d, i) => (
                <span key={i} className="h-[13px] flex items-center text-[8px] font-semibold text-muted-foreground uppercase leading-none">
                  {d}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {weeks.length === 0 && null}
              {eachWeekOfInterval({ start: rangeStart, end: rangeEnd }, { weekStartsOn: 1 }).map((weekStart) => {
                const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
                const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
                const showMonthLabel = weekStart.getDate() <= 7 || weekStart.getTime() === startOfMonth(weekStart).getTime();
                return (
                  <div key={weekStart.toISOString()} className="flex flex-col gap-[3px]">
                    <span className="h-[11px] text-[8px] font-medium text-muted-foreground/70 leading-none">
                      {showMonthLabel ? format(weekStart, "MMM") : ""}
                    </span>
                    {days.map((day) => {
                      const inRange = day >= rangeStart && day <= rangeEnd;
                      if (!inRange) {
                        return <div key={day.toISOString()} className="h-[13px] w-[13px] rounded-[3px] bg-transparent" />;
                      }
                      const stat = getDay(day);
                      const intensity = stat.count > 0 ? Math.min(1, Math.abs(stat.pnl) / maxAbsHeatPnL) : 0;
                      const bg =
                        stat.count === 0
                          ? "rgba(255,255,255,0.05)"
                          : stat.pnl >= 0
                          ? `rgba(16, 185, 129, ${0.18 + intensity * 0.65})`
                          : `rgba(239, 68, 68, ${0.18 + intensity * 0.65})`;
                      return (
                        <div
                          key={day.toISOString()}
                          title={`${format(day, "MMM d, yyyy")}: ${stat.count > 0 ? `${fmt(stat.pnl)} · ${stat.count} trade${stat.count > 1 ? "s" : ""}` : "no trades"}`}
                          className="h-[13px] w-[13px] rounded-[3px] cursor-default"
                          style={{ background: bg }}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-white/35">Profit day</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="text-[10px] text-white/35">Loss day</span>
        </div>
      </div>
    </div>
  );
}
