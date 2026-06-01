import { NextResponse } from "next/server";
import { getRealTimeRates, getHistoricRates, Timeframe, Instrument } from "dukascopy-node";

export const runtime = "nodejs";
export const maxDuration = 15;

// Binance REST API base URL (public, no auth required)
const BINANCE_API = "https://api.binance.com/api/v3";

// Binance symbol map for crypto instruments
const BINANCE_SYMBOLS: Record<string, string> = {
  btcusd: "BTCUSDT",
  ethusd: "ETHUSDT",
  ltcusd: "LTCUSDT",
  xrpusd: "XRPUSDT",
  bchusd: "BCHUSDT",
  eosusd: "EOSUSDT",
  xlmusd: "XLMUSDT",
  adausd: "ADAUSDT",
  dotusd: "DOTUSDT",
  lnkusd: "LINKUSDT",
  uniusd: "UNIUSDT",
  solusd: "SOLUSDT",
};

// Dukascopy symbol map for forex, metals, and indices
const DUKASCOPY_SYMBOLS: Record<string, string> = {
  // Forex Majors
  eurusd: Instrument.eurusd,
  usdjpy: Instrument.usdjpy,
  gbpusd: Instrument.gbpusd,
  usdchf: Instrument.usdchf,
  audusd: Instrument.audusd,
  usdcad: Instrument.usdcad,
  nzdusd: Instrument.nzdusd,
  // Metals
  xauusd: Instrument.xauusd,
  xagusd: Instrument.xagusd,
  xpdusd: "xpdcmdusd",
  xptusd: "xptcmdusd",
  // Forex Crosses
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
  // Indices
  spx500: "usa500idxusd",
  nasusd: "usatechidxusd",
  wti: "lightcmdusd",
  ukxusd: "gbridxgbp",
  deuidxeur: "deuidxeur",
  fraidxeur: "fraidxeur",
  jpnidxjpy: "jpnidxjpy",
  hkgidxhkd: "hkgidxhkd",
};

// ---------------------------------------------------------------------------
// Fetch from Binance (crypto) — fast, reliable, free
// ---------------------------------------------------------------------------
async function fetchBinancePrice(binanceSymbol: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `${BINANCE_API}/ticker/bookTicker?symbol=${binanceSymbol}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Binance HTTP ${res.status}`);
    }

    const data = await res.json();
    let bid = parseFloat(data.bidPrice);
    let ask = parseFloat(data.askPrice);

    // Fallback: some pairs (e.g. EOS) have empty order books — use ticker/price
    if (bid === 0 && ask === 0) {
      const fallbackController = new AbortController();
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 5000);
      try {
        const fallbackRes = await fetch(
          `${BINANCE_API}/ticker/price?symbol=${binanceSymbol}`,
          { signal: fallbackController.signal }
        );
        clearTimeout(fallbackTimeout);
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const price = parseFloat(fallbackData.price);
          if (price > 0) {
            bid = price;
            ask = price;
          }
        }
      } catch {
        clearTimeout(fallbackTimeout);
      }
    }

    const mid = (bid + ask) / 2;
    const spread = ask - bid;

    return {
      timestamp: Date.now(),
      bid: +bid.toFixed(8),
      ask: +ask.toFixed(8),
      mid: +mid.toFixed(8),
      spread: +spread.toFixed(8),
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Fetch from Dukascopy (forex/metals/indices) — slower, with timeout protection
// ---------------------------------------------------------------------------
async function fetchDukascopyPrice(dukascopySymbol: string) {
  // Race the Dukascopy call against a 5-second timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Dukascopy timeout (5s)")), 5000);
  });

  const fetchPromise = getRealTimeRates({
    instrument: dukascopySymbol as any,
    timeframe: "tick" as any,
    last: 1,
    format: "json" as any,
  } as any) as Promise<any[]>;

  const raw = await Promise.race([fetchPromise, timeoutPromise]);

  if (!raw || !raw.length) {
    throw new Error("No rate data returned from Dukascopy");
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

  const mid = (bid + ask) / 2;
  const spread = ask - bid;

  return {
    timestamp,
    bid: +bid.toFixed(6),
    ask: +ask.toFixed(6),
    mid: +mid.toFixed(6),
    spread: +spread.toFixed(6),
  };
}

// ---------------------------------------------------------------------------
// Fetch daily range from Binance (crypto)
// ---------------------------------------------------------------------------
async function fetchBinanceDailyRange(binanceSymbol: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `${BINANCE_API}/ticker/24hr?symbol=${binanceSymbol}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    return {
      high: +parseFloat(data.highPrice).toFixed(8),
      low: +parseFloat(data.lowPrice).toFixed(8),
    };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch daily range from Dukascopy (forex/metals/indices)
// ---------------------------------------------------------------------------
async function fetchDukascopyDailyRange(dukascopySymbol: string) {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Dukascopy daily timeout (8s)")), 8000);
    });

    const fetchPromise = getHistoricRates({
      instrument: dukascopySymbol as typeof Instrument.xauusd,
      dates: { from, to },
      timeframe: Timeframe.d1,
      format: "json",
      useCache: false,
    }) as Promise<{ timestamp: number; open: number; high: number; low: number; close: number }[]>;

    const history = await Promise.race([fetchPromise, timeoutPromise]);

    if (history && history.length > 0) {
      const lastCandle = history[history.length - 1];
      return {
        high: +lastCandle.high.toFixed(6),
        low: +lastCandle.low.toFixed(6),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main GET handler
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrumentKey = (searchParams.get("instrument") ?? "eurusd").toLowerCase();
  const getDailyRange = searchParams.get("daily") === "true";

  const isBinance = instrumentKey in BINANCE_SYMBOLS;
  const isDukascopy = instrumentKey in DUKASCOPY_SYMBOLS;

  if (!isBinance && !isDukascopy) {
    return NextResponse.json(
      { error: `Unsupported instrument: ${instrumentKey}` },
      { status: 400 }
    );
  }

  try {
    let priceData;

    if (isBinance) {
      priceData = await fetchBinancePrice(BINANCE_SYMBOLS[instrumentKey]);
    } else {
      priceData = await fetchDukascopyPrice(DUKASCOPY_SYMBOLS[instrumentKey]);
    }

    const responseData: any = { ...priceData };

    // Fetch daily range if requested
    if (getDailyRange) {
      if (isBinance) {
        const daily = await fetchBinanceDailyRange(BINANCE_SYMBOLS[instrumentKey]);
        if (daily) responseData.daily = daily;
      } else {
        const daily = await fetchDukascopyDailyRange(DUKASCOPY_SYMBOLS[instrumentKey]);
        if (daily) responseData.daily = daily;
      }
    }

    return NextResponse.json(responseData, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    console.error(`Error in live-price API for ${instrumentKey}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch live rate" },
      { status: 500 }
    );
  }
}
