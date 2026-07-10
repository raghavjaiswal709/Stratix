import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { getContractSize } from "@/lib/contract-sizes";

export const dynamic = 'force-dynamic';

const SORT_FIELDS: Record<string, string> = {
  date: "entryTime",
  pnl: "profit",
  symbol: "symbol",
  lots: "lots",
};

// GET /api/trade — list trades for current user.
// Without a `page` param: returns the full array (unchanged legacy shape),
// used by pages that need the complete history for aggregates (Dashboard
// stats, Journal analytics). With `page`: does the filtering/sorting/paging
// in Mongo and returns { trades, total, page, pageSize, totalPages } — used
// by the Trades table so a growing trade history never ships more than one
// page's worth of documents over the wire.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  const pageParam = searchParams.get("page");

  await dbConnect();
  const filter: Record<string, unknown> = { userId: session.user.id };
  if (profileId && profileId !== "all") {
    filter.profileId = profileId;
  }

  // Optional filters — supported on both the legacy full-array path (used
  // by the merge-candidate lookup, which wants "every trade for this symbol"
  // without paging) and the paginated path below.
  const symbol = searchParams.get("symbol");
  if (symbol) filter.symbol = { $regex: symbol, $options: "i" };
  const direction = searchParams.get("direction");
  if (direction && direction !== "all") filter.direction = direction;
  const status = searchParams.get("status");
  if (status && status !== "all") filter.status = status;
  const source = searchParams.get("source");
  if (source && source !== "all") filter.source = source;

  if (pageParam === null) {
    // Pull the whole result set in a single cursor round trip. The default
    // batch size (101) forces a `getMore` per batch, which on a high-latency
    // Atlas link turned a 0.66 MB / 728-doc query into a ~20s wall-clock fetch.
    // A large batchSize collapses that to one round trip (~0.5s).
    // `screenshots` (base64 data URIs, often 100-250KB EACH) is excluded —
    // it single-handedly turned this "small" list query into an 11MB+
    // response. Nothing on this path (Dashboard stats, Journal list/
    // analytics, merge candidates) renders screenshots; JournalDetail fetches
    // them itself, scoped to the one trade actually being viewed.
    const trades = await TradeEntryModel.find(filter)
      .select("-screenshots")
      .sort({ entryTime: -1 })
      .batchSize(1000)
      .lean();

    return NextResponse.json(trades);
  }

  // Top-level trades only — merged children (parentTradeId set) are folded
  // into their parent client-side and never occupy a row of their own.
  filter.parentTradeId = { $exists: false };

  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const sortBy = SORT_FIELDS[searchParams.get("sortBy") ?? "date"] ?? "entryTime";
  const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;

  const [pageTrades, total] = await Promise.all([
    TradeEntryModel.find(filter)
      .select("-screenshots")
      .sort({ [sortBy]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    TradeEntryModel.countDocuments(filter),
  ]);

  // Merged parents on this page need their child trades too (for the
  // aggregated lots/profit/entry-exit rollup) — a second, tiny query scoped
  // to just this page's parent ids, not the whole history.
  const parentIds = pageTrades
    .filter((t) => Array.isArray(t.mergedTradeIds) && t.mergedTradeIds.length > 0)
    .map((t) => t._id);
  const children = parentIds.length
    ? await TradeEntryModel.find({ userId: session.user.id, parentTradeId: { $in: parentIds } })
        .select("-screenshots")
        .lean()
    : [];

  return NextResponse.json({
    trades: [...pageTrades, ...children],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
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
    profileId,
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
    profileId: profileId ?? undefined,
  });

  return NextResponse.json(trade, { status: 201 });
}

// DELETE /api/trade — bulk delete every trade matching the given filters for
// the current user. Used by "Clear All" — the trades table only ever holds
// one page's worth of rows client-side, so deleting item-by-item from local
// state would silently leave the rest of the history behind. Mirrors the
// same filter params as GET so it deletes exactly what's currently shown.
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");

  await dbConnect();
  const filter: Record<string, unknown> = { userId: session.user.id };
  if (profileId && profileId !== "all") {
    filter.profileId = profileId;
  }

  const symbol = searchParams.get("symbol");
  if (symbol) filter.symbol = { $regex: symbol, $options: "i" };
  const direction = searchParams.get("direction");
  if (direction && direction !== "all") filter.direction = direction;
  const status = searchParams.get("status");
  if (status && status !== "all") filter.status = status;
  const source = searchParams.get("source");
  if (source && source !== "all") filter.source = source;

  const result = await TradeEntryModel.deleteMany(filter);
  return NextResponse.json({ success: true, deletedCount: result.deletedCount });
}
