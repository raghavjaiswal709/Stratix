import mongoose, { Schema } from "mongoose";

const ArticleSchema = new Schema(
  {
    title:    String,
    source:   String,
    pubDate:  String,
    link:     String,
    category: String,
  },
  { _id: false }
);

const NewsAnalyseReportSchema = new Schema({
  timeRange:      { type: String, required: true },
  timeRangeLabel: { type: String, required: true },
  instrument:     { type: String, default: "ALL" },
  newsCount:      { type: Number, required: true },
  articles:       { type: [ArticleSchema], default: [] },
  prompt:         { type: String, default: "" },
  data:           { type: Schema.Types.Mixed, required: true },
  generatedBy:    { type: String, required: true },
  generatedAt:    { type: Date, default: Date.now },
});

NewsAnalyseReportSchema.index({ generatedAt: -1 });

export const NewsAnalyseReportModel =
  mongoose.models.NewsAnalyseReport ||
  mongoose.model("NewsAnalyseReport", NewsAnalyseReportSchema);
