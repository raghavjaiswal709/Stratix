// ─── Live price API route ─────────────────────────────────────────────────────
// Fetches real-time bid/ask from Binance (crypto) or Dukascopy (forex/metals).
// SERVICE DISABLED — set LIVE_DATA_DISABLED = false and restore the
// dukascopy-node import + DUKASCOPY_SYMBOLS + fetch helpers to re-enable.

import { NextResponse } from "next/server";
// import { getRealTimeRates, getHistoricRates, Timeframe, Instrument } from "dukascopy-node";

export const runtime = "nodejs";
export const maxDuration = 15;

const LIVE_DATA_DISABLED = true;

// ── Binance symbol map (no changes needed when re-enabling) ────────────────────
const BINANCE_SYMBOLS: Record<string, string> = {
  btcusd: "BTCUSDT", ethusd: "ETHUSDT", ltcusd: "LTCUSDT", xrpusd: "XRPUSDT",
  bchusd: "BCHUSDT", eosusd: "EOSUSDT", xlmusd: "XLMUSDT", adausd: "ADAUSDT",
  dotusd: "DOTUSDT", lnkusd: "LINKUSDT", uniusd: "UNIUSDT", solusd: "SOLUSDT",
};

// ── Dukascopy symbol map — restore when re-enabling ───────────────────────────
// const DUKASCOPY_SYMBOLS: Record<string, string> = {
//   eurusd: Instrument.eurusd, usdjpy: Instrument.usdjpy, gbpusd: Instrument.gbpusd,
//   usdchf: Instrument.usdchf, audusd: Instrument.audusd, usdcad: Instrument.usdcad,
//   nzdusd: Instrument.nzdusd, xauusd: Instrument.xauusd, xagusd: Instrument.xagusd,
//   xpdusd: "xpdcmdusd", xptusd: "xptcmdusd",
//   eurgbp: Instrument.eurgbp, eurjpy: Instrument.eurjpy, eurchf: Instrument.eurchf,
//   euraud: Instrument.euraud, eurcad: Instrument.eurcad, eurnzd: Instrument.eurnzd,
//   gbpjpy: Instrument.gbpjpy, gbpchf: Instrument.gbpchf, gbpaud: Instrument.gbpaud,
//   gbpcad: Instrument.gbpcad, gbpnzd: Instrument.gbpnzd, audjpy: Instrument.audjpy,
//   audchf: Instrument.audchf, audcad: Instrument.audcad, audnzd: Instrument.audnzd,
//   cadjpy: Instrument.cadjpy, chfjpy: Instrument.chfjpy, nzdjpy: Instrument.nzdjpy,
//   spx500: "usa500idxusd", nasusd: "usatechidxusd", wti: "lightcmdusd",
//   ukxusd: "gbridxgbp", deuidxeur: "deuidxeur", fraidxeur: "fraidxeur",
//   jpnidxjpy: "jpnidxjpy", hkgidxhkd: "hkgidxhkd",
// };

// ── Binance fetch helpers (kept for reference) ────────────────────────────────
// async function fetchBinancePrice(binanceSymbol: string) { ... }
// async function fetchBinanceDailyRange(binanceSymbol: string) { ... }

// ── Dukascopy fetch helpers (kept for reference) ──────────────────────────────
// async function fetchDukascopyPrice(dukascopySymbol: string) { ... }
// async function fetchDukascopyDailyRange(dukascopySymbol: string) { ... }

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET(_request: Request) {
  if (LIVE_DATA_DISABLED) {
    return NextResponse.json(
      { error: "Live price service is temporarily disabled." },
      { status: 503 }
    );
  }

  // ── Re-enable: restore DUKASCOPY_SYMBOLS and fetch helpers above, then use: ──
  // const { searchParams } = new URL(_request.url);
  // const instrumentKey = (searchParams.get("instrument") ?? "eurusd").toLowerCase();
  // const getDailyRange  = searchParams.get("daily") === "true";
  // const isBinance    = instrumentKey in BINANCE_SYMBOLS;
  // const isDukascopy  = instrumentKey in DUKASCOPY_SYMBOLS;
  // if (!isBinance && !isDukascopy) {
  //   return NextResponse.json({ error: `Unsupported instrument: ${instrumentKey}` }, { status: 400 });
  // }
  // try {
  //   let priceData = isBinance
  //     ? await fetchBinancePrice(BINANCE_SYMBOLS[instrumentKey])
  //     : await fetchDukascopyPrice(DUKASCOPY_SYMBOLS[instrumentKey]);
  //   const responseData: any = { ...priceData };
  //   if (getDailyRange) {
  //     const daily = isBinance
  //       ? await fetchBinanceDailyRange(BINANCE_SYMBOLS[instrumentKey])
  //       : await fetchDukascopyDailyRange(DUKASCOPY_SYMBOLS[instrumentKey]);
  //     if (daily) responseData.daily = daily;
  //   }
  //   return NextResponse.json(responseData, { headers: { "Cache-Control": "no-store" } });
  // } catch (error) {
  //   console.error(`Error in live-price API:`, error);
  //   return NextResponse.json({ error: "Failed to fetch live rate" }, { status: 500 });
  // }

  return NextResponse.json({ error: "Service disabled" }, { status: 503 });
}

// Keep BINANCE_SYMBOLS referenced so no unused-var TS error
void BINANCE_SYMBOLS;
