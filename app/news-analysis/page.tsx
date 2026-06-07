"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// ─── Candle data types (shared with candle-summary API) ──────────────────────
interface HCandle { t: number; o: number; h: number; l: number; c: number }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }
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
• Har symbol ke sniper_note mein sirf: news bias, key catalyst, watch levels, session expectation — SL/TP/entry BILKUL NAHI

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

EFFECT VALUES:
  "bullish" — is event se is symbol ke liye positive/upward price expectation
  "bearish" — is event se is symbol ke liye negative/downward price expectation
  "neutral" — direct impact nahi ya mixed signals

EXAMPLES:
  Fed Rate Hike → USD bullish, XAUUSD bearish, EURUSD bearish, US Equities bearish, BTCUSDT bearish
  Geopolitical War/Attack → XAUUSD bullish, Oil bullish, USD bullish, Risk Assets bearish, JPY bullish
  Strong NFP Data → USD bullish, XAUUSD bearish, EURUSD bearish, US Equities mixed/bullish
  OPEC Production Cut → Oil bullish, USDCAD bearish, CAD bullish, XAUUSD neutral/bullish, Inflation risk
  Crypto ETF Approval → BTCUSDT bullish, ETHUSD bullish, Risk Assets bullish
  Natural Disaster (Japan) → JPY bullish (safe haven demand), USDJPY bearish, XAUUSD bullish
  China Weak PMI → AUD bearish, AUDUSD bearish, Copper bearish, Global Equities bearish

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
        "news_bias": "Bullish | Bearish | Neutral",
        "key_catalyst": "**FOMC** ke *hawkish minutes* ne **real yields** ko **+12bps** push kiya — yeh gold ke liye sabse important bearish catalyst hai is session mein. *Dollar strength* bhi gold ko daba raha hai.",
        "key_levels_watch": "**$3,350** — *news-driven resistance*, yahan sellers active hain.\n**$3,320** — *critical support*, break hone par bearish momentum tez hoga.\n**$3,280** — next major support agar $3,320 toot gaya.",
        "session_expectation": "**Bearish bias** news ke basis par. *Fed hawkish tone* aur *strong DXY* dono gold ke against hain.\n\nUpside scenario: Agar *geopolitical risk* ya *risk-off sentiment* aaya toh **$3,340-3,350** tak recovery possible.\nDownside risk: **$3,320** break hone par ***sharp selloff toward $3,280*** expected."
      }
    },
    "XAGUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "Silver mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "BTCUSDT": { "latest_headlines": ["...", "..."], "detailed_breakdown": "Bitcoin mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "ETHUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "Ethereum mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "GBPUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "GBP/USD mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "EURUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "EUR/USD mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "USDJPY":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "USD/JPY mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "AUDUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "AUD/USD mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "NZDUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "NZD/USD mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "USDCAD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "USD/CAD mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } },
    "USDCHF":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "USD/CHF mein 120+ words Hinglish...", "trader_alert": "...", "sniper_note": { "news_bias": "Bullish|Bearish|Neutral", "key_catalyst": "...", "key_levels_watch": "...", "session_expectation": "..." } }
  }
}`;

function formatCandlesForNewsPrompt(data: CandleSummary | null): string {
  if (!data) return "(candle data available nahi hai — general market knowledge use karo)";

  const syms = ["xauusd","xagusd","btcusdt","ethusd","eurusd","gbpusd","usdjpy","audusd","nzdusd","usdcad","usdchf"];
  const lines: string[] = ["=== REAL OHLCV CANDLE DATA (UTC timestamps) ==="];

  for (const sym of syms) {
    const d = data[sym];
    if (!d) continue;
    lines.push(`\n${sym.toUpperCase()}:`);
    if (d.h4?.length) {
      lines.push("  H4 (last 7 din):");
      for (const c of d.h4) {
        const dt = new Date(c.t * 1000).toISOString().slice(0, 13) + ":00Z";
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
    if (d.h1?.length) {
      lines.push("  H1 (last 48 ghante):");
      for (const c of d.h1) {
        const dt = new Date(c.t * 1000).toISOString().slice(0, 16) + "Z";
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
  }
  return lines.join("\n");
}

function buildNewsUserMessage(date: string, session: string, candles: CandleSummary | null, timeRange: TimeRange = "24h"): string {
  const ts = new Date().toISOString();
  const candleBlock = formatCandlesForNewsPrompt(candles);

  const opt = TIME_RANGE_OPTIONS.find(o => o.value === timeRange) ?? TIME_RANGE_OPTIONS[4];
  const hours = opt.hours;
  const fromTs = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const timeHinglish =
    timeRange === "3h"  ? "pichle 3 ghante" :
    timeRange === "6h"  ? "pichle 6 ghante" :
    timeRange === "12h" ? "pichle 12 ghante" :
    timeRange === "18h" ? "pichle 18 ghante" :
    timeRange === "24h" ? "pichle 24 ghante" :
    timeRange === "2d"  ? "pichle 2 din" :
    timeRange === "3d"  ? "pichle 3 din" :
                          "pichle ek hafte";

  return `================================================================
CRITICAL INSTRUCTION — OUTPUT FORMAT
================================================================
Tera POORA response SIRF ek \`\`\`json ... \`\`\` code block hona chahiye.
Koi bhi text — upar, neeche, ya beech mein — STRICTLY FORBIDDEN.
Pehli line \`\`\`json, aakhri line \`\`\`, aur beech mein ONLY valid JSON.
================================================================

Aaj ka UTC date hai ${date}. Aane wala session hai ${SESSION_LABELS[session] ?? session} Session.
Current UTC time: ${ts}

⏰ NEWS TIME WINDOW: ${fromTs} SE LEKAR ${ts} TAK (${opt.display})
STRICT RULE: Sirf is time window ke andar ki news aur events cover karo. Is window se pehle ki koi bhi news mat include karo.

${candleBlock}

Upar diye gaye REAL H4 aur H1 candle data ko price context ke liye use karo — recent price levels, highs, lows, aur movements dekho. Yeh data news ke impact ko contextualize karne ke liye hai, koi trade setup nahi banana.

═══════════════════════════════════════════════════════
TERA KAAM — COMPREHENSIVE MARKET-MOVING EVENT ANALYSIS
(${timeHinglish} ki news SIRF — ${fromTs} ke baad ki)
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

Har symbol ke sniper_note mein sirf news-based directional suggestion — koi SL/TP/entry nahi. Sirf: bias (Bullish/Bearish/Neutral), key catalyst, watch levels, session expectation.

Neeche diya schema use karke ek valid JSON output do:

${NEWS_SCHEMA_TEMPLATE}

JSON FIELD REQUIREMENTS:
• meta.generated_at = "${ts}", meta.date = "${date}", meta.session = "${SESSION_LABELS[session] ?? session}", meta.language = "Hinglish"
• NEWS TIME WINDOW: Sirf ${fromTs} se ${ts} ke beech ki events — older news strictly banned
• all_news_section.summary = 250+ word Hinglish — macro + geopolitical + disasters + energy + crypto sab cover karo
• all_news_section.high_impact_events = minimum 4 events (max 6) — DIVERSE categories including geopolitical/disaster/energy
• Har high_impact_event mein "market_impact" array = 3-6 relevant symbols with "bullish"/"bearish"/"neutral"
• Har symbol ke liye: exactly 2 specific real headlines, 120+ word Hinglish breakdown, specific trader_alert, complete sniper_note
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

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-all shrink-0"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Prompt Modal ─────────────────────────────────────────────────────────────

function PromptModal({ date, session, onClose }: { date: string; session: string; onClose: () => void }) {
  const [candles,   setCandles]   = useState<CandleSummary | null>(null);
  const [fetching,  setFetching]  = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setCandles(d); setFetching(false); })
      .catch(e => { setFetchErr(e.message); setFetching(false); });
  }, []);

  const userMsg     = buildNewsUserMessage(date, session, candles, timeRange);
  const copyAllText = `=== SYSTEM PROMPT ===\n${NEWS_SYSTEM_PROMPT}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE ===\n${userMsg}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-white/50" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">CHoCH QLM Hinglish News Prompt</p>
              <p className="text-[11px] text-white/30">
                {fetching ? "Live candle data load ho rahi hai…" : fetchErr ? "Candle fetch failed — general knowledge use hogi" : `H1+H4 data embed hua · ${SESSION_LABELS[session]} · ${date}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition"><X className="h-4 w-4" /></button>
        </div>

        {/* Time range picker */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">News Window</span>
            <div className="flex items-center gap-1 flex-wrap">
              {TIME_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTimeRange(opt.value as TimeRange)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                    timeRange === opt.value
                      ? "bg-white/[0.12] text-white border border-white/[0.18]"
                      : "bg-white/[0.03] text-white/35 border border-white/[0.06] hover:text-white/60 hover:bg-white/[0.07]",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-[10px] text-white/20 shrink-0">
              {TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.display}
            </span>
          </div>
        </div>

        {fetching ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
            <p className="text-[12px] text-white/30">14 symbols ka 48h candle data load ho raha hai…</p>
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
                {(["H4 (7d)", "H1 (48h)", "Symbols"] as const).map((label, i) => {
                  const val = i === 0
                    ? Object.values(candles).reduce((s, d) => s + (d.h4?.length ?? 0), 0)
                    : i === 1
                    ? Object.values(candles).reduce((s, d) => s + (d.h1?.length ?? 0), 0)
                    : Object.keys(candles).length;
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
                <CopyButton text={NEWS_SYSTEM_PROMPT} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-48">{NEWS_SYSTEM_PROMPT}</pre>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">2</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">User Message + Real Candle Data</span>
                  <span className="text-[10px] text-white/20">{SESSION_LABELS[session]} · {date}</span>
                </div>
                <CopyButton text={userMsg} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-64">{userMsg}</pre>
            </div>

            <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.15] px-4 py-3">
              <p className="text-[11px] font-semibold text-emerald-400/70 uppercase tracking-widest mb-1">Step 3 — Save karo</p>
              <p className="text-[12px] text-white/40 leading-relaxed">
                AI ka generated JSON copy karo → <span className="text-white/60 font-medium">Edit JSON</span> mein paste karo → Save. <span className="text-white/50">choch_signal</span> fields automatically har symbol card mein display honge.
              </p>
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex items-center justify-between gap-3">
          <CopyButton text={copyAllText} label="Copy All Blocks" />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Editor Modal ─────────────────────────────────────────────────────────────

function EditorModal({
  date, session, initialJson, onClose, onSaved,
}: {
  date: string; session: string; initialJson: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [json,      setJson]      = useState(initialJson);
  const [parseErr,  setParseErr]  = useState<string | null>(null);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [isValid,   setIsValid]   = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  function tryValidate(value: string): boolean {
    if (!value.trim()) { setParseErr(null); setIsValid(false); return false; }
    try {
      JSON.parse(value);
      setParseErr(null);
      setIsValid(true);
      return true;
    } catch (e) {
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
      const formatted = JSON.stringify(JSON.parse(pasted), null, 2);
      setJson(formatted);
      setParseErr(null);
      setIsValid(true);
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
      const formatted = JSON.stringify(JSON.parse(json), null, 2);
      setJson(formatted);
      setParseErr(null);
      setIsValid(true);
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : "Invalid JSON");
      setIsValid(false);
    }
  }

  async function handleSave() {
    if (!tryValidate(json)) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch("/api/news-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, session, data: JSON.parse(json) }),
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
      <div className="relative w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl bg-[#0d0d0d] border border-white/[0.10] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Pencil className="h-3.5 w-3.5 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Add News Report</p>
              <p className="text-[11px] text-white/30">
                {SESSION_LABELS[session]} Session · {formatDateLabel(date)} · Naya version save hoga
              </p>
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
                {isValid ? "Valid JSON" : "Invalid JSON"}
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

        {/* Textarea */}
        <div className="flex-1 relative overflow-hidden">
          <textarea
            ref={textareaRef}
            value={json}
            onChange={(e) => handleChange(e.target.value)}
            onPaste={handlePaste}
            spellCheck={false}
            className={cn(
              "w-full h-full resize-none bg-transparent px-5 py-4",
              "text-[12px] font-mono leading-[1.7] text-white/70",
              "focus:outline-none placeholder:text-white/20 border-b transition-colors",
              json.trim()
                ? isValid
                  ? "border-emerald-500/20"
                  : "border-red-500/25"
                : "border-white/[0.05]",
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
      hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
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
  const bull = tag.effect === "bullish";
  const bear = tag.effect === "bearish";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold border tracking-wide shrink-0",
      bull ? "bg-emerald-500/[0.12] border-emerald-500/[0.25] text-emerald-400"
           : bear ? "bg-red-500/[0.12] border-red-500/[0.25] text-red-400"
           : "bg-white/[0.05] border-white/[0.10] text-white/35",
    )}>
      <span className="text-[9px]">{bull ? "▲" : bear ? "▼" : "—"}</span>
      <span>{bull ? "Good for" : bear ? "Bad for" : "Neutral"}</span>
      <span className="font-extrabold">{tag.symbol}</span>
    </span>
  );
}

function EventCard({ event }: { event: HighImpactEvent }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 200;
  const needsExpand = event.impact_explanation.replace(/\*+/g, "").length > LIMIT;
  const tags = event.market_impact ?? [];

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 flex flex-col gap-2.5">

      {/* Event name row */}
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.08] border border-white/[0.10]">
          <Zap className="h-3 w-3 text-white/50" />
        </div>
        <p className="text-[13px] font-semibold text-white/80 leading-snug">
          <MarkdownText text={event.event_name} />
        </p>
      </div>

      {/* Market impact tags — always visible */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-7">
          {tags.map((tag, i) => <ImpactTag key={i} tag={tag} />)}
        </div>
      )}

      {/* Impact explanation */}
      <div className={cn(
        "text-[12px] text-white/50 leading-[1.8] pl-7",
        !expanded && needsExpand && "line-clamp-4",
      )}>
        <MarkdownText text={event.impact_explanation} />
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
  const needsExpand = news.detailed_breakdown.length > LIMIT;
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
          {news.latest_headlines.map((h, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12px] text-white/60 leading-relaxed">
              <span className="mt-[7px] h-1 w-1 rounded-full bg-white/25 shrink-0" />
              <MarkdownText text={h} />
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
          <MarkdownText text={news.detailed_breakdown} />
        </div>
        {needsExpand && (
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 mt-2 text-[11px] text-white/25 hover:text-white/55 transition-colors">
            {expanded ? <><ChevronUp className="h-3 w-3" /> Kam dikhao</> : <><ChevronDown className="h-3 w-3" /> Poora padho</>}
          </button>
        )}
      </div>

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
  const [availableDates,  setAvailableDates]  = useState<string[]>([]);
  const [selectedDate,    setSelectedDate]    = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<string>("asian");
  const [report,          setReport]          = useState<NewsReport | null>(null);
  const [indexLoading,    setIndexLoading]    = useState(true);
  const [reportLoading,   setReportLoading]   = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const [editorOpen,   setEditorOpen]   = useState(false);
  const [promptOpen,   setPromptOpen]   = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState(false);
  const [viewingVersion, setViewingVersion] = useState<NewsVersion | null>(null);

  const currentSession = getCurrentSession();

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
        const dates = [...new Set(data.map(r => r.date))].sort().reverse();
        setAvailableDates(dates);
        if (dates.length > 0) {
          setSelectedDate(dates[0]);
          const forDate = data.filter(r => r.date === dates[0]);
          const best = SESSION_ORDER.slice().reverse().find(s => forDate.some(r => r.session === s));
          setSelectedSession(best ?? "asian");
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
  const orderedSymbols  = report
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
                  timeZone: "UTC", timeZoneName: "short",
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
                {report.meta.session} Session
              </span>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.07] rounded-full text-white/35">
                {report.meta.language}
              </span>
              <span className="text-[11px] text-white/25">
                {new Date(report.meta.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC par generate hua
              </span>
              {report.meta.generated_by && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.07] rounded-full text-white/35">
                  <User className="h-3.5 w-3.5 opacity-60" />
                  By {report.meta.generated_by}
                </span>
              )}
            </div>

            {/* All News Banner */}
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] overflow-hidden mb-3">
              <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                <Newspaper className="h-3.5 w-3.5 text-white/30 shrink-0" />
                <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Aaj Ki Sabse Badi Khabar</span>
              </div>
              <div className="px-6 py-5">
                <h2 className="text-[18px] sm:text-[20px] font-bold text-white leading-snug mb-4">
                  <MarkdownText text={report.all_news_section.headline} />
                </h2>
                <p className="text-[13px] text-white/60 leading-[1.85]">
                  <MarkdownText text={report.all_news_section.summary} />
                </p>
              </div>
            </div>

            {/* High Impact Events */}
            {report.all_news_section.high_impact_events.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">High Impact Events</h2>
                  <span className="text-[10px] text-white/15">{report.all_news_section.high_impact_events.length} events</span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.all_news_section.high_impact_events.map((ev, i) => <EventCard key={i} event={ev} />)}
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
                  {orderedSymbols.map(sym => <SymbolCard key={sym} symbol={sym} news={report.symbol_wise_news[sym]} />)}
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
      {promptOpen && (
        <PromptModal
          date={selectedDate || new Date().toISOString().slice(0, 10)}
          session={selectedSession}
          onClose={() => setPromptOpen(false)}
        />
      )}
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
