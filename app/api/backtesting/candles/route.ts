// ─── API route: fetch OHLCV from Dukascopy ───────────────────────────────────
// Supports xauusd and btcusd. Always returns 1-minute data.
// No candle limit — clients send monthly chunks via dataFetcher.ts.

import { NextResponse } from "next/server";
import { getHistoricRates, Timeframe, Instrument } from "dukascopy-node";

export const runtime    = "nodejs";
export const maxDuration = 180;

// Supported instruments
const INSTRUMENT_MAP: Record<string, string> = {
  xauusd: Instrument.xauusd,
  xagusd: Instrument.xagusd,
  eurusd: Instrument.eurusd,
  gbpusd: Instrument.gbpusd,
  usdcad: Instrument.usdcad,
  usdjpy: Instrument.usdjpy,
  nzdusd: Instrument.nzdusd,
  audusd: Instrument.audusd,
  usdchf: Instrument.usdchf,
  ethusd: Instrument.ethusd,
  btcusdt: Instrument.btcusd,
  dxy: Instrument.dollaridxusd,
  usoil: Instrument.lightcmdusd,
  us100: Instrument.usatechidxusd,
};

// Decimal precision per instrument.
// Forex majors/minors are quoted to 5dp (1 point = 0.00001).
// JPY pairs to 3dp (1 point = 0.001). Metals/crypto/indices to 2dp.
const PRICE_PRECISION: Record<string, number> = {
  eurusd: 5, gbpusd: 5, usdcad: 5, nzdusd: 5, audusd: 5, usdchf: 5,
  usdjpy: 3,
  xauusd: 2, xagusd: 3,
  ethusd: 2, btcusdt: 2,
  dxy: 3, usoil: 2, us100: 2,
};

// Map UI timeframe labels to dukascopy-node Timeframe enum values
const TF_MAP: Record<string, string> = {
  "1m":  Timeframe.m1,
  "5m":  Timeframe.m5,
  "15m": Timeframe.m15,
  "1H":  Timeframe.h1,
  "4H":  Timeframe.h4,
  "1D":  Timeframe.d1,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from           = searchParams.get("from");
  const to             = searchParams.get("to");
  const tf             = searchParams.get("timeframe") ?? "1m";
  const instrumentKey  = (searchParams.get("instrument") ?? "xauusd").toLowerCase();

  if (!from || !to) {
    return NextResponse.json({ error: "Missing 'from' or 'to' query param" }, { status: 400 });
  }

  const timeframe = TF_MAP[tf];
  if (!timeframe) {
    return NextResponse.json({ error: `Unknown timeframe: ${tf}` }, { status: 400 });
  }

  const instrument = INSTRUMENT_MAP[instrumentKey];
  if (!instrument) {
    return NextResponse.json({ error: `Unknown instrument: ${instrumentKey}` }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate   = new Date(to);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format — use YYYY-MM-DD" }, { status: 400 });
  }

  if (fromDate >= toDate) {
    return NextResponse.json({ error: "'from' must be before 'to'" }, { status: 400 });
  }

  try {
    // getHistoricRates returns Array<{ timestamp: number, open, high, low, close, volume }>
    const raw = await getHistoricRates({
      instrument: instrument as typeof Instrument.xauusd,
      dates: { from: fromDate, to: toDate },
      timeframe: timeframe as typeof Timeframe.m1,
      format: "json",
      // Disable cache: /tmp is ephemeral per-invocation on Vercel so caching
      // gives no benefit, and the default path (/var/task) is read-only.
      useCache: false,
      cacheFolderPath: "/tmp/.dukascopy-cache",
    }) as { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[];

    // Convert to lightweight-charts-compatible OHLCV (timestamp in seconds).
    // Use instrument-specific precision so forex pairs (e.g. EURUSD at 1.08xxx)
    // are not truncated to 3dp — which would destroy sub-0.001 intra-minute moves.
    const dp = PRICE_PRECISION[instrumentKey] ?? 5;
    const candles = raw.map(({ timestamp, open, high, low, close, volume }) => ({
      time:   Math.floor(timestamp / 1000),
      open:   +open.toFixed(dp),
      high:   +high.toFixed(dp),
      low:    +low.toFixed(dp),
      close:  +close.toFixed(dp),
      volume: +volume.toFixed(2),
    }));

    return NextResponse.json({ candles });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backtesting/candles] fetch error:", message);
    return NextResponse.json({ error: "Failed to fetch candle data", detail: message }, { status: 502 });
  }
}
