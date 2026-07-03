"use client";

import { Sparkles, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function RefineIconButton({
  onClick,
  disabled,
  title = "Refine this section with AI",
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center h-6 w-6 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white/80 transition disabled:opacity-30 disabled:pointer-events-none shrink-0"
    >
      <Sparkles className="h-3 w-3" />
    </button>
  );
}

export function AnalyzingOverlay({ label }: { label: string }) {
  return (
    <div className="ai-analyzing-border absolute inset-0 rounded-lg overflow-hidden">
      <div className="ai-shimmer-overlay" />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-white/15">
          <Sparkles className="h-3 w-3 text-white/70 animate-pulse" />
          <span className="text-[11px] font-medium text-white/60">{label}</span>
        </div>
      </div>
    </div>
  );
}

export function RefineDiff({
  original,
  suggestion,
  onReplace,
  onDiscard,
}: {
  original: string;
  suggestion: string;
  onReplace: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="space-y-3 animate-fade-up">
      <div>
        <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-red-400/60 font-semibold mb-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400/60" /> Original
        </p>
        <p className={cn(
          "text-[12px] text-red-300/45 line-through decoration-red-400/50 decoration-1 leading-relaxed whitespace-pre-wrap"
        )}>
          {original}
        </p>
      </div>
      <div>
        <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-emerald-400/70 font-semibold mb-1.5">
          <Sparkles className="h-2.5 w-2.5" /> AI Refined
        </p>
        <p className="text-[12px] text-emerald-300/90 leading-relaxed whitespace-pre-wrap">
          {suggestion}
        </p>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onReplace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/25 transition"
        >
          <Check className="h-3 w-3" /> Replace
        </button>
        <button
          onClick={onDiscard}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/5 transition"
        >
          <X className="h-3 w-3" /> Discard
        </button>
      </div>
    </div>
  );
}
