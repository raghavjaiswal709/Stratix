/**
 * GET /api/candle-summary
 *
 * Returns the last 48 h of H1 candles and last 7 days of H4 candles
 * for every symbol in public/data/candles/.
 * Used by the Prompt modals to embed real price data in the AI prompt.
 *
 * Admin-only. Resamples 1-min CSV data on the fly — no extra storage needed.
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

const SYMBOLS = [
  "xauusd", "xagusd", "btcusdt", "ethusd",
  "eurusd", "gbpusd", "usdjpy", "audusd",
  "nzdusd", "usdcad", "usdchf", "dxy", "usoil", "us100",
];

const LOOKBACK_H1_MS = 48 * 60 * 60 * 1000;   // 48 h
const LOOKBACK_H4_MS = 7 * 24 * 60 * 60 * 1000; // 7 d

/** Resample 1-min rows (CSV strings, already header-stripped) into OHLCV buckets */
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

async function fetchRows(symbol: string): Promise<string[]> {
  const dir = join(process.cwd(), "public", "data", "candles", symbol);

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const csvFiles = files.filter(f => f.endsWith(".csv")).sort();
  // Take up to 3 most-recent monthly files to safely cover the 7-day H4 window
  const relevant = csvFiles.slice(-3);

  const allRows: string[] = [];
  for (const file of relevant) {
    const content = await readFile(join(dir, file), "utf8");
    // Split lines; skip header (starts with "time") and blanks
    const lines = content
      .split("\n")
      .filter(l => l.trim() && !l.startsWith("time"));
    allRows.push(...lines);
  }
  return allRows;
}

export async function GET() {
  const userSession = await auth();
  if (userSession?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const result: Record<string, { h1: Candle[]; h4: Candle[] }> = {};

  for (const symbol of SYMBOLS) {
    const rows = await fetchRows(symbol);
    result[symbol] = {
      h1: resample(rows, 3600,  now - LOOKBACK_H1_MS),
      h4: resample(rows, 14400, now - LOOKBACK_H4_MS),
    };
  }

  return NextResponse.json(result);
}
