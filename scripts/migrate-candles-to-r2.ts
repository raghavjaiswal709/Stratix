/**
 * One-off, idempotent, non-destructive migration: uploads every local candle
 * CSV (public/data/candles/{symbol}/{symbol}_{yyyy}_{mm}.csv) to Cloudflare R2
 * under the `candles/{symbol}/{filename}` prefix.
 *
 * SAFETY MODEL:
 *  - Local files are never modified or deleted by this script. They remain
 *    the on-disk source of truth until a separate, later verification step
 *    (scripts/verify-candles-r2.mjs) exhaustively confirms every file matches
 *    its R2 copy.
 *  - Idempotent: re-running skips any key that already exists in R2 with a
 *    byte-size that matches the local file (cheap HeadObject check), so an
 *    interrupted run can always be safely re-run from scratch.
 *  - Any per-file error is caught and logged; the run continues and reports
 *    a full failure list at the end rather than aborting.
 *
 * Usage:
 *   npx tsx scripts/migrate-candles-to-r2.ts --dry-run           (default/safe)
 *   npx tsx scripts/migrate-candles-to-r2.ts --execute
 *   npx tsx scripts/migrate-candles-to-r2.ts --execute --limit=120   (~1 symbol)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CANDLES_DIR = path.join(__dirname, "../public/data/candles");

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

interface LocalFile {
  symbol: string;
  fileName: string;
  filePath: string;
  size: number;
}

function discoverFiles(): LocalFile[] {
  const symbols = fs
    .readdirSync(CANDLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const files: LocalFile[] = [];
  for (const symbol of symbols) {
    const dir = path.join(CANDLES_DIR, symbol);
    const csvFiles = fs
      .readdirSync(dir)
      .filter((f) => /^.+_\d{4}_\d{2}\.csv$/.test(f))
      .sort();
    for (const fileName of csvFiles) {
      const filePath = path.join(dir, fileName);
      files.push({ symbol, fileName, filePath, size: fs.statSync(filePath).size });
    }
  }
  return files;
}

async function main() {
  console.log("=".repeat(70));
  console.log(`CANDLE DATA → R2 MIGRATION — ${EXECUTE ? "EXECUTE MODE (will upload)" : "DRY RUN (read-only, no uploads)"}`);
  console.log(`Target bucket: ${process.env.R2_BUCKET_NAME} (account ${process.env.R2_ACCOUNT_ID})`);
  if (LIMIT) console.log(`Limit: ${LIMIT} file(s)`);
  console.log("=".repeat(70));

  const { putObjectText, r2Client } = await import("../lib/r2");
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const BUCKET = process.env.R2_BUCKET_NAME!;

  let files = discoverFiles();
  const symbolCount = new Set(files.map((f) => f.symbol)).size;
  console.log(`Discovered ${files.length} local CSV file(s) across ${symbolCount} symbol director(y/ies).`);

  if (LIMIT) files = files.slice(0, LIMIT);

  let uploaded = 0;
  let skippedAlready = 0;
  let failed = 0;
  const failures: { file: string; error: string }[] = [];

  for (const f of files) {
    const key = `candles/${f.symbol}/${f.fileName}`;
    try {
      // Idempotency check: skip if R2 already has this exact byte size.
      let existingSize: number | null = null;
      try {
        const head = await r2Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        existingSize = head.ContentLength ?? null;
      } catch {
        existingSize = null; // doesn't exist yet — normal
      }

      if (existingSize === f.size) {
        skippedAlready++;
        continue;
      }

      console.log(`  [${EXECUTE ? "execute" : "dry-run"}] ${key} (${f.size} bytes)`);
      if (EXECUTE) {
        const text = fs.readFileSync(f.filePath, "utf8");
        await putObjectText(key, text);
      }
      uploaded++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ file: key, error: message });
      console.error(`    FAILED ${key}: ${message}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`Scanned:            ${files.length}`);
  console.log(`${EXECUTE ? "Uploaded" : "Would upload"}:       ${uploaded}`);
  console.log(`Already in R2:      ${skippedAlready}`);
  console.log(`Failed:             ${failed}`);

  if (failures.length > 0) {
    console.log("\nFAILED FILES:");
    failures.forEach(({ file, error }) => console.log(`  - ${file}: ${error}`));
  }

  if (!EXECUTE) {
    console.log("\nThis was a DRY RUN — nothing was uploaded. Re-run with --execute to apply.");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
