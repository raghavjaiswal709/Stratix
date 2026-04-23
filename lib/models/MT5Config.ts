import mongoose, { Schema, Document } from "mongoose";

export interface IMT5Config extends Document {
  userId: string;
  webhookSecret: string;  // HMAC-SHA256 secret for signature verification
  accountId?: string;     // MT5 account number (for display only)
  broker?: string;
  connected: boolean;
  lastPingAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MT5ConfigSchema = new Schema<IMT5Config>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    webhookSecret: { type: String, required: true },
    accountId: { type: String, default: undefined },
    broker: { type: String, default: undefined },
    connected: { type: Boolean, default: false },
    lastPingAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

export const MT5ConfigModel =
  mongoose.models.MT5Config ||
  mongoose.model<IMT5Config>("MT5Config", MT5ConfigSchema);
