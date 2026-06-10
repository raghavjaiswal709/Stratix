"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// ─── Candle data types (shared with candle-summary API) ──────────────────────
interface HCandle { t: number; o: number; h: number; l: number; c: number }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }
import { cn } from "@/lib/utils";
import { validateReportSchema } from "@/lib/newsValidation";
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
  date:     string;
  session:  string;
  source:   "db" | "file";
  count?:   number;
  latestAt?: string;
  latestBy?: string;
}

interface NewsVersion {
  _id:         string;
  generatedAt: string;
  generatedBy: string;
}

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

const EXAMPLE_REFERENCE_JSON = `{
  "meta": {
    "date": "2026-06-09",
    "session": "New York",
    "generated_at": "2026-06-09T11:08:06.219Z",
    "language": "Hinglish"
  },
  "all_news_section": {
    "headline": "Iran-Israel Ceasefire Dobara Toot Gaya — Missile Strikes, Oil $94/bbl Par Spike, Aur Kal CPI Ka Bomb!",
    "summary": "Pichle 24 ghanton mein duniya ke markets ke liye ek nahi, kai bade events saath mein aa gaye hain. Iran-Israel ceasefire breakdown ke baad Strait of Hormuz par uncertainty barh gayi hai, jisne crude oil prices ko spike diya. DXY firmer hai aur yields rising mode mein hain because US NFP data unexpected beat de gaya. Equity indices dabe rahe aur safe-havens ko supportive bid mili.",
    "high_impact_events": [
      {
        "event_name": "Iran-Israel Ceasefire Breakdown & Hormuz Supply Shock",
        "impact_explanation": "Ceasefire breakdown se geopolitical risk premium restore ho gaya. Strait of Hormuz blocked rehne se energy supplies heavily disrupted hain, jisne WTI to $94/bbl aur Brent to $97/bbl rally karwaya.",
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
        "event_name": "US NFP May 2026 Massive Beat (+172K vs +85K Expected)",
        "impact_explanation": "Jobs data ne massive double beat kiya. March aur April ke figures bhi higher revise hue. CME FedWatch show karta hai ki December rate hike probability now 40% ke upar hai, jisne dollar strength ko boost kiya.",
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
        "news_bias": "Bearish",
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
        "news_bias": "Bearish",
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
        "news_bias": "Neutral",
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
        "news_bias": "Neutral",
        "key_catalyst": "Primary SNB policy shift or geopolitical risk driver for USDCHF.",
        "key_levels_watch": "Key support and resistance barriers to watch for USDCHF.",
        "session_expectation": "Expected session path and trading strategies for USDCHF."
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
REQUIRED NEWS SOURCES (check ALL — ${opt.display} window):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MACRO & MARKETS:
  Bloomberg · Reuters · Financial Times · Wall Street Journal
  CNBC · MarketWatch · Investing.com · TradingEconomics · Yahoo Finance
  AP News · BBC Business · Al Jazeera Business · The Guardian Business

CENTRAL BANKS (official sources):
  federalreserve.gov · ecb.europa.eu · boj.or.jp · bankofengland.co.uk
  rba.gov.au · rbnz.govt.nz · pboc.gov.cn · bis.org

GEOPOLITICAL & SECURITY:
  Reuters World News · AP Breaking News · BBC World · Al Jazeera
  Defense News · Jane's · War Monitor (X/Twitter accounts)

FOREX & COMMODITIES:
  ForexLive · FXStreet · DailyFX · Kitco (gold/silver) · OilPrice.com
  AgriMoney · S&P Global Commodity Insights · LME (metals)

CRYPTO:
  CoinDesk · CoinTelegraph · The Block · Decrypt · CryptoSlate
  Glassnode (on-chain) · Coinglass (derivatives/OI/funding)

BREAKING & TRENDING (last ${hours}h):
  X/Twitter: $markets, $SPY, $GLD, $BTC trending topics
  Reddit: r/wallstreetbets · r/investing · r/CryptoCurrency
  Google Trends: breakout finance/energy/conflict searches

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
}: {
  defaultDate: string;
  defaultSession: string;
  onClose: () => void;
}) {
  const [candles,   setCandles]   = useState<CandleSummary | null>(null);
  const [fetching,  setFetching]  = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

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

  const userMsg = selectedSymbols.length > 0
    ? buildNewsUserMessage(modalDate, modalSession, candles, timeRange, selectedSymbols)
    : "(Please select at least one currency pair / symbol)";

  const originalText = "• ALWAYS populate all 11 keys in symbol_wise_news (XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF) — none of these 11 symbols can be omitted under any circumstances.";
  const replacementText = selectedSymbols.length > 0
    ? `• ALWAYS populate all selected keys in symbol_wise_news (${selectedSymbols.join(", ")}) — none of these selected symbols can be omitted under any circumstances.`
    : "• ALWAYS populate all selected keys in symbol_wise_news — none of these selected symbols can be omitted under any circumstances.";

  const dynamicSystemPrompt = NEWS_SYSTEM_PROMPT.replace(originalText, replacementText);
  const copyAllText = `=== SYSTEM PROMPT ===\n${dynamicSystemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE ===\n${userMsg}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-white/50" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">CHoCH QLM Hinglish News Prompt</p>
              <p className="text-[11px] text-white/30">
                {fetching ? "Live candle data load ho rahi hai…" : fetchErr ? "Candle fetch failed — general knowledge use hogi" : `H1+H4 data embed hua · ${SESSION_LABELS[modalSession]} · ${modalDate}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition"><X className="h-4 w-4" /></button>
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
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">System Prompt — CHoCH QLM Hinglish</span>
                </div>
                <CopyButton text={dynamicSystemPrompt} disabled={selectedSymbols.length === 0} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-48">{dynamicSystemPrompt}</pre>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">2</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">User Message + Real Candle Data</span>
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
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition">Close</button>
        </div>
      </div>
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
  date, session, initialJson, onClose, onSaved,
}: {
  date: string; session: string; initialJson: string;
  onClose: () => void; onSaved: () => void;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl h-[90vh] flex flex-col rounded-2xl bg-[#0d0d0d] border border-white/[0.10] shadow-2xl overflow-hidden">

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
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
              <X className="h-4 w-4" />
            </button>
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

function EventCard({ event }: { event: HighImpactEvent }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 200;
  const eventName = event?.event_name || "Unknown Event";
  const impactExplanation = event?.impact_explanation || "";
  const needsExpand = impactExplanation.replace(/\*+/g, "").length > LIMIT;
  const tags = event?.market_impact ?? [];

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 flex flex-col gap-2.5">

      {/* Event name row */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.08] border border-white/[0.10]">
          <Zap className="h-3 w-3 text-white/50" />
        </div>
        <p className="text-[13px] font-semibold text-white/80 leading-snug">
          <MarkdownText text={eventName} />
        </p>
      </div>

      {/* Market impact tags — always visible */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-7">
          {tags.map((tag, i) => tag && <ImpactTag key={i} tag={tag} />)}
        </div>
      )}

      {/* Impact explanation */}
      <div className={cn(
        "text-[12px] text-white/50 leading-[1.8] pl-7",
        !expanded && needsExpand && "line-clamp-4",
      )}>
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

function SymbolCard({ symbol, news }: { symbol: string; news: SymbolNews }) {
  const meta = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other", flag: "•" };
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 260;

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

  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.11] transition-colors duration-200 overflow-hidden">
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

      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2.5">Latest Khabar</p>
        <ul className="space-y-2">
          {latestHeadlines.map((h, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12px] text-white/60 leading-relaxed">
              <span className="mt-[7px] h-1 w-1 rounded-full bg-white/25 shrink-0" />
              <MarkdownText text={h || ""} />
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 pb-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2.5">Detailed Breakdown</p>
        <div className={cn(
          "text-[12px] text-white/55 leading-[1.85]",
          !expanded && needsExpand && "line-clamp-5",
        )}>
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
          <div className="rounded-xl bg-amber-500/[0.07] border border-amber-500/[0.18] px-4 py-3">
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

      {/* Sniper note — news-based directional suggestion */}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsAnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) router.replace("/auth/signin");
  }, [session, status, router]);

  const [reports,         setReports]         = useState<NewsEntry[]>([]);
  const [selectedDate,    setSelectedDate]    = useState<string>(getISTDateString());
  const [selectedSession, setSelectedSession] = useState<string>(getCurrentSessionIST());
  const [report,          setReport]          = useState<NewsReport | null>(null);
  const [indexLoading,    setIndexLoading]    = useState(true);
  const [reportLoading,   setReportLoading]   = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const [editorOpen,   setEditorOpen]   = useState(false);
  const [promptOpen,   setPromptOpen]   = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState(false);
  const [viewingVersion, setViewingVersion] = useState<NewsVersion | null>(null);

  const currentSession = getCurrentSession();

  // Dynamically compute availableDates from database reports + always include today
  const todayIST = getISTDateString();
  const datesSet = new Set(reports.map(r => r.date));
  datesSet.add(todayIST);
  const availableDates = [...datesSet].sort().reverse();

  useEffect(() => {
    fetch("/api/news-reports")
      .then(async (r) => {
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: NewsEntry[]) => {
        if (!Array.isArray(data)) {
          throw new Error("Invalid response format");
        }
        setReports(data);
        
        // If today has existing reports, auto-align default session to the latest one
        const forToday = data.filter(r => r.date === todayIST);
        if (forToday.length > 0) {
          const best = SESSION_ORDER.slice().reverse().find(s => forToday.some(r => r.session === s));
          if (best) setSelectedSession(best);
        }
      })
      .catch((e: Error) => {
        setError(e.message === "Forbidden" || e.message === "Unauthorized" ? "Aap logged in nahi hain ya authorized nahi hain." : "Report index load nahi hua.");
      })
      .finally(() => setIndexLoading(false));
  }, []);

  const loadReport = useCallback(async (date: string, sess: string) => {
    const hasEntry = reports.some(r => r.date === date && r.session === sess);
    if (!hasEntry) { setReport(null); return; }
    setReportLoading(true); setError(null);
    try {
      const res = await fetch(`/api/news-reports?date=${encodeURIComponent(date)}&session=${encodeURIComponent(sess)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e: unknown) {
      setError(`Report load nahi hua: ${e instanceof Error ? e.message : "Unknown error"}`);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [reports]);

  useEffect(() => {
    setViewingVersion(null);
    if (selectedDate && selectedSession && reports.length > 0) loadReport(selectedDate, selectedSession);
  }, [selectedDate, selectedSession, reports, loadReport]);

  const dateIndex       = availableDates.indexOf(selectedDate);
  const canGoBack       = dateIndex < availableDates.length - 1;
  const canGoFwd        = dateIndex > 0;
  const sessionsForDate = reports.filter(r => r.date === selectedDate).map(r => r.session);
  const orderedSymbols  = report?.symbol_wise_news
    ? SYMBOL_DISPLAY_ORDER.filter(s => s in report.symbol_wise_news)
    : [];

  const currentEntry = reports.find(r => r.date === selectedDate && r.session === selectedSession);

  if (status === "loading" || !session?.user) return null;

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

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-white/[0.055]">
        <div className="px-5 md:px-8 py-4 space-y-4">

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0">
                <Newspaper className="h-4 w-4 text-white/70" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-white leading-none mb-0.5">News Analysis</h1>
                <p className="text-[11px] text-white/30">Hinglish market news · Gemini 2.0 Flash</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentEntry && (
                <span className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border",
                  currentEntry.source === "db"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/80"
                    : "bg-white/[0.04] border-white/[0.07] text-white/25",
                )}>
                  <Database className="h-2.5 w-2.5" />
                  {currentEntry.source === "db" ? "DB" : "File"}
                </span>
              )}
              {/* History button — shows version count badge */}
              {currentEntry?.source === "db" && (
                <button onClick={() => setHistoryOpen(true)}
                  className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition">
                  <History className="h-3.5 w-3.5" />
                  History
                  {(currentEntry.count ?? 0) > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-white/[0.10] text-white/50">
                      {currentEntry.count}
                    </span>
                  )}
                </button>
              )}
              <button onClick={() => setPromptOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition">
                <Bot className="h-3.5 w-3.5" /> Prompt
              </button>
              <button onClick={() => setEditorOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.07] border border-white/[0.12] text-white/60 hover:text-white hover:bg-white/[0.10] transition">
                <Pencil className="h-3.5 w-3.5" /> Add Report
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-white/30 ml-1">
                <Clock className="h-3.5 w-3.5" />
                <span>Live: <span className="text-white/60 font-medium">{SESSION_LABELS[currentSession]}</span></span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              {SESSION_ORDER.map(s => {
                const available = sessionsForDate.includes(s);
                const active    = selectedSession === s;
                return (
                  <button key={s} onClick={() => available && setSelectedSession(s)}
                    disabled={!available && availableDates.length > 0}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
                      active ? "bg-white/[0.10] text-white border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                             : available ? "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
                             : "text-white/15 cursor-not-allowed",
                    )}>
                    {SESSION_LABELS[s]}
                    {currentSession === s && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => canGoBack && setSelectedDate(availableDates[dateIndex + 1])} disabled={!canGoBack}
                className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[12px] font-medium text-white/70 min-w-[148px] text-center select-none">
                {selectedDate ? formatDateLabel(selectedDate) : "No reports"}
              </span>
              <button onClick={() => canGoFwd && setSelectedDate(availableDates[dateIndex - 1])} disabled={!canGoFwd}
                className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-5 md:px-8 py-6">

        {availableDates.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <Radio className="h-7 w-7 text-white/20" />
            </div>
            <div className="max-w-xs">
              <p className="text-[15px] font-semibold text-white/60 mb-2">Abhi koi news report nahi hai</p>
              <p className="text-[12px] text-white/30 leading-relaxed">
                Reports GitHub Actions se auto-generate hote hain, ya <span className="text-white/50">Edit JSON</span> button se manually add karo.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400 mb-6">{error}</div>
        )}

        {/* Historical version banner */}
        {viewingVersion && (
          <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/[0.18]">
            <History className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[12px] text-amber-300/80">
                Viewing historical version —{" "}
                {new Date(viewingVersion.generatedAt).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  timeZone: "Asia/Kolkata", timeZoneName: "short",
                })}
                {" "}by{" "}
                <span className="font-medium">{viewingVersion.generatedBy}</span>
              </span>
            </div>
            <button
              onClick={() => { setViewingVersion(null); loadReport(selectedDate, selectedSession); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-500/[0.10] border border-amber-500/[0.20] text-amber-400/80 hover:bg-amber-500/[0.18] transition shrink-0">
              <RefreshCw className="h-3 w-3" /> Latest
            </button>
          </div>
        )}

        {reportLoading && <><BannerSkeleton /><CardsSkeleton /></>}

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
                <span className="text-white/40">Edit JSON</span> button se manually add karo.
              </p>
            </div>
          </div>
        )}

        {!reportLoading && report && (
          <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.07] border border-white/[0.10] rounded-full text-white/65">
                {report?.meta?.session ?? "Unknown"} Session
              </span>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.07] rounded-full text-white/35">
                {report?.meta?.language ?? "Hinglish"}
              </span>
              <span className="text-[11px] text-white/25">
                {report?.meta?.generated_at ? new Date(report.meta.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST par generate hua" : ""}
              </span>
              {report?.meta?.generated_by && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.07] rounded-full text-white/35">
                  <User className="h-3.5 w-3.5 opacity-60" />
                  By {report.meta.generated_by}
                </span>
              )}
            </div>

            {/* All News Banner */}
            {report?.all_news_section && (
              <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] overflow-hidden mb-3">
                <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                  <Newspaper className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Aaj Ki Sabse Badi Khabar</span>
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

            {/* High Impact Events */}
            {report?.all_news_section?.high_impact_events && Array.isArray(report.all_news_section.high_impact_events) && report.all_news_section.high_impact_events.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">High Impact Events</h2>
                  <span className="text-[10px] text-white/15">{report.all_news_section.high_impact_events.length} events</span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.all_news_section.high_impact_events.map((ev, i) => ev && <EventCard key={i} event={ev} />)}
                </div>
              </div>
            )}

            {/* Symbol grid */}
            {orderedSymbols.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Symbol-Wise Breakdown</h2>
                  <span className="text-[10px] text-white/15">{orderedSymbols.length} instruments</span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {orderedSymbols.map(sym => <SymbolCard key={sym} symbol={sym} news={report?.symbol_wise_news?.[sym]} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {editorOpen && (
        <EditorModal
          date={selectedDate}
          session={selectedSession}
          initialJson=""
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setViewingVersion(null);
            // Re-fetch index so count badge updates, then load latest
             fetch("/api/news-reports")
              .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
              })
              .then((data: NewsEntry[]) => {
                if (Array.isArray(data)) {
                  setReports(data);
                }
              })
              .catch(() => {});
            loadReport(selectedDate, selectedSession);
          }}
        />
      )}
      {promptOpen && (() => {
        const nextInfo = getNextSessionAndDate();
        return (
          <PromptModal
            defaultDate={nextInfo.date}
            defaultSession={nextInfo.session}
            onClose={() => setPromptOpen(false)}
          />
        );
      })()}
      {historyOpen && (
        <HistoryModal
          date={selectedDate}
          session={selectedSession}
          onClose={() => setHistoryOpen(false)}
          onViewVersion={(data, version) => {
            setReport(data);
            setViewingVersion(version);
          }}
          onDeleteVersion={(deletedId) => {
            // Re-fetch index so count badge updates, then load latest
            fetch("/api/news-reports")
              .then(r => r.json())
              .then((data: NewsEntry[]) => {
                if (Array.isArray(data)) setReports(data);
              })
              .catch(() => {});
            
            if (viewingVersion?._id === deletedId) {
              setViewingVersion(null);
            }
            loadReport(selectedDate, selectedSession);
          }}
        />
      )}

    </div>
  );
}
