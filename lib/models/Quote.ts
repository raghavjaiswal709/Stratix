import mongoose, { Schema } from "mongoose";

// Trading-wisdom quote shown on the dashboard's periodic quote overlay.
// Seeded once from components/shared/quotes-data.ts (see lib/quotes/store.ts);
// from then on this collection is the live, admin-editable source of truth.
const QuoteSchema = new Schema({
  text:      { type: String, required: true, unique: true },
  author:    { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String },
});

export const QuoteModel = mongoose.models.Quote || mongoose.model("Quote", QuoteSchema);
