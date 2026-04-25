import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { getContractSize } from "@/lib/contract-sizes";

// GET /api/trade — list all trades for current user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const trades = await TradeEntryModel.find({ userId: session.user.id })
    .sort({ entryTime: -1 })
    .lean();

  return NextResponse.json(trades);
}

// POST /api/trade — create a manual trade
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const {
    symbol,
    direction,
    lots,
    entryPrice,
    exitPrice,
    entryTime,
    exitTime,
    stopLoss,
    takeProfit,
    timeframe,
    notes,
    executionChecklist,
    leverage,
  } = body;

  if (!symbol || !direction || !lots || !entryPrice || !entryTime) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const contractSize = getContractSize(symbol);

  const profit =
    exitPrice != null
      ? direction === "buy"
        ? (exitPrice - entryPrice) * lots * contractSize
        : (entryPrice - exitPrice) * lots * contractSize
      : 0;

  // If exitPrice is provided the trade is closed regardless of whether exitTime was supplied.
  // Auto-fill exitTime to now when it's missing but an exit price exists.
  const resolvedExitTime = exitPrice != null
    ? (exitTime ? new Date(exitTime) : new Date())
    : undefined;
  const status = exitPrice != null ? "closed" : "open";

  const resolvedLeverage = leverage && leverage > 0 ? leverage : 100;
  const margin = (entryPrice * lots * contractSize) / resolvedLeverage;

  await dbConnect();
  const trade = await TradeEntryModel.create({
    userId: session.user.id,
    symbol: symbol.toUpperCase(),
    direction,
    lots,
    entryPrice,
    exitPrice: exitPrice ?? undefined,
    entryTime: new Date(entryTime),
    exitTime: resolvedExitTime,
    stopLoss: stopLoss ?? undefined,
    takeProfit: takeProfit ?? undefined,
    timeframe: timeframe ?? "",
    profit,
    status,
    leverage: resolvedLeverage,
    margin,
    source: "manual",
    preTradeAnalysis: notes ?? "",
    executionChecklist: executionChecklist ?? undefined,
  });

  return NextResponse.json(trade, { status: 201 });
}
