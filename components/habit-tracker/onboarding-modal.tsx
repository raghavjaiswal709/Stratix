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
import { Plus, Trash2, ArrowRight, Search } from "lucide-react";
import {
  HABIT_ICON_MAP,
  HABIT_ICONS_LIST,
  type HabitIconKey,
} from "@/lib/habit-icons";
import type { Habit } from "@/types";
import { cn } from "@/lib/utils";

// ── Icon display helper ────────────────────────────────────────────────────
function HabitIconComp({
  iconKey,
  size = 14,
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
  iconSearch: string;
}

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const { habitData, setHabitData } = useAppContext();

  const [habits, setHabits] = useState<HabitDraft[]>([
    { name: "", icon: "", color: COLOR_OPTIONS[0], category: "", iconSearch: "" },
  ]);

  const addRow = () => {
    const nextColor = COLOR_OPTIONS[habits.length % COLOR_OPTIONS.length];
    setHabits([...habits, { name: "", icon: "", color: nextColor, category: "", iconSearch: "" }]);
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
        weight: 1,
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
          {habits.map((habit, index) => {
            const q = habit.iconSearch.toLowerCase().trim();
            const filteredIcons = q
              ? HABIT_ICONS_LIST.filter(
                  ({ key, label, tags }) =>
                    key.toLowerCase().includes(q) ||
                    label.toLowerCase().includes(q) ||
                    tags.some((t) => t.includes(q))
                )
              : HABIT_ICONS_LIST;

            return (
              <div
                key={index}
                className="rounded-lg p-3 space-y-3"
                style={{ border: "1px solid var(--table-border)", background: "var(--muted)" }}
              >
                {/* Row header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {habit.icon ? (
                      <HabitIconComp iconKey={habit.icon} size={14} color={habit.color} />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded border border-border" />
                    )}
                    <span>{habit.name || `Habit ${index + 1}`}</span>
                  </div>
                  {habits.length > 1 && (
                    <button
                      onClick={() => removeRow(index)}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Name */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Name *</Label>
                  <Input
                    placeholder="e.g., Read 30 minutes"
                    value={habit.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                  />
                </div>

                {/* Icon picker with search */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Icon *{" "}
                    {!habit.icon && (
                      <span style={{ color: "#F23645" }}>— required</span>
                    )}
                  </Label>

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search icons…"
                      value={habit.iconSearch}
                      onChange={(e) => updateRow(index, { iconSearch: e.target.value })}
                      className="pl-7 h-7 text-[12px]"
                    />
                  </div>

                  <div
                    className="rounded-md p-1 overflow-y-auto"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(10, 1fr)",
                      gap: "2px",
                      maxHeight: "112px",
                      border: "1px solid var(--table-border)",
                      background: "var(--background)",
                    }}
                  >
                    {filteredIcons.length === 0 ? (
                      <div className="col-span-10 py-3 text-center text-xs text-muted-foreground">
                        No icons found
                      </div>
                    ) : (
                      filteredIcons.map(({ key, label }) => {
                        const sel = habit.icon === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            title={label}
                            onClick={() => updateRow(index, { icon: key })}
                            className="h-8 flex items-center justify-center rounded transition-all text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            style={
                              sel
                                ? {
                                    backgroundColor: habit.color + "30",
                                    color: habit.color,
                                    boxShadow: `inset 0 0 0 1.5px ${habit.color}`,
                                  }
                                : undefined
                            }
                          >
                            <HabitIconComp iconKey={key} size={13} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Color + Category */}
                <div className="flex items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Color</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateRow(index, { color: c })}
                          className={cn(
                            "h-5 w-5 rounded-full border-2 transition-transform",
                            habit.color === c
                              ? "border-foreground scale-110"
                              : "border-transparent hover:scale-105"
                          )}
                          style={{ backgroundColor: c }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Input
                      placeholder="Health, Work…"
                      value={habit.category}
                      onChange={(e) => updateRow(index, { category: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}

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
