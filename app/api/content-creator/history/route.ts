import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { ContentCreatorGenerationModel } from "@/lib/models/ContentCreatorGeneration";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = new Set(["news-batch", "daily-analysis", "indicator", "facts-batch", "learnings-batch"]);

// GET /api/content-creator/history — list every saved generation for this
// user, newest first. Payload is excluded so the list stays light even with
// dozens of news batches (each payload can carry several image data URLs).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const items = await ContentCreatorGenerationModel.find({ userId: session.user.id })
    .select("-payload")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json(items);
}

// POST /api/content-creator/history — save a generation (auto-called after
// AI News Batch generation, or manually from Daily Analysis / Indicator).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { category?: string; title?: string; itemCount?: number; payload?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.category || !VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json({ error: "Invalid or missing category" }, { status: 400 });
  }
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }
  if (body.payload === undefined) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  await dbConnect();
  const doc = await ContentCreatorGenerationModel.create({
    userId: session.user.id,
    category: body.category,
    title: body.title.slice(0, 200),
    itemCount: Number.isFinite(body.itemCount) ? body.itemCount : 1,
    payload: body.payload,
  });

  return NextResponse.json({ _id: String(doc._id), createdAt: doc.createdAt }, { status: 201 });
}
