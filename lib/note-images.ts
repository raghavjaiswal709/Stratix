/**
 * Note image storage — keeps image bytes OUT of the note body.
 *
 * Trade notes live inside the single per-user `userdatas` document, and every
 * read of that document ships the whole thing while every save writes the whole
 * `tradeData` subtree back. Inlining images as base64 data URIs therefore turned
 * one note into a 4.2 MB document: reads took ~11-45s and saves exceeded the
 * driver's socket timeout, failing as RetryableWriteError. Uploading to R2 and
 * storing only a short URL keeps those documents in the low-KB range.
 */

const MAX_BYTES = 10 * 1024 * 1024;

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Uploads image bytes to R2 via a presigned PUT and returns the stable URL to
 * embed in note HTML. Throws with a user-presentable message on failure so the
 * caller can surface it rather than silently dropping the image.
 */
export async function uploadNoteImage(blob: Blob): Promise<string> {
  if (blob.size > MAX_BYTES) {
    throw new Error(
      `Image is ${(blob.size / 1048576).toFixed(1)} MB — the limit is ${MAX_BYTES / 1048576} MB.`
    );
  }

  const contentType = blob.type || "image/png";
  if (!SUPPORTED.has(contentType)) {
    throw new Error(`${contentType || "That file type"} isn't supported — use PNG, JPEG, WebP or GIF.`);
  }

  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, scope: "trade-note" }),
  });
  if (!presignRes.ok) {
    const body = (await presignRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not start the upload.");
  }
  const { uploadUrl, key } = (await presignRes.json()) as { uploadUrl: string; key: string };

  // Straight to R2 — the bytes never pass through a serverless function.
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!put.ok) {
    throw new Error(`Upload to storage failed (${put.status}).`);
  }

  return `/api/uploads/${key}`;
}

/**
 * Canvas `toDataURL()` output → Blob, so drawings and annotated figures take the
 * same upload path as picked files. Left as a no-op passthrough for values that
 * are already URLs (an unedited drawing that was migrated to R2).
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const commaAt = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaAt);
  const mime = header.match(/^data:([^;]+)/)?.[1] ?? "image/png";
  const binary = atob(dataUrl.slice(commaAt + 1));
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

/** True for the inline-base64 form we're migrating away from. */
export function isDataUri(value: string | undefined | null): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

/**
 * Uploads a canvas data URL and returns its R2 URL. Values that are already
 * URLs pass through untouched, which makes the editor's save handlers safe to
 * call regardless of whether the node still holds legacy base64.
 */
export async function persistCanvasImage(dataUrl: string): Promise<string> {
  if (!isDataUri(dataUrl)) return dataUrl;
  return uploadNoteImage(dataUrlToBlob(dataUrl));
}
