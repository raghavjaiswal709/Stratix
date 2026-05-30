import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import clientPromise from "@/lib/mongodb-client";
import dbConnect from "@/lib/mongodb";
import { MT5ConfigModel } from "@/lib/models/MT5Config";

export const dynamic = "force-dynamic";

/**
 * GET /api/trades
 * Returns MT5 deals from the `trades` collection for the authenticated user.
 * The accountId is always read from the server-side DB — never from the client.
 * Only returns DEAL_TYPE_BUY and DEAL_TYPE_SELL entries.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const config = await MT5ConfigModel.findOne({ userId: session.user.id }).lean() as {
    mt5AccountId?: string;
    connected?: boolean;
  } | null;

  if (!config?.mt5AccountId || !config.connected) {
    return NextResponse.json({ trades: [], account: null });
  }

  const client = await clientPromise;
  const db = client.db();

  const [trades, account] = await Promise.all([
    db
      .collection("trades")
      .find({
        accountId: config.mt5AccountId,
        type: { $in: ["DEAL_TYPE_BUY", "DEAL_TYPE_SELL"] },
      })
      .sort({ time: -1 })
      .limit(500)
      .toArray(),
    db.collection("accounts").findOne({ accountId: config.mt5AccountId }),
  ]);

  return NextResponse.json({ trades, account });
}
