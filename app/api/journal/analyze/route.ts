import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { MissedTradeModel } from "@/lib/models/MissedTrade";
import { JournalAnalysisReportModel, type ReportTimeRange } from "@/lib/models/JournalAnalysisReport";
import { compileTrades } from "@/lib/trades/compile";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

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

  const [systemPrompt, userTemplate] = await Promise.all([
    getPromptTemplate("journal.analyze.system"),
    getPromptTemplate("journal.analyze.user"),
  ]);
  const userMsg = renderTemplate(userTemplate, {
    REPORT_INPUT_JSON: JSON.stringify(reportInput, null, 2),
  });

  let rawResponse: string;
  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: ANALYZE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
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
