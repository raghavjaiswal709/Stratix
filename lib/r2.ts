import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]*)$/;

/**
 * Uploads one base64 `data:` URL to R2 under this user and returns the
 * same-origin proxy path that serves it back — never the R2 URL directly.
 * Same-origin is load-bearing for callers that later draw the image onto a
 * <canvas> and read it back (export, thumbnails, toDataURL) — a
 * cross-origin image source would taint it. Non-data-URL input (already a
 * proxy path, or absent) passes through untouched.
 */
export async function persistDataUrlToR2(
  userId: string,
  dataUrl: string | undefined,
  folder: string
): Promise<string | undefined> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return dataUrl;
  const [, contentType, b64] = match;
  const ext = contentType.split("/")[1]?.split("+")[0] || "png";
  const key = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  await uploadBufferToR2(key, Buffer.from(b64, "base64"), contentType);
  return `/api/uploads/${key}`;
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

/**
 * Reads an object's body as UTF-8 text. Returns null (not a throw) when the
 * key doesn't exist yet — a normal case for e.g. a brand-new month file that
 * hasn't been written to R2 yet.
 */
export async function getObjectText(key: string): Promise<string | null> {
  try {
    const res = await r2Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return (await res.Body?.transformToString("utf-8")) ?? null;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === "NoSuchKey" || status === 404) return null;
    throw err;
  }
}

/**
 * Reads an object's raw bytes plus its stored content type. Returns null (not a
 * throw) for a missing key so callers can answer 404 cleanly.
 *
 * Used by the note-image proxy route. The bytes are deliberately served through
 * our own origin rather than via a redirect to a presigned R2 URL: the drawing
 * editor loads a saved image back into a <canvas> and then calls `toDataURL()`
 * on undo/save, which throws a SecurityError on a canvas tainted by a
 * cross-origin image. Same-origin bytes keep that path working.
 */
export async function getObjectBytes(
  key: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const res = await r2Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    return { bytes, contentType: res.ContentType ?? "application/octet-stream" };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === "NoSuchKey" || status === 404) return null;
    throw err;
  }
}

/** Direct server-side write of UTF-8 text (e.g. a CSV) to an object key. */
export async function putObjectText(key: string, text: string): Promise<void> {
  await r2Client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: text, ContentType: "text/csv" }));
}

/** Lists every object key under a prefix, transparently paginating past R2's 1000-key page limit. */
export async function listObjectKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await r2Client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    keys.push(...(res.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
