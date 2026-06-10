import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { getContractSize } from "@/lib/contract-sizes";

export const dynamic = 'force-dynamic';

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
    "emotions", "lessonsLearned", "tags", "rating", "profileId",
  ];

  const updateData: Record<string, unknown> = {};
  const unsetData: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (body[key] === null) {
        unsetData[key] = 1;
      } else {
        updateData[key] = body[key];
      }
    }
  }

  await dbConnect();
  const existing = await TradeEntryModel.findOne({
    _id: id,
    userId: session.user.id,
  }).lean();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Recalculate profit if prices or parameters changed
  if (
    "exitPrice" in body ||
    "entryPrice" in body ||
    "lots" in body ||
    "direction" in body ||
    "symbol" in body ||
    "leverage" in body
  ) {
    const entry = updateData.entryPrice !== undefined ? (updateData.entryPrice as number) : existing.entryPrice;
    const exit = "exitPrice" in body ? body.exitPrice : existing.exitPrice;
    const lots = updateData.lots !== undefined ? (updateData.lots as number) : existing.lots;
    const dir = updateData.direction !== undefined ? (updateData.direction as string) : existing.direction;
    const lev = updateData.leverage !== undefined ? (updateData.leverage as number) : (existing.leverage ?? 100);
    const symForSize = updateData.symbol !== undefined ? (updateData.symbol as string) : existing.symbol;
    const cs = getContractSize(symForSize);

    if (exit !== null && exit !== undefined && exit !== "") {
      updateData.profit =
        dir === "buy" ? ((exit as number) - entry) * lots * cs : (entry - (exit as number)) * lots * cs;
      updateData.status = "closed";
    } else {
      updateData.profit = 0;
      updateData.status = "open";
      unsetData.exitPrice = 1;
      delete updateData.exitPrice;
    }
    // Recompute margin
    updateData.margin = (entry * lots * cs) / lev;
  }

  const updateOp: Record<string, Record<string, unknown>> = {};
  if (Object.keys(updateData).length > 0) updateOp.$set = updateData;
  if (Object.keys(unsetData).length > 0) updateOp.$unset = unsetData;

  const trade = await TradeEntryModel.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    updateOp,
    { new: true }
  );

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
