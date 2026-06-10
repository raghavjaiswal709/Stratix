import dbConnect from "@/lib/mongodb";
import { TradeEntryModel } from "@/lib/models/TradeEntry";
import {
  TradeMetricsModel,
  ALL_PROFILES,
  type MetricsSignature,
} from "@/lib/models/TradeMetrics";
import {
  computeTradeMetrics,
  emptyTradeMetrics,
  type MetricsTrade,
  type TradeMetrics,
} from "@/lib/trade-metrics";

// Only the fields needed to compute every metric, chart point, and open
// position — deliberately excludes the heavy fields (screenshots, analysis
// text, checklists, tags) that bloated the old full-trade dashboard query.
const METRIC_FIELDS = {
  _id: 1,
  symbol: 1,
  direction: 1,
  lots: 1,
  entryPrice: 1,
  stopLoss: 1,
  takeProfit: 1,
  profit: 1,
  swap: 1,
  commission: 1,
  status: 1,
  entryTime: 1,
  exitTime: 1,
  profileId: 1,
  updatedAt: 1,
} as const;

type LoadedTrade = MetricsTrade & {
  profileId?: string | null;
  updatedAt?: Date | null;
};

/** Resolve a raw query param to a canonical profile scope. */
export function resolveScope(rawProfileId: string | null | undefined): string {
  return !rawProfileId || rawProfileId === "all" ? ALL_PROFILES : rawProfileId;
}

function signatureOf(trades: LoadedTrade[]): MetricsSignature {
  let last = 0;
  for (const t of trades) {
    const u = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
    if (u > last) last = u;
  }
  return { count: trades.length, lastUpdated: last ? new Date(last) : null };
}

function sameSignature(a: MetricsSignature | undefined, b: MetricsSignature): boolean {
  if (!a) return false;
  const ta = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
  const tb = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
  return a.count === b.count && ta === tb;
}

/**
 * Recompute and persist metrics for every scope of a user — the aggregate
 * (ALL_PROFILES) plus one document per profile that currently has trades.
 * Loads the user's trades exactly once. Call after any mutation to keep the
 * persisted read model in sync.
 */
export async function recomputeMetricsForUser(userId: string): Promise<void> {
  await dbConnect();

  const trades = (await TradeEntryModel.find({ userId }, METRIC_FIELDS)
    .batchSize(1000)
    .lean()) as unknown as LoadedTrade[];

  // Group into the aggregate + per-profile buckets.
  const groups = new Map<string, LoadedTrade[]>();
  groups.set(ALL_PROFILES, trades);
  for (const t of trades) {
    const pid = t.profileId;
    if (pid) {
      const bucket = groups.get(pid);
      if (bucket) bucket.push(t);
      else groups.set(pid, [t]);
    }
  }

  const now = new Date();
  const ops = Array.from(groups.entries()).map(([profileId, group]) => ({
    updateOne: {
      filter: { userId, profileId },
      update: {
        $set: {
          userId,
          profileId,
          metrics: computeTradeMetrics(group),
          signature: signatureOf(group),
          computedAt: now,
        },
      },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await TradeMetricsModel.bulkWrite(ops, { ordered: false });
  }

  // Drop metric docs for profiles that no longer have any trades so a deleted
  // or emptied profile can't keep serving stale numbers. ALL_PROFILES is always
  // present in `groups`, so the aggregate is never removed.
  await TradeMetricsModel.deleteMany({
    userId,
    profileId: { $nin: Array.from(groups.keys()) },
  });
}

/**
 * Read the precomputed metrics for a (user, scope). Fetched from the DB — never
 * recomputed on a normal load. A cheap count + max(updatedAt) probe detects when
 * the underlying trades changed out of band (e.g. the MT5 sync job) and triggers
 * a one-time recompute so the served numbers are always correct.
 */
export async function getMetricsForUser(
  userId: string,
  rawProfileId: string | null
): Promise<TradeMetrics> {
  await dbConnect();
  const profileId = resolveScope(rawProfileId);

  const scopeFilter: Record<string, unknown> = { userId };
  if (profileId !== ALL_PROFILES) scopeFilter.profileId = profileId;

  const [aggResult, existing] = await Promise.all([
    TradeEntryModel.aggregate<{ count: number; lastUpdated: Date | null }>([
      { $match: scopeFilter },
      { $group: { _id: null, count: { $sum: 1 }, lastUpdated: { $max: "$updatedAt" } } },
    ]),
    TradeMetricsModel.findOne({ userId, profileId }).lean() as Promise<
      { metrics: TradeMetrics; signature?: MetricsSignature } | null
    >,
  ]);

  const current: MetricsSignature = {
    count: aggResult[0]?.count ?? 0,
    lastUpdated: aggResult[0]?.lastUpdated ? new Date(aggResult[0].lastUpdated) : null,
  };

  if (existing && sameSignature(existing.signature, current)) {
    return existing.metrics;
  }

  // Stale or missing → recompute every scope once, then re-read this one.
  await recomputeMetricsForUser(userId);
  const fresh = (await TradeMetricsModel.findOne({ userId, profileId }).lean()) as
    | { metrics: TradeMetrics }
    | null;

  return fresh?.metrics ?? emptyTradeMetrics();
}
