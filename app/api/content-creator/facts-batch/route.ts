import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { fetchLiveContext } from "@/lib/content-creator/live-prices";

export const runtime = "nodejs";
export const maxDuration = 120;

const CURATOR_MODEL = "gpt-5.5-2026-04-23";
const MIN_FACTS = 5;
const MAX_FACTS = 8;

interface FactCopy {
  title: string;
  highlightPhrase: string;
  description: string;
  sourceNote: string;
  relatedInstruments: string[];
  imagePrompt: string;
  imageUrl: string;
}

interface CoverCopy {
  title: string;
  highlightPhrase: string;
  description: string;
  descriptionHighlights: string[];
  bulletHeadlines: string[];
  imagePrompt: string;
  imageUrl: string;
  isCover: true;
}

interface OutroCopy {
  title: string;
  description: string;
  cta: string;
  imagePrompt: string;
  imageUrl: string;
  isOutro: true;
}

// Facts run on model knowledge, not a live news feed — no NewsFilterReport
// dependency. Ground truth for anything price-shaped still comes from the
// same live snapshot News uses, so a "gold is priced per troy ounce" fact
// never drifts into citing a stale/invented current price.
function buildSystemPrompt(todayLabel: string, liveContext: string, topicHint?: string): string {
  return `You are the Head of Content at "Stratix", a professional trading-education brand, writing the "Facts" carousel — short, punchy, verified facts about markets, trading mechanics, and instruments (Gold, Silver, Forex, Bitcoin, Ethereum, indices, macro policy). Today is ${todayLabel}.

=== LIVE VERIFIED PRICES (ground truth — do not contradict) ===
${liveContext}
=== END LIVE VERIFIED PRICES ===

━━━ CARD COUNT ━━━
Produce ${MIN_FACTS}-${MAX_FACTS} facts, each a DISTINCT topic — no two facts about the same underlying mechanic. Prefer evergreen, structural, historical, or mechanical facts (contract sizes, why an instrument trades the way it does, the origin of a convention, how a specific mechanism works) over anything that depends on today's exact price. NEVER pad to hit the count — 5 genuinely interesting distinct facts beats 8 with two that are barely different from each other.
${topicHint ? `\nOne of your facts MUST be built specifically around this assigned topic: "${topicHint}" — do not skip or water it down into something generic. Choose the remaining facts as usual, each covering a different distinct topic.\n` : ""}

━━━ NUMBER-ACCURACY RULE (non-negotiable) ━━━
Only cite a specific price/level for gold, silver, forex majors, BTC, or ETH if it matches the LIVE VERIFIED PRICES block above. For anything else (contract sizes, historical levels, dates, percentages that are structural/evergreen — e.g. "1 standard lot = 100,000 units") cite only well-established, verifiable figures. If you are not confident a figure is correct, omit it or phrase the fact without a specific number.

━━━ PER-FACT COPY ━━━

VOICE — write like a sharp human desk editor who loves this stuff, not a content engine. The goal is "wait, really?", not "please absorb this data point".
BANNED WORDS/PHRASES (if you catch yourself writing these, stop and rewrite the sentence): "in today's [x] landscape," "it's important to note/remember," "furthermore," "moreover," "additionally" as a sentence-opener, "boasts," "showcases," "underscores," "highlights," "plays a crucial/key role," "navigate the complexities of," "unprecedented," "leverage" as a verb, "robust," "seamless," "dynamic," "cutting-edge," "delve into," "dive into," "realm," "testament to," "when it comes to," "in conclusion," "interestingly," "did you know." These are the words every AI model reaches for by default — banning them forces an actual choice instead of an autocomplete.
RHYTHM: vary sentence length hard. A 4-word sentence next to an 18-word one reads like a person thinking. Three same-length sentences in a row is the biggest tell of a template — break the pattern.
VERBS DO THE WORK: never use a flat verb where a precise one exists. One sharp, accurate verb beats three adjectives stacked in front of a boring one.
NO HEDGE-STACKING: one hedge per sentence, maximum. State a verified fact flatly; only hedge a genuine uncertainty.
THE DUPLICATE TEST: before finalizing a fact, ask — could this exact sentence sit unchanged in any generic finance explainer? If yes, it's filler — rewrite it around the specific number, name, or mechanism that makes THIS fact worth posting.
- "title": ≤ 65 characters, framed as a hook, e.g. "Why Gold Is Measured In Troy Ounces, Not Regular Ounces". Not a dry label.
- "highlightPhrase": the punchiest 1-4 word exact substring of "title".
- "fact": 2-4 sentences, ≤ 340 characters, confident and concrete — the same wire-desk voice as Stratix's News cards, not a textbook tone. No hedge words, no "some say".
- "sourceNote": one short internal-use line naming where this can be verified (e.g. "LBMA/COMEX contract specifications", "CME Globex trading hours"). Not rendered on the poster — required before a fact ships.
- "relatedInstruments": array of 0-3 ticker symbols this fact is genuinely tied to (e.g. ["XAUUSD"]) — omit/empty if the fact isn't instrument-specific.
- "imagePrompt": ONE flowing paragraph, 50-80 words, following this formula: (1) a concrete, literal visual subject for the fact (physical gold bars for a gold-mechanics fact, a stock exchange floor for a market-structure fact); (2) setting and mood — clean, editorial, curious/explainer tone, not urgent or tense; (3) lighting — soft, even, or warm directional light; (4) color grade — warm amber and emerald accents on neutral charcoal or off-white, NEVER blue/indigo tones; (5) composition — subject in the lower two-thirds, clean negative space above for a headline overlay, 4:5 portrait framing; (6) style — "photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k"; (7) always end with exactly "No text, no words, no letters, no numbers, no logos, no watermarks."

━━━ COVER SLIDE ━━━
First slide, a teaser for the batch. Write:
- "title": ≤ 50 characters, "Today's Facts" framing, e.g. "5 Things Every Trader Should Know Today".
- "highlightPhrase": punchiest 1-3 words, exact substring.
- "overview": 1-2 sentences setting up what this batch covers, curiosity-driven, not a dry list.
- "overviewHighlights": 1-3 short exact substrings of "overview" to highlight.
- "bulletHeadlines": the ${MIN_FACTS}-${MAX_FACTS} fact titles, shortened if needed, one per line.
- "imagePrompt": same formula as above, one wide establishing shot representing "market knowledge/education", e.g. a clean desk with gold bars, a terminal, and a notebook.

━━━ OUTRO SLIDE ━━━
Last slide, calm brand sign-off — NOT another fact. Write:
- "headline": ≤ 50 characters, confident, built around Stratix teaching traders in real time. Vary the wording every run.
- "subtext": one sentence reinforcing ongoing educational coverage across Gold, Forex and Crypto. No guaranteed-return language.
- "cta": one short rotating action phrase, e.g. "Follow for daily trading facts", "Save this post for later", "Turn on notifications for new facts".
- "imagePrompt": calm, confident, same formula, NOT urgent.

━━━ OUTPUT ━━━
Return STRICTLY a JSON object of this exact shape — no markdown fences, no commentary, no extra keys:
{
  "cover": { "title": "...", "highlightPhrase": "...", "overview": "...", "overviewHighlights": ["..."], "bulletHeadlines": ["..."], "imagePrompt": "..." },
  "facts": [ { "title": "...", "highlightPhrase": "...", "fact": "...", "sourceNote": "...", "relatedInstruments": ["..."], "imagePrompt": "..." } ],
  "outro": { "headline": "...", "subtext": "...", "cta": "...", "imagePrompt": "..." }
}`;
}

function clampStr(v: unknown, max: number, fallback = ""): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

function resolveHighlight(title: string, candidate: string): string {
  if (candidate && title.includes(candidate)) return candidate;
  const words = title.split(" ");
  return words.slice(0, Math.min(3, words.length)).join(" ");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  // Body is optional — Facts generation is otherwise fully automatic unless a
  // topicHint is supplied (e.g. from the content calendar). previewOnly skips
  // the OpenAI call and just returns the exact prompt text.
  let body: { topicHint?: string; previewOnly?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is expected */ }
  const topicHint = typeof body?.topicHint === "string" ? body.topicHint.trim().slice(0, 300) : undefined;

  const liveContext = await fetchLiveContext();
  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const systemPrompt = buildSystemPrompt(todayLabel, liveContext, topicHint);
  const userMessage = "Generate today's Facts batch.";

  if (body?.previewOnly) {
    return NextResponse.json({ systemPrompt, userMessage });
  }

  const openai = new OpenAI({ apiKey });
  let raw = "";
  try {
    const response = await openai.chat.completions.create({
      model: CURATOR_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 12000,
      response_format: { type: "json_object" },
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation call failed" },
      { status: 502 }
    );
  }

  let parsed: { cover?: unknown; facts?: unknown; outro?: unknown };
  try {
    const fence = raw.match(/```json\s*([\s\S]*?)```/);
    parsed = JSON.parse(fence ? fence[1].trim() : raw);
  } catch {
    return NextResponse.json({ error: "AI returned unparseable JSON — try again." }, { status: 502 });
  }

  const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : [];
  const facts: FactCopy[] = rawFacts
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => {
      const title = clampStr(f.title, 90);
      return {
        title,
        highlightPhrase: resolveHighlight(title, clampStr(f.highlightPhrase, 60)),
        description: clampStr(f.fact, 400),
        sourceNote: clampStr(f.sourceNote, 160),
        relatedInstruments: Array.isArray(f.relatedInstruments)
          ? (f.relatedInstruments as unknown[]).filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 3).map((s) => s.toUpperCase())
          : [],
        imagePrompt: clampStr(f.imagePrompt, 1200),
        imageUrl: "",
      } as unknown as FactCopy;
    })
    .filter((f) => f.title && f.description)
    .slice(0, MAX_FACTS);

  if (facts.length === 0) {
    return NextResponse.json({ error: "AI returned no usable facts — try again." }, { status: 502 });
  }

  const rawCover = (parsed.cover && typeof parsed.cover === "object" ? parsed.cover : {}) as Record<string, unknown>;
  const coverTitle = clampStr(rawCover.title, 70) || `${facts.length} Things Every Trader Should Know Today`;
  const coverOverview = clampStr(rawCover.overview, 300) || "A quick round of verified facts about the instruments you trade.";
  const cover: CoverCopy = {
    title: coverTitle,
    highlightPhrase: resolveHighlight(coverTitle, clampStr(rawCover.highlightPhrase, 60)),
    description: coverOverview,
    descriptionHighlights: Array.isArray(rawCover.overviewHighlights)
      ? (rawCover.overviewHighlights as unknown[]).filter((h): h is string => typeof h === "string").slice(0, 3)
      : [],
    bulletHeadlines: (Array.isArray(rawCover.bulletHeadlines)
      ? (rawCover.bulletHeadlines as unknown[]).filter((h): h is string => typeof h === "string" && !!h.trim())
      : []
    ).slice(0, MAX_FACTS).concat(facts.map((f) => f.title)).slice(0, MAX_FACTS),
    imagePrompt: clampStr(rawCover.imagePrompt, 1200) ||
      "A clean minimalist desk with stacked gold bars, a trading terminal glowing softly, and an open notebook, warm even lighting, curious and educational mood, warm amber and emerald tones on neutral charcoal, subject in the lower two-thirds with clean negative space above, photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k. No text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isCover: true,
  };

  const OUTRO_FALLBACKS = [
    { headline: "We're Always Teaching The Markets", cta: "Follow for daily trading facts" },
    { headline: "One Fact Closer To Trading Smarter", cta: "Save this post for later" },
    { headline: "Knowledge That Compounds, Daily", cta: "Turn on notifications for new facts" },
  ];
  const rawOutro = (parsed.outro && typeof parsed.outro === "object" ? parsed.outro : {}) as Record<string, unknown>;
  const outroFallback = OUTRO_FALLBACKS[Math.floor(Date.now() / 60000) % OUTRO_FALLBACKS.length];
  const outro: OutroCopy = {
    title: clampStr(rawOutro.headline, 60) || outroFallback.headline,
    description: clampStr(rawOutro.subtext, 200) ||
      "Real, verified trading facts across Gold, Forex and Crypto — a little sharper every day.",
    cta: clampStr(rawOutro.cta, 60) || outroFallback.cta,
    imagePrompt: clampStr(rawOutro.imagePrompt, 1200) ||
      "A single trader calmly reviewing notes beside a softly glowing chart in a minimalist studio, warm side light, composed and unhurried, confident mood, warm amber and emerald tones on deep charcoal, subject in the lower two-thirds with clean negative space above, photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k. No text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isOutro: true,
  };

  return NextResponse.json({
    cards: [cover, ...facts, outro],
  });
}
