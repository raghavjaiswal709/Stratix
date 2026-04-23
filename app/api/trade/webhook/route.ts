/**
 * POST /api/trade/webhook
 *
 * Receives trade events from the MT5 Expert Advisor (EA).
 *
 * Security: Each request must carry an X-Webhook-Secret header
 * that matches the user's stored webhookSecret (stored in MT5Config).
 *
 * Payload shape (sent by StratixEA.mq5):
 * {
 *   "userId":    "...",          // required: the Stratix user ID
 *   "secret":    "...",          // required: HMAC secret
 *   "action":    "trade_open" | "trade_close" | "trade_modify" | "ping",
 *   "ticket":    12345678,       // MT5 order ticket
 *   "symbol":    "XAUUSD",
 *   "type":      "buy" | "sell",
 *   "lots":      0.1,
 *   "openPrice": 2300.50,
 *   "closePrice": 2320.00,       // only on close
 *   "openTime":  "2025-04-22T09:45:00",
 *   "closeTime": "2025-04-22T15:15:00", // only on close
 *   "profit":    100.00,
 *   "stopLoss":  2280.00,
 *   "takeProfit":2350.00,
 *   "swap":      -0.50,
 *   "commission": -1.00
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { MT5ConfigModel } from "@/lib/models/MT5Config";
import { TradeEntryModel } from "@/lib/models/TradeEntry";

interface MT5Payload {
  userId: string;
  secret: string;
  action: "trade_open" | "trade_close" | "trade_modify" | "ping";
  ticket?: number;
  symbol?: string;
  type?: "buy" | "sell";
  lots?: number;
  openPrice?: number;
  closePrice?: number;
  openTime?: string;
  closeTime?: string;
  profit?: number;
  stopLoss?: number;
  takeProfit?: number;
  swap?: number;
  commission?: number;
}

export async function POST(req: NextRequest) {
  let body: MT5Payload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, secret, action } = body;

  if (!userId || !secret || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await dbConnect();

  // Verify secret
  const config = await MT5ConfigModel.findOne({ userId });
  if (!config || config.webhookSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Handle ping (connection test from EA)
  if (action === "ping") {
    await MT5ConfigModel.updateOne(
      { userId },
      { $set: { connected: true, lastPingAt: new Date() } }
    );
    return NextResponse.json({ success: true, message: "pong" });
  }

  const ticket = String(body.ticket);

  if (action === "trade_open") {
    // Check if trade already exists (idempotent)
    const existing = await TradeEntryModel.findOne({ userId, ticket });
    if (existing) {
      return NextResponse.json({ success: true, tradeId: existing._id });
    }

    const trade = await TradeEntryModel.create({
      userId,
      ticket,
      symbol: (body.symbol ?? "").toUpperCase(),
      direction: body.type ?? "buy",
      lots: body.lots ?? 0,
      entryPrice: body.openPrice ?? 0,
      entryTime: body.openTime ? new Date(body.openTime) : new Date(),
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
      profit: 0,
      swap: body.swap ?? 0,
      commission: body.commission ?? 0,
      status: "open",
      source: "mt5",
    });

    await MT5ConfigModel.updateOne(
      { userId },
      { $set: { connected: true, lastPingAt: new Date() } }
    );

    return NextResponse.json({ success: true, tradeId: trade._id }, { status: 201 });
  }

  if (action === "trade_close") {
    const exitPrice = body.closePrice ?? 0;
    const profit = body.profit ?? 0;

    const trade = await TradeEntryModel.findOneAndUpdate(
      { userId, ticket },
      {
        $set: {
          exitPrice,
          exitTime: body.closeTime ? new Date(body.closeTime) : new Date(),
          profit,
          swap: body.swap ?? 0,
          commission: body.commission ?? 0,
          status: "closed",
        },
      },
      { new: true, upsert: false }
    );

    if (!trade) {
      // Trade not found — create it as already-closed (imported history)
      const created = await TradeEntryModel.create({
        userId,
        ticket,
        symbol: (body.symbol ?? "").toUpperCase(),
        direction: body.type ?? "buy",
        lots: body.lots ?? 0,
        entryPrice: body.openPrice ?? 0,
        exitPrice,
        entryTime: body.openTime ? new Date(body.openTime) : new Date(),
        exitTime: body.closeTime ? new Date(body.closeTime) : new Date(),
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit,
        profit,
        swap: body.swap ?? 0,
        commission: body.commission ?? 0,
        status: "closed",
        source: "mt5",
      });
      return NextResponse.json({ success: true, tradeId: created._id });
    }

    await MT5ConfigModel.updateOne(
      { userId },
      { $set: { connected: true, lastPingAt: new Date() } }
    );

    return NextResponse.json({ success: true, tradeId: trade._id });
  }

  if (action === "trade_modify") {
    await TradeEntryModel.findOneAndUpdate(
      { userId, ticket },
      {
        $set: {
          stopLoss: body.stopLoss,
          takeProfit: body.takeProfit,
          lots: body.lots,
        },
      }
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
