import type { RawItem } from "./types";

// ─── Primary-source central bank / regulator feeds ────────────────────────────
// These are official press-release feeds, not third-party reporting. A "Fed
// issues FOMC statement" from federalreserve.gov IS the market-moving event —
// no reporter lag, no paraphrasing risk. Weighted heavily in scoring.ts.

export interface CentralBankFeed {
  url: string;
  name: string;
  country: string; // for calendar/cross-reference tagging
}

export const CENTRAL_BANK_FEEDS: CentralBankFeed[] = [
  { url: "https://www.federalreserve.gov/feeds/press_monetary.xml", name: "Federal Reserve", country: "USD" },
  { url: "https://www.federalreserve.gov/feeds/press_all.xml",      name: "Federal Reserve", country: "USD" },
  { url: "https://www.ecb.europa.eu/rss/press.html",                name: "ECB",             country: "EUR" },
  { url: "https://www.bankofengland.co.uk/rss/news",                name: "Bank of England", country: "GBP" },
  { url: "https://www.boj.or.jp/en/rss/whatsnew.xml",               name: "Bank of Japan",   country: "JPY" },
];

// Fed's "press_all" feed includes routine bank-enforcement admin notices that
// are NOT market movers (e.g. "enforcement action with Small Business Bank").
// Filter those out so only genuine policy content passes through.
const FED_NOISE_RE = /\benforcement action\b|\bcivil money penalty\b|\bpersonnel changes?\b|\bcharter\b|\bmerger application\b|\bhearing panel\b/i;

export function isCentralBankNoise(title: string): boolean {
  return FED_NOISE_RE.test(title);
}

function parseCentralBankRSS(xml: string, sourceName: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch =
      /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(block) ||
      /<title>([^<]*)<\/title>/.exec(block);
    const linkMatch =
      /<link><!\[CDATA\[([^\]]+)\]\]><\/link>/.exec(block) ||
      /<link>([^<]+)<\/link>/.exec(block) ||
      /<guid[^>]*>([^<]+)<\/guid>/.exec(block);
    const pubDateMatch =
      /<pubDate><!\[CDATA\[([\s\S]*?)\]\]><\/pubDate>/.exec(block) ||
      /<pubDate>([^<]+)<\/pubDate>/.exec(block);
    if (titleMatch && linkMatch) {
      const title = titleMatch[1].trim().replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const link = linkMatch[1].trim();
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
      if (title.length > 5) items.push({ title, link, pubDate, source: sourceName });
    }
  }
  return items;
}

/** Fetches every official central bank feed in parallel, stripping routine admin noise. */
export async function fetchCentralBankFeeds(timeoutMs = 6000): Promise<RawItem[]> {
  const results = await Promise.allSettled(
    CENTRAL_BANK_FEEDS.map(async (cb) => {
      try {
        const res = await fetch(cb.url, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return [];
        const xml = await res.text();
        if (!xml.includes("<item>")) return [];
        return parseCentralBankRSS(xml, cb.name).filter((i) => !isCentralBankNoise(i.title));
      } catch {
        return [];
      }
    })
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
