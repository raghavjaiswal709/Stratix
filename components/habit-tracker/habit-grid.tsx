"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppContext } from "@/lib/context";
import { getWeekDates, generateId } from "@/lib/habits";
import { format } from "date-fns";
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
import {
  Plus, MoreVertical, Pencil, Trash2,
  Dumbbell, Bike, Flame, Heart, Apple, Pill, Droplets,
  Activity, Wind, Stethoscope, Timer, Brain, BookOpen,
  Lightbulb, PenLine, Code, Coffee, Eye, Globe,
  Moon, Sun, Smile, Waves, Leaf, Music, Camera, Home,
  Utensils, ShoppingCart, Smartphone, Gamepad2, Bed,
  DollarSign, PiggyBank, TrendingUp, Target, Trophy,
  Zap, Rocket, Star, Users, MessageCircle,
} from "lucide-react";
import type { Habit } from "@/types";
import { cn } from "@/lib/utils";

// ── Icon registry ──────────────────────────────────────────────────────────
const HABIT_ICONS = {
  Dumbbell, Bike, Flame, Heart, Apple, Pill, Droplets,
  Activity, Wind, Stethoscope, Timer, Brain, BookOpen,
  Lightbulb, PenLine, Code, Coffee, Eye, Globe,
  Moon, Sun, Smile, Waves, Leaf, Music, Camera, Home,
  Utensils, ShoppingCart, Smartphone, Gamepad2, Bed,
  DollarSign, PiggyBank, TrendingUp, Target, Trophy,
  Zap, Rocket, Star, Users, MessageCircle,
} as const;

type HabitIconKey = keyof typeof HABIT_ICONS;
const ICON_KEYS = Object.keys(HABIT_ICONS) as HabitIconKey[];

function HabitIconComp({
  iconKey,
  size = 16,
  color,
}: {
  iconKey?: string;
  size?: number;
  color?: string;
}) {
  const Icon = (HABIT_ICONS[(iconKey as HabitIconKey) || "Target"] ??
    Target) as React.FC<{ size?: number; color?: string }>;
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
export function HabitGrid() {
  const { habitData, setHabitData } = useAppContext();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  const [newHabitName,     setNewHabitName]     = useState("");
  const [newHabitIcon,     setNewHabitIcon]     = useState<HabitIconKey | "">("");
  const [newHabitColor,    setNewHabitColor]    = useState(COLOR_OPTIONS[0]);
  const [newHabitCategory, setNewHabitCategory] = useState("");
  const [newHabitWeekDays, setNewHabitWeekDays] = useState<number[]>(ALL_DAYS);

  const weekDates = useMemo(() => getWeekDates(), []);

  // ── Habit log helpers ────────────────────────────────────────────────────
  const toggleHabit = useCallback(
    (habitId: string, date: string) => {
      const existing = habitData.logs.find(
        (l) => l.habitId === habitId && l.date === date
      );
      const newLogs = existing
        ? habitData.logs.map((l) =>
            l.habitId === habitId && l.date === date
              ? { ...l, completed: !l.completed }
              : l
          )
        : [...habitData.logs, { habitId, date, completed: true }];
      setHabitData({ ...habitData, logs: newLogs });
    },
    [habitData, setHabitData]
  );

  const isChecked = useCallback(
    (habitId: string, date: string): boolean =>
      habitData.logs.some(
        (l) => l.habitId === habitId && l.date === date && l.completed
      ),
    [habitData.logs]
  );

  // ── Form helpers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setNewHabitName("");
    setNewHabitIcon("");
    setNewHabitColor(COLOR_OPTIONS[0]);
    setNewHabitCategory("");
    setNewHabitWeekDays(ALL_DAYS);
  };

  const openAdd = () => { resetForm(); setShowAddDialog(true); };

  const closeDialog = () => {
    setShowAddDialog(false);
    setEditingHabit(null);
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
      createdAt: new Date().toISOString(),
    };
    setHabitData({ ...habitData, habits: [...habitData.habits, habit] });
    closeDialog();
  };

  const updateHabit = () => {
    if (!editingHabit || !newHabitName.trim() || !newHabitIcon) return;
    const updated = habitData.habits.map((h) =>
      h.id === editingHabit.id
        ? { ...h, name: newHabitName, color: newHabitColor, icon: newHabitIcon, weekDays: newHabitWeekDays, category: newHabitCategory }
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

  const startEdit = (habit: Habit) => {
    setEditingHabit(habit);
    setNewHabitName(habit.name);
    setNewHabitIcon((habit.icon as HabitIconKey) || "");
    setNewHabitColor(habit.color || COLOR_OPTIONS[0]);
    setNewHabitCategory(habit.category);
    setNewHabitWeekDays(habit.weekDays?.length ? habit.weekDays : ALL_DAYS);
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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Habit Grid</h2>
        <Button size="sm" onClick={openAdd} className="gap-1">
          <Plus className="h-4 w-4" />
          Add Habit
        </Button>
      </div>

      {/* Responsive table — fits mobile without horizontal scroll */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <table
          className="w-full"
          style={{ borderCollapse: "collapse", tableLayout: "fixed" }}
        >
          <thead>
            <tr className="bg-white/[0.03]">
              {/* Name column: 44px on mobile (icon only), 192px on desktop */}
              <th
                className="w-11 md:w-48 px-1 md:px-3 py-2 text-left"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <span className="hidden md:inline text-xs font-medium text-white/40 uppercase tracking-wide">
                  Habit
                </span>
              </th>
              {weekDates.map((date, i) => (
                <th
                  key={i}
                  className="text-center py-2 px-0"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <p className="hidden md:block text-xs font-medium text-white/50">
                    {DAY_FULL[i]}
                  </p>
                  <p className="text-[10px] text-white/30">{format(date, "d")}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habitData.habits.map((habit) => (
              <tr key={habit.id}>
                {/* Name / icon cell */}
                <td
                  className="p-0"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {/* Mobile: icon is the dropdown trigger */}
                  <div className="md:hidden flex items-center justify-center py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center justify-center h-7 w-7 rounded hover:bg-white/10 transition-colors">
                        <HabitIconComp
                          iconKey={habit.icon}
                          size={14}
                          color={habit.color || "#6366f1"}
                        />
                      </DropdownMenuTrigger>
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
                  <div className="hidden md:flex items-center gap-2 px-3 py-2">
                    <HabitIconComp
                      iconKey={habit.icon}
                      size={14}
                      color={habit.color || "#6366f1"}
                    />
                    <span className="text-sm font-medium truncate flex-1">
                      {habit.name}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-md hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors">
                        <MoreVertical className="h-3 w-3" />
                      </DropdownMenuTrigger>
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
                </td>

                {/* Day cells */}
                {weekDates.map((date, i) => {
                  const dateStr   = format(date, "yyyy-MM-dd");
                  const dayOfWeek = date.getDay();
                  const isActive  =
                    !habit.weekDays?.length ||
                    habit.weekDays.includes(dayOfWeek);
                  const checked = isChecked(habit.id, dateStr);
                  return (
                    <td
                      key={i}
                      className="p-0"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {isActive ? (
                        <button
                          onClick={() => toggleHabit(habit.id, dateStr)}
                          className="w-full h-9 md:h-10 transition-opacity hover:opacity-80 active:opacity-60"
                          style={{ backgroundColor: checked ? "#099981" : "#F23645" }}
                          aria-label={`${habit.name} ${DAY_FULL[i]} ${checked ? "done" : "not done"}`}
                        />
                      ) : (
                        <div className="w-full h-9 md:h-10 bg-white/[0.02]" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {habitData.habits.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="py-8 text-center text-sm text-white/30"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
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
        open={showAddDialog || !!editingHabit}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingHabit ? "Edit Habit" : "Add New Habit"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">

            {/* ── Icon picker (required) ── */}
            <div className="space-y-2">
              <Label>
                Icon
                <span className="ml-1 text-[#F23645]">*</span>
                {newHabitIcon && (
                  <span className="ml-2 text-xs text-white/40">
                    {newHabitIcon} selected
                  </span>
                )}
              </Label>
              <div
                className="rounded-lg p-2 max-h-48 overflow-y-auto"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(8, 1fr)",
                  gap: "4px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                {ICON_KEYS.map((key) => {
                  const selected = newHabitIcon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      title={key}
                      onClick={() => setNewHabitIcon(key)}
                      className="h-9 flex items-center justify-center rounded-md transition-all"
                      style={
                        selected
                          ? {
                              backgroundColor: newHabitColor + "30",
                              color: newHabitColor,
                              boxShadow: `inset 0 0 0 1.5px ${newHabitColor}`,
                            }
                          : { color: "rgba(255,255,255,0.4)" }
                      }
                      onMouseEnter={(e) => {
                        if (!selected) {
                          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) {
                          e.currentTarget.style.background = "";
                          e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                        }
                      }}
                    >
                      <HabitIconComp iconKey={key} size={15} />
                    </button>
                  );
                })}
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
                onKeyDown={(e) => e.key === "Enter" && canSubmit && (editingHabit ? updateHabit() : addHabit())}
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
                        ? "border-white scale-110"
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
                      className="flex-1 h-9 rounded-md text-[12px] font-semibold transition-all"
                      style={
                        active
                          ? { backgroundColor: newHabitColor, color: "#fff" }
                          : {
                              background: "rgba(255,255,255,0.05)",
                              color: "rgba(255,255,255,0.35)",
                            }
                      }
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-white/30">
                {newHabitWeekDays.length === 7
                  ? "Every day"
                  : newHabitWeekDays.length === 0
                  ? "No days selected"
                  : `${newHabitWeekDays.length} day${newHabitWeekDays.length > 1 ? "s" : ""} per week`}
              </p>
            </div>

            {/* ── Category ── */}
            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Input
                placeholder="e.g., Health, Fitness"
                value={newHabitCategory}
                onChange={(e) => setNewHabitCategory(e.target.value)}
              />
            </div>

            <Button
              onClick={editingHabit ? updateHabit : addHabit}
              className="w-full"
              disabled={!canSubmit}
            >
              {editingHabit ? "Update Habit" : "Add Habit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
