import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsAnalyseReportModel } from "@/lib/models/NewsAnalyseReport";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const doc = await NewsAnalyseReportModel.findById(id).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(doc);
  }

  // List: return metadata only (no articles/prompt/data to keep response small)
  const docs = await NewsAnalyseReportModel.find({})
    .sort({ generatedAt: -1 })
    .limit(100)
    .select("_id timeRange timeRangeLabel instrument newsCount generatedBy generatedAt")
    .lean();

  return NextResponse.json(docs);
}

export async function DELETE(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await dbConnect();
  const doc = await NewsAnalyseReportModel.findById(id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const email = userSession.user.email ?? "";
  const isOwner = doc.generatedBy.toLowerCase() === email.toLowerCase();
  const isAdmin = (userSession.user as { role?: string }).role === "admin";
  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await doc.deleteOne();
  return NextResponse.json({ ok: true });
}
