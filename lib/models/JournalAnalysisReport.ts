import mongoose, { Schema, Document } from "mongoose";

export type ReportTimeRange = "week" | "month" | "3months" | "all";

export interface IJournalAnalysisReport extends Document<string> {
  userId: string;
  profileId?: string;
  timeRange: ReportTimeRange;
  timeRangeLabel: string;
  tradesAnalyzed: number;
  missedTradesAnalyzed: number;
  data: unknown;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const JournalAnalysisReportSchema = new Schema<IJournalAnalysisReport>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toHexString() },
    userId: { type: String, required: true, index: true },
    profileId: { type: String, default: undefined },
    timeRange: { type: String, enum: ["week", "month", "3months", "all"], required: true },
    timeRangeLabel: { type: String, required: true },
    tradesAnalyzed: { type: Number, default: 0 },
    missedTradesAnalyzed: { type: Number, default: 0 },
    data: { type: Schema.Types.Mixed, required: true },
    generatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

JournalAnalysisReportSchema.index({ userId: 1, generatedAt: -1 });
JournalAnalysisReportSchema.index({ userId: 1, profileId: 1 });

export const JournalAnalysisReportModel =
  mongoose.models.JournalAnalysisReport ||
  mongoose.model<IJournalAnalysisReport>("JournalAnalysisReport", JournalAnalysisReportSchema);
