import mongoose, { Schema } from "mongoose";

// One row per "generation" the user creates in the Content Creator — either
// AI-generated (News Batch) or manually saved (Daily Analysis / Indicator).
// `payload` is the exact shape needed to reload the customizer: the poster
// array/object, ratioId, colors and config, so "Load" is a single round trip.
const ContentCreatorGenerationSchema = new Schema({
  userId:     { type: String, required: true, index: true },
  category:   { type: String, enum: ["news-batch", "daily-analysis", "indicator"], required: true },
  title:      { type: String, required: true },
  itemCount:  { type: Number, default: 1 },
  payload:    { type: Schema.Types.Mixed, required: true },
  createdAt:  { type: Date, default: Date.now },
});

ContentCreatorGenerationSchema.index({ userId: 1, createdAt: -1 });

export const ContentCreatorGenerationModel =
  mongoose.models.ContentCreatorGeneration ||
  mongoose.model("ContentCreatorGeneration", ContentCreatorGenerationSchema);
