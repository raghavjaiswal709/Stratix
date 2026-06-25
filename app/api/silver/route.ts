/**
 * GET /api/silver
 * Server-side proxy for gold-api.com XAGUSD.
 * Called from the browser every 1s — runs on Vercel (no CORS issues).
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAG", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
    const d = await res.json();
    const price = Number(d.price);
    if (!Number.isFinite(price)) return NextResponse.json({ error: "invalid" }, { status: 502 });
    return NextResponse.json({ symbol: "XAGUSD", price, timestamp: Date.now() });
  } catch {
    return NextResponse.json({ error: "timeout" }, { status: 504 });
  }
}
