"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/context";
import { generateId } from "@/lib/habits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Trash2, ArrowRight,
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

// ── shared icon registry (same as habit-grid) ─────────────────────────────
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
  size = 14,
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

const COLOR_OPTIONS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#a855f7",
];

// per-row state
interface HabitDraft {
  name: string;
  icon: HabitIconKey | "";
  color: string;
  category: string;
}

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const { habitData, setHabitData } = useAppContext();

  const [habits, setHabits] = useState<HabitDraft[]>([
    { name: "", icon: "", color: COLOR_OPTIONS[0], category: "" },
  ]);

  const addRow = () => {
    const nextColor = COLOR_OPTIONS[habits.length % COLOR_OPTIONS.length];
    setHabits([...habits, { name: "", icon: "", color: nextColor, category: "" }]);
  };

  const removeRow = (index: number) => {
    setHabits(habits.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<HabitDraft>) => {
    const updated = [...habits];
    updated[index] = { ...updated[index], ...patch };
    setHabits(updated);
  };

  const handleSubmit = () => {
    const valid: Habit[] = habits
      .filter((h) => h.name?.trim() && h.icon)
      .map((h) => ({
        id: generateId(),
        name: h.name!.trim(),
        color: h.color,
        icon: h.icon,
        weekDays: [0, 1, 2, 3, 4, 5, 6],
        category: h.category || "",
        createdAt: new Date().toISOString(),
      }));

    if (valid.length > 0) {
      setHabitData({
        ...habitData,
        habits: [...habitData.habits, ...valid],
      });
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up your habits</DialogTitle>
          <DialogDescription>
            Pick an icon and name each habit. You can always add more later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {habits.map((habit, index) => (
            <div
              key={index}
              className="rounded-lg p-3 space-y-3"
              style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
            >
              {/* Row header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-white/50">
                  {habit.icon ? (
                    <HabitIconComp iconKey={habit.icon} size={14} color={habit.color} />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded border border-white/20" />
                  )}
                  <span>{habit.name || `Habit ${index + 1}`}</span>
                </div>
                {habits.length > 1 && (
                  <button
                    onClick={() => removeRow(index)}
                    className="h-6 w-6 flex items-center justify-center rounded text-white/30 hover:text-[#F23645] hover:bg-white/5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Name */}
              <div className="space-y-1">
                <Label className="text-xs text-white/40">Name *</Label>
                <Input
                  placeholder="e.g., Read 30 minutes"
                  value={habit.name}
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                />
              </div>

              {/* Icon picker */}
              <div className="space-y-1">
                <Label className="text-xs text-white/40">
                  Icon *{" "}
                  {!habit.icon && (
                    <span style={{ color: "#F23645" }}>— required</span>
                  )}
                </Label>
                <div
                  className="rounded-md p-1.5 overflow-y-auto"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(10, 1fr)",
                    gap: "2px",
                    maxHeight: "120px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(255,255,255,0.015)",
                  }}
                >
                  {ICON_KEYS.map((key) => {
                    const sel = habit.icon === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={key}
                        onClick={() => updateRow(index, { icon: key })}
                        className="h-8 flex items-center justify-center rounded transition-all"
                        style={
                          sel
                            ? {
                                backgroundColor: habit.color + "30",
                                color: habit.color,
                                boxShadow: `inset 0 0 0 1.5px ${habit.color}`,
                              }
                            : { color: "rgba(255,255,255,0.35)" }
                        }
                      >
                        <HabitIconComp iconKey={key} size={13} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color + Category */}
              <div className="flex items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-white/40">Color</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateRow(index, { color: c })}
                        className={cn(
                          "h-5 w-5 rounded-full border-2 transition-transform",
                          habit.color === c
                            ? "border-white scale-110"
                            : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-white/40">Category</Label>
                  <Input
                    placeholder="Health, Work…"
                    value={habit.category}
                    onChange={(e) => updateRow(index, { category: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addRow} className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Add Another Habit
          </Button>
        </div>

        <div className="flex justify-end mt-6">
          <Button
            onClick={handleSubmit}
            disabled={!habits.some((h) => h.name.trim() && h.icon)}
            className="gap-2"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
