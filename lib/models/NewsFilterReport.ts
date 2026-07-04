import mongoose, { Schema } from "mongoose";

// Visible to ALL users (no userId-scoped queries against this model) — mirrors
// the shared-report pattern in lib/models/NewsSentimentReport.ts. `data.allNews`
// keeps the pre-filter raw headline list so the removal animation can be
// replayed when a saved report is reopened from history.
const NewsFilterReportSchema = new Schema({
  hours:             { type: Number, required: true },
  timeRangeLabel:    { type: String, required: true },
  allNewsCount:      { type: Number, required: true },
  keptNewsCount:      { type: Number, required: true },
  data:              { type: Schema.Types.Mixed, required: true },
  generatedBy:       { type: String, required: true }, // email — used for ownership checks
  generatedByName:   { type: String, default: "" },    // display name
  generatedAt:       { type: Date, default: Date.now },
});

NewsFilterReportSchema.index({ generatedAt: -1 });

export const NewsFilterReportModel =
  mongoose.models.NewsFilterReport ||
  mongoose.model("NewsFilterReport", NewsFilterReportSchema);
