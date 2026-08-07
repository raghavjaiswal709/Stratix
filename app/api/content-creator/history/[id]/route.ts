import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { ContentCreatorGenerationModel } from "@/lib/models/ContentCreatorGeneration";
import { deleteObjects, extractOwnedUploadKeys } from "@/lib/r2";

export const dynamic = "force-dynamic";

// GET /api/content-creator/history/[id] — full record including payload, for
// "Load" — reloads the customizer with the exact saved poster(s)/settings.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    await dbConnect();
    const doc = await ContentCreatorGenerationModel.findOne({ _id: id, userId: session.user.id }).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(doc);
  } catch (err) {
    // A raw throw here (e.g. a Mongo connection blip) would otherwise fall
    // through to Next.js's own error page — HTML/plain text, not JSON —
    // which breaks the client's res.json() with "Unexpected token" instead
    // of a readable error.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load this entry — try again." },
      { status: 500 }
    );
  }
}

// Deleting a generation deletes its Cloudflare-backed assets with it — every
// decomposed slide image, the CSV transcript, the voiceover and the music
// bed for a motion-video project, or whatever other /api/uploads/ URLs the
// category in question embeds. Otherwise every delete from history leaves
// its files behind in R2 forever with nothing left pointing at them.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    await dbConnect();

    // Fetched (not just deleted) so the R2 keys it references can be pulled
    // out first — deleteOne alone would take the only record of them with it.
    const doc = await ContentCreatorGenerationModel.findOne({ _id: id, userId: session.user.id }).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await ContentCreatorGenerationModel.deleteOne({ _id: id, userId: session.user.id });
    if (result.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Best-effort: the DB record is already gone, which is the part the user
    // is waiting on. A partial R2 cleanup failure (a transient network blip,
    // a key that outlived its own record already) is logged, not surfaced —
    // orphaned storage is a cost to clean up later, not a reason to make the
    // delete itself look like it failed when it didn't.
    try {
      const keys = extractOwnedUploadKeys(
        { payload: (doc as { payload?: unknown }).payload, previewUrl: (doc as { previewUrl?: string }).previewUrl },
        session.user.id
      );
      if (keys.length > 0) await deleteObjects(keys);
    } catch (err) {
      console.warn(`Failed to clean up R2 assets for deleted history entry ${id}:`, err);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete this entry — try again." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { title?: string; itemCount?: number; payload?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  try {
    await dbConnect();
    const doc = await ContentCreatorGenerationModel.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      {
        $set: {
          ...(body.title ? { title: body.title.slice(0, 200) } : {}),
          ...(body.itemCount !== undefined ? { itemCount: body.itemCount } : {}),
          ...(body.payload !== undefined ? { payload: body.payload } : {}),
        }
      },
      { new: true }
    );

    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ _id: String(doc._id), success: true, updatedAt: doc.createdAt });
  } catch (err) {
    // Same reasoning as GET/DELETE above — a Mongo throw (e.g. hitting the
    // 16MB document cap once enough image-heavy posters accumulate in one
    // batch, or a connection blip) must never escape as a non-JSON response.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save changes — try again." },
      { status: 500 }
    );
  }
}
