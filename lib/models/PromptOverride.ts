import mongoose, { Schema } from "mongoose";

// Admin-edited override for one entry in lib/prompts/definitions — when present,
// its content is used instead of the hardcoded default. Absence of a row for a
// key means "use the default from source".
const PromptOverrideSchema = new Schema({
  key:       { type: String, required: true, unique: true, index: true },
  content:   { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String },
});

export const PromptOverrideModel =
  mongoose.models.PromptOverride || mongoose.model("PromptOverride", PromptOverrideSchema);
