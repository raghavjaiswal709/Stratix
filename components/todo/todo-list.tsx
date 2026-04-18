"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useAppContext } from "@/lib/context";
import {
  getTodosForDate,
  getTodoScore,
  getGeneralTodos,
  migrateTodo,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  Check,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  Ban,
  Filter,
  Tag,
  X,
  Clock,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Todo, Priority, SubTask, TodoStatus } from "@/types";
import { TODO_CATEGORIES } from "@/types";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<Priority, { bg: string; text: string; border: string }> = {
  urgent: { bg: "#F2364522", text: "#F23645", border: "#F2364544" },
  high:   { bg: "#f9731622", text: "#f97316", border: "#f9731644" },
  medium: { bg: "#eab30822", text: "#eab308", border: "#eab30844" },
  low:    { bg: "#09998122", text: "#099981", border: "#09998144" },
};

const TASK_COLORS = [
  "", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];

const SWIPE_THRESHOLD = 80;

type SortMode = "manual" | "priority" | "created" | "tag";

// ──────────────────────────── TodoRow ────────────────────────────

function TodoRow({
  todo,
  onToggle,
  onEdit,
  onDelete,
  onDrop,
  onUpdateTitle,
  onToggleSubtask,
  onAddSubtask,
  onDeleteSubtask,
  onMoveUp,
  onMoveDown,
}: {
  todo: Todo;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDrop: () => void;
  onUpdateTitle: (title: string) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onAddSubtask: (title: string) => void;
  onDeleteSubtask: (subtaskId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(todo.title);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [newSubtask, setNewSubtask] = useState("");
  const [swipeX, setSwipeX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const ps = PRIORITY_STYLE[todo.priority];
  const isDropped = todo.status === "dropped";
  const completedSubtasks = todo.subtasks?.filter((s) => s.completed).length ?? 0;
  const totalSubtasks = todo.subtasks?.length ?? 0;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    if (dy > 30) { setSwipeX(0); return; }
    if (dx > 0) setSwipeX(Math.min(dx, 120));
    else setSwipeX(0);
  };

  const handleTouchEnd = () => {
    if (swipeX >= SWIPE_THRESHOLD && !isDropped) onToggle();
    setSwipeX(0);
    touchStartRef.current = null;
  };

  const handleTitleSave = () => {
    if (titleValue.trim() && titleValue.trim() !== todo.title) onUpdateTitle(titleValue.trim());
    else setTitleValue(todo.title);
    setEditingTitle(false);
  };

  return (
    <div className="relative overflow-hidden">
      {swipeX > 0 && (
        <div className="absolute inset-0 flex items-center pl-4 bg-green-500/20 text-green-500 text-sm font-medium">
          <Check className="h-5 w-5 mr-2" /> {todo.completed ? "Undo" : "Done"}
        </div>
      )}

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "relative flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-muted/40 border-b border-[var(--table-border)]",
          isDropped && "opacity-40",
          todo.completed && !isDropped && "opacity-60"
        )}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swipeX === 0 ? "transform 0.2s" : "none",
          backgroundColor: "var(--background)",
          borderLeft: todo.color ? `3px solid ${todo.color}` : undefined,
        }}
      >
        {/* Reorder */}
        <div className="mt-1 hidden md:flex flex-col gap-0">
          <button onClick={onMoveUp} className="text-muted-foreground/30 hover:text-muted-foreground h-3" title="Move up">
            <ChevronDown className="h-3 w-3 rotate-180" />
          </button>
          <button onClick={onMoveDown} className="text-muted-foreground/30 hover:text-muted-foreground h-3" title="Move down">
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        {/* Toggle */}
        <button
          onClick={isDropped ? undefined : onToggle}
          disabled={isDropped}
          className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-transform hover:scale-110 active:scale-95"
          style={{
            backgroundColor: isDropped ? "#666" : todo.completed ? "#099981" : "#F23645",
            border: `2px solid ${isDropped ? "#666" : todo.completed ? "#099981" : "#F23645"}`,
          }}
        >
          {todo.completed && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
          {isDropped && <Ban className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editingTitle ? (
              <input
                autoFocus
                className="bg-transparent text-sm outline-none border-b border-muted-foreground/30 w-full text-foreground"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => { if (e.key === "Enter") handleTitleSave(); if (e.key === "Escape") { setTitleValue(todo.title); setEditingTitle(false); } }}
              />
            ) : (
              <p
                onClick={() => { if (!isDropped) { setEditingTitle(true); setTitleValue(todo.title); } }}
                className={cn(
                  "text-sm leading-tight cursor-text",
                  todo.completed ? "line-through text-foreground/30" : "text-foreground/80",
                  isDropped && "line-through cursor-default"
                )}
              >
                {todo.title}
              </p>
            )}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize shrink-0"
              style={{ backgroundColor: ps.bg, color: ps.text, border: `1px solid ${ps.border}` }}
            >
              {todo.priority}
            </span>
          </div>

          {todo.description && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate max-w-[280px]">{todo.description}</p>
          )}

          {isDropped && todo.dropReason && (
            <p className="text-[10px] text-red-400/70 mt-0.5 italic">Dropped: {todo.dropReason}</p>
          )}

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {todo.category && (
              <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">{todo.category}</span>
            )}
            {todo.tags?.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 flex items-center gap-0.5">
                <Tag className="h-2 w-2" />{tag}
              </span>
            ))}
            {todo.dueTime && <span className="text-[10px] text-muted-foreground/60">{todo.dueTime}</span>}
            {todo.dueDate && <span className="text-[10px] text-muted-foreground/60">{format(parseISO(todo.dueDate), "MMM d")}</span>}
            {totalSubtasks > 0 && (
              <button onClick={() => setShowSubtasks(!showSubtasks)} className="text-[10px] text-indigo-400 flex items-center gap-0.5">
                {showSubtasks ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {completedSubtasks}/{totalSubtasks} subtasks
              </button>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
              <Clock className="h-2 w-2" />Created {format(parseISO(todo.createdAt), "MMM d, h:mm a")}
            </span>
            {todo.completedAt && (
              <span className="text-[9px] text-green-500/50 flex items-center gap-0.5">
                <Check className="h-2 w-2" />Done {format(parseISO(todo.completedAt), "MMM d, h:mm a")}
              </span>
            )}
          </div>

          {showSubtasks && (
            <div className="mt-2 ml-2 space-y-1">
              {todo.subtasks?.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 group/sub">
                  <button
                    onClick={() => onToggleSubtask(sub.id)}
                    className="h-3.5 w-3.5 rounded-sm border border-muted-foreground/30 flex items-center justify-center shrink-0"
                    style={sub.completed ? { backgroundColor: "#099981", borderColor: "#099981" } : {}}
                  >
                    {sub.completed && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
                  </button>
                  <span className={cn("text-[12px]", sub.completed && "line-through text-muted-foreground/50")}>{sub.title}</span>
                  <button onClick={() => onDeleteSubtask(sub.id)} className="h-4 w-4 items-center justify-center rounded text-muted-foreground/40 hover:text-red-400 hidden group-hover/sub:flex">
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Plus className="h-3 w-3 text-muted-foreground/40" />
                <input
                  className="bg-transparent text-[12px] outline-none placeholder-muted-foreground/40 w-full"
                  placeholder="Add subtask…"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSubtask.trim()) { onAddSubtask(newSubtask.trim()); setNewSubtask(""); }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Three-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="mt-0.5 h-6 w-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors shrink-0">
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowSubtasks(true)}><Plus className="mr-2 h-3.5 w-3.5" /> Subtasks</DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveUp}><ChevronDown className="mr-2 h-3.5 w-3.5 rotate-180" /> Move Up</DropdownMenuItem>
            <DropdownMenuItem onClick={onMoveDown}><ChevronDown className="mr-2 h-3.5 w-3.5" /> Move Down</DropdownMenuItem>
            {!isDropped && (
              <DropdownMenuItem onClick={onDrop} className="text-orange-400"><Ban className="mr-2 h-3.5 w-3.5" /> Drop Task</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-red-400"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ──────────────────────────── TodoList ────────────────────────────

export function TodoList() {
  const { todoData, setTodoData } = useAppContext();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  const [showDropDialog, setShowDropDialog] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropReason, setDropReason] = useState("");

  // Filter & sort state
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueTime, setDueTime] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isGeneral, setIsGeneral] = useState(false);
  const [todoColor, setTodoColor] = useState("");
  const [todoTags, setTodoTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");

  const [inlineTitle, setInlineTitle] = useState("");
  const [inlinePriority, setInlinePriority] = useState<Priority>("medium");

  const todos = useMemo(() => todoData.todos.map(migrateTodo), [todoData.todos]);
  const allTags = useMemo(() => todoData.tags || [], [todoData.tags]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  // Apply filters
  const applyFilters = useCallback((list: Todo[]) => {
    let result = list;
    if (filterPriority !== "all") {
      result = result.filter((t) => t.priority === filterPriority);
    }
    if (filterTag !== "all") {
      result = result.filter((t) => t.tags?.includes(filterTag));
    }
    return result;
  }, [filterPriority, filterTag]);

  // Sort: completed items always to bottom, then by sort mode
  const applySort = useCallback((list: Todo[]) => {
    const active = list.filter((t) => !t.completed && t.status !== "dropped");
    const done = list.filter((t) => t.completed || t.status === "dropped");

    const sortFn = (a: Todo, b: Todo) => {
      switch (sortMode) {
        case "priority": {
          const order: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          return order[a.priority] - order[b.priority];
        }
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "tag":
          return (a.tags?.[0] || "zzz").localeCompare(b.tags?.[0] || "zzz");
        default:
          return (a.order ?? 0) - (b.order ?? 0);
      }
    };

    return [...active.sort(sortFn), ...done.sort(sortFn)];
  }, [sortMode]);

  const dayTodos = useMemo(
    () => applySort(applyFilters(getTodosForDate(todos, dateStr))),
    [todos, dateStr, applyFilters, applySort]
  );
  const generalTodos = useMemo(
    () => applySort(applyFilters(getGeneralTodos(todos))),
    [todos, applyFilters, applySort]
  );
  const score = useMemo(() => getTodoScore(todos, dateStr), [todos, dateStr]);

  const activeDayTodos = dayTodos.filter((t) => t.status !== "dropped");
  const completedCount = activeDayTodos.filter((t) => t.completed).length;

  const resetForm = () => {
    setTitle(""); setDescription(""); setPriority("medium"); setDueTime("");
    setCategory(""); setDueDate(""); setIsGeneral(false); setTodoColor("");
    setTodoTags([]); setNewTagInput(""); setEditingTodo(null);
  };

  const saveTodos = useCallback((updated: Todo[]) => setTodoData({ ...todoData, todos: updated }), [setTodoData, todoData]);

  const saveTag = useCallback((tag: string) => {
    if (!tag.trim()) return;
    const t = tag.trim().toLowerCase();
    if (!allTags.includes(t)) {
      setTodoData({ ...todoData, tags: [...allTags, t] });
    }
  }, [allTags, todoData, setTodoData]);

  const addTag = () => {
    const t = newTagInput.trim().toLowerCase();
    if (t && !todoTags.includes(t)) {
      setTodoTags([...todoTags, t]);
      saveTag(t);
    }
    setNewTagInput("");
  };

  const removeTag = (tag: string) => setTodoTags(todoTags.filter((t) => t !== tag));

  const addTodo = () => {
    if (!title.trim()) return;
    const maxOrder = Math.max(0, ...todos.map((t) => t.order ?? 0));
    const todo: Todo = {
      id: generateId(), title: title.trim(), description, priority,
      dueDate: isGeneral ? "" : (dueDate || dateStr), dueTime,
      completed: false, status: "active", category, subtasks: [],
      order: maxOrder + 1, color: todoColor || undefined,
      tags: todoTags, createdAt: new Date().toISOString(),
    };
    saveTodos([...todos, todo]);
    resetForm(); setShowAddDialog(false);
  };

  const addInlineTodo = () => {
    if (!inlineTitle.trim()) return;
    const maxOrder = Math.max(0, ...todos.map((t) => t.order ?? 0));
    const todo: Todo = {
      id: generateId(), title: inlineTitle.trim(), description: "", priority: inlinePriority,
      dueDate: dateStr, dueTime: "", completed: false, status: "active",
      category: "", subtasks: [], order: maxOrder + 1, tags: [],
      createdAt: new Date().toISOString(),
    };
    saveTodos([...todos, todo]);
    setInlineTitle(""); setInlinePriority("medium");
  };

  const updateTodo = () => {
    if (!editingTodo || !title.trim()) return;
    const updated = todos.map((t) =>
      t.id === editingTodo.id
        ? { ...t, title: title.trim(), description, priority, dueTime, category, dueDate: isGeneral ? "" : (dueDate || t.dueDate), color: todoColor || undefined, tags: todoTags }
        : t
    );
    saveTodos(updated); resetForm(); setShowAddDialog(false);
  };

  const toggleTodo = useCallback((id: string) => {
    const now = new Date().toISOString();
    const updated = todos.map((t) =>
      t.id === id ? {
        ...t,
        completed: !t.completed,
        status: (!t.completed ? "completed" : "active") as TodoStatus,
        completedAt: !t.completed ? now : undefined,
      } : t
    );
    saveTodos(updated);
  }, [todos, saveTodos]);

  const deleteTodo = (id: string) => saveTodos(todos.filter((t) => t.id !== id));

  const dropTask = () => {
    if (!dropTargetId || !dropReason.trim()) return;
    const updated = todos.map((t) =>
      t.id === dropTargetId ? { ...t, status: "dropped" as TodoStatus, dropReason: dropReason.trim(), completed: false } : t
    );
    saveTodos(updated); setShowDropDialog(false); setDropTargetId(null); setDropReason("");
  };

  const updateTitle = (id: string, newTitle: string) => {
    saveTodos(todos.map((t) => (t.id === id ? { ...t, title: newTitle } : t)));
  };

  const toggleSubtask = (todoId: string, subtaskId: string) => {
    saveTodos(todos.map((t) => {
      if (t.id !== todoId) return t;
      return { ...t, subtasks: t.subtasks.map((s) => s.id === subtaskId ? { ...s, completed: !s.completed } : s) };
    }));
  };

  const addSubtask = (todoId: string, stTitle: string) => {
    const sub: SubTask = { id: generateId(), title: stTitle, completed: false };
    saveTodos(todos.map((t) => t.id === todoId ? { ...t, subtasks: [...(t.subtasks || []), sub] } : t));
  };

  const deleteSubtask = (todoId: string, subtaskId: string) => {
    saveTodos(todos.map((t) => {
      if (t.id !== todoId) return t;
      return { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) };
    }));
  };

  const moveTodo = (id: string, direction: "up" | "down", list: Todo[]) => {
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    saveTodos(todos.map((t) => {
      if (t.id === list[idx].id) return { ...t, order: list[swapIdx].order };
      if (t.id === list[swapIdx].id) return { ...t, order: list[idx].order };
      return t;
    }));
  };

  const startEdit = (todo: Todo) => {
    setEditingTodo(todo); setTitle(todo.title); setDescription(todo.description);
    setPriority(todo.priority); setDueTime(todo.dueTime); setCategory(todo.category);
    setDueDate(todo.dueDate); setIsGeneral(!todo.dueDate); setTodoColor(todo.color || "");
    setTodoTags(todo.tags || []); setShowAddDialog(true);
  };

  const todoDates = useMemo(() => {
    const dates = new Set(todos.filter((t) => t.dueDate).map((t) => t.dueDate));
    return Array.from(dates).map((d) => parseISO(d));
  }, [todos]);

  const hasActiveFilters = filterPriority !== "all" || filterTag !== "all" || sortMode !== "manual";

  const renderTodoList = (list: Todo[], sectionType: "dated" | "general") => (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--table-border)" }}>
      {list.map((todo) => (
        <TodoRow
          key={todo.id}
          todo={todo}
          onToggle={() => toggleTodo(todo.id)}
          onEdit={() => startEdit(todo)}
          onDelete={() => deleteTodo(todo.id)}
          onDrop={() => { setDropTargetId(todo.id); setShowDropDialog(true); }}
          onUpdateTitle={(t) => updateTitle(todo.id, t)}
          onToggleSubtask={(sid) => toggleSubtask(todo.id, sid)}
          onAddSubtask={(t) => addSubtask(todo.id, t)}
          onDeleteSubtask={(sid) => deleteSubtask(todo.id, sid)}
          onMoveUp={() => moveTodo(todo.id, "up", list)}
          onMoveDown={() => moveTodo(todo.id, "down", list)}
        />
      ))}

      {sectionType === "dated" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
          <div className="h-5 w-5 rounded-full border-[1.5px] border-muted-foreground/15 shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder-muted-foreground/40 text-foreground"
            placeholder="Type a task and press Enter…"
            value={inlineTitle}
            onChange={(e) => setInlineTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addInlineTodo()}
          />
          <select
            className="bg-transparent text-xs outline-none cursor-pointer text-muted-foreground hidden md:block"
            value={inlinePriority}
            onChange={(e) => setInlinePriority(e.target.value as Priority)}
          >
            <option value="low" className="bg-background text-foreground">Low</option>
            <option value="medium" className="bg-background text-foreground">Medium</option>
            <option value="high" className="bg-background text-foreground">High</option>
            <option value="urgent" className="bg-background text-foreground">Urgent</option>
          </select>
          <button
            onClick={addInlineTodo}
            disabled={!inlineTitle.trim()}
            className="h-6 w-6 flex items-center justify-center rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed hover:bg-indigo-500/20 text-indigo-400"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-400" />
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeDayTodos.length} task{activeDayTodos.length !== 1 ? "s" : ""}
            {activeDayTodos.length > 0 && (
              <span className="ml-1.5 font-medium" style={{ color: score >= 80 ? "#099981" : score >= 50 ? "#eab308" : "#F23645" }}>
                {completedCount}/{activeDayTodos.length} done &middot; {score}%
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter button */}
          <button
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors",
              hasActiveFilters ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/10" : "text-muted-foreground"
            )}
            onClick={() => setShowFilterMenu(!showFilterMenu)}
          >
            <Filter className="h-4 w-4" />
          </button>
          <button
            className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => setShowMobileCalendar(true)}
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <Button size="sm" onClick={() => { resetForm(); setShowAddDialog(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> Add Task
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilterMenu && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border/60 bg-muted/30">
          <span className="text-xs font-medium text-muted-foreground">Sort:</span>
          <select
            className="bg-transparent text-xs outline-none cursor-pointer text-foreground border border-border rounded px-2 py-1"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="manual" className="bg-background">Manual</option>
            <option value="priority" className="bg-background">Priority</option>
            <option value="created" className="bg-background">Date Created</option>
            <option value="tag" className="bg-background">Tag</option>
          </select>

          <span className="text-xs font-medium text-muted-foreground ml-2">Priority:</span>
          <select
            className="bg-transparent text-xs outline-none cursor-pointer text-foreground border border-border rounded px-2 py-1"
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as Priority | "all")}
          >
            <option value="all" className="bg-background">All</option>
            <option value="urgent" className="bg-background">Urgent</option>
            <option value="high" className="bg-background">High</option>
            <option value="medium" className="bg-background">Medium</option>
            <option value="low" className="bg-background">Low</option>
          </select>

          {allTags.length > 0 && (
            <>
              <span className="text-xs font-medium text-muted-foreground ml-2">Tag:</span>
              <select
                className="bg-transparent text-xs outline-none cursor-pointer text-foreground border border-border rounded px-2 py-1"
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
              >
                <option value="all" className="bg-background">All</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag} className="bg-background">{tag}</option>
                ))}
              </select>
            </>
          )}

          {hasActiveFilters && (
            <button
              onClick={() => { setSortMode("manual"); setFilterPriority("all"); setFilterTag("all"); }}
              className="text-[10px] text-red-400 hover:text-red-300 ml-auto"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="space-y-4">
          {renderTodoList(dayTodos, "dated")}

          {generalTodos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <span className="h-px flex-1 bg-border/60" /> General Tasks <span className="h-px flex-1 bg-border/60" />
              </h4>
              {renderTodoList(generalTodos, "general")}
            </div>
          )}
        </div>

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
          <DialogHeader><DialogTitle className="text-sm font-medium">Select Date</DialogTitle></DialogHeader>
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

      {/* Drop Task dialog */}
      <Dialog open={showDropDialog} onOpenChange={(o) => { if (!o) { setShowDropDialog(false); setDropTargetId(null); setDropReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Drop Task</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">Why are you dropping this task? A reason is required.</p>
            <Textarea placeholder="Enter reason…" value={dropReason} onChange={(e) => setDropReason(e.target.value)} rows={2} className="resize-none" />
            <Button onClick={dropTask} disabled={!dropReason.trim()} className="w-full" variant="destructive">Drop Task</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Task dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { if (!o) { resetForm(); setShowAddDialog(false); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTodo ? "Edit Task" : "Add New Task"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)}
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
                className="resize-none max-h-[120px] overflow-y-auto"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => v && setPriority(v as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {TODO_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Time</Label>
                <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={isGeneral ? "" : (dueDate || dateStr)} onChange={(e) => { setDueDate(e.target.value); setIsGeneral(false); }} disabled={isGeneral} />
              </div>
            </div>

            {/* Color picker */}
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {TASK_COLORS.map((c) => (
                  <button
                    key={c || "none"}
                    onClick={() => setTodoColor(c)}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                      todoColor === c ? "scale-110 ring-2 ring-offset-1 ring-offset-background ring-foreground/30" : ""
                    )}
                    style={{
                      backgroundColor: c || "transparent",
                      borderColor: c || "var(--border)",
                    }}
                    title={c || "No color"}
                  >
                    {!c && todoColor === "" && <X className="h-3 w-3 text-muted-foreground mx-auto" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {todoTags.map((tag) => (
                  <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-400"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag…"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  className="h-8 text-sm"
                />
                {allTags.length > 0 && (
                  <select
                    className="bg-transparent text-xs outline-none cursor-pointer text-muted-foreground border border-border rounded px-2"
                    value=""
                    onChange={(e) => {
                      const t = e.target.value;
                      if (t && !todoTags.includes(t)) setTodoTags([...todoTags, t]);
                    }}
                  >
                    <option value="" className="bg-background">Saved tags…</option>
                    {allTags.filter((t) => !todoTags.includes(t)).map((t) => (
                      <option key={t} value={t} className="bg-background">{t}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="general-todo" checked={isGeneral} onChange={(e) => setIsGeneral(e.target.checked)} className="rounded" />
              <label htmlFor="general-todo" className="text-sm text-muted-foreground cursor-pointer">General task (no specific date)</label>
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
