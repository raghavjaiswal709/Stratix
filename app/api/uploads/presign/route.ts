import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPresignedUploadUrl } from "@/lib/r2";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mp4": "mp4",
  "audio/aac": "aac",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/csv": "csv",
};

const ALLOWED_SCOPES = new Set([
  "journal",
  "missed-trade",
  "trade-note",
  "motion-video",
  "motion-audio",
  "motion-music",
  "motion-csv",
]);

// POST /api/uploads/presign — issues a short-lived presigned R2 PUT URL so
// the browser uploads image bytes directly to R2, bypassing this function
// entirely (and with it, Vercel's request body size cap).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { contentType?: string; scope?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ext = body.contentType ? ALLOWED_CONTENT_TYPES[body.contentType] : undefined;
  if (!ext) {
    return NextResponse.json({ error: "Invalid or unsupported contentType" }, { status: 400 });
  }
  if (!body.scope || !ALLOWED_SCOPES.has(body.scope)) {
    return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
  }

  const key = `${session.user.id}/${body.scope}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await getPresignedUploadUrl(key, body.contentType!);

  return NextResponse.json({ uploadUrl, key });
}
