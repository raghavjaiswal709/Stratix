import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPromptDefinition } from "@/lib/prompts/definitions";
import { savePromptOverride, resetPromptOverride } from "@/lib/prompts/store";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "admin") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

/**
 * PUT /api/admin/prompts/[key]
 * Body: { content: string } — saves an admin override for this prompt key.
 * Restricted to admin role only.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { key } = await params;
  if (!hasPromptDefinition(key)) {
    return NextResponse.json({ error: `Unknown prompt key: ${key}` }, { status: 404 });
  }

  let body: { content?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const content = body.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  await savePromptOverride(key, content, session!.user.email ?? session!.user.id ?? "unknown");
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/prompts/[key]
 * Removes the admin override, reverting the prompt to its hardcoded default.
 * Restricted to admin role only.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { key } = await params;
  if (!hasPromptDefinition(key)) {
    return NextResponse.json({ error: `Unknown prompt key: ${key}` }, { status: 404 });
  }

  await resetPromptOverride(key);
  return NextResponse.json({ ok: true });
}
