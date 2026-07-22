import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRecentlyCoveredBlock } from "@/lib/content-creator/recent-news";

export const dynamic = "force-dynamic";

/**
 * GET /api/content-creator/recently-covered
 * Same "don't repeat the last few News Batches" data the automatic News
 * Batch route injects server-side, exposed read-only for the client-side
 * "Daily Analysis" copy-paste prompt panel (the external-AI path for the
 * same poster feature) so both stay in sync.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const block = await getRecentlyCoveredBlock(session.user.id);
  return NextResponse.json({ block });
}
