"use client";

import { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  endOfWeek,
  eachWeekOfInterval,
  parseISO,
  isSameDay,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

interface MonthlyCalendarProps {
  trades: Trade[];
  loading?: boolean;
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function getPnLForDay(trades: Trade[], date: Date): number {
  return trades
    .filter((t) => isSameDay(parseISO(t.entryTime), date))
    .reduce((sum, t) => sum + t.profit + (t.swap || 0) + (t.commission || 0), 0);
}

function getCountForDay(trades: Trade[], date: Date): number {
  return trades.filter((t) => isSameDay(parseISO(t.entryTime), date)).length;
}

function fmt(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

export function MonthlyCalendar({ trades, loading }: MonthlyCalendarProps) {
  const [viewDate, setViewDate] = useState(new Date());

  const monthStart = startOfMonth(viewDate);
  const monthEnd   = endOfMonth(viewDate);

  // Monthly total: sum every day in the month using the same getPnLForDay
  // function used by each calendar cell — guaranteed to match exactly.
  const monthlyTotal = useMemo(() => {
    return eachDayOfInterval({ start: monthStart, end: monthEnd })
      .reduce((sum, day) => sum + getPnLForDay(trades, day), 0);
  }, [trades, monthStart, monthEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Weeks starting on Monday that cover the entire month
  const weeks = useMemo(
    () => eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 }),
    [monthStart, monthEnd]
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      {/* Header */}
      <div className="mb-3 md:mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground">
            Monthly P&L
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewDate((v) => subMonths(v, 1))}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground/80 hover:bg-muted transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] md:text-[12px] text-muted-foreground font-medium min-w-[80px] text-center">
              {format(viewDate, "MMM yyyy")}
            </span>
            <button
              onClick={() => setViewDate((v) => addMonths(v, 1))}
              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground/80 hover:bg-muted transition"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <span
          className={`text-[11px] font-bold mt-0.5 inline-block ${
            monthlyTotal >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          Monthly: {fmt(monthlyTotal)}
        </span>
      </div>

      {/* Day labels */}
      <div className="grid gap-px mb-1" style={{ gridTemplateColumns: "repeat(7, 1fr) 56px" }}>
        {DAY_LABELS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1"
          >
            {d}
          </div>
        ))}
        <div className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">
          WK
        </div>
      </div>

      {/* Calendar rows */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-4 w-4 rounded-full border-[1.5px] border-white/20 border-t-white/60 animate-spin" />
        </div>
      ) : (
        <div className="space-y-px">
          {weeks.map((weekStart) => {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

            let weekPnL   = 0;
            let weekCount = 0;

            const cells = days.map((day) => {
              const inMonth = day >= monthStart && day <= monthEnd;
              const dayTrades = inMonth
                ? trades.filter((t) => isSameDay(parseISO(t.entryTime), day))
                : [];
              const pnl     = inMonth ? dayTrades.reduce((sum, t) => sum + t.profit + (t.swap || 0) + (t.commission || 0), 0) : 0;
              const count   = dayTrades.length;

              if (inMonth) {
                weekPnL   += pnl;
                weekCount += count;
              }

              return { day, inMonth, pnl, count, hasTraded: inMonth && count > 0, dayTrades };
            });

            return (
              <div
                key={weekStart.toISOString()}
                className="grid gap-px"
                style={{ gridTemplateColumns: "repeat(7, 1fr) 56px" }}
              >
                {cells.map(({ day, inMonth, pnl, hasTraded, dayTrades }) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "relative group min-h-[42px] flex flex-col items-center justify-center rounded-lg text-center p-1 transition",
                      !inMonth && "opacity-0 pointer-events-none",
                      hasTraded && pnl >= 0 && "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20",
                      hasTraded && pnl  < 0 && "bg-red-500/10 border border-red-500/20 hover:bg-red-500/20",
                      !hasTraded && inMonth && "bg-muted/30 border border-transparent"
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground font-medium leading-none">
                      {format(day, "d")}
                    </span>
                    {hasTraded && (
                      <span
                        className={cn(
                          "text-[9px] font-bold leading-tight mt-0.5",
                          pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {fmt(pnl)}
                      </span>
                    )}

                    {/* Trades list hover popover */}
                    {hasTraded && dayTrades.length > 0 && (
                      <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto flex flex-col w-56 rounded-xl border border-white/[0.08] bg-[#0c0c0c] shadow-2xl p-2 z-30 text-left transition-all duration-150 delay-100 group-hover:delay-0">
                        {/* Invisible bridge to prevent pointer gap hover exit */}
                        <div className="absolute top-full left-0 right-0 h-[8px] bg-transparent pointer-events-auto" />
                        <div className="px-2 py-1.5 border-b border-white/[0.06] mb-1.5 relative z-10">
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                            Trades on {format(day, "MMM d, yyyy")}
                          </span>
                        </div>
                        <div className="space-y-1 max-h-[160px] overflow-y-auto pr-0.5">
                          {dayTrades.map((trade) => {
                            const tradeNet = trade.profit + (trade.swap || 0) + (trade.commission || 0);
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
                                  {/* Green dot for journaled */}
                                  {trade.journaled ? (
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Journaled" />
                                  ) : (
                                    <span className="h-1.5 w-1.5 rounded-full bg-white/10 shrink-0" />
                                  )}
                                  <span className="text-[11px] font-bold text-white uppercase truncate">
                                    {trade.symbol}
                                  </span>
                                  {trade.lots && trade.direction && (
                                    <span className="text-[9px] text-white/30 font-medium">
                                      {trade.direction === "buy" ? "🟢" : "🔴"} {trade.lots.toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <span className={cn(
                                  "text-[10px] font-bold font-mono",
                                  tradeNet >= 0 ? "text-emerald-400" : "text-red-400"
                                )}>
                                  {fmt(tradeNet)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Weekly summary */}
                <div className="min-h-[42px] w-[56px] flex flex-col items-center justify-center">
                  <span
                    className={cn(
                      "text-[11px] font-bold",
                      weekPnL > 0
                        ? "text-emerald-400"
                        : weekPnL < 0
                        ? "text-red-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {weekCount > 0 ? fmt(weekPnL) : "—"}
                  </span>
                  {weekCount > 0 && (
                    <span className="text-[9px] text-muted-foreground">{weekCount}t</span>
                  )}
                </div>
              </div>
            );
          })}
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
