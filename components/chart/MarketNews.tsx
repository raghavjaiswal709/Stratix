"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Newspaper,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  Clock,
  RefreshCw,
  AlertCircle,
  Globe,
  Landmark,
  BarChart2,
  Cpu,
  Flame,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MarketNewsProps {
  /** Controlled symbol from the chart page */
  symbol?: string;
  /** Standalone mode: shows its own symbol selector (for news-analysis page) */
  standalone?: boolean;
}

interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  sentimentScore: number;
  marketImpact: string;
  category: string;
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

// ─── Category normalisation ─────────────────────────────────────────────────

const FOREX_CATS = new Set([
  "Forex & Commodities",
  "Forex Breaking News",
  "Forex News",
]);
const MACRO_CATS = new Set([
  "Economy",
  "Economic Indicators",
  "Market News",
  "News",
]);

function normalizeCategory(cat: string): string {
  if (FOREX_CATS.has(cat)) return "Forex News";
  if (MACRO_CATS.has(cat)) return "Market News";
  return cat;
}

// ─── Category meta ──────────────────────────────────────────────────────────

const CAT_META: Record<
  string,
  { border: string; bg: string; text: string; icon: React.ReactNode }
> = {
  Geopolitical: {
    border: "border-orange-500/25",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    icon: <Globe className="h-2.5 w-2.5" />,
  },
  "Central Bank": {
    border: "border-violet-500/25",
    bg: "bg-violet-500/10",
    text: "text-violet-400",
    icon: <Landmark className="h-2.5 w-2.5" />,
  },
  "Economic Data": {
    border: "border-sky-500/25",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    icon: <BarChart2 className="h-2.5 w-2.5" />,
  },
  Crypto: {
    border: "border-yellow-500/25",
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    icon: <Cpu className="h-2.5 w-2.5" />,
  },
  Commodities: {
    border: "border-amber-500/25",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    icon: <Flame className="h-2.5 w-2.5" />,
  },
  "Forex News": {
    border: "border-blue-500/25",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    icon: <TrendingUp className="h-2.5 w-2.5" />,
  },
  "Market News": {
    border: "border-zinc-500/25",
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    icon: <Activity className="h-2.5 w-2.5" />,
  },
};

function CategoryBadge({ category }: { category: string }) {
  const norm = normalizeCategory(category);
  const meta = CAT_META[norm];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider shrink-0 ${meta.bg} ${meta.border} ${meta.text}`}
    >
      {meta.icon}
      {norm}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatPubDate(dateStr: string): string {
  try {
    const pubTime = new Date(dateStr).getTime();
    if (isNaN(pubTime)) return "Recent";
    const diffMs = Date.now() - pubTime;
    if (diffMs < 0) return "Just now";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "Recent";
  }
}

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

  // Data
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sentimentFilter, setSentimentFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "bullish" | "bearish">("newest");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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

  const fetchNews = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/news?symbol=${encodeURIComponent(activeSymbol)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NewsArticle[] = await res.json();
        setArticles(data);
        setCurrentPage(1);
        setCategoryFilter("All");
        setSentimentFilter("All");
        setSearch("");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeSymbol]
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
                  ? "All feeds · FXStreet · ForexLive · Kitco · CoinTelegraph · DailyFX · CNBC · ZeroHedge · BullionVault · CoinDesk · Decrypt · TheBlock + more"
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
          </div>
        </div>

        {/* Source chips */}
        {uniqueSources.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1">
            {uniqueSources.map((src) => (
              <span
                key={src}
                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[9px] font-medium text-white/25 uppercase tracking-wide"
              >
                {src}
              </span>
            ))}
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
                      e.target.value as "newest" | "oldest" | "bullish" | "bearish"
                    )
                  }
                  className="appearance-none pl-2.5 pr-6 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] text-white/55 focus:outline-none focus:border-white/[0.18] cursor-pointer"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23ffffff33' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 6px center",
                  }}
                >
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

      {/* ── Articles grid ─────────────────────────────────────────── */}
      {!loading && !error && paginated.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginated.map((item, idx) => {
            const sentimentClass =
              item.sentiment === "Bullish"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : item.sentiment === "Bearish"
                ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                : "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";

            const sentimentIcon =
              item.sentiment === "Bullish" ? (
                <TrendingUp className="h-3 w-3" />
              ) : item.sentiment === "Bearish" ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Activity className="h-3 w-3" />
              );

            const impactTextClass =
              item.sentiment === "Bullish"
                ? "text-emerald-400/80 font-mono"
                : item.sentiment === "Bearish"
                ? "text-rose-400/80 font-mono"
                : "text-zinc-400/80 font-mono";

            const absIdx = (currentPage - 1) * PAGE_SIZE + idx + 1;

            return (
              <div
                key={`${activeSymbol}-${item.link}-${idx}`}
                onClick={() => handleOpenArticleModal(item)}
                className="group flex flex-col justify-between rounded-xl border border-white/[0.05] bg-white/[0.01] p-4 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-white/[0.03] hover:shadow-lg hover:shadow-black/30"
              >
                <div>
                  {/* Index + Source + Time + Sentiment */}
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] text-white/15 font-mono shrink-0">
                        #{absIdx}
                      </span>
                      <span className="text-[11px] font-semibold text-white/55 truncate max-w-[90px]">
                        {item.source}
                      </span>
                      <span className="text-white/15">·</span>
                      <div className="flex items-center gap-0.5 shrink-0 text-white/30">
                        <Clock className="h-2.5 w-2.5" />
                        <span className="text-[10px]">
                          {formatPubDate(item.pubDate)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0 ${sentimentClass}`}
                    >
                      {sentimentIcon}
                      {item.sentiment}
                    </span>
                  </div>

                  {/* Category badge */}
                  {normalizeCategory(item.category) !== "Market News" && (
                    <div className="mb-2">
                      <CategoryBadge category={item.category} />
                    </div>
                  )}

                  {/* Headline */}
                  <div
                    className="group/link mb-3 flex items-start gap-1 text-sm font-medium leading-snug text-white/75 transition-colors group-hover:text-white"
                  >
                    <span className="line-clamp-3">{item.title}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>

                {/* Market Impact */}
                <div className="mt-auto rounded-lg border border-white/[0.04] bg-white/[0.01] p-2.5 text-xs">
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-white/20">
                    Est. Market Impact
                  </div>
                  <p className={`text-[10px] leading-relaxed ${impactTextClass}`}>
                    {item.marketImpact}
                  </p>
                </div>
              </div>
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
    </div>
  );
}
