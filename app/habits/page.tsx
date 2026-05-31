"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppContext } from "@/lib/context";
import { getDailyScore } from "@/lib/habits";
import { getTodoScore } from "@/lib/todos";
import { HabitGrid } from "@/components/habit-tracker/habit-grid";
import { DailyScore } from "@/components/habit-tracker/daily-score";
import { HabitCharts } from "@/components/habit-tracker/habit-charts";
import { OnboardingModal } from "@/components/habit-tracker/onboarding-modal";
import { ScoreOfTheDay } from "@/components/shared/score-of-the-day";
import { ScoreProgress } from "@/components/shared/score-progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { startOfWeek, endOfWeek, format, isSameWeek, subWeeks, addWeeks } from "date-fns";
import type { TimeFrame } from "@/types";

export default function HabitsPage() {
  const { habitData, todoData, loading } = useAppContext();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("this-week");
  const [referenceDate, setReferenceDate] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!loading && habitData.habits.length === 0) {
      const timer = setTimeout(() => setShowOnboarding(true), 0);
      return () => clearTimeout(timer);
    }
  }, [loading, habitData.habits.length]);

  const handleTimeFrameChange = useCallback((v: string | null) => {
    if (!v) return;
    setTimeFrame(v as TimeFrame);
    if (v === "this-week") setReferenceDate(new Date());
  }, []);

  const goToPrevWeek = useCallback(() => setReferenceDate((d) => subWeeks(d, 1)), []);
  const goToNextWeek = useCallback(() => setReferenceDate((d) => addWeeks(d, 1)), []);

  const isCurrentWeek = isSameWeek(referenceDate, new Date(), { weekStartsOn: 0 });

  const weekLabel = (() => {
    const start = startOfWeek(referenceDate, { weekStartsOn: 0 });
    const end = endOfWeek(referenceDate, { weekStartsOn: 0 });
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, "MMM d")} – ${format(end, "d, yyyy")}`;
    }
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  })();

  const today = format(new Date(), "yyyy-MM-dd");
  const habitDailyScore = getDailyScore(habitData.habits, habitData.logs, today);
  const todoDailyScore  = getTodoScore(todoData.todos, today);

  function scoreColor(n: number) {
    if (n >= 80) return "#22c55e";
    if (n >= 60) return "#eab308";
    if (n >= 40) return "#f97316";
    return "#ef4444";
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        {/* Left: title + inline today stats */}
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[22px] font-bold text-foreground tracking-tight">Habit Tracker</h1>
            <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 border border-border/60 px-3 py-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold" style={{ color: scoreColor(habitDailyScore) }}>{habitDailyScore}%</span>
                <span className="text-[11px] text-muted-foreground">Habits</span>
              </div>
              <div className="w-px h-3.5 bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold" style={{ color: scoreColor(todoDailyScore) }}>{todoDailyScore}%</span>
                <span className="text-[11px] text-muted-foreground">Tasks</span>
              </div>
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">Build consistent daily habits</p>
        </div>

        {/* Right: dropdown stacked above week nav */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Select value={timeFrame} onValueChange={handleTimeFrameChange}>
            <SelectTrigger className="w-40 h-8 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-3-months">Last 3 Months</SelectItem>
              <SelectItem value="last-6-months">Last 6 Months</SelectItem>
              <SelectItem value="this-year">This Year</SelectItem>
              <SelectItem value="all-time">All Time</SelectItem>
            </SelectContent>
          </Select>
          {timeFrame === "this-week" && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={goToPrevWeek}
                className="flex items-center justify-center h-6 w-6 rounded-md border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[12px] font-medium text-foreground min-w-[6.5rem] text-center">
                {isCurrentWeek ? "This week" : weekLabel}
              </span>
              <button
                onClick={goToNextWeek}
                disabled={isCurrentWeek}
                className="flex items-center justify-center h-6 w-6 rounded-md border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              {!isCurrentWeek && (
                <button
                  onClick={() => setReferenceDate(new Date())}
                  className="text-[11px] text-white/65 hover:text-white/80 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ScoreOfTheDay />

      <div className="bg-card rounded-2xl border border-border p-5">
        <HabitGrid timeFrame={timeFrame} referenceDate={referenceDate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5">
          <ScoreProgress timeFrame={timeFrame} referenceDate={referenceDate} />
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <DailyScore timeFrame={timeFrame} referenceDate={referenceDate} />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <HabitCharts timeFrame={timeFrame} referenceDate={referenceDate} />
      </div>

      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}

