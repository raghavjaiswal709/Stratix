import mongoose, { Schema, Document } from "mongoose";
import type { TradeMetrics } from "@/lib/trade-metrics";

/** Sentinel profileId for the cross-profile aggregate (everything for a user). */
export const ALL_PROFILES = "__all__";

/**
 * Cheap fingerprint of the trade set a metrics doc was computed from.
 * Lets the read path detect out-of-band changes (e.g. the GitHub Actions MT5
 * sync writes directly to `tradeentries`) and recompute only when the data
 * actually changed — never on every dashboard load.
 */
export interface MetricsSignature {
  count: number;
  lastUpdated: Date | null;
}

export interface ITradeMetrics extends Document {
  userId: string;
  profileId: string; // ALL_PROFILES for the aggregate, else a TradingProfile id
  metrics: TradeMetrics;
  signature: MetricsSignature;
  computedAt: Date;
}

const TradeMetricsSchema = new Schema<ITradeMetrics>(
  {
    userId: { type: String, required: true, index: true },
    profileId: { type: String, required: true, default: ALL_PROFILES },
    // Stored as Mixed: this is a precomputed read model, not something we query into.
    metrics: { type: Schema.Types.Mixed, required: true },
    signature: {
      count: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: null },
    },
    computedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

// One metrics document per (user, profile-scope).
TradeMetricsSchema.index({ userId: 1, profileId: 1 }, { unique: true });

export const TradeMetricsModel =
  mongoose.models.TradeMetrics ||
  mongoose.model<ITradeMetrics>("TradeMetrics", TradeMetricsSchema);
