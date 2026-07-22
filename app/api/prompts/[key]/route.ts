import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPromptDefinition } from "@/lib/prompts/definitions";
import { getPromptTemplate } from "@/lib/prompts/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/prompts/[key]
 * Read-only, any signed-in user — used by client-side "copy prompt to
 * clipboard" panels (Journal Analytics, AI Report, Content Creator Daily
 * Analysis) so admin edits to those prompts take effect without a redeploy.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await params;
  if (!hasPromptDefinition(key)) {
    return NextResponse.json({ error: `Unknown prompt key: ${key}` }, { status: 404 });
  }

  const content = await getPromptTemplate(key);
  return NextResponse.json({ key, content });
}
