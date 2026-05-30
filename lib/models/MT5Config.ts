import mongoose, { Schema, Document } from "mongoose";

export interface IMT5Config extends Document {
  userId: string;
  /** MetaApi-assigned account ID, stored after successful registration. */
  mt5AccountId?: string;
  /** MT5 login number (account number) — stored for display only, NOT the password. */
  mt5Login?: string;
  /** Broker server name, e.g. "ICMarkets-Demo". */
  mt5Server?: string;
  /** True once MetaApi reports state === "DEPLOYED". */
  connected: boolean;
  /** Timestamp when connected was first set to true. */
  mt5ConnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MT5ConfigSchema = new Schema<IMT5Config>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    mt5AccountId: { type: String, default: undefined },
    mt5Login: { type: String, default: undefined },
    mt5Server: { type: String, default: undefined },
    connected: { type: Boolean, default: false },
    mt5ConnectedAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

export const MT5ConfigModel =
  mongoose.models.MT5Config ||
  mongoose.model<IMT5Config>("MT5Config", MT5ConfigSchema);
