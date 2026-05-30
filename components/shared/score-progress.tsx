"use client";

import { useMemo } from "react";
import { useAppContext } from "@/lib/context";
import { getAverageHabitScore } from "@/lib/habits";
import { getAverageTodoScore } from "@/lib/todos";
import type { TimeFrame } from "@/types";

function scoreColor(n: number) {
  if (n >= 80) return "#22c55e";
  if (n >= 60) return "#eab308";
  if (n >= 40) return "#f97316";
  return "#ef4444";
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-semibold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function ScoreProgress({ timeFrame, referenceDate }: { timeFrame: TimeFrame; referenceDate?: Date }) {
  const { habitData, todoData, scoreWeights } = useAppContext();

  const habitScore = useMemo(
    () => getAverageHabitScore(habitData.habits, habitData.logs, timeFrame, referenceDate),
    [habitData, timeFrame, referenceDate]
  );

  const todoScore = useMemo(
    () => getAverageTodoScore(todoData.todos, timeFrame, referenceDate),
    [todoData.todos, timeFrame, referenceDate]
  );

  const combined = useMemo(
    () => Math.round(habitScore * scoreWeights.habitWeight + todoScore * scoreWeights.todoWeight),
    [habitScore, todoScore, scoreWeights]
  );

  const timeFrameLabel: Record<TimeFrame, string> = {
    "this-week": "This Week",
    "this-month": "This Month",
    "last-3-months": "Last 3 Months",
    "last-6-months": "Last 6 Months",
    "this-year": "This Year",
    "all-time": "All Time",
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">
        Score Progress
        <span className="text-sm font-normal text-muted-foreground ml-2">
          {timeFrameLabel[timeFrame]}
        </span>
      </h3>
      <div className="space-y-3">
        <Bar label="Habits" value={habitScore} color={scoreColor(habitScore)} />
        <Bar label="Tasks" value={todoScore} color={scoreColor(todoScore)} />
        <Bar label="Combined" value={combined} color={scoreColor(combined)} />
      </div>
    </div>
  );
}
