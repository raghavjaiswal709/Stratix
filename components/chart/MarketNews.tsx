"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Newspaper,
  Activity,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  Sparkles,
  Filter,
  Loader2,
} from "lucide-react";
import { SentimentReportsBrowser } from "./news-sentiment/sentiment-reports-browser";
import { AiFilteringOverlay } from "./news-sentiment/ai-filtering-overlay";
import { useExplainSelection, SelectionActionBar, ExplainModal } from "./news-sentiment/explain-selection";
import {
  type NewsArticle,
  articleKey,
  normalizeCategory,
  CategoryBadge,
  CAT_META,
  NewsCard,
} from "./news-sentiment/news-display-shared";

const FILTER_HOUR_OPTIONS = [1, 2, 3, 6, 12, 24, 48, 72];

function filterHourLabel(h: number): string {
  if (h < 24) return `Last ${h} Hour${h === 1 ? "" : "s"}`;
  if (h === 24) return "Last 24 Hours";
  return `Last ${h / 24} Days`;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MarketNewsProps {
  /** Controlled symbol from the chart page */
  symbol?: string;
  /** Standalone mode: shows its own symbol selector (for news-analysis page) */
  standalone?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 30;

const SYMBOLS = [
  { value: "ALL",    label: "🌐 All Instruments" },
  { value: "XAUUSD", label: "🥇 Gold (XAU/USD)" },
  { value: "XAGUSD", label: "🥈 Silver (XAG/USD)" },
  { value: "BTCUSDT",label: "₿ Bitcoin (BTC/USDT)" },
  { value: "ETHUSD", label: "Ξ Ethereum (ETH/USD)" },
  { value: "EURUSD", label: "🇪🇺 EUR/USD" },
  { value: "GBPUSD", label: "🇬🇧 GBP/USD" },
  { value: "USDJPY", label: "🇯🇵 USD/JPY" },
  { value: "USDCHF", label: "🇨🇭 USD/CHF" },
  { value: "USDCAD", label: "🇨🇦 USD/CAD" },
  { value: "AUDUSD", label: "🇦🇺 AUD/USD" },
  { value: "NZDUSD", label: "🇳🇿 NZD/USD" },
  { value: "BTCUSD", label: "₿ Bitcoin (BTC/USD)" },
];

const ASSET_NAMES: Record<string, string> = {
  ALL:    "All Instruments",
  XAUUSD: "Gold (XAU/USD)",
  XAGUSD: "Silver (XAG/USD)",
  BTCUSDT:"Bitcoin (BTC/USDT)",
  ETHUSD: "Ethereum (ETH/USD)",
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY",
  USDCHF: "USD/CHF",
  USDCAD: "USD/CAD",
  AUDUSD: "AUD/USD",
  NZDUSD: "NZD/USD",
  BTCUSD: "Bitcoin (BTC/USD)",
};

// ─── Pagination helper ──────────────────────────────────────────────────────

function buildPageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [];
  pages.push(1);
  if (current > 3) pages.push("…");
  for (
    let p = Math.max(2, current - 1);
    p <= Math.min(total - 1, current + 1);
    p++
  ) {
    pages.push(p);
  }
  if (current < total - 2) pages.push("…");
  pages.push(total);
  return pages;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function MarketNews({ symbol, standalone }: MarketNewsProps) {
  // Symbol
  const [localSymbol, setLocalSymbol] = useState("ALL");
  const activeSymbol = standalone ? localSymbol : symbol || "XAUUSD";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showSentimentReports, setShowSentimentReports] = useState(false);

  // Data
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [telegramFeedError, setTelegramFeedError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sentimentFilter, setSentimentFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"impact" | "newest" | "oldest" | "bullish" | "bearish">("newest");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // AI "Filter News" — pushes the raw window through AI, removes irrelevant
  // items in place, tags the rest with per-instrument sentiment. Purely a
  // client-side transformation of `articles`; a page refresh always refetches
  // the normal live feed since none of this is persisted to localStorage.
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [aiFiltering, setAiFiltering] = useState(false);
  const [aiFilterError, setAiFilterError] = useState<string | null>(null);
  const [aiFilterActive, setAiFilterActive] = useState(false);
  const [aiFilterMeta, setAiFilterMeta] = useState<{ timeRangeLabel: string; allNewsCount: number; keptNewsCount: number } | null>(null);
  const [cardStatus, setCardStatus] = useState<Record<string, "pending" | "kept" | "removing">>({});

  // Multi-select on AI-filtered cards + "Explain" (beginner Hinglish, no
  // external search — grounded only in the selected headlines) modal state.
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

  // Scraped modal states
  const [selectedArticleForModal, setSelectedArticleForModal] = useState<NewsArticle | null>(null);
  const [modalContent, setModalContent] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const handleOpenArticleModal = useCallback(async (article: NewsArticle) => {
    setSelectedArticleForModal(article);
    setModalLoading(true);
    setModalContent(null);
    setModalError(null);

    // Telegram messages ARE the full article — title already carries the
    // entire message (see lib/news/telegram.ts). There's no separate page to
    // scrape (t.me isn't a paragraph-based article page), so the generic
    // <p>-tag scraper below always failed with "Could not automatically
    // extract full paragraphs" for these. Show the message text directly.
    if (article.source.startsWith("TG/")) {
      setModalContent(article.title);
      setModalLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/news/content?url=${encodeURIComponent(article.link)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setModalContent(json.content || "No content extracted.");
    } catch (err: any) {
      setModalError(err.message || "Failed to load content");
    } finally {
      setModalLoading(false);
    }
  }, []);

  const handleFilterNews = useCallback(async (hours: number) => {
    setFilterDropdownOpen(false);
    setAiFiltering(true);
    setAiFilterError(null);
    clearSelection();
    try {
      const res = await fetch("/api/news/filter-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to filter news");

      type Kept = {
        headline: string;
        impact: "High" | "Medium" | "Low";
        impact_score?: number;
        tier?: 1 | 2 | 3;
        tags?: string[];
        link?: string;
        affected_instruments: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral"; impact_score?: number }[];
      };
      type Raw = { headline: string; source: string; pubDate: string; category: string; link?: string };
      const allNews: Raw[] = json.data.allNews ?? [];
      const keptList: Kept[] = json.data.analyzed_news ?? [];
      const keptByHeadline = new Map(keptList.map((k) => [k.headline, k]));

      const mapped: NewsArticle[] = allNews.map((n) => {
        const kept = keptByHeadline.get(n.headline);
        const primary = kept?.affected_instruments[0];
        const impactLabel = kept ? [
          kept.tier ? `Tier ${kept.tier}` : null,
          kept.tags && kept.tags.length ? kept.tags.join(", ") : null,
        ].filter(Boolean).join(" — ") : "";
        return {
          title: n.headline,
          link: n.link || kept?.link || "",
          pubDate: n.pubDate,
          source: n.source,
          sentiment: primary?.sentiment ?? "Neutral",
          sentimentScore: 0,
          marketImpact: impactLabel,
          category: n.category,
          impactScore: kept ? (typeof kept.impact_score === "number" ? kept.impact_score : (kept.impact === "High" ? 80 : kept.impact === "Medium" ? 50 : 20)) : 0,
          instrumentBreakdown: kept
            ? kept.affected_instruments.map((ai) => ({
                symbol: ai.symbol,
                sentiment: ai.sentiment,
                score: typeof ai.impact_score === "number" ? ai.impact_score : (kept.impact === "High" ? 70 : kept.impact === "Medium" ? 45 : 20),
              }))
            : undefined,
        };
      });

      const keyOf = (a: NewsArticle) => a.link || a.title;
      const keptKeys = new Set(mapped.filter((a) => keptByHeadline.has(a.title)).map(keyOf));

      setArticles(mapped);
      setCategoryFilter("All");
      setSentimentFilter("All");
      setSearch("");
      setCurrentPage(1);
      setAiFilterActive(true);
      setAiFilterMeta({ timeRangeLabel: json.timeRangeLabel, allNewsCount: json.allNewsCount, keptNewsCount: json.keptNewsCount });

      const initialStatus: Record<string, "pending"> = {};
      mapped.forEach((a) => { initialStatus[keyOf(a)] = "pending"; });
      setCardStatus(initialStatus);

      const stagger = Math.min(45, Math.max(8, 4500 / Math.max(1, mapped.length)));
      mapped.forEach((a, i) => {
        const key = keyOf(a);
        setTimeout(() => {
          setCardStatus((prev) => ({ ...prev, [key]: keptKeys.has(key) ? "kept" : "removing" }));
        }, 300 + i * stagger);
      });
      setTimeout(() => {
        setArticles((prev) => prev.filter((a) => keptKeys.has(keyOf(a))));
        setCardStatus({});
      }, 300 + mapped.length * stagger + 500);
    } catch (err) {
      setAiFilterError((err as Error).message);
    } finally {
      setAiFiltering(false);
    }
  }, [clearSelection]);

  const fetchNews = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setTelegramFeedError(null);
      try {
        const res = await fetch(
          `/api/news?symbol=${encodeURIComponent(activeSymbol)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rawTgError = res.headers.get("x-telegram-error");
        setTelegramFeedError(rawTgError ? decodeURIComponent(rawTgError) : null);
        const data: NewsArticle[] = await res.json();
        setArticles(data);
        setCurrentPage(1);
        setCategoryFilter("All");
        setSentimentFilter("All");
        setSearch("");
        clearSelection();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeSymbol, clearSelection]
  );

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, sentimentFilter, sortBy, search]);

  // Derived: unique normalized categories in current batch
  const availableCategories = useMemo(() => {
    const cats = new Set(articles.map((a) => normalizeCategory(a.category)));
    return ["All", ...Array.from(cats).sort()];
  }, [articles]);

  // Derived: unique sources
  const uniqueSources = useMemo(
    () => Array.from(new Set(articles.map((a) => a.source))).slice(0, 8),
    [articles]
  );

  // Filter → sort → paginate
  const filtered = useMemo(
    () =>
      articles
        .filter(
          (a) =>
            categoryFilter === "All" ||
            normalizeCategory(a.category) === categoryFilter
        )
        .filter(
          (a) => sentimentFilter === "All" || a.sentiment === sentimentFilter
        )
        .filter(
          (a) =>
            !search ||
            a.title.toLowerCase().includes(search.toLowerCase()) ||
            a.source.toLowerCase().includes(search.toLowerCase())
        ),
    [articles, categoryFilter, sentimentFilter, search]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "impact")
        return (b.impactScore ?? 0) - (a.impactScore ?? 0);
      if (sortBy === "oldest")
        return (
          new Date(a.pubDate || 0).getTime() -
          new Date(b.pubDate || 0).getTime()
        );
      if (sortBy === "bullish")
        return (
          (b.sentiment === "Bullish" ? 1 : 0) -
          (a.sentiment === "Bullish" ? 1 : 0)
        );
      if (sortBy === "bearish")
        return (
          (b.sentiment === "Bearish" ? 1 : 0) -
          (a.sentiment === "Bearish" ? 1 : 0)
        );
      // newest (default)
      return (
        new Date(b.pubDate || 0).getTime() -
        new Date(a.pubDate || 0).getTime()
      );
    });
  }, [filtered, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const pageRange = buildPageRange(currentPage, totalPages);

  const startItem = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, sorted.length);

  return (
    <div className="w-full border-t border-white/[0.06] bg-[#0b0b0b] px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="rounded-lg bg-white/[0.04] p-2 border border-white/[0.08] shrink-0">
              <Newspaper className="h-4 w-4 text-white/60" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white/90 leading-none mb-1">
                Market Intelligence &amp; News Feed
              </h2>
              <p className="text-xs text-white/35 leading-none">
                {activeSymbol === "ALL"
                  ? "57 RSS + Breaking Alerts + Fed/ECB/BOE/BOJ + Economic Calendar · Bloomberg · Reuters · WSJ · FXStreet · ForexLive · Kitco · CoinDesk · Dukascopy + more"
                  : <>Multi-source live coverage for{" "}
                      <span className="text-white/55 font-medium">
                        {ASSET_NAMES[activeSymbol] || activeSymbol}
                      </span>{" "}
                      — geopolitical, macro, central bank &amp; commodities</>
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!loading && articles.length > 0 && (
              <button
                onClick={() => setFiltersOpen(v => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${filtersOpen ? "bg-white/[0.07] border-white/[0.14] text-white/70" : "border-white/[0.08] bg-white/[0.03] text-white/45 hover:bg-white/[0.06] hover:text-white/70"}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {(categoryFilter !== "All" || sentimentFilter !== "All" || search) && (
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
                <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
              </button>
            )}
            <button
              onClick={() => fetchNews(true)}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/50 transition hover:bg-white/[0.06] hover:text-white/80 disabled:opacity-40"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            {/* Filter News — standalone (news-analysis page) only. Pushes the raw
                window through AI in place: irrelevant items fade out of this same
                grid, kept ones get a sentiment tag. Never persisted — a page
                refresh always shows the normal live feed again. */}
            {standalone && !loading && articles.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setFilterDropdownOpen((v) => !v)}
                  disabled={aiFiltering}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/[0.14] disabled:opacity-50"
                >
                  {aiFiltering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Filter className="h-3.5 w-3.5" />}
                  {aiFiltering ? "Filtering…" : "Filter News"}
                  {!aiFiltering && <ChevronDown className={`h-3 w-3 transition-transform ${filterDropdownOpen ? "rotate-180" : ""}`} />}
                </button>
                {filterDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setFilterDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-20 w-44 rounded-lg border border-white/[0.10] bg-[#161616] shadow-xl py-1.5">
                      {FILTER_HOUR_OPTIONS.map((h) => (
                        <button
                          key={h}
                          onClick={() => handleFilterNews(h)}
                          className="w-full text-left px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white transition"
                        >
                          {filterHourLabel(h)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* On the standalone News Analysis page, the "AI News Analysis" button in
                the page header already triggers this same feature — avoid a confusing
                second entry point. Keep it here for non-standalone embeds (e.g. /chart). */}
            {!standalone && (
              <button
                onClick={() => setShowSentimentReports(true)}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-gradient-to-r from-white/[0.07] to-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:from-white/[0.12] hover:to-white/[0.08] hover:text-white"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Analyse News
              </button>
            )}
          </div>
        </div>

        {/* AI Filter News — status / error banners */}
        {aiFilterActive && aiFilterMeta && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
            <Filter className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <p className="text-[11px] text-emerald-300">
              AI-filtered · {aiFilterMeta.timeRangeLabel} · {aiFilterMeta.keptNewsCount}/{aiFilterMeta.allNewsCount} kept for forex/gold/crypto
            </p>
            <button
              onClick={() => { setAiFilterActive(false); setAiFilterMeta(null); setAiFilterError(null); fetchNews(true); }}
              className="ml-auto text-[11px] font-semibold text-emerald-300 underline underline-offset-2 hover:text-white transition shrink-0"
            >
              Show live feed
            </button>
          </div>
        )}
        {aiFilterError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400 mt-0.5" />
            <p className="text-[11px] leading-snug text-rose-300">{aiFilterError}</p>
          </div>
        )}

        {/* Source diagnostic banner — generic wording, never names a specific vendor */}
        {telegramFeedError && !loading && activeSymbol === "ALL" && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" />
            <p className="text-[11px] leading-snug text-amber-200/80">
              <span className="font-semibold text-amber-300">Some sources didn&apos;t load this refresh</span>{" "}
              — showing results from all other sources. Try refreshing in a minute.
            </p>
          </div>
        )}

        {/* Source chips */}
        {uniqueSources.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1">
            {uniqueSources.map((src) =>
              src.startsWith("DC/") ? (
                <span
                  key={src}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold text-white/70 uppercase tracking-wide"
                >
                  <span className="text-[7px] font-black bg-white text-black rounded px-1">DC</span>
                  {src.replace("DC/", "")}
                </span>
              ) : src.startsWith("TG/") ? (
                <span
                  key={src}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold text-white/70 uppercase tracking-wide"
                >
                  <span className="text-[7px] font-black bg-white text-black rounded px-1">TG</span>
                  {src.replace("TG/", "")}
                </span>
              ) : (
                <span
                  key={src}
                  className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[9px] font-medium text-white/25 uppercase tracking-wide"
                >
                  {src}
                </span>
              )
            )}
          </div>
        )}
      </div>

      {/* ── Collapsible filter panel ────────────────────────────────── */}
      {filtersOpen && (
      <div className="mb-5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 space-y-3">

      {/* ── Symbol selector (standalone mode only) ────────────────── */}
      {standalone && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest shrink-0 w-20">
            Instrument
          </span>
          <div className="relative">
            <select
              value={localSymbol}
              onChange={(e) => setLocalSymbol(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-medium bg-white/[0.04] border border-white/[0.10] text-white/70 focus:outline-none focus:border-white/[0.22] cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              {SYMBOLS.map((s) => (
                <option key={s.value} value={s.value} className="bg-[#1a1a1a]">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Filter + sort bar ─────────────────────────────────────── */}
      {!loading && articles.length > 0 && (
        <div className="space-y-3">
          {/* Category filter chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className="h-3 w-3 text-white/25 shrink-0" />
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">
              Category
            </span>
            <div className="flex flex-wrap gap-1">
              {availableCategories.map((cat) => {
                const isActive = categoryFilter === cat;
                const meta = cat !== "All" ? CAT_META[cat] : null;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-all ${
                      isActive
                        ? meta
                          ? `${meta.bg} ${meta.border} ${meta.text}`
                          : "bg-white/[0.12] border-white/[0.20] text-white"
                        : "border-white/[0.06] bg-white/[0.02] text-white/30 hover:text-white/60 hover:border-white/[0.12]"
                    }`}
                  >
                    {cat !== "All" && meta && (
                      <span className="opacity-70">{meta.icon}</span>
                    )}
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sentiment + Sort + Search row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sentiment */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">
                Signal
              </span>
              {(["All", "Bullish", "Bearish", "Neutral"] as const).map((s) => {
                const isActive = sentimentFilter === s;
                const cls =
                  s === "Bullish"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                    : s === "Bearish"
                    ? "border-rose-500/25 bg-rose-500/10 text-rose-400"
                    : s === "Neutral"
                    ? "border-zinc-500/25 bg-zinc-500/10 text-zinc-400"
                    : "border-white/[0.12] bg-white/[0.08] text-white";
                return (
                  <button
                    key={s}
                    onClick={() => setSentimentFilter(s)}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-all ${
                      isActive
                        ? cls
                        : "border-white/[0.06] bg-transparent text-white/30 hover:text-white/55 hover:border-white/[0.12]"
                    }`}
                  >
                    {s === "Bullish" ? "▲ " : s === "Bearish" ? "▼ " : s === "Neutral" ? "— " : ""}
                    {s}
                  </button>
                );
              })}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">
                Sort
              </span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as "impact" | "newest" | "oldest" | "bullish" | "bearish"
                    )
                  }
                  className="appearance-none pl-2.5 pr-6 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/55 focus:outline-none focus:border-white/[0.18] cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23ffffff33' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 6px center",
                  }}
                >
                  <option value="impact" className="bg-[#1a1a1a]">
                    Highest Impact
                  </option>
                  <option value="newest" className="bg-[#1a1a1a]">
                    Newest First
                  </option>
                  <option value="oldest" className="bg-[#1a1a1a]">
                    Oldest First
                  </option>
                  <option value="bullish" className="bg-[#1a1a1a]">
                    Bullish First
                  </option>
                  <option value="bearish" className="bg-[#1a1a1a]">
                    Bearish First
                  </option>
                </select>
              </div>
            </div>

            {/* Search */}
            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/25 pointer-events-none" />
              <input
                type="text"
                placeholder="Search headlines…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7 pr-3 py-1 rounded-lg text-[11px] bg-white/[0.03] border border-white/[0.07] text-white/60 placeholder:text-white/20 focus:outline-none focus:border-white/[0.18] w-44 sm:w-56 transition"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition"
                >
                  ×
                </button>
              )}
            </div>
          </div>

        </div>
      )}
      </div>
      )}

      {/* Article count shown outside filter panel */}
      {!loading && articles.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-[10px] text-white/25">
          <span>
            {sorted.length === 0
              ? "No articles match filters"
              : `Showing ${startItem}–${endItem} of ${sorted.length} articles`}
          </span>
          {articles.length !== sorted.length && (
            <span className="text-white/15">({articles.length} fetched)</span>
          )}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────── */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-52 w-full animate-pulse rounded-xl border border-white/[0.04] bg-white/[0.01]"
            />
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-rose-500/10 bg-rose-500/[0.02] py-12 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500/40" />
          <p className="text-sm font-semibold text-white/70">
            Couldn&apos;t load market intelligence
          </p>
          <p className="text-xs text-white/25">{error}</p>
          <button
            onClick={() => fetchNews()}
            className="mt-2 rounded-lg bg-white/[0.08] px-4 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/[0.12] hover:text-white"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── No articles ───────────────────────────────────────────── */}
      {!loading && !error && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.01] py-12 text-center">
          <Activity className="h-7 w-7 text-white/20" />
          <p className="text-sm font-semibold text-white/60 font-mono">
            No recent intelligence found
          </p>
          <p className="text-xs text-white/25">
            Check back later as market conditions evolve.
          </p>
        </div>
      )}

      {/* ── No results after filter ───────────────────────────────── */}
      {!loading && !error && articles.length > 0 && sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.01] py-12 text-center">
          <Search className="h-6 w-6 text-white/20" />
          <p className="text-sm font-medium text-white/50">
            No articles match your filters
          </p>
          <button
            onClick={() => {
              setCategoryFilter("All");
              setSentimentFilter("All");
              setSearch("");
            }}
            className="mt-1 text-xs text-white/30 underline underline-offset-2 hover:text-white/60 transition"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* ── AI Filter News — high-intensity working animation ───────── */}
      {aiFiltering && <AiFilteringOverlay articleCount={articles.length} />}

      {/* ── Articles grid ─────────────────────────────────────────── */}
      {!aiFiltering && !loading && !error && paginated.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.map((item, idx) => {
            const absIdx = (currentPage - 1) * PAGE_SIZE + idx + 1;
            const status = cardStatus[item.link || item.title];
            const key = articleKey(item);
            const isSelected = selectedKeys.has(key);

            const wrapperClassName = isSelected
              ? "opacity-100 border-white/25 bg-white/[0.05] ring-2 ring-white/40"
              : status === "removing"
              ? "opacity-0 scale-90 pointer-events-none border-white/[0.05] bg-white/[0.01]"
              : status === "pending"
              ? "opacity-40 border-white/[0.05] bg-white/[0.01]"
              : status === "kept"
              ? "opacity-100 border-emerald-500/30 bg-emerald-500/[0.03] ring-1 ring-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/[0.05]"
              : undefined;

            return (
              <NewsCard
                key={`${activeSymbol}-${item.link}-${idx}`}
                item={item}
                displayIndex={absIdx}
                onClick={() => handleOpenArticleModal(item)}
                showCheckbox={aiFilterActive}
                selected={isSelected}
                onToggleSelect={() => toggleSelected(key)}
                wrapperClassName={wrapperClassName}
              />
            );
          })}
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────── */}
      {!loading && !error && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-1.5">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/40 transition hover:bg-white/[0.07] hover:text-white/70 disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {pageRange.map((p, i) =>
            p === "…" ? (
              <span
                key={`ellipsis-${i}`}
                className="flex h-8 w-8 items-center justify-center text-[11px] text-white/20"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => setCurrentPage(p as number)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-[11px] font-semibold transition ${
                  currentPage === p
                    ? "border-white/[0.20] bg-white/[0.12] text-white"
                    : "border-white/[0.06] bg-white/[0.02] text-white/35 hover:bg-white/[0.07] hover:text-white/70"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/40 transition hover:bg-white/[0.07] hover:text-white/70 disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <span className="ml-2 text-[10px] text-white/20">
            Page {currentPage} of {totalPages} · {sorted.length} articles
          </span>
        </div>
      )}

      {/* ── Scraped Article Modal ── */}
      {selectedArticleForModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          onClick={() => setSelectedArticleForModal(null)}
        >
          <div 
            className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-white/[0.10] bg-[#0c0c0c] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                    {selectedArticleForModal.source}
                  </span>
                  <span className="text-white/10">·</span>
                  <span className="text-[10px] text-white/30">
                    {new Date(selectedArticleForModal.pubDate).toLocaleString()}
                  </span>
                  <span className="text-white/10">·</span>
                  <CategoryBadge category={selectedArticleForModal.category} />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-white leading-snug">
                  {selectedArticleForModal.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedArticleForModal(null)}
                className="rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/[0.05] transition shrink-0"
              >
                <span className="text-xl font-medium leading-none">&times;</span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 text-sm text-white/70 leading-relaxed font-normal space-y-4">
              {modalLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <RefreshCw className="h-6 w-6 text-white/30 animate-spin" />
                  <p className="text-xs text-white/30">Fetching full article content...</p>
                </div>
              ) : modalError ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <AlertCircle className="h-7 w-7 text-rose-500/40" />
                  <p className="text-sm font-semibold text-white/60">Could not retrieve content</p>
                  <p className="text-xs text-white/30 max-w-md">{modalError}</p>
                  <a
                    href={selectedArticleForModal.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 text-xs text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    Read original article <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <div className="whitespace-pre-wrap select-text">
                  {modalContent}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/[0.06] bg-white/[0.01] flex items-center justify-between">
              <a
                href={selectedArticleForModal.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/45 hover:text-white transition inline-flex items-center gap-1 hover:underline"
              >
                Read original source <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={() => setSelectedArticleForModal(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.08] text-white hover:bg-white/[0.12] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating selection bar + Explain modal — beginner Hinglish, no search ── */}
      {aiFilterActive && (
        <SelectionActionBar
          count={selectedKeys.size}
          onClear={clearSelection}
          onExplain={() => explainSelected(articles)}
        />
      )}
      <ExplainModal
        open={explainOpen}
        loading={explainLoading}
        error={explainError}
        text={explainText}
        onClose={() => setExplainOpen(false)}
      />

      {showSentimentReports && (
        <SentimentReportsBrowser onClose={() => setShowSentimentReports(false)} />
      )}
    </div>
  );
}
