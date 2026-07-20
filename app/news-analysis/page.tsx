"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// ─── Candle data types (shared with candle-summary API) ──────────────────────
interface HCandle { t: number; o: number; h: number; l: number; c: number }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }
import { cn } from "@/lib/utils";
import { validateReportSchema } from "@/lib/newsValidation";
import { MarketNews, type MarketNewsHandle, FILTER_HOUR_OPTIONS, filterHourLabel } from "@/components/chart/MarketNews";
import { AnalyseNewsModal } from "@/components/chart/news-sentiment/analyse-news-modal";
import { SentimentReportDashboard, type SentimentReport } from "@/components/chart/news-sentiment/sentiment-report-dashboard";
import { FilteredReportView } from "@/components/chart/news-sentiment/filtered-report-view";
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
  Pencil,
  Bot,
  Copy,
  Check,
  X,
  AlertCircle,
  Loader2,
  Database,
  Target,
  History,
  User,
  Eye,
  Trash2,
  Rss,
  Microscope,
  ArrowUpRight,
  Sparkles,
  Send,
  MessageSquare,
  Filter,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarketImpactTag {
  symbol: string;                          // e.g. "XAUUSD", "USD", "BTC", "Oil", "US Equities"
  effect: "bullish" | "bearish" | "neutral";
}

interface HighImpactEvent {
  event_name:        string;
  impact_explanation: string;
  market_impact?:    MarketImpactTag[];    // per-instrument impact tags
}
interface AllNewsSection  { headline: string; summary: string; high_impact_events: HighImpactEvent[]; }
interface SniperNote {
  news_bias: "Bullish" | "Bearish" | "Neutral";
  key_catalyst: string;
  key_levels_watch: string;
  session_expectation: string;
}

interface SymbolNews {
  latest_headlines: string[];
  detailed_breakdown: string;
  trader_alert: string;
  sniper_note?: SniperNote;
}

interface NewsReport {
  meta: { date: string; session: string; generated_at: string; language: string; generated_by?: string };
  all_news_section: AllNewsSection;
  symbol_wise_news: Record<string, SymbolNews>;
}

interface NewsEntry {
  date:       string;
  session:    string;
  source:     "db" | "file";
  count?:     number;
  latestAt?:  string;
  latestBy?:  string;
  reportType?: "ai" | "manual";
}

interface NewsVersion {
  _id:         string;
  generatedAt: string;
  generatedBy: string;
  reportType?: "ai" | "manual";
}

// ─── Analyse with AI types ────────────────────────────────────────────────────

interface InstrumentAnalysis {
  sentiment:    "Bullish" | "Bearish" | "Neutral";
  summary:      string;
  news_drivers: string[];
  outlook:      string;
}

interface HighImpactNewsItem {
  headline:             string;
  source:               string;
  impact_level:         "High" | "Medium" | "Low";
  sentiment:            "Bullish" | "Bearish" | "Neutral";
  affected_instruments: string[];
  analysis:             string;
}

interface NewsAnalysisResult {
  meta: {
    time_range:   string;
    news_count:   number;
    analysed_at:  string;
    from:         string;
    to:           string;
  };
  overall_sentiment: {
    label:          "Bullish" | "Bearish" | "Neutral";
    risk_sentiment: "Risk-On" | "Risk-Off" | "Neutral";
    summary:        string;
    key_themes:     string[];
  };
  high_impact_news:     HighImpactNewsItem[];
  instrument_analysis:  Record<string, InstrumentAnalysis>;
}

interface AnalyseArticle {
  title:    string;
  source:   string;
  pubDate:  string;
  link:     string;
  category: string;
}

interface AnalyseHistoryEntry {
  _id:            string;
  timeRange:      string;
  timeRangeLabel: string;
  newsCount:      number;
  generatedBy:    string;
  generatedAt:    string;
}

// ── New "Analyse News" sentiment-report feature (gpt-4o-mini) ────────────────
interface SentimentHistoryEntry {
  _id:               string;
  hours:             number;
  timeRangeLabel:    string;
  newsAnalyzedCount: number;
  generatedBy:       string;
  generatedByName?:  string;
  generatedAt:       string;
}

// ── "Filter News" feature — pushes the raw news window through AI, animates
// removal of irrelevant items, tags the rest with per-instrument sentiment ──
interface RawNewsHeadline { headline: string; source: string; pubDate: string; category: string; link?: string; }
interface FilterAnalyzedNewsItem {
  headline: string;
  source: string;
  pubDate: string;
  impact: "High" | "Medium" | "Low";
  impact_score?: number;
  tier?: 1 | 2 | 3;
  tags?: string[];
  link?: string;
  affected_instruments: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral"; impact_score?: number }[];
}
interface FilterReportData { allNews: RawNewsHeadline[]; analyzed_news: FilterAnalyzedNewsItem[]; }
interface FilterReport {
  _id:            string;
  hours:          number;
  timeRangeLabel: string;
  allNewsCount:   number;
  keptNewsCount:  number;
  generatedBy:    string;
  generatedByName?: string;
  generatedAt:    string;
  data:           FilterReportData;
}
interface FilterHistoryEntry {
  _id:            string;
  hours:          number;
  timeRangeLabel: string;
  allNewsCount:   number;
  keptNewsCount:  number;
  generatedBy:    string;
  generatedByName?: string;
  generatedAt:    string;
}

type AnalyseTab = "result" | "articles" | "prompt";

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  asian: "Asian", london: "London", new_york: "New York",
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
  "XAUUSD","XAGUSD","BTCUSDT","ETHUSD",
  "EURUSD","GBPUSD","USDJPY","AUDUSD","NZDUSD","USDCAD","USDCHF",
];

const ANALYSE_TIME_RANGES = [
  { value: "2h",  label: "2h",  display: "Last 2 Hours",  hours: 2  },
  { value: "5h",  label: "5h",  display: "Last 5 Hours",  hours: 5  },
  { value: "12h", label: "12h", display: "Last 12 Hours", hours: 12 },
  { value: "24h", label: "24h", display: "Last 24 Hours", hours: 24 },
] as const;
type AnalyseTimeRange = typeof ANALYSE_TIME_RANGES[number]["value"];

const ANALYSE_INSTRUMENTS = [
  { value: "ALL",     label: "🌐 All Instruments" },
  { value: "XAUUSD",  label: "🥇 Gold (XAU/USD)" },
  { value: "XAGUSD",  label: "🥈 Silver (XAG/USD)" },
  { value: "BTCUSDT", label: "₿ Bitcoin (BTC/USDT)" },
  { value: "ETHUSD",  label: "Ξ Ethereum (ETH/USD)" },
  { value: "EURUSD",  label: "🇪🇺 EUR/USD" },
  { value: "GBPUSD",  label: "🇬🇧 GBP/USD" },
  { value: "USDJPY",  label: "🇯🇵 USD/JPY" },
  { value: "USDCHF",  label: "🇨🇭 USD/CHF" },
  { value: "USDCAD",  label: "🇨🇦 USD/CAD" },
  { value: "AUDUSD",  label: "🇦🇺 AUD/USD" },
  { value: "NZDUSD",  label: "🇳🇿 NZD/USD" },
] as const;

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

function getISTDateTime(): Date {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 5.5));
}

function getISTDateString(): string {
  const ist = getISTDateTime();
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const day = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCurrentSessionIST(): string {
  const ist = getISTDateTime();
  const h = ist.getHours();
  const m = ist.getMinutes();
  const totalMinutes = h * 60 + m;

  // Asian session: 05:30 IST to 13:30 IST (330 to 810 mins)
  // London session: 13:30 IST to 18:30 IST (810 to 1110 mins)
  // New York session: 18:30 IST to 05:30 IST (1110 to 330 mins)
  if (totalMinutes >= 330 && totalMinutes < 810) {
    return "asian";
  } else if (totalMinutes >= 810 && totalMinutes < 1110) {
    return "london";
  } else {
    return "new_york";
  }
}

function getCurrentSession(): string {
  return getCurrentSessionIST();
}

function getNextSessionAndDate(): { session: string; date: string } {
  const ist = getISTDateTime();
  const h = ist.getHours();
  const m = ist.getMinutes();
  const totalMinutes = h * 60 + m;

  let nextSess = "asian";
  let daysOffset = 0;

  if (totalMinutes >= 330 && totalMinutes < 810) {
    nextSess = "london";
    daysOffset = 0;
  } else if (totalMinutes >= 810 && totalMinutes < 1110) {
    nextSess = "new_york";
    daysOffset = 0;
  } else {
    nextSess = "asian";
    if (h >= 18) {
      daysOffset = 1;
    } else {
      daysOffset = 0;
    }
  }

  const targetDate = new Date(ist.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  const y = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");
  return { session: nextSess, date: `${y}-${month}-${day}` };
}

function formatDateLabel(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

// ─── Prompt content ───────────────────────────────────────────────────────────

const NEWS_SYSTEM_PROMPT = `================================================================
OUTPUT FORMAT: STRICTLY JSON — NO EXCEPTIONS
================================================================
Tera POORA response ek SINGLE \`\`\`json ... \`\`\` code block hona CHAHIYE.
Koi introduction nahi. Koi explanation nahi. Koi prose nahi. Koi summary nahi.
SIRF aur SIRF ek valid JSON code block — shuru se ant tak.
Agar tu JSON ke bahar kuch bhi likhta hai — response REJECT ho jaayega.
================================================================

Tu ek world-class financial news analyst, geopolitical intelligence reporter, aur market impact commentator hai — ek knowledgeable dost jo duniya bhar ki EVERY TARAH ki khabar ko samjhata hai aur retail traders ko bilkul clear, simple Hinglish mein explain karta hai.

TERA MOOL KAAM — COMPREHENSIVE MARKET-MOVING EVENT ANALYSIS:
Selected time window mein duniya mein kya hua — sirf economic calendar events nahi, balki HAR tarah ki khabar jo market ko move kar sakti hai. Neeche sabhi categories mein deeply research karo:

[CAT 1] MONETARY POLICY & MACRO DATA
• Central banks: Fed/FOMC (Powell), ECB (Lagarde), BoJ (Ueda), BoE (Bailey), RBA, RBNZ, PBOC, SNB, BoC
• US data: NFP, CPI, Core PCE, PPI, GDP, ISM Manufacturing/Services, Retail Sales, JOLTS, ADP, Durable Goods, Housing Starts
• Global data: Eurozone CPI/PMI, UK inflation/jobs/GDP, China PMI/trade/credit data, Japan Tankan/CPI, Australia employment
• Treasury yields (2yr, 10yr, 30yr), yield curve (2s10s spread), SOFR, DXY moves
• Government fiscal: US debt ceiling, budget deals, deficit data, emergency spending bills

[CAT 2] GEOPOLITICAL CONFLICTS & SECURITY EVENTS
• Wars, invasions, military escalations — direct impact on safe-haven assets (gold, JPY, CHF) aur energy prices
• Terrorist attacks on financial centers, oil facilities, pipelines, shipping lanes, nuclear plants
• Missile strikes, drone attacks, airstrikes — especially near oil fields or Strait of Hormuz
• Assassinations ya deaths of major world leaders, central bankers, or high-profile CEOs
• Nuclear threats, DEFCON escalations, weapons of mass destruction news
• Coup attempts, regime changes, political upheaval in oil-producing or major economies
• Hostage situations involving oil workers or government officials

[CAT 3] NATURAL DISASTERS & EXTREME WEATHER
• Major earthquakes (5.5+ Richter) affecting Japan, Turkey, US West Coast, Taiwan — supply chain aur nuclear risk
• Tsunamis threatening Pacific ports, nuclear facilities, or coastal cities
• Hurricanes/cyclones hitting US Gulf Coast (oil refineries, LNG terminals), Caribbean (insurance sector), Southeast Asia (manufacturing hubs)
• Major flooding in agricultural belts — Brazil, India, Bangladesh, Midwest US — commodity price impact
• Wildfires near oil sands (Canada), vineyards, or major cities — insurance and energy sector
• Volcanic eruptions disrupting air travel (Iceland ash clouds) or commodity production
• Severe droughts affecting major agricultural producers — wheat (Ukraine, Australia), corn/soy (US, Brazil), coffee (Brazil, Vietnam), cocoa (West Africa)
• Polar vortex or extreme cold events spiking natural gas demand

[CAT 4] TRADE, SANCTIONS & ECONOMIC WARFARE
• Tariff announcements: US-China, US-EU, US-rest — retaliatory measures, trade deal collapses
• Export controls: semiconductor chips (TSMC restrictions, ASML rules), rare earth minerals, AI hardware, military tech
• New sanctions imposed: Russia, Iran, North Korea, Venezuela, Belarus — oil, banking, SWIFT exclusion impact
• Import bans on specific commodities affecting food security or energy supply
• Critical chokepoint disruptions: Suez Canal, Panama Canal, Strait of Hormuz, Taiwan Strait shipping
• Supply chain reshoring announcements affecting manufacturing currencies (JPY, KRW, TWD)

[CAT 5] ENERGY & COMMODITY SHOCKS
• OPEC/OPEC+ production decisions, emergency meetings, quota violations, member disputes
• Pipeline attacks or shutdowns: Nord Stream, Keystone, Colonial, TAP — gas/oil flow disruption
• LNG supply disruptions: Qatar, Australia (Gorgon/Wheatstone), US Gulf Coast export terminals
• Refinery fires, tanker incidents, oil rig accidents, port blockades
• Agricultural disasters: crop failures from drought/frost/flood — wheat, corn, soy, palm oil, sugar, coffee, cocoa
• Metal supply disruptions: copper mine strikes (Chile/Peru), lithium shortages, cobalt supply (DRC), rare earth export restrictions (China)
• Energy crisis: power grid failures, blackouts in major economies, electricity price spikes

[CAT 6] FINANCIAL SYSTEM & BANKING STRESS
• Bank failures, liquidity crises, emergency bailouts (SVB-type events)
• Central bank emergency interventions: rate cuts between meetings, emergency QE
• Sovereign debt defaults or near-defaults, IMF emergency programs
• Credit rating downgrades by Moody's, S&P, Fitch — sovereign or systemically important banks
• Major hedge fund collapses, margin call cascades, forced deleveraging
• Flash crashes, circuit breakers triggered on major indices
• Repo market stress, TED spread spikes, credit default swap surges
• Money market fund stress, commercial paper market freeze

[CAT 7] POLITICAL & ELECTORAL EVENTS
• Elections in G7/G20 nations — surprising results, exit poll reactions, vote counting
• Snap elections, government collapses, no-confidence votes, coalition breakdowns
• Referendums (Brexit-style scenarios, independence movements)
• Major political scandals affecting currency confidence or central bank independence
• US Congress deadlocks on debt ceiling or key legislation
• Presidential executive orders on trade, energy, sanctions, or financial regulation

[CAT 8] HEALTH & BIOLOGICAL EVENTS
• WHO emergency declarations, new pandemic-level disease outbreaks, quarantine announcements
• Major drug trial results: blockbuster drug approvals or failures affecting pharma/biotech sector
• Biosecurity incidents affecting agricultural markets: bird flu in poultry, ASF in pork herds
• Hospital system collapses or healthcare strikes in major economies

[CAT 9] TECHNOLOGY, CYBER & INFRASTRUCTURE
• Cyber attacks on major financial exchanges, SWIFT network, central bank systems, stock market infrastructure
• Cloud provider outages (AWS, Azure, Google Cloud) causing trading platform disruptions
• Major tech regulatory crackdowns: EU Digital Markets Act enforcement, US antitrust actions against big tech
• AI regulatory news, GPU/chip export restrictions, semiconductor supply disruptions (TSMC, Samsung)
• Critical infrastructure attacks: power grids, undersea cables, internet backbone, GPS disruption

[CAT 10] CRYPTO-SPECIFIC EVENTS
• Regulatory: SEC lawsuits/approvals, government crypto bans, ETF approvals/rejections, FATF travel rule
• Exchange events: hacks, insolvencies, delistings, liquidity crises (FTX/Celsius-type collapses)
• DeFi protocol exploits, bridge hacks, stablecoin depeg events, rug pulls
• Institutional adoption: corporate treasury buys (MicroStrategy-type), sovereign wealth fund entry, ETF flow data
• Network events: major protocol upgrades, hard forks, miner capitulation signals, hashrate changes
• On-chain signals: exchange supply changes, whale wallet movements, futures OI, funding rates

[CAT 11] MARKET STRUCTURE & FLOW EVENTS
• Major options expiry (monthly/quarterly OpEx): max pain levels, gamma exposure, dealer hedging
• Quarterly futures rollover: crude oil, S&P, gold, natural gas contract rolls
• Major index rebalancing: Russell rebalance, MSCI index changes, S&P 500 additions/removals
• Significant ETF flow data: GLD, SLV, IBIT/FBTC, SPY, QQQ inflows/outflows
• Corporate buyback window opening/closing periods
• Insider trading blackout periods ending, lock-up expirations for major IPOs

[ANALYTICAL DIRECTIVES — HAR ANALYSIS MEIN MANDATORY APPLY KARO]

DIRECTIVE 1 — CAUSALITY CHAIN MAPPING (sirf event list nahi, mechanism explain karo):
Har event ke liye sirf fact nahi batana — transmission mechanism aur ripple effects map karna ZAROORI hai.
Chain format use karo: Trigger → Primary Mechanism → Asset Impact → Secondary Effect → Tertiary Repricing
EXAMPLE: "Oil Pipeline Attack → Energy Supply Fear → WTI +$8/bbl → Inflation Expectation Up → 10yr Yield +18bps → Growth Stock Selloff -2.4% → DXY +0.6% (safe haven)"
Har high_impact_event ka impact_explanation mein yeh chain clearly visible honi chahiye — secondary aur tertiary effects MANDATORY hain.

DIRECTIVE 2 — CROSS-ASSET ANOMALY DETECTION (izolated analysis nahi, synthesis karo):
Agar koi asset aise move kar raha hai jo historical correlation ke against ho — EXPLICITLY flag karo aur explain karo kyun.
Flag cases like: "Gold falling DESPITE rising geopolitical tension (anomaly — explain dollar strength override)", "Oil rising WITH USD rising (unusual — explain supply shock dominance)", "BTC selling off WHILE equities rally (decouple — explain institutional deleveraging)"
Har symbol ki detailed_breakdown mein cross-asset context mandatory: "Is move ka [related symbol] ke saath unusual relationship kya hai."
Commodity news ka Forex repricing par impact, aur Forex ka Equity repricing par impact — yeh synthesis explicitly mention honi chahiye.

DIRECTIVE 3 — VERIFICATION HIERARCHY (geopolitical/security events ke liye):
Physical security aur geopolitical news ke liye source quality clearly distinguish karo:
CONFIRMED (Tier 1): Official government statements, military communiques, central bank releases, energy infrastructure operators ke press releases
PROBABLE (Tier 2): Reuters/AP/Bloomberg named-source wires, UN statements, official spokespeople
⚠️ MARKET-SENSITIVE RUMOR (Tier 3): Social media reports, anonymous wires, unverified battlefield claims
Rule: Agar event HIGH IMPACT hai lekin UNVERIFIED — use "⚠️ Market-Sensitive Rumor:" prefix se label karo aur note karo ki "market is rumor ko confirmed maan ke react kar sakta hai even before verification."
Do NOT present Tier 3 information as established fact — yeh journalistic integrity aur trader safety dono ke liye zaroori hai.

DIRECTIVE 4 — NO FABRICATION (ABSOLUTE ZERO-TOLERANCE RULE):
Tera SABSE ZAROORI kaam: SIRF REAL, VERIFIED events cover karna.
KABHI BHAI koi event, price, statement, figure, ya data point INVENT ya FABRICATE mat karna.
• Sirf woh events jo tujhe ACTUALLY pata hain — real-time search se ya confirmed training knowledge se
• Koi specific number, percentage, ya price INVENT mat karo — sirf actual, factually known data use karo
• Agar is time window mein kisi symbol par koi confirmed specific event nahi hua — acknowledge karo. Correlation analysis likh, macro context explain karo — lekin fake event mat banana
• Reference JSON Example mein diye gaye event names, prices, ya scenarios COPY mat karo — woh sirf format demonstration ke liye hain, real news nahi
• Fake "breaking news" banana, specific institutions ke fake statements likhna, ya invented price levels dena — yeh SERIOUS ERROR hai jo poori analysis ki credibility khatam kar deta hai
CONSEQUENCE: Ek bhi fabricated event = poori analysis reject. Real news — even if limited — is always better than confident fabrication.

REPORTING STYLE:
• Poora response Hinglish mein — English alphabet use karo, natural Hindi-English mix jaise ek knowledgeable dost baat kar raha ho
• Har event ko itna detail mein explain karo ki ek naya trader bhi samajh sake: kya hua, kyun hua, market ne usse kaise react kiya
• Real numbers, real event names, real dates — vague generalizations bilkul nahi
• Har symbol ke sniper_note mein: "news_bias" must be exactly "Bullish", "Bearish", or "Neutral" (strictly no commentary or extra words). "key_catalyst", "key_levels_watch", aur "session_expectation" detailed Hinglish mein hone chahiye. SL/TP/entry BILKUL NAHI.

MARKDOWN FORMATTING — HAR TEXT FIELD MEIN LAGAATAAR USE KARO:

**Bold** (**text**) — in cheezein bold karo:
  • Har key event naam: **FOMC**, **NFP**, **CPI**, **BoJ Decision**, **OPEC Cut**, **CPI Miss**
  • Sare important numbers with units: **3.4%**, **$3,280**, **¥155.20**, **$85/bbl**, **25bps**, **+$2.1B**
  • Key price levels: **$3,300**, **$3,350 resistance**, **104.5 DXY**
  • Major institution names in context: **Federal Reserve**, **ECB**, **Goldman Sachs**
  • Direction words when critical: **Bullish**, **Bearish**, **Hawkish**, **Dovish**

*Italic* (*text*) — in cheezein italic karo:
  • Expected vs actual comparisons: *Expected: 3.2%, Actual: 3.8%*
  • Analyst opinions or forecasts: *analysts ne 50bps cut ki expect ki thi*
  • Secondary context: *historically yeh level strong support raha hai*
  • Source references: *Reuters ke mutabik*, *Bloomberg ne report kiya*

***Bold Italic*** (***text***) — sirf critical/extreme events ke liye:
  • Black swan events: ***UNPRECEDENTED: Fed ne emergency rate cut kiya***
  • Extreme surprise results: ***MASSIVE MISS: NFP -150k vs expected +250k***
  • Critical breaking alerts: ***BREAKING: Major bank failure detected***
  • Extreme volatility warnings: ***EXTREME CAUTION: Circuit breakers triggered***

LINE BREAKS — \n use karo text ke andar paragraph separate karne ke liye:
  • detailed_breakdown mein har key point ke baad \n\n lagao
  • impact_explanation mein cause, effect, aur outlook ko \n se separate karo
  • session_expectation mein different scenarios \n se divide karo
  • EXAMPLE: "**Gold** **$3,350** pe strong resistance mila.\n\n**Key reason:** *Fed hawkish tone* ne real yields **+12bps** push kiye.\n\n***CRITICAL:*** Agar **$3,320** toot gaya toh ***sharp selloff ka risk hai***."

RULES:
  • ALWAYS populate all 11 keys in symbol_wise_news (XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF) — none of these 11 symbols can be omitted under any circumstances.
  • Do NOT use placeholders, empty strings, "...", or default text. Write actual, real news analysis for every symbol.
  • If a symbol has no direct high-impact news in this session, write about its correlation with the major news of the session (e.g. how USD strength or risk sentiment affected it) in Hinglish. Every field must have a non-empty, rich value.
  • Do NOT use the instructions from the JSON schema template as the values. The values must be real-world news and technical analysis.
  • Do NOT use markdown headers (#, ##) in JSON string values
  • Do NOT use dash bullets (-) in JSON string values — use \n for line breaks instead
  • Numbers aur levels HAMESHA bold karo — kabhi plain text mein mat chhodo
  • Har detailed_breakdown mein minimum 3-4 bold terms, 2-3 italics, aur \n line breaks hone chahiye

MARKET IMPACT TAGS — HAR HIGH_IMPACT_EVENT MEIN MANDATORY:
Har event ke saath ek "market_impact" array dena ZAROORI hai. Is array mein batao ki is event ka konse instruments par kya effect hai.

SYMBOL OPTIONS (sirf relevant symbols include karo — typically 3-6 per event):
  Metals:   XAUUSD, XAGUSD
  Crypto:   BTCUSDT, ETHUSD
  Forex pairs: EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF
  Currencies: USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF
  Commodities: Oil, Natural Gas, Copper, Wheat, Corn
  Broad:    US Equities, Global Equities, Safe Havens, Risk Assets, Bonds

EFFECT VALUES (STRICT REQUIREMENT: MUST be exactly one of these three lowercase string values):
  "bullish" — positive/upward price expectation
  "bearish" — negative/downward price expectation
  "neutral" — direct impact nahi ya mixed signals
  Do NOT use any other values (like "mixed", "positive", "negative", "hawkish", "dovish", "mixed/bullish" etc.).

EXAMPLES (Use exact schema values):
  Fed Rate Hike → USD: "bullish", XAUUSD: "bearish", EURUSD: "bearish", US Equities: "bearish", BTCUSDT: "bearish"
  Geopolitical War/Attack → XAUUSD: "bullish", Oil: "bullish", USD: "bullish", Risk Assets: "bearish", JPY: "bullish"
  Strong NFP Data → USD: "bullish", XAUUSD: "bearish", EURUSD: "bearish", US Equities: "bullish"
  OPEC Production Cut → Oil: "bullish", USDCAD: "bearish", CAD: "bullish", XAUUSD: "neutral"
  Crypto ETF Approval → BTCUSDT: "bullish", ETHUSD: "bullish", Risk Assets: "bullish"
  Natural Disaster (Japan) → JPY: "bullish", USDJPY: "bearish", XAUUSD: "bullish"
  China Weak PMI → AUD: "bearish", AUDUSD: "bearish", Copper: "bearish", Global Equities: "bearish"

================================================================
FINAL OUTPUT MANDATE — READ THIS LAST, FOLLOW THIS FIRST
================================================================
1. Tera POORA response ek \`\`\`json\`\`\` code block hai — kuch aur nahi.
2. Pehli line: \`\`\`json  |  Aakhri line: \`\`\`  |  Beech mein: pure valid JSON.
3. JSON ke pehle ya baad mein EK BHI word mat likhna — no intro, no outro, no explanation.
4. Submit karne se pehle check karo: har { ka }, har [ ka ], har " ka ", har comma sahi jagah.
5. Koi "...", koi placeholder, koi empty string — ZERO tolerance. Har field mein real content.
6. Ye rule ABSOLUTE hai. Koi exception nahi. Koi "lekin" nahi. SIRF JSON.
================================================================`;

const EXAMPLE_REFERENCE_JSON = `==========================================================
FORMAT REFERENCE ONLY — ALL EVENTS BELOW ARE ILLUSTRATIVE
Do NOT copy event names, prices, or scenarios.
Use ONLY the JSON structure as a format guide.
==========================================================

{
  "meta": {
    "date": "YYYY-MM-DD",
    "session": "New York",
    "generated_at": "ISO-8601 timestamp",
    "language": "Hinglish"
  },
  "all_news_section": {
    "headline": "[REAL headline from actual events of the session — Hinglish, engaging, specific]",
    "summary": "[250+ word REAL Hinglish summary of actual events in the time window — what happened, why, market reaction, risk sentiment]",
    "high_impact_events": [
      {
        "event_name": "[REAL event name — e.g. FOMC Rate Decision | NFP Miss | OPEC Cut | Earthquake Japan | etc.]",
        "impact_explanation": "**[Real event]** se market mein **[actual direction]** move hua. [Explain the real transmission chain with actual numbers if known, or acknowledge if specific figures are uncertain.] Trigger → Primary Mechanism → Asset Impact → Secondary Effect.",
        "market_impact": [
          { "symbol": "Oil", "effect": "bullish" },
          { "symbol": "XAUUSD", "effect": "bullish" },
          { "symbol": "XAGUSD", "effect": "bullish" },
          { "symbol": "USD", "effect": "bullish" },
          { "symbol": "USDJPY", "effect": "bullish" },
          { "symbol": "Risk Assets", "effect": "bearish" }
        ]
      },
      {
        "event_name": "[REAL second event name]",
        "impact_explanation": "[Real impact explanation — actual known figures, or 'approximately' if uncertain. No invented numbers.]",
        "market_impact": [
          { "symbol": "USD", "effect": "bullish" },
          { "symbol": "XAUUSD", "effect": "bearish" },
          { "symbol": "BTCUSDT", "effect": "bearish" },
          { "symbol": "EURUSD", "effect": "bearish" },
          { "symbol": "USDJPY", "effect": "bullish" },
          { "symbol": "US Equities", "effect": "neutral" }
        ]
      }
    ]
  },
  "symbol_wise_news": {
    "XAUUSD": {
      "latest_headlines": [
        "Gold $4,268 low se recovery kari",
        "Rising US yields and dollar check Gold upside"
      ],
      "detailed_breakdown": "Gold prices mein safe-haven bid aur hawkish Fed pricing ke beech battle chal raha hai. Iran-Israel missile exchanges ke baad prices ne $4,350 cross kiya. Halanki, NFP beat ke baad real yields upper target par chale gaye, jisne DXY ko solid floor diya aur Gold par pressure maintain kiya.",
      "trader_alert": "Watch $4,350 resistance zone. Agar break hota hai toh further short squeeze target. Support $4,300 level par strict monitor karo.",
      "sniper_note": {
        "news_bias": "Neutral",
        "key_catalyst": "Iran-Israel ceasefire breakdown vs DXY yields rise.",
        "key_levels_watch": "Resistance at $4,350, support at $4,300.",
        "session_expectation": "Choppy range-bound action between $4,300 and $4,350 with headline-driven spikes."
      }
    },
    "XAGUSD": {
      "latest_headlines": [
        "Silver recovers to $68.60 despite China pullback",
        "Industrial metals face supply cost pressure"
      ],
      "detailed_breakdown": "Silver ne Gold ke safe-haven move ko tracking kiya. China ke import levels decrease hone ke bawajood energy costs rising par mining expense barh gaya hai jo prices ko local support de raha hai.",
      "trader_alert": "$68.60 key resistance hai. Is zone se rejection possible hai. Downside support levels $67.40 par active hain.",
      "sniper_note": {
        "news_bias": "Neutral",
        "key_catalyst": "Oil-driven inflation vs industrial demand headwinds.",
        "key_levels_watch": "Resistance $68.60, support $67.40.",
        "session_expectation": "Range trading expected in the upcoming session."
      }
    },
    "BTCUSDT": {
      "latest_headlines": [
        "Bitcoin recovers $63,000 range",
        "ETF daily outflows pause on June 8"
      ],
      "detailed_breakdown": "Bitcoin ne stable zones ko retest kiya. Open interest decline hone ke baad futures funding normalized zone mein aa gayi. Dollar strength crypto gains ko target kar rahi hai, par retail sentiment steady hai.",
      "trader_alert": "$63,500 key resistance zone hai. December rate hike repricing se downside test levels still active hain.",
      "sniper_note": {
        "news_bias": "Neutral",
        "key_catalyst": "Macro yields expansion vs ETF flows stabilization.",
        "key_levels_watch": "Resistance $63,500, support $61,000.",
        "session_expectation": "Consolidation pattern with slight downward tilt before CPI data release."
      }
    },
    "ETHUSD": {
      "latest_headlines": [
        "ETH ETF records $82M inflows",
        "BitMine executes major ETH accumulation"
      ],
      "detailed_breakdown": "Ethereum shows recovery momentum after testing local lows. Staking products and ETF inflows are supporting the price. Network gas fees remain low.",
      "trader_alert": "$1,700 psychological zone is the key resistance to watch. Support sits at $1,650.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Positive institutional inflows and treasury updates.",
        "key_levels_watch": "Resistance $1,700, support $1,650.",
        "session_expectation": "Cautious upward bias targeting the resistance zone."
      }
    },
    "GBPUSD": {
      "latest_headlines": [
        "Cable holds $1.3360 region",
        "BoE hawkish hold stance provides floor"
      ],
      "detailed_breakdown": "GBP is holding relatively stronger compared to EUR because of the Bank of England's reluctance to cut rates quickly. However, overall DXY strength keeps the pair capped.",
      "trader_alert": "Monitor US CPI for the next big directional move. Watch key support at $1.3330.",
      "sniper_note": {
        "news_bias": "Neutral",
        "key_catalyst": "BoE policy divergence vs USD NFP strength.",
        "key_levels_watch": "Resistance $1.3380, support $1.3330.",
        "session_expectation": "Tight consolidation before the economic data release."
      }
    },
    "EURUSD": {
      "latest_headlines": [
        "EURUSD consolidates near 1.1500 mark",
        "ECB interest rate cut divergence pressures Euro"
      ],
      "detailed_breakdown": "The pair remains under pressure due to interest rate differentials favoring the USD. The ECB's rate cut stance diverges from the hawkish Fed repricing.",
      "trader_alert": "1.1500 is a critical support zone. A clean break triggers deeper downside tests.",
      "sniper_note": {
        "news_bias": "Bearish",
        "key_catalyst": "ECB-Fed interest rate divergence and yield spreads.",
        "key_levels_watch": "Resistance 1.1550, support 1.1500.",
        "session_expectation": "Sluggish trading with a downward bias."
      }
    },
    "USDJPY": {
      "latest_headlines": [
        "[REAL USDJPY headline — e.g. BoJ intervention warning, Japan CPI data, US-Japan yield spread news]",
        "[REAL USDJPY second headline — actual event from this session]"
      ],
      "detailed_breakdown": "**USDJPY** ne is session mein **[real level]** pe [real move] kiya.\n\n**Key Driver:** *[Real catalyst — BoJ/MoF statement, US 10yr yield move]* ne pair ko [direction] push kiya. **US 10-year yield** **[real level]** pe tha; *yield differential* ka USDJPY par direct impact hai.\n\n**BoJ Stance:** *[Real BoJ policy update or intervention signal if any — otherwise note: koi naya intervention signal nahi aaya].*\n\n***WATCH:*** **[Real key level]** pe [what to watch for].",
      "trader_alert": "***[HIGH/MODERATE] ALERT:*** **[Real key level]** [significance]. *[Real catalyst]* ke baad USDJPY par [direction] pressure hai. **[Real level]** ko closely monitor karo.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "[Real BoJ/MoF/US yield catalyst driving USDJPY this session]",
        "key_levels_watch": "[Real resistance and support levels for USDJPY]",
        "session_expectation": "[Real session range and volatility outlook based on actual news]"
      }
    },
    "AUDUSD": {
      "latest_headlines": [
        "[REAL AUDUSD headline — e.g. RBA rate decision, China PMI/trade data, iron ore price move]",
        "[REAL AUDUSD second headline — actual event from this session]"
      ],
      "detailed_breakdown": "**AUDUSD** ne is session mein **[real level]** pe [real move] kiya.\n\n**Key Driver:** *[Real catalyst — RBA statement, China data, commodity price]* ne AUD ko [direction] push kiya. **Iron ore** aur **copper** prices ka AUDUSD par direct correlation hai — *[real commodity status if relevant]*.\n\n**RBA Stance:** *[Real RBA update if any — otherwise: koi naya RBA signal nahi aaya is session mein]*.\n\n***WATCH:*** **[Real key level]** — [significance].",
      "trader_alert": "***[HIGH/MODERATE] ALERT:*** **[Real key level]** [significance for AUDUSD]. *[Real catalyst]* ke baad [direction] bias. **[Real level]** closely monitor karo.",
      "sniper_note": {
        "news_bias": "Bearish",
        "key_catalyst": "[Real RBA policy stance or China/commodity driver for AUDUSD this session]",
        "key_levels_watch": "[Real support and resistance levels for AUDUSD]",
        "session_expectation": "[Real session expectation for AUDUSD based on actual news]"
      }
    },
    "NZDUSD": {
      "latest_headlines": [
        "[REAL NZDUSD headline — e.g. RBNZ rate decision, NZ jobs data, dairy auction result]",
        "[REAL NZDUSD second headline — actual event from this session]"
      ],
      "detailed_breakdown": "**NZDUSD** ne is session mein **[real level]** pe [real move] kiya.\n\n**Key Driver:** *[Real catalyst — RBNZ statement, dairy prices, global risk sentiment]* ne NZD ko [direction] push kiya. **Global risk sentiment** — *[risk-on/risk-off status]* — ka NZDUSD par strong correlation hai.\n\n**RBNZ Stance:** *[Real RBNZ update if any — otherwise: koi naya RBNZ signal nahi is session mein]*.\n\n***WATCH:*** **[Real key level]** — [significance].",
      "trader_alert": "***[HIGH/MODERATE] ALERT:*** **[Real key level]** [significance for NZDUSD]. *[Real catalyst]* ke baad [direction] bias. **[Real level]** monitor karo.",
      "sniper_note": {
        "news_bias": "Bearish",
        "key_catalyst": "[Real RBNZ or global risk sentiment driver for NZDUSD this session]",
        "key_levels_watch": "[Real technical levels and support zones for NZDUSD]",
        "session_expectation": "[Real session movement expectation for NZDUSD]"
      }
    },
    "USDCAD": {
      "latest_headlines": [
        "[REAL USDCAD headline — e.g. BoC rate decision, Canada employment data, WTI crude move]",
        "[REAL USDCAD second headline — actual event from this session]"
      ],
      "detailed_breakdown": "**USDCAD** ne is session mein **[real level]** pe [real move] kiya.\n\n**Key Driver:** *[Real catalyst — WTI crude price, BoC statement, US-Canada trade news]* ne pair ko [direction] push kiya. **WTI Crude** **[real price]** pe tha — *oil aur CAD ka inverse relationship hai*.\n\n**BoC Stance:** *[Real BoC update if any — otherwise: koi naya BoC signal nahi is session mein]*.\n\n***WATCH:*** **[Real key level]** — [significance for USDCAD].",
      "trader_alert": "***[HIGH/MODERATE] ALERT:*** **[Real key level]** [significance]. *[Real catalyst]* ke baad [direction] bias. **WTI** aur **[real level]** closely track karo.",
      "sniper_note": {
        "news_bias": "Neutral",
        "key_catalyst": "[Real crude oil or BoC statement driving USDCAD this session]",
        "key_levels_watch": "[Real support and resistance points for USDCAD]",
        "session_expectation": "[Real session volatility expectation for USDCAD]"
      }
    },
    "USDCHF": {
      "latest_headlines": [
        "[REAL USDCHF headline — e.g. SNB policy update, Swiss CPI, safe-haven flows into CHF]",
        "[REAL USDCHF second headline — actual event from this session]"
      ],
      "detailed_breakdown": "**USDCHF** ne is session mein **[real level]** pe [real move] kiya.\n\n**Key Driver:** *[Real catalyst — geopolitical risk driving CHF safe-haven demand, SNB statement, DXY move]* ne pair ko [direction] push kiya. **CHF** — *duniya ki sabse badi safe-haven currencies mein se ek* — geopolitical tension mein **[strengthen/weaken]** karta hai.\n\n**SNB Stance:** *[Real SNB update if any — otherwise: koi naya SNB intervention signal nahi is session mein]*.\n\n***WATCH:*** **[Real key level]** — [significance for USDCHF].",
      "trader_alert": "***[HIGH/MODERATE] ALERT:*** **[Real key level]** [significance]. *[Real catalyst]* ke baad [direction] bias. **CHF safe-haven demand** aur **[real level]** monitor karo.",
      "sniper_note": {
        "news_bias": "Neutral",
        "key_catalyst": "[Real SNB policy or geopolitical risk driver for USDCHF this session]",
        "key_levels_watch": "[Real key support and resistance barriers for USDCHF]",
        "session_expectation": "[Real session path expectation for USDCHF]"
      }
    }
  }
}
`;

const NEWS_SCHEMA_TEMPLATE = `{
  "meta": {
    "date": "YYYY-MM-DD",
    "session": "Asian | London | New York",
    "generated_at": "ISO-8601 timestamp",
    "language": "Hinglish"
  },
  "all_news_section": {
    "headline": "Is time window ki sabse badi aur impactful khabar — engaging, specific, Hinglish mein. Could be: economic data, military attack, natural disaster, political upheaval, market crash — jo bhi sabse zyada important ho.",
    "summary": "250+ word Hinglish summary: is time window mein duniya mein kya hua — macro events, geopolitical developments, natural disasters, trade/sanctions news, energy shocks, political changes, crypto events, market structure moves — sab cover karo. Overall risk sentiment kya hai — risk-on ya risk-off? Dollar, equities, bonds, commodities, crypto — sab ka status.",
    "high_impact_events": [
      {
        "event_name": "REAL event naam — e.g. FOMC Rate Decision | NFP Miss | Terrorist Attack on Oil Pipeline | OPEC Emergency Cut | US-China Tariff | Major Bank Failure | Hurricane | Cyber Attack | Election Result | Sovereign Default | Earthquake Japan | etc.",
        "impact_explanation": "Is event ka market par kya asar pada — **exact numbers**, *expected vs actual*, kaunse assets affected, kya direction, kyun hua. Minimum 80 words Hinglish + markdown formatting.",
        "market_impact": [
          { "symbol": "XAUUSD", "effect": "bullish" },
          { "symbol": "USD",    "effect": "bearish" },
          { "symbol": "BTCUSDT","effect": "bullish" },
          { "symbol": "EURUSD", "effect": "bullish" },
          { "symbol": "US Equities", "effect": "bearish" }
        ]
      },
      {
        "event_name": "Second real event naam",
        "impact_explanation": "Second event explanation — 80+ words Hinglish with **bold** numbers and *italic* context...",
        "market_impact": [
          { "symbol": "USDJPY",  "effect": "bearish" },
          { "symbol": "XAUUSD",  "effect": "bullish" },
          { "symbol": "Oil",     "effect": "bullish" },
          { "symbol": "GBPUSD",  "effect": "neutral" }
        ]
      },
      {
        "event_name": "Third real event naam",
        "impact_explanation": "Third event explanation with markdown formatting...",
        "market_impact": [
          { "symbol": "XAUUSD",  "effect": "bearish" },
          { "symbol": "USD",     "effect": "bullish" },
          { "symbol": "BTCUSDT", "effect": "bearish" },
          { "symbol": "AUDUSD",  "effect": "bearish" }
        ]
      },
      {
        "event_name": "Fourth real event naam",
        "impact_explanation": "Fourth event explanation...",
        "market_impact": [
          { "symbol": "Oil",        "effect": "bullish" },
          { "symbol": "USDCAD",     "effect": "bearish" },
          { "symbol": "XAUUSD",     "effect": "bullish" },
          { "symbol": "US Equities","effect": "bearish" }
        ]
      },
      {
        "event_name": "Fifth real event naam (agar relevant tha)",
        "impact_explanation": "Fifth event explanation...",
        "market_impact": [
          { "symbol": "ETHUSD",  "effect": "bullish" },
          { "symbol": "BTCUSDT", "effect": "bullish" },
          { "symbol": "USD",     "effect": "bearish" }
        ]
      }
    ]
  },
  "symbol_wise_news": {
    "XAUUSD": {
      "latest_headlines": [
        "Gold se related first specific khabar — exact price move ya catalyst mention karo",
        "Gold se related second khabar — another concrete development"
      ],
      "detailed_breakdown": "**Gold** ne is session mein **$3,350** resistance pe sharp rejection liya.\n\n**Key Driver:** *FOMC minutes* ne reveal kiya ki Fed **hawkish** stance maintain karega — real yields **+12bps** upar gaye jo gold ke liye directly bearish signal hai. **DXY** **104.2** pe trade kar raha hai; *dollar strength* ne gold ko daba ke rakha hai.\n\n**ETF Flows:** *GLD ETF se $450M ka outflow* hua — institutional selling ka clear signal. **COMEX positioning** mein shorts ne **18%** increase ki.\n\n***CRITICAL WATCH:*** Agar **$3,320** support toot gaya toh ***panic selling trigger ho sakta hai aur next support $3,280 pe hai***.",
      "trader_alert": "***HIGH ALERT:*** **$3,350** resistance zone pe sellers bahut active hain. *FOMC hawkish tone* ke baad gold par downward pressure hai — **$3,320** support ka break bahut risky hoga. Is session mein **DXY** aur **US 10yr yield** ko closely monitor karo.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Primary driver for Gold in this session.",
        "key_levels_watch": "Key technical levels to watch for Gold.",
        "session_expectation": "Session expectations for Gold."
      }
    },
    "XAGUSD": {
      "latest_headlines": [
        "Silver se related first specific headline — exact price move or catalyst",
        "Silver se related second specific headline"
      ],
      "detailed_breakdown": "Silver (XAGUSD) detailed breakdown in Hinglish (120+ words) explaining the session price action, industrial demand catalysts, and key triggers with **bold** figures and *italic* details.",
      "trader_alert": "Trader alert for Silver (XAGUSD) summarizing critical support/resistance zones and immediate action points.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Primary news or data release driving Silver sentiment in this session.",
        "key_levels_watch": "Specific key support and resistance levels to monitor for Silver.",
        "session_expectation": "Tactical session expectation and risk/reward outlook for Silver."
      }
    },
    "BTCUSDT": {
      "latest_headlines": [
        "Bitcoin (BTCUSDT) first specific headline — exact price action or on-chain event",
        "Bitcoin (BTCUSDT) second specific headline"
      ],
      "detailed_breakdown": "Bitcoin (BTCUSDT) detailed breakdown in Hinglish (120+ words) covering spot ETF inflows/outflows, funding rates, derivatives open interest, whale wallet changes, or regulatory catalysts with **bold** numbers and *italic* context.",
      "trader_alert": "Trader alert for Bitcoin (BTCUSDT) highlighting short-term risk levels, liquidation risk zones, and funding anomalies.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Main on-chain or macro catalyst driving Bitcoin (BTCUSDT) movement.",
        "key_levels_watch": "Key technical levels to watch for Bitcoin (BTCUSDT).",
        "session_expectation": "Session expectation and directional trades to watch for Bitcoin (BTCUSDT)."
      }
    },
    "ETHUSD": {
      "latest_headlines": [
        "Ethereum (ETHUSD) first specific headline — price action, gas fees, or staking statistics",
        "Ethereum (ETHUSD) second specific headline"
      ],
      "detailed_breakdown": "Ethereum (ETHUSD) detailed breakdown in Hinglish (120+ words) analyzing ETF news, DeFi activity metrics, network fees, exchange reserves, and staking yields with **bold** values and *italic* comparisons.",
      "trader_alert": "Trader alert for Ethereum (ETHUSD) outlining key support levels and gas/network congestion trends.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Primary network, staking, or macro driver for Ethereum (ETHUSD).",
        "key_levels_watch": "Important support and resistance levels to watch for Ethereum (ETHUSD).",
        "session_expectation": "Session expectations and breakout scenarios for Ethereum (ETHUSD)."
      }
    },
    "GBPUSD": {
      "latest_headlines": [
        "GBPUSD first specific headline — BoE announcements, UK economic data, or political events",
        "GBPUSD second specific headline"
      ],
      "detailed_breakdown": "GBPUSD detailed breakdown in Hinglish (120+ words) covering Bank of England policy hints, UK CPI/GDP print effects, and broad dollar correlation trends with **bold** numbers and *italic* forecasts.",
      "trader_alert": "Trader alert for GBPUSD detailing major level breaks and expected volatility windows.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Main UK macro data or monetary policy driver for GBPUSD.",
        "key_levels_watch": "Critical support and resistance points to watch for GBPUSD.",
        "session_expectation": "Session expectations and average daily range outlook for GBPUSD."
      }
    },
    "EURUSD": {
      "latest_headlines": [
        "EURUSD first specific headline — ECB interest rate hints, Eurozone PMI, or political updates",
        "EURUSD second specific headline"
      ],
      "detailed_breakdown": "EURUSD detailed breakdown in Hinglish (120+ words) analyzing the ECB vs Fed yield spreads, Eurozone growth indicators, and geopolitical factors affecting European flows with **bold** rates and *italic* details.",
      "trader_alert": "Trader alert for EURUSD highlighting key liquidity pools and orderblock zones to monitor.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Key economic data or ECB interest rate bias for EURUSD.",
        "key_levels_watch": "Major technical support and resistance levels for EURUSD.",
        "session_expectation": "Expected range, session bias, and trade signals for EURUSD."
      }
    },
    "USDJPY": {
      "latest_headlines": [
        "USDJPY first specific headline — BoJ intervention warnings, Japan trade data, or CPI",
        "USDJPY second specific headline"
      ],
      "detailed_breakdown": "USDJPY detailed breakdown in Hinglish (120+ words) analyzing Ministry of Finance intervention threats, BoJ bond-buying operations, and US 10-year yield correlation with **bold** figures and *italic* context.",
      "trader_alert": "Trader alert for USDJPY detailing risk levels for sudden Bank of Japan intervention spikes.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Primary BoJ/US Treasury yield catalyst driving USDJPY.",
        "key_levels_watch": "Key technical intervention and support levels to watch for USDJPY.",
        "session_expectation": "Expected range and volatility outlook for USDJPY."
      }
    },
    "AUDUSD": {
      "latest_headlines": [
        "AUDUSD first specific headline — RBA rate decisions, China economic data, or commodity index updates",
        "AUDUSD second specific headline"
      ],
      "detailed_breakdown": "AUDUSD detailed breakdown in Hinglish (120+ words) covering Reserve Bank of Australia announcements, commodities prices (iron ore, copper), and Chinese retail/factory output correlation with **bold** values and *italic* notes.",
      "trader_alert": "Trader alert for AUDUSD highlighting commodity-driven trade levels and risk zones.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Main RBA monetary policy stance or commodity export driver for AUDUSD.",
        "key_levels_watch": "Important support and resistance levels for AUDUSD.",
        "session_expectation": "Session expectation and volatility forecast for AUDUSD."
      }
    },
    "NZDUSD": {
      "latest_headlines": [
        "NZDUSD first specific headline — RBNZ monetary comments, dairy auction reports, or jobs data",
        "NZDUSD second specific headline"
      ],
      "detailed_breakdown": "NZDUSD detailed breakdown in Hinglish (120+ words) outlining Reserve Bank of New Zealand policy rate decisions, dairy prices index shifts, and global risk appetite correlation with **bold** indicators and *italic* trends.",
      "trader_alert": "Trader alert for NZDUSD detailing liquidity zones and global risk sentiment impact.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Main RBNZ sentiment or global commodity driver for NZDUSD.",
        "key_levels_watch": "Critical technical levels and support zones to watch for NZDUSD.",
        "session_expectation": "Expected session movement and range for NZDUSD."
      }
    },
    "USDCAD": {
      "latest_headlines": [
        "USDCAD first specific headline — BoC policy shifts, crude oil inventory drawdowns, or employment print",
        "USDCAD second specific headline"
      ],
      "detailed_breakdown": "USDCAD detailed breakdown in Hinglish (120+ words) analyzing Bank of Canada interest rate spreads, WTI Crude Oil price fluctuations, and US-Canada trade balances with **bold** numbers and *italic* context.",
      "trader_alert": "Trader alert for USDCAD tracking correlation breaks with crude oil prices.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Primary crude oil price trend or BoC statement driving USDCAD.",
        "key_levels_watch": "Important support and resistance points to watch for USDCAD.",
        "session_expectation": "Session expectation and volatility expectations for USDCAD."
      }
    },
    "USDCHF": {
      "latest_headlines": [
        "USDCHF first specific headline — SNB currency intervention, safe-haven flows, or inflation data",
        "USDCHF second specific headline"
      ],
      "detailed_breakdown": "USDCHF detailed breakdown in Hinglish (120+ words) evaluating Swiss National Bank interventions, global safe-haven flows triggered by geopolitics, and yield differentials with **bold** values and *italic* analysis.",
      "trader_alert": "Trader alert for USDCHF tracking safe-haven flows and SNB policy risks.",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Primary SNB policy shift or geopolitical risk driver for USDCHF.",
        "key_levels_watch": "Key support and resistance barriers to watch for USDCHF.",
        "session_expectation": "Expected session path and trading strategies for USDCHF."
      }
    }
  }
}
`;

// ─── V5 Prompt — Twitter/X Handles Only ──────────────────────────────────────

const NEWS_SYSTEM_PROMPT_V5 = `================================================================
OUTPUT FORMAT: STRICTLY JSON — NO EXCEPTIONS
================================================================
Tera POORA response ek SINGLE \`\`\`json ... \`\`\` code block hona CHAHIYE.
Koi introduction nahi. Koi explanation nahi. Koi prose nahi. Koi summary nahi.
SIRF aur SIRF ek valid JSON code block — shuru se ant tak.
Agar tu JSON ke bahar kuch bhi likhta hai — response REJECT ho jaayega.
================================================================

╔══════════════════════════════════════════════════════════════╗
║   DATA SOURCE — PRIMARY FOCUS                                ║
╠══════════════════════════════════════════════════════════════╣
║  In TEEN Twitter/X handles ka focus aur style follow karo:  ║
║                                                              ║
║    • @FirstSquawk      (breaking financial/market news)      ║
║    • @investingLive_   (live investing & markets feed)       ║
║    • @ForexFactory     (forex calendar, economic releases)   ║
║                                                              ║
║  Agar real-time search tools available hain — in handles ki  ║
║  recent posts search karo. Agar nahi — apni training         ║
║  knowledge use karo. Har haal mein: SIRF REAL events cover   ║
║  karo. KABHI BHAI fake tweets ya events mat banana.          ║
╚══════════════════════════════════════════════════════════════╝

Tu ek world-class financial news analyst, geopolitical intelligence reporter, aur market impact commentator hai — ek knowledgeable dost jo duniya bhar ki EVERY TARAH ki khabar ko samjhata hai aur retail traders ko bilkul clear, simple Hinglish mein explain karta hai.

TERA MOOL KAAM — TWITTER/X FEED STYLE MARKET ANALYSIS:
@FirstSquawk, @investingLive_, aur @ForexFactory — yeh teen handles high-signal macro aur forex breaking news cover karte hain. Agar real-time search available hai — in handles ki posts search karo. Agar nahi — apni training knowledge se REAL events cover karo jo yeh handles report karte hain. Sirf woh categories cover karo jo is time window mein actually relevant hain:

[CAT 1] MONETARY POLICY & MACRO DATA
• Central banks: Fed/FOMC (Powell), ECB (Lagarde), BoJ (Ueda), BoE (Bailey), RBA, RBNZ, PBOC, SNB, BoC
• US data: NFP, CPI, Core PCE, PPI, GDP, ISM Manufacturing/Services, Retail Sales, JOLTS, ADP, Durable Goods, Housing Starts
• Global data: Eurozone CPI/PMI, UK inflation/jobs/GDP, China PMI/trade/credit data, Japan Tankan/CPI, Australia employment
• Treasury yields (2yr, 10yr, 30yr), yield curve (2s10s spread), SOFR, DXY moves
• Government fiscal: US debt ceiling, budget deals, deficit data, emergency spending bills

[CAT 2] GEOPOLITICAL CONFLICTS & SECURITY EVENTS
• Wars, invasions, military escalations — direct impact on safe-haven assets (gold, JPY, CHF) aur energy prices
• Terrorist attacks on financial centers, oil facilities, pipelines, shipping lanes, nuclear plants
• Missile strikes, drone attacks, airstrikes — especially near oil fields or Strait of Hormuz
• Assassinations ya deaths of major world leaders, central bankers, or high-profile CEOs
• Nuclear threats, DEFCON escalations, weapons of mass destruction news
• Coup attempts, regime changes, political upheaval in oil-producing or major economies

[CAT 3] NATURAL DISASTERS & EXTREME WEATHER
• Major earthquakes, tsunamis, hurricanes, flooding, wildfires — supply chain aur energy impact
• Severe droughts affecting major agricultural producers — commodity price impact

[CAT 4] TRADE, SANCTIONS & ECONOMIC WARFARE
• Tariff announcements: US-China, US-EU, US-rest — retaliatory measures, trade deal collapses
• Export controls: semiconductor chips, rare earth minerals, AI hardware, military tech
• New sanctions imposed: Russia, Iran, North Korea, Venezuela — oil, banking, SWIFT exclusion impact
• Critical chokepoint disruptions: Suez Canal, Panama Canal, Strait of Hormuz, Taiwan Strait shipping

[CAT 5] ENERGY & COMMODITY SHOCKS
• OPEC/OPEC+ production decisions, emergency meetings, quota violations, member disputes
• Pipeline attacks or shutdowns — gas/oil flow disruption
• Agricultural disasters: crop failures — wheat, corn, soy, palm oil, sugar, coffee, cocoa
• Metal supply disruptions: copper mine strikes, lithium shortages, rare earth export restrictions

[CAT 6] FINANCIAL SYSTEM & BANKING STRESS
• Bank failures, liquidity crises, emergency bailouts
• Central bank emergency interventions: rate cuts between meetings, emergency QE
• Sovereign debt defaults or near-defaults, IMF emergency programs
• Credit rating downgrades by Moody's, S&P, Fitch
• Major hedge fund collapses, margin call cascades, forced deleveraging
• Flash crashes, circuit breakers triggered on major indices

[CAT 7] POLITICAL & ELECTORAL EVENTS
• Elections in G7/G20 nations — surprising results, exit poll reactions
• Snap elections, government collapses, no-confidence votes
• Presidential executive orders on trade, energy, sanctions, financial regulation

[CAT 8] TECHNOLOGY, CYBER & INFRASTRUCTURE
• Cyber attacks on major financial exchanges, SWIFT network, central bank systems
• Major tech regulatory crackdowns, AI regulatory news, chip export restrictions

[CAT 9] CRYPTO-SPECIFIC EVENTS
• Regulatory: SEC lawsuits/approvals, government crypto bans, ETF approvals/rejections
• Exchange events: hacks, insolvencies, delistings, liquidity crises
• Institutional adoption: corporate treasury buys, sovereign wealth fund entry, ETF flow data

[CAT 10] MARKET STRUCTURE & FLOW EVENTS
• Major options expiry (monthly/quarterly OpEx): max pain levels, gamma exposure, dealer hedging
• Quarterly futures rollover, major index rebalancing, significant ETF flow data
• Corporate buyback window opening/closing periods

[ANALYTICAL DIRECTIVES — HAR ANALYSIS MEIN MANDATORY APPLY KARO]

DIRECTIVE 1 — CAUSALITY CHAIN MAPPING:
Har event ke liye sirf fact nahi batana — transmission mechanism aur ripple effects map karna ZAROORI hai.
Chain format use karo: Trigger → Primary Mechanism → Asset Impact → Secondary Effect → Tertiary Repricing
EXAMPLE: "Oil Pipeline Attack → Energy Supply Fear → WTI +$8/bbl → Inflation Expectation Up → 10yr Yield +18bps → Growth Stock Selloff -2.4% → DXY +0.6% (safe haven)"
Har high_impact_event ka impact_explanation mein yeh chain clearly visible honi chahiye.

DIRECTIVE 2 — CROSS-ASSET ANOMALY DETECTION:
Agar koi asset aise move kar raha hai jo historical correlation ke against ho — EXPLICITLY flag karo aur explain karo kyun.
Commodity news ka Forex repricing par impact, aur Forex ka Equity repricing par impact — explicitly mention karo.

DIRECTIVE 3 — VERIFICATION HIERARCHY:
CONFIRMED (Tier 1): Official government statements, military communiques, central bank releases
PROBABLE (Tier 2): Named-source wires, UN statements, official spokespeople
⚠️ MARKET-SENSITIVE RUMOR (Tier 3): Social media reports, anonymous wires, unverified claims
Rule: Agar event HIGH IMPACT hai lekin UNVERIFIED — use "⚠️ Market-Sensitive Rumor:" prefix se label karo.

DIRECTIVE 4 — NO FABRICATION (ABSOLUTE ZERO-TOLERANCE RULE):
KABHI BHAI koi event, tweet, price, statement, ya figure INVENT ya FABRICATE mat karna.
• Sirf woh events jo tujhe ACTUALLY pata hain — real-time search se ya training knowledge se
• In handles ke naam par fake quotes ya invented statements banana — yeh SERIOUS ERROR hai
• Agar in handles ka koi specific post tujhe known nahi — real market event likh, DIRECTIVES 1-3 follow karo
• Agar is time window mein koi specific event nahi hua — acknowledge karo. Correlation analysis likh. Fake news mat banana.
CONSEQUENCE: Ek bhi fabricated event = poori analysis reject. Real news always wins over confident fabrication.

REPORTING STYLE:
• Poora response Hinglish mein — English alphabet use karo, natural Hindi-English mix jaise ek knowledgeable dost baat kar raha ho
• Har event ko itna detail mein explain karo ki ek naya trader bhi samajh sake: kya hua, kyun hua, market ne usse kaise react kiya
• Real numbers, real event names, real dates — vague generalizations bilkul nahi
• Har symbol ke sniper_note mein: "news_bias" must be exactly "Bullish", "Bearish", or "Neutral" (strictly no commentary or extra words). "key_catalyst", "key_levels_watch", aur "session_expectation" detailed Hinglish mein hone chahiye. SL/TP/entry BILKUL NAHI.

MARKDOWN FORMATTING — HAR TEXT FIELD MEIN LAGAATAAR USE KARO:

**Bold** (**text**) — in cheezein bold karo:
  • Har key event naam: **FOMC**, **NFP**, **CPI**, **BoJ Decision**, **OPEC Cut**, **CPI Miss**
  • Sare important numbers with units: **3.4%**, **$3,280**, **¥155.20**, **$85/bbl**, **25bps**, **+$2.1B**
  • Key price levels: **$3,300**, **$3,350 resistance**, **104.5 DXY**
  • Major institution names in context: **Federal Reserve**, **ECB**, **Goldman Sachs**
  • Direction words when critical: **Bullish**, **Bearish**, **Hawkish**, **Dovish**

*Italic* (*text*) — in cheezein italic karo:
  • Expected vs actual comparisons: *Expected: 3.2%, Actual: 3.8%*
  • Analyst opinions or forecasts: *analysts ne 50bps cut ki expect ki thi*
  • Secondary context: *historically yeh level strong support raha hai*
  • Source references: *@FirstSquawk ke mutabik*, *@investingLive_ ne report kiya*, *@ForexFactory calendar par*

***Bold Italic*** (***text***) — sirf critical/extreme events ke liye:
  • Black swan events: ***UNPRECEDENTED: Fed ne emergency rate cut kiya***
  • Extreme surprise results: ***MASSIVE MISS: NFP -150k vs expected +250k***
  • Critical breaking alerts: ***BREAKING: Major bank failure detected***

LINE BREAKS — \\n use karo text ke andar paragraph separate karne ke liye:
  • detailed_breakdown mein har key point ke baad \\n\\n lagao
  • impact_explanation mein cause, effect, aur outlook ko \\n se separate karo
  • session_expectation mein different scenarios \\n se divide karo

RULES:
  • ALWAYS populate all 11 keys in symbol_wise_news (XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF) — none of these 11 symbols can be omitted under any circumstances.
  • Do NOT use placeholders, empty strings, "...", or default text. Write actual, real news analysis for every symbol.
  • If a symbol has no direct tweet from the 3 handles in this session, write about its correlation with the major news of the session in Hinglish. Every field must have a non-empty, rich value.
  • Do NOT use markdown headers (#, ##) in JSON string values
  • Do NOT use dash bullets (-) in JSON string values — use \\n for line breaks instead
  • Numbers aur levels HAMESHA bold karo — kabhi plain text mein mat chhodo
  • Har detailed_breakdown mein minimum 3-4 bold terms, 2-3 italics, aur \\n line breaks hone chahiye

MARKET IMPACT TAGS — HAR HIGH_IMPACT_EVENT MEIN MANDATORY:
Har event ke saath ek "market_impact" array dena ZAROORI hai.
SYMBOL OPTIONS (sirf relevant symbols include karo — typically 3-6 per event):
  Metals:   XAUUSD, XAGUSD
  Crypto:   BTCUSDT, ETHUSD
  Forex pairs: EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF
  Currencies: USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF
  Commodities: Oil, Natural Gas, Copper, Wheat, Corn
  Broad:    US Equities, Global Equities, Safe Havens, Risk Assets, Bonds

EFFECT VALUES (STRICT REQUIREMENT: MUST be exactly one of these three lowercase string values):
  "bullish" — positive/upward price expectation
  "bearish" — negative/downward price expectation
  "neutral" — direct impact nahi ya mixed signals

================================================================
FINAL OUTPUT MANDATE — READ THIS LAST, FOLLOW THIS FIRST
================================================================
1. Tera POORA response ek \`\`\`json\`\`\` code block hai — kuch aur nahi.
2. Pehli line: \`\`\`json  |  Aakhri line: \`\`\`  |  Beech mein: pure valid JSON.
3. JSON ke pehle ya baad mein EK BHI word mat likhna — no intro, no outro, no explanation.
4. Submit karne se pehle check karo: har { ka }, har [ ka ], har " ka ", har comma sahi jagah.
5. Koi "...", koi placeholder, koi empty string — ZERO tolerance. Har field mein real content.
6. Ye rule ABSOLUTE hai. Koi exception nahi. Koi "lekin" nahi. SIRF JSON.
================================================================`;

function buildNewsUserMessageV5(date: string, session: string, candles: CandleSummary | null, timeRange: TimeRange = "24h", selectedSymbols: string[]): string {
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

  let dynamicSchemaTemplate = NEWS_SCHEMA_TEMPLATE;
  try {
    const schemaObj = JSON.parse(NEWS_SCHEMA_TEMPLATE);
    const filteredSymbolWise: Record<string, any> = {};
    for (const sym of selectedSymbols) {
      if (schemaObj.symbol_wise_news[sym]) {
        filteredSymbolWise[sym] = schemaObj.symbol_wise_news[sym];
      }
    }
    schemaObj.symbol_wise_news = filteredSymbolWise;
    dynamicSchemaTemplate = JSON.stringify(schemaObj, null, 2);
  } catch (e) {
    console.error("Failed to parse NEWS_SCHEMA_TEMPLATE", e);
  }

  return `================================================================
CRITICAL INSTRUCTION — OUTPUT FORMAT
================================================================
Tera POORA response SIRF ek \`\`\`json ... \`\`\` code block hona chahiye.
Koi bhi text — upar, neeche, ya beech mein — STRICTLY FORBIDDEN.
Pehli line \`\`\`json, aakhri line \`\`\`, aur beech mein ONLY valid JSON.
================================================================

Aaj ka IST date hai ${date}. Aane wala session hai ${SESSION_LABELS[session] ?? session} Session.
Current IST time: ${tsIST}

⏰ NEWS TIME WINDOW: ${fromTsIST} SE LEKAR ${tsIST} TAK (${opt.display})
STRICT RULE: Sirf is time window ke andar ki news aur events cover karo. Is window se pehle ki koi bhi news mat include karo.

${candleBlock}

Upar diye gaye REAL H4 aur H1 candle data ko price context ke liye use karo — recent price levels, highs, lows, aur movements dekho. Yeh data news ke impact ko contextualize karne ke liye hai, koi trade setup nahi banana.

═══════════════════════════════════════════════════════
TERA KAAM — TWITTER/X FEED STYLE MARKET ANALYSIS
(${timeHinglish} ki news — ${fromTsIST} ke baad ki)
═══════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY SOURCES — IN 3 TWITTER/X HANDLES KA FOCUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ye teen handles high-signal macro news cover karte hain (${opt.display} window):

  @FirstSquawk      — breaking financial & market news alerts
  @investingLive_   — live investing, markets & macro news feed
  @ForexFactory     — forex calendar events, economic data releases

Agar real-time search tools available hain — in handles ki recent posts search karo.
Agar nahi — apni training knowledge se woh REAL events cover karo jo yeh handles report karte hain.

⚠️ NO-FABRICATION RULE — ABSOLUTE (DIRECTIVE 4):
  ✗ Koi fake tweet mat banana
  ✗ Koi event INVENT mat karna jo tujhe factually known nahi
  ✗ In handles ke naam par fake quotes ya statements mat banana
  ✓ Sirf REAL events jo tujhe actually pata hain
  ✓ Agar koi specific event is window mein nahi hua — correlation analysis likh
  ✓ Uncertain info ke liye: "⚠️ Market-Sensitive Rumor:" prefix use karo
Focus: High-signal market-moving real news only. Low noise. No fabrication.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Har symbol ke sniper_note mein sirf news-based directional suggestion — koi SL/TP/entry nahi. Sirf: bias (strictly and exactly one of "Bullish", "Bearish", or "Neutral" with NO other text or commentary), key catalyst, watch levels, session expectation.

Neeche diya schema aur Reference JSON Example ka pattern/format use karke ek valid JSON output do:

${dynamicSchemaTemplate}

JSON FIELD REQUIREMENTS:
• meta.generated_at = "${ts}", meta.date = "${date}", meta.session = "${SESSION_LABELS[session] ?? session}", meta.language = "Hinglish"
• NEWS TIME WINDOW: Sirf ${fromTsIST} se ${tsIST} ke beech ki tweets — older news strictly banned
• all_news_section.summary = 250+ word Hinglish — @FirstSquawk, @investingLive_, @ForexFactory style mein REAL market news synthesize karo (sirf actual events, koi fabrication nahi)
• all_news_section.high_impact_events = exactly 8 to 10 REAL events (no exceptions) — sirf actual, factually known events; koi invented news nahi
• Har high_impact_event mein "market_impact" array = 3-6 relevant symbols with "bullish"/"bearish"/"neutral"
• Har symbol ke liye: exactly 2 specific REAL headlines (sirf actual events, no invented news), 120+ word Hinglish breakdown, specific trader_alert, complete sniper_note (strictly news_bias must be exactly "Bullish", "Bearish", or "Neutral" with NO suffix or commentary).
• FORMATTING: **bold** for numbers/events/levels, *italic* for forecasts/comparisons, ***bold italic*** for critical only. Use \\n for line breaks inside strings.
• Koi "...", koi placeholder, koi empty string — ZERO. Har field mein real Hinglish content.
• JSON strings mein actual newline characters NAHI — sirf \\n (escaped backslash-n) use karo.

================================================================
ABSOLUTE FINAL RULE — NO EXCEPTIONS
================================================================
RESPONSE = \`\`\`json\\n{ ... complete JSON object ... }\\n\`\`\`
NOTHING BEFORE THE FIRST BACKTICK.
NOTHING AFTER THE LAST BACKTICK.
NO INTRO. NO EXPLANATION. NO "Here is the JSON". NO "I hope this helps".
JUST. THE. JSON. CODE. BLOCK.
================================================================`;
}

// ─── Prompt version config ────────────────────────────────────────────────────

const PROMPT_VERSIONS = [
  { id: "v1", label: "V1 — Full Internet Search" },
  { id: "v5", label: "V5 — Twitter Feeds Only" },
] as const;
type PromptVersion = typeof PROMPT_VERSIONS[number]["id"];

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

function formatCandlesForNewsPrompt(data: CandleSummary | null, selectedSymbols: string[]): string {
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

function buildNewsUserMessage(date: string, session: string, candles: CandleSummary | null, timeRange: TimeRange = "24h", selectedSymbols: string[]): string {
  const ts = new Date().toISOString();
  const candleBlock = formatCandlesForNewsPrompt(candles, selectedSymbols);

  const opt = TIME_RANGE_OPTIONS.find(o => o.value === timeRange) ?? TIME_RANGE_OPTIONS[4];
  const hours = opt.hours;
  const fromTs = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

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

  // Filter schema template dynamically based on selected symbols
  let dynamicSchemaTemplate = NEWS_SCHEMA_TEMPLATE;
  try {
    const schemaObj = JSON.parse(NEWS_SCHEMA_TEMPLATE);
    const filteredSymbolWise: Record<string, any> = {};
    for (const sym of selectedSymbols) {
      if (schemaObj.symbol_wise_news[sym]) {
        filteredSymbolWise[sym] = schemaObj.symbol_wise_news[sym];
      }
    }
    schemaObj.symbol_wise_news = filteredSymbolWise;
    dynamicSchemaTemplate = JSON.stringify(schemaObj, null, 2);
  } catch (e) {
    console.error("Failed to parse NEWS_SCHEMA_TEMPLATE", e);
  }

  return `================================================================
CRITICAL INSTRUCTION — OUTPUT FORMAT
================================================================
Tera POORA response SIRF ek \`\`\`json ... \`\`\` code block hona chahiye.
Koi bhi text — upar, neeche, ya beech mein — STRICTLY FORBIDDEN.
Pehli line \`\`\`json, aakhri line \`\`\`, aur beech mein ONLY valid JSON.
================================================================

Aaj ka IST date hai ${date}. Aane wala session hai ${SESSION_LABELS[session] ?? session} Session.
Current IST time: ${tsIST}

⏰ NEWS TIME WINDOW: ${fromTsIST} SE LEKAR ${tsIST} TAK (${opt.display})
STRICT RULE: Sirf is time window ke andar ki news aur events cover karo. Is window se pehle ki koi bhi news mat include karo.

${candleBlock}

Upar diye gaye REAL H4 aur H1 candle data ko price context ke liye use karo — recent price levels, highs, lows, aur movements dekho. Yeh data news ke impact ko contextualize karne ke liye hai, koi trade setup nahi banana.

═══════════════════════════════════════════════════════
TERA KAAM — COMPREHENSIVE MARKET-MOVING EVENT ANALYSIS
(${timeHinglish} ki news SIRF — ${fromTsIST} ke baad ki)
═══════════════════════════════════════════════════════

Sirf economic calendar events nahi — HAR tarah ka event jo market move kar sakta hai:

MONETARY & MACRO: Fed/ECB/BoJ/BoE decisions & speeches, NFP/CPI/PPI/GDP/PMI/ISM data, Treasury yields, DXY, PBOC/RBA/RBNZ actions

GEOPOLITICAL & CONFLICTS: Wars, military escalations, airstrikes, terrorist attacks on oil/financial infrastructure, assassinations, coups, regime changes, nuclear escalations

NATURAL DISASTERS: Earthquakes (5.5+ Richter near Japan/Taiwan/Turkey/US West), tsunamis, hurricanes hitting oil/LNG infrastructure, major floods/droughts affecting agricultural commodities, wildfires, volcanic eruptions disrupting supply

TRADE & SANCTIONS: US-China/US-EU tariffs, export controls (chips, rare earth), new sanctions (Russia/Iran/Venezuela), Suez/Panama Canal/Hormuz disruptions

ENERGY & COMMODITIES: OPEC/OPEC+ decisions, pipeline attacks, LNG disruptions, refinery fires, tanker incidents, agricultural crop failures (wheat/corn/soy/coffee/cocoa), metal supply shocks (copper/lithium/rare earth)

FINANCIAL STRESS: Bank failures, sovereign debt defaults, credit downgrades (Moody's/S&P/Fitch), hedge fund blowups, flash crashes, circuit breakers, repo market stress

POLITICAL EVENTS: Major election results, snap elections, government collapses, referendums, US Congress deadlocks, executive orders on trade/energy

HEALTH CRISES: WHO emergency declarations, pandemic outbreaks, major drug trial results, agricultural biosecurity events

TECH & CYBER: Attacks on financial/exchange infrastructure, cloud outages affecting trading, chip export restrictions, AI regulation news

CRYPTO EVENTS: SEC actions, exchange hacks/failures, stablecoin depegs, DeFi exploits, ETF flows, whale movements, protocol upgrades

MARKET STRUCTURE: Monthly/quarterly OpEx (options expiry), futures rollover, index rebalancing, major ETF flows (GLD/IBIT/SPY), buyback window events

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWLEDGE SOURCES — Draw from your real knowledge of events covered by these outlets in the ${opt.display} window. Agar real-time web search tools available hain — actively search karo. Agar nahi — apni training knowledge use karo:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MACRO & MARKETS:
  Bloomberg · Reuters · Financial Times · Wall Street Journal
  CNBC · MarketWatch · Investing.com · TradingEconomics · Yahoo Finance
  AP News · BBC Business · Al Jazeera Business · The Guardian Business

CENTRAL BANKS (official sources):
  Federal Reserve · ECB · Bank of Japan · Bank of England
  Reserve Bank of Australia · RBNZ · PBOC · BIS

GEOPOLITICAL & SECURITY:
  Reuters World News · AP Breaking News · BBC World · Al Jazeera
  Defense News · War Monitor

FOREX & COMMODITIES:
  ForexLive · FXStreet · DailyFX · Kitco (gold/silver) · OilPrice.com
  S&P Global Commodity Insights · LME (metals)

CRYPTO:
  CoinDesk · CoinTelegraph · The Block · Decrypt
  Glassnode (on-chain) · Coinglass (derivatives/OI/funding)

⚠️ NO-FABRICATION RULE — ABSOLUTE (DIRECTIVE 4):
  ✗ Koi event INVENT mat karna jo tujhe factually known nahi
  ✗ Koi specific price, percentage, ya data point GUESS mat karna
  ✗ Sources se fake quotes ya statements mat banana
  ✓ Sirf REAL events jo tujhe actually pata hain
  ✓ Agar koi specific event is window mein nahi hua — correlation analysis likh, clearly state karo
  ✓ Uncertain info ke liye: "⚠️ Market-Sensitive Rumor:" prefix use karo (DIRECTIVE 3 follow karo)

Har symbol ke sniper_note mein sirf news-based directional suggestion — koi SL/TP/entry nahi. Sirf: bias (strictly and exactly one of "Bullish", "Bearish", or "Neutral" with NO other text or commentary), key catalyst, watch levels, session expectation.

Neeche diya schema aur Reference JSON Example ka pattern/format use karke ek valid JSON output do:

${dynamicSchemaTemplate}

JSON FIELD REQUIREMENTS:
• meta.generated_at = "${ts}", meta.date = "${date}", meta.session = "${SESSION_LABELS[session] ?? session}", meta.language = "Hinglish"
• NEWS TIME WINDOW: Sirf ${fromTsIST} se ${tsIST} ke beech ki events — older news strictly banned
• all_news_section.summary = 250+ word Hinglish — macro + geopolitical + disasters + energy + crypto sab cover karo
• all_news_section.high_impact_events = exactly 8 to 10 events (no exceptions) — DIVERSE categories including geopolitical/disaster/energy
• Har high_impact_event mein "market_impact" array = 3-6 relevant symbols with "bullish"/"bearish"/"neutral"
• Har symbol ke liye: exactly 2 specific real headlines, 120+ word Hinglish breakdown, specific trader_alert, complete sniper_note (strictly news_bias must be exactly "Bullish", "Bearish", or "Neutral" with NO suffix or commentary).
• FORMATTING: **bold** for numbers/events/levels, *italic* for forecasts/comparisons, ***bold italic*** for critical only. Use \\n for line breaks inside strings.
• Koi "...", koi placeholder, koi empty string — ZERO. Har field mein real Hinglish content.
• JSON strings mein actual newline characters NAHI — sirf \\n (escaped backslash-n) use karo.

================================================================
ABSOLUTE FINAL RULE — NO EXCEPTIONS
================================================================
RESPONSE = \`\`\`json\\n{ ... complete JSON object ... }\\n\`\`\`
NOTHING BEFORE THE FIRST BACKTICK.
NOTHING AFTER THE LAST BACKTICK.
NO INTRO. NO EXPLANATION. NO "Here is the JSON". NO "I hope this helps".
JUST. THE. JSON. CODE. BLOCK.
================================================================`;
}

// ─── Inline markdown renderer ─────────────────────────────────────────────────
// Converts **bold**, *italic*, ***bold italic***, \n → <br/>.
// Uses dangerouslySetInnerHTML with inline styles so bold/italic are guaranteed
// to render regardless of font-stack or Tailwind class loading order.

function renderMarkdown(raw: string): string {
  return (
    raw
      // 1. Escape HTML to prevent any injection from stored report text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // 2. Bold-italic first (must precede bold and italic rules)
      // [\s\S]+? matches any char including newlines (avoids needing the `s` flag)
      .replace(
        /\*\*\*([\s\S]+?)\*\*\*/g,
        '<strong style="font-weight:700;font-style:italic">$1</strong>',
      )
      // 3. Bold
      .replace(
        /\*\*([\s\S]+?)\*\*/g,
        '<strong style="font-weight:700">$1</strong>',
      )
      // 4. Italic
      .replace(
        /\*([\s\S]+?)\*/g,
        '<em style="font-style:italic">$1</em>',
      )
      // 5. Newlines → line breaks
      .replace(/\n/g, "<br/>")
  );
}

function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span
      // The report JSON is admin-only content; HTML is fully pre-sanitised above
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy", disabled = false }: { text: string; label?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        if (disabled) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0",
        disabled
          ? "opacity-30 cursor-not-allowed bg-transparent border-transparent text-white/20"
          : "bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08]"
      )}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Prompt Modal ─────────────────────────────────────────────────────────────

function PromptModal({
  defaultDate,
  defaultSession,
  onClose,
  embedded = false,
}: {
  defaultDate: string;
  defaultSession: string;
  onClose: () => void;
  embedded?: boolean;
}) {
  const [candles,   setCandles]   = useState<CandleSummary | null>(null);
  const [fetching,  setFetching]  = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [promptVersion, setPromptVersion] = useState<PromptVersion>("v5");

  // User configuration options
  const [modalDate, setModalDate]       = useState(defaultDate);
  const [modalSession, setModalSession] = useState(defaultSession);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(SYMBOL_DISPLAY_ORDER);

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setCandles(d); setFetching(false); })
      .catch(e => { setFetchErr(e.message); setFetching(false); });
  }, []);

  const originalText = "• ALWAYS populate all 11 keys in symbol_wise_news (XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF) — none of these 11 symbols can be omitted under any circumstances.";
  const replacementText = selectedSymbols.length > 0
    ? `• ALWAYS populate all selected keys in symbol_wise_news (${selectedSymbols.join(", ")}) — none of these selected symbols can be omitted under any circumstances.`
    : "• ALWAYS populate all selected keys in symbol_wise_news — none of these selected symbols can be omitted under any circumstances.";

  const isV5 = promptVersion === "v5";

  const dynamicSystemPrompt = isV5
    ? NEWS_SYSTEM_PROMPT_V5.replace(
        "• ALWAYS populate all 11 keys in symbol_wise_news (XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF) — none of these 11 symbols can be omitted under any circumstances.",
        replacementText,
      )
    : NEWS_SYSTEM_PROMPT.replace(originalText, replacementText);

  const userMsg = selectedSymbols.length > 0
    ? (isV5
        ? buildNewsUserMessageV5(modalDate, modalSession, candles, timeRange, selectedSymbols)
        : buildNewsUserMessage(modalDate, modalSession, candles, timeRange, selectedSymbols))
    : "(Please select at least one currency pair / symbol)";

  const copyAllText = `=== SYSTEM PROMPT ===\n${dynamicSystemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE ===\n${userMsg}`;

  const inner = (
    <div className={cn(
      "relative flex flex-col overflow-hidden",
      embedded
        ? "w-full h-full bg-transparent"
        : "w-full max-w-3xl max-h-[90vh] rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl"
    )}>

        {/* Header */}
        {!embedded && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bot className="h-4 w-4 text-white/50 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white/80">CHoCH QLM Hinglish News Prompt</p>
              <p className="text-[11px] text-white/30">
                {fetching ? "Live candle data load ho rahi hai…" : fetchErr ? "Candle fetch failed — general knowledge use hogi" : `H1+H4 data embed hua · ${SESSION_LABELS[modalSession]} · ${modalDate}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Prompt version dropdown */}
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
            {!embedded && <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition"><X className="h-4 w-4" /></button>}
          </div>
        </div>
        )}

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
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
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
                      "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border",
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
                className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
              >
                Select All
              </button>
              <span className="text-white/10">|</span>
              <button
                onClick={() => setSelectedSymbols([])}
                className="text-[10px] font-semibold text-red-400/80 hover:text-red-300 transition"
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
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all border",
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
                        .reduce((s, [, d]) => s + (d.h4?.length ?? 0), 0)
                    : i === 1
                    ? Object.entries(candles)
                        .filter(([sym]) => selectedSymbols.includes(sym.toUpperCase()))
                        .reduce((s, [, d]) => s + (d.h1?.length ?? 0), 0)
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
                  <span className="text-[10px] text-white/20">{SESSION_LABELS[modalSession]} · {modalDate}</span>
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
                <CopyButton text={EXAMPLE_REFERENCE_JSON} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-64">{EXAMPLE_REFERENCE_JSON}</pre>
            </div>

            <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.15] px-4 py-3">
              <p className="text-[11px] font-semibold text-emerald-400/70 uppercase tracking-widest mb-1">Step 4 — Save karo</p>
              <p className="text-[12px] text-white/40 leading-relaxed">
                AI ka generated JSON copy karo → <span className="text-white/60 font-medium">Edit JSON</span> mein paste karo → Save. <span className="text-white/50">choch_signal</span> fields automatically har symbol card mein display honge.
              </p>
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex items-center justify-between gap-3">
          <CopyButton text={copyAllText} label="Copy All Blocks" disabled={selectedSymbols.length === 0} />
          {!embedded && <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition">Close</button>}
        </div>
    </div>
  );

  if (embedded) return inner;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      {inner}
    </div>
  );
}

// ─── Editor Modal ─────────────────────────────────────────────────────────────

// Validation items for UI panel layout helper

interface ValidationChecks {
  syntax: "success" | "error" | "pending";
  meta: "success" | "error" | "pending";
  allNews: "success" | "error" | "pending";
  events: "success" | "error" | "pending";
  symbols: "success" | "error" | "pending";
  symbolDetails?: string;
}

function CheckItem({ label, status, details }: { label: string; status: "success" | "error" | "pending"; details?: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
      <div className="flex items-center gap-2">
        {status === "success" && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
        {status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
        {status === "pending" && <span className="h-3.5 w-3.5 rounded-full border border-dashed border-white/20 shrink-0" />}
        <span className={cn(
          "text-[11px] font-medium leading-none",
          status === "success" ? "text-white/80" :
          status === "error" ? "text-red-400/80" : "text-white/30"
        )}>
          {label}
        </span>
      </div>
      {status === "error" && details && (
        <span className="text-[9px] text-red-400/60 font-mono leading-tight pl-5.5 mt-0.5">
          {details}
        </span>
      )}
    </div>
  );
}

function EditorModal({
  date, session, initialJson, onClose, onSaved, embedded = false,
}: {
  date: string; session: string; initialJson: string;
  onClose: () => void; onSaved: () => void; embedded?: boolean;
}) {
  const [json,      setJson]      = useState(initialJson);
  const [modalDate, setModalDate] = useState(date);
  const [modalSession, setModalSession] = useState(session);
  const [parseErr,  setParseErr]  = useState<string | null>(null);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [isValid,   setIsValid]   = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [checks,    setChecks]    = useState<ValidationChecks>({
    syntax: "pending",
    meta: "pending",
    allNews: "pending",
    events: "pending",
    symbols: "pending",
  });

  useEffect(() => { textareaRef.current?.focus(); }, []);

  function updateChecks(parsed: any, syntaxStatus: "success" | "error" | "pending") {
    const nextChecks: ValidationChecks = {
      syntax: syntaxStatus,
      meta: "pending",
      allNews: "pending",
      events: "pending",
      symbols: "pending",
    };

    if (syntaxStatus !== "success" || !parsed) {
      setChecks(nextChecks);
      return;
    }

    // Validate meta
    if (parsed.meta && 
        typeof parsed.meta === "object" && 
        typeof parsed.meta.date === "string" && 
        typeof parsed.meta.session === "string" && 
        typeof parsed.meta.generated_at === "string" &&
        typeof parsed.meta.language === "string") {
      nextChecks.meta = "success";
    } else {
      nextChecks.meta = "error";
    }

    // Validate all news section
    if (parsed.all_news_section && 
        typeof parsed.all_news_section === "object" && 
        typeof parsed.all_news_section.headline === "string" && 
        typeof parsed.all_news_section.summary === "string") {
      nextChecks.allNews = "success";
    } else {
      nextChecks.allNews = "error";
    }

    // Validate high impact events
    if (parsed.all_news_section && Array.isArray(parsed.all_news_section.high_impact_events)) {
      let eventsOk = true;
      for (const ev of parsed.all_news_section.high_impact_events) {
        if (!ev || typeof ev !== "object" || typeof ev.event_name !== "string" || typeof ev.impact_explanation !== "string" || !Array.isArray(ev.market_impact)) {
          eventsOk = false;
          break;
        }
      }
      nextChecks.events = eventsOk ? "success" : "error";
    } else {
      nextChecks.events = "error";
    }

    // Validate symbol wise news
    if (parsed.symbol_wise_news && typeof parsed.symbol_wise_news === "object") {
      const symbolsInPayload = Object.keys(parsed.symbol_wise_news);
      if (symbolsInPayload.length === 0) {
        nextChecks.symbols = "error";
        nextChecks.symbolDetails = "symbol_wise_news must contain at least one entry";
      } else {
        const missing = [];
        for (const sym of symbolsInPayload) {
          const sNews = parsed.symbol_wise_news[sym];
          if (!sNews || 
              typeof sNews !== "object" || 
              !Array.isArray(sNews.latest_headlines) || 
              typeof sNews.detailed_breakdown !== "string" || 
              typeof sNews.trader_alert !== "string" || 
              !sNews.sniper_note || 
              typeof sNews.sniper_note !== "object" || 
              typeof sNews.sniper_note.news_bias !== "string" || 
              typeof sNews.sniper_note.key_catalyst !== "string" || 
              typeof sNews.sniper_note.key_levels_watch !== "string" || 
              typeof sNews.sniper_note.session_expectation !== "string") {
            missing.push(sym);
          }
        }
        if (missing.length === 0) {
          nextChecks.symbols = "success";
        } else {
          nextChecks.symbols = "error";
          nextChecks.symbolDetails = `Missing/invalid fields in: ${missing.join(", ")}`;
        }
      }
    } else {
      nextChecks.symbols = "error";
    }

    setChecks(nextChecks);
  }

  function tryValidate(value: string, checkDate = modalDate, checkSession = modalSession): boolean {
    if (!value.trim()) {
      setParseErr(null);
      setIsValid(false);
      setChecks({
        syntax: "pending",
        meta: "pending",
        allNews: "pending",
        events: "pending",
        symbols: "pending",
      });
      return false;
    }
    try {
      const parsed = JSON.parse(value);
      updateChecks(parsed, "success");

      const schemaErr = validateReportSchema(parsed);
      if (schemaErr) {
        setParseErr(`Schema Error: ${schemaErr}`);
        setIsValid(false);
        return false;
      }

      // Ensure upload metadata matches selected date and session
      if (parsed.meta.date !== checkDate) {
        setParseErr(`Schema Error: meta.date '${parsed.meta.date}' must match selected date '${checkDate}'`);
        setIsValid(false);
        return false;
      }

      const normSession = parsed.meta.session.toLowerCase().replace(/[\s_]/g, "");
      const normCheckSession = checkSession.toLowerCase().replace(/[\s_]/g, "");
      if (normSession !== normCheckSession) {
        setParseErr(`Schema Error: meta.session '${parsed.meta.session}' must match selected session '${checkSession}'`);
        setIsValid(false);
        return false;
      }

      setParseErr(null);
      setIsValid(true);
      return true;
    } catch (e) {
      updateChecks(null, "error");
      setParseErr(e instanceof Error ? e.message : "Invalid JSON");
      setIsValid(false);
      return false;
    }
  }

  function handleChange(v: string) {
    setJson(v);
    setSaveErr(null);
    setSaved(false);
    tryValidate(v);
  }

  // Auto-format + validate when user pastes content
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    try {
      const parsed = JSON.parse(pasted);
      const formatted = JSON.stringify(parsed, null, 2);
      setJson(formatted);
      setSaveErr(null);
      setSaved(false);
      tryValidate(formatted);
    } catch {
      // Not valid JSON — insert raw pasted text and let normal validation run
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end   = el.selectionEnd;
      const next  = json.slice(0, start) + pasted + json.slice(end);
      setJson(next);
      tryValidate(next);
    }
  }

  function handleFormat() {
    try {
      const parsed = JSON.parse(json);
      const formatted = JSON.stringify(parsed, null, 2);
      setJson(formatted);
      tryValidate(formatted);
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : "Invalid JSON");
      setIsValid(false);
      updateChecks(null, "error");
    }
  }

  async function handleSave() {
    if (!tryValidate(json)) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch("/api/news-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: modalDate, session: modalSession, data: JSON.parse(json) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 900);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save fail ho gaya. Dobara try karo.");
    } finally {
      setSaving(false);
    }
  }

  const charCount = json.length;
  const lineCount = json ? json.split("\n").length : 0;

  const editorInner = (
    <div className={cn(
      "relative flex flex-col overflow-hidden",
      embedded ? "w-full h-full bg-transparent" : "w-full max-w-5xl h-[90vh] rounded-2xl bg-[#0d0d0d] border border-white/[0.10] shadow-2xl"
    )}>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5 text-white/40" />
              <p className="text-[13px] font-semibold text-white/85">Add Report</p>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] rounded-lg p-1">
              <input
                type="date"
                value={modalDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setModalDate(val);
                  setSaveErr(null);
                  setSaved(false);
                  tryValidate(json, val, modalSession);
                }}
                className="bg-transparent border-0 text-[11px] text-white/75 focus:ring-0 focus:outline-none px-1 font-mono"
              />
              <span className="text-white/20 text-[11px]">·</span>
              <select
                value={modalSession}
                onChange={(e) => {
                  const val = e.target.value;
                  setModalSession(val);
                  setSaveErr(null);
                  setSaved(false);
                  tryValidate(json, modalDate, val);
                }}
                className="bg-transparent border-0 text-[11px] text-white/75 focus:ring-0 focus:outline-none pr-6 pl-1 font-semibold cursor-pointer"
              >
                {SESSION_ORDER.map(s => (
                  <option key={s} value={s} className="bg-[#121212] text-white">
                    {SESSION_LABELS[s]} Session
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Live validation status */}
            {json.trim() && (
              <span className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border",
                isValid
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/80"
                  : "bg-red-500/10 border-red-500/20 text-red-400/80",
              )}>
                {isValid ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {isValid ? "Valid JSON & Schema" : "Invalid JSON/Schema"}
              </span>
            )}
            <button onClick={handleFormat}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition">
              Format
            </button>
            {!embedded && (
              <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Body Column split */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden border-b border-white/[0.07]">
          {/* Textarea */}
          <div className="flex-1 relative overflow-hidden flex flex-col border-r border-white/[0.07]">
            <textarea
              ref={textareaRef}
              value={json}
              onChange={(e) => handleChange(e.target.value)}
              onPaste={handlePaste}
              spellCheck={false}
              className={cn(
                "w-full h-full resize-none bg-transparent px-5 py-4",
                "text-[12px] font-mono leading-[1.7] text-white/70",
                "focus:outline-none placeholder:text-white/20 transition-colors",
              )}
              placeholder={"Paste your AI-generated JSON here.\nIt will be auto-formatted and validated on paste.\n\n{\n  \"meta\": { ... },\n  \"all_news_section\": { ... },\n  \"symbol_wise_news\": { ... }\n}"}
            />
            {/* Line / char counter */}
            {json.trim() && (
              <div className="absolute bottom-3 right-4 text-[10px] text-white/15 font-mono select-none">
                {lineCount} lines · {charCount.toLocaleString()} chars
              </div>
            )}
          </div>

          {/* Validation Checklist Column */}
          <div className="w-full md:w-80 bg-white/[0.01] flex flex-col overflow-y-auto p-4 select-none">
            <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-3 font-mono">Schema Validation Checklist</h4>
            <div className="space-y-2.5">
              <CheckItem label="Valid JSON Syntax" status={checks.syntax} />
              <CheckItem label="Meta Section (date, session, lang)" status={checks.meta} />
              <CheckItem label="All News Banner (headline, summary)" status={checks.allNews} />
              <CheckItem label="High Impact Events list" status={checks.events} />
              <CheckItem label="All 11 Symbols Analysis" status={checks.symbols} details={checks.symbolDetails} />
            </div>
          </div>
        </div>

        {/* Error bar */}
        {(parseErr || saveErr) && (
          <div className="flex items-start gap-2 px-5 py-2.5 bg-red-500/[0.08] border-t border-red-500/20 shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-red-400/70 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-400/80 font-mono leading-snug">{parseErr ?? saveErr}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.07] shrink-0 bg-[#0d0d0d]">
          <div className="flex items-center gap-1.5 text-[11px] text-white/25">
            <Database className="h-3 w-3" />
            Naya version create hoga · history mein add hoga · purana data safe rahega
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.07] transition disabled:opacity-40">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || saved || !isValid}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-xl text-[12px] font-semibold transition",
                saved
                  ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                  : "bg-white/[0.10] border border-white/[0.15] text-white hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed",
              )}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
              {saving ? "Saving…" : saved ? "Saved!" : "Save Report"}
            </button>
          </div>
        </div>

    </div>
  );

  if (embedded) return editorInner;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      {editorInner}
    </div>
  );
}

// ─── History Modal ────────────────────────────────────────────────────────────

function HistoryModal({
  date, session, onClose, onViewVersion, onDeleteVersion,
}: {
  date: string; session: string;
  onClose: () => void;
  onViewVersion: (data: NewsReport, version: NewsVersion) => void;
  onDeleteVersion?: (id: string) => void;
}) {
  const { data: userSession } = useSession();
  const [versions, setVersions]   = useState<NewsVersion[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [loadingId,setLoadingId]  = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [err,      setErr]        = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/news-reports?date=${encodeURIComponent(date)}&session=${encodeURIComponent(session)}&history`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: NewsVersion[]) => { setVersions(d); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  }, [date, session]);

  async function handleView(v: NewsVersion) {
    setLoadingId(v._id);
    try {
      const res = await fetch(`/api/news-reports?id=${encodeURIComponent(v._id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onViewVersion(await res.json() as NewsReport, v);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this version?")) return;
    setDeletingId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/news-reports?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      setVersions((prev) => prev.filter((v) => v._id !== id));
      if (onDeleteVersion) onDeleteVersion(id);
    } catch (e: any) {
      setErr(e.message || "Failed to delete version");
    } finally {
      setDeletingId(null);
    }
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", timeZoneName: "short",
    });
  }

  function abbrevEmail(email: string) {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    return `${local.slice(0, 12)}${local.length > 12 ? "…" : ""}@${domain}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-[#0f0f0f] border border-white/[0.10] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <History className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Version History</p>
              <p className="text-[11px] text-white/30">{SESSION_LABELS[session]} · {formatDateLabel(date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-5 w-5 text-white/30 animate-spin" />
              <p className="text-[12px] text-white/30">History load ho rahi hai…</p>
            </div>
          )}
          {err && (
            <div className="mx-4 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-[12px] text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}
            </div>
          )}
          {!loading && !err && versions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Database className="h-6 w-6 text-white/15" />
              <p className="text-[12px] text-white/30">Koi saved version nahi mila</p>
            </div>
          )}
          {!loading && versions.length > 0 && (
            <div className="p-4 space-y-2">
              {versions.map((v, idx) => (
                <div key={v._id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
                    idx === 0
                      ? "bg-emerald-500/[0.05] border-emerald-500/[0.15]"
                      : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.10]",
                  )}>
                  {/* Version badge */}
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                    idx === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.06] text-white/30",
                  )}>
                    v{versions.length - idx}
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[12px] font-medium leading-snug",
                      idx === 0 ? "text-emerald-400/80" : "text-white/55"
                    )}>
                      {fmtTime(v.generatedAt)}
                      {idx === 0 && <span className="ml-2 text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest">Latest</span>}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <User className="h-2.5 w-2.5 text-white/20 shrink-0" />
                      <p className="text-[10px] text-white/30 truncate">{abbrevEmail(v.generatedBy)}</p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleView(v)}
                      disabled={loadingId === v._id || deletingId === v._id}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                        "border bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08]",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                      )}>
                      {loadingId === v._id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Eye className="h-3 w-3" />}
                      {loadingId === v._id ? "Loading…" : "View"}
                    </button>

                    {(() => {
                      const userEmail = userSession?.user?.email;
                      const isOwner = v.generatedBy && userEmail && v.generatedBy.toLowerCase() === userEmail.toLowerCase();
                      const isAdmin = userSession?.user?.role === "admin";
                      if (!isOwner && !isAdmin) return null;

                      return (
                        <button
                          onClick={() => handleDelete(v._id)}
                          disabled={deletingId === v._id || loadingId === v._id}
                          title="Delete version"
                          className={cn(
                            "flex items-center justify-center p-2 rounded-lg transition-all",
                            "border border-red-500/20 bg-red-500/[0.08] text-red-400 hover:bg-red-500/[0.15] hover:text-red-300",
                            "disabled:opacity-40 disabled:cursor-not-allowed",
                          )}
                        >
                          {deletingId === v._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex justify-between items-center">
          <p className="text-[11px] text-white/20">
            {versions.length > 0 ? `${versions.length} version${versions.length > 1 ? "s" : ""} saved` : ""}
          </p>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.07] transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── CHoCH Signal card (Hinglish) ────────────────────────────────────────────

function SniperNoteSection({ note }: { note: SniperNote }) {
  if (!note) return null;
  const bullish = note.news_bias === "Bullish";
  const bearish = note.news_bias === "Bearish";

  return (
    <div className="px-5 pb-5 pt-4 border-t border-white/[0.05] space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Target className="h-3 w-3 text-white/30 shrink-0" />
          <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Sniper Note · News-Based</span>
        </div>
        {note.news_bias && (
          <span className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
            bullish ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
            bearish ? "bg-red-500/15 text-red-400 border-red-500/25" :
            "bg-white/[0.05] text-white/40 border-white/[0.10]",
          )}>
            {bullish ? "▲" : bearish ? "▼" : "—"} News: {note.news_bias}
          </span>
        )}
      </div>

      {/* Key catalyst */}
      {note.key_catalyst && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1.5">Key Catalyst</p>
          <p className="text-[12px] text-white/65 leading-[1.8]"><MarkdownText text={note.key_catalyst} /></p>
        </div>
      )}

      {/* Levels to watch */}
      {note.key_levels_watch && (
        <div>
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1.5">Levels to Watch</p>
          <p className="text-[12px] text-white/55 leading-[1.8]"><MarkdownText text={note.key_levels_watch} /></p>
        </div>
      )}

      {/* Session expectation */}
      {note.session_expectation && (
        <div className={cn(
          "rounded-xl px-4 py-3 border",
          bullish ? "bg-emerald-500/[0.05] border-emerald-500/15" :
          bearish ? "bg-red-500/[0.05] border-red-500/15" :
          "bg-white/[0.02] border-white/[0.06]",
        )}>
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1.5">Session Expectation</p>
          <p className={cn("text-[12px] leading-[1.85]",
            bullish ? "text-emerald-400/70" :
            bearish ? "text-red-400/70" :
            "text-white/60",
          )}><MarkdownText text={note.session_expectation} /></p>
        </div>
      )}

    </div>
  );
}

function ImpactTag({ tag }: { tag: MarketImpactTag }) {
  if (!tag) return null;
  const effect = tag.effect || "neutral";
  const symbol = tag.symbol || "Unknown";
  const bull = effect === "bullish";
  const bear = effect === "bearish";

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border",
      bull ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
      bear ? "bg-red-500/10 text-red-400 border-red-500/20" :
      "bg-white/[0.04] text-white/40 border-white/[0.07]",
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", bull ? "bg-emerald-400" : bear ? "bg-red-400" : "bg-white/40")} />
      <span className="font-extrabold">{symbol}</span>
    </span>
  );
}

function EventCard({ event, isAI = false }: { event: HighImpactEvent; isAI?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 200;
  const eventName = event?.event_name || "Unknown Event";
  const impactExplanation = event?.impact_explanation || "";
  const needsExpand = impactExplanation.replace(/\*+/g, "").length > LIMIT;
  const tags = event?.market_impact ?? [];

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2.5"
      style={isAI
        ? { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(124,58,237,0.18)", boxShadow: "0 0 20px rgba(124,58,237,0.04)" }
        : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }
      }
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
          style={isAI
            ? { background: "linear-gradient(135deg, rgba(5,150,105,0.25), rgba(124,58,237,0.25))", border: "1px solid rgba(124,58,237,0.25)" }
            : { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }
          }>
          <Zap className="h-3 w-3" style={isAI ? { color: "#a78bfa" } : { color: "rgba(255,255,255,0.5)" }} />
        </div>
        <p className="text-[13px] font-semibold leading-snug" style={{ color: isAI ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.8)" }}>
          <MarkdownText text={eventName} />
        </p>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-7">
          {tags.map((tag, i) => tag && <ImpactTag key={i} tag={tag} />)}
        </div>
      )}

      <div className={cn("text-[12px] leading-[1.8] pl-7", !expanded && needsExpand && "line-clamp-4")}
        style={{ color: isAI ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.5)" }}>
        <MarkdownText text={impactExplanation} />
      </div>

      {needsExpand && (
        <button onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 pl-7 text-[11px] text-white/25 hover:text-white/55 transition-colors self-start">
          {expanded ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
        </button>
      )}
    </div>
  );
}

function SymbolCard({ symbol, news, isAI = false }: { symbol: string; news: SymbolNews; isAI?: boolean }) {
  const meta = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other", flag: "•" };
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 260;
  const sniper = news?.sniper_note;
  const bullish = sniper?.news_bias === "Bullish";
  const bearish = sniper?.news_bias === "Bearish";

  if (!news) {
    return (
      <div className="flex flex-col rounded-2xl bg-white/[0.02] border border-white/[0.07] p-5 items-center justify-center min-h-[200px] text-white/20 select-none">
        <AlertTriangle className="h-5 w-5 opacity-40 mb-2" />
        <span className="text-[11px] font-semibold tracking-wider uppercase">{meta.label} news not available</span>
      </div>
    );
  }

  const detailedBreakdown = news.detailed_breakdown || "";
  const needsExpand = detailedBreakdown.length > LIMIT;
  const latestHeadlines = Array.isArray(news.latest_headlines) ? news.latest_headlines : [];

  // For AI reports, pick glow color based on bias
  const glowColor = isAI
    ? bullish ? "rgba(16,185,129,0.12)" : bearish ? "rgba(239,68,68,0.10)" : "rgba(124,58,237,0.08)"
    : "transparent";
  const borderColor = isAI
    ? bullish ? "rgba(16,185,129,0.22)" : bearish ? "rgba(239,68,68,0.18)" : "rgba(124,58,237,0.18)"
    : "rgba(255,255,255,0.07)";
  const headerBorderColor = isAI
    ? bullish ? "rgba(16,185,129,0.12)" : bearish ? "rgba(239,68,68,0.10)" : "rgba(124,58,237,0.10)"
    : "rgba(255,255,255,0.05)";

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden transition-all duration-200"
      style={{ background: isAI ? "rgba(10,10,18,0.8)" : "rgba(255,255,255,0.025)", border: `1px solid ${borderColor}`, boxShadow: isAI ? `0 0 30px ${glowColor}` : "none" }}
    >
      <div className="flex items-center gap-3 px-5 pt-5 pb-4" style={{ borderBottom: `1px solid ${headerBorderColor}` }}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px] select-none"
          style={isAI
            ? { background: bullish ? "rgba(16,185,129,0.15)" : bearish ? "rgba(239,68,68,0.12)" : "rgba(124,58,237,0.15)", border: `1px solid ${borderColor}` }
            : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }
          }>
          {meta.flag}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[14px] font-bold text-white leading-none">{meta.label}</h3>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded"
              style={isAI
                ? { background: "rgba(124,58,237,0.12)", color: "rgba(167,139,250,0.7)", border: "1px solid rgba(124,58,237,0.18)" }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.07)" }
              }>
              {meta.assetClass}
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-wider" style={{ color: isAI ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.20)" }}>{symbol}</span>
        </div>
        {isAI && sniper?.news_bias && (
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={bullish
              ? { background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }
              : bearish
              ? { background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.10)" }
            }>
            {bullish ? "▲" : bearish ? "▼" : "—"} {sniper.news_bias}
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2.5"
          style={isAI ? { background: "linear-gradient(90deg, #10b981, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } : { color: "rgba(255,255,255,0.20)" }}>
          Latest Khabar
        </p>
        <ul className="space-y-2">
          {latestHeadlines.map((h, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12px] leading-relaxed" style={{ color: isAI ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.60)" }}>
              <span className="mt-[7px] h-1 w-1 rounded-full shrink-0" style={{ background: isAI ? borderColor : "rgba(255,255,255,0.25)" }} />
              <MarkdownText text={h || ""} />
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2.5"
          style={isAI ? { background: "linear-gradient(90deg, #7c3aed, #0891b2)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" } : { color: "rgba(255,255,255,0.20)" }}>
          Detailed Breakdown
        </p>
        <div className={cn("text-[12px] leading-[1.85]", !expanded && needsExpand && "line-clamp-5")}
          style={{ color: isAI ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.55)" }}>
          <MarkdownText text={news.detailed_breakdown || ""} />
        </div>
        {needsExpand && (
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 mt-2 text-[11px] text-white/25 hover:text-white/55 transition-colors">
            {expanded ? <><ChevronUp className="h-3 w-3" /> Kam dikhao</> : <><ChevronDown className="h-3 w-3" /> Poora padho</>}
          </button>
        )}
      </div>

      {news.trader_alert && (
        <div className="px-5 pb-5 mt-auto">
          <div className="rounded-xl px-4 py-3"
            style={isAI
              ? { background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.20)" }
              : { background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }
            }>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3 w-3 text-amber-400/70 shrink-0" />
              <span className="text-[9px] font-bold text-amber-400/60 uppercase tracking-widest">Trader Alert</span>
            </div>
            <p className="text-[12px] text-amber-300/80 leading-[1.8]">
              <MarkdownText text={news.trader_alert} />
            </p>
          </div>
        </div>
      )}

      {news.sniper_note && <SniperNoteSection note={news.sniper_note} />}
    </div>
  );
}

function BannerSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 mb-6 animate-pulse">
      <div className="h-3 w-24 bg-white/[0.07] rounded mb-4" />
      <div className="h-6 w-3/4 bg-white/[0.09] rounded mb-2" /><div className="h-6 w-1/2 bg-white/[0.07] rounded mb-6" />
      <div className="space-y-2">{[1, 0.95, 0.85, 0.9, 0.75].map((w, i) => <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />)}</div>
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
            <div className="space-y-1.5"><div className="h-4 w-20 bg-white/[0.07] rounded" /><div className="h-3 w-12 bg-white/[0.04] rounded" /></div>
          </div>
          <div className="px-5 py-4 space-y-2">
            <div className="h-3 w-20 bg-white/[0.04] rounded mb-3" />{[1, 0.85].map((w, j) => <div key={j} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />)}
          </div>
          <div className="px-5 pb-5">
            <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/[0.10] p-3 space-y-1.5">
              <div className="h-3 w-24 bg-amber-500/[0.10] rounded" />{[1, 0.85].map((w, j) => <div key={j} className="h-3 bg-amber-500/[0.07] rounded" style={{ width: `${w * 100}%` }} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Analyse helpers ─────────────────────────────────────────────────────────

function formatPubDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const ms = new Date(dateStr).getTime();
    if (isNaN(ms)) return "";
    const diff = Date.now() - ms;
    if (diff < 0) return "Just now";
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ""; }
}

function AnalyseHistoryModal({
  history,
  loadingId,
  deletingId,
  onLoad,
  onDelete,
  onClose,
}: {
  history: AnalyseHistoryEntry[];
  loadingId: string | null;
  deletingId: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { data: uSession } = useSession();

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Kolkata", timeZoneName: "short",
    });
  }

  function abbrev(email: string) {
    const [local, domain] = email.split("@");
    return `${local.slice(0, 12)}${local.length > 12 ? "…" : ""}@${domain}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-[#0f0f0f] border border-white/[0.10] shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <History className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Analysis History</p>
              <p className="text-[11px] text-white/30">{history.length} saved reports</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {history.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Database className="h-6 w-6 text-white/15" />
              <p className="text-[12px] text-white/30">Koi saved analysis nahi mila</p>
            </div>
          )}
          {history.length > 0 && (
            <div className="p-4 space-y-2">
              {history.map((entry, idx) => (
                <div key={entry._id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
                    idx === 0
                      ? "bg-white/[0.04] border-white/[0.10]"
                      : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.09]",
                  )}>
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold",
                    idx === 0 ? "bg-white/[0.12] text-white/70" : "bg-white/[0.05] text-white/25",
                  )}>
                    {idx === 0 ? "●" : `${history.length - idx}`}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12px] font-semibold text-white/70">{entry.timeRangeLabel}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/[0.06] text-white/30 border border-white/[0.08]">
                        {entry.newsCount} articles
                      </span>
                      {idx === 0 && <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Latest</span>}
                    </div>
                    <p className="text-[10px] text-white/30">{fmtTime(entry.generatedAt)}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <User className="h-2.5 w-2.5 text-white/20 shrink-0" />
                      <p className="text-[10px] text-white/25 truncate">{abbrev(entry.generatedBy)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onLoad(entry._id)}
                      disabled={loadingId === entry._id || deletingId === entry._id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {loadingId === entry._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                      {loadingId === entry._id ? "Loading…" : "View"}
                    </button>
                    {(() => {
                      const userEmail = uSession?.user?.email;
                      const isOwner = entry.generatedBy && userEmail && entry.generatedBy.toLowerCase() === userEmail.toLowerCase();
                      const isAdmin = (uSession?.user as { role?: string })?.role === "admin";
                      if (!isOwner && !isAdmin) return null;
                      return (
                        <button
                          onClick={() => onDelete(entry._id)}
                          disabled={deletingId === entry._id || loadingId === entry._id}
                          className="flex items-center justify-center p-2 rounded-lg border border-red-500/20 bg-red-500/[0.07] text-red-400 hover:bg-red-500/[0.15] disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          {deletingId === entry._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex justify-between items-center">
          <p className="text-[11px] text-white/20">
            {history.length > 0 ? `${history.length} report${history.length > 1 ? "s" : ""} saved` : ""}
          </p>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.07] transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Model Selection Modal ───────────────────────────────────────────────────

interface ModelSelectionModalProps {
  onSelect: (model: "openai" | "gemini") => void;
  onClose: () => void;
}

function ModelSelectionModal({ onSelect, onClose }: ModelSelectionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0f0f0f] border border-white/[0.10] shadow-2xl overflow-hidden">
        
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Choose AI Model</p>
              <p className="text-[11px] text-white/30">Select model for report generation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Claude Sonnet 4.6 (OpenAI backend) Option */}
          <button
            onClick={() => onSelect("openai")}
            className="w-full flex items-start gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.12] transition text-left group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition duration-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-white/80 group-hover:text-white transition">Claude Sonnet 4.6</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">DEFAULT</span>
              </div>
              <p className="text-[11px] text-white/35 mt-1 leading-relaxed">
                Fast, highly accurate market reports. Leverages web search preview grounding for the latest real-time details.
              </p>
            </div>
          </button>

          {/* Gemini Option */}
          <button
            onClick={() => onSelect("gemini")}
            className="w-full flex items-start gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/[0.12] transition text-left group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-white/40 group-hover:bg-white/[0.10] transition duration-300">
              <Zap className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-white/80 group-hover:text-white transition">Gemini 3.5 Flash</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/35">ALT</span>
              </div>
              <p className="text-[11px] text-white/35 mt-1 leading-relaxed">
                Google Search grounding context, top-tier Hinglish/conversational explanations and reasoning.
              </p>
            </div>
          </button>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/[0.07] bg-white/[0.01]">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Analyse with AI sub-components ──────────────────────────────────────────

function AnalyseInstrumentCard({ symbol, analysis }: { symbol: string; analysis: InstrumentAnalysis }) {
  const meta    = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other", flag: "•" };
  const bullish = analysis.sentiment === "Bullish";
  const bearish = analysis.sentiment === "Bearish";

  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.11] transition-colors duration-200 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.05]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-[15px] select-none">
          {meta.flag}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[14px] font-bold text-white leading-none">{meta.label}</h3>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-white/[0.05] text-white/25 border border-white/[0.07] rounded">
              {meta.assetClass}
            </span>
          </div>
          <span className="text-[10px] text-white/20 font-mono tracking-wider">{symbol}</span>
        </div>
        <span className={cn(
          "px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0",
          bullish ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
          bearish ? "bg-red-500/15 text-red-400 border-red-500/25" :
          "bg-white/[0.05] text-white/40 border-white/[0.10]",
        )}>
          {bullish ? "▲" : bearish ? "▼" : "—"} {analysis.sentiment}
        </span>
      </div>

      {/* Summary */}
      <div className="px-5 py-4">
        <p className="text-[12px] text-white/60 leading-[1.85]">{analysis.summary}</p>
      </div>

      {/* News drivers */}
      {Array.isArray(analysis.news_drivers) && analysis.news_drivers.length > 0 && (
        <div className="px-5 pb-4">
          <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-2">News Drivers</p>
          <ul className="space-y-1.5">
            {analysis.news_drivers.slice(0, 3).map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-white/45 leading-relaxed">
                <span className="mt-[5px] h-1 w-1 rounded-full bg-white/20 shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Outlook */}
      {analysis.outlook && (
        <div className="px-5 pb-5 mt-auto">
          <div className={cn(
            "rounded-xl px-4 py-3 border",
            bullish ? "bg-emerald-500/[0.06] border-emerald-500/20" :
            bearish ? "bg-red-500/[0.06] border-red-500/20" :
            "bg-white/[0.03] border-white/[0.07]",
          )}>
            <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-1.5">Outlook</p>
            <p className={cn(
              "text-[12px] leading-relaxed",
              bullish ? "text-emerald-400/70" : bearish ? "text-red-400/70" : "text-white/55",
            )}>{analysis.outlook}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyseHighImpactCard({ item }: { item: HighImpactNewsItem }) {
  const bull = item.sentiment === "Bullish";
  const bear = item.sentiment === "Bearish";
  const high = item.impact_level === "High";
  const med  = item.impact_level === "Medium";

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 flex flex-col gap-2.5">

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn(
          "px-2 py-0.5 rounded text-[10px] font-bold border",
          high ? "bg-red-500/15 text-red-400 border-red-500/25" :
          med  ? "bg-amber-500/15 text-amber-400 border-amber-500/25" :
          "bg-white/[0.05] text-white/35 border-white/[0.08]",
        )}>
          {item.impact_level} IMPACT
        </span>
        <span className={cn(
          "px-2 py-0.5 rounded text-[10px] font-bold border",
          bull ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
          bear ? "bg-red-500/15 text-red-400 border-red-500/25" :
          "bg-white/[0.05] text-white/35 border-white/[0.08]",
        )}>
          {bull ? "▲" : bear ? "▼" : "—"} {item.sentiment}
        </span>
        {item.source && (
          <span className="text-[10px] text-white/25 ml-auto font-medium">{item.source}</span>
        )}
      </div>

      {/* Headline */}
      <p className="text-[13px] font-semibold text-white/80 leading-snug">{item.headline}</p>

      {/* Affected instruments */}
      {Array.isArray(item.affected_instruments) && item.affected_instruments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.affected_instruments.map((inst, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/[0.05] text-white/40 border border-white/[0.08]">
              {inst}
            </span>
          ))}
        </div>
      )}

      {/* Analysis */}
      {item.analysis && (
        <p className="text-[12px] text-white/50 leading-[1.8]">{item.analysis}</p>
      )}
    </div>
  );
}

// ─── AI Loading Animation ─────────────────────────────────────────────────────

function AILoadingAnimation({ label = "Claude Sonnet 4.6 is analyzing..." }: { label?: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes aiBlob {
          0%,100% { transform: translate(0,0) scale(1); }
          25% { transform: translate(40px,-40px) scale(1.12); }
          50% { transform: translate(-25px,35px) scale(0.88); }
          75% { transform: translate(35px,15px) scale(1.06); }
        }
        @keyframes aiShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes aiFloat {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .ai-blob { animation: aiBlob 8s ease-in-out infinite; }
        .ai-blob-2 { animation: aiBlob 8s ease-in-out infinite; animation-delay: -2.8s; }
        .ai-blob-3 { animation: aiBlob 8s ease-in-out infinite; animation-delay: -5.4s; }
        .ai-shimmer { background: linear-gradient(90deg, transparent, #10b981, #7c3aed, #06b6d4, transparent); background-size: 200% 100%; animation: aiShimmer 2s ease-in-out infinite; }
        .ai-float { animation: aiFloat 3s ease-in-out infinite; }
      `}} />
      <div className="flex flex-col items-center justify-center min-h-[55vh] gap-8 relative overflow-hidden select-none">
        {/* Gradient orbs */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="ai-blob absolute w-[480px] h-[480px] rounded-full opacity-[0.12]" style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }} />
          <div className="ai-blob-2 absolute w-[380px] h-[380px] rounded-full opacity-[0.10]" style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
          <div className="ai-blob-3 absolute w-[320px] h-[320px] rounded-full opacity-[0.09]" style={{ background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)" }} />
        </div>

        {/* Central card */}
        <div className="ai-float relative z-10 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="h-24 w-24 rounded-3xl bg-white/[0.04] border border-white/[0.10] flex items-center justify-center backdrop-blur-sm shadow-[0_0_60px_rgba(16,185,129,0.08)]">
              <Sparkles className="h-10 w-10 text-white/50" />
            </div>
            <div className="absolute -inset-1.5 rounded-[28px] border border-white/[0.06] animate-ping" style={{ animationDuration: "2s" }} />
            <div className="absolute -inset-3 rounded-[32px] border border-white/[0.03] animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.4s" }} />
          </div>

          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 mb-2">
              {[0, 150, 300].map((delay, i) => (
                <div key={i} className={cn(
                  "h-1.5 w-1.5 rounded-full animate-bounce",
                  i === 0 ? "bg-emerald-400" : i === 1 ? "bg-violet-400" : "bg-cyan-400"
                )} style={{ animationDelay: `${delay}ms` }} />
              ))}
            </div>
            <p className="text-[16px] font-semibold text-white/75 tracking-tight">{label}</p>
            <p className="text-[12px] text-white/30 leading-relaxed">
              Fetching live news · running sentiment analysis
              <br/>
              <span className="text-white/20">FXStreet · ForexLive · Investing.com · CoinDesk</span>
            </p>
          </div>

          {/* Shimmer bar */}
          <div className="w-64 h-[3px] bg-white/[0.05] rounded-full overflow-hidden">
            <div className="ai-shimmer h-full rounded-full" />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Report View Modal (full-screen) ─────────────────────────────────────────

// ─── AI gradient tag (reusable) ───────────────────────────────────────────────

function AITag() {
  return (
    <span
      className="shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide text-white"
      style={{
        background: "linear-gradient(135deg, rgba(5,150,105,0.30) 0%, rgba(124,58,237,0.30) 50%, rgba(8,145,178,0.30) 100%)",
        border: "1px solid rgba(16,185,129,0.22)",
        textShadow: "0 0 8px rgba(16,185,129,0.4)",
      }}
    >
      ✦ AI
    </span>
  );
}

function ManualTag() {
  return (
    <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border border-white/[0.08] uppercase text-white/30 bg-white/[0.04]">
      Manual
    </span>
  );
}

// ─── Report View Modal ────────────────────────────────────────────────────────

function ReportViewModal({
  report, entry, onClose,
}: {
  report: NewsReport;
  entry?: NewsEntry | null;
  onClose: () => void;
}) {
  const isAI = entry?.reportType === "ai";
  const orderedSymbols = report?.symbol_wise_news
    ? SYMBOL_DISPLAY_ORDER.filter(s => s in report.symbol_wise_news)
    : [];

  return (
    <>
    <div className="fixed inset-0 z-[49] bg-black/55 backdrop-blur-xl" onClick={onClose} />
    <div
      className="fixed inset-4 md:inset-8 z-50 flex flex-col rounded-2xl overflow-hidden"
      style={isAI
        ? { background: "#08080f", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 0 0 1px rgba(16,185,129,0.07), 0 0 100px rgba(124,58,237,0.08), 0 25px 60px rgba(0,0,0,0.85)" }
        : { background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 50px rgba(0,0,0,0.8)" }
      }
    >
      {/* AI ambient glow strip at top */}
      {isAI && (
        <div className="shrink-0 h-[2px] w-full" style={{ background: "linear-gradient(90deg, transparent 0%, #059669 25%, #7c3aed 55%, #0891b2 75%, transparent 100%)", opacity: 0.7 }} />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: isAI ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.07)", background: isAI ? "rgba(8,8,15,0.95)" : "rgba(13,13,13,0.90)" }}
      >
        <div className="flex items-center gap-3">
          {isAI ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
              style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }}>
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 bg-white/[0.05] border border-white/[0.09]">
              <Newspaper className="h-3.5 w-3.5 text-white/50" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold text-white/85 leading-none">
                {report?.meta?.session ?? "Unknown"} Session — {entry?.date ?? report?.meta?.date ?? ""}
              </p>
              {isAI ? <AITag /> : <ManualTag />}
            </div>
            <p className="text-[10px] text-white/25 mt-0.5">
              {report?.meta?.generated_at
                ? new Date(report.meta.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST"
                : ""}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6">
        {report?.all_news_section && (
          <div
            className="rounded-2xl overflow-hidden mb-6"
            style={isAI
              ? { border: "1px solid rgba(16,185,129,0.12)", background: "rgba(255,255,255,0.015)", boxShadow: "0 0 40px rgba(124,58,237,0.04)" }
              : { border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.025)" }
            }
          >
            <div
              className="flex items-center gap-2.5 px-6 py-3 border-b"
              style={{ borderColor: isAI ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.015)" }}
            >
              {isAI ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: "#10b981" }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ background: "linear-gradient(90deg, #10b981, #7c3aed, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                    AI Generated Report
                  </span>
                </>
              ) : (
                <>
                  <Newspaper className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Aaj Ki Sabse Badi Khabar</span>
                </>
              )}
            </div>
            <div className="px-6 py-5">
              <h2 className="text-[18px] sm:text-[20px] font-bold text-white leading-snug mb-4">
                <MarkdownText text={report.all_news_section.headline || ""} />
              </h2>
              <p className="text-[13px] text-white/60 leading-[1.85]">
                <MarkdownText text={report.all_news_section.summary || ""} />
              </p>
            </div>
          </div>
        )}

        {report?.all_news_section?.high_impact_events?.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              {isAI
                ? <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ background: "linear-gradient(90deg, #10b981, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>High Impact Events</span>
                : <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">High Impact Events</h2>
              }
              <span className="text-[10px] text-white/15">{report.all_news_section.high_impact_events.length} events</span>
              <div className="flex-1 h-px" style={isAI ? { background: "linear-gradient(90deg, rgba(16,185,129,0.25), rgba(124,58,237,0.20), transparent)" } : { background: "rgba(255,255,255,0.05)" }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.all_news_section.high_impact_events.map((ev, i) => ev && <EventCard key={i} event={ev} isAI={isAI} />)}
            </div>
          </div>
        )}

        {orderedSymbols.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              {isAI
                ? <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ background: "linear-gradient(90deg, #7c3aed, #0891b2)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Symbol-Wise Breakdown</span>
                : <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Symbol-Wise Breakdown</h2>
              }
              <span className="text-[10px] text-white/15">{orderedSymbols.length} instruments</span>
              <div className="flex-1 h-px" style={isAI ? { background: "linear-gradient(90deg, rgba(124,58,237,0.25), rgba(8,145,178,0.20), transparent)" } : { background: "rgba(255,255,255,0.05)" }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {orderedSymbols.map(sym => <SymbolCard key={sym} symbol={sym} news={report?.symbol_wise_news?.[sym]} isAI={isAI} />)}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ─── Global History Drawer ────────────────────────────────────────────────────

function GlobalHistoryDrawer({
  reports,
  analyseHistory,
  sentimentHistory,
  filterHistory,
  onViewReport,
  onViewAnalysis,
  onViewSentiment,
  onViewFilter,
  onClose,
}: {
  reports: NewsEntry[];
  analyseHistory: AnalyseHistoryEntry[];
  sentimentHistory: SentimentHistoryEntry[];
  filterHistory: FilterHistoryEntry[];
  onViewReport: (entry: NewsEntry) => void;
  onViewAnalysis: (id: string) => void;
  onViewSentiment: (id: string) => void;
  onViewFilter: (id: string) => void;
  onClose: () => void;
}) {
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Kolkata", timeZoneName: "short",
    });
  }

  const totalCount = reports.length + analyseHistory.length + sentimentHistory.length + filterHistory.length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm flex flex-col bg-[#0f0f0f] border-l border-white/[0.08] shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <History className="h-4 w-4 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Report History</p>
              <p className="text-[11px] text-white/30">{totalCount} saved items</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {totalCount > 0 && (() => {
            // Build a single time-sorted combined list (latest first)
            type CItem =
              | { kind: "report";    sortMs: number; entry: NewsEntry }
              | { kind: "analysis";  sortMs: number; entry: AnalyseHistoryEntry }
              | { kind: "sentiment"; sortMs: number; entry: SentimentHistoryEntry }
              | { kind: "filter";    sortMs: number; entry: FilterHistoryEntry };

            const combined: CItem[] = [
              ...reports.map(r => ({
                kind: "report" as const,
                sortMs: r.latestAt ? new Date(r.latestAt).getTime() : 0,
                entry: r,
              })),
              ...analyseHistory.map(a => ({
                kind: "analysis" as const,
                sortMs: new Date(a.generatedAt).getTime(),
                entry: a,
              })),
              ...sentimentHistory.map(s => ({
                kind: "sentiment" as const,
                sortMs: new Date(s.generatedAt).getTime(),
                entry: s,
              })),
              ...filterHistory.map(f => ({
                kind: "filter" as const,
                sortMs: new Date(f.generatedAt).getTime(),
                entry: f,
              })),
            ].sort((a, b) => b.sortMs - a.sortMs);

            return (
              <div className="p-4 space-y-1.5">
                {combined.map((item, idx) => {
                  const isFirst = idx === 0;
                  if (item.kind === "report") {
                    const e = item.entry;
                    const isAIReport = e.reportType === "ai";
                    return (
                      <button key={`r-${e.date}-${e.session}`} onClick={() => onViewReport(e)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition hover:bg-white/[0.05]"
                        style={isFirst
                          ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }
                          : { background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)" }
                        }
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                          style={isFirst ? { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.70)" } : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.25)" }}>
                          {SESSION_LABELS[e.session]?.charAt(0) ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white/70 truncate">
                            {SESSION_LABELS[e.session]} · {formatDateLabel(e.date)}
                          </p>
                          {e.latestAt && <p className="text-[10px] text-white/25 mt-0.5">{fmtDate(e.latestAt)}</p>}
                        </div>
                        {isAIReport ? <AITag /> : <ManualTag />}
                      </button>
                    );
                  } else if (item.kind === "analysis") {
                    const e = item.entry;
                    return (
                      <button key={`a-${e._id}`} onClick={() => onViewAnalysis(e._id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition hover:bg-white/[0.05]"
                        style={isFirst
                          ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }
                          : { background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)" }
                        }
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
                          style={{ background: "rgba(124,58,237,0.12)", color: "rgba(167,139,250,0.65)" }}>
                          ✦
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white/65 truncate">{e.timeRangeLabel}</p>
                          <p className="text-[10px] text-white/25 mt-0.5">{fmtDate(e.generatedAt)} · {e.newsCount} articles</p>
                        </div>
                        <AITag />
                      </button>
                    );
                  } else if (item.kind === "sentiment") {
                    const e = item.entry;
                    return (
                      <button key={`s-${e._id}`} onClick={() => onViewSentiment(e._id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition hover:bg-white/[0.05]"
                        style={isFirst
                          ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }
                          : { background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)" }
                        }
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold bg-white/[0.08] text-white/60">
                          <Sparkles className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white/65 truncate">{e.timeRangeLabel}</p>
                          <p className="text-[10px] text-white/25 mt-0.5">
                            {fmtDate(e.generatedAt)} · {e.newsAnalyzedCount} news · {e.generatedByName || e.generatedBy}
                          </p>
                        </div>
                        <AITag />
                      </button>
                    );
                  } else {
                    const e = item.entry;
                    return (
                      <button key={`f-${e._id}`} onClick={() => onViewFilter(e._id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition hover:bg-white/[0.05]"
                        style={isFirst
                          ? { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }
                          : { background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)" }
                        }
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold bg-emerald-500/[0.10] text-emerald-400/70">
                          <Filter className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white/65 truncate">{e.timeRangeLabel}</p>
                          <p className="text-[10px] text-white/25 mt-0.5">
                            {fmtDate(e.generatedAt)} · {e.keptNewsCount}/{e.allNewsCount} kept · {e.generatedByName || e.generatedBy}
                          </p>
                        </div>
                        <AITag />
                      </button>
                    );
                  }
                })}
              </div>
            );
          })()}

          {totalCount === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Database className="h-6 w-6 text-white/15" />
              <p className="text-[12px] text-white/30">Koi saved report nahi mila</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Manual Modal (Prompt + Add Report + Generate) ───────────────────────────

type ManualTab = "prompt" | "editor" | "generate";

function ManualModal({
  reports,
  onClose,
  onSaved,
  onGenerateAI,
  generating,
  generateError,
}: {
  reports: NewsEntry[];
  onClose: () => void;
  onSaved: () => void;
  onGenerateAI: (date: string, session: string, model: "openai" | "gemini") => void;
  generating: boolean;
  generateError: string | null;
}) {
  const [tab, setTab] = useState<ManualTab>("prompt");
  const [selectedDate, setSelectedDate] = useState(getISTDateString());
  const [selectedSession, setSelectedSession] = useState(getCurrentSessionIST());
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  const nextInfo = getNextSessionAndDate();

  const tabs: { key: ManualTab; label: string; icon: React.ReactNode }[] = [
    { key: "prompt", label: "Prompt", icon: <Bot className="h-3.5 w-3.5" /> },
    { key: "editor", label: "Add Report", icon: <Pencil className="h-3.5 w-3.5" /> },
    { key: "generate", label: "Generate with AI", icon: <Zap className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
    <div className="fixed inset-0 z-[49] bg-black/55 backdrop-blur-xl" onClick={onClose} />
    <div className="fixed inset-4 md:inset-8 z-50 flex flex-col rounded-2xl bg-[#0d0d0d] border border-white/[0.08] shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.10]">
            <Pencil className="h-3.5 w-3.5 text-white/60" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white/85">Manual</p>
            <p className="text-[10px] text-white/30">Prompt · Add Report · Generate with AI</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 py-2.5 border-b border-white/[0.06] shrink-0">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition",
              tab === t.key
                ? "bg-white/[0.10] text-white border border-white/[0.12]"
                : "text-white/35 hover:text-white/65 hover:bg-white/[0.04]"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "prompt" && (
          <PromptModal
            defaultDate={nextInfo.date}
            defaultSession={nextInfo.session}
            onClose={onClose}
            embedded
          />
        )}
        {tab === "editor" && (
          <EditorModal
            date={selectedDate}
            session={selectedSession}
            initialJson=""
            onClose={onClose}
            onSaved={onSaved}
            embedded
          />
        )}
        {tab === "generate" && (
          <div className="flex flex-col items-center justify-center h-full gap-8 px-8 py-12">
            <div className="flex flex-col items-center gap-4 text-center max-w-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.05] border border-white/[0.09]">
                <Zap className="h-7 w-7 text-white/40" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-white/70 mb-2">Generate with AI</p>
                <p className="text-[12px] text-white/35 leading-relaxed">
                  AI automatically fetches market news for the selected date/session and generates a full analysis report.
                </p>
              </div>
            </div>

            {/* Date + Session selector */}
            <div className="flex flex-col items-center gap-4 w-full max-w-xs">
              <div className="flex items-center gap-3 w-full">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0 w-16">Session</span>
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  {SESSION_ORDER.map(s => (
                    <button key={s} onClick={() => setSelectedSession(s)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-medium transition",
                        selectedSession === s ? "bg-white/[0.10] text-white border border-white/[0.12]" : "text-white/40 hover:text-white/70"
                      )}>
                      {SESSION_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 w-full">
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0 w-16">Date</span>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  className="px-2 py-1 rounded-lg text-[11px] font-medium bg-white/[0.03] border border-white/[0.08] text-white/70 focus:outline-none focus:border-white/[0.20]" />
              </div>
            </div>

            {generateError && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 text-[12px] text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {generateError}
              </div>
            )}

            <button
              onClick={() => setModelSelectorOpen(true)}
              disabled={generating}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-semibold border transition",
                generating
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/60 cursor-not-allowed"
                  : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-300"
              )}
            >
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                : <><Sparkles className="h-4 w-4" /> Generate Report</>
              }
            </button>
          </div>
        )}
      </div>

      {modelSelectorOpen && (
        <ModelSelectionModal
          onClose={() => setModelSelectorOpen(false)}
          onSelect={(model) => {
            setModelSelectorOpen(false);
            onGenerateAI(selectedDate, selectedSession, model);
          }}
        />
      )}
    </div>
    </>
  );
}

// ─── AI Analysis Modal (full-screen) ─────────────────────────────────────────

function AIAnalysisModal({
  analysing,
  analyseError,
  analyseResult,
  analyseNewsCount,
  analyseArticles,
  analysePrompt,
  analyseTab,
  analyseTimeRange,
  analyseInstrument,
  analyseHistory,
  selectedLinks,
  previewLoading,
  previewFetchedRange,
  previewFetchedInstrument,
  onClose,
  onSetAnalyseTab,
  onSetAnalyseTimeRange,
  onSetAnalyseInstrument,
  onSetSelectedLinks,
  onAnalyse,
  onFetchPreview,
  onHistoryLoad,
  onHistoryDelete,
  onRefreshHistory,
  analyseHistoryLoading,
  analyseHistoryDeleteId,
}: {
  analysing: boolean;
  analyseError: string | null;
  analyseResult: NewsAnalysisResult | null;
  analyseNewsCount: number;
  analyseArticles: AnalyseArticle[];
  analysePrompt: string;
  analyseTab: AnalyseTab;
  analyseTimeRange: AnalyseTimeRange;
  analyseInstrument: string;
  analyseHistory: AnalyseHistoryEntry[];
  selectedLinks: string[];
  previewLoading: boolean;
  previewFetchedRange: string | null;
  previewFetchedInstrument: string | null;
  onClose: () => void;
  onSetAnalyseTab: (t: AnalyseTab) => void;
  onSetAnalyseTimeRange: (r: AnalyseTimeRange) => void;
  onSetAnalyseInstrument: (i: string) => void;
  onSetSelectedLinks: (l: string[]) => void;
  onAnalyse: (model: "openai" | "gemini") => void;
  onFetchPreview: (range: string, inst: string, links: string[] | null) => void;
  onHistoryLoad: (id: string) => void;
  onHistoryDelete: (id: string) => void;
  onRefreshHistory: () => void;
  analyseHistoryLoading: boolean;
  analyseHistoryDeleteId: string | null;
}) {
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);

  const { data: uSession } = useSession();

  useEffect(() => {
    if (!analysing && analyseTimeRange !== previewFetchedRange || analyseInstrument !== previewFetchedInstrument) {
      onFetchPreview(analyseTimeRange, analyseInstrument, null);
    }
  }, [analyseTimeRange, analyseInstrument]);

  const s = analyseResult?.overall_sentiment;
  const bullish = s?.label === "Bullish";
  const bearish = s?.label === "Bearish";
  const riskOn  = s?.risk_sentiment === "Risk-On";
  const riskOff = s?.risk_sentiment === "Risk-Off";
  const orderedAnalysis = s ? SYMBOL_DISPLAY_ORDER.filter(sym => analyseResult?.instrument_analysis?.[sym]) : [];

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", timeZoneName: "short",
    });
  }

  return (
    <>
    <div className="fixed inset-0 z-[49] bg-black/55 backdrop-blur-xl" onClick={onClose} />
    <div className="fixed inset-4 md:inset-8 z-50 flex flex-col rounded-2xl bg-[#0a0a0a] border border-white/[0.08] shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0 bg-[#0a0a0a]/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Gradient icon */}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: "linear-gradient(135deg, #10b981 0%, #7c3aed 60%, #06b6d4 100%)" }}>
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white/85">AI News Analysis</p>
            <p className="text-[10px] text-white/30">Claude Sonnet 4.6 · Live RSS sentiment analysis</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Time range */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            {ANALYSE_TIME_RANGES.map(opt => (
              <button key={opt.value} onClick={() => onSetAnalyseTimeRange(opt.value)}
                disabled={analysing}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold transition border",
                  analyseTimeRange === opt.value
                    ? "bg-white/[0.10] text-white border-white/[0.15]"
                    : "text-white/35 border-transparent hover:text-white/60 hover:bg-white/[0.04]"
                )}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Instrument filter */}
          <select
            value={analyseInstrument}
            onChange={e => onSetAnalyseInstrument(e.target.value)}
            disabled={analysing}
            className="appearance-none pl-3 pr-7 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.03] border border-white/[0.07] text-white/60 focus:outline-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
          >
            {ANALYSE_INSTRUMENTS.map(inst => (
              <option key={inst.value} value={inst.value} className="bg-[#121212] text-white">{inst.label}</option>
            ))}
          </select>

          {/* Analyse button */}
          <button
            onClick={() => setModelSelectorOpen(true)}
            disabled={analysing}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold border transition",
              analysing
                ? "bg-white/[0.05] border-white/[0.08] text-white/30 cursor-not-allowed"
                : "text-white border-transparent"
            )}
            style={analysing ? {} : { background: "linear-gradient(135deg, #10b981 0%, #7c3aed 60%, #06b6d4 100%)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            {analysing
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing…</>
              : <><Sparkles className="h-3.5 w-3.5" /> Analyse with AI</>
            }
          </button>

          {/* History icon */}
          <button
            onClick={() => { onRefreshHistory(); setHistoryPanelOpen(v => !v); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition",
              historyPanelOpen
                ? "bg-white/[0.08] border-white/[0.12] text-white/70"
                : "bg-white/[0.03] border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.06]"
            )}
          >
            <History className="h-3.5 w-3.5" />
            {analyseHistory.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/[0.10] text-white/50">
                {analyseHistory.length}
              </span>
            )}
          </button>

          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6">

          {/* Loading */}
          {analysing && <AILoadingAnimation />}

          {/* Error */}
          {analyseError && !analysing && (
            <div className="max-w-xl mx-auto mt-12">
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-5 py-4 flex items-start gap-3">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-red-400 mb-1">Analysis failed</p>
                  <p className="text-[12px] text-red-400/70">{analyseError}</p>
                  <button onClick={() => setModelSelectorOpen(true)} className="mt-3 flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition">
                    <RefreshCw className="h-3 w-3" /> Dobara try karo
                  </button>
                </div>
              </div>
            </div>
          )}

          {!analysing && !analyseError && (
            <>
              {/* Meta bar */}
              {s && (
                <div className="flex items-center gap-2.5 mb-5 flex-wrap">
                  <span className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold border",
                    bullish ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
                    bearish ? "bg-red-500/15 text-red-400 border-red-500/25" :
                    "bg-white/[0.07] text-white/55 border-white/[0.10]",
                  )}>
                    {bullish ? "▲" : bearish ? "▼" : "—"} {s.label}
                  </span>
                  <span className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border",
                    riskOn  ? "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/15" :
                    riskOff ? "bg-red-500/10 text-red-400/70 border-red-500/15" :
                    "bg-white/[0.04] text-white/30 border-white/[0.07]",
                  )}>
                    {s.risk_sentiment}
                  </span>
                  <span className="text-[11px] text-white/25">
                    {analyseNewsCount} articles · {ANALYSE_TIME_RANGES.find(o => o.value === analyseTimeRange)?.display}
                  </span>
                </div>
              )}

              {/* Tabs */}
              <div className="flex items-center gap-1 mb-5 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] w-fit">
                {([
                  { key: "result",   label: "Analysis Result" },
                  { key: "articles", label: `Articles (${analyseNewsCount})` },
                  { key: "prompt",   label: "Prompt" },
                ] as { key: AnalyseTab; label: string }[]).map(t => (
                  <button key={t.key}
                    onClick={() => !(t.key === "result" && !analyseResult) && onSetAnalyseTab(t.key)}
                    disabled={t.key === "result" && !analyseResult}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition",
                      t.key === "result" && !analyseResult
                        ? "opacity-30 cursor-not-allowed text-white/35"
                        : analyseTab === t.key
                          ? "bg-white/[0.10] text-white border border-white/[0.12]"
                          : "text-white/35 hover:text-white/65 hover:bg-white/[0.04]"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab: Result */}
              {analyseTab === "result" && analyseResult && s && (
                <>
                  <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] overflow-hidden mb-6">
                    <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                      <Microscope className="h-3.5 w-3.5 text-white/30 shrink-0" />
                      <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Overall Market Sentiment</span>
                    </div>
                    <div className="px-6 py-5">
                      <p className="text-[13px] text-white/60 leading-[1.85] mb-4">{s.summary}</p>
                      {s.key_themes?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {s.key_themes.map((theme, i) => (
                            <span key={i} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40">{theme}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {analyseResult.high_impact_news?.length > 0 && (
                    <div className="mb-8">
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">High Impact News</h2>
                        <span className="text-[10px] text-white/15">{analyseResult.high_impact_news.length} items</span>
                        <div className="flex-1 h-px bg-white/[0.05]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {analyseResult.high_impact_news.map((item, i) => <AnalyseHighImpactCard key={i} item={item} />)}
                      </div>
                    </div>
                  )}
                  {orderedAnalysis.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Instrument Analysis</h2>
                        <span className="text-[10px] text-white/15">{orderedAnalysis.length} instruments</span>
                        <div className="flex-1 h-px bg-white/[0.05]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {orderedAnalysis.map(sym => <AnalyseInstrumentCard key={sym} symbol={sym} analysis={analyseResult.instrument_analysis[sym]} />)}
                      </div>
                    </div>
                  )}
                </>
              )}

              {analyseTab === "result" && !analyseResult && (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.07]">
                    <Sparkles className="h-7 w-7 text-white/15" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-white/50">Analysis not run yet</p>
                    <p className="text-[12px] text-white/25 max-w-xs mt-1">Click "Analyse with AI" to run sentiment analysis on the latest articles.</p>
                  </div>
                </div>
              )}

              {/* Tab: Articles */}
              {analyseTab === "articles" && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Live News Articles</h2>
                      <span className="text-[10px] text-white/15">{selectedLinks.length} / {analyseArticles.length} selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { const all = analyseArticles.map(a => a.link); onSetSelectedLinks(all); onFetchPreview(analyseTimeRange, analyseInstrument, all); }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition">
                        Select All
                      </button>
                      <button onClick={() => { onSetSelectedLinks([]); onFetchPreview(analyseTimeRange, analyseInstrument, []); }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition">
                        Clear
                      </button>
                    </div>
                  </div>
                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
                      <p className="text-[12px] text-white/30">Fetching articles…</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {analyseArticles.map((a, i) => {
                        const cat = a.category || "";
                        const catColor =
                          cat.includes("Crypto")    ? "text-yellow-400/70 bg-yellow-500/10 border-yellow-500/20" :
                          cat.includes("Commodit")  ? "text-amber-400/70 bg-amber-500/10 border-amber-500/20" :
                          cat.includes("Central")   ? "text-violet-400/70 bg-violet-500/10 border-violet-500/20" :
                          cat.includes("Economic")  ? "text-sky-400/70 bg-sky-500/10 border-sky-500/20" :
                          cat.includes("Geopolit")  ? "text-orange-400/70 bg-orange-500/10 border-orange-500/20" :
                          "text-white/30 bg-white/[0.04] border-white/[0.07]";
                        return (
                          <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.09] transition group">
                            <span className="text-[9px] text-white/15 font-mono mt-1.5 shrink-0 w-6 text-right">{i + 1}</span>
                            <input type="checkbox" checked={selectedLinks.includes(a.link)}
                              onChange={e => {
                                const next = e.target.checked
                                  ? [...selectedLinks, a.link]
                                  : selectedLinks.filter(l => l !== a.link);
                                onSetSelectedLinks(next);
                                onFetchPreview(analyseTimeRange, analyseInstrument, next);
                              }}
                              className="mt-1 h-3.5 w-3.5 rounded border-white/10 bg-white/5 text-white/70 focus:ring-0 cursor-pointer shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <a href={a.link || "#"} target="_blank" rel="noopener noreferrer"
                                className="text-[12px] font-medium text-white/70 hover:text-white leading-snug block line-clamp-2 transition-colors">
                                {a.title}
                              </a>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="text-[10px] font-semibold text-white/35">{a.source}</span>
                                {a.pubDate && <span className="flex items-center gap-0.5 text-[10px] text-white/20"><Clock className="h-2.5 w-2.5" />{formatPubDate(a.pubDate)}</span>}
                                {cat && <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold border", catColor)}>{cat}</span>}
                              </div>
                            </div>
                            <ArrowUpRight className="h-3.5 w-3.5 text-white/15 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Prompt */}
              {analyseTab === "prompt" && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Prompt Sent to AI</h2>
                      <span className="text-[10px] text-white/15">{analysePrompt.length.toLocaleString()} chars</span>
                    </div>
                    <CopyButton text={analysePrompt} label="Copy Prompt" />
                  </div>
                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
                      <p className="text-[12px] text-white/30">Generating prompt preview…</p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                      <pre className="px-5 py-4 text-[11px] text-white/45 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-[70vh] overflow-y-auto">
                        {analysePrompt}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* History side panel */}
        {historyPanelOpen && (
          <div className="w-72 border-l border-white/[0.07] flex flex-col overflow-hidden bg-white/[0.01]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
              <p className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Analysis History</p>
              <button onClick={() => setHistoryPanelOpen(false)} className="text-white/25 hover:text-white/60 transition">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {analyseHistory.length === 0 && (
                <p className="text-[11px] text-white/25 text-center py-8">No history yet</p>
              )}
              {analyseHistory.map((entry, idx) => (
                <div key={entry._id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-white/[0.02] border-white/[0.06] hover:border-white/[0.10] transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white/60 truncate">{entry.timeRangeLabel}</p>
                    <p className="text-[9px] text-white/25">{entry.newsCount} articles · {new Date(entry.generatedAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { onHistoryLoad(entry._id); setHistoryPanelOpen(false); }}
                      className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 transition">
                      <Eye className="h-3 w-3" />
                    </button>
                    {(() => {
                      const userEmail = uSession?.user?.email;
                      const isOwner = entry.generatedBy && userEmail && entry.generatedBy.toLowerCase() === userEmail.toLowerCase();
                      const isAdmin = (uSession?.user as { role?: string })?.role === "admin";
                      if (!isOwner && !isAdmin) return null;
                      return (
                        <button onClick={() => onHistoryDelete(entry._id)}
                          disabled={analyseHistoryDeleteId === entry._id}
                          className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.07] text-red-400 hover:bg-red-500/[0.15] transition">
                          {analyseHistoryDeleteId === entry._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modelSelectorOpen && (
        <ModelSelectionModal
          onClose={() => setModelSelectorOpen(false)}
          onSelect={model => { setModelSelectorOpen(false); onAnalyse(model); }}
        />
      )}
    </div>
    </>
  );
}


// ─── Ask AI Modal ────────────────────────────────────────────────────────────

const ASK_INSTRUMENTS = [
  { value: "XAUUSD",  label: "🥇 Gold (XAU/USD)" },
  { value: "XAGUSD",  label: "🥈 Silver (XAG/USD)" },
  { value: "BTCUSDT", label: "₿ Bitcoin (BTC/USDT)" },
  { value: "ETHUSD",  label: "Ξ Ethereum (ETH/USD)" },
  { value: "EURUSD",  label: "🇪🇺 EUR/USD" },
  { value: "GBPUSD",  label: "🇬🇧 GBP/USD" },
  { value: "USDJPY",  label: "🇯🇵 USD/JPY" },
  { value: "USDCHF",  label: "🇨🇭 USD/CHF" },
  { value: "USDCAD",  label: "🇨🇦 USD/CAD" },
  { value: "AUDUSD",  label: "🇦🇺 AUD/USD" },
  { value: "NZDUSD",  label: "🇳🇿 NZD/USD" },
];

interface ChatMessage { role: "user" | "assistant"; content: string }

function AskAIModal({ onClose }: { onClose: () => void }) {
  const [instrument, setInstrument]         = useState("XAUUSD");
  const [input, setInput]                   = useState("");
  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [loading, setLoading]               = useState(false);
  const [promptText, setPromptText]         = useState("");
  const [promptOpen, setPromptOpen]         = useState(false);
  const [candleCount, setCandleCount]       = useState(0);
  const [newsCount, setNewsCount]           = useState(0);
  const [error, setError]                   = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    if (inputRef.current) { inputRef.current.style.height = "auto"; }
    setError(null);

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument,
          query: q,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await res.json() as { response?: string; prompt?: string; newsCount?: number; candleCount?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setMessages([...newMessages, { role: "assistant", content: json.response ?? "" }]);
      if (json.prompt) setPromptText(json.prompt);
      if (json.newsCount != null) setNewsCount(json.newsCount);
      if (json.candleCount != null) setCandleCount(json.candleCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setMessages(prev => prev.slice(0, -1)); // remove the optimistic user message
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const instrLabel = ASK_INSTRUMENTS.find(i => i.value === instrument)?.label ?? instrument;

  return (
    <>
    <div className="fixed inset-0 z-[49] bg-black/55 backdrop-blur-xl" onClick={onClose} />
    <div
      className="fixed inset-4 md:inset-8 z-50 flex flex-col rounded-2xl overflow-hidden"
      style={{ background: "#08080f", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 0 0 1px rgba(124,58,237,0.08), 0 0 80px rgba(124,58,237,0.07), 0 25px 60px rgba(0,0,0,0.9)" }}
    >
      {/* Gradient top strip */}
      <div className="shrink-0 h-[2px]" style={{ background: "linear-gradient(90deg, transparent 0%, #059669 20%, #7c3aed 55%, #0891b2 80%, transparent 100%)", opacity: 0.8 }} />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b shrink-0" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(8,8,15,0.95)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }}>
            <MessageSquare className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white/85 leading-none">Ask AI</p>
            <p className="text-[10px] text-white/30 mt-0.5">Claude Sonnet 4.6 · 1-min price data + live news</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Instrument selector */}
          <select
            value={instrument}
            onChange={e => { setInstrument(e.target.value); setMessages([]); setPromptText(""); }}
            className="appearance-none pl-3 pr-8 py-1.5 rounded-xl text-[12px] font-semibold focus:outline-none cursor-pointer transition-all"
            style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)", color: "rgba(200,185,255,0.85)", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23a78bfa' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
          >
            {ASK_INSTRUMENTS.map(i => (
              <option key={i.value} value={i.value} className="bg-[#13091f] text-white">{i.label}</option>
            ))}
          </select>

          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Prompt accordion */}
      {promptText && (
        <div className="shrink-0 border-b" style={{ borderColor: "rgba(124,58,237,0.10)" }}>
          <button
            onClick={() => setPromptOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 text-left transition hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-2.5">
              <Bot className="h-3.5 w-3.5 shrink-0" style={{ color: "#7c3aed" }} />
              <span className="text-[11px] font-semibold" style={{ background: "linear-gradient(90deg, #7c3aed, #0891b2)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Prompt · {candleCount} 1-min candles · {newsCount} news articles
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <CopyButton text={promptText} label="Copy" />
              {promptOpen ? <ChevronUp className="h-3.5 w-3.5 text-white/30" /> : <ChevronDown className="h-3.5 w-3.5 text-white/30" />}
            </div>
          </button>
          {promptOpen && (
            <div className="px-5 pb-4 max-h-64 overflow-y-auto" style={{ borderTop: "1px solid rgba(124,58,237,0.08)" }}>
              <pre className="text-[10.5px] text-white/40 leading-relaxed whitespace-pre-wrap font-mono pt-3">
                {promptText}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center pb-8">
            <div className="relative">
              <div className="h-20 w-20 rounded-3xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(5,150,105,0.2), rgba(124,58,237,0.2), rgba(8,145,178,0.2))", border: "1px solid rgba(124,58,237,0.2)" }}>
                <MessageSquare className="h-9 w-9" style={{ color: "#a78bfa" }} />
              </div>
              <div className="absolute -inset-1 rounded-[28px] border border-white/[0.05] animate-ping" style={{ animationDuration: "2.5s" }} />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-white/70 mb-2">Ask anything about {instrLabel}</p>
              <p className="text-[12px] text-white/30 leading-relaxed max-w-sm">
                Your question will be answered using the latest 1-minute candle data and live news — all context auto-loaded.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {[
                "What is the current trend for this instrument?",
                "Key support and resistance levels right now?",
                "Any major news affecting price today?",
                "Should I be bullish or bearish right now?",
              ].map((suggestion) => (
                <button key={suggestion} onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="px-3 py-2 rounded-xl text-[11px] text-white/50 text-left transition hover:text-white/75 hover:bg-white/[0.05]"
                  style={{ border: "1px solid rgba(124,58,237,0.12)", background: "rgba(124,58,237,0.04)" }}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5"
                style={{ background: "linear-gradient(135deg, #059669, #7c3aed)" }}>
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div
              className="max-w-[80%] rounded-2xl px-4 py-3 text-[13px] leading-[1.75]"
              style={msg.role === "user"
                ? { background: "rgba(124,58,237,0.18)", border: "1px solid rgba(124,58,237,0.25)", color: "rgba(255,255,255,0.85)", borderRadius: "18px 18px 4px 18px", whiteSpace: "pre-wrap" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)", borderRadius: "4px 18px 18px 18px" }
              }
            >
              {msg.role === "assistant"
                // eslint-disable-next-line react/no-danger
                ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                : msg.content
              }
            </div>
            {msg.role === "user" && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5 bg-white/[0.08] border border-white/[0.10]">
                <User className="h-3.5 w-3.5 text-white/50" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "linear-gradient(135deg, #059669, #7c3aed)" }}>
              <Sparkles className="h-3.5 w-3.5 text-white animate-pulse" />
            </div>
            <div className="px-4 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "4px 18px 18px 18px" }}>
              <div className="flex items-center gap-1.5">
                {[0, 200, 400].map((d, i) => (
                  <div key={i} className="h-1.5 w-1.5 rounded-full animate-bounce"
                    style={{ background: i === 0 ? "#10b981" : i === 1 ? "#7c3aed" : "#0891b2", animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-[12px]"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", color: "rgba(248,113,113,0.85)" }}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-end gap-2 rounded-2xl px-4 py-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,58,237,0.20)" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${instrLabel}... (Enter to send, Shift+Enter for new line)`}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] text-white/80 placeholder-white/25 focus:outline-none leading-relaxed"
            style={{ maxHeight: "120px", minHeight: "24px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl transition-all disabled:opacity-30"
            style={input.trim() && !loading
              ? { background: "linear-gradient(135deg, #059669, #7c3aed)", boxShadow: "0 0 16px rgba(124,58,237,0.3)" }
              : { background: "rgba(255,255,255,0.06)" }
            }
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> : <Send className="h-3.5 w-3.5 text-white" />}
          </button>
        </div>
        <p className="text-[9px] text-white/15 text-center mt-2">Context: 1-min candles + live news auto-loaded · {instrLabel}</p>
      </div>
    </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsAnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) router.replace("/auth/signin");
  }, [session, status, router]);

  // ── Report index state ───────────────────────────────────────────────────
  const [reports,      setReports]      = useState<NewsEntry[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);

  // ── Modal open state ─────────────────────────────────────────────────────
  const [manualOpen,        setManualOpen]        = useState(false);
  const [askAiOpen,         setAskAiOpen]         = useState(false);
  const [aiAnalysisOpen,    setAiAnalysisOpen]    = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

  // ── Filter News tab button — imperatively triggers the same AI filter
  // MarketNews already runs inline, so both entry points share one implementation.
  const marketNewsRef = useRef<MarketNewsHandle>(null);
  const [filterTabDropdownOpen, setFilterTabDropdownOpen] = useState(false);
  const runFilterFromTab = useCallback((hours: number) => {
    setFilterTabDropdownOpen(false);
    marketNewsRef.current?.runFilter(hours);
    document.getElementById("market-news-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const [reportViewEntry,  setReportViewEntry]  = useState<NewsEntry | null>(null);
  const [reportViewData,   setReportViewData]   = useState<NewsReport | null>(null);
  const [reportViewLoading, setReportViewLoading] = useState(false);

  // ── Generate state ───────────────────────────────────────────────────────
  const [generating,    setGenerating]    = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Analyse state ────────────────────────────────────────────────────────
  const [analyseTimeRange,       setAnalyseTimeRange]       = useState<AnalyseTimeRange>("24h");
  const [analysing,              setAnalysing]              = useState(false);
  const [analyseResult,          setAnalyseResult]          = useState<NewsAnalysisResult | null>(null);
  const [analyseError,           setAnalyseError]           = useState<string | null>(null);
  const [analyseNewsCount,       setAnalyseNewsCount]       = useState(0);
  const [analyseTab,             setAnalyseTab]             = useState<AnalyseTab>("result");
  const [analyseArticles,        setAnalyseArticles]        = useState<AnalyseArticle[]>([]);
  const [analysePrompt,          setAnalysePrompt]          = useState("");
  const [analyseCurrentId,       setAnalyseCurrentId]       = useState<string | null>(null);
  const [analyseHistory,         setAnalyseHistory]         = useState<AnalyseHistoryEntry[]>([]);
  const [analyseHistoryLoading,  setAnalyseHistoryLoading]  = useState(false);
  const [analyseHistoryDeleteId, setAnalyseHistoryDeleteId] = useState<string | null>(null);
  const [previewLoading,         setPreviewLoading]         = useState(false);
  const [previewFetchedRange,    setPreviewFetchedRange]    = useState<string | null>(null);
  const [previewFetchedInstrument, setPreviewFetchedInstrument] = useState<string | null>(null);
  const [analyseInstrument,      setAnalyseInstrument]      = useState<string>("ALL");
  const [selectedLinks,          setSelectedLinks]          = useState<string[]>([]);

  // ── Sentiment report state (new "Analyse News" feature) ──────────────────
  const [sentimentModalOpen,    setSentimentModalOpen]    = useState(false);
  const [sentimentGenerating,   setSentimentGenerating]   = useState(false);
  const [sentimentGenError,     setSentimentGenError]     = useState<string | null>(null);
  const [sentimentProgress,     setSentimentProgress]     = useState<string | undefined>(undefined);
  const [sentimentHistory,      setSentimentHistory]      = useState<SentimentHistoryEntry[]>([]);
  const [sentimentViewId,       setSentimentViewId]       = useState<string | null>(null);
  const [sentimentViewData,     setSentimentViewData]     = useState<SentimentReport | null>(null);
  const [sentimentViewLoading,  setSentimentViewLoading]  = useState(false);

  const refreshSentimentHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/news/sentiment-report");
      if (!res.ok) return;
      const data = await res.json();
      setSentimentHistory(Array.isArray(data) ? data : []);
    } catch { /* keep previous list on failure */ }
  }, []);

  useEffect(() => { refreshSentimentHistory(); }, [refreshSentimentHistory]);

  useEffect(() => {
    if (!sentimentViewId) { setSentimentViewData(null); return; }
    setSentimentViewLoading(true);
    fetch(`/api/news/sentiment-report/${sentimentViewId}`)
      .then(r => r.json())
      .then(data => setSentimentViewData(data))
      .catch(() => setSentimentViewData(null))
      .finally(() => setSentimentViewLoading(false));
  }, [sentimentViewId]);

  const handleGenerateSentiment = useCallback(async (hours: number) => {
    setSentimentGenerating(true);
    setSentimentGenError(null);
    setSentimentProgress("Fetching every RSS feed, breaking-alert source, central bank & calendar…");
    try {
      const res = await fetch("/api/news/sentiment-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSentimentGenError(data.error ?? "Failed to generate report");
        return;
      }
      setSentimentHistory(prev => [{
        _id: data._id,
        hours: data.hours,
        timeRangeLabel: data.timeRangeLabel,
        newsAnalyzedCount: data.newsAnalyzedCount,
        generatedBy: data.generatedBy,
        generatedByName: data.generatedByName,
        generatedAt: data.generatedAt,
      }, ...prev]);
      setSentimentViewData(data);
      setSentimentViewId(data._id);
      setSentimentModalOpen(false);
    } catch {
      setSentimentGenError("Network error — please try again");
    } finally {
      setSentimentGenerating(false);
      setSentimentProgress(undefined);
    }
  }, []);

  // ── "Filter News" feature state — the AI-filter itself now runs inline in
  // MarketNews.tsx (in place on the live news grid); this page only tracks
  // history so past filter runs are reviewable via the History drawer ──────
  const [filterHistory,     setFilterHistory]     = useState<FilterHistoryEntry[]>([]);
  const [filterViewId,      setFilterViewId]      = useState<string | null>(null);
  const [filterViewData,    setFilterViewData]    = useState<FilterReport | null>(null);
  const [filterViewLoading, setFilterViewLoading] = useState(false);

  const refreshFilterHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/news/filter-report");
      if (!res.ok) return;
      const data = await res.json();
      setFilterHistory(Array.isArray(data) ? data : []);
    } catch { /* keep previous list on failure */ }
  }, []);

  useEffect(() => { refreshFilterHistory(); }, [refreshFilterHistory]);

  const closeFilterView = useCallback(() => {
    setFilterViewData(null);
    setFilterViewId(null);
  }, []);

  useEffect(() => {
    if (!filterViewId) return;
    setFilterViewLoading(true);
    fetch(`/api/news/filter-report/${filterViewId}`)
      .then(r => r.json())
      .then(data => setFilterViewData(data))
      .catch(() => setFilterViewData(null))
      .finally(() => setFilterViewLoading(false));
  }, [filterViewId]);

  // ── Load report index on mount ───────────────────────────────────────────
  useEffect(() => {
    fetch("/api/news-reports")
      .then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
        return r.json();
      })
      .then((data: NewsEntry[]) => {
        if (Array.isArray(data)) setReports(data);
      })
      .catch(() => {})
      .finally(() => setIndexLoading(false));
  }, []);

  // Determine truly latest item across ALL FOUR report types — session
  // (Manual/Add Report), deep AI analysis, sentiment-report, and
  // filter-report. This previously only ever compared session vs analysis,
  // so a freshly-generated sentiment/filter report never took over the
  // banner and it kept showing whatever the last analysis run was.
  const latestSessionMs = reports[0]?.latestAt ? new Date(reports[0].latestAt).getTime() : 0;
  const latestAnalysisMs = analyseHistory[0]?.generatedAt ? new Date(analyseHistory[0].generatedAt).getTime() : 0;
  const latestSentimentMs = sentimentHistory[0]?.generatedAt ? new Date(sentimentHistory[0].generatedAt).getTime() : 0;
  const latestFilterMs = filterHistory[0]?.generatedAt ? new Date(filterHistory[0].generatedAt).getTime() : 0;

  const latestKind: "analysis" | "sentiment" | "filter" | "session" | null = (() => {
    const candidates: { kind: "analysis" | "sentiment" | "filter" | "session"; ms: number }[] = [
      { kind: "analysis", ms: latestAnalysisMs },
      { kind: "sentiment", ms: latestSentimentMs },
      { kind: "filter", ms: latestFilterMs },
      { kind: "session", ms: latestSessionMs },
    ];
    const best = candidates.reduce((a, b) => (b.ms > a.ms ? b : a));
    return best.ms > 0 ? best.kind : null;
  })();
  const latestReport = reports[0] ?? null;

  // ── Refresh index ────────────────────────────────────────────────────────
  const refreshReports = useCallback(async () => {
    try {
      const r = await fetch("/api/news-reports");
      if (r.ok) { const d: NewsEntry[] = await r.json(); if (Array.isArray(d)) setReports(d); }
    } catch { /* silent */ }
  }, []);

  // ── Open a report from history ───────────────────────────────────────────
  const openReportView = useCallback(async (entry: NewsEntry) => {
    setReportViewEntry(entry);
    setReportViewLoading(true);
    try {
      const res = await fetch(`/api/news-reports?date=${encodeURIComponent(entry.date)}&session=${encodeURIComponent(entry.session)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReportViewData(await res.json());
    } catch { setReportViewData(null); }
    finally { setReportViewLoading(false); }
    setHistoryDrawerOpen(false);
  }, []);

  // ── Generate with AI ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async (date: string, sess: string, model: "openai" | "gemini" = "openai") => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/news-reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, session: sess, timeRange: "24h", selectedSymbols: SYMBOL_DISPLAY_ORDER, model }),
      });
      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new Error(`Server error (${res.status}): Generation failed.`);
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await refreshReports();
      if (json.data) {
        setReportViewData(json.data as NewsReport);
        // Find the entry
        const e = { date, session: sess, source: "db" as const, reportType: "ai" as const };
        setReportViewEntry(e);
      }
      setManualOpen(false);
    } catch (e: unknown) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [refreshReports]);

  // ── Analyse with AI ──────────────────────────────────────────────────────
  const refreshAnalyseHistory = useCallback(async () => {
    setAnalyseHistoryLoading(true);
    try {
      const res = await fetch("/api/news-analysis/reports");
      if (res.ok) setAnalyseHistory((await res.json()) as AnalyseHistoryEntry[]);
    } catch { /* silent */ }
    finally { setAnalyseHistoryLoading(false); }
  }, []);

  const handleAnalyse = useCallback(async (model: "openai" | "gemini" = "openai") => {
    setAnalysing(true);
    setAnalyseError(null);
    setAnalyseResult(null);
    setAnalyseNewsCount(0);
    setAnalyseArticles([]);
    setAnalysePrompt("");
    setAnalyseCurrentId(null);
    setAnalyseTab("result");
    try {
      const res = await fetch("/api/news-analysis/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeRange: analyseTimeRange, model, instrument: analyseInstrument, selectedLinks }),
      });
      let json: { error?: string; _id?: string; data?: NewsAnalysisResult; news_count?: number; articles?: AnalyseArticle[]; prompt?: string; instrument?: string };
      try {
        json = await res.json();
      } catch {
        throw new Error(`Server error (${res.status}): Analysis failed.`);
      }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAnalyseResult(json.data ?? null);
      setAnalyseNewsCount(json.news_count ?? 0);
      setAnalyseArticles(json.articles ?? []);
      setAnalysePrompt(json.prompt ?? "");
      setAnalyseCurrentId(json._id ?? null);
      setPreviewFetchedRange(analyseTimeRange);
      setPreviewFetchedInstrument(json.instrument ?? analyseInstrument);
      refreshAnalyseHistory();
    } catch (e) {
      setAnalyseError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setAnalysing(false);
    }
  }, [analyseTimeRange, analyseInstrument, selectedLinks, refreshAnalyseHistory]);

  const handleLoadAnalyseReport = useCallback(async (id: string) => {
    setAnalysing(true);
    setAnalyseError(null);
    try {
      const res = await fetch(`/api/news-analysis/reports?id=${encodeURIComponent(id)}`);
      let json: { error?: string; data?: NewsAnalysisResult; newsCount?: number; articles?: AnalyseArticle[]; prompt?: string; timeRange?: string; instrument?: string };
      try {
        json = await res.json();
      } catch {
        throw new Error(`Server error (${res.status}): Failed to load report.`);
      }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAnalyseResult(json.data ?? null);
      setAnalyseNewsCount(json.newsCount ?? 0);
      setAnalyseArticles(json.articles ?? []);
      setSelectedLinks((json.articles ?? []).map(a => a.link));
      setAnalysePrompt(json.prompt ?? "");
      setAnalyseCurrentId(id);
      setAnalyseTab("result");
      if (json.timeRange) { setAnalyseTimeRange(json.timeRange as AnalyseTimeRange); setPreviewFetchedRange(json.timeRange); }
      if (json.instrument) { setAnalyseInstrument(json.instrument); setPreviewFetchedInstrument(json.instrument); }
    } catch (e) {
      setAnalyseError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setAnalysing(false);
    }
  }, []);

  const handleDeleteAnalyseReport = useCallback(async (id: string) => {
    if (!window.confirm("Delete this analysis report?")) return;
    setAnalyseHistoryDeleteId(id);
    try {
      const res = await fetch(`/api/news-analysis/reports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setAnalyseHistory(prev => prev.filter(e => e._id !== id));
        if (analyseCurrentId === id) { setAnalyseResult(null); setAnalyseArticles([]); setAnalysePrompt(""); setAnalyseCurrentId(null); }
      }
    } catch { /* silent */ }
    finally { setAnalyseHistoryDeleteId(null); }
  }, [analyseCurrentId]);

  const fetchPreview = useCallback(async (range: string, inst: string, links: string[] | null = null) => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/news-analysis/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeRange: range, instrument: inst, selectedLinks: links, preview: true }),
      });
      const json = await res.json();
      if (res.ok) {
        if (links === null) { setAnalyseArticles(json.articles || []); setAnalyseNewsCount(json.news_count || 0); setSelectedLinks((json.articles || []).map((a: AnalyseArticle) => a.link)); }
        setAnalysePrompt(json.prompt || "");
        setPreviewFetchedRange(range);
        setPreviewFetchedInstrument(inst);
      }
    } catch { /* silent */ }
    finally { setPreviewLoading(false); }
  }, []);

  // Auto-set tab when result disappears
  useEffect(() => {
    if (!analyseResult && analyseTab === "result") setAnalyseTab("articles");
  }, [analyseResult, analyseTab]);

  // Load analyse history on mount + when AI modal opens
  useEffect(() => {
    refreshAnalyseHistory();
  }, [refreshAnalyseHistory]);

  useEffect(() => {
    if (aiAnalysisOpen) refreshAnalyseHistory();
  }, [aiAnalysisOpen, refreshAnalyseHistory]);

  if (status === "loading" || !session?.user) return null;

  function fmtLatest(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/85 backdrop-blur-xl border-b border-white/[0.055]">
        <div className="px-5 md:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          {/* Left: title */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0">
              <Newspaper className="h-4 w-4 text-white/70" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white leading-none mb-0.5">News Analysis</h1>
              <p className="text-[11px] text-white/30">Live market news · Hinglish session reports</p>
            </div>
          </div>

          {/* Right: 3 action buttons */}
          <div className="flex items-center gap-2">
            {/* Manual */}
            <button
              onClick={() => setManualOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold border bg-white/[0.05] border-white/[0.10] text-white/60 hover:bg-white/[0.09] hover:text-white/85 hover:border-white/[0.16] transition"
            >
              <Pencil className="h-3.5 w-3.5" />
              Manual
            </button>

            {/* Ask AI — commented out per request; the "Ask AI" feature now
                lives inside an already-generated Filtered News Report instead
                (see ReportAskAI in filtered-report-view.tsx).
            <button
              onClick={() => setAskAiOpen(true)}
              className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold text-white transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.25) 0%, rgba(8,145,178,0.22) 100%)", border: "1px solid rgba(124,58,237,0.30)", boxShadow: "0 0 16px rgba(124,58,237,0.12)" }}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Ask AI
            </button>
            */}

            {/* AI News Analysis — commented out per request; "Filter News" now
                takes this slot (same gradient), triggering the AI filter that
                already lives inline in MarketNews via marketNewsRef.
            <button
              onClick={() => setSentimentModalOpen(true)}
              className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 55%, #0891b2 100%)", boxShadow: "0 0 20px rgba(124,58,237,0.25), 0 0 40px rgba(5,150,105,0.10)" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI News Analysis
            </button>
            */}
            <div className="relative">
              <button
                onClick={() => setFilterTabDropdownOpen((v) => !v)}
                className="relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 55%, #0891b2 100%)", boxShadow: "0 0 20px rgba(124,58,237,0.25), 0 0 40px rgba(5,150,105,0.10)" }}
              >
                <Filter className="h-3.5 w-3.5" />
                Filter News
                <ChevronDown className={`h-3 w-3 transition-transform ${filterTabDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {filterTabDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterTabDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-20 w-44 rounded-lg border border-white/[0.10] bg-[#161616] shadow-xl py-1.5">
                    {FILTER_HOUR_OPTIONS.map((h) => (
                      <button
                        key={h}
                        onClick={() => runFilterFromTab(h)}
                        className="w-full text-left px-3 py-1.5 text-xs text-white/60 hover:bg-white/[0.06] hover:text-white transition"
                      >
                        {filterHourLabel(h)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* History */}
            <button
              onClick={() => { refreshAnalyseHistory(); refreshSentimentHistory(); refreshFilterHistory(); setHistoryDrawerOpen(true); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold border bg-white/[0.04] border-white/[0.08] text-white/45 hover:bg-white/[0.07] hover:text-white/70 hover:border-white/[0.13] transition"
            >
              <History className="h-3.5 w-3.5" />
              History
              {(reports.length + analyseHistory.length + sentimentHistory.length + filterHistory.length) > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/[0.10] text-white/50">
                  {reports.length + analyseHistory.length + sentimentHistory.length + filterHistory.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Latest report banner ───────────────────────────────────────────── */}
      {!indexLoading && latestKind && (
        <div className="px-5 md:px-8 pt-5">
          {latestKind === "analysis" && analyseHistory[0] ? (
            /* Latest is a deep AI analysis report */
            <button
              onClick={() => { setAiAnalysisOpen(true); handleLoadAnalyseReport(analyseHistory[0]._id); }}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition text-left group"
              style={{ background: "rgba(8,8,15,0.6)", border: "1px solid rgba(16,185,129,0.12)", boxShadow: "0 0 30px rgba(124,58,237,0.05)" }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }}>
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-white/70">
                    Latest: {analyseHistory[0].timeRangeLabel} AI Analysis
                  </span>
                  <AITag />
                </div>
                <p className="text-[10px] text-white/25">{fmtLatest(analyseHistory[0].generatedAt)} · {analyseHistory[0].newsCount} articles</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-white/30 group-hover:text-white/60 transition">
                <Eye className="h-3.5 w-3.5" />
                View Analysis
              </div>
            </button>
          ) : latestKind === "sentiment" && sentimentHistory[0] ? (
            /* Latest is a sentiment-report */
            <button
              onClick={() => setSentimentViewId(sentimentHistory[0]._id)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition text-left group"
              style={{ background: "rgba(8,8,15,0.6)", border: "1px solid rgba(16,185,129,0.12)", boxShadow: "0 0 30px rgba(124,58,237,0.05)" }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }}>
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-white/70">
                    Latest: {sentimentHistory[0].timeRangeLabel} Sentiment Report
                  </span>
                  <AITag />
                </div>
                <p className="text-[10px] text-white/25">{fmtLatest(sentimentHistory[0].generatedAt)} · {sentimentHistory[0].newsAnalyzedCount} articles</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-white/30 group-hover:text-white/60 transition">
                <Eye className="h-3.5 w-3.5" />
                View Report
              </div>
            </button>
          ) : latestKind === "filter" && filterHistory[0] ? (
            /* Latest is a Filter News report */
            <button
              onClick={() => setFilterViewId(filterHistory[0]._id)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition text-left group"
              style={{ background: "rgba(8,8,15,0.6)", border: "1px solid rgba(16,185,129,0.12)", boxShadow: "0 0 30px rgba(124,58,237,0.05)" }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }}>
                <Filter className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-white/70">
                    Latest: {filterHistory[0].timeRangeLabel} Filtered News
                  </span>
                  <AITag />
                </div>
                <p className="text-[10px] text-white/25">{fmtLatest(filterHistory[0].generatedAt)} · {filterHistory[0].keptNewsCount}/{filterHistory[0].allNewsCount} kept</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-white/30 group-hover:text-white/60 transition">
                <Eye className="h-3.5 w-3.5" />
                View Report
              </div>
            </button>
          ) : latestReport ? (
            /* Latest is a session report */
            <button
              onClick={() => openReportView(latestReport)}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition text-left group"
              style={latestReport.reportType === "ai"
                ? { background: "rgba(8,8,15,0.6)", border: "1px solid rgba(16,185,129,0.12)", boxShadow: "0 0 30px rgba(124,58,237,0.05)" }
                : { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }
              }
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={latestReport.reportType === "ai"
                  ? { background: "linear-gradient(135deg, #059669 0%, #7c3aed 60%, #0891b2 100%)" }
                  : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)" }
                }
              >
                {latestReport.reportType === "ai"
                  ? <Sparkles className="h-4 w-4 text-white" />
                  : <Newspaper className="h-4 w-4 text-white/50" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-white/70">
                    Latest: {SESSION_LABELS[latestReport.session]} Session · {formatDateLabel(latestReport.date)}
                  </span>
                  {latestReport.reportType === "ai" ? <AITag /> : <ManualTag />}
                </div>
                {latestReport.latestAt && (
                  <p className="text-[10px] text-white/25">{fmtLatest(latestReport.latestAt)}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-white/30 group-hover:text-white/60 transition">
                <Eye className="h-3.5 w-3.5" />
                View Report
              </div>
            </button>
          ) : null}
        </div>
      )}

      {/* ── Main: Live News ────────────────────────────────────────────────── */}
      <div id="market-news-section" className="flex-1 pt-5">
        <MarketNews standalone ref={marketNewsRef} />
      </div>

      {/* ── Report View Modal ──────────────────────────────────────────────── */}
      {(reportViewData || reportViewLoading) && (
        <div className="fixed inset-4 md:inset-8 z-50">
          {reportViewLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 rounded-2xl bg-[#0d0d0d] border border-white/[0.08]">
              <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
              <p className="text-[12px] text-white/30">Loading report…</p>
            </div>
          ) : reportViewData ? (
            <ReportViewModal
              report={reportViewData}
              entry={reportViewEntry}
              onClose={() => { setReportViewData(null); setReportViewEntry(null); }}
            />
          ) : null}
        </div>
      )}

      {/* ── Ask AI Modal ──────────────────────────────────────────────────── */}
      {askAiOpen && <AskAIModal onClose={() => setAskAiOpen(false)} />}

      {/* ── Manual Modal ──────────────────────────────────────────────────── */}
      {manualOpen && (
        <ManualModal
          reports={reports}
          onClose={() => setManualOpen(false)}
          onSaved={() => { refreshReports(); setManualOpen(false); }}
          onGenerateAI={handleGenerate}
          generating={generating}
          generateError={generateError}
        />
      )}

      {/* ── AI Analysis Modal ─────────────────────────────────────────────── */}
      {aiAnalysisOpen && (
        <AIAnalysisModal
          analysing={analysing}
          analyseError={analyseError}
          analyseResult={analyseResult}
          analyseNewsCount={analyseNewsCount}
          analyseArticles={analyseArticles}
          analysePrompt={analysePrompt}
          analyseTab={analyseTab}
          analyseTimeRange={analyseTimeRange}
          analyseInstrument={analyseInstrument}
          analyseHistory={analyseHistory}
          selectedLinks={selectedLinks}
          previewLoading={previewLoading}
          previewFetchedRange={previewFetchedRange}
          previewFetchedInstrument={previewFetchedInstrument}
          onClose={() => setAiAnalysisOpen(false)}
          onSetAnalyseTab={setAnalyseTab}
          onSetAnalyseTimeRange={setAnalyseTimeRange}
          onSetAnalyseInstrument={setAnalyseInstrument}
          onSetSelectedLinks={setSelectedLinks}
          onAnalyse={handleAnalyse}
          onFetchPreview={fetchPreview}
          onHistoryLoad={handleLoadAnalyseReport}
          onHistoryDelete={handleDeleteAnalyseReport}
          onRefreshHistory={refreshAnalyseHistory}
          analyseHistoryLoading={analyseHistoryLoading}
          analyseHistoryDeleteId={analyseHistoryDeleteId}
        />
      )}

      {/* ── Analyse News Modal (new sentiment-report feature, gpt-4o-mini) ──── */}
      {sentimentModalOpen && (
        <AnalyseNewsModal
          onClose={() => { if (!sentimentGenerating) { setSentimentModalOpen(false); setSentimentGenError(null); } }}
          onGenerate={handleGenerateSentiment}
          generating={sentimentGenerating}
          error={sentimentGenError}
          progressLabel={sentimentProgress}
        />
      )}

      {/* ── Sentiment Report Dashboard Overlay ────────────────────────────── */}
      {(sentimentViewData || sentimentViewLoading) && (
        <>
          <div 
            onClick={() => { if (!sentimentViewLoading) { setSentimentViewData(null); setSentimentViewId(null); } }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 animate-fade-in"
          />
          <div className="fixed inset-4 md:inset-8 z-50 pointer-events-none flex items-center justify-center">
            <div className="relative h-full w-full max-w-5xl rounded-2xl border border-white/[0.08] bg-[#0a0b0f] shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
              {sentimentViewLoading || !sentimentViewData ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
                  <p className="text-[12px] text-white/30">Loading report…</p>
                </div>
              ) : (
                <SentimentReportDashboard 
                  report={sentimentViewData} 
                  onClose={() => { setSentimentViewData(null); setSentimentViewId(null); }} 
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Filter News Overlay — reviews a past filtered run from History.
          Generation itself now happens inline in MarketNews.tsx. ──────────── */}
      {(filterViewData || filterViewLoading) && (
        <>
          <div
            onClick={() => { if (!filterViewLoading) closeFilterView(); }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 animate-fade-in"
          />
          <div className="fixed inset-2 z-50 pointer-events-none flex items-center justify-center">
            <div className="relative h-full w-full rounded-2xl border border-white/[0.08] bg-[#0a0b0f] shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
              {filterViewLoading || !filterViewData ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
                  <p className="text-[12px] text-white/30">Loading report…</p>
                </div>
              ) : (
                <FilteredReportView
                  report={filterViewData}
                  onClose={closeFilterView}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Global History Drawer ──────────────────────────────────────────── */}
      {historyDrawerOpen && (
        <GlobalHistoryDrawer
          reports={reports}
          analyseHistory={analyseHistory}
          sentimentHistory={sentimentHistory}
          filterHistory={filterHistory}
          onViewReport={openReportView}
          onViewAnalysis={(id) => { setHistoryDrawerOpen(false); setAiAnalysisOpen(true); handleLoadAnalyseReport(id); }}
          onViewSentiment={(id) => { setHistoryDrawerOpen(false); setSentimentViewId(id); }}
          onViewFilter={(id) => { setHistoryDrawerOpen(false); setFilterViewId(id); }}
          onClose={() => setHistoryDrawerOpen(false)}
        />
      )}

    </div>
  );
}
