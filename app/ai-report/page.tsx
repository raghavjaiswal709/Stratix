"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KeyLevels {
  resistance: number[];
  support: number[];
}

interface SymbolData {
  past_24h_summary: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  key_levels: KeyLevels;
  session_outlook: string;
}

interface ReportMeta {
  date: string;
  session: string;
  generated_at: string;
}

interface MarketReport {
  meta: ReportMeta;
  global_macro_overview: string;
  symbols: Record<string, SymbolData>;
}

interface ReportEntry {
  date: string;
  session: string;
  filename: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  asian:    "Asian",
  london:   "London",
  new_york: "New York",
};

const SESSION_ORDER = ["asian", "london", "new_york"] as const;

const SYMBOL_META: Record<string, { label: string; assetClass: string }> = {
  XAUUSD:  { label: "XAU/USD",   assetClass: "Metals"  },
  XAGUSD:  { label: "XAG/USD",   assetClass: "Metals"  },
  BTCUSDT: { label: "BTC/USDT",  assetClass: "Crypto"  },
  ETHUSD:  { label: "ETH/USD",   assetClass: "Crypto"  },
  GBPUSD:  { label: "GBP/USD",   assetClass: "Forex"   },
  EURUSD:  { label: "EUR/USD",   assetClass: "Forex"   },
  USDJPY:  { label: "USD/JPY",   assetClass: "Forex"   },
  AUDUSD:  { label: "AUD/USD",   assetClass: "Forex"   },
  NZDUSD:  { label: "NZD/USD",   assetClass: "Forex"   },
  USDCAD:  { label: "USD/CAD",   assetClass: "Forex"   },
  USDCHF:  { label: "USD/CHF",   assetClass: "Forex"   },
};

const ASSET_CLASS_ORDER = ["Metals", "Crypto", "Forex"];

function getCurrentSession(): keyof typeof SESSION_LABELS {
  const h = new Date().getUTCHours();
  if (h >= 22 || h < 6)  return "asian";
  if (h >= 6  && h < 12) return "london";
  return "new_york";
}

function formatDateLabel(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    year:    "numeric",
  });
}

function formatNumber(n: number): string {
  if (n >= 10000) return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (n >= 100)   return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const lower = sentiment.toLowerCase();
  const bullish = lower === "bullish";
  const bearish = lower === "bearish";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0",
        bullish && "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
        bearish && "bg-red-500/15 text-red-400 border-red-500/25",
        !bullish && !bearish && "bg-white/[0.06] text-white/50 border-white/[0.10]",
      )}
    >
      {bullish && <TrendingUp  className="h-3 w-3" />}
      {bearish && <TrendingDown className="h-3 w-3" />}
      {!bullish && !bearish && <Minus className="h-3 w-3" />}
      {sentiment}
    </span>
  );
}

function LevelPill({ value, type }: { value: number; type: "resistance" | "support" }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2 py-1 rounded-md text-[11px] font-mono",
        type === "resistance"
          ? "bg-red-500/[0.07] text-red-400/80"
          : "bg-emerald-500/[0.07] text-emerald-400/80",
      )}
    >
      <span className={cn("text-[9px] font-bold uppercase tracking-widest font-sans",
        type === "resistance" ? "text-red-500/40" : "text-emerald-500/40")}>
        {type === "resistance" ? "R" : "S"}
      </span>
      <span>{formatNumber(value)}</span>
    </div>
  );
}

function SymbolCard({ symbol, data }: { symbol: string; data: SymbolData }) {
  const meta = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other" };
  const [expanded, setExpanded] = useState(false);

  const SUMMARY_LIMIT = 220;
  const OUTLOOK_LIMIT = 280;
  const needsExpand =
    data.past_24h_summary.length > SUMMARY_LIMIT ||
    data.session_outlook.length > OUTLOOK_LIMIT;

  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.12] transition-colors duration-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[15px] font-bold text-white leading-none">{meta.label}</h3>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-white/[0.05] text-white/30 border border-white/[0.07] rounded">
              {meta.assetClass}
            </span>
          </div>
          <span className="text-[10px] text-white/20 font-mono tracking-wider">{symbol}</span>
        </div>
        <SentimentBadge sentiment={data.sentiment} />
      </div>

      {/* 24h Summary */}
      <div className="px-5 pb-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">24h Summary</p>
        <p className="text-[12px] text-white/55 leading-relaxed">
          {!expanded && data.past_24h_summary.length > SUMMARY_LIMIT
            ? data.past_24h_summary.slice(0, SUMMARY_LIMIT) + "…"
            : data.past_24h_summary}
        </p>
      </div>

      {/* Key Levels */}
      {(data.key_levels.resistance.length > 0 || data.key_levels.support.length > 0) && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-1.5">Resistance</p>
            <div className="flex flex-col gap-1">
              {data.key_levels.resistance.slice(0, 3).map((r, i) => (
                <LevelPill key={i} value={r} type="resistance" />
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-1.5">Support</p>
            <div className="flex flex-col gap-1">
              {data.key_levels.support.slice(0, 3).map((s, i) => (
                <LevelPill key={i} value={s} type="support" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Session Outlook */}
      <div className="px-5 pb-5 pt-3 border-t border-white/[0.05] mt-auto">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">Session Outlook</p>
        <p className="text-[12px] text-white/70 leading-relaxed">
          {!expanded && data.session_outlook.length > OUTLOOK_LIMIT
            ? data.session_outlook.slice(0, OUTLOOK_LIMIT) + "…"
            : data.session_outlook}
        </p>
      </div>

      {needsExpand && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-center gap-1 w-full py-2.5 text-[11px] text-white/25 hover:text-white/55 border-t border-white/[0.05] transition-colors"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Read full analysis</>
          )}
        </button>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 animate-pulse">
      <div className="flex justify-between gap-3 mb-5">
        <div className="space-y-2">
          <div className="h-4 w-24 bg-white/[0.07] rounded" />
          <div className="h-3 w-14 bg-white/[0.04] rounded" />
        </div>
        <div className="h-6 w-20 bg-white/[0.06] rounded-full" />
      </div>
      <div className="h-3 w-20 bg-white/[0.04] rounded mb-2" />
      <div className="space-y-1.5 mb-5">
        {[1, 0.9, 0.75, 0.6].map((w, i) => (
          <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[0, 1].map((side) => (
          <div key={side} className="space-y-1.5">
            <div className="h-3 w-16 bg-white/[0.04] rounded mb-2" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-6 bg-white/[0.04] rounded" />
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.05] pt-4 space-y-1.5">
        <div className="h-3 w-20 bg-white/[0.04] rounded mb-2" />
        {[1, 0.9, 0.8, 0.65].map((w, i) => (
          <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function MacroSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 mb-6 animate-pulse">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-4 w-4 bg-white/[0.07] rounded" />
        <div className="h-3 w-40 bg-white/[0.07] rounded" />
      </div>
      <div className="space-y-2">
        {[1, 0.95, 0.9, 0.88, 0.82, 0.75, 0.6].map((w, i) => (
          <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIReportPage() {
  const [reports,        setReports]        = useState<ReportEntry[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate,   setSelectedDate]   = useState<string>("");
  const [selectedSession,setSelectedSession]= useState<string>("asian");
  const [report,         setReport]         = useState<MarketReport | null>(null);
  const [indexLoading,   setIndexLoading]   = useState(true);
  const [reportLoading,  setReportLoading]  = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const currentSession = getCurrentSession();

  // Fetch index of all available report files
  useEffect(() => {
    fetch("/api/ai-reports")
      .then((r) => r.json())
      .then((data: ReportEntry[]) => {
        setReports(data);

        const dates = [...new Set(data.map((r) => r.date))].sort().reverse();
        setAvailableDates(dates);

        if (dates.length > 0) {
          setSelectedDate(dates[0]);
          // Default to most-recent session for the most-recent date
          const forDate = data.filter((r) => r.date === dates[0]);
          const best = SESSION_ORDER.slice().reverse().find((s) =>
            forDate.some((r) => r.session === s)
          );
          setSelectedSession(best ?? "asian");
        }
      })
      .catch(() => setError("Failed to load report index."))
      .finally(() => setIndexLoading(false));
  }, []);

  // Load the actual JSON when date or session changes
  const loadReport = useCallback(
    async (date: string, session: string) => {
      const entry = reports.find((r) => r.date === date && r.session === session);
      if (!entry) {
        setReport(null);
        return;
      }
      setReportLoading(true);
      setError(null);
      try {
        const res = await fetch(`/reports/${entry.filename}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setReport(await res.json());
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(`Failed to load report: ${msg}`);
        setReport(null);
      } finally {
        setReportLoading(false);
      }
    },
    [reports],
  );

  useEffect(() => {
    if (selectedDate && selectedSession && reports.length > 0) {
      loadReport(selectedDate, selectedSession);
    }
  }, [selectedDate, selectedSession, reports, loadReport]);

  // Date navigation
  const dateIndex  = availableDates.indexOf(selectedDate);
  const canGoBack  = dateIndex < availableDates.length - 1;
  const canGoFwd   = dateIndex > 0;

  const sessionsForDate = reports
    .filter((r) => r.date === selectedDate)
    .map((r) => r.session);

  // Group symbols by asset class for the grid layout
  const symbolGroups: Record<string, [string, SymbolData][]> = {};
  if (report) {
    for (const [sym, data] of Object.entries(report.symbols)) {
      const cls = SYMBOL_META[sym]?.assetClass ?? "Other";
      if (!symbolGroups[cls]) symbolGroups[cls] = [];
      symbolGroups[cls].push([sym, data]);
    }
  }

  // ── Initial loading ──────────────────────────────────────────────────────
  if (indexLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
        <p className="text-[12px] text-white/30 tracking-wide">Loading reports…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-white/[0.055]">
        <div className="px-5 md:px-8 py-4 space-y-4">

          {/* Title row */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0">
                <BrainCircuit className="h-4.5 w-4.5 text-white/70" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-white leading-none mb-0.5">AI Report</h1>
                <p className="text-[11px] text-white/30">
                  Institutional session analysis · Gemini 2.0 Flash
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-white/30">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Live session:{" "}
                <span className="text-white/60 font-medium">
                  {SESSION_LABELS[currentSession]}
                </span>
              </span>
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3 flex-wrap">

            {/* Session tabs */}
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              {SESSION_ORDER.map((s) => {
                const available = sessionsForDate.includes(s);
                const active    = selectedSession === s;
                return (
                  <button
                    key={s}
                    onClick={() => available && setSelectedSession(s)}
                    disabled={!available && availableDates.length > 0}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
                      active
                        ? "bg-white/[0.10] text-white border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        : available
                          ? "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
                          : "text-white/15 cursor-not-allowed",
                    )}
                  >
                    {SESSION_LABELS[s]}
                    {currentSession === s && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Date navigator */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => canGoBack && setSelectedDate(availableDates[dateIndex + 1])}
                disabled={!canGoBack}
                aria-label="Previous date"
                className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <span className="text-[12px] font-medium text-white/70 min-w-[148px] text-center select-none">
                {selectedDate ? formatDateLabel(selectedDate) : "No reports"}
              </span>

              <button
                onClick={() => canGoFwd && setSelectedDate(availableDates[dateIndex - 1])}
                disabled={!canGoFwd}
                aria-label="Next date"
                className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 px-5 md:px-8 py-6">

        {/* No reports at all */}
        {availableDates.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <BrainCircuit className="h-7 w-7 text-white/20" />
            </div>
            <div className="max-w-xs">
              <p className="text-[15px] font-semibold text-white/60 mb-2">No reports yet</p>
              <p className="text-[12px] text-white/30 leading-relaxed">
                Reports are auto-generated by GitHub Actions before each trading session
                (Asian 22:00, London 06:00, New York 12:00 UTC). The first report will
                appear after the next scheduled run.
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {reportLoading && (
          <>
            <MacroSkeleton />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </>
        )}

        {/* Session not available for selected date */}
        {!reportLoading && !error && selectedDate && !report && availableDates.length > 0 && (
          <div className="flex flex-col items-center justify-center min-h-[45vh] gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <RefreshCw className="h-5 w-5 text-white/20" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/50 mb-1">
                No {SESSION_LABELS[selectedSession]} report for {formatDateLabel(selectedDate)}
              </p>
              <p className="text-[11px] text-white/25">
                Available:{" "}
                {sessionsForDate.length > 0
                  ? sessionsForDate.map((s) => SESSION_LABELS[s]).join(", ")
                  : "None"}
              </p>
            </div>
          </div>
        )}

        {/* ── Report content ─────────────────────────────────────────────── */}
        {!reportLoading && report && (
          <>
            {/* Report meta pill + timestamp */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.07] border border-white/[0.10] rounded-full text-white/65">
                {report.meta.session} Session
              </span>
              <span className="text-[11px] text-white/25">
                Generated{" "}
                {new Date(report.meta.generated_at).toLocaleString("en-US", {
                  month:    "short",
                  day:      "numeric",
                  hour:     "2-digit",
                  minute:   "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </span>
            </div>

            {/* Global macro overview */}
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-white/35 shrink-0" />
                <h2 className="text-[11px] font-semibold text-white/45 uppercase tracking-widest">
                  Global Macro Overview
                </h2>
              </div>
              <p className="text-[13px] text-white/65 leading-[1.85]">
                {report.global_macro_overview}
              </p>
            </div>

            {/* Symbol groups */}
            <div className="space-y-8">
              {ASSET_CLASS_ORDER.filter((cls) => symbolGroups[cls]?.length).map((cls) => (
                <section key={cls}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">
                      {cls}
                    </h2>
                    <span className="text-[10px] text-white/15">
                      {symbolGroups[cls].length} instrument{symbolGroups[cls].length > 1 ? "s" : ""}
                    </span>
                    <div className="flex-1 h-px bg-white/[0.05]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {symbolGroups[cls].map(([sym, data]) => (
                      <SymbolCard key={sym} symbol={sym} data={data} />
                    ))}
                  </div>
                </section>
              ))}

              {/* Any symbols not in ASSET_CLASS_ORDER */}
              {Object.entries(symbolGroups)
                .filter(([cls]) => !ASSET_CLASS_ORDER.includes(cls))
                .map(([cls, entries]) => (
                  <section key={cls}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">
                        {cls}
                      </h2>
                      <div className="flex-1 h-px bg-white/[0.05]" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {entries.map(([sym, data]) => (
                        <SymbolCard key={sym} symbol={sym} data={data} />
                      ))}
                    </div>
                  </section>
                ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
