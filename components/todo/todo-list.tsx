"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppContext } from "@/lib/context";
import {
  getTodosForDate,
  getTodoScore,
} from "@/lib/todos";
import { generateId } from "@/lib/habits";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, CalendarDays, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Todo, Priority } from "@/types";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<Priority, { bg: string; text: string; border: string }> = {
  urgent: { bg: "#F2364522", text: "#F23645", border: "#F2364544" },
  high:   { bg: "#f9731622", text: "#f97316", border: "#f9731644" },
  medium: { bg: "#eab30822", text: "#eab308", border: "#eab30844" },
  low:    { bg: "#09998122", text: "#099981", border: "#09998144" },
};

export function TodoList() {
  const { todoData, setTodoData } = useAppContext();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);

  // Dialog form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueTime, setDueTime] = useState("");
  const [category, setCategory] = useState("");

  // Inline add row state
  const [inlineTitle, setInlineTitle] = useState("");
  const [inlinePriority, setInlinePriority] = useState<Priority>("medium");
  const [inlineTime, setInlineTime] = useState("");
  const [inlineCategory, setInlineCategory] = useState("");

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dayTodos = useMemo(
    () => getTodosForDate(todoData.todos, dateStr),
    [todoData.todos, dateStr]
  );
  const score = useMemo(
    () => getTodoScore(todoData.todos, dateStr),
    [todoData.todos, dateStr]
  );

  const completedCount = dayTodos.filter((t) => t.completed).length;

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueTime("");
    setCategory("");
    setEditingTodo(null);
  };

  const addTodo = () => {
    if (!title.trim()) return;
    const todo: Todo = {
      id: generateId(),
      title: title.trim(),
      description,
      priority,
      dueDate: dateStr,
      dueTime,
      completed: false,
      category,
      createdAt: new Date().toISOString(),
    };
    setTodoData({ todos: [...todoData.todos, todo] });
    resetForm();
    setShowAddDialog(false);
  };

  const addInlineTodo = () => {
    if (!inlineTitle.trim()) return;
    const todo: Todo = {
      id: generateId(),
      title: inlineTitle.trim(),
      description: "",
      priority: inlinePriority,
      dueDate: dateStr,
      dueTime: inlineTime,
      completed: false,
      category: inlineCategory,
      createdAt: new Date().toISOString(),
    };
    setTodoData({ todos: [...todoData.todos, todo] });
    setInlineTitle("");
    setInlinePriority("medium");
    setInlineTime("");
    setInlineCategory("");
  };

  const updateTodo = () => {
    if (!editingTodo || !title.trim()) return;
    const updated = todoData.todos.map((t) =>
      t.id === editingTodo.id
        ? { ...t, title: title.trim(), description, priority, dueTime, category }
        : t
    );
    setTodoData({ todos: updated });
    resetForm();
    setShowAddDialog(false);
  };

  const toggleTodo = useCallback(
    (id: string) => {
      const updated = todoData.todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      );
      setTodoData({ todos: updated });
    },
    [todoData, setTodoData]
  );

  const deleteTodo = (id: string) => {
    setTodoData({ todos: todoData.todos.filter((t) => t.id !== id) });
  };

  const startEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setTitle(todo.title);
    setDescription(todo.description);
    setPriority(todo.priority);
    setDueTime(todo.dueTime);
    setCategory(todo.category);
    setShowAddDialog(true);
  };

  const todoDates = useMemo(() => {
    const dates = new Set(todoData.todos.map((t) => t.dueDate));
    return Array.from(dates).map((d) => parseISO(d));
  }, [todoData.todos]);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-400" />
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </h3>
          <p className="text-xs text-white/40 mt-0.5">
            {dayTodos.length} task{dayTodos.length !== 1 ? "s" : ""}
            {dayTodos.length > 0 && (
              <span
                className="ml-1.5 font-medium"
                style={{ color: score >= 80 ? "#099981" : score >= 50 ? "#eab308" : "#F23645" }}
              >
                {completedCount}/{dayTodos.length} done &middot; {score}%
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile calendar icon button */}
          <button
            className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-white/10 hover:bg-white/5 transition-colors text-white/50"
            onClick={() => setShowMobileCalendar(true)}
            aria-label="Open calendar"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <Button
            size="sm"
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Main layout: table LEFT, calendar RIGHT */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 items-start">

        {/* Task table */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="bg-white/[0.03]">
                <th
                  className="py-2 px-2 w-10"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                />
                <th
                  className="text-left px-3 py-2 text-[10px] font-semibold text-white/40 uppercase tracking-widest"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Task
                </th>
                <th
                  className="hidden md:table-cell text-left px-3 py-2 text-[10px] font-semibold text-white/40 uppercase tracking-widest w-24"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Priority
                </th>
                <th
                  className="hidden md:table-cell text-left px-3 py-2 text-[10px] font-semibold text-white/40 uppercase tracking-widest w-20"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Time
                </th>
                <th
                  className="hidden md:table-cell text-left px-3 py-2 text-[10px] font-semibold text-white/40 uppercase tracking-widest w-24"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Category
                </th>
                <th
                  className="py-2 w-16"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </tr>
            </thead>
            <tbody>
              {dayTodos.map((todo) => {
                const ps = PRIORITY_STYLE[todo.priority];
                return (
                  <tr
                    key={todo.id}
                    className={cn(
                      "group transition-colors hover:bg-white/[0.025]",
                      todo.completed && "opacity-50"
                    )}
                  >
                    {/* Radio/circle completion toggle */}
                    <td
                      className="text-center py-2.5 px-2"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <button
                        onClick={() => toggleTodo(todo.id)}
                        className="mx-auto h-5 w-5 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                        style={{
                          backgroundColor: todo.completed ? "#099981" : "#F23645",
                          border: `2px solid ${todo.completed ? "#099981" : "#F23645"}`,
                        }}
                        aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
                      >
                        {todo.completed && (
                          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                        )}
                      </button>
                    </td>
                    {/* Title */}
                    <td
                      className="px-3 py-2.5"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <p
                        className={cn(
                          "text-sm leading-tight",
                          todo.completed ? "line-through text-white/25" : "text-white/80"
                        )}
                      >
                        {todo.title}
                      </p>
                      {todo.description && (
                        <p className="text-[11px] text-white/30 mt-0.5 truncate max-w-[220px]">
                          {todo.description}
                        </p>
                      )}
                    </td>
                    {/* Priority — desktop only */}
                    <td
                      className="hidden md:table-cell px-3 py-2.5"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <span
                        className="text-[11px] px-2 py-0.5 rounded font-medium capitalize"
                        style={{
                          backgroundColor: ps.bg,
                          color: ps.text,
                          border: `1px solid ${ps.border}`,
                        }}
                      >
                        {todo.priority}
                      </span>
                    </td>
                    {/* Time — desktop only */}
                    <td
                      className="hidden md:table-cell px-3 py-2.5 text-xs"
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.45)",
                      }}
                    >
                      {todo.dueTime || <span style={{ color: "rgba(255,255,255,0.15)" }}>—</span>}
                    </td>
                    {/* Category — desktop only */}
                    <td
                      className="hidden md:table-cell px-3 py-2.5 text-xs truncate max-w-[96px]"
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.45)",
                      }}
                    >
                      {todo.category || <span style={{ color: "rgba(255,255,255,0.15)" }}>—</span>}
                    </td>
                    {/* Actions */}
                    <td
                      className="px-2 py-2.5"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <div className="flex items-center gap-0.5">
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-white/10 text-white/30 hover:text-white/60"
                          onClick={() => startEdit(todo)}
                          aria-label="Edit task"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded transition-colors hover:bg-white/10 text-white/30 hover:text-[#F23645]"
                          onClick={() => deleteTodo(todo.id)}
                          aria-label="Delete task"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Inline add row */}
              <tr className="bg-white/[0.015]">
                <td
                  className="text-center py-2.5 px-2"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="mx-auto h-5 w-5 rounded-full border-[1.5px] border-white/15" />
                </td>
                <td
                  className="px-3 py-2"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder-white/20"
                    style={{ color: "rgba(255,255,255,0.8)" }}
                    placeholder="Type a task and press Enter…"
                    value={inlineTitle}
                    onChange={(e) => setInlineTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addInlineTodo()}
                  />
                </td>
                <td
                  className="hidden md:table-cell px-2 py-2"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <select
                    className="w-full bg-transparent text-xs outline-none cursor-pointer"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                    value={inlinePriority}
                    onChange={(e) => setInlinePriority(e.target.value as Priority)}
                  >
                    <option value="low" className="bg-[#0d0f1a] text-white">Low</option>
                    <option value="medium" className="bg-[#0d0f1a] text-white">Medium</option>
                    <option value="high" className="bg-[#0d0f1a] text-white">High</option>
                    <option value="urgent" className="bg-[#0d0f1a] text-white">Urgent</option>
                  </select>
                </td>
                <td
                  className="hidden md:table-cell px-2 py-2"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <input
                    type="time"
                    className="w-full bg-transparent text-xs outline-none cursor-pointer"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                    value={inlineTime}
                    onChange={(e) => setInlineTime(e.target.value)}
                  />
                </td>
                <td
                  className="hidden md:table-cell px-2 py-2"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <input
                    className="w-full bg-transparent text-xs outline-none placeholder-white/20"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                    placeholder="Category"
                    value={inlineCategory}
                    onChange={(e) => setInlineCategory(e.target.value)}
                  />
                </td>
                <td
                  className="px-2 py-2 text-center"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <button
                    onClick={addInlineTodo}
                    disabled={!inlineTitle.trim()}
                    className="mx-auto h-6 w-6 flex items-center justify-center rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300"
                    aria-label="Add task"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Calendar — desktop right side only */}
        <div className="hidden md:block glass-card p-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && setSelectedDate(d)}
            modifiers={{ hasTodos: todoDates }}
            modifiersClassNames={{ hasTodos: "border-2 border-indigo-500" }}
            className="w-full"
          />
        </div>
      </div>

      {/* Mobile calendar dialog */}
      <Dialog open={showMobileCalendar} onOpenChange={setShowMobileCalendar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Select Date</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => { if (d) { setSelectedDate(d); setShowMobileCalendar(false); } }}
            modifiers={{ hasTodos: todoDates }}
            modifiersClassNames={{ hasTodos: "border-2 border-indigo-500" }}
            className="w-full"
          />
        </DialogContent>
      </Dialog>

      {/* Add / Edit Task dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(o) => { if (!o) { resetForm(); setShowAddDialog(false); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTodo ? "Edit Task" : "Add New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (editingTodo ? updateTodo() : addTodo())}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => v && setPriority(v as Priority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Time</Label>
                <Input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                placeholder="e.g., Work, Personal"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <Button onClick={editingTodo ? updateTodo : addTodo} className="w-full">
              {editingTodo ? "Update Task" : "Add Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
