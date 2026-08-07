import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { auth } from "@/lib/auth";
import { persistDataUrlToR2 } from "@/lib/r2";

const MAX_IMAGES = 50;
const STRENGTHS = new Set(["low", "standard", "high"]);

function readStrength(value: unknown): string {
  return typeof value === "string" && STRENGTHS.has(value) ? value : "low";
}

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

async function persistResultToR2(userId: string, result: any): Promise<any> {
  if (!result || result.error || !result.success) return result;
  const [backgroundUrl, originalUrl, layers] = await Promise.all([
    persistDataUrlToR2(userId, result.backgroundUrl, "motion-video"),
    persistDataUrlToR2(userId, result.originalUrl, "motion-video"),
    Promise.all(
      (result.layers || []).map(async (l: any) => ({
        ...l,
        imageUrl: await persistDataUrlToR2(userId, l.imageUrl, "motion-video"),
      }))
    ),
  ]);
  return { ...result, backgroundUrl, originalUrl, layers };
}

export async function handleMotionSegmentLocal(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tmpFiles: string[] = [];
  try {
    let buffers: Buffer[] = [];
    let batch = false;
    let strength = "low";

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
      strength = readStrength(form.get("strength"));
      batch = true;
    } else {
      const body = await req.json();
      const { imageUrl, imageUrls } = body ?? {};
      strength = readStrength(body?.strength);
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

    const scriptFolder = "scripts";
    const scriptPath = path.join(/*turbopackIgnore: true*/ process.cwd(), scriptFolder, "motion_segment.py");
    const pythonBin = process.env.PYTHON_BIN || "python3";

    const perImage = strength === "high" ? 45_000 : strength === "standard" ? 40_000 : 35_000;
    const timeout = Math.min(280_000, 30_000 + tmpFiles.length * perImage);

    const resultJson = await new Promise<string>((resolve, reject) => {
      execFile(
        pythonBin,
        [scriptPath, `--strength=${strength}`, ...tmpFiles],
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

    if (batch) {
      const rawResults = Array.isArray(parsed?.results) ? parsed.results : [parsed];
      const results = await Promise.all(rawResults.map((r: any) => persistResultToR2(session.user.id, r)));
      return NextResponse.json({ success: true, count: results.length, results });
    }
    const single = await persistResultToR2(session.user.id, parsed);
    return NextResponse.json(single);
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
