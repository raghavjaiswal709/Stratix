"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Zap,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Radio,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HighImpactEvent {
  event_name: string;
  impact_explanation: string;
}

interface AllNewsSection {
  headline: string;
  summary: string;
  high_impact_events: HighImpactEvent[];
}

interface SymbolNews {
  latest_headlines: string[];
  detailed_breakdown: string;
  trader_alert: string;
}

interface NewsReport {
  meta: {
    date: string;
    session: string;
    generated_at: string;
    language: string;
  };
  all_news_section: AllNewsSection;
  symbol_wise_news: Record<string, SymbolNews>;
}

interface NewsEntry {
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

const SYMBOL_META: Record<string, { label: string; assetClass: string; flag: string }> = {
  XAUUSD:  { label: "XAU/USD",  assetClass: "Metals",  flag: "🥇" },
  XAGUSD:  { label: "XAG/USD",  assetClass: "Metals",  flag: "🥈" },
  BTCUSDT: { label: "BTC/USDT", assetClass: "Crypto",  flag: "₿"  },
  ETHUSD:  { label: "ETH/USD",  assetClass: "Crypto",  flag: "Ξ"  },
  GBPUSD:  { label: "GBP/USD",  assetClass: "Forex",   flag: "🇬🇧" },
  EURUSD:  { label: "EUR/USD",  assetClass: "Forex",   flag: "🇪🇺" },
  USDJPY:  { label: "USD/JPY",  assetClass: "Forex",   flag: "🇯🇵" },
  AUDUSD:  { label: "AUD/USD",  assetClass: "Forex",   flag: "🇦🇺" },
  NZDUSD:  { label: "NZD/USD",  assetClass: "Forex",   flag: "🇳🇿" },
  USDCAD:  { label: "USD/CAD",  assetClass: "Forex",   flag: "🇨🇦" },
  USDCHF:  { label: "USD/CHF",  assetClass: "Forex",   flag: "🇨🇭" },
};

const SYMBOL_DISPLAY_ORDER = [
  "XAUUSD", "XAGUSD",
  "BTCUSDT", "ETHUSD",
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
];

function getCurrentSession(): string {
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

// ─── High Impact Event Card ───────────────────────────────────────────────────

function EventCard({ event }: { event: HighImpactEvent }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 180;
  const needsExpand = event.impact_explanation.length > LIMIT;

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.08] border border-white/[0.10]">
          <Zap className="h-3 w-3 text-white/50" />
        </div>
        <p className="text-[13px] font-semibold text-white/80 leading-snug">{event.event_name}</p>
      </div>
      <p className="text-[12px] text-white/50 leading-[1.8] pl-7">
        {!expanded && needsExpand
          ? event.impact_explanation.slice(0, LIMIT) + "…"
          : event.impact_explanation}
      </p>
      {needsExpand && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 pl-7 text-[11px] text-white/25 hover:text-white/55 transition-colors self-start"
        >
          {expanded ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
        </button>
      )}
    </div>
  );
}

// ─── Symbol News Card ─────────────────────────────────────────────────────────

function SymbolCard({ symbol, news }: { symbol: string; news: SymbolNews }) {
  const meta = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other", flag: "•" };
  const [expanded, setExpanded] = useState(false);

  const BREAKDOWN_LIMIT = 260;
  const needsExpand = news.detailed_breakdown.length > BREAKDOWN_LIMIT;

  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.11] transition-colors duration-200 overflow-hidden">

      {/* Card header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.05]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-[15px] select-none">
          {meta.flag}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[14px] font-bold text-white leading-none">{meta.label}</h3>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-white/[0.05] text-white/25 border border-white/[0.07] rounded">
              {meta.assetClass}
            </span>
          </div>
          <span className="text-[10px] text-white/20 font-mono tracking-wider">{symbol}</span>
        </div>
      </div>

      {/* Latest headlines */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2.5">
          Latest Khabar
        </p>
        <ul className="space-y-2">
          {news.latest_headlines.map((h, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12px] text-white/60 leading-relaxed">
              <span className="mt-[7px] h-1 w-1 rounded-full bg-white/25 shrink-0" />
              {h}
            </li>
          ))}
        </ul>
      </div>

      {/* Breakdown */}
      <div className="px-5 pb-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2.5">
          Detailed Breakdown
        </p>
        <p className="text-[12px] text-white/55 leading-[1.85]">
          {!expanded && needsExpand
            ? news.detailed_breakdown.slice(0, BREAKDOWN_LIMIT) + "…"
            : news.detailed_breakdown}
        </p>
        {needsExpand && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 mt-2 text-[11px] text-white/25 hover:text-white/55 transition-colors"
          >
            {expanded
              ? <><ChevronUp className="h-3 w-3" /> Kam dikhao</>
              : <><ChevronDown className="h-3 w-3" /> Poora padho</>}
          </button>
        )}
      </div>

      {/* Trader alert */}
      <div className="px-5 pb-5 mt-auto">
        <div className="rounded-xl bg-amber-500/[0.07] border border-amber-500/[0.18] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3 w-3 text-amber-400/70 shrink-0" />
            <span className="text-[9px] font-bold text-amber-400/60 uppercase tracking-widest">
              Trader Alert
            </span>
          </div>
          <p className="text-[12px] text-amber-300/80 leading-[1.8]">{news.trader_alert}</p>
        </div>
      </div>

    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function BannerSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 mb-6 animate-pulse">
      <div className="h-3 w-24 bg-white/[0.07] rounded mb-4" />
      <div className="h-6 w-3/4 bg-white/[0.09] rounded mb-2" />
      <div className="h-6 w-1/2 bg-white/[0.07] rounded mb-6" />
      <div className="space-y-2">
        {[1, 0.95, 0.85, 0.9, 0.75].map((w, i) => (
          <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function EventsSkeleton() {
  return (
    <div className="mb-8">
      <div className="h-3 w-32 bg-white/[0.07] rounded mb-4 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white/[0.025] border border-white/[0.07] p-4 animate-pulse">
            <div className="flex gap-2.5 mb-3">
              <div className="h-5 w-5 bg-white/[0.07] rounded-md shrink-0" />
              <div className="h-4 w-32 bg-white/[0.07] rounded" />
            </div>
            <div className="space-y-1.5 pl-7">
              {[1, 0.9, 0.75].map((w, j) => (
                <div key={j} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white/[0.025] border border-white/[0.07] overflow-hidden animate-pulse">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.05]">
            <div className="h-9 w-9 bg-white/[0.07] rounded-xl shrink-0" />
            <div className="space-y-1.5">
              <div className="h-4 w-20 bg-white/[0.07] rounded" />
              <div className="h-3 w-12 bg-white/[0.04] rounded" />
            </div>
          </div>
          <div className="px-5 py-4 space-y-2">
            <div className="h-3 w-20 bg-white/[0.04] rounded mb-3" />
            <div className="h-3 w-full bg-white/[0.04] rounded" />
            <div className="h-3 w-5/6 bg-white/[0.04] rounded" />
          </div>
          <div className="px-5 pb-4 space-y-1.5">
            <div className="h-3 w-24 bg-white/[0.04] rounded mb-3" />
            {[1, 0.9, 0.8, 0.7].map((w, j) => (
              <div key={j} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
          <div className="px-5 pb-5">
            <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/[0.10] p-3 space-y-1.5">
              <div className="h-3 w-24 bg-amber-500/[0.10] rounded" />
              {[1, 0.85].map((w, j) => (
                <div key={j} className="h-3 bg-amber-500/[0.07] rounded" style={{ width: `${w * 100}%` }} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsAnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Admin-only guard — matches the pattern used in /admin and /live-data
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace("/auth/signin");
    } else if (session.user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  const [reports,         setReports]         = useState<NewsEntry[]>([]);
  const [availableDates,  setAvailableDates]  = useState<string[]>([]);
  const [selectedDate,    setSelectedDate]    = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<string>("asian");
  const [report,          setReport]          = useState<NewsReport | null>(null);
  const [indexLoading,    setIndexLoading]    = useState(true);
  const [reportLoading,   setReportLoading]   = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const currentSession = getCurrentSession();

  // Fetch the index of all available news files
  useEffect(() => {
    fetch("/api/news-reports")
      .then((r) => r.json())
      .then((data: NewsEntry[]) => {
        setReports(data);
        const dates = [...new Set(data.map((r) => r.date))].sort().reverse();
        setAvailableDates(dates);
        if (dates.length > 0) {
          setSelectedDate(dates[0]);
          const forDate = data.filter((r) => r.date === dates[0]);
          const best = SESSION_ORDER.slice().reverse().find((s) =>
            forDate.some((r) => r.session === s)
          );
          setSelectedSession(best ?? "asian");
        }
      })
      .catch(() => setError("Report index load nahi hua — dobara try karo."))
      .finally(() => setIndexLoading(false));
  }, []);

  // Load the selected report JSON
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
        const res = await fetch(`/data/news/${entry.filename}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setReport(await res.json());
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(`Report load nahi hua: ${msg}`);
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

  // Date navigation helpers
  const dateIndex  = availableDates.indexOf(selectedDate);
  const canGoBack  = dateIndex < availableDates.length - 1;
  const canGoFwd   = dateIndex > 0;

  const sessionsForDate = reports
    .filter((r) => r.date === selectedDate)
    .map((r) => r.session);

  // Ordered symbol list — only include what the report actually has
  const orderedSymbols: string[] = report
    ? SYMBOL_DISPLAY_ORDER.filter((s) => s in report.symbol_wise_news)
    : [];

  // ── Auth gate — render nothing until admin confirmed ─────────────────────
  if (status === "loading" || !session?.user || session.user.role !== "admin") {
    return null;
  }

  // ── Initial loading ──────────────────────────────────────────────────────
  if (indexLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
        <p className="text-[12px] text-white/30 tracking-wide">News reports load ho rahe hain…</p>
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
                <Newspaper className="h-4 w-4 text-white/70" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-white leading-none mb-0.5">
                  News Analysis
                </h1>
                <p className="text-[11px] text-white/30">
                  Hinglish market news · Gemini 2.0 Flash
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-white/30">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Live session:{" "}
                <span className="text-white/60 font-medium">{SESSION_LABELS[currentSession]}</span>
              </span>
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
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
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
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

        {/* ── Empty state — no reports at all ─────────────────────────────── */}
        {availableDates.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <Radio className="h-7 w-7 text-white/20" />
            </div>
            <div className="max-w-xs">
              <p className="text-[15px] font-semibold text-white/60 mb-2">Abhi koi news report nahi hai</p>
              <p className="text-[12px] text-white/30 leading-relaxed">
                News reports GitHub Actions se automatically generate hote hain — Asian session ke liye
                21:30 UTC, London ke liye 05:30 UTC, aur New York ke liye 11:30 UTC par. Pehla report
                agli scheduled run ke baad dikhega.
              </p>
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* ── Loading skeletons ────────────────────────────────────────────── */}
        {reportLoading && (
          <>
            <BannerSkeleton />
            <EventsSkeleton />
            <CardsSkeleton />
          </>
        )}

        {/* ── Session not available for selected date ──────────────────────── */}
        {!reportLoading && !error && selectedDate && !report && availableDates.length > 0 && (
          <div className="flex flex-col items-center justify-center min-h-[45vh] gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <RefreshCw className="h-5 w-5 text-white/20" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/50 mb-1">
                {formatDateLabel(selectedDate)} ke liye {SESSION_LABELS[selectedSession]} news report nahi hai
              </p>
              <p className="text-[11px] text-white/25">
                Available sessions:{" "}
                {sessionsForDate.length > 0
                  ? sessionsForDate.map((s) => SESSION_LABELS[s]).join(", ")
                  : "Koi nahi"}
              </p>
            </div>
          </div>
        )}

        {/* ── Report content ───────────────────────────────────────────────── */}
        {!reportLoading && report && (
          <>
            {/* Meta info strip */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.07] border border-white/[0.10] rounded-full text-white/65">
                {report.meta.session} Session
              </span>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.07] rounded-full text-white/35">
                {report.meta.language}
              </span>
              <span className="text-[11px] text-white/25">
                {new Date(report.meta.generated_at).toLocaleString("en-US", {
                  month:    "short",
                  day:      "numeric",
                  hour:     "2-digit",
                  minute:   "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC par generate hua
              </span>
            </div>

            {/* ── All News Banner ─────────────────────────────────────────── */}
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] overflow-hidden mb-3">
              {/* Banner header bar */}
              <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                <Newspaper className="h-3.5 w-3.5 text-white/30 shrink-0" />
                <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">
                  Aaj Ki Sabse Badi Khabar
                </span>
              </div>

              {/* Headline + summary */}
              <div className="px-6 py-5">
                <h2 className="text-[18px] sm:text-[20px] font-bold text-white leading-snug mb-4">
                  {report.all_news_section.headline}
                </h2>
                <p className="text-[13px] text-white/60 leading-[1.85]">
                  {report.all_news_section.summary}
                </p>
              </div>
            </div>

            {/* ── High Impact Events ──────────────────────────────────────── */}
            {report.all_news_section.high_impact_events.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">
                    High Impact Events
                  </h2>
                  <span className="text-[10px] text-white/15">
                    {report.all_news_section.high_impact_events.length} events
                  </span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.all_news_section.high_impact_events.map((ev, i) => (
                    <EventCard key={i} event={ev} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Symbol-Wise News Grid ───────────────────────────────────── */}
            {orderedSymbols.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">
                    Symbol-Wise Breakdown
                  </h2>
                  <span className="text-[10px] text-white/15">
                    {orderedSymbols.length} instruments
                  </span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {orderedSymbols.map((sym) => (
                    <SymbolCard
                      key={sym}
                      symbol={sym}
                      news={report.symbol_wise_news[sym]}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
