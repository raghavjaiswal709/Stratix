import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllQuotes } from "@/lib/quotes/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/quotes
 * Returns every quote for the dashboard's quote overlay. Any signed-in user —
 * quote management itself is admin-only (see /api/admin/quotes).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quotes = await getAllQuotes();
  return NextResponse.json({ quotes });
}
