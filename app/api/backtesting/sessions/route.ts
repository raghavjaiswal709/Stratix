import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { BacktestSessionModel } from "@/lib/models/BacktestSession";

// ─── GET: Fetch All Sessions for Authenticated User ──────────────────────────
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const sessions = await BacktestSessionModel.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .lean();

    // Map DB sessions to match UI expectations (mapping _id to string id)
    const formatted = sessions.map((s: any) => ({
      ...s,
      id: String(s._id),
      _id: undefined,
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("[backtesting/sessions] GET error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

// ─── POST: Create a New Backtest Session ─────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, strategy, symbol, startDate, endDate, startingBalance, leverage } = body;

    if (!name || !symbol || !startDate || !endDate || !startingBalance || !leverage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await dbConnect();
    const newDbSession = new BacktestSessionModel({
      userId: session.user.id,
      name,
      description: description || "",
      strategy: strategy || "",
      symbol,
      startDate,
      endDate,
      startingBalance: Number(startingBalance),
      leverage,
      trades: [],
      drawings: [],
    });

    await newDbSession.save();

    const formatted = {
      ...newDbSession.toObject(),
      id: String(newDbSession._id),
      _id: undefined,
    };

    return NextResponse.json(formatted, { status: 201 });
  } catch (error: any) {
    console.error("[backtesting/sessions] POST error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

// ─── PUT: Update drawings, trades, or details for a session ──────────────────
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    const body = await req.json();
    await dbConnect();

    // Build $set payload — only include fields that were sent
    const $set: Record<string, any> = {};
    if (body.name !== undefined)           $set.name            = body.name;
    if (body.description !== undefined)    $set.description     = body.description;
    if (body.strategy !== undefined)       $set.strategy        = body.strategy;
    if (body.trades !== undefined)         $set.trades          = body.trades;
    if (body.drawings !== undefined)       $set.drawings        = body.drawings;
    if (body.startingBalance !== undefined)$set.startingBalance = Number(body.startingBalance);
    // lastCandleTime is a newer field — use strict:false so it persists even if
    // the Mongoose model was cached before this field was added to the schema.
    if (body.lastCandleTime !== undefined) $set.lastCandleTime  = body.lastCandleTime;

    if (Object.keys($set).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Use findOneAndUpdate so Mongoose strict mode does NOT silently drop new fields
    const updated = await BacktestSessionModel.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set },
      { new: true, strict: false } as any,
    ) as any;

    if (!updated) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const formatted = {
      ...(updated.toObject ? updated.toObject() : updated),
      id: String(updated._id),
      _id: undefined,
    };

    return NextResponse.json(formatted);
  } catch (error: any) {
    console.error("[backtesting/sessions] PUT error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}

// ─── DELETE: Remove a Backtest Session ────────────────────────────────────────
export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    await dbConnect();

    // Delete session (must belong to authenticated user)
    const result = await BacktestSessionModel.deleteOne({ _id: id, userId: session.user.id });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[backtesting/sessions] DELETE error:", error);
    return NextResponse.json({ error: error.message || "Server Error" }, { status: 500 });
  }
}
