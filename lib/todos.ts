import type { Todo } from "@/types";
import { format } from "date-fns";

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function getTodosForDate(todos: Todo[], date: string): Todo[] {
  return todos.filter((t) => t.dueDate === date);
}

export function getTodoScore(todos: Todo[], date: string): number {
  const dayTodos = getTodosForDate(todos, date);
  if (dayTodos.length === 0) return 0;
  const completed = dayTodos.filter((t) => t.completed).length;
  return Math.round((completed / dayTodos.length) * 100);
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
