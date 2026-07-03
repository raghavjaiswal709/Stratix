"use client";

import { useState } from "react";
import { X, Sparkles, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const HOUR_OPTIONS = [
  { value: 1, label: "Last 1 Hour", sub: "Ultra-fresh, breaking only" },
  { value: 2, label: "Last 2 Hours", sub: "Very tight window" },
  { value: 3, label: "Last 3 Hours", sub: "Short recent sweep" },
  { value: 6, label: "Last 6 Hours", sub: "Recent session window" },
  { value: 12, label: "Last 12 Hours", sub: "Recommended — half-day sweep" },
  { value: 24, label: "Last 24 Hours", sub: "Full daily cycle" },
  { value: 48, label: "Last 48 Hours", sub: "Two-day window" },
  { value: 72, label: "Last 3 Days", sub: "Broader weekly context" },
];

export function AnalyseNewsModal({
  onClose,
  onGenerate,
  generating,
  error,
  progressLabel,
}: {
  onClose: () => void;
  onGenerate: (hours: number) => void;
  generating: boolean;
  error: string | null;
  progressLabel?: string;
}) {
  const [selected, setSelected] = useState(12);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={cn(
        "w-full max-w-3xl rounded-2xl bg-[#0c0e14] border border-white/10 shadow-2xl overflow-hidden relative transition-all",
        generating && "ai-analyzing-border"
      )}>
        {generating && <div className="ai-shimmer-overlay" />}

        <div className="flex items-center gap-3 p-5 border-b border-white/7">
          <div className={cn(
            "h-9 w-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 transition",
            generating && "animate-pulse"
          )}>
            <Sparkles className="h-4 w-4 text-white/70" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-white">Analyse News</h3>
            <p className="text-[11px] text-white/40 mt-0.5">
              {generating ? (progressLabel ?? "Gathering & analyzing…") : "Choose how far back to pull strictly ALL news — every source, real candle data, sentiment per instrument"}
            </p>
          </div>
          <button onClick={onClose} disabled={generating} className="text-white/35 hover:text-white/70 transition disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        {generating && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/7 bg-white/[0.02]">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-bounce" />
            </div>
            <span className="text-[11px] text-white/50 font-medium">Fetching every source + real-time candles, then scoring sentiment per instrument…</span>
          </div>
        )}

        <div className={cn("p-5 transition", generating && "opacity-40 pointer-events-none")}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {HOUR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelected(opt.value)}
                disabled={generating}
                className={cn(
                  "flex flex-col items-start gap-2 p-3.5 rounded-xl border text-left transition disabled:opacity-50",
                  selected === opt.value
                    ? "border-white/25 bg-white/[0.07]"
                    : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    selected === opt.value ? "bg-white/10 text-white" : "bg-white/5 text-white/40"
                  )}>
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div className={cn(
                    "h-4 w-4 rounded-full border-2 shrink-0",
                    selected === opt.value ? "border-white bg-white" : "border-white/20"
                  )} />
                </div>
                <div>
                  <p className={cn("text-[12.5px] font-semibold", selected === opt.value ? "text-white" : "text-white/70")}>{opt.label}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[11px] text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/7 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={generating} className="px-4 py-2 rounded-lg border border-white/10 text-[12px] text-white/40 hover:text-white/70 transition disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={() => onGenerate(selected)}
            disabled={generating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-[13px] font-semibold text-white transition disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? "Analyzing…" : "Analyse Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
