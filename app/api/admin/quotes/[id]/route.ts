import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { deleteQuote } from "@/lib/quotes/store";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/quotes/[id]
 * Removes a quote. Restricted to admin role only — 403 for everyone else.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid quote id" }, { status: 400 });
  }

  const deleted = await deleteQuote(id);
  if (!deleted) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
