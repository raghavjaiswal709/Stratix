"use client";

// Shared "select cards → Explain in Hinglish" feature — used by both the live
// Filter News grid (MarketNews.tsx) and the saved report viewer
// (filtered-report-view.tsx) so selection/explaining works identically in
// both places instead of only on the live feed.
import { useCallback, useState } from "react";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { MarkdownText } from "@/components/shared/markdown-text";
import { articleKey, type NewsArticle } from "./news-display-shared";

export function useExplainSelection() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainText, setExplainText] = useState<string | null>(null);

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  const explainSelected = useCallback(async (articles: NewsArticle[]) => {
    const chosen = articles.filter((a) => selectedKeys.has(articleKey(a)));
    if (chosen.length === 0) return;
    setExplainOpen(true);
    setExplainLoading(true);
    setExplainError(null);
    setExplainText(null);
    try {
      const res = await fetch("/api/news/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articles: chosen.map((a) => ({ headline: a.title, source: a.source, pubDate: a.pubDate })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to explain news");
      setExplainText(json.explanation ?? "No explanation generated.");
    } catch (err) {
      setExplainError((err as Error).message);
    } finally {
      setExplainLoading(false);
    }
  }, [selectedKeys]);

  return {
    selectedKeys,
    toggleSelected,
    clearSelection,
    explainOpen,
    setExplainOpen,
    explainLoading,
    explainError,
    explainText,
    explainSelected,
  };
}

export function SelectionActionBar({ count, onClear, onExplain }: { count: number; onClear: () => void; onExplain: () => void }) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/[0.14] bg-[#141414]/95 px-4 py-2 shadow-2xl backdrop-blur-sm">
      <span className="text-xs font-semibold text-white/70">{count} selected</span>
      <button onClick={onClear} className="text-[11px] text-white/40 hover:text-white/70 transition">
        Clear
      </button>
      <button
        onClick={onExplain}
        className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.12] px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/[0.2]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Explain in Hinglish
      </button>
    </div>
  );
}

export function ExplainModal({
  open,
  loading,
  error,
  text,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  text: string | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/[0.10] bg-[#0c0c0c] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white/90">News Explained — Beginner Hinglish</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.05] transition shrink-0"
          >
            <span className="text-xl font-medium leading-none">&times;</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 text-sm text-white/75 leading-relaxed space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="h-6 w-6 text-white/30 animate-spin" />
              <p className="text-xs text-white/30">Explaining selected news...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertCircle className="h-7 w-7 text-rose-500/40" />
              <p className="text-sm font-semibold text-white/60">Could not generate explanation</p>
              <p className="text-xs text-white/30 max-w-md">{error}</p>
            </div>
          ) : (
            <MarkdownText text={text ?? ""} className="select-text" />
          )}
        </div>
        <div className="px-6 py-4 border-t border-white/[0.06] bg-white/[0.01] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.08] text-white hover:bg-white/[0.12] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
