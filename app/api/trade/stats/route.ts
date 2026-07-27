import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import { buildStatsPipeline, buildDayTradesPipeline, normalizeStats } from "@/lib/trades/stats-pipeline";
import { getStartOfISTWeek } from "@/lib/utils/ist-time";

export const dynamic = "force-dynamic";

// GET /api/trade/stats — pre-rolled dashboard numbers.
//
// Replaces the dashboard's old GET /api/trade (no `page`) call, which shipped
// every document — 3.62 MB / 3,950 docs, ~3.7s — purely so the browser could
// reduce them into a few dozen scalars. This returns ~70 KB in ~0.4s instead.
// All the rollup math lives in lib/trades/stats-pipeline.ts.
//
// With `?day=YYYY-MM-DD`: returns just that IST day's compiled trade rows, for
// the calendar's click-to-open day popover. Bundling those rows into the main
// response cost 451 KB of a 523 KB payload to serve a panel that shows one day
// at a time, so they load on demand.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const profileId = searchParams.get("profileId");
  const day = searchParams.get("day");

  // Admin "view as" support — mirrors GET /api/trade: only honored for admins,
  // silently ignored for everyone else so they only ever see their own data.
  const viewUserId = searchParams.get("viewUserId");
  const effectiveUserId =
    viewUserId && session.user.role === "admin" ? viewUserId : session.user.id;

  await dbConnect();

  if (day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return NextResponse.json({ error: "Invalid day" }, { status: 400 });
    }
    const trades = await TradeEntryModel.aggregate(
      buildDayTradesPipeline(effectiveUserId, profileId, day)
    );
    return NextResponse.json({ trades });
  }

  // Week boundary is resolved here, not in Mongo: getStartOfISTWeek works in
  // the same "IST digits stored as UTC" space the pipeline's istEntry uses, so
  // the this-week weekday table matches what the client used to compute.
  const weekStartMs = getStartOfISTWeek(new Date()).getTime();

  const [raw] = await TradeEntryModel.aggregate(
    buildStatsPipeline(effectiveUserId, profileId, weekStartMs)
  );

  return NextResponse.json(normalizeStats(raw));
}
