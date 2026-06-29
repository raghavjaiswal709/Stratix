import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsAnalyseReportModel } from "@/lib/models/NewsAnalyseReport";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawItem {
  title:       string;
  link:        string;
  pubDate:     string;
  source:      string;
  category:    string;
  description: string;  // RSS <description> / summary text
  fullContent: string;  // Full scraped article body
}

interface HCandle { t: number; o: number; h: number; l: number; c: number; }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }

// ─── Feeds ───────────────────────────────────────────────────────────────────
// Removed Nasdaq (retail stock-picking advice, not market news)

const FEEDS = [
  { url: "https://www.fxstreet.com/rss/news",                              name: "FXStreet",      category: "Forex & Commodities"  },
  { url: "https://www.forexlive.com/feed/news",                            name: "ForexLive",     category: "Forex Breaking News"  },
  { url: "https://www.investing.com/rss/news_1.rss",                       name: "Investing.com", category: "Forex News"           },
  { url: "https://www.investing.com/rss/news_14.rss",                      name: "Investing.com", category: "Economy"              },
  { url: "https://www.investing.com/rss/news_95.rss",                      name: "Investing.com", category: "Economic Indicators"  },
  { url: "https://www.investing.com/rss/news_25.rss",                      name: "Investing.com", category: "Market News"          },
  { url: "https://www.investing.com/rss/news_301.rss",                     name: "Investing.com", category: "Crypto"               },
  { url: "https://www.marketwatch.com/rss/topstories",                     name: "MarketWatch",   category: "Market News"          },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/",                name: "CoinDesk",      category: "Crypto"               },
  { url: "https://www.kitco.com/news_rss/kitco_news_home.rss",             name: "Kitco",         category: "Commodities"          },
  { url: "https://cointelegraph.com/rss",                                  name: "CoinTelegraph", category: "Crypto"               },
  { url: "https://www.dailyfx.com/feeds/all-news",                         name: "DailyFX",       category: "Forex & Commodities"  },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",           name: "CNBC",          category: "Market News"          },
  { url: "https://feeds.feedburner.com/zerohedge/feed",                    name: "ZeroHedge",     category: "Market News"          },
  { url: "https://www.bullionvault.com/gold-news/rss/gold-news.xml",       name: "BullionVault",  category: "Commodities"          },
  { url: "https://decrypt.co/feed",                                        name: "Decrypt",       category: "Crypto"               },
  { url: "https://www.investing.com/rss/news_4.rss",                       name: "Investing.com", category: "Commodities"          },
  { url: "https://www.theblock.co/rss",                                    name: "The Block",     category: "Crypto"               },
  { url: "https://actionforex.com/feed/",                                  name: "ActionForex",   category: "Forex & Commodities"  },
  { url: "https://www.fxempire.com/api/v1/en/article/feed",                name: "FXEmpire",      category: "Forex & Commodities"  },
];

// ─── Market relevance filter ──────────────────────────────────────────────────
// Keeps ONLY articles that are relevant to forex/metals/crypto/macro markets.
// This eliminates retail stock-picking advice, dividend tips, individual company
// articles, etc. that pollute the pool and degrade AI analysis quality.

const MARKET_KEYWORDS = [
  // Central banks & monetary policy
  "fed", "fomc", "federal reserve", "ecb", "european central bank", "boj",
  "boe", "bank of england", "bank of japan", "rba", "rbnz", "snb", "pboc",
  "central bank", "rate cut", "rate hike", "interest rate", "monetary",
  "hawkish", "dovish", "quantitative", "powell", "lagarde", "ueda", "bailey",
  // Macro economic data
  "inflation", "cpi", "ppi", "deflation", "gdp", "growth", "recession",
  "pmi", "ism", "nfp", "payroll", "jobs", "employment", "unemployment",
  "retail sales", "consumer confidence", "trade deficit", "current account",
  "housing starts", "durable goods",
  // Forex & currencies
  "forex", "currency", "dollar", "usd", "dxy", "yen", "euro", "pound",
  "franc", "yuan", "renminbi", "fx", "exchange rate", "eurusd", "gbpusd",
  "usdjpy", "audusd", "nzdusd", "usdcad", "usdchf",
  // Gold & Silver
  "gold", "silver", "xau", "xag", "bullion", "precious metal", "platinum",
  "gold price", "silver price", "gold forecast",
  // Crypto macro
  "bitcoin", "ethereum", "btc", "eth", "crypto", "cryptocurrency",
  "blockchain", "etf", "defi", "stablecoin", "altcoin",
  // Energy & commodities
  "oil", "crude", "wti", "brent", "opec", "energy", "natural gas", "lng",
  "copper", "iron ore", "wheat", "commodity", "corn", "soy",
  // Geopolitical & risk events
  "war", "conflict", "geopolit", "sanction", "military", "attack", "strike",
  "iran", "russia", "ukraine", "china", "taiwan", "middle east", "israel",
  "north korea", "nato", "nuclear", "coup", "election",
  "tariff", "trade war", "export ban", "supply chain",
  // Markets & finance
  "yield", "treasury", "bond", "market crash", "selloff", "rally",
  "risk-off", "risk off", "safe haven", "volatility",
  "s&p", "nasdaq", "dow jones", "nikkei", "ftse", "dax",
  "bank failure", "debt ceiling", "default", "credit rating",
];

function isMarketRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  return MARKET_KEYWORDS.some(kw => lower.includes(kw));
}

const SYMBOL_CONFIG: Record<
  string,
  {
    primaryFeeds: number[];
    secondaryFeeds: number[];
    keywords: string[];
    googleQuery: string;
  }
> = {
  ALL: {
    primaryFeeds: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
    secondaryFeeds: [],
    keywords: [],
    googleQuery: "",
  },
  XAUUSD: {
    primaryFeeds: [0, 1, 9, 14, 16],
    secondaryFeeds: [3, 4, 5, 7, 11, 12, 13, 18],
    keywords: ["gold", "xau", "xauusd", "bullion", "yellow metal"],
    googleQuery: '"gold price" OR "XAU/USD" OR "XAUUSD" OR "bullion" OR "yellow metal"',
  },
  XAGUSD: {
    primaryFeeds: [0, 1, 9, 14, 16],
    secondaryFeeds: [3, 4, 5, 7, 11, 13],
    keywords: ["silver", "xag", "xagusd"],
    googleQuery: '"silver price" OR "XAG/USD" OR "XAGUSD" OR "silver spot"',
  },
  EURUSD: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: ["eur", "euro", "eurusd", "eur/usd"],
    googleQuery: '"EUR/USD" OR "EURUSD" OR "euro dollar"',
  },
  GBPUSD: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: ["gbp", "pound", "gbpusd", "gbp/usd", "sterling"],
    googleQuery: '"GBP/USD" OR "GBPUSD" OR "Pound Sterling" OR "sterling pound"',
  },
  USDJPY: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: ["jpy", "yen", "usdjpy", "usd/jpy"],
    googleQuery: '"USD/JPY" OR "USDJPY" OR "dollar yen"',
  },
  USDCHF: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7, 12, 13],
    keywords: ["chf", "franc", "usdchf", "usd/chf", "swiss franc"],
    googleQuery: '"USD/CHF" OR "USDCHF" OR "Swiss franc"',
  },
  USDCAD: {
    primaryFeeds: [0, 1, 2, 11, 16, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: ["cad", "loonie", "usdcad", "usd/cad", "canadian dollar"],
    googleQuery: '"USD/CAD" OR "USDCAD" OR "Canadian dollar" OR "loonie"',
  },
  AUDUSD: {
    primaryFeeds: [0, 1, 2, 11, 16, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: ["aud", "aussie", "audusd", "aud/usd", "australian dollar"],
    googleQuery: '"AUD/USD" OR "AUDUSD" OR "Australian dollar" OR "Aussie dollar"',
  },
  NZDUSD: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7],
    keywords: ["nzd", "kiwi", "nzdusd", "nzd/usd", "new zealand dollar"],
    googleQuery: '"NZD/USD" OR "NZDUSD" OR "New Zealand dollar" OR "kiwi dollar"',
  },
  BTCUSD: {
    primaryFeeds: [6, 8, 10, 15, 17],
    secondaryFeeds: [0, 5, 7, 12, 13],
    keywords: ["bitcoin", "btc", "btcusd", "btcusdt"],
    googleQuery: '"Bitcoin" OR "BTCUSD" OR "BTC/USD" OR "Bitcoin price"',
  },
  ETHUSD: {
    primaryFeeds: [6, 8, 10, 15, 17],
    secondaryFeeds: [0, 5, 7, 12],
    keywords: ["ethereum", "eth", "ethusd", "eth/usd"],
    googleQuery: '"Ethereum" OR "ETHUSD" OR "ETH/USD" OR "Ethereum price"',
  },
  BTCUSDT: {
    primaryFeeds: [6, 8, 10, 15, 17],
    secondaryFeeds: [0, 5, 7, 12, 13],
    keywords: ["bitcoin", "btc", "btcusd", "btcusdt"],
    googleQuery: '"Bitcoin" OR "BTCUSDT" OR "BTC/USDT" OR "Bitcoin price"',
  },
};

function matchesKeywords(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const lower = title.toLowerCase();
  return keywords.some((kw) => {
    const isShortCode = /^[a-z]{3,4}$/.test(kw);
    if (isShortCode) {
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      return regex.test(title);
    }
    return lower.includes(kw.toLowerCase());
  });
}

// ─── Volume targets per time range ────────────────────────────────────────────

const ARTICLE_TARGETS: Record<string, number> = {
  "2h":  15,
  "5h":  20,
  "12h": 25,
  "24h": 30,
};

const TIME_RANGE_LABELS: Record<string, string> = {
  "2h":  "Last 2 Hours",
  "5h":  "Last 5 Hours",
  "12h": "Last 12 Hours",
  "24h": "Last 24 Hours",
};

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "\u2013").replace(/&mdash;/g, "\u2014").replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
}

// ─── Full article scraper (inline, no HTTP hop) ───────────────────────────────

async function scrapeFullContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";

    let html = await res.text();

    // Strip non-content tags entirely
    html = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "");

    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRegex.exec(html)) !== null) {
      const text = m[1]
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (
        text.length > 60 &&
        !text.includes("{") && !text.includes("}") &&
        !text.includes("@property") && !text.includes("@media") &&
        !text.includes("var(--") &&
        !text.toLowerCase().includes("cookie") &&
        !text.toLowerCase().includes("subscribe now") &&
        !text.toLowerCase().includes("privacy policy")
      ) {
        paragraphs.push(text);
      }
    }
    return paragraphs.join("\n\n");
  } catch {
    return "";
  }
}

function extractDescription(block: string): string {
  const startTag = "<description>";
  const endTag = "</description>";
  const startIdx = block.indexOf(startTag);
  if (startIdx === -1) return "";
  const endIdx = block.indexOf(endTag, startIdx + startTag.length);
  if (endIdx === -1) return "";
  
  let rawDesc = block.substring(startIdx + startTag.length, endIdx);
  if (rawDesc.startsWith("<![CDATA[")) {
    rawDesc = rawDesc.substring(9);
    if (rawDesc.endsWith("]]>")) {
      rawDesc = rawDesc.substring(0, rawDesc.length - 3);
    }
  }
  
  return decodeHtml(
    rawDesc
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).slice(0, 400);
}

function parseRSS(xml: string, sourceName: string, category: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch =
      /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(block) ||
      /<title>([^<]*)<\/title>/.exec(block);
    const linkMatch =
      /<link>([^<]+)<\/link>/.exec(block) ||
      /<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/.exec(block) ||
      /<guid[^>]*>([^<]+)<\/guid>/.exec(block);
    const pubDateMatch = /<pubDate>([^<]+)<\/pubDate>/.exec(block);
    const description  = extractDescription(block);
    if (titleMatch && linkMatch) {
      const rawTitle = decodeHtml(titleMatch[1].trim());
      const link     = linkMatch[1].trim();
      const pubDate  = pubDateMatch ? pubDateMatch[1].trim() : "";
      let title = rawTitle;
      const dashIdx = title.lastIndexOf(" - ");
      if (dashIdx !== -1 && dashIdx > title.length * 0.5 && title.length - dashIdx < 40)
        title = title.substring(0, dashIdx).trim();
      if (title.length > 5)
        items.push({ title, link, pubDate, source: sourceName, category, description, fullContent: "" });
    }
  }
  return items;
}

async function fetchFeed(feed: { url: string; name: string; category: string }): Promise<RawItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    if (!xml.includes("<item>")) return [];
    return parseRSS(xml, feed.name, feed.category);
  } catch {
    return [];
  }
}

function formatToIST(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()+1).padStart(2,"0")}-${String(ist.getUTCDate()).padStart(2,"0")} ${String(ist.getUTCHours()).padStart(2,"0")}:${String(ist.getUTCMinutes()).padStart(2,"0")} IST`;
}

// Map time-range label → how many H1 candles to include (keeps tokens tight)
const H1_CANDLE_COUNTS: Record<string, number> = {
  "2h":  4,
  "5h":  8,
  "12h": 14,
  "24h": 26,
};

function formatCandlesForPrompt(data: CandleSummary | null, instrument: string, timeRange: string): string {
  if (!data) return "";

  // Which symbols to include
  const syms: string[] = instrument === "ALL"
    ? ["xauusd","xagusd","btcusdt","ethusd","eurusd","gbpusd","usdjpy","audusd","nzdusd","usdcad","usdchf"]
    : [instrument.toLowerCase()];

  const h1Limit = H1_CANDLE_COUNTS[timeRange] ?? 26;
  const lines: string[] = ["=== REAL OHLC PRICE DATA (Hourly, IST) ==="];

  for (const sym of syms) {
    const d = data[sym];
    if (!d) continue;
    lines.push(`\n${sym.toUpperCase()}:`);

    // H1 candles — trim to the requested window
    if (d.h1?.length) {
      const recent = d.h1.slice(-h1Limit);
      lines.push(`  H1 (last ${h1Limit} candles):`);
      for (const c of recent) {
        const ist = new Date((c.t * 1000) + 330 * 60 * 1000);
        const dt = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()+1).padStart(2,"0")}-${String(ist.getUTCDate()).padStart(2,"0")} ${String(ist.getUTCHours()).padStart(2,"0")}:00 IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }

    // H4 — last 6 candles (last 24h context)
    if (d.h4?.length) {
      const recent4 = d.h4.slice(-6);
      lines.push(`  H4 (last 6 candles):`);
      for (const c of recent4) {
        const ist = new Date((c.t * 1000) + 330 * 60 * 1000);
        const dt = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()+1).padStart(2,"0")}-${String(ist.getUTCDate()).padStart(2,"0")} ${String(ist.getUTCHours()).padStart(2,"0")}:00 IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

function extractJSON(raw: string): unknown {
  const fence = raw.match(/```json\s*([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1].trim());
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  return JSON.parse(raw.trim());
}

// ─── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `================================================================
OUTPUT FORMAT: STRICTLY JSON — NO EXCEPTIONS
================================================================
Tera POORA response ek SINGLE \`\`\`json ... \`\`\` code block hona CHAHIYE.
Koi introduction nahi. Koi explanation nahi. Koi prose nahi.
SIRF aur SIRF ek valid JSON code block — shuru se ant tak.
================================================================

⚠️ ABSOLUTE DIRECTIVE — DATA-ONLY MODE:
You are a strict data analysis engine.
• NO WEB BROWSING — tujhe koi bhi URL open karne ki STRICTLY MANA hai.
• NO EXTERNAL TOOLS — koi bhi web_search, function call, ya retrieval system use mat karo.
• PROCESS PROVIDED TEXT ONLY — jo bhi news titles aur descriptions seedha prompt mein diye gaye hain, SIRF unke basis par analysis karo.
• URLs are PLAIN TEXT IDENTIFIERS only — unhe visit karne ki koi zaroorat nahi.
================================================================

Tu ek world-class financial analyst, geopolitical intelligence expert, aur market news researcher hai.

TERA PRIMARY MISSION — DEEP ANALYSIS OF PROVIDED TEXT:
Tujhe live financial news articles ki list milegi jisme headlines aur summaries directly diye gaye hain.
TERA KAAM:
1. Sirf is prompt mein diye gaye titles aur descriptions ko PADHNA aur ANALYSE karna hai
2. Har article ka headline + description se market impact determine karo
3. Koi bhi external data fetch karne ki zaroorat NAHI — jo text diya gaya hai wo SUFFICIENT hai

INSTRUMENTS TO COVER (ALL 11 mandatory):
XAUUSD (Gold), XAGUSD (Silver), BTCUSDT (Bitcoin), ETHUSD (Ethereum),
GBPUSD (GBP/USD), EURUSD (EUR/USD), USDJPY (USD/JPY),
AUDUSD (AUD/USD), NZDUSD (NZD/USD), USDCAD (USD/CAD), USDCHF (USD/CHF)

LANGUAGE:
• Simple Hinglish — English alphabet, natural Hindi-English mix
• Aise explain karo jaise ek senior analyst naya trader ko samjha raha ho
• Technical terms ZAROOR use karo but EXPLAIN karo
• Short sentences, clear structure

CAUSALITY FORMAT (har impact explanation mein):
[Event] → [Direct market mechanism] → [Price impact on instrument] → [Secondary effect] → [What to watch]
Example: "US CPI 4.1% aaya → Fed rate cut timeline delay → Dollar strong hua (DXY +0.8%) → Gold sell-off ($3,285 → $3,240) → Treasury yields 10yr 4.52% → Watch $3,220 support on Gold"

HOW EACH INSTRUMENT WORKS (use this in analysis):
• XAUUSD: Real yields (inverse), DXY strength (inverse), geopolitical risk (positive), inflation expectations
• XAGUSD: Follows Gold + industrial demand cycle (China PMI, manufacturing orders)
• BTCUSDT: Risk sentiment proxy, institutional flows, regulatory news, correlation with Nasdaq at risk-off
• ETHUSD: Follows BTC macro + ETF flows + DeFi activity + staking yields
• EURUSD: ECB vs Fed rate differential, Eurozone PMI, risk sentiment, DXY
• GBPUSD: BoE policy divergence, UK CPI/jobs, risk appetite
• USDJPY: US-Japan 10yr yield spread (key driver!), BoJ intervention risk, safe-haven yen flows
• AUDUSD: China growth proxy (iron ore, copper), RBA stance, global risk appetite
• NZDUSD: RBNZ, dairy prices, follows AUD, global risk appetite
• USDCAD: WTI crude oil price (inverse), BoC, USD strength
• USDCHF: CHF is safe haven — geopolitical fear → CHF strengthens (USDCHF down), SNB

MANDATORY JSON SCHEMA (follow EXACTLY — no extra fields, no missing fields):
{
  "meta": {
    "time_range": "Last X Hours",
    "news_count": <integer — articles in context>,
    "analysed_at": "<ISO-8601 timestamp>",
    "from": "<ISO-8601 timestamp>",
    "to": "<ISO-8601 timestamp>"
  },
  "overall_sentiment": {
    "label": "Bullish | Bearish | Neutral",
    "risk_sentiment": "Risk-On | Risk-Off | Neutral",
    "summary": "MINIMUM 200 word comprehensive Hinglish summary — kya hua aaj markets mein, major themes kya hain, overall risk appetite kya hai, kaunsa data/event dominant hai, aur trader ke liye overall context kya hai. Specific numbers aur events mention karo.",
    "key_themes": ["Theme 1 with detail", "Theme 2 with detail", "Theme 3 with detail", "Theme 4 with detail"]
  },
  "high_impact_news": [
    {
      "headline": "ACTUAL headline from the provided news list above",
      "source": "Source name",
      "impact_level": "High | Medium | Low",
      "sentiment": "Bullish | Bearish | Neutral",
      "affected_instruments": ["XAUUSD", "USD", "BTCUSDT"],
      "analysis": "MINIMUM 100 word Hinglish analysis — is specific news ka FULL explanation: kya hua, kyun hua, market mechanism kya hai, kaun kaun se instruments affected hue aur exactly kaisa (with numbers if available), aur agle session mein kya expect karo."
    }
  ],
  "instrument_analysis": {
    "XAUUSD": {
      "sentiment": "Bullish | Bearish | Neutral",
      "summary": "MINIMUM 120 word Hinglish deep analysis — current news Gold ko EXACTLY kaisa affect kar raha hai. Include: specific price levels agar available hain, causality chain (news → mechanism → price impact), cross-asset correlation (DXY/yields ke saath), aur context (kya trend chal raha hai Gold mein).",
      "news_drivers": [
        "Specific news point 1 jo Gold ko directly affect kar raha hai — actual event/data",
        "Specific news point 2 — indirect catalyst with explanation"
      ],
      "outlook": "50-60 word Hinglish outlook — is news ke basis pe agle 24-48 ghante mein Gold ka kya expect karo. Key level kaunsa hai, kya catalyst catalyst price move kar sakta hai."
    }
  }
}

QUALITY RULES:
• ALL 11 instruments MANDATORY — koi bhi skip = invalid response
• high_impact_news: MINIMUM 8, maximum 15 items — include EVERY genuinely market-moving event from the article list. DO NOT skip articles. More is better.
• CANDLE DATA usage: Upar diye gaye OHLC price data se ACTUAL current price levels extract karo. Jo bhi last candle ka Close price hai, use the actual number.
• summary field MINIMUM 200 words — short summaries = rejected
• instrument summary MINIMUM 120 words — one-liners = rejected
• outlook MINIMUM 50 words — vague "may go up" = rejected
• Specific price levels from candle data, percentages, economic data wherever possible
• Koi placeholder ya empty string ZERO tolerance
• JSON strings mein actual newlines NAHI — sirf \\n use karo
• No markdown headers (#, ##) inside JSON strings

================================================================
FINAL MANDATE — RESPONSE = ONLY \`\`\`json\`\`\` BLOCK. NOTHING ELSE.
================================================================`;

// ─── User message builder ─────────────────────────────────────────────────────

function buildUserMessage(
  articles: RawItem[],
  toIST: string,
  timeRangeLabel: string,
  instrument = "ALL",
  candles: CandleSummary | null = null,
  timeRange = "24h"
): string {
  const articlesBlock = articles
    .map((a, i) => {
      let pub = "Recent";
      if (a.pubDate) {
        try {
          pub = new Date(a.pubDate).toLocaleString("en-US", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
          }) + " UTC";
        } catch { /* keep default */ }
      }

      // Use full scraped content if available, fall back to RSS description
      const bodyText = a.fullContent && a.fullContent.length > 100
        ? a.fullContent
        : (a.description || "(no content available)");

      return [
        `${"-".repeat(60)}`,
        `ARTICLE ${String(i + 1).padStart(3, " ")} | [${a.source}] | ${pub}`,
        `HEADLINE: ${a.title}`,
        `CATEGORY: ${a.category}`,
        ``,
        `FULL CONTENT:`,
        bodyText,
      ].join("\n");
    })
    .join("\n\n");

  let instrumentsRequired = "INSTRUMENTS REQUIRED (ALL 11): XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF";
  let eachInstrumentPrompt = "2. For EACH of the 11 instruments: What is happening and WHY based on the provided headlines and summaries above? Be specific.";

  if (instrument !== "ALL") {
    instrumentsRequired = `INSTRUMENT REQUIRED (ONLY 1): ${instrument}`;
    eachInstrumentPrompt = `2. For ${instrument}: What is happening and WHY based on the headlines and summaries above? Be specific with price levels from the candle data.`;
  }

  const candleBlock = formatCandlesForPrompt(candles, instrument, timeRange);

  return `================================================================
MARKET INTELLIGENCE ANALYSIS REQUEST — ${timeRangeLabel}
⚠️  DATA-ONLY MODE: Analyze ONLY the text below. Do NOT browse URLs. Do NOT fetch external data.
================================================================
Current IST Time: ${toIST}
Total News Articles Provided: ${articles.length}

${
  candleBlock
    ? `${candleBlock}

▶ PRICE REFERENCE RULE: Upar diye gaye OHLC candle data se actual price levels directly quote karo.
  Last H1 close = current reference price. E.g. "Gold currently at $X,XXX (last H1 close)".
`
    : ""
}
================================================================
NEWS ARTICLES — COMPLETE PROVIDED DATA (${articles.length} articles):
RULE: Neeche diye gaye articles ke headlines aur summaries ko WORD BY WORD padhkar analyse karo.
High Impact section mein MINIMUM 8 events ZAROOR include karo. NO SKIPPING.
================================================================
${articlesBlock}

================================================================
ANALYSIS REQUIREMENTS (based ONLY on provided text above):
================================================================
1. Overall market sentiment RIGHT NOW — Risk-On ya Risk-Off? Kis news ki wajah se?
${eachInstrumentPrompt}
3. HIGH IMPACT EVENTS: Upar diye gaye EVERY article mein se market-moving events nikalo.
   Minimum 8 items MANDATORY. Jo article jyada impact kare, pehle dalo.
4. Price levels: Candle OHLC data se actual numbers quote karo.
5. Next 24-48 hours: Kya watch karna hai?

LANGUAGE: Simple Hinglish (English alphabet, natural Hindi-English mix).

${instrumentsRequired}

Return ONLY a valid JSON code block. Nothing before. Nothing after.`;
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    timeRange?: string;
    model?: "openai" | "gemini";
    preview?: boolean;
    instrument?: string;
    selectedLinks?: string[];
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const timeRange     = (body.timeRange ?? "24h") as string;
  const timeLabel     = TIME_RANGE_LABELS[timeRange] ?? "Last 24 Hours";
  const articleTarget = ARTICLE_TARGETS[timeRange] ?? 100;
  const model         = body.model ?? "openai";
  const instrument    = body.instrument ?? "ALL";
  const selectedLinks = body.selectedLinks ?? null;

  // ── Fetch all feeds in parallel ──────────────────────────────────────────────
  const feedResults = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  const allItems: RawItem[] = [];
  feedResults.forEach(res => {
    if (res.status === "fulfilled") allItems.push(...res.value);
  });

  // ── Deduplicate ──────────────────────────────────────────────────────────────
  const seen    = new Set<string>();
  const deduped = allItems.filter(item => {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Market relevance filter — remove retail stock-picking, dividend advice, etc.
  const marketRelevant = deduped.filter(item => isMarketRelevant(item.title));

  // ── Sort: dated articles first (newest → oldest), undated appended at end ──
  marketRelevant.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : -1;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : -1;
    if (ta <= 0 && tb <= 0) return 0;
    if (ta <= 0) return 1;
    if (tb <= 0) return -1;
    return tb - ta;
  });

  let articles = marketRelevant;

  if (instrument !== "ALL") {
    const config = SYMBOL_CONFIG[instrument] || SYMBOL_CONFIG["XAUUSD"];
    articles = articles.filter(item => matchesKeywords(item.title, config.keywords));
  }

  if (selectedLinks && Array.isArray(selectedLinks) && selectedLinks.length > 0) {
    const linksSet = new Set(selectedLinks);
    articles = articles.filter(item => linksSet.has(item.link));
  }

  articles = articles.slice(0, articleTarget);

  // ── Fetch full article content in parallel ───────────────────────────────────
  // Scrape all selected articles at once so the AI sees the full text, not just headlines.
  const contentResults = await Promise.allSettled(
    articles.map(a => scrapeFullContent(a.link))
  );
  articles = articles.map((a, i) => ({
    ...a,
    fullContent:
      contentResults[i].status === "fulfilled"
        ? (contentResults[i] as PromiseFulfilledResult<string>).value
        : "",
  }));

  // ── Fetch candle data (H1 + H4) for real price context ──────────────────────
  let candles: CandleSummary | null = null;
  try {
    const origin    = new URL(req.url).origin;
    const candleRes = await fetch(`${origin}/api/candle-summary`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      signal: AbortSignal.timeout(10000),
    });
    if (candleRes.ok) candles = await candleRes.json() as CandleSummary;
  } catch { /* proceed without candles */ }

  // ── Build prompt ─────────────────────────────────────────────────────────────
  const now   = new Date();
  const toIST = formatToIST(now);
  const userMsg = buildUserMessage(articles, toIST, timeLabel, instrument, candles, timeRange);

  if (body.preview === true) {
    return NextResponse.json({
      ok: true,
      news_count: articles.length,
      articles: articles.map(a => ({
        title:    a.title,
        source:   a.source,
        pubDate:  a.pubDate,
        link:     a.link,
        category: a.category,
      })),
      prompt: userMsg,
    });
  }

  let dynamicSystemPrompt = SYSTEM_PROMPT;
  if (instrument !== "ALL") {
    dynamicSystemPrompt = SYSTEM_PROMPT
      .replace(
        "INSTRUMENTS TO COVER (ALL 11 mandatory):\nXAUUSD (Gold), XAGUSD (Silver), BTCUSDT (Bitcoin), ETHUSD (Ethereum),\nGBPUSD (GBP/USD), EURUSD (EUR/USD), USDJPY (USD/JPY),\nAUDUSD (AUD/USD), NZDUSD (NZD/USD), USDCAD (USD/CAD), USDCHF (USD/CHF)",
        `INSTRUMENT TO COVER (ONLY 1 mandatory):\n${instrument}`
      )
      .replace(
        "• ALL 11 instruments MANDATORY — koi bhi skip = invalid response",
        `• Only ${instrument} is MANDATORY inside 'instrument_analysis' — do not include any other instruments.`
      )
      .replace(
        "• XAUUSD: Real yields (inverse), DXY strength (inverse), geopolitical risk (positive), inflation expectations\n• XAGUSD: Follows Gold + industrial demand cycle (China PMI, manufacturing orders)\n• BTCUSDT: Risk sentiment proxy, institutional flows, regulatory news, correlation with Nasdaq at risk-off\n• ETHUSD: Follows BTC macro + ETF flows + DeFi activity + staking yields\n• EURUSD: ECB vs Fed rate differential, Eurozone PMI, risk sentiment, DXY\n• GBPUSD: BoE policy divergence, UK CPI/jobs, risk appetite\n• USDJPY: US-Japan 10yr yield spread (key driver!), BoJ intervention risk, safe-haven yen flows\n• AUDUSD: China growth proxy (iron ore, copper), RBA stance, global risk appetite\n• NZDUSD: RBNZ, dairy prices, follows AUD, global risk appetite\n• USDCAD: WTI crude oil price (inverse), BoC, USD strength\n• USDCHF: CHF is safe haven — geopolitical fear → CHF strengthens (USDCHF down), SNB",
        `• ${instrument}: Deep analysis of keywords and drivers matching this instrument.`
      );
  }

  let rawResponse: string;

  if (model === "gemini") {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured in the environment variables." },
        { status: 500 }
      );
    }
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`;

    try {
      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: userMsg }]
          }
        ],
        systemInstruction: {
          parts: [{ text: dynamicSystemPrompt }]
        },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 16000,
          responseMimeType: "application/json"
        }
      };

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
      }

      const resJson = await response.json();
      rawResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gemini API error";
      return NextResponse.json(
        { error: `AI analysis failed (Gemini): ${msg}` },
        { status: 502 },
      );
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

    const openai = new OpenAI({ apiKey });
    try {
      const response = await openai.responses.create({
        model: "gpt-5.5-2026-04-23",
        tools: [{ type: "web_search_preview" }],
        max_output_tokens: 16000,
        input: [
          { role: "system",  content: dynamicSystemPrompt },
          { role: "user",    content: userMsg },
        ],
      } as Parameters<typeof openai.responses.create>[0]);

      rawResponse = (response as { output_text?: string }).output_text ?? "";
    } catch (err) {
      return NextResponse.json(
        { error: `AI analysis failed (OpenAI): ${err instanceof Error ? err.message : "Unknown error"}` },
        { status: 502 },
      );
    }
  }

  if (!rawResponse) {
    return NextResponse.json({ error: "AI returned empty response. Please retry." }, { status: 422 });
  }

  // ── Parse JSON ───────────────────────────────────────────────────────────────
  let analysisData: unknown;
  try { analysisData = extractJSON(rawResponse); }
  catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON. Please retry.", raw: rawResponse.slice(0, 500) },
      { status: 422 },
    );
  }

  // ── Save to DB ────────────────────────────────────────────────────────────────
  await dbConnect();
  const doc = await new NewsAnalyseReportModel({
    timeRange,
    timeRangeLabel: timeLabel,
    instrument,
    newsCount:      articles.length,
    articles:       articles.map(a => ({
      title:    a.title,
      source:   a.source,
      pubDate:  a.pubDate,
      link:     a.link,
      category: a.category,
    })),
    prompt:      userMsg,
    data:        analysisData,
    generatedBy: userSession.user.email ?? "unknown",
    generatedAt: new Date(),
  }).save();

  return NextResponse.json({
    ok:         true,
    _id:        String(doc._id),
    instrument,
    news_count: articles.length,
    data:       analysisData,
    articles:   articles.map(a => ({
      title:    a.title,
      source:   a.source,
      pubDate:  a.pubDate,
      link:     a.link,
      category: a.category,
    })),
    prompt: userMsg,
  });
}
