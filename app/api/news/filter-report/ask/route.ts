import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { SENTIMENT_MODEL, fetchCandleSummary, formatCandlesForPrompt } from "@/lib/news/sentiment-analysis";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ReportArticle {
  headline: string;
  source: string;
  pubDate: string;
  tier?: 1 | 2 | 3;
  tags?: string[];
  impact?: "High" | "Medium" | "Low";
  affected_instruments?: { symbol: string; sentiment: "Bullish" | "Bearish" | "Neutral" }[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// "Ask AI" scoped to one already-generated Filter News report — grounded
// strictly in that report's kept articles, with real candle data folded in
// as ADDITIVE context only (never the primary basis for an answer — the
// report's news content is). Same fast/cheap model as the rest of the news
// pipeline (SENTIMENT_MODEL = gpt-4o-mini), no tools param — no web browsing.
async function buildSystemPrompt(articles: ReportArticle[], candleBlock: string): Promise<string> {
  const articleBlock = articles
    .map((a, i) => {
      const instruments = (a.affected_instruments ?? []).map((ai) => `${ai.symbol}:${ai.sentiment}`).join(", ");
      return `[${i + 1}] ${a.headline} — source: ${a.source}, published: ${a.pubDate}${a.tier ? `, tier: ${a.tier}` : ""}${a.tags?.length ? `, tags: ${a.tags.join(", ")}` : ""}${instruments ? `, affected: ${instruments}` : ""}`;
    })
    .join("\n");

  const candleSection = candleBlock
    ? `\n${candleBlock}\n\n⚠️ HOW TO USE THE PRICE DATA ABOVE: it is ADDITIVE CONTEXT ONLY, a secondary reference point — never the primary basis for your answer. Ground your answer in the report's news articles first; only mention price levels to add color when directly relevant to the user's question, never let price action override or contradict what the news itself says.\n`
    : "";

  const template = await getPromptTemplate("filterReportAsk.system");
  return renderTemplate(template, {
    ARTICLE_COUNT: String(articles.length),
    ARTICLE_BLOCK: articleBlock || "(no articles in this report)",
    CANDLE_SECTION: candleSection,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { query?: string; history?: ChatMessage[]; articles?: ReportArticle[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const query = body.query?.trim() ?? "";
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  const articles = Array.isArray(body.articles) ? body.articles.slice(0, 200) : [];
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  const candles = await fetchCandleSummary(req);
  const candleBlock = formatCandlesForPrompt(candles, 24);

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: SENTIMENT_MODEL,
      messages: [
        { role: "system", content: await buildSystemPrompt(articles, candleBlock) },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    });

    const answer = response.choices[0]?.message?.content ?? "";
    if (!answer) {
      return NextResponse.json({ error: "AI returned an empty response. Please retry." }, { status: 422 });
    }

    return NextResponse.json({ answer, candleCount: candles ? Object.keys(candles).length : 0 });
  } catch (err) {
    return NextResponse.json(
      { error: `AI request failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 502 }
    );
  }
}
