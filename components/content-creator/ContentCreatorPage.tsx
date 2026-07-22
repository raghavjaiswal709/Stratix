"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { cn } from "@/lib/utils";
import { renderTemplate } from "@/lib/prompts/template";
import { CALENDAR_PLAN } from "@/lib/content-creator/calendar-plan";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  Download,
  Code2,
  RefreshCw,
  X,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  ImagePlus,
  Layers2,
  Palette,
  Sliders,
  Edit3,
  Plus,
  Trash2,
  Bot,
  Sparkles,
  Loader2,
  ChevronDown,
  Upload,
  History,
  Save,
  Newspaper,
  LineChart,
  CheckSquare,
  Square,
  ListChecks,
  Move,
  ZoomIn,
  Lightbulb,
  BookOpen,
  Calendar,
  ClipboardCopy,
  Eye,
  Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Metric  { label: string; value: string; }
interface Section { label: string; content: string; }

interface PosterData {
  category?: string;
  title?: string;
  subtitle?: string;
  index?: string;
  description?: string;
  sections?: Section[];
  metrics?: Metric[];
  formula?: string;
  tags?: string[];
  imageUrl?: string;
  footer?: string;
  date?: string;
}

interface AnalysisData {
  category?: string;
  instrument: string;
  levelName: string;
  timeframe: string;
  session?: string;
  description: string;
  whatToDo?: string;
  keyLevels?: string;
  imageUrl?: string;
  layout?: "standard" | "split" | "banner";
  footer?: string;
  date?: string;
}

interface NewsItem {
  title: string;
  description: string;
  imageUrl?: string;
  source?: string;
  date?: string;
  impact?: "High" | "Medium" | "Low";
  sentiment?: "Bullish" | "Bearish" | "Neutral";
  affectedAssets?: string;
  keyTakeaway?: string;
  /** Ready-to-paste Grok Imagine prompt for this poster's background image. */
  imagePrompt?: string;
  /** Exact substring of `title` the poster highlights with a colored chip. */
  highlightPhrase?: string;
  /** Exact substrings of `description` to bold+color-highlight — the trader-relevant numbers/entities. */
  descriptionHighlights?: string[];
  /** Per-instrument direction for this story — rendered as colored chips (e.g. "▲ XAUUSD" in emerald). */
  instrumentImpacts?: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral" }[];
  /** Horizontal focal point within the cover-fit image, 0 (left) - 1 (right), default 0.5 (centered). */
  imageFocusX?: number;
  /** Vertical focal point within the cover-fit image, 0 (top) - 1 (bottom), default 0.5 (centered). */
  imageFocusY?: number;
  /** Zoom multiplier on top of the cover-fit baseline, 1 (no zoom) - 2.5, default 1. */
  imageZoom?: number;
  /** Which of the 5 market-driver categories this story belongs to (Macro/Geopolitical/Corporate/Sentiment/Systemic) — used by the poster selection UI, not rendered on the poster itself. */
  category?: "Macro" | "Geopolitical" | "Corporate" | "Sentiment" | "Systemic";
  /** True only for the batch's slide #1 — the "last 24h" briefing cover. */
  isCover?: boolean;
  topAssets?: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral" }[];
  bulletHeadlines?: string[];
  /** True only for the batch's final slide — the calm brand sign-off. */
  isOutro?: boolean;
  /** Outro-only: the single rotating action phrase (e.g. "Follow for daily market briefings"). */
  cta?: string;
  /** Facts cards only: internal-use verification note, not rendered on the poster. */
  sourceNote?: string;
  /** Learnings batches only: the single concept the whole batch teaches, e.g. "Fair Value Gap (FVG)". */
  concept?: string;
  /** Learnings batches only: progress label for a slide, e.g. "Step 2 of 6". */
  stepLabel?: string;
  /** True only for a synthesized "explain it simply" companion card, inserted right after its parent story. */
  isBento?: boolean;
  /** Bento card: the story's headline in the title of the story this card explains (for continuity/context). */
  relatedTitle?: string;
  /** Bento card: kid-simple headline. */
  simpleHeadline?: string;
  /** Bento card: exact substring of simpleHeadline to highlight. */
  simpleHeadlineHighlight?: string;
  /** Bento card: plain-language "what happened". */
  whatHappened?: string;
  /** Bento card: plain-language "why it matters". */
  whyItMatters?: string;
  /** Bento card: plain-language per-market effect chips. */
  simpleImpacts?: { market: string; effect: string; direction: "up" | "down" | "neutral" }[];
  /** Instagram-ready caption for this story (or, on the cover, the whole carousel) — distinct voice from the on-poster "description". Not rendered on the poster itself. */
  caption?: string;
  /** 25+ hashtags: a fixed brand set plus deeply-researched, trending/relevant tags for this story. Not rendered on the poster itself. */
  hashtags?: string[];
}

interface AspectRatio { id: string; label: string; w: number; h: number; desc: string; }

type CreatorMode = "analysis" | "news" | "indicator" | "facts" | "learnings";

interface HistoryListItem {
  _id: string;
  category: "news-batch" | "daily-analysis" | "indicator" | "facts-batch" | "learnings-batch";
  title: string;
  itemCount: number;
  createdAt: string;
}

interface PosterColors {
  bg: string;
  accent: string;
  text: string;
  muted: string;
  card: string;
  subtle: string;
}

interface PosterConfig {
  showGrid: boolean;
  gridSize: number;
  gridOpacity: number;
  showBorder: boolean;
  borderWidth: number;
  showCrosses: boolean;
  crossSize: number;
  fontScale: number;
}

interface PosterElement {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RATIOS: AspectRatio[] = [
  { id: "square",    label: "1:1",  w: 800,  h: 800,  desc: "Post"     },
  { id: "portrait",  label: "4:5",  w: 800,  h: 1000, desc: "Portrait" },
  { id: "story",     label: "9:16", w: 800,  h: 1422, desc: "Story"    },
  { id: "landscape", label: "16:9", w: 1600, h: 900,  desc: "Banner"   },
  { id: "a4",        label: "A4",   w: 794,  h: 1123, desc: "Print"    },
];

const COLOR_PRESETS: (PosterColors & { name: string })[] = [
  {
    name: "Chase Terracotta (Dark)",
    bg: "#bd533c",
    accent: "#111111",
    text: "#FFFFFF",
    muted: "#f5e6e1",
    card: "#FFFFFF",
    subtle: "#a84933",
  },
  {
    name: "Stratix Amber (Light)",
    bg: "#FAF9F6",
    accent: "#C1683A",
    text: "#111211",
    muted: "#5A5B5A",
    card: "#FDF2EC",
    subtle: "#EAEAEA",
  },
  {
    name: "Royal Sapphire (Light)",
    bg: "#F4F7FB",
    accent: "#1E40AF",
    text: "#0F172A",
    muted: "#475569",
    card: "#EFF6FF",
    subtle: "#E2E8F0",
  },
  {
    name: "Emerald Mint (Light)",
    bg: "#F3FDF7",
    accent: "#065F46",
    text: "#064E3B",
    muted: "#374151",
    card: "#ECFDF5",
    subtle: "#D1FAE5",
  },
  {
    name: "Vivid Orchid (Light)",
    bg: "#FAF5FF",
    accent: "#6B21A8",
    text: "#1E1B4B",
    muted: "#4B5563",
    card: "#F5F3FF",
    subtle: "#F3E8FF",
  },
  {
    name: "Warm Terracotta (Light)",
    bg: "#FDF8F5",
    accent: "#C2410C",
    text: "#431407",
    muted: "#6B7280",
    card: "#FFF1F2",
    subtle: "#FFEDD5",
  },
  {
    name: "Nord Light",
    bg: "#E5E9F0",
    accent: "#5E81AC",
    text: "#2E3440",
    muted: "#4C566A",
    card: "#ECEFF4",
    subtle: "#D8DEE9",
  },
  {
    name: "Slate Minimalist (Light)",
    bg: "#F8FAFC",
    accent: "#0F172A",
    text: "#0F172A",
    muted: "#64748B",
    card: "#F1F5F9",
    subtle: "#E2E8F0",
  },
  {
    name: "Crimson Rose",
    bg: "#FFF5F7",
    accent: "#BE123C",
    text: "#4C0519",
    muted: "#9F1239",
    card: "#FFF1F2",
    subtle: "#FCE7F3",
  },
  {
    name: "Teal Breeze",
    bg: "#F0FDFA",
    accent: "#0F766E",
    text: "#115E59",
    muted: "#134E4A",
    card: "#E6FFFA",
    subtle: "#CCFBF1",
  },
  {
    name: "Sunset Gold",
    bg: "#FEFCE8",
    accent: "#B45309",
    text: "#78350F",
    muted: "#92400E",
    card: "#FEF9C3",
    subtle: "#FEF08A",
  },
  {
    name: "Indigo Velvet",
    bg: "#EEF2FF",
    accent: "#4338CA",
    text: "#312E81",
    muted: "#3730A3",
    card: "#E0E7FF",
    subtle: "#C7D2FE",
  },
  {
    name: "Forest Fern",
    bg: "#F0FDF4",
    accent: "#15803D",
    text: "#14532D",
    muted: "#166534",
    card: "#DCFCE7",
    subtle: "#BBF7D0",
  },
  {
    name: "Bright Fuchsia",
    bg: "#FDF4FF",
    accent: "#BE185D",
    text: "#701A75",
    muted: "#86198F",
    card: "#FAE8FF",
    subtle: "#F5D0FE",
  },
  {
    name: "Neon Lime",
    bg: "#F7FEE7",
    accent: "#4D7C0F",
    text: "#1A2E05",
    muted: "#3F6212",
    card: "#ECFCCB",
    subtle: "#D9F99D",
  },
  {
    name: "Copper Rust",
    bg: "#FAFAF9",
    accent: "#854D0E",
    text: "#451A03",
    muted: "#A8A29E",
    card: "#F5EBE6",
    subtle: "#F5F5F4",
  },
  {
    name: "Electric Blue",
    bg: "#ECFEFF",
    accent: "#0891B2",
    text: "#164E63",
    muted: "#0E7490",
    card: "#CFFAFE",
    subtle: "#A5F3FC",
  },
  {
    name: "Coffee Latte",
    bg: "#FAF7F5",
    accent: "#78350F",
    text: "#451A03",
    muted: "#8B5A2B",
    card: "#F5EBE6",
    subtle: "#EEDCD3",
  },
  {
    name: "Ocean Coral",
    bg: "#FFF5F5",
    accent: "#E11D48",
    text: "#881337",
    muted: "#BE123C",
    card: "#FFE4E6",
    subtle: "#FECDD3",
  },
  {
    name: "Steel Blue",
    bg: "#F1F5F9",
    accent: "#334155",
    text: "#0F172A",
    muted: "#475569",
    card: "#E2E8F0",
    subtle: "#CBD5E1",
  },
  {
    name: "Charcoal Slate",
    bg: "#F8FAFC",
    accent: "#1E293B",
    text: "#0F172A",
    muted: "#475569",
    card: "#F1F5F9",
    subtle: "#E2E8F0",
  },
  {
    name: "Canary Yellow",
    bg: "#FFFBEB",
    accent: "#D97706",
    text: "#78350F",
    muted: "#B45309",
    card: "#FEF3C7",
    subtle: "#FDE68A",
  },
  {
    name: "Vibrant Orange",
    bg: "#FFF7ED",
    accent: "#EA580C",
    text: "#7C2D12",
    muted: "#C2410C",
    card: "#FFEDD5",
    subtle: "#FED7AA",
  },
  {
    name: "Plum Wine",
    bg: "#FDF4FF",
    accent: "#86198F",
    text: "#4A044E",
    muted: "#701A75",
    card: "#F5D0FE",
    subtle: "#F0ABFC",
  },
  {
    name: "Sage Olive",
    bg: "#F4FBF7",
    accent: "#4B6B58",
    text: "#2D3F34",
    muted: "#3B5244",
    card: "#E8F4EC",
    subtle: "#D4E8DC",
  },
  {
    name: "Sky Cyan",
    bg: "#F0F9FF",
    accent: "#0284C7",
    text: "#0C4A6E",
    muted: "#0369A1",
    card: "#E0F2FE",
    subtle: "#BAE6FD",
  },
  {
    name: "Desert Clay",
    bg: "#FAF6F0",
    accent: "#C2410C",
    text: "#431407",
    muted: "#9A3412",
    card: "#FBEBE0",
    subtle: "#F7D7C4",
  },
  {
    name: "Midnight Slate (Light)",
    bg: "#F8F9FA",
    accent: "#1A1E29",
    text: "#0D0E15",
    muted: "#3B4254",
    card: "#EDEFF2",
    subtle: "#DCDFE4",
  },
  {
    name: "Pistachio Green",
    bg: "#F5FCF6",
    accent: "#3F8C56",
    text: "#1E4D2B",
    muted: "#2D6A4F",
    card: "#E3F5E7",
    subtle: "#C7ECD1",
  },
  {
    name: "Cobalt Royal",
    bg: "#F3F4FE",
    accent: "#2563EB",
    text: "#1E3A8A",
    muted: "#1D4ED8",
    card: "#E0E7FF",
    subtle: "#C7D2FE",
  },
  {
    name: "Saffron Spice",
    bg: "#FFFDF5",
    accent: "#D97706",
    text: "#78350F",
    muted: "#B45309",
    card: "#FFF8E1",
    subtle: "#FFE082",
  },
];

// ─── Gradient presets — "Bold & Trending" poster style ─────────────────────
// Full-bleed moody two-stop gradients for the alternate News/Facts/Learnings
// look (dark background, huge condensed headline). `accent` drives the pill
// badge text and the headline's highlighted phrase for that gradient.
// `isLight` flips all foreground text/pill colors to dark (for light-toned
// gradients like Pure White) — see the `fg`/`pillBg`/`pillFg` derivation in
// drawBoldPoster/drawOutroCard. `pillAccent` overrides the eyebrow/logo pill
// TEXT color specifically, for the two monochrome presets where the plain
// `accent` (used for headline highlights) wouldn't contrast against the pill.
interface GradientPreset { id: string; name: string; stops: [string, string]; accent: string; isLight?: boolean; pillAccent?: string; monochrome?: boolean; }

const GRADIENT_PRESETS: GradientPreset[] = [
  // "Electric Blue" is the default — tuned to the Coingrams reference: a rich
  // royal-blue rising out of near-black, with a bright electric-blue accent
  // glow behind the headline (the glow is painted in drawBoldPoster).
  { id: "electric-blue", name: "Electric Blue", stops: ["#1746c8", "#03071c"], accent: "#4c8dff" },
  { id: "midnight-navy", name: "Midnight Navy", stops: ["#0a2a6e", "#01040f"], accent: "#5b9bff" },
  { id: "cosmic-purple", name: "Cosmic Purple", stops: ["#5b1aa8", "#0a0212"], accent: "#c084fc" },
  { id: "emerald-noir",  name: "Emerald Noir",  stops: ["#0a6b42", "#010a06"], accent: "#34d399" },
  { id: "crimson-alert", name: "Crimson Alert", stops: ["#a01327", "#0d0203"], accent: "#fb7185" },
  { id: "sunset-amber",  name: "Sunset Amber",  stops: ["#b45309", "#160902"], accent: "#fbbf24" },
  { id: "cyber-teal",    name: "Cyber Teal",    stops: ["#0a6b7a", "#01090b"], accent: "#2dd4bf" },
  { id: "rose-gold",     name: "Rose Gold",     stops: ["#a81665", "#12030c"], accent: "#f472b6" },
  { id: "golden-hour",   name: "Golden Hour",   stops: ["#c2790a", "#1a0f02"], accent: "#fde047" },
  { id: "berry-punch",   name: "Berry Punch",   stops: ["#9d174d", "#0a0308"], accent: "#fb7185" },
  { id: "monochrome",    name: "Slate Gray",    stops: ["#3a3a40", "#050505"], accent: "#e5e5e5", pillAccent: "#111111" },
  // The two dedicated strict black/white themes — grayscale only, headline
  // highlight distinguished by brightness (pure white/black) rather than hue.
  { id: "jet-black",     name: "Jet Black",     stops: ["#0a0a0a", "#000000"], accent: "#ffffff", pillAccent: "#111111", monochrome: true },
  { id: "pure-white",    name: "Pure White",    stops: ["#ffffff", "#e5e5e5"], accent: "#000000", isLight: true, pillAccent: "#ffffff", monochrome: true },
];

const EMPTY_ANALYSIS: AnalysisData = {
  category: "DAILY ANALYSIS",
  instrument: "",
  levelName: "",
  timeframe: "",
  session: "",
  description: "",
  whatToDo: "",
  keyLevels: "",
  imageUrl: "",
  layout: "standard",
  footer: "STRATIX RESEARCH",
  date: "",
};

const EMPTY_INDICATOR: PosterData = {
  category: "",
  title: "",
  subtitle: "",
  index: "",
  description: "",
  sections: [],
  metrics: [],
  formula: "",
  tags: [],
  footer: "",
  date: "",
  imageUrl: "",
};

const SAMPLE: PosterData = {
  category: "TECHNICAL ANALYSIS",
  title: "relative strength / index oscillator",
  subtitle: "A Momentum-Based Oscillator",
  index: "01",
  description: "Measures the magnitude of recent price changes to evaluate overbought or oversold conditions in the price of an asset.",
  sections: [
    {
      label: "HOW IT WORKS",
      content:
        "RSI compares average gains to average losses over a set period (default 14), producing a normalized value from 0 to 100.",
    },
    {
      label: "TRADING SIGNALS",
      content:
        "A reading above 70 signals overbought conditions. Below 30 signals oversold. Divergence from price often precedes reversals.",
    },
  ],
  metrics: [
    { label: "TYPE",   value: "Oscillator" },
    { label: "RANGE",  value: "0 – 100"    },
    { label: "PERIOD", value: "14"         },
    { label: "SIGNAL", value: "Momentum"   },
  ],
  formula: "RSI = 100 − [ 100 ÷ (1 + RS) ]",
  tags: ["MOMENTUM", "OSCILLATOR", "MEAN-REVERSION"],
  footer: "STRATIX RESEARCH",
  date: "2026",
  imageUrl: "",
};

const SAMPLE_ANALYSIS: AnalysisData = {
  category: "DAILY ANALYSIS",
  instrument: "XAUUSD (Gold)",
  levelName: "Daily Demand Zone",
  timeframe: "D1",
  session: "London / NY",
  description: "Gold price is approaching a **critical daily support cluster** and **demand zone**. We are looking for lower timeframe entry triggers (e.g. bullish order block on 1H/15M) to establish long positions with targets at the recent highs.",
  whatToDo: "Monitor the D1 demand block. Watch for a **bullish reversal pattern** on the 1H/15M chart before executing long orders.",
  keyLevels: "Support: 2320.50, 2305.00 | Resistance: 2355.00, 2370.00",
  imageUrl: "https://images.unsplash.com/photo-1610374792793-f016b77ca51a?w=800",
  layout: "standard",
  footer: "STRATIX RESEARCH",
  date: "2026",
};

const SAMPLE_NEWS: NewsItem[] = [
  {
    title: "us inflation cools / to 2.8% in may",
    description: "CPI data cools down to **2.8%** vs expected **3.0%**. Retail inflation is slowing down at a faster pace, which has fueled speculation of an early rate cut by the Federal Reserve.",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
    source: "Bloomberg",
    date: "June 27, 2026",
    impact: "High",
    sentiment: "Bearish",
    affectedAssets: "USD, XAUUSD, US Equities",
    keyTakeaway: "Treasury yields dropped immediately, weakening the DXY and providing a **massive safety bid** to Gold prices.",
    caption: "Inflation just came in cooler than expected — 2.8% vs the 3.0% everyone was bracing for. That's the kind of print that gets rate-cut bets moving fast. Gold already caught a bid on the yield drop. Are you positioning for more cuts this year? 👇",
    hashtags: ["#Stratix", "#Trading", "#ForexTrading", "#TradingSignals", "#FinancialMarkets", "#MarketNews", "#TradingCommunity", "#Inflation", "#InterestRates", "#FederalReserve", "#CPI", "#USD", "#Gold", "#XAUUSD", "#Forex", "#DXY", "#RateCuts", "#Economy", "#MacroTrading", "#BondMarket", "#TreasuryYields", "#FedWatch", "#TradingView", "#GoldTrading", "#SafeHaven"],
  },
  {
    title: "ethereum spot etfs / record inflows",
    description: "Ether spot exchange-traded funds recorded their **highest daily net inflow** since launch. Institutional asset managers are rapidly buying and establishing custody holdings.",
    imageUrl: "https://images.unsplash.com/photo-1622790694511-9a5aba0a93c7?w=800",
    source: "Reuters",
    date: "June 27, 2026",
    impact: "Medium",
    sentiment: "Bullish",
    affectedAssets: "ETHUSD, BTCUSDT, Crypto",
    keyTakeaway: "DeFi protocols saw a lockup surge. Layer 2 networks are gaining strong volume momentum.",
    caption: "Ethereum ETFs just posted their biggest inflow day since launch 👀 Institutions aren't just dipping a toe in anymore — they're building real custody positions. This is the kind of flow data that tends to show up in price a few weeks later. Watching ETH closely this week.",
    hashtags: ["#Stratix", "#Trading", "#ForexTrading", "#TradingSignals", "#FinancialMarkets", "#MarketNews", "#TradingCommunity", "#Ethereum", "#ETH", "#Crypto", "#CryptoNews", "#ETFs", "#Bitcoin", "#BTC", "#DeFi", "#Layer2", "#CryptoTrading", "#DigitalAssets", "#InstitutionalInvesting", "#CryptoMarket", "#Blockchain", "#Altcoins", "#CryptoInvestor", "#Web3"],
  },
];

const SAMPLE_FACTS: NewsItem[] = [
  {
    title: "Why Gold Is Measured In Troy Ounces, Not Regular Ounces",
    highlightPhrase: "Troy Ounces",
    description: "A troy ounce (**31.1035g**) is about **10% heavier** than a standard avoirdupois ounce (28.35g) — a unit inherited from medieval European bullion trading that stuck for precious metals worldwide.",
    sourceNote: "Verified against LBMA/COMEX contract specifications.",
    imageUrl: "https://images.unsplash.com/photo-1610375461369-d613b564f4c4?w=800",
  },
];

const SAMPLE_LEARNINGS: NewsItem[] = [
  {
    title: "Understanding Fair Value Gaps (FVG)",
    concept: "Fair Value Gap (FVG)",
    stepLabel: "Step 1 of 4",
    description: "A Fair Value Gap is a three-candle imbalance where price moves so fast it leaves a gap between the first candle's wick and the third candle's wick — a zone the market often returns to fill.",
    imageUrl: "https://images.unsplash.com/photo-1642790551116-18e150f248e5?w=800",
  },
];

const buildCreatorNewsPrompt = (date: string, session: string, candles: any) => {
  const ts = new Date().toISOString();
  
  // Format candles nicely
  let candleBlock = "";
  if (candles) {
    const lines: string[] = ["=== REAL MARKET DATA CONTEXT (OHLCV) ==="];
    const symbols = ["XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"];
    for (const sym of symbols) {
      const d = candles[sym.toLowerCase()];
      if (d && d.h1 && d.h1.length > 0) {
        lines.push(`\n${sym}:`);
        d.h1.slice(-5).forEach((c: any) => {
          const dt = new Date(c.t * 1000).toISOString().replace("T", " ").slice(0, 16);
          lines.push(`  ${dt} UTC: O:${c.o} H:${c.h} L:${c.l} C:${c.c}`);
        });
      }
    }
    candleBlock = lines.join("\n");
  } else {
    candleBlock = "=== REAL MARKET DATA CONTEXT ===\nNo live data summary available. Rely on real-world news sources.";
  }

  return `You are a world-class financial news analyst. Generate a valid JSON array of NewsItem items for the upcoming trading session.
  
================================================================
SESSION DETAILS:
================================================================
Date: ${date}
Session: ${session} (Asian | London | New York)
Generated At: ${ts}

================================================================
LIVE PRICE ACTION (REAL OHLCV):
================================================================
${candleBlock}

================================================================
INSTRUCTIONS:
================================================================
1. Extract or research the most important global macro events, central bank announcements, natural disasters, or geopolitical shocks for this date/session.
2. Produce a valid JSON array containing a batch of news items (at least 2-5 items).
3. Do NOT include markdown blocks, introductory texts, or code explanations. Return ONLY the JSON code block.
4. Each news item must have EXACTLY the following fields:
   - "title": A short, engaging headline (e.g. "US Inflation Cools Down to 2.8%")
   - "description": A highly detailed paragraph in Hinglish or simple English (100-150 words) mapping the transmission mechanism (Trigger -> Impact -> Ripple effect) with bold figures and italic contexts.
   - "imageUrl": A high-quality Unsplash image URL matching the theme of the headline (e.g. stock market, oil refinery, gold bars, bitcoin coin, central bank building). Use actual working Unsplash links.
   - "source": "Bloomberg" | "Reuters" | "CNBC" | etc.
   - "date": Date string (e.g. "June 27, 2026")
   - "impact": "High" | "Medium" | "Low"
   - "sentiment": "Bullish" | "Bearish" | "Neutral"
   - "affectedAssets": Comma-separated list of symbols (e.g. "USD, XAUUSD, US Equities")
   - "keyTakeaway": A concise summary (40-60 words) highlighting immediate trader action bias and technical levels.

================================================================
OUTPUT SCHEMA:
================================================================
\`\`\`json
[
  {
    "title": "US Inflation Cools Down to 2.8% in May",
    "description": "CPI data cools down to 2.8% vs expected 3.0%. Retail inflation is slowing down at a faster pace, which has fueled speculation of an early rate cut by the Federal Reserve.",
    "imageUrl": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
    "source": "Bloomberg",
    "date": "June 27, 2026",
    "impact": "High",
    "sentiment": "Bearish",
    "affectedAssets": "USD, XAUUSD, US Equities",
    "keyTakeaway": "Treasury yields dropped immediately, weakening the DXY and providing a massive safety bid to Gold prices."
  }
]
\`\`\`
`;
};

// ─── Canvas utilities ─────────────────────────────────────────────────────────

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.lineTo(x + w - R, y); ctx.arcTo(x + w, y, x + w, y + R, R);
  ctx.lineTo(x + w, y + h - R); ctx.arcTo(x + w, y + h, x + w - R, y + h, R);
  ctx.lineTo(x + R, y + h); ctx.arcTo(x, y + h, x, y + h - R, R);
  ctx.lineTo(x, y + R); ctx.arcTo(x, y, x + R, y, R);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ─── Extreme-poster visual system ──────────────────────────────────────────
// Shared decorative primitives for the Bold and Bento carousel cards: film
// grain, corner crop-marks, icon badges, and a segmented pagination rail —
// one shared visual language so the two card kinds read as a single system
// instead of two unrelated templates. Grain uses a deterministic PRNG (not
// Math.random) so re-rendering the same data during live editing never
// makes the texture visibly "crawl" between frames.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grainTileCache = new Map<number, HTMLCanvasElement>();
function getGrainTile(size: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const cached = grainTileCache.get(size);
  if (cached) return cached;
  const tile = document.createElement("canvas");
  tile.width = size; tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;
  const rand = mulberry32(1337);
  const dots = Math.round(size * size * 0.16);
  for (let i = 0; i < dots; i++) {
    const x = Math.floor(rand() * size), y = Math.floor(rand() * size);
    const a = rand() * 0.5;
    tctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    tctx.fillRect(x, y, 1, 1);
  }
  grainTileCache.set(size, tile);
  return tile;
}

// Full-bleed film-grain pass — the cheapest way to turn a flat gradient into
// a textured, "printed" surface instead of a CSS-flat background.
function paintGrain(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number) {
  const tile = getGrainTile(128);
  if (!tile) return;
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Small filled circle + centered glyph — the shared icon-badge primitive
// fused to chips and section labels across the Bold and Bento cards.
function drawIconBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, d: number, bg: string, fg: string, glyph: string, glyphSize: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = `800 ${glyphSize}px "Inter", sans-serif`;
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy + glyphSize * 0.04);
}

// Plain "STRATI" + accent-colored "X" wordmark — the brand mark, themed to
// whichever gradient/theme is active instead of a fixed badge, matching the
// treatment the Outro card always used. Shared by every card kind (Bold
// story, Bento, Outro) so the batch reads as one consistent brand across
// the whole carousel. Returns the total rendered width.
function drawWordmark(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  fontSize: number,
  fgColor: string,
  accentColor: string,
  align: "left" | "center" = "left",
  baseline: CanvasTextBaseline = "alphabetic"
): number {
  ctx.font = `800 ${fontSize}px "Inter", sans-serif`;
  ctx.textBaseline = baseline;
  const stratiW = ctx.measureText("STRATI").width;
  const xW = ctx.measureText("X").width;
  const totalW = stratiW + xW;
  const startX = align === "center" ? x - totalW / 2 : x;
  ctx.textAlign = "left";
  ctx.fillStyle = fgColor;
  ctx.fillText("STRATI", startX, y);
  ctx.fillStyle = accentColor;
  ctx.fillText("X", startX + stratiW, y);
  return totalW;
}

// "JUL 21 · 2:47 PM" — the render-time timestamp stamped opposite the logo
// on every card. Always "now" (the moment the poster is drawn/exported),
// not a field from the data, so every export is naturally dated.
function formatPosterTimestamp(d: Date = new Date()): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";
  return `${months[d.getMonth()]} ${d.getDate()} · ${hours12}:${minutes} ${ampm}`;
}

// Segmented "story progress" rail — replaces a loose row of dots with the
// wide-rail convention from Stories UIs; reads as one continuous strip and
// makes the active slide unmistakable at a glance, at any slide count.
function drawSegmentedPagination(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  count: number, activeIndex: number,
  activeColor: string, inactiveColor: string
) {
  if (count <= 1) return;
  const gap = h * 0.9;
  const segW = (w - gap * (count - 1)) / count;
  let cx = x;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i === activeIndex ? activeColor : inactiveColor;
    rrect(ctx, cx, y, Math.max(1, segW), h, h / 2);
    ctx.fill();
    cx += segW + gap;
  }
}

// Best-effort letter tracking — Canvas2D's `letterSpacing` shipped in
// Chromium ~2022 and Safari 17.4; on older engines the assignment is simply
// ignored (no throw), so this is safe progressive enhancement, not a
// dependency the layout math relies on.
function setTracking(ctx: CanvasRenderingContext2D, px: number) {
  try { (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* unsupported */ }
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  maxH: number,
  minSize: number,
  maxSize: number
): { lines: string[]; fontSize: number; lineSpacing: number } {
  let bestFontSize = minSize;
  let bestLines: string[] = [];
  let bestLineSpacing = minSize * 1.5;

  // Search for the largest font size that fits within maxH
  for (let sz = minSize; sz <= maxSize; sz += 0.5) {
    ctx.font = `500 ${sz}px "Inter", system-ui, -apple-system, sans-serif`;
    const lines = wrap(ctx, text, maxW);
    const spacing = sz * 1.5;
    const totalH = lines.length * spacing;

    if (totalH <= maxH) {
      bestFontSize = sz;
      bestLines = lines;
      bestLineSpacing = spacing;
    } else {
      break;
    }
  }

  // Fallback if no size fits
  if (bestLines.length === 0) {
    ctx.font = `500 ${minSize}px "Inter", system-ui, -apple-system, sans-serif`;
    bestLines = wrap(ctx, text, maxW);
    bestFontSize = minSize;
    bestLineSpacing = minSize * 1.5;
  }

  return { lines: bestLines, fontSize: bestFontSize, lineSpacing: bestLineSpacing };
}

// ─── Daily Analysis Canvas Layouts ──────────────────────────────────────────

function drawDailyAnalysisStandard(
  ctx: CanvasRenderingContext2D,
  data: AnalysisData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  let Y = PAD + GUT;

  // Colorful Header Banner block (solid accent background spanning full content width) - Taller!
  const catY = Y;
  const bannerH = r(38);
  rrect(ctx, CX, Y, CW, bannerH, r(4));
  ctx.fillStyle = colors.accent; ctx.fill();

  ctx.font = font.label(12, true); ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(` ◆  ${(data.category || "DAILY ANALYSIS").toUpperCase()}`, CX + r(14), Y + bannerH / 2);
  
  // Date inside the banner (Bigger!)
  if (data.date) {
    ctx.textAlign = "right"; ctx.fillStyle = "#FFFFFF";
    ctx.fillText(data.date, CXR - r(14), Y + bannerH / 2);
  }
  bounds.push({ id: "category", label: "Category & Date", x: CX, y: catY, w: CW, h: bannerH });
  Y += bannerH + r(24);

  // Instrument Name
  const instY = Y;
  ctx.font = font.serif(42, true); ctx.fillStyle = colors.text; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const instName = data.instrument || "XAUUSD";
  ctx.fillText(instName, CX, Y);
  const instW = ctx.measureText(instName).width;

  // Row of solid pills: Timeframe & Session next to Instrument
  let pillX = CX + instW + r(18);
  const pillY = Y + r(10);
  
  if (data.timeframe) {
    const tf = data.timeframe.toUpperCase();
    ctx.font = font.label(10.5, true);
    const tfW = ctx.measureText(tf).width + r(18);
    const tfH = r(24);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tf, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(10);
  }

  if (data.session) {
    const sess = data.session.toUpperCase();
    ctx.font = font.label(10.5, true);
    const sessW = ctx.measureText(sess).width + r(18);
    const tfH = r(24);
    
    rrect(ctx, pillX, pillY, sessW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sess, pillX + sessW / 2, pillY + tfH / 2);
  }
  
  bounds.push({ id: "instrument", label: "Instrument & Pills", x: CX, y: instY, w: CW, h: r(50) });
  Y += r(54);

  // Level Name
  if (data.levelName) {
    const lvlY = Y;
    ctx.font = font.serif(19, true); ctx.fillStyle = colors.muted; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(data.levelName, CX, Y);
    bounds.push({ id: "levelName", label: "Level Name", x: CX, y: lvlY, w: CW, h: r(24) });
    Y += r(30);
  }

  // 1. Image Frame (Chart screenshot) - Constant height in all ratios
  let imgH = 0;
  if (img) {
    imgH = r(245);
    const imgY = Y;
    rrect(ctx, CX, Y, CW, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5; ctx.stroke();
    
    ctx.save();
    rrect(ctx, CX + r(1), Y + r(1), CW - r(2), imgH - r(2), r(4));
    ctx.clip();
    
    // Cover crop algorithm to perfectly fill the canvas space
    const iAR = img.naturalWidth / img.naturalHeight;
    const fAR = CW / imgH;
    let drawW = CW, drawH = imgH, drawX = CX, drawY = Y;
    if (iAR > fAR) {
      drawW = imgH * iAR;
      drawX = CX + (CW - drawW) / 2;
    } else {
      drawH = CW / iAR;
      drawY = Y + (imgH - drawH) / 2;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
    
    bounds.push({ id: "imageUrl", label: "Chart Screenshot", x: CX, y: imgY, w: CW, h: imgH });
    Y += imgH + r(20);
  }

  // 2. Sections (Explanation, Action Plan, Key Levels) - dynamic heights scaling to fill remaining empty space!
  const FY = H - PAD - GUT;
  const footerSpace = r(28) + r(14);
  const totalContentH = FY - Y - footerSpace;

  if (totalContentH > 0) {
    const sections: { id: string; label: string; text: string; share: number; cardH: number }[] = [];
    if (data.description) sections.push({ id: "description", label: "◆ EXPLANATION", text: data.description, share: 0.50, cardH: 0 });
    if (data.whatToDo)     sections.push({ id: "whatToDo",     label: "◆ ACTION PLAN (WHAT TO DO)", text: data.whatToDo,     share: 0.30, cardH: 0 });
    if (data.keyLevels)    sections.push({ id: "keyLevels",    label: "◆ KEY LEVELS",    text: data.keyLevels,    share: 0.20, cardH: 0 });
    
    if (sections.length > 0) {
      const totalShare = sections.reduce((acc, s) => acc + s.share, 0);
      const gapSize = r(12);
      const totalGaps = (sections.length - 1) * gapSize;
      const availForCards = totalContentH - totalGaps;
      
      sections.forEach(s => {
        s.cardH = Math.floor(availForCards * (s.share / totalShare));
      });

      sections.forEach((s) => {
        const cardH = s.cardH;
        rrect(ctx, CX, Y, CW, cardH, r(5));
        ctx.fillStyle = colors.card; ctx.fill();
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
        
        ctx.fillStyle = colors.accent;
        ctx.fillRect(CX, Y + r(6), r(5), cardH - r(12));
        
        ctx.font = font.label(8.5, true); ctx.textBaseline = "top";
        ctx.fillStyle = colors.accent; ctx.textAlign = "left";
        ctx.fillText(s.label, CX + r(16), Y + r(10));
        
        const titleSpace = r(24);
        const fit = fitText(ctx, s.text, CW - r(32), cardH - titleSpace - r(16), r(10.5), r(16));
        
        ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
        fit.lines.forEach((l, i) => {
          const lineY = Y + titleSpace + r(8) + i * fit.lineSpacing;
          if (lineY + fit.lineSpacing < Y + cardH) {
            ctx.fillText(l, CX + r(16), lineY);
          }
        });
        
        bounds.push({ id: s.id, label: s.label, x: CX, y: Y, w: CW, h: cardH });
        Y += cardH + gapSize;
      });
    }
  }

  // Footer
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(14)); ctx.lineTo(CXR, FY - r(14)); ctx.stroke();
  
  ctx.font = font.label(9.5, true); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(5));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent;
  ctx.fillText("stratix.app", CXR, FY - r(5));
  bounds.push({ id: "footer", label: "Footer", x: CX, y: FY - r(14), w: CW, h: r(28) });

  return bounds;
}

function drawDailyAnalysisSplit(
  ctx: CanvasRenderingContext2D,
  data: AnalysisData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const COL_GAP = r(28);
  const LC = Math.round(CW * 0.45); // left col width (text details)
  const RC = CW - LC - COL_GAP;     // right col width (full-height chart image)
  const RCX = CX + LC + COL_GAP;    // right col X

  let LY = PAD + GUT;

  // Category Banner block for Split - Taller!
  const catY = LY;
  const bannerH = r(34);
  rrect(ctx, CX, LY, LC, bannerH, r(4));
  ctx.fillStyle = colors.accent; ctx.fill();
  
  ctx.font = font.label(11, true); ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(` ◆  ${(data.category || "DAILY ANALYSIS").toUpperCase()}`, CX + r(10), LY + bannerH / 2);
  
  if (data.date) {
    ctx.textAlign = "right"; ctx.fillStyle = "#FFFFFF";
    ctx.fillText(data.date, CX + LC - r(10), LY + bannerH / 2);
  }
  bounds.push({ id: "category", label: "Category & Date", x: CX, y: catY, w: LC, h: bannerH });
  LY += bannerH + r(20);

  // Line Separator
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, LY); ctx.lineTo(CX + LC, LY); ctx.stroke();
  LY += r(22);

  // Instrument Name
  const instY = LY;
  ctx.font = font.serif(34, true); ctx.fillStyle = colors.text; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const instName = data.instrument || "XAUUSD";
  ctx.fillText(instName, CX, LY);
  const instW = ctx.measureText(instName).width;

  // Solid Timeframe & Session Row
  let pillX = CX + instW + r(14);
  const pillY = LY + r(8);
  
  if (data.timeframe) {
    const tf = data.timeframe.toUpperCase();
    ctx.font = font.label(9, true);
    const tfW = ctx.measureText(tf).width + r(14);
    const tfH = r(20);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tf, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(8);
  }

  if (data.session) {
    const sess = data.session.toUpperCase();
    ctx.font = font.label(9, true);
    const sessW = ctx.measureText(sess).width + r(14);
    const tfH = r(20);
    
    rrect(ctx, pillX, pillY, sessW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sess, pillX + sessW / 2, pillY + tfH / 2);
  }
  bounds.push({ id: "instrument", label: "Instrument", x: CX, y: instY, w: LC, h: r(40) });
  LY += r(40);

  // Level Name
  if (data.levelName) {
    const lvlY = LY;
    ctx.font = font.serif(17, true); ctx.fillStyle = colors.muted; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(data.levelName, CX, LY);
    bounds.push({ id: "levelName", label: "Level Name", x: CX, y: lvlY, w: LC, h: r(22) });
    LY += r(26);
  }

  // Explanation/Description Card (Left Column) - Dynamic Height Stretch & Word Wrap
  const FY = H - PAD - GUT;
  const footerSpace = r(28) + r(14);
  const cardH = FY - LY - footerSpace; // Stretch to align with footer line

  if (cardH > 0) {
    const sections: { id: string; label: string; text: string; share: number; cardH: number }[] = [];
    if (data.description) sections.push({ id: "description", label: "◆ EXPLANATION", text: data.description, share: 0.50, cardH: 0 });
    if (data.whatToDo)     sections.push({ id: "whatToDo",     label: "◆ ACTION PLAN", text: data.whatToDo,     share: 0.30, cardH: 0 });
    if (data.keyLevels)    sections.push({ id: "keyLevels",    label: "◆ KEY LEVELS",    text: data.keyLevels,    share: 0.20, cardH: 0 });

    if (sections.length > 0) {
      const totalShare = sections.reduce((acc, s) => acc + s.share, 0);
      const gapSize = r(10);
      const totalGaps = (sections.length - 1) * gapSize;
      const availForCards = cardH - totalGaps;

      sections.forEach(s => {
        s.cardH = Math.floor(availForCards * (s.share / totalShare));
      });

      let currentLY = LY;
      sections.forEach((s) => {
        const secCardH = s.cardH;
        rrect(ctx, CX, currentLY, LC, secCardH, r(5));
        ctx.fillStyle = colors.card; ctx.fill();
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
        
        ctx.fillStyle = colors.accent;
        ctx.fillRect(CX, currentLY + r(4), r(4), secCardH - r(8));
        
        ctx.font = font.label(8, true); ctx.textBaseline = "top";
        ctx.fillStyle = colors.accent; ctx.textAlign = "left";
        ctx.fillText(s.label, CX + r(12), currentLY + r(8));
        
        const titleSpace = r(20);
        const fit = fitText(ctx, s.text, LC - r(24), secCardH - titleSpace - r(12), r(9.5), r(14));
        
        ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
        fit.lines.forEach((l, i) => {
          const lineY = currentLY + titleSpace + r(6) + i * fit.lineSpacing;
          if (lineY + fit.lineSpacing < currentLY + secCardH) {
            ctx.fillText(l, CX + r(12), lineY);
          }
        });

        bounds.push({ id: s.id, label: s.label, x: CX, y: currentLY, w: LC, h: secCardH });
        currentLY += secCardH + gapSize;
      });
    }
  }

  // Vertical column separator
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(CX + LC + COL_GAP / 2, PAD + GUT);
  ctx.lineTo(CX + LC + COL_GAP / 2, FY);
  ctx.stroke();

  // Right Column: Full-Height Image
  const imgY = PAD + GUT;
  const imgH = FY - imgY - r(40);
  if (img) {
    rrect(ctx, RCX, imgY, RC, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
    
    ctx.save();
    rrect(ctx, RCX + r(1), imgY + r(1), RC - r(2), imgH - r(2), r(4));
    ctx.clip();
    
    // Cover Crop
    const iAR = img.naturalWidth / img.naturalHeight;
    const fAR = RC / imgH;
    let drawW = RC, drawH = imgH, drawX = RCX, drawY = imgY;
    if (iAR > fAR) {
      drawW = imgH * iAR;
      drawX = RCX + (RC - drawW) / 2;
    } else {
      drawH = RC / iAR;
      drawY = imgY + (imgH - drawH) / 2;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    rrect(ctx, RCX, imgY, RC, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = font.label(10, true); ctx.fillStyle = colors.muted;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("CHART SCREENSHOT", RCX + RC / 2, imgY + imgH / 2);
  }
  bounds.push({ id: "imageUrl", label: "Chart Screenshot", x: RCX, y: imgY, w: RC, h: imgH });

  // Footer (Full Width)
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(14)); ctx.lineTo(CXR, FY - r(14)); ctx.stroke();
  
  ctx.font = font.label(9, true); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(5));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent;
  ctx.fillText("stratix.app", CXR, FY - r(5));
  bounds.push({ id: "footer", label: "Footer", x: CX, y: FY - r(14), w: CW, h: r(28) });

  return bounds;
}

function drawDailyAnalysis(
  ctx: CanvasRenderingContext2D,
  data: AnalysisData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
  land: boolean
): PosterElement[] {
  if (land) {
    return drawDailyAnalysisSplit(ctx, data, img, W, H, S, PAD, CX, CXR, CW, GUT, r, font, colors, config);
  } else {
    return drawDailyAnalysisStandard(ctx, data, img, W, H, S, PAD, CX, CXR, CW, GUT, r, font, colors, config);
  }
}

// ─── News Poster Canvas Layout ──────────────────────────────────────────────

function drawNewsPoster(
  ctx: CanvasRenderingContext2D,
  data: NewsItem,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
  land: boolean
): PosterElement[] {
  const bounds: PosterElement[] = [];
  let Y = PAD + GUT;

  // Colorful Header Banner - Taller!
  const catY = Y;
  const bannerH = r(38);
  rrect(ctx, CX, Y, CW, bannerH, r(4));
  ctx.fillStyle = colors.accent; ctx.fill();

  ctx.font = font.label(12, true); ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(` ◆  MARKET NEWS`, CX + r(14), Y + bannerH / 2);
  
  // News Source inside banner
  if (data.source) {
    ctx.textAlign = "right"; ctx.fillStyle = "#FFFFFF";
    ctx.fillText(data.source.toUpperCase(), CXR - r(14), Y + bannerH / 2);
  }
  bounds.push({ id: "source", label: "News Source", x: CX, y: catY, w: CW, h: bannerH });
  Y += bannerH + r(24);

  // Solid line separator
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, Y); ctx.lineTo(CXR, Y); ctx.stroke();
  Y += r(24);

  // News Headline (Title) - Extra bold modern sans-serif
  const titleY = Y;
  ctx.font = font.serif(28, true); ctx.fillStyle = colors.text; ctx.textAlign = "left"; ctx.textBaseline = "top";
  const tLines = wrap(ctx, data.title || "Headline", CW);
  const tLH = r(34 * config.fontScale);
  tLines.forEach((l, i) => ctx.fillText(l, CX, Y + i * tLH));
  const headlineH = Math.max(tLines.length * tLH, r(24));
  bounds.push({ id: "title", label: "Headline", x: CX, y: titleY, w: CW, h: headlineH });
  Y += headlineH + r(14);

  // Draw Pills under headline: Impact, Sentiment & Affected Assets
  let pillX = CX;
  const pillY = Y;
  const tfH = r(22);
  
  if (data.impact) {
    const impText = `${data.impact.toUpperCase()} IMPACT`;
    ctx.font = font.label(8.5, true);
    const tfW = ctx.measureText(impText).width + r(14);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = data.impact === "High" ? "#EF4444" : data.impact === "Medium" ? "#F97316" : colors.muted;
    ctx.fill();
    
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(impText, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(8);
  }

  if (data.sentiment) {
    const sentText = data.sentiment.toUpperCase();
    ctx.font = font.label(8.5, true);
    const tfW = ctx.measureText(sentText).width + r(14);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = data.sentiment === "Bullish" ? "#22C55E" : data.sentiment === "Bearish" ? "#EF4444" : colors.muted;
    ctx.fill();
    
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(sentText, pillX + tfW / 2, pillY + tfH / 2);
    pillX += tfW + r(8);
  }

  if (data.affectedAssets) {
    const assetsText = data.affectedAssets.toUpperCase();
    ctx.font = font.label(8.5, true);
    const tfW = ctx.measureText(assetsText).width + r(14);
    
    rrect(ctx, pillX, pillY, tfW, tfH, r(4));
    ctx.fillStyle = colors.accent; ctx.fill();
    
    ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(assetsText, pillX + tfW / 2, pillY + tfH / 2);
  }
  Y += tfH + r(20);

  // News Image - Constant Height
  let imgH = 0;
  if (img) {
    imgH = r(245);
    const imgY = Y;
    rrect(ctx, CX, Y, CW, imgH, r(5));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
    
    ctx.save();
    rrect(ctx, CX + r(1), Y + r(1), CW - r(2), imgH - r(2), r(4));
    ctx.clip();
    
    // Cover crop
    const iAR = img.naturalWidth / img.naturalHeight;
    const fAR = CW / imgH;
    let drawW = CW, drawH = imgH, drawX = CX, drawY = Y;
    if (iAR > fAR) {
      drawW = imgH * iAR;
      drawX = CX + (CW - drawW) / 2;
    } else {
      drawH = CW / iAR;
      drawY = Y + (imgH - drawH) / 2;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
    
    bounds.push({ id: "imageUrl", label: "News Image", x: CX, y: imgY, w: CW, h: imgH });
    Y += imgH + r(20);
  }

  // News Description & Takeaways - dynamic heights scaling to fill remaining empty space!
  const FY = H - PAD - GUT;
  const footerSpace = r(28) + r(14);
  const totalContentH = FY - Y - footerSpace;

  if (totalContentH > 0) {
    const sections: { id: string; label: string; text: string; share: number; cardH: number }[] = [];
    if (data.description) sections.push({ id: "description", label: "◆ DETAILED ANALYSIS", text: data.description, share: 0.65, cardH: 0 });
    if (data.keyTakeaway)  sections.push({ id: "keyTakeaway",  label: "◆ KEY TAKEAWAYS & MARKET BIAS", text: data.keyTakeaway,  share: 0.35, cardH: 0 });
    
    if (sections.length > 0) {
      const totalShare = sections.reduce((acc, s) => acc + s.share, 0);
      const gapSize = r(12);
      const totalGaps = (sections.length - 1) * gapSize;
      const availForCards = totalContentH - totalGaps;
      
      sections.forEach(s => {
        s.cardH = Math.floor(availForCards * (s.share / totalShare));
      });

      sections.forEach((s) => {
        const cardH = s.cardH;
        rrect(ctx, CX, Y, CW, cardH, r(5));
        ctx.fillStyle = colors.card; ctx.fill();
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5; ctx.stroke();
        
        ctx.fillStyle = colors.accent;
        ctx.fillRect(CX, Y + r(6), r(5), cardH - r(12));
        
        ctx.font = font.label(8.5, true); ctx.textBaseline = "top";
        ctx.fillStyle = colors.accent; ctx.textAlign = "left";
        ctx.fillText(s.label, CX + r(16), Y + r(10));
        
        const titleSpace = r(24);
        const fit = fitText(ctx, s.text, CW - r(32), cardH - titleSpace - r(16), r(10.5), r(16));
        
        ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
        fit.lines.forEach((l, i) => {
          const lineY = Y + titleSpace + r(8) + i * fit.lineSpacing;
          if (lineY + fit.lineSpacing < Y + cardH) {
            ctx.fillText(l, CX + r(16), lineY);
          }
        });
        
        bounds.push({ id: s.id, label: s.label, x: CX, y: Y, w: CW, h: cardH });
        Y += cardH + gapSize;
      });
    }
  }

  // Footer
  ctx.strokeStyle = colors.subtle; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(14)); ctx.lineTo(CXR, FY - r(14)); ctx.stroke();
  
  ctx.font = font.label(9.5, true); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.date || "TODAY", CX, FY - r(5));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent;
  ctx.fillText("stratix.app", CXR, FY - r(5));
  bounds.push({ id: "footer", label: "Footer", x: CX, y: FY - r(14), w: CW, h: r(28) });

  return bounds;
}

// ─── Main canvas draw ─────────────────────────────────────────────────────────

function drawChaseStylePoster(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
  mode: "analysis" | "news" | "indicator",
  activeNewsIndex: number,
  totalNewsCount: number,
  land: boolean
): PosterElement[] {
  const bounds: PosterElement[] = [];

  // Helper to shade a color (hex to hex)
  function shadeColor(color: string, percent: number) {
    const num = parseInt(color.replace("#", ""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = (num >> 8 & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
  }

  // Helper to draw torn tape
  function drawTornTape(c: CanvasRenderingContext2D, tx: number, ty: number, tw: number, th: number, angle: number) {
    c.save();
    c.translate(tx, ty);
    c.rotate(angle * Math.PI / 180);
    
    c.fillStyle = "rgba(242, 238, 224, 0.42)";
    c.strokeStyle = "rgba(242, 238, 224, 0.28)";
    c.lineWidth = 1;
    
    c.beginPath();
    const halfW = tw / 2;
    const halfH = th / 2;
    
    c.moveTo(-halfW, -halfH);
    
    // Left jagged edge
    const segments = 6;
    for (let i = 1; i <= segments; i++) {
      const py = -halfH + (th * i / segments);
      const px = -halfW + (i % 2 === 0 ? r(2) : -r(2));
      c.lineTo(px, py);
    }
    
    c.lineTo(halfW, halfH);
    
    // Right jagged edge
    for (let i = segments - 1; i >= 0; i--) {
      const py = -halfH + (th * i / segments);
      const px = halfW + (i % 2 === 0 ? -r(2) : r(2));
      c.lineTo(px, py);
    }
    
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }

  // Helper to wrap formatted text (supporting **bold**)
  function wrapFormattedText(c: CanvasRenderingContext2D, text: string, maxW: number, normalF: string, boldF: string): any[] {
    const parts = text.split("**");
    const tokens = parts.map((t, idx) => ({
      text: t,
      isBold: idx % 2 === 1
    }));

    const lines: any[] = [];
    let currentLine: any[] = [];
    let currentLineWidth = 0;

    tokens.forEach((token) => {
      const words = token.text.split(/(\s+)/);
      words.forEach((word) => {
        if (word === "") return;
        c.font = token.isBold ? boldF : normalF;
        const wordW = c.measureText(word).width;

        if (currentLineWidth + wordW > maxW && currentLine.length > 0 && word.trim() !== "") {
          lines.push(currentLine);
          currentLine = [];
          currentLineWidth = 0;
        }

        currentLine.push({ text: word, isBold: token.isBold });
        currentLineWidth += wordW;
      });
    });

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    return lines;
  }

  // 1. Background (Vertical linear gradient)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, colors.bg);
  bgGrad.addColorStop(1, shadeColor(colors.bg, -20));
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Analog Fine Grain Noise
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
  for (let i = 0; i < 4500; i++) {
    const nx = Math.random() * W;
    const ny = Math.random() * H;
    const nSize = Math.random() * 1.5 + 0.5;
    ctx.fillRect(nx, ny, nSize, nSize);
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.022)";
  for (let i = 0; i < 4500; i++) {
    const nx = Math.random() * W;
    const ny = Math.random() * H;
    const nSize = Math.random() * 1.5 + 0.5;
    ctx.fillRect(nx, ny, nSize, nSize);
  }
  ctx.restore();

  // 3. Vignette
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) / 3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Parse slide numbering
  let idxStr = "01";
  let totStr = "01";
  if (mode === "news") {
    idxStr = (activeNewsIndex + 1).toString().padStart(2, "0");
    totStr = totalNewsCount.toString().padStart(2, "0");
  } else {
    idxStr = (data.index || "01").toString().padStart(2, "0");
    totStr = (data.total || "08").toString().padStart(2, "0");
  }
  const slideText = `${idxStr}  /  ${totStr}`;

  const dateText = (data.date || "JULY @2026").toUpperCase();
  const brandText = (data.footer || "CHASE AI").toUpperCase();

  // Header Y
  const headY = PAD + r(10);

  // Draw Header
  ctx.font = `bold ${r(10.5)}px "Inter", sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.textBaseline = "middle";
  
  ctx.textAlign = "left";
  ctx.fillText(dateText, CX, headY);
  
  ctx.textAlign = "center";
  ctx.fillText(brandText, W / 2, headY);
  
  ctx.textAlign = "right";
  ctx.fillText(slideText, CXR, headY);
  
  bounds.push({ id: "header", label: "Header Navigation", x: CX, y: headY - r(10), w: CW, h: r(20) });

  // Footer Y
  const FY = H - PAD - r(10);

  // Draw Footer
  ctx.textAlign = "left";
  ctx.fillText(slideText, CX, FY);
  
  ctx.textAlign = "right";
  ctx.fillText("SWIPE  →", CXR, FY);
  
  const dotCount = mode === "news" ? totalNewsCount : 8;
  const activeDotIdx = mode === "news" ? activeNewsIndex : (parseInt(idxStr) - 1 || 0);

  if (dotCount > 1) {
    const dotSpacing = r(11);
    const totalDotsW = (dotCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    
    ctx.save();
    for (let i = 0; i < dotCount; i++) {
      const dotX = startDotX + i * dotSpacing;
      ctx.beginPath();
      ctx.arc(dotX, FY, r(2.5), 0, Math.PI * 2);
      ctx.fillStyle = i === activeDotIdx ? "#FFFFFF" : "rgba(255, 255, 255, 0.28)";
      ctx.fill();
    }
    ctx.restore();
  }
  bounds.push({ id: "footer", label: "Footer Navigation", x: CX, y: FY - r(10), w: CW, h: r(20) });

  // Extract description and format
  let descText = "";
  if (mode === "analysis") {
    const parts = [];
    if (data.description) parts.push(data.description);
    if (data.whatToDo) parts.push(`**What to do:** ${data.whatToDo}`);
    if (data.keyLevels) parts.push(`**Key Levels:** ${data.keyLevels}`);
    descText = parts.join(" ");
  } else if (mode === "news") {
    const parts = [];
    if (data.description) parts.push(data.description);
    if (data.keyTakeaway) parts.push(`**Key Takeaway:** ${data.keyTakeaway}`);
    descText = parts.join(" ");
  } else {
    if (data.description) {
      descText = data.description;
    }
    if (data.sections && data.sections.length > 0) {
      const secParts = data.sections.map((s: any) => `**${s.label}:** ${s.content || s.text || ""}`);
      descText = (descText ? descText + " " : "") + secParts.join(" ");
    }
  }
  descText = descText.replace(/\n+/g, " ");

  if (land) {
    // ── LANDSCAPE LAYOUT (Side-by-side)
    const midX = W / 2;
    const leftW = (midX - CX) - r(12);
    const rightW = (CXR - midX) - r(12);
    
    let Y = PAD + r(38);
    
    // Category badge
    const badgeText = (data.category || `USE CASE ${idxStr}`).toUpperCase();
    ctx.font = `900 ${r(10.5)}px "Inter", sans-serif`;
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgeW = badgeTextW + r(18);
    const badgeH = r(24);
    
    ctx.save();
    ctx.translate(CX + badgeW / 2, Y + badgeH / 2);
    ctx.rotate(-2.5 * Math.PI / 180);
    ctx.fillStyle = "#111111";
    rrect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, r(12));
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, 0, 0);
    ctx.restore();
    
    bounds.push({ id: "category", label: "Badge", x: CX, y: Y, w: badgeW, h: badgeH });
    Y += badgeH + r(14);
    
    // Title
    let rawTitle = "";
    if (mode === "analysis") {
      rawTitle = data.instrument && data.levelName ? `${data.instrument} / ${data.levelName}` : (data.instrument || data.levelName || "Untitled");
    } else {
      rawTitle = data.title || "Untitled";
    }
    rawTitle = rawTitle.toLowerCase();

    let titleLines: string[] = [];
    if (rawTitle.includes("/")) {
      titleLines = rawTitle.split("/").map(s => s.trim());
    } else {
      ctx.font = `900 ${r(34)}px "Inter", sans-serif`;
      titleLines = wrap(ctx, rawTitle, leftW);
    }
    
    let curTitleY = Y;
    const titleLH = r(38);
    titleLines.forEach((line, lineIdx) => {
      let text = line;
      if (lineIdx === titleLines.length - 1 && !text.endsWith(".")) {
        text = text + ".";
      }
      
      const isWhite = lineIdx % 2 === 0;
      ctx.font = `900 ${r(34)}px "Inter", sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      
      if (!isWhite && text.endsWith(".")) {
        const mainText = text.substring(0, text.length - 1);
        ctx.fillStyle = "#111111";
        ctx.fillText(mainText, CX, curTitleY);
        const mainTextW = ctx.measureText(mainText).width;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(".", CX + mainTextW, curTitleY);
      } else {
        ctx.fillStyle = isWhite ? "#FFFFFF" : "#111111";
        ctx.fillText(text, CX, curTitleY);
      }
      curTitleY += titleLH;
    });
    bounds.push({ id: "title", label: "Title", x: CX, y: Y, w: leftW, h: curTitleY - Y });
    Y = curTitleY + r(10);
    
    // Description
    const boldFont = `bold 700 ${r(12.5)}px "Inter", sans-serif`;
    const normalFont = `500 ${r(12.5)}px "Inter", sans-serif`;
    
    const descLines = wrapFormattedText(ctx, descText, leftW, normalFont, boldFont);
    let curDescY = Y;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    
    descLines.forEach((line) => {
      let curX = CX;
      line.forEach((item: any) => {
        ctx.font = item.isBold ? boldFont : normalFont;
        ctx.fillStyle = item.isBold ? "#FFFFFF" : "rgba(255, 255, 255, 0.85)";
        ctx.fillText(item.text, curX, curDescY);
        curX += ctx.measureText(item.text).width;
      });
      curDescY += r(18);
    });
    bounds.push({ id: "description", label: "Description", x: CX, y: Y, w: leftW, h: curDescY - Y });

    // Right side: Tilted Image Frame
    const rightCX = midX + r(12);
    const IH = Math.min(r(400), FY - PAD - r(70));
    const IY = PAD + r(40) + IH / 2;
    
    ctx.save();
    ctx.translate(rightCX + rightW / 2, IY);
    ctx.rotate(-1.5 * Math.PI / 180);
    
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = r(15);
    ctx.shadowOffsetY = r(8);
    
    ctx.fillStyle = "#FFFFFF";
    rrect(ctx, -rightW / 2, -IH / 2, rightW, IH, r(6));
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    const borderSize = r(4.5);
    const clipW = rightW - borderSize * 2;
    const clipH = IH - borderSize * 2;
    
    ctx.save();
    rrect(ctx, -rightW / 2 + borderSize, -IH / 2 + borderSize, clipW, clipH, r(4));
    ctx.clip();
    
    if (img) {
      const iAR = img.naturalWidth / img.naturalHeight;
      const fAR = clipW / clipH;
      let drawW = clipW, drawH = clipH;
      let drawX = -clipW / 2, drawY = -clipH / 2;
      
      if (iAR > fAR) {
        drawW = clipH * iAR;
        drawX = -drawW / 2;
      } else {
        drawH = clipW / iAR;
        drawY = -drawH / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(-clipW / 2, -clipH / 2, clipW, clipH);
      ctx.font = `bold ${r(12)}px "Inter", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ PLACE IMAGE HERE ]", 0, 0);
    }
    ctx.restore();
    
    // Tapes
    drawTornTape(ctx, -rightW / 2 + r(10), -IH / 2 + r(5), r(58), r(22), -35);
    drawTornTape(ctx, rightW / 2 - r(10), IH / 2 - r(5), r(58), r(22), -35);
    
    ctx.restore();
    bounds.push({ id: "imageUrl", label: "Poster Image", x: rightCX, y: IY - IH / 2, w: rightW, h: IH });
    
  } else {
    // ── PORTRAIT/SQUARE LAYOUT (Vertical)
    let Y = PAD + r(38);

    // Category badge
    const badgeText = (data.category || `USE CASE ${idxStr}`).toUpperCase();
    ctx.font = `900 ${r(10.5)}px "Inter", sans-serif`;
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgeW = badgeTextW + r(18);
    const badgeH = r(24);
    
    ctx.save();
    ctx.translate(CX + badgeW / 2, Y + badgeH / 2);
    ctx.rotate(-2.5 * Math.PI / 180);
    ctx.fillStyle = "#111111";
    rrect(ctx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, r(12));
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, 0, 0);
    ctx.restore();
    
    bounds.push({ id: "category", label: "Badge", x: CX, y: Y, w: badgeW, h: badgeH });
    Y += badgeH + r(16);

    // Title
    let rawTitle = "";
    if (mode === "analysis") {
      rawTitle = data.instrument && data.levelName ? `${data.instrument} / ${data.levelName}` : (data.instrument || data.levelName || "Untitled");
    } else {
      rawTitle = data.title || "Untitled";
    }
    rawTitle = rawTitle.toLowerCase();

    let titleLines: string[] = [];
    if (rawTitle.includes("/")) {
      titleLines = rawTitle.split("/").map(s => s.trim());
    } else {
      ctx.font = `900 ${r(42)}px "Inter", sans-serif`;
      titleLines = wrap(ctx, rawTitle, CW);
    }
    
    let curTitleY = Y;
    const titleLH = r(46);
    titleLines.forEach((line, lineIdx) => {
      let text = line;
      if (lineIdx === titleLines.length - 1 && !text.endsWith(".")) {
        text = text + ".";
      }
      
      const isWhite = lineIdx % 2 === 0;
      ctx.font = `900 ${r(42)}px "Inter", sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      
      if (!isWhite && text.endsWith(".")) {
        const mainText = text.substring(0, text.length - 1);
        ctx.fillStyle = "#111111";
        ctx.fillText(mainText, CX, curTitleY);
        const mainTextW = ctx.measureText(mainText).width;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(".", CX + mainTextW, curTitleY);
      } else {
        ctx.fillStyle = isWhite ? "#FFFFFF" : "#111111";
        ctx.fillText(text, CX, curTitleY);
      }
      curTitleY += titleLH;
    });
    bounds.push({ id: "title", label: "Title", x: CX, y: Y, w: CW, h: curTitleY - Y });
    Y = curTitleY + r(14);

    // Description
    const boldFont = `bold 700 ${r(13.5)}px "Inter", sans-serif`;
    const normalFont = `500 ${r(13.5)}px "Inter", sans-serif`;
    
    const descLines = wrapFormattedText(ctx, descText, CW - r(10), normalFont, boldFont);
    let curDescY = Y;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    
    descLines.forEach((line) => {
      let curX = CX;
      line.forEach((item: any) => {
        ctx.font = item.isBold ? boldFont : normalFont;
        ctx.fillStyle = item.isBold ? "#FFFFFF" : "rgba(255, 255, 255, 0.85)";
        ctx.fillText(item.text, curX, curDescY);
        curX += ctx.measureText(item.text).width;
      });
      curDescY += r(20);
    });
    bounds.push({ id: "description", label: "Description", x: CX, y: Y, w: CW, h: curDescY - Y });

    // Tilted image container
    const IH = Math.max(r(180), Math.min(r(290), (H - PAD - r(50)) - curDescY - r(20)));
    const IY = curDescY + r(20) + IH / 2;
    
    ctx.save();
    ctx.translate(CX + CW / 2, IY);
    ctx.rotate(-1.5 * Math.PI / 180);
    
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = r(15);
    ctx.shadowOffsetY = r(8);
    
    ctx.fillStyle = "#FFFFFF";
    rrect(ctx, -CW / 2, -IH / 2, CW, IH, r(6));
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    
    const borderSize = r(4.5);
    const clipW = CW - borderSize * 2;
    const clipH = IH - borderSize * 2;
    
    ctx.save();
    rrect(ctx, -CW / 2 + borderSize, -IH / 2 + borderSize, clipW, clipH, r(4));
    ctx.clip();
    
    if (img) {
      const iAR = img.naturalWidth / img.naturalHeight;
      const fAR = clipW / clipH;
      let drawW = clipW, drawH = clipH;
      let drawX = -clipW / 2, drawY = -clipH / 2;
      
      if (iAR > fAR) {
        drawW = clipH * iAR;
        drawX = -drawW / 2;
      } else {
        drawH = clipW / iAR;
        drawY = -drawH / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(-clipW / 2, -clipH / 2, clipW, clipH);
      ctx.font = `bold ${r(12)}px "Inter", sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ PLACE IMAGE HERE ]", 0, 0);
    }
    ctx.restore();
    
    // Tapes
    drawTornTape(ctx, -CW / 2 + r(10), -IH / 2 + r(5), r(58), r(22), -35);
    drawTornTape(ctx, CW / 2 - r(10), IH / 2 - r(5), r(58), r(22), -35);
    
    ctx.restore();
    bounds.push({ id: "imageUrl", label: "Poster Image", x: CX, y: IY - IH / 2, w: CW, h: IH });
  }

  return bounds;
}

// ─── Trading-news poster (scroll-stopping carousel style) ────────────────────
// Distinct from drawChaseStylePoster (used for Daily Analysis / Indicator):
// full-bleed photo, bold headline band with a colored highlight-phrase chip,
// numbered/brand/dot carousel chrome, and a dedicated wide "cover" layout for
// slide #1 — the "what moved markets in the last 24h" briefing.

// Synthesizes a companion "explain it simply" bento card from a News story's
// AI-generated ELI5 fields (simpleHeadline/whatHappened/whyItMatters/
// simpleImpacts, written by the same news-batch generation call) — inserted
// right after its parent story in the final batch, never a standalone
// generation of its own.
function buildBentoCard(story: NewsItem): NewsItem {
  return {
    title: story.simpleHeadline || story.title,
    description: story.whatHappened || story.description,
    isBento: true,
    relatedTitle: story.title,
    simpleHeadline: story.simpleHeadline,
    simpleHeadlineHighlight: story.simpleHeadlineHighlight,
    whatHappened: story.whatHappened,
    whyItMatters: story.whyItMatters,
    simpleImpacts: story.simpleImpacts,
    sentiment: story.sentiment,
    // Carried over so the card can render the parent story's own photo as a
    // faint background echo — see drawBentoExplainerCard.
    imageUrl: story.imageUrl,
    imageFocusX: story.imageFocusX,
    imageFocusY: story.imageFocusY,
    imageZoom: story.imageZoom,
  };
}

// A Bento explainer card borrows its parent story's photo for its faint
// background (see drawBentoExplainerCard). buildBentoCard above copies that
// URL at construction time, but batches built before that existed — or
// hand-edited/pasted JSON — may still have a bento item with no imageUrl of
// its own. Fall back to the immediately preceding item (always the parent,
// per buildBentoCard's insertion order) at RENDER time instead, so the
// background shows up regardless of when/how the data was created.
function withBentoImageFallback(activeData: any, items: unknown[]): any {
  if (!activeData?.isBento || activeData.imageUrl || !Array.isArray(items)) return activeData;
  const idx = items.indexOf(activeData);
  const parent = idx > 0 ? (items[idx - 1] as any) : null;
  if (!parent?.imageUrl) return activeData;
  return { ...activeData, imageUrl: parent.imageUrl, imageFocusX: parent.imageFocusX, imageFocusY: parent.imageFocusY, imageZoom: parent.imageZoom };
}

// ─── External-AI JSON import ────────────────────────────────────────────────
// The "Copy Prompt" / "Show Prompt" flows hand the user a system prompt that
// asks the AI to reply with a NESTED wrapper object — {summary,posters,outro}
// for News, {cover,facts,outro} for Facts, {concept,cover,slides,recap,outro}
// for Learnings — because that's the exact shape each batch route's own
// server-side OpenAI call parses. But the poster renderer only ever consumes
// a FLAT NewsItem[] array (that's what setNewsData/the JSON tab expect), so a
// pasted AI reply in the "correct" (per the prompt) nested shape used to
// silently fail to render. These functions convert the nested reply into the
// same flat, clamped/resolved shape each route already produces server-side,
// so a pasted external-AI JSON renders exactly like a normal generation.

function importClampStr(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

function importResolveHighlight(title: string, candidate: unknown): string {
  const c = typeof candidate === "string" ? candidate : "";
  if (c && title.includes(c)) return c;
  const words = title.split(" ").filter(Boolean);
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

// Mirrors each route's resolveDescriptionHighlights — only keeps candidates
// that are genuine exact substrings of `text`, so nothing highlights text
// that was paraphrased instead of copy-pasted.
function importResolveHighlightTerms(text: string, candidates: unknown, max = 5, maxLen = 60): string[] {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const term = c.trim();
    if (!term || term.length > maxLen || !text.includes(term) || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= max) break;
  }
  return out;
}

function importResolveStringArray(v: unknown, max: number, itemMax = 120): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string" && !!s.trim())
    .slice(0, max)
    .map((s) => s.trim().slice(0, itemMax));
}

const IMPORT_VALID_SENTIMENT = new Set(["Bullish", "Bearish", "Neutral"]);
const IMPORT_VALID_DIRECTION = new Set(["up", "down", "neutral"]);
const IMPORT_VALID_CATEGORY = new Set(["Macro", "Geopolitical", "Corporate", "Sentiment", "Systemic"]);
const IMPORT_VALID_IMPACT = new Set(["High", "Medium", "Low"]);

// Same fixed brand set the automatic News Batch route always appends server-side
// (see COMMON_HASHTAGS in app/api/content-creator/news-batch/route.ts) — kept
// here too so a pasted external-AI reply gets the same brand-consistent tags.
const IMPORT_BRAND_HASHTAGS = ["#Stratix", "#Trading", "#ForexTrading", "#TradingSignals", "#FinancialMarkets", "#MarketNews", "#TradingCommunity"];
const IMPORT_HASHTAG_MAX = 30;

function isImportValidHashtag(v: unknown): v is string {
  return typeof v === "string" && /^#[A-Za-z0-9_]{2,40}$/.test(v.trim());
}

// Mirrors the route's resolveHashtags: normalizes/validates the model's own
// tags and merges in the fixed brand set, deduping case-insensitively.
function importResolveHashtags(candidates: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (tag: string) => {
    const key = tag.toLowerCase();
    if (seen.has(key) || out.length >= IMPORT_HASHTAG_MAX) return;
    seen.add(key);
    out.push(tag);
  };
  for (const tag of IMPORT_BRAND_HASHTAGS) add(tag);
  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const raw = typeof c === "string" ? c.trim() : "";
      const normalized = raw && !raw.startsWith("#") ? `#${raw}` : raw;
      if (isImportValidHashtag(normalized)) add(normalized);
    }
  }
  return out;
}

function importResolveCaption(candidate: unknown, fallback: string): string {
  return importClampStr(candidate, 500) || fallback;
}

function importResolveInstrumentImpacts(v: unknown): { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral" }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      symbol: importClampStr(a.symbol, 12).toUpperCase(),
      sentiment: (IMPORT_VALID_SENTIMENT.has(a.sentiment as string) ? a.sentiment : "Neutral") as "Bullish" | "Bearish" | "Neutral",
    }))
    .filter((a) => a.symbol)
    .slice(0, 4);
}

function importResolveSimpleImpacts(v: unknown): { market: string; effect: string; direction: "up" | "down" | "neutral" }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      market: importClampStr(a.market, 40),
      effect: importClampStr(a.effect, 80),
      direction: (IMPORT_VALID_DIRECTION.has(a.direction as string) ? a.direction : "neutral") as "up" | "down" | "neutral",
    }))
    .filter((a) => a.market && a.effect)
    .slice(0, 4);
}

/** Strips a ```json fence if present, then parses — throws a user-facing message on failure. */
function parsePastedAiJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste the AI's JSON reply first.");
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error("That doesn't look like valid JSON — check for a missing comma/quote, or that you copied the AI's entire reply.");
  }
}

function importNewsJson(raw: unknown): NewsItem[] {
  if (Array.isArray(raw)) {
    const items = raw.filter((p): p is NewsItem => !!p && typeof p === "object" && typeof (p as Record<string, unknown>).title === "string");
    if (items.length === 0) throw new Error('That array has no valid poster objects — each needs at least a "title".');
    return items;
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawPosters = Array.isArray(obj.posters) ? obj.posters : [];
  if (rawPosters.length === 0) {
    throw new Error('Expected an object with a "posters" array (the shape the News prompt asks for) — or a plain array of poster objects.');
  }

  const posters: NewsItem[] = rawPosters
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const title = importClampStr(p.title, 90);
      const description = importClampStr(p.description, 400);
      const sentiment = (IMPORT_VALID_SENTIMENT.has(p.sentiment as string) ? p.sentiment : "Neutral") as "Bullish" | "Bearish" | "Neutral";
      const simpleHeadline = importClampStr(p.simpleHeadline, 70) || title;
      const keyTakeaway = importClampStr(p.keyTakeaway, 240);
      return {
        title,
        highlightPhrase: importResolveHighlight(title, p.highlightPhrase),
        description,
        descriptionHighlights: importResolveHighlightTerms(description, p.descriptionHighlights),
        keyTakeaway,
        affectedAssets: importClampStr(p.affectedAssets, 80),
        instrumentImpacts: importResolveInstrumentImpacts(p.instrumentImpacts),
        impact: (IMPORT_VALID_IMPACT.has(p.impact as string) ? p.impact : "Medium") as "High" | "Medium" | "Low",
        sentiment,
        category: (IMPORT_VALID_CATEGORY.has(p.category as string) ? p.category : "Macro") as NewsItem["category"],
        source: importClampStr(p.source, 60, "Wire"),
        date: importClampStr(p.date, 30, new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
        imagePrompt: importClampStr(p.imagePrompt, 1200),
        imageUrl: "",
        simpleHeadline,
        simpleHeadlineHighlight: importResolveHighlight(simpleHeadline, p.simpleHeadlineHighlight),
        whatHappened: importClampStr(p.whatHappened, 400) || description,
        whyItMatters: importClampStr(p.whyItMatters, 240) || keyTakeaway,
        simpleImpacts: importResolveSimpleImpacts(p.simpleImpacts),
        caption: importResolveCaption(p.caption, `${title} — here's what it means for your trades. ${keyTakeaway}`.slice(0, 400)),
        hashtags: importResolveHashtags(p.hashtags),
      } as NewsItem;
    })
    .filter((p) => p.title && p.description);

  if (posters.length === 0) throw new Error("No usable posters found in the pasted JSON.");

  const rawSummary = (obj.summary && typeof obj.summary === "object" ? obj.summary : {}) as Record<string, unknown>;
  const coverOverview = importClampStr(rawSummary.overview, 420) ||
    "Top stories that matter for active traders — see the full breakdown in this carousel.";
  const coverAssets = importResolveInstrumentImpacts(rawSummary.topAssets);
  const topAssets = coverAssets.length > 0 ? coverAssets : Array.from(
    new Map(
      posters.flatMap((p) =>
        (p.affectedAssets || "").split(",").map((s) => s.trim()).filter(Boolean).map((symbol) => [symbol, p.sentiment ?? "Neutral"] as const)
      )
    ).entries()
  ).slice(0, 4).map(([symbol, sentiment]) => ({ symbol, sentiment }));
  const coverTitle = "News That Can Impact Your Trades";

  const cover: NewsItem = {
    title: coverTitle,
    highlightPhrase: importResolveHighlight(coverTitle, rawSummary.highlightPhrase),
    description: coverOverview,
    descriptionHighlights: importResolveHighlightTerms(coverOverview, rawSummary.overviewHighlights),
    keyTakeaway: importClampStr(rawSummary.marketBias, 240) || "Mixed cross-asset signals — check each story's affected instruments before positioning.",
    affectedAssets: topAssets.map((a) => a.symbol).join(", "),
    instrumentImpacts: topAssets,
    impact: "High",
    sentiment: topAssets[0]?.sentiment ?? "Neutral",
    source: "Stratix Desk",
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    imagePrompt: importClampStr(rawSummary.imagePrompt, 1200),
    imageUrl: "",
    isCover: true,
    topAssets,
    bulletHeadlines: importResolveStringArray(rawSummary.bulletHeadlines, 5).concat(posters.map((p) => p.title)).slice(0, 5),
    caption: importResolveCaption(rawSummary.caption, `${coverTitle} — ${coverOverview}`.slice(0, 400)),
    hashtags: importResolveHashtags(rawSummary.hashtags),
  };

  const rawOutro = (obj.outro && typeof obj.outro === "object" ? obj.outro : {}) as Record<string, unknown>;
  const outro: NewsItem = {
    title: importClampStr(rawOutro.headline, 60) || "We're Always Watching The Markets",
    description: importClampStr(rawOutro.subtext, 260) ||
      "We share real-time market news before every trading session. You might not find this page again — follow now to stay ahead.",
    cta: importClampStr(rawOutro.cta, 60) || "Follow for daily market briefings",
    imagePrompt: importClampStr(rawOutro.imagePrompt, 1200),
    imageUrl: "",
    isOutro: true,
  };

  const withBento = posters.flatMap((story) => [story, buildBentoCard(story)]);
  return [cover, ...withBento, outro];
}

function importFactsJson(raw: unknown): NewsItem[] {
  if (Array.isArray(raw)) {
    const items = raw.filter((p): p is NewsItem => !!p && typeof p === "object" && typeof (p as Record<string, unknown>).title === "string");
    if (items.length === 0) throw new Error('That array has no valid fact card objects — each needs at least a "title".');
    return items;
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawFacts = Array.isArray(obj.facts) ? obj.facts : [];
  if (rawFacts.length === 0) {
    throw new Error('Expected an object with a "facts" array (the shape the Facts prompt asks for) — or a plain array of fact objects.');
  }

  const facts: NewsItem[] = rawFacts
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const title = importClampStr(f.title, 90);
      return {
        title,
        highlightPhrase: importResolveHighlight(title, f.highlightPhrase),
        description: importClampStr(f.fact ?? f.description, 400),
        sourceNote: importClampStr(f.sourceNote, 160),
        imagePrompt: importClampStr(f.imagePrompt, 1200),
        imageUrl: "",
      } as NewsItem;
    })
    .filter((f) => f.title && f.description);

  if (facts.length === 0) throw new Error("No usable facts found in the pasted JSON.");

  const rawCover = (obj.cover && typeof obj.cover === "object" ? obj.cover : {}) as Record<string, unknown>;
  const coverOverview = importClampStr(rawCover.overview, 300) || "A quick round of verified facts about the instruments you trade.";
  const coverTitle = importClampStr(rawCover.title, 70) || `${facts.length} Things Every Trader Should Know Today`;
  const cover: NewsItem = {
    title: coverTitle,
    highlightPhrase: importResolveHighlight(coverTitle, rawCover.highlightPhrase),
    description: coverOverview,
    descriptionHighlights: importResolveHighlightTerms(coverOverview, rawCover.overviewHighlights, 3),
    bulletHeadlines: importResolveStringArray(rawCover.bulletHeadlines, 8).concat(facts.map((f) => f.title)).slice(0, 8),
    imagePrompt: importClampStr(rawCover.imagePrompt, 1200),
    imageUrl: "",
    isCover: true,
  };

  const rawOutro = (obj.outro && typeof obj.outro === "object" ? obj.outro : {}) as Record<string, unknown>;
  const outro: NewsItem = {
    title: importClampStr(rawOutro.headline, 60) || "We're Always Teaching The Markets",
    description: importClampStr(rawOutro.subtext, 200) || "Real, verified trading facts across Gold, Forex and Crypto — a little sharper every day.",
    cta: importClampStr(rawOutro.cta, 60) || "Follow for daily trading facts",
    imagePrompt: importClampStr(rawOutro.imagePrompt, 1200),
    imageUrl: "",
    isOutro: true,
  };

  return [cover, ...facts, outro];
}

function importLearningsJson(raw: unknown): NewsItem[] {
  if (Array.isArray(raw)) {
    const items = raw.filter((p): p is NewsItem => !!p && typeof p === "object" && typeof (p as Record<string, unknown>).title === "string");
    if (items.length === 0) throw new Error('That array has no valid slide objects — each needs at least a "title".');
    return items;
  }
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawSlides = Array.isArray(obj.slides) ? obj.slides : [];
  if (rawSlides.length === 0) {
    throw new Error('Expected an object with a "slides" array (the shape the Learnings prompt asks for) — or a plain array of slide objects.');
  }
  const concept = importClampStr(obj.concept, 80) || "Trading Concept";

  const stepSlides = rawSlides
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ heading: importClampStr(s.heading, 70), body: importClampStr(s.body, 360), imagePrompt: importClampStr(s.imagePrompt, 1200) }))
    .filter((s) => s.heading && s.body);

  if (stepSlides.length === 0) throw new Error("No usable slides found in the pasted JSON.");

  const rawRecap = (obj.recap && typeof obj.recap === "object" ? obj.recap : {}) as Record<string, unknown>;
  const recapBody = importClampStr(rawRecap.body, 360) || `${concept} — reviewed step by step. Save this slide as your quick-reference recap.`;
  const allSlides = [
    ...stepSlides,
    { heading: "Recap", body: recapBody, imagePrompt: importClampStr(rawRecap.imagePrompt, 1200) || stepSlides[stepSlides.length - 1]?.imagePrompt || "" },
  ];

  const slides: NewsItem[] = allSlides.map((s, i) => ({
    title: s.heading,
    description: s.body,
    concept,
    stepLabel: `Step ${i + 1} of ${allSlides.length}`,
    imagePrompt: s.imagePrompt,
    imageUrl: "",
  }));

  const rawCover = (obj.cover && typeof obj.cover === "object" ? obj.cover : {}) as Record<string, unknown>;
  const coverOverview = importClampStr(rawCover.overview, 300) || `A step-by-step walkthrough of ${concept}, explained the way a desk would teach it.`;
  const coverTitle = importClampStr(rawCover.title, 70) || `What You'll Learn: ${concept}`;
  const cover: NewsItem = {
    title: coverTitle,
    highlightPhrase: importResolveHighlight(coverTitle, rawCover.highlightPhrase),
    description: coverOverview,
    descriptionHighlights: importResolveHighlightTerms(coverOverview, rawCover.overviewHighlights, 3),
    concept,
    imagePrompt: importClampStr(rawCover.imagePrompt, 1200),
    imageUrl: "",
    isCover: true,
  };

  const rawOutro = (obj.outro && typeof obj.outro === "object" ? obj.outro : {}) as Record<string, unknown>;
  const outro: NewsItem = {
    title: importClampStr(rawOutro.headline, 60) || "We're Always Teaching The Markets",
    description: importClampStr(rawOutro.subtext, 200) || "Real trading concepts, taught clearly, across Gold, Forex and Crypto.",
    cta: importClampStr(rawOutro.cta, 60) || "Follow for daily lessons",
    imagePrompt: importClampStr(rawOutro.imagePrompt, 1200),
    imageUrl: "",
    isOutro: true,
  };

  return [cover, ...slides, outro];
}

/** Dispatches a pasted external-AI JSON payload (already `JSON.parse`d) to the right category transform. */
function importAiJson(category: "news" | "facts" | "learnings", raw: unknown): NewsItem[] {
  if (category === "news") return importNewsJson(raw);
  if (category === "facts") return importFactsJson(raw);
  return importLearningsJson(raw);
}

// The selectable "poster text color" combination — only the positive/
// bullish tint actually changes between the two; negative/bearish stays red
// and neutral body text stays white in both, per the user's request.
type SentimentScheme = "emerald" | "skyblue";

function sentimentPalette(sentiment?: string, scheme: SentimentScheme = "emerald"): { bg: string; fg: string } {
  if (sentiment === "Bullish") return { bg: scheme === "skyblue" ? "#0284c7" : "#10b981", fg: "#ffffff" };
  if (sentiment === "Bearish") return { bg: "#ef4444", fg: "#ffffff" };
  return { bg: "#f59e0b", fg: "#111111" };
}

interface HLToken { text: string; isHL: boolean; }

// Splits `title` into word tokens, keeping `highlight` (an exact substring)
// as ONE atomic token so it never breaks across a line — it renders as a
// single colored chip, like the boxed phrase in a tabloid-style headline.
function tokenizeHighlight(title: string, highlight: string): HLToken[] {
  const clean = (s: string) => s.split(" ").filter(Boolean).map((t) => ({ text: t, isHL: false }));
  if (!highlight || !title.includes(highlight)) return clean(title);
  const idx = title.indexOf(highlight);
  const before = title.slice(0, idx).trim();
  const after = title.slice(idx + highlight.length).trim();
  const tokens: HLToken[] = [];
  if (before) tokens.push(...clean(before));
  tokens.push({ text: highlight, isHL: true });
  if (after) tokens.push(...clean(after));
  return tokens;
}

function measureToken(ctx: CanvasRenderingContext2D, tok: HLToken, font: string, hlPadX: number): number {
  ctx.font = font;
  return ctx.measureText(tok.text).width + (tok.isHL ? hlPadX * 2 : 0);
}

function wrapHighlightLine(
  ctx: CanvasRenderingContext2D,
  tokens: HLToken[],
  maxW: number,
  font: string,
  hlPadX: number
): HLToken[][] {
  ctx.font = font;
  const spaceW = ctx.measureText(" ").width;
  const lines: HLToken[][] = [];
  let cur: HLToken[] = [];
  let curW = 0;
  for (const tok of tokens) {
    const w = measureToken(ctx, tok, font, hlPadX);
    const addW = cur.length > 0 ? spaceW + w : w;
    if (curW + addW > maxW && cur.length > 0) {
      lines.push(cur);
      cur = [tok];
      curW = w;
    } else {
      cur.push(tok);
      curW += addW;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

// Searches font sizes from large to small and returns the first (largest)
// that wraps within maxH — headlines should fill their band, not float small.
function fitHighlightTitle(
  ctx: CanvasRenderingContext2D,
  tokens: HLToken[],
  maxW: number,
  maxH: number,
  minSize: number,
  maxSize: number,
  fontFamily: string = '"Inter", "Arial Black", sans-serif',
  fontWeight: string = "900",
  lineHeightMult: number = 1.16
): { lines: HLToken[][]; fontSize: number; lineH: number; font: string } {
  for (let sz = maxSize; sz >= minSize; sz -= 1) {
    const font = `${fontWeight} ${sz}px ${fontFamily}`;
    const lines = wrapHighlightLine(ctx, tokens, maxW, font, sz * 0.26);
    const lineH = sz * lineHeightMult;
    if (lines.length * lineH <= maxH) {
      return { lines, fontSize: sz, lineH, font };
    }
  }
  const font = `${fontWeight} ${minSize}px ${fontFamily}`;
  return { lines: wrapHighlightLine(ctx, tokens, maxW, font, minSize * 0.26), fontSize: minSize, lineH: minSize * lineHeightMult, font };
}

// Draws center-aligned headline lines, rendering the highlighted token as a
// solid colored chip with contrasting text — the "CHINA FLOODS TRIGGER…"
// tabloid look — and everything else as plain bold black text.
function drawHighlightLines(
  ctx: CanvasRenderingContext2D,
  lines: HLToken[][],
  font: string,
  fontSize: number,
  lineH: number,
  centerX: number,
  startY: number,
  hlPadX: number,
  hlColor: { bg: string; fg: string },
  textColor: string
) {
  ctx.font = font;
  ctx.textBaseline = "middle";
  const spaceW = ctx.measureText(" ").width;

  lines.forEach((line, i) => {
    const widths = line.map((tok) => measureToken(ctx, tok, font, hlPadX));
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, line.length - 1);
    let x = centerX - totalW / 2;
    const y = startY + i * lineH + lineH / 2;

    line.forEach((tok, ti) => {
      const w = widths[ti];
      if (tok.isHL) {
        const boxH = fontSize * 1.12;
        rrect(ctx, x, y - boxH / 2, w, boxH, Math.min(fontSize * 0.16, 8));
        ctx.fillStyle = hlColor.bg;
        ctx.fill();
        ctx.font = font;
        ctx.fillStyle = hlColor.fg;
        ctx.textAlign = "left";
        ctx.fillText(tok.text, x + hlPadX, y + fontSize * 0.02);
      } else {
        ctx.font = font;
        ctx.fillStyle = textColor;
        ctx.textAlign = "left";
        ctx.fillText(tok.text, x, y + fontSize * 0.02);
      }
      x += w + spaceW;
    });
  });
}

// ─── Body-paragraph highlighting ───────────────────────────────────────────
// Unlike the headline's single boxed chip, body text can carry several
// highlight terms (numbers, entity names) — these render as bold colored
// words inline, not boxes, so a whole paragraph doesn't turn into a wall of
// chips. Words wrap normally; a highlighted phrase can break across lines.

// Finds each `highlights` term's first (non-overlapping) occurrence in
// `text` and splits it into plain/highlighted word tokens in reading order.
function tokenizeParagraphHighlights(text: string, highlights: string[]): HLToken[] {
  const words = (s: string) => s.split(" ").filter(Boolean).map((t) => ({ text: t, isHL: false as boolean }));
  if (!highlights || highlights.length === 0) return words(text);

  type Range = { start: number; end: number };
  const ranges: Range[] = [];
  for (const term of highlights) {
    if (!term) continue;
    const idx = text.indexOf(term);
    if (idx === -1) continue;
    const start = idx, end = idx + term.length;
    if (ranges.some((r) => start < r.end && end > r.start)) continue; // no overlaps
    ranges.push({ start, end });
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.length === 0) return words(text);

  const tokens: HLToken[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) tokens.push(...words(text.slice(cursor, range.start)));
    tokens.push(...text.slice(range.start, range.end).split(" ").filter(Boolean).map((t) => ({ text: t, isHL: true })));
    cursor = range.end;
  }
  if (cursor < text.length) tokens.push(...words(text.slice(cursor)));
  return tokens;
}

// Plain word-wrap (no atomic grouping, no chip padding) — highlighted words
// just render bold+colored in place, so wrapping is identical to normal text.
function wrapParagraphTokens(
  ctx: CanvasRenderingContext2D,
  tokens: HLToken[],
  maxW: number,
  normalFont: string,
  boldFont: string
): HLToken[][] {
  ctx.font = normalFont;
  const spaceW = ctx.measureText(" ").width;
  const lines: HLToken[][] = [];
  let cur: HLToken[] = [];
  let curW = 0;
  for (const tok of tokens) {
    ctx.font = tok.isHL ? boldFont : normalFont;
    const w = ctx.measureText(tok.text).width;
    const addW = cur.length > 0 ? spaceW + w : w;
    if (curW + addW > maxW && cur.length > 0) {
      lines.push(cur);
      cur = [tok];
      curW = w;
    } else {
      cur.push(tok);
      curW += addW;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function drawParagraphLines(
  ctx: CanvasRenderingContext2D,
  lines: HLToken[][],
  normalFont: string,
  boldFont: string,
  lineH: number,
  x: number,
  startY: number,
  normalColor: string,
  hlColor: string,
  align: "left" | "center" = "left",
  centerX?: number
) {
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    const y = startY + i * lineH + lineH / 2;
    const widths = line.map((tok) => {
      ctx.font = tok.isHL ? boldFont : normalFont;
      return ctx.measureText(tok.text).width;
    });
    ctx.font = normalFont;
    const spaceW = ctx.measureText(" ").width;
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, line.length - 1);
    let curX = align === "center" ? (centerX ?? x) - totalW / 2 : x;
    line.forEach((tok, ti) => {
      ctx.font = tok.isHL ? boldFont : normalFont;
      ctx.fillStyle = tok.isHL ? hlColor : normalColor;
      ctx.textAlign = "left";
      ctx.fillText(tok.text, curX, y);
      curX += widths[ti] + spaceW;
    });
  });
}

// Cover-fit math shared between the canvas renderer and the click-drag pan
// handler, so dragging the poster image always matches exactly what gets
// drawn — one axis fills the frame exactly at zoom 1, the other overflows;
// zoom scales both up from there, producing the "slack" (in px) available
// to pan along each axis.
function computeCoverFitSlack(imgAspect: number, frameW: number, frameH: number, zoom: number) {
  const frameAspect = frameW / frameH;
  let baseW = frameW, baseH = frameH;
  if (imgAspect > frameAspect) { baseH = frameH; baseW = frameH * imgAspect; }
  else { baseW = frameW; baseH = frameW / imgAspect; }
  const z = Math.max(1, Math.min(2.5, zoom || 1));
  return { slackX: baseW * z - frameW, slackY: baseH * z - frameH };
}

// Shared headline sizing — the SAME min/max font-size range (in unscaled px,
// multiply by `r()` at each call site) is used by every poster renderer
// (editorial story/cover, Facts/Learnings, Bold) so a given headline length
// lands at the same visual size regardless of which style generated it.
const HEADLINE_MIN_PX = 24;
const HEADLINE_MAX_PX = 52;

// Editorial "paper band" palette — light (default cream paper) or dark
// (near-black card). Drives band fill, text/muted/divider colors, and the
// rgb the photo seam fades into so the dissolve matches the band in both.
type EditorialTheme = "light" | "dark";
function editorialPalette(theme: EditorialTheme) {
  return theme === "dark"
    ? { band: "#000000", bandRgb: "0,0,0", text: "#ffffff", textSoft: "rgba(255,255,255,0.82)", muted: "rgba(255,255,255,0.5)", divider: "rgba(255,255,255,0.14)", bullet: "#f5f5f5" }
    : { band: "#FAFAF7", bandRgb: "250,250,247", text: "#111111", textSoft: "rgba(17,17,17,0.76)", muted: "rgba(17,17,17,0.5)", divider: "rgba(17,17,17,0.12)", bullet: "#1a1a1a" };
}

function drawTradingNewsPoster(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeNewsIndex: number,
  totalNewsCount: number,
  theme: EditorialTheme = "light",
  fadeIntensity: number = 100,
  sentimentScheme: SentimentScheme = "emerald"
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const isCover = !!data.isCover;
  const fadeMult = Math.max(0, Math.min(200, fadeIntensity)) / 100;
  const pal = sentimentPalette(data.sentiment, sentimentScheme);
  const th = editorialPalette(theme);

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const PAD = r(30);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;

  const topBandH = Math.round(H * (isCover ? 0.58 : 0.44));
  const photoY = topBandH;
  const photoH = H - photoY;

  // ── Top band (paper) ──────────────────────────────────────────────────
  ctx.fillStyle = th.band;
  ctx.fillRect(0, 0, W, topBandH);

  // Top accent bar — instant sentiment signal before reading a word: red for
  // news that's bad for the affected instrument's longs, emerald for good,
  // amber for neutral/policy.
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, r(5));

  let Y = r(34);

  // Eyebrow row
  if (isCover) {
    const label = "MARKET PULSE · LAST 24H";
    ctx.font = `900 ${r(12)}px "Inter", sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + r(20), bh = r(26);
    ctx.fillStyle = "#10b981";
    rrect(ctx, CX, Y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, CX + r(10), Y + bh / 2 + r(0.5));
    bounds.push({ id: "category", label: "Eyebrow", x: CX, y: Y, w: bw, h: bh });
    Y += bh + r(18);
  } else {
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    ctx.fillStyle = th.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const eyebrow = `${(data.source || "WIRE").toUpperCase()}  ·  ${(data.date || "").toUpperCase()}`;
    ctx.fillText(eyebrow, CX, Y + r(6));
    bounds.push({ id: "source", label: "Source & Date", x: CX, y: Y - r(8), w: CW, h: r(20) });
    Y += r(24);
  }

  // Headline with highlighted phrase — budgeted to leave room below for the
  // explanation paragraph (non-cover) or overview + bullets (cover), so a
  // long headline can't auto-fit itself into the rest of the band's space.
  const rawTitle = (data.title || "Untitled").trim();
  const tokens = tokenizeHighlight(rawTitle, data.highlightPhrase || "");
  const afterEyebrowH = topBandH - Y;
  const headlineMaxH = isCover ? afterEyebrowH - r(20) : Math.round(afterEyebrowH * 0.5);
  const minFont = r(HEADLINE_MIN_PX);
  const maxFont = r(HEADLINE_MAX_PX);
  const fit = fitHighlightTitle(ctx, tokens, CW, Math.max(headlineMaxH, minFont * 1.2), minFont, maxFont, getAntonFontFamily(), "400", 1.04);
  drawHighlightLines(ctx, fit.lines, fit.font, fit.fontSize, fit.lineH, W / 2, Y, fit.fontSize * 0.26, pal, th.text);
  bounds.push({ id: "title", label: "Headline", x: CX, y: Y, w: CW, h: fit.lines.length * fit.lineH });
  Y += fit.lines.length * fit.lineH + r(12);

  // Masthead date — cover only, sits directly beneath the fixed "News That
  // Can Impact Your Trades" title so the cover reads like a magazine issue
  // dated today, not a generic social graphic.
  if (isCover && data.date) {
    ctx.font = `700 ${r(12)}px "Inter", sans-serif`;
    ctx.fillStyle = th.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(data.date).toUpperCase(), W / 2, Y + r(7));
    Y += r(22);
  }

  if (!isCover) {
    // Trader-relevant explanation, with key numbers/entities highlighted —
    // renders directly below the headline, exactly like a news app.
    const descText = (data.description || "").trim();
    if (descText) {
      const descNormalFont = `600 ${r(16)}px "Inter", sans-serif`;
      const descBoldFont = `800 ${r(16)}px "Inter", sans-serif`;
      const descLineH = r(21);
      const descTokens = tokenizeParagraphHighlights(descText, Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []);
      const allDescLines = wrapParagraphTokens(ctx, descTokens, CW, descNormalFont, descBoldFont);
      const maxDescLines = Math.max(2, Math.floor((topBandH - Y - r(14)) / descLineH));
      let descLines = allDescLines.slice(0, maxDescLines);
      if (allDescLines.length > maxDescLines && descLines.length > 0) {
        const lastLine = [...descLines[descLines.length - 1]];
        const lastTok = { ...lastLine[lastLine.length - 1] };
        lastTok.text = lastTok.text.replace(/[.,;:]+$/, "") + "…";
        lastLine[lastLine.length - 1] = lastTok;
        descLines = [...descLines.slice(0, -1), lastLine];
      }
      drawParagraphLines(ctx, descLines, descNormalFont, descBoldFont, descLineH, CX, Y, th.textSoft, pal.bg, "left");
      bounds.push({ id: "description", label: "Explanation", x: CX, y: Y, w: CW, h: descLines.length * descLineH });
      Y += descLines.length * descLineH + r(6);
    }
  }

  if (isCover) {
    // Overview paragraph, with key numbers/entities highlighted
    const ovNormalFont = `600 ${r(15.5)}px "Inter", sans-serif`;
    const ovBoldFont = `800 ${r(15.5)}px "Inter", sans-serif`;
    const ovLineH = r(20);
    const ovTokens = tokenizeParagraphHighlights(data.description || "", Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []);
    const overviewLines = wrapParagraphTokens(ctx, ovTokens, CW * 0.92, ovNormalFont, ovBoldFont).slice(0, 3);
    drawParagraphLines(ctx, overviewLines, ovNormalFont, ovBoldFont, ovLineH, CX, Y, th.textSoft, pal.bg, "center", W / 2);
    bounds.push({ id: "description", label: "Overview", x: CX, y: Y, w: CW, h: overviewLines.length * ovLineH });
    Y += overviewLines.length * ovLineH + r(16);

    // Divider
    ctx.strokeStyle = th.divider;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CX, Y); ctx.lineTo(CXR, Y); ctx.stroke();
    Y += r(16);

    // Bullet roundup of the batch's stories
    const bullets: string[] = Array.isArray(data.bulletHeadlines) ? data.bulletHeadlines.slice(0, 5) : [];
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const bulletFont = `700 ${r(13.5)}px "Inter", sans-serif`;
    const bulletMaxY = topBandH - r(14);
    for (const headline of bullets) {
      if (Y + r(22) > bulletMaxY) break;
      ctx.fillStyle = "#10b981";
      ctx.beginPath(); ctx.arc(CX + r(4), Y + r(11), r(3.5), 0, Math.PI * 2); ctx.fill();
      ctx.font = bulletFont;
      ctx.fillStyle = th.bullet;
      let text = headline;
      while (ctx.measureText(text).width > CW - r(20) && text.length > 4) text = text.slice(0, -1);
      if (text !== headline) text = text.slice(0, -1) + "…";
      ctx.fillText(text, CX + r(14), Y + r(11));
      Y += r(24);
    }
  }

  // ── Photo area ───────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoY, W, photoH);
  ctx.clip();

  if (img) {
    const iAR = img.naturalWidth / img.naturalHeight;
    const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
    const { slackX, slackY } = computeCoverFitSlack(iAR, W, photoH, zoom);
    const fAR = W / photoH;
    let baseW = W, baseH = photoH;
    if (iAR > fAR) { baseH = photoH; baseW = photoH * iAR; }
    else { baseW = W; baseH = W / iAR; }
    const dw = baseW * zoom, dh = baseH * zoom;
    const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
    const dx = -slackX * focusX;
    const dy = photoY - slackY * focusY;
    ctx.drawImage(img, dx, dy, dw, dh);

    // Broad, eased fade at the seam — dissolves the paper band into the
    // photo over a wide span (not a thin edge line) so the transition reads
    // as a gradual dissolve from top to bottom, not a hard cut. Fades into the
    // band color so light and dark themes both blend seamlessly.
    // Long, slow dissolve — spans most of the photo height so the band color
    // bleeds gradually all the way down, never reading as a hard-edged cut.
    const fadeH = Math.round(photoH * 0.82);
    const fade = ctx.createLinearGradient(0, photoY, 0, photoY + fadeH);
    fade.addColorStop(0,    `rgba(${th.bandRgb},${1 * fadeMult})`);
    fade.addColorStop(0.14, `rgba(${th.bandRgb},${0.92 * fadeMult})`);
    fade.addColorStop(0.32, `rgba(${th.bandRgb},${0.68 * fadeMult})`);
    fade.addColorStop(0.52, `rgba(${th.bandRgb},${0.42 * fadeMult})`);
    fade.addColorStop(0.72, `rgba(${th.bandRgb},${0.22 * fadeMult})`);
    fade.addColorStop(0.88, `rgba(${th.bandRgb},${0.08 * fadeMult})`);
    fade.addColorStop(1,    `rgba(${th.bandRgb},0)`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, photoY, W, fadeH);
  } else {
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, photoY, W, photoH);
    ctx.font = `700 ${r(13)}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("[ PLACE IMAGE HERE — see Grok prompt ]", W / 2, photoY + photoH / 2);
  }

  // Bottom scrim for legible chrome
  const scrim = ctx.createLinearGradient(0, H - photoH * 0.42, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H - photoH * 0.42, W, photoH * 0.42);

  // Chip row — top-left of the photo area: impact level, then which
  // instruments this news moves and in which direction (per-instrument
  // colored chips: emerald ▲ bullish, red ▼ bearish, amber • neutral).
  {
    let chipX = CX;
    const chipY = photoY + r(16);
    const chipH = r(24);
    const rowMaxW = W - CX - r(16);

    if (!isCover && data.impact) {
      const impactDotColor = data.impact === "High" ? "#ef4444" : data.impact === "Medium" ? "#f59e0b" : "#9ca3af";
      const label = `${String(data.impact).toUpperCase()} IMPACT`;
      ctx.font = `800 ${r(10.5)}px "Inter", sans-serif`;
      const tw = ctx.measureText(label).width;
      const chipW = tw + r(26);
      ctx.fillStyle = "rgba(10,10,10,0.55)";
      rrect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = impactDotColor;
      ctx.beginPath(); ctx.arc(chipX + r(13), chipY + chipH / 2, r(3.5), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chipX + r(22), chipY + chipH / 2 + r(0.5));
      chipX += chipW + r(8);
    }

    const instrumentImpacts: { symbol: string; sentiment?: string }[] = Array.isArray(data.instrumentImpacts) ? data.instrumentImpacts : [];
    let chipRowY = chipY;
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    for (const inst of instrumentImpacts.slice(0, 4)) {
      if (!inst?.symbol) continue;
      const arrow = inst.sentiment === "Bullish" ? "▲" : inst.sentiment === "Bearish" ? "▼" : "•";
      const label = `${arrow} ${inst.symbol}`;
      const tw = ctx.measureText(label).width;
      const chipW = tw + r(18);
      if (chipX + chipW > CX + rowMaxW && chipX > CX) {
        chipX = CX;
        chipRowY += chipH + r(6);
      }
      const instPal = sentimentPalette(inst.sentiment, sentimentScheme);
      ctx.fillStyle = instPal.bg;
      rrect(ctx, chipX, chipRowY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = instPal.fg;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chipX + r(9), chipRowY + chipH / 2 + r(0.5));
      chipX += chipW + r(8);
    }
  }

  ctx.restore();
  bounds.push({ id: "imageUrl", label: "News Image", x: 0, y: photoY, w: W, h: photoH });

  // ── Carousel chrome over the photo ──────────────────────────────────
  const chromeY = H - r(30);

  // Numbered badge (bottom-left) — cover gets a "TODAY" chip instead of a number
  const badgeText = isCover ? "TODAY'S BRIEFING" : `#${Math.max(1, activeNewsIndex)}`;
  ctx.font = `900 ${r(13)}px "Inter", sans-serif`;
  const badgeTw = ctx.measureText(badgeText).width;
  const badgeW = badgeTw + r(20), badgeH = r(28);
  ctx.fillStyle = pal.bg;
  rrect(ctx, CX, chromeY - badgeH / 2, badgeW, badgeH, r(6));
  ctx.fill();
  ctx.fillStyle = pal.fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, CX + r(10), chromeY + r(0.5));

  // Brand handle (bottom-right)
  ctx.font = `900 ${r(13)}px "Inter", sans-serif`;
  const xW = ctx.measureText("X").width;
  ctx.textAlign = "right";
  ctx.fillStyle = "#10b981";
  ctx.fillText("X", CXR, chromeY + r(0.5));
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("STRATI", CXR - xW, chromeY + r(0.5));

  // Dot pagination (bottom-center)
  if (totalNewsCount > 1) {
    const dotSpacing = r(11);
    const totalDotsW = (totalNewsCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    for (let i = 0; i < totalNewsCount; i++) {
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, chromeY, r(2.6), 0, Math.PI * 2);
      ctx.fillStyle = i === activeNewsIndex ? "#FFFFFF" : "rgba(255,255,255,0.32)";
      ctx.fill();
    }
  }

  // NOTE: prev/next carousel arrows are real app UI (overlaid on the preview,
  // outside this canvas) — not drawn into the poster image. See the
  // "Preview carousel nav" buttons in the Interactive Preview panel below.

  return bounds;
}

// Facts and Learnings share this one renderer — a Fact card and a Learning
// slide are the same shape (headline + body + image), just with different
// chrome text. Deliberately mirrors drawTradingNewsPoster's paper-band/photo
// composition for visual-family consistency across every Stratix carousel,
// but drops the impact badge and instrument ticker chips since neither
// category carries per-story market sentiment.
function drawEducationalCard(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  kind: "facts" | "learnings",
  theme: EditorialTheme = "light",
  fadeIntensity: number = 100
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const isCover = !!data.isCover;
  const pal = { bg: "#10b981", fg: "#ffffff" };
  const th = editorialPalette(theme);
  const fadeMult = Math.max(0, Math.min(200, fadeIntensity)) / 100;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const PAD = r(30);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;

  const topBandH = Math.round(H * (isCover ? 0.58 : 0.44));
  const photoY = topBandH;
  const photoH = H - photoY;

  ctx.fillStyle = th.band;
  ctx.fillRect(0, 0, W, topBandH);

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, r(5));

  let Y = r(34);

  // Eyebrow row
  const brandLabel = kind === "facts" ? "STRATIX FACTS" : "STRATIX LEARNINGS";
  if (isCover) {
    const label = kind === "facts" ? "TODAY'S FACTS" : "WHAT YOU'LL LEARN TODAY";
    ctx.font = `900 ${r(12)}px "Inter", sans-serif`;
    const tw = ctx.measureText(label).width;
    const bw = tw + r(20), bh = r(26);
    ctx.fillStyle = pal.bg;
    rrect(ctx, CX, Y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, CX + r(10), Y + bh / 2 + r(0.5));
    bounds.push({ id: "category", label: "Eyebrow", x: CX, y: Y, w: bw, h: bh });
    Y += bh + r(18);
  } else {
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    ctx.fillStyle = th.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const eyebrow = data.stepLabel ? `${brandLabel}  ·  ${String(data.stepLabel).toUpperCase()}` : brandLabel;
    ctx.fillText(eyebrow, CX, Y + r(6));
    bounds.push({ id: "source", label: "Eyebrow", x: CX, y: Y - r(8), w: CW, h: r(20) });
    Y += r(24);
  }

  // Headline with highlighted phrase
  const rawTitle = (data.title || "Untitled").trim();
  const tokens = tokenizeHighlight(rawTitle, data.highlightPhrase || "");
  const afterEyebrowH = topBandH - Y;
  const headlineMaxH = isCover ? afterEyebrowH - r(20) : Math.round(afterEyebrowH * 0.5);
  const minFont = r(HEADLINE_MIN_PX);
  const maxFont = r(HEADLINE_MAX_PX);
  const fit = fitHighlightTitle(ctx, tokens, CW, Math.max(headlineMaxH, minFont * 1.2), minFont, maxFont, getAntonFontFamily(), "400", 1.04);
  drawHighlightLines(ctx, fit.lines, fit.font, fit.fontSize, fit.lineH, W / 2, Y, fit.fontSize * 0.26, pal, th.text);
  bounds.push({ id: "title", label: "Headline", x: CX, y: Y, w: CW, h: fit.lines.length * fit.lineH });
  Y += fit.lines.length * fit.lineH + r(12);

  if (!isCover) {
    const descText = (data.description || "").trim();
    if (descText) {
      const descNormalFont = `600 ${r(16)}px "Inter", sans-serif`;
      const descBoldFont = `800 ${r(16)}px "Inter", sans-serif`;
      const descLineH = r(21);
      const descTokens = tokenizeParagraphHighlights(descText, Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []);
      const allDescLines = wrapParagraphTokens(ctx, descTokens, CW, descNormalFont, descBoldFont);
      const maxDescLines = Math.max(2, Math.floor((topBandH - Y - r(14)) / descLineH));
      let descLines = allDescLines.slice(0, maxDescLines);
      if (allDescLines.length > maxDescLines && descLines.length > 0) {
        const lastLine = [...descLines[descLines.length - 1]];
        const lastTok = { ...lastLine[lastLine.length - 1] };
        lastTok.text = lastTok.text.replace(/[.,;:]+$/, "") + "…";
        lastLine[lastLine.length - 1] = lastTok;
        descLines = [...descLines.slice(0, -1), lastLine];
      }
      drawParagraphLines(ctx, descLines, descNormalFont, descBoldFont, descLineH, CX, Y, th.textSoft, pal.bg, "left");
      bounds.push({ id: "description", label: kind === "facts" ? "The Fact" : "Explanation", x: CX, y: Y, w: CW, h: descLines.length * descLineH });
      Y += descLines.length * descLineH + r(6);
    }
  }

  if (isCover) {
    const ovNormalFont = `600 ${r(15.5)}px "Inter", sans-serif`;
    const ovBoldFont = `800 ${r(15.5)}px "Inter", sans-serif`;
    const ovLineH = r(20);
    const ovTokens = tokenizeParagraphHighlights(data.description || "", Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []);
    const overviewLines = wrapParagraphTokens(ctx, ovTokens, CW * 0.92, ovNormalFont, ovBoldFont).slice(0, 3);
    drawParagraphLines(ctx, overviewLines, ovNormalFont, ovBoldFont, ovLineH, CX, Y, th.textSoft, pal.bg, "center", W / 2);
    bounds.push({ id: "description", label: "Overview", x: CX, y: Y, w: CW, h: overviewLines.length * ovLineH });
    Y += overviewLines.length * ovLineH + r(16);

    ctx.strokeStyle = th.divider;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CX, Y); ctx.lineTo(CXR, Y); ctx.stroke();
    Y += r(16);

    const bullets: string[] = Array.isArray(data.bulletHeadlines) ? data.bulletHeadlines.slice(0, 6) : [];
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const bulletFont = `700 ${r(13.5)}px "Inter", sans-serif`;
    const bulletMaxY = topBandH - r(14);
    for (const headline of bullets) {
      if (Y + r(22) > bulletMaxY) break;
      ctx.fillStyle = pal.bg;
      ctx.beginPath(); ctx.arc(CX + r(4), Y + r(11), r(3.5), 0, Math.PI * 2); ctx.fill();
      ctx.font = bulletFont;
      ctx.fillStyle = th.bullet;
      let text = headline;
      while (ctx.measureText(text).width > CW - r(20) && text.length > 4) text = text.slice(0, -1);
      if (text !== headline) text = text.slice(0, -1) + "…";
      ctx.fillText(text, CX + r(14), Y + r(11));
      Y += r(24);
    }
  }

  // ── Photo area ───────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoY, W, photoH);
  ctx.clip();

  if (img) {
    const iAR = img.naturalWidth / img.naturalHeight;
    const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
    const { slackX, slackY } = computeCoverFitSlack(iAR, W, photoH, zoom);
    const fAR = W / photoH;
    let baseW = W, baseH = photoH;
    if (iAR > fAR) { baseH = photoH; baseW = photoH * iAR; }
    else { baseW = W; baseH = W / iAR; }
    const dw = baseW * zoom, dh = baseH * zoom;
    const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
    const dx = -slackX * focusX;
    const dy = photoY - slackY * focusY;
    ctx.drawImage(img, dx, dy, dw, dh);

    // Long, slow dissolve — spans most of the photo height so the band color
    // bleeds gradually all the way down, never reading as a hard-edged cut.
    const fadeH = Math.round(photoH * 0.82);
    const fade = ctx.createLinearGradient(0, photoY, 0, photoY + fadeH);
    fade.addColorStop(0,    `rgba(${th.bandRgb},${1 * fadeMult})`);
    fade.addColorStop(0.14, `rgba(${th.bandRgb},${0.92 * fadeMult})`);
    fade.addColorStop(0.32, `rgba(${th.bandRgb},${0.68 * fadeMult})`);
    fade.addColorStop(0.52, `rgba(${th.bandRgb},${0.42 * fadeMult})`);
    fade.addColorStop(0.72, `rgba(${th.bandRgb},${0.22 * fadeMult})`);
    fade.addColorStop(0.88, `rgba(${th.bandRgb},${0.08 * fadeMult})`);
    fade.addColorStop(1,    `rgba(${th.bandRgb},0)`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, photoY, W, fadeH);
  } else {
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, photoY, W, photoH);
    ctx.font = `700 ${r(13)}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("[ PLACE IMAGE HERE — see Grok prompt ]", W / 2, photoY + photoH / 2);
  }

  const scrim = ctx.createLinearGradient(0, H - photoH * 0.42, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H - photoH * 0.42, W, photoH * 0.42);

  // Related-instrument chips (Facts only, optional) — plain, no sentiment
  // arrows, since these are structural facts, not directional calls.
  if (!isCover && kind === "facts" && Array.isArray(data.relatedInstruments) && data.relatedInstruments.length > 0) {
    let chipX = CX;
    const chipY = photoY + r(16);
    const chipH = r(24);
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    for (const symbol of (data.relatedInstruments as string[]).slice(0, 4)) {
      if (!symbol) continue;
      const tw = ctx.measureText(symbol).width;
      const chipW = tw + r(18);
      ctx.fillStyle = "rgba(16,185,129,0.85)";
      rrect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(symbol, chipX + r(9), chipY + chipH / 2 + r(0.5));
      chipX += chipW + r(8);
    }
  }

  ctx.restore();
  bounds.push({ id: "imageUrl", label: kind === "facts" ? "Fact Image" : "Slide Image", x: 0, y: photoY, w: W, h: photoH });

  // ── Carousel chrome over the photo ──────────────────────────────────
  const chromeY = H - r(30);

  const badgeText = isCover
    ? (kind === "facts" ? "TODAY'S FACTS" : "TODAY'S LESSON")
    : (data.stepLabel || `#${Math.max(1, activeIndex)}`);
  ctx.font = `900 ${r(13)}px "Inter", sans-serif`;
  const badgeTw = ctx.measureText(badgeText).width;
  const badgeW = badgeTw + r(20), badgeH = r(28);
  ctx.fillStyle = pal.bg;
  rrect(ctx, CX, chromeY - badgeH / 2, badgeW, badgeH, r(6));
  ctx.fill();
  ctx.fillStyle = pal.fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, CX + r(10), chromeY + r(0.5));

  ctx.font = `900 ${r(13)}px "Inter", sans-serif`;
  const xW = ctx.measureText("X").width;
  ctx.textAlign = "right";
  ctx.fillStyle = "#10b981";
  ctx.fillText("X", CXR, chromeY + r(0.5));
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("STRATI", CXR - xW, chromeY + r(0.5));

  if (totalCount > 1) {
    const dotSpacing = r(11);
    const totalDotsW = (totalCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    for (let i = 0; i < totalCount; i++) {
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, chromeY, r(2.6), 0, Math.PI * 2);
      ctx.fillStyle = i === activeIndex ? "#FFFFFF" : "rgba(255,255,255,0.32)";
      ctx.fill();
    }
  }

  return bounds;
}

// Resolves the actual (possibly hashed) font-family string next/font/google
// assigned to the Anton display face, via the `--font-display` CSS variable
// set on <html> in app/layout.tsx. Canvas can't read CSS custom properties
// inside a font shorthand string, so this reads the computed value once and
// falls back to a heavy condensed system stack if it's ever unavailable
// (e.g. during SSR — this file is client-only, but defensive regardless).
let cachedAntonFamily: string | null = null;
function getAntonFontFamily(): string {
  if (cachedAntonFamily) return cachedAntonFamily;
  const fallback = '"Arial Narrow Bold", "Arial Black", sans-serif';
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim();
  cachedAntonFamily = raw ? `${raw}, ${fallback}` : fallback;
  return cachedAntonFamily;
}

// "Bold & Trending" style — an alternate look for News/Facts/Learnings,
// selectable from the Colors tab (default stays the editorial paper-band
// renderers above). Full-bleed moody gradient, huge condensed uppercase
// headline, white pill badges — one shared renderer for all three
// categories (same pattern as drawEducationalCard for facts/learnings),
// differing only in eyebrow copy.
function drawBoldPoster(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  kind: "news" | "facts" | "learnings",
  gradient: GradientPreset,
  fadeIntensity: number = 100,
  sentimentScheme: SentimentScheme = "emerald"
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const fadeMult = Math.max(0, Math.min(200, fadeIntensity)) / 100;
  const isCover = !!data.isCover;
  const [stopA, stopB] = gradient.stops;

  // Theme-aware foreground colors — flipped to dark for light-toned presets
  // (Pure White) so text/pills/dots stay legible against any gradient.
  const isLight = !!gradient.isLight;
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const fgSoft = isLight ? "rgba(10,10,10,0.78)" : "rgba(255,255,255,0.82)";
  const fgMuted = isLight ? "rgba(10,10,10,0.68)" : "rgba(255,255,255,0.7)";
  const fgFaint = isLight ? "rgba(10,10,10,0.32)" : "rgba(255,255,255,0.3)";
  const pillBg = isLight ? "#111111" : "#ffffff";
  const pillFg = gradient.pillAccent ?? gradient.accent;
  const dotActive = isLight ? "#0a0a0a" : "#ffffff";
  const dotInactive = isLight ? "rgba(10,10,10,0.32)" : "rgba(255,255,255,0.32)";
  const scrimBase = isLight ? "255,255,255" : "0,0,0";

  const PAD = r(30);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;

  // ── Measurement pre-pass ────────────────────────────────────────────────
  // Everything below the photo (eyebrow, headline, description, chips,
  // chrome) is measured BEFORE the photo is drawn, so the photo's share of
  // the frame (`contentZoneH`) can shrink to guarantee the description
  // always renders in FULL — never truncated with an ellipsis — instead of
  // a fixed 56/44 split that clips longer descriptions.
  const idealContentZoneH = Math.round(H * 0.56);
  const floorContentZoneH = Math.round(H * 0.3);

  const eyebrowLabel = kind === "news"
    ? (isCover ? "TODAY'S BRIEFING" : "TRENDING")
    : kind === "facts"
    ? (isCover ? "TODAY'S FACTS" : "FACT")
    : (isCover ? "TODAY'S LESSON" : (data.stepLabel ? String(data.stepLabel).toUpperCase() : "LESSON"));
  const eyebrowBH = r(30);
  const eyebrowGapAfter = r(18);

  // The highlighted phrase carries the pop of color. For news story cards it
  // takes the sentiment color — positive tint (emerald or sky blue, per the
  // user-selectable scheme) when bullish, red when bearish — so the deck
  // reads at a glance like the editorial style; covers and Facts/Learnings
  // (no sentiment) use the gradient accent.
  const sentiment = data.sentiment;
  const newsHighlightColor = sentiment === "Bullish" ? (sentimentScheme === "skyblue" ? "#0ea5e9" : "#34d399") : sentiment === "Bearish" ? "#fb7185" : gradient.accent;
  const highlightColor = (kind === "news" && !isCover) ? newsHighlightColor : gradient.accent;
  // On the two strict monochrome themes, the accent highlight is the SAME
  // brightness extreme as the base text color (pure white on Jet Black, pure
  // black on Pure White) — hue can't separate them, so give the base text a
  // real brightness cut (not a token one) to keep the highlight unmistakable.
  // Every colored gradient keeps full-strength base text — hue alone already
  // separates the highlight there, no dimming needed.
  const headlineBase = !gradient.monochrome
    ? fg
    : isLight ? "rgba(10,10,10,0.55)" : "rgba(255,255,255,0.58)";

  const rawTitle = (data.title || "Untitled").trim().toUpperCase();
  const highlight = (data.highlightPhrase || "").trim().toUpperCase();
  const tokens = tokenizeHighlight(rawTitle, highlight);
  const instrumentImpacts: { symbol: string; sentiment?: string }[] =
    (kind === "news" && !isCover && Array.isArray(data.instrumentImpacts)) ? data.instrumentImpacts : [];
  const chipReserve = instrumentImpacts.length > 0 ? r(34) : 0;
  const bottomReserve = r(70) + chipReserve; // swipe hint + pagination + chip row
  const descLineH = r(20);
  const descBudget = data.description ? descLineH * 3 + r(10) : 0;

  const YafterEyebrow_ideal = idealContentZoneH + r(28) + eyebrowBH + eyebrowGapAfter;
  const headlineMaxH = Math.max(H - YafterEyebrow_ideal - bottomReserve - descBudget, r(40));
  const antonFamily = getAntonFontFamily();
  setTracking(ctx, -r(0.4));
  const fit = fitHighlightTitle(ctx, tokens, CW, headlineMaxH, r(HEADLINE_MIN_PX), r(HEADLINE_MAX_PX), antonFamily, "400", 1.04);
  setTracking(ctx, 0);
  let YafterHeadline_ideal = YafterEyebrow_ideal + fit.lines.length * fit.lineH + r(10);
  if (isCover && kind === "news" && data.date) YafterHeadline_ideal += r(22);

  // Description — full text, auto-fit rather than truncated. First choice
  // is to reclaim room from the photo (text stays full-size, the image just
  // gives up some of its share of the frame, down to a floor); only if the
  // photo is already at that floor and it's still not enough does the type
  // itself shrink, as an absolute last resort — it never drops words.
  const descText = (data.description || "").trim();
  const barW = r(3), barGap = r(14);
  const descX = CX + barW + barGap;
  const descW = CW - barW - barGap;
  const descTokens = descText ? tokenizeParagraphHighlights(descText, Array.isArray(data.descriptionHighlights) ? data.descriptionHighlights : []) : [];

  let contentZoneH = idealContentZoneH;
  let descLines: HLToken[][] = [];
  let descNormalFont = `600 ${r(15.5)}px "Inter", sans-serif`;
  let descBoldFont = `800 ${r(15.5)}px "Inter", sans-serif`;
  let descLineHFinal = descLineH;

  if (descText) {
    const wrapAt = (size: number) => {
      const nf = `600 ${r(size)}px "Inter", sans-serif`;
      const bf = `800 ${r(size)}px "Inter", sans-serif`;
      return { lines: wrapParagraphTokens(ctx, descTokens, descW, nf, bf), lineH: r(size * 1.29), nf, bf };
    };
    let attempt = wrapAt(15.5);
    let neededH = attempt.lines.length * attempt.lineH;
    let availH = H - r(30) - bottomReserve - YafterHeadline_ideal;

    if (neededH > availH) {
      const shortfall = neededH - availH;
      contentZoneH = Math.max(floorContentZoneH, idealContentZoneH - shortfall);
      availH += idealContentZoneH - contentZoneH;

      if (neededH > availH) {
        for (let size = 14.5; size >= 11; size -= 0.5) {
          attempt = wrapAt(size);
          neededH = attempt.lines.length * attempt.lineH;
          if (neededH <= availH) break;
        }
      }
    }
    descLines = attempt.lines;
    descNormalFont = attempt.nf;
    descBoldFont = attempt.bf;
    descLineHFinal = attempt.lineH;
  }

  // ── Background ───────────────────────────────────────────────────────
  // Full-bleed diagonal gradient base — everything else layers on top.
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, stopA);
  bgGrad.addColorStop(1, stopB);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Accent glow rising behind the lower content — this is what gives the
  // reference poster its rich "perfect shade" depth instead of a flat wash.
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.7, 0, W * 0.5, H * 0.7, W * 0.85);
  glow.addColorStop(0, hexToRgba(gradient.accent, (isLight ? 0.14 : 0.28) * fadeMult));
  glow.addColorStop(0.55, hexToRgba(gradient.accent, (isLight ? 0.05 : 0.1) * fadeMult));
  glow.addColorStop(1, hexToRgba(gradient.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Secondary tight glow behind the masthead — gives the logo a lit "stage"
  // instead of floating flat on a corner of the gradient.
  const glow2 = ctx.createRadialGradient(W * 0.08, H * 0.05, 0, W * 0.08, H * 0.05, W * 0.55);
  glow2.addColorStop(0, hexToRgba(gradient.accent, (isLight ? 0.08 : 0.16) * fadeMult));
  glow2.addColorStop(1, hexToRgba(gradient.accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Vignette — darkens the four edges so the eye is pulled back toward the
  // center content column instead of drifting off the frame.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, `rgba(0,0,0,${isLight ? 0.1 : 0.32})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // Film grain — the cheapest way to turn a flat gradient into a textured,
  // printed surface instead of a screenshot-flat wash.
  paintGrain(ctx, W, H, isLight ? 0.035 : 0.05);

  if (img) {
    // Seamless, slow dissolve: draw the photo on an offscreen layer spanning
    // the ENTIRE poster height, fade ITS OWN alpha out gradually across that
    // whole span (never fully to zero — a faint trace survives to the very
    // bottom edge), then composite over the gradient+glow. Because the photo
    // melts into transparency rather than a fixed color, the gradient shows
    // straight through underneath — no hard band anywhere.
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const octx = off.getContext("2d");
    if (octx) {
      const iAR = img.naturalWidth / img.naturalHeight;
      const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
      const { slackX, slackY } = computeCoverFitSlack(iAR, W, H, zoom);
      const fAR = W / H;
      let baseW = W, baseH = H;
      if (iAR > fAR) { baseH = H; baseW = H * iAR; }
      else { baseW = W; baseH = W / iAR; }
      const dw = baseW * zoom, dh = baseH * zoom;
      const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
      const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
      octx.drawImage(img, -slackX * focusX, -slackY * focusY, dw, dh);

      octx.globalCompositeOperation = "destination-in";
      const mask = octx.createLinearGradient(0, 0, 0, H);
      mask.addColorStop(0,    "rgba(0,0,0,1)");
      mask.addColorStop(0.38, "rgba(0,0,0,1)");
      mask.addColorStop(0.6,  "rgba(0,0,0,0.62)");
      mask.addColorStop(0.8,  "rgba(0,0,0,0.28)");
      mask.addColorStop(1,    "rgba(0,0,0,0.06)");
      octx.fillStyle = mask;
      octx.fillRect(0, 0, W, H);

      ctx.drawImage(off, 0, 0);
    }
    bounds.push({ id: "imageUrl", label: "Background Image", x: 0, y: 0, w: W, h: H });

    // Content-contrast scrim — ramps up toward the bottom, tinted with this
    // gradient's own far stop, so the copy stays legible even though the
    // (now very faint) image remains visible underneath all the way down.
    const contentScrim = ctx.createLinearGradient(0, contentZoneH * 0.7, 0, H);
    contentScrim.addColorStop(0,   `rgba(${scrimBase},0)`);
    contentScrim.addColorStop(0.4, `rgba(${scrimBase},${0.35 * fadeMult})`);
    contentScrim.addColorStop(0.7, `rgba(${scrimBase},${0.62 * fadeMult})`);
    contentScrim.addColorStop(1,   `rgba(${scrimBase},${0.86 * fadeMult})`);
    ctx.fillStyle = contentScrim;
    ctx.fillRect(0, contentZoneH * 0.7, W, H - contentZoneH * 0.7);

    // Faint top scrim so the logo badge reads over bright photos too.
    const topScrim = ctx.createLinearGradient(0, 0, 0, r(90));
    topScrim.addColorStop(0, `rgba(${scrimBase},${0.35 * fadeMult})`);
    topScrim.addColorStop(1, `rgba(${scrimBase},0)`);
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, W, r(90));
  } else {
    bounds.push({ id: "imageUrl", label: "Background Image", x: 0, y: 0, w: W, h: contentZoneH });
    ctx.font = `700 ${r(12)}px "Inter", sans-serif`;
    ctx.fillStyle = fgFaint;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("[ ATTACH IMAGE — see Grok prompt ]", W / 2, contentZoneH * 0.5);
  }

  // Logo — the plain themed wordmark (same treatment as the Outro card),
  // sized up from the old pill badge, "X" tinted with this gradient's own
  // accent so the brand mark matches whichever color is currently selected.
  {
    const logoFontSize = r(23);
    const logoY = r(24) + r(16);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = r(12);
    ctx.shadowOffsetY = r(2);
    drawWordmark(ctx, CX, logoY, logoFontSize, fg, gradient.accent, "left", "middle");
    ctx.restore();

    // Render-time date/time — top-right, mirroring the logo on the opposite
    // side at the exact same vertical position.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = r(8);
    ctx.shadowOffsetY = r(1);
    ctx.font = `700 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.4));
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fgMuted;
    ctx.fillText(formatPosterTimestamp(), CXR, logoY);
    setTracking(ctx, 0);
    ctx.restore();
  }

  // Eyebrow pill — same theme-flipped pill treatment as the logo badge.
  // Centered horizontally on the cover/intro slide only (its own dedicated
  // moment); every other slide keeps it left-aligned with the rest of the copy.
  let Y = contentZoneH + r(28);
  {
    ctx.font = `900 ${r(12.5)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.6));
    const tw = ctx.measureText(eyebrowLabel).width;
    const dotGap = r(16);
    const bw = tw + r(20) + dotGap, bh = eyebrowBH;
    const pillX = isCover ? (W - bw) / 2 : CX;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = r(10);
    ctx.shadowOffsetY = r(3);
    ctx.fillStyle = pillBg;
    rrect(ctx, pillX, Y, bw, bh, bh / 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(pillX + r(14), Y + bh / 2, r(3), 0, Math.PI * 2);
    ctx.fillStyle = pillFg;
    ctx.fill();
    ctx.fillStyle = pillFg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(eyebrowLabel, pillX + r(10) + dotGap, Y + bh / 2 + r(0.5));
    setTracking(ctx, 0);
    bounds.push({ id: "category", label: "Eyebrow", x: pillX, y: Y, w: bw, h: bh });
    Y += bh + eyebrowGapAfter;
  }

  // Headline — huge, condensed, ALL CAPS, center-aligned, set in Anton (the
  // dedicated poster/display face, not Inter) with a dark stroke behind the
  // fill on colored gradients — matches the reference poster's exact type
  // treatment instead of approximating it with a heavy system weight.
  // `fit` was already computed in the measurement pre-pass above — reused
  // as-is so the headline's size never depends on where the photo ended up.
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  // Skip the stroke on the two monochrome themes — the highlight there is
  // already carried by a brightness cut (see headlineBase above), and a
  // same-tone stroke behind a translucent fill just muddies the edge.
  const useStroke = !gradient.monochrome;
  setTracking(ctx, -r(0.4));
  fit.lines.forEach((line, li) => {
    ctx.font = fit.font;
    const widths = line.map((tok) => ctx.measureText(tok.text).width);
    const spaceW = ctx.measureText(" ").width;
    const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, line.length - 1);
    let x = W / 2 - totalW / 2;
    const baseline = Y + li * fit.lineH + fit.fontSize * 0.86;
    line.forEach((tok, ti) => {
      ctx.font = fit.font;
      if (useStroke) {
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.lineWidth = fit.fontSize * 0.1;
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.strokeText(tok.text, x, baseline);
      }
      ctx.fillStyle = tok.isHL ? highlightColor : headlineBase;
      ctx.fillText(tok.text, x, baseline);
      x += widths[ti] + spaceW;
    });
  });
  setTracking(ctx, 0);
  bounds.push({ id: "title", label: "Headline", x: CX, y: Y, w: CW, h: fit.lines.length * fit.lineH });
  Y += fit.lines.length * fit.lineH + r(10);

  // Masthead date — News cover only, same "magazine issue dated today"
  // treatment as the editorial style's cover.
  if (isCover && kind === "news" && data.date) {
    ctx.font = `700 ${r(12)}px "Inter", sans-serif`;
    ctx.fillStyle = fgSoft;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(data.date).toUpperCase(), W / 2, Y + r(7));
    Y += r(22);
  }

  // Description — always shown IN FULL, never truncated with an ellipsis
  // (see the measurement pre-pass above: `descLines` and its font were
  // already sized to fit completely, reclaiming room from the photo and,
  // as a last resort, shrinking the type itself).
  if (descText && descLines.length > 0) {
    const descBlockH = descLines.length * descLineHFinal;
    ctx.fillStyle = highlightColor;
    rrect(ctx, CX, Y + r(2), barW, descBlockH - r(4), barW / 2);
    ctx.fill();
    drawParagraphLines(ctx, descLines, descNormalFont, descBoldFont, descLineHFinal, descX, Y, fgSoft, highlightColor, "left");
    bounds.push({ id: "description", label: "Explanation", x: CX, y: Y, w: CW, h: descBlockH });
    Y += descBlockH + r(12);
  }

  // Bottom chrome — swipe hint (hidden on the last card) + segmented
  // pagination rail, stacked as two rows so the rail can run the card's
  // full content width instead of competing with the swipe text for space.
  const chromeY = H - r(30);
  const swipeY = chromeY - r(5);
  const railY = chromeY + r(11);

  // Instrument-impact chips (news story cards) — green ▲ bullish, red ▼
  // bearish, amber ● neutral, each fused to a solid icon badge. This is
  // where the green/red reads on the Bold card; placed below the copy,
  // clear of the swipe row.
  if (instrumentImpacts.length > 0) {
    const chipH = r(30);
    const chipY = Math.min(Y, chromeY - r(20) - chipH);
    let chipX = CX;
    const labelFont = `800 ${r(12)}px "Inter", sans-serif`;
    ctx.font = labelFont;
    for (const inst of instrumentImpacts.slice(0, 4)) {
      if (!inst?.symbol) continue;
      const arrow = inst.sentiment === "Bullish" ? "▲" : inst.sentiment === "Bearish" ? "▼" : "●";
      const label = inst.symbol.toUpperCase();
      const tw = ctx.measureText(label).width;
      const badgeD = chipH - r(6);
      const chipW = badgeD + r(10) + tw + r(16);
      if (chipX + chipW > CXR && chipX > CX) break;
      const pal = sentimentPalette(inst.sentiment, sentimentScheme);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = r(10);
      ctx.shadowOffsetY = r(3);
      ctx.fillStyle = pal.bg;
      rrect(ctx, chipX, chipY, chipW, chipH, chipH / 2);
      ctx.fill();
      ctx.restore();
      drawIconBadge(ctx, chipX + r(3) + badgeD / 2, chipY + chipH / 2, badgeD, "rgba(0,0,0,0.18)", pal.fg, arrow, r(11));
      ctx.font = labelFont;
      ctx.fillStyle = pal.fg;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, chipX + badgeD + r(13), chipY + chipH / 2 + r(0.5));
      chipX += chipW + r(10);
    }
  }
  if (activeIndex < totalCount - 1) {
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(1));
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fgMuted;
    ctx.fillText("SWIPE", CX, swipeY);
    const swipeW = ctx.measureText("SWIPE").width;
    setTracking(ctx, 0);
    const chevX = CX + swipeW + r(10);
    ctx.strokeStyle = fgMuted;
    ctx.lineWidth = r(1.6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 2; i++) {
      const ox = chevX + i * r(6);
      ctx.beginPath();
      ctx.moveTo(ox, swipeY - r(4));
      ctx.lineTo(ox + r(4), swipeY);
      ctx.lineTo(ox, swipeY + r(4));
      ctx.stroke();
    }
  }
  if (totalCount > 1) {
    drawSegmentedPagination(ctx, CX, railY, CW, r(3), totalCount, activeIndex, dotActive, dotInactive);
  }

  // Top hairline — a thin gradient bar across the very top edge, the kind of
  // masthead touch that separates a poster from a plain screenshot.
  const hairline = ctx.createLinearGradient(0, 0, W, 0);
  hairline.addColorStop(0, hexToRgba(gradient.accent, 0));
  hairline.addColorStop(0.5, hexToRgba(gradient.accent, isLight ? 0.55 : 0.85));
  hairline.addColorStop(1, hexToRgba(gradient.accent, 0));
  ctx.fillStyle = hairline;
  ctx.fillRect(0, 0, W, r(2.5));

  return bounds;
}

// The batch's final slide — a calm, brand-forward sign-off, deliberately the
// opposite mood of the story cards: no impact badge, no ticker chips, no
// eyebrow, just the wordmark, the sign-off line, and one CTA. Shared by
// every category (News/Facts/Learnings) so the batch always closes the same
// way regardless of what generated it — dispatched mode-agnostically from
// drawPoster via `data.isOutro`.
// #RRGGBB -> "rgba(r,g,b,alpha)" — used to tint the outro's Bold-style CTA
// pill with whichever gradient accent is active, without a full color lib.
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const rr = (bigint >> 16) & 255, gg = (bigint >> 8) & 255, bb = bigint & 255;
  return `rgba(${rr}, ${gg}, ${bb}, ${alpha})`;
}

// Picks a guaranteed-legible text color for text painted on top of an
// arbitrary fill color — needed anywhere a gradient preset's `accent` (which
// can be near-white on light/monochrome presets) is used as a pill/chip
// background, so the label on top never goes white-on-white or black-on-black.
function contrastTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const rr = (bigint >> 16) & 255, gg = (bigint >> 8) & 255, bb = bigint & 255;
  const luminance = (0.299 * rr + 0.587 * gg + 0.114 * bb) / 255;
  return luminance > 0.6 ? "#0a0a0a" : "#ffffff";
}

function drawOutroCard(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  gradient?: GradientPreset
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const accentColor = gradient?.accent ?? "#10b981";
  const isLight = !!gradient?.isLight;
  const fg = isLight ? "#0a0a0a" : "#ffffff";
  const fgWordmark = isLight ? "rgba(10,10,10,0.88)" : "rgba(255,255,255,0.92)";
  const fgSubtext = isLight ? "rgba(10,10,10,0.6)" : "rgba(255,255,255,0.62)";
  const dotActive = isLight ? "#0a0a0a" : "#ffffff";
  const dotInactive = isLight ? "rgba(10,10,10,0.32)" : "rgba(255,255,255,0.32)";
  const scrimRgb = isLight ? "250,250,250" : "6,8,7";

  // Background: full-bleed cover-fit image, darkened, if one's attached —
  // otherwise a calm wash (the Bold style's gradient preset when active,
  // else the default charcoal-to-emerald look). Either way this reads as
  // "settled", not "breaking news".
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  if (img) {
    const iAR = img.naturalWidth / img.naturalHeight;
    const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
    const { slackX, slackY } = computeCoverFitSlack(iAR, W, H, zoom);
    const fAR = W / H;
    let baseW = W, baseH = H;
    if (iAR > fAR) { baseH = H; baseW = H * iAR; }
    else { baseW = W; baseH = W / iAR; }
    const dw = baseW * zoom, dh = baseH * zoom;
    const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
    ctx.drawImage(img, -slackX * focusX, -slackY * focusY, dw, dh);
    bounds.push({ id: "imageUrl", label: "Background Image", x: 0, y: 0, w: W, h: H });
  } else if (gradient) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, gradient.stops[0]);
    bg.addColorStop(1, gradient.stops[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.9);
    bg.addColorStop(0, "#132520");
    bg.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Scrim over the whole frame (heavier than the story-card photo scrim) so
  // the sign-off text sits calmly on top regardless of what's underneath.
  // Tinted light instead of dark on the Pure White theme so it stays a wash,
  // not a muddy overlay, under the now-dark text.
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, `rgba(${scrimRgb},0.72)`);
  scrim.addColorStop(0.45, `rgba(${scrimRgb},0.55)`);
  scrim.addColorStop(1, `rgba(${scrimRgb},0.86)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  const CX = r(40), CXR = W - r(40), CW = CXR - CX;
  ctx.textAlign = "center";

  // Wordmark — the shared themed wordmark, sized up as the centerpiece here.
  const markY = H * 0.3;
  drawWordmark(ctx, W / 2, markY, r(22), fgWordmark, accentColor, "center", "alphabetic");
  ctx.textAlign = "center";

  // Headline
  const headline = (data.title || "We're Always Watching The Markets").trim();
  const headlineFit = fitText(ctx, headline, CW, H * 0.16, r(24), r(38));
  let Y = markY + r(46);
  ctx.font = `800 ${headlineFit.fontSize}px "Inter", sans-serif`;
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  headlineFit.lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, Y + i * headlineFit.lineSpacing + headlineFit.lineSpacing / 2);
  });
  bounds.push({ id: "title", label: "Headline", x: CX, y: Y, w: CW, h: headlineFit.lines.length * headlineFit.lineSpacing });
  Y += headlineFit.lines.length * headlineFit.lineSpacing + r(14);

  // Subtext
  const subtext = (data.description || "").trim();
  if (subtext) {
    ctx.font = `500 ${r(14)}px "Inter", sans-serif`;
    const subLines = wrap(ctx, subtext, CW * 0.82).slice(0, 4);
    const subLineH = r(20);
    ctx.fillStyle = fgSubtext;
    subLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, Y + i * subLineH + subLineH / 2);
    });
    bounds.push({ id: "description", label: "Subtext", x: CX, y: Y, w: CW, h: subLines.length * subLineH });
    Y += subLines.length * subLineH + r(24);
  }

  // CTA pill
  const cta = (data.cta || "Follow for daily market briefings").trim();
  ctx.font = `700 ${r(12.5)}px "Inter", sans-serif`;
  const ctaW = ctx.measureText(cta).width + r(44);
  const ctaH = r(38);
  const ctaX = W / 2 - ctaW / 2;
  ctx.strokeStyle = hexToRgba(accentColor, 0.55);
  ctx.lineWidth = 1.5;
  ctx.fillStyle = hexToRgba(accentColor, 0.12);
  rrect(ctx, ctaX, Y, ctaW, ctaH, ctaH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.fillText(cta, W / 2, Y + ctaH / 2 + r(0.5));
  bounds.push({ id: "cta", label: "Call To Action", x: ctaX, y: Y, w: ctaW, h: ctaH });

  // Dot pagination — kept for carousel-position continuity with every other
  // card in the batch, even though the badge/ticker chrome is dropped.
  if (totalCount > 1) {
    const chromeY = H - r(30);
    const dotSpacing = r(11);
    const totalDotsW = (totalCount - 1) * dotSpacing;
    const startDotX = (W - totalDotsW) / 2;
    for (let i = 0; i < totalCount; i++) {
      ctx.beginPath();
      ctx.arc(startDotX + i * dotSpacing, chromeY, r(2.6), 0, Math.PI * 2);
      ctx.fillStyle = i === activeIndex ? dotActive : dotInactive;
      ctx.fill();
    }
  }

  return bounds;
}

// A News story's plain-language companion card — a bento grid of "What
// Happened", "Why It Matters", and per-market impact chips, all written for
// a reader who has never heard of this story before today. Deliberately a
// different visual language from the trader-facing story card it follows:
// light, warm, rounded cells rather than a dark editorial/bold treatment —
// this is the one card in the batch meant to feel approachable, not urgent.
// Takes no image (bento cards never carry a photo) — `gradient` is optional
// purely for accent-color continuity with the batch's Bold gradient choice,
// same "only when Bold is active" convention as drawOutroCard.
function drawBentoExplainerCard(
  ctx: CanvasRenderingContext2D,
  data: any,
  img: HTMLImageElement | null | undefined,
  W: number,
  H: number,
  r: Rfn,
  activeIndex: number,
  totalCount: number,
  gradient?: GradientPreset,
  sentimentScheme: SentimentScheme = "emerald"
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const accent = gradient?.accent ?? "#10b981";
  const isLight = gradient ? !!gradient.isLight : true;
  const bg = isLight ? "#fbfaf7" : "#111412";
  const cardBg = isLight ? "#ffffff" : "rgba(255,255,255,0.05)";
  const cardBorder = isLight ? "rgba(10,10,10,0.08)" : "rgba(255,255,255,0.08)";
  const textPrimary = isLight ? "#161613" : "rgba(255,255,255,0.92)";
  const textMuted = isLight ? "rgba(22,22,19,0.55)" : "rgba(255,255,255,0.55)";
  const dotActive = isLight ? "#161613" : "#ffffff";
  const dotInactive = isLight ? "rgba(22,22,19,0.28)" : "rgba(255,255,255,0.28)";
  // Section labels are painted in `accent` directly on the (near-)white card
  // background in light mode — if accent is itself very light (some
  // monochrome presets), that text would vanish too, so fall back to the
  // primary text color whenever accent can't carry its own contrast here.
  const accentReadableOnCard = !(isLight && contrastTextColor(accent) === "#0a0a0a");
  const labelColor = accentReadableOnCard ? accent : textPrimary;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The parent story's own photo, bled in at very low visibility — a faint
  // echo that ties this explainer card back to the story it's unpacking,
  // without competing with the (approachable, text-first) content on top.
  if (img) {
    const iAR = img.naturalWidth / img.naturalHeight;
    const zoom = Math.max(1, Math.min(2.5, data.imageZoom || 1));
    const { slackX, slackY } = computeCoverFitSlack(iAR, W, H, zoom);
    const fAR = W / H;
    let baseW = W, baseH = H;
    if (iAR > fAR) { baseH = H; baseW = H * iAR; }
    else { baseW = W; baseH = W / iAR; }
    const dw = baseW * zoom, dh = baseH * zoom;
    const focusX = Math.max(0, Math.min(1, data.imageFocusX ?? 0.5));
    const focusY = Math.max(0, Math.min(1, data.imageFocusY ?? 0.5));
    ctx.save();
    ctx.globalAlpha = isLight ? 0.07 : 0.12;
    ctx.drawImage(img, -slackX * focusX, -slackY * focusY, dw, dh);
    ctx.restore();
  }

  const glow = ctx.createRadialGradient(W * 0.18, H * 0.06, 0, W * 0.18, H * 0.06, W * 0.75);
  glow.addColorStop(0, hexToRgba(accent, isLight ? 0.1 : 0.18));
  glow.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Second, tighter glow low-right — balances the frame so it doesn't read
  // as lit from a single corner only.
  const glow2 = ctx.createRadialGradient(W * 0.86, H * 0.92, 0, W * 0.86, H * 0.92, W * 0.6);
  glow2.addColorStop(0, hexToRgba(accent, isLight ? 0.06 : 0.12));
  glow2.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Film grain — same treatment as the Bold card, so a viewer swiping
  // between card kinds feels one continuous printed system, not two apps.
  paintGrain(ctx, W, H, isLight ? 0.03 : 0.045);

  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, hexToRgba(accent, 0.5));
  topBar.addColorStop(0.5, accent);
  topBar.addColorStop(1, hexToRgba(accent, 0.5));
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, r(6));

  const PAD = r(28);
  const CX = PAD, CXR = W - PAD, CW = CXR - CX;
  let Y = r(24);

  // Logo — the plain themed wordmark (same treatment as the Outro/Bold
  // cards), sized up from the old pill badge, "X" tinted with this
  // gradient's own accent. `badgeH` stays as the row-height reference the
  // eyebrow pill below centers itself against.
  {
    const badgeH = r(30);
    const logoFontSize = r(21);
    ctx.save();
    ctx.shadowColor = isLight ? "rgba(20,20,15,0.22)" : "rgba(0,0,0,0.4)";
    ctx.shadowBlur = r(10);
    ctx.shadowOffsetY = r(2);
    drawWordmark(ctx, CX, Y + badgeH / 2, logoFontSize, textPrimary, accent, "left", "middle");
    ctx.restore();

    // Eyebrow pill, right-aligned on the same row. Text color is computed
    // against the actual pill fill (not hardcoded white) — on light/
    // monochrome gradient presets `accent` can itself be near-white, and
    // white-on-white silently renders as an empty pill.
    const eyebrowText = "EXPLAINED SIMPLY";
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.5));
    const dotGap = r(14);
    const eyebrowW = ctx.measureText(eyebrowText).width + r(20) + dotGap;
    const eyebrowH = r(28);
    const eyebrowX = CXR - eyebrowW;
    const eyebrowY = Y + (badgeH - eyebrowH) / 2;
    const eyebrowFg = contrastTextColor(accent);
    ctx.save();
    ctx.shadowColor = isLight ? "rgba(20,20,15,0.14)" : "rgba(0,0,0,0.3)";
    ctx.shadowBlur = r(10);
    ctx.shadowOffsetY = r(3);
    ctx.fillStyle = accent;
    rrect(ctx, eyebrowX, eyebrowY, eyebrowW, eyebrowH, eyebrowH / 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(eyebrowX + r(13), eyebrowY + eyebrowH / 2, r(2.8), 0, Math.PI * 2);
    ctx.fillStyle = eyebrowFg;
    ctx.fill();
    // `drawWordmark` above set textAlign/textBaseline INSIDE its own
    // save/restore, so both reverted to canvas defaults ("start"/
    // "alphabetic") when it restored — set them explicitly here rather
    // than relying on leftover state, or this text silently drifts off
    // true vertical center within the pill.
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = eyebrowFg;
    ctx.fillText(eyebrowText, eyebrowX + r(11) + dotGap, eyebrowY + eyebrowH / 2 + r(0.5));
    setTracking(ctx, 0);

    // Render-time date/time — sits just left of the eyebrow pill, same row
    // and same vertical position as the logo on the opposite side.
    ctx.font = `700 ${r(10.5)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.4));
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textMuted;
    ctx.fillText(formatPosterTimestamp(), eyebrowX - r(12), Y + badgeH / 2);
    setTracking(ctx, 0);

    Y += badgeH + r(22);
  }

  // Everything below is measured BEFORE anything is drawn: each section's
  // box is sized to the actual wrapped text it holds (not a guessed
  // fraction of canvas height), and whatever vertical space is left over —
  // common on tall aspect ratios like Story — becomes extra breathing room
  // between sections instead of a dead gap after the last one or a
  // half-empty box in the middle.
  const impacts: { market: string; effect: string; direction: string }[] = Array.isArray(data.simpleImpacts) ? data.simpleImpacts.slice(0, 4) : [];
  const chipGap = r(12);
  const chipH = r(68);
  const chipRows = impacts.length > 0 ? Math.ceil(impacts.length / 2) : 0;
  const impactsSectionH = impacts.length > 0 ? r(30) + chipRows * chipH + Math.max(0, chipRows - 1) * chipGap : 0;
  // Matches the Bold card's own bottom-chrome reserve now that the footer
  // sits at that same fixed chromeY-based position (swipe row + rail row),
  // so content never crowds into it.
  const footerReserve = r(70);

  // Headline — measure the fitted block first, box hugs it with fixed padding.
  const headline = String(data.simpleHeadline || data.title || "").trim();
  const tokens = tokenizeHighlight(headline, String(data.simpleHeadlineHighlight || ""));
  const headlinePadX = r(24), headlinePadY = r(28);
  const fit = fitHighlightTitle(ctx, tokens, CW - headlinePadX * 2, H * 0.32, r(24), r(42), '"Inter", "Arial Black", sans-serif', "900", 1.14);
  const headlineBlockH = fit.lines.length * fit.lineH;
  const zoneH = Math.max(headlineBlockH + headlinePadY * 2, r(120));

  // Two-cell row — measure both cells' wrapped content at their real font
  // sizes so the shared row height matches whichever cell needs more room.
  const rowGap = r(14);
  const leftW = Math.round(CW * 0.56);
  const rightX = CX + leftW + rowGap;
  const rightW = CW - leftW - rowGap;

  const whPadX = r(18), whPadTop = r(50), whPadBottom = r(26);
  const whatHappened = String(data.whatHappened || data.description || "").trim();
  ctx.font = `600 ${r(17)}px "Inter", sans-serif`;
  const whLineH = r(23);
  const whLines = wrap(ctx, whatHappened, leftW - whPadX * 2).slice(0, 9);
  const leftContentH = whPadTop + whLines.length * whLineH + whPadBottom;

  const wmPadX = r(16), wmPadBottom = r(24);
  ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
  const whyLabelLines = wrap(ctx, "WHY IT MATTERS", rightW - wmPadX * 2);
  const whyItMatters = String(data.whyItMatters || "").trim();
  ctx.font = `600 ${r(15.5)}px "Inter", sans-serif`;
  const wmLineH = r(21);
  const wmLines = wrap(ctx, whyItMatters, rightW - wmPadX * 2).slice(0, 9);
  const wmTextStartOffset = r(28) + whyLabelLines.length * r(15) + r(14);
  const rightContentH = wmTextStartOffset + wmLines.length * wmLineH + wmPadBottom;

  const rowH = Math.max(leftContentH, rightContentH, r(150));

  // Distribute leftover vertical space as extra gap between sections.
  const baseGap = r(20);
  const gapCount = 2 + (impacts.length > 0 ? 1 : 0);
  const minUsedH = Y + zoneH + baseGap + rowH + (impacts.length > 0 ? baseGap + impactsSectionH : 0) + baseGap + footerReserve;
  const leftover = Math.max(0, H - minUsedH);
  const sectionGap = baseGap + Math.min(leftover / gapCount, r(180));

  // ---- Draw headline ----
  ctx.save();
  ctx.shadowColor = isLight ? "rgba(20,20,15,0.14)" : "rgba(0,0,0,0.5)";
  ctx.shadowBlur = r(22);
  ctx.shadowOffsetY = r(8);
  ctx.fillStyle = cardBg;
  rrect(ctx, CX, Y, CW, zoneH, r(22));
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1;
  rrect(ctx, CX, Y, CW, zoneH, r(22));
  ctx.stroke();
  // Glossy inner top edge — a thin highlight along the flat span between
  // the rounded corners, the detail that reads as "glass" rather than flat.
  ctx.strokeStyle = isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX + r(22), Y + 1);
  ctx.lineTo(CX + CW - r(22), Y + 1);
  ctx.stroke();
  const headlineStartY = Y + (zoneH - headlineBlockH) / 2;
  // Same white-on-white guard as the eyebrow pill above.
  drawHighlightLines(ctx, fit.lines, fit.font, fit.fontSize, fit.lineH, W / 2, headlineStartY, r(8), { bg: accent, fg: contrastTextColor(accent) }, textPrimary);
  bounds.push({ id: "simpleHeadline", label: "Simple Headline", x: CX, y: Y, w: CW, h: zoneH });
  Y += zoneH + sectionGap;

  // ---- Draw two-cell row ----
  ctx.save();
  ctx.shadowColor = isLight ? "rgba(20,20,15,0.12)" : "rgba(0,0,0,0.45)";
  ctx.shadowBlur = r(18);
  ctx.shadowOffsetY = r(6);
  ctx.fillStyle = cardBg;
  rrect(ctx, CX, Y, leftW, rowH, r(18));
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = cardBorder;
  ctx.lineWidth = 1;
  rrect(ctx, CX, Y, leftW, rowH, r(18));
  ctx.stroke();
  ctx.strokeStyle = isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(CX + r(18), Y + 1);
  ctx.lineTo(CX + leftW - r(18), Y + 1);
  ctx.stroke();

  const labelBadgeD = r(18);
  drawIconBadge(ctx, CX + whPadX + labelBadgeD / 2, Y + r(24), labelBadgeD, hexToRgba(accent, isLight ? 0.14 : 0.2), labelColor, "▸", r(9.5));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
  setTracking(ctx, r(0.3));
  ctx.fillStyle = labelColor;
  ctx.fillText("WHAT HAPPENED", CX + whPadX + labelBadgeD + r(8), Y + r(28));
  setTracking(ctx, 0);

  ctx.font = `600 ${r(17)}px "Inter", sans-serif`;
  ctx.fillStyle = textPrimary;
  ctx.textBaseline = "middle";
  whLines.forEach((line, i) => ctx.fillText(line, CX + whPadX, Y + whPadTop + i * whLineH + whLineH / 2));
  bounds.push({ id: "whatHappened", label: "What Happened", x: CX, y: Y, w: leftW, h: rowH });

  ctx.save();
  ctx.shadowColor = isLight ? "rgba(20,20,15,0.1)" : "rgba(0,0,0,0.4)";
  ctx.shadowBlur = r(16);
  ctx.shadowOffsetY = r(5);
  ctx.fillStyle = hexToRgba(accent, isLight ? 0.09 : 0.16);
  rrect(ctx, rightX, Y, rightW, rowH, r(18));
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = hexToRgba(accent, isLight ? 0.35 : 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rightX + r(18), Y + 1);
  ctx.lineTo(rightX + rightW - r(18), Y + 1);
  ctx.stroke();

  const wmBadgeD = r(18);
  drawIconBadge(ctx, rightX + wmPadX + wmBadgeD / 2, Y + r(24), wmBadgeD, hexToRgba(accent, isLight ? 0.22 : 0.3), labelColor, "!", r(10.5));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
  setTracking(ctx, r(0.3));
  ctx.fillStyle = labelColor;
  whyLabelLines.forEach((line, i) => ctx.fillText(line, rightX + wmPadX + wmBadgeD + r(8), Y + r(28) + i * r(15)));
  setTracking(ctx, 0);

  ctx.font = `600 ${r(15.5)}px "Inter", sans-serif`;
  ctx.fillStyle = textPrimary;
  ctx.textBaseline = "middle";
  const wmStartY = Y + wmTextStartOffset;
  wmLines.forEach((line, i) => ctx.fillText(line, rightX + wmPadX, wmStartY + i * wmLineH + wmLineH / 2));
  bounds.push({ id: "whyItMatters", label: "Why It Matters", x: rightX, y: Y, w: rightW, h: rowH });

  Y += rowH;

  // ---- Draw impact chips — plain-language per-market effect, 2 per row.
  // An odd count's last card spans the full width instead of leaving an
  // empty cell beside it. ----
  if (impacts.length > 0) {
    Y += sectionGap;
    // Small accent bar, matching the Bold card's description marker — ties
    // this label to the same visual language as the other section labels'
    // icon badges instead of sitting there as plain, unmarked text.
    ctx.fillStyle = accent;
    rrect(ctx, CX, Y - r(9), r(3), r(11), r(1.5));
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 ${r(12)}px "Inter", sans-serif`;
    setTracking(ctx, r(0.5));
    ctx.fillStyle = textMuted;
    ctx.fillText("WHO THIS AFFECTS", CX + r(10), Y);
    setTracking(ctx, 0);
    Y += r(18);

    const chipW = Math.floor((CW - chipGap) / 2);
    const impactBadgeD = r(22);
    const oddLast = impacts.length % 2 === 1;
    impacts.forEach((imp, i) => {
      const isFullWidth = oddLast && i === impacts.length - 1;
      const col = i % 2, row = Math.floor(i / 2);
      const cx = isFullWidth ? CX : CX + col * (chipW + chipGap);
      const cy = Y + row * (chipH + chipGap);
      const w = isFullWidth ? CW : chipW;
      const dirColor = imp.direction === "up" ? (sentimentScheme === "skyblue" ? "#0284c7" : "#10b981") : imp.direction === "down" ? "#ef4444" : "#f59e0b";
      const arrow = imp.direction === "up" ? "▲" : imp.direction === "down" ? "▼" : "●";
      ctx.save();
      ctx.shadowColor = isLight ? "rgba(20,20,15,0.1)" : "rgba(0,0,0,0.4)";
      ctx.shadowBlur = r(12);
      ctx.shadowOffsetY = r(4);
      ctx.fillStyle = hexToRgba(dirColor, isLight ? 0.1 : 0.16);
      rrect(ctx, cx, cy, w, chipH, r(16));
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = hexToRgba(dirColor, 0.32);
      ctx.lineWidth = 1;
      rrect(ctx, cx, cy, w, chipH, r(16));
      ctx.stroke();

      drawIconBadge(ctx, cx + r(13) + impactBadgeD / 2, cy + r(19), impactBadgeD, dirColor, "#ffffff", arrow, r(11));

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${r(14)}px "Inter", sans-serif`;
      ctx.fillStyle = dirColor;
      ctx.fillText(imp.market, cx + r(13) + impactBadgeD + r(9), cy + r(19) + r(0.5));

      ctx.font = `600 ${r(12.5)}px "Inter", sans-serif`;
      ctx.fillStyle = textMuted;
      ctx.textBaseline = "alphabetic";
      const effLines = wrap(ctx, imp.effect, w - r(28)).slice(0, 2);
      effLines.forEach((line, li) => ctx.fillText(line, cx + r(14), cy + r(46) + li * r(15)));
    });
    Y += impactsSectionH - r(30);
  }

  // Footer — swipe hint + segmented progress rail, at the EXACT same fixed
  // position as the Bold card's (chromeY/swipeY/railY below are copied
  // constants, not derived from content height) so the carousel's bottom
  // chrome never jumps between card kinds as the viewer swipes through.
  const chromeY = H - r(30);
  const swipeY = chromeY - r(5);
  const railY = chromeY + r(11);
  if (activeIndex < totalCount - 1) {
    ctx.font = `800 ${r(11)}px "Inter", sans-serif`;
    setTracking(ctx, r(1));
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textMuted;
    ctx.fillText("SWIPE", CX, swipeY);
    const swipeW = ctx.measureText("SWIPE").width;
    setTracking(ctx, 0);
    const chevX = CX + swipeW + r(10);
    ctx.strokeStyle = textMuted;
    ctx.lineWidth = r(1.6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < 2; i++) {
      const ox = chevX + i * r(6);
      ctx.beginPath();
      ctx.moveTo(ox, swipeY - r(4));
      ctx.lineTo(ox + r(4), swipeY);
      ctx.lineTo(ox, swipeY + r(4));
      ctx.stroke();
    }
  }
  if (totalCount > 1) {
    drawSegmentedPagination(ctx, CX, railY, CW, r(3), totalCount, activeIndex, dotActive, dotInactive);
  }

  return bounds;
}

function drawPoster(
  canvas: HTMLCanvasElement,
  data: any,
  ar: AspectRatio,
  colors: PosterColors,
  config: PosterConfig,
  img: HTMLImageElement | null | undefined,
  mode: CreatorMode = "analysis",
  activeNewsIndex: number = 0,
  totalNewsCount: number = 1,
  posterStyle: "editorial" | "bold" = "editorial",
  gradient: GradientPreset = GRADIENT_PRESETS[0],
  editorialTheme: EditorialTheme = "light",
  fadeIntensity: number = 100,
  sentimentScheme: SentimentScheme = "emerald"
): PosterElement[] {
  const W = ar.w, H = ar.h;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const S = Math.min(W, H) / 720;
  const land = ar.id === "landscape";

  const r = (n: number) => Math.round(n * S);
  const font = {
    label: (sz = 9,  bold = false) => `${bold ? "bold " : ""}${r(sz * config.fontScale)}px "Inter", system-ui, -apple-system, sans-serif`,
    body:  (sz = 12, bold = false) => `${bold ? "bold " : ""}${r(sz * config.fontScale)}px "Impact", "Arial Black", sans-serif`,
    serif: (sz = 16, bold = false) => `${bold ? "bold " : ""}${r(sz * config.fontScale)}px "Inter", system-ui, -apple-system, sans-serif`,
  };

  const PAD = r(24);
  const GUT = r(24);
  const CX = PAD + GUT, CXR = W - PAD - GUT, CW = CXR - CX;

  // Outro is a batch-level card kind, not a creator mode — check it first so
  // News/Facts/Learnings all close on the exact same brand sign-off.
  if (data?.isOutro) {
    return drawOutroCard(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, posterStyle === "bold" ? gradient : undefined);
  }

  // Same idea as isOutro — a bento explainer is a card kind, not a style, so
  // it always renders in its own plain-language grid regardless of whether
  // the batch is Editorial or Bold.
  if (data?.isBento) {
    return drawBentoExplainerCard(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, posterStyle === "bold" ? gradient : undefined, sentimentScheme);
  }

  if (mode === "news") {
    return posterStyle === "bold"
      ? drawBoldPoster(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, "news", gradient, fadeIntensity, sentimentScheme)
      : drawTradingNewsPoster(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, editorialTheme, fadeIntensity, sentimentScheme);
  }

  if (mode === "facts" || mode === "learnings") {
    return posterStyle === "bold"
      ? drawBoldPoster(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, mode, gradient, fadeIntensity, sentimentScheme)
      : drawEducationalCard(ctx, data, img, W, H, r, activeNewsIndex, totalNewsCount, mode, editorialTheme, fadeIntensity);
  }

  return drawChaseStylePoster(
    ctx,
    data,
    img,
    W,
    H,
    S,
    PAD,
    CX,
    CXR,
    CW,
    GUT,
    r,
    font,
    colors,
    config,
    mode,
    activeNewsIndex,
    totalNewsCount,
    land
  );
}

type FontFns = { label: (sz?: number, bold?: boolean) => string; body: (sz?: number, bold?: boolean) => string; serif: (sz?: number, bold?: boolean) => string; };
type Rfn = (n: number) => number;

// ─── Portrait / Square / Story / A4 layout ───────────────────────────────────

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  data: PosterData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  let Y = PAD + GUT;

  // ── Ghost index number (editorial depth behind title)
  if (data.index) {
    ctx.save();
    ctx.font = `bold ${r(200)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.accent + "09";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(String(data.index).padStart(2, "0"), CXR, Y - r(10));
    ctx.restore();
  }

  // ── Category badge (solid accent fill, white text)
  const catLabel = (data.category || "CONTENT").toUpperCase();
  ctx.font = font.label(8.5); ctx.textBaseline = "middle";
  const catTW = ctx.measureText(catLabel).width;
  const badgeW = catTW + r(18), badgeH = r(22), badgeR = r(3);
  rrect(ctx, CX, Y, badgeW, badgeH, badgeR);
  ctx.fillStyle = colors.accent; ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(catLabel, CX + r(9), Y + badgeH / 2);
  ctx.textBaseline = "top";

  if (data.index || data.date) {
    const parts = [data.index ? `NO. ${data.index}` : "", data.date || ""].filter(Boolean).join("  ·  ");
    ctx.font = font.label(9); ctx.fillStyle = colors.muted;
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(parts, CXR, Y + r(5));
  }
  bounds.push({ id: "category", label: "Category & Index", x: CX, y: Y, w: CW, h: badgeH });
  Y += badgeH + r(18);

  // ── Bold orange divider
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, Y + 0.5); ctx.lineTo(CXR, Y + 0.5); ctx.stroke();
  Y += r(26);

  // ── Title (large bold serif — hero element)
  const titleY = Y;
  ctx.font = font.serif(46, true); ctx.fillStyle = colors.text;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const tLines = wrap(ctx, data.title || "Untitled", CW);
  const tLH = r(56 * config.fontScale);
  tLines.forEach((l, i) => ctx.fillText(l, CX, Y + i * tLH));
  const titleH = Math.max(tLines.length * tLH, r(24));
  bounds.push({ id: "title", label: "Title", x: CX, y: titleY, w: CW, h: titleH });
  Y += titleH + r(8);

  // ── Subtitle (italic serif)
  if (data.subtitle) {
    const subY = Y;
    ctx.font = `italic ${r(16 * config.fontScale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.muted; ctx.textBaseline = "top";
    ctx.fillText(data.subtitle, CX, Y);
    bounds.push({ id: "subtitle", label: "Subtitle", x: CX, y: subY, w: CW, h: r(26) });
    Y += r(28);
  }

  // ── Tags (pill badges — rounded, bordered)
  if (data.tags?.length) {
    Y += r(6);
    const tagsY = Y;
    ctx.font = font.label(8);
    const tH = r(22), tPX = r(10), tGap = r(6), tR = r(11);
    let tX = CX; ctx.textBaseline = "middle";
    for (const tag of data.tags) {
      const tw = ctx.measureText(tag).width + tPX * 2;
      if (tX + tw > CXR) break;
      rrect(ctx, tX, Y, tw, tH, tR);
      ctx.fillStyle = colors.accent + "20"; ctx.fill();
      ctx.strokeStyle = colors.accent + "88"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = colors.accent; ctx.textAlign = "left";
      ctx.fillText(tag, tX + tPX, Y + tH / 2);
      tX += tw + tGap;
    }
    ctx.textBaseline = "top";
    bounds.push({ id: "tags", label: "Tags", x: CX, y: tagsY, w: CW, h: tH });
    Y += tH + r(18);
  }

  // ── Thin secondary separator
  ctx.strokeStyle = colors.accent + "45"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX, Y + 0.5); ctx.lineTo(CXR, Y + 0.5); ctx.stroke();
  Y += r(18);

  // ── Description card (orange top-stripe + card fill)
  if (data.description) {
    const descY = Y;
    ctx.font = font.body(12.5);
    const dLines = wrap(ctx, data.description, CW - r(26));
    const dLH = r(20);
    const cardPX = r(18), cardPY = r(16);
    const cardH = dLines.length * dLH + cardPY * 2;
    rrect(ctx, CX, Y, CW, cardH, r(6));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
    // Orange top stripe (clipped to card shape)
    ctx.save();
    rrect(ctx, CX, Y, CW, cardH, r(6)); ctx.clip();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(CX, Y, CW, r(3));
    ctx.restore();
    ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
    dLines.forEach((l, i) => ctx.fillText(l, CX + cardPX, Y + cardPY + i * dLH));
    bounds.push({ id: "description", label: "Description", x: CX, y: descY, w: CW, h: cardH });
    Y += cardH + r(18);
  }

  // ── Sections (orange dot bullet + label + body)
  if (data.sections?.length) {
    const secY = Y;
    let secHSum = 0;
    for (const sec of data.sections) {
      const curY = Y + secHSum;
      // Dot bullet
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(CX + r(4), curY + r(5.5), r(3), 0, Math.PI * 2); ctx.fill();
      // Label
      ctx.font = font.label(9); ctx.fillStyle = colors.accent;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(sec.label.toUpperCase(), CX + r(14), curY + r(0.5));
      // Body
      ctx.font = font.body(12.5); ctx.fillStyle = colors.text + "E8";
      const sLines = wrap(ctx, sec.content, CW - r(12));
      const sLH = r(19);
      sLines.forEach((l, i) => ctx.fillText(l, CX + r(10), curY + r(17) + i * sLH));
      secHSum += r(17) + sLines.length * sLH + r(14);
    }
    bounds.push({ id: "sections", label: "Sections", x: CX, y: secY, w: CW, h: secHSum });
    Y += secHSum + r(4);
  }

  // ── Formula card (dashed orange border)
  if (data.formula) {
    const formulaY = Y;
    const fPX = r(16), fPY = r(14);
    const fH = fPY + r(14) + r(6) + r(22) + fPY;
    rrect(ctx, CX, Y, CW, fH, r(6));
    ctx.fillStyle = colors.subtle; ctx.fill();
    ctx.setLineDash([r(4), r(3)]);
    ctx.strokeStyle = colors.accent + "AA"; ctx.lineWidth = 1.5;
    rrect(ctx, CX, Y, CW, fH, r(6)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font.label(8); ctx.fillStyle = colors.accent;
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText("FORMULA", CX + fPX, Y + fPY);
    ctx.font = font.serif(16); ctx.fillStyle = colors.text;
    ctx.textBaseline = "top";
    ctx.fillText(data.formula, CX + fPX, Y + fPY + r(14) + r(6));
    bounds.push({ id: "formula", label: "Formula Box", x: CX, y: formulaY, w: CW, h: fH });
    Y += fH + r(18);
  }

  // ── Metrics grid (orange dot accent, bold serif values)
  if (data.metrics?.length) {
    const metricsY = Y;
    const mets = data.metrics.slice(0, 4);
    const cols = mets.length <= 2 ? mets.length : 2;
    const mGap = r(9), mH = r(68), mR = r(6);
    const mW = (CW - mGap * (cols - 1)) / cols;
    mets.forEach((m, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const mx = CX + col * (mW + mGap), my = Y + row * (mH + mGap);
      rrect(ctx, mx, my, mW, mH, mR);
      ctx.fillStyle = colors.card; ctx.fill();
      ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
      // Orange dot accent
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(mx + r(13), my + r(13), r(2.5), 0, Math.PI * 2); ctx.fill();
      // Label (monospace, muted)
      ctx.font = font.label(8); ctx.fillStyle = colors.muted;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(m.label.toUpperCase(), mx + r(23), my + r(9));
      // Value (bold serif, full brightness)
      ctx.font = font.serif(20, true); ctx.fillStyle = colors.text;
      ctx.textBaseline = "bottom";
      ctx.fillText(m.value, mx + r(12), my + mH - r(12));
    });
    const metricsH = Math.ceil(mets.length / cols) * (mH + mGap);
    bounds.push({ id: "metrics", label: "Metrics Grid", x: CX, y: metricsY, w: CW, h: metricsH });
    Y += metricsH + r(10);
  }

  // ── Image
  if (img) {
    const avail = H - PAD - GUT - Y - r(44);
    if (avail > r(50)) {
      const iH = Math.min(avail, r(190));
      const iAR = img.naturalWidth / img.naturalHeight;
      const iW = Math.min(CW, iH * iAR);
      const iX = CX + (CW - iW) / 2;
      ctx.save();
      rrect(ctx, CX, Y, CW, iH, r(6)); ctx.clip();
      ctx.drawImage(img, iX, Y, iW, iH);
      ctx.restore();
      bounds.push({ id: "imageUrl", label: "Image Frame", x: CX, y: Y, w: CW, h: iH });
    }
  }

  // ── Footer
  const FY = H - PAD - GUT;
  ctx.strokeStyle = colors.accent + "40"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(16) + 0.5); ctx.lineTo(CXR, FY - r(16) + 0.5); ctx.stroke();
  ctx.font = font.label(9); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(7));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent + "CC";
  ctx.fillText("stratix.app", CXR, FY - r(7));
  bounds.push({ id: "footer", label: "Footer Website", x: CX, y: FY - r(16), w: CW, h: r(28) });

  return bounds;
}

// ─── Landscape (16:9) two-column layout ──────────────────────────────────────

function drawLandscape(
  ctx: CanvasRenderingContext2D,
  data: PosterData,
  img: HTMLImageElement | null | undefined,
  W: number, H: number, S: number,
  PAD: number, CX: number, CXR: number, CW: number, GUT: number,
  r: Rfn, font: FontFns,
  colors: PosterColors,
  config: PosterConfig,
): PosterElement[] {
  const bounds: PosterElement[] = [];
  const COL_GAP = r(32);
  const LC = Math.round(CW * 0.48);
  const RC = CW - LC - COL_GAP;
  const RCX = CX + LC + COL_GAP;

  let LY = PAD + GUT, RY = PAD + GUT;

  // ── Left: ghost index
  if (data.index) {
    ctx.save();
    ctx.font = `bold ${r(150)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.accent + "09";
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(String(data.index).padStart(2, "0"), CX + LC, LY - r(5));
    ctx.restore();
  }

  // ── Left: category badge
  const catLabel = (data.category || "CONTENT").toUpperCase();
  ctx.font = font.label(8.5); ctx.textBaseline = "middle";
  const catTW = ctx.measureText(catLabel).width;
  const badgeW = catTW + r(18), badgeH = r(22), badgeR = r(3);
  rrect(ctx, CX, LY, badgeW, badgeH, badgeR);
  ctx.fillStyle = colors.accent; ctx.fill();
  ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "left";
  ctx.fillText(catLabel, CX + r(9), LY + badgeH / 2);
  ctx.textBaseline = "top";

  if (data.index || data.date) {
    const parts = [data.index ? `NO. ${data.index}` : "", data.date || ""].filter(Boolean).join("  ·  ");
    ctx.font = font.label(9); ctx.fillStyle = colors.muted;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(parts, CX, LY + badgeH + r(5));
    LY += r(14);
  }
  bounds.push({ id: "category", label: "Category & Index", x: CX, y: LY, w: LC, h: badgeH });
  LY += badgeH + r(16);

  // Rule
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(CX, LY + 0.5); ctx.lineTo(CX + LC, LY + 0.5); ctx.stroke();
  LY += r(22);

  // Title
  const titleY = LY;
  ctx.font = font.serif(38, true); ctx.fillStyle = colors.text;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const tLines = wrap(ctx, data.title || "Untitled", LC);
  const tLH = r(46 * config.fontScale);
  tLines.forEach((l, i) => ctx.fillText(l, CX, LY + i * tLH));
  const titleH = Math.max(tLines.length * tLH, r(20));
  bounds.push({ id: "title", label: "Title", x: CX, y: titleY, w: LC, h: titleH });
  LY += titleH + r(8);

  // Subtitle
  if (data.subtitle) {
    const subY = LY;
    ctx.font = `italic ${r(13 * config.fontScale)}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = colors.muted; ctx.textBaseline = "top";
    ctx.fillText(data.subtitle, CX, LY);
    bounds.push({ id: "subtitle", label: "Subtitle", x: CX, y: subY, w: LC, h: r(22) });
    LY += r(24);
  }

  // Tags
  if (data.tags?.length) {
    LY += r(4);
    const tagsY = LY;
    ctx.font = font.label(8);
    const tH = r(20), tPX = r(9), tGap = r(5), tR = r(10);
    let tX = CX; ctx.textBaseline = "middle";
    for (const tag of data.tags) {
      const tw = ctx.measureText(tag).width + tPX * 2;
      if (tX + tw > CX + LC) break;
      rrect(ctx, tX, LY, tw, tH, tR);
      ctx.fillStyle = colors.accent + "20"; ctx.fill();
      ctx.strokeStyle = colors.accent + "88"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = colors.accent; ctx.textAlign = "left";
      ctx.fillText(tag, tX + tPX, LY + tH / 2);
      tX += tw + tGap;
    }
    ctx.textBaseline = "top";
    bounds.push({ id: "tags", label: "Tags", x: CX, y: tagsY, w: LC, h: tH });
    LY += tH + r(14);
  }

  // Description card
  if (data.description) {
    const descY = LY;
    ctx.font = font.body(11.5);
    const dLines = wrap(ctx, data.description, LC - r(22));
    const dLH = r(18);
    const cardPX = r(16), cardPY = r(14);
    const cardH = dLines.length * dLH + cardPY * 2;
    rrect(ctx, CX, LY, LC, cardH, r(6));
    ctx.fillStyle = colors.card; ctx.fill();
    ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    rrect(ctx, CX, LY, LC, cardH, r(6)); ctx.clip();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(CX, LY, LC, r(3));
    ctx.restore();
    ctx.fillStyle = colors.text; ctx.textBaseline = "top"; ctx.textAlign = "left";
    dLines.forEach((l, i) => ctx.fillText(l, CX + cardPX, LY + cardPY + i * dLH));
    bounds.push({ id: "description", label: "Description", x: CX, y: descY, w: LC, h: cardH });
    LY += cardH + r(14);
  }

  // Formula (left col, dashed border)
  if (data.formula) {
    const formulaY = LY;
    const fPX = r(14), fPY = r(12);
    const fH = fPY + r(12) + r(6) + r(20) + fPY;
    rrect(ctx, CX, LY, LC, fH, r(6));
    ctx.fillStyle = colors.subtle; ctx.fill();
    ctx.setLineDash([r(4), r(3)]);
    ctx.strokeStyle = colors.accent + "AA"; ctx.lineWidth = 1.5;
    rrect(ctx, CX, LY, LC, fH, r(6)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font.label(8); ctx.fillStyle = colors.accent;
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText("FORMULA", CX + fPX, LY + fPY);
    ctx.font = font.serif(13); ctx.fillStyle = colors.text;
    ctx.textBaseline = "top";
    ctx.fillText(data.formula, CX + fPX, LY + fPY + r(12) + r(6));
    bounds.push({ id: "formula", label: "Formula Box", x: CX, y: formulaY, w: LC, h: fH });
  }

  // ── Dashed vertical separator
  ctx.strokeStyle = colors.accent + "40"; ctx.lineWidth = 1;
  ctx.setLineDash([r(4), r(4)]);
  const sepX = CX + LC + COL_GAP / 2;
  ctx.beginPath();
  ctx.moveTo(sepX + 0.5, PAD + GUT);
  ctx.lineTo(sepX + 0.5, H - PAD - GUT);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Right column: Sections
  if (data.sections?.length) {
    const secY = RY;
    let secHSum = 0;
    for (const sec of data.sections) {
      const curY = RY + secHSum;
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(RCX + r(4), curY + r(5.5), r(3), 0, Math.PI * 2); ctx.fill();
      ctx.font = font.label(9); ctx.fillStyle = colors.accent;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(sec.label.toUpperCase(), RCX + r(14), curY + r(0.5));
      ctx.font = font.body(11.5); ctx.fillStyle = colors.text + "E8";
      const sLines = wrap(ctx, sec.content, RC - r(10));
      const sLH = r(18);
      sLines.forEach((l, i) => ctx.fillText(l, RCX + r(10), curY + r(17) + i * sLH));
      secHSum += r(17) + sLines.length * sLH + r(14);
    }
    bounds.push({ id: "sections", label: "Sections", x: RCX, y: secY, w: RC, h: secHSum });
    RY += secHSum + r(8);
  }

  // Right: Metrics (orange dot accent)
  if (data.metrics?.length) {
    const metricsY = RY;
    const mets = data.metrics.slice(0, 4);
    const cols = Math.min(mets.length, 2);
    const mGap = r(8), mH = r(62), mR = r(6);
    const mW = (RC - mGap * (cols - 1)) / cols;
    mets.forEach((m, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const mx = RCX + col * (mW + mGap), my = RY + row * (mH + mGap);
      rrect(ctx, mx, my, mW, mH, mR);
      ctx.fillStyle = colors.card; ctx.fill();
      ctx.strokeStyle = colors.accent + "55"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(mx + r(12), my + r(12), r(2.5), 0, Math.PI * 2); ctx.fill();
      ctx.font = font.label(8); ctx.fillStyle = colors.muted;
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(m.label.toUpperCase(), mx + r(22), my + r(8));
      ctx.font = font.serif(18, true); ctx.fillStyle = colors.text;
      ctx.textBaseline = "bottom";
      ctx.fillText(m.value, mx + r(11), my + mH - r(11));
    });
    const metricsH = Math.ceil(mets.length / cols) * (mH + mGap);
    bounds.push({ id: "metrics", label: "Metrics Grid", x: RCX, y: metricsY, w: RC, h: metricsH });
  }

  // Footer (full width)
  const FY = H - PAD - GUT;
  ctx.strokeStyle = colors.accent + "40"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX, FY - r(16) + 0.5); ctx.lineTo(CXR, FY - r(16) + 0.5); ctx.stroke();
  ctx.font = font.label(9); ctx.fillStyle = colors.muted;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(data.footer || "STRATIX", CX, FY - r(7));
  ctx.textAlign = "right"; ctx.fillStyle = colors.accent + "CC";
  ctx.fillText("stratix.app", CXR, FY - r(7));
  bounds.push({ id: "footer", label: "Footer Website", x: CX, y: FY - r(16), w: CW, h: r(28) });

  return bounds;
}

// ─── Sample JSON modal ────────────────────────────────────────────────────────

function SampleJsonModal({
  mode,
  onClose,
  onApply,
}: {
  mode: CreatorMode;
  onClose: () => void;
  onApply: (json: string) => void;
}) {
  const sampleData: Record<CreatorMode, unknown> = {
    analysis: SAMPLE_ANALYSIS,
    news: SAMPLE_NEWS,
    indicator: SAMPLE,
    facts: SAMPLE_FACTS,
    learnings: SAMPLE_LEARNINGS,
  };
  const json = JSON.stringify(sampleData[mode], null, 2);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const modeLabels: Record<CreatorMode, string> = {
    analysis: "Analysis", news: "News Batch", indicator: "Indicator", facts: "Facts", learnings: "Learnings",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: "#0f0f0f", borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2.5">
            <Code2 className="h-4 w-4 text-white/60" />
            <span className="text-[13px] font-bold text-white tracking-wide uppercase">
              Sample JSON Schema ({modeLabels[mode]})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-white/[0.08] bg-white/5 hover:bg-white/10 cursor-pointer"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-white/5 transition-all text-white/40 hover:text-white/80 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* JSON content */}
        <div className="overflow-y-auto flex-1 p-5">
          <pre
            className="text-[11.5px] leading-relaxed whitespace-pre text-[#ffffff]"
            style={{ fontFamily: "ui-monospace, monospace" }}
          >
            <code>{json}</code>
          </pre>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3.5 bg-white/[0.02] border-t shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <span className="text-[11px] text-white/40">
            Paste this into the JSON tab and modify the fields
          </span>
          <button
            onClick={() => { onApply(json); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-white/90 active:scale-95 transition-all cursor-pointer"
          >
            Use Sample <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Shows the EXACT system prompt + user message the app sends to the AI for a
// given batch category, plus the JSON shape the response must match — the
// same `previewOnly` mechanism the Content Calendar's "Copy Prompt" uses,
// surfaced directly from the main Generate menu so nothing about what the
// model is told (curation rules, voice, image-prompt formula, output schema)
// is hidden behind a black box.
function ShowPromptModal({
  category,
  onClose,
  onImport,
}: {
  category: "news" | "facts" | "learnings";
  onClose: () => void;
  onImport: (category: "news" | "facts" | "learnings", rawText: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const endpoint = category === "news" ? "news-batch" : category === "facts" ? "facts-batch" : "learnings-batch";
    setLoading(true);
    setError(null);
    fetch(`/api/content-creator/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previewOnly: true }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setSystemPrompt(d.systemPrompt || "");
        setUserMessage(d.userMessage || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load prompt"))
      .finally(() => setLoading(false));
  }, [category]);

  const categoryLabel = category === "news" ? "News Batch" : category === "facts" ? "Facts" : "Learnings";

  const fullText = `=== SYSTEM PROMPT (sent to the AI) ===\n${systemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE (sent to the AI) ===\n${userMessage}\n\n${"─".repeat(60)}\n\nPaste this whole thing into ChatGPT, Claude, Grok, or any capable AI. Copy its reply and paste it into the "Paste The AI's Reply" box in Stratix to render the poster batch.`;

  function copy(text: string, section: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection((s) => (s === section ? null : s)), 2000);
  }

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      await onImport(category, pasteText);
      onClose();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: "#0f0f0f", borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2.5">
            <Eye className="h-4 w-4 text-white/60" />
            <span className="text-[13px] font-bold text-white tracking-wide uppercase">
              Full Generation Prompt ({categoryLabel})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copy(fullText, "all")}
              disabled={loading || !!error}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-white/[0.08] bg-white/5 hover:bg-white/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copiedSection === "all" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copiedSection === "all" ? "Copied" : "Copy Everything"}
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-white/5 transition-all text-white/40 hover:text-white/80 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="px-5 py-2.5 text-[10.5px] text-white/40 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          This is exactly what the app sends the AI when you click Generate — curation rules, voice, the image-prompt formula, and the JSON shape the poster renderer expects back. Nothing hidden.
        </p>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-white/40 text-[12px]">
              <Loader2 className="h-4 w-4 animate-spin" /> Building the live prompt…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-300 text-[11px]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          {!loading && !error && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">System Prompt</span>
                  <button
                    onClick={() => copy(systemPrompt, "system")}
                    className="flex items-center gap-1 text-[9.5px] font-bold text-white/40 hover:text-white/80 transition cursor-pointer"
                  >
                    {copiedSection === "system" ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    {copiedSection === "system" ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="text-[10.5px] leading-relaxed whitespace-pre-wrap text-white/75 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 max-h-64 overflow-y-auto" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {systemPrompt}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">User Message</span>
                  <button
                    onClick={() => copy(userMessage, "user")}
                    className="flex items-center gap-1 text-[9.5px] font-bold text-white/40 hover:text-white/80 transition cursor-pointer"
                  >
                    {copiedSection === "user" ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                    {copiedSection === "user" ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="text-[10.5px] leading-relaxed whitespace-pre-wrap text-white/75 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 max-h-40 overflow-y-auto" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {userMessage}
                </pre>
              </div>

              <div className="pt-1 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-1.5 pt-4">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Paste The AI&apos;s Reply</span>
                </div>
                <p className="text-[10px] text-white/35 mb-2">
                  Ran the prompt above in ChatGPT, Claude, Grok, or anywhere else? Paste its JSON reply below — it&apos;ll be converted and rendered as the poster batch automatically.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setImportError(null); }}
                  placeholder="Paste the AI's JSON reply here…"
                  spellCheck={false}
                  className="w-full h-32 resize-none rounded-xl p-3 text-[10.5px] leading-relaxed outline-none transition-all bg-white/[0.02] border border-white/[0.08] text-white/80 focus:border-white/[0.20]"
                  style={{ fontFamily: "ui-monospace, monospace" }}
                />
                {importError && (
                  <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-300 text-[10.5px]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {importError}
                  </div>
                )}
                <button
                  onClick={handleImport}
                  disabled={importing || !pasteText.trim()}
                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {importing ? "Rendering…" : "Render Poster"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── News Generator Prompt Constants & Helpers ─────────────────────────────────
import {
  NEWS_SYSTEM_PROMPT,
  NEWS_SYSTEM_PROMPT_V5,
  EXAMPLE_REFERENCE_JSON,
} from "./creatorPrompts";

const SESSION_LABELS: Record<string, string> = {
  asian: "Asian",
  london: "London",
  new_york: "New York",
};
const SESSION_ORDER = ["asian", "london", "new_york"] as const;

const SYMBOL_META: Record<string, { label: string; assetClass: string; flag: string }> = {
  XAUUSD:  { label: "XAU/USD",  assetClass: "Metals", flag: "🥇" },
  XAGUSD:  { label: "XAG/USD",  assetClass: "Metals", flag: "🥈" },
  BTCUSDT: { label: "BTC/USDT", assetClass: "Crypto", flag: "₿"  },
  ETHUSD:  { label: "ETH/USD",  assetClass: "Crypto", flag: "Ξ"  },
  GBPUSD:  { label: "GBP/USD",  assetClass: "Forex",  flag: "🇬🇧" },
  EURUSD:  { label: "EUR/USD",  assetClass: "Forex",  flag: "🇪🇺" },
  USDJPY:  { label: "USD/JPY",  assetClass: "Forex",  flag: "🇯🇵" },
  AUDUSD:  { label: "AUD/USD",  assetClass: "Forex",  flag: "🇦🇺" },
  NZDUSD:  { label: "NZD/USD",  assetClass: "Forex",  flag: "🇳🇿" },
  USDCAD:  { label: "USD/CAD",  assetClass: "Forex",  flag: "🇨🇦" },
  USDCHF:  { label: "USD/CHF",  assetClass: "Forex",  flag: "🇨🇭" },
};
const SYMBOL_DISPLAY_ORDER = [
  "XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSD",
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
];

const TIME_RANGE_OPTIONS = [
  { value: "3h",  label: "3h",     display: "Last 3 Hours",  hours: 3   },
  { value: "6h",  label: "6h",     display: "Last 6 Hours",  hours: 6   },
  { value: "12h", label: "12h",    display: "Last 12 Hours", hours: 12  },
  { value: "18h", label: "18h",    display: "Last 18 Hours", hours: 18  },
  { value: "24h", label: "24h",    display: "Last 24 Hours", hours: 24  },
  { value: "2d",  label: "2 Days", display: "Last 2 Days",   hours: 48  },
  { value: "3d",  label: "3 Days", display: "Last 3 Days",   hours: 72  },
  { value: "7d",  label: "1 Week", display: "Last 7 Days",   hours: 168 },
] as const;
type TimeRange = typeof TIME_RANGE_OPTIONS[number]["value"];

function formatToISTString(d: Date): string {
  const istDate = new Date(d.getTime() + (330 * 60 * 1000));
  const y = istDate.getUTCFullYear();
  const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(istDate.getUTCDate()).padStart(2, "0");
  const h = String(istDate.getUTCHours()).padStart(2, "0");
  const min = String(istDate.getUTCMinutes()).padStart(2, "0");
  const s = String(istDate.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s} IST`;
}

function formatCandlesForNewsPrompt(data: any, selectedSymbols: string[]): string {
  if (!data) return "(candle data available nahi hai — general market knowledge use karo)";

  const syms = selectedSymbols.map(s => s.toLowerCase());
  const lines: string[] = ["=== REAL OHLCV CANDLE DATA (IST timestamps) ==="];

  for (const sym of syms) {
    const d = data[sym];
    if (!d) continue;
    lines.push(`\n${sym.toUpperCase()}:`);
    if (d.h4?.length) {
      lines.push("  H4 (last 7 din):");
      for (const c of d.h4) {
        const istDate = new Date((c.t * 1000) + (330 * 60 * 1000));
        const y = istDate.getUTCFullYear();
        const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
        const day = String(istDate.getUTCDate()).padStart(2, "0");
        const h = String(istDate.getUTCHours()).padStart(2, "0");
        const dt = `${y}-${m}-${day} ${h}:00 IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
    if (d.h1?.length) {
      lines.push("  H1 (last 48 ghante):");
      for (const c of d.h1) {
        const istDate = new Date((c.t * 1000) + (330 * 60 * 1000));
        const y = istDate.getUTCFullYear();
        const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
        const day = String(istDate.getUTCDate()).padStart(2, "0");
        const h = String(istDate.getUTCHours()).padStart(2, "0");
        const min = String(istDate.getUTCMinutes()).padStart(2, "0");
        const dt = `${y}-${m}-${day} ${h}:${min} IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
  }
  return lines.join("\n");
}

// ─── NewsItem[] format user message builders ──────────────────────────────────
// These produce the JSON format directly accepted by the content-creator
// news poster renderer: a flat NewsItem[] array.
//
// NewsItem fields:
//   title, description, imageUrl, source, date,
//   impact ("High"|"Medium"|"Low"), sentiment ("Bullish"|"Bearish"|"Neutral"),
//   affectedAssets, keyTakeaway

const NEWS_POSTER_SCHEMA_EXAMPLE = JSON.stringify([
  {
    title: "US Inflation Cools Down to 2.8% in May",
    description: "**CPI** data cooled to **2.8%** vs *expected 3.0%*. Retail inflation is slowing faster than forecast, fuelling speculation of an early rate cut by the **Federal Reserve**.\n\n**Transmission:** *Softer inflation* → Treasury yields drop **-12bps** → **DXY** weakens → **XAUUSD** bid strengthens → safe-haven flows into Gold accelerate.\n\n**Cross-asset:** **US Equities** initially rallied *+0.8%* before reality check on growth outlook. *Risk-on sentiment* is fragile.",
    imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
    source: "Bloomberg",
    date: "June 27, 2026",
    impact: "High",
    sentiment: "Bearish",
    affectedAssets: "USD, XAUUSD, US Equities",
    keyTakeaway: "Treasury yields dropped immediately, weakening the DXY and providing a massive safety bid to Gold prices. Watch **$3,320** support — break below triggers acceleration.",
  },
  {
    title: "OPEC+ Surprises With Emergency 500k bpd Cut",
    description: "**OPEC+** announced an emergency supply cut of **500,000 bpd** effective immediately, catching markets off guard. *Analysts had expected no change* at this meeting.\n\n**Chain:** Supply cut → *WTI crude surges* **+$6.40/bbl** → Inflation expectations up → **USD** strengthens → **Commodity currencies** (CAD, NOK) outperform → Gold *caught between safe-haven demand and strong USD*.",
    imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800",
    source: "Reuters",
    date: "June 27, 2026",
    impact: "High",
    sentiment: "Bullish",
    affectedAssets: "USDCAD, Oil, XAUUSD, XAGUSD",
    keyTakeaway: "Energy sector strongly bid. USDCAD likely to reverse lower. Gold faces dual pressure — safe-haven bid vs stronger USD. Monitor **$85/bbl** resistance on WTI.",
  },
], null, 2);

// Default (unedited) user-message template — {{TOKENS}} filled in by buildNewsUserMessageV5.
// Mirrors lib/prompts/definitions/contentCreator.ts's "contentCreator.dailyAnalysisUser" default.
const DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE = `================================================================
CRITICAL INSTRUCTION — OUTPUT FORMAT
================================================================
Tera POORA response SIRF ek \`\`\`json ... \`\`\` code block hona chahiye.
Koi bhi text — upar, neeche, ya beech mein — STRICTLY FORBIDDEN.
Pehli line \`\`\`json, aakhri line \`\`\`, aur beech mein ONLY valid JSON ARRAY.
================================================================

Aaj ka IST date hai {{DATE}}. Aane wala session hai {{SESSION_LABEL}} Session.
Current IST time: {{TS_IST}}
Generated: {{TS}}

⏰ NEWS TIME WINDOW: {{FROM_TS_IST}} SE LEKAR {{TS_IST}} TAK ({{WINDOW_DISPLAY}})
STRICT RULE: Sirf is time window ke andar ki news cover karo. Older news strictly banned.

{{CANDLE_BLOCK}}

Upar diye gaye REAL H4 aur H1 candle data ko price context ke liye use karo.

═══════════════════════════════════════════════════════
TERA KAAM — TWITTER/X FEED STYLE NEWS POSTER BATCH
({{TIME_HINGLISH}} ki news — {{FROM_TS_IST}} ke baad ki)
Selected symbols: {{SYMBOL_LIST}}
═══════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY SOURCES — IN 3 TWITTER/X HANDLES KA FOCUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  @FirstSquawk      — breaking financial & market news alerts
  @investingLive_   — live investing, markets & macro news feed
  @ForexFactory     — forex calendar events, economic data releases

Agar real-time search tools available hain — in handles ki recent posts search karo.
Agar nahi — apni training knowledge se woh REAL events cover karo jo yeh handles report karte hain.

⚠️ NO-FABRICATION RULE — ABSOLUTE:
  ✗ Koi fake tweet mat banana
  ✗ Koi event INVENT mat karna jo factually known nahi
  ✓ Sirf REAL events jo tujhe actually pata hain
  ✓ Agar specific event is window mein nahi hua — correlation analysis likh
  ✓ Uncertain info ke liye: "⚠️ Market-Sensitive Rumor:" prefix use karo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

================================================================
OUTPUT: NEWSITEM[] ARRAY — POSTER GENERATOR FORMAT
================================================================
Ek valid JSON ARRAY return karo jisme har element ek NewsItem object ho.
Minimum 4-8 items. Har item ek alag high-impact event ya symbol ya macro story cover kare.
Selected symbols ({{SYMBOL_LIST}}) ke liye individual items banana — har symbol ka ek dedicated poster.

HAR NEWSITEM MEIN YEH EXACT FIELDS MANDATORY HAIN:

• "title"          : Short, impactful headline in Hinglish (max 10 words)
• "description"    : 120-180 word Hinglish analysis — **Trigger → Mechanism → Market Impact → Ripple Effect** chain.
                     Har important number aur event ko **bold** karo.
                     Expected vs actual ko *italic* mein likhna.
                     Critical alerts ke liye ***bold italic*** use karo.
                     Paragraphs ke beech \\n\\n use karo.
• "imageUrl"       : Ek highly relevant, REAL, working Unsplash image URL (https://images.unsplash.com/photo-...).
                     Image is specific event/asset se visually match karni chahiye.
                     MANDATORY — koi placeholder nahi, koi empty string nahi.
• "source"         : "Bloomberg" | "Reuters" | "CNBC" | "@FirstSquawk" | "@investingLive_" | "@ForexFactory" | etc.
• "date"           : "{{HUMAN_DATE}}" (human-readable)
• "impact"         : EXACTLY one of: "High" | "Medium" | "Low" (case-sensitive, no other values)
• "sentiment"      : EXACTLY one of: "Bullish" | "Bearish" | "Neutral" (case-sensitive, no other values)
• "affectedAssets" : Comma-separated relevant symbols from: {{SYMBOL_LIST}}, USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF, Oil, Gold, BTC, ETH, US Equities, Bonds
• "keyTakeaway"    : 40-60 word concise summary — immediate trader bias, key technical levels to watch. No SL/TP/entry.

OUTPUT SCHEMA EXAMPLE (follow this EXACT structure):
{{SCHEMA_EXAMPLE}}

ADDITIONAL RULES:
• Markdown **bold**, *italic*, ***bold italic*** sirf "description" aur "keyTakeaway" fields mein use karo.
• JSON strings mein actual newline characters NAHI — sirf \\n (escaped) use karo.
• Koi "...", koi placeholder, koi empty string — ZERO tolerance.
• Har field mein real, specific, factual Hinglish content.
• "imageUrl" ka URL must be a real Unsplash photo that renders (starts with https://images.unsplash.com/photo-).

================================================================
ABSOLUTE FINAL RULE — NO EXCEPTIONS
================================================================
RESPONSE = \`\`\`json\n[ ... array of NewsItem objects ... ]\n\`\`\`
NOTHING BEFORE THE FIRST BACKTICK.
NOTHING AFTER THE LAST BACKTICK.
NO INTRO. NO EXPLANATION. NO "Here is the JSON". NO "I hope this helps".
JUST. THE. JSON. ARRAY. CODE. BLOCK.
================================================================`;

function buildNewsUserMessageV5(date: string, session: string, candles: any, timeRange: TimeRange = "24h", selectedSymbols: string[], userTemplate: string = DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE): string {
  const ts = new Date().toISOString();
  const candleBlock = formatCandlesForNewsPrompt(candles, selectedSymbols);

  const opt = TIME_RANGE_OPTIONS.find(o => o.value === timeRange) ?? TIME_RANGE_OPTIONS[4];
  const hours = opt.hours;

  const now = new Date();
  const tsIST = formatToISTString(now);
  const fromDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const fromTsIST = formatToISTString(fromDate);

  const timeHinglish =
    timeRange === "3h"  ? "pichle 3 ghante" :
    timeRange === "6h"  ? "pichle 6 ghante" :
    timeRange === "12h" ? "pichle 12 ghante" :
    timeRange === "18h" ? "pichle 18 ghante" :
    timeRange === "24h" ? "pichle 24 ghante" :
    timeRange === "2d"  ? "pichle 2 din" :
    timeRange === "3d"  ? "pichle 3 din" :
                          "pichle ek hafte";

  const symbolList = selectedSymbols.join(", ");

  return renderTemplate(userTemplate, {
    DATE: date,
    SESSION_LABEL: SESSION_LABELS[session] ?? session,
    TS_IST: tsIST,
    TS: ts,
    FROM_TS_IST: fromTsIST,
    WINDOW_DISPLAY: opt.display,
    CANDLE_BLOCK: candleBlock,
    TIME_HINGLISH: timeHinglish,
    SYMBOL_LIST: symbolList,
    HUMAN_DATE: new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    SCHEMA_EXAMPLE: NEWS_POSTER_SCHEMA_EXAMPLE,
  });
}

function buildNewsUserMessage(date: string, session: string, candles: any, timeRange: TimeRange = "24h", selectedSymbols: string[], userTemplate: string = DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE): string {
  // V1 (full internet) uses the same NewsItem[] poster format — same function, different system prompt
  return buildNewsUserMessageV5(date, session, candles, timeRange, selectedSymbols, userTemplate);
}

// Assembles a caption + hashtag list into one paste-ready Instagram block —
// blank "." lines between them is the standard creator trick that pushes
// the hashtag block below the "...more" fold instead of cluttering the
// caption's visible preview.
function buildInstagramCopyText(caption: string, hashtags: string[]): string {
  const cap = caption.trim();
  const tags = hashtags.map((h) => h.trim()).filter(Boolean).join(" ");
  if (!cap && !tags) return "";
  if (!tags) return cap;
  if (!cap) return tags;
  return `${cap}\n.\n.\n.\n.\n.\n${tags}`;
}

function CopyButton({ text, label = "Copy", disabled = false }: { text: string; label?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={cn(
        "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border",
        disabled
          ? "opacity-40 cursor-not-allowed bg-transparent border-white/[0.04] text-white/20"
          : "bg-white/[0.05] border-white/[0.10] text-white/60 hover:text-white hover:bg-white/[0.10] active:scale-95"
      )}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Prompt version config ────────────────────────────────────────────────────
const PROMPT_VERSIONS = [
  { id: "v1", label: "V1 — Full Internet Search" },
  { id: "v5", label: "V5 — Twitter Feeds Only" },
] as const;
type PromptVersion = typeof PROMPT_VERSIONS[number]["id"];

function PromptModal({
  defaultDate,
  defaultSession,
  onClose,
}: {
  defaultDate: string;
  defaultSession: string;
  onClose: () => void;
}) {
  const [candles,   setCandles]   = useState<any>(null);
  const [fetching,  setFetching]  = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [promptVersion, setPromptVersion] = useState<PromptVersion>("v5");

  const [modalDate, setModalDate]       = useState(defaultDate);
  const [modalSession, setModalSession] = useState(defaultSession);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(SYMBOL_DISPLAY_ORDER);

  const [v1SystemTemplate, setV1SystemTemplate] = useState(NEWS_SYSTEM_PROMPT);
  const [v5SystemTemplate, setV5SystemTemplate] = useState(NEWS_SYSTEM_PROMPT_V5);
  const [userTemplate, setUserTemplate] = useState(DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE);
  const [recentlyCoveredBlock, setRecentlyCoveredBlock] = useState("(Loading recently-covered stories…)");

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setCandles(d); setFetching(false); })
      .catch(e => { setFetchErr(e.message); setFetching(false); });
  }, []);

  // Admin-editable prompts (Admin → Prompt Management) — fall back to the
  // built-in defaults above until these load.
  useEffect(() => {
    Promise.all([
      fetch("/api/prompts/contentCreator.dailyAnalysisV1.system").then(r => (r.ok ? r.json() : null)),
      fetch("/api/prompts/contentCreator.dailyAnalysisV5.system").then(r => (r.ok ? r.json() : null)),
      fetch("/api/prompts/contentCreator.dailyAnalysisUser").then(r => (r.ok ? r.json() : null)),
    ]).then(([v1, v5, usr]) => {
      if (v1?.content) setV1SystemTemplate(v1.content);
      if (v5?.content) setV5SystemTemplate(v5.content);
      if (usr?.content) setUserTemplate(usr.content);
    }).catch(() => { /* fall back to built-in defaults */ });
  }, []);

  // Same rolling "don't repeat the last few batches" data the automatic News
  // Batch generator uses server-side — keeps this external/copy-paste prompt
  // in sync with the internal one for the same poster feature.
  useEffect(() => {
    fetch("/api/content-creator/recently-covered")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.block) setRecentlyCoveredBlock(d.block); })
      .catch(() => setRecentlyCoveredBlock("(Unable to load recently-covered stories — proceed without this check.)"));
  }, []);

  const symbolsRule = selectedSymbols.length > 0
    ? `• ALWAYS populate all selected keys in symbol_wise_news (${selectedSymbols.join(", ")}) — none of these selected symbols can be omitted under any circumstances.`
    : "• ALWAYS populate all selected keys in symbol_wise_news — none of these selected symbols can be omitted under any circumstances.";

  const isV5 = promptVersion === "v5";

  const dynamicSystemPrompt = renderTemplate(isV5 ? v5SystemTemplate : v1SystemTemplate, {
    SYMBOLS_RULE: symbolsRule,
    RECENTLY_COVERED_BLOCK: recentlyCoveredBlock,
  });

  const userMsg = selectedSymbols.length > 0
    ? (isV5
        ? buildNewsUserMessageV5(modalDate, modalSession, candles, timeRange, selectedSymbols, userTemplate)
        : buildNewsUserMessage(modalDate, modalSession, candles, timeRange, selectedSymbols, userTemplate))
    : "(Please select at least one currency pair / symbol)";

  const copyAllText = `=== SYSTEM PROMPT ===\n${dynamicSystemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE ===\n${userMsg}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl overflow-hidden text-white font-sans">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bot className="h-4 w-4 text-white/50 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white/80 font-sans">Stratix News Prompt Generator</p>
              <p className="text-[11px] text-white/35 font-sans">
                {fetching ? "Live candle data load ho rahi hai…" : fetchErr ? "Candle fetch failed — general knowledge" : `H1+H4 data embed hua · ${SESSION_LABELS[modalSession] || modalSession} · ${modalDate}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest hidden sm:block">Prompt</span>
              <select
                value={promptVersion}
                onChange={(e) => setPromptVersion(e.target.value as PromptVersion)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.10] text-white/70 focus:outline-none focus:border-white/[0.25] cursor-pointer appearance-none pr-6 relative"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
              >
                {PROMPT_VERSIONS.map(v => (
                  <option key={v.id} value={v.id} className="bg-[#1a1a1a] text-white">
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Date, Session and News Window */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">Session</span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                {SESSION_ORDER.map(s => (
                  <button
                    key={s}
                    onClick={() => setModalSession(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                      modalSession === s
                        ? "bg-white/[0.10] text-white border border-white/[0.12]"
                        : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                    )}
                  >
                    {SESSION_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">Date</span>
              <input
                type="date"
                value={modalDate}
                onChange={(e) => setModalDate(e.target.value)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium bg-white/[0.03] border border-white/[0.08] text-white/70 focus:outline-none focus:border-white/[0.20]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">News Window</span>
              <div className="flex items-center gap-1">
                {TIME_RANGE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value as TimeRange)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border cursor-pointer",
                      timeRange === opt.value
                        ? "bg-white/[0.12] text-white border-white/[0.18]"
                        : "bg-white/[0.03] text-white/35 border-white/[0.06] hover:text-white/60 hover:bg-white/[0.07]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Currency Pairs / Symbols Selectors */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Currency Pairs / Symbols</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedSymbols(SYMBOL_DISPLAY_ORDER)}
                className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
              >
                Select All
              </button>
              <span className="text-white/10">|</span>
              <button
                onClick={() => setSelectedSymbols([])}
                className="text-[10px] font-semibold text-red-400/80 hover:text-red-300 transition cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SYMBOL_DISPLAY_ORDER.map(sym => {
              const isSelected = selectedSymbols.includes(sym);
              const meta = SYMBOL_META[sym];
              return (
                <button
                  key={sym}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedSymbols(prev => prev.filter(s => s !== sym));
                    } else {
                      setSelectedSymbols(prev => [...prev, sym]);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all border cursor-pointer",
                    isSelected
                      ? "bg-white/[0.08] text-white border-white/[0.15]"
                      : "bg-white/[0.02] text-white/30 border-white/[0.05] hover:text-white/50 hover:bg-white/[0.04]"
                  )}
                >
                  <span>{meta?.flag}</span>
                  <span>{meta?.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {fetching ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
            <p className="text-[12px] text-white/30">Symbols ka candle data load ho raha hai…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {isV5 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.18]">
                <span className="text-emerald-400 text-[13px] shrink-0 mt-0.5">𝕏</span>
                <div>
                  <p className="text-[11px] font-semibold text-emerald-400/80 mb-0.5">V5 — Twitter/X Feeds Only</p>
                  <p className="text-[11px] text-white/35 leading-relaxed">
                    AI sirf <span className="text-white/55 font-mono">@FirstSquawk</span>, <span className="text-white/55 font-mono">@investingLive_</span>, aur <span className="text-white/55 font-mono">@ForexFactory</span> se news fetch karega. Koi aur source nahi. Zero noise.
                  </p>
                </div>
              </div>
            )}
            {fetchErr && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 text-[12px] text-amber-400/80">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Candle data nahi mili ({fetchErr}). AI general market knowledge use karega.
              </div>
            )}

            {candles && !fetchErr && (
              <div className="grid grid-cols-3 gap-2">
                {(["H4 (7d)", "H1 (48h)", "Symbols Selected"] as const).map((label, i) => {
                  const val = i === 0
                    ? Object.entries(candles)
                        .filter(([sym]) => selectedSymbols.includes(sym.toUpperCase()))
                        .reduce((s: number, [, d]: [string, any]) => s + (d.h4?.length ?? 0), 0)
                    : i === 1
                    ? Object.entries(candles)
                        .filter(([sym]) => selectedSymbols.includes(sym.toUpperCase()))
                        .reduce((s: number, [, d]: [string, any]) => s + (d.h1?.length ?? 0), 0)
                    : selectedSymbols.length;
                  return (
                    <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2.5 text-center">
                      <p className="text-[18px] font-bold text-white/70">{val}</p>
                      <p className="text-[10px] text-white/25 uppercase tracking-widest">{label}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">1</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">System Prompt</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide",
                    isV5
                      ? "bg-emerald-500/[0.12] text-emerald-400/80 border border-emerald-500/[0.20]"
                      : "bg-white/[0.06] text-white/30 border border-white/[0.08]"
                  )}>
                    {isV5 ? "V5 · Twitter Only" : "V1 · Full Internet"}
                  </span>
                </div>
                <CopyButton text={dynamicSystemPrompt} disabled={selectedSymbols.length === 0} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-48">{dynamicSystemPrompt}</pre>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">2</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                    {isV5 ? "User Message + Candle Data (Twitter Feeds)" : "User Message + Real Candle Data"}
                  </span>
                  <span className="text-[10px] text-white/20">{SESSION_LABELS[modalSession] || modalSession} · {modalDate}</span>
                </div>
                <CopyButton text={userMsg} disabled={selectedSymbols.length === 0} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-64">{userMsg}</pre>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">3</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Reference JSON Example</span>
                </div>
                <CopyButton text={NEWS_POSTER_SCHEMA_EXAMPLE} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-64">{NEWS_POSTER_SCHEMA_EXAMPLE}</pre>
            </div>

            <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.15] px-4 py-3">
              <p className="text-[11px] font-semibold text-emerald-400/70 uppercase tracking-widest mb-1">Step 4 — Save &amp; Create Posters</p>
              <p className="text-[12px] text-white/40 leading-relaxed">
                AI ka generated JSON copy karo → content creator ke <span className="text-white/60 font-medium">JSON Tab</span> mein paste karo → Force Re-render. Sabhi events aur symbols ke poster automatically display honge.
              </p>
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex items-center justify-between gap-3">
          <CopyButton text={copyAllText} label="Copy All Blocks" disabled={selectedSymbols.length === 0} />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── News Report Mapper ───────────────────────────────────────────────────────
function mapNewsReportToItems(parsed: any): NewsItem[] {
  const items: NewsItem[] = [];

  // 1. Overall Macro summary
  if (parsed.all_news_section) {
    items.push({
      title: parsed.all_news_section.headline || "Macro Market Summary",
      source: "MACRO NEWS",
      description: parsed.all_news_section.summary || "",
      imageUrl: parsed.all_news_section.high_impact_events?.[0]?.imageUrl || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
      impact: "High",
      sentiment: "Neutral",
      affectedAssets: "Global Markets",
      keyTakeaway: "Overall macro trend and market sentiment."
    });

    // 2. High Impact Events
    if (Array.isArray(parsed.all_news_section.high_impact_events)) {
      for (const ev of parsed.all_news_section.high_impact_events) {
        items.push({
          title: ev.event_name || "High Impact Event",
          source: "HIGH IMPACT",
          description: ev.impact_explanation || "",
          imageUrl: ev.imageUrl || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
          impact: "High",
          sentiment: "Neutral",
          affectedAssets: ev.market_impact ? ev.market_impact.map((m: any) => `${m.symbol} (${m.effect})`).join(", ") : "",
          keyTakeaway: ev.impact_explanation ? ev.impact_explanation.slice(0, 150) : ""
        });
      }
    }
  }

  // 3. Symbol wise news
  if (parsed.symbol_wise_news && typeof parsed.symbol_wise_news === "object") {
    for (const [symbol, info] of Object.entries<any>(parsed.symbol_wise_news)) {
      items.push({
        title: symbol,
        source: "MARKET NEWS",
        description: info.detailed_breakdown || "",
        imageUrl: info.imageUrl || "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
        impact: "High",
        sentiment: (info.sniper_note?.news_bias === "Bullish" || info.sniper_note?.news_bias === "Bearish" || info.sniper_note?.news_bias === "Neutral") ? info.sniper_note.news_bias : "Neutral",
        affectedAssets: symbol,
        keyTakeaway: info.trader_alert || ""
      });
    }
  }

  return items;
}

// ─── History modal ────────────────────────────────────────────────────────────

const HISTORY_CATEGORY_META: Record<HistoryListItem["category"], { label: string; icon: typeof Newspaper; color: string }> = {
  "news-batch":       { label: "News Batch",     icon: Newspaper,  color: "#10b981" },
  "daily-analysis":   { label: "Daily Analysis", icon: LineChart,  color: "#f59e0b" },
  "indicator":        { label: "Indicator",      icon: Layers2,    color: "#8b93a1" },
  "facts-batch":      { label: "Facts",          icon: Lightbulb,  color: "#10b981" },
  "learnings-batch":  { label: "Learnings",      icon: BookOpen,   color: "#10b981" },
};

function relativeTime(iso: string): string {
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

function HistoryModal({
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
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

const CATEGORY_LABELS: Record<NonNullable<NewsItem["category"]>, string> = {
  Macro: "Macro",
  Geopolitical: "Geopolitical",
  Corporate: "Corporate",
  Sentiment: "Sentiment",
  Systemic: "Systemic",
};
const CATEGORY_ORDER = ["all", "Macro", "Geopolitical", "Corporate", "Sentiment", "Systemic"] as const;

// Shown right after generation (and re-openable any time a raw batch exists)
// so the user can narrow the 20-30 AI-curated candidates down to the stories
// they actually want in the exported batch — every candidate stays available,
// nothing is silently dropped by the AI.
function PosterSelectionModal({
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

const PILLAR_COLORS: Record<string, { bg: string; fg: string }> = {
  SMC: { bg: "rgba(16,185,129,0.14)", fg: "#34d399" },
  Crypto: { bg: "rgba(245,158,11,0.14)", fg: "#fbbf24" },
  PF: { bg: "rgba(96,165,250,0.14)", fg: "#60a5fa" },
  Recap: { bg: "rgba(244,114,182,0.14)", fg: "#f472b6" },
};

type CalendarPromptState = { key: string; status: "idle" | "loading" | "copied" | "error" };

function ContentCalendarModal({
  onClose,
  onGenerateNews,
  onGenerateFacts,
  onGenerateLearnings,
}: {
  onClose: () => void;
  onGenerateNews: () => void;
  onGenerateFacts: (topicHint: string) => void;
  onGenerateLearnings: (topicHint: string) => void;
}) {
  const months = Array.from(new Set(CALENDAR_PLAN.map((d) => d.date.slice(0, 7)))).sort();
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultMonth = months.includes(todayIso.slice(0, 7)) ? todayIso.slice(0, 7) : months[0];
  const [monthIdx, setMonthIdx] = useState(Math.max(0, months.indexOf(defaultMonth)));
  const activeMonth = months[monthIdx];
  const [promptState, setPromptState] = useState<CalendarPromptState>({ key: "", status: "idle" });

  const [y, m] = activeMonth.split("-").map(Number);
  const firstOfMonth = new Date(y, m - 1, 1);
  const startWeekday = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const dayByDate = new Map(CALENDAR_PLAN.map((d) => [d.date, d]));

  async function copyPrompt(category: "news" | "facts" | "learnings", topicHint: string | undefined, key: string) {
    setPromptState({ key, status: "loading" });
    try {
      const endpoint = category === "news" ? "news-batch" : category === "facts" ? "facts-batch" : "learnings-batch";
      const res = await fetch(`/api/content-creator/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicHint ? { previewOnly: true, topicHint } : { previewOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const text = `=== SYSTEM PROMPT ===\n${data.systemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE ===\n${data.userMessage}\n\n${"─".repeat(60)}\n\nINSTRUCTIONS: Paste this entire prompt (system + user message) into ChatGPT, Claude, or any capable AI. It replies with ONLY a JSON object in the exact shape spelled out at the end of the system prompt above — no markdown fences, no commentary. Back in Stratix Content Creator, switch to ${category === "news" ? "News Batch" : category === "facts" ? "Facts" : "Learnings"} mode and either paste that reply into the "Paste The AI's Reply" box in the eye-icon prompt panel, or straight into the JSON tab — either one converts it and renders the poster batch automatically.`;

      await navigator.clipboard.writeText(text);
      setPromptState({ key, status: "copied" });
      setTimeout(() => setPromptState((s) => (s.key === key ? { key: "", status: "idle" } : s)), 2000);
    } catch {
      setPromptState({ key, status: "error" });
      setTimeout(() => setPromptState((s) => (s.key === key ? { key: "", status: "idle" } : s)), 2500);
    }
  }

  function PillarRow({
    dayKey,
    label,
    accent,
    topic,
    onGenerate,
    onCopy,
  }: {
    dayKey: string;
    label: string;
    accent: string;
    topic: string;
    onGenerate: () => void;
    onCopy: () => void;
  }) {
    const state = promptState.key === dayKey ? promptState.status : "idle";
    return (
      <div className="group/row relative rounded-md px-1.5 py-1 hover:bg-white/[0.06] transition-colors">
        <div className="flex items-start gap-1">
          <span
            className="shrink-0 mt-[1px] text-[7.5px] font-bold uppercase tracking-wider px-1 py-[1px] rounded"
            style={{ background: accent === "#e5e5e5" ? "rgba(255,255,255,0.08)" : `${accent}22`, color: accent }}
          >
            {label}
          </span>
          <span className="text-[9px] leading-snug text-white/70 line-clamp-2" title={topic}>
            {topic}
          </span>
        </div>
        <div className="absolute right-1 top-1 hidden group-hover/row:flex items-center gap-1 bg-[#161616] rounded-md shadow-lg border border-white/10 p-0.5">
          <button
            onClick={onGenerate}
            title="Generate this poster now"
            className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/15 cursor-pointer"
          >
            <Sparkles className="h-2.5 w-2.5" /> Generate
          </button>
          <button
            onClick={onCopy}
            title="Copy an AI-ready prompt for this topic"
            className="flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-bold text-white/70 hover:bg-white/10 cursor-pointer"
          >
            {state === "loading" ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : state === "copied" ? (
              <Check className="h-2.5 w-2.5 text-emerald-400" />
            ) : state === "error" ? (
              <X className="h-2.5 w-2.5 text-red-400" />
            ) : (
              <ClipboardCopy className="h-2.5 w-2.5" />
            )}
            {state === "copied" ? "Copied" : state === "error" ? "Failed" : "Prompt"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: "#0f0f0f", borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-2 px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Calendar className="h-4 w-4 shrink-0 text-white/60" />
            <span className="text-[13px] font-bold text-white tracking-wide uppercase whitespace-nowrap">Content Calendar</span>
            <span className="hidden md:inline text-[9.5px] text-white/35 whitespace-nowrap truncate">30-day News / Learnings / Facts plan</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setMonthIdx((i) => Math.max(0, i - 1))}
              disabled={monthIdx === 0}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-semibold text-white/80 w-20 sm:w-32 text-center whitespace-nowrap truncate">{monthLabel}</span>
            <button
              onClick={() => setMonthIdx((i) => Math.min(months.length - 1, i + 1))}
              disabled={monthIdx === months.length - 1}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="ml-2 flex items-center justify-center h-7 w-7 rounded-lg hover:bg-white/5 transition-all text-white/40 hover:text-white/80 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-5 py-2 border-b shrink-0 flex-wrap" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          <span className="text-[9px] text-white/30 uppercase tracking-wider">Hover a topic for Generate / Copy Prompt</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: "#e5e5e5" }} /> News</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: PILLAR_COLORS.SMC.fg }} /> SMC</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: PILLAR_COLORS.Crypto.fg }} /> Crypto</span>
          <span className="flex items-center gap-1 text-[9px] text-white/50"><span className="w-2 h-2 rounded-sm" style={{ background: PILLAR_COLORS.PF.fg }} /> Personal Finance</span>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 p-4">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-[9px] font-bold text-white/30 uppercase tracking-wider text-center py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dateIso = `${activeMonth}-${String(i + 1).padStart(2, "0")}`;
              const plan = dayByDate.get(dateIso);
              const isToday = dateIso === todayIso;
              return (
                <div
                  key={dateIso}
                  className="min-h-[132px] rounded-lg border p-1.5 flex flex-col gap-1"
                  style={{
                    borderColor: isToday ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.06)",
                    background: plan ? "rgba(255,255,255,0.02)" : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${isToday ? "text-emerald-400" : "text-white/50"}`}>{i + 1}</span>
                    {plan?.note && (
                      <span className="text-[7px] font-bold uppercase tracking-wider px-1 py-[1px] rounded bg-amber-500/15 text-amber-300" title={plan.note}>
                        {plan.note.length > 14 ? `${plan.note.slice(0, 13)}…` : plan.note}
                      </span>
                    )}
                  </div>
                  {plan && (
                    <div className="flex-1 flex flex-col gap-0.5 -mx-1">
                      <PillarRow
                        dayKey={`${plan.date}-news`}
                        label="News"
                        accent="#e5e5e5"
                        topic={plan.news.topic}
                        onGenerate={onGenerateNews}
                        onCopy={() => copyPrompt("news", undefined, `${plan.date}-news`)}
                      />
                      <PillarRow
                        dayKey={`${plan.date}-learnings`}
                        label={plan.learnings.pillar}
                        accent={PILLAR_COLORS[plan.learnings.pillar]?.fg ?? "#e5e5e5"}
                        topic={plan.learnings.topic}
                        onGenerate={() => onGenerateLearnings(plan.learnings.topic)}
                        onCopy={() => copyPrompt("learnings", plan.learnings.topic, `${plan.date}-learnings`)}
                      />
                      <PillarRow
                        dayKey={`${plan.date}-facts`}
                        label="Facts"
                        accent="#e5e5e5"
                        topic={plan.facts.topic}
                        onGenerate={() => onGenerateFacts(plan.facts.topic)}
                        onCopy={() => copyPrompt("facts", plan.facts.topic, `${plan.date}-facts`)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function compressImage(dataUrl: string, maxDim = 1200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContentCreatorPage() {
  const [creatorMode, setCreatorMode] = useState<CreatorMode>("analysis");
  // News/Facts/Learnings all store their batch as an array in `newsData` and
  // share the carousel/download/editor plumbing below — "indicator" and
  // "analysis" are the odd ones out, each with a single object.
  const isBatchMode = creatorMode === "news" || creatorMode === "facts" || creatorMode === "learnings";
  const [ratioId, setRatioId] = useState("square");

  // Keep track of JSON states independently so switching modes doesn't lose modifications
  const [analysisData, setAnalysisData] = useState<AnalysisData>(EMPTY_ANALYSIS);
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [parsedData, setParsedData] = useState<PosterData>(EMPTY_INDICATOR);
  const [activeNewsIndex, setActiveNewsIndex] = useState(0);

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // On phones the 350px editor panel would eat the entire viewport and leave
  // no room for the canvas preview — start collapsed there so the poster is
  // visible first; desktop/tablet keep the panel open by default.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPanelCollapsed(true);
    }
  }, []);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [downloadingZip, setDownloadingZip] = useState(false);
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  const [candlesData, setCandlesData] = useState<any>(null);
  const [promptSession, setPromptSession] = useState<string>("London");
  const [promptDate, setPromptDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [promptCopied, setPromptCopied] = useState<boolean>(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // ── AI Generate (niche dropdown) ──────────────────────────────────────────
  const [showGenerateMenu, setShowGenerateMenu] = useState(false);
  const [showPromptForCategory, setShowPromptForCategory] = useState<"news" | "facts" | "learnings" | null>(null);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [batchMeta, setBatchMeta] = useState<{ timeRangeLabel: string; reportGeneratedAt: string | null } | null>(null);
  // Raw AI-curated batch (20-30 candidates, cover excluded) from the most
  // recent generation — kept separately so the user can revisit the
  // selection modal to change which stories make the final batch without
  // re-calling the AI.
  const [rawBatchCandidates, setRawBatchCandidates] = useState<NewsItem[]>([]);
  const [rawBatchCover, setRawBatchCover] = useState<NewsItem | null>(null);
  const [rawBatchOutro, setRawBatchOutro] = useState<NewsItem | null>(null);
  const [selectedPosterIndices, setSelectedPosterIndices] = useState<Set<number>>(new Set());
  const [showSelectionModal, setShowSelectionModal] = useState(false);

  // Attach a locally generated image (e.g. from Grok Imagine) to the active
  // news poster: clicking the poster's image area or the Upload button opens
  // the OS file picker; the chosen file is inlined as a data URL so the
  // canvas can draw it without any CORS/taint issues.
  const imageFileRef = useRef<HTMLInputElement>(null);

  // ── Content Calendar (30-day News/Learnings/Facts plan) ───────────────────
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // ── History (saved generations) ───────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);

  const loadHistoryList = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/content-creator/history");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load history");
      setHistoryItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = () => {
    setShowHistory(true);
    loadHistoryList();
  };

  // Fire-and-forget save — a failed save should never block the creator flow,
  // so errors are swallowed (surfaced only via a console warning).
  const saveToHistory = async (
    category: HistoryListItem["category"],
    title: string,
    itemCount: number,
    payload: unknown,
    id: string | null = null
  ): Promise<string | null> => {
    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/content-creator/history/${id}` : "/api/content-creator/history";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, itemCount, payload }),
      });
      const data = await res.json();
      if (res.ok && data._id) {
        return data._id;
      }
    } catch (e) {
      console.warn("Failed to save content-creator history:", e);
    }
    return null;
  };

  // Saves the CURRENT style settings (ratio, colors, config, poster style,
  // gradient, theme, fade intensity, highlight-color scheme) as this user's
  // starting point for every future visit — deliberately excludes the
  // poster content itself (newsData/analysisData/etc.), which is what
  // "Save to History" is for.
  const handleSetAsDefault = async () => {
    setDefaultSaveStatus("saving");
    try {
      const settings = { ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme };
      const res = await fetch("/api/content-creator/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Failed to save defaults");
      setDefaultSaveStatus("saved");
    } catch (e) {
      console.warn("Failed to save content-creator defaults:", e);
      setDefaultSaveStatus("error");
    } finally {
      setTimeout(() => setDefaultSaveStatus("idle"), 2000);
    }
  };

  const handleSaveCurrentToHistory = async () => {
    setSaveStatus("saving");
    try {
      let createdId: string | null = null;
      if (creatorMode === "news") {
        const first = newsData[0];
        const title = newsData.length > 1
          ? `News Batch · ${newsData.length} stories${first?.date ? ` · ${first.date}` : ""}`
          : (first?.title || "News Batch");
        createdId = await saveToHistory("news-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else if (creatorMode === "facts") {
        const title = `Facts · ${newsData.length} ${newsData.length === 1 ? "card" : "cards"}`;
        createdId = await saveToHistory("facts-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else if (creatorMode === "learnings") {
        const concept = newsData.find((d) => d.concept)?.concept;
        const title = concept ? `Learnings · ${concept}` : "Learnings Batch";
        createdId = await saveToHistory("learnings-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else if (creatorMode === "analysis") {
        const title = analysisData.instrument
          ? `${analysisData.instrument} · ${analysisData.levelName || "Daily Analysis"}`
          : "Daily Analysis";
        createdId = await saveToHistory("daily-analysis", title, 1, { analysisData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else {
        const title = parsedData.title || parsedData.category || "Indicator Poster";
        createdId = await saveToHistory("indicator", title, 1, { parsedData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      }
      if (createdId) {
        setActiveHistoryId(createdId);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    } catch (e) {
      console.error(e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const loadHistoryEntry = async (id: string) => {
    setHistoryBusyId(id);
    try {
      const res = await fetch(`/api/content-creator/history/${id}`);
      const doc = await res.json();
      if (!res.ok) throw new Error(doc?.error || "Failed to load entry");

      setActiveHistoryId(id);
      const payload = doc.payload || {};
      if (doc.category === "news-batch" && Array.isArray(payload.posters)) {
        setCreatorMode("news");
        setNewsData(payload.posters);
        setActiveNewsIndex(0);
        setJsonText(JSON.stringify(payload.posters, null, 2));
      } else if (doc.category === "facts-batch" && Array.isArray(payload.posters)) {
        setCreatorMode("facts");
        setNewsData(payload.posters);
        setActiveNewsIndex(0);
        setJsonText(JSON.stringify(payload.posters, null, 2));
      } else if (doc.category === "learnings-batch" && Array.isArray(payload.posters)) {
        setCreatorMode("learnings");
        setNewsData(payload.posters);
        setActiveNewsIndex(0);
        setJsonText(JSON.stringify(payload.posters, null, 2));
      } else if (doc.category === "daily-analysis" && payload.analysisData) {
        setCreatorMode("analysis");
        setAnalysisData(payload.analysisData);
        setJsonText(JSON.stringify(payload.analysisData, null, 2));
      } else if (payload.parsedData) {
        setCreatorMode("indicator");
        setParsedData(payload.parsedData);
        setJsonText(JSON.stringify(payload.parsedData, null, 2));
      }
      if (payload.ratioId) setRatioId(payload.ratioId);
      if (payload.colors) setColors(payload.colors);
      if (payload.config) setConfig(payload.config);
      setPosterStyle(payload.posterStyle === "bold" ? "bold" : "editorial");
      if (payload.gradientPresetId) setGradientPresetId(payload.gradientPresetId);
      setEditorialTheme(payload.editorialTheme === "dark" ? "dark" : "light");
      setGradientFade(typeof payload.gradientFade === "number" ? payload.gradientFade : 100);
      setSentimentScheme(payload.sentimentScheme === "skyblue" ? "skyblue" : "emerald");
      setJsonError(null);
      setActiveTab("content");
      setShowHistory(false);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load entry");
    } finally {
      setHistoryBusyId(null);
    }
  };

  const deleteHistoryEntry = async (id: string) => {
    setHistoryBusyId(id);
    try {
      const res = await fetch(`/api/content-creator/history/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error || "Failed to delete"); }
      setHistoryItems((prev) => prev.filter((h) => h._id !== id));
      if (id === activeHistoryId) {
        setActiveHistoryId(null);
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to delete entry");
    } finally {
      setHistoryBusyId(null);
    }
  };

  const generateNewsBatch = async () => {
    setShowGenerateMenu(false);
    setGeneratingBatch(true);
    setGenerateError(null);
    setActiveHistoryId(null);
    try {
      const res = await fetch("/api/content-creator/news-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.posters) ? data.posters : [];
      if (items.length === 0) throw new Error("AI returned no posters — try again.");

      // items[0] is always the cover slide (isCover: true); the last item is
      // always the outro slide (isOutro: true) if present; everything between
      // is the 8-12 curated candidates. Don't commit to newsData yet — open
      // the selection modal so the user picks which stories make the batch.
      // The outro is never a selectable candidate — it's always re-appended.
      const outro = items.length > 1 && items[items.length - 1]?.isOutro ? items[items.length - 1] : null;
      const body = outro ? items.slice(0, -1) : items;
      const [cover, ...candidates] = body;
      setCreatorMode("news");
      setActiveTab("content");
      setBatchMeta({
        timeRangeLabel: data.timeRangeLabel ?? "",
        reportGeneratedAt: data.reportGeneratedAt ?? null,
      });
      setRawBatchCover(cover ?? null);
      setRawBatchOutro(outro);
      setRawBatchCandidates(candidates);
      setSelectedPosterIndices(new Set(candidates.map((_, i) => i))); // default: everything selected
      setShowSelectionModal(true);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingBatch(false);
    }
  };

  // Facts/Learnings are fully automatic and prompt-capped (no oversized raw
  // pool like News's old 20-30), so there's no selection-review step here —
  // generate, commit straight to newsData, and save to History immediately.
  const generateFactsBatch = async (topicHint?: string) => {
    setShowGenerateMenu(false);
    setGeneratingBatch(true);
    setGenerateError(null);
    setActiveHistoryId(null);
    try {
      const res = await fetch("/api/content-creator/facts-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicHint ? { topicHint } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.cards) ? data.cards : [];
      if (items.length === 0) throw new Error("AI returned no facts — try again.");

      setCreatorMode("facts");
      setActiveTab("content");
      setNewsData(items);
      setActiveNewsIndex(0);
      setJsonText(JSON.stringify(items, null, 2));
      setJsonError(null);

      const factCount = Math.max(0, items.length - 2);
      const createdId = await saveToHistory(
        "facts-batch",
        `Facts · ${factCount} ${factCount === 1 ? "card" : "cards"}`,
        items.length,
        { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }
      );
      if (createdId) setActiveHistoryId(createdId);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingBatch(false);
    }
  };

  const generateLearningsBatch = async (topicHint?: string) => {
    setShowGenerateMenu(false);
    setGeneratingBatch(true);
    setGenerateError(null);
    setActiveHistoryId(null);
    try {
      const res = await fetch("/api/content-creator/learnings-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicHint ? { topicHint } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.cards) ? data.cards : [];
      if (items.length === 0) throw new Error("AI returned no slides — try again.");

      setCreatorMode("learnings");
      setActiveTab("content");
      setNewsData(items);
      setActiveNewsIndex(0);
      setJsonText(JSON.stringify(items, null, 2));
      setJsonError(null);

      const title = data.concept ? `Learnings · ${data.concept}` : "Learnings Batch";
      const createdId = await saveToHistory("learnings-batch", title, items.length, { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme });
      if (createdId) setActiveHistoryId(createdId);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingBatch(false);
    }
  };

  const togglePosterSelection = (idx: number) => {
    setSelectedPosterIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const selectAllPosters = () => setSelectedPosterIndices(new Set(rawBatchCandidates.map((_, i) => i)));
  const clearPosterSelection = () => setSelectedPosterIndices(new Set());

  // Builds the final batch (cover + whichever candidates are checked) and
  // commits it as the active newsData — this is the point the batch is
  // actually saved to History, so History only ever reflects what the user
  // chose to keep, not the full raw AI candidate pool.
  const applyPosterSelection = async () => {
    const chosen = rawBatchCandidates.filter((_, idx) => selectedPosterIndices.has(idx));
    // Every chosen story is immediately followed by its "explain it simply"
    // bento companion card — same story, plain-language rewrite.
    const chosenWithBento = chosen.flatMap((story) => [story, buildBentoCard(story)]);
    const items: NewsItem[] = [
      ...(rawBatchCover ? [rawBatchCover] : []),
      ...chosenWithBento,
      ...(rawBatchOutro ? [rawBatchOutro] : []),
    ];
    if (items.length === 0) return;

    setNewsData(items);
    setActiveNewsIndex(0);
    setJsonText(JSON.stringify(items, null, 2));
    setJsonError(null);
    setShowSelectionModal(false);
    setActiveHistoryId(null);

    const createdId = await saveToHistory(
      "news-batch",
      `News Batch · ${chosen.length} ${chosen.length === 1 ? "story" : "stories"} · ${batchMeta?.timeRangeLabel ?? "curated"}`,
      items.length,
      { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, timeRangeLabel: batchMeta?.timeRangeLabel, reportGeneratedAt: batchMeta?.reportGeneratedAt }
    );
    if (createdId) {
      setActiveHistoryId(createdId);
    }
  };

  // Converts a pasted external-AI JSON reply (the nested {posters}/{facts}/
  // {slides} wrapper shape the "Copy Prompt" system prompt asks for, or a
  // plain flat array) into the same NewsItem[] shape a normal generation
  // produces, then commits and saves it exactly like applyPosterSelection/
  // generateFactsBatch/generateLearningsBatch do. Throws a user-facing
  // message on any failure — the caller (ShowPromptModal) surfaces it.
  const importAiBatch = async (category: "news" | "facts" | "learnings", rawText: string) => {
    const parsed = parsePastedAiJson(rawText);
    const items = importAiJson(category, parsed);

    setCreatorMode(category);
    setActiveTab("content");
    setNewsData(items);
    setActiveNewsIndex(0);
    setJsonText(JSON.stringify(items, null, 2));
    setJsonError(null);
    setActiveHistoryId(null);

    const categoryKey: "news-batch" | "facts-batch" | "learnings-batch" =
      category === "news" ? "news-batch" : category === "facts" ? "facts-batch" : "learnings-batch";
    const title = category === "news"
      ? `News Batch · ${Math.max(0, items.length - 2)} stories · pasted`
      : category === "facts"
      ? `Facts · ${Math.max(0, items.length - 2)} cards · pasted`
      : `Learnings · ${items.find((d) => d.concept)?.concept || "pasted"}`;
    const createdId = await saveToHistory(
      categoryKey,
      title,
      items.length,
      { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }
    );
    if (createdId) setActiveHistoryId(createdId);
  };

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error("API failed"); return r.json(); })
      .then(d => setCandlesData(d))
      .catch(e => console.error("Candle summary load error:", e));
  }, []);

  const [jsonText, setJsonText] = useState(JSON.stringify(EMPTY_ANALYSIS, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [rendered, setRendered] = useState(false);

  // Dynamic customization state
  const [activeTab, setActiveTab] = useState<string>("content");
  const [colors, setColors] = useState<PosterColors>({
    bg:     "#bd533c",
    accent: "#111111",
    text:   "#FFFFFF",
    muted:  "#f5e6e1",
    card:   "#FFFFFF",
    subtle: "#a84933",
  });
  
  const [config, setConfig] = useState<PosterConfig>({
    showGrid: true,
    gridSize: 28,
    gridOpacity: 0.022,
    showBorder: true,
    borderWidth: 1.5,
    showCrosses: true,
    crossSize: 10,
    fontScale: 1.0,
  });

  // Poster visual style — "editorial" (default, existing look) or "bold"
  // (full-bleed gradient + huge condensed headline). Only News/Facts/Learnings
  // read this; Daily Analysis/Indicator keep their own separate styling.
  const [posterStyle, setPosterStyle] = useState<"editorial" | "bold">("editorial");
  const [gradientPresetId, setGradientPresetId] = useState<string>(GRADIENT_PRESETS[0].id);
  const activeGradient = GRADIENT_PRESETS.find((g) => g.id === gradientPresetId) ?? GRADIENT_PRESETS[0];
  // Editorial paper-band theme — light (cream) or dark (near-black card).
  const [editorialTheme, setEditorialTheme] = useState<"light" | "dark">("light");
  // How strongly the color fade (paper-band bleed in editorial, gradient
  // scrim in Bold) washes over the photo — 0 = photo almost fully visible,
  // 100 = the fully-tuned default look, up to 200 = heaviest wash. Defaults
  // to 200 (heaviest) per user preference.
  const [gradientFade, setGradientFade] = useState<number>(200);
  // Poster "positive" sentiment tint — emerald (default) or sky blue.
  // Negative/bearish stays red and neutral text stays white in both; only
  // the bullish highlight color swaps between the two options.
  const [sentimentScheme, setSentimentScheme] = useState<SentimentScheme>("emerald");
  // "Set as Default" — saves the settings above (not the poster content) to
  // the user's account so every future visit starts from this look instead
  // of the factory defaults. Loaded once on mount, below.
  const [defaultSaveStatus, setDefaultSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [elementBounds, setElementBounds] = useState<PosterElement[]>([]);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Click-drag-to-pan / scroll-to-zoom on the news poster image. The
  // currently-loaded image element is kept in a ref (set when render()
  // loads it) so the drag/wheel handlers can read its natural dimensions
  // synchronously without re-loading anything.
  const activeImgRef = useRef<HTMLImageElement | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startFocusX: number;
    startFocusY: number;
    boxW: number;
    boxH: number;
    zoom: number;
    moved: boolean;
    liveFocusX: number;
    liveFocusY: number;
  } | null>(null);

  const ar = RATIOS.find((r) => r.id === ratioId)!;

  // Compute CSS scale so canvas fits preview area
  // Load the user's saved "default settings" once on mount, if they've ever
  // saved one — overrides the hardcoded factory defaults above. Silently
  // keeps the factory defaults on any failure (logged-out, network error,
  // or simply never saved one yet).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/content-creator/defaults");
        if (!res.ok) return;
        const data = await res.json();
        const s = data?.settings;
        if (!s || typeof s !== "object") return;
        if (s.ratioId) setRatioId(s.ratioId);
        if (s.colors) setColors(s.colors);
        if (s.config) setConfig(s.config);
        if (s.posterStyle === "editorial" || s.posterStyle === "bold") setPosterStyle(s.posterStyle);
        if (s.gradientPresetId) setGradientPresetId(s.gradientPresetId);
        if (s.editorialTheme === "light" || s.editorialTheme === "dark") setEditorialTheme(s.editorialTheme);
        if (typeof s.gradientFade === "number") setGradientFade(s.gradientFade);
        if (s.sentimentScheme === "emerald" || s.sentimentScheme === "skyblue") setSentimentScheme(s.sentimentScheme);
      } catch {
        // Factory defaults already in state — nothing to do.
      }
    })();
  }, []);

  useEffect(() => {
    if (!previewRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const s = Math.min(width / ar.w, (height - 0) / ar.h, 1);
      setScale(Number(s.toFixed(4)));
    });
    obs.observe(previewRef.current);
    return () => obs.disconnect();
  }, [ar.w, ar.h]);

  // Sync creatorMode -> jsonText
  useEffect(() => {
    if (creatorMode === "analysis") {
      setJsonText(JSON.stringify(analysisData, null, 2));
    } else if (isBatchMode) {
      setJsonText(JSON.stringify(newsData, null, 2));
    } else {
      setJsonText(JSON.stringify(parsedData, null, 2));
    }
    setJsonError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorMode]);

  // Sync jsonText -> parsedData
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonError(null);
      if (creatorMode === "analysis") {
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setAnalysisData(parsed);
        }
      } else if (isBatchMode) {
        if (Array.isArray(parsed)) {
          setNewsData(parsed);
          if (activeNewsIndex >= parsed.length) {
            setActiveNewsIndex(Math.max(0, parsed.length - 1));
          }
        } else if (parsed && typeof parsed === "object") {
          // A pasted external-AI reply usually comes back as the nested
          // {posters}/{facts}/{slides} wrapper the system prompt asked for,
          // not the flat array the renderer needs — convert instead of
          // silently doing nothing.
          try {
            const items = importAiJson(creatorMode as "news" | "facts" | "learnings", parsed);
            setNewsData(items);
            setActiveNewsIndex(0);
          } catch (convErr) {
            setJsonError(convErr instanceof Error ? convErr.message : "Unrecognized JSON shape for this mode.");
          }
        }
      } else {
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setParsedData(parsed);
        }
      }
    } catch (e: any) {
      setJsonError(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonText, creatorMode]);

  // Handler to update a field in active state & jsonText
  const handleUpdateField = (key: string, val: any) => {
    if (creatorMode === "analysis") {
      const updated = { ...analysisData, [key]: val } as AnalysisData;
      setAnalysisData(updated);
      setJsonText(JSON.stringify(updated, null, 2));
    } else if (isBatchMode) {
      const updatedList = [...newsData];
      if (updatedList[activeNewsIndex]) {
        updatedList[activeNewsIndex] = { ...updatedList[activeNewsIndex], [key]: val };
        setNewsData(updatedList);
        setJsonText(JSON.stringify(updatedList, null, 2));
      }
    } else {
      const updated = { ...parsedData, [key]: val } as PosterData;
      setParsedData(updated);
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Handler to click elements on canvas
  const handleElementClick = (fieldId: string) => {
    // News posters: clicking the empty image frame opens the OS file picker
    // to attach the first image. Once an image exists, plain clicks on it do
    // nothing — drag pans it, scroll zooms it, and the dedicated "Change
    // Image" button (rendered on the box itself) handles replacement.
    if (fieldId === "imageUrl" && isBatchMode) {
      if (!newsData[activeNewsIndex]?.imageUrl) imageFileRef.current?.click();
      return;
    }

    setActiveTab("content");
    setHighlightedField(fieldId);

    setTimeout(() => {
      const el = document.getElementById(`input-${fieldId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 100);
  };

  // Click-drag-to-pan on the news poster image. Drives the canvas directly
  // (bypassing the jsonText round-trip) during the drag for smooth 60fps
  // feedback — re-stringifying the whole newsData array on every mousemove
  // would be expensive when a poster's imageUrl is a multi-MB base64 data
  // URL. State (and jsonText) is committed once, on mouseup.
  const handleImageMouseDown = (e: React.MouseEvent, box: PosterElement) => {
    if (!isBatchMode) return;
    const item = newsData[activeNewsIndex];
    if (!item?.imageUrl) return; // no image yet — let the click-to-upload flow handle it
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startFocusX: item.imageFocusX ?? 0.5,
      startFocusY: item.imageFocusY ?? 0.5,
      boxW: box.w,
      boxH: box.h,
      zoom: item.imageZoom ?? 1,
      moved: false,
      liveFocusX: item.imageFocusX ?? 0.5,
      liveFocusY: item.imageFocusY ?? 0.5,
    };
    setIsDraggingImage(true);
  };

  useEffect(() => {
    if (!isDraggingImage) return;

    const handleMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      const img = activeImgRef.current;
      if (!ds || !img) return;

      const dxScreen = e.clientX - ds.startClientX;
      const dyScreen = e.clientY - ds.startClientY;
      if (Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3) ds.moved = true;
      const dxCanvas = dxScreen / scale;
      const dyCanvas = dyScreen / scale;

      const iAR = img.naturalWidth / img.naturalHeight;
      const { slackX, slackY } = computeCoverFitSlack(iAR, ds.boxW, ds.boxH, ds.zoom);
      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
      ds.liveFocusX = slackX > 0 ? clamp01(ds.startFocusX - dxCanvas / slackX) : ds.startFocusX;
      ds.liveFocusY = slackY > 0 ? clamp01(ds.startFocusY - dyCanvas / slackY) : ds.startFocusY;

      const item = newsData[activeNewsIndex];
      if (item && canvasRef.current) {
        const liveData = { ...item, imageFocusX: ds.liveFocusX, imageFocusY: ds.liveFocusY };
        const bounds = drawPoster(canvasRef.current, liveData, ar, colors, config, img, creatorMode, activeNewsIndex, newsData.length, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
        setElementBounds(bounds);
      }
    };

    const handleUp = () => {
      const ds = dragStateRef.current;
      if (ds?.moved && newsData[activeNewsIndex]) {
        const updated = [...newsData];
        updated[activeNewsIndex] = { ...updated[activeNewsIndex], imageFocusX: ds.liveFocusX, imageFocusY: ds.liveFocusY };
        setNewsData(updated);
        setJsonText(JSON.stringify(updated, null, 2));
      }
      setIsDraggingImage(false);
      dragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDraggingImage, scale, ar, colors, config, creatorMode, activeNewsIndex, newsData, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme]);

  // Scroll-to-zoom on the news poster image. React 19 attaches the delegated
  // "wheel" listener as passive by default, so preventDefault() inside a
  // normal onWheel prop is silently ignored (and warns) — a native listener
  // with { passive: false } is required to actually stop page scroll here.
  const wheelNodeRef = useRef<HTMLDivElement | null>(null);
  const handleImageWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setNewsData((prev) => {
      const idx = activeNewsIndex;
      const item = prev[idx];
      if (!item?.imageUrl) return prev;
      const current = item.imageZoom ?? 1;
      const next = Math.max(1, Math.min(2.5, current - Math.sign(e.deltaY) * 0.08));
      const updated = [...prev];
      updated[idx] = { ...item, imageZoom: next };
      setJsonText(JSON.stringify(updated, null, 2));
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNewsIndex]);

  const setImageWheelRef = useCallback((node: HTMLDivElement | null) => {
    if (wheelNodeRef.current) {
      wheelNodeRef.current.removeEventListener("wheel", handleImageWheelNative);
    }
    wheelNodeRef.current = node;
    if (node) {
      node.addEventListener("wheel", handleImageWheelNative, { passive: false });
    }
  }, [handleImageWheelNative]);

  // File → data URL → active poster's imageUrl. Shared by the hidden file
  // input (click-to-upload) and every drag-and-drop zone below.
  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === "string") {
        const compressed = await compressImage(reader.result);
        handleUpdateField("imageUrl", compressed);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange
    e.target.value = "";
    if (file) processImageFile(file);
  };

  // Dragging a file anywhere over an image drop zone — highlight it exactly
  // like the existing hover treatment so drag feels like an extension of
  // click-to-upload, not a separate feature.
  const handleImageDragOver = (e: React.DragEvent<HTMLElement>, accentColor: string) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.currentTarget.style.borderColor = accentColor;
    e.currentTarget.style.backgroundColor = `${accentColor}25`;
    e.currentTarget.style.borderStyle = "solid";
  };

  const handleImageDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "transparent";
    e.currentTarget.style.backgroundColor = "transparent";
    e.currentTarget.style.borderStyle = "dashed";
  };

  const handleImageDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = "transparent";
    e.currentTarget.style.backgroundColor = "transparent";
    e.currentTarget.style.borderStyle = "dashed";
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  // Clear highlighted field styling after 2 seconds
  useEffect(() => {
    if (highlightedField) {
      const timer = setTimeout(() => {
        setHighlightedField(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightedField]);

  // Metrics handlers
  const handleUpdateMetric = (index: number, field: "label" | "value", val: string) => {
    const nextMetrics = [...(parsedData.metrics || [])];
    if (nextMetrics[index]) {
      nextMetrics[index] = { ...nextMetrics[index], [field]: val };
      const updated = { ...parsedData, metrics: nextMetrics };
      setParsedData(updated);
      if (creatorMode === "indicator") {
        setJsonText(JSON.stringify(updated, null, 2));
      }
    }
  };

  const handleDeleteMetric = (index: number) => {
    const nextMetrics = (parsedData.metrics || []).filter((_, i) => i !== index);
    const updated = { ...parsedData, metrics: nextMetrics };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  const handleAddMetric = () => {
    const nextMetrics = [...(parsedData.metrics || []), { label: "NEW METRIC", value: "Value" }];
    const updated = { ...parsedData, metrics: nextMetrics };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Sections handlers
  const handleUpdateSection = (index: number, field: "label" | "content", val: string) => {
    const nextSections = [...(parsedData.sections || [])];
    if (nextSections[index]) {
      nextSections[index] = { ...nextSections[index], [field]: val };
      const updated = { ...parsedData, sections: nextSections };
      setParsedData(updated);
      if (creatorMode === "indicator") {
        setJsonText(JSON.stringify(updated, null, 2));
      }
    }
  };

  const handleDeleteSection = (index: number) => {
    const nextSections = (parsedData.sections || []).filter((_, i) => i !== index);
    const updated = { ...parsedData, sections: nextSections };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  const handleAddSection = () => {
    const nextSections = [...(parsedData.sections || []), { label: "NEW SECTION", content: "Section details..." }];
    const updated = { ...parsedData, sections: nextSections };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Tag handlers
  const handleAddTag = (tagStr: string) => {
    const trimmed = tagStr.trim();
    if (!trimmed) return;
    const nextTags = [...(parsedData.tags || []), trimmed];
    const updated = { ...parsedData, tags: nextTags };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  const handleDeleteTag = (index: number) => {
    const nextTags = (parsedData.tags || []).filter((_, i) => i !== index);
    const updated = { ...parsedData, tags: nextTags };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Render poster to canvas
  const render = useCallback(() => {
    let activeData: any;
    try {
      const parsed = JSON.parse(jsonText);
      if (isBatchMode) {
        if (Array.isArray(parsed) && parsed.length > 0) {
          activeData = withBentoImageFallback(parsed[activeNewsIndex] || parsed[0], parsed);
        } else {
          activeData = parsed;
        }
      } else {
        activeData = parsed;
      }
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
      return;
    }

    if (!activeData) return;

    if (activeData.imageUrl) {
      const imageUrl = activeData.imageUrl;
      if (loadedImagesRef.current[imageUrl]) {
        const imgEl = loadedImagesRef.current[imageUrl];
        activeImgRef.current = imgEl;
        if (canvasRef.current) {
          const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, imgEl, creatorMode, activeNewsIndex, newsData.length, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
          setElementBounds(bounds);
          setRendered(true);
        }
      } else {
        const imgEl = new Image();
        imgEl.crossOrigin = "anonymous";
        imgEl.onload = () => {
          loadedImagesRef.current[imageUrl] = imgEl;
          activeImgRef.current = imgEl;
          if (canvasRef.current) {
            const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, imgEl, creatorMode, activeNewsIndex, newsData.length, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
            setElementBounds(bounds);
            setRendered(true);
          }
        };
        imgEl.onerror = () => {
          activeImgRef.current = null;
          if (canvasRef.current) {
            const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, null, creatorMode, activeNewsIndex, newsData.length, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
            setElementBounds(bounds);
            setRendered(true);
          }
        };
        imgEl.src = imageUrl;
      }
    } else {
      activeImgRef.current = null;
      if (canvasRef.current) {
        const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, null, creatorMode, activeNewsIndex, newsData.length, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
        setElementBounds(bounds);
        setRendered(true);
      }
    }
  }, [jsonText, ar, colors, config, creatorMode, isBatchMode, activeNewsIndex, newsData.length, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme]);

  // Re-render when dependencies change
  useEffect(() => {
    render();
  }, [render]);

  // The Bold headline is set in Anton, a self-hosted display font — canvas
  // text doesn't wait for webfonts the way DOM text does, so a render that
  // fires before the font finishes downloading silently falls back to the
  // system stack and never self-corrects. Force one re-paint once it's ready.
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    document.fonts.load(`400 100px ${getAntonFontFamily()}`).then(() => render()).catch(() => {});
  }, [render]);

  // Auto-persist an already-saved batch to the DB whenever it changes — most
  // importantly the moment an image is attached, so the image lands in the DB
  // for that news/facts/learnings entry without a manual re-save. Debounced,
  // PUT-only (never creates a new entry), and skips no-op saves via a cheap
  // signature (image byte-length, not the megabytes of base64 themselves).
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveSigRef = useRef<string>("");
  useEffect(() => {
    if (!activeHistoryId || !isBatchMode || newsData.length === 0) return;

    const sig = [
      activeHistoryId, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, ratioId,
      JSON.stringify(colors), JSON.stringify(config),
      newsData.map((d: any) => `${d.title || ""}~${d.description || ""}~${d.imageUrl?.length || 0}~${d.imageFocusX ?? ""}~${d.imageFocusY ?? ""}~${d.imageZoom ?? ""}~${d.impact || ""}~${d.sentiment || ""}`).join("#"),
    ].join("|");
    if (sig === lastAutoSaveSigRef.current) return;

    const payload: Record<string, unknown> = { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme };
    if (creatorMode === "news" && batchMeta) {
      payload.timeRangeLabel = batchMeta.timeRangeLabel;
      payload.reportGeneratedAt = batchMeta.reportGeneratedAt;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      lastAutoSaveSigRef.current = sig;
      fetch(`/api/content-creator/history/${activeHistoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCount: newsData.length, payload }),
      }).catch((e) => console.warn("Auto-save failed:", e));
    }, 500);

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsData, activeHistoryId, isBatchMode, creatorMode, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, batchMeta]);

  function download() {
    if (!rendered) return;

    const tempCanvas = document.createElement("canvas");
    const scaleFactor = 3.0; // 3x high resolution
    const highResAr = {
      ...ar,
      w: ar.w * scaleFactor,
      h: ar.h * scaleFactor
    };

    let activeData: any;
    try {
      const parsed = JSON.parse(jsonText);
      if (isBatchMode) {
        if (Array.isArray(parsed) && parsed.length > 0) {
          activeData = withBentoImageFallback(parsed[activeNewsIndex] || parsed[0], parsed);
        } else {
          activeData = parsed;
        }
      } else {
        activeData = parsed;
      }
    } catch {
      return;
    }

    if (!activeData) return;

    drawPoster(
      tempCanvas,
      activeData,
      highResAr,
      colors,
      config,
      activeImgRef.current,
      creatorMode,
      activeNewsIndex,
      newsData.length,
      posterStyle,
      activeGradient,
      editorialTheme,
      gradientFade,
      sentimentScheme
    );

    let fileName = `stratix-poster-${ratioId}-${Date.now()}.png`;
    if (creatorMode === "analysis") {
      const symbol = (analysisData.instrument || "analysis").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      fileName = `stratix-analysis-${symbol}-${ratioId}-${Date.now()}.png`;
    } else if (isBatchMode && newsData[activeNewsIndex]) {
      const titleSlug = (newsData[activeNewsIndex].title || creatorMode).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20);
      fileName = `stratix-${creatorMode}-${activeNewsIndex + 1}-${titleSlug}-${ratioId}-${Date.now()}.png`;
    }

    const a = document.createElement("a");
    a.href = tempCanvas.toDataURL("image/png");
    a.download = fileName;
    a.click();
  }

  // Preloads images in parallel and packages all batch cards into a high-res ZIP
  const downloadAll = async () => {
    if (!isBatchMode || newsData.length === 0) return;
    setDownloadingZip(true);
    
    try {
      // 1. Preload all background images in parallel
      await Promise.all(
        newsData.map(async (item) => {
          const imageUrl = item.imageUrl;
          if (!imageUrl || loadedImagesRef.current[imageUrl]) return;
          
          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";
          await new Promise((resolve) => {
            imgEl.onload = () => {
              loadedImagesRef.current[imageUrl] = imgEl;
              resolve(null);
            };
            imgEl.onerror = () => resolve(null);
            imgEl.src = imageUrl;
          });
        })
      );

      // 2. Render each poster sequentially on a high-res temporary canvas and add to JSZip
      const zip = new JSZip();
      const scaleFactor = 3.0; // 3x high resolution
      const highResAr = {
        ...ar,
        w: ar.w * scaleFactor,
        h: ar.h * scaleFactor
      };

      for (let i = 0; i < newsData.length; i++) {
        const item = withBentoImageFallback(newsData[i], newsData);
        const tempCanvas = document.createElement("canvas");
        const cachedImg = item.imageUrl ? loadedImagesRef.current[item.imageUrl] : null;

        drawPoster(
          tempCanvas,
          item,
          highResAr,
          colors,
          config,
          cachedImg,
          creatorMode,
          i,
          newsData.length,
          posterStyle,
          activeGradient,
          editorialTheme,
          gradientFade,
          sentimentScheme
        );

        const dataUrl = tempCanvas.toDataURL("image/png");
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

        const titleSlug = (item.title || creatorMode)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 20);

        const fileName = `stratix-${creatorMode}-${i + 1}-${titleSlug}.png`;
        zip.file(fileName, base64Data, { base64: true });
      }

      // 3. Generate ZIP and trigger browser download
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stratix-${creatorMode}-batch-${ratioId}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("ZIP Generation failed:", e);
    } finally {
      setDownloadingZip(false);
    }
  };

  // Style helpers for text inputs
  const inputStyle = {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "#ffffff",
    outline: "none",
    fontFamily: "var(--font-sans), sans-serif",
  };

  const getFieldClassName = (fieldId: string) => {
    return `w-full rounded-xl px-3 py-2 text-[12px] outline-none transition-all duration-300 focus:border-white/20 focus:ring-1 focus:ring-white/10 ${
      highlightedField === fieldId ? "ring-2 ring-white/30 border-white/40 bg-white/5 text-white" : ""
    }`;
  };

  const TABS = [
    { id: "content", label: "Content", icon: Edit3 },
    { id: "colors", label: "Colors", icon: Palette },
    { id: "layout", label: "Layout", icon: Sliders },
    { id: "json", label: "JSON", icon: Code2 },
    { id: "ai-prompt", label: "AI Prompt", icon: Bot },
  ];

  return (
    <div className="flex h-full overflow-hidden text-white/80 font-sans selection:bg-white/10 selection:text-white relative">
      {/* Backdrop — mobile only, closes the panel when it's shown as an overlay drawer */}
      {!panelCollapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setPanelCollapsed(true)}
          aria-hidden="true"
        />
      )}
      {/* ── Left Panel ─────────────────────────────────────────────────────── */}
      {/* On mobile this floats as a full-height overlay drawer over the canvas
          (fixed + z-40) instead of squeezing a 350px column out of a ~375px
          viewport; md+ keeps the original in-flow collapse/expand behavior. */}
      <div
        className={`flex flex-col shrink-0 overflow-hidden glass-liquid transition-all duration-300 ease-in-out fixed md:relative inset-y-0 left-0 z-40 md:z-auto ${
          panelCollapsed ? "w-0 border-r-0 opacity-0 pointer-events-none" : "w-[85vw] max-w-[350px] md:w-[350px] border-r opacity-100"
        }`}
        style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        {/* Static content container to avoid squishing during collapse transition — matches the expanded outer width exactly */}
        <div className="w-[85vw] max-w-[350px] md:w-[350px] flex flex-col h-full flex-grow">
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b shrink-0"
            style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPanelCollapsed(true)}
                className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition cursor-pointer"
                title="Collapse Panel"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Layers2 className="h-4 w-4 shrink-0 text-white/60" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-white/90">
                Content Creator
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSetAsDefault}
                disabled={defaultSaveStatus === "saving"}
                title="Save the current style settings (ratio, colors, poster style, gradient, fade, highlight colors) as your default for every future visit"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer disabled:cursor-wait ${
                  defaultSaveStatus === "saved"
                    ? "border-emerald-500/[0.35] bg-emerald-500/[0.14] text-emerald-300"
                    : defaultSaveStatus === "error"
                    ? "border-red-500/[0.35] bg-red-500/[0.14] text-red-300"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/60 hover:text-white/90"
                }`}
              >
                <Star className={`h-3 w-3 ${defaultSaveStatus === "saved" ? "fill-emerald-300" : ""}`} />
                <span className="hidden xs:inline">
                  {defaultSaveStatus === "saving" ? "Saving…" : defaultSaveStatus === "saved" ? "Saved" : defaultSaveStatus === "error" ? "Failed" : "Set as Default"}
                </span>
              </button>
              {creatorMode === "news" && rawBatchCandidates.length > 0 && (
                <button
                  onClick={() => setShowSelectionModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-emerald-500/[0.25] bg-emerald-500/[0.1] hover:bg-emerald-500/[0.16] cursor-pointer text-emerald-300"
                >
                  <ListChecks className="h-3 w-3" /> Select Posters
                </button>
              )}
            </div>
          </div>

        {/* Creator Mode Switcher */}
        <div className="px-4 py-1.5 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          <label className="text-[8.5px] font-bold uppercase tracking-widest text-[#787870] block mb-1">
            Creator Mode
          </label>
          {/* Horizontally scrollable strip — 5 labels (incl. two-word ones like
              "Daily Analysis") never fit evenly in a 3-wide grid on the ~300px
              mobile panel without wrapping onto 2 lines, so each pill sizes to
              its own text and the strip scrolls instead. */}
          <div className="flex gap-0.5 bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["analysis", "news", "indicator", "facts", "learnings"] as const).map((m) => {
              const active = creatorMode === m;
              const labels: Record<CreatorMode, string> = {
                analysis: "Daily Analysis",
                news: "News Batch",
                indicator: "Indicator",
                facts: "Facts",
                learnings: "Learnings",
              };
              return (
                <button
                  key={m}
                  onClick={() => setCreatorMode(m)}
                  className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-md transition-all cursor-pointer text-[9.5px] font-bold uppercase tracking-wider text-center ${
                    active
                      ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                      : "text-[#787870] hover:text-white/60"
                  }`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-4 py-1 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          <div className="flex bg-white/[0.03] border border-white/[0.06] p-0.5 rounded-lg">
            <TooltipProvider delay={100}>
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger
                      render={
                        <button
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all cursor-pointer ${
                            active
                              ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                              : "text-[#787870] hover:text-white/60"
                          }`}
                        />
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent side="top">{tab.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </div>

        {/* Scrollable Configuration Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* CONTENT TAB */}
          {activeTab === "content" && (
            <div className="space-y-3.5">
              
              {creatorMode === "analysis" && (
                <>
                  {/* Category & Date */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Category</label>
                      <input
                        id="input-category"
                        type="text"
                        className={getFieldClassName("category")}
                        style={inputStyle}
                        value={analysisData.category || ""}
                        onChange={(e) => handleUpdateField("category", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Date</label>
                      <input
                        id="input-date"
                        type="text"
                        className={getFieldClassName("date")}
                        style={inputStyle}
                        value={analysisData.date || ""}
                        onChange={(e) => handleUpdateField("date", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Instrument, Timeframe & Session */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Instrument</label>
                      <input
                        id="input-instrument"
                        type="text"
                        placeholder="E.g. EURUSD"
                        className={getFieldClassName("instrument")}
                        style={inputStyle}
                        value={analysisData.instrument || ""}
                        onChange={(e) => handleUpdateField("instrument", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Timeframe</label>
                      <input
                        id="input-timeframe"
                        type="text"
                        placeholder="E.g. H4"
                        className={getFieldClassName("timeframe")}
                        style={inputStyle}
                        value={analysisData.timeframe || ""}
                        onChange={(e) => handleUpdateField("timeframe", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Session</label>
                      <input
                        id="input-session"
                        type="text"
                        placeholder="E.g. London"
                        className={getFieldClassName("session")}
                        style={inputStyle}
                        value={analysisData.session || ""}
                        onChange={(e) => handleUpdateField("session", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Level Name */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Level Name</label>
                    <input
                      id="input-levelName"
                      type="text"
                      placeholder="E.g. Daily Demand Zone"
                      className={getFieldClassName("levelName")}
                      style={inputStyle}
                      value={analysisData.levelName || ""}
                      onChange={(e) => handleUpdateField("levelName", e.target.value)}
                    />
                  </div>

                  {/* Description / Explanation */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Explanation</label>
                    <textarea
                      id="input-description"
                      className={getFieldClassName("description")}
                      style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
                      placeholder="Explain the level and strategy..."
                      value={analysisData.description || ""}
                      onChange={(e) => handleUpdateField("description", e.target.value)}
                    />
                  </div>

                  {/* Action Plan (What to Do) */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Action Plan (What to Do)</label>
                    <textarea
                      id="input-whatToDo"
                      className={getFieldClassName("whatToDo")}
                      style={{ ...inputStyle, minHeight: "50px", resize: "vertical" }}
                      placeholder="E.g. look for buy triggers on lower timeframe..."
                      value={analysisData.whatToDo || ""}
                      onChange={(e) => handleUpdateField("whatToDo", e.target.value)}
                    />
                  </div>

                  {/* Key Levels */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Key Levels</label>
                    <input
                      id="input-keyLevels"
                      type="text"
                      placeholder="E.g. Support: 2320.50, Resistance: 2355.00"
                      className={getFieldClassName("keyLevels")}
                      style={inputStyle}
                      value={analysisData.keyLevels || ""}
                      onChange={(e) => handleUpdateField("keyLevels", e.target.value)}
                    />
                  </div>

                  {/* Image URL — also a drag-and-drop zone */}
                  <div
                    className="rounded-xl border border-dashed border-transparent transition-colors p-1 -m-1"
                    onDragOver={(e) => handleImageDragOver(e, colors.accent)}
                    onDragLeave={handleImageDragLeave}
                    onDrop={handleImageDrop}
                  >
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Chart Image URL (or drag &amp; drop)</label>
                    <div className="flex gap-2">
                      <input
                        id="input-imageUrl"
                        type="text"
                        placeholder="https://example.com/chart.png"
                        className={getFieldClassName("imageUrl")}
                        style={inputStyle}
                        value={analysisData.imageUrl || ""}
                        onChange={(e) => handleUpdateField("imageUrl", e.target.value)}
                      />
                      <button
                        onClick={() => imageFileRef.current?.click()}
                        title="Choose an image from your PC"
                        className="flex items-center gap-1.5 px-3 rounded-xl text-[10px] font-bold shrink-0 transition-all cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
                      >
                        <Upload className="h-3 w-3" />
                        Upload
                      </button>
                    </div>
                  </div>

                  {/* Footer Brand */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Footer Brand</label>
                    <input
                      id="input-footer"
                      type="text"
                      className={getFieldClassName("footer")}
                      style={inputStyle}
                      value={analysisData.footer || ""}
                      onChange={(e) => handleUpdateField("footer", e.target.value)}
                    />
                  </div>
                </>
              )}

              {creatorMode === "news" && (
                <>
                  {newsData.length > 0 && newsData[activeNewsIndex] ? (
                    <div className="space-y-3.5">
                      {/* Bento explainer companion card — a distinct, simpler field set */}
                      {newsData[activeNewsIndex].isBento && (
                        <div className="space-y-3.5">
                          <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.05] px-3 py-2">
                            <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                              Explains <span className="font-semibold">&ldquo;{newsData[activeNewsIndex].relatedTitle || "this story"}&rdquo;</span> in plain language — this card renders as a bento grid, no photo needed.
                            </p>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Simple Headline</label>
                            <input
                              id="input-simpleHeadline"
                              type="text"
                              className={getFieldClassName("simpleHeadline")}
                              style={inputStyle}
                              value={newsData[activeNewsIndex].simpleHeadline || ""}
                              onChange={(e) => handleUpdateField("simpleHeadline", e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">What Happened</label>
                            <textarea
                              id="input-whatHappened"
                              className={getFieldClassName("whatHappened")}
                              style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                              value={newsData[activeNewsIndex].whatHappened || ""}
                              onChange={(e) => handleUpdateField("whatHappened", e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Why It Matters</label>
                            <textarea
                              id="input-whyItMatters"
                              className={getFieldClassName("whyItMatters")}
                              style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
                              value={newsData[activeNewsIndex].whyItMatters || ""}
                              onChange={(e) => handleUpdateField("whyItMatters", e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-2">
                              Who This Affects
                            </label>
                            <div className="space-y-2">
                              {(newsData[activeNewsIndex].simpleImpacts || []).map((imp, idx) => (
                                <div key={idx} className="flex gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="Market"
                                    className={getFieldClassName("simpleImpacts")}
                                    style={{ ...inputStyle, flex: "0 0 30%" }}
                                    value={imp.market}
                                    onChange={(e) => {
                                      const next = [...(newsData[activeNewsIndex].simpleImpacts || [])];
                                      next[idx] = { ...next[idx], market: e.target.value };
                                      handleUpdateField("simpleImpacts", next);
                                    }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Effect, in plain words"
                                    className={getFieldClassName("simpleImpacts")}
                                    style={{ ...inputStyle, flex: "1" }}
                                    value={imp.effect}
                                    onChange={(e) => {
                                      const next = [...(newsData[activeNewsIndex].simpleImpacts || [])];
                                      next[idx] = { ...next[idx], effect: e.target.value };
                                      handleUpdateField("simpleImpacts", next);
                                    }}
                                  />
                                  <select
                                    className={getFieldClassName("simpleImpacts")}
                                    style={{ ...inputStyle, flex: "0 0 76px", background: "#181614", color: "#F0EBE3" }}
                                    value={imp.direction}
                                    onChange={(e) => {
                                      const next = [...(newsData[activeNewsIndex].simpleImpacts || [])];
                                      next[idx] = { ...next[idx], direction: e.target.value as "up" | "down" | "neutral" };
                                      handleUpdateField("simpleImpacts", next);
                                    }}
                                  >
                                    <option value="up">Up</option>
                                    <option value="down">Down</option>
                                    <option value="neutral">Same</option>
                                  </select>
                                  <button
                                    onClick={() => {
                                      const next = (newsData[activeNewsIndex].simpleImpacts || []).filter((_, i) => i !== idx);
                                      handleUpdateField("simpleImpacts", next);
                                    }}
                                    className="shrink-0 flex items-center justify-center w-7 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => {
                                  const next = [...(newsData[activeNewsIndex].simpleImpacts || []), { market: "", effect: "", direction: "neutral" as const }];
                                  handleUpdateField("simpleImpacts", next);
                                }}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 hover:text-white/70 transition cursor-pointer"
                              >
                                <Plus className="h-3 w-3" /> Add market
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Title / Headline */}
                      {!newsData[activeNewsIndex].isBento && (
                      <div>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Headline</label>
                        <input
                          id="input-title"
                          type="text"
                          className={getFieldClassName("title")}
                          style={inputStyle}
                          value={newsData[activeNewsIndex].title || ""}
                          onChange={(e) => handleUpdateField("title", e.target.value)}
                        />
                      </div>
                      )}

                      {/* Description */}
                      {!newsData[activeNewsIndex].isBento && (
                      <div>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Summary</label>
                        <textarea
                          id="input-description"
                          className={getFieldClassName("description")}
                          style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                          value={newsData[activeNewsIndex].description || ""}
                          onChange={(e) => handleUpdateField("description", e.target.value)}
                        />
                      </div>
                      )}

                      {/* Impact & Sentiment Biases */}
                      {!newsData[activeNewsIndex].isBento && (
                      <div className="space-y-3.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Impact Level</label>
                          <select
                            className={getFieldClassName("impact")}
                            style={{ ...inputStyle, background: "#181614", color: "#F0EBE3" }}
                            value={newsData[activeNewsIndex].impact || "Medium"}
                            onChange={(e) => handleUpdateField("impact", e.target.value)}
                          >
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Sentiment Bias</label>
                          <select
                            className={getFieldClassName("sentiment")}
                            style={{ ...inputStyle, background: "#181614", color: "#F0EBE3" }}
                            value={newsData[activeNewsIndex].sentiment || "Neutral"}
                            onChange={(e) => handleUpdateField("sentiment", e.target.value)}
                          >
                            <option value="Bullish">Bullish</option>
                            <option value="Bearish">Bearish</option>
                            <option value="Neutral">Neutral</option>
                          </select>
                        </div>
                      </div>

                      {/* Affected Assets */}
                      <div>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Affected Assets</label>
                        <input
                          id="input-affectedAssets"
                          type="text"
                          placeholder="E.g. USD, XAUUSD, Equities"
                          className={getFieldClassName("affectedAssets")}
                          style={inputStyle}
                          value={newsData[activeNewsIndex].affectedAssets || ""}
                          onChange={(e) => handleUpdateField("affectedAssets", e.target.value)}
                        />
                      </div>

                      {/* Key Takeaway */}
                      <div>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Key Takeaway & Market Bias</label>
                        <textarea
                          id="input-keyTakeaway"
                          className={getFieldClassName("keyTakeaway")}
                          style={{ ...inputStyle, minHeight: "50px", resize: "vertical" }}
                          placeholder="E.g. Yields collapsed, reinforcing Gold demand..."
                          value={newsData[activeNewsIndex].keyTakeaway || ""}
                          onChange={(e) => handleUpdateField("keyTakeaway", e.target.value)}
                        />
                      </div>

                      {/* Instagram Caption + Hashtags — editable, plus a single
                          button that copies both together, spaced with the
                          standard creator "dot trick" so hashtags land below
                          the caption's "...more" fold instead of cluttering it. */}
                      <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.04] p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <ClipboardCopy className="h-3 w-3 text-emerald-400/80" />
                            <span className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-wider">
                              {newsData[activeNewsIndex].isCover ? "Instagram Caption (Whole Carousel)" : "Instagram Caption + Hashtags"}
                            </span>
                          </div>
                          <CopyButton
                            text={buildInstagramCopyText(newsData[activeNewsIndex].caption || "", newsData[activeNewsIndex].hashtags || [])}
                            label="Copy All"
                            disabled={!newsData[activeNewsIndex].caption && !(newsData[activeNewsIndex].hashtags || []).length}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Caption</label>
                          <textarea
                            id="input-caption"
                            className={getFieldClassName("caption")}
                            style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }}
                            placeholder="E.g. Inflation just cooled to 2.8%... here's what it means for your trades."
                            value={newsData[activeNewsIndex].caption || ""}
                            onChange={(e) => handleUpdateField("caption", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-semibold text-white/40 uppercase tracking-wider block mb-1">
                            Hashtags ({(newsData[activeNewsIndex].hashtags || []).length})
                          </label>
                          <textarea
                            id="input-hashtags"
                            className={getFieldClassName("hashtags")}
                            style={{ ...inputStyle, minHeight: "60px", resize: "vertical", fontFamily: "var(--font-mono), monospace", fontSize: "10.5px" }}
                            placeholder="#Trading #Forex #Gold ..."
                            value={(newsData[activeNewsIndex].hashtags || []).join(" ")}
                            onChange={(e) => handleUpdateField("hashtags", e.target.value.split(/\s+/).map((s) => s.trim()).filter(Boolean))}
                          />
                        </div>
                        <p className="text-[9px] text-white/30 leading-snug">
                          &quot;Copy All&quot; pastes the caption and hashtags together in one go, ready to paste straight into Instagram.
                        </p>
                      </div>

                      {/* Grok Imagine prompt for this poster's image */}
                      {newsData[activeNewsIndex].imagePrompt && (
                        <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.04] p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-emerald-400/80" />
                              <span className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-wider">
                                Grok Image Prompt
                              </span>
                            </div>
                            <CopyButton text={newsData[activeNewsIndex].imagePrompt!} label="Copy" />
                          </div>
                          <p className="text-[10.5px] text-white/55 leading-relaxed max-h-32 overflow-y-auto select-text whitespace-pre-wrap">
                            {newsData[activeNewsIndex].imagePrompt}
                          </p>
                          <p className="text-[9px] text-white/30 leading-snug">
                            Paste into Grok Imagine → save the image → click the poster&apos;s image area (or Upload) to attach it.
                          </p>
                        </div>
                      )}

                      {/* Image URL + local file upload — also a drag-and-drop zone */}
                      <div
                        className="rounded-xl border border-dashed border-transparent transition-colors p-1 -m-1"
                        onDragOver={(e) => handleImageDragOver(e, colors.accent)}
                        onDragLeave={handleImageDragLeave}
                        onDrop={handleImageDrop}
                      >
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">News Image (or drag &amp; drop)</label>
                        <div className="flex gap-2">
                          <input
                            id="input-imageUrl"
                            type="text"
                            placeholder="Paste URL or upload from PC →"
                            className={getFieldClassName("imageUrl")}
                            style={inputStyle}
                            value={newsData[activeNewsIndex].imageUrl || ""}
                            onChange={(e) => handleUpdateField("imageUrl", e.target.value)}
                          />
                          <button
                            onClick={() => imageFileRef.current?.click()}
                            title="Choose an image from your PC"
                            className="flex items-center gap-1.5 px-3 rounded-xl text-[10px] font-bold shrink-0 transition-all cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
                          >
                            <Upload className="h-3 w-3" />
                            Upload
                          </button>
                        </div>
                      </div>

                      {/* Pan & zoom — adjusts how the image fills its frame */}
                      {newsData[activeNewsIndex].imageUrl && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Move className="h-3 w-3 text-white/40" />
                              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Adjust Image</span>
                            </div>
                            <button
                              onClick={() => {
                                handleUpdateField("imageFocusX", 0.5);
                                handleUpdateField("imageFocusY", 0.5);
                                handleUpdateField("imageZoom", 1);
                              }}
                              className="text-[9.5px] font-bold text-white/35 hover:text-white/70 transition cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                              <span className="flex items-center gap-1"><ZoomIn className="h-2.5 w-2.5" /> Zoom</span>
                              <span>{Math.round((newsData[activeNewsIndex].imageZoom ?? 1) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="2.5"
                              step="0.05"
                              value={newsData[activeNewsIndex].imageZoom ?? 1}
                              onChange={(e) => handleUpdateField("imageZoom", parseFloat(e.target.value))}
                              className="w-full cursor-pointer"
                              style={{ accentColor: "#ffffff" }}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                              <span>Pan Horizontal</span>
                              <span>{Math.round((newsData[activeNewsIndex].imageFocusX ?? 0.5) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.02"
                              value={newsData[activeNewsIndex].imageFocusX ?? 0.5}
                              onChange={(e) => handleUpdateField("imageFocusX", parseFloat(e.target.value))}
                              className="w-full cursor-pointer"
                              style={{ accentColor: "#ffffff" }}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                              <span>Pan Vertical</span>
                              <span>{Math.round((newsData[activeNewsIndex].imageFocusY ?? 0.5) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.02"
                              value={newsData[activeNewsIndex].imageFocusY ?? 0.5}
                              onChange={(e) => handleUpdateField("imageFocusY", parseFloat(e.target.value))}
                              className="w-full cursor-pointer"
                              style={{ accentColor: "#ffffff" }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Source & Date */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Source</label>
                          <input
                            id="input-source"
                            type="text"
                            className={getFieldClassName("source")}
                            style={inputStyle}
                            value={newsData[activeNewsIndex].source || ""}
                            onChange={(e) => handleUpdateField("source", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Date</label>
                          <input
                            id="input-date"
                            type="text"
                            className={getFieldClassName("date")}
                            style={inputStyle}
                            value={newsData[activeNewsIndex].date || ""}
                            onChange={(e) => handleUpdateField("date", e.target.value)}
                          />
                        </div>
                      </div>
                      </div>
                      )}

                      {/* Quick Item List */}
                      <div className="border-t pt-3.5" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-2">
                          News Items in Batch
                        </label>
                        {batchMeta && (
                          <p className="text-[9px] text-emerald-400/50 mb-2 -mt-1">
                            AI-curated from filtered news · {batchMeta.timeRangeLabel}
                            {batchMeta.reportGeneratedAt && ` · report ${new Date(batchMeta.reportGeneratedAt).toLocaleString()}`}
                          </p>
                        )}
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {newsData.map((item, idx) => {
                            const isCurrent = idx === activeNewsIndex;
                            return (
                              <button
                                key={idx}
                                onClick={() => setActiveNewsIndex(idx)}
                                className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-[11px] transition-all border cursor-pointer ${
                                  isCurrent
                                    ? "bg-white/[0.06] border-white/20 text-white font-bold"
                                    : "bg-white/[0.01] border-white/[0.04] text-white/50 hover:bg-white/[0.03] hover:text-white/80"
                                }`}
                              >
                                <span className="truncate flex-1 pr-2">{item.title || `News #${idx + 1}`}</span>
                                <span className="text-[8.5px] uppercase tracking-wider opacity-60 shrink-0">
                                  {item.source || "NEWS"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-white/40 text-xs">
                      No news items found. Paste news JSON in the JSON tab.
                    </div>
                  )}
                </>
              )}

              {(creatorMode === "facts" || creatorMode === "learnings") && (
                <>
                  {newsData.length > 0 && newsData[activeNewsIndex] ? (
                    <div className="space-y-3.5">
                      {creatorMode === "learnings" && newsData[activeNewsIndex].concept && (
                        <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.04] px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-[9.5px] font-bold text-emerald-300/80 uppercase tracking-wider">Concept</span>
                          <span className="text-[11px] font-semibold text-white/85 truncate">{newsData[activeNewsIndex].concept}</span>
                        </div>
                      )}

                      {/* Headline */}
                      <div>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">
                          {creatorMode === "learnings" ? "Slide Heading" : "Headline"}
                        </label>
                        <input
                          id="input-title"
                          type="text"
                          className={getFieldClassName("title")}
                          style={inputStyle}
                          value={newsData[activeNewsIndex].title || ""}
                          onChange={(e) => handleUpdateField("title", e.target.value)}
                        />
                      </div>

                      {/* Body */}
                      <div>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">
                          {creatorMode === "facts" ? "The Fact" : "Body"}
                        </label>
                        <textarea
                          id="input-description"
                          className={getFieldClassName("description")}
                          style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                          value={newsData[activeNewsIndex].description || ""}
                          onChange={(e) => handleUpdateField("description", e.target.value)}
                        />
                      </div>

                      {creatorMode === "facts" && newsData[activeNewsIndex].sourceNote && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                          <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider block mb-0.5">Source Note (internal)</span>
                          <span className="text-[10.5px] text-white/55">{newsData[activeNewsIndex].sourceNote}</span>
                        </div>
                      )}

                      {/* Image generation prompt */}
                      {newsData[activeNewsIndex].imagePrompt && (
                        <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.04] p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-emerald-400/80" />
                              <span className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-wider">
                                Grok Image Prompt
                              </span>
                            </div>
                            <CopyButton text={newsData[activeNewsIndex].imagePrompt!} label="Copy" />
                          </div>
                          <p className="text-[10.5px] text-white/55 leading-relaxed max-h-32 overflow-y-auto select-text whitespace-pre-wrap">
                            {newsData[activeNewsIndex].imagePrompt}
                          </p>
                          <p className="text-[9px] text-white/30 leading-snug">
                            Paste into Grok Imagine → save the image → click the poster&apos;s image area (or Upload) to attach it.
                          </p>
                        </div>
                      )}

                      {/* Image URL + local file upload — also a drag-and-drop zone */}
                      <div
                        className="rounded-xl border border-dashed border-transparent transition-colors p-1 -m-1"
                        onDragOver={(e) => handleImageDragOver(e, colors.accent)}
                        onDragLeave={handleImageDragLeave}
                        onDrop={handleImageDrop}
                      >
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Image (or drag &amp; drop)</label>
                        <div className="flex gap-2">
                          <input
                            id="input-imageUrl"
                            type="text"
                            placeholder="Paste URL or upload from PC →"
                            className={getFieldClassName("imageUrl")}
                            style={inputStyle}
                            value={newsData[activeNewsIndex].imageUrl || ""}
                            onChange={(e) => handleUpdateField("imageUrl", e.target.value)}
                          />
                          <button
                            onClick={() => imageFileRef.current?.click()}
                            title="Choose an image from your PC"
                            className="flex items-center gap-1.5 px-3 rounded-xl text-[10px] font-bold shrink-0 transition-all cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
                          >
                            <Upload className="h-3 w-3" />
                            Upload
                          </button>
                        </div>
                      </div>

                      {/* Pan & zoom — adjusts how the image fills its frame */}
                      {newsData[activeNewsIndex].imageUrl && (
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Move className="h-3 w-3 text-white/40" />
                              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Adjust Image</span>
                            </div>
                            <button
                              onClick={() => {
                                handleUpdateField("imageFocusX", 0.5);
                                handleUpdateField("imageFocusY", 0.5);
                                handleUpdateField("imageZoom", 1);
                              }}
                              className="text-[9.5px] font-bold text-white/35 hover:text-white/70 transition cursor-pointer"
                            >
                              Reset
                            </button>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                              <span className="flex items-center gap-1"><ZoomIn className="h-2.5 w-2.5" /> Zoom</span>
                              <span>{Math.round((newsData[activeNewsIndex].imageZoom ?? 1) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="2.5"
                              step="0.05"
                              value={newsData[activeNewsIndex].imageZoom ?? 1}
                              onChange={(e) => handleUpdateField("imageZoom", parseFloat(e.target.value))}
                              className="w-full cursor-pointer"
                              style={{ accentColor: "#ffffff" }}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                              <span>Pan Horizontal</span>
                              <span>{Math.round((newsData[activeNewsIndex].imageFocusX ?? 0.5) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.02"
                              value={newsData[activeNewsIndex].imageFocusX ?? 0.5}
                              onChange={(e) => handleUpdateField("imageFocusX", parseFloat(e.target.value))}
                              className="w-full cursor-pointer"
                              style={{ accentColor: "#ffffff" }}
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                              <span>Pan Vertical</span>
                              <span>{Math.round((newsData[activeNewsIndex].imageFocusY ?? 0.5) * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.02"
                              value={newsData[activeNewsIndex].imageFocusY ?? 0.5}
                              onChange={(e) => handleUpdateField("imageFocusY", parseFloat(e.target.value))}
                              className="w-full cursor-pointer"
                              style={{ accentColor: "#ffffff" }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Quick Item List */}
                      <div className="border-t pt-3.5" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
                        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-2">
                          {creatorMode === "facts" ? "Facts In Batch" : "Slides In Batch"}
                        </label>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {newsData.map((item, idx) => {
                            const isCurrent = idx === activeNewsIndex;
                            return (
                              <button
                                key={idx}
                                onClick={() => setActiveNewsIndex(idx)}
                                className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-[11px] transition-all border cursor-pointer ${
                                  isCurrent
                                    ? "bg-white/[0.06] border-white/20 text-white font-bold"
                                    : "bg-white/[0.01] border-white/[0.04] text-white/50 hover:bg-white/[0.03] hover:text-white/80"
                                }`}
                              >
                                <span className="truncate flex-1 pr-2">{item.title || `#${idx + 1}`}</span>
                                {item.stepLabel && (
                                  <span className="text-[8.5px] uppercase tracking-wider opacity-60 shrink-0">{item.stepLabel}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-white/40 text-xs">
                      No {creatorMode} items yet. Click Generate to create a batch.
                    </div>
                  )}
                </>
              )}

              {creatorMode === "indicator" && (
                <>
                  {/* Category & Index */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Category</label>
                      <input
                        id="input-category"
                        type="text"
                        className={getFieldClassName("category")}
                        style={inputStyle}
                        value={parsedData.category || ""}
                        onChange={(e) => handleUpdateField("category", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Index</label>
                      <input
                        id="input-index"
                        type="text"
                        className={getFieldClassName("index")}
                        style={inputStyle}
                        value={parsedData.index || ""}
                        onChange={(e) => handleUpdateField("index", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Title</label>
                    <input
                      id="input-title"
                      type="text"
                      className={getFieldClassName("title")}
                      style={inputStyle}
                      value={parsedData.title || ""}
                      onChange={(e) => handleUpdateField("title", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Subtitle</label>
                    <input
                      id="input-subtitle"
                      type="text"
                      className={getFieldClassName("subtitle")}
                      style={inputStyle}
                      value={parsedData.subtitle || ""}
                      onChange={(e) => handleUpdateField("subtitle", e.target.value)}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Description</label>
                    <textarea
                      id="input-description"
                      className={getFieldClassName("description")}
                      style={{ ...inputStyle, minHeight: "58px", resize: "vertical" }}
                      value={parsedData.description || ""}
                      onChange={(e) => handleUpdateField("description", e.target.value)}
                    />
                  </div>

                  {/* Tags */}
                  <div id="input-tags">
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Tags</label>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {(parsedData.tags || []).map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-semibold uppercase tracking-wider border border-white/[0.08] bg-white/[0.04] text-white/70"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleDeleteTag(i)}
                            className="hover:text-red-400 font-normal ml-0.5 cursor-pointer text-[10px]"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Press enter to add tag..."
                        className="flex-1 rounded-xl px-3 py-1.5 text-[12px] outline-none"
                        style={inputStyle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag(e.currentTarget.value);
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          const inp = e.currentTarget.previousSibling as HTMLInputElement;
                          handleAddTag(inp.value);
                          inp.value = "";
                        }}
                        className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border border-white/10 hover:bg-white/5 cursor-pointer text-white/60 hover:text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Formula */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Formula</label>
                    <input
                      id="input-formula"
                      type="text"
                      className={getFieldClassName("formula")}
                      style={inputStyle}
                      value={parsedData.formula || ""}
                      onChange={(e) => handleUpdateField("formula", e.target.value)}
                    />
                  </div>

                  {/* Image URL — also a drag-and-drop zone */}
                  <div
                    className="rounded-xl border border-dashed border-transparent transition-colors p-1 -m-1"
                    onDragOver={(e) => handleImageDragOver(e, colors.accent)}
                    onDragLeave={handleImageDragLeave}
                    onDrop={handleImageDrop}
                  >
                    <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Image URL (or drag &amp; drop)</label>
                    <div className="flex gap-2">
                      <input
                        id="input-imageUrl"
                        type="text"
                        placeholder="https://example.com/image.jpg"
                        className={getFieldClassName("imageUrl")}
                        style={inputStyle}
                        value={parsedData.imageUrl || ""}
                        onChange={(e) => handleUpdateField("imageUrl", e.target.value)}
                      />
                      <button
                        onClick={() => imageFileRef.current?.click()}
                        title="Choose an image from your PC"
                        className="flex items-center gap-1.5 px-3 rounded-xl text-[10px] font-bold shrink-0 transition-all cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
                      >
                        <Upload className="h-3 w-3" />
                        Upload
                      </button>
                    </div>
                  </div>

                  {/* Footer & Date */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Footer</label>
                      <input
                        id="input-footer"
                        type="text"
                        className={getFieldClassName("footer")}
                        style={inputStyle}
                        value={parsedData.footer || ""}
                        onChange={(e) => handleUpdateField("footer", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Date</label>
                      <input
                        id="input-date"
                        type="text"
                        className={getFieldClassName("date")}
                        style={inputStyle}
                        value={parsedData.date || ""}
                        onChange={(e) => handleUpdateField("date", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }} id="input-metrics">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider">Metrics (Max 4)</label>
                      {(parsedData.metrics || []).length < 4 && (
                        <button
                          type="button"
                          onClick={handleAddMetric}
                          className="text-[10px] font-bold flex items-center gap-1 text-white/50 hover:text-white cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Metric
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(parsedData.metrics || []).map((met, i) => (
                        <div key={i} className="flex gap-2 items-center bg-[#161716]/40 p-2.5 rounded-xl border border-white/5">
                          <div className="flex-1 space-y-1.5">
                            <input
                              type="text"
                              placeholder="Label"
                              className="w-full bg-transparent text-[10px] border-b border-white/10 pb-0.5 text-white/80 outline-none uppercase font-semibold"
                              value={met.label || ""}
                              onChange={(e) => handleUpdateMetric(i, "label", e.target.value)}
                            />
                            <input
                              type="text"
                              placeholder="Value"
                              className="w-full bg-transparent text-[12px] py-0.5 text-white outline-none"
                              value={met.value || ""}
                              onChange={(e) => handleUpdateMetric(i, "value", e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMetric(i)}
                            className="text-red-400 hover:text-red-300 opacity-60 hover:opacity-100 transition-all p-1 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sections */}
                  <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }} id="input-sections">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider">Sections</label>
                      <button
                        type="button"
                        onClick={handleAddSection}
                        className="text-[10px] font-bold flex items-center gap-1 text-white/50 hover:text-white cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Section
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {(parsedData.sections || []).map((sec, i) => (
                        <div key={i} className="bg-[#161716]/40 p-3 rounded-xl border border-white/5 relative group">
                          <button
                            type="button"
                            onClick={() => handleDeleteSection(i)}
                            className="absolute top-2 right-2 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="Section Label"
                              className="w-full bg-transparent text-[10px] border-b border-white/10 pb-0.5 text-white/80 outline-none uppercase font-semibold pr-6"
                              value={sec.label || ""}
                              onChange={(e) => handleUpdateSection(i, "label", e.target.value)}
                            />
                            <textarea
                              placeholder="Content"
                              rows={2}
                              className="w-full bg-transparent text-[11px] text-white/70 outline-none resize-y leading-relaxed"
                              value={sec.content || ""}
                              onChange={(e) => handleUpdateSection(i, "content", e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* COLORS & THEMES TAB */}
          {activeTab === "colors" && (
            <div className="space-y-4">
            {isBatchMode ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                    Poster Style
                  </p>
                  <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg">
                    {(["editorial", "bold"] as const).map((s) => {
                      const active = posterStyle === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setPosterStyle(s)}
                          className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-[10px] font-bold uppercase tracking-wider text-center ${
                            active
                              ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                              : "text-[#787870] hover:text-white/60"
                          }`}
                        >
                          {s === "editorial" ? "Editorial" : "Bold & Trending"}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-[#787870] mt-1.5 leading-relaxed">
                    {posterStyle === "editorial"
                      ? "The classic paper-band + photo layout — pick a theme below."
                      : "Full-bleed gradient, huge headline, swipe-to-read — pick a gradient below."}
                  </p>
                </div>

                {creatorMode === "news" && (
                  <div>
                    <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                      Highlight Colors
                    </p>
                    <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg">
                      {(["emerald", "skyblue"] as const).map((s) => {
                        const active = sentimentScheme === s;
                        return (
                          <button
                            key={s}
                            onClick={() => setSentimentScheme(s)}
                            className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-[10px] font-bold uppercase tracking-wider text-center ${
                              active
                                ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                                : "text-[#787870] hover:text-white/60"
                            }`}
                          >
                            {s === "emerald" ? "Emerald / Red" : "Sky Blue / Red"}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[9px] text-[#787870] mt-1.5 leading-relaxed">
                      Bullish highlights render in {sentimentScheme === "emerald" ? "emerald green" : "sky blue"} — bearish stays red and base text stays white either way.
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider">
                      Color Fade Intensity
                    </p>
                    <span className="text-[10px] font-mono text-white/50">{gradientFade}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="1"
                    value={gradientFade}
                    onChange={(e) => setGradientFade(parseInt(e.target.value, 10))}
                    className="w-full cursor-pointer"
                    style={{ accentColor: "#10b981" }}
                  />
                  <p className="text-[9px] text-[#787870] mt-1 leading-relaxed">
                    How much the {posterStyle === "editorial" ? "paper-band color bleeds into" : "gradient washes over"} the photo — lower shows more of the image, 100% matches the tuned default, higher pushes past it for a heavier wash.
                  </p>
                </div>

                {posterStyle === "editorial" && (
                  <div>
                    <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                      Theme
                    </p>
                    <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg">
                      {(["light", "dark"] as const).map((t) => {
                        const active = editorialTheme === t;
                        return (
                          <button
                            key={t}
                            onClick={() => setEditorialTheme(t)}
                            className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-[10px] font-bold uppercase tracking-wider text-center ${
                              active
                                ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                                : "text-[#787870] hover:text-white/60"
                            }`}
                          >
                            {t === "light" ? "Light Paper" : "Dark"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {posterStyle === "bold" && (
                  <div>
                    <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                      Gradient Color
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {GRADIENT_PRESETS.map((g) => {
                        const isActive = gradientPresetId === g.id;
                        return (
                          <button
                            key={g.id}
                            onClick={() => setGradientPresetId(g.id)}
                            className="flex flex-col items-start p-2 rounded-xl transition-all border text-left cursor-pointer"
                            style={{
                              background: isActive ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                              borderColor: isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.06)",
                            }}
                          >
                            <span className="text-[10px] font-bold text-white mb-1.5">
                              {g.name}
                            </span>
                            <div
                              className="h-7 w-full rounded-md border border-white/10"
                              style={{ background: `linear-gradient(135deg, ${g.stops[0]}, ${g.stops[1]})` }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                  Color Presets
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_PRESETS.map((preset) => {
                    const isActive = colors.bg === preset.bg && colors.accent === preset.accent;
                    return (
                      <button
                        key={preset.name}
                        onClick={() => setColors(preset)}
                        className="flex flex-col items-start p-2 rounded-xl transition-all border text-left cursor-pointer"
                        style={{
                          background: isActive ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                          borderColor: isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.06)",
                        }}
                      >
                        <span className="text-[10px] font-bold text-white mb-1.5">
                          {preset.name}
                        </span>
                        <div className="flex gap-1">
                          <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.bg }} title="Background" />
                          <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.accent }} title="Accent" />
                          <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.text }} title="Text" />
                          <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.card }} title="Card BG" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
                <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2.5">
                  Custom Theme Colors
                </p>
                
                <div className="space-y-2">
                  {[
                    { key: "bg", label: "Background", desc: "Main poster backdrop" },
                    { key: "accent", label: "Accent Color", desc: "Borders, badges, decorations" },
                    { key: "text", label: "Primary Text", desc: "Title & main content elements" },
                    { key: "muted", label: "Muted Text", desc: "Subtitles, footnotes, labels" },
                    { key: "card", label: "Card Color", desc: "Description card background" },
                    { key: "subtle", label: "Subtle Color", desc: "Formula panel background" },
                  ].map((colorItem) => (
                    <div key={colorItem.key} className="flex items-center justify-between bg-[#161716]/40 p-2.5 rounded-xl border border-white/5">
                      <div>
                        <span className="text-[11px] font-semibold text-white block">
                          {colorItem.label}
                        </span>
                        <span className="text-[8.5px] text-[#787870] block">
                          {colorItem.desc}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={colors[colorItem.key as keyof PosterColors]}
                          onChange={(e) => setColors(prev => ({ ...prev, [colorItem.key]: e.target.value }))}
                          className="w-16 bg-transparent border-b border-[#2A2B2A] text-[10px] text-right font-mono outline-none text-white"
                        />
                        <div className="relative h-6 w-6 rounded border border-white/10 overflow-hidden cursor-pointer">
                          <input
                            type="color"
                            value={colors[colorItem.key as keyof PosterColors]}
                            onChange={(e) => setColors(prev => ({ ...prev, [colorItem.key]: e.target.value }))}
                            className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                          />
                          <div className="absolute inset-0" style={{ background: colors[colorItem.key as keyof PosterColors] }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            )}
          </div>
          )}

          {/* LAYOUT TAB */}
          {activeTab === "layout" && (
            <div className="space-y-4">
              {/* Aspect ratio selector */}
              <div>
                <p
                  className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2"
                >
                  Aspect Ratio
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {RATIOS.map((ratio) => {
                    const active = ratio.id === ratioId;
                    return (
                      <button
                        key={ratio.id}
                        onClick={() => setRatioId(ratio.id)}
                        className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all cursor-pointer border ${
                          active
                            ? "bg-white/[0.08] text-white border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                            : "bg-white/[0.02] border-white/[0.05] text-[#787870] hover:border-white/[0.12] hover:text-white"
                        }`}
                      >
                        <span className="text-[10px] font-bold">{ratio.label}</span>
                        <span className="text-[7.5px] opacity-60 mt-0.5">{ratio.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <p
                  className="text-[9px] mt-1.5 text-[#787870]"
                >
                  Canvas size: {ar.w} × {ar.h}px
                </p>
              </div>

              {/* Grid Options */}
              <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
                <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                  Grid Options
                </p>
                <div className="bg-[#161716]/40 p-3 rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">Show Grid</span>
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                      className="w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer"
                      style={{ background: config.showGrid ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)" }}
                    >
                      <div
                        className="w-3 h-3 bg-white rounded-full transition-transform duration-200"
                        style={{ transform: config.showGrid ? "translateX(16px)" : "translateX(0px)" }}
                      />
                    </button>
                  </div>

                  {config.showGrid && (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                          <span>Grid Spacing</span>
                          <span>{config.gridSize}px</span>
                        </div>
                        <input
                          type="range"
                          min="14"
                          max="60"
                          step="2"
                          value={config.gridSize}
                          onChange={(e) => setConfig(prev => ({ ...prev, gridSize: parseInt(e.target.value) }))}
                          className="w-full cursor-pointer"
                          style={{ accentColor: "#ffffff" }}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                          <span>Grid Opacity</span>
                          <span>{Math.round(config.gridOpacity * 1000) / 10}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.005"
                          max="0.08"
                          step="0.005"
                          value={config.gridOpacity}
                          onChange={(e) => setConfig(prev => ({ ...prev, gridOpacity: parseFloat(e.target.value) }))}
                          className="w-full cursor-pointer"
                          style={{ accentColor: "#ffffff" }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Borders & Corners */}
              <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
                <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                  Borders & Corner Crosses
                </p>
                <div className="bg-[#161716]/40 p-3 rounded-xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">Outer Border</span>
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, showBorder: !prev.showBorder }))}
                      className="w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer"
                      style={{ background: config.showBorder ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)" }}
                    >
                      <div
                        className="w-3 h-3 bg-white rounded-full transition-transform duration-200"
                        style={{ transform: config.showBorder ? "translateX(16px)" : "translateX(0px)" }}
                      />
                    </button>
                  </div>

                  {config.showBorder && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                        <span>Border Width</span>
                        <span>{config.borderWidth.toFixed(1)}px</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="4.0"
                        step="0.5"
                        value={config.borderWidth}
                        onChange={(e) => setConfig(prev => ({ ...prev, borderWidth: parseFloat(e.target.value) }))}
                        className="w-full cursor-pointer"
                        style={{ accentColor: "#ffffff" }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-[#2A2B2A] pt-2">
                    <span className="text-[11px] font-bold text-white">Corner Crosshairs</span>
                    <button
                      onClick={() => setConfig(prev => ({ ...prev, showCrosses: !prev.showCrosses }))}
                      className="w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer"
                      style={{ background: config.showCrosses ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)" }}
                    >
                      <div
                        className="w-3 h-3 bg-white rounded-full transition-transform duration-200"
                        style={{ transform: config.showCrosses ? "translateX(16px)" : "translateX(0px)" }}
                      />
                    </button>
                  </div>

                  {config.showCrosses && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                        <span>Crosshair Size</span>
                        <span>{config.crossSize}px</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="25"
                        step="1"
                        value={config.crossSize}
                        onChange={(e) => setConfig(prev => ({ ...prev, crossSize: parseInt(e.target.value) }))}
                        className="w-full cursor-pointer"
                        style={{ accentColor: "#ffffff" }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Typography Scale */}
              <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
                <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
                  Typography Options
                </p>
                <div className="bg-[#161716]/40 p-3 rounded-xl border border-white/5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                      <span>Font Scaling</span>
                      <span>{Math.round(config.fontScale * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.75"
                      max="1.3"
                      step="0.05"
                      value={config.fontScale}
                      onChange={(e) => setConfig(prev => ({ ...prev, fontScale: parseFloat(e.target.value) }))}
                      className="w-full cursor-pointer"
                      style={{ accentColor: "#ffffff" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RAW JSON TAB */}
          {activeTab === "json" && (
            <div className="flex flex-col h-full min-h-0 space-y-3.5">
              <div className="flex items-center justify-between shrink-0">
                <p
                  className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider"
                >
                  Raw JSON Data
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSample(true)}
                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase text-white/60 hover:text-white transition border border-white/5 cursor-pointer"
                  >
                    Load Sample
                  </button>
                  {jsonError && (
                    <div className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="h-3 w-3" />
                      <span className="text-[9px]">
                        Invalid JSON
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
                className="w-full min-h-[350px] flex-1 resize-none rounded-xl p-3 text-[11px] leading-relaxed outline-none transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${jsonError ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                  color: "#ffffff",
                  fontFamily: "var(--font-mono), monospace",
                  caretColor: "#ffffff",
                }}
              />
            </div>
          )}

          {/* AI PROMPT TAB */}
          {activeTab === "ai-prompt" && (
            <div className="flex flex-col gap-4">
              {/* Banner info */}
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-white/50" />
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">CHoCH QLM Hinglish News Prompt</span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Opens the full three-section AI prompt generator — System Prompt, User Message with live H1+H4 candle data, and Reference JSON schema. Select session, date, currency pairs and copy each block individually or all at once.
                </p>
                <div className="flex flex-wrap gap-2 text-[10px] text-white/30">
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">📊 Live H1+H4 OHLCV data</span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">🌐 V1 — Full Internet</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/[0.08] border border-emerald-500/[0.15] text-emerald-400/60">𝕏 V5 — Twitter Feeds</span>
                </div>
              </div>

              {/* Open modal button */}
              <button
                onClick={() => setShowPromptModal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.12)] border border-transparent"
              >
                <Bot className="h-4 w-4" />
                Open Prompt Generator
              </button>

              {/* Tip */}
              <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.12] px-4 py-3">
                <p className="text-[10px] font-semibold text-emerald-400/60 uppercase tracking-widest mb-1">How to use</p>
                <ol className="text-[11px] text-white/35 leading-relaxed space-y-1">
                  <li>1. Open prompt generator and select session, date &amp; symbols</li>
                  <li>2. Copy all 3 blocks into your AI (ChatGPT / Gemini)</li>
                  <li>3. Paste the generated JSON into the <span className="text-white/55 font-medium">JSON Tab</span></li>
                  <li>4. Hit Force Re-render — posters appear instantly</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Generate + Re-render (Left panel footer) */}
        <div className="px-4 pb-4 pt-2 border-t shrink-0 space-y-2" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          {generateError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/[0.08] border border-red-500/[0.2]">
              <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-300/90 leading-relaxed flex-1">{generateError}</p>
              <button onClick={() => setGenerateError(null)} className="text-red-400/60 hover:text-red-300 shrink-0">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex gap-2 relative">
            {/* Generate — niche dropdown (opens upward) */}
            <div className="relative flex-1">
              {showGenerateMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowGenerateMenu(false)} />
                  <div className="absolute bottom-full mb-2 left-0 w-[318px] z-50 rounded-xl border border-white/[0.08] bg-[#121210] shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-xl overflow-hidden p-1 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="w-full flex items-start gap-1 rounded-lg hover:bg-white/[0.05] transition">
                      <button
                        onClick={generateNewsBatch}
                        className="flex-1 min-w-0 flex items-start gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition cursor-pointer"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                          <Sparkles className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11.5px] font-bold text-white tracking-wide">AI News Batch</span>
                          <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                            Curate 8-12 distinct high-impact stories, deduped, with cover + outro. Select which slides to include.
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowGenerateMenu(false); setShowPromptForCategory("news"); }}
                        title="Show the full generation prompt"
                        className="shrink-0 mt-2 mr-1.5 p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="w-full flex items-start gap-1 rounded-lg hover:bg-white/[0.05] transition border-t border-white/[0.03]">
                      <button
                        onClick={() => generateFactsBatch()}
                        className="flex-1 min-w-0 flex items-start gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition cursor-pointer"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                          <Lightbulb className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11.5px] font-bold text-white tracking-wide">AI Facts Batch</span>
                          <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                            Auto-generate 5-8 verified, punchy trading/market facts with cover + outro.
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowGenerateMenu(false); setShowPromptForCategory("facts"); }}
                        title="Show the full generation prompt"
                        className="shrink-0 mt-2 mr-1.5 p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="w-full flex items-start gap-1 rounded-lg hover:bg-white/[0.05] transition border-t border-white/[0.03]">
                      <button
                        onClick={() => generateLearningsBatch()}
                        className="flex-1 min-w-0 flex items-start gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition cursor-pointer"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                          <BookOpen className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11.5px] font-bold text-white tracking-wide">AI Learnings Batch</span>
                          <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                            Auto-picks one concept and teaches it step by step, with cover + recap + outro.
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowGenerateMenu(false); setShowPromptForCategory("learnings"); }}
                        title="Show the full generation prompt"
                        className="shrink-0 mt-2 mr-1.5 p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setShowGenerateMenu(false);
                        setCreatorMode("analysis");
                        setShowPromptModal(true);
                      }}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/[0.05] active:scale-[0.99] transition cursor-pointer border-t border-white/[0.03]"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-white/70" />
                      </div>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11.5px] font-bold text-white tracking-wide">Daily Analysis Prompt</span>
                        <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                          Compile session candles and structures into prompts for external AI.
                        </span>
                      </span>
                    </button>

                    <button
                      disabled
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left opacity-35 cursor-not-allowed border-t border-white/[0.03]"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.02] border border-white/[0.04] shrink-0 mt-0.5">
                        <Layers2 className="h-4 w-4 text-white/30" />
                      </div>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11.5px] font-bold text-white/50 tracking-wide">Indicator / Classic</span>
                        <span className="block text-[9.5px] text-white/25 leading-snug mt-0.5 font-normal">Coming soon</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
              <button
                onClick={() => setShowGenerateMenu((v) => !v)}
                disabled={generatingBatch}
                title="Generate"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer bg-emerald-500/[0.15] text-emerald-300 hover:bg-emerald-500/[0.22] border border-emerald-500/[0.25] disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
              >
                {generatingBatch ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span className="hidden xs:inline">GENERATING…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xs:inline">GENERATE</span>
                    <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showGenerateMenu ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>
            </div>

            <button
              onClick={render}
              title="Re-render"
              className="flex items-center justify-center gap-1.5 flex-grow py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.1)] border border-transparent whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline">RE-RENDER</span>
            </button>

            <button
              onClick={handleSaveCurrentToHistory}
              disabled={saveStatus === "saving"}
              title="Save current poster(s) to History"
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border ${
                saveStatus === "success"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                  : saveStatus === "error"
                  ? "border-red-500 bg-red-500/10 text-red-400"
                  : "border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
              }`}
            >
              {saveStatus === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saveStatus === "success" ? (
                <Check className="h-3.5 w-3.5" />
              ) : saveStatus === "error" ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              onClick={openHistory}
              title="View History list"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
            >
              <History className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setShowCalendarModal(true)}
              title="Content Calendar — 30-day plan"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* ── Right Panel: Preview ──────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col overflow-hidden bg-background relative"
      >
        {panelCollapsed && (
          <button
            onClick={() => setPanelCollapsed(false)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-8 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-r-xl transition-all duration-200 text-white/60 hover:text-white cursor-pointer group shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md"
            title="Expand Panel"
          >
            <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
        {/* Apple liquid glass backdrop glow circles */}
        <div 
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[128px] pointer-events-none" 
          style={{ backgroundColor: colors.accent, opacity: 0.035 }}
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-[128px] pointer-events-none" 
          style={{ backgroundColor: colors.accent, opacity: 0.035 }}
        />

        {/* Preview toolbar */}
        <div
          className="flex items-center justify-between px-4 py-1.5 border-b shrink-0 z-10"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2 min-w-0 shrink">
            <ImagePlus className="h-4 w-4 shrink-0 text-white/50" />
            {/* Redundant next to the icon once space is tight — icon alone
                reads fine at a glance, full label comes back at sm+. */}
            <span
              className="hidden sm:inline text-[12px] font-bold uppercase tracking-wider text-white whitespace-nowrap"
            >
              Interactive Preview
            </span>
            <span
              className="text-[9px] px-2 py-0.5 rounded-md border font-semibold uppercase tracking-wider shrink-0"
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "#d1d5db",
              }}
            >
              {Math.round(scale * 100)}%
            </span>
          </div>
          {isBatchMode ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={download}
                disabled={!rendered || newsData.length === 0}
                title="Download current poster"
                className="flex items-center gap-1.5 px-2.5 xs:px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 text-white whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xs:inline">Download Current</span>
              </button>
              <button
                onClick={downloadAll}
                disabled={!rendered || newsData.length === 0 || downloadingZip}
                title="Download all posters in this batch"
                className="flex items-center gap-1.5 px-3 xs:px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 border border-transparent shadow-[0_2px_8px_rgba(255,255,255,0.1)] whitespace-nowrap"
              >
                {downloadingZip ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span className="hidden xs:inline">Packaging ZIP...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xs:inline">Download All Batch</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={download}
              disabled={!rendered}
              title="Download PNG"
              className="flex items-center gap-1.5 px-3 xs:px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 border border-transparent shadow-[0_2px_8px_rgba(255,255,255,0.1)] shrink-0 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline">Download PNG</span>
            </button>
          )}
        </div>

        {/* Batch pagination header (News/Facts/Learnings only) */}
        {isBatchMode && newsData.length > 0 && (
          <div
            className="flex items-center justify-between gap-2 px-5 py-2.5 border-b shrink-0 bg-white/[0.01] z-10"
            style={{ borderColor: "rgba(255, 255, 255, 0.04)" }}
          >
            <div className="text-[11px] text-[#787870] font-bold uppercase tracking-wider whitespace-nowrap truncate min-w-0">
              POSTER <span className="text-white font-bold">{activeNewsIndex + 1}</span> OF <span className="text-white font-bold">{newsData.length}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled={activeNewsIndex === 0}
                onClick={() => setActiveNewsIndex(prev => Math.max(0, prev - 1))}
                title="Previous poster"
                className="flex items-center gap-1 px-2 xs:px-2.5 py-1 rounded-lg border border-white/[0.08] hover:bg-white/5 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer text-white whitespace-nowrap"
              >
                <ChevronLeft className="h-3 w-3 shrink-0 xs:hidden" />
                <span className="hidden xs:inline">Previous</span>
              </button>
              <button
                disabled={activeNewsIndex === newsData.length - 1}
                onClick={() => setActiveNewsIndex(prev => Math.min(newsData.length - 1, prev + 1))}
                title="Next poster"
                className="flex items-center gap-1 px-2 xs:px-2.5 py-1 rounded-lg border border-white/[0.08] hover:bg-white/5 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer text-white whitespace-nowrap"
              >
                <ChevronRight className="h-3 w-3 shrink-0 xs:hidden" />
                <span className="hidden xs:inline">Next</span>
              </button>
            </div>
          </div>
        )}

        {/* Canvas preview area with clickable element overlay */}
        <div
          ref={previewRef}
          className="relative flex-1 flex items-center justify-center overflow-hidden p-6 select-none z-10"
        >
          {/* Carousel nav — real app buttons, not baked into the poster image.
              Changes which poster is being previewed/edited/exported. */}
          {isBatchMode && newsData.length > 1 && (
            <>
              <button
                onClick={() => setActiveNewsIndex((i) => Math.max(0, i - 1))}
                disabled={activeNewsIndex === 0}
                aria-label="Previous poster"
                title="Previous poster"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer border border-white/[0.1] bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setActiveNewsIndex((i) => Math.min(newsData.length - 1, i + 1))}
                disabled={activeNewsIndex === newsData.length - 1}
                aria-label="Next poster"
                title="Next poster"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer border border-white/[0.1] bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div
            style={{
              width: ar.w * scale,
              height: ar.h * scale,
              flexShrink: 0,
              position: "relative",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: ar.w,
                height: ar.h,
                transformOrigin: "top left",
                transform: `scale(${scale})`,
                display: "block",
                borderRadius: 2,
                boxShadow: `0 0 0 1px ${colors.accent}40, 0 24px 64px rgba(0,0,0,0.6)`,
              }}
            />
            {/* Interactive Element Boundaries Overlay */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: ar.w * scale,
                height: ar.h * scale,
                pointerEvents: "none",
              }}
            >
              {elementBounds.map((box, i) => {
                const isNewsImage = box.id === "imageUrl" && isBatchMode;
                const hasImage = isNewsImage && !!newsData[activeNewsIndex]?.imageUrl;

                return (
                  <div
                    key={`${box.id}-${i}-${box.x}-${box.y}`}
                    ref={hasImage ? setImageWheelRef : undefined}
                    onClick={() => handleElementClick(box.id)}
                    onMouseDown={hasImage ? (e) => handleImageMouseDown(e, box) : undefined}
                    className="absolute pointer-events-auto border border-transparent border-dashed group transition-all duration-200 rounded"
                    style={{
                      left: box.x * scale,
                      top: box.y * scale,
                      width: box.w * scale,
                      height: box.h * scale,
                      cursor: hasImage ? (isDraggingImage ? "grabbing" : "grab") : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = colors.accent;
                      e.currentTarget.style.backgroundColor = `${colors.accent}15`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    onDragOver={box.id === "imageUrl" ? (e) => handleImageDragOver(e, colors.accent) : undefined}
                    onDragLeave={box.id === "imageUrl" ? handleImageDragLeave : undefined}
                    onDrop={box.id === "imageUrl" ? handleImageDrop : undefined}
                  >
                    {/* Floating badge tooltip on hover */}
                    <div
                      className="absolute opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none px-2 py-0.5 rounded text-[8.5px] font-bold tracking-wider uppercase z-20 whitespace-nowrap"
                      style={{
                        top: "-20px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(255, 255, 255, 0.9)",
                        color: "#000000",
                        fontFamily: "var(--font-sans), sans-serif",
                        boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                      }}
                    >
                      {hasImage ? "Drag to Pan · Scroll to Zoom" : `Edit ${box.label}`}
                    </div>

                    {/* Dedicated replace-image button — only once an image exists;
                        clicking the box itself now pans, so replacement needs its
                        own affordance, always visible in the corner. */}
                    {hasImage && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          imageFileRef.current?.click();
                        }}
                        title="Change image"
                        className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-all opacity-0 group-hover:opacity-100"
                        style={{
                          background: "rgba(10,10,10,0.65)",
                          color: "rgba(255,255,255,0.9)",
                          backdropFilter: "blur(4px)",
                        }}
                      >
                        <Upload className="h-2.5 w-2.5" />
                        Change Image
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom hint */}
        <div
          className="hidden sm:flex items-center justify-center gap-1.5 px-3 py-2.5 border-t shrink-0 z-10"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <span
            className="text-[9px] uppercase tracking-[0.15em] text-[#787870] text-center truncate"
          >
            {isBatchMode
              ? "Click Next/Previous or select items in the sidebar to cycle through the batch"
              : "Click any element on the poster to customize it in the sidebar"
            }
          </span>
        </div>
      </div>

      {/* Hidden file picker — clicking a news poster's image frame (or the
          Upload button) routes here; the chosen file becomes the poster image */}
      <input
        ref={imageFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
      />

      {/* Sample JSON modal */}
      {showSample && (
        <SampleJsonModal
          mode={creatorMode}
          onClose={() => setShowSample(false)}
          onApply={(json) => { setJsonText(json); setJsonError(null); }}
        />
      )}

      {/* AI News Prompt modal */}
      {showPromptModal && (
        <PromptModal
          defaultDate={promptDate}
          defaultSession={promptSession}
          onClose={() => setShowPromptModal(false)}
        />
      )}

      {/* History modal */}
      {showHistory && (
        <HistoryModal
          items={historyItems}
          loading={historyLoading}
          error={historyError}
          busyId={historyBusyId}
          onClose={() => setShowHistory(false)}
          onLoad={loadHistoryEntry}
          onDelete={deleteHistoryEntry}
        />
      )}

      {/* Content Calendar modal — 30-day News/Learnings/Facts plan */}
      {showCalendarModal && (
        <ContentCalendarModal
          onClose={() => setShowCalendarModal(false)}
          onGenerateNews={() => { setShowCalendarModal(false); generateNewsBatch(); }}
          onGenerateFacts={(topicHint) => { setShowCalendarModal(false); generateFactsBatch(topicHint); }}
          onGenerateLearnings={(topicHint) => { setShowCalendarModal(false); generateLearningsBatch(topicHint); }}
        />
      )}

      {/* Full generation prompt viewer — the exact system prompt, user message, and required output JSON shape for a batch category */}
      {showPromptForCategory && (
        <ShowPromptModal
          category={showPromptForCategory}
          onClose={() => setShowPromptForCategory(null)}
          onImport={importAiBatch}
        />
      )}

      {/* Poster selection modal — narrows the 20-30 AI candidates down to the final batch */}
      {showSelectionModal && (
        <PosterSelectionModal
          candidates={rawBatchCandidates}
          selected={selectedPosterIndices}
          onToggle={togglePosterSelection}
          onSelectAll={selectAllPosters}
          onClear={clearPosterSelection}
          onClose={() => setShowSelectionModal(false)}
          onApply={applyPosterSelection}
        />
      )}
    </div>
  );
}
