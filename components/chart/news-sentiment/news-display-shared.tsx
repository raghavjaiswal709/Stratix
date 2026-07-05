// Shared presentation pieces for news cards — used by both the live grid
// (MarketNews.tsx) and the saved Filter News report viewer
// (filtered-report-view.tsx), so a saved report renders identically to the
// live feed it was generated from instead of reusing the unrelated deep
// sentiment-report dashboard.
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Globe,
  Landmark,
  BarChart2,
  Cpu,
  Flame,
  Clock,
  ArrowUpRight,
} from "lucide-react";

export interface InstrumentBreakdown {
  symbol: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  score: number;
}

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  sentimentScore: number;
  marketImpact: string;
  category: string;
  impactScore: number;
  isPrimarySource?: boolean;
  isCalendarEvent?: boolean;
  /** Per-instrument sentiment + impact score — only populated by the AI Filter News feature. */
  instrumentBreakdown?: InstrumentBreakdown[];
}

export function articleKey(a: NewsArticle): string {
  return a.link || a.title;
}

// ─── 5-tier impact color gradient (normal → extreme), per sentiment direction ──
// Convention: emerald = bullish/buy, rose = bearish/sell, zinc = neutral —
// no blue/indigo anywhere. Intensity escalates with the 0-100 score.
const BULLISH_TIERS = [
  "text-emerald-300/60 border-emerald-500/10 bg-emerald-500/[0.03]",
  "text-emerald-300/80 border-emerald-500/20 bg-emerald-500/[0.06]",
  "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  "text-emerald-400 border-emerald-500/50 bg-emerald-500/15 font-bold",
  "text-emerald-300 border-emerald-400/70 bg-emerald-500/25 font-black ring-1 ring-emerald-400/40",
];
const BEARISH_TIERS = [
  "text-rose-300/60 border-rose-500/10 bg-rose-500/[0.03]",
  "text-rose-300/80 border-rose-500/20 bg-rose-500/[0.06]",
  "text-rose-300 border-rose-500/30 bg-rose-500/10",
  "text-rose-400 border-rose-500/50 bg-rose-500/15 font-bold",
  "text-rose-300 border-rose-400/70 bg-rose-500/25 font-black ring-1 ring-rose-400/40",
];
const NEUTRAL_TIERS = [
  "text-zinc-400/60 border-zinc-500/10 bg-zinc-500/[0.03]",
  "text-zinc-400/80 border-zinc-500/20 bg-zinc-500/[0.06]",
  "text-zinc-300 border-zinc-500/30 bg-zinc-500/10",
  "text-zinc-200 border-zinc-500/50 bg-zinc-500/15 font-bold",
  "text-white border-zinc-400/70 bg-zinc-500/25 font-black ring-1 ring-zinc-400/40",
];
export const TIER_LABELS = ["Normal", "Mild", "Moderate", "High", "Extreme"];

export function impactTierIndex(score: number): number {
  if (score >= 81) return 4;
  if (score >= 61) return 3;
  if (score >= 41) return 2;
  if (score >= 21) return 1;
  return 0;
}

export function instrumentChipClasses(sentiment: "Bullish" | "Bearish" | "Neutral", score: number): string {
  const tier = impactTierIndex(score);
  if (sentiment === "Bullish") return BULLISH_TIERS[tier];
  if (sentiment === "Bearish") return BEARISH_TIERS[tier];
  return NEUTRAL_TIERS[tier];
}

// ─── Category normalisation + badge ─────────────────────────────────────────

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

export function normalizeCategory(cat: string): string {
  if (FOREX_CATS.has(cat)) return "Forex News";
  if (MACRO_CATS.has(cat)) return "Market News";
  return cat;
}

export const CAT_META: Record<
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

export function CategoryBadge({ category }: { category: string }) {
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

export function formatPubDate(dateStr: string): string {
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

// ─── Maps a saved /api/news/filter-report record's raw payload into the same
// NewsArticle[] shape the live "Filter News" grid produces, so a saved report
// can be rendered with the exact same <NewsCard>-style presentation. ────────
export interface FilterReportKeptItem {
  headline: string;
  impact: "High" | "Medium" | "Low";
  impact_score?: number;
  tier?: 1 | 2 | 3;
  tags?: string[];
  link?: string;
  affected_instruments: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral"; impact_score?: number }[];
}
export interface FilterReportRawItem {
  headline: string;
  source: string;
  pubDate: string;
  category: string;
  link?: string;
}

export function mapFilterReportToArticles(
  allNews: FilterReportRawItem[],
  analyzedNews: FilterReportKeptItem[]
): NewsArticle[] {
  const keptByHeadline = new Map(analyzedNews.map((k) => [k.headline, k]));
  return allNews
    .filter((n) => keptByHeadline.has(n.headline))
    .map((n) => {
      const kept = keptByHeadline.get(n.headline)!;
      const primary = kept.affected_instruments[0];
      const impactLabel = [
        kept.tier ? `Tier ${kept.tier}` : null,
        kept.tags && kept.tags.length ? kept.tags.join(", ") : null,
      ].filter(Boolean).join(" — ");
      return {
        title: n.headline,
        link: n.link || kept.link || "",
        pubDate: n.pubDate,
        source: n.source,
        sentiment: primary?.sentiment ?? "Neutral",
        sentimentScore: 0,
        marketImpact: impactLabel,
        category: n.category,
        impactScore: typeof kept.impact_score === "number" ? kept.impact_score : (kept.impact === "High" ? 80 : kept.impact === "Medium" ? 50 : 20),
        instrumentBreakdown: kept.affected_instruments.map((ai) => ({
          symbol: ai.symbol,
          sentiment: ai.sentiment,
          score: typeof ai.impact_score === "number" ? ai.impact_score : (kept.impact === "High" ? 70 : kept.impact === "Medium" ? 45 : 20),
        })),
      };
    });
}

// ─── Shared news card ────────────────────────────────────────────────────────
// Renders identically whether it's in the live "Filter News" grid
// (MarketNews.tsx) or a saved report viewer (filtered-report-view.tsx) — the
// only differences (selection checkbox, status-transition classes) are
// injected by the caller so this component stays a pure presentational piece.
export interface NewsCardProps {
  item: NewsArticle;
  displayIndex: number;
  onClick: () => void;
  showCheckbox?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Full override for the outer wrapper's state classes (selected/pending/kept/removing). Defaults to a plain hover style. */
  wrapperClassName?: string;
}

const DEFAULT_WRAPPER_CLASS = "opacity-100 border-white/[0.05] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.03]";

export function NewsCard({ item, displayIndex, onClick, showCheckbox, selected, onToggleSelect, wrapperClassName }: NewsCardProps) {
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

  return (
    <div
      onClick={onClick}
      className={`group flex flex-col justify-between rounded-xl border p-4 cursor-pointer transition-all duration-500 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${wrapperClassName ?? DEFAULT_WRAPPER_CLASS}`}
    >
      <div>
        {/* Index + Source + Time + Sentiment */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {showCheckbox && (
              <input
                type="checkbox"
                checked={!!selected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelect?.()}
                title="Select for Explain"
                className="h-3 w-3 shrink-0 cursor-pointer rounded border-white/30 bg-white/5 accent-emerald-500"
              />
            )}
            <span className="text-[9px] text-white/15 font-mono shrink-0">
              #{displayIndex}
            </span>
            {item.source.startsWith("DC/") ? (
              <span className="inline-flex items-center gap-1 shrink-0">
                <span className="flex items-center justify-center rounded px-1 py-0.5 text-[8px] font-black bg-white/90 text-black leading-none">DC</span>
                <span className="text-[10px] font-semibold text-white/60 truncate max-w-[80px]">
                  {item.source.replace("DC/", "")}
                </span>
              </span>
            ) : item.source.startsWith("TG/") ? (
              <span className="inline-flex items-center gap-1 shrink-0">
                <span className="flex items-center justify-center rounded px-1 py-0.5 text-[8px] font-black bg-white/90 text-black leading-none">TG</span>
                <span className="text-[10px] font-semibold text-white/60 truncate max-w-[80px]">
                  {item.source.replace("TG/", "")}
                </span>
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-white/55 truncate max-w-[90px]">
                {item.source}
              </span>
            )}
            <span className="text-white/15">·</span>
            <div className="flex items-center gap-0.5 shrink-0 text-white/30">
              <Clock className="h-2.5 w-2.5" />
              <span className="text-[10px]">
                {formatPubDate(item.pubDate)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {item.impactScore >= 60 && (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400" title="High market-moving potential">
                <Flame className="h-2.5 w-2.5" />
                {item.impactScore}
              </span>
            )}
            <span
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0 ${sentimentClass}`}
            >
              {sentimentIcon}
              {item.sentiment}
            </span>
          </div>
        </div>

        {/* Primary-source / calendar tag */}
        {(item.isPrimarySource || item.isCalendarEvent) && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.12] bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold text-white/60 uppercase tracking-wider">
              {item.isCalendarEvent ? "Economic Calendar" : "Official Source"}
            </span>
          </div>
        )}

        {/* Category badge */}
        {normalizeCategory(item.category) !== "Market News" && (
          <div className="mb-2">
            <CategoryBadge category={item.category} />
          </div>
        )}

        {/* Headline */}
        <div className="group/link mb-3 flex items-start gap-1 text-sm font-medium leading-snug text-white/75 transition-colors group-hover:text-white">
          <span className="line-clamp-3">{item.title}</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      {/* Market Impact */}
      <div className="mt-auto rounded-lg border border-white/[0.04] bg-white/[0.01] p-2.5 text-xs">
        <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-white/20">
          Est. Market Impact
        </div>
        {item.marketImpact && (
          <p className={`text-[10px] leading-relaxed ${item.instrumentBreakdown?.length ? "mb-1.5" : ""} ${impactTextClass}`}>
            {item.marketImpact}
          </p>
        )}
        {item.instrumentBreakdown && item.instrumentBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.instrumentBreakdown.map((ib) => (
              <span
                key={ib.symbol}
                title={`${TIER_LABELS[impactTierIndex(ib.score)]} impact — ${ib.score}/100`}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${instrumentChipClasses(ib.sentiment, ib.score)}`}
              >
                {ib.symbol}
                <span>{ib.sentiment === "Bullish" ? "▲" : ib.sentiment === "Bearish" ? "▼" : "—"}</span>
                <span className="font-mono opacity-80">{ib.score}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
