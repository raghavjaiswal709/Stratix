import { compressImage, dataUrlToBlob } from "@/components/content-creator/imageUtils";

export type ScreenshotScope = "journal" | "missed-trade";

export interface UploadedScreenshot {
  /** The canonical R2 object key — this is what gets saved to MongoDB. */
  key: string;
  /** A local, instant preview URL (createObjectURL) — display-only, never persisted. */
  previewUrl: string;
}

/**
 * Compresses a screenshot client-side, then uploads it directly to R2 via a
 * presigned URL — the bytes never pass through a Vercel function, so this is
 * what keeps trade saves small regardless of how many/how large the images
 * are. `compressImage` always re-encodes to JPEG, so the upload content type
 * is always "image/jpeg".
 */
export async function uploadScreenshotToR2(
  dataUrl: string,
  scope: ScreenshotScope,
  maxDim = 1700
): Promise<UploadedScreenshot> {
  const compressed = await compressImage(dataUrl, maxDim);
  const blob = await dataUrlToBlob(compressed);
  const previewUrl = URL.createObjectURL(blob);

  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: "image/jpeg", scope }),
  });
  if (!presignRes.ok) {
    URL.revokeObjectURL(previewUrl);
    throw new Error("Failed to get upload URL");
  }
  const { uploadUrl, key } = await presignRes.json();

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!putRes.ok) {
    URL.revokeObjectURL(previewUrl);
    throw new Error("Failed to upload screenshot");
  }

  return { key, previewUrl };
}
