import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsFilterReportModel } from "@/lib/models/NewsFilterReport";
import type { FilteredNewsItem } from "@/lib/news/news-filter";

export const runtime = "nodejs";
export const maxDuration = 180;

// How many of the filter report's top items we show the curator model.
// Sorted by impact_score first, so this is "the best 90", not "the first 90".
// Bumped from 45 → 90 so there's enough raw supply for the model to actually
// find 20+ genuinely consequential stories spanning all 5 driver categories,
// not just re-slice the same narrow top-45 window.
const MAX_CANDIDATES = 90;
const CURATOR_MODEL = "gpt-5.5-2026-04-23";
const MIN_POSTERS = 20;
const MAX_POSTERS = 30;

type PosterCategory = "Macro" | "Geopolitical" | "Corporate" | "Sentiment" | "Systemic";
const VALID_CATEGORIES = new Set<PosterCategory>(["Macro", "Geopolitical", "Corporate", "Sentiment", "Systemic"]);

interface InstrumentImpact {
  symbol: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
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
}

// The whole feature lives or dies on this prompt: it must (1) curate like an
// editor, not summarize like an intern, and (2) produce image prompts specific
// enough that a text-to-image model returns a poster-ready editorial visual
// for THIS story, not generic "stock market" wallpaper.
function buildSystemPrompt(todayLabel: string, windowLabel: string): string {
  return `You are the Head of Content at "Stratix", a professional trading-education brand. Your Instagram/X news posters reach serious forex, gold, index and crypto traders who decide in under a second whether a post is worth stopping for.

You will receive a machine-pre-filtered market news feed (each item already tagged with tier 1-3, an impact_score 0-100, topic tags, and per-instrument sentiment). The feed covers: ${windowLabel}. Today is ${todayLabel}.

Your job has three parts. The quality bar for every part is "front page of a top-tier financial desk".

━━━ PART 1 — CURATE ━━━
Select AT LEAST ${MIN_POSTERS} stories, ideally ${MIN_POSTERS}-${MAX_POSTERS}, spanning the last 24 hours, that a serious trader would be PUNISHED for missing. This feed is already pre-filtered for relevance, so a healthy window should comfortably support ${MIN_POSTERS}+ — do not artificially undershoot to be "safe". Only return fewer than ${MIN_POSTERS} if the candidate pool genuinely contains fewer than ${MIN_POSTERS} relevant items after merging duplicates.

Every story MUST be classified into exactly one of these 5 market-driver categories (this becomes the "category" field per poster) — and your selection must actively cover ALL FIVE when the candidate pool contains genuine examples of each, not just cluster around 1-2 categories:

1. MACRO — interest rate decisions, inflation (CPI/PPI), GDP, employment data (NFP, unemployment), currency/FX moves, commodity prices (oil, gold, copper).
2. GEOPOLITICAL — wars/armed conflicts, trade wars/tariffs, elections/political instability, sanctions, international agreements (climate, trade).
3. CORPORATE — earnings reports, M&A, leadership changes, product launches/innovation (AI chips, drug trials), scandals/lawsuits/regulatory fines.
4. SENTIMENT — fear/greed swings, analyst upgrades/downgrades from major banks, retail-driven moves (social-media-coordinated squeezes), consumer confidence surveys.
5. SYSTEMIC — algorithmic/HFT-driven volatility or flash-crash-style moves, options/derivatives expiration events, liquidity crunches, natural disasters or pandemics disrupting markets.

Selection rules, in priority order:
1. Real market consequence first: rate decisions, inflation/jobs surprises, central-bank guidance shifts, geopolitical escalations with market transmission, major crypto/regulatory rulings, earnings surprises, systemic liquidity events — over noise, previews, and opinion pieces.
2. MERGE duplicates: multiple headlines about the same underlying story become ONE poster; fold the extra numbers/details from the variants into that single poster's copy. Never output two posters about the same event.
3. Category coverage: actively hunt through the candidate pool for genuine examples of each of the 5 categories above before finalizing — a batch that is 90% Macro with zero Geopolitical/Corporate/Sentiment/Systemic when the pool actually contains such stories is a FAILED curation. Prioritize this diversity over piling up a 6th near-duplicate Macro story.
4. Theme diversity within a category: no more than 4 posters on the exact same narrow theme (e.g. four separate Fed-speech stories max), so the batch reads like a balanced front page, not one obsession.
5. Prefer stories carrying concrete numbers (bps, %, price levels, dates) and near-term catalysts a trader can position around.
6. NEVER invent or pad with filler to hit the count — every poster must trace back to a real item in the candidate feed.
Order the final array by trader importance, most important first.

━━━ PART 2 — POSTER COPY (per selected story) ━━━
- "title": ≤ 60 characters. Punchy headline case. Lead with the actor or the number ("Fed Holds at 5.50%, Signals One Cut"). No clickbait, no emoji, no ALL-CAPS words.
- "highlightPhrase": the single most attention-grabbing chunk of "title" — the actor, the number, or the shock word (e.g. for title "Fed Holds at 5.50%, Signals One Cut" → highlightPhrase "Fed Holds at 5.50%"). MUST be an exact, case-sensitive, contiguous substring of "title" (copy-paste it out of the title, don't paraphrase). Keep it short: 1-4 words, never the whole title.
- "description": 2-3 sentences, ≤ 320 characters, wire-service tone, written as the trader-relevant EXPLANATION that renders directly on the poster below the headline — this is not filler, it is the single paragraph that tells a trader everything they need in 5 seconds. Concrete facts and numbers only: what happened, the key figure vs expectation/prior, and the immediate market reaction if known. No hype words ("massive", "shocking").
- "descriptionHighlights": array of 2-5 SHORT exact substrings copied verbatim, character-for-character, out of "description" — the numbers, percentages, price levels, and key entity/instrument names a trader's eye should snag on first while skimming (e.g. ["18,200 jobs", "6.5%", "10,000 expected", "Bank of Canada"]). Never a full sentence, never the whole description. Each string MUST appear exactly as written inside "description".
- "keyTakeaway": exactly ONE sentence — the "so what" for a trader: direction, asset, and the catalyst or level to watch. Written as desk guidance, e.g. "Dollar strength pressures Gold below 2,350 while real yields hold above 2%."
- "affectedAssets": comma-separated instrument symbols, most affected first, e.g. "XAUUSD, DXY, US500". 1-4 symbols.
- "category": exactly one of "Macro" | "Geopolitical" | "Corporate" | "Sentiment" | "Systemic" — from the taxonomy in PART 1. Pick the single best fit even if a story could arguably span two.
- "instrumentImpacts": array of {"symbol": one of the affectedAssets symbols, "sentiment": "Bullish"|"Bearish"|"Neutral"} — EVERY symbol in affectedAssets, each independently tagged for how THIS specific story moves it (never a lazy copy of one sentiment across all — a USD-positive story is typically XAUUSD-negative, not both Bullish). This renders as a colored chip row on the poster, so accuracy here is directly user-facing.
- "impact": "High" | "Medium" | "Low" — from the story's real market consequence.
- "sentiment": "Bullish" | "Bearish" | "Neutral" — for the FIRST asset in affectedAssets specifically (must match its entry in instrumentImpacts). This also drives the poster's overall color treatment — "Bearish" renders in red as a risk warning, so only mark Bearish when the news is genuinely adverse for that instrument's long side.
- "source": the original source name.
- "date": human-readable publish date like "Jul 10, 2026" (derive from the item's pubDate; fall back to today).

━━━ PART 3 — "imagePrompt" (THE MOST IMPORTANT FIELD) ━━━
Write a self-contained prompt for an AI image generator (Grok Imagine) that produces a scroll-stopping, editorial-grade poster background for THIS story. The image must read as MARKET/TRADER IMPACT, not just a news photo — a trader glancing at the poster for one second should feel "this is moving my trades", not "this is a magazine photo about a building". Build every prompt with this exact formula, as ONE flowing paragraph of 60-90 words:
1. SUBJECT — one concrete, instantly recognizable visual anchor for the story. Be literal and specific: the Federal Reserve's Eccles Building eagle facade for a Fed story; stacked gold kilobars on a dealing desk for Gold; a supertanker at dawn for oil; the Bank of Japan headquarters in rain for BoJ; a physical Bitcoin coin cracking under pressure for a crypto selloff. NEVER a generic "stock chart" unless the story is literally about an index move — and then make it a towering LED market wall in a dark trading floor.
2. TRADER/MARKET IMPACT ELEMENT (MANDATORY, NON-NEGOTIABLE) — the frame must ALSO contain a second, visibly distinct element that shows real trading/market consequence, tied to the story's actual sentiment and instruments. Choose whichever fits the subject best, always described specifically (which instrument, which direction, never generic): a bank of trading-desk monitors in the background/foreground showing candlestick charts spiking or crashing in the sentiment's color (green surge for bullish, red plunge for bearish); a blurred trader silhouette gripping a desk or leaning back from the screen, body language reading tense/alarmed for bearish or sharply focused/relieved for bullish; a glowing FX/futures ticker tape scrolling the affected symbols; or a world map with financial-hub cities (New York, London, Tokyo, Dubai) pulsing with light to show the shock propagating globally. The image is INCOMPLETE and must be rewritten if this element is missing — a bare subject alone (e.g. just the Fed building with nothing else) fails this requirement.
3. SETTING & MOOD — where the subject and impact element sit together and the emotional temperature (tense, triumphant, ominous, decisive).
4. LIGHTING — cinematic and specific: low-key dramatic rim light, golden-hour side light, cold volumetric haze, single hard spotlight, or the cold blue-white glow of monitor screens lighting faces/objects from below.
5. COLOR GRADE tied to the story's sentiment: bullish → warm gold/emerald tones on deep charcoal, with any chart/screen glow rendered emerald-green; bearish → cold steel and crimson accents on near-black, with any chart/screen glow rendered blood-red; neutral/policy → muted graphite with a single amber accent.
6. COMPOSITION — subject and impact element anchored in the lower two-thirds, generous clean negative space across the top for a headline overlay, shallow depth of field, 4:5 portrait framing.
7. STYLE — "photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k".
8. ALWAYS end with exactly: "No text, no words, no letters, no numbers, no logos, no watermarks."
Every imagePrompt must be UNIQUE to its story — if two prompts could be swapped between posters without anyone noticing, they are too generic. Rewrite until each one could only belong to its own headline.

━━━ PART 4 — COVER SLIDE ("summary") ━━━
This is the FIRST slide of the carousel, before any individual story — a trader opens it to instantly know "what happened in the last 24 hours that can move my trades", without reading further. Write:
- "title": ≤ 55 characters, framed as urgency/scope, e.g. "5 Moves That Could Hit Your Trades Today" or "Fed, Jobs & Oil — What Moved Markets Today". Not a generic label like "Market Update".
- "highlightPhrase": the punchiest 1-3 words of that title, exact substring.
- "overview": 2-3 sentences synthesizing the THROUGHLINE across the selected stories — the dominant macro narrative of the window (e.g. "risk-off tone dominates as..."), not a list restating each headline. This renders on the poster as the trader-relevant explanation, so it must be information-dense, not vague.
- "overviewHighlights": array of 2-5 SHORT exact substrings copied verbatim out of "overview" — same rule as descriptionHighlights below: the concrete numbers/entities a trader should catch first.
- "marketBias": one sentence — the net directional read across majors/gold/crypto right now, e.g. "Dollar firm, Gold pressured, risk assets cautious into the weekend."
- "topAssets": array of up to 4 {"symbol": one of the affectedAssets symbols used across your selected posters, "sentiment": "Bullish"|"Bearish"|"Neutral"} — the instruments most in play right now, ranked by relevance, independently tagged (not all the same sentiment unless genuinely true).
- "imagePrompt": follow the EXACT same 8-part formula as Part 3, but the SUBJECT and the mandatory TRADER/MARKET IMPACT ELEMENT merge into one wide establishing shot that reads as "global markets, this moment" — a trading floor bank of monitors at dusk with candlestick charts glowing across the room, or a world map of financial hub cities pulsing with light and connecting light-trails, or a dealing desk with multiple screens and a trader silhouette scanning them — tense/alert mood, color grade tied to the overall marketBias, NOT tied to any single story.

━━━ OUTPUT ━━━
Return STRICTLY a JSON object of this exact shape — no markdown fences, no commentary, no extra keys:
{
  "summary": { "title": "...", "highlightPhrase": "...", "overview": "...", "overviewHighlights": ["..."], "marketBias": "...", "topAssets": [{"symbol":"...","sentiment":"..."}], "imagePrompt": "..." },
  "posters": [ { "title": "...", "highlightPhrase": "...", "description": "...", "descriptionHighlights": ["..."], "keyTakeaway": "...", "affectedAssets": "...", "instrumentImpacts": [{"symbol":"...","sentiment":"..."}], "impact": "...", "sentiment": "...", "source": "...", "date": "...", "imagePrompt": "...", "category": "..." } ]
}`;
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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { reportId?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine — use latest report */ }

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

  const openai = new OpenAI({ apiKey });
  let raw = "";
  try {
    const response = await openai.chat.completions.create({
      model: CURATOR_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(todayLabel, windowLabel) },
        {
          role: "user",
          content: `Here are the ${candidates.length} strongest pre-filtered news items. Curate, write the poster copy, and craft the image prompts:\n${JSON.stringify(candidates)}`,
        },
      ],
      // No `temperature` override — this model only supports its default (1).
      // Bumped from 8192 → 32000: a 20-30 poster batch (vs. the old 5-10) is
      // roughly 3-4x the JSON output, plus this reasoning-tier model spends
      // tokens on internal reasoning before it ever writes the response.
      max_completion_tokens: 32000,
      response_format: { type: "json_object" },
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI curation call failed" },
      { status: 502 }
    );
  }

  let parsed: { posters?: unknown; summary?: unknown };
  try {
    const fence = raw.match(/```json\s*([\s\S]*?)```/);
    parsed = JSON.parse(fence ? fence[1].trim() : raw);
  } catch {
    return NextResponse.json({ error: "AI returned unparseable JSON — try again." }, { status: 502 });
  }

  const rawPosters = Array.isArray(parsed.posters) ? parsed.posters : [];
  const VALID_IMPACT = new Set(["High", "Medium", "Low"]);
  const VALID_SENTIMENT = new Set(["Bullish", "Bearish", "Neutral"]);

  const posters: PosterCopy[] = rawPosters
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const title = clampStr(p.title, 90);
      const description = clampStr(p.description, 400);
      const sentiment = VALID_SENTIMENT.has(p.sentiment as string) ? (p.sentiment as PosterCopy["sentiment"]) : "Neutral";
      const affectedAssets = clampStr(p.affectedAssets, 80);
      return {
        title,
        highlightPhrase: resolveHighlight(title, clampStr(p.highlightPhrase, 60)),
        description,
        descriptionHighlights: resolveDescriptionHighlights(description, p.descriptionHighlights),
        keyTakeaway: clampStr(p.keyTakeaway, 240),
        affectedAssets,
        instrumentImpacts: resolveInstrumentImpacts(p.instrumentImpacts, VALID_SENTIMENT, affectedAssets, sentiment),
        impact: VALID_IMPACT.has(p.impact as string) ? (p.impact as PosterCopy["impact"]) : "Medium",
        sentiment,
        category: VALID_CATEGORIES.has(p.category as PosterCategory) ? (p.category as PosterCategory) : "Macro",
        source: clampStr(p.source, 60, "Wire"),
        date: clampStr(p.date, 30, todayLabel),
        imagePrompt: clampStr(p.imagePrompt, 1200),
        // Left empty on purpose: the user generates the image externally from
        // imagePrompt, then attaches it via the file picker on the poster.
        imageUrl: "",
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
  const coverTitle = clampStr(rawSummary.title, 80) || `${posters.length} Stories That Could Move Your Trades Today`;
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
      "A dark professional trading floor at dusk, dozens of glowing monitor screens displaying candlestick charts and world market data, wide establishing shot, tense and alert mood, cold blue-teal volumetric lighting with a single warm amber accent, shallow depth of field, subject filling the lower two-thirds with clean negative space above for a headline overlay, photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k. No text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isCover: true,
    topAssets,
    bulletHeadlines: posters.slice(0, 6).map((p) => p.title),
  };

  return NextResponse.json({
    posters: [cover, ...posters],
    reportId: String((report as { _id: unknown })._id),
    timeRangeLabel: windowLabel,
    reportGeneratedAt: (report as { generatedAt?: Date }).generatedAt ?? null,
    candidateCount: candidates.length,
  });
}
