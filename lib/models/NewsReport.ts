import mongoose, { Schema, Document } from "mongoose";

export interface INewsReport extends Document {
  date:        string;
  session:     string;
  data:        Record<string, unknown>;
  generatedBy: string;
  generatedAt: Date;
  createdAt:   Date;
  updatedAt:   Date;
}

const NewsReportSchema = new Schema<INewsReport>(
  {
    date:        { type: String, required: true },
    session:     { type: String, required: true },
    data:        { type: Schema.Types.Mixed, required: true },
    generatedBy: { type: String, default: "admin" },
    generatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// Non-unique — multiple versions per date+session are intentional.
// Sorted descending so findOne() without sort still returns the latest.
NewsReportSchema.index({ date: 1, session: 1, generatedAt: -1 });

export const NewsReportModel =
  mongoose.models.NewsReport ||
  mongoose.model<INewsReport>("NewsReport", NewsReportSchema);
