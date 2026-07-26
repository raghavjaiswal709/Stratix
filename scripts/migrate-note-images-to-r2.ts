/**
 * One-off, idempotent, non-destructive migration: moves base64-embedded images
 * out of trade-note HTML (`userdatas.tradeData.tradeNotes.notes[].content`) into
 * Cloudflare R2, replacing each `data:image/...;base64,...` URI with a stable
 * `/api/uploads/<key>` URL.
 *
 * WHY: notes live inside the single per-user `userdatas` document. Every
 * `GET /api/user-data` ships that whole document and every save writes the whole
 * `tradeData` subtree back. One note holding 4.2 MB of base64 PNGs made reads
 * take 11-45s and pushed writes past the driver's socketTimeoutMS, surfacing as
 * `MongoNetworkTimeoutError` / `RetryableWriteError` and starving the connection
 * pool for every other route.
 *
 * SAFETY MODEL — read before running with --execute:
 *  - Nothing is ever deleted. Each migrated user gets a document in the separate
 *    `tradenoteimagebackups` collection holding the exact pre-migration
 *    `tradeNotes` subtree, written once and never touched again.
 *  - The backup deliberately lives in its OWN collection, not on the userdata
 *    document: `GET /api/user-data` returns every field of that document, so an
 *    in-document backup would keep it multi-MB and defeat the whole migration.
 *  - Uploads are the exact original decoded bytes — no re-encoding — so image
 *    quality/content cannot change.
 *  - Identical images (byte-for-byte) upload once and share a key.
 *  - Writes are a scoped `$set` on `tradeData.tradeNotes.notes`, never a
 *    whole-document save, so unrelated concurrent edits aren't clobbered.
 *  - A conflict guard re-reads the notes immediately before the final write and
 *    skips (rather than overwrites) if they changed since the snapshot.
 *  - Any per-user error is caught and logged; the run continues.
 *
 * Usage:
 *   npx tsx scripts/migrate-note-images-to-r2.ts              (dry run, default)
 *   npx tsx scripts/migrate-note-images-to-r2.ts --execute
 *   npx tsx scripts/migrate-note-images-to-r2.ts --execute --limit=1
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

const BACKUP_COLLECTION = "tradenoteimagebackups";

// Base64 payload chars exclude `"` and `'`, so a greedy class match stops
// naturally at the end of the HTML attribute it lives in.
const DATA_URI_RE = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;

const MIME_TO_EXT: Record<string, string> = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
  "svg+xml": "svg",
};

interface Note {
  id: string;
  title: string;
  content: string;
  [k: string]: unknown;
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(2);

async function main() {
  console.log("=".repeat(72));
  console.log(
    `TRADE-NOTE IMAGE → R2 MIGRATION — ${
      EXECUTE ? "EXECUTE MODE (will upload + write)" : "DRY RUN (read-only, no uploads, no writes)"
    }`
  );
  console.log(`Target bucket: ${process.env.R2_BUCKET_NAME} (account ${process.env.R2_ACCOUNT_ID})`);
  if (LIMIT) console.log(`Limit: ${LIMIT} user document(s)`);
  console.log("=".repeat(72));

  const { MongoClient } = await import("mongodb");
  const { uploadBufferToR2 } = await import("../lib/r2");

  // Deliberately NOT lib/mongodb's shared connection: its socketTimeoutMS of 45s
  // is *shorter than the time it takes to read the very documents we're here to
  // fix* (4.2 MB at the M0 tier's ~0.09 MB/s is ~47s), so the migration would die
  // with the same MongoNetworkTimeoutError it exists to eliminate.
  const client = new MongoClient(process.env.MONGODB_URI!, {
    socketTimeoutMS: 600000,
    serverSelectionTimeoutMS: 30000,
    maxPoolSize: 4,
  });
  await client.connect();
  const db = client.db();
  const userdatas = db.collection("userdatas");
  const backups = db.collection(BACKUP_COLLECTION);

  // Two-phase read: pull only the ids first (a few bytes), then fetch one user's
  // notes at a time. Pulling every bloated document in one cursor would stack
  // multiple multi-MB transfers behind a single timeout.
  const idQuery = userdatas.find(
    { "tradeData.tradeNotes.notes.content": { $regex: "data:image/" } },
    { projection: { userId: 1 } }
  );
  if (LIMIT) idQuery.limit(LIMIT);
  const targets = await idQuery.toArray();

  console.log(`\nFound ${targets.length} user document(s) with inline base64 note images.\n`);

  const docs: { userId: string; tradeData?: Record<string, unknown> }[] = [];
  for (const t of targets) {
    const full = await userdatas.findOne(
      { _id: t._id },
      { projection: { userId: 1, "tradeData.tradeNotes": 1 } }
    );
    if (full) docs.push(full as unknown as { userId: string; tradeData?: Record<string, unknown> });
  }

  let scanned = 0;
  let migrated = 0;
  let skippedConflict = 0;
  let failed = 0;
  let bytesMoved = 0;
  let imagesUploaded = 0;
  let imagesDeduped = 0;
  const failures: { userId: string; error: string }[] = [];

  for (const doc of docs) {
    scanned++;
    const userId = String(doc.userId);
    const tradeData = (doc.tradeData ?? {}) as Record<string, unknown>;
    const tradeNotes = (tradeData.tradeNotes ?? {}) as { notes?: Note[]; categories?: unknown[] };
    const originalNotes: Note[] = Array.isArray(tradeNotes.notes) ? tradeNotes.notes : [];

    const beforeBytes = Buffer.byteLength(JSON.stringify(originalNotes));

    try {
      // Byte-identical images share one R2 object across this user's notes.
      const byHash = new Map<string, string>();
      let userImages = 0;
      let userDeduped = 0;

      const newNotes: Note[] = [];
      for (const note of originalNotes) {
        const content = typeof note.content === "string" ? note.content : "";
        if (!content.includes("data:image/")) {
          newNotes.push(note);
          continue;
        }

        // Collect every match first so uploads can be awaited (String.replace
        // cannot await an async replacer).
        const matches = [...content.matchAll(DATA_URI_RE)];
        let rewritten = content;

        for (const m of matches) {
          const [full, subtype, base64Part] = m;
          const buffer = Buffer.from(base64Part, "base64");
          if (buffer.length === 0) continue;

          const hash = createHash("sha256").update(buffer).digest("hex");
          let url = byHash.get(hash);

          if (url) {
            userDeduped++;
          } else {
            const ext = MIME_TO_EXT[subtype.toLowerCase()] ?? "bin";
            const key = `${userId}/trade-note/${randomUUID()}.${ext}`;
            if (EXECUTE) {
              await uploadBufferToR2(key, buffer, `image/${subtype}`);
            }
            url = `/api/uploads/${key}`;
            byHash.set(hash, url);
            userImages++;
            bytesMoved += buffer.length;
          }

          rewritten = rewritten.split(full).join(url);
        }

        newNotes.push({ ...note, content: rewritten });
      }

      const afterBytes = Buffer.byteLength(JSON.stringify(newNotes));
      imagesUploaded += userImages;
      imagesDeduped += userDeduped;

      console.log(
        `  [${EXECUTE ? "execute" : "dry-run"}] user ${userId}: ` +
          `${originalNotes.length} note(s), ${userImages} image(s) uploaded` +
          `${userDeduped ? ` (+${userDeduped} deduped)` : ""} — ` +
          `notes ${mb(beforeBytes)} MB → ${mb(afterBytes)} MB`
      );

      if (!EXECUTE) {
        migrated++;
        continue;
      }

      // 1) Idempotent backup in its own collection — written once, ever.
      await backups.updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            migratedAt: new Date(),
            note: "Pre-migration tradeNotes subtree with inline base64 images. Safe to keep indefinitely.",
            tradeNotes,
          },
        },
        { upsert: true }
      );

      // 2) Conflict guard — bail if the notes changed since the snapshot.
      const fresh = await userdatas.findOne(
        { userId },
        { projection: { "tradeData.tradeNotes.notes": 1 } }
      );
      const freshNotes: Note[] =
        ((fresh?.tradeData as { tradeNotes?: { notes?: Note[] } } | undefined)?.tradeNotes?.notes) ?? [];
      const unchanged =
        freshNotes.length === originalNotes.length &&
        freshNotes.every((n, i) => n.content === originalNotes[i].content && n.id === originalNotes[i].id);
      if (!unchanged) {
        skippedConflict++;
        console.log(`    SKIPPED (concurrent edit detected) — re-run to retry this user`);
        continue;
      }

      // 3) Scoped, single-path write.
      await userdatas.updateOne({ userId }, { $set: { "tradeData.tradeNotes.notes": newNotes } });
      migrated++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ userId, error: message });
      console.error(`    FAILED user ${userId}: ${message}`);
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log("SUMMARY");
  console.log("=".repeat(72));
  console.log(`scanned=${scanned} migrated${EXECUTE ? "" : " (would-migrate)"}=${migrated} skippedConflict=${skippedConflict} failed=${failed}`);
  console.log(`images${EXECUTE ? " uploaded" : " to upload"}=${imagesUploaded} deduped=${imagesDeduped} bytes${EXECUTE ? " moved" : " to move"}=${mb(bytesMoved)} MB`);

  if (failures.length > 0) {
    console.log("\nFAILED USERS (not modified, safe to investigate/retry):");
    failures.forEach(({ userId, error }) => console.log(`  - ${userId}: ${error}`));
  }

  if (!EXECUTE) {
    console.log("\nThis was a DRY RUN — nothing was uploaded or written. Re-run with --execute to apply.");
  } else {
    console.log(`\nOriginals preserved in the \`${BACKUP_COLLECTION}\` collection.`);
  }

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
