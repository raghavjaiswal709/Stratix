import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateImageDataUrl } from "@/lib/content-creator/generate-image";

export const runtime = "nodejs";
export const maxDuration = 60;

// One prompt per call, rather than a batch endpoint, so the client can fan
// requests out with its own concurrency cap and a failure on one poster's
// image never blocks or fails the others.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  let body: { prompt?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty/invalid body handled below */
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

  try {
    const imageUrl = await generateImageDataUrl(prompt, apiKey);
    return NextResponse.json({ imageUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image generation failed";
    return NextResponse.json({ error: `AI image generation failed (Gemini): ${msg}` }, { status: 502 });
  }
}
