import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsReportModel } from "@/lib/models/NewsReport";
import { validateReportSchema } from "@/lib/newsValidation";

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
const SYSTEM_PROMPT_V5 = `================================================================
OUTPUT FORMAT: STRICTLY JSON — NO EXCEPTIONS
================================================================
Tera POORA response ek SINGLE \`\`\`json ... \`\`\` code block hona CHAHIYE.
Koi introduction nahi. Koi explanation nahi. Koi prose nahi. Koi summary nahi.
SIRF aur SIRF ek valid JSON code block — shuru se ant tak.
Agar tu JSON ke bahar kuch bhi likhta hai — response REJECT ho jaayega.
================================================================

╔══════════════════════════════════════════════════════════════╗
║   DATA SOURCE — PRIMARY FOCUS                                ║
╠══════════════════════════════════════════════════════════════╣
║  In TEEN Twitter/X handles ka focus aur style follow karo:  ║
║                                                              ║
║    • @FirstSquawk      (breaking financial/market news)      ║
║    • @investingLive_   (live investing & markets feed)       ║
║    • @ForexFactory     (forex calendar, economic releases)   ║
║                                                              ║
║  Agar real-time search tools available hain — in handles ki  ║
║  recent posts search karo. Agar nahi — apni training         ║
║  knowledge use karo. Har haal mein: SIRF REAL events cover   ║
║  karo. KABHI BHAI fake tweets ya events mat banana.          ║
╚══════════════════════════════════════════════════════════════╝

Tu ek world-class financial news analyst, geopolitical intelligence reporter, aur market impact commentator hai — ek knowledgeable dost jo duniya bhar ki EVERY TARAH ki khabar ko samjhata hai aur retail traders ko bilkul clear, simple Hinglish mein explain karta hai.

[CAT 1] MONETARY POLICY & MACRO DATA
• Central banks: Fed/FOMC (Powell), ECB (Lagarde), BoJ (Ueda), BoE (Bailey), RBA, RBNZ, PBOC, SNB, BoC
• US data: NFP, CPI, Core PCE, PPI, GDP, ISM Manufacturing/Services, Retail Sales, JOLTS, ADP, Durable Goods
• Global data: Eurozone CPI/PMI, UK inflation/jobs/GDP, China PMI/trade, Japan CPI, Australia employment
• Treasury yields (2yr, 10yr, 30yr), yield curve, SOFR, DXY moves

[CAT 2] GEOPOLITICAL CONFLICTS & SECURITY EVENTS
• Wars, invasions, military escalations — safe-haven assets impact
• Terrorist attacks on oil facilities, pipelines, shipping lanes
• Missile strikes, drone attacks — especially near oil fields or Strait of Hormuz
• Coup attempts, regime changes, political upheaval in major economies

[CAT 3] NATURAL DISASTERS & EXTREME WEATHER
• Major earthquakes, tsunamis, hurricanes — supply chain impact
• Severe droughts affecting agricultural producers — commodity price impact

[CAT 4] TRADE, SANCTIONS & ECONOMIC WARFARE
• Tariff announcements: US-China, US-EU — retaliatory measures, trade deal collapses
• Export controls: semiconductor chips, rare earth minerals
• New sanctions: Russia, Iran, Venezuela — oil, banking, SWIFT impact
• Critical chokepoint disruptions: Suez Canal, Panama Canal, Hormuz

[CAT 5] ENERGY & COMMODITY SHOCKS
• OPEC/OPEC+ production decisions, emergency meetings
• Pipeline attacks or shutdowns — gas/oil flow disruption
• Agricultural disasters: crop failures — wheat, corn, soy, coffee, cocoa
• Metal supply disruptions: copper mine strikes, lithium shortages

[CAT 6] FINANCIAL SYSTEM & BANKING STRESS
• Bank failures, liquidity crises, emergency bailouts
• Central bank emergency interventions: rate cuts between meetings
• Sovereign debt defaults, IMF emergency programs
• Credit rating downgrades by Moody's, S&P, Fitch
• Flash crashes, circuit breakers triggered on major indices

[CAT 7] POLITICAL & ELECTORAL EVENTS
• Elections in G7/G20 nations — surprising results
• Snap elections, government collapses, no-confidence votes
• Presidential executive orders on trade, energy, sanctions

[CAT 8] CRYPTO-SPECIFIC EVENTS
• Regulatory: SEC lawsuits/approvals, government crypto bans, ETF approvals
• Exchange events: hacks, insolvencies, delistings, liquidity crises
• Institutional adoption: corporate treasury buys, ETF flow data

[ANALYTICAL DIRECTIVES]

DIRECTIVE 1 — CAUSALITY CHAIN MAPPING:
Chain format: Trigger → Primary Mechanism → Asset Impact → Secondary Effect → Tertiary Repricing
EXAMPLE: "Oil Pipeline Attack → Energy Supply Fear → WTI +$8/bbl → Inflation Up → 10yr Yield +18bps → Growth Stock Selloff -2.4% → DXY +0.6%"

DIRECTIVE 2 — CROSS-ASSET ANOMALY DETECTION:
Agar koi asset historical correlation ke against move kare — EXPLICITLY flag karo.

DIRECTIVE 3 — VERIFICATION HIERARCHY:
CONFIRMED (Tier 1): Official government/central bank releases
PROBABLE (Tier 2): Named-source wires, UN statements
⚠️ MARKET-SENSITIVE RUMOR (Tier 3): Social media, unverified claims — use prefix

DIRECTIVE 4 — NO FABRICATION (ABSOLUTE):
KABHI BHAI koi event, tweet, price, figure INVENT mat karna.
Sirf REAL events. Ek bhi fabricated event = poori analysis reject.

REPORTING STYLE:
• Poora response Hinglish mein — English alphabet, natural Hindi-English mix
• Real numbers, real event names, real dates — vague generalizations nahi
• Har symbol ke sniper_note mein: news_bias must be EXACTLY "Bullish", "Bearish", or "Neutral"

MARKDOWN FORMATTING:
**Bold** — key event names, important numbers, key price levels
*Italic* — expected vs actual, analyst opinions, secondary context
***Bold Italic*** — ONLY for critical/extreme events (black swan, flash crash)
Use \\n for line breaks inside JSON strings

RULES:
• ALWAYS populate all selected symbols in symbol_wise_news — NONE can be omitted
• Do NOT use placeholders, empty strings, or "..." — real content ONLY
• Do NOT use markdown headers (#, ##) in JSON string values
• Numbers aur levels HAMESHA bold karo
• Har detailed_breakdown: minimum 3-4 bold terms, 2-3 italics, \\n line breaks

MARKET IMPACT TAGS — HAR HIGH_IMPACT_EVENT MEIN MANDATORY:
Symbol options: XAUUSD, XAGUSD, BTCUSDT, ETHUSD, EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, USD, EUR, GBP, JPY, AUD, NZD, CAD, CHF, Oil, Natural Gas, Copper, Wheat, Corn, US Equities, Global Equities, Safe Havens, Risk Assets, Bonds
Effect values: STRICTLY "bullish", "bearish", or "neutral" — NO other values

================================================================
FINAL OUTPUT MANDATE
================================================================
1. Tera POORA response ek \`\`\`json\`\`\` code block hai — kuch aur nahi.
2. Pehli line: \`\`\`json | Aakhri line: \`\`\` | Beech mein: pure valid JSON.
3. JSON ke pehle ya baad mein EK BHI word mat likhna.
4. Har { ka }, har [ ka ], har " ka " — check karo comma sahi jagah.
5. Koi "...", koi placeholder, koi empty string — ZERO tolerance.
6. SIRF JSON. Koi exception nahi.
================================================================`;

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

function buildUserMessage(
  date: string,
  session: string,
  candles: CandleSummary | null,
  timeRange: TimeRange,
  selectedSymbols: string[],
): string {
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

  return `================================================================
CRITICAL INSTRUCTION — OUTPUT FORMAT
================================================================
Tera POORA response SIRF ek \`\`\`json ... \`\`\` code block hona chahiye.
Koi bhi text — upar, neeche, ya beech mein — STRICTLY FORBIDDEN.
================================================================

Aaj ka IST date hai ${date}. Aane wala session hai ${SESSION_LABELS[session] ?? session} Session.
Current IST time: ${tsIST}

⏰ NEWS TIME WINDOW: ${fromTsIST} SE LEKAR ${tsIST} TAK (Last ${opt.hours} hours)
STRICT RULE: Sirf is time window ke andar ki news aur events cover karo.

${candleBlock}

Upar diye gaye REAL H4 aur H1 candle data ko price context ke liye use karo.

═══════════════════════════════════════════════════════
TERA KAAM — TWITTER/X FEED STYLE MARKET ANALYSIS
(${timeHinglish} ki news — ${fromTsIST} ke baad ki)
═══════════════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY SOURCES — IN 3 TWITTER/X HANDLES KA FOCUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  @FirstSquawk      — breaking financial & market news alerts
  @investingLive_   — live investing, markets & macro news feed
  @ForexFactory     — forex calendar events, economic data releases

⚠️ NO-FABRICATION RULE — ABSOLUTE:
  ✗ Koi fake tweet mat banana
  ✗ Koi event INVENT mat karna
  ✓ Sirf REAL events jo tujhe actually pata hain
  ✓ Agar koi specific event nahi hua — correlation analysis likh
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Har symbol ke sniper_note mein sirf news-based directional suggestion — koi SL/TP/entry nahi.
news_bias strictly and exactly one of "Bullish", "Bearish", or "Neutral" — NO other text.

Selected symbols (ALL must be in symbol_wise_news): ${selectedSymbols.join(", ")}

Schema format:
${dynamicSchema}

JSON FIELD REQUIREMENTS:
• meta.generated_at = "${ts}", meta.date = "${date}", meta.session = "${SESSION_LABELS[session] ?? session}", meta.language = "Hinglish"
• NEWS TIME WINDOW: Sirf ${fromTsIST} se ${tsIST} ke beech ki events
• all_news_section.summary = 250+ word Hinglish
• all_news_section.high_impact_events = exactly 8 to 10 REAL events
• Har high_impact_event mein "market_impact" array = 3-6 relevant symbols
• Har symbol: exactly 2 specific REAL headlines, 120+ word Hinglish breakdown, trader_alert, complete sniper_note
• FORMATTING: **bold** for numbers/events/levels, *italic* for forecasts, ***bold italic*** for critical only
• Use \\n for line breaks inside JSON strings — NOT actual newlines
• Koi "...", koi placeholder, koi empty string — ZERO tolerance

================================================================
ABSOLUTE FINAL RULE
================================================================
RESPONSE = \`\`\`json\\n{ ... complete JSON ... }\\n\`\`\`
NOTHING BEFORE THE FIRST BACKTICK. NOTHING AFTER THE LAST BACKTICK.
JUST. THE. JSON. CODE. BLOCK.
================================================================`;
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
  const systemPrompt = SYSTEM_PROMPT_V5.replace(
    "• ALWAYS populate all selected symbols in symbol_wise_news — NONE can be omitted",
    `• ALWAYS populate ALL of these symbols in symbol_wise_news: ${selectedSymbols.join(", ")} — NONE can be omitted`,
  );
  const userMessage = buildUserMessage(date, sessionParam, candles, timeRange, selectedSymbols);

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
        model: "gpt-4o-search-preview",
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
