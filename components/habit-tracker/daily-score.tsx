"use client";

import { useMemo } from "react";
import { useAppContext } from "@/lib/context";
import { getDailyScore, getScoreColor, getScoreTextColor, getWeekDates } from "@/lib/habits";
import { format } from "date-fns";

export function DailyScore() {
  const { habitData } = useAppContext();
  const weekDates = useMemo(() => getWeekDates(), []);
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const scores = useMemo(
    () =>
      weekDates.map((date) => {
        const dateStr = format(date, "yyyy-MM-dd");
        return getDailyScore(habitData.habits, habitData.logs, dateStr);
      }),
    [weekDates, habitData]
  );

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
      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date, i) => {
          const score = scores[i];
          return (
            <div key={i} className="text-center space-y-1">
              <p className="text-xs text-muted-foreground font-medium">{dayLabels[i]}</p>
              <div
                className={`mx-auto h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-bold ${getScoreColor(score)}`}
              >
                {score}%
              </div>
              <p className={`text-xs font-medium ${getScoreTextColor(score)}`}>
                {score}%
              </p>
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
