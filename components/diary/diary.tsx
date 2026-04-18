"use client";

import { useState, useMemo } from "react";
import { useAppContext } from "@/lib/context";
import { generateId } from "@/lib/habits";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarDays, BookOpen, Save, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { DiaryEntry } from "@/types";

export function Diary() {
  const { diaryData, setDiaryData } = useAppContext();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showMobileCalendar, setShowMobileCalendar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const entry = useMemo(
    () => diaryData.entries.find((e) => e.date === dateStr),
    [diaryData.entries, dateStr]
  );

  const [content, setContent] = useState(entry?.content || "");

  // Sync content when date changes
  const currentContent = useMemo(() => {
    const e = diaryData.entries.find((e) => e.date === dateStr);
    return e?.content || "";
  }, [diaryData.entries, dateStr]);

  // Update local content when date changes
  useState(() => {
    setContent(currentContent);
    setIsEditing(false);
  });

  const handleDateChange = (d: Date) => {
    setSelectedDate(d);
    const e = diaryData.entries.find((e) => e.date === format(d, "yyyy-MM-dd"));
    setContent(e?.content || "");
    setIsEditing(false);
  };

  const save = () => {
    if (!content.trim()) {
      // Remove entry if empty
      setDiaryData({
        entries: diaryData.entries.filter((e) => e.date !== dateStr),
      });
      setIsEditing(false);
      return;
    }

    const existing = diaryData.entries.find((e) => e.date === dateStr);
    if (existing) {
      setDiaryData({
        entries: diaryData.entries.map((e) =>
          e.date === dateStr
            ? { ...e, content: content.trim(), updatedAt: new Date().toISOString() }
            : e
        ),
      });
    } else {
      const newEntry: DiaryEntry = {
        id: generateId(),
        date: dateStr,
        content: content.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDiaryData({ entries: [...diaryData.entries, newEntry] });
    }
    setIsEditing(false);
  };

  const diaryDates = useMemo(
    () => diaryData.entries.map((e) => parseISO(e.date)),
    [diaryData.entries]
  );

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-400" />
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {wordCount > 0 ? `${wordCount} words` : "No entry yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="md:hidden h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => setShowMobileCalendar(true)}
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          {isEditing ? (
            <Button size="sm" onClick={save} className="gap-1">
              <Save className="h-4 w-4" /> Save
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
              className="gap-1"
            >
              <Pencil className="h-4 w-4" /> {entry ? "Edit" : "Write"}
            </Button>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 items-start">
        {/* Editor / Viewer */}
        <div
          className="rounded-lg min-h-[300px]"
          style={{ border: "1px solid var(--table-border)" }}
        >
          {isEditing ? (
            <textarea
              autoFocus
              className="w-full h-full min-h-[300px] bg-transparent p-4 text-sm leading-relaxed outline-none resize-none text-foreground placeholder-muted-foreground/40"
              placeholder="Write about your day…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          ) : (
            <div className="p-4 min-h-[300px]">
              {currentContent ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
                  {currentContent}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground/40">
                  <BookOpen className="h-10 w-10 mb-2" />
                  <p className="text-sm">No diary entry for this day</p>
                  <p className="text-xs mt-1">Click &ldquo;Write&rdquo; to start</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Calendar */}
        <div className="hidden md:block glass-card p-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => d && handleDateChange(d)}
            modifiers={{ hasEntry: diaryDates }}
            modifiersClassNames={{ hasEntry: "border-2 border-indigo-500" }}
            className="w-full"
          />
        </div>
      </div>

      {/* Mobile calendar */}
      <Dialog open={showMobileCalendar} onOpenChange={setShowMobileCalendar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">Select Date</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (d) {
                handleDateChange(d);
                setShowMobileCalendar(false);
              }
            }}
            modifiers={{ hasEntry: diaryDates }}
            modifiersClassNames={{ hasEntry: "border-2 border-indigo-500" }}
            className="w-full"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
