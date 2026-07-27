"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format, subDays, subMonths, parseISO, isAfter } from "date-fns";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/trades/dashboard-stats";

interface PerformanceChartProps {
  /** Net P&L per IST calendar day of entry, ascending — rolled up in Mongo. */
  byEntryDay: DashboardStats["byEntryDay"];
  loading?: boolean;
  /** Dashboard-palette-driven positive/negative colors (SVG props can't read CSS vars). */
  positiveColor?: string;
  negativeColor?: string;
}

const PERIODS = ["1D", "1W", "1M", "3M", "ALL"] as const;
type Period = (typeof PERIODS)[number];

function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case "1D": return subDays(now, 1);
    case "1W": return subDays(now, 7);
    case "1M": return subMonths(now, 1);
    case "3M": return subMonths(now, 3);
    case "ALL": return null;
  }
}

// The per-day grouping (net P&L per IST calendar day of entry) now happens in
// Mongo, so this just windows the series and runs the cumulative sum.
//
// One deliberate behavior change: the period filter is day-granular. It used to
// compare each trade's raw entryTime against `start`, which could include or
// drop part of the boundary day; now a day is in or out as a whole. For a chart
// with one point per day that is the more consistent reading, but it means a
// period edge can shift by up to a day versus the old build.
function buildChartData(byEntryDay: DashboardStats["byEntryDay"], start: Date | null) {
  const filtered = start
    ? byEntryDay.filter((d) => isAfter(parseISO(d._id), start))
    : byEntryDay;

  let cumPnL = 0;
  return filtered.map((d) => {
    cumPnL += d.pnl;
    return {
      date: format(parseISO(d._id), "MMM d"),
      pnl: parseFloat(cumPnL.toFixed(2)),
    };
  });
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className={val >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
        {val >= 0 ? "+" : ""}${val.toFixed(2)}
      </p>
    </div>
  );
}

export function PerformanceChart({ byEntryDay, loading, positiveColor = "#10b981", negativeColor = "#ef4444" }: PerformanceChartProps) {
  // Default to ALL so the chart is never empty for users who have trades
  // from earlier periods. They can narrow down using the period buttons.
  const [period, setPeriod] = useState<Period>("ALL");

  const data = useMemo(() => {
    const start = getPeriodStart(period);
    return buildChartData(byEntryDay, start);
  }, [byEntryDay, period]);

  const totalForPeriod = data.length > 0 ? data[data.length - 1].pnl : 0;
  const isPositive = totalForPeriod >= 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3 md:mb-4 gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
            <TrendingUp className="h-3 w-3 md:h-3.5 md:w-3.5" />
            Performance
          </div>
          <div className="flex items-center gap-2">
            <p className={`text-[20px] md:text-[28px] font-bold leading-tight ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
              {isPositive ? "+" : ""}${Math.abs(totalForPeriod).toFixed(2)}
            </p>
          </div>
        </div>
        {/* Period buttons */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all duration-150",
                period === p
                  ? "bg-white/[0.09] text-white"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 h-[200px]">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border-[1.5px] border-white/20 border-t-white/60 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-sm">No trades{period !== "ALL" ? ` in ${period}` : ""}</p>
            {period !== "ALL" && (
              <button
                onClick={() => setPeriod("ALL")}
                className="text-[11px] text-white/40 hover:text-white/70 underline underline-offset-2 transition"
              >
                View all time
              </button>
            )}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={isPositive ? positiveColor : negativeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={isPositive ? positiveColor : negativeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="pnl"
                stroke={isPositive ? positiveColor : negativeColor}
                strokeWidth={2}
                fill="url(#pnlGrad)"
                dot={false}
                activeDot={{ r: 4, fill: isPositive ? positiveColor : negativeColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
