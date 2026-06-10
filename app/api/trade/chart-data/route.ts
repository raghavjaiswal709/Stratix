import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

const SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "XAU/USD",
  XAGUSD: "XAG/USD",
  GBPUSD: "GBP/USD",
  EURUSD: "EUR/USD",
  USDCAD: "USD/CAD",
  USDJPY: "USD/JPY",
  USDCHF: "USD/CHF",
  GBPJPY: "GBP/JPY",
  EURJPY: "EUR/JPY",
  AUDUSD: "AUD/USD",
  NZDUSD: "NZD/USD",
  ETHUSD: "ETH/USD:Kraken",
  BTCUSDT: "BTC/USDT:Binance",
};

function getMonthsInRange(from: Date, to: Date): Array<{ year: number; month: string }> {
  const result: Array<{ year: number; month: string }> = [];
  
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth(); // 0-indexed
  
  const endYear = to.getUTCFullYear();
  const endMonth = to.getUTCMonth();
  
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const monthStr = String(month + 1).padStart(2, "0");
    result.push({ year, month: monthStr });
    
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return result;
}

function matchKnownSymbol(symbol: string): string | null {
  const clean = symbol.toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = [
    "audusd", "btcusdt", "dxy", "ethusd", "eurusd", 
    "gbpusd", "nzdusd", "us100", "usdcad", "usdchf", 
    "usdjpy", "usoil", "xagusd", "xauusd"
  ];
  if (known.includes(clean)) return clean;
  for (const k of known) {
    if (clean.startsWith(k)) return k;
  }
  for (const k of known) {
    if (clean.includes(k)) return k;
  }
  return null;
}

const cleanSymbol = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "";
  const interval = searchParams.get("interval") ?? "15min";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!symbol || !from || !to) {
    return NextResponse.json({ error: "Missing required params", candles: [] });
  }

  const INTERVAL_MIN: Record<string, number> = {
    "1min": 1, "5min": 5, "15min": 15, "30min": 30,
    "45min": 45, "1h": 60, "2h": 120, "4h": 240, "1day": 1440,
  };
  const ivMin = INTERVAL_MIN[interval] ?? 15;

  const fromSec = Math.floor(new Date(from).getTime() / 1000);
  const toSec = Math.floor(new Date(to).getTime() / 1000);

  // Pad the "from" time to load sufficient historical candles for lookback/scroll back (e.g. 500 candles)
  const lookbackMins = 500 * ivMin;
  const paddedFromSec = fromSec - (lookbackMins * 60);
  const paddedFromDate = new Date(paddedFromSec * 1000);

  const matchedSymbol = matchKnownSymbol(symbol);
  const symbolFolder = matchedSymbol ?? cleanSymbol(symbol);
  const folderPath = path.join(process.cwd(), "public/data/candles", symbolFolder);

  const months = getMonthsInRange(paddedFromDate, new Date(to));
  const candles1m: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];

  for (const { year, month } of months) {
    const fileName = `${symbolFolder}_${year}_${month}.csv`;
    const filePath = path.join(folderPath, fileName);
    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const lines = fileContent.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const [timeStr, openStr, highStr, lowStr, closeStr, volStr] = line.split(",");
        const time = parseInt(timeStr, 10);
        if (isNaN(time)) continue;
        
        const open = parseFloat(openStr);
        const high = parseFloat(highStr);
        const low = parseFloat(lowStr);
        const close = parseFloat(closeStr);
        const volume = parseFloat(volStr || "0");

        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;

        if (time >= paddedFromSec && time <= toSec) {
          candles1m.push({
            time,
            open,
            high,
            low,
            close,
            volume,
          });
        }
      }
    } catch {
      // File not found or read error, ignore
    }
  }

  if (candles1m.length === 0) {
    return NextResponse.json({
      error: "No local candle data found for the requested period.",
      candles: [],
    });
  }

  // Sort oldest-first for lightweight-charts
  candles1m.sort((a, b) => a.time - b.time);

  // Deduplicate 1m candles
  const unique1m: typeof candles1m = [];
  let lastTime = -1;
  for (const c of candles1m) {
    if (c.time !== lastTime) {
      unique1m.push(c);
      lastTime = c.time;
    }
  }

  // Aggregate into requested interval if needed
  let finalCandles = unique1m;
  if (ivMin > 1) {
    const aggregated: typeof unique1m = [];
    const groupSec = ivMin * 60;
    
    let currentGroup: typeof unique1m[0] | null = null;
    for (const c of unique1m) {
      const groupTime = Math.floor(c.time / groupSec) * groupSec;
      if (!currentGroup || currentGroup.time !== groupTime) {
        if (currentGroup) {
          aggregated.push(currentGroup);
        }
        currentGroup = {
          time: groupTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        };
      } else {
        currentGroup.high = Math.max(currentGroup.high, c.high);
        currentGroup.low = Math.min(currentGroup.low, c.low);
        currentGroup.close = c.close;
        currentGroup.volume += c.volume;
      }
    }
    if (currentGroup) {
      aggregated.push(currentGroup);
    }
    finalCandles = aggregated;
  }

  return NextResponse.json({ candles: finalCandles });
}

/* ── Twelve Data Implementation (Commented out as requested) ───────────────────
export async function GET_TWELVEDATA(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") ?? "";
  const interval = searchParams.get("interval") ?? "15min";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  if (!symbol || !from || !to) {
    return NextResponse.json({ error: "Missing required params", candles: [] });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ noApiKey: true, candles: [] });
  }

  const tdSymbol = SYMBOL_MAP[symbol.toUpperCase()] ?? symbol;

  // Size the request so the FULL requested window comes back in one call.
  // (A fixed 500 truncated wide windows, dropping the candles a trade's real
  // entry/exit fell on once we widened the window to absorb broker-time skew.)
  const INTERVAL_MIN: Record<string, number> = {
    "1min": 1, "5min": 5, "15min": 15, "30min": 30,
    "45min": 45, "1h": 60, "2h": 120, "4h": 240, "1day": 1440,
  };
  const ivMin = INTERVAL_MIN[interval] ?? 15;
  const spanMin = Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 60000);
  const outputsize = Math.min(5000, Math.max(50, Math.ceil(spanMin / ivMin) + 20));

  try {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", tdSymbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("start_date", toUTCDateStr(new Date(from)));
    url.searchParams.set("end_date", toUTCDateStr(new Date(to)));
    url.searchParams.set("outputsize", String(outputsize));
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("format", "JSON");

    const res = await fetch(url.toString(), {
      next: { revalidate: 300 }, // cache 5 minutes
    });

    if (!res.ok) {
      return NextResponse.json({
        error: `Twelve Data API returned HTTP ${res.status}`,
        candles: [],
      });
    }

    const data = await res.json();

    if (data.status === "error" || !Array.isArray(data.values)) {
      return NextResponse.json({
        error: data.message ?? "Unexpected API response",
        candles: [],
      });
    }

    // Twelve Data returns newest-first; reverse to oldest-first for lightweight-charts
    const candles = (
      data.values as Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
      }>
    )
      .reverse()
      .map((v) => ({
        // datetime from Twelve Data with timezone=UTC, append "Z" to parse as UTC
        time: Math.floor(
          new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000
        ),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
      }));

    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Failed to fetch chart data",
      candles: [],
    });
  }
}
*/
