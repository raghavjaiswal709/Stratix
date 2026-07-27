import type { PipelineStage } from "mongoose";
import { BROKER_UTC_OFFSET_MIN, IST_OFFSET_MIN } from "@/lib/utils/ist-time";

// ─── Dashboard stats aggregation ────────────────────────────────────────────
//
// Replaces the dashboard's old "fetch every document and roll it up in the
// browser" path. GET /api/trade with no `page` shipped 3.62 MB / 3,950 docs
// (~3.7s); this pipeline returns ~0.2 MB of pre-rolled numbers instead.
//
// Everything here mirrors math that used to live in the components' useMemo
// blocks, so the rendered numbers must not change. Three things it has to
// reproduce exactly:
//
//  1. compileTrades() — merged ("compiled") positions count as ONE trade.
//     See lib/trades/compile.ts. Done by the $group on parentTradeId ?? _id.
//  2. Per-source IST bucketing — see lib/utils/ist-time.ts. mt5 timestamps are
//     broker civil time (UTC+3) mislabeled as UTC; manual ones already read as
//     IST digits. So the shift to true IST is +150min for mt5, 0 otherwise.
//  3. The rounding compileTrades applies ONLY when a position actually has
//     children (2dp on money/lots, 5dp on prices) — singletons pass through
//     unrounded, so `$cond` on the group size rather than rounding everything.
//
// Order-dependent metrics (win/loss streaks) can't be expressed as a $group,
// so the pipeline ships a compact sign string instead — see `closedSigns`.

/** Shift (ms) from a stored timestamp to true IST civil time, per source. */
const IST_SHIFT_MS: PipelineStage.AddFields["$addFields"][string] = {
  $cond: [{ $eq: ["$source", "mt5"] }, (IST_OFFSET_MIN - BROKER_UTC_OFFSET_MIN) * 60_000, 0],
};

/** Shift (ms) from a stored timestamp to the genuine real-world UTC instant. */
const TRUE_UTC_SHIFT_MS: PipelineStage.AddFields["$addFields"][string] = {
  $cond: [{ $eq: ["$source", "mt5"] }, -BROKER_UTC_OFFSET_MIN * 60_000, -IST_OFFSET_MIN * 60_000],
};

const NET = { $add: ["$profit", { $ifNull: ["$swap", 0] }, { $ifNull: ["$commission", 0] }] };
const IS_WIN = { $gt: [NET, 0] };

/** {net, count, wins} accumulator group used by every categorical breakdown. */
const bucketAccumulators = {
  net: { $sum: "$net" },
  count: { $sum: 1 },
  wins: { $sum: { $cond: ["$isWin", 1, 0] } },
};

/** A categorical rollup row. `Id` is the group key — a symbol/session name, or
 *  a Mon-first weekday index for the weekday tables. */
export interface StatsBucket<Id = string> {
  _id: Id;
  net: number;
  count: number;
  wins: number;
}

/** One row in the calendar's click-to-open day popover. Fetched per day via
 *  buildDayTradesPipeline, NOT bundled into the stats response: embedding every
 *  trade row made byEntryDay 451 KB of a 523 KB payload (86%) to serve a panel
 *  that shows one day at a time. There are only ~85 distinct trading days, so
 *  the day cells themselves cost ~3 KB. */
export interface CalendarTrade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  net: number;
  journaled: boolean;
}

/** Open/closed split — one row per status. */
export interface StatusTotals {
  _id: "open" | "closed";
  count: number;
  net: number;
  wins: number;
  losses: number;
}

/**
 * The normalized stats payload the dashboard consumes. `$facet` hands back
 * every sub-pipeline as an array, so the single-row ones are unwrapped into
 * scalars by normalizeStats() before this crosses the wire.
 */
export interface DashboardStats {
  /** StatsCards + the page-level stats memo. */
  totals: StatusTotals[];
  /** All trades bucketed by IST calendar day of ENTRY — drives both
   *  PerformanceChart's cumulative series and MonthlyCalendar's grid. */
  byEntryDay: { _id: string; pnl: number; count: number }[];
  /** Closed trades by IST day of exit-or-entry — best/worst day + consistency. */
  closedByDay: { _id: string; pnl: number }[];
  /** Closed trades by IST month of exit-or-entry — Monthly P&L rollup. */
  byMonth: StatsBucket[];
  bySymbol: StatsBucket[];
  byDirection: StatsBucket[];
  bySession: StatsBucket[];
  byDurationBucket: StatsBucket[];
  /** Weekday tables, Mon-first index 0-6, computed for both scopes. */
  weekdayAllTime: StatsBucket<number>[];
  weekdayThisWeek: StatsBucket<number>[];
  /** TradingInsights scalars. */
  insights: {
    grossProfit: number;
    totalCommission: number;
    totalSwap: number;
    totalVolume: number;
    grossWin: number;
    /** Sum of losing nets — negative, as accumulated. Callers take Math.abs. */
    grossLossRaw: number;
    winCount: number;
    lossCount: number;
    closedCount: number;
    largestWin: number | null;
    largestLoss: number | null;
    avgDuration: number;
  };
  /** AdvancedInsights scalars. */
  advanced: {
    maxDrawdown: number;
    rrSum: number;
    rrCount: number;
    slSetCount: number;
    tpSetCount: number;
    journaledCount: number;
    totalCount: number;
    ratingSum: number;
    ratingCount: number;
  };
  openPositions: {
    _id: string;
    symbol: string;
    direction: "buy" | "sell";
    lots: number;
    entryPrice: number;
    profit: number;
  }[];
  /** Closed trades' net sign in chronological order, one char each:
   *  "+" win, "-" loss, "0" break-even. Streaks are inherently sequential and
   *  can't be a $group; 3,950 trades is ~4 KB as a string, so the client keeps
   *  the exact original loop instead of an approximation. */
  closedSigns: string;
}

/** Empty-history fallback, so an account with no trades still renders zeros. */
const EMPTY_INSIGHTS: DashboardStats["insights"] = {
  grossProfit: 0, totalCommission: 0, totalSwap: 0, totalVolume: 0, grossWin: 0,
  grossLossRaw: 0, winCount: 0, lossCount: 0, closedCount: 0,
  largestWin: null, largestLoss: null, avgDuration: 0,
};
const EMPTY_ADVANCED: DashboardStats["advanced"] = {
  maxDrawdown: 0, rrSum: 0, rrCount: 0, slSetCount: 0, tpSetCount: 0,
  journaledCount: 0, totalCount: 0, ratingSum: 0, ratingCount: 0,
};

/**
 * Flatten raw `$facet` output into DashboardStats: unwrap the single-row
 * sub-pipelines, fold drawdown into `advanced`, turn the pushed sign array
 * into a plain string, and collapse durationSum/durationCount into avgDuration.
 */
export function normalizeStats(raw: Record<string, unknown[]> | undefined): DashboardStats {
  const arr = <T,>(key: string): T[] => (raw?.[key] as T[]) ?? [];
  const one = <T,>(key: string): T | undefined => (raw?.[key] as T[])?.[0];

  const rawInsights = one<Record<string, number>>("insights");
  const rawAdvanced = one<Record<string, number>>("advanced");

  const insights: DashboardStats["insights"] = rawInsights
    ? {
        grossProfit: rawInsights.grossProfit,
        totalCommission: rawInsights.totalCommission,
        totalSwap: rawInsights.totalSwap,
        totalVolume: rawInsights.totalVolume,
        grossWin: rawInsights.grossWin,
        grossLossRaw: rawInsights.grossLossRaw,
        winCount: rawInsights.winCount,
        lossCount: rawInsights.lossCount,
        closedCount: rawInsights.closedCount,
        largestWin: rawInsights.largestWin ?? null,
        largestLoss: rawInsights.largestLoss ?? null,
        avgDuration: rawInsights.durationCount ? rawInsights.durationSum / rawInsights.durationCount : 0,
      }
    : EMPTY_INSIGHTS;

  const advanced: DashboardStats["advanced"] = rawAdvanced
    ? {
        maxDrawdown: one<{ maxDrawdown: number }>("drawdown")?.maxDrawdown ?? 0,
        rrSum: rawAdvanced.rrSum,
        rrCount: rawAdvanced.rrCount,
        slSetCount: rawAdvanced.slSetCount,
        tpSetCount: rawAdvanced.tpSetCount,
        journaledCount: rawAdvanced.journaledCount,
        totalCount: rawAdvanced.totalCount,
        ratingSum: rawAdvanced.ratingSum,
        ratingCount: rawAdvanced.ratingCount,
      }
    : EMPTY_ADVANCED;

  return {
    totals: arr<StatusTotals>("totals"),
    byEntryDay: arr("byEntryDay"),
    closedByDay: arr("closedByDay"),
    byMonth: arr("byMonth"),
    bySymbol: arr("bySymbol"),
    byDirection: arr("byDirection"),
    bySession: arr("bySession"),
    byDurationBucket: arr("byDurationBucket"),
    weekdayAllTime: arr("weekdayAllTime"),
    weekdayThisWeek: arr("weekdayThisWeek"),
    insights,
    advanced,
    openPositions: arr("openPositions"),
    closedSigns: one<{ s: string }>("closedSigns")?.s ?? "",
  };
}

/**
 * Stages shared by every consumer: scope to the user, collapse merged
 * positions into one doc each, then derive the fields the rollups group on.
 * Kept in one place so the per-day calendar query buckets trades by exactly
 * the same IST day key the stats rollup does.
 */
function buildCompiledPrefix(userId: string, profileId: string | null): PipelineStage[] {
  const match: Record<string, unknown> = { userId };
  if (profileId && profileId !== "all") match.profileId = profileId;

  // A doc is a merge PARENT (or a plain unmerged trade) when it has no
  // parentTradeId. Its scalar fields win for the whole compiled position.
  const isParent = { $not: [{ $ifNull: ["$parentTradeId", false] }] };
  const fromParent = (field: string) => ({ $max: { $cond: [isParent, `$${field}`, null] } });

  return [
    { $match: match },

    // ── 1. Collapse merged positions into one doc (compileTrades in Mongo) ──
    {
      $group: {
        _id: { $ifNull: ["$parentTradeId", "$_id"] },
        n: { $sum: 1 },
        lots: { $sum: "$lots" },
        profit: { $sum: "$profit" },
        swap: { $sum: { $ifNull: ["$swap", 0] } },
        commission: { $sum: { $ifNull: ["$commission", 0] } },
        weightedEntrySum: { $sum: { $multiply: ["$entryPrice", "$lots"] } },
        weightedExitSum: {
          $sum: { $cond: [{ $gt: [{ $ifNull: ["$exitPrice", null] }, null] }, { $multiply: ["$exitPrice", "$lots"] }, 0] },
        },
        exitLots: {
          $sum: { $cond: [{ $gt: [{ $ifNull: ["$exitPrice", null] }, null] }, "$lots", 0] },
        },
        entryTime: { $min: "$entryTime" },
        exitTime: { $max: "$exitTime" },
        // Parent-owned scalars.
        symbol: fromParent("symbol"),
        direction: fromParent("direction"),
        status: fromParent("status"),
        source: fromParent("source"),
        journaled: fromParent("journaled"),
        rating: fromParent("rating"),
        stopLoss: fromParent("stopLoss"),
        takeProfit: fromParent("takeProfit"),
        riskRatio: fromParent("riskRatio"),
        rewardRatio: fromParent("rewardRatio"),
        parentEntryPrice: fromParent("entryPrice"),
        parentExitPrice: fromParent("exitPrice"),
      },
    },

    // compileTrades only rounds when children exist; singletons pass through.
    {
      $addFields: {
        merged: { $gt: ["$n", 1] },
      },
    },
    {
      $addFields: {
        lots: { $cond: ["$merged", { $round: ["$lots", 2] }, "$lots"] },
        profit: { $cond: ["$merged", { $round: ["$profit", 2] }, "$profit"] },
        swap: { $cond: ["$merged", { $round: ["$swap", 2] }, "$swap"] },
        commission: { $cond: ["$merged", { $round: ["$commission", 2] }, "$commission"] },
        entryPrice: {
          $cond: ["$merged", { $round: [{ $divide: ["$weightedEntrySum", "$lots"] }, 5] }, "$parentEntryPrice"],
        },
        exitPrice: {
          $cond: [
            "$merged",
            {
              $cond: [
                { $gt: ["$exitLots", 0] },
                { $round: [{ $divide: ["$weightedExitSum", "$exitLots"] }, 5] },
                "$parentExitPrice",
              ],
            },
            "$parentExitPrice",
          ],
        },
      },
    },

    // ── 2. Derived per-trade fields the rollups group on ────────────────────
    {
      $addFields: {
        net: NET,
        isWin: IS_WIN,
        isClosed: { $eq: ["$status", "closed"] },
        // Bucketing timestamp: components key day/month off exitTime||entryTime,
        // except the calendar/chart which always key off entryTime.
        bucketTime: { $ifNull: ["$exitTime", "$entryTime"] },
        istShift: IST_SHIFT_MS,
        trueUtcShift: TRUE_UTC_SHIFT_MS,
      },
    },
    {
      $addFields: {
        istEntry: { $add: ["$entryTime", "$istShift"] },
        istBucket: { $add: ["$bucketTime", "$istShift"] },
        trueUtcEntry: { $add: ["$entryTime", "$trueUtcShift"] },
        durationMs: {
          $cond: [
            { $gt: [{ $ifNull: ["$exitTime", null] }, null] },
            { $subtract: ["$exitTime", "$entryTime"] },
            null,
          ],
        },
      },
    },
    {
      $addFields: {
        entryDayKey: { $dateToString: { format: "%Y-%m-%d", date: "$istEntry", timezone: "UTC" } },
        bucketDayKey: { $dateToString: { format: "%Y-%m-%d", date: "$istBucket", timezone: "UTC" } },
        bucketMonthKey: { $dateToString: { format: "%Y-%m", date: "$istBucket", timezone: "UTC" } },
        // $dayOfWeek is 1=Sun..7=Sat; JS getUTCDay() is 0=Sun..6=Sat, and the
        // component remaps that to Mon-first with (jsDay + 6) % 7.
        weekdayMonFirst: {
          $mod: [{ $add: [{ $subtract: [{ $dayOfWeek: { date: "$istEntry", timezone: "UTC" } }, 1] }, 6] }, 7],
        },
        utcHour: { $hour: { date: "$trueUtcEntry", timezone: "UTC" } },
      },
    },
    {
      $addFields: {
        session: {
          $switch: {
            branches: [
              { case: { $lt: ["$utcHour", 8] }, then: "Asian" },
              { case: { $lt: ["$utcHour", 13] }, then: "London" },
              { case: { $lt: ["$utcHour", 17] }, then: "London/NY" },
              { case: { $lt: ["$utcHour", 22] }, then: "New York" },
            ],
            default: "Late",
          },
        },
        durationBucket: {
          $switch: {
            branches: [
              { case: { $eq: [{ $ifNull: ["$durationMs", null] }, null] }, then: null },
              { case: { $lte: ["$durationMs", 0] }, then: null },
              { case: { $lt: [{ $divide: ["$durationMs", 60000] }, 15] }, then: "Scalp" },
              { case: { $lt: [{ $divide: ["$durationMs", 60000] }, 1440] }, then: "Intraday" },
            ],
            default: "Swing",
          },
        },
      },
    },
  ];
}

/**
 * Build the dashboard-stats pipeline.
 *
 * `weekStartMs` is the start of the current IST week in the same "IST digits
 * stored as UTC" numeric space getStartOfISTWeek() returns, so the this-week
 * weekday table matches what the client used to compute.
 */
export function buildStatsPipeline(
  userId: string,
  profileId: string | null,
  weekStartMs: number,
): PipelineStage[] {
  return [
    ...buildCompiledPrefix(userId, profileId),

    // ── 3. Every rollup, in one round trip ──────────────────────────────────
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              net: { $sum: "$net" },
              wins: { $sum: { $cond: ["$isWin", 1, 0] } },
              losses: { $sum: { $cond: [{ $lt: ["$net", 0] }, 1, 0] } },
            },
          },
        ],

        byEntryDay: [
          { $group: { _id: "$entryDayKey", pnl: { $sum: "$net" }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],

        closedByDay: [
          { $match: { isClosed: true } },
          { $group: { _id: "$bucketDayKey", pnl: { $sum: "$net" } } },
          { $sort: { _id: 1 } },
        ],

        byMonth: [
          { $match: { isClosed: true } },
          { $group: { _id: "$bucketMonthKey", ...bucketAccumulators } },
          { $sort: { _id: 1 } },
        ],

        bySymbol: [
          { $match: { isClosed: true } },
          { $group: { _id: "$symbol", ...bucketAccumulators } },
          { $sort: { net: -1 } },
        ],

        byDirection: [
          { $match: { isClosed: true } },
          { $group: { _id: "$direction", ...bucketAccumulators } },
        ],

        bySession: [
          { $match: { isClosed: true } },
          { $group: { _id: "$session", ...bucketAccumulators } },
        ],

        byDurationBucket: [
          { $match: { isClosed: true, durationBucket: { $ne: null } } },
          { $group: { _id: "$durationBucket", ...bucketAccumulators } },
        ],

        weekdayAllTime: [
          { $match: { isClosed: true } },
          { $group: { _id: "$weekdayMonFirst", ...bucketAccumulators } },
        ],

        weekdayThisWeek: [
          { $match: { isClosed: true, istEntry: { $gte: new Date(weekStartMs) } } },
          { $group: { _id: "$weekdayMonFirst", ...bucketAccumulators } },
        ],

        insights: [
          {
            $group: {
              _id: null,
              // Cost breakdown spans ALL trades, not just closed.
              grossProfit: { $sum: "$profit" },
              totalCommission: { $sum: "$commission" },
              totalSwap: { $sum: "$swap" },
              totalVolume: { $sum: { $ifNull: ["$lots", 0] } },
              grossWin: { $sum: { $cond: [{ $and: ["$isClosed", "$isWin"] }, "$net", 0] } },
              grossLossRaw: { $sum: { $cond: [{ $and: ["$isClosed", { $lt: ["$net", 0] }] }, "$net", 0] } },
              winCount: { $sum: { $cond: [{ $and: ["$isClosed", "$isWin"] }, 1, 0] } },
              lossCount: { $sum: { $cond: [{ $and: ["$isClosed", { $lt: ["$net", 0] }] }, 1, 0] } },
              closedCount: { $sum: { $cond: ["$isClosed", 1, 0] } },
              largestWin: { $max: { $cond: [{ $and: ["$isClosed", "$isWin"] }, "$net", null] } },
              largestLoss: { $min: { $cond: [{ $and: ["$isClosed", { $lt: ["$net", 0] }] }, "$net", null] } },
              durationSum: {
                $sum: { $cond: [{ $and: ["$isClosed", { $gt: [{ $ifNull: ["$durationMs", 0] }, 0] }] }, "$durationMs", 0] },
              },
              durationCount: {
                $sum: { $cond: [{ $and: ["$isClosed", { $gt: [{ $ifNull: ["$durationMs", 0] }, 0] }] }, 1, 0] },
              },
            },
          },
        ],

        advanced: [
          {
            $group: {
              _id: null,
              totalCount: { $sum: 1 },
              journaledCount: { $sum: { $cond: [{ $eq: ["$journaled", true] }, 1, 0] } },
              slSetCount: {
                $sum: { $cond: [{ $and: ["$isClosed", { $gt: [{ $ifNull: ["$stopLoss", 0] }, 0] }] }, 1, 0] },
              },
              tpSetCount: {
                $sum: { $cond: [{ $and: ["$isClosed", { $gt: [{ $ifNull: ["$takeProfit", 0] }, 0] }] }, 1, 0] },
              },
              // avgPlannedRR averages reward/risk over closed trades that have both.
              rrSum: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        "$isClosed",
                        { $gt: [{ $ifNull: ["$riskRatio", 0] }, 0] },
                        { $gt: [{ $ifNull: ["$rewardRatio", 0] }, 0] },
                      ],
                    },
                    { $divide: ["$rewardRatio", "$riskRatio"] },
                    0,
                  ],
                },
              },
              rrCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        "$isClosed",
                        { $gt: [{ $ifNull: ["$riskRatio", 0] }, 0] },
                        { $gt: [{ $ifNull: ["$rewardRatio", 0] }, 0] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              ratingSum: {
                $sum: { $cond: [{ $and: ["$isClosed", { $gt: [{ $ifNull: ["$rating", 0] }, 0] }] }, "$rating", 0] },
              },
              ratingCount: {
                $sum: { $cond: [{ $and: ["$isClosed", { $gt: [{ $ifNull: ["$rating", 0] }, 0] }] }, 1, 0] },
              },
            },
          },
        ],

        // Peak-to-trough of cumulative closed-trade equity, chronological.
        drawdown: [
          { $match: { isClosed: true } },
          { $sort: { bucketTime: 1 } },
          {
            $setWindowFields: {
              sortBy: { bucketTime: 1 },
              output: { equity: { $sum: "$net", window: { documents: ["unbounded", "current"] } } },
            },
          },
          {
            $setWindowFields: {
              sortBy: { bucketTime: 1 },
              output: { peak: { $max: "$equity", window: { documents: ["unbounded", "current"] } } },
            },
          },
          { $group: { _id: null, maxDrawdown: { $min: { $subtract: ["$equity", { $max: ["$peak", 0] }] } } } },
        ],

        openPositions: [
          { $match: { status: "open" } },
          {
            $project: {
              _id: 1, symbol: 1, direction: 1, lots: 1, entryPrice: 1, profit: 1,
            },
          },
        ],

        // Sign of each closed trade's net, chronological — for streak math.
        closedSigns: [
          { $match: { isClosed: true } },
          { $sort: { bucketTime: 1 } },
          {
            $group: {
              _id: null,
              s: {
                $push: {
                  $cond: [{ $gt: ["$net", 0] }, "+", { $cond: [{ $lt: ["$net", 0] }, "-", "0"] }],
                },
              },
            },
          },
          { $project: { _id: 0, s: { $reduce: { input: "$s", initialValue: "", in: { $concat: ["$$value", "$$this"] } } } } },
        ],
      },
    },
  ];
}

/**
 * Rows for the calendar's day popover — the compiled trades whose IST entry
 * day is `dayKey` ("YYYY-MM-DD"). Only fetched when a user actually clicks a
 * day cell, which is why the stats response no longer carries them.
 *
 * Note the day key can't be expressed as a plain entryTime range: the shift to
 * IST is per-trade (mt5 vs manual), so the match has to run after the same
 * derived-field stages the rollups use.
 */
export function buildDayTradesPipeline(
  userId: string,
  profileId: string | null,
  dayKey: string,
): PipelineStage[] {
  return [
    ...buildCompiledPrefix(userId, profileId),
    { $match: { entryDayKey: dayKey } },
    { $sort: { entryTime: 1 } },
    {
      $project: {
        _id: 1, symbol: 1, direction: 1, lots: 1, net: 1, journaled: 1,
      },
    },
  ];
}
