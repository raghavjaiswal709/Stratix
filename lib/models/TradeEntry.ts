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

  // Chart timeframe preference
  timeframe?: string;

  // Journal fields
  journaled: boolean;
  executionChecklist: ChecklistItem[];
  screenshots: string[];
  preTradeAnalysis?: string;
  postTradeReview?: string;
  riskRatio?: number;
  rewardRatio?: number;
  emotions?: string;
  lessonsLearned?: string;
  tags: string[];
  rating?: number;       // 1–10

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

    timeframe: { type: String, default: "" },

    journaled: { type: Boolean, default: false },
    executionChecklist: {
      type: [ChecklistItemSchema],
      default: [
        { item: "Checked higher timeframe", checked: false },
        { item: "Risk within limits", checked: false },
        { item: "Fits my trading plan", checked: false },
        { item: "Key levels identified", checked: false },
        { item: "Economic calendar checked", checked: false },
      ],
    },
    screenshots: { type: [String], default: [] },
    preTradeAnalysis: { type: String, default: "" },
    postTradeReview: { type: String, default: "" },
    riskRatio: { type: Number, default: 1 },
    rewardRatio: { type: Number, default: 2 },
    emotions: { type: String, default: "" },
    lessonsLearned: { type: String, default: "" },
    tags: { type: [String], default: [] },
    rating: { type: Number, min: 1, max: 10, default: 5 },
  },
  { timestamps: true }
);

// Compound index for fast user queries
TradeEntrySchema.index({ userId: 1, entryTime: -1 });
TradeEntrySchema.index({ userId: 1, ticket: 1 }, { sparse: true });

export const TradeEntryModel =
  mongoose.models.TradeEntry ||
  mongoose.model<ITradeEntry>("TradeEntry", TradeEntrySchema);
