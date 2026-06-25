/**
 * GET /api/forex-rates
 * Server-side proxy for open.er-api.com — returns all 6 forex pairs.
 * Called from the browser every 10s (free, no key, no CORS issues on Vercel).
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({}, { status: 502 });
    const d = await res.json();
    if (d.result !== "success" || !d.rates) return NextResponse.json({}, { status: 502 });

    const r = d.rates;
    // Convert USD-base rates → standard forex quoting convention
    return NextResponse.json({
      EURUSD: r.EUR ? 1 / r.EUR : null,
      GBPUSD: r.GBP ? 1 / r.GBP : null,
      USDJPY: r.JPY ?? null,
      USDCHF: r.CHF ?? null,
      USDCAD: r.CAD ?? null,
      AUDUSD: r.AUD ? 1 / r.AUD : null,
    });
  } catch {
    return NextResponse.json({}, { status: 504 });
  }
}
