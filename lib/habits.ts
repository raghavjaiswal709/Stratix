import type { Habit, HabitLog, TimeFrame } from "@/types";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  format,
  isWithinInterval,
  eachDayOfInterval,
  parseISO,
} from "date-fns";

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function getDateRange(timeFrame: TimeFrame): { start: Date; end: Date } {
  const now = new Date();
  switch (timeFrame) {
    case "this-week":
      return { start: startOfWeek(now, { weekStartsOn: 0 }), end: endOfWeek(now, { weekStartsOn: 0 }) };
    case "this-month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last-3-months":
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case "last-6-months":
      return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
    case "this-year":
      return { start: startOfYear(now), end: endOfYear(now) };
    case "all-time":
      return { start: new Date(2020, 0, 1), end: now };
  }
}

export function getWeekDates(referenceDate: Date = new Date()): Date[] {
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: weekStart, end: weekEnd });
}

export function getDailyScore(
  habits: Habit[],
  logs: HabitLog[],
  date: string
): number {
  if (habits.length === 0) return 0;
  const dayLogs = logs.filter((l) => l.date === date && l.completed);
  return Math.round((dayLogs.length / habits.length) * 100);
}

export function getScoreColor(score: number): string {
  if (score <= 40) return "bg-red-500";
  if (score <= 60) return "bg-orange-500";
  if (score <= 79) return "bg-yellow-500";
  return "bg-green-500";
}

export function getScoreTextColor(score: number): string {
  if (score <= 40) return "text-red-500";
  if (score <= 60) return "text-orange-500";
  if (score <= 79) return "text-yellow-500";
  return "text-green-500";
}

export function getFilteredLogs(
  logs: HabitLog[],
  timeFrame: TimeFrame
): HabitLog[] {
  const { start, end } = getDateRange(timeFrame);
  return logs.filter((log) => {
    const logDate = parseISO(log.date);
    return isWithinInterval(logDate, { start, end });
  });
}

export function getHabitCompletionRate(
  habitId: string,
  logs: HabitLog[],
  timeFrame: TimeFrame
): number {
  const { start, end } = getDateRange(timeFrame);
  const days = eachDayOfInterval({ start, end });
  const completedDays = days.filter((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return logs.some(
      (l) => l.habitId === habitId && l.date === dateStr && l.completed
    );
  });
  return days.length > 0
    ? Math.round((completedDays.length / days.length) * 100)
    : 0;
}

export function getCurrentStreak(
  habitId: string,
  logs: HabitLog[]
): number {
  const today = new Date();
  let streak = 0;
  let currentDate = today;

  while (true) {
    const dateStr = format(currentDate, "yyyy-MM-dd");
    const isCompleted = logs.some(
      (l) => l.habitId === habitId && l.date === dateStr && l.completed
    );
    if (!isCompleted) break;
    streak++;
    currentDate = new Date(currentDate);
    currentDate.setDate(currentDate.getDate() - 1);
  }

  return streak;
}

export function getLongestStreak(
  habitId: string,
  logs: HabitLog[]
): number {
  const habitLogs = logs
    .filter((l) => l.habitId === habitId && l.completed)
    .map((l) => l.date)
    .sort();

  if (habitLogs.length === 0) return 0;

  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < habitLogs.length; i++) {
    const prev = parseISO(habitLogs[i - 1]);
    const curr = parseISO(habitLogs[i]);
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

export function getHeatmapData(
  habits: Habit[],
  logs: HabitLog[]
): { date: string; score: number }[] {
  const now = new Date();
  const yearStart = startOfYear(now);
  const days = eachDayOfInterval({ start: yearStart, end: now });

  return days.map((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return {
      date: dateStr,
      score: getDailyScore(habits, logs, dateStr),
    };
  });
}
