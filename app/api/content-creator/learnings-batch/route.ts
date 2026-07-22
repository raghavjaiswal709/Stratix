import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { fetchLiveContext } from "@/lib/content-creator/live-prices";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const CURATOR_MODEL = "gpt-5.5-2026-04-23";
const MIN_SLIDES = 4;
const MAX_SLIDES = 7;

interface SlideCopy {
  title: string;
  description: string;
  concept: string;
  stepLabel: string;
  imagePrompt: string;
  imageUrl: string;
}

interface CoverCopy {
  title: string;
  highlightPhrase: string;
  description: string;
  descriptionHighlights: string[];
  concept: string;
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

// Learnings run on model knowledge, one concept per batch — no live feed
// dependency for the concept itself, but the same price-grounding block is
// still supplied in case the concept's worked example references a real
// current level (e.g. illustrating an FVG on today's gold chart).
async function buildSystemPrompt(todayLabel: string, liveContext: string, topicHint?: string): Promise<string> {
  const template = await getPromptTemplate("contentCreator.learningsBatch.system");
  return renderTemplate(template, {
    TODAY_LABEL: todayLabel,
    LIVE_CONTEXT: liveContext,
    CONCEPT_BLOCK: topicHint
      ? `Your assigned concept for today is exactly: "${topicHint}". Build the entire lesson around this concept — do not substitute, broaden, or narrow it into a different concept.`
      : `Choose ONE concrete, teachable trading or market concept — specific enough to explain fully in 4-7 slides, not so broad it needs a textbook. Favor concepts a retail trader would actually search for or get stuck on. Do not pick a concept requiring unverifiable or overly niche claims.`,
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

  // Body is optional — the model picks the concept automatically unless a
  // topicHint is supplied (e.g. from the content calendar). previewOnly skips
  // the OpenAI call entirely and just returns the exact prompt text, for the
  // calendar's "Copy Prompt" action.
  let body: { topicHint?: string; previewOnly?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body is expected */ }
  const topicHint = typeof body?.topicHint === "string" ? body.topicHint.trim().slice(0, 300) : undefined;

  const liveContext = await fetchLiveContext();
  const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const systemPrompt = await buildSystemPrompt(todayLabel, liveContext, topicHint);
  const userMessage = topicHint
    ? `Generate today's Learnings batch for the assigned concept above.`
    : "Pick one concept and generate today's Learnings batch.";

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

  let parsed: { concept?: unknown; cover?: unknown; slides?: unknown; recap?: unknown; outro?: unknown };
  try {
    const fence = raw.match(/```json\s*([\s\S]*?)```/);
    parsed = JSON.parse(fence ? fence[1].trim() : raw);
  } catch {
    return NextResponse.json({ error: "AI returned unparseable JSON — try again." }, { status: 502 });
  }

  const concept = clampStr(parsed.concept, 80) || "Trading Concept";

  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  const stepSlides = rawSlides
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({ heading: clampStr(s.heading, 70), body: clampStr(s.body, 360), imagePrompt: clampStr(s.imagePrompt, 1200) }))
    .filter((s) => s.heading && s.body)
    .slice(0, MAX_SLIDES);

  if (stepSlides.length < MIN_SLIDES - 1) {
    // Genuinely too thin to ship as a lesson — surface the error rather than
    // padding with empty slides.
    return NextResponse.json({ error: "AI returned too few usable slides — try again." }, { status: 502 });
  }

  const rawRecap = (parsed.recap && typeof parsed.recap === "object" ? parsed.recap : {}) as Record<string, unknown>;
  const recapBody = clampStr(rawRecap.body, 360) ||
    `${concept} — reviewed step by step. Save this slide as your quick-reference recap.`;
  const allSlides = [
    ...stepSlides,
    { heading: "Recap", body: recapBody, imagePrompt: clampStr(rawRecap.imagePrompt, 1200) || stepSlides[stepSlides.length - 1]?.imagePrompt || "" },
  ];

  const slides: SlideCopy[] = allSlides.map((s, i) => ({
    title: s.heading,
    description: s.body,
    concept,
    stepLabel: `Step ${i + 1} of ${allSlides.length}`,
    imagePrompt: s.imagePrompt ||
      "A clean diagram-style trading illustration on a minimalist desk, soft even lighting, explainer mood, warm amber and emerald accents on neutral charcoal, subject in the lower two-thirds with clean negative space above, photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k. No text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
  }));

  const rawCover = (parsed.cover && typeof parsed.cover === "object" ? parsed.cover : {}) as Record<string, unknown>;
  const coverTitle = clampStr(rawCover.title, 70) || `What You'll Learn: ${concept}`;
  const coverOverview = clampStr(rawCover.overview, 300) || `A step-by-step walkthrough of ${concept}, explained the way a desk would teach it.`;
  const cover: CoverCopy = {
    title: coverTitle,
    highlightPhrase: resolveHighlight(coverTitle, clampStr(rawCover.highlightPhrase, 60)),
    description: coverOverview,
    descriptionHighlights: Array.isArray(rawCover.overviewHighlights)
      ? (rawCover.overviewHighlights as unknown[]).filter((h): h is string => typeof h === "string").slice(0, 3)
      : [],
    concept,
    imagePrompt: clampStr(rawCover.imagePrompt, 1200) ||
      "A clean minimalist study desk with an open notebook, a softly glowing trading chart on a monitor in the background, warm even lighting, curious and focused mood, warm amber and emerald tones on neutral charcoal, subject in the lower two-thirds with clean negative space above, photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k. No text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isCover: true,
  };

  const OUTRO_FALLBACKS = [
    { headline: "We're Always Teaching The Markets", cta: "Follow for daily lessons" },
    { headline: "One Lesson Closer To Trading Smarter", cta: "Save this post to review later" },
    { headline: "Markets Reward The Prepared", cta: "Turn on notifications for new lessons" },
  ];
  const rawOutro = (parsed.outro && typeof parsed.outro === "object" ? parsed.outro : {}) as Record<string, unknown>;
  const outroFallback = OUTRO_FALLBACKS[Math.floor(Date.now() / 60000) % OUTRO_FALLBACKS.length];
  const outro: OutroCopy = {
    title: clampStr(rawOutro.headline, 60) || outroFallback.headline,
    description: clampStr(rawOutro.subtext, 200) ||
      "Real trading concepts, taught clearly, across Gold, Forex and Crypto.",
    cta: clampStr(rawOutro.cta, 60) || outroFallback.cta,
    imagePrompt: clampStr(rawOutro.imagePrompt, 1200) ||
      "A single trader calmly reviewing notes beside a softly glowing chart in a minimalist studio, warm side light, composed and unhurried, confident mood, warm amber and emerald tones on deep charcoal, subject in the lower two-thirds with clean negative space above, photorealistic editorial photography, shot on 85mm lens, ultra-detailed, 8k. No text, no words, no letters, no numbers, no logos, no watermarks.",
    imageUrl: "",
    isOutro: true,
  };

  return NextResponse.json({
    cards: [cover, ...slides, outro],
    concept,
  });
}
