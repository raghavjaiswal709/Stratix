/**
 * One-off, idempotent, non-destructive migration: moves base64-embedded
 * screenshots (TradeEntry + MissedTrade) into Cloudflare R2, replacing the
 * `screenshots` field with R2 object keys.
 *
 * SAFETY MODEL — read before running with --execute:
 *  - Nothing is ever deleted. Every migrated document gets a permanent
 *    `screenshotsBase64Backup` field holding the exact pre-migration
 *    `screenshots` array, written once and never touched again by anything.
 *  - Uploads are the exact original bytes — no re-compression — so the
 *    migration itself can never change image quality/content.
 *  - Writes are scoped `$set` on single fields via `updateOne`, never a
 *    whole-document save, so unrelated concurrent edits are never clobbered.
 *  - A conflict guard re-checks `screenshots` immediately before the final
 *    write and skips (rather than overwrites) if it changed since the
 *    snapshot was taken.
 *  - Any per-document error is caught and logged; the run continues.
 *
 * Usage:
 *   npx tsx scripts/migrate-screenshots-to-r2.ts --dry-run           (default/safe)
 *   npx tsx scripts/migrate-screenshots-to-r2.ts --execute
 *   npx tsx scripts/migrate-screenshots-to-r2.ts --execute --limit=3
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

const DATA_URI_RE = /^data:(image\/\w+);base64,([\s\S]+)$/;
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

interface Counters {
  scanned: number;
  migrated: number;
  alreadyClean: number;
  skippedConflict: number;
  failed: number;
  failedIds: { id: string; error: string }[];
}

function newCounters(): Counters {
  return { scanned: 0, migrated: 0, alreadyClean: 0, skippedConflict: 0, failed: 0, failedIds: [] };
}

async function migrateModel(
  modelName: string,
  Model: any,
  scope: "journal" | "missed-trade",
  uploadBufferToR2: (key: string, buffer: Buffer, contentType: string) => Promise<void>
): Promise<Counters> {
  const counters = newCounters();

  const query = Model.find({ screenshots: { $elemMatch: { $regex: "^data:" } } }).lean();
  if (LIMIT) query.limit(LIMIT);
  const cursor = query.cursor();

  for await (const doc of cursor) {
    counters.scanned++;
    const id = String(doc._id);
    const originalScreenshots: string[] = doc.screenshots ?? [];

    if (!originalScreenshots.some((s) => s.startsWith("data:"))) {
      counters.alreadyClean++;
      continue;
    }

    try {
      const newScreenshots: string[] = [];
      for (const entry of originalScreenshots) {
        if (!entry.startsWith("data:")) {
          newScreenshots.push(entry); // already a key (partially migrated) — pass through
          continue;
        }
        const match = entry.match(DATA_URI_RE);
        if (!match) throw new Error("Unrecognized data URI format");
        const [, mime, base64Part] = match;
        const ext = MIME_TO_EXT[mime] ?? "bin";
        const buffer = Buffer.from(base64Part, "base64");
        const key = `${doc.userId}/${scope}/${crypto.randomUUID()}.${ext}`;

        if (EXECUTE) {
          await uploadBufferToR2(key, buffer, mime);
        }
        newScreenshots.push(key);
      }

      console.log(
        `  [${EXECUTE ? "execute" : "dry-run"}] ${modelName} ${id}: ${originalScreenshots.length} screenshot(s) ` +
          `(${originalScreenshots.reduce((n, s) => n + (s.startsWith("data:") ? 1 : 0), 0)} to migrate)`
      );

      if (!EXECUTE) {
        counters.migrated++;
        continue;
      }

      // 1) Idempotent, atomic backup — written once, ever.
      await Model.updateOne(
        { _id: id, screenshotsBase64Backup: { $exists: false } },
        { $set: { screenshotsBase64Backup: originalScreenshots } }
      );

      // 2) Conflict guard — bail if `screenshots` changed since we snapshotted it.
      const fresh = await Model.findById(id).select("screenshots").lean();
      const freshScreenshots: string[] = fresh?.screenshots ?? [];
      const unchanged =
        freshScreenshots.length === originalScreenshots.length &&
        freshScreenshots.every((v, i) => v === originalScreenshots[i]);
      if (!unchanged) {
        counters.skippedConflict++;
        console.log(`    SKIPPED (concurrent edit detected) — will be retried on the next run`);
        continue;
      }

      // 3) Scoped, single-field write.
      await Model.updateOne({ _id: id }, { $set: { screenshots: newScreenshots } });
      counters.migrated++;
    } catch (err) {
      counters.failed++;
      const message = err instanceof Error ? err.message : String(err);
      counters.failedIds.push({ id, error: message });
      console.error(`    FAILED ${modelName} ${id}: ${message}`);
    }
  }

  return counters;
}

async function main() {
  console.log("=".repeat(70));
  console.log(`R2 SCREENSHOT MIGRATION — ${EXECUTE ? "EXECUTE MODE (will write)" : "DRY RUN (read-only, no writes, no uploads)"}`);
  console.log(`Target bucket: ${process.env.R2_BUCKET_NAME} (account ${process.env.R2_ACCOUNT_ID})`);
  if (LIMIT) console.log(`Limit: ${LIMIT} document(s) per model`);
  console.log("=".repeat(70));

  const { default: dbConnect } = await import("../lib/mongodb");
  const { TradeEntryModel } = await import("../lib/models/TradeEntry");
  const { MissedTradeModel } = await import("../lib/models/MissedTrade");
  const { uploadBufferToR2 } = await import("../lib/r2");

  await dbConnect();

  const journalCounters = await migrateModel("TradeEntry", TradeEntryModel, "journal", uploadBufferToR2);
  const missedCounters = await migrateModel("MissedTrade", MissedTradeModel, "missed-trade", uploadBufferToR2);

  const total = newCounters();
  for (const c of [journalCounters, missedCounters]) {
    total.scanned += c.scanned;
    total.migrated += c.migrated;
    total.alreadyClean += c.alreadyClean;
    total.skippedConflict += c.skippedConflict;
    total.failed += c.failed;
    total.failedIds.push(...c.failedIds);
  }

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`TradeEntry:   scanned=${journalCounters.scanned} migrated${EXECUTE ? "" : " (would-migrate)"}=${journalCounters.migrated} alreadyClean=${journalCounters.alreadyClean} skippedConflict=${journalCounters.skippedConflict} failed=${journalCounters.failed}`);
  console.log(`MissedTrade:  scanned=${missedCounters.scanned} migrated${EXECUTE ? "" : " (would-migrate)"}=${missedCounters.migrated} alreadyClean=${missedCounters.alreadyClean} skippedConflict=${missedCounters.skippedConflict} failed=${missedCounters.failed}`);
  console.log(`TOTAL:        scanned=${total.scanned} migrated${EXECUTE ? "" : " (would-migrate)"}=${total.migrated} alreadyClean=${total.alreadyClean} skippedConflict=${total.skippedConflict} failed=${total.failed}`);

  if (total.failedIds.length > 0) {
    console.log("\nFAILED DOCUMENTS (not modified, safe to investigate/retry):");
    total.failedIds.forEach(({ id, error }) => console.log(`  - ${id}: ${error}`));
  }

  if (!EXECUTE) {
    console.log("\nThis was a DRY RUN — no data was uploaded or written. Re-run with --execute to apply.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
