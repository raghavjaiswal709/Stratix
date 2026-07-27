import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsFilterReportModel } from "@/lib/models/NewsFilterReport";
import type { FilteredNewsItem } from "@/lib/news/news-filter";
import { fetchLiveContext } from "@/lib/content-creator/live-prices";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";
import { getRecentlyCoveredBlock } from "@/lib/content-creator/recent-news";

export const runtime = "nodejs";
// Kept at a value every Vercel plan allows (Hobby caps at 60s), because the
// chunked curation below is designed to finish well inside it — see
// CHUNK_TIMEOUT_MS. The previous 180 was silently clamped on Hobby and the
// single monolithic call blew straight past it (FUNCTION_INVOCATION_TIMEOUT).
export const maxDuration = 60;

// How many of the filter report's top items we show the curator model.
// Sorted by impact_score first, so this is "the best 80", not "the first 80".
// Sized against MAX_POSTERS below: a 10-card batch needs nowhere near the
// 120-candidate pool the old 15-story floor did, and a leaner pool means
// less input for each slice to chew through.
const MAX_CANDIDATES = 80;
const CURATOR_MODEL = "gpt-5.5-2026-04-23";
// Content cards only — the cover and outro are synthesized/parsed outside
// this range, so a full batch is up to MAX_POSTERS+2 cards (plus one ELI5
// bento companion per story, inserted client-side). Ten is what comfortably
// fits Vercel Hobby's hard 60s function ceiling; the prompt's own 15-story
// floor is overridden per-slice in buildChunkInstruction below.
const MAX_POSTERS = 10;

// ── Chunked curation ────────────────────────────────────────────────────
// Asking one reasoning-tier call to write every card (each carrying the full
// ELI5 bento set, a 60-90 word imagePrompt, a caption and 18-22 hashtags)
// reliably ran ~100s locally and timed the serverless function out in
// production. Splitting the candidate pool into disjoint slices and curating
// them concurrently keeps every individual call small — same cards, a
// fraction of the wall time — and lets one slow or failed slice degrade the
// batch instead of killing it (see Promise.allSettled in POST).
const CHUNK_COUNT = 4;
// 4 slices x 3 = 12 cards for a 10-card target: a deliberate surplus, so
// losing a whole slice to a timeout still lands 9 and losing a card to the
// title-dedupe below still lands 10.
const POSTERS_PER_CHUNK = Math.ceil(MAX_POSTERS / CHUNK_COUNT);
// Per-call ceiling, deliberately well under maxDuration so one hung slice
// can never consume the whole request budget — it aborts and the rest still
// land. Prep (Mongo + live prices + templates) measures ~3s, leaving ~12s of
// headroom under Hobby's 60s ceiling.
const CHUNK_TIMEOUT_MS = 45_000;
// Each slice writes ~3 cards rather than the whole batch, so it needs a
// fraction of the old 60000-token allowance (which existed to cover this
// model's internal reasoning tokens before it writes a full-batch reply).
const CHUNK_MAX_TOKENS = 12000;

interface CuratorChunkResult {
  posters?: unknown;
  summary?: unknown;
  outro?: unknown;
}

// Deals candidates out round-robin rather than slicing contiguously: the pool
// arrives impact-sorted, so contiguous slices would hand the first chunk every
// strong story and the last chunk only the dregs. Slices stay disjoint, so two
// chunks can never independently write up the same story.
function partitionRoundRobin<T>(items: T[], groups: number): T[][] {
  const out: T[][] = Array.from({ length: groups }, () => []);
  items.forEach((item, i) => out[i % groups].push(item));
  return out.filter((g) => g.length > 0);
}

function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Appended in code rather than baked into the admin-editable user template:
// the system prompt sets a hard 15-story floor that each parallel slice would
// otherwise try to hit on its own, blowing the per-call budget right back up.
// Injecting it here means the override survives any admin edit of the prompt.
function buildChunkInstruction(target: number, batchTarget: number): string {
  return `\n\n━━━ SCOPE OVERRIDE FOR THIS REQUEST ━━━\nThis request is ONE SLICE of a larger batch being curated in parallel — the other slices cover different candidates, and their cards are merged with yours afterwards.\n\nDISREGARD the "15-20 stories" range and the 15-story hard floor in PART 1 entirely. They are superseded: the assembled batch targets ${batchTarget} cards in total, and your slice's share is EXACTLY ${target} cards. Return fewer only if this slice genuinely holds fewer than ${target} distinct, real-consequence stories after clustering — never pad to reach it.\n\nBecause only ${batchTarget} cards ship in total, be markedly more selective than usual: pick the highest-impact, most genuinely tradeable stories in your slice and drop marginal ones. Every other rule — clustering, the no-repeat rule, field shapes, number accuracy — still applies in full.`;
}

async function runCuratorChunk(
  openai: OpenAI,
  systemPrompt: string,
  userMessage: string,
  label: string
): Promise<CuratorChunkResult> {
  const startedAt = Date.now();
  try {
    const response = await openai.chat.completions.create(
      {
        model: CURATOR_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        // No `temperature` override — this model only supports its default (1).
        // `reasoning_effort` is the real latency lever on this reasoning-tier
        // model: the thinking pass, not the token count, is what made the old
        // single call run ~100s. "low" keeps the curation/clustering quality
        // that matters here while cutting that pass dramatically.
        reasoning_effort: "low",
        max_completion_tokens: CHUNK_MAX_TOKENS,
        response_format: { type: "json_object" },
      },
      {
        timeout: CHUNK_TIMEOUT_MS,
        // Without this the SDK's default of 2 retries silently multiplies the
        // timeout above (40s → ~120s) and blows the function budget anyway.
        // A slice that times out is meant to be dropped, not retried.
        maxRetries: 0,
      }
    );
    const raw = response.choices[0]?.message?.content ?? "";
    const fence = raw.match(/```json\s*([\s\S]*?)```/);
    const parsed = JSON.parse(fence ? fence[1].trim() : raw) as CuratorChunkResult;
    console.log(`[news-batch] ${label} ok in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return parsed;
  } catch (err) {
    console.warn(
      `[news-batch] ${label} failed after ${((Date.now() - startedAt) / 1000).toFixed(1)}s:`,
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

type PosterCategory = "Macro" | "Geopolitical" | "Corporate" | "Sentiment" | "Systemic";
const VALID_CATEGORIES = new Set<PosterCategory>(["Macro", "Geopolitical", "Corporate", "Sentiment", "Systemic"]);

interface InstrumentImpact {
  symbol: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
}

interface SimpleImpact {
  market: string;
  effect: string;
  direction: "up" | "down" | "neutral";
}

interface PosterCopy {
  title: string;
  description: string;
  keyTakeaway: string;
  affectedAssets: string;
  impact: "High" | "Medium" | "Low";
  sentiment: "Bullish" | "Bearish" | "Neutral";
  source: string;
  date: string;
  imagePrompt: string;
  imageUrl: string;
  /** Exact substring of `title` to highlight on the poster (the punchiest hook). */
  highlightPhrase: string;
  /** Exact substrings of `description` to color-highlight — the numbers/entities a trader's eye should catch first. */
  descriptionHighlights: string[];
  /** Per-instrument direction, independently tagged — rendered as chips on the poster. */
  instrumentImpacts: InstrumentImpact[];
  /** Which of the 5 market-driver categories this story belongs to — powers the selection UI. */
  category: PosterCategory;
  isCover?: false;
  /** ELI5 companion card — a kid-simple headline for the same story. */
  simpleHeadline: string;
  /** ELI5 companion card — exact substring of simpleHeadline to highlight. */
  simpleHeadlineHighlight: string;
  /** ELI5 companion card — 2-4 kid-simple sentences: what actually happened. */
  whatHappened: string;
  /** ELI5 companion card — 1-3 kid-simple sentences: why it matters, in plain terms. */
  whyItMatters: string;
  /** ELI5 companion card — which markets are affected and how, in plain language. */
  simpleImpacts: SimpleImpact[];
  /** Instagram-ready caption for THIS story posted on its own — distinct voice from the on-poster "description". */
  caption: string;
  /** 25+ hashtags: a fixed brand set (appended in code, not model-authored) plus deeply-researched, story-specific trending/relevant tags. */
  hashtags: string[];
}

interface CoverCopy {
  title: string;
  description: string;
  keyTakeaway: string;
  affectedAssets: string;
  impact: "High";
  sentiment: "Bullish" | "Bearish" | "Neutral";
  source: string;
  date: string;
  imagePrompt: string;
  imageUrl: string;
  highlightPhrase: string;
  descriptionHighlights: string[];
  instrumentImpacts: InstrumentImpact[];
  isCover: true;
  topAssets: InstrumentImpact[];
  bulletHeadlines: string[];
  /** Instagram-ready caption for the WHOLE carousel (this is slide 1). */
  caption: string;
  /** 25+ hashtags for the whole carousel — same brand-set + researched-tags composition as each story's. */
  hashtags: string[];
}

interface OutroCopy {
  title: string;
  description: string;
  cta: string;
  imagePrompt: string;
  imageUrl: string;
  isOutro: true;
}

// The whole feature lives or dies on this prompt: it must (1) curate like an
// editor, not summarize like an intern, and (2) produce image prompts specific
// enough that a text-to-image model returns a poster-ready editorial visual
// for THIS story, not generic "stock market" wallpaper.
async function buildSystemPrompt(todayLabel: string, windowLabel: string, liveContext: string, recentlyCoveredBlock: string): Promise<string> {
  const template = await getPromptTemplate("contentCreator.newsBatch.system");
  return renderTemplate(template, {
    TODAY_LABEL: todayLabel,
    WINDOW_LABEL: windowLabel,
    LIVE_CONTEXT: liveContext,
    RECENTLY_COVERED_BLOCK: recentlyCoveredBlock,
  });
}

function clampStr(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

// The model is instructed to copy-paste highlightPhrase out of title, but
// LLMs occasionally paraphrase anyway — if it isn't a real substring, the
// poster renderer has nothing to highlight, so fall back to leading words.
function resolveHighlight(title: string, candidate: string): string {
  if (candidate && title.includes(candidate)) return candidate;
  const words = title.split(" ");
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

// Same idea for the paragraph-level highlight terms, but there can be
// several — silently drop any the model paraphrased instead of copy-pasting,
// rather than rendering a highlight for text that doesn't actually appear.
function resolveDescriptionHighlights(text: string, candidates: unknown): string[] {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const term = c.trim();
    if (!term || term.length > 60 || !text.includes(term) || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= 5) break;
  }
  return out;
}

function resolveInstrumentImpacts(candidates: unknown, validSentiments: Set<string>, fallbackAssets: string, fallbackSentiment: string): InstrumentImpact[] {
  const fromModel = Array.isArray(candidates)
    ? (candidates as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          symbol: clampStr(a.symbol, 12).toUpperCase(),
          sentiment: validSentiments.has(a.sentiment as string) ? (a.sentiment as InstrumentImpact["sentiment"]) : "Neutral",
        }))
        .filter((a) => a.symbol)
        .slice(0, 4)
    : [];
  if (fromModel.length > 0) return fromModel;

  // Fallback: derive from the comma-separated affectedAssets string, all
  // tagged with the story's single overall sentiment.
  return fallbackAssets
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 4)
    .map((symbol) => ({ symbol, sentiment: (validSentiments.has(fallbackSentiment) ? fallbackSentiment : "Neutral") as InstrumentImpact["sentiment"] }));
}

const VALID_DIRECTION = new Set(["up", "down", "neutral"]);

// Same "model output, else derive from the real fields" pattern as
// resolveInstrumentImpacts above — the bento card must never contradict the
// story's actual sentiment, just re-explain it in plain words.
function resolveSimpleImpacts(candidates: unknown, fallbackAssets: string, fallbackSentiment: string): SimpleImpact[] {
  const fromModel = Array.isArray(candidates)
    ? (candidates as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          market: clampStr(a.market, 40),
          effect: clampStr(a.effect, 80),
          direction: VALID_DIRECTION.has(a.direction as string) ? (a.direction as SimpleImpact["direction"]) : "neutral",
        }))
        .filter((a) => a.market && a.effect)
        .slice(0, 4)
    : [];
  if (fromModel.length > 0) return fromModel;

  const direction: SimpleImpact["direction"] = fallbackSentiment === "Bullish" ? "up" : fallbackSentiment === "Bearish" ? "down" : "neutral";
  const effect = direction === "up" ? "may become more valuable" : direction === "down" ? "may lose some value" : "may not move much";
  return fallbackAssets
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((symbol) => ({ market: symbol, effect, direction }));
}

// Fixed, always-included brand hashtags — guarantees every poster's set
// stays brand-consistent even though the model's own 18-22 tags are
// researched fresh per story (see PART 2.6 of the system prompt above).
const COMMON_HASHTAGS = ["#Stratix", "#Trading", "#ForexTrading", "#TradingSignals", "#FinancialMarkets", "#MarketNews", "#TradingCommunity"];

// Pads a story up to the 25+ hashtag floor if the model's own count came in
// short — keyed by the same 5-category taxonomy PART 1 uses, so even the
// fallback path stays topically relevant rather than generic filler.
const CATEGORY_HASHTAG_POOL: Record<PosterCategory, string[]> = {
  Macro: ["#Inflation", "#InterestRates", "#FederalReserve", "#Economy", "#USD", "#Gold", "#XAUUSD", "#Forex", "#CentralBank", "#Recession"],
  Geopolitical: ["#Geopolitics", "#OilPrices", "#Sanctions", "#GlobalMarkets", "#Crude", "#SafeHaven", "#RiskOff", "#EnergyMarkets", "#WarRisk", "#GoldPrice"],
  Corporate: ["#Earnings", "#StockMarket", "#WallStreet", "#Stocks", "#Investing", "#CorporateNews", "#EquityMarkets", "#NYSE", "#Nasdaq", "#MarketMovers"],
  Sentiment: ["#RiskSentiment", "#MarketSentiment", "#TraderPsychology", "#BullMarket", "#BearMarket", "#RetailTraders", "#MarketMood", "#FearAndGreed", "#SmartMoney", "#PriceAction"],
  Systemic: ["#Volatility", "#Liquidity", "#Options", "#Derivatives", "#MarketRisk", "#FlashCrash", "#AlgoTrading", "#SystemicRisk", "#MarketStructure", "#TradingRisk"],
};
const GENERIC_HASHTAG_POOL = ["#Trading", "#Crypto", "#Forex", "#Investing", "#StockMarket", "#Bitcoin", "#Gold", "#FinancialNews", "#TradingLife", "#MoneyMoves"];

const HASHTAG_TARGET = 25;
const HASHTAG_MAX = 30;

// A model-provided tag must start with "#", contain no internal whitespace
// or stray punctuation, and be a sane length — anything else is dropped
// rather than rendered broken.
function isValidHashtag(v: unknown): v is string {
  return typeof v === "string" && /^#[A-Za-z0-9_]{2,40}$/.test(v.trim());
}

// Merges the model's researched, story-specific hashtags with the fixed
// brand set, dedupes case-insensitively, and pads with topically-relevant
// fallbacks if the model came in short of the 25+ floor — a guarantee the
// prompt's instructions alone can't make reliably across a whole batch.
function resolveHashtags(candidates: unknown, category?: PosterCategory): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (tag: string) => {
    const key = tag.toLowerCase();
    if (seen.has(key) || out.length >= HASHTAG_MAX) return;
    seen.add(key);
    out.push(tag);
  };

  for (const tag of COMMON_HASHTAGS) add(tag);

  if (Array.isArray(candidates)) {
    for (const c of candidates) {
      const raw = typeof c === "string" ? c.trim() : "";
      const normalized = raw && !raw.startsWith("#") ? `#${raw}` : raw;
      if (isValidHashtag(normalized)) add(normalized);
    }
  }

  const pool = (category && CATEGORY_HASHTAG_POOL[category]) || GENERIC_HASHTAG_POOL;
  for (const tag of [...pool, ...GENERIC_HASHTAG_POOL]) {
    if (out.length >= HASHTAG_TARGET) break;
    add(tag);
  }

  return out;
}

function resolveCaption(candidate: unknown, fallback: string): string {
  return clampStr(candidate, 500) || fallback;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  // Everything below can throw — a flaky Mongo connection, a live-price
  // fetch that somehow escapes its own guards, a template lookup failure —
  // and without this wrapper an uncaught throw here falls through to
  // Next.js's own error page (HTML/plain text, not JSON), which is what
  // breaks the client's res.json() with "Unexpected token" instead of
  // surfacing a readable error.
  try {

  let body: { reportId?: string; previewOnly?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is fine — use latest report */ }

  // Kick off the live-price snapshot and the recently-covered-stories lookup
  // alongside the DB report fetch — neither depends on the report, so there's
  // no reason to serialize them after that round trip.
  const liveContextPromise = fetchLiveContext();
  const recentlyCoveredPromise = getRecentlyCoveredBlock(session.user.id);

  await dbConnect();
  const report = body.reportId
    ? await NewsFilterReportModel.findById(body.reportId).lean()
    : await NewsFilterReportModel.findOne({}).sort({ generatedAt: -1 }).lean();

  if (!report) {
    return NextResponse.json(
      { error: "No filtered news report found. Generate one on the News Sentiment page (Filter tab) first." },
      { status: 404 }
    );
  }

  const analyzed: FilteredNewsItem[] = Array.isArray((report as { data?: { analyzed_news?: FilteredNewsItem[] } }).data?.analyzed_news)
    ? (report as { data: { analyzed_news: FilteredNewsItem[] } }).data.analyzed_news
    : [];
  if (analyzed.length === 0) {
    return NextResponse.json({ error: "The latest filter report contains no kept news items." }, { status: 400 });
  }

  // Feed the curator only the strongest candidates — impact-sorted, trimmed to
  // the fields it needs, so 300 kept headlines never blow the token budget.
  const candidates = [...analyzed]
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0))
    .slice(0, MAX_CANDIDATES)
    .map((n) => ({
      headline: n.headline,
      source: n.source,
      pubDate: n.pubDate,
      tier: n.tier,
      tags: n.tags,
      impact_score: n.impact_score,
      affected_instruments: n.affected_instruments,
    }));

  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const windowLabel = (report as { timeRangeLabel?: string }).timeRangeLabel ?? "recent market news";
  const [liveContext, recentlyCoveredBlock, userTemplate] = await Promise.all([
    liveContextPromise,
    recentlyCoveredPromise,
    getPromptTemplate("contentCreator.newsBatch.user"),
  ]);
  const systemPrompt = await buildSystemPrompt(todayLabel, windowLabel, liveContext, recentlyCoveredBlock);
  const userMessage = renderTemplate(userTemplate, {
    CANDIDATE_COUNT: String(candidates.length),
    CANDIDATES_JSON: JSON.stringify(candidates),
  });

  if (body?.previewOnly) {
    return NextResponse.json({ systemPrompt, userMessage });
  }

  const openai = new OpenAI({ apiKey });

  // Curate every slice concurrently. allSettled (not all) is the point: a
  // slice that times out or returns unparseable JSON is dropped, and the
  // remaining slices still assemble a shippable batch.
  const slices = partitionRoundRobin(candidates, CHUNK_COUNT);
  const batchStartedAt = Date.now();
  const settled = await Promise.allSettled(
    slices.map((slice, i) =>
      runCuratorChunk(
        openai,
        systemPrompt,
        renderTemplate(userTemplate, {
          CANDIDATE_COUNT: String(slice.length),
          CANDIDATES_JSON: JSON.stringify(slice),
        }) + buildChunkInstruction(POSTERS_PER_CHUNK, MAX_POSTERS),
        `slice ${i + 1}/${slices.length}`
      )
    )
  );
  console.log(
    `[news-batch] ${settled.filter((s) => s.status === "fulfilled").length}/${slices.length} slices in ${((Date.now() - batchStartedAt) / 1000).toFixed(1)}s`
  );

  const fulfilled = settled.filter(
    (s): s is PromiseFulfilledResult<CuratorChunkResult> => s.status === "fulfilled"
  );
  if (fulfilled.length === 0) {
    const firstError = settled.find((s): s is PromiseRejectedResult => s.status === "rejected")?.reason;
    return NextResponse.json(
      {
        error: firstError instanceof Error
          ? `AI curation failed: ${firstError.message}`
          : "AI curation call failed — try again.",
      },
      { status: 502 }
    );
  }

  // Merge every slice's cards, dropping any near-duplicate headline that got
  // through despite the disjoint slicing (two slices can still land on the
  // same theme from different source articles). Cover/outro copy comes from
  // the first slice that produced it — the local fallbacks further down cover
  // the case where no slice did.
  // Drained round-robin rather than concatenated: the slices deliberately
  // over-produce (12 cards for a 10-card batch), so concatenating would trim
  // the surplus off the tail and drop the last slice's cards wholesale.
  // Taking one card from each slice per round spreads the trim evenly, which
  // preserves the impact mix that partitionRoundRobin dealt out in the first
  // place. Each slice orders its own cards strongest-first, so round 0 is
  // every slice's best story, round 1 its second, and so on.
  const sliceQueues = fulfilled
    .map((f) => (Array.isArray(f.value?.posters) ? (f.value.posters as unknown[]) : []))
    .filter((queue) => queue.length > 0);
  const seenTitles = new Set<string>();
  const rawPosters: unknown[] = [];
  const deepestQueue = sliceQueues.reduce((max, q) => Math.max(max, q.length), 0);
  for (let round = 0; round < deepestQueue && rawPosters.length < MAX_POSTERS; round++) {
    for (const queue of sliceQueues) {
      if (round >= queue.length) continue;
      const poster = queue[round];
      const title = typeof (poster as Record<string, unknown>)?.title === "string"
        ? ((poster as Record<string, unknown>).title as string)
        : "";
      const key = normalizeTitleKey(title);
      if (!key || seenTitles.has(key)) continue;
      seenTitles.add(key);
      rawPosters.push(poster);
      if (rawPosters.length >= MAX_POSTERS) break;
    }
  }

  const parsed: CuratorChunkResult = {
    summary: fulfilled.find((f) => f.value?.summary)?.value.summary,
    outro: fulfilled.find((f) => f.value?.outro)?.value.outro,
  };

  const VALID_IMPACT = new Set(["High", "Medium", "Low"]);
  const VALID_SENTIMENT = new Set(["Bullish", "Bearish", "Neutral"]);

  const posters: PosterCopy[] = rawPosters
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const title = clampStr(p.title, 90);
      const description = clampStr(p.description, 400);
      const sentiment = VALID_SENTIMENT.has(p.sentiment as string) ? (p.sentiment as PosterCopy["sentiment"]) : "Neutral";
      const affectedAssets = clampStr(p.affectedAssets, 80);
      const keyTakeaway = clampStr(p.keyTakeaway, 240);
      const simpleHeadline = clampStr(p.simpleHeadline, 70) || title;
      const category: PosterCategory = VALID_CATEGORIES.has(p.category as PosterCategory) ? (p.category as PosterCategory) : "Macro";
      return {
        title,
        highlightPhrase: resolveHighlight(title, clampStr(p.highlightPhrase, 60)),
        description,
        descriptionHighlights: resolveDescriptionHighlights(description, p.descriptionHighlights),
        keyTakeaway,
        affectedAssets,
        instrumentImpacts: resolveInstrumentImpacts(p.instrumentImpacts, VALID_SENTIMENT, affectedAssets, sentiment),
        impact: VALID_IMPACT.has(p.impact as string) ? (p.impact as PosterCopy["impact"]) : "Medium",
        sentiment,
        category,
        source: clampStr(p.source, 60, "Wire"),
        date: clampStr(p.date, 30, todayLabel),
        imagePrompt: clampStr(p.imagePrompt, 1200),
        // Left empty on purpose: the user generates the image externally from
        // imagePrompt, then attaches it via the file picker on the poster.
        imageUrl: "",
        simpleHeadline,
        simpleHeadlineHighlight: resolveHighlight(simpleHeadline, clampStr(p.simpleHeadlineHighlight, 50)),
        whatHappened: clampStr(p.whatHappened, 400) || description,
        whyItMatters: clampStr(p.whyItMatters, 240) || keyTakeaway,
        simpleImpacts: resolveSimpleImpacts(p.simpleImpacts, affectedAssets, sentiment),
        caption: resolveCaption(p.caption, `${title} — here's what it means for your trades. ${keyTakeaway}`.slice(0, 400)),
        hashtags: resolveHashtags(p.hashtags, category),
      } as PosterCopy;
    })
    .filter((p) => p.title && p.description)
    .slice(0, MAX_POSTERS);

  if (posters.length === 0) {
    return NextResponse.json({ error: "AI returned no usable posters — try again." }, { status: 502 });
  }

  // Build the cover slide — falls back to a locally-synthesized roundup
  // (from the posters we already validated) if the model's summary block is
  // missing or malformed, so the batch never ships without a cover.
  const rawSummary = (parsed.summary && typeof parsed.summary === "object" ? parsed.summary : {}) as Record<string, unknown>;
  // Fixed masthead line, not left to the model — the prompt asks for this
  // exact title too, but pinning it here guarantees the cover never drifts.
  const coverTitle = "News That Can Impact Your Trades";
  const coverOverview = clampStr(rawSummary.overview, 420) || `Top stories from ${windowLabel} that matter for active traders — see the full breakdown in this carousel.`;
  const coverAssetsFromModel = Array.isArray(rawSummary.topAssets)
    ? (rawSummary.topAssets as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          symbol: clampStr(a.symbol, 12).toUpperCase(),
          sentiment: VALID_SENTIMENT.has(a.sentiment as string) ? (a.sentiment as InstrumentImpact["sentiment"]) : "Neutral",
        }))
        .filter((a) => a.symbol)
        .slice(0, 4)
    : [];
  const topAssets: InstrumentImpact[] = coverAssetsFromModel.length > 0
    ? coverAssetsFromModel
    : Array.from(
        new Map(
          posters
            .flatMap((p) => p.affectedAssets.split(",").map((s) => s.trim()).filter(Boolean).map((symbol) => [symbol, p.sentiment] as const))
        ).entries()
      ).slice(0, 4).map(([symbol, sentiment]) => ({ symbol, sentiment }));

  const cover: CoverCopy = {
    title: coverTitle,
    highlightPhrase: resolveHighlight(coverTitle, clampStr(rawSummary.highlightPhrase, 60)),
    description: coverOverview,
    descriptionHighlights: resolveDescriptionHighlights(coverOverview, rawSummary.overviewHighlights),
    keyTakeaway: clampStr(rawSummary.marketBias, 240) || "Mixed cross-asset signals — check each story's affected instruments before positioning.",
    affectedAssets: topAssets.map((a) => a.symbol).join(", "),
    instrumentImpacts: topAssets,
    impact: "High",
    sentiment: topAssets[0]?.sentiment ?? "Neutral",
    source: "Stratix Desk",
    date: todayLabel,
    imagePrompt: clampStr(rawSummary.imagePrompt, 1200) ||
      "A massive glowing 3D globe filling most of the frame, financial-hub cities connected by bold vivid light-trails arcing across continents, dramatic and saturated, hard rim light with a warm amber and emerald glow, subject filling 70% of the frame with clean negative space only at the very top for a headline overlay, hyper-detailed 3D render, bold studio lighting, vivid color, ultra-detailed, 8k. No real people, no faces, no legible text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isCover: true,
    topAssets,
    bulletHeadlines: (Array.isArray(rawSummary.bulletHeadlines)
      ? (rawSummary.bulletHeadlines as unknown[]).filter((h): h is string => typeof h === "string" && !!h.trim()).slice(0, 5)
      : []
    ).concat(posters.map((p) => p.title)).slice(0, 5),
    caption: resolveCaption(rawSummary.caption, `${coverTitle} — ${coverOverview}`.slice(0, 400)),
    hashtags: resolveHashtags(rawSummary.hashtags),
  };

  // Build the outro slide — same "model output, else local fallback" pattern
  // as the cover above, so a batch never ships without one. The fallback
  // pool rotates by time so back-to-back generations (model failure on both)
  // still don't repeat verbatim.
  const OUTRO_FALLBACKS = [
    { headline: "We're Always Watching The Markets", cta: "Follow for daily market briefings" },
    { headline: "Markets Don't Sleep. Neither Do We.", cta: "Turn on notifications so you never miss a move" },
    { headline: "Never Miss A Move That Matters", cta: "Save this post for your next session" },
  ];
  const rawOutro = (parsed.outro && typeof parsed.outro === "object" ? parsed.outro : {}) as Record<string, unknown>;
  const outroFallback = OUTRO_FALLBACKS[Math.floor(Date.now() / 60000) % OUTRO_FALLBACKS.length];
  const outro: OutroCopy = {
    title: clampStr(rawOutro.headline, 60) || outroFallback.headline,
    description: clampStr(rawOutro.subtext, 260) ||
      "We share real-time market news before every trading session. You might not find this page again — follow now to stay ahead.",
    cta: clampStr(rawOutro.cta, 60) || outroFallback.cta,
    imagePrompt: clampStr(rawOutro.imagePrompt, 1200) ||
      "A huge glowing chart-line ribbon sweeping upward across the frame like a comet trail, a single massive gold bar bathed in warm triumphant light in the foreground, vivid and saturated, warm amber and emerald glow on deep charcoal, subject filling most of the frame with clean negative space only at the top, hyper-detailed 3D render, bold studio lighting, vivid color, ultra-detailed, 8k. No real people, no faces, no legible text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isOutro: true,
  };

  return NextResponse.json({
    posters: [cover, ...posters, outro],
    reportId: String((report as { _id: unknown })._id),
    timeRangeLabel: windowLabel,
    reportGeneratedAt: (report as { generatedAt?: Date }).generatedAt ?? null,
    candidateCount: candidates.length,
  });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "News batch generation failed unexpectedly — try again." },
      { status: 500 }
    );
  }
}
