import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
export const maxDuration = 30;

// Uses gpt-4o-mini — low-tier, fast, cheap, ideal for text refinement.
// The gpt-5.5-2026-04-23 model is reserved for news analysis only — do NOT change this.
const REFINE_MODEL = "gpt-4o-mini";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  const body = await req.json() as {
    text?: string;
    fieldLabel?: string;
    context?: { symbol?: string; direction?: string; profit?: number };
  };

  const text = (body.text ?? "").trim();
  if (text.length < 5) {
    return NextResponse.json({ error: "Not enough text to refine" }, { status: 400 });
  }

  const fieldLabel = body.fieldLabel ?? "journal entry";
  const { symbol, direction, profit } = body.context ?? {};

  const [systemPrompt, userTemplate] = await Promise.all([
    getPromptTemplate("journal.refine.system"),
    getPromptTemplate("journal.refine.user"),
  ]);
  const userContent = renderTemplate(userTemplate, {
    SYMBOL: symbol ?? "unknown",
    DIRECTION: direction ?? "",
    PROFIT_LINE: profit !== undefined ? ` | P&L: ${profit >= 0 ? "+" : ""}${profit.toFixed(2)}` : "",
    FIELD_LABEL: fieldLabel,
    TEXT: text,
  });

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: REFINE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const refined = response.choices[0]?.message?.content?.trim() ?? "";
    if (!refined) {
      return NextResponse.json({ error: "AI returned an empty response" }, { status: 422 });
    }

    return NextResponse.json({ ok: true, refined });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `AI refinement failed: ${msg}` }, { status: 502 });
  }
}
