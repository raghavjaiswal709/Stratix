import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { ContentCreatorDefaultsModel } from "@/lib/models/ContentCreatorDefaults";

export const dynamic = "force-dynamic";

// GET /api/content-creator/defaults — the user's saved "default settings"
// for the Content Creator, or null if they've never saved one (caller falls
// back to the hardcoded factory defaults).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const doc = await ContentCreatorDefaultsModel.findOne({ userId: session.user.id }).lean();

  return NextResponse.json({ settings: doc?.settings ?? null });
}

// PUT /api/content-creator/defaults — overwrite the user's saved defaults
// with whatever the Content Creator's current style settings are.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { settings?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ error: "Missing settings" }, { status: 400 });
  }

  await dbConnect();
  await ContentCreatorDefaultsModel.findOneAndUpdate(
    { userId: session.user.id },
    { $set: { settings: body.settings, updatedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
