import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import net from "net";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // safety cap, well above any real poster background

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd");
}

// Blocks requests to loopback/private/link-local addresses before we ever
// fetch — this route downloads whatever URL the client sends, so without
// this it would be an SSRF proxy for anyone with a valid session (internal
// services, cloud metadata endpoints, etc.), not just an image fetcher.
async function assertPublicHost(hostname: string) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Refusing to fetch a private/internal address");
    return;
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.length === 0) throw new Error("Could not resolve host");
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new Error("Refusing to fetch a private/internal address");
  }
}

// Downloads a picked web-search image server-side and returns it as a
// data: URL — same shape as the Gemini generate-image route — so the
// browser never has to load a cross-origin, non-CORS image directly (which
// would taint the canvas and break PNG export).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty/invalid body handled below */
  }
  const src = typeof body.url === "string" ? body.url.trim() : "";
  if (!src) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Only http(s) URLs are allowed" }, { status: 400 });
  }

  try {
    // Re-validate the host on every hop — fetch's redirect:"follow" would
    // otherwise let a redirect (or DNS rebind) point the second request at
    // an internal address after the first host check already passed.
    let current = parsed;
    let res: Response;
    for (let hop = 0; ; hop++) {
      await assertPublicHost(current.hostname);
      res = await fetch(current.toString(), { redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error("Redirect with no location");
        if (hop >= 5) throw new Error("Too many redirects");
        current = new URL(location, current);
        if (current.protocol !== "https:" && current.protocol !== "http:") throw new Error("Only http(s) URLs are allowed");
        continue;
      }
      break;
    }
    if (!res.ok) throw new Error(`Source returned HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error(`Not an image (${contentType || "unknown type"})`);

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("Image too large");

    const base64 = Buffer.from(buf).toString("base64");
    return NextResponse.json({ imageUrl: `data:${contentType};base64,${base64}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not fetch that image";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
