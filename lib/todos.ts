import type { Todo, TimeFrame } from "@/types";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { getDateRange } from "./habits";

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/** Get todos for a specific date (excludes general/undated todos) */
export function getTodosForDate(todos: Todo[], date: string): Todo[] {
  return todos.filter((t) => t.dueDate === date);
}

/** Get general (undated) todos — always shown at bottom */
export function getGeneralTodos(todos: Todo[]): Todo[] {
  return todos.filter((t) => !t.dueDate || t.dueDate === "");
}

export function getTodoScore(todos: Todo[], date: string): number {
  const dayTodos = getTodosForDate(todos, date).filter((t) => t.status !== "dropped");
  if (dayTodos.length === 0) return 0;
  const completed = dayTodos.filter((t) => t.completed).length;
  return Math.round((completed / dayTodos.length) * 100);
}

/** Average todo score across a timeframe */
export function getAverageTodoScore(todos: Todo[], timeFrame: TimeFrame): number {
  const { start, end } = getDateRange(timeFrame);
  const days = eachDayOfInterval({ start, end: end > new Date() ? new Date() : end });
  if (days.length === 0) return 0;
  let totalScore = 0;
  let daysWithTodos = 0;
  for (const day of days) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayTodos = getTodosForDate(todos, dateStr).filter((t) => t.status !== "dropped");
    if (dayTodos.length > 0) {
      const completed = dayTodos.filter((t) => t.completed).length;
      totalScore += Math.round((completed / dayTodos.length) * 100);
      daysWithTodos++;
    }
  }
  return daysWithTodos > 0 ? Math.round(totalScore / daysWithTodos) : 0;
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

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "urgent":
      return "bg-red-500 text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "medium":
      return "bg-yellow-500 text-black";
    case "low":
      return "bg-green-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
}

export function getToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Migrate old todos that lack new fields */
export function migrateTodo(t: Todo): Todo {
  return {
    ...t,
    status: t.status || (t.completed ? "completed" : "active"),
    subtasks: t.subtasks || [],
    order: t.order ?? 0,
    dueDate: t.dueDate ?? "",
    tags: t.tags || [],
    completedAt: t.completedAt ?? undefined,
  };
}
