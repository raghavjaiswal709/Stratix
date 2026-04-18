"use client";

import { useMemo } from "react";
import { useAppContext } from "@/lib/context";
import { getDailyScore, getScoreColor, getScoreTextColor, getWeekDates, getDateRange } from "@/lib/habits";
import { format, eachDayOfInterval, eachWeekOfInterval, startOfWeek, endOfWeek, eachMonthOfInterval, startOfMonth, endOfMonth } from "date-fns";
import type { TimeFrame } from "@/types";

interface DailyScoreProps {
  timeFrame?: TimeFrame;
}

interface ScoreBucket {
  label: string;
  score: number;
}

export function DailyScore({ timeFrame = "this-week" }: DailyScoreProps) {
  const { habitData } = useAppContext();

  const buckets = useMemo((): ScoreBucket[] => {
    const { start, end } = getDateRange(timeFrame);
    const clampedEnd = end > new Date() ? new Date() : end;

    if (timeFrame === "this-week") {
      const weekDates = getWeekDates();
      const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return weekDates.map((date, i) => ({
        label: dayLabels[i],
        score: getDailyScore(habitData.habits, habitData.logs, format(date, "yyyy-MM-dd")),
      }));
    }

    if (timeFrame === "this-month") {
      const days = eachDayOfInterval({ start, end: clampedEnd });
      return days.map((day) => ({
        label: format(day, "d"),
        score: getDailyScore(habitData.habits, habitData.logs, format(day, "yyyy-MM-dd")),
      }));
    }

    if (timeFrame === "last-3-months" || timeFrame === "last-6-months") {
      const weeks = eachWeekOfInterval({ start, end: clampedEnd }, { weekStartsOn: 0 });
      return weeks.map((weekStart) => {
        const we = endOfWeek(weekStart, { weekStartsOn: 0 });
        const ce = we > clampedEnd ? clampedEnd : we;
        const days = eachDayOfInterval({ start: weekStart > start ? weekStart : start, end: ce });
        const avg = days.length > 0
          ? Math.round(days.reduce((s, d) => s + getDailyScore(habitData.habits, habitData.logs, format(d, "yyyy-MM-dd")), 0) / days.length)
          : 0;
        return { label: format(weekStart, "MMM d"), score: avg };
      });
    }

    // this-year, all-time → monthly buckets
    const months = eachMonthOfInterval({ start, end: clampedEnd });
    return months.map((monthStart) => {
      const me = endOfMonth(monthStart);
      const ce = me > clampedEnd ? clampedEnd : me;
      const days = eachDayOfInterval({ start: monthStart, end: ce });
      const avg = days.length > 0
        ? Math.round(days.reduce((s, d) => s + getDailyScore(habitData.habits, habitData.logs, format(d, "yyyy-MM-dd")), 0) / days.length)
        : 0;
      return { label: format(monthStart, "MMM"), score: avg };
    });
  }, [timeFrame, habitData]);

  const isCompact = buckets.length > 14;

  const gradientColors = [
    "bg-red-600",
    "bg-red-500",
    "bg-red-400",
    "bg-orange-500",
    "bg-orange-400",
    "bg-yellow-500",
    "bg-yellow-400",
    "bg-green-400",
    "bg-green-500",
    "bg-green-600",
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Daily Score</h3>

      <div className={`grid gap-1.5 ${isCompact ? "grid-cols-[repeat(auto-fill,minmax(28px,1fr))]" : buckets.length <= 7 ? "grid-cols-7" : "grid-cols-[repeat(auto-fill,minmax(36px,1fr))]"}`}>
        {buckets.map((b, i) => {
          const score = b.score;
          return (
            <div key={i} className="text-center space-y-0.5">
              <p className={`text-muted-foreground font-medium ${isCompact ? "text-[9px]" : "text-xs"}`}>{b.label}</p>
              <div
                className={`mx-auto rounded-full flex items-center justify-center text-white font-bold ${getScoreColor(score)} ${isCompact ? "h-7 w-7 text-[8px]" : "h-10 w-10 text-xs"}`}
              >
                {score}
              </div>
              {!isCompact && (
                <p className={`text-xs font-medium ${getScoreTextColor(score)}`}>
                  {score}%
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Gradient legend */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Score Gradient</p>
        <div className="flex gap-0.5">
          {gradientColors.map((color, i) => (
            <div
              key={i}
              className={`h-4 flex-1 ${color} ${i === 0 ? "rounded-l" : ""} ${i === 9 ? "rounded-r" : ""}`}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
