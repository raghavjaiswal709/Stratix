import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface RawItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// ─── Feed Definitions ─────────────────────────────────────────────────────────
//
// Index map (do NOT reorder — SYMBOL_CONFIG references by index):
//   0  FXStreet              Forex & Commodities
//   1  ForexLive             Forex Breaking News
//   2  Investing.com Forex   Forex News
//   3  Investing.com Economy Economy
//   4  Investing.com Indicators Economic Indicators
//   5  Investing.com Markets Market News
//   6  Investing.com Crypto  Crypto
//   7  MarketWatch           Market News
//   8  CoinDesk              Crypto
//   9  Kitco News            Commodities  (gold/silver specialist)
//  10  CoinTelegraph         Crypto
//  11  DailyFX               Forex & Commodities
//  12  CNBC Markets          Market News
//  13  ZeroHedge             Market News  (macro/geopolitical)
//  14  BullionVault          Commodities  (gold/silver)
//  15  Decrypt               Crypto
//  16  Investing.com Commodities Commodities
//  17  The Block             Crypto
//  18  ActionForex           Forex & Commodities
//  19  AP Business           Market News
//  20  FXEmpire              Forex & Commodities
//  21  ForexCrunch           Forex Analysis
//  22  Yahoo Finance         Market News
//  23  Reuters Business      Market News
//  24  Reuters Financials    Financial News
//  25  Finance Magnates      Forex Industry
//  26  Bitcoin Magazine      Crypto
//  27  CryptoPotato          Crypto
//  28  FXNews Today          Forex

const FEEDS: { url: string; name: string; category: string }[] = [
  // ── Forex & Macro ──────────────────────────────────────────────────────────
  { url: "https://www.fxstreet.com/rss/news",                             name: "FXStreet",         category: "Forex & Commodities"   }, // 0
  { url: "https://www.forexlive.com/feed/news",                           name: "ForexLive",        category: "Forex Breaking News"   }, // 1
  { url: "https://www.investing.com/rss/news_1.rss",                      name: "Investing.com",    category: "Forex News"            }, // 2
  { url: "https://www.investing.com/rss/news_14.rss",                     name: "Investing.com",    category: "Economy"               }, // 3
  { url: "https://www.investing.com/rss/news_95.rss",                     name: "Investing.com",    category: "Economic Indicators"   }, // 4
  { url: "https://www.investing.com/rss/news_25.rss",                     name: "Investing.com",    category: "Market News"           }, // 5
  // ── Crypto ────────────────────────────────────────────────────────────────
  { url: "https://www.investing.com/rss/news_301.rss",                    name: "Investing.com",    category: "Crypto"                }, // 6
  // ── Broad Market ──────────────────────────────────────────────────────────
  { url: "https://www.marketwatch.com/rss/topstories",                    name: "MarketWatch",      category: "Market News"           }, // 7
  // ── Crypto specialist ─────────────────────────────────────────────────────
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/",               name: "CoinDesk",         category: "Crypto"                }, // 8
  // ── Gold / Silver specialist ──────────────────────────────────────────────
  { url: "https://www.kitco.com/news_rss/kitco_news_home.rss",            name: "Kitco",            category: "Commodities"           }, // 9
  // ── Crypto specialist ─────────────────────────────────────────────────────
  { url: "https://cointelegraph.com/rss",                                 name: "CoinTelegraph",    category: "Crypto"                }, // 10
  // ── Forex analysis ────────────────────────────────────────────────────────
  { url: "https://www.dailyfx.com/feeds/all-news",                        name: "DailyFX",          category: "Forex & Commodities"   }, // 11
  // ── Broad market / macro ──────────────────────────────────────────────────
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",          name: "CNBC",             category: "Market News"           }, // 12
  { url: "https://feeds.feedburner.com/zerohedge/feed",                   name: "ZeroHedge",        category: "Market News"           }, // 13
  // ── Gold / Silver specialist ──────────────────────────────────────────────
  { url: "https://www.bullionvault.com/gold-news/rss/gold-news.xml",      name: "BullionVault",     category: "Commodities"           }, // 14
  // ── Crypto specialist ─────────────────────────────────────────────────────
  { url: "https://decrypt.co/feed",                                       name: "Decrypt",          category: "Crypto"                }, // 15
  // ── Commodities ───────────────────────────────────────────────────────────
  { url: "https://www.investing.com/rss/news_4.rss",                      name: "Investing.com",    category: "Commodities"           }, // 16
  // ── Crypto specialist ─────────────────────────────────────────────────────
  { url: "https://www.theblock.co/rss",                                   name: "The Block",        category: "Crypto"                }, // 17
  // ── Forex analysis ────────────────────────────────────────────────────────
  { url: "https://actionforex.com/feed/",                                 name: "ActionForex",      category: "Forex & Commodities"   }, // 18
  // ── AP Business ───────────────────────────────────────────────────────────
  { url: "https://feeds.feedburner.com/AP/business",                      name: "AP Business",      category: "Market News"           }, // 19
  // ── Forex / Commodities analysis ──────────────────────────────────────────
  { url: "https://www.fxempire.com/api/v1/en/article/feed",               name: "FXEmpire",         category: "Forex & Commodities"   }, // 20
  // ── NEW: Additional Forex ─────────────────────────────────────────────────
  { url: "https://www.forexcrunch.com/feed/",                             name: "ForexCrunch",      category: "Forex Analysis"        }, // 21
  { url: "https://www.fxnewstoday.com/feed",                              name: "FXNews Today",     category: "Forex"                 }, // 22
  // ── NEW: Macro / Broad Market ─────────────────────────────────────────────
  { url: "https://finance.yahoo.com/rss/topfinstories",                   name: "Yahoo Finance",    category: "Market News"           }, // 23
  { url: "https://feeds.reuters.com/reuters/businessNews",                name: "Reuters",          category: "Market News"           }, // 24
  { url: "https://feeds.reuters.com/reuters/financials",                  name: "Reuters",          category: "Financial News"        }, // 25
  { url: "https://www.financemagnates.com/feed/",                         name: "Finance Magnates", category: "Forex Industry"        }, // 26
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",                name: "WSJ Markets",      category: "Market News"           }, // 27  ← Wall Street Journal
  { url: "https://www.benzinga.com/news/feed",                            name: "Benzinga",         category: "Market News"           }, // 28  ← fast breaking news
  { url: "https://seekingalpha.com/market_currents.xml",                  name: "Seeking Alpha",    category: "Market News"           }, // 29  ← market currents/alerts
  // ── NEW: Crypto ───────────────────────────────────────────────────────────
  { url: "https://bitcoinmagazine.com/feed",                              name: "Bitcoin Magazine", category: "Crypto"                }, // 30
  { url: "https://cryptopotato.com/feed/",                                name: "CryptoPotato",     category: "Crypto"                }, // 31
  { url: "https://www.newsbtc.com/feed/",                                 name: "NewsBTC",          category: "Crypto"                }, // 32
  { url: "https://cryptonews.com/news/feed/",                             name: "CryptoNews",       category: "Crypto"                }, // 33
  { url: "https://watcherguru.com/feed/",                                 name: "WatcherGuru",      category: "Crypto"                }, // 34  ← crypto/market alerts
];

// ─── Instrument keyword filters ───────────────────────────────────────────────

const SYMBOL_CONFIG: Record<
  string,
  {
    primaryFeeds: number[];
    secondaryFeeds: number[];
    keywords: string[];
    googleQuery: string;
  }
> = {
  // ── ALL ── special: no keyword filter, all feeds ───────────────────────────
  ALL: {
    primaryFeeds: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34],
    secondaryFeeds: [],
    keywords: [], // empty = include everything
    googleQuery: "",
  },

  // ── Gold ──────────────────────────────────────────────────────────────────
  XAUUSD: {
    primaryFeeds: [0, 1, 9, 14, 16],       // FXStreet, ForexLive, Kitco, BullionVault, Inv.Commodities
    secondaryFeeds: [3, 4, 5, 7, 11, 12, 13, 18], // Economy, Indicators, MarketWatch, DailyFX, CNBC, ZeroHedge, ActionForex
    keywords: [
      "gold", "xau", "xauusd", "bullion", "yellow metal",
    ],
    googleQuery:
      '"gold price" OR "XAU/USD" OR "XAUUSD" OR "bullion" OR "yellow metal"',
  },

  // ── Silver ────────────────────────────────────────────────────────────────
  XAGUSD: {
    primaryFeeds: [0, 1, 9, 14, 16],       // FXStreet, ForexLive, Kitco, BullionVault, Inv.Commodities
    secondaryFeeds: [3, 4, 5, 7, 11, 13],
    keywords: [
      "silver", "xag", "xagusd",
    ],
    googleQuery:
      '"silver price" OR "XAG/USD" OR "XAGUSD" OR "silver spot"',
  },

  // ── EUR/USD ───────────────────────────────────────────────────────────────
  EURUSD: {
    primaryFeeds: [0, 1, 2, 11, 18],       // FXStreet, ForexLive, Inv.Forex, DailyFX, ActionForex
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: [
      "eur", "euro", "eurusd", "eur/usd",
    ],
    googleQuery:
      '"EUR/USD" OR "EURUSD" OR "euro dollar"',
  },

  // ── GBP/USD ───────────────────────────────────────────────────────────────
  GBPUSD: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: [
      "gbp", "pound", "gbpusd", "gbp/usd", "sterling",
    ],
    googleQuery:
      '"GBP/USD" OR "GBPUSD" OR "Pound Sterling" OR "sterling pound"',
  },

  // ── USD/JPY ───────────────────────────────────────────────────────────────
  USDJPY: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: [
      "jpy", "yen", "usdjpy", "usd/jpy",
    ],
    googleQuery:
      '"USD/JPY" OR "USDJPY" OR "dollar yen"',
  },

  // ── USD/CHF ───────────────────────────────────────────────────────────────
  USDCHF: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7, 12, 13],
    keywords: [
      "chf", "franc", "usdchf", "usd/chf", "swiss franc",
    ],
    googleQuery:
      '"USD/CHF" OR "USDCHF" OR "Swiss franc"',
  },

  // ── USD/CAD ───────────────────────────────────────────────────────────────
  USDCAD: {
    primaryFeeds: [0, 1, 2, 11, 16, 18],   // Added Inv.Commodities (oil)
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: [
      "cad", "loonie", "usdcad", "usd/cad", "canadian dollar",
    ],
    googleQuery:
      '"USD/CAD" OR "USDCAD" OR "Canadian dollar" OR "loonie"',
  },

  // ── AUD/USD ───────────────────────────────────────────────────────────────
  AUDUSD: {
    primaryFeeds: [0, 1, 2, 11, 16, 18],
    secondaryFeeds: [3, 4, 5, 7, 12],
    keywords: [
      "aud", "aussie", "audusd", "aud/usd", "australian dollar",
    ],
    googleQuery:
      '"AUD/USD" OR "AUDUSD" OR "Australian dollar" OR "Aussie dollar"',
  },

  // ── NZD/USD ───────────────────────────────────────────────────────────────
  NZDUSD: {
    primaryFeeds: [0, 1, 2, 11, 18],
    secondaryFeeds: [3, 4, 5, 7],
    keywords: [
      "nzd", "kiwi", "nzdusd", "nzd/usd", "new zealand dollar",
    ],
    googleQuery:
      '"NZD/USD" OR "NZDUSD" OR "New Zealand dollar" OR "kiwi dollar"',
  },

  // ── Bitcoin ───────────────────────────────────────────────────────────────
  BTCUSD: {
    primaryFeeds: [6, 8, 10, 15, 17],  // Inv.Crypto, CoinDesk, CoinTelegraph, Decrypt, TheBlock
    secondaryFeeds: [0, 5, 7, 12, 13],
    keywords: [
      "bitcoin", "btc", "btcusd", "btcusdt",
    ],
    googleQuery:
      '"Bitcoin" OR "BTCUSD" OR "BTC/USD" OR "Bitcoin price"',
  },

  // ── Ethereum ──────────────────────────────────────────────────────────────
  ETHUSD: {
    primaryFeeds: [6, 8, 10, 15, 17],
    secondaryFeeds: [0, 5, 7, 12],
    keywords: [
      "ethereum", "eth", "ethusd", "eth/usd",
    ],
    googleQuery:
      '"Ethereum" OR "ETHUSD" OR "ETH/USD" OR "Ethereum price"',
  },

  // ── BTCUSDT alias ─────────────────────────────────────────────────────────
  BTCUSDT: {
    primaryFeeds: [6, 8, 10, 15, 17],
    secondaryFeeds: [0, 5, 7, 12, 13],
    keywords: [
      "bitcoin", "btc", "btcusd", "btcusdt",
    ],
    googleQuery:
      '"Bitcoin" OR "BTCUSDT" OR "BTC/USDT" OR "Bitcoin price"',
  },
};

// ─── HTML entity decoder ───────────────────────────────────────────────────────

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
}

// ─── RSS parser ────────────────────────────────────────────────────────────────

function parseRSS(xml: string, sourceName: string): RawItem[] {
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

    const sourceTagMatch = /<source[^>]*>([^<]*)<\/source>/.exec(block);
    const source = sourceTagMatch
      ? decodeHtml(sourceTagMatch[1].trim())
      : sourceName;

    if (titleMatch && linkMatch) {
      const rawTitle = decodeHtml(titleMatch[1].trim());
      const link = linkMatch[1].trim();
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";

      let title = rawTitle;
      const dashIdx = title.lastIndexOf(" - ");
      if (
        dashIdx !== -1 &&
        dashIdx > title.length * 0.5 &&
        title.length - dashIdx < 40
      ) {
        title = title.substring(0, dashIdx).trim();
      }

      if (title.length > 5) {
        items.push({ title, link, pubDate, source });
      }
    }
  }

  return items;
}

// ─── Feed fetcher ──────────────────────────────────────────────────────────────

async function fetchFeed(
  feed: { url: string; name: string; category: string },
  timeoutMs = 7000
): Promise<RawItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return [];
    const xml = await res.text();
    if (!xml.includes("<item>")) return [];
    return parseRSS(xml, feed.name);
  } catch {
    return [];
  }
}


// ─── Google News fallback ──────────────────────────────────────────────────────

async function fetchGoogleNews(query: string): Promise<RawItem[]> {
  if (!query) return [];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, "Google News");
  } catch {
    return [];
  }
}

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

// ─── Market relevance filter (for ALL mode) ───────────────────────────────────
// Two-part filter:
//  1. Hard blocklist — patterns that are definitively NOT trading-relevant news
//  2. Positive match — word-boundary regex for short words (prevents "frustrated"
//     matching "rate", "bond" matching "abandoned", "war" matching "forward", etc.)
//     plus includes() for longer unambiguous phrases.

const NOISE_BLOCKLIST = [
  /\bfrustrat\w*/,          // "frustrated", "frustrating" (triggers "rate" substring)
  /\bhom(e|es)\s+buyer/,   // "home buyer", "homes buyer" (retail housing advice)
  /\bhomebuy\w+/,           // "homebuyer"
  /\bhomes?\s+(remain|unsold|for\s+sale)\b/, // "homes remain unsold"
  /\btips?\s+for\b/,        // "tips for buying"
  /\bhow\s+to\s+(buy|save|invest|afford)\b/,
  /\bhoroscope\b/,
  /\brecipe\b/,
  /\bcelebrity\b/,
  /\bwedding\b/,
  /\bpregnant\b/,
  /\bdivorce\b/,
  /\blifestyle\b/,
  /\bfashion\b/,
  /\bvaccine\b(?!.*\b(economy|market|gdp)\b)/, // vaccine news unless economic context
];

// Short words that must use word-boundary check (avoids false-positive substrings)
const BOUNDARY_KW_RE = /\b(fed|fomc|ecb|boj|boe|rba|rbnz|snb|pboc|g7|g20|cpi|ppi|pmi|gdp|nfp|ism|lng|wti|dxy|usd|eur|gbp|jpy|cad|aud|nzd|chf|xau|xag|btc|eth|oil|gas|gold|corn|bond|yuan|yen|war|nato)\b/i;

// Longer phrases — safe to use substring matching
const PHRASE_KEYWORDS = [
  "federal reserve", "central bank", "interest rate", "rate cut", "rate hike",
  "monetary policy", "hawkish", "dovish", "quantitative", "powell", "lagarde",
  "ueda", "bailey", "inflation", "deflation", "stagflation",
  "consumer price", "producer price", "housing starts", "housing permits",
  "durable goods", "retail sales", "trade deficit", "current account",
  "nonfarm payroll", "payroll", "employment", "unemployment", "labor market",
  "consumer confidence", "business confidence", "economic growth", "gross domestic",
  "bullion", "precious metal", "crude oil", "natural gas", "brent", "opec",
  "bitcoin", "ethereum", "crypto", "blockchain", "defi", "stablecoin", "altcoin",
  "dollar", "franc", "pound", "sterling", "renminbi", "forex", "currency",
  "exchange rate", "treasury", "yield curve", "bond yield", "credit rating",
  "market crash", "selloff", "sell-off", "safe haven", "risk-off", "risk on",
  "geopolit", "sanction", "tariff", "trade war", "export ban",
  "conflict", "military", "nuclear", "missile",
  "iran", "russia", "ukraine", "taiwan", "israel", "middle east",
  "s&p", "nasdaq", "dow jones", "nikkei", "ftse", "dax",
  "bank failure", "debt ceiling", "default", "recession",
  "commodity", "copper", "iron ore", "wheat",
];

function isMarketRelevantForAll(title: string): boolean {
  const lower = title.toLowerCase();
  if (NOISE_BLOCKLIST.some(p => p.test(lower))) return false;
  if (BOUNDARY_KW_RE.test(title)) return true;
  return PHRASE_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateItems<T extends RawItem>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Context-aware market impact generator ────────────────────────────────────

function generateMarketImpact(title: string, sentiment: "Bullish" | "Bearish" | "Neutral"): string {
  const t = title.toLowerCase();
  const B = sentiment === "Bullish";
  const S = sentiment === "Bearish";

  // Fed / FOMC / US rates
  if (/\b(fed|fomc|federal reserve|powell|rate cut|rate hike|dot plot|basis point)\b/.test(t)) {
    if (S) return "Hawkish Fed → USD ↑, Gold ↓, 10yr yield ↑. EURUSD ↓, USDJPY ↑. Rate cuts priced out.";
    if (B) return "Dovish Fed → USD softens, Gold ↑, rate cut bets rise. EURUSD ↑, risk assets bid.";
    return "Fed signal → DXY + Treasury yield repricing. Watch Gold (inverse DXY), USDJPY (yield spread), EURUSD.";
  }
  // ECB / Euro
  if (/\b(ecb|lagarde|eurozone|euro area|euro zone)\b/.test(t)) {
    if (B) return "EUR ↑ → EURUSD ↑. ECB hawkish premium vs Fed widens. EURGBP, EURJPY follow.";
    if (S) return "EUR ↓ → EURUSD selling. ECB dovish widens rate gap vs Fed. EURGBP, EURJPY drag.";
    return "ECB → EURUSD and EUR crosses primary. ECB/Fed rate differential determines direction.";
  }
  // BoJ / JPY
  if (/\b(boj|bank of japan|ueda|yen)\b/.test(t) || /\bjpy\b/i.test(title)) {
    if (B) return "JPY ↑ → USDJPY ↓. Yen carry unwind risk: AUD, NZD, equities may sell off globally.";
    if (S) return "JPY ↓ → USDJPY ↑. Carry trades active. BoJ intervention risk builds above 152–155.";
    return "BoJ/JPY → USDJPY primary (US–Japan yield spread driver). Carry trade implications for risk assets.";
  }
  // BoE / GBP
  if (/\b(boe|bank of england|bailey|sterling)\b/.test(t) || /\bgbp\b/i.test(title)) {
    if (B) return "GBP ↑ → GBPUSD ↑. BoE hawkish vs Fed. EURGBP may drop on GBP outperformance.";
    if (S) return "GBP ↓ → GBPUSD ↓. BoE cut expectations rise, rate gap vs Fed widens against GBP.";
    return "GBP/BoE → GBPUSD primary. UK–US yield differential and risk appetite determine direction.";
  }
  // RBA / AUD
  if (/\b(rba|reserve bank of australia|aussie)\b/.test(t) || /\baud\b/i.test(title)) {
    if (B) return "AUD ↑ → AUDUSD ↑. RBA hawkish or China growth positive. Risk-on signal for commodity FX.";
    if (S) return "AUD ↓ → AUDUSD ↓. RBA dovish or China slowdown fears. Commodity FX under pressure.";
    return "AUD/RBA → AUDUSD primary. China PMI and iron ore prices are secondary drivers.";
  }
  // CPI / Inflation
  if (/\b(cpi|inflation|consumer price|ppi|producer price|deflation|stagflation)\b/.test(t)) {
    if (S) return "Hot inflation → rate hike fears ↑. USD ↑, Gold ↓, bonds sell. EURUSD ↓, USDJPY ↑. Stagflation risk.";
    if (B) return "Cooling inflation → rate cut path opens. Gold ↑, USD softens. EURUSD ↑. Risk-on equities.";
    return "CPI/inflation → rate path repricing. Gold (real yields), DXY, bonds all react. Key macro driver.";
  }
  // NFP / Jobs
  if (/\b(nfp|payroll|nonfarm|employment|unemployment|jobs? (report|data|market)|labor market)\b/.test(t)) {
    if (B) return "Strong jobs → Fed stays higher longer. USD ↑, Gold ↓, USDJPY ↑. Rate cut timeline pushed out.";
    if (S) return "Weak jobs → recession risk ↑. Gold ↑, USD ↓, rate cuts expected sooner. Safe havens bid.";
    return "NFP/jobs → Fed rate path + USD outlook. Gold (inverse USD), USDJPY (yield spread) key movers.";
  }
  // GDP / PMI / Growth
  if (/\b(gdp|pmi|ism|retail sales|economic growth|recession|contraction|gross domestic)\b/.test(t)) {
    if (B) return "Strong growth → risk-on. AUD/NZD ↑, equities ↑. USD mixed. Gold softens unless geopolitical.";
    if (S) return "Weak growth → recession risk ↑. Gold ↑, JPY ↑, CHF ↑. AUD/NZD/EM currencies under pressure.";
    return "Growth/PMI → global risk sentiment. Commodity currencies (AUD, CAD, NZD) most sensitive to data.";
  }
  // Gold / Bullion
  if (/\b(gold|xau|bullion|precious metal|gold price)\b/.test(t)) {
    if (B) return "Gold ↑ — safe-haven demand / USD weakness / real yield drop. Silver often follows with leverage.";
    if (S) return "Gold ↓ — USD strength / rising real yields / risk-on sentiment reduces haven demand.";
    return "Gold signal → watch DXY + 10yr TIPS yield (strongest inverse correlations). ETF flows confirm direction.";
  }
  // Silver
  if (/\b(silver|xag)\b/.test(t)) {
    if (B) return "Silver ↑ — follows Gold + industrial demand (solar/EV). China PMI secondary driver. More volatile than Gold.";
    if (S) return "Silver ↓ — dual pressure: Gold weakness + industrial slowdown fears. Amplified Gold moves.";
    return "Silver → Gold (monetary) + industrial cycle (PMI, China). Moves amplified vs Gold.";
  }
  // Oil / Energy
  if (/\b(crude|brent|opec|petroleum|natural gas)\b/.test(t) || /\bwti\b/i.test(title) || /\boil\b/.test(t)) {
    if (B) return "Oil ↑ → USDCAD ↓ (CAD strengthens). Inflation expectations ↑. Energy sector tailwind.";
    if (S) return "Oil ↓ → USDCAD ↑ (CAD weakens). Deflationary pressure. Commodity FX (AUD, CAD) vulnerable.";
    return "Oil/energy → USDCAD primary (inverse). Secondary: inflation path, AUD, global risk sentiment.";
  }
  // Crypto
  if (/\b(bitcoin|ethereum|crypto|cryptocurrency|blockchain|defi|stablecoin)\b/.test(t)) {
    if (B) return "Crypto ↑ — BTC leads, ETH follows. Institutional/ETF catalyst = risk-on. Nasdaq correlation 0.7+.";
    if (S) return "Crypto ↓ — regulatory/macro headwind. Risk-off signal. Watch Nasdaq for equity correlation.";
    return "Crypto signal → BTC/ETH primary. Risk sentiment proxy. ETF flows + regulatory environment key.";
  }
  // Geopolitical
  if (/\b(war|conflict|sanction|military|geopolit|middle east|ukraine|russia|iran|israel|attack|nuclear|missile)\b/.test(t)) {
    if (S) return "Geopolitical risk ↑ → safe havens: Gold ↑, JPY ↑, CHF ↑. Risk-off: AUD/NZD/BTC/equities ↓.";
    if (B) return "Geopolitical de-escalation → Gold ↓ (haven unwind). Risk appetite returns: AUD/NZD/equities ↑.";
    return "Geopolitical event → safe haven demand (Gold, JPY, CHF) vs risk assets. Escalation = most impactful.";
  }
  // China / Trade
  if (/\b(tariff|trade war|trade deal|export ban|supply chain)\b/.test(t)) {
    if (S) return "Trade tension ↑ → AUD/NZD ↓ (China proxies). Gold ↑, risk-off. Iron ore, copper fall.";
    if (B) return "Trade deal/relief → AUD/NZD ↑ (China growth proxies). Commodity FX benefits. Risk-on.";
    return "Trade/tariff news → AUD primary (China proxy), then NZD, commodity prices. Global risk driver.";
  }

  // Generic fallbacks
  if (B) return "Risk-on signal → USD typically softens, risk assets bid. Monitor correlated pairs for follow-through.";
  if (S) return "Risk-off signal → safe havens (Gold, JPY, CHF) bid. AUD/NZD/crypto under selling pressure.";
  return "Market development → watch DXY, 10yr yield, Gold for cross-asset direction confirmation.";
}

// ─── Sentiment analysis ────────────────────────────────────────────────────────

function analyzeSentiment(title: string): {
  score: number;
  label: "Bullish" | "Bearish" | "Neutral";
  impact: string;
} {
  const text = title.toLowerCase();

  const positivePatterns = [
    "surge", "surges", "surged", "rally", "rallies", "gain", "gains",
    "gained", "rise", "rises", "rose", "jump", "jumps", "jumped", "soar",
    "soars", "soared", "climb", "climbs", "climbed", "advance", "advances",
    "recovery", "recovers", "rebound", "rebounds", "breakout", "bullish",
    "strong", "optimistic", "higher", "upward", "buying interest",
    "stimulus", "easing", "rate cut", "rate cuts", "dovish", "support",
    "demand", "record high", "all-time high", "outperform",
    "expansion", "safe haven demand", "inflows", "accord",
    "deal", "agreement", "ceasefire", "resolution", "stabilize", "boost",
    "accelerate", "exceed", "beat", "above expectation", "above forecast",
  ];

  const negativePatterns = [
    "drop", "drops", "dropped", "fall", "falls", "fell", "plunge", "plunges",
    "plunged", "slump", "slumps", "slumped", "loss", "losses", "slip",
    "slips", "slipped", "decline", "declines", "declined", "crash", "crashes",
    "crashed", "sell-off", "selloff", "weakness", "weak", "lower", "downward",
    "selling", "bearish", "recession", "slowdown", "contraction", "default",
    "crisis", "deficit", "rate hike", "rate hikes",
    "hawkish", "tightening", "sanction", "sanctions", "trade war", "tariff",
    "tariffs", "conflict", "escalation", "escalate", "tension", "tensions",
    "shutdown", "geopolitical risk", "risk-off", "risk off", "outflows",
    "pressure", "warning", "concern", "fears", "downturn",
    "correction", "breakdown", "miss", "below expectation",
    "below forecast", "disappoints", "layoff", "bankruptcy",
  ];

  let posScore = 0;
  let negScore = 0;

  for (const p of positivePatterns) {
    if (text.includes(p)) posScore += 1;
  }
  for (const p of negativePatterns) {
    if (text.includes(p)) negScore += 1;
  }

  const total = posScore + negScore;
  const score = total > 0 ? (posScore - negScore) / total : 0;

  let label: "Bullish" | "Bearish" | "Neutral" = "Neutral";
  if (score > 0.1) label = "Bullish";
  else if (score < -0.1) label = "Bearish";

  const impact = generateMarketImpact(title, label);
  return { score, label, impact };
}

// ─── Category inference ────────────────────────────────────────────────────────

function inferCategory(title: string, feedCategory: string): string {
  const t = title.toLowerCase();
  if (
    t.includes("war") ||
    t.includes("conflict") ||
    t.includes("sanction") ||
    t.includes("geopolit") ||
    t.includes("military") ||
    t.includes("nato") ||
    t.includes("ukraine") ||
    t.includes("middle east") ||
    t.includes("iran") ||
    t.includes("russia") ||
    t.includes("china") && (t.includes("tension") || t.includes("taiwan"))
  )
    return "Geopolitical";
  if (
    t.includes("fed") ||
    t.includes("ecb") ||
    t.includes("boj") ||
    t.includes("boe") ||
    t.includes("rba") ||
    t.includes("rbnz") ||
    t.includes("snb") ||
    t.includes("central bank") ||
    t.includes("rate hike") ||
    t.includes("rate cut") ||
    t.includes("interest rate") ||
    t.includes("monetary policy") ||
    t.includes("quantitative") ||
    t.includes("fomc") ||
    t.includes("powell") ||
    t.includes("lagarde")
  )
    return "Central Bank";
  if (
    t.includes("cpi") ||
    t.includes("inflation") ||
    t.includes("nfp") ||
    t.includes("payroll") ||
    t.includes("gdp") ||
    t.includes("pmi") ||
    t.includes("employment") ||
    t.includes("jobs") ||
    t.includes("economic data") ||
    t.includes("retail sales") ||
    t.includes("consumer price") ||
    t.includes("producer price") ||
    t.includes("ppi") ||
    t.includes("ism") ||
    t.includes("housing starts") ||
    t.includes("housing permits") ||
    t.includes("durable goods") ||
    t.includes("trade deficit") ||
    t.includes("current account") ||
    t.includes("consumer confidence") ||
    t.includes("nonfarm")
  )
    return "Economic Data";
  if (
    t.includes("bitcoin") ||
    t.includes("ethereum") ||
    t.includes("crypto") ||
    t.includes("defi") ||
    t.includes("blockchain") ||
    t.includes("nft") ||
    t.includes("altcoin") ||
    t.includes("token") ||
    t.includes("stablecoin") ||
    t.includes("web3")
  )
    return "Crypto";
  if (
    t.includes("oil") ||
    t.includes("crude") ||
    t.includes("opec") ||
    t.includes("gold") ||
    t.includes("silver") ||
    t.includes("commodity") ||
    t.includes("bullion") ||
    t.includes("copper") ||
    t.includes("iron ore") ||
    t.includes("natural gas") ||
    t.includes("lng") ||
    t.includes("wheat") ||
    t.includes("energy")
  )
    return "Commodities";
  return feedCategory;
}

// ─── GET Handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "XAUUSD").toUpperCase();

  // ALL mode: fetch every feed, no keyword filter, return 100 articles
  const isAll = symbol === "ALL";
  const config = SYMBOL_CONFIG[symbol] || SYMBOL_CONFIG["XAUUSD"];

  let feedsToFetch: typeof FEEDS;
  let googleItems: RawItem[] = [];

  if (isAll) {
    // Fetch all 35 RSS feeds in parallel
    feedsToFetch = FEEDS;
    const rssResults = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));

    const allRaw: (RawItem & { feedIdx: number })[] = [];
    rssResults.forEach((res, i) => {
      if (res.status === "fulfilled") {
        res.value.forEach((item) => allRaw.push({ ...item, feedIdx: i }));
      }
    });

    const deduped = deduplicateItems(allRaw);

    // Apply market-relevance filter: remove retail stock-picking, dividend tips, etc.
    const marketFiltered = deduped.filter(item => isMarketRelevantForAll(item.title));

    marketFiltered.sort((a, b) => {
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return tb - ta;
    });

    const articles: NewsArticle[] = marketFiltered.slice(0, 150).map((item) => {
      const feedDef = item.feedIdx >= 0 ? FEEDS[item.feedIdx] : { category: "News" };
      const category = inferCategory(item.title, feedDef.category || "News");
      const { score, label, impact } = analyzeSentiment(item.title);
      return {
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        source: item.source,
        sentiment: label,
        sentimentScore: score,
        marketImpact: impact,
        category,
      };
    });

    return NextResponse.json(articles, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  }

  // Symbol-specific mode
  const feedIndices = Array.from(
    new Set([...config.primaryFeeds, ...config.secondaryFeeds])
  );
  feedsToFetch = feedIndices.map((i) => FEEDS[i]).filter(Boolean);

  // Fetch RSS feeds + Google News in parallel
  const [gnItems, ...feedResults] = await Promise.allSettled([
    fetchGoogleNews(config.googleQuery),
    ...feedsToFetch.map((feed) => fetchFeed(feed)),
  ]);

  if (gnItems.status === "fulfilled") googleItems = gnItems.value;

  const allRaw: (RawItem & { feedIdx: number })[] = [];

  feedResults.forEach((res, i) => {
    if (res.status === "fulfilled") {
      res.value.forEach((item) =>
        allRaw.push({ ...item, feedIdx: feedIndices[i] })
      );
    }
  });
  googleItems.forEach((item) => allRaw.push({ ...item, feedIdx: -1 }));

  // Keyword filter
  const filtered = allRaw.filter((item) => {
    return matchesKeywords(item.title, config.keywords);
  });

  const deduped = deduplicateItems(filtered);

  deduped.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  const articles: NewsArticle[] = deduped.slice(0, 80).map((item) => {
    const feedDef = item.feedIdx >= 0 ? FEEDS[item.feedIdx] : { category: "News" };
    const category = inferCategory(item.title, feedDef.category || "News");
    const { score, label, impact } = analyzeSentiment(item.title);
    return {
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source,
      sentiment: label,
      sentimentScore: score,
      marketImpact: impact,
      category,
    };
  });

  return NextResponse.json(articles, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}
