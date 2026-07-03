import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { MissedTradeModel } from "@/lib/models/MissedTrade";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId") ?? undefined;

  await dbConnect();
  const query: Record<string, unknown> = { userId: session.user.id };
  if (profileId) query.profileId = profileId;

  const trades = await MissedTradeModel.find(query).sort({ date: -1 }).lean();
  return NextResponse.json(trades);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  await dbConnect();

  const trade = await MissedTradeModel.create({
    ...body,
    userId: session.user.id,
  });

  return NextResponse.json(trade, { status: 201 });
}
