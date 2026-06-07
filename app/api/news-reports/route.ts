import { readdir } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsReportModel } from "@/lib/models/NewsReport";

export const dynamic = "force-dynamic";

// ─── One-time migration: drop the old unique index if it still exists ─────────
// The original schema had { date:1, session:1 } unique. Removing `unique:true`
// from the Mongoose schema does NOT drop the index from MongoDB — we must do it
// explicitly. This guard runs once per warm Lambda instance (idempotent on DB).
let _indexDropped = false;
async function ensureNonUniqueIndex(): Promise<void> {
  if (_indexDropped) return;
  _indexDropped = true; // optimistic — avoid parallel race on cold start
  try {
    await NewsReportModel.collection.dropIndex("date_1_session_1");
  } catch {
    // Already dropped, never existed, or wrong name — all safe to ignore
  }
}

export interface NewsEntry {
  date:     string;
  session:  string;
  source:   "db" | "file";
  count?:   number;     // number of saved versions
  latestAt?: string;    // ISO timestamp of most-recent version
  latestBy?: string;    // email of most-recent generator
}

export interface NewsVersion {
  _id:         string;
  generatedAt: string;  // ISO
  generatedBy: string;
}

const SESSION_ORDER = ["asian", "london", "new_york"];

// ─── GET ──────────────────────────────────────────────────────────────────────
// GET /api/news-reports                           → sorted index (DB + filesystem)
// GET /api/news-reports?id=<mongoId>              → specific version data
// GET /api/news-reports?date=X&session=Y          → latest version data
// GET /api/news-reports?date=X&session=Y&history  → version list (metadata only)
export async function GET(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date         = searchParams.get("date");
  const sessionParam = searchParams.get("session");
  const historyMode  = searchParams.has("history");
  const id           = searchParams.get("id");

  await dbConnect();
  await ensureNonUniqueIndex();

  // ── Fetch a specific version by _id ────────────────────────────────────
  if (id) {
    const doc = await NewsReportModel.findById(id).lean() as { data: any; generatedBy?: string; generatedAt?: Date } | null;
    if (!doc) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    
    const reportData = doc.data;
    if (reportData && typeof reportData === "object") {
      if (!reportData.meta) reportData.meta = {};
      reportData.meta.generated_by = doc.generatedBy;
      reportData.meta.generated_at = doc.generatedAt?.toISOString() || reportData.meta.generated_at;
    }
    return NextResponse.json(reportData);
  }

  // ── Version history list for a date+session (metadata, no data payload) ─
  if (date && sessionParam && historyMode) {
    type RawVersion = { _id: unknown; generatedBy?: string; generatedAt?: Date; createdAt?: Date };
    const docs = await NewsReportModel
      .find({ date, session: sessionParam }, { data: 0 })
      .sort({ generatedAt: -1 })
      .lean() as RawVersion[];

    const versions: NewsVersion[] = docs.map((d) => ({
      _id:         String(d._id),
      generatedBy: d.generatedBy ?? "unknown",
      generatedAt: (d.generatedAt ?? d.createdAt)?.toISOString() ?? new Date().toISOString(),
    }));
    return NextResponse.json(versions);
  }

  // ── Latest version data for a specific date+session ───────────────────
  if (date && sessionParam) {
    const dbDoc = await NewsReportModel
      .findOne({ date, session: sessionParam })
      .sort({ generatedAt: -1 })
      .lean() as { data: any; generatedBy?: string; generatedAt?: Date } | null;

    if (dbDoc) {
      const reportData = dbDoc.data;
      if (reportData && typeof reportData === "object") {
        if (!reportData.meta) reportData.meta = {};
        reportData.meta.generated_by = dbDoc.generatedBy;
        reportData.meta.generated_at = dbDoc.generatedAt?.toISOString() || reportData.meta.generated_at;
      }
      return NextResponse.json(reportData);
    }

    // Static-asset fallback — forward session cookie so auth middleware passes
    try {
      const origin  = new URL(req.url).origin;
      const fileRes = await fetch(
        `${origin}/data/news/${date}_${sessionParam}_news.json`,
        { headers: { cookie: req.headers.get("cookie") ?? "" }, cache: "no-store" },
      );
      if (!fileRes.ok) return NextResponse.json({ error: "Report not found" }, { status: 404 });
      return NextResponse.json(await fileRes.json());
    } catch {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
  }

  // ── Index list: unique date+session combos with count + latest metadata ─
  type AggResult = { date: string; session: string; latestAt?: Date; latestBy?: string; count: number };
  const dbEntries = await NewsReportModel.aggregate<AggResult>([
    { $sort: { generatedAt: -1 } },
    {
      $group: {
        _id:      { date: "$date", session: "$session" },
        latestAt: { $first: "$generatedAt" },
        latestBy: { $first: "$generatedBy" },
        count:    { $sum: 1 },
      },
    },
    {
      $project: {
        _id:      0,
        date:     "$_id.date",
        session:  "$_id.session",
        latestAt: 1,
        latestBy: 1,
        count:    1,
      },
    },
  ]);

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
  } catch { /* directory may not exist yet */ }

  const all: NewsEntry[] = [
    ...dbEntries.map((e) => ({
      date:     e.date,
      session:  e.session,
      source:   "db" as const,
      count:    e.count,
      latestAt: e.latestAt?.toISOString(),
      latestBy: e.latestBy,
    })),
    ...fileEntries
      .filter((e) => !dbSet.has(`${e.date}||${e.session}`))
      .map((e)   => ({ ...e, source: "file" as const })),
  ].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return SESSION_ORDER.indexOf(a.session) - SESSION_ORDER.indexOf(b.session);
  });

  return NextResponse.json(all);
}

// ─── POST — always creates a NEW version, never overwrites ───────────────────
export async function POST(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  await ensureNonUniqueIndex();

  const doc = await new NewsReportModel({
    date,
    session:     sessionParam,
    data,
    generatedBy: userSession.user?.email ?? "unknown",
    generatedAt: new Date(),
  }).save();

  return NextResponse.json({ ok: true, _id: String(doc._id) });
}

// ─── DELETE — delete a report version generated by the current user (or admin) ─
export async function DELETE(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
  }

  await dbConnect();

  const doc = await NewsReportModel.findById(id);
  if (!doc) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Allow deletion if the user is the owner (generatedBy matches email) OR is an admin
  const userEmail = userSession.user.email;
  const isOwner = doc.generatedBy && userEmail && doc.generatedBy.toLowerCase() === userEmail.toLowerCase();
  const isAdmin = userSession.user.role === "admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: You can only delete reports generated by you" },
      { status: 403 }
    );
  }

  await NewsReportModel.findByIdAndDelete(id);

  return NextResponse.json({ ok: true });
}
