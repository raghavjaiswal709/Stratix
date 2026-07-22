"use client";

import { useState } from "react";
import { X, CheckSquare, Square, ListChecks } from "lucide-react";
import type { NewsItem } from "../types";


export const CATEGORY_LABELS: Record<NonNullable<NewsItem["category"]>, string> = {
  Macro: "Macro",
  Geopolitical: "Geopolitical",
  Corporate: "Corporate",
  Sentiment: "Sentiment",
  Systemic: "Systemic",
};
export const CATEGORY_ORDER = ["all", "Macro", "Geopolitical", "Corporate", "Sentiment", "Systemic"] as const;
// Shown right after generation (and re-openable any time a raw batch exists)
// so the user can narrow the 20-30 AI-curated candidates down to the stories
// they actually want in the exported batch — every candidate stays available,
// nothing is silently dropped by the AI.
export function PosterSelectionModal({
  candidates,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  onClose,
  onApply,
}: {
  candidates: NewsItem[];
  selected: Set<number>;
  onToggle: (idx: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onClose: () => void;
  onApply: () => void;
}) {
  const [filter, setFilter] = useState<(typeof CATEGORY_ORDER)[number]>("all");

  const counts = candidates.reduce<Record<string, number>>((acc, c) => {
    const cat = c.category || "Macro";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const filtered = filter === "all" ? candidates : candidates.filter((c) => (c.category || "Macro") === filter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#141412] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-white/60" />
            <div>
              <span className="text-[13px] font-bold text-white block">Select Posters for Batch</span>
              <span className="text-[10px] text-white/35">
                {candidates.length} curated stories found · {selected.size} selected
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/[0.06] shrink-0 flex-wrap">
          {CATEGORY_ORDER.map((cat) => {
            const active = filter === cat;
            const label = cat === "all" ? "All" : CATEGORY_LABELS[cat];
            const count = cat === "all" ? candidates.length : (counts[cat] || 0);
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer border ${
                  active
                    ? "bg-white/[0.1] text-white border-white/[0.15]"
                    : "bg-white/[0.02] text-white/45 border-white/[0.06] hover:text-white/70"
                }`}
              >
                {label} <span className="opacity-50">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Bulk actions */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/[0.06] shrink-0">
          <button
            onClick={onSelectAll}
            className="text-[10.5px] font-bold text-white/50 hover:text-white/85 transition cursor-pointer"
          >
            Select All
          </button>
          <span className="text-white/15">·</span>
          <button
            onClick={onClear}
            className="text-[10.5px] font-bold text-white/50 hover:text-white/85 transition cursor-pointer"
          >
            Clear
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-white/30 gap-2">
              <p className="text-[12px]">No stories in this category.</p>
            </div>
          ) : (
            filtered.map((item) => {
              const idx = candidates.indexOf(item);
              const isSelected = selected.has(idx);
              const sentimentColor = item.sentiment === "Bearish" ? "#ef4444" : item.sentiment === "Bullish" ? "#10b981" : "#f59e0b";
              return (
                <button
                  key={idx}
                  onClick={() => onToggle(idx)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white/[0.06] border-white/20"
                      : "bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03]"
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="h-4 w-4 text-white shrink-0 mt-0.5" />
                  ) : (
                    <Square className="h-4 w-4 text-white/25 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 border border-white/[0.08]">
                        {CATEGORY_LABELS[item.category || "Macro"]}
                      </span>
                      <span
                        className="text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                        style={{ color: sentimentColor, borderColor: `${sentimentColor}40`, background: `${sentimentColor}14` }}
                      >
                        {item.sentiment || "Neutral"}
                      </span>
                      <span className="text-[8.5px] text-white/30 uppercase tracking-wider">{item.impact || "Medium"} impact</span>
                    </div>
                    <p className={`text-[12px] font-semibold truncate ${isSelected ? "text-white/95" : "text-white/60"}`}>
                      {item.title || "Untitled"}
                    </p>
                    <p className="text-[10px] text-white/30 truncate mt-0.5">{item.affectedAssets || item.source || ""}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.06] shrink-0">
          <span className="text-[10.5px] text-white/35">{selected.size} of {candidates.length} selected</span>
          <button
            onClick={onApply}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/[0.18] text-emerald-300 hover:bg-emerald-500/[0.26] border border-emerald-500/[0.28] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckSquare className="h-3.5 w-3.5" /> Continue with {selected.size} {selected.size === 1 ? "Poster" : "Posters"}
          </button>
        </div>
      </div>
    </div>
  );
}
