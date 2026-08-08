/**
 * Motion asset upload helper — uploads audio, music, CSV voiceover files and
 * overlay-clip videos directly to Cloudflare R2 via presigned URLs and
 * returns stable API proxy URLs.
 */

const MAX_ASSET_BYTES = 50 * 1024 * 1024; // 50 MB limit for audio & assets
const MAX_VIDEO_BYTES = 150 * 1024 * 1024; // overlay clips run heavier than audio/CSV

export async function uploadMotionAssetToR2(
  fileOrBlob: File | Blob,
  scope: "motion-audio" | "motion-music" | "motion-csv" | "motion-video",
  defaultContentType?: string
): Promise<string> {
  const maxBytes = scope === "motion-video" ? MAX_VIDEO_BYTES : MAX_ASSET_BYTES;
  if (fileOrBlob.size > maxBytes) {
    throw new Error(
      `File size is ${(fileOrBlob.size / (1024 * 1024)).toFixed(1)} MB — maximum allowed is ${maxBytes / (1024 * 1024)} MB.`
    );
  }

  let contentType = fileOrBlob.type || defaultContentType || "application/octet-stream";
  if (scope === "motion-csv" && (!contentType || contentType === "application/octet-stream")) {
    contentType = "text/csv";
  } else if ((scope === "motion-audio" || scope === "motion-music") && (!contentType || contentType === "application/octet-stream")) {
    contentType = "audio/mpeg";
  } else if (scope === "motion-video" && (!contentType || contentType === "application/octet-stream")) {
    contentType = "video/mp4";
  }

  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, scope }),
  });

  if (!presignRes.ok) {
    const errBody = await presignRes.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Presign upload failed (${presignRes.status}).`);
  }

  const { uploadUrl, key } = (await presignRes.json()) as { uploadUrl: string; key: string };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: fileOrBlob,
  });

  if (!putRes.ok) {
    throw new Error(`Direct storage upload failed with status ${putRes.status}.`);
  }

  return `/api/uploads/${key}`;
}
