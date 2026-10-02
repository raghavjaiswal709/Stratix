// ─── API route: serve one month of archived 1-minute candles from R2 ──────────
// The backtesting client (dataFetcher.ts) used to read only the bundled
// public/data/candles static CSV snapshot, which stopped updating the moment
// candle writes moved to R2-only (see scripts/lib/candle-storage.mjs) — every
// deploy since has shipped the same frozen snapshot. This route serves the
// same CSV shape directly from R2, the continuously-updated (cron every 4h,
// gap-backfilled) source of truth, so the client can treat it as the primary
// source and fall back to the static bundle only if R2 has nothing.
import { NextRequest, NextResponse } from "next/server";
import { getObjectText } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_INSTRUMENTS = new Set([
  "xauusd", "xagusd", "eurusd", "gbpusd", "usdcad", "usdjpy",
  "nzdusd", "audusd", "usdchf", "ethusd", "btcusdt", "dxy", "usoil", "us100",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const instrument = (searchParams.get("instrument") || "").toLowerCase();
  const year  = searchParams.get("year")  || "";
  const month = searchParams.get("month") || "";

  if (!VALID_INSTRUMENTS.has(instrument)) {
    return NextResponse.json({ error: `Unknown instrument: ${instrument}` }, { status: 400 });
  }
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
    return NextResponse.json({ error: "'year' must be YYYY and 'month' must be MM" }, { status: 400 });
  }

  const key = `candles/${instrument}/${instrument}_${year}_${month}.csv`;

  let text: string | null;
  try {
    text = await getObjectText(key);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backtesting/archive] R2 read error:", message);
    return NextResponse.json({ error: "Failed to read archive", detail: message }, { status: 502 });
  }

  if (text === null) {
    return NextResponse.json({ error: "No archive for that month" }, { status: 404 });
  }

  const now = new Date();
  const isCurrentMonth =
    Number(year) === now.getUTCFullYear() && Number(month) === now.getUTCMonth() + 1;

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/csv",
      // Completed months are effectively immutable (only rare gap-backfills
      // touch them) — cache hard. The current month is still being appended
      // to by the cron updater every 4h, so keep that window short.
      "Cache-Control": isCurrentMonth
        ? "public, s-maxage=300, stale-while-revalidate=60"
        : "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
