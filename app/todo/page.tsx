"use client";

import { TodoList } from "@/components/todo/todo-list";

export default function TodoPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">To-Do</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Manage your tasks and goals</p>
      </div>
      <div className="bg-card rounded-2xl border border-border p-5">
        <TodoList />
      </div>
    </div>
  );
}
