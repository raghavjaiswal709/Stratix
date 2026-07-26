import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.R2_BUCKET_NAME!;

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/** Presigned PUT URL for a direct browser-to-R2 upload — image bytes never pass through a Vercel function. */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(r2Client, command, { expiresIn });
}

/** Presigned GET URL — bucket stays private, so every read is served through a short-lived signed link. */
export async function getPresignedDownloadUrl(key: string, expiresIn = 4 * 60 * 60): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2Client, command, { expiresIn });
}

/** Direct server-side upload of raw bytes — used only by the one-off migration script. */
export async function uploadBufferToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await r2Client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

/**
 * Turns a stored `screenshots` array into directly-renderable strings: legacy
 * base64 `data:` entries pass through untouched, R2 object keys get resolved
 * to a fresh presigned GET URL. Never mutates the source array or throws on
 * empty/undefined input.
 */
export async function hydrateScreenshots(raw: string[] | undefined | null): Promise<string[]> {
  if (!raw || raw.length === 0) return [];
  return Promise.all(raw.map((entry) => (entry.startsWith("data:") ? entry : getPresignedDownloadUrl(entry))));
}
