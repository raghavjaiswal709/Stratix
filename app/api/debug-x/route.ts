import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const token = process.env.TWITTER_BEARER_TOKEN;
  const results: Record<string, unknown> = {
    hasToken: !!token,
    tokenLength: token?.length ?? 0,
    tokenPrefix: token ? token.slice(0, 10) + "..." : null,
    timestamp: new Date().toISOString(),
    runtime: "edge",
  };

  // Test 1: Twitter API - GET /2/users/:id/tweets (free tier)
  if (token) {
    try {
      const r = await fetch("https://api.twitter.com/2/users/3295423333/tweets?max_results=5&exclude=retweets,replies", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.text();
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 200); }
      results.twitterAPI = { status: r.status, ok: r.ok, body: parsed };
    } catch (e) {
      results.twitterAPI = { error: String(e) };
    }
  }

  // Test 2: Nitter primary instance
  try {
    const r = await fetch("https://nitter.perennialte.ch/FirstSquawk/rss", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)", Accept: "application/rss+xml" },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.nitterPrimary = {
      status: r.status,
      ok: r.ok,
      hasItems: text.includes("<item>"),
      isBotCheck: text.includes("not a bot") || text.includes("Making sure"),
      preview: text.slice(0, 300),
    };
  } catch (e) {
    results.nitterPrimary = { error: String(e) };
  }

  // Test 3: Nitter fallback
  try {
    const r = await fetch("https://nitter.rawit.eu/FirstSquawk/rss", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)", Accept: "application/rss+xml" },
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    results.nitterFallback = {
      status: r.status,
      ok: r.ok,
      hasItems: text.includes("<item>"),
      isBotCheck: text.includes("not a bot") || text.includes("Making sure"),
      preview: text.slice(0, 200),
    };
  } catch (e) {
    results.nitterFallback = { error: String(e) };
  }

  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
