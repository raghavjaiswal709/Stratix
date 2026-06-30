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
  { url: "https://www.fxnewstoday.com/feed",                              name: "FXNews Today",     category: "Forex"                 }, // 28 (listed 21 slot)
  // ── NEW: Macro / Broad Market ─────────────────────────────────────────────
  { url: "https://finance.yahoo.com/rss/topfinstories",                   name: "Yahoo Finance",    category: "Market News"           }, // 22
  { url: "https://feeds.reuters.com/reuters/businessNews",                name: "Reuters",          category: "Market News"           }, // 23
  { url: "https://feeds.reuters.com/reuters/financials",                  name: "Reuters",          category: "Financial News"        }, // 24
  { url: "https://www.financemagnates.com/feed/",                         name: "Finance Magnates", category: "Forex Industry"        }, // 25
  // ── NEW: Crypto ───────────────────────────────────────────────────────────
  { url: "https://bitcoinmagazine.com/feed",                              name: "Bitcoin Magazine", category: "Crypto"                }, // 26
  { url: "https://cryptopotato.com/feed/",                                name: "CryptoPotato",     category: "Crypto"                }, // 27
];

// ─── X (Twitter) via nitter — fallback instance chain ─────────────────────────

const NITTER_INSTANCES = [
  "nitter.privacydev.net",
  "xcancel.com",
  "nitter.poast.org",
  "nitter.1d4.us",
];

const X_ACCOUNTS = [
  { handle: "FirstSquawk",    category: "Breaking Market News"   },
  { handle: "investingLive_", category: "Live Market News"       },
  { handle: "ForexFactory",   category: "Forex Calendar & Data"  },
  { handle: "markets",        category: "Bloomberg Markets"      },
  { handle: "WatcherGuru",    category: "Market & Crypto Alerts" },
  { handle: "KobeissiLetter", category: "Macro Analysis"         },
  { handle: "MacroAlerts",    category: "Macro Economic Alerts"  },
  { handle: "unusual_whales", category: "Market Sentiment"       },
  { handle: "zerohedge",      category: "Market Commentary"      },
  { handle: "Reuters",        category: "Breaking News"          },
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
    primaryFeeds: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
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

// Tries nitter instances until one responds; returns up to 12 items per handle.
async function fetchXFeed(account: { handle: string; category: string }): Promise<RawItem[]> {
  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `https://${instance}/${account.handle}/rss`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes("<item>")) continue;
      const items = parseRSS(xml, `X/@${account.handle}`);
      if (items.length > 0) return items.slice(0, 12);
    } catch { /* try next instance */ }
  }
  return [];
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
// Filters out retail stock-picking advice, dividend tips, individual company
// analysis that pollutes macro/forex/commodities/crypto market news feeds.

const MARKET_RELEVANCE_KEYWORDS = [
  "fed", "fomc", "federal reserve", "ecb", "boj", "boe", "central bank",
  "rate", "inflation", "cpi", "ppi", "gdp", "pmi", "nfp", "payroll",
  "gold", "silver", "xau", "xag", "bullion", "precious",
  "bitcoin", "ethereum", "btc", "eth", "crypto", "blockchain",
  "oil", "crude", "opec", "brent", "wti", "energy", "natural gas",
  "dollar", "usd", "dxy", "yen", "euro", "pound", "franc", "yuan", "currency", "forex",
  "eurusd", "gbpusd", "usdjpy", "audusd", "nzdusd", "usdcad", "usdchf",
  "war", "conflict", "geopolit", "sanction", "military", "iran", "russia",
  "ukraine", "china", "taiwan", "middle east", "attack", "strike",
  "tariff", "trade war", "export ban",
  "yield", "treasury", "bond", "market crash", "risk-off", "safe haven",
  "powell", "lagarde", "ueda", "hawkish", "dovish", "monetary policy",
  "bank failure", "debt", "default", "recession", "recession",
  "commodity", "copper", "iron ore", "wheat", "corn",
];

function isMarketRelevantForAll(title: string): boolean {
  const lower = title.toLowerCase();
  return MARKET_RELEVANCE_KEYWORDS.some(kw => lower.includes(kw));
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
    "strong", "optimistic", "higher", "upward", "buying", "buying interest",
    "stimulus", "easing", "rate cut", "rate cuts", "dovish", "support",
    "demand", "record high", "all-time high", "positive", "outperform",
    "growth", "expansion", "safe haven demand", "inflows", "peak", "accord",
    "deal", "agreement", "ceasefire", "resolution", "stabilize", "boost",
    "accelerate", "exceed", "beat", "above expectation", "above forecast",
  ];

  const negativePatterns = [
    "drop", "drops", "dropped", "fall", "falls", "fell", "plunge", "plunges",
    "plunged", "slump", "slumps", "slumped", "loss", "losses", "slip",
    "slips", "slipped", "decline", "declines", "declined", "crash", "crashes",
    "crashed", "sell-off", "selloff", "weakness", "weak", "lower", "downward",
    "selling", "bearish", "recession", "slowdown", "contraction", "default",
    "crisis", "debt", "deficit", "inflation", "rate hike", "rate hikes",
    "hawkish", "tightening", "sanction", "sanctions", "trade war", "tariff",
    "tariffs", "conflict", "escalation", "escalate", "tension", "tensions",
    "shutdown", "geopolitical risk", "risk-off", "risk off", "outflows",
    "pressure", "negative", "warning", "concern", "fears", "downturn",
    "correction", "breakdown", "resistance", "miss", "below expectation",
    "below forecast", "disappoints", "cut", "layoff", "bankruptcy",
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
  let impact =
    "Neutral market stance. Price consolidation or range-bound movement likely in the near term.";

  if (score > 0.1) {
    label = "Bullish";
    impact =
      "Positive market signal. Indicates upward momentum or macro/geopolitical conditions that support buying pressure.";
  } else if (score < -0.1) {
    label = "Bearish";
    impact =
      "Negative market signal. Suggests downward pressure, risk-off sentiment, or macro headwinds driving selling interest.";
  }

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
    t.includes("housing")
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
    // Fetch all RSS feeds + X/Twitter (via nitter) in parallel
    feedsToFetch = FEEDS;
    const [rssResults, xResults] = await Promise.all([
      Promise.allSettled(FEEDS.map((f) => fetchFeed(f))),
      Promise.allSettled(X_ACCOUNTS.map((a) => fetchXFeed(a))),
    ]);

    const allRaw: (RawItem & { feedIdx: number })[] = [];
    rssResults.forEach((res, i) => {
      if (res.status === "fulfilled") {
        res.value.forEach((item) => allRaw.push({ ...item, feedIdx: i }));
      }
    });
    // X posts get feedIdx = -2 (distinct from Google News = -1)
    xResults.forEach((res) => {
      if (res.status === "fulfilled") {
        res.value.forEach((item) => allRaw.push({ ...item, feedIdx: -2 }));
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

    const articles: NewsArticle[] = marketFiltered.slice(0, 120).map((item) => {
      const feedDef = item.feedIdx >= 0 ? FEEDS[item.feedIdx] : { category: item.feedIdx === -2 ? "Breaking News" : "News" };
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

  // Fetch RSS feeds + Google News + X/Twitter in parallel
  const [gnItems, xSettled, ...feedResults] = await Promise.allSettled([
    fetchGoogleNews(config.googleQuery),
    Promise.all(X_ACCOUNTS.map((a) => fetchXFeed(a))),
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

  // Merge X posts (all handles) — keyword filter handles relevance below
  if (xSettled.status === "fulfilled") {
    for (const batch of xSettled.value) {
      for (const item of batch) {
        allRaw.push({ ...item, feedIdx: -2 });
      }
    }
  }

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
    const feedDef = item.feedIdx >= 0
      ? FEEDS[item.feedIdx]
      : { category: item.feedIdx === -2 ? "Breaking News" : "News" };
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
