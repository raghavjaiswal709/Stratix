import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getObjectBytes } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * GET /api/uploads/<userId>/<scope>/<uuid>.<ext>
 *
 * Stable, auth-guarded URL for an R2-backed image. This URL is what gets
 * embedded in saved note HTML, so it must never expire — which is why it
 * proxies the bytes instead of redirecting to a short-lived presigned link.
 * Serving same-origin also keeps the drawing editor's `toDataURL()` working
 * (a cross-origin image would taint the canvas).
 *
 * Object keys are always `<userId>/<scope>/<uuid>.<ext>`, minted server-side in
 * /api/uploads/presign, so ownership is derived from the key's first segment.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key: segments } = await params;

  // Reject traversal segments before they reach R2, and require the full
  // <userId>/<scope>/<file> shape.
  if (segments.length < 3 || segments.some((s) => !s || s === "." || s === "..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  // A user may only read their own objects. Admins are allowed through so the
  // /admin/view/[userId] "view as" screens can render a member's note images.
  if (segments[0] !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const object = await getObjectBytes(segments.join("/"));
  if (!object) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Keys embed a UUID, so a given key's bytes never change — cache hard so the
  // proxy is hit once per image per browser rather than on every note open.
  return new NextResponse(Buffer.from(object.bytes), {
    status: 200,
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
