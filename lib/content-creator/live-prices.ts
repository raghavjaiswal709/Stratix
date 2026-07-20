// Shared ground-truth price snapshot for content-creator curation prompts.
// All three sources are free, no-API-key REST endpoints — no shared
// credentials, no dependency on the separate stratix-ws-server package.
// Each source is fetched independently so one failing endpoint doesn't
// blank out the other two.

const FOREX_LABELS: Record<string, string> = {
  EUR: "EURUSD", GBP: "GBPUSD", AUD: "AUDUSD", NZD: "NZDUSD",
  JPY: "USDJPY", CAD: "USDCAD", CHF: "USDCHF",
};

async function fetchCrypto(): Promise<string[]> {
  const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(["BTCUSDT", "ETHUSDT"]))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data: { symbol: string; price: string }[] = await res.json();
  return data
    .filter((d) => Number.isFinite(parseFloat(d.price)))
    .map((d) => `${d.symbol.replace("USDT", "USD")}: ${parseFloat(d.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
}

async function fetchMetals(): Promise<string[]> {
  const [xau, xag] = await Promise.allSettled([
    fetch("https://api.gold-api.com/price/XAU", { signal: AbortSignal.timeout(6000) }).then((r) => r.json()),
    fetch("https://api.gold-api.com/price/XAG", { signal: AbortSignal.timeout(6000) }).then((r) => r.json()),
  ]);
  const lines: string[] = [];
  if (xau.status === "fulfilled" && Number.isFinite(xau.value?.price)) lines.push(`XAUUSD: ${xau.value.price.toFixed(2)}`);
  if (xag.status === "fulfilled" && Number.isFinite(xag.value?.price)) lines.push(`XAGUSD: ${xag.value.price.toFixed(2)}`);
  return lines;
}

async function fetchForex(): Promise<string[]> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`open.er-api HTTP ${res.status}`);
  const data: { rates?: Record<string, number> } = await res.json();
  const rates = data.rates || {};
  const lines: string[] = [];
  for (const [ccy, pairLabel] of Object.entries(FOREX_LABELS)) {
    const rate = rates[ccy];
    if (!Number.isFinite(rate)) continue;
    // USDJPY/USDCAD/USDCHF are already USD-base; EUR/GBP/AUD/NZD need inverting
    // to read as the standard XXXUSD quote convention.
    const value = pairLabel.startsWith("USD") ? rate : 1 / rate;
    lines.push(`${pairLabel}: ${value.toFixed(4)}`);
  }
  return lines;
}

/**
 * Best-effort snapshot of current prices across crypto, metals, and forex
 * majors, formatted as a plain-text block for injection into an LLM prompt
 * as ground truth. Never throws — a failing source is silently omitted.
 */
export async function fetchLiveContext(): Promise<string> {
  const [crypto, metals, forex] = await Promise.allSettled([fetchCrypto(), fetchMetals(), fetchForex()]);

  const lines: string[] = [];
  if (crypto.status === "fulfilled") lines.push(...crypto.value);
  if (metals.status === "fulfilled") lines.push(...metals.value);
  if (forex.status === "fulfilled") lines.push(...forex.value);

  if (lines.length === 0) {
    return "No live price data available right now — do not state any specific price level or figure; describe direction/pressure only.";
  }
  return lines.join("\n");
}
