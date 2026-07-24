/**
 * candle-storage.mjs
 *
 * Shared read/write layer for the on-disk candle CSVs, used by both the
 * scheduled incremental updater (update_candles.mjs) and the gap backfill
 * tools (backfill_candle_gaps.mjs). Extracted so both write through the exact
 * same append/dedup logic instead of two copies drifting apart over time.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const CANDLES_DIR = path.join(__dirname, '../../public/data/candles');

// Must match download_candles.mjs exactly so existing files stay consistent.
export const PRICE_PRECISION = {
  eurusd: 5, gbpusd: 5, usdcad: 5, nzdusd: 5, audusd: 5, usdchf: 5,
  usdjpy: 3,
  xauusd: 2, xagusd: 3,
  ethusd: 2, btcusdt: 2,
  dxy: 3, usoil: 2, us100: 2,
};

/**
 * Scan a symbol's directory, find the newest monthly CSV, and return the Unix
 * timestamp (seconds) of its very last data row.
 * Returns null if no data exists yet.
 */
export function getLastCandleTimestamp(symbol) {
  const dir = path.join(CANDLES_DIR, symbol);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter(f => /^.+_\d{4}_\d{2}\.csv$/.test(f))
    .sort();                          // lexicographic sort → chronological

  if (files.length === 0) return null;

  const latestFile = files[files.length - 1];
  const filePath   = path.join(dir, latestFile);
  const content    = fs.readFileSync(filePath, 'utf8');

  // Split by newline, drop header row, find last non-empty row
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return null;

  const lastLine = lines[lines.length - 1];
  const ts = parseInt(lastLine.split(',')[0], 10);

  return Number.isFinite(ts) ? ts : null;
}

/**
 * Write new candles into the correct monthly CSV files.
 * Existing files are never truncated — only new rows are appended, and
 * insertion is dedup'd by timestamp, so out-of-order or overlapping input
 * (e.g. a gap backfill landing in the middle of a month) is safe to call.
 *
 * @param {string} symbol
 * @param {Array}  candles — raw objects with timestamp in ms (Dukascopy or
 *                 Twelve Data shape — both normalize to the same fields)
 * @returns {number} total candles written
 */
export function persistCandles(symbol, candles) {
  const dp  = PRICE_PRECISION[symbol] ?? 5;
  const dir = path.join(CANDLES_DIR, symbol);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Group by YYYY_MM
  const byMonth = {};
  for (const c of candles) {
    const d   = new Date(c.timestamp);
    const yr  = d.getUTCFullYear();
    const mo  = String(d.getUTCMonth() + 1).padStart(2, '0');
    const key = `${yr}_${mo}`;
    (byMonth[key] ??= []).push(c);
  }

  let totalWritten = 0;

  for (const [monthKey, monthCandles] of Object.entries(byMonth)) {
    // Always sort chronologically within the month
    const sorted   = monthCandles.sort((a, b) => a.timestamp - b.timestamp);
    const fileName = `${symbol}_${monthKey}.csv`;
    const filePath = path.join(dir, fileName);

    // Serialise to CSV rows (no header)
    const newRows = sorted.map(c => {
      const ts = Math.floor(c.timestamp / 1000);
      return [
        ts,
        Number(c.open).toFixed(dp),
        Number(c.high).toFixed(dp),
        Number(c.low).toFixed(dp),
        Number(c.close).toFixed(dp),
        Number(c.volume).toFixed(2),
      ].join(',');
    });

    if (fs.existsSync(filePath)) {
      // ── Merge into existing file ───────────────────────────────────────
      // Not just append: backfilled rows can land anywhere in the month
      // (mid-file, not just at the end), so read the whole file, add the
      // genuinely-new rows, and re-sort chronologically before writing back.
      const existingLines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
      const header         = existingLines[0];
      const existingRows    = existingLines.slice(1);
      const existingSet     = new Set(existingRows.map(l => l.split(',')[0]));

      const toAdd = newRows.filter(r => !existingSet.has(r.split(',')[0]));
      if (toAdd.length === 0) {
        console.log(`    [${symbol}] ${fileName}: 0 new candles (all already present)`);
        continue;
      }

      const allRows = [...existingRows, ...toAdd].sort(
        (a, b) => parseInt(a.split(',')[0], 10) - parseInt(b.split(',')[0], 10)
      );
      fs.writeFileSync(filePath, [header, ...allRows].join('\n'));
      console.log(`    [${symbol}] ${fileName}: +${toAdd.length} candles merged`);
      totalWritten += toAdd.length;

    } else {
      // ── Create brand-new monthly file ─────────────────────────────────
      const content = ['time,open,high,low,close,volume', ...newRows].join('\n');
      fs.writeFileSync(filePath, content);
      console.log(`    [${symbol}] ${fileName}: created with ${newRows.length} candles`);
      totalWritten += newRows.length;
    }
  }

  return totalWritten;
}
