// ─── dataFetcher.ts ───────────────────────────────────────────────────────────
// Fetches historical candle data in monthly chunks, caches each month in memory,
// and resamples 1-minute base data to any target timeframe on the client side.

import type { Candle, InstrumentKey, Timeframe } from "./types";

// In-memory cache: "INSTRUMENT-YYYY-MM" → raw 1m Candle[]
const monthCache = new Map<string, Candle[]>();

// Track where the last backtest data was successfully loaded from
let lastFetchedSource: "GitHub CDN" | "Local Static" | "Dukascopy API" = "Dukascopy API";

export function getLastFetchedSource(): string {
  return lastFetchedSource;
}

// ── Timeframe bucket sizes in seconds ─────────────────────────────────────────

const TF_SECONDS: Record<Timeframe, number> = {
  "1m":  60,
  "5m":  300,
  "15m": 900,
  "1H":  3600,
  "4H":  14400,
  "1D":  86400,
};

// Floor a unix-second timestamp to the start of its bucket for the given timeframe
function getBucketTime(ts: number, tf: Timeframe): number {
  const sec = TF_SECONDS[tf];
  return Math.floor(ts / sec) * sec;
}

// Resample an array of 1m candles into a larger timeframe
export function resampleCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === "1m") return candles; // no resampling needed
  const buckets = new Map<number, Candle>();

  for (const c of candles) {
    const bt = getBucketTime(c.time, timeframe);
    const existing = buckets.get(bt);
    if (!existing) {
      // First candle in this bucket becomes the open
      buckets.set(bt, { time: bt, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      // Merge into existing bucket
      existing.high   = Math.max(existing.high, c.high);
      existing.low    = Math.min(existing.low, c.low);
      existing.close  = c.close; // last close wins
      existing.volume += c.volume;
    }
  }

  // Return buckets sorted by time
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

// Helper to parse static CSV candle data in the browser
function parseCandlesCSV(text: string): Candle[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",");
  const timeIdx = headers.indexOf("time");
  const openIdx = headers.indexOf("open");
  const highIdx = headers.indexOf("high");
  const lowIdx = headers.indexOf("low");
  const closeIdx = headers.indexOf("close");
  const volumeIdx = headers.indexOf("volume");

  if (timeIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1 || volumeIdx === -1) {
    throw new Error("Invalid CSV format: missing required headers");
  }

  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 6) continue;

    candles.push({
      time:   parseInt(parts[timeIdx], 10),
      open:   parseFloat(parts[openIdx]),
      high:   parseFloat(parts[highIdx]),
      low:    parseFloat(parts[lowIdx]),
      close:  parseFloat(parts[closeIdx]),
      volume: parseFloat(parts[volumeIdx]),
    });
  }
  return candles;
}

// Fetch a single calendar month of 1m data from local CSV or the API
// Returns cached result if available; skips and logs on error
async function fetchMonth(
  instrument: InstrumentKey,
  year: number,
  month: number, // 0-indexed (Jan=0)
  signal?: AbortSignal,
): Promise<Candle[]> {
  const key = `${instrument}-${year}-${String(month + 1).padStart(2, "0")}`;

  // Return cached data if already fetched
  if (monthCache.has(key)) return monthCache.get(key)!;

  const monthStr = String(month + 1).padStart(2, "0");

  // Load from static CSV if instrument is xauusd
  if (instrument === "xauusd") {
    const baseCandlesUrl = process.env.NEXT_PUBLIC_CANDLES_URL || "/data/candles";
    const csvUrl = `${baseCandlesUrl}/xauusd/xauusd_${year}_${monthStr}.csv`;

    try {
      const res = await fetch(csvUrl, { signal });
      if (res.ok) {
        const csvText = await res.text();
        const candles = parseCandlesCSV(csvText);
        monthCache.set(key, candles);

        if (csvUrl.startsWith("https://cdn.jsdelivr.net")) {
          lastFetchedSource = "GitHub CDN";
        } else {
          lastFetchedSource = "Local Static";
        }

        return candles;
      }
      console.warn(`[dataFetcher] Static CSV not found (${csvUrl}), falling back to API`);
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") throw err;
      console.warn(`[dataFetcher] Static CSV fetch failed for ${key}, falling back to API:`, (err as Error).message);
    }
  }

  // Fallback API path (or for non-xauusd instruments)
  const from = new Date(Date.UTC(year, month, 1));
  const to   = new Date(Date.UTC(year, month + 1, 1)); // first day of next month

  const params = new URLSearchParams({
    instrument,
    timeframe: "1m",
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  });

  try {
    const res = await fetch(`/api/backtesting/candles?${params}`, { signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      console.warn(`[dataFetcher] Skipping ${key} API fallback: HTTP ${res.status} — ${body.error ?? ""}`);
      return [];
    }
    const json = await res.json() as { candles?: Candle[] };
    const candles = json.candles ?? [];
    // Cache the successful result
    monthCache.set(key, candles);
    lastFetchedSource = "Dukascopy API";
    return candles;
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") throw err; // propagate cancellation
    console.warn(`[dataFetcher] Skipping ${key} API fallback: fetch failed —`, (err as Error).message);
    return [];
  }
}

// Build a list of { year, month } tuples covering fromDate..toDate (inclusive)
function buildMonthList(fromDate: Date, toDate: Date): { year: number; month: number; label: string }[] {
  const months: { year: number; month: number; label: string }[] = [];
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  let y = fromDate.getUTCFullYear();
  let m = fromDate.getUTCMonth();
  const endY = toDate.getUTCFullYear();
  const endM = toDate.getUTCMonth();

  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m, label: `${MONTH_NAMES[m]} ${y}` });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return months;
}

// Fetch all 1m data for the given date range using monthly chunks, then resample
export async function fetchCandleRange(
  instrument: InstrumentKey,
  fromDate: string,  // YYYY-MM-DD
  toDate: string,    // YYYY-MM-DD
  onProgress: (pct: number, label: string) => void,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const from  = new Date(fromDate + "T00:00:00Z");
  const to    = new Date(toDate   + "T00:00:00Z");
  const months = buildMonthList(from, to);

  if (months.length === 0) return [];

  const allCandles: Candle[] = [];

  for (let i = 0; i < months.length; i++) {
    const { year, month, label } = months[i];
    const pct = Math.round(((i) / months.length) * 100);
    onProgress(pct, `Loading ${label}… (${i + 1}/${months.length})`);

    const data = await fetchMonth(instrument, year, month, signal);
    allCandles.push(...data);
  }

  onProgress(100, "Done");

  // Deduplicate and sort (safety against overlapping month boundaries)
  const seen = new Set<number>();
  const clean: Candle[] = [];
  for (const c of allCandles.sort((a, b) => a.time - b.time)) {
    if (!seen.has(c.time)) { seen.add(c.time); clean.push(c); }
  }

  // Trim to exact date range requested
  const fromTs = from.getTime() / 1000;
  const toTs   = to.getTime()   / 1000;
  return clean.filter(c => c.time >= fromTs && c.time < toTs);
}

// Clear the entire candle cache (e.g. on instrument switch)
export function clearCandleCache(): void {
  monthCache.clear();
}
