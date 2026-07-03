import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsSentimentReportModel } from "@/lib/models/NewsSentimentReport";
import { fetchAllNewsFeeds } from "@/lib/news/feeds";
import { fetchTelegramContentSince } from "@/lib/news/telegram";
import { fetchCentralBankFeeds } from "@/lib/news/central-banks";
import { fetchEconomicCalendar, calendarEventsToArticles } from "@/lib/news/calendar";
import { isHardNoise } from "@/lib/news/scoring";

export const runtime = "nodejs";
export const maxDuration = 120;

// Uses gpt-4o-mini — low-tier, fast, cheap. The gpt-5.5-2026-04-23 model is
// reserved for the deep CHOCH/QML news-analysis report only — do NOT change
// this for the sentiment report feature.
const SENTIMENT_MODEL = "gpt-4o-mini";

const ALLOWED_HOURS = [6, 12, 24, 48, 72];

const INSTRUMENTS = [
  "XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSD",
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
];

function timeRangeLabel(hours: number): string {
  if (hours < 24) return `Last ${hours} Hours`;
  if (hours === 24) return "Last 24 Hours";
  return `Last ${hours / 24} Days`;
}

const SYSTEM_PROMPT = `You are an elite trading sentiment analyst. You receive a STRICT, complete list of every news item published within a fixed recent time window — every RSS headline, every Telegram breaking-alert message, every official central bank press release, and every relevant economic calendar event that was actually collected for that window. Nothing has been pre-filtered by importance; you decide relevance and sentiment yourself.

YOUR JOB — in two steps:
STEP 1: From the complete news list provided, identify every item that is genuinely relevant to gold (XAUUSD/XAGUSD), Bitcoin/crypto (BTCUSDT/ETHUSD), or any forex pair (EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD). Discard anything truly unrelated to trading/markets (e.g. unrelated corporate press releases, sports, lifestyle content that slipped through).
STEP 2: For every relevant item, determine which of the 11 tracked instruments it affects, and whether it is Bullish, Bearish, or Neutral for EACH of those instruments specifically (one news item can be bullish for gold and bearish for EURUSD at the same time — tag each instrument independently, don't assume one sentiment fits all).

STRICT RULES:
- You MUST cover all 11 instruments in "instrument_sentiment": XAUUSD, XAGUSD, BTCUSDT, ETHUSD, EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD — no skipping, even if an instrument has thin news coverage this window (state that plainly in its summary instead).
- "analyzed_news" must include every genuinely relevant, distinguishable news item you found (do not artificially cap unless there are truly more than 150 relevant items, in which case include the 150 most significant and note the total found in your reasoning).
- Do not invent news that wasn't provided. Every headline in your output must be copied from the input list.
- Every sentiment tag must be one of exactly: "Bullish", "Bearish", "Neutral".
- Be specific in summaries — cite actual headlines/events, not generic statements like "market sentiment is mixed."
- Return ONLY a single valid JSON object. No markdown fences, no prose before or after.

MANDATORY JSON SCHEMA (follow field names EXACTLY):
{
  "overall_sentiment": {
    "risk_tone": "Risk-On | Risk-Off | Neutral",
    "summary": "MINIMUM 100 words. Describe the dominant theme(s) driving markets across this entire window, citing specific events/headlines and numbers where available."
  },
  "instrument_sentiment": [
    {
      "symbol": "XAUUSD",
      "sentiment": "Bullish | Bearish | Neutral",
      "confidence": <integer 0-100>,
      "summary": "MINIMUM 40 words explaining why, citing specific headlines from the provided news.",
      "key_drivers": ["exact headline 1 from the input", "exact headline 2 from the input"]
    }
    // ... one object per instrument, ALL 11 REQUIRED, same shape
  ],
  "analyzed_news": [
    {
      "headline": "exact headline text from the input list",
      "source": "exact source from the input",
      "pubDate": "exact pubDate string from the input",
      "impact": "High | Medium | Low",
      "affected_instruments": [
        { "symbol": "XAUUSD", "sentiment": "Bullish" }
        // only instruments this specific item actually affects — usually 1-4, not all 11
      ]
    }
    // as many relevant items as found, most significant first
  ],
  "key_themes": [
    "Theme 1 — one sentence naming the theme and its cross-asset implication",
    "Theme 2 — one sentence naming the theme and its cross-asset implication",
    "Theme 3 — one sentence naming the theme and its cross-asset implication"
  ]
}

FINAL MANDATE: Return ONLY the JSON object above, fully populated, no placeholders, no procrastination.`;

interface NewsInputItem {
  headline: string;
  source: string;
  pubDate: string;
  category: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { hours?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const hours = ALLOWED_HOURS.includes(body.hours as number) ? (body.hours as number) : 12;
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

  // ── Fetch STRICTLY all news within the window, from every source, in parallel ──
  const [rssItems, tgResult, cbItems, calendarEvents] = await Promise.all([
    fetchAllNewsFeeds(),
    fetchTelegramContentSince(hours),
    fetchCentralBankFeeds(),
    fetchEconomicCalendar(),
  ]);

  const isWithinWindow = (pubDate: string) => {
    const t = pubDate ? new Date(pubDate).getTime() : NaN;
    return !isNaN(t) && t >= cutoffMs;
  };

  const rssInWindow = (rssItems as (typeof rssItems[number] & { category: string })[])
    .filter((i) => isWithinWindow(i.pubDate));
  const cbInWindow = cbItems.filter((i) => isWithinWindow(i.pubDate));
  const calendarArticles = calendarEventsToArticles(calendarEvents); // already time-windowed internally

  const combined: NewsInputItem[] = [
    ...rssInWindow.filter((i) => !isHardNoise(i.title)).map((i) => ({
      headline: i.title, source: i.source, pubDate: i.pubDate, category: i.category,
    })),
    ...tgResult.items.filter((i) => !isHardNoise(i.title)).map((i) => ({
      headline: i.title, source: i.source, pubDate: i.pubDate, category: "Telegram",
    })),
    ...cbInWindow.filter((i) => !isHardNoise(i.title)).map((i) => ({
      headline: i.title, source: i.source, pubDate: i.pubDate, category: "Central Bank",
    })),
    ...calendarArticles.map((i) => ({
      headline: i.title, source: i.source, pubDate: i.pubDate, category: "Economic Calendar",
    })),
  ];

  // Dedupe exact/near-duplicate headlines (same story syndicated across many feeds)
  const seen = new Set<string>();
  const deduped = combined.filter((i) => {
    const key = i.headline.toLowerCase().replace(/\s+/g, " ").slice(0, 70);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  if (deduped.length === 0) {
    return NextResponse.json({ error: "No news found in this time window across any source" }, { status: 400 });
  }

  const label = timeRangeLabel(hours);
  const userMsg = `Time window: ${label} (strictly all news published in this window, from every configured source).
Total news items provided: ${deduped.length}
Tracked instruments (all 11 mandatory in instrument_sentiment): ${INSTRUMENTS.join(", ")}

COMPLETE NEWS LIST (JSON array — every item below was actually published in this window):
${JSON.stringify(deduped, null, 1)}

Analyze this data per the schema and rules in the system prompt.`;

  let rawResponse: string;
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: SENTIMENT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.3,
      max_tokens: 16000,
      response_format: { type: "json_object" },
    });
    rawResponse = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    return NextResponse.json(
      { error: `AI analysis failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 502 },
    );
  }

  if (!rawResponse) {
    return NextResponse.json({ error: "AI returned an empty response. Please retry." }, { status: 422 });
  }

  let analysisData: unknown;
  try {
    const fence = rawResponse.match(/```json\s*([\s\S]*?)```/);
    analysisData = fence ? JSON.parse(fence[1].trim()) : JSON.parse(rawResponse);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON. Please retry.", raw: rawResponse.slice(0, 500) },
      { status: 422 },
    );
  }

  await dbConnect();
  const doc = await NewsSentimentReportModel.create({
    hours,
    timeRangeLabel: label,
    newsAnalyzedCount: deduped.length,
    data: analysisData,
    generatedBy: session.user.email ?? session.user.id,
    generatedByName: session.user.name ?? "",
    generatedAt: new Date(),
  });

  return NextResponse.json({
    _id: String(doc._id),
    hours,
    timeRangeLabel: label,
    newsAnalyzedCount: deduped.length,
    generatedBy: doc.generatedBy,
    generatedByName: doc.generatedByName,
    generatedAt: doc.generatedAt,
    data: analysisData,
  }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  // Visible to ALL users — no userId filter — each report is tagged with who generated it.
  const reports = await NewsSentimentReportModel.find({})
    .select("-data")
    .sort({ generatedAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json(reports);
}
