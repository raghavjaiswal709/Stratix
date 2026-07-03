import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Uses gpt-4o-mini — low-tier, fast, cheap, ideal for text refinement.
// The gpt-5.5-2026-04-23 model is reserved for news analysis only — do NOT change this.
const REFINE_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a professional trading journal editor. Refine and polish the trader's raw text while preserving ALL original meaning, insights, and trade-specific information.

Rules:
- Preserve every specific observation, price level, and insight mentioned
- Fix grammar, spelling, and structure
- Make sentences clear and professional but still personal (first-person voice)
- Do NOT add new information, opinions, or analysis not originally mentioned
- Keep emotional observations authentic — just clean up the language
- Return ONLY the refined text — no preamble, no quotes, no markdown, no labels`;

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

  const userContent = `Trade context: ${symbol ?? "unknown"} ${direction ?? ""}${
    profit !== undefined ? ` | P&L: ${profit >= 0 ? "+" : ""}${profit.toFixed(2)}` : ""
  }

Field: ${fieldLabel}

Refine this text:
${text}`;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: REFINE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
