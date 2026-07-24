"use client";

import { useState } from "react";
import { X, AlertCircle, Layers2, Trash2, Loader2, History, Newspaper, LineChart, Lightbulb, BookOpen } from "lucide-react";
import type { HistoryListItem } from "../types";


export const HISTORY_CATEGORY_META: Record<HistoryListItem["category"], { label: string; icon: typeof Newspaper; color: string }> = {
  "news-batch":       { label: "News Batch",     icon: Newspaper,  color: "#10b981" },
  "daily-analysis":   { label: "Daily Analysis", icon: LineChart,  color: "#f59e0b" },
  "indicator":        { label: "Indicator",      icon: Layers2,    color: "#8b93a1" },
  "facts-batch":      { label: "Facts",          icon: Lightbulb,  color: "#10b981" },
  "learnings-batch":  { label: "Learnings",      icon: BookOpen,   color: "#10b981" },
};

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
export function HistoryModal({
  items,
  loading,
  error,
  busyId,
  onClose,
  onLoad,
  onDelete,
}: {
  items: HistoryListItem[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onClose: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | HistoryListItem["category"]>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);
  const counts = items.reduce<Record<string, number>>((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#141412] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-white/60" />
            <span className="text-[13px] font-bold text-white">Generation History</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/[0.06] shrink-0 flex-wrap">
          {(["all", "news-batch", "daily-analysis", "indicator", "facts-batch", "learnings-batch"] as const).map((cat) => {
            const active = filter === cat;
            const label = cat === "all" ? "All" : HISTORY_CATEGORY_META[cat].label;
            const count = cat === "all" ? items.length : (counts[cat] || 0);
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

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-white/40 gap-2 text-[12px]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-red-500/[0.08] border border-red-500/[0.2] text-[11px] text-red-300/90">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-white/30 gap-2">
              <History className="h-6 w-6 opacity-40" />
              <p className="text-[12px]">No saved generations yet.</p>
              <p className="text-[10.5px] text-white/20">News batches auto-save here. Use the Save icon to store Daily Analysis / Indicator posters too.</p>
            </div>
          ) : (
            filtered.map((item) => {
              const meta = HISTORY_CATEGORY_META[item.category];
              const Icon = meta.icon;
              const busy = busyId === item._id;
              return (
                <div
                  key={item._id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.035] transition-all group"
                >
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${meta.color}1f`, border: `1px solid ${meta.color}33` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white/90 truncate">{item.title}</p>
                    <p className="text-[10px] text-white/35">
                      {meta.label} · {item.itemCount} {item.itemCount === 1 ? "poster" : "posters"} · {relativeTime(item.createdAt)}
                    </p>
                  </div>
                  {confirmDeleteId === item._id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onDelete(item._id)}
                        disabled={busy}
                        className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition cursor-pointer disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onLoad(item._id)}
                        disabled={busy}
                        title="Load into customizer"
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white transition cursor-pointer disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Load"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(item._id)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
