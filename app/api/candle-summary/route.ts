/**
 * GET /api/candle-summary
 *
 * Returns the last 48 h of H1 candles and last 7 days of H4 candles
 * for every symbol in public/data/candles/.
 * Used by the Prompt modals to embed real price data in the AI prompt.
 *
 * Admin-only. Resamples 1-min CSV data on the fly — no extra storage needed.
 *
 * Uses HTTP fetch against Vercel's static-asset layer instead of fs.readFile
 * to avoid the nft file-tracing issue (dynamic paths matching 1000s of CSVs).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

const SYMBOLS = [
  "xauusd", "xagusd", "btcusdt", "ethusd",
  "eurusd", "gbpusd", "usdjpy", "audusd",
  "nzdusd", "usdcad", "usdchf", "dxy", "usoil", "us100",
];

const LOOKBACK_H1_MS = 48 * 60 * 60 * 1000;
const LOOKBACK_H4_MS = 7 * 24 * 60 * 60 * 1000;

/** Resample 1-min rows (CSV strings, header-stripped) into OHLCV buckets */
function resample(rows: string[], bucketSec: number, cutoffMs: number): Candle[] {
  const cutoffSec = Math.floor(cutoffMs / 1000);
  const buckets   = new Map<number, { o: number; h: number; l: number; c: number; v: number }>();

  for (const row of rows) {
    const parts = row.split(",");
    if (parts.length < 6) continue;

    const ts = parseInt(parts[0], 10);
    if (!Number.isFinite(ts) || ts < cutoffSec) continue;

    const o = parseFloat(parts[1]);
    const h = parseFloat(parts[2]);
    const l = parseFloat(parts[3]);
    const c = parseFloat(parts[4]);
    const v = parseFloat(parts[5]) || 0;

    if (!Number.isFinite(o)) continue;

    const bucket = Math.floor(ts / bucketSec) * bucketSec;
    const b = buckets.get(bucket);
    if (!b) {
      buckets.set(bucket, { o, h, l, c, v });
    } else {
      b.h  = Math.max(b.h, h);
      b.l  = Math.min(b.l, l);
      b.c  = c;
      b.v += v;
    }
  }

  return Array.from(buckets.entries())
    .map(([t, b]) => ({ t, ...b }))
    .sort((a, b) => a.t - b.t);
}

/** Return the last N monthly CSV filenames for a symbol, newest-first */
function recentMonthFiles(symbol: string, n = 3): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${symbol}_${d.getFullYear()}_${m}.csv`;
  });
}

async function fetchRows(symbol: string, origin: string, cookieHeader: string): Promise<string[]> {
  const files   = recentMonthFiles(symbol, 3);
  const buckets = await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(`${origin}/data/candles/${symbol}/${file}`, {
          headers: { cookie: cookieHeader },
          cache: "no-store",
        });
        if (!res.ok) return [] as string[];
        const text = await res.text();
        return text.split("\n").filter(l => l.trim() && !l.startsWith("time"));
      } catch {
        return [] as string[];
      }
    }),
  );
  return buckets.flat();
}

export async function GET(req: NextRequest) {
  const userSession = await auth();
  if (userSession?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin       = new URL(req.url).origin;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const now          = Date.now();
  const result: Record<string, { h1: Candle[]; h4: Candle[] }> = {};

  await Promise.all(
    SYMBOLS.map(async (symbol) => {
      const rows = await fetchRows(symbol, origin, cookieHeader);
      result[symbol] = {
        h1: resample(rows, 3600,  now - LOOKBACK_H1_MS),
        h4: resample(rows, 14400, now - LOOKBACK_H4_MS),
      };
    }),
  );

  return NextResponse.json(result);
}
