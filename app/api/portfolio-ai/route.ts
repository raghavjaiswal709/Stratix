import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { MissedTradeModel } from "@/lib/models/MissedTrade";
import { compileTrades } from "@/lib/trades/compile";
import { getPromptTemplate, renderTemplate } from "@/lib/prompts/store";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Ask Anything" — the dashboard's portfolio Q&A chat. Model: gpt-4o-mini for
// ultra-fast, lightweight responses. No tools param — the model cannot browse;
// it strictly reasons over the trade/journal JSON assembled into the system prompt below.
const PORTFOLIO_AI_MODEL = "gpt-4o-mini";

// Most recent N compiled trades sent to the model — generous headroom for a
// typical retail trader's history while keeping prompt size sane for
// pathological cases (years of high-frequency trading).
const MAX_TRADES = 400;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  swap?: number;
  commission?: number;
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

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { query?: string; history?: ChatMessage[]; profileId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const query = body.query?.trim() ?? "";
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const profileId = body.profileId;

  await dbConnect();

  const tradeQuery: Record<string, unknown> = { userId: session.user.id };
  if (profileId) tradeQuery.profileId = profileId;
  const missedQuery: Record<string, unknown> = { userId: session.user.id };
  if (profileId) missedQuery.profileId = profileId;

  const [allTrades, missedTrades] = await Promise.all([
    TradeEntryModel.find(tradeQuery).sort({ entryTime: -1 }).lean<RawTrade[]>(),
    MissedTradeModel.find(missedQuery).sort({ date: -1 }).lean<RawMissedTrade[]>(),
  ]);

  const trades = compileTrades(allTrades).slice(0, MAX_TRADES);

  // ── Hard aggregate numbers the model must trust over its own arithmetic ──
  const closedTrades = trades.filter((t) => t.status === "closed");
  const wins = closedTrades.filter((t) => t.profit > 0);
  const losses = closedTrades.filter((t) => t.profit <= 0);
  const netPnl = closedTrades.reduce((s, t) => s + t.profit, 0);
  const grossProfit = wins.reduce((s, t) => s + t.profit, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const avgRR = closedTrades.length
    ? closedTrades.reduce((s, t) => s + ((t.rewardRatio ?? 0) / (t.riskRatio || 1)), 0) / closedTrades.length
    : 0;

  const aggregate = {
    totalTrades: trades.length,
    openTrades: trades.length - closedTrades.length,
    closedTrades: closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePercent: closedTrades.length ? round2((wins.length / closedTrades.length) * 100) : 0,
    netPnl: round2(netPnl),
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : grossProfit > 0 ? 999 : 0,
    avgRiskReward: round2(avgRR),
    journaledCount: trades.filter((t) => t.journaled).length,
    unjournaledCount: trades.filter((t) => !t.journaled).length,
    totalMissedTrades: missedTrades.length,
  };

  // ── Per-symbol breakdown — lets the model answer scoped questions
  // ("how am I doing on gold?") without re-deriving it from the raw list ──
  const symbolMap = new Map<string, RawTrade[]>();
  for (const t of trades) {
    const arr = symbolMap.get(t.symbol) ?? [];
    arr.push(t);
    symbolMap.set(t.symbol, arr);
  }
  const bySymbol = Array.from(symbolMap.entries())
    .map(([symbol, list]) => {
      const closed = list.filter((t) => t.status === "closed");
      const w = closed.filter((t) => t.profit > 0);
      const net = closed.reduce((s, t) => s + t.profit, 0);
      return {
        symbol,
        trades: list.length,
        closed: closed.length,
        winRatePercent: closed.length ? round2((w.length / closed.length) * 100) : 0,
        netPnl: round2(net),
      };
    })
    .sort((a, b) => b.trades - a.trades);

  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, dateStyle: "full", timeStyle: "short" });

  const tradesForPrompt = trades.map((t) => ({
    symbol: t.symbol, direction: t.direction, lots: t.lots,
    entryPrice: t.entryPrice, exitPrice: t.exitPrice,
    entryTime: t.entryTime, exitTime: t.exitTime,
    stopLoss: t.stopLoss, takeProfit: t.takeProfit,
    profit: t.profit, status: t.status, timeframe: t.timeframe,
    riskRatio: t.riskRatio, rewardRatio: t.rewardRatio,
    executionChecklist: t.executionChecklist?.length ? t.executionChecklist : undefined,
    preTradeAnalysis: t.preTradeAnalysis || undefined,
    postTradeReview: t.postTradeReview || undefined,
    emotions: t.emotions || undefined,
    lessonsLearned: t.lessonsLearned || undefined,
    tags: t.tags?.length ? t.tags : undefined,
    rating: t.rating,
    journaled: t.journaled,
  }));

  const missedForPrompt = missedTrades.map((m) => ({
    symbol: m.symbol, direction: m.direction, date: m.date, timeframe: m.timeframe,
    idealEntry: m.idealEntry, idealSL: m.idealSL, idealTP: m.idealTP,
    estimatedRR: m.estimatedRR, potentialPips: m.potentialPips,
    reasonMissed: m.reasonMissed || undefined, setup: m.setup || undefined,
    outcome: m.outcome, outcomeNotes: m.outcomeNotes || undefined,
    analysis: m.analysis || undefined, lessonsLearned: m.lessonsLearned || undefined,
    tags: m.tags?.length ? m.tags : undefined,
  }));

  const template = await getPromptTemplate("portfolioAssistant.system");
  const systemPrompt = renderTemplate(template, {
    NOW: now,
    TRADE_COUNT: String(trades.length),
    MISSED_COUNT: String(missedTrades.length),
    AGGREGATE_BLOCK: JSON.stringify(aggregate, null, 1),
    SYMBOL_BREAKDOWN_BLOCK: bySymbol.length ? JSON.stringify(bySymbol, null, 1) : "(no trades yet)",
    TRADES_BLOCK: tradesForPrompt.length ? JSON.stringify(tradesForPrompt, null, 1) : "(no trades recorded yet)",
    MISSED_TRADES_BLOCK: missedForPrompt.length ? JSON.stringify(missedForPrompt, null, 1) : "(no missed trades logged)",
  });

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: PORTFOLIO_AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
        { role: "user", content: query },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const answer = completion.choices[0]?.message?.content ?? "";
    if (!answer) return NextResponse.json({ error: "AI returned an empty response. Please retry." }, { status: 422 });

    return NextResponse.json({ answer, tradeCount: trades.length, missedCount: missedTrades.length });
  } catch (err) {
    return NextResponse.json(
      { error: `AI request failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 502 },
    );
  }
}
