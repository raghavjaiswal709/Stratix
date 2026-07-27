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

  try {
    await dbConnect();
    const items = await ContentCreatorGenerationModel.find({ userId: session.user.id })
      .select("-payload")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json(items);
  } catch (err) {
    // A raw throw here (e.g. a Mongo connection blip) would otherwise fall
    // through to Next.js's own error page — HTML/plain text, not JSON —
    // which breaks the client's res.json() with "Unexpected token" instead
    // of a readable error.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load history — try again." },
      { status: 500 }
    );
  }
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

  try {
    await dbConnect();
    const doc = await ContentCreatorGenerationModel.create({
      userId: session.user.id,
      category: body.category,
      title: body.title.slice(0, 200),
      itemCount: Number.isFinite(body.itemCount) ? body.itemCount : 1,
      payload: body.payload,
    });

    return NextResponse.json({ _id: String(doc._id), createdAt: doc.createdAt }, { status: 201 });
  } catch (err) {
    // Same reasoning as GET above — never let a DB throw (e.g. hitting the
    // 16MB document cap with a large image-heavy payload, or a connection
    // blip) escape as a non-JSON response.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save to history — try again." },
      { status: 500 }
    );
  }
}
