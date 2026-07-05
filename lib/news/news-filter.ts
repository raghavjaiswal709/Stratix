import OpenAI from "openai";
import { SENTIMENT_MODEL, INSTRUMENTS, type NewsInputItem, type GatheredNewsWindow } from "./sentiment-analysis";

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

const TIER_TAXONOMY = `Keep a news item if it plausibly falls under ANY bullet below — these categories are deliberately broad, so err on the side of KEEPING. Only discard an item if it has NO plausible connection to any tier at all (e.g. sports scores, celebrity/entertainment gossip, lifestyle content, product reviews, spam/airdrop/promo messages, or a random corporate press release with no macro or market angle).

TIER 1 (High-Impact / Market Movers):
- Central bank interest rate decisions (hikes, cuts, holds)
- Central bank policy speeches and press conferences (e.g. Fed Chair forward guidance)
- Employment and labor market data (e.g. Non-Farm Payrolls, unemployment rate)
- Consumer inflation reports (CPI, Core CPI, PCE Price Index)
- GDP growth rate reports (advance/preliminary releases)
- Outbreak or escalation of military conflicts and wars
- Systemic banking sector stress, liquidity crises, institution failures
- Securities lawsuits and enforcement actions against major financial/crypto institutions
- Approvals or rejections of major financial products (e.g. spot crypto ETFs)
- Major cybersecurity breaches, exchange hacks, or stablecoin de-pegs

TIER 2 (Medium-Impact / Volatility Catalysts):
- Central bank meeting minutes (e.g. FOMC minutes)
- Producer inflation reports (PPI)
- PMI data for manufacturing and services
- Retail sales and consumer spending data
- OPEC+ oil production quota decisions
- Unexpected disruptions to global energy/oil/gas supply chains
- International sanctions, trade tariffs, or retaliatory trade restrictions
- National election outcomes and major political leadership shifts
- Major corporate earnings reports and forward guidance (megacap tech stocks)
- Algorithmic supply schedule events (e.g. Bitcoin halvings, major protocol upgrades)
- Quantitative Easing/Tightening (QE/QT) schedule updates
- Sovereign debt rating downgrades or debt ceiling crises

TIER 3 (Low-Impact / Trend Confirmation):
- Weekly initial and continuing jobless claims
- Consumer confidence/sentiment surveys (e.g. Michigan Sentiment)
- Factory orders, durable goods orders, industrial production data
- National trade balance data (import/export surplus or deficit)
- Housing market data (building permits, housing starts, existing home sales)
- Minor regional economic surveys and non-voting central bank speeches
- Central bank or government gold reserve purchases/sales
- Large-scale institutional asset purchases or corporate treasury reallocations
- Scheduled government debt auctions (e.g. Treasury bond yields)`;

function buildSystemPrompt(): string {
  return `You are a trading-news relevance classifier for a desk that tracks these instruments: ${INSTRUMENTS.join(", ")}.

You will receive a numbered JSON array of news headlines (each with an index "i", "headline", "source"). For EACH item, decide whether to keep it using the tier taxonomy below.

${TIER_TAXONOMY}

For every item you decide to KEEP, output an object with:
- "i": the exact index from the input
- "tier": 1, 2, or 3 (whichever tier bullet it matches — pick the closest one)
- "tags": 1-2 short strings naming the specific matched category (e.g. ["Central Bank Rate Decision"], ["Employment Data"], ["Geopolitical Conflict"], ["Crypto ETF"], ["Exchange Hack"])
- "impact_score": integer 0-100 — OVERALL article importance, calibrated by tier (tier 1 → roughly 70-100, tier 2 → roughly 40-75, tier 3 → roughly 15-45), with finer placement based on how surprising/severe the specific headline is
- "affected_instruments": array of {"symbol": one of [${INSTRUMENTS.join(", ")}], "sentiment": "Bullish"|"Bearish"|"Neutral", "impact_score": integer 0-100} — only the instruments this SPECIFIC item actually affects (usually 1-4, not all 11), each tagged INDEPENDENTLY and accurately based on the headline's actual content (never a lazy default "Neutral" unless genuinely directionless). The per-instrument "impact_score" is NOT the same number for every instrument in the list — a Fed rate decision might be a 90 for EURUSD but only a 40 for AUDUSD; score each instrument's own sensitivity to this specific news on a 0-100 scale (0 = negligible/indirect, 100 = maximally market-moving for that instrument), using this rough 5-band guide: 0-20 Normal, 21-40 Mild, 41-60 Moderate, 61-80 High, 81-100 Extreme.

Do NOT include an entry for items you decide to discard — simply omit their index.
Do NOT invent headlines or change indices.
Return STRICTLY a JSON object: { "kept": [ {...}, {...} ] }. No markdown fences, no prose.`;
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

async function filterChunk(chunk: NewsInputItem[], apiKey: string): Promise<FilteredNewsItem[]> {
  const payload = chunk.map((item, i) => ({ i, headline: item.headline, source: item.source }));

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: SENTIMENT_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: `Classify these ${chunk.length} news items:\n${JSON.stringify(payload)}` },
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
  const chunks = chunkArray(window.deduped, CHUNK_SIZE);
  const results = await Promise.allSettled(chunks.map((chunk) => filterChunk(chunk, apiKey)));
  const analyzed_news = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return { analyzed_news };
}
