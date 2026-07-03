import mongoose, { Schema } from "mongoose";

// Visible to ALL users (no userId-scoped queries against this model) — each
// report is tagged with who generated it via `generatedBy`/`generatedByName`,
// mirroring the existing shared-report pattern in lib/models/NewsReport.ts.
const NewsSentimentReportSchema = new Schema({
  hours:             { type: Number, required: true },
  timeRangeLabel:    { type: String, required: true },
  newsAnalyzedCount: { type: Number, required: true },
  data:              { type: Schema.Types.Mixed, required: true },
  generatedBy:       { type: String, required: true }, // email — used for ownership checks
  generatedByName:   { type: String, default: "" },    // display name
  generatedAt:       { type: Date, default: Date.now },
});

NewsSentimentReportSchema.index({ generatedAt: -1 });

export const NewsSentimentReportModel =
  mongoose.models.NewsSentimentReport ||
  mongoose.model("NewsSentimentReport", NewsSentimentReportSchema);
