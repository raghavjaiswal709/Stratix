/**
 * twelvedata.mjs
 *
 * Shared Twelve Data client for the candle scripts. Symbol map and response
 * parsing mirror the already-proven fallback in
 * app/api/trade/chart-data/route.ts — the shape here is normalized to
 * { timestamp: ms, open, high, low, close, volume } so it drops straight
 * into candle-storage.mjs's persistCandles() unchanged.
 *
 * Only symbols with a verified mapping are covered. dxy/usoil/us100 aren't in
 * that proven map either, so they're intentionally left out here rather than
 * guessing a Twelve Data symbol code and risking a silent wrong-instrument fetch.
 */

export const TWELVE_DATA_SYMBOL_MAP = {
  xauusd:  'XAU/USD',
  xagusd:  'XAG/USD',
  eurusd:  'EUR/USD',
  gbpusd:  'GBP/USD',
  usdcad:  'USD/CAD',
  usdjpy:  'USD/JPY',
  usdchf:  'USD/CHF',
  nzdusd:  'NZD/USD',
  audusd:  'AUD/USD',
  ethusd:  'ETH/USD',
  btcusdt: 'BTC/USDT',
};

function toUTCDateStr(d) {
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh  = String(d.getUTCHours()).padStart(2, '0');
  const mm  = String(d.getUTCMinutes()).padStart(2, '0');
  const ss  = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

// Shared across every caller in the process so the backfill pass and any
// other consumer never collectively exceed a free-tier-safe ~8 req/min.
const MIN_CALL_INTERVAL_MS = 7_600;
let lastCallAt = 0;
async function throttle() {
  const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

/**
 * Fetch 1-minute candles for [from, to] (Date objects, UTC) from Twelve Data.
 * Returns [] on a missing key, unmapped symbol, HTTP error, or malformed
 * response — callers treat that exactly like "no data available", so a
 * Twelve Data hiccup can never crash a scheduled run.
 */
export async function fetchTwelveDataCandles(symbol, from, to) {
  const apiKey   = process.env.TWELVE_DATA_API_KEY;
  const tdSymbol = TWELVE_DATA_SYMBOL_MAP[symbol];
  if (!apiKey || !tdSymbol) return [];

  const spanMin     = Math.max(1, (to.getTime() - from.getTime()) / 60_000);
  const outputsize  = Math.min(5000, Math.max(10, Math.ceil(spanMin) + 5));

  const url = new URL('https://api.twelvedata.com/time_series');
  url.searchParams.set('symbol', tdSymbol);
  url.searchParams.set('interval', '1min');
  url.searchParams.set('start_date', toUTCDateStr(from));
  url.searchParams.set('end_date', toUTCDateStr(to));
  url.searchParams.set('outputsize', String(outputsize));
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('format', 'JSON');

  await throttle();
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status === 'error' || !Array.isArray(data.values)) return [];

    return data.values
      .map((v) => ({
        timestamp: new Date(v.datetime.replace(' ', 'T') + 'Z').getTime(),
        open:  parseFloat(v.open),
        high:  parseFloat(v.high),
        low:   parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseFloat(v.volume || '0'),
      }))
      .filter((c) => Number.isFinite(c.timestamp) && Number.isFinite(c.open));
  } catch {
    return [];
  }
}
