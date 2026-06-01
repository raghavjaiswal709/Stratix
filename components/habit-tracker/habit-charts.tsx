"use client";

import { useMemo, useState } from "react";
import { useAppContext } from "@/lib/context";
import { getDateRange, getFilteredLogs, getDailyScore } from "@/lib/habits";
import { eachDayOfInterval, format } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TimeFrame } from "@/types";

// ── 10-level heatmap gradient: red → orange → yellow → lime → teal ────────
const HEAT_COLORS = [
  "transparent", // 0: no data
  "#F23645",     // 1: 1-10%
  "#f5533a",     // 2: 11-20%
  "#f97316",     // 3: 21-30%
  "#f4a015",     // 4: 31-40%
  "#eab308",     // 5: 41-50%
  "#c8b800",     // 6: 51-60%
  "#84ca00",     // 7: 61-70%
  "#4ade80",     // 8: 71-80%
  "#22c55e",     // 9: 81-90%
  "#099981",     // 10: 91-100%
] as const;

function getHeatLevel(pct: number): number {
  if (pct === 0) return 0;
  return Math.min(10, Math.ceil(pct / 10));
}

interface HabitChartsProps {
  timeFrame: TimeFrame;
  referenceDate?: Date;
}

export function HabitCharts({ timeFrame, referenceDate }: HabitChartsProps) {
  const { habitData } = useAppContext();
  const [activeTab, setActiveTab] = useState<"heatmap" | "area">("heatmap");

  const { start, end } = useMemo(() => getDateRange(timeFrame, referenceDate), [timeFrame, referenceDate]);
  const days = useMemo(
    () => eachDayOfInterval({ start, end }),
    [start, end]
  );
  const filteredLogs = useMemo(
    () => getFilteredLogs(habitData.logs, timeFrame, referenceDate),
    [habitData.logs, timeFrame, referenceDate]
  );

  // ── Per-habit rows × per-date columns (fractional completion) ──────────
  const heatmapRows = useMemo(() => {
    return habitData.habits.map((habit) => ({
      habit,
      cells: days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const log = filteredLogs.find(
          (l) => l.habitId === habit.id && l.date === dateStr
        );
        if (!log) return 0;
        if (habit.subHabits && habit.subHabits.length > 0) {
          return (log.completedSubHabits?.length || 0) / habit.subHabits.length;
        }
        return log.completed ? 1 : 0;
      }),
    }));
  }, [habitData.habits, days, filteredLogs]);

  // ── Daily completion % across all habits (for area + summary row) ─────────
  const dailyPct = useMemo(() => {
    return days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      return getDailyScore(habitData.habits, habitData.logs, dateStr);
    });
  }, [days, habitData.habits, habitData.logs]);

  const areaData = useMemo(
    () =>
      days.map((day, i) => ({
        date: format(
          day,
          days.length <= 14 ? "EEE d" : days.length <= 60 ? "MMM d" : "MMM"
        ),
        pct: dailyPct[i],
      })),
    [days, dailyPct]
  );

  // ── Cell sizing ──────────────────────────────────────────────────────────
  const cellPx =
    days.length <= 7 ? 32 : days.length <= 31 ? 22 : days.length <= 90 ? 14 : 10;
  const habitLabelW = 120;

  const isEmpty = habitData.habits.length === 0;

  return (
    <div className="space-y-0">
      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4">
        {(["heatmap", "area"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-all"
            style={
              activeTab === tab
                ? {
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.75)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }
                : {
                    background: "transparent",
                    color: "var(--muted-foreground)",
                    border: "1px solid transparent",
                  }
            }
          >
            {tab === "heatmap" ? "Heatmap" : "Progress"}
          </button>
        ))}
      </div>

      {/* ── Heatmap tab ─────────────────────────────────────────────────── */}
      {activeTab === "heatmap" && (
        <div>
          {isEmpty ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No habits yet — add one to see your heatmap.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: habitLabelW + days.length * (cellPx + 2) }}>
                {/* Date header */}
                <div
                  className="flex"
                  style={{ marginLeft: habitLabelW, marginBottom: 4 }}
                >
                  {days.map((day, i) => (
                    <div
                      key={i}
                      style={{
                        width: cellPx + 2,
                        flexShrink: 0,
                        textAlign: "center",
                      }}
                    >
                      {days.length <= 7 ? (
                        <span className="text-[10px] text-muted-foreground">
                          {format(day, "EEE")}
                        </span>
                      ) : i % Math.ceil(days.length / 12) === 0 ? (
                        <span className="text-[9px] text-muted-foreground">
                          {format(day, days.length <= 60 ? "d" : "MMM")}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                {/* Overall daily completion summary row */}
                <div
                  className="flex items-center mb-1"
                  style={{ height: cellPx + 2 }}
                >
                  <div
                    className="text-[11px] font-semibold text-muted-foreground truncate pr-2"
                    style={{ width: habitLabelW }}
                  >
                    All habits
                  </div>
                  {dailyPct.map((pct, i) => {
                    const level = getHeatLevel(pct);
                    return (
                      <div
                        key={i}
                        style={{
                          width: cellPx,
                          height: cellPx,
                          margin: 1,
                          flexShrink: 0,
                          borderRadius: Math.max(2, cellPx * 0.15),
                          backgroundColor:
                            level === 0
                              ? "rgba(128,128,128,0.12)"
                              : HEAT_COLORS[level],
                          opacity: level === 0 ? 0.7 : 1,
                        }}
                        title={`${format(days[i], "MMM d")}: ${pct}%`}
                      />
                    );
                  })}
                </div>

                {/* Divider */}
                <div
                  className="mb-1"
                  style={{
                    height: 1,
                    marginLeft: habitLabelW,
                    background: "var(--border)",
                    opacity: 0.5,
                  }}
                />

                {/* Per-habit rows */}
                {heatmapRows.map(({ habit, cells }) => (
                  <div
                    key={habit.id}
                    className="flex items-center"
                    style={{ height: cellPx + 4, marginBottom: 1 }}
                  >
                    <div
                      className="text-[11px] text-muted-foreground truncate pr-2"
                      style={{ width: habitLabelW, flexShrink: 0 }}
                    >
                      {habit.name}
                    </div>
                    {cells.map((val, i) => {
                      const dayOfWeek = days[i].getDay();
                      const isScheduled =
                        !habit.weekDays?.length ||
                        habit.weekDays.includes(dayOfWeek);
                      return (
                        <div
                          key={i}
                          style={{
                            width: cellPx,
                            height: cellPx,
                            margin: 1,
                            flexShrink: 0,
                            borderRadius: Math.max(2, cellPx * 0.15),
                            backgroundColor: !isScheduled
                              ? "transparent"
                              : val === 1
                              ? "#099981"
                              : val > 0
                              ? "#099981"
                              : "#F23645",
                            opacity: !isScheduled ? 0.25 : val > 0 && val < 1 ? 0.3 + val * 0.4 : val === 1 ? 1 : 0.55,
                          }}
                          title={`${habit.name} · ${format(days[i], "MMM d")}: ${
                            !isScheduled ? "off" : val === 1 ? "done" : val > 0 ? `${Math.round(val * 100)}% done` : "missed"
                          }`}
                        />
                      );
                    })}
                  </div>
                ))}

                {/* Legend */}
                <div
                  className="flex items-center gap-1 mt-3"
                  style={{ marginLeft: habitLabelW }}
                >
                  <span className="text-[10px] text-muted-foreground mr-1">
                    0%
                  </span>
                  {HEAT_COLORS.slice(1).map((color, i) => (
                    <div
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        backgroundColor: color,
                        flexShrink: 0,
                      }}
                      title={`${(i + 1) * 10}%`}
                    />
                  ))}
                  <span className="text-[10px] text-muted-foreground ml-1">
                    100%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Area chart tab ──────────────────────────────────────────────── */}
      {activeTab === "area" && (
        <div>
          {isEmpty ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No habits yet — add one to see your progress.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={areaData}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="habitAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#099981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#099981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.max(0, Math.ceil(areaData.length / 8) - 1)}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                  formatter={(v) => [`${v}%`, "Completion"]}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#099981"
                  strokeWidth={2}
                  fill="url(#habitAreaGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#099981" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
