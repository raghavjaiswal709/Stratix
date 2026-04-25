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
  ETHUSD: "ETH/USD:Kraken",
  BTCUSDT: "BTC/USDT:Binance",
};

/** Format a Date as "YYYY-MM-DD HH:mm:ss" in UTC for Twelve Data */
function toUTCDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${dy} ${h}:${mi}:${s}`;
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

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ noApiKey: true, candles: [] });
  }

  const tdSymbol = SYMBOL_MAP[symbol.toUpperCase()] ?? symbol;

  try {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", tdSymbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("start_date", toUTCDateStr(new Date(from)));
    url.searchParams.set("end_date", toUTCDateStr(new Date(to)));
    url.searchParams.set("outputsize", "500");
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
