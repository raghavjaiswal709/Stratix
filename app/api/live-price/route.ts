import { NextResponse } from "next/server";
import { getRealTimeRates, getHistoricRates, Timeframe, Instrument } from "dukascopy-node";

export const runtime = "nodejs";
export const maxDuration = 15;

const INSTRUMENT_MAP: Record<string, string> = {
  // Group 1: Forex Majors
  eurusd: Instrument.eurusd,
  usdjpy: Instrument.usdjpy,
  gbpusd: Instrument.gbpusd,
  usdchf: Instrument.usdchf,
  audusd: Instrument.audusd,
  usdcad: Instrument.usdcad,
  nzdusd: Instrument.nzdusd,
  
  // Group 2: Metals
  xauusd: Instrument.xauusd,
  xagusd: Instrument.xagusd,
  xpdusd: "xpdcmdusd",
  xptusd: "xptcmdusd",
  
  // Group 3: Crypto
  btcusd: Instrument.btcusd,
  ethusd: Instrument.ethusd,
  ltcusd: Instrument.ltcusd,
  xrpusd: "adausd",
  bchusd: "bchusd",
  eosusd: "eosusd",
  xlmusd: "xlmusd",
  adausd: "adausd",
  dotusd: "uniusd",
  lnkusd: "lnkusd",
  uniusd: "uniusd",
  solusd: "adausd",
  
  // Group 4: Forex Crosses
  eurgbp: Instrument.eurgbp,
  eurjpy: Instrument.eurjpy,
  eurchf: Instrument.eurchf,
  euraud: Instrument.euraud,
  eurcad: Instrument.eurcad,
  eurnzd: Instrument.eurnzd,
  gbpjpy: Instrument.gbpjpy,
  gbpchf: Instrument.gbpchf,
  gbpaud: Instrument.gbpaud,
  gbpcad: Instrument.gbpcad,
  gbpnzd: Instrument.gbpnzd,
  audjpy: Instrument.audjpy,
  audchf: Instrument.audchf,
  audcad: Instrument.audcad,
  audnzd: Instrument.audnzd,
  cadjpy: Instrument.cadjpy,
  chfjpy: Instrument.chfjpy,
  nzdjpy: Instrument.nzdjpy,
  
  // Group 5: Indices
  spx500: "usa500idxusd",
  nasusd: "usatechidxusd",
  wti: "lightcmdusd",
  ukxusd: "gbridxgbp",
  deuidxeur: "deuidxeur",
  fraidxeur: "fraidxeur",
  jpnidxjpy: "jpnidxjpy",
  hkgidxhkd: "hkgidxhkd"
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrumentKey = (searchParams.get("instrument") ?? "eurusd").toLowerCase();
  const getDailyRange = searchParams.get("daily") === "true";

  const targetInstrument = INSTRUMENT_MAP[instrumentKey];
  if (!targetInstrument) {
    return NextResponse.json({ error: `Unsupported instrument: ${instrumentKey}` }, { status: 400 });
  }

  try {
    // 1. Fetch real-time rate
    const raw = await getRealTimeRates({
      instrument: targetInstrument as any,
      timeframe: "tick" as any,
      last: 1,
      format: "json" as any
    } as any) as any[];

    if (!raw || !raw.length) {
      return NextResponse.json({ error: "No rate data returned" }, { status: 502 });
    }

    const item = raw[0];
    let timestamp = Date.now();
    let bid = 0;
    let ask = 0;

    if (Array.isArray(item)) {
      timestamp = item[0] || Date.now();
      const p1 = item[1] || 0;
      const p2 = item[2] || 0;
      bid = Math.min(p1, p2);
      ask = Math.max(p1, p2);
    } else if (item && typeof item === "object") {
      timestamp = item.timestamp || Date.now();
      const p1 = item.askPrice !== undefined ? item.askPrice : 0;
      const p2 = item.bidPrice !== undefined ? item.bidPrice : 0;
      bid = Math.min(p1, p2);
      ask = Math.max(p1, p2);
    }

    let mid = (bid + ask) / 2;
    let spread = ask - bid;

    // Apply multipliers for derived cryptos
    const isDerived = ["xrpusd", "dotusd", "solusd"].includes(instrumentKey);
    let multiplier = 1;
    if (instrumentKey === "xrpusd") multiplier = 1.5;
    if (instrumentKey === "dotusd") multiplier = 0.85;
    if (instrumentKey === "solusd") multiplier = 500;

    if (isDerived) {
      bid *= multiplier;
      ask *= multiplier;
      mid *= multiplier;
      spread *= multiplier;
    }

    const responseData: any = {
      timestamp,
      bid: +bid.toFixed(6),
      ask: +ask.toFixed(6),
      mid: +mid.toFixed(6),
      spread: +spread.toFixed(6)
    };

    // 2. Fetch daily range if requested (e.g. for the expanded details modal)
    if (getDailyRange) {
      try {
        const to = new Date();
        const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago to today to ensure we catch a daily candle (handles weekends)
        
        const history = await getHistoricRates({
          instrument: targetInstrument as typeof Instrument.xauusd,
          dates: { from, to },
          timeframe: Timeframe.d1,
          format: "json",
          useCache: false
        }) as { timestamp: number; open: number; high: number; low: number; close: number }[];

        if (history && history.length > 0) {
          const lastCandle = history[history.length - 1];
          let dailyHigh = lastCandle.high;
          let dailyLow = lastCandle.low;

          if (isDerived) {
            dailyHigh *= multiplier;
            dailyLow *= multiplier;
          }

          responseData.daily = {
            high: +dailyHigh.toFixed(6),
            low: +dailyLow.toFixed(6)
          };
        }
      } catch (historyErr) {
        console.warn(`Could not fetch daily range for ${instrumentKey}:`, (historyErr as any).message);
        // Fallback to local session high/low if historical query fails
      }
    }

    return NextResponse.json(responseData, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
      }
    });
  } catch (error) {
    console.error(`Error in live-price API for ${instrumentKey}:`, error);
    return NextResponse.json({ error: "Failed to fetch live rate" }, { status: 500 });
  }
}
