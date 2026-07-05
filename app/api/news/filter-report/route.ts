import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { NewsFilterReportModel } from "@/lib/models/NewsFilterReport";
import { ALLOWED_HOURS, gatherNewsWindow } from "@/lib/news/sentiment-analysis";
import { runNewsFilter, type NewsFilterResult } from "@/lib/news/news-filter";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

  let body: { hours?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const hours = ALLOWED_HOURS.includes(body.hours as number) ? (body.hours as number) : 12;

  const window = await gatherNewsWindow(hours, req);
  if (window.deduped.length === 0) {
    return NextResponse.json({ error: "No news found in this time window across any source" }, { status: 400 });
  }

  // Runs the dedicated tier/sentiment classifier (lib/news/news-filter.ts) —
  // a lean, parallel-batched call on the fast model, separate from the deep
  // sentiment-report pass. Anything in the raw window that doesn't come back
  // in analyzed_news is the "filtered out" (removed) set.
  let analysisData: NewsFilterResult;
  try {
    analysisData = await runNewsFilter(window, apiKey);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI filtering failed" }, { status: 502 });
  }

  const analyzedNews = analysisData.analyzed_news;

  await dbConnect();
  const doc = await NewsFilterReportModel.create({
    hours,
    timeRangeLabel: window.label,
    allNewsCount: window.deduped.length,
    keptNewsCount: analyzedNews.length,
    data: { allNews: window.deduped, ...(analysisData as object) },
    generatedBy: session.user.email ?? session.user.id,
    generatedByName: session.user.name ?? "",
    generatedAt: new Date(),
  });

  return NextResponse.json({
    _id: String(doc._id),
    hours,
    timeRangeLabel: window.label,
    allNewsCount: window.deduped.length,
    keptNewsCount: analyzedNews.length,
    generatedBy: doc.generatedBy,
    generatedByName: doc.generatedByName,
    generatedAt: doc.generatedAt,
    data: { allNews: window.deduped, ...(analysisData as object) },
  }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await dbConnect();
  const reports = await NewsFilterReportModel.find({})
    .select("-data")
    .sort({ generatedAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json(reports);
}
