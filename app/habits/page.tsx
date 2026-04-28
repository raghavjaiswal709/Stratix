"use client";

import { useState, useEffect } from "react";
import { useAppContext } from "@/lib/context";
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
import type { TimeFrame } from "@/types";

export default function HabitsPage() {
  const { habitData, loading } = useAppContext();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("this-week");

  useEffect(() => {
    if (!loading && habitData.habits.length === 0) {
      const timer = setTimeout(() => setShowOnboarding(true), 0);
      return () => clearTimeout(timer);
    }
  }, [loading, habitData.habits.length]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">Habit Tracker</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Build consistent daily habits</p>
        </div>
        <Select value={timeFrame} onValueChange={(v) => setTimeFrame(v as TimeFrame)}>
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
      </div>

      <ScoreOfTheDay />

      <div className="bg-card rounded-2xl border border-border p-5">
        <HabitGrid timeFrame={timeFrame} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5">
          <ScoreProgress timeFrame={timeFrame} />
        </div>
        <div className="bg-card rounded-2xl border border-border p-5">
          <DailyScore timeFrame={timeFrame} />
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5">
        <HabitCharts timeFrame={timeFrame} />
      </div>

      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}
