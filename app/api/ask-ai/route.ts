import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";
import { getObjectText } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle1m { t: number; o: number; h: number; l: number; c: number }

interface NewsItem {
  title:       string;
  link:        string;
  pubDate:     string;
  source:      string;
  description: string;
  fullContent: string;
}

// ─── Instrument maps ──────────────────────────────────────────────────────────

const INSTRUMENT_SYMBOL: Record<string, string> = {
  XAUUSD: "xauusd", XAGUSD: "xagusd", BTCUSDT: "btcusdt", ETHUSD: "ethusd",
  EURUSD: "eurusd", GBPUSD: "gbpusd", USDJPY: "usdjpy", AUDUSD: "audusd",
  NZDUSD: "nzdusd", USDCAD: "usdcad", USDCHF: "usdchf",
};

// Primary keywords (instrument-specific) + macro context keywords (drivers)
const INSTRUMENT_KEYWORDS: Record<string, { primary: string[]; macro: string[] }> = {
  XAUUSD: {
    primary: ["gold", "xau", "xauusd", "bullion", "yellow metal", "precious metal", "xau/usd"],
    macro:   ["dollar", "dxy", "fed", "inflation", "cpi", "yields", "safe haven", "geopolit", "war", "risk-off"],
  },
  XAGUSD: {
    primary: ["silver", "xag", "xagusd", "xag/usd"],
    macro:   ["gold", "industrial metal", "fed", "inflation"],
  },
  BTCUSDT: {
    primary: ["bitcoin", "btc", "btcusd", "btcusdt", "crypto", "cryptocurrency"],
    macro:   ["etf", "sec", "crypto regulation", "defi", "blockchain", "institutional"],
  },
  ETHUSD: {
    primary: ["ethereum", "eth", "ethusd", "eth/usd"],
    macro:   ["crypto", "defi", "layer", "staking", "blockchain"],
  },
  EURUSD: {
    primary: ["eur", "euro", "eurusd", "eur/usd"],
    macro:   ["ecb", "lagarde", "eurozone", "germany", "euro zone", "fed", "dollar", "dxy", "interest rate"],
  },
  GBPUSD: {
    primary: ["gbp", "pound", "gbpusd", "sterling", "gbp/usd"],
    macro:   ["boe", "bank of england", "bailey", "uk", "britain", "inflation", "fed", "dollar"],
  },
  USDJPY: {
    primary: ["jpy", "yen", "usdjpy", "usd/jpy"],
    macro:   ["boj", "bank of japan", "ueda", "japan", "intervention", "yields", "fed"],
  },
  AUDUSD: {
    primary: ["aud", "aussie", "audusd", "aud/usd", "australian dollar"],
    macro:   ["rba", "reserve bank australia", "china", "iron ore", "copper", "commodity"],
  },
  NZDUSD: {
    primary: ["nzd", "kiwi", "nzdusd", "nzd/usd", "new zealand"],
    macro:   ["rbnz", "reserve bank new zealand", "dairy", "risk sentiment"],
  },
  USDCAD: {
    primary: ["cad", "loonie", "usdcad", "usd/cad", "canadian dollar"],
    macro:   ["boc", "bank of canada", "oil", "crude", "wti", "opec"],
  },
  USDCHF: {
    primary: ["chf", "franc", "usdchf", "usd/chf", "swiss franc"],
    macro:   ["snb", "swiss national bank", "safe haven", "geopolit", "risk-off"],
  },
};

const INSTRUMENT_LABEL: Record<string, string> = {
  XAUUSD: "Gold (XAU/USD)", XAGUSD: "Silver (XAG/USD)", BTCUSDT: "Bitcoin (BTC/USDT)",
  ETHUSD: "Ethereum (ETH/USD)", EURUSD: "EUR/USD", GBPUSD: "GBP/USD",
  USDJPY: "USD/JPY", AUDUSD: "AUD/USD", NZDUSD: "NZD/USD",
  USDCAD: "USD/CAD", USDCHF: "USD/CHF",
};

// ─── ALL news feeds ───────────────────────────────────────────────────────────

const FEEDS = [
  // Core Forex & Commodities
  { url: "https://www.fxstreet.com/rss/news",                              name: "FXStreet"         },
  { url: "https://www.forexlive.com/feed/news",                            name: "ForexLive"        },
  { url: "https://www.dailyfx.com/feeds/all-news",                         name: "DailyFX"          },
  { url: "https://actionforex.com/feed/",                                  name: "ActionForex"      },
  { url: "https://www.fxempire.com/api/v1/en/article/feed",                name: "FXEmpire"         },
  { url: "https://www.forexcrunch.com/feed/",                              name: "ForexCrunch"      },
  { url: "https://www.fxnewstoday.com/feed",                               name: "FXNews Today"     },
  // Investing.com
  { url: "https://www.investing.com/rss/news_1.rss",                       name: "Investing.com"    },
  { url: "https://www.investing.com/rss/news_14.rss",                      name: "Investing.com"    },
  { url: "https://www.investing.com/rss/news_95.rss",                      name: "Investing.com"    },
  { url: "https://www.investing.com/rss/news_25.rss",                      name: "Investing.com"    },
  { url: "https://www.investing.com/rss/news_301.rss",                     name: "Investing.com"    },
  { url: "https://www.investing.com/rss/news_4.rss",                       name: "Investing.com"    },
  // Macro & Market News
  { url: "https://www.marketwatch.com/rss/topstories",                     name: "MarketWatch"      },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",           name: "CNBC"             },
  { url: "https://feeds.feedburner.com/zerohedge/feed",                    name: "ZeroHedge"        },
  { url: "https://finance.yahoo.com/rss/topfinstories",                    name: "Yahoo Finance"    },
  { url: "https://feeds.reuters.com/reuters/businessNews",                 name: "Reuters"          },
  { url: "https://feeds.reuters.com/reuters/financials",                   name: "Reuters"          },
  { url: "https://www.financemagnates.com/feed/",                          name: "Finance Magnates" },
  // Commodities & Gold
  { url: "https://www.kitco.com/news_rss/kitco_news_home.rss",             name: "Kitco"            },
  { url: "https://www.bullionvault.com/gold-news/rss/gold-news.xml",       name: "BullionVault"     },
  // Crypto
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/",                name: "CoinDesk"         },
  { url: "https://cointelegraph.com/rss",                                  name: "CoinTelegraph"    },
  { url: "https://decrypt.co/feed",                                        name: "Decrypt"          },
  { url: "https://www.theblock.co/rss",                                    name: "The Block"        },
  { url: "https://bitcoinmagazine.com/feed",                               name: "Bitcoin Magazine" },
  { url: "https://cryptopotato.com/feed/",                                 name: "CryptoPotato"     },
  { url: "https://www.newsbtc.com/feed/",                                  name: "NewsBTC"          },
  { url: "https://cryptonews.com/news/feed/",                              name: "CryptoNews"       },
  { url: "https://watcherguru.com/feed/",                                  name: "WatcherGuru"      },
  // Breaking / fast market news
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",                 name: "WSJ Markets"      },
  { url: "https://www.benzinga.com/news/feed",                             name: "Benzinga"         },
  { url: "https://seekingalpha.com/market_currents.xml",                   name: "Seeking Alpha"    },
];

// ─── RSS parsing helpers ──────────────────────────────────────────────────────

function decodeHtml(s: string): string {
  return s.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
          .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'")
          .replace(/&nbsp;/g," ").replace(/&ndash;/g,"–").replace(/&mdash;/g,"—")
          .replace(/&#\d+;/g,"");
}

function extractDesc(block: string): string {
  const s = block.indexOf("<description>");
  const e = block.indexOf("</description>", s + 13);
  if (s === -1 || e === -1) return "";
  let raw = block.substring(s + 13, e);
  if (raw.startsWith("<![CDATA[")) raw = raw.slice(9).replace(/\]\]>$/, "");
  return decodeHtml(raw.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()).slice(0, 600);
}

function parseRSS(xml: string, src: string): NewsItem[] {
  const items: NewsItem[] = [];
  const rx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const b = m[1];
    const titleM = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(b) || /<title>([^<]*)<\/title>/.exec(b);
    const linkM  = /<link>([^<]+)<\/link>/.exec(b)
                || /<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/.exec(b)
                || /<guid[^>]*>([^<]+)<\/guid>/.exec(b);
    const dateM  = /<pubDate>([^<]+)<\/pubDate>/.exec(b);
    if (titleM && linkM) {
      const title = decodeHtml(titleM[1].trim());
      if (title.length > 5)
        items.push({ title, link: linkM[1].trim(), pubDate: dateM?.[1]?.trim() ?? "", source: src, description: extractDesc(b), fullContent: "" });
    }
  }
  return items;
}

async function fetchFeed(url: string, name: string): Promise<NewsItem[]> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", Accept: "application/rss+xml,application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    if (!xml.includes("<item>")) return [];
    return parseRSS(xml, name);
  } catch { return []; }
}

// Checks if article matches instrument: primary OR macro keywords
function matchesInstrument(title: string, desc: string, primary: string[], macro: string[]): boolean {
  const hay = (title + " " + desc).toLowerCase();
  // Primary match: instrument-specific terms
  const primaryMatch = primary.some(kw =>
    /^[a-z]{2,6}$/.test(kw) ? new RegExp(`\\b${kw}\\b`, "i").test(hay) : hay.includes(kw)
  );
  if (primaryMatch) return true;
  // Macro match: only if title also has some financial relevance
  const macroMatch = macro.some(kw => hay.includes(kw.toLowerCase()));
  const financialRelevance = ["price", "rate", "market", "trade", "bank", "data", "economic", "fed", "analysis", "forecast", "outlook", "week", "session"].some(w => hay.includes(w));
  return macroMatch && financialRelevance;
}

// ─── Full article content scraper ────────────────────────────────────────────

async function scrapeContent(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", Accept: "text/html,application/xhtml+xml,*/*" },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return "";
    let html = await r.text();
    html = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "");
    const paras: string[] = [];
    const px = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = px.exec(html)) !== null) {
      const t = m[1].replace(/<[^>]*>/g, "").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g, " ").trim();
      if (
        t.length > 60 &&
        !t.includes("{") && !t.includes("@media") && !t.includes("var(--") &&
        !t.toLowerCase().includes("cookie") && !t.toLowerCase().includes("subscribe") &&
        !t.toLowerCase().includes("privacy policy") && !t.toLowerCase().includes("terms of")
      ) paras.push(t);
    }
    return paras.slice(0, 15).join("\n\n");
  } catch { return ""; }
}

// ─── 1-min candle fetcher ─────────────────────────────────────────────────────

function recentCsvFiles(symbol: string, n = 2): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    return `${symbol}_${d.getFullYear()}_${mo}.csv`;
  });
}

async function fetch1mCandles(symbol: string, count = 120): Promise<Candle1m[]> {
  const files = recentCsvFiles(symbol, 2);
  const rows: string[] = [];
  for (const file of files) {
    try {
      const text = await getObjectText(`candles/${symbol}/${file}`);
      if (!text) continue;
      rows.push(...text.split("\n").filter(l => l.trim() && !l.startsWith("time")));
    } catch { /* skip */ }
  }
  const candles: Candle1m[] = [];
  for (const row of rows) {
    const p = row.split(",");
    if (p.length < 5) continue;
    const t = parseInt(p[0], 10), o = parseFloat(p[1]), h = parseFloat(p[2]), l = parseFloat(p[3]), c = parseFloat(p[4]);
    if (Number.isFinite(t) && Number.isFinite(o)) candles.push({ t, o, h, l, c });
  }
  candles.sort((a, b) => a.t - b.t);
  return candles.slice(-count);
}

function formatIST(unixSec: number): string {
  const d = new Date((unixSec + 330 * 60) * 1000);
  return `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

async function buildAskPrompt(instrument: string, candles: Candle1m[], articles: NewsItem[], userQuery: string): Promise<string> {
  const label = INSTRUMENT_LABEL[instrument] ?? instrument;
  const now   = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });

  // ── Price block ──
  const lastClose = candles[candles.length - 1]?.c;
  const sessionHigh = candles.length ? Math.max(...candles.map(c => c.h)) : 0;
  const sessionLow  = candles.length ? Math.min(...candles.map(c => c.l)) : 0;

  // Compute short-term trend from last 20 candles
  const recent20 = candles.slice(-20);
  const trendDir = recent20.length >= 2
    ? (recent20[recent20.length - 1].c > recent20[0].c ? "Upward" : "Downward")
    : "Neutral";

  const candleBlock = candles.length > 0
    ? `LIVE 1-MINUTE CANDLE DATA — ${label}
──────────────────────────────────────────────────
Last ${candles.length} 1-minute candles (IST timestamp | OPEN | HIGH | LOW | CLOSE):
${candles.map(c =>
  `${formatIST(c.t)} | ${c.o.toFixed(4)} | ${c.h.toFixed(4)} | ${c.l.toFixed(4)} | ${c.c.toFixed(4)}`
).join("\n")}

Summary:
  Current price : ${lastClose?.toFixed(4) ?? "N/A"}
  Session high  : ${sessionHigh.toFixed(4)}  (last ${candles.length} min)
  Session low   : ${sessionLow.toFixed(4)}  (last ${candles.length} min)
  Short trend   : ${trendDir} (last 20 candles)`
    : "(1-minute price data unavailable for this instrument)";

  // ── News block ──
  const newsBlock = articles.length > 0
    ? articles.map((a, i) => {
        const body = (a.fullContent && a.fullContent.length > 100) ? a.fullContent : a.description;
        return `[ARTICLE ${i + 1}]
Source    : ${a.source}
Headline  : ${a.title}
Published : ${a.pubDate || "Unknown"}
Content   :
${body || "(No content available — see headline)"}`;
      }).join("\n\n" + "─".repeat(60) + "\n\n")
    : "(No news articles found for this instrument in the last 72 hours)";

  const template = await getPromptTemplate("askAi.chart");
  return renderTemplate(template, {
    INSTRUMENT_LABEL: label,
    NOW: now,
    CANDLE_BLOCK: candleBlock,
    ARTICLE_COUNT: String(articles.length),
    NEWS_BLOCK: newsBlock,
    USER_QUERY: userQuery,
  });
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { instrument?: string; query?: string; history?: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const instrument = body.instrument ?? "XAUUSD";
  const query      = body.query?.trim() ?? "";
  const history    = body.history ?? [];

  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  const symbol   = INSTRUMENT_SYMBOL[instrument] ?? "xauusd";
  const kwConfig = INSTRUMENT_KEYWORDS[instrument] ?? { primary: [], macro: [] };

  // Fetch candles + RSS feeds in parallel
  const [candles, allFeedResults] = await Promise.all([
    fetch1mCandles(symbol, 120),
    Promise.all(FEEDS.map(f => fetchFeed(f.url, f.name))),
  ]);

  // Flatten + deduplicate by URL
  const seenUrls = new Set<string>();
  const allItems: NewsItem[] = [];
  for (const batch of allFeedResults) {
    for (const item of batch) {
      if (!seenUrls.has(item.link)) {
        seenUrls.add(item.link);
        allItems.push(item);
      }
    }
  }

  // Filter: instrument match + 72h window (wider window = more articles)
  const cutoff72h = Date.now() - 72 * 60 * 60 * 1000;
  const filtered = allItems.filter(a => {
    if (!matchesInstrument(a.title, a.description, kwConfig.primary, kwConfig.macro)) return false;
    if (a.pubDate) {
      const ms = new Date(a.pubDate).getTime();
      if (!isNaN(ms) && ms > 0 && ms < cutoff72h) return false;
    }
    return true;
  });

  // Sort by recency (newest first)
  filtered.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return tb - ta;
  });

  // Scrape full content for top 15 articles concurrently (skip paywalled/slow ones via timeout)
  const toScrape = filtered.slice(0, 50); // process up to 50 articles
  const enriched = await Promise.all(
    toScrape.map(async (a, i) => {
      if (i >= 15) return a; // only deep-scrape first 15
      const fc = await scrapeContent(a.link);
      return { ...a, fullContent: fc };
    })
  );

  const prompt = await buildAskPrompt(instrument, candles, enriched, query);

  // Use gpt-4o WITHOUT web search — response must be grounded in prompt data only
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const openai = new OpenAI({ apiKey });

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: prompt },
    // Include conversation history but cap at last 6 turns to stay within token limits
    ...history.slice(-6).map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: query },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",          // NO web search — prompt-grounded only
    messages,
    max_tokens: 2400,
    temperature: 0.3,
  });

  const response = completion.choices[0]?.message?.content ?? "No response generated.";

  return NextResponse.json({
    response,
    prompt,
    newsCount:   enriched.length,
    candleCount: candles.length,
    instrument,
  });
}
