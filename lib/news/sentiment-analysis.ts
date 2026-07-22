import { NextRequest } from "next/server";
import OpenAI from "openai";
import { fetchAllNewsFeeds } from "@/lib/news/feeds";
import { fetchTelegramContentSince } from "@/lib/news/telegram";
import { fetchCentralBankFeeds } from "@/lib/news/central-banks";
import { fetchEconomicCalendar, calendarEventsToArticles } from "@/lib/news/calendar";
import { isHardNoise } from "@/lib/news/scoring";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

// Uses gpt-4o-mini — low-tier, fast, cheap. The gpt-5.5-2026-04-23 model is
// reserved for the deep CHOCH/QML news-analysis report only — do NOT change
// this for the sentiment report / filter-news features. This call passes NO
// tools param — the model cannot browse the web; it strictly reasons over
// the JSON we feed it.
export const SENTIMENT_MODEL = "gpt-4o-mini";

export const ALLOWED_HOURS = [1, 2, 3, 6, 12, 24, 48, 72];

export const INSTRUMENTS = [
  "XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSD",
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
];

export function timeRangeLabel(hours: number): string {
  if (hours < 24) return `Last ${hours} Hour${hours === 1 ? "" : "s"}`;
  if (hours === 24) return "Last 24 Hours";
  return `Last ${hours / 24} Days`;
}

// ─── Real-time hourly candle data — grounds the AI in actual price action ────
interface HCandle { t: number; o: number; h: number; l: number; c: number }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }

const CANDLE_SYMBOLS = ["xauusd", "xagusd", "btcusdt", "ethusd", "eurusd", "gbpusd", "usdjpy", "audusd", "nzdusd", "usdcad", "usdchf"];

export function formatCandlesForPrompt(data: CandleSummary | null, hours: number): string {
  if (!data) return "";
  const h1Limit = Math.min(48, Math.max(4, hours));
  const lines: string[] = ["=== REAL-TIME HOURLY OHLC PRICE DATA (IST) — quote these actual levels, do not guess ==="];

  for (const sym of CANDLE_SYMBOLS) {
    const d = data[sym];
    if (!d?.h1?.length) continue;
    const recent = d.h1.slice(-h1Limit);
    const last = recent[recent.length - 1];
    const first = recent[0];
    const changePct = first?.c ? (((last.c - first.c) / first.c) * 100).toFixed(2) : "0.00";
    lines.push(`\n${sym.toUpperCase()}: current ${last.c} | window-open ${first?.c ?? last.o} | change ${changePct}% | window-high ${Math.max(...recent.map(c => c.h))} | window-low ${Math.min(...recent.map(c => c.l))}`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

export async function fetchCandleSummary(req: NextRequest): Promise<CandleSummary | null> {
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/candle-summary`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    return (await res.json()) as CandleSummary;
  } catch {
    return null;
  }
}

export interface NewsInputItem {
  headline: string;
  source: string;
  pubDate: string;
  category: string;
  /** Original article URL — carried through for display only, never sent to the AI prompt. */
  link: string;
}

export interface GatheredNewsWindow {
  hours: number;
  label: string;
  deduped: NewsInputItem[];
  candleBlock: string;
}

// Fetches STRICTLY all news within the window, from every configured source
// (RSS, Telegram breaking-alerts, central banks, economic calendar) plus real
// candle data, dedupes near-identical syndicated headlines, and sorts newest
// first. Shared by the sentiment-report and filter-news routes.
export async function gatherNewsWindow(hours: number, req: NextRequest): Promise<GatheredNewsWindow> {
  const cutoffMs = Date.now() - hours * 60 * 60 * 1000;

  const [rssItems, tgResult, cbItems, calendarEvents, candles] = await Promise.all([
    fetchAllNewsFeeds(),
    fetchTelegramContentSince(hours),
    fetchCentralBankFeeds(),
    fetchEconomicCalendar(),
    fetchCandleSummary(req),
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
      headline: i.title, source: i.source, pubDate: i.pubDate, category: i.category, link: i.link,
    })),
    ...tgResult.items.filter((i) => !isHardNoise(i.title)).map((i) => ({
      headline: i.title, source: i.source, pubDate: i.pubDate, category: "Breaking Alert", link: i.link,
    })),
    ...cbInWindow.filter((i) => !isHardNoise(i.title)).map((i) => ({
      headline: i.title, source: i.source, pubDate: i.pubDate, category: "Central Bank", link: i.link,
    })),
    ...calendarArticles.map((i) => ({
      headline: i.title, source: i.source, pubDate: i.pubDate, category: "Economic Calendar", link: i.link,
    })),
  ];

  const seen = new Set<string>();
  const deduped = combined.filter((i) => {
    const key = i.headline.toLowerCase().replace(/\s+/g, " ").slice(0, 70);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return { hours, label: timeRangeLabel(hours), deduped, candleBlock: formatCandlesForPrompt(candles, hours) };
}

export class SentimentAnalysisError extends Error {
  status: number;
  raw?: string;
  constructor(message: string, status: number, raw?: string) {
    super(message);
    this.status = status;
    this.raw = raw;
  }
}

// Runs the shared OpenAI sentiment-analysis call over a gathered news window
// and returns the parsed JSON (matching SentimentReportData on the frontend).
// Throws SentimentAnalysisError with an http-appropriate status on failure.
export async function runSentimentAnalysis(window: GatheredNewsWindow, apiKey: string): Promise<unknown> {
  const { label, deduped, candleBlock } = window;
  // link is carried on NewsInputItem for display/enrichment purposes only —
  // never send it to the model, it's irrelevant to sentiment reasoning and
  // would just burn input tokens.
  const promptItems = deduped.map(({ headline, source, pubDate, category }) => ({ headline, source, pubDate, category }));

  const [systemPrompt, userTemplate] = await Promise.all([
    getPromptTemplate("sentimentReport.system"),
    getPromptTemplate("sentimentReport.user"),
  ]);
  const userMsg = renderTemplate(userTemplate, {
    LABEL: label,
    NEWS_COUNT: String(deduped.length),
    INSTRUMENTS: INSTRUMENTS.join(", "),
    CANDLE_BLOCK: candleBlock ? `${candleBlock}\n` : "",
    NEWS_JSON: JSON.stringify(promptItems, null, 1),
  });

  let rawResponse: string;
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: SENTIMENT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0.35,
      max_tokens: 16384,
      response_format: { type: "json_object" },
    });
    rawResponse = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    throw new SentimentAnalysisError(`AI analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`, 502);
  }

  if (!rawResponse) {
    throw new SentimentAnalysisError("AI returned an empty response. Please retry.", 422);
  }

  let parsed: unknown;
  try {
    const fence = rawResponse.match(/```json\s*([\s\S]*?)```/);
    parsed = fence ? JSON.parse(fence[1].trim()) : JSON.parse(rawResponse);
  } catch {
    throw new SentimentAnalysisError("AI returned invalid JSON. Please retry.", 422, rawResponse.slice(0, 500));
  }

  return normalizeSentimentPayload(parsed);
}

// gpt-4o-mini occasionally mis-nests the response — e.g. dumping
// instrument_sentiment/analyzed_news/key_themes inside overall_sentiment
// instead of alongside it — even though json_object mode guarantees valid
// JSON, not schema-correct JSON. Hoist them back to the top level so the
// frontend always sees the documented flat shape.
function normalizeSentimentPayload(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const overall = (typeof obj.overall_sentiment === "object" && obj.overall_sentiment !== null)
    ? (obj.overall_sentiment as Record<string, unknown>)
    : {};

  return {
    overall_sentiment: {
      risk_tone: overall.risk_tone ?? "Neutral",
      summary: overall.summary ?? "",
    },
    instrument_sentiment: obj.instrument_sentiment ?? overall.instrument_sentiment ?? [],
    analyzed_news: obj.analyzed_news ?? overall.analyzed_news ?? [],
    key_themes: obj.key_themes ?? overall.key_themes ?? [],
  };
}
