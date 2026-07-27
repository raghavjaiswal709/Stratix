"use client";

import { useState } from "react";
import { X, Check, ChevronRight, ChevronLeft, Sparkles, Loader2, Calendar, ClipboardCopy } from "lucide-react";
import { CALENDAR_PLAN } from "@/lib/content-creator/calendar-plan";
import { parseJsonResponse } from "../apiUtils";


export const PILLAR_COLORS: Record<string, { bg: string; fg: string }> = {
  SMC: { bg: "rgba(16,185,129,0.14)", fg: "#34d399" },
  Crypto: { bg: "rgba(245,158,11,0.14)", fg: "#fbbf24" },
  PF: { bg: "rgba(96,165,250,0.14)", fg: "#60a5fa" },
  Recap: { bg: "rgba(244,114,182,0.14)", fg: "#f472b6" },
};

export type CalendarPromptState = { key: string; status: "idle" | "loading" | "copied" | "error" };
export function ContentCalendarModal({
  onClose,
  onGenerateNews,
  onGenerateFacts,
  onGenerateLearnings,
}: {
  onClose: () => void;
  onGenerateNews: () => void;
  onGenerateFacts: (topicHint: string) => void;
  onGenerateLearnings: (topicHint: string) => void;
}) {
  const months = Array.from(new Set(CALENDAR_PLAN.map((d) => d.date.slice(0, 7)))).sort();
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultMonth = months.includes(todayIso.slice(0, 7)) ? todayIso.slice(0, 7) : months[0];
  const [monthIdx, setMonthIdx] = useState(Math.max(0, months.indexOf(defaultMonth)));
  const activeMonth = months[monthIdx];
  const [promptState, setPromptState] = useState<CalendarPromptState>({ key: "", status: "idle" });

  const [y, m] = activeMonth.split("-").map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const dayByDate = new Map(CALENDAR_PLAN.map((d) => [d.date, d]));

  async function copyPrompt(category: "news" | "facts" | "learnings", topicHint: string | undefined, key: string) {
    setPromptState({ key, status: "loading" });
    try {
      const endpoint = category === "news" ? "news-batch" : category === "facts" ? "facts-batch" : "learnings-batch";
      const res = await fetch(`/api/content-creator/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicHint ? { previewOnly: true, topicHint } : { previewOnly: true }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const text = `=== SYSTEM PROMPT ===\n${data.systemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE ===\n${data.userMessage}\n\n${"─".repeat(60)}\n\nINSTRUCTIONS: Paste this entire prompt (system + user message) into ChatGPT, Claude, or any capable AI. It replies with ONLY a JSON object in the exact shape spelled out at the end of the system prompt above — no markdown fences, no commentary. Back in Stratix Content Creator, switch to ${category === "news" ? "News Batch" : category === "facts" ? "Facts" : "Learnings"} mode and either paste that reply into the "Paste The AI's Reply" box in the eye-icon prompt panel, or straight into the JSON tab — either one converts it and renders the poster batch automatically.`;

      await navigator.clipboard.writeText(text);
      setPromptState({ key, status: "copied" });
      setTimeout(() => setPromptState((s) => (s.key === key ? { key: "", status: "idle" } : s)), 2000);
    } catch {
      setPromptState({ key, status: "error" });
      setTimeout(() => setPromptState((s) => (s.key === key ? { key: "", status: "idle" } : s)), 2500);
    }
  }

  function PillarRow({
    dayKey,
    label,
    accent,
    topic,
    onGenerate,
    onCopy,
  }: {
    dayKey: string;
    label: string;
    accent: string;
    topic: string;
    onGenerate: () => void;
    onCopy: () => void;
  }) {
    const state = promptState.key === dayKey ? promptState.status : "idle";
    return (
      <div className="group/row relative rounded-md px-1.5 py-1 hover:bg-white/[0.06] transition-colors">
        <div className="flex items-start gap-1">
          <span
            className="shrink-0 mt-[1px] text-[7.5px] font-bold uppercase tracking-wider px-1 py-[1px] rounded"
            style={{ background: accent === "#e5e5e5" ? "rgba(255,255,255,0.08)" : `${accent}22`, color: accent }}
          >
            {label}
          </span>
          <span className="text-[9px] leading-snug text-white/70 line-clamp-2" title={topic}>
            {topic}
          </span>
        </div>
        <div className="absolute right-1 top-1 hidden group-hover/row:flex items-center gap-1 bg-[#161616] rounded-md shadow-lg border border-white/10 p-0.5">
          <button
            onClick={onGenerate}
            title="Generate this poster now"
            className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/15 cursor-pointer"
          >
            <Sparkles className="h-2.5 w-2.5" /> Generate
          </button>
          <button
            onClick={onCopy}
            title="Copy an AI-ready prompt for this topic"
            className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-bold text-white/70 hover:bg-white/10 cursor-pointer"
          >
            {state === "loading" ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : state === "copied" ? (
              <Check className="h-2.5 w-2.5 text-emerald-400" />
            ) : state === "error" ? (
              <X className="h-2.5 w-2.5 text-red-400" />
            ) : (
              <ClipboardCopy className="h-2.5 w-2.5" />
            )}
            {state === "copied" ? "Copied" : state === "error" ? "Failed" : "Prompt"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: "#0f0f0f", borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-2 px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Calendar className="h-4 w-4 shrink-0 text-white/60" />
            <span className="text-[13px] font-bold text-white tracking-wide uppercase whitespace-nowrap">Content Calendar</span>
            <span className="hidden md:inline text-[9.5px] text-white/35 whitespace-nowrap truncate">30-day News / Learnings / Facts plan</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={monthIdx === 0}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-semibold text-white/80 w-20 sm:w-32 text-center whitespace-nowrap truncate">{monthLabel}</span>
            <button
              onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
              disabled={monthIdx === months.length - 1}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="ml-2 flex items-center justify-center h-7 w-7 rounded-lg hover:bg-white/5 transition-all text-white/40 hover:text-white/80 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-5 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          <span className="text-[9px] text-white/30 uppercase tracking-wider">Hover a topic for Generate / Copy Prompt</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: "#e5e5e5" }} /> News</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: PILLAR_COLORS.SMC.fg }} /> SMC</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: PILLAR_COLORS.Crypto.fg }} /> Crypto</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: PILLAR_COLORS.PF.fg }} /> Personal Finance</span>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 p-4">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-[9px] font-bold text-white/30 uppercase tracking-wider text-center py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dateIso = `${activeMonth}-${String(i + 1).padStart(2, "0")}`;
              const plan = dayByDate.get(dateIso);
              const isToday = dateIso === todayIso;
              return (
                <div
                  key={dateIso}
                  className="min-h-[132px] rounded-lg border p-1.5 flex flex-col gap-1"
                  style={{
                    borderColor: isToday ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.06)",
                    background: plan ? "rgba(255,255,255,0.02)" : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${isToday ? "text-emerald-400" : "text-white/50"}`}>{i + 1}</span>
                    {plan?.note && (
                      <span className="text-[7px] font-bold uppercase tracking-wider px-1 py-[1px] rounded bg-amber-500/15 text-amber-300" title={plan.note}>
                        {plan.note.length > 14 ? `${plan.note.slice(0, 13)}…` : plan.note}
                      </span>
                    )}
                  </div>
                  {plan && (
                    <div className="flex-1 flex flex-col gap-0.5 -mx-1">
                      <PillarRow
                        dayKey={`${plan.date}-news`}
                        label="News"
                        accent="#e5e5e5"
                        topic={plan.news.topic}
                        onGenerate={onGenerateNews}
                        onCopy={() => copyPrompt("news", undefined, `${plan.date}-news`)}
                      />
                      <PillarRow
                        dayKey={`${plan.date}-learnings`}
                        label={plan.learnings.pillar}
                        accent={PILLAR_COLORS[plan.learnings.pillar]?.fg ?? "#e5e5e5"}
                        topic={plan.learnings.topic}
                        onGenerate={() => onGenerateLearnings(plan.learnings.topic)}
                        onCopy={() => copyPrompt("learnings", plan.learnings.topic, `${plan.date}-learnings`)}
                      />
                      <PillarRow
                        dayKey={`${plan.date}-facts`}
                        label="Facts"
                        accent="#e5e5e5"
                        topic={plan.facts.topic}
                        onGenerate={() => onGenerateFacts(plan.facts.topic)}
                        onCopy={() => copyPrompt("facts", plan.facts.topic, `${plan.date}-facts`)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
