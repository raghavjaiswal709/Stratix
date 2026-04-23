"use client";

import { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  parseISO,
  isSameDay,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Trade {
  _id: string;
  exitTime?: string;
  profit: number;
  status: string;
}

interface MonthlyCalendarProps {
  trades: Trade[];
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function getPnLForDay(trades: Trade[], date: Date): number {
  return trades
    .filter(
      (t) =>
        t.status === "closed" &&
        t.exitTime &&
        isSameDay(parseISO(t.exitTime), date)
    )
    .reduce((sum, t) => sum + t.profit, 0);
}

function getTradeCountForDay(trades: Trade[], date: Date): number {
  return trades.filter(
    (t) =>
      t.status === "closed" &&
      t.exitTime &&
      isSameDay(parseISO(t.exitTime), date)
  ).length;
}

function getPnLForWeek(trades: Trade[], weekStart: Date, weekEnd: Date): number {
  return trades
    .filter((t) => {
      if (!t.status || t.status !== "closed" || !t.exitTime) return false;
      const d = parseISO(t.exitTime);
      return d >= weekStart && d <= weekEnd;
    })
    .reduce((sum, t) => sum + t.profit, 0);
}

function getTradeCountForWeek(trades: Trade[], weekStart: Date, weekEnd: Date): number {
  return trades.filter((t) => {
    if (t.status !== "closed" || !t.exitTime) return false;
    const d = parseISO(t.exitTime);
    return d >= weekStart && d <= weekEnd;
  }).length;
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

export function MonthlyCalendar({ trades }: MonthlyCalendarProps) {
  const [viewDate, setViewDate] = useState(new Date());

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);

  const monthlyTotal = useMemo(() => {
    return trades
      .filter((t) => {
        if (t.status !== "closed" || !t.exitTime) return false;
        const d = parseISO(t.exitTime);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((sum, t) => sum + t.profit, 0);
  }, [trades, monthStart, monthEnd]);

  // Build weeks for the calendar grid (Mon-Sun)
  const weeks = useMemo(() => {
    return eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 1 }
    );
  }, [monthStart, monthEnd]);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#141720] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-white">Monthly P&L</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-bold ${monthlyTotal >= 0 ? "text-blue-400" : "text-red-400"}`}>
            Monthly: {fmt(monthlyTotal)}
          </span>
          <span className="text-[12px] text-white/30 font-medium">
            {format(viewDate, "MMMM yyyy")}
          </span>
          <button
            onClick={() => setViewDate(subMonths(viewDate, 1))}
            className="h-6 w-6 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/5 transition"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewDate(addMonths(viewDate, 1))}
            className="h-6 w-6 flex items-center justify-center rounded text-white/40 hover:text-white/80 hover:bg-white/5 transition"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Day labels + Weekly label */}
      <div className="grid grid-cols-[repeat(7,1fr)_auto] gap-px mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-white/25 uppercase py-1">
            {d}
          </div>
        ))}
        <div className="text-center text-[10px] font-semibold text-white/25 uppercase py-1 pl-2">
          Weekly
        </div>
      </div>

      {/* Calendar rows */}
      <div className="space-y-px">
        {weeks.map((weekStart) => {
          const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
          const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
          const weekPnL = getPnLForWeek(trades, weekStart, weekEnd);
          const weekCount = getTradeCountForWeek(trades, weekStart, weekEnd);

          return (
            <div key={weekStart.toISOString()} className="grid grid-cols-[repeat(7,1fr)_auto] gap-px">
              {days.map((day) => {
                const isCurrentMonth =
                  day >= monthStart && day <= monthEnd;
                const pnl = isCurrentMonth ? getPnLForDay(trades, day) : null;
                const count = isCurrentMonth ? getTradeCountForDay(trades, day) : 0;
                const hasTraded = isCurrentMonth && count > 0;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "aspect-square min-h-[44px] flex flex-col items-center justify-center rounded-lg text-center p-1 text-[11px] transition",
                      !isCurrentMonth && "opacity-0",
                      hasTraded && pnl! >= 0 && "bg-blue-500/10 border border-blue-500/20",
                      hasTraded && pnl! < 0 && "bg-red-500/10 border border-red-500/20",
                      !hasTraded && isCurrentMonth && "bg-white/[0.025] border border-transparent"
                    )}
                  >
                    <span className="text-[10px] text-white/30 font-medium">{format(day, "d")}</span>
                    {hasTraded && (
                      <span
                        className={cn(
                          "text-[10px] font-bold leading-tight",
                          pnl! >= 0 ? "text-blue-400" : "text-red-400"
                        )}
                      >
                        {fmt(pnl!)}
                      </span>
                    )}
                  </div>
                );
              })}
              {/* Weekly summary */}
              <div className="min-h-[44px] flex flex-col items-start justify-center pl-2">
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    weekPnL >= 0 ? "text-blue-400" : "text-red-400",
                    weekPnL === 0 && "text-white/25"
                  )}
                >
                  {fmt(weekPnL)}
                </span>
                <span className="text-[9px] text-white/25">
                  traded {weekCount}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-400" />
          <span className="text-[10px] text-white/35">Profit</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="text-[10px] text-white/35">Loss</span>
        </div>
      </div>
    </div>
  );
}
