import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const RESULT_COUNT = 8;

interface WebImageResult {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
  contextLink: string;
}

// Pexels — free, no billing account required (unlike Google Custom Search,
// which gates its API behind billing verification even on the free quota).
// Trade-off: searches Pexels' own curated stock-photo library, not the live
// internet, so results are generic finance/business stock imagery rather
// than a real photo of the actual event. Free key: pexels.com/api.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PEXELS_API_KEY not configured" }, { status: 500 });
  }

  let body: { query?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty/invalid body handled below */
  }
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(RESULT_COUNT));

  try {
    const res = await fetch(url.toString(), { headers: { Authorization: apiKey } });
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`Pexels HTTP ${res.status}: ${errorText.slice(0, 300)}`);
    }
    const data = await res.json();
    const photos: Array<Record<string, unknown>> = Array.isArray(data.photos) ? data.photos : [];
    const results: WebImageResult[] = photos
      .filter((p) => p.src && typeof p.src === "object")
      .map((p) => {
        const src = p.src as Record<string, unknown>;
        return {
          imageUrl: typeof src.large2x === "string" ? src.large2x : (src.original as string),
          thumbnailUrl: typeof src.medium === "string" ? src.medium : (src.small as string),
          title: typeof p.alt === "string" && p.alt ? p.alt : `Photo by ${p.photographer || "Pexels"}`,
          contextLink: typeof p.url === "string" ? p.url : "",
        };
      })
      .filter((r) => !!r.imageUrl);
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Image search failed";
    return NextResponse.json({ error: `Web image search failed: ${msg}` }, { status: 502 });
  }
}
