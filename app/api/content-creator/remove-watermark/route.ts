import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { auth } from "@/lib/auth";
import { persistDataUrlToR2 } from "@/lib/r2";

export const dynamic = "force-dynamic";
// One image is a single localized corner inpaint, not a full decompose — but
// it still pays for a tesseract pass per image, so this stays well short of
// motion-segment's own budget rather than assuming it's free.
export const maxDuration = 120;

/**
 * Per-request cap — the client (handleRemoveAllWatermarks) sends images in
 * chunks of 6, same as the decompose upload; this is the safety rail for a
 * direct API call, not the batch size the UI actually uses.
 */
const MAX_IMAGES = 50;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tmpFiles: string[] = [];
  try {
    const form = await req.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files under the `images` field" }, { status: 400 });
    }
    if (files.length > MAX_IMAGES) {
      return NextResponse.json(
        { error: `Too many images: ${files.length}. Max ${MAX_IMAGES} per request.` },
        { status: 400 }
      );
    }
    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));

    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < buffers.length; i++) {
      const p = path.join(os.tmpdir(), `stratix_watermark_${stamp}_${i}.tmp`);
      fs.writeFileSync(p, buffers[i]);
      tmpFiles.push(p);
    }

    const scriptPath = path.join(process.cwd(), "scripts", "remove_watermark.py");
    const pythonBin = process.env.PYTHON_BIN || "python3";

    // One spawn for the whole chunk, same reasoning as motion-segment: python
    // imports (cv2, tesseract) stay warm across every image in it. A corner
    // OCR pass is far cheaper than a full decompose, so the per-image budget
    // is a fraction of that route's.
    const timeout = Math.min(110_000, 15_000 + tmpFiles.length * 15_000);

    const resultJson = await new Promise<string>((resolve, reject) => {
      execFile(
        pythonBin,
        [scriptPath, ...tmpFiles],
        { maxBuffer: 512 * 1024 * 1024, timeout },
        (error, stdout, stderr) => {
          if (error) {
            const killed = (error as NodeJS.ErrnoException & { killed?: boolean }).killed;
            reject(
              new Error(
                killed
                  ? `Watermark removal timed out after ${Math.round(timeout / 1000)}s for ${tmpFiles.length} image(s)`
                  : `Python execution error: ${error.message}${stderr ? `. Stderr: ${stderr}` : ""}`
              )
            );
          } else if (!stdout.trim()) {
            reject(new Error(`Python returned empty output${stderr ? `. Stderr: ${stderr}` : ""}`));
          } else {
            resolve(stdout.trim());
          }
        }
      );
    });

    const parsed = JSON.parse(resultJson);

    // Same shape as motion-segment: a bare object for one image, {results:[...]}
    // for many. Every cleaned image comes back from python as a base64 data
    // URL — persisted to R2 here so the client never holds or saves the raw
    // bytes itself, same "motion-video" scope the decompose route already
    // writes to (these are the same slide images, just cleaned again).
    const rawResults = Array.isArray(parsed?.results) ? parsed.results : [parsed];
    const results = await Promise.all(
      rawResults.map(async (r: any) => {
        if (!r || r.error || !r.success) return r;
        return { ...r, imageUrl: await persistDataUrlToR2(session.user.id, r.imageUrl, "motion-video") };
      })
    );
    return NextResponse.json({ success: true, count: results.length, results });
  } catch (err: any) {
    console.error("Watermark removal error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to remove watermark" },
      { status: 500 }
    );
  } finally {
    for (const p of tmpFiles) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* temp file already gone */
      }
    }
  }
}
