import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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
  ETHUSD: "ETH/USD",
  BTCUSD: "BTC/USD",
  BTCUSDT: "BTC/USDT",
};

function toUTCDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

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

async function fetchCsvContent(symbolFolder: string, fileName: string, origin: string, cookieHeader: string): Promise<string | null> {
  const urls = [
    `https://raw.githubusercontent.com/raghavjaiswal709/Stratix/refs/heads/master/public/data/candles/${symbolFolder}/${fileName}`,
    `https://raw.githubusercontent.com/raghavjaiswal709/Stratix/refs/heads/main/public/data/candles/${symbolFolder}/${fileName}`,
    `https://cdn.jsdelivr.net/gh/raghavjaiswal709/Stratix@master/public/data/candles/${symbolFolder}/${fileName}`,
    `https://cdn.jsdelivr.net/gh/raghavjaiswal709/Stratix@main/public/data/candles/${symbolFolder}/${fileName}`,
    `${origin}/data/candles/${symbolFolder}/${fileName}`
  ];

  for (const url of urls) {
    try {
      const headers: Record<string, string> = {};
      if (url.startsWith(origin)) {
        headers["cookie"] = cookieHeader;
      }
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.status === 200) {
        const text = await res.text();
        if (text && text.trim().length > 0 && !text.includes("<html") && !text.includes("<!DOCTYPE")) {
          return text;
        }
      }
    } catch {
      // ignore and try next
    }
  }
  return null;
}

async function fetchTwelveData(symbol: string, interval: string, from: string, to: string) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("Twelve Data API key is missing");
  }

  const tdSymbol = SYMBOL_MAP[symbol.toUpperCase()] ?? symbol;

  const INTERVAL_MIN: Record<string, number> = {
    "1min": 1, "5min": 5, "15min": 15, "30min": 30,
    "45min": 45, "1h": 60, "2h": 120, "4h": 240, "1day": 1440,
  };
  const ivMin = INTERVAL_MIN[interval] ?? 15;
  const spanMin = Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 60000);
  const outputsize = Math.min(5000, Math.max(50, Math.ceil(spanMin / ivMin) + 100));

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
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Twelve Data API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.status === "error" || !Array.isArray(data.values)) {
    throw new Error(data.message ?? "Unexpected API response from Twelve Data");
  }

  return data.values
    .reverse()
    .map((v: any) => ({
      time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || "0"),
    }));
}

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

  const lookbackMins = 500 * ivMin;
  const paddedFromSec = fromSec - (lookbackMins * 60);
  const paddedFromDate = new Date(paddedFromSec * 1000);

  const matchedSymbol = matchKnownSymbol(symbol);
  const symbolFolder = matchedSymbol ?? cleanSymbol(symbol);

  const months = getMonthsInRange(paddedFromDate, new Date(to));
  const candles1m: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];

  const origin = new URL(req.url).origin;
  const cookieHeader = req.headers.get("cookie") ?? "";

  for (const { year, month } of months) {
    const fileName = `${symbolFolder}_${year}_${month}.csv`;
    const fileContent = await fetchCsvContent(symbolFolder, fileName, origin, cookieHeader);
    if (!fileContent) continue;
    
    try {
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
      // ignore file parse errors
    }
  }

  if (candles1m.length === 0) {
    // Fallback to Twelve Data
    try {
      const paddedFromStr = new Date(paddedFromSec * 1000).toISOString();
      const tdCandles = await fetchTwelveData(symbol, interval, paddedFromStr, to);
      return NextResponse.json({ candles: tdCandles, source: "twelvedata" });
    } catch (err: any) {
      return NextResponse.json({
        error: `No local/GitHub data found, and Twelve Data fallback failed: ${err.message}`,
        candles: [],
      });
    }
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

  return NextResponse.json({ candles: finalCandles, source: "github-local" });
}
