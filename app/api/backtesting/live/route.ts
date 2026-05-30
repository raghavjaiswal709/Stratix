// ─── Live candle API route ────────────────────────────────────────────────────
// Returns the most recent 1-minute candle for the given instrument.
// Used by liveDataFeed.ts to update the chart in real time.

import { NextResponse } from "next/server";
import { getHistoricRates, Timeframe, Instrument } from "dukascopy-node";

export const runtime    = "nodejs";
export const maxDuration = 30;

const INSTRUMENT_MAP: Record<string, string> = {
  xauusd: Instrument.xauusd,
  btcusd: Instrument.btcusd,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrumentKey = (searchParams.get("instrument") ?? "xauusd").toLowerCase();

  const instrument = INSTRUMENT_MAP[instrumentKey];
  if (!instrument) {
    return NextResponse.json({ candle: null }, { status: 400 });
  }

  // Fetch the last 10 minutes of 1m data and return the most recent candle
  const to   = new Date();
  const from = new Date(to.getTime() - 10 * 60 * 1000);

  try {
    const raw = await getHistoricRates({
      instrument: instrument as typeof Instrument.xauusd,
      dates: { from, to },
      timeframe: Timeframe.m1,
      format: "json",
      useCache: false, // always get fresh data for live feed
    }) as { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[];

    if (!raw.length) {
      return NextResponse.json({ candle: null });
    }

    // Return the most recent candle
    const last = raw[raw.length - 1];
    return NextResponse.json({
      candle: {
        time:   Math.floor(last.timestamp / 1000),
        open:   +last.open.toFixed(3),
        high:   +last.high.toFixed(3),
        low:    +last.low.toFixed(3),
        close:  +last.close.toFixed(3),
        volume: +last.volume.toFixed(2),
      },
    });
  } catch {
    // Live feed failures are silent — client handles reconnection
    return NextResponse.json({ candle: null });
  }
}
