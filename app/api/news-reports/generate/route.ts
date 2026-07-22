import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsReportModel } from "@/lib/models/NewsReport";
import { validateReportSchema } from "@/lib/newsValidation";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

interface HCandle { t: number; o: number; h: number; l: number; c: number }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }

const SESSION_LABELS: Record<string, string> = {
  asian: "Asian", london: "London", new_york: "New York",
};

const SYMBOL_DISPLAY_ORDER = [
  "XAUUSD", "XAGUSD", "BTCUSDT", "ETHUSD",
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
];

const TIME_RANGE_OPTIONS = [
  { value: "3h", hours: 3 },
  { value: "6h", hours: 6 },
  { value: "12h", hours: 12 },
  { value: "18h", hours: 18 },
  { value: "24h", hours: 24 },
  { value: "2d", hours: 48 },
  { value: "3d", hours: 72 },
  { value: "7d", hours: 168 },
] as const;
type TimeRange = typeof TIME_RANGE_OPTIONS[number]["value"];

// ─── Prompt helpers ───────────────────────────────────────────────────────────

function formatToISTString(d: Date): string {
  const istDate = new Date(d.getTime() + 330 * 60 * 1000);
  const y = istDate.getUTCFullYear();
  const m = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(istDate.getUTCDate()).padStart(2, "0");
  const h = String(istDate.getUTCHours()).padStart(2, "0");
  const mi = String(istDate.getUTCMinutes()).padStart(2, "0");
  const s = String(istDate.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${dy} ${h}:${mi}:${s} IST`;
}

function formatCandlesForPrompt(data: CandleSummary | null, selectedSymbols: string[]): string {
  if (!data) return "(candle data available nahi hai — general market knowledge use karo)";
  const syms = selectedSymbols.map(s => s.toLowerCase());
  const lines: string[] = ["=== REAL OHLCV CANDLE DATA (IST timestamps) ==="];
  for (const sym of syms) {
    const d = data[sym];
    if (!d) continue;
    lines.push(`\n${sym.toUpperCase()}:`);
    if (d.h4?.length) {
      lines.push("  H4 (last 7 din):");
      for (const c of d.h4) {
        const ist = new Date((c.t * 1000) + 330 * 60 * 1000);
        const dt = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")} ${String(ist.getUTCHours()).padStart(2, "0")}:00 IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
    if (d.h1?.length) {
      lines.push("  H1 (last 48 ghante):");
      for (const c of d.h1) {
        const ist = new Date((c.t * 1000) + 330 * 60 * 1000);
        const dt = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")} ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`;
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
  }
  return lines.join("\n");
}

// V5 system prompt (Twitter/X feeds focus)
const NEWS_SCHEMA_TEMPLATE = `{
  "meta": {
    "date": "YYYY-MM-DD",
    "session": "Asian | London | New York",
    "generated_at": "ISO-8601 timestamp",
    "language": "Hinglish"
  },
  "all_news_section": {
    "headline": "Is time window ki sabse badi aur impactful khabar — engaging, specific, Hinglish",
    "summary": "250+ word Hinglish summary covering all major events, risk sentiment, asset status",
    "high_impact_events": [
      {
        "event_name": "REAL event naam",
        "impact_explanation": "Impact explanation with **bold** numbers, *italic* context, causality chain — 80+ words Hinglish",
        "market_impact": [
          { "symbol": "XAUUSD", "effect": "bullish" },
          { "symbol": "USD", "effect": "bearish" }
        ]
      }
    ]
  },
  "symbol_wise_news": {
    "XAUUSD": {
      "latest_headlines": ["Gold se related first specific khabar", "Gold se related second khabar"],
      "detailed_breakdown": "**Gold** ne is session mein **$X,XXX** pe [move] kiya.\\n\\n**Key Driver:** [real catalyst] ne gold ko [direction] push kiya.",
      "trader_alert": "Key resistance/support levels aur immediate action points",
      "sniper_note": {
        "news_bias": "Bullish",
        "key_catalyst": "Primary driver for Gold in this session",
        "key_levels_watch": "Key technical levels to watch",
        "session_expectation": "Session expectations for Gold"
      }
    }
  }
}`;

async function buildUserMessage(
  date: string,
  session: string,
  candles: CandleSummary | null,
  timeRange: TimeRange,
  selectedSymbols: string[],
): Promise<string> {
  const ts = new Date().toISOString();
  const candleBlock = formatCandlesForPrompt(candles, selectedSymbols);
  const opt = TIME_RANGE_OPTIONS.find(o => o.value === timeRange) ?? TIME_RANGE_OPTIONS[4];
  const now = new Date();
  const tsIST = formatToISTString(now);
  const fromDate = new Date(now.getTime() - opt.hours * 3600 * 1000);
  const fromTsIST = formatToISTString(fromDate);

  const timeHinglish =
    timeRange === "3h" ? "pichle 3 ghante" :
      timeRange === "6h" ? "pichle 6 ghante" :
        timeRange === "12h" ? "pichle 12 ghante" :
          timeRange === "18h" ? "pichle 18 ghante" :
            timeRange === "24h" ? "pichle 24 ghante" :
              timeRange === "2d" ? "pichle 2 din" :
                timeRange === "3d" ? "pichle 3 din" :
                  "pichle ek hafte";

  // Build dynamic schema with only selected symbols
  let dynamicSchema = NEWS_SCHEMA_TEMPLATE;
  try {
    const schemaObj = JSON.parse(NEWS_SCHEMA_TEMPLATE);
    const filteredSW: Record<string, unknown> = {};
    for (const sym of selectedSymbols) {
      if (schemaObj.symbol_wise_news[sym]) {
        filteredSW[sym] = schemaObj.symbol_wise_news[sym];
      } else {
        filteredSW[sym] = schemaObj.symbol_wise_news["XAUUSD"];
      }
    }
    schemaObj.symbol_wise_news = filteredSW;
    dynamicSchema = JSON.stringify(schemaObj, null, 2);
  } catch { /* use original */ }

  const userTemplate = await getPromptTemplate("newsReports.sessionV5.user");
  return renderTemplate(userTemplate, {
    DATE: date,
    SESSION_LABEL: SESSION_LABELS[session] ?? session,
    TS_IST: tsIST,
    FROM_TS_IST: fromTsIST,
    HOURS: String(opt.hours),
    CANDLE_BLOCK: candleBlock,
    TIME_HINGLISH: timeHinglish,
    SELECTED_SYMBOLS: selectedSymbols.join(", "),
    SCHEMA_BLOCK: dynamicSchema,
    TS: ts,
  });
}

// ─── JSON extractor ────────────────────────────────────────────────────────────

function extractJSON(raw: string): unknown {
  // Try to extract from ```json ... ``` block
  const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());

  // Fallback: try parsing the whole thing
  return JSON.parse(raw.trim());
}

// ─── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    date?: string;
    session?: string;
    timeRange?: TimeRange;
    selectedSymbols?: string[];
    model?: "openai" | "gemini";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    date,
    session: sessionParam,
    timeRange = "24h",
    selectedSymbols = SYMBOL_DISPLAY_ORDER,
    model = "openai",
  } = body;

  if (!date || !sessionParam) {
    return NextResponse.json({ error: "date and session are required" }, { status: 400 });
  }

  // Fetch candle data
  let candles: CandleSummary | null = null;
  try {
    const origin = new URL(req.url).origin;
    const candleRes = await fetch(`${origin}/api/candle-summary`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      signal: AbortSignal.timeout(1500),
    });
    if (candleRes.ok) candles = await candleRes.json();
  } catch { /* proceed without candles */ }

  // Build prompts
  const systemTemplate = await getPromptTemplate("newsReports.sessionV5.system");
  const systemPrompt = renderTemplate(systemTemplate, {
    SYMBOLS_RULE: `• ALWAYS populate ALL of these symbols in symbol_wise_news: ${selectedSymbols.join(", ")} — NONE can be omitted`,
  });
  const userMessage = await buildUserMessage(date, sessionParam, candles, timeRange, selectedSymbols);

  let rawResponse: string;

  if (model === "gemini") {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured in the environment variables." },
        { status: 500 }
      );
    }
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

    try {
      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 32768,
          responseMimeType: "application/json"
        }
      };

      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
      }

      const resJson = await response.json();
      rawResponse = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gemini API error";
      return NextResponse.json({ error: `AI generation failed (Gemini): ${msg}` }, { status: 502 });
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    // Call OpenAI Responses API with web_search so it finds real current events
    const openai = new OpenAI({ apiKey });
    try {
      const response = await openai.responses.create({
        model: "gpt-5.5-2026-04-23",
        tools: [{ type: "web_search_preview" }],
        max_output_tokens: 16000,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      } as Parameters<typeof openai.responses.create>[0]);
      rawResponse = (response as { output_text?: string }).output_text ?? "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "OpenAI API error";
      return NextResponse.json({ error: `AI generation failed (OpenAI): ${msg}` }, { status: 502 });
    }
  }

  // Parse JSON from response
  let reportData: unknown;
  try {
    reportData = extractJSON(rawResponse);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON. Response was not parseable.", raw: rawResponse.slice(0, 500) },
      { status: 422 },
    );
  }

  // Validate schema
  const validationError = validateReportSchema(reportData);
  if (validationError) {
    return NextResponse.json(
      { error: `Schema validation failed: ${validationError}`, raw: rawResponse.slice(0, 500) },
      { status: 422 },
    );
  }

  // Save to DB
  await dbConnect();
  const doc = await new NewsReportModel({
    date,
    session: sessionParam,
    data: reportData,
    generatedBy: userSession.user?.email ?? "unknown",
    generatedAt: new Date(),
    reportType: "ai",
  }).save();

  return NextResponse.json({
    ok: true,
    _id: String(doc._id),
    data: reportData,
  });
}
