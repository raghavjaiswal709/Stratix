import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { getContractSize } from "@/lib/contract-sizes";
import { UserDataModel } from "@/lib/models/UserData";

export const dynamic = "force-dynamic";

const secret = process.env.WEBHOOK_SECRET;

interface WebhookBody {
  userId?: string;
  secret?: string;
  action?: string;
  ticket?: number | string;
  symbol?: string;
  type?: string;
  lots?: number | string;
  openPrice?: number | string;
  closePrice?: number | string;
  openTime?: string;
  closeTime?: string;
  profit?: number | string;
  stopLoss?: number | string;
  takeProfit?: number | string;
  swap?: number | string;
  commission?: number | string;
}

function num(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? fallback : n;
}

export async function POST(req: NextRequest) {
  let body: WebhookBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  if (!secret) {
    return NextResponse.json(
      { error: "WEBHOOK_SECRET not configured on server" },
      { status: 500 }
    );
  }
  if (body.secret !== secret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const { action, userId } = body;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // ── Verify userId exists ────────────────────────────────────────────────────
  await dbConnect();
  const user = await UserDataModel.findOne({ userId }).lean();
  if (!user) {
    return NextResponse.json({ error: "Unknown userId" }, { status: 404 });
  }

  // ── Ping ────────────────────────────────────────────────────────────────────
  if (action === "ping") {
    return NextResponse.json({ ok: true, message: "Stratix webhook online" });
  }

  // ── Trade open ──────────────────────────────────────────────────────────────
  if (action === "trade_open") {
    const ticket = String(body.ticket ?? "");
    const symbol = String(body.symbol ?? "").toUpperCase();
    const direction = body.type === "buy" || body.type === "sell" ? body.type : "buy";
    const lots = num(body.lots);
    const entryPrice = num(body.openPrice);
    const entryTime = body.openTime ? new Date(body.openTime) : new Date();
    const stopLoss = body.stopLoss != null ? num(body.stopLoss) : undefined;
    const takeProfit = body.takeProfit != null ? num(body.takeProfit) : undefined;
    const contractSize = getContractSize(symbol);
    const leverage = 100;
    const margin = (entryPrice * lots * contractSize) / leverage;

    // Upsert by ticket — avoid duplicates if EA fires twice
    await TradeEntryModel.findOneAndUpdate(
      { userId, ticket },
      {
        $setOnInsert: {
          userId,
          ticket,
          symbol,
          direction,
          lots,
          entryPrice,
          entryTime,
          stopLoss,
          takeProfit,
          profit: 0,
          swap: num(body.swap),
          commission: num(body.commission),
          leverage,
          margin,
          status: "open",
          source: "mt5",
          profileId: user.activeProfileId || undefined,
          timeframe: "",
          journaled: false,
          executionChecklist: [
            { item: "Checked higher timeframe", checked: false },
            { item: "Risk within limits", checked: false },
            { item: "Fits my trading plan", checked: false },
            { item: "Key levels identified", checked: false },
            { item: "Economic calendar checked", checked: false },
          ],
          screenshots: [],
          preTradeAnalysis: "",
          postTradeReview: "",
          riskRatio: 1,
          rewardRatio: 2,
          emotions: "",
          lessonsLearned: "",
          tags: [],
          rating: 5,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, action: "trade_open", ticket });
  }

  // ── Trade close ─────────────────────────────────────────────────────────────
  if (action === "trade_close") {
    const ticket = String(body.ticket ?? "");
    const symbol = String(body.symbol ?? "").toUpperCase();
    const direction = body.type === "buy" || body.type === "sell" ? body.type : "buy";
    const lots = num(body.lots);
    const entryPrice = num(body.openPrice);
    const exitPrice = num(body.closePrice);
    const entryTime = body.openTime ? new Date(body.openTime) : new Date();
    const exitTime = body.closeTime ? new Date(body.closeTime) : new Date();
    const contractSize = getContractSize(symbol);
    const leverage = 100;
    const margin = (entryPrice * lots * contractSize) / leverage;

    // Prefer the EA-computed profit; re-compute as fallback
    let profit = num(body.profit);
    if (profit === 0 && exitPrice && entryPrice) {
      profit =
        direction === "buy"
          ? (exitPrice - entryPrice) * lots * contractSize
          : (entryPrice - exitPrice) * lots * contractSize;
    }

    // Try to close an existing open trade first; fall back to upsert
    const updated = await TradeEntryModel.findOneAndUpdate(
      { userId, ticket },
      {
        $set: {
          exitPrice,
          exitTime,
          profit,
          swap: num(body.swap),
          commission: num(body.commission),
          status: "closed",
          profileId: user.activeProfileId || undefined,
          updatedAt: new Date(),
        },
      }
    );

    if (!updated) {
      // EA sent close without a prior open event — create the complete record
      await TradeEntryModel.create({
        userId,
        ticket,
        symbol,
        direction,
        lots,
        entryPrice,
        exitPrice,
        entryTime,
        exitTime,
        profit,
        swap: num(body.swap),
        commission: num(body.commission),
        leverage,
        margin,
        status: "closed",
        source: "mt5",
        profileId: user.activeProfileId || undefined,
        timeframe: "",
        journaled: false,
        executionChecklist: [
          { item: "Checked higher timeframe", checked: false },
          { item: "Risk within limits", checked: false },
          { item: "Fits my trading plan", checked: false },
          { item: "Key levels identified", checked: false },
          { item: "Economic calendar checked", checked: false },
        ],
        screenshots: [],
        tags: [],
        rating: 5,
      });
    }

    return NextResponse.json({ ok: true, action: "trade_close", ticket });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

