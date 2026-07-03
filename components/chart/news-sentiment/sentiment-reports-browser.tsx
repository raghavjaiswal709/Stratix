"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Sparkles, Plus, FileBarChart, Trash2, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyseNewsModal } from "./analyse-news-modal";
import { SentimentReportDashboard, type SentimentReport } from "./sentiment-report-dashboard";

interface ReportSummary {
  _id: string;
  hours: number;
  timeRangeLabel: string;
  newsAnalyzedCount: number;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: string;
}

function ReportsList({
  reports,
  selectedId,
  onSelect,
  onNew,
  onDelete,
}: {
  reports: ReportSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full w-full shrink-0 border-r border-white/7 md:w-80">
      <div className="px-4 py-3 border-b border-white/7 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-white">Sentiment Reports</h2>
          <p className="text-[10px] text-white/35 mt-0.5">{reports.length} generated · visible to all users</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.13] border border-white/[0.10] text-[11px] font-semibold text-white transition shrink-0"
        >
          <Plus className="h-3 w-3" /> New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-white/25 gap-2 px-6 text-center">
            <FileBarChart className="h-8 w-8 opacity-30" />
            <p className="text-[12px]">No reports yet</p>
            <p className="text-[10px] text-white/20">Analyse news to generate the first shared report</p>
          </div>
        ) : (
          reports.map((r) => (
            <div
              key={r._id}
              onClick={() => onSelect(r._id)}
              className={cn(
                "w-full text-left px-4 py-3.5 border-b border-white/5 transition hover:bg-white/3 cursor-pointer flex items-start gap-3 group",
                selectedId === r._id && "bg-white/[0.05] border-l-2 border-l-white/30"
              )}
            >
              <div className="h-7 w-7 shrink-0 rounded-full bg-white/8 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[12px] font-semibold text-white truncate">{r.timeRangeLabel}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r._id); }}
                    className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-red-400 transition shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[10px] text-white/30 mt-0.5">{r.newsAnalyzedCount} news analyzed</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <User className="h-2.5 w-2.5 text-white/20" />
                  <span className="text-[10px] text-white/30 truncate">{r.generatedByName || r.generatedBy}</span>
                </div>
                <p className="text-[10px] text-white/20 mt-0.5">{format(new Date(r.generatedAt), "MMM d, yyyy HH:mm")}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#0c0e14] border border-white/10 shadow-2xl p-5">
            <h3 className="text-[15px] font-semibold text-white mb-2">Delete this report?</h3>
            <p className="text-[12px] text-white/40 mb-5">Only reports you generated can be deleted. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-xl border border-white/10 text-[12px] text-white/40 hover:text-white/70 transition">Cancel</button>
              <button
                onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
                className="flex-1 py-2 rounded-xl bg-red-500/15 border border-red-500/25 text-[12px] font-semibold text-red-400 hover:bg-red-500/25 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SentimentReportsBrowser({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<SentimentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | undefined>(undefined);

  const loadList = useCallback(() => {
    fetch("/api/news/sentiment-report")
      .then((r) => r.json())
      .then((data) => setReports(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selectedId) { setSelectedReport(null); return; }
    setLoadingDetail(true);
    fetch(`/api/news/sentiment-report/${selectedId}`)
      .then((r) => r.json())
      .then((data) => setSelectedReport(data))
      .catch(() => setSelectedReport(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  async function handleGenerate(hours: number) {
    setGenerating(true);
    setGenError(null);
    setProgressLabel("Fetching every RSS feed, breaking-alert source, central bank & calendar…");
    try {
      const res = await fetch("/api/news/sentiment-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? "Failed to generate report");
        return;
      }
      setReports((prev) => [{
        _id: data._id,
        hours: data.hours,
        timeRangeLabel: data.timeRangeLabel,
        newsAnalyzedCount: data.newsAnalyzedCount,
        generatedBy: data.generatedBy,
        generatedByName: data.generatedByName,
        generatedAt: data.generatedAt,
      }, ...prev]);
      setSelectedReport(data);
      setSelectedId(data._id);
      setShowModal(false);
    } catch {
      setGenError("Network error — please try again");
    } finally {
      setGenerating(false);
      setProgressLabel(undefined);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/news/sentiment-report/${id}`, { method: "DELETE" });
    setReports((prev) => prev.filter((r) => r._id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedReport(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/70 backdrop-blur-sm">
      <div className="w-full h-full max-w-7xl mx-auto my-0 sm:my-6 sm:h-[calc(100%-3rem)] flex flex-col rounded-none sm:rounded-2xl border-0 sm:border border-white/10 bg-[#0a0b0f] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/7 shrink-0">
          <span className="text-[12px] font-semibold text-white/60">News Sentiment — Shared Reports</span>
          <button onClick={onClose} className="text-white/40 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {showModal && (
          <AnalyseNewsModal
            onClose={() => { if (!generating) { setShowModal(false); setGenError(null); } }}
            onGenerate={handleGenerate}
            generating={generating}
            error={genError}
            progressLabel={progressLabel}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-80 shrink-0 flex-col h-full`}>
              <ReportsList
                reports={reports}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onNew={() => setShowModal(true)}
                onDelete={handleDelete}
              />
            </div>

            {selectedId ? (
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex md:hidden items-center px-4 py-2 border-b border-white/7 shrink-0">
                  <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white transition">
                    <span className="text-[16px] leading-none">←</span> Back to list
                  </button>
                </div>
                {loadingDetail || !selectedReport ? (
                  <div className="flex items-center justify-center flex-1">
                    <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
                  </div>
                ) : (
                  <SentimentReportDashboard report={selectedReport} />
                )}
              </div>
            ) : (
              <div className="hidden md:flex flex-1 flex-col items-center justify-center text-white/25">
                <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                  <FileBarChart className="h-6 w-6 opacity-50" />
                </div>
                <p className="text-[14px] font-medium">No report selected</p>
                <p className="text-[12px] mt-1">Generate a sentiment report or pick one from the list</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.13] border border-white/[0.10] text-[12px] font-semibold text-white transition"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Analyse News
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
