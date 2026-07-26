/**
 * Exhaustive (not sampled) integrity check: for every local candle CSV file,
 * confirms R2 holds an object at the matching key with the same byte size
 * and the same MD5 (compared against R2's ETag — valid 1:1 here because
 * every upload is a single-part PutObject, never multipart, so ETag == MD5
 * for all of these objects).
 *
 * Exits non-zero if anything is missing or mismatched — meant to be used as
 * a hard gate before any read/write path is cut over to R2.
 *
 * Usage: node scripts/verify-candles-r2.mjs
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CANDLES_DIR = path.join(__dirname, "../public/data/candles");

function discoverFiles() {
  const symbols = fs
    .readdirSync(CANDLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const files = [];
  for (const symbol of symbols) {
    const dir = path.join(CANDLES_DIR, symbol);
    const csvFiles = fs
      .readdirSync(dir)
      .filter((f) => /^.+_\d{4}_\d{2}\.csv$/.test(f))
      .sort();
    for (const fileName of csvFiles) {
      files.push({ symbol, fileName, filePath: path.join(dir, fileName) });
    }
  }
  return files;
}

async function main() {
  const { r2Client } = await import("./lib/r2-client.mjs");
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const BUCKET = process.env.R2_BUCKET_NAME;

  const files = discoverFiles();
  console.log(`Verifying ${files.length} local file(s) against R2 bucket "${BUCKET}"...\n`);

  let matched = 0;
  let missing = 0;
  let mismatched = 0;
  const problems = [];

  for (const f of files) {
    const key = `candles/${f.symbol}/${f.fileName}`;
    const localBuf = fs.readFileSync(f.filePath);
    const localMd5 = crypto.createHash("md5").update(localBuf).digest("hex");
    const localSize = localBuf.length;

    try {
      const head = await r2Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      const remoteEtag = (head.ETag ?? "").replace(/"/g, "");
      const remoteSize = head.ContentLength;

      if (remoteSize === localSize && remoteEtag === localMd5) {
        matched++;
      } else {
        mismatched++;
        problems.push(
          `MISMATCH ${key}: local(size=${localSize}, md5=${localMd5}) vs r2(size=${remoteSize}, etag=${remoteEtag})`
        );
      }
    } catch (err) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        missing++;
        problems.push(`MISSING ${key}`);
      } else {
        mismatched++;
        problems.push(`ERROR checking ${key}: ${err.message}`);
      }
    }
  }

  console.log("=".repeat(70));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(70));
  console.log(`Checked:    ${files.length}`);
  console.log(`Matched:    ${matched}`);
  console.log(`Missing:    ${missing}`);
  console.log(`Mismatched: ${mismatched}`);

  if (problems.length > 0) {
    console.log("\nPROBLEMS:");
    problems.forEach((p) => console.log(`  - ${p}`));
    console.log("\nVERIFICATION FAILED — do not proceed with any cutover.");
    process.exit(1);
  }

  console.log("\nAll files verified — R2 exactly matches local disk.");
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
