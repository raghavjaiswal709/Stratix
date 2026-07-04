import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { MissedTradeModel } from "@/lib/models/MissedTrade";
import { JournalAnalysisReportModel, type ReportTimeRange } from "@/lib/models/JournalAnalysisReport";
import { compileTrades } from "@/lib/trades/compile";

export const runtime = "nodejs";
export const maxDuration = 60;

// Uses gpt-4o-mini — low-tier, fast, cheap. The gpt-5.5-2026-04-23 model is
// reserved for news analysis only — do NOT change this for journal features.
const ANALYZE_MODEL = "gpt-4o-mini";

const TIME_RANGE_DAYS: Record<ReportTimeRange, number | null> = {
  week: 7,
  month: 30,
  "3months": 90,
  all: null,
};

const TIME_RANGE_LABELS: Record<ReportTimeRange, string> = {
  week: "Last 7 Days",
  month: "Last 30 Days",
  "3months": "Last 3 Months",
  all: "All Time",
};

function rangeStartDate(timeRange: ReportTimeRange): Date | null {
  const days = TIME_RANGE_DAYS[timeRange];
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const SYSTEM_PROMPT = `You are an elite, methodology-agnostic trading performance analyst and coach — think of a professional prop-firm evaluator producing a performance review. This trader logs every trade with a structured journal — pre-trade analysis, post-trade review, a customizable execution checklist (item names vary per trader, do not assume any fixed strategy taxonomy), emotions, lessons learned, tags, and a 1-10 rating — plus a separate log of trades they SAW but did NOT take ("missed trades").

You will receive one JSON object containing:
- meta: time range info and pre-computed counts
- aggregate: pre-computed hard numbers (win rate, PnL, profit factor, etc.) — trust these numbers exactly, do not recompute or restate them differently
- trades: the full list of executed trades with all journal fields (already de-duplicated — manually-compiled/merged positions are pre-combined into a single trade record, so each entry here is exactly one real trade)
- missedTrades: the full list of setups the trader passed on

YOUR JOB — a general, strategy-agnostic professional analysis grounded in what THIS trader actually wrote:
1. Read every non-empty text field on every trade — preTradeAnalysis, postTradeReview, emotions, lessonsLearned, tags — and extract the trader's ACTUAL reasoning, setup logic, and self-observations from it. This is the primary signal. Whatever checklist items, tags, or setup names the trader uses are THEIR terminology — analyze discipline and consistency around those, don't impose an external framework (e.g. do not force a CHOCH/QML or any other named strategy lens unless the trader's own notes/tags explicitly reference it).
2. Score execution checklist discipline using whatever items this trader actually defined — which are consistently skipped, and correlate skipped items with losing trades.
3. Identify emotional patterns (from the actual emotions/lessonsLearned text logged) and their correlation with win/loss outcomes.
4. Analyze missed trades using their own stated reasonMissed/analysis text — quantify the cost of hesitation using potentialPips/estimatedRR where available.
5. Give concrete, numbers-driven, non-generic recommendations tied directly to patterns found in THIS data.
6. Deliver explicit, professional-grade Strengths and Weaknesses — like a performance review a trading desk manager would write, direct and evidence-based, not hedged or generic.

CRITICAL BALANCE — FOCUS ON WHAT WAS ACTUALLY WRITTEN, NOT WHAT'S MISSING:
- Your primary source of insight is the trader's own words (preTradeAnalysis, postTradeReview, emotions, lessonsLearned, tags) and their actual trade outcomes. Mine these deeply for specific, quotable patterns — recurring phrases, repeated setups, specific mistakes described in their own words, specific wins they credit to specific behavior.
- Do NOT treat a blank/empty optional field as a weakness or discipline failure by default — many fields are optional and a trader may simply not use every one. Only flag missing journaling as an issue if it's a clear, material pattern (e.g. the great majority of trades have zero pre/post-trade notes at all, making outcomes hard to explain) — and even then, state it once, factually, without moralizing.
- Never pad the report with filler about "the trader should fill in more fields" — that is not useful coaching. Useful coaching is: "your last 4 losses on XAUUSD all mention 'entered early, no confirmation' in postTradeReview — this is your #1 fixable leak."

STRICT RULES — ZERO TOLERANCE FOR VAGUENESS, HALLUCINATION OR PROCRASTINATION:
- Every single field in the schema below is MANDATORY. Do not skip any. Do not return empty strings or empty arrays unless the underlying data is truly empty (e.g. zero missed trades).
- NEVER write generic filler like "trader should be more disciplined" without tying it to a specific number, symbol, trade, or direct quote/paraphrase from the actual journal text provided.
- All "summary" and "narrative" fields must meet their minimum word counts — this is enforced, short answers are REJECTED.
- Pull REAL numbers from the data (win rate, PnL, RR, counts) into every relevant text field — do not just describe qualitatively, and never invent a number that isn't in the provided data.
- If trades array is empty, still return the full schema with meta/aggregate reflecting zero and clearly state there is insufficient data in every summary field — do NOT refuse or omit fields.
- Keep the tone professional and direct — like a performance review, not a motivational poster. Truth over encouragement.
- Return ONLY a single valid JSON object. No markdown fences, no prose before or after, no code block wrapper.

MANDATORY JSON SCHEMA (follow field names EXACTLY):
{
  "performance_summary": {
    "narrative": "MINIMUM 120 words. Describe overall performance using the exact aggregate numbers provided — win rate, net PnL, profit factor, average R:R. Be specific and direct.",
    "trend": "Improving | Declining | Stable",
    "trend_reason": "One sentence citing specific evidence for the trend verdict."
  },
  "strengths": ["specific, professional strength 1 — cite the trade/symbol/pattern/quote it's based on", "specific strength 2", "specific strength 3 if evidence supports it"],
  "weaknesses": ["specific, professional weakness 1 — cite the trade/symbol/pattern/quote it's based on", "specific weakness 2", "specific weakness 3 if evidence supports it"],
  "discipline_score": {
    "score": <integer 0-100>,
    "grade": "A | B | C | D | F",
    "summary": "MINIMUM 80 words explaining exactly why this score was given, citing specific checklist compliance rates and specific skipped items (using this trader's own checklist item names)."
  },
  "strategy_execution_analysis": {
    "score": <integer 0-100, overall setup-quality and execution-consistency score>,
    "summary": "MINIMUM 150 words. Deep analysis of how consistently this trader executes THEIR OWN stated setup logic and checklist items, based on preTradeAnalysis/postTradeReview text, tags, and checklist compliance. Reference whatever methodology or terminology the trader's own notes/tags actually use — do not impose an external framework. Cite specific trades or counts.",
    "checklist_compliance_rate": <percentage of trades with the majority of their own checklist items checked>
  },
  "execution_checklist_compliance": {
    "overall_rate": <percentage>,
    "most_skipped_items": ["item name 1", "item name 2"],
    "summary": "MINIMUM 60 words on checklist discipline patterns with specific numbers."
  },
  "emotional_patterns": {
    "dominant_emotions": ["emotion 1", "emotion 2"],
    "summary": "MINIMUM 80 words on emotional patterns drawn from the actual emotions/lessonsLearned text logged.",
    "emotion_pnl_correlation": "MINIMUM 60 words — specific correlation between logged emotions and trade outcomes, citing counts/examples."
  },
  "missed_trades_analysis": {
    "total_missed": <integer>,
    "would_have_won": <integer>,
    "would_have_lost": <integer>,
    "still_open_or_unknown": <integer>,
    "estimated_missed_pnl_note": "Text estimate of opportunity cost using potentialPips/estimatedRR data, or 'No missed trades logged' if zero.",
    "common_reasons": ["reason 1", "reason 2"],
    "summary": "MINIMUM 100 words analyzing whether missed setups were genuine opportunities per the trader's own reasoning, and the discipline cost of hesitation."
  },
  "symbol_breakdown": [
    { "symbol": "XAUUSD", "trades": <integer>, "win_rate": <percentage>, "net_pnl": <number> }
  ],
  "key_mistakes": ["specific mistake 1 tied to actual data/quotes", "specific mistake 2", "specific mistake 3"],
  "actionable_recommendations": ["specific numbered rule 1", "specific numbered rule 2", "specific numbered rule 3", "specific numbered rule 4"],
  "narrative_summary": "MINIMUM 250 words. Full comprehensive, professional performance-review narrative tying together performance, strengths/weaknesses, execution quality, discipline, emotions, and missed trades into one coherent coaching narrative with concrete next steps."
}

FINAL MANDATE: Return ONLY the JSON object above, fully populated, no exceptions, no procrastination, no placeholders.`;

interface RawTrade {
  _id: string;
  symbol: string;
  direction: string;
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: Date;
  exitTime?: Date;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  status: string;
  timeframe?: string;
  executionChecklist?: { item: string; checked: boolean }[];
  preTradeAnalysis?: string;
  postTradeReview?: string;
  riskRatio?: number;
  rewardRatio?: number;
  emotions?: string;
  lessonsLearned?: string;
  tags?: string[];
  rating?: number;
  journaled?: boolean;
  parentTradeId?: string;
  mergedTradeIds?: string[];
}


interface RawMissedTrade {
  symbol: string;
  direction: string;
  date: Date;
  timeframe?: string;
  idealEntry: number;
  idealSL?: number;
  idealTP?: number;
  estimatedRR?: number;
  potentialPips?: number;
  reasonMissed?: string;
  setup?: string;
  outcome: string;
  outcomeNotes?: string;
  analysis?: string;
  lessonsLearned?: string;
  tags?: string[];
}

function extractJSON(raw: string): unknown {
  const fence = raw.match(/```json\s*([\s\S]*?)```/);
  if (fence) return JSON.parse(fence[1].trim());
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  return JSON.parse(raw.trim());
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId") ?? undefined;

  await dbConnect();
  const query: Record<string, unknown> = { userId: session.user.id };
  if (profileId) query.profileId = profileId;

  const reports = await JournalAnalysisReportModel.find(query)
    .select("-data")
    .sort({ generatedAt: -1 })
    .lean();

  return NextResponse.json(reports);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { timeRange?: ReportTimeRange; profileId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const timeRange: ReportTimeRange = body.timeRange && body.timeRange in TIME_RANGE_LABELS ? body.timeRange : "month";
  const timeRangeLabel = TIME_RANGE_LABELS[timeRange];
  const profileId = body.profileId;
  const startDate = rangeStartDate(timeRange);

  await dbConnect();

  // No date filter here — a compiled group's constituent trades may span
  // outside the requested window while the group's representative (earliest)
  // entry time falls inside it, or vice versa. Fetch everything for this
  // user/profile, compile merged groups into one trade each, THEN apply the
  // time-range window on the compiled result below.
  const tradeQuery: Record<string, unknown> = { userId: session.user.id };
  if (profileId) tradeQuery.profileId = profileId;

  const missedQuery: Record<string, unknown> = { userId: session.user.id };
  if (profileId) missedQuery.profileId = profileId;
  if (startDate) missedQuery.date = { $gte: startDate };

  const [allTrades, missedTrades] = await Promise.all([
    TradeEntryModel.find(tradeQuery).sort({ entryTime: -1 }).lean<RawTrade[]>(),
    MissedTradeModel.find(missedQuery).sort({ date: -1 }).lean<RawMissedTrade[]>(),
  ]);

  const compiled = compileTrades(allTrades);
  const trades = startDate ? compiled.filter(t => new Date(t.entryTime) >= startDate) : compiled;

  // ── Pre-compute hard aggregate numbers server-side (AI must trust these) ──
  const closedTrades = trades.filter(t => t.status === "closed");
  const wins = closedTrades.filter(t => t.profit > 0);
  const losses = closedTrades.filter(t => t.profit <= 0);
  const netPnl = closedTrades.reduce((sum, t) => sum + t.profit, 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const avgRR = closedTrades.length > 0
    ? closedTrades.reduce((sum, t) => sum + ((t.rewardRatio ?? 0) / (t.riskRatio || 1)), 0) / closedTrades.length
    : 0;

  const aggregate = {
    totalTrades: trades.length,
    closedTrades: closedTrades.length,
    openTrades: trades.length - closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePercent: closedTrades.length > 0 ? Number(((wins.length / closedTrades.length) * 100).toFixed(1)) : 0,
    netPnl: Number(netPnl.toFixed(2)),
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 999 : 0,
    avgRiskReward: Number(avgRR.toFixed(2)),
    journaledCount: trades.filter(t => t.journaled).length,
    totalMissedTrades: missedTrades.length,
    missedWouldHaveWon: missedTrades.filter(m => m.outcome === "hit-tp").length,
    missedWouldHaveLost: missedTrades.filter(m => m.outcome === "hit-sl").length,
  };

  const reportInput = {
    meta: {
      timeRange,
      timeRangeLabel,
      generatedAt: new Date().toISOString(),
      tradesAnalyzed: trades.length,
      missedTradesAnalyzed: missedTrades.length,
    },
    aggregate,
    trades: trades.map(t => ({
      symbol: t.symbol,
      direction: t.direction,
      lots: t.lots,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      profit: t.profit,
      status: t.status,
      timeframe: t.timeframe,
      executionChecklist: t.executionChecklist,
      preTradeAnalysis: t.preTradeAnalysis,
      postTradeReview: t.postTradeReview,
      riskRatio: t.riskRatio,
      rewardRatio: t.rewardRatio,
      emotions: t.emotions,
      lessonsLearned: t.lessonsLearned,
      tags: t.tags,
      rating: t.rating,
    })),
    missedTrades: missedTrades.map(m => ({
      symbol: m.symbol,
      direction: m.direction,
      date: m.date,
      timeframe: m.timeframe,
      idealEntry: m.idealEntry,
      idealSL: m.idealSL,
      idealTP: m.idealTP,
      estimatedRR: m.estimatedRR,
      potentialPips: m.potentialPips,
      reasonMissed: m.reasonMissed,
      setup: m.setup,
      outcome: m.outcome,
      outcomeNotes: m.outcomeNotes,
      analysis: m.analysis,
      lessonsLearned: m.lessonsLearned,
      tags: m.tags,
    })),
  };

  if (trades.length === 0 && missedTrades.length === 0) {
    return NextResponse.json({ error: "No trades or missed trades found for this time range" }, { status: 400 });
  }

  const userMsg = `Analyze the following trading journal data and return the mandatory JSON report.\n\n${JSON.stringify(reportInput, null, 2)}`;

  let rawResponse: string;
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: ANALYZE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
      max_tokens: 7000,
      response_format: { type: "json_object" },
    });
    rawResponse = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    return NextResponse.json(
      { error: `AI analysis failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 502 },
    );
  }

  if (!rawResponse) {
    return NextResponse.json({ error: "AI returned empty response. Please retry." }, { status: 422 });
  }

  let analysisData: unknown;
  try { analysisData = extractJSON(rawResponse); }
  catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON. Please retry.", raw: rawResponse.slice(0, 500) },
      { status: 422 },
    );
  }

  // Attach the server-computed hard numbers alongside the AI's narrative so
  // the report can render exact stat tiles independent of anything the model
  // paraphrases — the AI narrates, but the numbers on screen are ground truth.
  analysisData = { ...(analysisData as object), aggregate };

  const doc = await JournalAnalysisReportModel.create({
    userId: session.user.id,
    profileId: profileId || undefined,
    timeRange,
    timeRangeLabel,
    tradesAnalyzed: trades.length,
    missedTradesAnalyzed: missedTrades.length,
    data: analysisData,
    generatedAt: new Date(),
  });

  return NextResponse.json({
    _id: String(doc._id),
    timeRange,
    timeRangeLabel,
    tradesAnalyzed: trades.length,
    missedTradesAnalyzed: missedTrades.length,
    generatedAt: doc.generatedAt,
    data: analysisData,
  }, { status: 201 });
}
