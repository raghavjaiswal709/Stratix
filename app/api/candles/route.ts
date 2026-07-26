/**
 * GET /api/candles?symbol=EURUSD&interval=1m&limit=500
 *
 * Four-layer gap-filling strategy — always returns the most-recent `limit`
 * candles with no visible gap even when the CSV archive is stale:
 *
 *   Layer 1 — Archived CSV (Cloudflare R2, O(50-100ms)):
 *     Fetch 1-min CSV files from R2 (candles/{symbol}/{file}.csv) and resample.
 *
 *   Layer 2 — Binance REST klines (real-time, no API key, O(200ms)):
 *     For symbols that have a Binance representation (XAUUSD via XAUTUSDT,
 *     BTCUSD, ETHUSD) fetch the latest `limit` closed klines. This covers
 *     today's session which dukascopy doesn't have yet.
 *
 *   Layer 3 — Dukascopy (free historical, O(2-8 s), 1-day lag):
 *     For forex and silver (no Binance equivalent). Requests a wide enough
 *     window that we always get recent data despite the lag.
 *
 *   Layer 4 — Global In-Memory Cache with Incremental Delta Updating:
 *     Caches the merged candles array in memory. When a request comes in, if the cache
 *     is fresh (<60s), returns it instantly (<1ms). If stale, fetches only the small
 *     delta since the last cached candle, making Dukascopy queries extremely fast.
 *
 * Response: Candle[] `time` in UNIX **seconds** (lightweight-charts format).
 *   [{ time, open, high, low, close, volume }]
 */
import { NextRequest, NextResponse } from "next/server";
import { getHistoricalRates, Timeframe } from "dukascopy-node";
import { getObjectText } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Candle {
  time: number; // UNIX seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Global in-memory cache to store consolidated history per symbol+interval
const globalCache: Record<
  string,
  {
    lastFetched: number;
    candles: Candle[];
  }
> = {};

// ── Symbol maps ───────────────────────────────────────────────────────────────
const DUKASCOPY_SYMBOLS: Record<string, string> = {
  EURUSD: "eurusd", GBPUSD: "gbpusd", USDJPY: "usdjpy", USDCHF: "usdchf",
  USDCAD: "usdcad", AUDUSD: "audusd", XAUUSD: "xauusd", XAGUSD: "xagusd",
  BTCUSD: "btcusd", ETHUSD: "ethusd",
};

const CSV_DIRS: Record<string, string> = {
  EURUSD: "eurusd", GBPUSD: "gbpusd", USDJPY: "usdjpy", USDCHF: "usdchf",
  USDCAD: "usdcad", AUDUSD: "audusd", XAUUSD: "xauusd", XAGUSD: "xagusd",
  BTCUSD: "btcusdt", ETHUSD: "ethusd",
};

// Binance REST klines symbol map (no API key, real-time candles)
const BINANCE_KLINE_SYMBOLS: Record<string, string> = {
  XAUUSD: "XAUTUSDT",
  BTCUSD: "BTCUSDT",
  ETHUSD: "ETHUSDT",
};

// Initial lookback period map for first-time population
const DUKA_INITIAL_LOOKBACK_SEC: Record<string, number> = {
  "1m":  30 * 3600,        // 30 hours — covers limit=500 easily, extremely fast (~1.5s)
  "5m":  5 * 24 * 3600,    // 5 days
  "15m": 10 * 24 * 3600,   // 10 days
  "30m": 15 * 24 * 3600,   // 15 days
  "1h":  45 * 24 * 3600,   // 45 days
  "4h":  120 * 24 * 3600,  // 120 days
  "1d":  3 * 365 * 24 * 3600 // 3 years
};

const INTERVAL_TO_TF: Record<string, string> = {
  "1m": Timeframe.m1, "5m": Timeframe.m5, "15m": Timeframe.m15,
  "30m": Timeframe.m30, "1h": Timeframe.h1, "4h": Timeframe.h4, "1d": Timeframe.d1,
};

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
  "1h": 3600, "4h": 14400, "1d": 86400,
};

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol   = (searchParams.get("symbol")   || "").toUpperCase();
  const interval = (searchParams.get("interval") || "1m").toLowerCase();
  const limit    = Math.min(Math.max(Number(searchParams.get("limit")) || 500, 10), 5000);

  if (!DUKASCOPY_SYMBOLS[symbol]) {
    return NextResponse.json({ error: `Unsupported symbol: ${symbol}` }, { status: 400 });
  }
  if (!INTERVAL_TO_TF[interval]) {
    return NextResponse.json({ error: `Unsupported interval: ${interval}` }, { status: 400 });
  }

  const cacheKey = `${symbol}_${interval}`;
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const intervalSec = INTERVAL_SECONDS[interval];

  // ── 1. Check if cache exists and is fresh (< 60s) ──────────────────────────
  if (globalCache[cacheKey] && nowMs - globalCache[cacheKey].lastFetched < 60000) {
    const cachedCandles = [...globalCache[cacheKey].candles];
    cachedCandles.sort((a, b) => a.time - b.time);
    const sliced = cachedCandles.slice(-limit);
    return NextResponse.json(sliced, {
      headers: {
        "Cache-Control": "public, s-maxage=60",
      },
    });
  }

  // ── 2. Cache is missing or stale -> fetch update ───────────────────────────
  let candles: Candle[] = [];
  const binanceSymbol = BINANCE_KLINE_SYMBOLS[symbol];

  try {
    if (binanceSymbol) {
      // ── Binance Flow ───────────────────────────────────────────────────────
      try {
        candles = await loadFromCsv(symbol, intervalSec, limit);
      } catch (err) {
        console.warn(`[candles] ${symbol} CSV load failed:`, (err as Error).message);
      }

      let fresh: Candle[] = [];
      try {
        fresh = await fetchBinanceKlines(binanceSymbol, interval, limit);
      } catch (err) {
        console.warn(`[candles] ${symbol} Binance fetch failed:`, (err as Error).message);
      }

      if (fresh.length > 0) {
        const freshWindowStart = fresh[0].time;
        const csvHistory = candles.filter((c) => c.time < freshWindowStart);
        candles = [...csvHistory, ...fresh];
      }
    } else {
      // ── Dukascopy Flow (Forex, Silver) ─────────────────────────────────────
      const hasCache = !!globalCache[cacheKey];

      if (!hasCache) {
        // Case A: Initial fetch
        try {
          candles = await loadFromCsv(symbol, intervalSec, limit);
        } catch (err) {
          console.warn(`[candles] ${symbol} CSV load failed:`, (err as Error).message);
        }

        const lastCsvSec = candles.length ? candles[candles.length - 1].time : 0;
        const csvAgeSec = nowSec - lastCsvSec;
        const maxLookback = DUKA_INITIAL_LOOKBACK_SEC[interval] ?? 24 * 3600;

        // Fetch from end of CSV up to now, capped at maxInitialLookback
        let fromSec = nowSec - maxLookback;
        if (lastCsvSec > 0 && csvAgeSec < maxLookback) {
          fromSec = lastCsvSec;
        }

        let fresh: Candle[] = [];
        try {
          const from = new Date(fromSec * 1000);
          const to = new Date(nowMs);
          fresh = await Promise.race([
            fetchDukascopy(symbol, interval, from, to),
            new Promise<Candle[]>((_, reject) =>
              setTimeout(() => reject(new Error("dukascopy timeout")), 25000)
            ),
          ]);
        } catch (err) {
          console.warn(`[candles] ${symbol} initial Dukascopy fetch failed:`, (err as Error).message);
        }

        if (fresh.length > 0) {
          const freshWindowStart = fresh[0].time;
          const csvHistory = candles.filter((c) => c.time < freshWindowStart);
          candles = [...csvHistory, ...fresh];
        }
      } else {
        // Case B: Incremental update
        candles = globalCache[cacheKey].candles;
        const lastCachedSec = candles.length ? candles[candles.length - 1].time : 0;

        let fresh: Candle[] = [];
        if (lastCachedSec > 0) {
          try {
            const from = new Date(lastCachedSec * 1000);
            const to = new Date(nowMs);
            fresh = await Promise.race([
              fetchDukascopy(symbol, interval, from, to),
              new Promise<Candle[]>((_, reject) =>
                setTimeout(() => reject(new Error("dukascopy timeout")), 10000)
              ),
            ]);
          } catch (err) {
            console.warn(`[candles] ${symbol} delta Dukascopy fetch failed:`, (err as Error).message);
          }
        }

        if (fresh.length > 0) {
          const existingMap = new Map<number, Candle>();
          for (const c of candles) {
            existingMap.set(c.time, c);
          }
          for (const c of fresh) {
            existingMap.set(c.time, c);
          }
          candles = Array.from(existingMap.values());
        }
      }
    }
  } catch (err) {
    console.error(`[candles] Cache update error for ${symbol}:`, err);
  }

  // ── 3. Update Cache ────────────────────────────────────────────────────────
  if (candles.length > 0) {
    candles.sort((a, b) => a.time - b.time);
    globalCache[cacheKey] = {
      lastFetched: Date.now(),
      candles: candles.slice(-5000), // rolling limit
    };
  } else if (globalCache[cacheKey]) {
    // Graceful fallback to stale cache if current update failed
    console.warn(`[candles] Fetch failed for ${symbol}, falling back to stale cache.`);
    candles = globalCache[cacheKey].candles;
  }

  // ── 4. Return Trimmed Output ───────────────────────────────────────────────
  candles.sort((a, b) => a.time - b.time);
  const result = candles.slice(-limit);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60",
    },
  });
}

// ── Binance REST klines ───────────────────────────────────────────────────────
const BINANCE_INTERVAL: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
  "1h": "1h", "4h": "4h", "1d": "1d",
};

async function fetchBinanceKlines(
  binanceSymbol: string,
  interval: string,
  limit: number
): Promise<Candle[]> {
  const iv  = BINANCE_INTERVAL[interval];
  if (!iv) return [];
  const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${iv}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any[] = await res.json();
  if (!Array.isArray(data)) throw new Error("Binance klines: unexpected response");
  return data
    .map((k) => ({
      time:   Math.floor(Number(k[0]) / 1000),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter((c) => Number.isFinite(c.open) && c.time > 0);
}

// ── Dukascopy ─────────────────────────────────────────────────────────────────
async function fetchDukascopy(
  symbol: string,
  interval: string,
  from: Date,
  to: Date
): Promise<Candle[]> {
  // Safeguard: Dukascopy files are compiled hourly and only available
  // after the hour has completed. If the request start date is inside
  // the current running UTC hour, it is guaranteed to return nothing
  // and will trigger a crash/infinite loop inside dukascopy-node.
  const startOfCurrentHour = new Date();
  startOfCurrentHour.setUTCMinutes(0, 0, 0);
  startOfCurrentHour.setUTCMilliseconds(0);

  if (from.getTime() >= startOfCurrentHour.getTime()) {
    console.info(`[candles] ${symbol} Dukascopy fetch skipped: start date ${from.toISOString()} is within the current UTC hour.`);
    return [];
  }

  // Use optimized batch size and delay parameters to bypass timeouts and rate limits
  const rates = (await getHistoricalRates({
    instrument: DUKASCOPY_SYMBOLS[symbol] as never,
    dates: { from, to },
    timeframe: INTERVAL_TO_TF[interval] as never,
    format: "json" as never,
    priceType: "bid" as never,
    batchSize: 15,
    pauseBetweenBatchesMs: 500,
  })) as unknown as Array<{
    timestamp: number; open: number; high: number; low: number;
    close: number; volume?: number;
  }>;

  if (!Array.isArray(rates)) return [];
  return rates
    .map((r) => ({
      time:   Math.floor(r.timestamp / 1000),
      open:   r.open,
      high:   r.high,
      low:    r.low,
      close:  r.close,
      volume: r.volume ?? 0,
    }))
    .filter((c) => Number.isFinite(c.open) && c.time > 0);
}

// ── CSV helpers (Cloudflare R2 — replaces the old static-asset fetch) ─────────
async function loadFromCsv(
  symbol: string,
  intervalSec: number,
  limit: number
): Promise<Candle[]> {
  const dir = CSV_DIRS[symbol];
  if (!dir) return [];
  const months = Math.max(2, Math.ceil((limit * intervalSec) / (30 * 86400)) + 1);
  const files = recentMonthFiles(dir, months);

  const chunks = await Promise.all(
    files.map(async (file) => {
      try {
        const text = await getObjectText(`candles/${dir}/${file}`);
        if (!text) return [] as string[];
        return text.split("\n").filter((l) => l.trim() && !l.startsWith("time"));
      } catch {
        return [] as string[];
      }
    })
  );
  return resample(chunks.flat(), intervalSec);
}

function recentMonthFiles(dir: string, n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${dir}_${d.getFullYear()}_${m}.csv`;
  });
}

function resample(rows: string[], bucketSec: number): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const row of rows) {
    const p = row.split(",");
    if (p.length < 6) continue;
    const ts = parseInt(p[0], 10);
    if (!Number.isFinite(ts)) continue;
    const o = parseFloat(p[1]), h = parseFloat(p[2]);
    const l = parseFloat(p[3]), c = parseFloat(p[4]);
    const v = parseFloat(p[5]) || 0;
    if (!Number.isFinite(o)) continue;
    const bucket = Math.floor(ts / bucketSec) * bucketSec;
    const b = buckets.get(bucket);
    if (!b) {
      buckets.set(bucket, { time: bucket, open: o, high: h, low: l, close: c, volume: v });
    } else {
      b.high = Math.max(b.high, h); b.low = Math.min(b.low, l);
      b.close = c; b.volume += v;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}
