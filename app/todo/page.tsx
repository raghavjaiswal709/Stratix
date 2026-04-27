"use client";

import { TodoList } from "@/components/todo/todo-list";

export default function TodoPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-white tracking-tight">To-Do</h1>
        <p className="text-[13px] text-white/40 mt-0.5">Manage your tasks and goals</p>
      </div>
      <div className="bg-[#141720] rounded-2xl border border-white/[0.07] p-5">
        <TodoList />
      </div>
    </div>
  );
}
