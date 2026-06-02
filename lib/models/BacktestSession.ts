import mongoose, { Schema, Document } from "mongoose";

export interface IBacktestSession extends Document {
  userId: string;
  name: string;
  description: string;
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  leverage: string;
  trades: any[];
  drawings: any[];
  lastCandleTime?: number;
  lastStartTime?:  number;
  createdAt: Date;
  updatedAt: Date;
}

const BacktestSessionSchema = new Schema<IBacktestSession>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    strategy: { type: String, default: "" },
    symbol: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    startingBalance: { type: Number, required: true },
    leverage: { type: String, required: true },
    trades: { type: Schema.Types.Mixed, default: [] },
    drawings: { type: Schema.Types.Mixed, default: [] },
    lastCandleTime: { type: Number, default: null },
    lastStartTime:  { type: Number, default: null },
  },
  { timestamps: true }
);

export const BacktestSessionModel =
  mongoose.models.BacktestSession ||
  mongoose.model<IBacktestSession>("BacktestSession", BacktestSessionSchema);
