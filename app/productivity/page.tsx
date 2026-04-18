"use client";

import { useState, useEffect, useMemo } from "react";
import { useAppContext } from "@/lib/context";
import { HabitGrid } from "@/components/habit-tracker/habit-grid";
import { DailyScore } from "@/components/habit-tracker/daily-score";
import { HabitCharts } from "@/components/habit-tracker/habit-charts";
import { OnboardingModal } from "@/components/habit-tracker/onboarding-modal";
import { TodoList } from "@/components/todo/todo-list";
import { Diary } from "@/components/diary/diary";
import { Notes } from "@/components/notes/notes";
import { ScoreOfTheDay } from "@/components/shared/score-of-the-day";
import { ScoreProgress } from "@/components/shared/score-progress";
import { SwipeableTabs } from "@/components/shared/swipeable-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TimeFrame } from "@/types";

const TAB_MAP: Record<string, { value: string; label: string }> = {
  todos:  { value: "todos",  label: "To-Do List" },
  habits: { value: "habits", label: "Habit Tracker" },
  diary:  { value: "diary",  label: "Diary" },
  notes:  { value: "notes",  label: "Notes" },
};

export default function ProductivityPage() {
  const { habitData, preferences, loading } = useAppContext();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("this-week");
  const [activeTab, setActiveTab] = useState(preferences.defaultTab || "todos");

  // Build tabs in user-defined order
  const orderedTabs = useMemo(() => {
    const order = preferences.sectionOrder || ["todos", "habits", "diary", "notes"];
    return order.map((key) => TAB_MAP[key]).filter(Boolean);
  }, [preferences.sectionOrder]);

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

  // Map tab value to its content
  const tabContent: Record<string, React.ReactNode> = {
    todos: (
      <div className="glass-card p-4">
        <TodoList />
      </div>
    ),
    habits: (
      <div className="space-y-4">
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
        <div className="glass-card p-4"><HabitGrid timeFrame={timeFrame} /></div>
        <div className="glass-card p-4"><ScoreProgress timeFrame={timeFrame} /></div>
        <div className="glass-card p-4"><DailyScore timeFrame={timeFrame} /></div>
        <div className="glass-card p-4"><HabitCharts timeFrame={timeFrame} /></div>
      </div>
    ),
    diary: (
      <div className="glass-card p-4">
        <Diary />
      </div>
    ),
    notes: (
      <div className="glass-card p-4">
        <Notes />
      </div>
    ),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-5 animate-fade-up">
      <ScoreOfTheDay />

      <SwipeableTabs
        tabs={orderedTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {orderedTabs.map((tab) => (
          <div key={tab.value}>{tabContent[tab.value]}</div>
        ))}
      </SwipeableTabs>

      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />
    </div>
  );
}
