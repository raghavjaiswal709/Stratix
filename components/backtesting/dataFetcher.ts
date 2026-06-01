// ─── dataFetcher.ts ───────────────────────────────────────────────────────────
// Fetches historical candle data in monthly chunks, caches each month first in
// IndexedDB (persists across refreshes) then in a fast in-memory Map.
// Resamples 1-minute base data to any target timeframe on the client side.

import type { Candle, InstrumentKey, Timeframe } from "./types";

// ── IndexedDB persistence layer ───────────────────────────────────────────────
const IDB_DB_NAME    = "stratix-candles-v1";
const IDB_STORE      = "months";
const IDB_TTL_MS     = 8 * 24 * 60 * 60 * 1000; // 8 days — historical data doesn't change

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openIDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onerror   = () => resolve(null);
    req.onsuccess = () => resolve(req.result as IDBDatabase);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "key" });
      }
    };
  }).catch(() => null);
  return dbPromise;
}

async function idbGet(key: string): Promise<Candle[] | null> {
  try {
    const db = await openIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx  = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onerror   = () => resolve(null);
      req.onsuccess = () => {
        const rec = req.result as { key: string; data: Candle[]; ts: number } | undefined;
        if (rec && Date.now() - rec.ts < IDB_TTL_MS) resolve(rec.data);
        else resolve(null);
      };
    });
  } catch { return null; }
}

async function idbSet(key: string, data: Candle[]): Promise<void> {
  try {
    const db = await openIDB();
    if (!db) return;
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put({ key, data, ts: Date.now() });
  } catch { /* silently ignore */ }
}

// ── In-memory cache (fastest path, lost on refresh) ──────────────────────────
const memCache = new Map<string, Candle[]>();

let lastFetchedSource: "IndexedDB" | "GitHub CDN" | "Local Static" | "Dukascopy API" = "Dukascopy API";

export function getLastFetchedSource(): string { return lastFetchedSource; }

// ── Timeframe resampling ──────────────────────────────────────────────────────

const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400,
};

function getBucketTime(ts: number, tf: Timeframe): number {
  return Math.floor(ts / TF_SECONDS[tf]) * TF_SECONDS[tf];
}

export function resampleCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === "1m") return candles;
  const buckets = new Map<number, Candle>();
  for (const c of candles) {
    const bt = getBucketTime(c.time, timeframe);
    const ex = buckets.get(bt);
    if (!ex) {
      buckets.set(bt, { time: bt, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      ex.high   = Math.max(ex.high, c.high);
      ex.low    = Math.min(ex.low,  c.low);
      ex.close  = c.close;
      ex.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCandlesCSV(text: string): Candle[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const h = lines[0].split(",");
  const ti = h.indexOf("time"), oi = h.indexOf("open"),
        hi = h.indexOf("high"), li = h.indexOf("low"),
        ci = h.indexOf("close"), vi = h.indexOf("volume");
  if ([ti, oi, hi, li, ci, vi].some(i => i === -1)) throw new Error("Invalid CSV format");
  const out: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].trim().split(",");
    if (p.length < 6) continue;
    out.push({ time: parseInt(p[ti], 10), open: parseFloat(p[oi]),
      high: parseFloat(p[hi]), low: parseFloat(p[li]),
      close: parseFloat(p[ci]), volume: parseFloat(p[vi]) });
  }
  return out;
}

// ── Single month fetch with three-tier cache: mem → IDB → network ────────────

async function fetchMonth(
  instrument: InstrumentKey,
  year: number,
  month: number,   // 0-indexed
  signal?: AbortSignal,
): Promise<Candle[]> {
  const key = `${instrument}-${year}-${String(month + 1).padStart(2, "0")}`;

  // 1. In-memory (instant)
  if (memCache.has(key)) return memCache.get(key)!;

  // 2. IndexedDB (fast, persistent across refreshes)
  const cached = await idbGet(key);
  if (cached) {
    memCache.set(key, cached);
    lastFetchedSource = "IndexedDB";
    return cached;
  }

  const monthStr = String(month + 1).padStart(2, "0");
  const set = (data: Candle[]) => { memCache.set(key, data); idbSet(key, data); return data; };

  // 3. Local / CDN static CSV
  const baseCandlesUrl = process.env.NEXT_PUBLIC_CANDLES_URL || "/data/candles";
  const csvUrl = `${baseCandlesUrl}/${instrument}/${instrument}_${year}_${monthStr}.csv`;
  try {
    const res = await fetch(csvUrl, { signal });
    if (res.ok) {
      const data = parseCandlesCSV(await res.text());
      lastFetchedSource = csvUrl.startsWith("https://cdn.jsdelivr.net") ? "GitHub CDN" : "Local Static";
      return set(data);
    }
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") throw err;
  }

  // 4. NEXT_PUBLIC_CANDLES_URL local fallback
  if (process.env.NEXT_PUBLIC_CANDLES_URL) {
    const localUrl = `/data/candles/${instrument}/${instrument}_${year}_${monthStr}.csv`;
    try {
      const res = await fetch(localUrl, { signal });
      if (res.ok) {
        const data = parseCandlesCSV(await res.text());
        lastFetchedSource = "Local Static";
        return set(data);
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }

  // 5. Dukascopy API (slowest, always fresh)
  const from = new Date(Date.UTC(year, month,     1));
  const to   = new Date(Date.UTC(year, month + 1, 1));
  const params = new URLSearchParams({
    instrument, timeframe: "1m",
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  });
  try {
    const res = await fetch(`/api/backtesting/candles?${params}`, { signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      console.warn(`[dataFetcher] Skipping ${key}: HTTP ${res.status} —`, (body as { error?: string }).error ?? "");
      return [];
    }
    const json = await res.json() as { candles?: Candle[] };
    const data = json.candles ?? [];
    lastFetchedSource = "Dukascopy API";
    return set(data);
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") throw err;
    console.warn(`[dataFetcher] Skipping ${key}: fetch failed —`, (err as Error).message);
    return [];
  }
}

// ── Build list of calendar months covering a date range ───────────────────────

function buildMonthList(from: Date, to: Date) {
  const NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const months: { year: number; month: number; label: string }[] = [];
  let y = from.getUTCFullYear(), m = from.getUTCMonth();
  const ey = to.getUTCFullYear(), em = to.getUTCMonth();
  while (y < ey || (y === ey && m <= em)) {
    months.push({ year: y, month: m, label: `${NAMES[m]} ${y}` });
    if (++m > 11) { m = 0; y++; }
  }
  return months;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchCandleRange(
  instrument: InstrumentKey,
  fromDate: string,
  toDate: string,
  onProgress: (pct: number, label: string) => void,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const from   = new Date(fromDate + "T00:00:00Z");
  const to     = new Date(toDate   + "T00:00:00Z");
  const months = buildMonthList(from, to);
  if (months.length === 0) return [];

  const all: Candle[] = [];
  for (let i = 0; i < months.length; i++) {
    const { year, month, label } = months[i];
    onProgress(Math.round((i / months.length) * 100), `Loading ${label}… (${i + 1}/${months.length})`);
    const data = await fetchMonth(instrument, year, month, signal);
    all.push(...data);
  }
  onProgress(100, "Done");

  // Deduplicate, sort, trim to exact range
  const seen = new Set<number>();
  const fromTs = from.getTime() / 1000;
  const toTs   = to.getTime()   / 1000;
  return all
    .sort((a, b) => a.time - b.time)
    .filter(c => {
      if (c.time < fromTs || c.time >= toTs || seen.has(c.time)) return false;
      seen.add(c.time); return true;
    });
}

export function clearCandleCache(): void {
  memCache.clear();
  // Leave IDB intact — it's meant to persist across refreshes
}
