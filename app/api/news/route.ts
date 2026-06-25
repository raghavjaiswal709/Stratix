import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

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

/**
 * Each entry: { url, name, category }
 * category is used for the badge shown on the card.
 */
const FEEDS: { url: string; name: string; category: string }[] = [
  // FXStreet – premier real-time forex/commodities/crypto analysis feed
  {
    url: "https://www.fxstreet.com/rss/news",
    name: "FXStreet",
    category: "Forex & Commodities",
  },
  // InvestingLive (ForexLive) – real-time breaking forex headlines
  {
    url: "https://www.forexlive.com/feed/news",
    name: "ForexLive",
    category: "Forex Breaking News",
  },
  // Investing.com – Forex News category
  {
    url: "https://www.investing.com/rss/news_1.rss",
    name: "Investing.com",
    category: "Forex News",
  },
  // Investing.com – Economy (central bank decisions, GDP, trade)
  {
    url: "https://www.investing.com/rss/news_14.rss",
    name: "Investing.com",
    category: "Economy",
  },
  // Investing.com – Economic Indicators (CPI, NFP, PMI, etc.)
  {
    url: "https://www.investing.com/rss/news_95.rss",
    name: "Investing.com",
    category: "Economic Indicators",
  },
  // Investing.com – Stock / general market news (macro risk-off/on flows)
  {
    url: "https://www.investing.com/rss/news_25.rss",
    name: "Investing.com",
    category: "Market News",
  },
  // Investing.com – Cryptocurrency News
  {
    url: "https://www.investing.com/rss/news_301.rss",
    name: "Investing.com",
    category: "Crypto",
  },
  // MarketWatch – broad US market, macro, geopolitical
  {
    url: "https://www.marketwatch.com/rss/topstories",
    name: "MarketWatch",
    category: "Market News",
  },
  // CoinDesk – specialist crypto/blockchain news
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    name: "CoinDesk",
    category: "Crypto",
  },
];

// ─── Instrument keyword filters ───────────────────────────────────────────────

/**
 * For each symbol, we define:
 *  - primaryFeeds: indices into FEEDS[] always fetched (most relevant)
 *  - secondaryFeeds: indices fetched to broaden macro/geopolitical coverage
 *  - keywords: token list — at least ONE must appear in a title (case-insensitive)
 *              to include an article. Empty → include everything from primary feeds.
 *  - googleQuery: fallback Google News RSS query
 */
const SYMBOL_CONFIG: Record<
  string,
  {
    primaryFeeds: number[];
    secondaryFeeds: number[];
    keywords: string[];
    googleQuery: string;
  }
> = {
  XAUUSD: {
    // FXStreet (0), InvestingLive (1), Investing Forex (2), Economy (3), Indicators (4), MarketWatch (7)
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "gold", "xau", "xauusd", "bullion", "precious metal",
      "safe haven", "inflation", "fed", "federal reserve", "rate",
      "dollar", "usd", "treasury", "geopolit", "conflict", "war",
      "sanction", "china", "opec", "oil", "risk off", "risk-off",
      "cpi", "nfp", "payroll", "powell", "boj", "ecb",
    ],
    googleQuery:
      '"gold price" OR "XAU/USD" OR "XAUUSD" OR "bullion" OR "safe haven demand" OR "Federal Reserve rate" OR "geopolitical tension" OR "inflation CPI" OR "US dollar" OR "gold forecast"',
  },
  XAGUSD: {
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "silver", "xag", "xagusd", "precious metal",
      "industrial demand", "manufacturing", "pmi", "inflation",
      "fed", "federal reserve", "rate", "dollar", "cpi",
      "gold", "commodity", "risk off", "risk-off",
    ],
    googleQuery:
      '"silver price" OR "XAG/USD" OR "XAGUSD" OR "industrial metal" OR "silver deficit" OR "manufacturing PMI" OR "Federal Reserve" OR "inflation CPI" OR "commodities"',
  },
  EURUSD: {
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "eur", "euro", "eurusd", "ecb", "european central bank",
      "eurozone", "germany", "france", "inflation", "cpi",
      "fed", "federal reserve", "rate hike", "rate cut",
      "dollar", "dxy", "trade", "geopolit", "ukraine",
    ],
    googleQuery:
      '"EUR/USD" OR "EURUSD" OR "ECB interest rate" OR "Eurozone CPI" OR "Federal Reserve" OR "euro dollar" OR "geopolitical risk" OR "European economy"',
  },
  GBPUSD: {
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "gbp", "pound", "gbpusd", "bank of england", "boe",
      "uk", "united kingdom", "britain", "sterling",
      "inflation", "cpi", "budget", "rate",
      "fed", "dollar", "brexit", "trade",
    ],
    googleQuery:
      '"GBP/USD" OR "GBPUSD" OR "Bank of England" OR "UK CPI" OR "British pound" OR "pound sterling" OR "UK economy" OR "UK GDP"',
  },
  USDJPY: {
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "jpy", "yen", "usdjpy", "bank of japan", "boj",
      "japan", "japanese", "intervention", "carry trade",
      "treasury", "yield", "fed", "federal reserve",
      "dollar", "rate", "inflation", "geopolit",
    ],
    googleQuery:
      '"USD/JPY" OR "USDJPY" OR "Bank of Japan" OR "yen intervention" OR "carry trade" OR "Japanese yen" OR "US Treasury yields" OR "BOJ policy"',
  },
  USDCHF: {
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "chf", "franc", "usdchf", "snb", "swiss national bank",
      "switzerland", "swiss", "safe haven",
      "fed", "dollar", "rate", "geopolit", "crisis",
    ],
    googleQuery:
      '"USD/CHF" OR "USDCHF" OR "Swiss National Bank" OR "SNB" OR "Swiss franc" OR "safe haven" OR "geopolitical crisis" OR "US dollar CHF"',
  },
  USDCAD: {
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "cad", "canadian dollar", "usdcad", "bank of canada", "boc",
      "canada", "oil", "crude", "wti", "opec",
      "fed", "dollar", "rate", "trade",
    ],
    googleQuery:
      '"USD/CAD" OR "USDCAD" OR "Bank of Canada" OR "crude oil price" OR "WTI oil" OR "OPEC" OR "Canadian dollar" OR "oil price forecast"',
  },
  AUDUSD: {
    primaryFeeds: [0, 1, 2],
    secondaryFeeds: [3, 4, 7],
    keywords: [
      "aud", "aussie", "audusd", "rba", "reserve bank of australia",
      "australia", "china", "iron ore", "commodity",
      "fed", "dollar", "rate", "inflation", "cpi",
    ],
    googleQuery:
      '"AUD/USD" OR "AUDUSD" OR "Reserve Bank of Australia" OR "RBA" OR "Australian dollar" OR "China GDP" OR "iron ore price" OR "commodity currencies"',
  },
  BTCUSD: {
    primaryFeeds: [6, 8, 0], // Crypto + CoinDesk + FXStreet
    secondaryFeeds: [3, 7],
    keywords: [
      "bitcoin", "btc", "btcusd", "crypto", "cryptocurrency",
      "blockchain", "etf", "sec", "regulation",
      "macro", "liquidity", "halving", "mining",
      "digital asset", "coinbase", "binance", "institutional",
    ],
    googleQuery:
      '"Bitcoin" OR "BTCUSD" OR "BTC/USD" OR "crypto ETF" OR "SEC crypto" OR "Bitcoin price" OR "institutional Bitcoin" OR "crypto regulation" OR "macro liquidity BTC"',
  },
  ETHUSD: {
    primaryFeeds: [6, 8, 0], // Crypto + CoinDesk + FXStreet
    secondaryFeeds: [3, 7],
    keywords: [
      "ethereum", "eth", "ethusd", "crypto", "cryptocurrency",
      "defi", "nft", "layer 2", "layer2", "ethereum etf",
      "gas fee", "blockchain", "smartcontract", "smart contract",
      "digital asset", "staking", "sec", "regulation",
    ],
    googleQuery:
      '"Ethereum" OR "ETHUSD" OR "ETH/USD" OR "Ethereum ETF" OR "DeFi" OR "Layer 2" OR "Ethereum price" OR "crypto regulation" OR "ETH staking"',
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
    .replace(/&#\d+;/g, ""); // remove remaining numeric entities
}

// ─── RSS parser ────────────────────────────────────────────────────────────────

function parseRSS(xml: string, sourceName: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    // Title: handle CDATA or plain
    const titleMatch =
      /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(block) ||
      /<title>([^<]*)<\/title>/.exec(block);
    // Link: prefer <link> tag (not atom:link)
    const linkMatch =
      /<link>([^<]+)<\/link>/.exec(block) ||
      /<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/.exec(block) ||
      /<guid[^>]*>([^<]+)<\/guid>/.exec(block);
    const pubDateMatch = /<pubDate>([^<]+)<\/pubDate>/.exec(block);

    // Source name override from <source> tag if present
    const sourceTagMatch = /<source[^>]*>([^<]*)<\/source>/.exec(block);
    const source = sourceTagMatch
      ? decodeHtml(sourceTagMatch[1].trim())
      : sourceName;

    if (titleMatch && linkMatch) {
      const rawTitle = decodeHtml(titleMatch[1].trim());
      const link = linkMatch[1].trim();
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";

      // Remove trailing " - SourceName" suffix common in Google News / FXStreet
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

// ─── Fetch a single feed ───────────────────────────────────────────────────────

async function fetchFeed(
  feed: { url: string; name: string; category: string },
  timeoutMs = 6000
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

// ─── Keyword filter ────────────────────────────────────────────────────────────

function matchesKeywords(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const lower = title.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateItems<T extends RawItem>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    // Normalise to first 60 chars of title (lowercase, strip spaces) as key
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
    "deal", "agreement", "ceasefire", "resolution", "stabilize",
  ];

  const negativePatterns = [
    "drop", "drops", "dropped", "fall", "falls", "fell", "plunge", "plunges",
    "plunged", "slump", "slumps", "slumped", "loss", "losses", "slip",
    "slips", "slipped", "decline", "declines", "declined", "crash", "crashes",
    "crashed", "sell-off", "selloff", "weakness", "weak", "lower", "downward",
    "selling", "bearish", "recession", "slowdown", "contraction", "default",
    "crisis", "debt", "deficit", "deficit", "inflation", "rate hike", "rate hikes",
    "hawkish", "tightening", "sanction", "sanctions", "trade war", "tariff",
    "tariffs", "conflict", "escalation", "escalate", "tension", "tensions",
    "shutdown", "geopolitical risk", "risk-off", "risk off", "outflows",
    "pressure", "negative", "warning", "concern", "fears", "downturn",
    "correction", "breakdown", "resistance",
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

// ─── Category inference (fallback) ────────────────────────────────────────────

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
    t.includes("russia")
  )
    return "Geopolitical";
  if (
    t.includes("fed") ||
    t.includes("ecb") ||
    t.includes("boj") ||
    t.includes("central bank") ||
    t.includes("rate hike") ||
    t.includes("rate cut") ||
    t.includes("interest rate") ||
    t.includes("monetary policy") ||
    t.includes("quantitative")
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
    t.includes("economic data")
  )
    return "Economic Data";
  if (
    t.includes("bitcoin") ||
    t.includes("ethereum") ||
    t.includes("crypto") ||
    t.includes("defi") ||
    t.includes("blockchain")
  )
    return "Crypto";
  if (
    t.includes("oil") ||
    t.includes("crude") ||
    t.includes("opec") ||
    t.includes("gold") ||
    t.includes("silver") ||
    t.includes("commodity")
  )
    return "Commodities";
  return feedCategory;
}

// ─── GET Handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "XAUUSD").toUpperCase();

  const config =
    SYMBOL_CONFIG[symbol] || SYMBOL_CONFIG["XAUUSD"];

  // Build list of feeds to fetch (primary + secondary, deduplicated)
  const feedIndices = Array.from(
    new Set([...config.primaryFeeds, ...config.secondaryFeeds])
  );
  const feedsToFetch = feedIndices.map((i) => FEEDS[i]).filter(Boolean);

  // Fetch all feeds in parallel + Google News fallback
  const [googleItems, ...feedResults] = await Promise.all([
    fetchGoogleNews(config.googleQuery),
    ...feedsToFetch.map((feed) => fetchFeed(feed)),
  ]);

  // Merge: primary feeds first (highest signal), then Google News
  const allRaw: (RawItem & { feedIdx: number })[] = [];

  feedResults.forEach((items, i) => {
    const feed = feedsToFetch[i];
    items.forEach((item) =>
      allRaw.push({ ...item, feedIdx: feedIndices[i] })
    );
    // Suppress TS unused warning
    void feed;
  });

  googleItems.forEach((item) =>
    allRaw.push({ ...item, feedIdx: -1 })
  );

  // Filter by instrument keywords (primary feeds bypass filter to always show relevant news)
  const primarySet = new Set(config.primaryFeeds);
  const filtered = allRaw.filter((item) => {
    if (primarySet.has(item.feedIdx)) {
      // For primary feeds (specialist forex/crypto sites), be lenient — only
      // exclude if clearly irrelevant (no keyword AND very short)
      if (config.keywords.length === 0) return true;
      return (
        matchesKeywords(item.title, config.keywords) || item.title.length > 30
      );
    }
    // Secondary / macro feeds: keyword-filter strictly so we only show
    // articles that actually touch this instrument's drivers
    return matchesKeywords(item.title, config.keywords);
  });

  // Deduplicate by title
  const deduped = deduplicateItems(filtered);

  // Sort by recency (most recent first); items with no pubDate go to end
  deduped.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  // Build final article list (up to 60 articles for pagination support)
  const articles: NewsArticle[] = deduped.slice(0, 60).map((item) => {
    const feedDef =
      item.feedIdx >= 0 ? FEEDS[item.feedIdx] : { category: "News" };
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
      "Cache-Control": "public, s-maxage=180, stale-while-revalidate=60",
    },
  });
}
