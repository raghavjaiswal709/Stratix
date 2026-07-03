import mongoose, { Schema, Document } from "mongoose";

export type MissedTradeOutcome = "hit-tp" | "hit-sl" | "partial" | "still-open" | "unknown";

export interface IMissedTrade extends Document<string> {
  userId: string;
  profileId?: string;
  symbol: string;
  direction: "buy" | "sell";
  date: Date;
  timeframe?: string;
  idealEntry: number;
  idealSL?: number;
  idealTP?: number;
  estimatedRR?: number;
  potentialPips?: number;
  reasonMissed: string;
  setup?: string;
  outcome: MissedTradeOutcome;
  outcomeNotes?: string;
  analysis: string;
  lessonsLearned: string;
  screenshots: string[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const MissedTradeSchema = new Schema<IMissedTrade>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
    userId: { type: String, required: true, index: true },
    profileId: { type: String, default: undefined },
    symbol: { type: String, required: true },
    direction: { type: String, enum: ["buy", "sell"], required: true },
    date: { type: Date, required: true },
    timeframe: { type: String, default: "" },
    idealEntry: { type: Number, required: true },
    idealSL: { type: Number, default: undefined },
    idealTP: { type: Number, default: undefined },
    estimatedRR: { type: Number, default: undefined },
    potentialPips: { type: Number, default: undefined },
    reasonMissed: { type: String, default: "" },
    setup: { type: String, default: "" },
    outcome: { type: String, enum: ["hit-tp", "hit-sl", "partial", "still-open", "unknown"], default: "unknown" },
    outcomeNotes: { type: String, default: "" },
    analysis: { type: String, default: "" },
    lessonsLearned: { type: String, default: "" },
    screenshots: { type: [String], default: [] },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

MissedTradeSchema.index({ userId: 1, date: -1 });
MissedTradeSchema.index({ userId: 1, profileId: 1 });

export const MissedTradeModel =
  mongoose.models.MissedTrade ||
  mongoose.model<IMissedTrade>("MissedTrade", MissedTradeSchema);
