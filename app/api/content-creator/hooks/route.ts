import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { HookVideoEntry, HooksManifest } from "@/components/content-creator/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reads go straight to the static file at /hooks/hooks.json (same convention
// as app/api/ai-reports and app/api/news-reports — fetch() instead of
// fs.readFile avoids Next's build-time file tracer trying to bundle it).
// This route only exists for the writes a static file can't do itself.
const HOOKS_DIR = path.join(process.cwd(), "public", "hooks");
const MANIFEST_PATH = path.join(HOOKS_DIR, "hooks.json");

const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** Generous for a short hook clip, not for a full video. */
const MAX_HOOK_BYTES = 100 * 1024 * 1024;

async function readManifest(): Promise<HooksManifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.hooks) ? parsed : { hooks: [] };
  } catch {
    return { hooks: [] };
  }
}

async function writeManifest(manifest: HooksManifest): Promise<void> {
  await fs.mkdir(HOOKS_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

function vercelDisabledResponse() {
  return NextResponse.json(
    {
      error:
        "Uploading hooks writes to the local filesystem, which isn't available on Vercel. Run the app locally with 'npm run dev' to add or remove hooks — hooks already committed to the repo still play fine here.",
    },
    { status: 503 }
  );
}

/** POST /api/content-creator/hooks — uploads a new hook video. Local dev only, like motion-segment and remove-watermark. */
export async function POST(req: NextRequest) {
  if (process.env.VERCEL) return vercelDisabledResponse();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const ext = ALLOWED_VIDEO_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported video type "${file.type || "unknown"}" — use MP4, MOV or WebM.` },
      { status: 400 }
    );
  }
  if (file.size <= 0 || file.size > MAX_HOOK_BYTES) {
    return NextResponse.json(
      { error: `File must be under ${Math.round(MAX_HOOK_BYTES / (1024 * 1024))}MB.` },
      { status: 400 }
    );
  }

  const rawLabel = form.get("label");
  const label = (typeof rawLabel === "string" && rawLabel.trim()) || file.name.replace(/\.[^.]+$/, "") || "Hook";
  const rawDuration = form.get("durationMs");
  const durationMs =
    typeof rawDuration === "string" && Number.isFinite(Number(rawDuration)) ? Math.round(Number(rawDuration)) : null;

  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  const filePath = path.join(HOOKS_DIR, filename);

  await fs.mkdir(HOOKS_DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, bytes);

  const entry: HookVideoEntry = {
    id,
    label,
    filename,
    path: `/hooks/${filename}`,
    durationMs,
    sizeBytes: bytes.byteLength,
    addedAt: new Date().toISOString(),
  };

  try {
    const manifest = await readManifest();
    manifest.hooks.push(entry);
    await writeManifest(manifest);
  } catch (err) {
    // Keep hooks.json and the files on disk in perfect agreement — an entry
    // that failed to save must never leave an orphaned video behind.
    await fs.unlink(filePath).catch(() => {});
    console.error("Failed to update hooks.json:", err);
    return NextResponse.json({ error: "Saved the video but failed to update hooks.json." }, { status: 500 });
  }

  return NextResponse.json({ hook: entry });
}

/** DELETE /api/content-creator/hooks?id=... — removes a hook's file and manifest entry together. Local dev only. */
export async function DELETE(req: NextRequest) {
  if (process.env.VERCEL) return vercelDisabledResponse();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const manifest = await readManifest();
  const entry = manifest.hooks.find((h) => h.id === id);
  if (!entry) return NextResponse.json({ error: "Hook not found" }, { status: 404 });
  if (entry.isDefault) return NextResponse.json({ error: "The default USD hook can't be deleted." }, { status: 400 });

  manifest.hooks = manifest.hooks.filter((h) => h.id !== id);
  await writeManifest(manifest);
  await fs.unlink(path.join(HOOKS_DIR, entry.filename)).catch(() => {});

  return NextResponse.json({ ok: true });
}
