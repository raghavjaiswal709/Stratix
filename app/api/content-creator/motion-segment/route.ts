import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

export const dynamic = "force-dynamic";
// Decomposition runs OCR + CV per image; a 10-image batch takes ~12s locally
// but slower machines and bigger posters need room.
export const maxDuration = 300;

const MAX_IMAGES = 12;

/** Decode a data URL or fetch a remote URL into raw bytes. */
async function toBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    if (comma < 0) throw new Error("Malformed data URL");
    return Buffer.from(imageUrl.slice(comma + 1), "base64");
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(req: NextRequest) {
  const tmpFiles: string[] = [];
  try {
    // Two shapes are accepted:
    //   multipart/form-data with `images` — raw bytes, what the UI sends. A
    //     base64 data URL inflates ~33%, which matters at 10 posters a go.
    //   JSON { imageUrl } or { imageUrls: [...] } — data or http URLs.
    let buffers: Buffer[] = [];
    let batch = false;

    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
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
      buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
      batch = true;
    } else {
      const body = await req.json();
      const { imageUrl, imageUrls } = body ?? {};
      const urls: string[] = Array.isArray(imageUrls)
        ? imageUrls
        : typeof imageUrl === "string"
        ? [imageUrl]
        : [];
      batch = Array.isArray(imageUrls);

      if (urls.length === 0) {
        return NextResponse.json({ error: "Missing imageUrl or imageUrls" }, { status: 400 });
      }
      if (urls.length > MAX_IMAGES) {
        return NextResponse.json(
          { error: `Too many images: ${urls.length}. Max ${MAX_IMAGES} per request.` },
          { status: 400 }
        );
      }
      if (urls.some((u) => typeof u !== "string" || !u)) {
        return NextResponse.json({ error: "Every entry in imageUrls must be a non-empty string" }, { status: 400 });
      }
      buffers = await Promise.all(urls.map(toBuffer));
    }

    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < buffers.length; i++) {
      const p = path.join(os.tmpdir(), `stratix_motion_${stamp}_${i}.tmp`);
      fs.writeFileSync(p, buffers[i]);
      tmpFiles.push(p);
    }

    const scriptPath = path.join(process.cwd(), "scripts", "motion_segment.py");
    const pythonBin = process.env.PYTHON_BIN || "python3";

    // One spawn for the whole batch: python imports (cv2, tesseract) stay warm,
    // so every image is processed by the exact same code path and the 5th
    // poster comes back identical in quality to the 1st.
    const timeout = Math.min(280_000, 30_000 + tmpFiles.length * 25_000);

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
                  ? `Decomposition timed out after ${Math.round(timeout / 1000)}s for ${tmpFiles.length} image(s)`
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

    // The script emits a bare object for one image and {results:[...]} for many.
    // Callers that sent imageUrls always get an array back, whatever the count.
    if (batch) {
      const results = Array.isArray(parsed?.results) ? parsed.results : [parsed];
      return NextResponse.json({ success: true, count: results.length, results });
    }
    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Motion Segmentation error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to segment image for motion video" },
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
