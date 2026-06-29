import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userSession = await auth();
  if (!userSession?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch page: ${res.statusText}` }, { status: 502 });
    }

    let html = await res.text();

    // Strip scripts, styles, noscripts, and svgs completely (along with their inner contents)
    html = html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
      .replace(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi, "")
      .replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, "");

    // Extract text inside <p> elements
    const paragraphs: string[] = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    
    while ((match = pRegex.exec(html)) !== null) {
      let pText = match[1]
        .replace(/<[^>]*>/g, "") // strip nested elements
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      if (
        pText.length > 50 &&
        !pText.includes("{") &&
        !pText.includes("}") &&
        !pText.includes("@property") &&
        !pText.includes("@media") &&
        !pText.includes("var(--") &&
        !pText.includes("margin:") &&
        !pText.toLowerCase().includes("cookie") &&
        !pText.toLowerCase().includes("subscribe") &&
        !pText.toLowerCase().includes("privacy policy") &&
        !pText.toLowerCase().includes("terms of service")
      ) {
        paragraphs.push(pText);
      }
    }

    if (paragraphs.length === 0) {
      return NextResponse.json({
        content: "Could not automatically extract full paragraphs. Please read the original article via the source link.",
      });
    }

    return NextResponse.json({
      content: paragraphs.join("\n\n"),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch content" }, { status: 502 });
  }
}
