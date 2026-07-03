import { NextRequest, NextResponse } from "next/server";
import {
  scoreArticle,
  applyCorroborationBoost,
  isHardNoise,
  DEFAULT_IMPACT_THRESHOLD,
  TIER1_WIRE_NAMES,
} from "@/lib/news/scoring";
import { CENTRAL_BANK_FEEDS, isCentralBankNoise } from "@/lib/news/central-banks";
import { fetchEconomicCalendar, calendarEventsToArticles, CURRENCY_TO_SYMBOLS } from "@/lib/news/calendar";
import type { ScoredItem, NewsArticle as SharedNewsArticle } from "@/lib/news/types";

export const runtime = "edge";
export const maxDuration = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

type NewsArticle = SharedNewsArticle;

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
//  22  FXNews Today          Forex
//  23  Yahoo Finance         Market News
//  24  Reuters Business      Market News
//  25  Reuters Financials    Financial News
//  26  Finance Magnates      Forex Industry
//  27  WSJ Markets           Market News
//  28  Benzinga              Market News
//  29  Seeking Alpha         Market News
//  30  Bitcoin Magazine      Crypto
//  31  CryptoPotato          Crypto
//  32  NewsBTC               Crypto
//  33  CryptoNews            Crypto
//  34  WatcherGuru           Crypto
//  35  Bloomberg Markets     Market News   ← wire-speed breaking
//  36  TradingEconomics      Economic Data ← real-time data releases
//  37  OilPrice.com          Commodities   ← energy specialist
//  38  Mining.com            Commodities   ← metals/mining
//  39  Crypto Briefing       Crypto
//  40  Blockworks            Crypto        ← institutional crypto
//  41  The Defiant           Crypto        ← DeFi specialist
//  42  Pound Sterling Live   Forex         ← GBP specialist
//  43  Myfxbook              Forex         ← FX data provider
//  44  FX Leaders            Forex         ← signals & analysis
//  45  Calculated Risk       Economic Data ← macro economics blog
//  46  DC/Dukascopy          Market News   ← broker venue notices (closures, holidays)

const FEEDS: { url: string; name: string; category: string }[] = [
  // ── Forex & Macro ──────────────────────────────────────────────────────────
  { url: "https://www.fxstreet.com/rss/news",                             name: "FXStreet",         category: "Forex & Commodities"   }, // 0
  { url: "https://www.forexlive.com/feed/news",                           name: "ForexLive",        category: "Forex Breaking News"   }, // 1
  { url: "https://www.investing.com/rss/news_1.rss",                      name: "Investing.com",    category: "Forex News"            }, // 2
  { url: "https://www.investing.com/rss/news_14.rss",                     name: "Investing.com",    category: "Economy"               }, // 3
  { url: "https://www.investing.com/rss/news_95.rss",                     name: "Investing.com",    category: "Economic Indicators"   }, // 4
  { url: "https://www.investing.com/rss/news_25.rss",                     name: "Investing.com",    category: "Market News"           }, // 5
  { url: "https://www.investing.com/rss/news_301.rss",                    name: "Investing.com",    category: "Crypto"                }, // 6
  { url: "https://www.marketwatch.com/rss/topstories",                    name: "MarketWatch",      category: "Market News"           }, // 7
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/",               name: "CoinDesk",         category: "Crypto"                }, // 8
  { url: "https://www.kitco.com/news_rss/kitco_news_home.rss",            name: "Kitco",            category: "Commodities"           }, // 9
  { url: "https://cointelegraph.com/rss",                                 name: "CoinTelegraph",    category: "Crypto"                }, // 10
  { url: "https://www.dailyfx.com/feeds/all-news",                        name: "DailyFX",          category: "Forex & Commodities"   }, // 11
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",          name: "CNBC",             category: "Market News"           }, // 12
  { url: "https://feeds.feedburner.com/zerohedge/feed",                   name: "ZeroHedge",        category: "Market News"           }, // 13
  { url: "https://www.bullionvault.com/gold-news/rss/gold-news.xml",      name: "BullionVault",     category: "Commodities"           }, // 14
  { url: "https://decrypt.co/feed",                                       name: "Decrypt",          category: "Crypto"                }, // 15
  { url: "https://www.investing.com/rss/news_4.rss",                      name: "Investing.com",    category: "Commodities"           }, // 16
  { url: "https://www.theblock.co/rss",                                   name: "The Block",        category: "Crypto"                }, // 17
  { url: "https://actionforex.com/feed/",                                 name: "ActionForex",      category: "Forex & Commodities"   }, // 18
  { url: "https://feeds.feedburner.com/AP/business",                      name: "AP Business",      category: "Market News"           }, // 19
  { url: "https://www.fxempire.com/api/v1/en/article/feed",               name: "FXEmpire",         category: "Forex & Commodities"   }, // 20
  { url: "https://www.forexcrunch.com/feed/",                             name: "ForexCrunch",      category: "Forex Analysis"        }, // 21
  { url: "https://www.fxnewstoday.com/feed",                              name: "FXNews Today",     category: "Forex"                 }, // 22
  { url: "https://finance.yahoo.com/rss/topfinstories",                   name: "Yahoo Finance",    category: "Market News"           }, // 23
  { url: "https://feeds.reuters.com/reuters/businessNews",                name: "Reuters",          category: "Market News"           }, // 24
  { url: "https://feeds.reuters.com/reuters/financials",                  name: "Reuters",          category: "Financial News"        }, // 25
  { url: "https://www.financemagnates.com/feed/",                         name: "Finance Magnates", category: "Forex Industry"        }, // 26
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",                name: "WSJ Markets",      category: "Market News"           }, // 27
  { url: "https://www.benzinga.com/news/feed",                            name: "Benzinga",         category: "Market News"           }, // 28
  { url: "https://seekingalpha.com/market_currents.xml",                  name: "Seeking Alpha",    category: "Market News"           }, // 29
  { url: "https://bitcoinmagazine.com/feed",                              name: "Bitcoin Magazine", category: "Crypto"                }, // 30
  { url: "https://cryptopotato.com/feed/",                                name: "CryptoPotato",     category: "Crypto"                }, // 31
  { url: "https://www.newsbtc.com/feed/",                                 name: "NewsBTC",          category: "Crypto"                }, // 32
  { url: "https://cryptonews.com/news/feed/",                             name: "CryptoNews",       category: "Crypto"                }, // 33
  { url: "https://watcherguru.com/feed/",                                 name: "WatcherGuru",      category: "Crypto"                }, // 34
  // ── Tier-1 breaking news ──────────────────────────────────────────────────
  { url: "https://feeds.bloomberg.com/markets/news.rss",                  name: "Bloomberg",        category: "Market News"           }, // 35
  { url: "https://tradingeconomics.com/rss/news.aspx",                    name: "TradingEconomics", category: "Economic Data"         }, // 36
  // ── Commodities deep-coverage ─────────────────────────────────────────────
  { url: "https://oilprice.com/rss/main",                                 name: "OilPrice",         category: "Commodities"           }, // 37
  { url: "https://www.mining.com/feed/",                                  name: "Mining.com",       category: "Commodities"           }, // 38
  // ── Institutional crypto ─────────────────────────────────────────────────
  { url: "https://cryptobriefing.com/feed/",                              name: "CryptoBriefing",   category: "Crypto"                }, // 39
  { url: "https://blockworks.co/feed",                                    name: "Blockworks",       category: "Crypto"                }, // 40
  { url: "https://thedefiant.io/feed",                                    name: "The Defiant",      category: "Crypto"                }, // 41
  // ── FX specialist ─────────────────────────────────────────────────────────
  { url: "https://www.poundsterlinglive.com/feed",                        name: "Pound Sterling",   category: "Forex & Commodities"   }, // 42
  { url: "https://www.myfxbook.com/rss/forex-news.xml",                   name: "Myfxbook",         category: "Forex & Commodities"   }, // 43
  { url: "https://www.fxleaders.com/news/feed/",                          name: "FX Leaders",       category: "Forex & Commodities"   }, // 44
  // ── Deep macro ────────────────────────────────────────────────────────────
  { url: "https://www.calculatedriskblog.com/feeds/posts/default?alt=rss",name: "Calculated Risk",  category: "Economic Data"         }, // 45
  // ── Broker/venue notices ──────────────────────────────────────────────────
  { url: "https://www.dukascopy.com/plugins/newsTicker/rss.php",        name: "DC/Dukascopy",     category: "Market News"           }, // 46
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
  ALL: {
    primaryFeeds: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46],
    secondaryFeeds: [],
    keywords: [], // empty = include everything
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

async function fetchCentralBankFeeds(): Promise<(RawItem & { feedName: string })[]> {
  const results = await Promise.allSettled(
    CENTRAL_BANK_FEEDS.map(async (cb) => {
      const items = await fetchFeed({ url: cb.url, name: cb.name, category: "Central Bank" }, 7000);
      return items
        .filter((i) => !isCentralBankNoise(i.title))
        .map((i) => ({ ...i, feedName: cb.name }));
    })
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// ─── X / Twitter integration ──────────────────────────────────────────────────
// Strategy 1: Twitter API v2 via Bearer token (set TWITTER_BEARER_TOKEN in env)
// Strategy 2: RSSHub public instance fallback (3 s timeout, graceful fail)
// Both tag items source="X/@handle" so the UI shows the X badge.

const X_HANDLES = [
  "FirstSquawk",      // Capital AG — fastest breaking macro/rates alerts
  "KobeissiLetter",   // Institutional macro commentary
  "unusual_whales",   // Options flow + market alerts
  "WatcherGuru",      // Crypto/macro alerts
  "ForexFactory",     // FX + economic calendar alerts
  "zerohedge",        // Macro / geopolitical
  "markets",          // Bloomberg Markets Live
  "WSJmarkets",       // WSJ Markets desk
  "ReutersMarkets",   // Reuters Markets
  "financialtimes",   // Financial Times
  "business",         // Bloomberg Business
  "WSJ",              // Wall Street Journal
];

// Hardcoded user IDs — stable identifiers that don't change when handles do
const X_USER_IDS: Record<string, string> = {
  FirstSquawk:    "3295423333",
  KobeissiLetter: "3316376038",
  unusual_whales: "1200616796295847936",
  WatcherGuru:    "1387497871751196672",
  ForexFactory:   "22446445",
  zerohedge:      "18856867",
  markets:        "69620713",
  WSJmarkets:     "28164923",
  ReutersMarkets: "335907491",
  financialtimes: "4898091",
  business:       "34713362",
  WSJ:            "3108351",
};

// Nitter instances ordered by reliability — first one that returns 200 wins per handle
const NITTER_INSTANCES = [
  "https://nitter.perennialte.ch",
  "https://nitter.rawit.eu",
  "https://nitter.12bit.vn",
];

interface XFetchResult {
  items: RawItem[];
  error?: string;
}

async function fetchXViaAPI(): Promise<XFetchResult> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) return { items: [], error: "TWITTER_BEARER_TOKEN is not set in this environment" };
  // Use GET /2/users/:id/tweets — available on FREE tier (no $100/month plan needed)
  let firstError: string | undefined;
  const results = await Promise.allSettled(
    X_HANDLES.map(async (handle) => {
      const userId = X_USER_IDS[handle];
      if (!userId) return [] as RawItem[];
      try {
        const params = new URLSearchParams({
          max_results: "20",
          "tweet.fields": "created_at",
          exclude: "retweets,replies",
        });
        const r = await fetch(`https://api.twitter.com/2/users/${userId}/tweets?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) {
          if (!firstError) {
            const body = await r.text();
            let detail = body.slice(0, 300);
            try {
              const parsed = JSON.parse(body) as { detail?: string; title?: string };
              detail = parsed.detail || parsed.title || detail;
            } catch { /* body wasn't JSON, keep raw slice */ }
            firstError = `Twitter API returned HTTP ${r.status} for @${handle}: ${detail}`;
          }
          return [] as RawItem[];
        }
        const json = await r.json() as {
          data?: { id: string; text: string; created_at: string }[];
        };
        return (json.data ?? [])
          .map(t => ({
            title: t.text.replace(/https?:\/\/\S+/g, "").trim(),
            link: `https://x.com/${handle}/status/${t.id}`,
            pubDate: t.created_at,
            source: `X/@${handle}`,
          }))
          .filter(item => item.title.length > 15);
      } catch (e) {
        if (!firstError) firstError = `Twitter API request failed for @${handle}: ${String(e)}`;
        return [] as RawItem[];
      }
    })
  );
  const items = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  return { items, error: items.length === 0 ? firstError : undefined };
}

async function fetchXViaNitter(): Promise<XFetchResult> {
  let firstError: string | undefined;
  const results = await Promise.allSettled(
    X_HANDLES.map(async (handle) => {
      let handleError: string | undefined;
      for (const instance of NITTER_INSTANCES) {
        try {
          const r = await fetch(`${instance}/${handle}/rss`, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)", Accept: "application/rss+xml" },
            signal: AbortSignal.timeout(8000),
          });
          if (!r.ok) {
            handleError = `${instance} returned HTTP ${r.status}`;
            continue;
          }
          const xml = await r.text();
          // Reject bot-check / captcha pages (Cloudflare "Just a moment...", Nitter's own check, etc.)
          const isBotWall = /just a moment|cf-browser-verification|attention required|cloudflare|not a bot|making sure/i.test(xml);
          if (!xml.includes("<item>") || isBotWall) {
            handleError = isBotWall ? `${instance} blocked by bot-check` : `${instance} returned no items`;
            continue;
          }
          return parseRSS(xml, `X/@${handle}`).slice(0, 15);
        } catch (e) {
          handleError = `${instance} request failed: ${String(e)}`;
          continue;
        }
      }
      if (handleError && !firstError) firstError = handleError;
      return [] as RawItem[];
    })
  );
  const items: RawItem[] = [];
  for (const res of results) {
    if (res.status === "fulfilled") items.push(...res.value);
  }
  return { items, error: items.length === 0 ? (firstError ? `All Nitter instances failed (e.g. ${firstError})` : "Nitter returned no items") : undefined };
}

async function fetchXContent(): Promise<XFetchResult & { source: "api" | "nitter" | "none" }> {
  // Try official Twitter API first; fall back to Nitter instances
  const api = await fetchXViaAPI();
  if (api.items.length > 0) return { ...api, source: "api" };
  const nitter = await fetchXViaNitter();
  if (nitter.items.length > 0) return { ...nitter, source: "nitter" };
  const parts = [api.error, nitter.error].filter(Boolean);
  return { items: [], source: "none", error: parts.join(" | ") || "X/Twitter fetch failed for an unknown reason" };
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

// Crypto feeds specifically must have crypto/macro content, not consumer noise
// that happens to sit in a crypto-tagged RSS category.
const CRYPTO_CONTENT_RE = /\b(bitcoin|btc|ethereum|eth|crypto|blockchain|defi|nft|token|coin|web3|altcoin|stablecoin|solana|xrp|ripple|cardano|polkadot|chainlink|avalanche|bnb|usdt|usdc|layer|protocol|dao|dex|cex|exchange|wallet|mining|hash|halving|mempool)\b/i;
const CRYPTO_MACRO_RE = /\b(fed|fomc|cpi|inflation|recession|sec|regulation|etf|rate|gdp|treasury|dollar|dxy|risk|rally|crash|selloff|market)\b/i;

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
  // Economic calendar events — data-driven, no sentiment guess needed
  if (/^\[[a-z]{3}\]/i.test(title)) {
    return "Scheduled data release — compare actual vs forecast for direction. Surprises drive the real move, not the headline number alone.";
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
    (t.includes("china") && (t.includes("tension") || t.includes("taiwan"))) ||
    t.includes("north korea") ||
    t.includes("nuclear") ||
    t.includes("airstrike") ||
    t.includes("missile")
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
    t.includes("pboc") ||
    t.includes("central bank") ||
    t.includes("rate hike") ||
    t.includes("rate cut") ||
    t.includes("basis point") ||
    t.includes("interest rate") ||
    t.includes("monetary policy") ||
    t.includes("quantitative") ||
    t.includes("fomc") ||
    t.includes("powell") ||
    t.includes("lagarde") ||
    t.includes("ueda") ||
    t.includes("bailey") ||
    t.includes("waller")
  )
    return "Central Bank";
  if (
    t.includes("cpi") ||
    t.includes("inflation") ||
    t.includes("deflation") ||
    t.includes("nfp") ||
    t.includes("payroll") ||
    t.includes("gdp") ||
    t.includes("pmi") ||
    t.includes("employment") ||
    t.includes("jobs report") ||
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
    t.includes("web3") ||
    t.includes("halving") ||
    t.includes("solana") ||
    t.includes("xrp") ||
    t.includes("ripple")
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
    t.includes("energy") ||
    t.includes("brent") ||
    t.includes("platinum") ||
    t.includes("palladium")
  )
    return "Commodities";
  // X sources and other unknowns fall back to Market News, not raw "X" string
  if (feedCategory === "X" || !feedCategory) return "Market News";
  return feedCategory;
}

// ─── Score + finalize pipeline ─────────────────────────────────────────────────

function toScoredItem(
  item: RawItem & { feedCategory: string; isPrimarySource?: boolean; isCalendarEvent?: boolean; calendarImpact?: string },
): ScoredItem {
  const isTier1Wire = TIER1_WIRE_NAMES.has(item.source);
  const isXAlert = item.source.startsWith("X/");
  const { score, breakdown } = scoreArticle(item.title, "", item.pubDate, {
    isPrimarySource: item.isPrimarySource,
    isCalendarEvent: item.isCalendarEvent,
    calendarImpact: item.calendarImpact,
    isTier1Wire,
    isXAlert,
  });
  return {
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    source: item.source,
    feedCategory: item.feedCategory,
    impactScore: score,
    scoreBreakdown: breakdown,
    isCalendarEvent: item.isCalendarEvent,
    isPrimarySource: item.isPrimarySource,
  };
}

function finalizeArticles(scored: ScoredItem[], limit: number): NewsArticle[] {
  return scored.slice(0, limit).map((item) => {
    const category = item.isCalendarEvent ? "Economic Data" : inferCategory(item.title, item.feedCategory || "Market News");
    const { score, label, impact } = analyzeSentiment(item.title);
    return {
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source,
      sentiment: label,
      sentimentScore: score,
      marketImpact: item.isCalendarEvent ? generateMarketImpact(item.title, "Neutral") : impact,
      category,
      impactScore: item.impactScore,
      isPrimarySource: item.isPrimarySource,
      isCalendarEvent: item.isCalendarEvent,
    };
  });
}

// ─── GET Handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "XAUUSD").toUpperCase();
  const minScore = searchParams.has("minScore") ? Number(searchParams.get("minScore")) : DEFAULT_IMPACT_THRESHOLD;

  const isAll = symbol === "ALL";
  const config = SYMBOL_CONFIG[symbol] || SYMBOL_CONFIG["XAUUSD"];

  if (isAll) {
    // Fetch all RSS feeds + X/Twitter + central bank feeds + economic calendar in parallel
    const [rssResults, xResult, cbItems, calendarEvents] = await Promise.all([
      Promise.allSettled(FEEDS.map((f) => fetchFeed(f))),
      fetchXContent(),
      fetchCentralBankFeeds(),
      fetchEconomicCalendar(),
    ]);

    const allRaw: (RawItem & { feedCategory: string; isPrimarySource?: boolean })[] = [];
    rssResults.forEach((res, i) => {
      if (res.status === "fulfilled") {
        res.value.forEach((item) => allRaw.push({ ...item, feedCategory: FEEDS[i].category }));
      }
    });
    xResult.items.forEach((item) => allRaw.push({ ...item, feedCategory: "X" }));
    cbItems.forEach((item) => allRaw.push({ ...item, feedCategory: "Central Bank", isPrimarySource: true }));

    // Hard-noise + crypto-category sub-filter, then dedupe
    const seen = new Set<string>();
    const filtered = allRaw.filter((item) => {
      if (isHardNoise(item.title)) return false;
      if (item.feedCategory === "Crypto" && !CRYPTO_CONTENT_RE.test(item.title) && !CRYPTO_MACRO_RE.test(item.title)) return false;
      const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let scored = filtered.map((item) => toScoredItem(item));

    // Economic calendar — already correctly scored per event's own impact level
    scored = scored.concat(calendarEventsToArticles(calendarEvents));

    scored = applyCorroborationBoost(scored);
    scored.sort((a, b) => b.impactScore - a.impactScore);

    const signal = scored.filter((s) => s.impactScore >= minScore);
    const articles = finalizeArticles(signal, 150);

    const headers: Record<string, string> = {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      "X-X-Feed-Source": xResult.source,
    };
    if (xResult.error) headers["X-X-Feed-Error"] = encodeURIComponent(xResult.error);

    return NextResponse.json(articles, { headers });
  }

  // ── Symbol-specific mode ──────────────────────────────────────────────────
  const feedIndices = Array.from(new Set([...config.primaryFeeds, ...config.secondaryFeeds]));
  const feedsToFetch = feedIndices.map((i) => FEEDS[i]).filter(Boolean);

  const relevantCurrencies = Object.entries(CURRENCY_TO_SYMBOLS)
    .filter(([, symbols]) => symbols.includes(symbol))
    .map(([code]) => code);

  const [gnResult, feedResults, cbItems, calendarEvents] = await Promise.all([
    fetchGoogleNews(config.googleQuery),
    Promise.allSettled(feedsToFetch.map((feed) => fetchFeed(feed))),
    fetchCentralBankFeeds(),
    fetchEconomicCalendar(),
  ]);

  const allRaw: (RawItem & { feedCategory: string; isPrimarySource?: boolean })[] = [];
  feedResults.forEach((res, i) => {
    if (res.status === "fulfilled") {
      res.value.forEach((item) => allRaw.push({ ...item, feedCategory: feedsToFetch[i].category }));
    }
  });
  gnResult.forEach((item) => allRaw.push({ ...item, feedCategory: "News" }));

  // Central bank items relevant to this symbol's currencies (Fed is relevant to everything via USD)
  const CB_COUNTRY_MAP: Record<string, string> = {
    "Federal Reserve": "USD",
    "ECB": "EUR",
    "Bank of England": "GBP",
    "Bank of Japan": "JPY",
  };
  cbItems
    .filter((item) => relevantCurrencies.includes(CB_COUNTRY_MAP[item.feedName] || ""))
    .forEach((item) => allRaw.push({ ...item, feedCategory: "Central Bank", isPrimarySource: true }));

  // Keyword filter (skip for central bank primary sources — always relevant if currency-matched)
  const filtered = allRaw.filter((item) => {
    if (isHardNoise(item.title)) return false;
    if (item.isPrimarySource) return true;
    return matchesKeywords(item.title, config.keywords);
  });

  const seen = new Set<string>();
  const deduped = filtered.filter((item) => {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let scored = deduped.map((item) => toScoredItem(item));

  // Economic calendar events relevant to this symbol's currencies — already scored
  scored = scored.concat(calendarEventsToArticles(calendarEvents, relevantCurrencies));

  scored = applyCorroborationBoost(scored);
  scored.sort((a, b) => b.impactScore - a.impactScore);

  const signal = scored.filter((s) => s.impactScore >= minScore);
  const articles = finalizeArticles(signal, 80);

  return NextResponse.json(articles, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}
