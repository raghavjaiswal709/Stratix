"use client";

import { useState, useEffect } from "react";
import { useAppContext } from "@/lib/context";
import { HabitGrid } from "@/components/habit-tracker/habit-grid";
import { DailyScore } from "@/components/habit-tracker/daily-score";
import { HabitCharts } from "@/components/habit-tracker/habit-charts";
import { OnboardingModal } from "@/components/habit-tracker/onboarding-modal";
import { TodoList } from "@/components/todo/todo-list";
import { ScoreOfTheDay } from "@/components/shared/score-of-the-day";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TimeFrame } from "@/types";

export default function ProductivityPage() {
  const { habitData, loading } = useAppContext();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("this-week");

  useEffect(() => {
    if (!loading && habitData.habits.length === 0) {
      setShowOnboarding(true);
    }
  }, [loading, habitData.habits.length]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-[12px] text-muted-foreground">Loading your data…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-5 animate-fade-up">
      <ScoreOfTheDay />

      <Tabs defaultValue="todos" className="w-full">
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="todos">To-Do List</TabsTrigger>
          <TabsTrigger value="habits">Habit Tracker</TabsTrigger>
        </TabsList>

        {/* To-Do List Tab */}
        <TabsContent value="todos" className="mt-5">
          <div className="glass-card p-4">
            <TodoList />
          </div>
        </TabsContent>

        {/* Habit Tracker Tab */}
        <TabsContent value="habits" className="space-y-4 mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold">Habit Tracker</h2>
            <Select value={timeFrame} onValueChange={(v) => setTimeFrame(v as TimeFrame)}>
              <SelectTrigger className="w-[165px] h-8 text-[13px]">
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

          <div className="glass-card p-4">
            <HabitGrid timeFrame={timeFrame} />
          </div>

          <div className="glass-card p-4">
            <DailyScore />
          </div>

          <div className="glass-card p-4">
            <HabitCharts timeFrame={timeFrame} />
          </div>
        </TabsContent>
      </Tabs>

      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}
