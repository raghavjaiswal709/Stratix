import mongoose, { Schema } from "mongoose";

// One row per user — the Content Creator's "saved as default" starting
// style (ratio, colors, config, poster style, gradient, theme, fade
// intensity, highlight-color scheme). Applied on load instead of the
// hardcoded factory defaults once a user has explicitly saved one.
const ContentCreatorDefaultsSchema = new Schema({
  userId:    { type: String, required: true, unique: true, index: true },
  settings:  { type: Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now },
});

export const ContentCreatorDefaultsModel =
  mongoose.models.ContentCreatorDefaults ||
  mongoose.model("ContentCreatorDefaults", ContentCreatorDefaultsSchema);
