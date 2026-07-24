import dbConnect from "@/lib/mongodb";
import { QuoteModel } from "@/lib/models/Quote";
import { TRADING_QUOTES } from "@/components/shared/quotes-data";

export interface QuoteEntry {
  _id: string;
  text: string;
  author: string;
}

interface QuoteLean {
  _id: unknown;
  text: string;
  author: string;
}

/** One-time migration: populate the collection from the hardcoded curated
 * list the first time it's queried. `unique: true` on `text` + `ordered:
 * false` means a duplicate-key race between two concurrent first-requests
 * just no-ops the losing insert rather than erroring. */
async function ensureSeeded(): Promise<void> {
  const count = await QuoteModel.countDocuments();
  if (count > 0) return;
  try {
    await QuoteModel.insertMany(TRADING_QUOTES, { ordered: false });
  } catch {
    // Another request won the seeding race, or a duplicate slipped in — fine either way.
  }
}

export async function getAllQuotes(): Promise<QuoteEntry[]> {
  await dbConnect();
  await ensureSeeded();
  const docs = await QuoteModel.find({}).sort({ createdAt: 1 }).lean<QuoteLean[]>();
  return docs.map((d) => ({ _id: String(d._id), text: d.text, author: d.author }));
}

export async function addQuote(text: string, author: string, createdBy: string): Promise<QuoteEntry> {
  await dbConnect();
  await ensureSeeded();
  const doc = await QuoteModel.create({ text, author, createdBy });
  return { _id: String(doc._id), text: doc.text, author: doc.author };
}

export async function deleteQuote(id: string): Promise<boolean> {
  await dbConnect();
  const res = await QuoteModel.deleteOne({ _id: id });
  return res.deletedCount > 0;
}
