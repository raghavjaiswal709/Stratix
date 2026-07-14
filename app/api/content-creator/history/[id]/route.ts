import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { ContentCreatorGenerationModel } from "@/lib/models/ContentCreatorGeneration";

export const dynamic = "force-dynamic";

// GET /api/content-creator/history/[id] — full record including payload, for
// "Load" — reloads the customizer with the exact saved poster(s)/settings.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await dbConnect();
  const doc = await ContentCreatorGenerationModel.findOne({ _id: id, userId: session.user.id }).lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(doc);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await dbConnect();
  const result = await ContentCreatorGenerationModel.deleteOne({ _id: id, userId: session.user.id });
  if (result.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { title?: string; itemCount?: number; payload?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

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
}

