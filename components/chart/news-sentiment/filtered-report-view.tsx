"use client";

import { format } from "date-fns";
import { Filter, X, User, Clock, History } from "lucide-react";
import {
  NewsCard,
  articleKey,
  mapFilterReportToArticles,
  type FilterReportRawItem,
  type FilterReportKeptItem,
} from "./news-display-shared";
import { useExplainSelection, SelectionActionBar, ExplainModal } from "./explain-selection";

export interface FilteredReportData {
  allNews: FilterReportRawItem[];
  analyzed_news: FilterReportKeptItem[];
}

export interface FilteredReport {
  _id: string;
  hours: number;
  timeRangeLabel: string;
  allNewsCount: number;
  keptNewsCount: number;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: string;
  data: FilteredReportData;
}

function safeFormat(dateStr: string, pattern: string): string {
  try {
    return format(new Date(dateStr), pattern);
  } catch {
    return "";
  }
}

// Renders a saved /api/news/filter-report record with the exact same card
// presentation as the live "Filter News" grid in MarketNews.tsx (via the
// shared NewsCard component) — previously this reused SentimentReportDashboard,
// which is built for the unrelated deep sentiment-report feature and shows an
// empty "0 instruments" section because filter reports don't carry
// overall_sentiment/instrument_sentiment/key_themes.
export function FilteredReportView({ report, onClose }: { report: FilteredReport; onClose: () => void }) {
  const articles = mapFilterReportToArticles(report.data?.allNews ?? [], report.data?.analyzed_news ?? []);
  const {
    selectedKeys,
    toggleSelected,
    clearSelection,
    explainOpen,
    setExplainOpen,
    explainLoading,
    explainError,
    explainText,
    explainSelected,
  } = useExplainSelection();

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0c0e14] border-b border-white/7">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Filter className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-white truncate">Filtered News Report</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-white/35 flex-wrap">
              <span>{report.timeRangeLabel}</span>
              <span className="text-white/15">·</span>
              <span>{report.keptNewsCount}/{report.allNewsCount} kept for forex/gold/crypto</span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1"><User className="h-2.5 w-2.5" />{report.generatedByName || report.generatedBy}</span>
              <span className="text-white/15">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {safeFormat(report.generatedAt, "MMM d, HH:mm")}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white/50 hover:text-white transition shrink-0"
          aria-label="Close report"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* "Saved report, not live" banner */}
      <div className="px-6 pt-4">
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
          <History className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-snug text-amber-200/90">
            Viewing a saved report from {safeFormat(report.generatedAt, "MMM d, yyyy 'at' HH:mm")} — this is not live data.
          </p>
          <button
            onClick={onClose}
            className="ml-auto text-[11px] font-semibold text-amber-300 underline underline-offset-2 hover:text-white transition shrink-0"
          >
            View Live Feed
          </button>
        </div>
      </div>

      {/* Card grid — identical presentation to the live Filter News grid */}
      <div className="px-6 py-5">
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.01] py-12 text-center">
            <p className="text-sm font-semibold text-white/60">No kept articles in this report</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {articles.map((item, idx) => {
              const key = articleKey(item);
              return (
                <NewsCard
                  key={`${item.link}-${idx}`}
                  item={item}
                  displayIndex={idx + 1}
                  showCheckbox
                  selected={selectedKeys.has(key)}
                  onToggleSelect={() => toggleSelected(key)}
                  wrapperClassName={
                    selectedKeys.has(key)
                      ? "opacity-100 border-white/25 bg-white/[0.05] ring-2 ring-white/40"
                      : undefined
                  }
                  onClick={() => {
                    if (item.link) window.open(item.link, "_blank", "noopener,noreferrer");
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <SelectionActionBar
        count={selectedKeys.size}
        onClear={clearSelection}
        onExplain={() => explainSelected(articles)}
      />
      <ExplainModal
        open={explainOpen}
        loading={explainLoading}
        error={explainError}
        text={explainText}
        onClose={() => setExplainOpen(false)}
      />
    </div>
  );
}
