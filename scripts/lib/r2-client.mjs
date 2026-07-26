/**
 * Standalone, plain-ESM Cloudflare R2 client for scripts run via plain `node`
 * (GitHub Actions' update_candles.mjs / backfill_candle_gaps.mjs, and the
 * local verify script) — deliberately NOT importing lib/r2.ts, since plain
 * `node` can't load a .ts file without a loader, and these scripts need to
 * keep running exactly as `node scripts/....mjs` in CI.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET_NAME;

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/** Reads an object's body as UTF-8 text. Returns null if the key doesn't exist. */
export async function getObjectText(key) {
  try {
    const res = await r2Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return await res.Body.transformToString("utf-8");
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Writes UTF-8 text (e.g. a CSV) to an object key. */
export async function putObjectText(key, text) {
  await r2Client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: text, ContentType: "text/csv" })
  );
}

/** Lists every object key under a prefix, paginating past the 1000-key page limit. */
export async function listObjectKeys(prefix) {
  const keys = [];
  let token;
  do {
    const res = await r2Client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
