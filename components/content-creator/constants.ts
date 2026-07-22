import type { AspectRatio, PosterColors, AnalysisData, PosterData, NewsItem } from "./types";


export const RATIOS: AspectRatio[] = [
  { id: "square",    label: "1:1",  w: 800,  h: 800,  desc: "Post"     },
  { id: "portrait",  label: "4:5",  w: 800,  h: 1000, desc: "Portrait" },
  { id: "story",     label: "9:16", w: 800,  h: 1422, desc: "Story"    },
  { id: "landscape", label: "16:9", w: 1600, h: 900,  desc: "Banner"   },
  { id: "a4",        label: "A4",   w: 794,  h: 1123, desc: "Print"    },
];

export const COLOR_PRESETS: (PosterColors & { name: string })[] = [
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
export interface GradientPreset { id: string; name: string; stops: [string, string]; accent: string; isLight?: boolean; pillAccent?: string; monochrome?: boolean; }

export const GRADIENT_PRESETS: GradientPreset[] = [
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

export const EMPTY_ANALYSIS: AnalysisData = {
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

export const EMPTY_INDICATOR: PosterData = {
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

export const SAMPLE: PosterData = {
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

export const SAMPLE_ANALYSIS: AnalysisData = {
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

export const SAMPLE_NEWS: NewsItem[] = [
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

export const SAMPLE_FACTS: NewsItem[] = [
  {
    title: "Why Gold Is Measured In Troy Ounces, Not Regular Ounces",
    highlightPhrase: "Troy Ounces",
    description: "A troy ounce (**31.1035g**) is about **10% heavier** than a standard avoirdupois ounce (28.35g) — a unit inherited from medieval European bullion trading that stuck for precious metals worldwide.",
    sourceNote: "Verified against LBMA/COMEX contract specifications.",
    imageUrl: "https://images.unsplash.com/photo-1610375461369-d613b564f4c4?w=800",
  },
];

export const SAMPLE_LEARNINGS: NewsItem[] = [
  {
    title: "Understanding Fair Value Gaps (FVG)",
    concept: "Fair Value Gap (FVG)",
    stepLabel: "Step 1 of 4",
    description: "A Fair Value Gap is a three-candle imbalance where price moves so fast it leaves a gap between the first candle's wick and the third candle's wick — a zone the market often returns to fill.",
    imageUrl: "https://images.unsplash.com/photo-1642790551116-18e150f248e5?w=800",
  },
];
