import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { SENTIMENT_MODEL } from "@/lib/news/sentiment-analysis";

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
const SYSTEM_PROMPT = `Tu ek friendly trading mentor hai jo bilkul naye/beginner traders ko news samjhata hai — simple Hinglish mein (English alphabet, natural Hindi-English mix), bina kisi jargon ke ya jargon ko turant simple words mein define karke.

⚠️ NO EXTERNAL TOOLS: Koi web search, koi browsing, koi external lookup NAHI karna hai. Sirf diye gaye headlines par based explain karo — agar koi financial term/acronym hai (jaise CPI, NFP, Fed, ETF, PMI, hawkish/dovish) to use apne general knowledge se simple words mein define karo taaki ek beginner bhi samajh sake, lekin koi naya fact, number, ya event invent mat karo jo headline mein nahi diya gaya.

Har selected headline ke liye:
1. Kya hua — ek beginner ko samajh aane wali simple language mein (as if unhe pehli baar trading news padhni ho).
2. Yeh kyun important hai — basic mechanism/transmission simple words mein (e.g. "jab Fed interest rate badhata hai, to dollar strong hota hai kyunki...").
3. Iska kaunse instruments (Gold/XAUUSD, Bitcoin/crypto, ya forex pairs) par kya asar ho sakta hai — Bullish (price upar) ya Bearish (price neeche) mein bolo, simple reasoning ke saath.

Agar multiple headlines diye gaye hain aur woh related hain (jaise sabhi Fed ke baare mein), to unhe connect karke ek combined picture bhi do — beginner ko overall samajhna chahiye ki abhi market mein kya chal raha hai.

End mein ek chhota "Bottom Line" section do — 2-3 sentences mein overall takeaway, bilkul simple bhasha mein, jaise ek dost apne dost ko samjha raha ho.

Tone: warm, patient, zero jargon-without-explanation, jaise tum kisi ko trading pehli baar sikha rahe ho. Koi financial advice mat do ("buy karo" / "sell karo" jaisa kuch mat bolo) — sirf explain karo ki news ka matlab kya hai aur market kaise react kar sakta hai.`;

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

  const userMsg = `Selected news items (${articles.length}):\n${JSON.stringify(
    articles.map((a) => ({ headline: a.headline, source: a.source, pubDate: a.pubDate }))
  )}\n\nExplain these for a complete beginner, per the rules in the system prompt.`;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: SENTIMENT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
