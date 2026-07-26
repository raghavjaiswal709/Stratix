import mongoose, { Schema, Document } from "mongoose";

export type TradeDirection = "buy" | "sell";
export type TradeStatus = "open" | "closed";
export type TradeSource = "manual" | "mt5";

export interface ChecklistItem {
  item: string;
  checked: boolean;
}

export interface ITradeEntry extends Document<string> {
  userId: string;

  // Core trade fields
  ticket?: string;       // MT5 ticket ID
  symbol: string;
  direction: TradeDirection;
  lots: number;          // size / quantity
  entryPrice: number;
  exitPrice?: number;
  entryTime: Date;
  exitTime?: Date;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;        // realized P&L
  swap?: number;
  commission?: number;
  leverage: number;      // leverage multiplier (e.g. 100)
  margin: number;        // margin used = (entryPrice * lots) / leverage

  // Status & source
  status: TradeStatus;
  source: TradeSource;
  profileId?: string;

  // Chart timeframe preference
  timeframe?: string;

  // Journal fields
  journaled: boolean;
  executionChecklist: ChecklistItem[];
  screenshots: string[];
  screenshotMeta?: {
    url: string;
    caption?: string;
    timeframe?: string;
  }[];
  // Permanent, write-once snapshot of the pre-R2-migration base64 screenshots
  // (see scripts/migrate-screenshots-to-r2.ts). Never read by the app, never
  // modified or removed by anything — kept solely as a recovery fallback.
  screenshotsBase64Backup?: string[];
  preTradeAnalysis?: string;
  postTradeReview?: string;
  riskRatio?: number;
  rewardRatio?: number;
  emotions?: string;
  lessonsLearned?: string;
  tags: string[];
  rating?: number;       // 1–10
  parentTradeId?: string;
  mergedTradeIds?: string[];

  createdAt: Date;
  updatedAt: Date;
}

const ChecklistItemSchema = new Schema<ChecklistItem>(
  {
    item: { type: String, required: true },
    checked: { type: Boolean, default: false },
  },
  { _id: false }
);

const TradeEntrySchema = new Schema<ITradeEntry>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
    userId: { type: String, required: true, index: true },

    ticket: { type: String, default: undefined },
    symbol: { type: String, required: true },
    direction: { type: String, enum: ["buy", "sell"], required: true },
    lots: { type: Number, required: true },
    entryPrice: { type: Number, required: true },
    exitPrice: { type: Number, default: undefined },
    entryTime: { type: Date, required: true },
    exitTime: { type: Date, default: undefined },
    stopLoss: { type: Number, default: undefined },
    takeProfit: { type: Number, default: undefined },
    profit: { type: Number, default: 0 },
    swap: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    leverage: { type: Number, default: 100 },
    margin: { type: Number, default: 0 },

    status: { type: String, enum: ["open", "closed"], default: "open" },
    source: { type: String, enum: ["manual", "mt5"], default: "manual" },
    profileId: { type: String, default: undefined },

    timeframe: { type: String, default: "" },

    journaled: { type: Boolean, default: false },
    executionChecklist: {
      type: [ChecklistItemSchema],
      default: [],
    },
    screenshots: { type: [String], default: [] },
    screenshotMeta: {
      type: [
        {
          url: { type: String, required: true },
          caption: { type: String, default: "" },
          timeframe: { type: String, default: "" },
        },
      ],
      default: [],
    },
    // Pre-migration base64 screenshots kept by scripts/migrate-screenshots-to-r2.ts.
    // `select: false` because no application code ever reads this field, but it
    // averages ~5 KB/doc: left selectable it made GET /api/trade ship 19 MB of
    // dead backup data (22.66 MB total, ~250s on the M0 tier's ~0.09 MB/s).
    // Queries that genuinely need it must ask via .select("+screenshotsBase64Backup").
    screenshotsBase64Backup: { type: [String], default: undefined, select: false },
    preTradeAnalysis: { type: String, default: "" },
    postTradeReview: { type: String, default: "" },
    riskRatio: { type: Number, default: 1 },
    rewardRatio: { type: Number, default: 2 },
    emotions: { type: String, default: "" },
    lessonsLearned: { type: String, default: "" },
    tags: { type: [String], default: [] },
    rating: { type: Number, min: 1, max: 10, default: 5 },
    parentTradeId: { type: String, default: undefined },
    mergedTradeIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Compound index for fast user queries
TradeEntrySchema.index({ userId: 1, entryTime: -1 });
TradeEntrySchema.index({ userId: 1, ticket: 1 }, { sparse: true });
TradeEntrySchema.index({ userId: 1, profileId: 1 });

if (mongoose.models.TradeEntry && !mongoose.models.TradeEntry.schema.paths.parentTradeId) {
  delete mongoose.models.TradeEntry;
}

export const TradeEntryModel =
  mongoose.models.TradeEntry ||
  mongoose.model<ITradeEntry>("TradeEntry", TradeEntrySchema);
