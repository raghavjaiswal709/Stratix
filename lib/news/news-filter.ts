import OpenAI from "openai";
import { SENTIMENT_MODEL, INSTRUMENTS, type NewsInputItem, type GatheredNewsWindow } from "./sentiment-analysis";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

// ─── Dedicated "extreme filter" for the Filter News feature ──────────────────
//
// This is intentionally its OWN model call, separate from runSentimentAnalysis
// (the deep Hinglish desk-report used by /api/news/sentiment-report). Reusing
// that call here previously caused two failure modes:
//   1. Its prompt is built for writing a 100-200 word essay per instrument,
//      not for a strict keep/discard decision — tightening its filter language
//      to be "extreme" made the model regress into discarding almost
//      everything (300-400 articles down to ~3 kept).
//   2. Its analyzed_news array shares one 16384-token output budget with the
//      11 instrument essays + overall summary — there's no room left to
//      losslessly return hundreds of kept items even if the filtering were
//      correct.
// So this file runs its own lean, tier-tagging-only prompt, in parallel
// batches, on the same fast/cheap model (SENTIMENT_MODEL = gpt-4o-mini) —
// each batch's output is tiny (index + tier + tags + score + instruments,
// no headline/source echoed back) so hundreds of articles fit comfortably
// and batches run concurrently for speed.

const CHUNK_SIZE = 60;
const MAX_OUTPUT_TOKENS = 4096;

export interface InstrumentSentiment {
  symbol: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  /** 0-100 — how strongly THIS specific news moves THIS specific instrument (varies per instrument, not shared with the article-level impact_score). */
  impact_score: number;
}

export interface FilteredNewsItem {
  headline: string;
  source: string;
  pubDate: string;
  link: string;
  tier: 1 | 2 | 3;
  tags: string[];
  impact: "High" | "Medium" | "Low";
  impact_score: number;
  affected_instruments: InstrumentSentiment[];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

interface RawKeptEntry {
  i: number;
  tier: 1 | 2 | 3;
  tags?: string[];
  impact_score?: number;
  affected_instruments?: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral"; impact_score?: number }[];
}

const TIER_TO_IMPACT: Record<1 | 2 | 3, "High" | "Medium" | "Low"> = { 1: "High", 2: "Medium", 3: "Low" };

async function filterChunk(
  chunk: NewsInputItem[],
  apiKey: string,
  systemPrompt: string,
  userTemplate: string,
): Promise<FilteredNewsItem[]> {
  const payload = chunk.map((item, i) => ({ i, headline: item.headline, source: item.source }));
  const userMsg = renderTemplate(userTemplate, {
    CHUNK_LENGTH: String(chunk.length),
    PAYLOAD_JSON: JSON.stringify(payload),
  });

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: SENTIMENT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMsg },
    ],
    temperature: 0.1,
    max_tokens: MAX_OUTPUT_TOKENS,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "";
  if (!raw) return [];

  let parsed: unknown;
  try {
    const fence = raw.match(/```json\s*([\s\S]*?)```/);
    parsed = JSON.parse(fence ? fence[1].trim() : raw);
  } catch {
    return []; // one bad batch shouldn't take down the whole filter — skip it
  }

  const keptRaw = Array.isArray((parsed as { kept?: unknown })?.kept)
    ? ((parsed as { kept: RawKeptEntry[] }).kept)
    : [];

  const VALID_SENTIMENTS = new Set(["Bullish", "Bearish", "Neutral"]);
  const VALID_SYMBOLS = new Set(INSTRUMENTS);

  const out: FilteredNewsItem[] = [];
  for (const entry of keptRaw) {
    const item = chunk[entry.i];
    if (!item) continue; // model hallucinated an out-of-range index — drop it, don't crash
    const tier = ([1, 2, 3] as const).includes(entry.tier) ? entry.tier : 3;
    // The model occasionally hallucinates an out-of-enum sentiment (e.g. "Volatile")
    // or a symbol outside the tracked 11 — drop those entries rather than let an
    // invalid value reach the frontend's Bullish/Bearish/Neutral-only rendering.
    const affected_instruments: InstrumentSentiment[] = (Array.isArray(entry.affected_instruments) ? entry.affected_instruments : [])
      .filter((ai) => ai && VALID_SYMBOLS.has(ai.symbol) && VALID_SENTIMENTS.has(ai.sentiment))
      .map((ai) => ({
        symbol: ai.symbol,
        sentiment: ai.sentiment,
        impact_score: Number.isFinite(ai.impact_score) ? Math.max(0, Math.min(100, ai.impact_score as number)) : tier === 1 ? 70 : tier === 2 ? 45 : 20,
      }));
    out.push({
      headline: item.headline,
      source: item.source,
      pubDate: item.pubDate,
      link: item.link,
      tier,
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 2) : [],
      impact: TIER_TO_IMPACT[tier],
      impact_score: Number.isFinite(entry.impact_score) ? Math.max(0, Math.min(100, entry.impact_score as number)) : tier === 1 ? 80 : tier === 2 ? 55 : 25,
      affected_instruments,
    });
  }
  return out;
}

export interface NewsFilterResult {
  analyzed_news: FilteredNewsItem[];
}

// Runs the tier/sentiment classifier across the whole window in parallel
// batches — a bad or slow batch is skipped rather than failing the entire
// filter, so a transient hiccup on one chunk doesn't wipe out the other
// hundreds of correctly-classified items.
export async function runNewsFilter(window: GatheredNewsWindow, apiKey: string): Promise<NewsFilterResult> {
  const [systemTemplate, userTemplate] = await Promise.all([
    getPromptTemplate("newsFilter.classifier.system"),
    getPromptTemplate("newsFilter.classifier.user"),
  ]);
  const candleSection = window.candleBlock
    ? `\n${window.candleBlock}\n\n⚠️ HOW TO USE THE PRICE DATA ABOVE: it is ADDITIVE CONTEXT ONLY — a secondary sanity-check, never the primary basis for a decision. Tier, relevance (keep/discard), tags, and sentiment must be driven by the NEWS CONTENT itself. Do NOT keep an item just because a symbol moved, and do NOT discard a genuinely relevant item just because price action looks quiet. Only use the candle data to slightly refine an impact_score when the news' real-world severity is already ambiguous from the headline alone (e.g. confirming that a move already happened), never to override the news-based tier/keep decision.\n`
    : "";
  const systemPrompt = renderTemplate(systemTemplate, {
    INSTRUMENTS: INSTRUMENTS.join(", "),
    CANDLE_SECTION: candleSection,
  });

  const chunks = chunkArray(window.deduped, CHUNK_SIZE);
  const results = await Promise.allSettled(
    chunks.map((chunk) => filterChunk(chunk, apiKey, systemPrompt, userTemplate))
  );
  const analyzed_news = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return { analyzed_news };
}
