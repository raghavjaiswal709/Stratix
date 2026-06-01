// ─── Live candle API route ────────────────────────────────────────────────────
// Returns the most recent 1-minute candle for the given instrument.
// Used by liveDataFeed.ts to update the chart in real time.
// SERVICE DISABLED — re-enable by setting LIVE_FEED_DISABLED = false and
// restoring the dukascopy-node imports and INSTRUMENT_MAP below.

import { NextResponse } from "next/server";
// import { getHistoricRates, Timeframe, Instrument } from "dukascopy-node";

export const runtime    = "nodejs";
export const maxDuration = 30;

const LIVE_FEED_DISABLED = true;

// const INSTRUMENT_MAP: Record<string, string> = {
//   xauusd: Instrument.xauusd,
//   xagusd: Instrument.xagusd,
//   eurusd: Instrument.eurusd,
//   gbpusd: Instrument.gbpusd,
//   usdcad: Instrument.usdcad,
//   usdjpy: Instrument.usdjpy,
//   nzdusd: Instrument.nzdusd,
//   audusd: Instrument.audusd,
//   usdchf: Instrument.usdchf,
//   ethusd: Instrument.ethusd,
//   btcusdt: Instrument.btcusd,
//   dxy: Instrument.dollaridxusd,
//   usoil: Instrument.lightcmdusd,
//   us100: Instrument.usatechidxusd,
// };

export async function GET(_request: Request) {
  if (LIVE_FEED_DISABLED) {
    return NextResponse.json({ candle: null, disabled: true }, { status: 503 });
  }

  // Re-enable: uncomment imports, INSTRUMENT_MAP, and the full fetch logic below.
  return NextResponse.json({ candle: null });

  // ── Original fetch logic (disabled) ───────────────────────────────────────
  // const { searchParams } = new URL(_request.url);
  // const instrumentKey = (searchParams.get("instrument") ?? "xauusd").toLowerCase();
  // const instrument = INSTRUMENT_MAP[instrumentKey];
  // if (!instrument) return NextResponse.json({ candle: null }, { status: 400 });
  // const to = new Date();
  // const from = new Date(to.getTime() - 60 * 60 * 1000);
  // const fetchPromise = getHistoricRates({ instrument, dates: { from, to }, timeframe: Timeframe.m1, format: "json", useCache: false, cacheFolderPath: "/tmp/.dukascopy-cache" });
  // const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000));
  // try {
  //   const result = await Promise.race([fetchPromise, timeoutPromise]) as any[];
  //   const raw = result ?? [];
  //   if (!raw.length) return NextResponse.json({ candle: null });
  //   const last = raw[raw.length - 1];
  //   return NextResponse.json({ candle: { time: Math.floor(last.timestamp / 1000), open: +last.open.toFixed(3), high: +last.high.toFixed(3), low: +last.low.toFixed(3), close: +last.close.toFixed(3), volume: +last.volume.toFixed(2) } });
  // } catch { return NextResponse.json({ candle: null }); }
}
