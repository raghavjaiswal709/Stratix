"use client";

import React, { useCallback, useMemo, useState, Fragment } from "react";
import { useAppContext } from "@/lib/context";
import { getWeekDates, generateId, getDateRange, getDailyScore } from "@/lib/habits";
import { format, eachDayOfInterval } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, MoreVertical, Pencil, Trash2, Search, X, ChevronDown, ChevronRight, Star } from "lucide-react";
import {
  HABIT_ICON_MAP,
  HABIT_ICONS_LIST,
  ICON_CATEGORIES,
  type HabitIconKey,
  type IconCategory,
} from "@/lib/habit-icons";
import type { Habit, TimeFrame, SubHabit } from "@/types";
import { cn, fireConfetti } from "@/lib/utils";

// ── Icon display helper ────────────────────────────────────────────────────

function HabitIconComp({
  iconKey,
  size = 16,
  color,
}: {
  iconKey?: string;
  size?: number;
  color?: string;
}) {
  const Icon = (HABIT_ICON_MAP[(iconKey as HabitIconKey) || "Target"] ??
    HABIT_ICON_MAP["Target"]) as React.FC<{ size?: number; color?: string }>;
  return <Icon size={size} color={color} />;
}

// ── Constants ─────────────────────────────────────────────────────────────
const COLOR_OPTIONS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#a855f7",
];

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_DAYS   = [0, 1, 2, 3, 4, 5, 6];

// ── Component ─────────────────────────────────────────────────────────────
export function HabitGrid({ timeFrame }: { timeFrame?: TimeFrame }) {
  const { habitData, setHabitData } = useAppContext();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editingSubHabitObj, setEditingSubHabitObj] = useState<{parent: Habit, subHabit: SubHabit} | null>(null);

  const [newHabitName,     setNewHabitName]     = useState("");
  const [newHabitIcon,     setNewHabitIcon]     = useState<HabitIconKey | "">("");
  const [newHabitColor,    setNewHabitColor]    = useState(COLOR_OPTIONS[0]);
  const [newHabitCategory, setNewHabitCategory] = useState("");
  const [newHabitWeight,   setNewHabitWeight]   = useState(1);
  const [newHabitWeekDays, setNewHabitWeekDays] = useState<number[]>(ALL_DAYS);
  const [newSubHabits,     setNewSubHabits]     = useState<SubHabit[]>([]);
  const [subHabitInput,    setSubHabitInput]    = useState("");
  const [editingSubHabitId, setEditingSubHabitId] = useState<string | null>(null);
  const [expandedHabits,   setExpandedHabits]   = useState<Record<string, boolean>>({});

  const [showAll,          setShowAll]          = useState(false);

  // Icon picker search / category state
  const [iconSearch,   setIconSearch]   = useState("");
  const [iconCategory, setIconCategory] = useState<IconCategory>("All");

  // ── Date columns based on timeFrame ──────────────────────────────────────
  const displayDates = useMemo(() => {
    if (!timeFrame || timeFrame === "this-week") return getWeekDates();
    if (timeFrame === "this-month") {
      const { start, end } = getDateRange("this-month");
      return eachDayOfInterval({ start, end });
    }
    // For longer ranges: show the most recent 31 days
    const { end } = getDateRange(timeFrame);
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return eachDayOfInterval({ start, end });
  }, [timeFrame]);

  // ── Filtered icon list for picker ────────────────────────────────────────
  const filteredIcons = useMemo(() => {
    const q = iconSearch.toLowerCase().trim();
    return HABIT_ICONS_LIST.filter((entry) => {
      if (iconCategory !== "All" && entry.category !== iconCategory) return false;
      if (!q) return true;
      return (
        entry.key.toLowerCase().includes(q) ||
        entry.label.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.includes(q))
      );
    });
  }, [iconSearch, iconCategory]);

  // ── Habit log helpers ────────────────────────────────────────────────────
  const toggleHabit = useCallback(
    (habitId: string, date: string) => {
      const existing = habitData.logs.find(
        (l) => l.habitId === habitId && l.date === date
      );
      
      const becomingCompleted = existing ? !existing.completed : true;
      if (becomingCompleted) fireConfetti();

      const getActiveSh = (h) => {
        const d = new Date(date).getDay();
        return h.subHabits?.filter(sh => !sh.weekDays?.length || sh.weekDays.includes(d)) || [];
      };

      const newLogs = existing
        ? habitData.logs.map((l) =>
            l.habitId === habitId && l.date === date
              ? { ...l, completed: !l.completed, completedSubHabits: !l.completed ? getActiveSh(habitData.habits.find(h => h.id === habitId)).map(sh => sh.id) : [] }
              : l
          )
        : [...habitData.logs, { 
            habitId, 
            date, 
            completed: true, 
            completedSubHabits: getActiveSh(habitData.habits.find(h => h.id === habitId)).map(sh => sh.id) 
          }];
      setHabitData({ ...habitData, logs: newLogs });
    },
    [habitData, setHabitData]
  );

  const toggleSubHabit = useCallback(
    (habitId: string, subHabitId: string, date: string) => {
      const habit = habitData.habits.find(h => h.id === habitId);
      if (!habit) return;

      const existingLog = habitData.logs.find(
        (l) => l.habitId === habitId && l.date === date
      );

      let newLogs;
      if (existingLog) {
        const completedSubHabits = existingLog.completedSubHabits || [];
        const isCurrentlyCompleted = completedSubHabits.includes(subHabitId);
        
        const nextSubHabits = isCurrentlyCompleted
          ? completedSubHabits.filter(id => id !== subHabitId)
          : [...completedSubHabits, subHabitId];
        
        const dayOfWeek = new Date(date).getDay();
        const activeSubHabits = habit.subHabits?.filter(sh => !sh.weekDays?.length || sh.weekDays.includes(dayOfWeek)) || [];
        const allDone = activeSubHabits.length > 0 && activeSubHabits.every(sh => nextSubHabits.includes(sh.id));
        
        if (allDone && !existingLog.completed) fireConfetti();

        newLogs = habitData.logs.map(l => 
          l.habitId === habitId && l.date === date
            ? { ...l, completedSubHabits: nextSubHabits, completed: allDone }
            : l
        );
      } else {
        const nextSubHabits = [subHabitId];
        const dayOfWeek = new Date(date).getDay();
        const activeSubHabits = habit.subHabits?.filter(sh => !sh.weekDays?.length || sh.weekDays.includes(dayOfWeek)) || [];
        const allDone = activeSubHabits.length > 0 && activeSubHabits.every(sh => nextSubHabits.includes(sh.id));
        if (allDone) fireConfetti();
        
        newLogs = [...habitData.logs, {
          habitId,
          date,
          completed: allDone,
          completedSubHabits: nextSubHabits
        }];
      }
      setHabitData({ ...habitData, logs: newLogs });
    },
    [habitData, setHabitData]
  );

  const getLog = useCallback(
    (habitId: string, date: string) => 
      habitData.logs.find(l => l.habitId === habitId && l.date === date),
    [habitData.logs]
  );

  const getCompletionRatio = useCallback(
    (habit: Habit, date: string): number => {
      const log = getLog(habit.id, date);
      if (!log) return 0;
      const dayOfWeek = new Date(date).getDay();
      const activeSubHabits = habit.subHabits?.filter(sh => !sh.weekDays?.length || sh.weekDays.includes(dayOfWeek)) || [];
      if (activeSubHabits.length === 0) return log.completed ? 1 : 0;
      
      let points = 0;
      let maxPoints = 0;
      activeSubHabits.forEach(sh => {
        const w = sh.weight || 1;
        maxPoints += w;
        if (log.completedSubHabits?.includes(sh.id)) points += w;
      });
      return maxPoints > 0 ? points / maxPoints : 0;
    },
    [getLog]
  );

  // ── Form helpers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setNewHabitName("");
    setNewHabitIcon("");
    setNewHabitColor(COLOR_OPTIONS[0]);
    setNewHabitCategory("");
    setNewHabitWeight(1);
    setNewHabitWeekDays(ALL_DAYS);
    setNewSubHabits([]);
    setSubHabitInput("");
    setEditingSubHabitId(null);
    setIconSearch("");
    setIconCategory("All");
  };

  const openAdd = () => { resetForm(); setShowAddDialog(true); };

  const closeDialog = () => {
    setShowAddDialog(false);
    setEditingHabit(null);
    setEditingSubHabitObj(null);
    resetForm();
  };

  const addHabit = () => {
    if (!newHabitName.trim() || !newHabitIcon) return;
    const habit: Habit = {
      id: generateId(),
      name: newHabitName.trim(),
      color: newHabitColor,
      icon: newHabitIcon,
      weekDays: newHabitWeekDays,
      category: newHabitCategory,
      weight: newHabitWeight,
      subHabits: newSubHabits.length > 0 ? newSubHabits : undefined,
      createdAt: new Date().toISOString(),
    };
    setHabitData({ ...habitData, habits: [...habitData.habits, habit] });
    closeDialog();
  };

  const updateHabit = () => {
    if (!editingHabit || !newHabitName.trim() || !newHabitIcon) return;
    const updated = habitData.habits.map((h) =>
      h.id === editingHabit.id
        ? { ...h, name: newHabitName, color: newHabitColor, icon: newHabitIcon, weekDays: newHabitWeekDays, category: newHabitCategory, weight: newHabitWeight, subHabits: newSubHabits.length > 0 ? newSubHabits : undefined }
        : h
    );
    setHabitData({ ...habitData, habits: updated });
    closeDialog();
  };

  const deleteHabit = (id: string) => {
    setHabitData({
      habits: habitData.habits.filter((h) => h.id !== id),
      logs:   habitData.logs.filter((l) => l.habitId !== id),
    });
  };

  const updateSubHabitObj = () => {
    if (!editingSubHabitObj || !newHabitName.trim() || !newHabitIcon) return;
    const { parent, subHabit } = editingSubHabitObj;
    const updated = habitData.habits.map((h) => {
      if (h.id === parent.id && h.subHabits) {
        return {
          ...h,
          subHabits: h.subHabits.map((sh) =>
            sh.id === subHabit.id
              ? { ...sh, name: newHabitName, icon: newHabitIcon, color: newHabitColor, weight: newHabitWeight, weekDays: newHabitWeekDays }
              : sh
          )
        };
      }
      return h;
    });
    setHabitData({ ...habitData, habits: updated });
    closeDialog();
  };

  const startEditSubHabit = (parent: Habit, subHabit: SubHabit) => {
    setEditingSubHabitObj({ parent, subHabit });
    setNewHabitName(subHabit.name);
    setNewHabitIcon((subHabit.icon as HabitIconKey) || parent.icon || "");
    setNewHabitColor(subHabit.color || parent.color || COLOR_OPTIONS[0]);
    setNewHabitWeight(subHabit.weight || 1);
    setNewHabitWeekDays(subHabit.weekDays?.length ? subHabit.weekDays : ALL_DAYS);
  };

  const deleteSubHabitDirect = (parent: Habit, subHabitId: string) => {
    const updated = habitData.habits.map((h) => {
      if (h.id === parent.id && h.subHabits) {
        return { ...h, subHabits: h.subHabits.filter(sh => sh.id !== subHabitId) };
      }
      return h;
    });
    setHabitData({ ...habitData, habits: updated });
  };

  const startEdit = (habit: Habit) => {
    setEditingHabit(habit);
    setNewHabitName(habit.name);
    setNewHabitIcon((habit.icon as HabitIconKey) || "");
    setNewHabitColor(habit.color || COLOR_OPTIONS[0]);
    setNewHabitCategory(habit.category);
    setNewHabitWeight(habit.weight || 1);
    setNewHabitWeekDays(habit.weekDays?.length ? habit.weekDays : ALL_DAYS);
    setNewSubHabits(habit.subHabits || []);
  };

  const addSubHabit = () => {
    if (!subHabitInput.trim()) return;
    setNewSubHabits([...newSubHabits, { id: generateId(), name: subHabitInput.trim() }]);
    setSubHabitInput("");
  };

  const removeSubHabit = (id: string) => {
    setNewSubHabits(newSubHabits.filter(sh => sh.id !== id));
  };

  const toggleWeekDay = (day: number) => {
    setNewHabitWeekDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const canSubmit =
    !!newHabitName.trim() && !!newHabitIcon && newHabitWeekDays.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  const getDayRating = useCallback(
    (dateStr: string): number => {
      const score = getDailyScore(habitData.habits, habitData.logs, dateStr);
      // Score is 0-100, we want 0-5 stars
      return (score / 100) * 5;
    },
    [habitData]
  );

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center justify-center">
        {[1, 2, 3, 4, 5].map((s) => {
          const fillAmount = Math.max(0, Math.min(1, rating - (s - 1)));
          return (
            <div key={s} className="relative h-3 w-3">
              <Star className="h-3 w-3 text-muted-foreground/30 absolute inset-0" />
              {fillAmount > 0 && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fillAmount * 100}%` }}
                >
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const isWideView = displayDates.length > 7;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Habit Grid</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="show-all" className="text-xs text-muted-foreground cursor-pointer leading-none m-0 pt-0.5">Show All</Label>
            <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} className="scale-75 origin-right m-0" />
          </div>
          <Button size="sm" onClick={openAdd} className="gap-1">
            <Plus className="h-4 w-4" />
            Add Habit
          </Button>
        </div>
      </div>

      {/* Responsive table — horizontal scroll for wide timeframes */}
      <div className="rounded-lg overflow-x-auto" style={{ border: "1px solid var(--table-border)" }}>
        <table
          className="w-full"
          style={{
            borderCollapse: "collapse",
            tableLayout: isWideView ? "auto" : "fixed",
            minWidth: isWideView
              ? `${48 + displayDates.length * (isWideView ? 22 : 36)}px`
              : undefined,
          }}
        >
          <thead>
            <tr style={{ background: "var(--table-header-bg)" }}>
              {/* Name column */}
              <th
                className="w-11 md:w-48 px-1 md:px-3 py-2 text-left"
                style={{ border: "1px solid var(--table-border)" }}
              >
                <span className="hidden md:inline text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Habit
                </span>
              </th>
              {displayDates.map((date, i) => (
                <th
                  key={i}
                  className="text-center py-2 px-0"
                  style={{
                    border: "1px solid var(--table-border)",
                    minWidth: isWideView ? 22 : 36,
                  }}
                >
                  {!isWideView && (
                    <p className="hidden md:block text-xs font-medium text-muted-foreground">
                      {DAY_FULL[date.getDay()]}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">
                    {format(date, isWideView ? "d" : "d")}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Day Rating Row */}
            {habitData.habits.length > 0 && (
              <tr style={{ background: "var(--table-header-bg)" }}>
                <td
                  className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                  style={{ border: "1px solid var(--table-border)" }}
                >
                  Day Rating
                </td>
                {displayDates.map((date, i) => {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const rating = getDayRating(dateStr);
                  return (
                    <td
                      key={i}
                      className="p-1 text-center"
                      style={{ border: "1px solid var(--table-border)" }}
                    >
                      {renderStars(rating)}
                    </td>
                  );
                })}
              </tr>
            )}

            {habitData.habits.map((habit) => {
              if (!showAll) {
                const todayDayOfWeek = new Date().getDay();
                const isHabitActiveToday = !habit.weekDays?.length || habit.weekDays.includes(todayDayOfWeek);
                if (!isHabitActiveToday) return null;
              }

              const hasSubHabits = habit.subHabits && habit.subHabits.length > 0;
              const isExpanded = expandedHabits[habit.id];
              return (
              <Fragment key={habit.id}>
                <tr>
                  {/* Name / icon cell */}
                  <td
                    className="p-0"
                    style={{ border: "1px solid var(--table-border)" }}
                  >
                    {/* Mobile: icon is the dropdown trigger */}
                    <div className="md:hidden flex items-center py-2.5 px-1">
                      {hasSubHabits && (
                        <button
                          onClick={() => setExpandedHabits(prev => ({ ...prev, [habit.id]: !prev[habit.id] }))}
                          className="mr-1 text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <button className="flex items-center justify-center h-7 w-7 rounded hover:bg-muted transition-colors">
                            <HabitIconComp
                              iconKey={habit.icon}
                              size={14}
                              color={habit.color || "#6366f1"}
                            />
                          </button>
                        } />
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => startEdit(habit)}>
                            <Pencil className="mr-2 h-3 w-3" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteHabit(habit.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-3 w-3" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {/* Desktop: icon + name + menu button */}
                    <div className="hidden md:flex flex-col gap-0.5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        {hasSubHabits ? (
                          <button
                            onClick={() => setExpandedHabits(prev => ({ ...prev, [habit.id]: !prev[habit.id] }))}
                            className="text-muted-foreground hover:text-foreground -ml-1"
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : (
                          <div className="w-4 ml-1" />
                        )}
                        <HabitIconComp
                          iconKey={habit.icon}
                          size={14}
                          color={habit.color || "#6366f1"}
                        />
                        <span className="text-sm font-medium truncate flex-1">
                          {habit.name}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <button className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <MoreVertical className="h-3 w-3" />
                            </button>
                          } />
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => startEdit(habit)}>
                              <Pencil className="mr-2 h-3 w-3" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteHabit(habit.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-3 w-3" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex gap-0.5 ml-7">
                        {Array.from({ length: habit.weight || 1 }).map((_, i) => (
                          <Star key={i} className="h-2.5 w-2.5 fill-yellow-400/60 text-yellow-400/60" />
                        ))}
                      </div>
                    </div>
                  </td>

                  {/* Day cells */}
                  {displayDates.map((date, i) => {
                    const dateStr   = format(date, "yyyy-MM-dd");
                    const dayOfWeek = date.getDay();
                    const isActive  =
                      !habit.weekDays?.length ||
                      habit.weekDays.includes(dayOfWeek);
                    const ratio = getCompletionRatio(habit, dateStr);
                    const cellH = isWideView ? "h-7" : "h-9 md:h-10";
                    
                    if (!isActive) {
                      return (
                        <td key={i} className="p-0" style={{ border: "1px solid var(--table-border)" }}>
                          <div className={`w-full ${cellH}`} style={{ background: "var(--table-header-bg)" }} />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={i}
                        className="p-0"
                        style={{ border: "1px solid var(--table-border)", background: "var(--background)" }}
                      >
                        <button
                          onClick={() => toggleHabit(habit.id, dateStr)}
                          className={cn(
                            `w-full ${cellH} transition-all relative overflow-hidden flex items-center justify-center`,
                            ratio === 1 ? "bg-foreground hover:opacity-90" : "hover:bg-muted/50"
                          )}
                          aria-label={`${habit.name} ${DAY_FULL[dayOfWeek]}`}
                        >
                          {ratio > 0 && ratio < 1 && (
                            <div
                              className="absolute left-0 top-0 bottom-0 bg-foreground opacity-40 transition-all"
                              style={{ width: `${ratio * 100}%` }}
                            />
                          )}
                        </button>
                      </td>                    );
                  })}
                </tr>
                
                {/* Expanded Sub-habits */}
                {hasSubHabits && isExpanded && habit.subHabits.map((sh) => {
                  if (!showAll) {
                    const todayDayOfWeek = new Date().getDay();
                    const shActive = !sh.weekDays?.length || sh.weekDays.includes(todayDayOfWeek);
                    if (!shActive) return null;
                  }
                  return (
                  <tr key={sh.id} className="bg-muted/10">
                    <td
                      className="p-0"
                      style={{ border: "1px solid var(--table-border)" }}
                    >
                      <div className="flex items-center gap-2 pl-10 md:pl-12 pr-3 py-2">
                        <HabitIconComp iconKey={sh.icon || habit.icon} size={12} color={sh.color || habit.color} />
                        <span className="text-xs text-muted-foreground truncate flex-1">
                          {sh.name}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <button className="h-5 w-5 shrink-0 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1">
                              <MoreVertical className="h-3 w-3" />
                            </button>
                          } />
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => startEditSubHabit(habit, sh)}>
                              <Pencil className="mr-2 h-3 w-3" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteSubHabitDirect(habit, sh.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-3 w-3" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                    {displayDates.map((date, i) => {
                      const dateStr   = format(date, "yyyy-MM-dd");
                      const dayOfWeek = date.getDay();
                      const parentActive = !habit.weekDays?.length || habit.weekDays.includes(dayOfWeek);
                      const shActive = !sh.weekDays?.length || sh.weekDays.includes(dayOfWeek);
                      const isActive = parentActive && shActive;
                      const cellH = isWideView ? "h-7" : "h-9 md:h-10";
                      
                      if (!isActive) {
                        return (
                          <td key={i} className="p-0" style={{ border: "1px solid var(--table-border)" }}>
                            <div className={`w-full ${cellH}`} style={{ background: "var(--table-header-bg)" }} />
                          </td>
                        );
                      }

                      const log = getLog(habit.id, dateStr);
                      const isCompleted = log?.completedSubHabits?.includes(sh.id) || false;

                      return (
                        <td
                          key={i}
                          className="p-0"
                          style={{ border: "1px solid var(--table-border)", background: "var(--background)" }}
                        >
                          <button
                            onClick={() => toggleSubHabit(habit.id, sh.id, dateStr)}
                            className={cn(
                              `w-full ${cellH} transition-all`,
                              isCompleted ? "bg-foreground hover:opacity-90" : "hover:bg-muted/50"
                            )}
                            aria-label={`${sh.name} ${DAY_FULL[dayOfWeek]}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )})}
              </Fragment>
            )})}
            {habitData.habits.length === 0 && (
              <tr>
                <td
                  colSpan={displayDates.length + 1}
                  className="py-8 text-center text-sm text-muted-foreground"
                  style={{ border: "1px solid var(--table-border)" }}
                >
                  No habits yet — click Add Habit to get started
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog
        open={showAddDialog || !!editingHabit || !!editingSubHabitObj}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSubHabitObj ? "Edit Sub-Habit" : editingHabit ? "Edit Habit" : "Add New Habit"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">

            {/* ── Icon picker (required) ── */}
            <div className="space-y-2">
              <Label>
                Icon
                <span className="ml-1 text-[#F23645]">*</span>
                {newHabitIcon && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {HABIT_ICONS_LIST.find((e) => e.key === newHabitIcon)?.label ?? newHabitIcon}
                  </span>
                )}
              </Label>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search icons…"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  className="pl-8 h-8 text-[13px]"
                />
              </div>

              {/* Category filter */}
              <div className="flex flex-wrap gap-1">
                {ICON_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setIconCategory(cat)}
                    className="px-2 py-0.5 rounded text-[11px] transition-all"
                    style={
                      iconCategory === cat
                        ? {
                            backgroundColor: newHabitColor + "30",
                            color: newHabitColor,
                            border: `1px solid ${newHabitColor}50`,
                          }
                        : {
                            background: "var(--muted)",
                            color: "var(--muted-foreground)",
                            border: "1px solid transparent",
                          }
                    }
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Icon grid */}
              <div
                className="rounded-lg p-2 max-h-44 overflow-y-auto"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: "4px",
                  border: "1px solid var(--table-border)",
                  background: "var(--muted)",
                }}
              >
                {filteredIcons.length === 0 ? (
                  <div className="col-span-8 py-4 text-center text-xs text-muted-foreground">
                    No icons found
                  </div>
                ) : (
                  filteredIcons.map(({ key, label }) => {
                    const selected = newHabitIcon === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={label}
                        onClick={() => setNewHabitIcon(key)}
                        className="h-9 flex items-center justify-center rounded-md transition-all"
                        style={
                          selected
                            ? {
                                backgroundColor: newHabitColor + "30",
                                color: newHabitColor,
                                boxShadow: `inset 0 0 0 1.5px ${newHabitColor}`,
                              }
                            : { color: "var(--muted-foreground)" }
                        }
                        onMouseEnter={(e) => {
                          if (!selected) {
                            e.currentTarget.style.background = "var(--accent)";
                            e.currentTarget.style.color = "var(--accent-foreground)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!selected) {
                            e.currentTarget.style.background = "";
                            e.currentTarget.style.color = "var(--muted-foreground)";
                          }
                        }}
                      >
                        <HabitIconComp iconKey={key} size={15} />
                      </button>
                    );
                  })
                )}
              </div>
              {!newHabitIcon && (
                <p className="text-[11px]" style={{ color: "#F23645" }}>
                  Select an icon to continue
                </p>
              )}
            </div>

            {/* ── Habit name ── */}
            <div className="space-y-2">
              <Label>
                Habit Name <span className="text-[#F23645]">*</span>
              </Label>
              <Input
                placeholder="e.g., Read 30 minutes"
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canSubmit && (editingSubHabitObj ? updateSubHabitObj() : editingHabit ? updateHabit() : addHabit())}
              />
            </div>

            {/* ── Accent color ── */}
            <div className="space-y-2">
              <Label>Accent Color</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewHabitColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform",
                      newHabitColor === c
                        ? "border-background scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>

            {/* ── Active days ── */}
            <div className="space-y-2">
              <Label>
                Active Days <span className="text-[#F23645]">*</span>
              </Label>
              <div className="flex gap-1">
                {DAY_LETTERS.map((letter, i) => {
                  const active = newHabitWeekDays.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleWeekDay(i)}
                      className={cn(
                        "flex-1 h-9 rounded-md text-[12px] font-semibold transition-all",
                        !active && "bg-muted text-muted-foreground"
                      )}
                      style={
                        active
                          ? { backgroundColor: newHabitColor, color: "#fff" }
                          : undefined
                      }
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {newHabitWeekDays.length === 7
                  ? "Every day"
                  : newHabitWeekDays.length === 0
                  ? "No days selected"
                  : `${newHabitWeekDays.length} day${newHabitWeekDays.length > 1 ? "s" : ""} per week`}
              </p>
            </div>

            {/* ── Habit Weight ── */}
            <div className="space-y-2">
              <Label>Habit Weight (Importance)</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNewHabitWeight(s)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      className={cn(
                        "h-6 w-6",
                        s <= newHabitWeight ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Higher weight makes this habit more significant for your daily score.
              </p>
            </div>

            {!editingSubHabitObj && (
            <>
            {/* ── Category ── */}
            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Input
                placeholder="e.g., Health, Fitness"
                value={newHabitCategory}
                onChange={(e) => setNewHabitCategory(e.target.value)}
              />
            </div>

            {/* ── Sub Habits ── */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="text-sm font-semibold">Sub Habits (optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a sub-habit..."
                  value={subHabitInput}
                  onChange={(e) => setSubHabitInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubHabit();
                    }
                  }}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" onClick={addSubHabit} className="h-8 shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {newSubHabits.length > 0 && (
                <div className="space-y-2 bg-muted/30 p-2 rounded-md border border-border">
                  {newSubHabits.map((sh) => (
                    <div key={sh.id} className="flex flex-col gap-2 bg-background p-2 rounded border border-border">
                      <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-2">
                          <HabitIconComp iconKey={sh.icon || newHabitIcon} size={14} color={sh.color || newHabitColor} />
                          <span className="text-sm font-medium">{sh.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setEditingSubHabitId(editingSubHabitId === sh.id ? null : sh.id)}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSubHabit(sh.id)}
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      
                      {editingSubHabitId === sh.id && (
                        <div className="space-y-3 pt-2 border-t border-border mt-1">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Sub-Habit Name</Label>
                            <Input 
                              value={sh.name}
                              onChange={(e) => setNewSubHabits(newSubHabits.map(x => x.id === sh.id ? { ...x, name: e.target.value } : x))}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Active Days (Different every day?)</Label>
                            <div className="flex gap-1">
                              {DAY_LETTERS.map((letter, i) => {
                                const active = !sh.weekDays?.length || sh.weekDays.includes(i);
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                      const current = sh.weekDays || ALL_DAYS;
                                      const next = current.includes(i) ? current.filter(d => d !== i) : [...current, i].sort((a,b) => a-b);
                                      setNewSubHabits(newSubHabits.map(x => x.id === sh.id ? { ...x, weekDays: next.length === 7 ? undefined : next } : x));
                                    }}
                                    className={cn(
                                      "flex-1 h-6 rounded-md text-[10px] font-semibold transition-all",
                                      !active && "bg-muted text-muted-foreground"
                                    )}
                                    style={active ? { backgroundColor: newHabitColor, color: "#fff" } : undefined}
                                  >
                                    {letter}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Weight (Importance)</Label>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setNewSubHabits(newSubHabits.map(x => x.id === sh.id ? { ...x, weight: s } : x))}
                                  className="transition-transform hover:scale-110"
                                >
                                  <Star
                                    className={cn(
                                      "h-4 w-4",
                                      s <= (sh.weight || 1) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
                                    )}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>
          )}

            <Button
              onClick={editingSubHabitObj ? updateSubHabitObj : editingHabit ? updateHabit : addHabit}
              className="w-full"
              disabled={!canSubmit}
            >
              {editingSubHabitObj ? "Update Sub-Habit" : editingHabit ? "Update Habit" : "Add Habit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
