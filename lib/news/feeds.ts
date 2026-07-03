import type { RawItem } from "./types";

// Comprehensive RSS feed list for full-history sentiment analysis. This is a
// standalone copy (not re-exported from app/api/news/route.ts) since that
// file's FEEDS array is index-referenced by its own SYMBOL_CONFIG and isn't
// safe to import into a shared module without risking those indices. Order
// doesn't matter here — every feed is always fetched.
export const NEWS_FEEDS: { url: string; name: string; category: string }[] = [
  { url: "https://www.fxstreet.com/rss/news",                             name: "FXStreet",         category: "Forex & Commodities" },
  { url: "https://www.forexlive.com/feed/news",                           name: "ForexLive",        category: "Forex Breaking News" },
  { url: "https://www.investing.com/rss/news_1.rss",                      name: "Investing.com",    category: "Forex News" },
  { url: "https://www.investing.com/rss/news_14.rss",                     name: "Investing.com",    category: "Economy" },
  { url: "https://www.investing.com/rss/news_95.rss",                     name: "Investing.com",    category: "Economic Indicators" },
  { url: "https://www.investing.com/rss/news_25.rss",                     name: "Investing.com",    category: "Market News" },
  { url: "https://www.investing.com/rss/news_301.rss",                    name: "Investing.com",    category: "Crypto" },
  { url: "https://www.marketwatch.com/rss/topstories",                    name: "MarketWatch",      category: "Market News" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/",               name: "CoinDesk",         category: "Crypto" },
  { url: "https://www.kitco.com/news_rss/kitco_news_home.rss",            name: "Kitco",            category: "Commodities" },
  { url: "https://cointelegraph.com/rss",                                 name: "CoinTelegraph",    category: "Crypto" },
  { url: "https://www.dailyfx.com/feeds/all-news",                        name: "DailyFX",          category: "Forex & Commodities" },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",          name: "CNBC",             category: "Market News" },
  { url: "https://feeds.feedburner.com/zerohedge/feed",                   name: "ZeroHedge",        category: "Market News" },
  { url: "https://www.bullionvault.com/gold-news/rss/gold-news.xml",      name: "BullionVault",     category: "Commodities" },
  { url: "https://decrypt.co/feed",                                       name: "Decrypt",          category: "Crypto" },
  { url: "https://www.investing.com/rss/news_4.rss",                      name: "Investing.com",    category: "Commodities" },
  { url: "https://www.theblock.co/rss",                                   name: "The Block",        category: "Crypto" },
  { url: "https://actionforex.com/feed/",                                 name: "ActionForex",      category: "Forex & Commodities" },
  { url: "https://feeds.feedburner.com/AP/business",                      name: "AP Business",      category: "Market News" },
  { url: "https://www.fxempire.com/api/v1/en/article/feed",               name: "FXEmpire",         category: "Forex & Commodities" },
  { url: "https://www.forexcrunch.com/feed/",                             name: "ForexCrunch",      category: "Forex Analysis" },
  { url: "https://www.fxnewstoday.com/feed",                              name: "FXNews Today",     category: "Forex" },
  { url: "https://finance.yahoo.com/rss/topfinstories",                   name: "Yahoo Finance",    category: "Market News" },
  { url: "https://feeds.reuters.com/reuters/businessNews",                name: "Reuters",          category: "Market News" },
  { url: "https://feeds.reuters.com/reuters/financials",                  name: "Reuters",          category: "Financial News" },
  { url: "https://www.financemagnates.com/feed/",                         name: "Finance Magnates", category: "Forex Industry" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",                name: "WSJ Markets",      category: "Market News" },
  { url: "https://www.benzinga.com/news/feed",                            name: "Benzinga",         category: "Market News" },
  { url: "https://seekingalpha.com/market_currents.xml",                  name: "Seeking Alpha",    category: "Market News" },
  { url: "https://bitcoinmagazine.com/feed",                              name: "Bitcoin Magazine", category: "Crypto" },
  { url: "https://cryptopotato.com/feed/",                                name: "CryptoPotato",     category: "Crypto" },
  { url: "https://www.newsbtc.com/feed/",                                 name: "NewsBTC",          category: "Crypto" },
  { url: "https://cryptonews.com/news/feed/",                             name: "CryptoNews",       category: "Crypto" },
  { url: "https://watcherguru.com/feed/",                                 name: "WatcherGuru",      category: "Crypto" },
  { url: "https://feeds.bloomberg.com/markets/news.rss",                  name: "Bloomberg",        category: "Market News" },
  { url: "https://tradingeconomics.com/rss/news.aspx",                    name: "TradingEconomics", category: "Economic Data" },
  { url: "https://oilprice.com/rss/main",                                 name: "OilPrice",         category: "Commodities" },
  { url: "https://www.mining.com/feed/",                                  name: "Mining.com",       category: "Commodities" },
  { url: "https://cryptobriefing.com/feed/",                              name: "CryptoBriefing",   category: "Crypto" },
  { url: "https://blockworks.co/feed",                                    name: "Blockworks",       category: "Crypto" },
  { url: "https://thedefiant.io/feed",                                    name: "The Defiant",      category: "Crypto" },
  { url: "https://www.poundsterlinglive.com/feed",                        name: "Pound Sterling",   category: "Forex & Commodities" },
  { url: "https://www.myfxbook.com/rss/forex-news.xml",                   name: "Myfxbook",         category: "Forex & Commodities" },
  { url: "https://www.fxleaders.com/news/feed/",                          name: "FX Leaders",       category: "Forex & Commodities" },
  { url: "https://www.calculatedriskblog.com/feeds/posts/default?alt=rss",name: "Calculated Risk",  category: "Economic Data" },
  { url: "https://www.dukascopy.com/plugins/newsTicker/rss.php",          name: "DC/Dukascopy",     category: "Market News" },
  { url: "https://markets.businessinsider.com/rss/news",                  name: "Business Insider", category: "Market News" },
  { url: "https://ambcrypto.com/feed/",                                   name: "AMBCrypto",        category: "Crypto" },
  { url: "https://bitcoinist.com/feed/",                                  name: "Bitcoinist",       category: "Crypto" },
  { url: "https://coinpedia.org/feed/",                                   name: "Coinpedia",        category: "Crypto" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=Commodities",  name: "NASDAQ",           category: "Commodities" },
  { url: "https://u.today/rss",                                           name: "U.Today",          category: "Crypto" },
  { url: "https://www.silverseek.com/rss.xml",                            name: "SilverSeek",       category: "Commodities" },
  { url: "https://cryptoslate.com/feed/",                                 name: "CryptoSlate",      category: "Crypto" },
  { url: "https://beincrypto.com/feed/",                                  name: "BeInCrypto",       category: "Crypto" },
  { url: "https://www.thestreet.com/.rss/full/",                         name: "TheStreet",        category: "Market News" },
];

function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "");
}

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
    const pubDateMatch =
      /<pubDate><!\[CDATA\[([\s\S]*?)\]\]><\/pubDate>/.exec(block) ||
      /<pubDate>([^<]+)<\/pubDate>/.exec(block);
    if (titleMatch && linkMatch) {
      const rawTitle = decodeHtml(titleMatch[1].trim());
      const link = linkMatch[1].trim();
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
      let title = rawTitle;
      const dashIdx = title.lastIndexOf(" - ");
      if (dashIdx !== -1 && dashIdx > title.length * 0.5 && title.length - dashIdx < 40) {
        title = title.substring(0, dashIdx).trim();
      }
      if (title.length > 5) items.push({ title, link, pubDate, source: sourceName });
    }
  }
  return items;
}

async function fetchOneFeed(feed: { url: string; name: string; category: string }, timeoutMs = 6000): Promise<(RawItem & { category: string })[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    if (!xml.includes("<item>")) return [];
    return parseRSS(xml, feed.name).map((item) => ({ ...item, category: feed.category }));
  } catch {
    return [];
  }
}

/** Fetches every configured RSS feed in parallel and merges the results. */
export async function fetchAllNewsFeeds(): Promise<(RawItem & { category: string })[]> {
  const results = await Promise.allSettled(NEWS_FEEDS.map((f) => fetchOneFeed(f)));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
