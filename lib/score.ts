import { getDailyScore } from "./habits";
import { getTodoScore } from "./todos";
import type { Habit, HabitLog, Todo, ScoreWeights } from "@/types";
import { format } from "date-fns";

export function getScoreOfTheDay(
  habits: Habit[],
  logs: HabitLog[],
  todos: Todo[],
  weights: ScoreWeights,
  date?: string
): number {
  const today = date || format(new Date(), "yyyy-MM-dd");
  const habitScore = getDailyScore(habits, logs, today);
  const todoScore = getTodoScore(todos, today);
  return Math.round(habitScore * weights.habitWeight + todoScore * weights.todoWeight);
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
