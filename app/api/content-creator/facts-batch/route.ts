import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { fetchLiveContext } from "@/lib/content-creator/live-prices";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
// Kept at a value every Vercel plan allows — Hobby caps at 60s, so a higher
// number here is silently clamped and the function dies with an opaque
// FUNCTION_INVOCATION_TIMEOUT (a non-JSON 504) instead of a readable error.
export const maxDuration = 60;
// Abort the model call before the platform aborts the whole function, so a
// slow generation surfaces as a normal JSON error the UI can display.
const OPENAI_TIMEOUT_MS = 45_000;

const CURATOR_MODEL = "gpt-5.5-2026-04-23";
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
async function buildSystemPrompt(todayLabel: string, liveContext: string, topicHint?: string): Promise<string> {
  const template = await getPromptTemplate("contentCreator.factsBatch.system");
  return renderTemplate(template, {
    TODAY_LABEL: todayLabel,
    LIVE_CONTEXT: liveContext,
    TOPIC_HINT_BLOCK: topicHint
      ? `\nOne of your facts MUST be built specifically around this assigned topic: "${topicHint}" — do not skip or water it down into something generic. Choose the remaining facts as usual, each covering a different distinct topic.\n`
      : "",
  });
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

  // Everything below can throw (template lookup, live-price fetch escaping
  // its own guards, etc.) — without this wrapper an uncaught throw falls
  // through to Next.js's own error page (HTML/plain text, not JSON), which
  // breaks the client's res.json() with "Unexpected token" instead of
  // surfacing a readable error.
  try {

  // Body is optional — Facts generation is otherwise fully automatic unless a
  // topicHint is supplied (e.g. from the content calendar). previewOnly skips
  // the OpenAI call and just returns the exact prompt text.
  let body: { topicHint?: string; previewOnly?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is expected */ }
  const topicHint = typeof body?.topicHint === "string" ? body.topicHint.trim().slice(0, 300) : undefined;

  const liveContext = await fetchLiveContext();
  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const systemPrompt = await buildSystemPrompt(todayLabel, liveContext, topicHint);
  const userMessage = "Generate today's Facts batch.";

  if (body?.previewOnly) {
    return NextResponse.json({ systemPrompt, userMessage });
  }

  const openai = new OpenAI({ apiKey });
  let raw = "";
  try {
    const response = await openai.chat.completions.create(
      {
        model: CURATOR_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_completion_tokens: 12000,
        response_format: { type: "json_object" },
      },
      {
        timeout: OPENAI_TIMEOUT_MS,
        // Without this the SDK's default of 2 retries multiplies the timeout
        // above (45s → ~135s) and blows the function budget regardless.
        maxRetries: 0,
      }
    );
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Facts batch generation failed unexpectedly — try again." },
      { status: 500 }
    );
  }
}
