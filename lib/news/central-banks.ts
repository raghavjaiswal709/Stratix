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
