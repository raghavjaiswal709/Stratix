import { readdir } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsReportModel } from "@/lib/models/NewsReport";

export const dynamic = "force-dynamic";

export interface NewsEntry {
  date: string;
  session: string;
  source: "db" | "file";
}

const SESSION_ORDER = ["asian", "london", "new_york"];

// GET /api/news-reports                        → sorted list (DB + filesystem merged)
// GET /api/news-reports?date=X&session=Y       → full report JSON (DB first, file fallback)
export async function GET(req: NextRequest) {
  const userSession = await auth();
  if (userSession?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date         = searchParams.get("date");
  const sessionParam = searchParams.get("session");

  // ── Return a specific report's content ─────────────────────────────────
  if (date && sessionParam) {
    await dbConnect();

    const dbDoc = await NewsReportModel
      .findOne({ date, session: sessionParam })
      .lean() as { data: unknown } | null;

    if (dbDoc) return NextResponse.json(dbDoc.data);

    // Static-asset fallback (HTTP fetch avoids nft tracing dynamic paths)
    try {
      const origin  = new URL(req.url).origin;
      const fileRes = await fetch(
        `${origin}/data/news/${date}_${sessionParam}_news.json`,
        { cache: "no-store" },
      );
      if (!fileRes.ok) return NextResponse.json({ error: "Report not found" }, { status: 404 });
      return NextResponse.json(await fileRes.json());
    } catch {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
  }

  // ── Return index list (DB + filesystem, deduped) ───────────────────────
  await dbConnect();

  const dbEntries = (await NewsReportModel
    .find({}, { date: 1, session: 1, _id: 0 })
    .lean()) as { date: string; session: string }[];

  const dbSet = new Set(dbEntries.map((e) => `${e.date}||${e.session}`));

  let fileEntries: { date: string; session: string }[] = [];
  try {
    const files = await readdir(join(process.cwd(), "public", "data", "news"));
    fileEntries = files
      .filter((f) => f.endsWith("_news.json"))
      .flatMap((f) => {
        const m = f.replace(/\.json$/, "").match(/^(\d{4}-\d{2}-\d{2})_(.+)_news$/);
        if (!m) return [];
        return [{ date: m[1], session: m[2] }];
      });
  } catch {
    /* directory may not exist yet */
  }

  const all: NewsEntry[] = [
    ...dbEntries.map((e) => ({ ...e, source: "db"   as const })),
    ...fileEntries
      .filter((e) => !dbSet.has(`${e.date}||${e.session}`))
      .map((e)   => ({ ...e, source: "file" as const })),
  ].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return SESSION_ORDER.indexOf(a.session) - SESSION_ORDER.indexOf(b.session);
  });

  return NextResponse.json(all);
}

// POST /api/news-reports  body: { date, session, data }  → upsert to DB
export async function POST(req: NextRequest) {
  const userSession = await auth();
  if (userSession?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { date?: string; session?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { date, session: sessionParam, data } = body;
  if (!date || !sessionParam || data === undefined) {
    return NextResponse.json(
      { error: "date, session, and data are required" },
      { status: 400 },
    );
  }

  await dbConnect();

  await NewsReportModel.findOneAndUpdate(
    { date, session: sessionParam },
    { $set: { data, updatedBy: userSession.user?.email ?? "admin" } },
    { upsert: true, new: true },
  );

  return NextResponse.json({ ok: true });
}
