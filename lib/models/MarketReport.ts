import mongoose, { Schema, Document } from "mongoose";

export interface IMarketReport extends Document {
  date: string;
  session: string;
  data: Record<string, unknown>;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MarketReportSchema = new Schema<IMarketReport>(
  {
    date:      { type: String, required: true },
    session:   { type: String, required: true },
    data:      { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true },
);

MarketReportSchema.index({ date: 1, session: 1 }, { unique: true });

export const MarketReportModel =
  mongoose.models.MarketReport ||
  mongoose.model<IMarketReport>("MarketReport", MarketReportSchema);
