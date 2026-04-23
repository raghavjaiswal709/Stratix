import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";

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
    notes,
    executionChecklist,
  } = body;

  if (!symbol || !direction || !lots || !entryPrice || !entryTime) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const profit =
    exitPrice != null
      ? direction === "buy"
        ? (exitPrice - entryPrice) * lots
        : (entryPrice - exitPrice) * lots
      : 0;

  const status = exitPrice != null && exitTime != null ? "closed" : "open";

  await dbConnect();
  const trade = await TradeEntryModel.create({
    userId: session.user.id,
    symbol: symbol.toUpperCase(),
    direction,
    lots,
    entryPrice,
    exitPrice: exitPrice ?? undefined,
    entryTime: new Date(entryTime),
    exitTime: exitTime ? new Date(exitTime) : undefined,
    stopLoss: stopLoss ?? undefined,
    takeProfit: takeProfit ?? undefined,
    profit,
    status,
    source: "manual",
    preTradeAnalysis: notes ?? "",
    executionChecklist: executionChecklist ?? undefined,
  });

  return NextResponse.json(trade, { status: 201 });
}
