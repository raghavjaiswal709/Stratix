import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listPromptsWithOverrides } from "@/lib/prompts/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/prompts
 * Returns every known prompt definition enriched with its live/override content.
 * Restricted to admin role only — 403 for everyone else.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prompts = await listPromptsWithOverrides();
  return NextResponse.json({ prompts });
}
