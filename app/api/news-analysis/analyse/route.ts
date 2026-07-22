import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsAnalyseReportModel } from "@/lib/models/NewsAnalyseReport";
import { scoreArticle, applyCorroborationBoost, isHardNoise, TIER1_WIRE_NAMES } from "@/lib/news/scoring";
import { CENTRAL_BANK_FEEDS, isCentralBankNoise } from "@/lib/news/central-banks";
import { fetchEconomicCalendar, CURRENCY_TO_SYMBOLS } from "@/lib/news/calendar";
import { fetchTelegramContentSince } from "@/lib/news/telegram";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  description: string;  // RSS <description> / summary text
  fullContent: string;  // Full scraped article body
}

interface HCandle { t: number; o: number; h: number; l: number; c: number; }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }

// ─── Feeds ───────────────────────────────────────────────────────────────────
// Removed Nasdaq (retail stock-picking advice, not market news)

const FEEDS = [
  // ── Core Forex & Commodities ─────────────────────────────────────────────────
  { url: "https://www.fxstreet.com/rss/news",                              name: "FXStreet",        category: "Forex & Commodities" },
  { url: "https://www.forexlive.com/feed/news",                            name: "ForexLive",       category: "Forex Breaking News" },
  { url: "https://www.dailyfx.com/feeds/all-news",                         name: "DailyFX",         category: "Forex & Commodities" },
  { url: "https://actionforex.com/feed/",                                  name: "ActionForex",     category: "Forex & Commodities" },
  { url: "https://www.fxempire.com/api/v1/en/article/feed",                name: "FXEmpire",        category: "Forex & Commodities" },
  { url: "https://www.forexcrunch.com/feed/",                              name: "ForexCrunch",     category: "Forex Analysis" },
  { url: "https://www.fxnewstoday.com/feed",                               name: "FXNews Today",    category: "Forex" },
  { url: "https://www.poundsterlinglive.com/feed",                         name: "Pound Sterling",  category: "Forex & Commodities" },
  { url: "https://www.myfxbook.com/rss/forex-news.xml",                    name: "Myfxbook",        category: "Forex & Commodities" },
  { url: "https://www.fxleaders.com/news/feed/",                           name: "FX Leaders",      category: "Forex & Commodities" },
  // ── Investing.com ────────────────────────────────────────────────────────────
  { url: "https://www.investing.com/rss/news_1.rss",                       name: "Investing.com",   category: "Forex News" },
  { url: "https://www.investing.com/rss/news_14.rss",                      name: "Investing.com",   category: "Economy" },
  { url: "https://www.investing.com/rss/news_95.rss",                      name: "Investing.com",   category: "Economic Indicators" },
  { url: "https://www.investing.com/rss/news_25.rss",                      name: "Investing.com",   category: "Market News" },
  { url: "https://www.investing.com/rss/news_301.rss",                     name: "Investing.com",   category: "Crypto" },
  { url: "https://www.investing.com/rss/news_4.rss",                       name: "Investing.com",   category: "Commodities" },
  // ── Tier-1 breaking news ─────────────────────────────────────────────────────
  { url: "https://feeds.bloomberg.com/markets/news.rss",                   name: "Bloomberg",       category: "Market News" },
  { url: "https://www.marketwatch.com/rss/topstories",                     name: "MarketWatch",     category: "Market News" },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",           name: "CNBC",            category: "Market News" },
  { url: "https://feeds.feedburner.com/zerohedge/feed",                    name: "ZeroHedge",       category: "Market News" },
  { url: "https://finance.yahoo.com/rss/topfinstories",                    name: "Yahoo Finance",   category: "Market News" },
  { url: "https://feeds.reuters.com/reuters/businessNews",                 name: "Reuters",         category: "Market News" },
  { url: "https://feeds.reuters.com/reuters/financials",                   name: "Reuters",         category: "Financial News" },
  { url: "https://www.financemagnates.com/feed/",                          name: "Finance Magnates",category: "Forex Industry" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",                 name: "WSJ Markets",     category: "Market News" },
  { url: "https://www.benzinga.com/news/feed",                             name: "Benzinga",        category: "Market News" },
  { url: "https://seekingalpha.com/market_currents.xml",                   name: "Seeking Alpha",   category: "Market News" },
  // ── Economic data ────────────────────────────────────────────────────────────
  { url: "https://tradingeconomics.com/rss/news.aspx",                     name: "TradingEconomics",category: "Economic Data" },
  { url: "https://www.calculatedriskblog.com/feeds/posts/default?alt=rss", name: "Calculated Risk", category: "Economic Data" },
  // ── Commodities & Gold ───────────────────────────────────────────────────────
  { url: "https://www.kitco.com/news_rss/kitco_news_home.rss",             name: "Kitco",           category: "Commodities" },
  { url: "https://www.bullionvault.com/gold-news/rss/gold-news.xml",       name: "BullionVault",    category: "Commodities" },
  { url: "https://oilprice.com/rss/main",                                  name: "OilPrice",        category: "Commodities" },
  { url: "https://www.mining.com/feed/",                                   name: "Mining.com",      category: "Commodities" },
  // ── Crypto ───────────────────────────────────────────────────────────────────
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/",                name: "CoinDesk",        category: "Crypto" },
  { url: "https://cointelegraph.com/rss",                                  name: "CoinTelegraph",   category: "Crypto" },
  { url: "https://decrypt.co/feed",                                        name: "Decrypt",         category: "Crypto" },
  { url: "https://www.theblock.co/rss",                                    name: "The Block",       category: "Crypto" },
  { url: "https://bitcoinmagazine.com/feed",                               name: "Bitcoin Magazine",category: "Crypto" },
  { url: "https://cryptopotato.com/feed/",                                 name: "CryptoPotato",    category: "Crypto" },
  { url: "https://www.newsbtc.com/feed/",                                  name: "NewsBTC",         category: "Crypto" },
  { url: "https://cryptonews.com/news/feed/",                              name: "CryptoNews",      category: "Crypto" },
  { url: "https://watcherguru.com/feed/",                                  name: "WatcherGuru",     category: "Crypto" },
  { url: "https://cryptobriefing.com/feed/",                               name: "CryptoBriefing",  category: "Crypto" },
  { url: "https://blockworks.co/feed",                                     name: "Blockworks",      category: "Crypto" },
  { url: "https://thedefiant.io/feed",                                     name: "The Defiant",     category: "Crypto" },
  { url: "https://www.dukascopy.com/plugins/newsTicker/rss.php",           name: "DC/Dukascopy",    category: "Market News" },
  // ── Additional breadth ───────────────────────────────────────────────────────
  { url: "https://markets.businessinsider.com/rss/news",                   name: "Business Insider",category: "Market News" },
  { url: "https://ambcrypto.com/feed/",                                    name: "AMBCrypto",       category: "Crypto" },
  { url: "https://bitcoinist.com/feed/",                                   name: "Bitcoinist",      category: "Crypto" },
  { url: "https://coinpedia.org/feed/",                                    name: "Coinpedia",       category: "Crypto" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=Commodities",   name: "NASDAQ",          category: "Commodities" },
  { url: "https://u.today/rss",                                            name: "U.Today",         category: "Crypto" },
  { url: "https://www.silverseek.com/rss.xml",                             name: "SilverSeek",      category: "Commodities" },
  { url: "https://cryptoslate.com/feed/",                                  name: "CryptoSlate",     category: "Crypto" },
  { url: "https://beincrypto.com/feed/",                                   name: "BeInCrypto",      category: "Crypto" },
  { url: "https://www.thestreet.com/.rss/full/",                          name: "TheStreet",       category: "Market News" },
];

// ─── Market relevance filter ──────────────────────────────────────────────────
// Two-part filter (same logic as news/route.ts):
//  1. Hard blocklist for definitively-not-trading news
//  2. Word-boundary regex for short keywords + phrase includes() for longer ones
// This prevents "frustrated" matching "rate", "bond" matching "abandoned", etc.

const ANALYSE_NOISE_BLOCKLIST = [
  /\bfrustrat\w*/,
  /\bhom(e|es)\s+buyer/,
  /\bhomebuy\w+/,
  /\bhomes?\s+(remain|unsold|for\s+sale)\b/,
  /\btips?\s+for\b/,
  /\bhow\s+to\s+(buy|save|invest|afford)\b/,
  /\bhoroscope\b/,
  /\brecipe\b/,
  /\bcelebrity\b/,
  /\bwedding\b/,
  /\bpregnant\b/,
  /\blifestyle\b/,
  /\bfashion\b/,
];

const ANALYSE_BOUNDARY_RE = /\b(fed|fomc|ecb|boj|boe|rba|rbnz|snb|pboc|g7|g20|cpi|ppi|pmi|gdp|nfp|ism|lng|wti|dxy|usd|eur|gbp|jpy|cad|aud|nzd|chf|xau|xag|btc|eth|oil|gas|gold|corn|bond|yuan|yen|war|nato|etf)\b/i;

const ANALYSE_PHRASE_KEYWORDS = [
  "federal reserve", "central bank", "interest rate", "rate cut", "rate hike",
  "monetary policy", "hawkish", "dovish", "quantitative", "powell", "lagarde",
  "ueda", "bailey", "inflation", "deflation", "stagflation",
  "consumer price", "producer price", "housing starts", "housing permits",
  "durable goods", "retail sales", "trade deficit", "current account",
  "nonfarm payroll", "payroll", "employment", "unemployment", "labor market",
  "consumer confidence", "economic growth", "gross domestic",
  "bullion", "precious metal", "crude oil", "natural gas", "brent", "opec",
  "bitcoin", "ethereum", "crypto", "blockchain", "defi", "stablecoin",
  "dollar", "franc", "pound", "sterling", "renminbi", "forex", "currency",
  "exchange rate", "treasury", "yield curve", "bond yield", "credit rating",
  "market crash", "selloff", "sell-off", "safe haven", "risk-off", "risk on",
  "geopolit", "sanction", "tariff", "trade war", "export ban",
  "conflict", "military", "nuclear", "missile",
  "iran", "russia", "ukraine", "taiwan", "israel", "middle east",
  "north korea", "nato",
  "s&p", "nasdaq", "dow jones", "nikkei", "ftse", "dax",
  "bank failure", "debt ceiling", "default", "recession",
  "commodity", "copper", "iron ore", "wheat", "platinum",
];

function isMarketRelevant(title: string): boolean {
  const lower = title.toLowerCase();
  if (ANALYSE_NOISE_BLOCKLIST.some(p => p.test(lower))) return false;
  if (ANALYSE_BOUNDARY_RE.test(title)) return true;
  return ANALYSE_PHRASE_KEYWORDS.some(kw => lower.includes(kw));
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
    primaryFeeds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
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
  "2h": 25,
  "5h": 40,
  "12h": 55,
  "24h": 70,
};

const TIME_RANGE_LABELS: Record<string, string> = {
  "2h": "Last 2 Hours",
  "5h": "Last 5 Hours",
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
      signal: AbortSignal.timeout(3000),
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
    const pubDateMatch =
      /<pubDate><!\[CDATA\[([\s\S]*?)\]\]><\/pubDate>/.exec(block) ||
      /<pubDate>([^<]+)<\/pubDate>/.exec(block);
    const description = extractDescription(block);
    if (titleMatch && linkMatch) {
      const rawTitle = decodeHtml(titleMatch[1].trim());
      const link = linkMatch[1].trim();
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
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
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    if (!xml.includes("<item>")) return [];
    return parseRSS(xml, feed.name, feed.category);
  } catch {
    return [];
  }
}

// ─── Primary-source central bank feeds ────────────────────────────────────────
// Official press releases (Fed/ECB/BOE/BOJ) — not third-party reporting. This
// IS the market-moving event, not a paraphrase of it. Always market-relevant
// by definition, so these bypass the isMarketRelevant keyword filter below.
async function fetchCentralBankFeedsForAnalysis(): Promise<RawItem[]> {
  const results = await Promise.allSettled(
    CENTRAL_BANK_FEEDS.map(async (cb) => {
      const items = await fetchFeed({ url: cb.url, name: cb.name, category: "Central Bank" });
      return items.filter((i) => !isCentralBankNoise(i.title));
    })
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// ─── Economic calendar → pseudo-articles ──────────────────────────────────────
// Real forecast/previous/actual numbers for high/medium-impact releases —
// the single strongest predictor of forex/gold moves, far more reliable than
// headline sentiment. Converted into RawItem shape so it flows through the
// exact same scoring/prompt pipeline as everything else.
async function fetchCalendarAsArticles(): Promise<RawItem[]> {
  const events = await fetchEconomicCalendar();
  const now = Date.now();
  const windowPastMs = 12 * 60 * 60 * 1000;
  const windowFutureMs = 48 * 60 * 60 * 1000;

  const items: RawItem[] = [];
  for (const ev of events) {
    if (ev.impact !== "High" && ev.impact !== "Medium") continue;
    if (!ev.date) continue;
    const t = new Date(ev.date).getTime();
    if (isNaN(t)) continue;
    const diff = t - now;
    if (diff < -windowPastMs || diff > windowFutureMs) continue;

    const isPast = diff <= 0;
    const hasActual = !!ev.actual;
    let desc: string;
    if (hasActual) desc = `ACTUAL: ${ev.actual} | Forecast: ${ev.forecast || "n/a"} | Previous: ${ev.previous || "n/a"}`;
    else if (isPast) desc = `Forecast: ${ev.forecast || "n/a"} | Previous: ${ev.previous || "n/a"} (actual pending)`;
    else desc = `UPCOMING — Forecast: ${ev.forecast || "n/a"} | Previous: ${ev.previous || "n/a"}`;

    items.push({
      title: `[${ev.country}] ${ev.title} (${ev.impact} Impact)`,
      link: `calendar://${ev.country}-${ev.title}-${ev.date}`.replace(/\s+/g, "-"),
      pubDate: ev.date,
      source: "Economic Calendar",
      category: "Economic Data",
      description: desc,
      fullContent: desc,
    });
  }
  return items;
}


function formatToIST(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`;
}

// Map time-range label → how many H1 candles to include (keeps tokens tight)
const H1_CANDLE_COUNTS: Record<string, number> = {
  "2h": 4,
  "5h": 8,
  "12h": 14,
  "24h": 26,
};

function formatCandlesForPrompt(data: CandleSummary | null, instrument: string, timeRange: string): string {
  if (!data) return "";

  // Which symbols to include
  const syms: string[] = instrument === "ALL"
    ? ["xauusd", "xagusd", "btcusdt", "ethusd", "eurusd", "gbpusd", "usdjpy", "audusd", "nzdusd", "usdcad", "usdchf"]
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
        const dt = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")} ${String(ist.getUTCHours()).padStart(2, "0")}:00 IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }

    // H4 — last 6 candles (last 24h context)
    if (d.h4?.length) {
      const recent4 = d.h4.slice(-6);
      lines.push(`  H4 (last 6 candles):`);
      for (const c of recent4) {
        const ist = new Date((c.t * 1000) + 330 * 60 * 1000);
        const dt = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")} ${String(ist.getUTCHours()).padStart(2, "0")}:00 IST`;
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

// ─── User message builder ─────────────────────────────────────────────────────

async function buildUserMessage(
  articles: RawItem[],
  toIST: string,
  timeRangeLabel: string,
  instrument = "ALL",
  candles: CandleSummary | null = null,
  timeRange = "24h"
): Promise<string> {
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
  const candleSection = candleBlock
    ? `${candleBlock}\n\n▶ PRICE REFERENCE RULE: Upar diye gaye OHLC candle data se actual price levels directly quote karo.\n  Last H1 close = current reference price. E.g. "Gold currently at $X,XXX (last H1 close)".\n`
    : "";

  const userTemplate = await getPromptTemplate("newsAnalysis.deep.user");
  return renderTemplate(userTemplate, {
    TIME_RANGE_LABEL: timeRangeLabel,
    TO_IST: toIST,
    ARTICLE_COUNT: String(articles.length),
    CANDLE_SECTION: candleSection,
    ARTICLES_BLOCK: articlesBlock,
    EACH_INSTRUMENT_PROMPT: eachInstrumentPrompt,
    INSTRUMENTS_REQUIRED: instrumentsRequired,
  });
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

  const timeRange = (body.timeRange ?? "24h") as string;
  const timeLabel = TIME_RANGE_LABELS[timeRange] ?? "Last 24 Hours";
  const articleTarget = ARTICLE_TARGETS[timeRange] ?? 100;
  const model = body.model ?? "openai";
  const instrument = body.instrument ?? "ALL";
  const selectedLinks = body.selectedLinks ?? null;

  // ── Fetch RSS feeds + Telegram + central bank feeds + economic calendar ──────
  // Telegram (lib/news/telegram.ts) is the reliable fast-alert channel that
  // actually works once deployed to Vercel. X/Twitter fetching has been
  // removed entirely — Nitter-based fallback routinely blocked datacenter
  // IPs in production, so it was silently returning nothing on Vercel.
  // Paginated fetch — matches the requested time range instead of only the
  // first ~20 messages per channel, so high-frequency channels aren't
  // silently truncated to a sliver of the actual window.
  const telegramHours = { "2h": 2, "5h": 5, "12h": 12, "24h": 24 }[timeRange] ?? 24;
  const [feedResults, tgResult, cbItems, calendarItems] = await Promise.all([
    Promise.allSettled(FEEDS.map(f => fetchFeed(f))),
    fetchTelegramContentSince(telegramHours),
    fetchCentralBankFeedsForAnalysis(),
    fetchCalendarAsArticles(),
  ]);
  const allItems: RawItem[] = [];
  feedResults.forEach(res => { if (res.status === "fulfilled") allItems.push(...res.value); });
  allItems.push(...tgResult.items.map(i => ({ ...i, category: "Telegram", description: "", fullContent: "" })));

  // Central bank + calendar items relevant to the requested instrument (Fed/USD
  // is relevant to everything; ECB/BOE/BOJ only when their currency is in scope)
  const relevantCurrencies = instrument === "ALL"
    ? null
    : Object.entries(CURRENCY_TO_SYMBOLS).filter(([, syms]) => syms.includes(instrument)).map(([code]) => code);
  const CB_COUNTRY_MAP: Record<string, string> = {
    "Federal Reserve": "USD", "ECB": "EUR", "Bank of England": "GBP", "Bank of Japan": "JPY",
  };
  const scopedCbItems = relevantCurrencies
    ? cbItems.filter(i => relevantCurrencies.includes(CB_COUNTRY_MAP[i.source] || ""))
    : cbItems;
  const scopedCalendarItems = relevantCurrencies
    ? calendarItems.filter(i => relevantCurrencies.some(c => i.title.startsWith(`[${c}]`)))
    : calendarItems;

  // ── Deduplicate ──────────────────────────────────────────────────────────────
  const seen = new Set<string>();
  const dedupe = (items: RawItem[]) => items.filter(item => {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const deduped = dedupe(allItems);
  const dedupedCb = dedupe(scopedCbItems);
  const dedupedCalendar = dedupe(scopedCalendarItems);

  // ── Market relevance filter — remove retail stock-picking, dividend advice, etc.
  // Central bank + calendar items are always relevant by construction — skip the filter for those.
  const marketRelevant = deduped.filter(item => !isHardNoise(item.title) && isMarketRelevant(item.title));

  let articles: RawItem[] = marketRelevant;

  if (instrument !== "ALL") {
    const config = SYMBOL_CONFIG[instrument] || SYMBOL_CONFIG["XAUUSD"];
    articles = articles.filter(item => matchesKeywords(item.title, config.keywords));
  }

  // A user-provided selectedLinks list is an explicit, narrow choice from the
  // preview UI — respect it exactly rather than force-adding synthetic
  // central-bank/calendar items that couldn't have been part of that selection.
  const hasSelectedLinks = !!(selectedLinks && Array.isArray(selectedLinks) && selectedLinks.length > 0);
  if (hasSelectedLinks) {
    const linksSet = new Set(selectedLinks);
    articles = articles.filter(item => linksSet.has(item.link));
  }

  // ── Severity scoring — sort by real market-moving potential, not just recency ──
  // This is what keeps "noise" (a random blog aside) from crowding out a
  // genuine Fed statement or a beats/misses-forecast data print within the
  // fixed articleTarget token budget.
  const scored = articles.map(item => ({
    item,
    ...scoreArticle(item.title, item.description || "", item.pubDate, {
      isTier1Wire: TIER1_WIRE_NAMES.has(item.source),
      isFastAlert: item.source.startsWith("X/") || item.source.startsWith("TG/"),
    }),
  }));
  const cbScored = hasSelectedLinks ? [] : dedupedCb.map(item => ({
    item,
    ...scoreArticle(item.title, item.description || "", item.pubDate, { isPrimarySource: true }),
  }));
  const calendarScored = hasSelectedLinks ? [] : dedupedCalendar.map(item => ({
    item,
    ...scoreArticle(item.title, item.description || "", item.pubDate, {
      isCalendarEvent: true,
      calendarImpact: item.title.includes("(High Impact)") ? "High" : "Medium",
    }),
  }));

  let combined = [...scored, ...cbScored, ...calendarScored].map(({ item, score, breakdown }) => ({
    title: item.title, link: item.link, pubDate: item.pubDate, source: item.source,
    feedCategory: item.category, impactScore: score, scoreBreakdown: breakdown,
  }));
  combined = applyCorroborationBoost(combined);

  // Re-attach the corroboration-boosted score back onto the original RawItem list
  const scoreByLink = new Map(combined.map(c => [c.link, c.impactScore]));
  const allCandidates = [...scored.map(s => s.item), ...cbScored.map(s => s.item), ...calendarScored.map(s => s.item)];

  allCandidates.sort((a, b) => {
    const diff = (scoreByLink.get(b.link) ?? 0) - (scoreByLink.get(a.link) ?? 0);
    if (diff !== 0) return diff;
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : -1;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : -1;
    return tb - ta;
  });

  articles = allCandidates.slice(0, articleTarget);

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
    const origin = new URL(req.url).origin;
    const candleRes = await fetch(`${origin}/api/candle-summary`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      signal: AbortSignal.timeout(1500),
    });
    if (candleRes.ok) candles = await candleRes.json() as CandleSummary;
  } catch { /* proceed without candles */ }

  // ── Build prompt ─────────────────────────────────────────────────────────────
  const now = new Date();
  const toIST = formatToIST(now);
  const userMsg = await buildUserMessage(articles, toIST, timeLabel, instrument, candles, timeRange);

  if (body.preview === true) {
    return NextResponse.json({
      ok: true,
      news_count: articles.length,
      articles: articles.map(a => ({
        title: a.title,
        source: a.source,
        pubDate: a.pubDate,
        link: a.link,
        category: a.category,
      })),
      prompt: userMsg,
    });
  }

  const systemTemplate = await getPromptTemplate("newsAnalysis.deep.system");
  const dynamicSystemPrompt = instrument === "ALL"
    ? renderTemplate(systemTemplate, {
        INSTRUMENTS_BLOCK: "INSTRUMENTS TO COVER (ALL 11 mandatory):\nXAUUSD (Gold), XAGUSD (Silver), BTCUSDT (Bitcoin), ETHUSD (Ethereum),\nGBPUSD (GBP/USD), EURUSD (EUR/USD), USDJPY (USD/JPY),\nAUDUSD (AUD/USD), NZDUSD (NZD/USD), USDCAD (USD/CAD), USDCHF (USD/CHF)",
        ALL_INSTRUMENTS_RULE: "• ALL 11 instruments MANDATORY in instrument_analysis — skip kiya = invalid",
        INSTRUMENTS_REFERENCE_BLOCK: "HOW EACH INSTRUMENT WORKS — REFERENCE FOR ANALYSIS:\n═══════════════════════════════════════════════════════════════\n• XAUUSD: Inverse real yields (strongest driver), inverse DXY, geopolitical fear premium, ETF flows, CB buying\n• XAGUSD: Follows Gold PLUS industrial demand (China PMI, solar/EV demand, copper correlation)\n• BTCUSDT: Risk sentiment proxy, institutional ETF flows, regulatory environment, Nasdaq correlation\n• ETHUSD: Follows BTC + DeFi ecosystem health + ETF flows + staking demand\n• EURUSD: ECB vs Fed rate differential, Eurozone PMI/CPI, German economy health, risk sentiment\n• GBPUSD: BoE policy divergence from Fed, UK CPI/employment/GDP, Brexit effects, risk appetite\n• USDJPY: US-Japan 10yr yield SPREAD is the key driver — wider spread → pair ↑. BoJ intervention risk at 152+\n• AUDUSD: China growth proxy (iron ore/copper prices), RBA stance, global risk appetite, USD strength\n• NZDUSD: RBNZ, dairy commodity prices, follows AUD closely, global risk appetite\n• USDCAD: WTI crude oil INVERSE (oil ↑ → USDCAD ↓), BoC vs Fed, Canadian trade balance\n• USDCHF: CHF = ultimate safe haven. Geopolitical fear → CHF surge → USDCHF drops. SNB ceiling history",
      })
    : renderTemplate(systemTemplate, {
        INSTRUMENTS_BLOCK: `INSTRUMENT TO COVER (ONLY 1 mandatory):\n${instrument}`,
        ALL_INSTRUMENTS_RULE: `• Only ${instrument} is MANDATORY inside 'instrument_analysis' — do not include any other instruments.`,
        INSTRUMENTS_REFERENCE_BLOCK: `• ${instrument}: Deep analysis of keywords and drivers matching this instrument.`,
      });

  let rawResponse: string;

  if (model === "gemini") {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured in the environment variables." },
        { status: 500 }
      );
    }
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

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
          { role: "system", content: dynamicSystemPrompt },
          { role: "user", content: userMsg },
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
    newsCount: articles.length,
    articles: articles.map(a => ({
      title: a.title,
      source: a.source,
      pubDate: a.pubDate,
      link: a.link,
      category: a.category,
    })),
    prompt: userMsg,
    data: analysisData,
    generatedBy: userSession.user.email ?? "unknown",
    generatedAt: new Date(),
  }).save();

  return NextResponse.json({
    ok: true,
    _id: String(doc._id),
    instrument,
    news_count: articles.length,
    data: analysisData,
    articles: articles.map(a => ({
      title: a.title,
      source: a.source,
      pubDate: a.pubDate,
      link: a.link,
      category: a.category,
    })),
    prompt: userMsg,
  });
}
