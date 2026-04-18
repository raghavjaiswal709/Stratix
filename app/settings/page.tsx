"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Palette, Layout, ChevronUp, ChevronDown, Check } from "lucide-react";
import { ACCENT_PRESETS } from "@/types";
import { cn } from "@/lib/utils";

const PAGE_OPTIONS = [
  { value: "/productivity", label: "Life-Os (Productivity)" },
  { value: "/trading-journal", label: "Tradebook (Trading Journal)" },
];

const TAB_OPTIONS = [
  { value: "todos", label: "To-Do List" },
  { value: "habits", label: "Habit Tracker" },
  { value: "diary", label: "Diary" },
  { value: "notes", label: "Notes" },
];

export default function SettingsPage() {
  const { preferences, setPreferences, theme, setTheme, loading } = useAppContext();
  const [customColor, setCustomColor] = useState(preferences.accentColor || "#6366f1");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const sectionOrder = preferences.sectionOrder || ["todos", "habits", "diary", "notes"];

  const moveSection = (idx: number, direction: "up" | "down") => {
    const newOrder = [...sectionOrder];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    setPreferences({ ...preferences, sectionOrder: newOrder });
  };

  const updateAccentColor = (color: string) => {
    setCustomColor(color);
    setPreferences({ ...preferences, accentColor: color });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6 animate-fade-up">
      <h1 className="text-[22px] font-semibold flex items-center gap-2">
        <Settings className="h-5 w-5 text-indigo-400" />
        Settings
      </h1>

      {/* ─── Personalization ─── */}
      <div className="glass-card p-5 space-y-5">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Palette className="h-4 w-4 text-indigo-400" />
          Personalization
        </h2>

        {/* Theme */}
        <div className="space-y-2">
          <Label>Theme</Label>
          <div className="flex gap-2">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all border",
                  theme === t
                    ? "bg-indigo-500/12 text-indigo-400 border-indigo-500/25"
                    : "text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Accent Color — Presets */}
        <div className="space-y-2">
          <Label>Accent Color</Label>
          <div className="flex flex-wrap gap-3">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => updateAccentColor(preset.value)}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center",
                  customColor === preset.value ? "scale-110 ring-2 ring-offset-2 ring-offset-background" : ""
                )}
                style={{ backgroundColor: preset.value, borderColor: preset.value, ...(customColor === preset.value ? { ringColor: preset.value } : {}) }}
                title={preset.name}
              >
                {customColor === preset.value && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <Label className="text-xs text-muted-foreground">Custom:</Label>
            <input
              type="color"
              value={customColor}
              onChange={(e) => updateAccentColor(e.target.value)}
              className="h-8 w-12 rounded cursor-pointer border border-border bg-transparent"
            />
            <span className="text-xs text-muted-foreground font-mono">{customColor}</span>
          </div>
        </div>
      </div>

      {/* ─── Landing Page ─── */}
      <div className="glass-card p-5 space-y-5">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Layout className="h-4 w-4 text-indigo-400" />
          Landing Page
        </h2>

        {/* Default page */}
        <div className="space-y-2">
          <Label>Default Opening Page</Label>
          <Select
            value={preferences.defaultPage}
            onValueChange={(v) => v && setPreferences({ ...preferences, defaultPage: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Default tab */}
        <div className="space-y-2">
          <Label>Default Tab (Productivity)</Label>
          <Select
            value={preferences.defaultTab}
            onValueChange={(v) => v && setPreferences({ ...preferences, defaultTab: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAB_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Section order */}
        <div className="space-y-2">
          <Label>Section Order (Productivity Tabs)</Label>
          <p className="text-[11px] text-muted-foreground">Drag priority: top = first tab shown</p>
          <div className="rounded-lg border border-border overflow-hidden">
            {sectionOrder.map((section, idx) => {
              const label = TAB_OPTIONS.find((t) => t.value === section)?.label || section;
              return (
                <div
                  key={section}
                  className="flex items-center justify-between px-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground/50 w-4">{idx + 1}.</span>
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveSection(idx, "up")}
                      disabled={idx === 0}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveSection(idx, "down")}
                      disabled={idx === sectionOrder.length - 1}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
