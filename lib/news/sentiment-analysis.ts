import { NextRequest } from "next/server";
import OpenAI from "openai";
import { fetchAllNewsFeeds } from "@/lib/news/feeds";
import { fetchTelegramContentSince } from "@/lib/news/telegram";
import { fetchCentralBankFeeds } from "@/lib/news/central-banks";
import { fetchEconomicCalendar, calendarEventsToArticles } from "@/lib/news/calendar";
import { isHardNoise } from "@/lib/news/scoring";

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

const SYSTEM_PROMPT = `Tu ek expert trading sentiment analyst hai. Tujhe ek fixed time window ke andar publish hui SAARI news milegi — har RSS headline, har breaking-alert message, har official central bank press release, har relevant economic calendar event, aur REAL hourly OHLC price data har tracked instrument ke liye. Kuch bhi pre-filtered nahi hai — relevance aur sentiment tu khud decide karega.

⚠️ ABSOLUTE RULE — NO EXTERNAL TOOLS: Tu STRICTLY sirf neeche diya gaya data use karega. Koi web search, koi browsing, koi external lookup NAHI karna hai — sirf jo JSON news list aur candle data diya gaya hai usi par based reasoning karo. Agar kisi cheez ka pata nahi hai to woh mat likho — invent mat karo.

TERA KAAM — do steps mein:
STEP 1: Diye gaye complete news list se woh sabhi items identify karo jo genuinely gold (XAUUSD/XAGUSD), Bitcoin/crypto (BTCUSDT/ETHUSD), ya kisi bhi forex pair (EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD) se relevant hain. Jo trading/markets se bilkul unrelated hai (jaise koi random corporate press release, sports, lifestyle content jo galti se aa gaya) — usse discard karo.
STEP 2: Har relevant item ke liye determine karo ki woh kaunse tracked instruments ko affect karta hai, aur har instrument ke liye specifically Bullish, Bearish, ya Neutral hai (ek hi news gold ke liye bullish aur EURUSD ke liye bearish ho sakti hai simultaneously — har instrument ko independently tag karo, ek sentiment sabke liye assume mat karo).

STRICT RULES — SENSITIVITY, ACCURACY AUR DEPTH TEENO ZAROORI HAIN:
- "instrument_sentiment" mein sabhi 11 instruments cover karna MANDATORY hai: XAUUSD, XAGUSD, BTCUSDT, ETHUSD, EURUSD, GBPUSD, USDJPY, USDCHF, USDCAD, AUDUSD, NZDUSD — koi bhi skip nahi hoga, agar kisi instrument ke liye thin coverage hai to summary mein clearly likho aur available context (candle data, correlated instruments, macro backdrop) se compensate karo — kabhi bhi ek-line lazy summary mat do.
- Har instrument ke "key_drivers" mein KAM SE KAM 3-5 alag-alag news items reference karo (agar utne available hain) — sirf ek headline pe depend mat karo, MULTIPLE news items ko cross-reference karke pattern/confirmation dhoondo. Ek hi news bias create nahi karti — agar 3 alag sources same direction confirm kar rahe hain to woh zyada reliable signal hai, isse explicitly mention karo. Thin-coverage instruments ke liye bhi indirect drivers (correlated pair moves, DXY, risk sentiment, candle structure) khoj ke likho.
- "key_drivers" ka har entry sirf headline copy nahi hoga — har entry format "[headline] → [detailed 2-3 sentence Hinglish explanation: kyun yeh instrument ko affect karta hai, mechanism/transmission kya hai, aur agar numbers/data points hain to unhe quote karo]" hona chahiye. Generic statements jaise "market sentiment mixed hai" REJECTED — specific numbers, events, mechanism, aur forward-looking implication batao.
- Candle data ka use karo — instrument_sentiment ke summary mein current price level, window ka % change, high/low zone, aur short-term structure (range-bound / breakout / reversal) explicitly quote karo, taki analysis sirf news-based nahi balki actual price-action-confirmed bhi lage.
- Har instrument summary mein ek chhota forward-looking angle bhi do — agla trigger/level/event kya hai jise traders track karein (bina kisi financial advice ke, sirf informational context).
- "analyzed_news" mein har genuinely relevant, distinguishable news item include karo (agar 150 se zyada relevant items hain to sabse significant 150 include karo aur baaki ka count summary mein mention karo).
- Koi bhi news mat invent karo jo provide nahi ki gayi — har headline tera output mein EXACT input se copy honi chahiye (translate mat karo, jaisa hai waisa rakho).
- Har sentiment tag exactly ek hoga: "Bullish", "Bearish", ya "Neutral".
- Saare "summary", "key_drivers" explanations, aur "key_themes" STRICTLY Hinglish mein likhna hai (English alphabet, natural Hindi-English mix) — jaise ek senior trading-desk analyst apni team ko deeply detailed brief de raha ho, sirf headlines repeat nahi kar raha. Sirf headline/source/pubDate/symbol/sentiment fields English/original mein rahenge.
- Return SIRF ek valid JSON object. Koi markdown fence nahi, koi prose pehle ya baad mein nahi.

MANDATORY JSON SCHEMA (field names EXACTLY yeh follow karo):
{
  "overall_sentiment": {
    "risk_tone": "Risk-On | Risk-Off | Neutral",
    "summary": "MINIMUM 200 words Hinglish mein — ek thorough desk-brief, not a headline list. Is poore window mein market ko drive karne wale dominant theme(s) describe karo — specific events/headlines aur numbers cite karte hue, unke beech ka causal link explain karte hue (e.g. weak data → rate-cut bets → dollar down → gold up). Candle data se overall risk sentiment confirm/contradict ho raha hai woh bhi detail mein batao, aur kaunsa asset class sabse zyada react kar raha hai woh bhi highlight karo."
  },
  "instrument_sentiment": [
    {
      "symbol": "XAUUSD",
      "sentiment": "Bullish | Bearish | Neutral",
      "confidence": <integer 0-100>,
      "summary": "MINIMUM 100 words Hinglish mein — kyun yeh sentiment hai, multiple news items cross-reference karke, current price level aur % change candle data se quote karke, mechanism/transmission explain karke, aur ek short forward-looking note ke saath.",
      "key_drivers": ["[exact headline 1] → [detailed 2-3 sentence Hinglish explanation]", "[exact headline 2] → [detailed 2-3 sentence Hinglish explanation]", "[exact headline 3] → [detailed explanation]", "[exact headline 4 agar available] → [detailed explanation]", "[exact headline 5 agar available] → [detailed explanation]"]
    }
    // ... ek object per instrument, SABHI 11 MANDATORY, same shape
  ],
  "analyzed_news": [
    {
      "headline": "exact headline text from the input list — mat translate karo",
      "source": "exact source from the input",
      "pubDate": "exact pubDate string from the input",
      "impact": "High | Medium | Low",
      "affected_instruments": [
        { "symbol": "XAUUSD", "sentiment": "Bullish" }
        // sirf woh instruments jo yeh specific item actually affect karta hai — usually 1-4, sabhi 11 nahi
      ]
    }
    // jitne bhi relevant items mile, sabse significant pehle
  ],
  "key_themes": [
    "Theme 1 — 1-2 detailed sentences Hinglish mein jo theme, uska mechanism, aur uska cross-asset implication naam kare",
    "Theme 2 — 1-2 detailed sentences Hinglish mein jo theme, uska mechanism, aur uska cross-asset implication naam kare",
    "Theme 3 — 1-2 detailed sentences Hinglish mein jo theme, uska mechanism, aur uska cross-asset implication naam kare",
    "Theme 4 agar available — same depth",
    "Theme 5 agar available — same depth"
  ]
}

FINAL MANDATE: Sirf upar wala JSON object return karo, fully populated with maximum depth and explanation (not terse, not headline-only), no placeholders, no procrastination, koi external tool use nahi.`;

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

  const userMsg = `Time window: ${label} (strictly all news published in this window, from every configured source).
Total news items provided: ${deduped.length}
Tracked instruments (all 11 mandatory in instrument_sentiment): ${INSTRUMENTS.join(", ")}

${candleBlock ? `${candleBlock}\n` : ""}
COMPLETE NEWS LIST (JSON array — every item below was actually published in this window):
${JSON.stringify(promptItems, null, 1)}

Analyze this data per the schema and rules in the system prompt. Remember: STRICTLY Hinglish for all descriptive text, no external tools, cross-reference multiple news items per instrument, and quote real candle levels where relevant.`;

  let rawResponse: string;
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: SENTIMENT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
