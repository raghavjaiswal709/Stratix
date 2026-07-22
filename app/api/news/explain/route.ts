import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { SENTIMENT_MODEL } from "@/lib/news/sentiment-analysis";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExplainArticle {
  headline: string;
  source: string;
  pubDate: string;
}

// Beginner-facing "Explain" feature for multi-selected Filter News cards.
// Uses the same fast/cheap model as the rest of the news pipeline
// (SENTIMENT_MODEL = gpt-4o-mini). NO tools param is passed — the model
// cannot browse or search the web; it explains purely from the selected
// headlines plus its own general financial literacy (the same way it would
// explain "what is CPI" to a beginner without looking anything up).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { articles?: ExplainArticle[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const articles = Array.isArray(body.articles) ? body.articles.slice(0, 20) : [];
  if (articles.length === 0) {
    return NextResponse.json({ error: "No articles selected" }, { status: 400 });
  }

  const [systemPrompt, userTemplate] = await Promise.all([
    getPromptTemplate("explain.system"),
    getPromptTemplate("explain.user"),
  ]);
  const userMsg = renderTemplate(userTemplate, {
    ARTICLE_COUNT: String(articles.length),
    ARTICLES_JSON: JSON.stringify(articles.map((a) => ({ headline: a.headline, source: a.source, pubDate: a.pubDate }))),
  });

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: SENTIMENT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 2048,
    });

    const explanation = response.choices[0]?.message?.content ?? "";
    if (!explanation) {
      return NextResponse.json({ error: "AI returned an empty response. Please retry." }, { status: 422 });
    }

    return NextResponse.json({ explanation });
  } catch (err) {
    return NextResponse.json(
      { error: `AI explanation failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 502 }
    );
  }
}
