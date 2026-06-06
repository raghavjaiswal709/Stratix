import mongoose, { Schema, Document } from "mongoose";

export interface INewsReport extends Document {
  date: string;
  session: string;
  data: Record<string, unknown>;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NewsReportSchema = new Schema<INewsReport>(
  {
    date:      { type: String, required: true },
    session:   { type: String, required: true },
    data:      { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true },
);

NewsReportSchema.index({ date: 1, session: 1 }, { unique: true });

export const NewsReportModel =
  mongoose.models.NewsReport ||
  mongoose.model<INewsReport>("NewsReport", NewsReportSchema);
