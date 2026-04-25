import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { getContractSize } from "@/lib/contract-sizes";

// GET /api/trade/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await dbConnect();
  const trade = await TradeEntryModel.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!trade) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(trade);
}

// PUT /api/trade/[id] — update trade or journal data
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  // Allowlist updatable fields
  const allowed = [
    "symbol", "direction", "lots", "entryPrice", "exitPrice",
    "entryTime", "exitTime", "stopLoss", "takeProfit", "profit",
    "status", "leverage", "margin", "timeframe", "journaled", "executionChecklist", "screenshots",
    "preTradeAnalysis", "postTradeReview", "riskRatio", "rewardRatio",
    "emotions", "lessonsLearned", "tags", "rating",
  ];

  const updateData: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      updateData[key] = body[key];
    }
  }

  // Recalculate profit if prices changed
  if (updateData.exitPrice != null || updateData.entryPrice != null) {
    const existing = await TradeEntryModel.findOne({
      _id: id,
      userId: session.user.id,
    }).lean();
    if (existing) {
      const entry = (updateData.entryPrice as number) ?? existing.entryPrice;
      const exit = (updateData.exitPrice as number) ?? existing.exitPrice;
      const lots = (updateData.lots as number) ?? existing.lots;
      const dir = (updateData.direction as string) ?? existing.direction;
      const lev = (updateData.leverage as number) ?? existing.leverage ?? 100;
      const symForSize = (updateData.symbol as string) ?? existing.symbol;
      const cs = getContractSize(symForSize);
      if (exit != null) {
        updateData.profit =
          dir === "buy" ? (exit - entry) * lots * cs : (entry - exit) * lots * cs;
        updateData.status = "closed";
      }
      // Recompute margin whenever entry price, lots, or leverage changes
      updateData.margin = (entry * lots * cs) / lev;
    }
  } else if (updateData.leverage != null) {
    // Leverage changed but prices didn't — still recompute margin
    const existing = await TradeEntryModel.findOne({
      _id: id,
      userId: session.user.id,
    }).lean();
    if (existing) {
      const entry = existing.entryPrice;
      const lots = (updateData.lots as number) ?? existing.lots;
      const lev = updateData.leverage as number;
      const cs = getContractSize(existing.symbol);
      updateData.margin = (entry * lots * cs) / lev;
    }
  }

  await dbConnect();
  const trade = await TradeEntryModel.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    { $set: updateData },
    { new: true }
  );

  if (!trade) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(trade);
}

// DELETE /api/trade/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await dbConnect();
  const result = await TradeEntryModel.deleteOne({
    _id: id,
    userId: session.user.id,
  });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
