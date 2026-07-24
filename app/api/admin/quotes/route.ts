import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllQuotes, addQuote } from "@/lib/quotes/store";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

/**
 * GET /api/admin/quotes
 * Returns every quote. Restricted to admin role only — 403 for everyone else.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const quotes = await getAllQuotes();
  return NextResponse.json({ quotes });
}

/**
 * POST /api/admin/quotes
 * Adds a new quote. Restricted to admin role only — 403 for everyone else.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";

  if (!text || !author) {
    return NextResponse.json({ error: "Both text and author are required" }, { status: 400 });
  }

  try {
    const quote = await addQuote(text, author, guard.session!.user.name ?? guard.session!.user.email ?? "admin");
    return NextResponse.json({ quote }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === 11000) {
      return NextResponse.json({ error: "That exact quote already exists" }, { status: 409 });
    }
    throw e;
  }
}
