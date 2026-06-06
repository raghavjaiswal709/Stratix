/**
 * update_candles.mjs
 *
 * Incremental Dukascopy candle updater.
 *
 * For every symbol it:
 *   1. Reads the most-recent monthly CSV and extracts the last candle timestamp
 *      (exact to the second — no gap tolerated).
 *   2. Fetches m1 candles from (last_ts + 1 min) up to (now – BUFFER_MINS).
 *   3. Groups new candles by year-month and either:
 *        – appends to the existing month CSV (dedup by timestamp), or
 *        – creates a new month CSV with the standard header.
 *
 * Called by .github/workflows/update_candles.yml before each session.
 * Never modifies existing candle rows — purely additive.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getHistoricRates, Timeframe, Instrument } from 'dukascopy-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Config ───────────────────────────────────────────────────────────────────

const CANDLES_DIR  = path.join(__dirname, '../public/data/candles');
const CACHE_DIR    = path.join(__dirname, '../.dukascopy-cache');

/**
 * Dukascopy's real-time feed has an inherent lag (varies by instrument).
 * We leave a 10-minute buffer on the "to" side so we never request
 * in-progress or not-yet-committed candles.
 */
const BUFFER_MINS = 10;

// ─── Instrument map (matches download_candles.mjs exactly) ───────────────────

const INSTRUMENT_MAP = {
  xauusd:  Instrument.xauusd,
  xagusd:  Instrument.xagusd,
  eurusd:  Instrument.eurusd,
  gbpusd:  Instrument.gbpusd,
  usdcad:  Instrument.usdcad,
  usdjpy:  Instrument.usdjpy,
  nzdusd:  Instrument.nzdusd,
  audusd:  Instrument.audusd,
  usdchf:  Instrument.usdchf,
  ethusd:  Instrument.ethusd,
  btcusdt: Instrument.btcusd,
  dxy:     Instrument.dollaridxusd,
  usoil:   Instrument.lightcmdusd,
  us100:   Instrument.usatechidxusd,
};

// Must match download_candles.mjs exactly so existing files stay consistent.
const PRICE_PRECISION = {
  eurusd: 5, gbpusd: 5, usdcad: 5, nzdusd: 5, audusd: 5, usdchf: 5,
  usdjpy: 3,
  xauusd: 2, xagusd: 3,
  ethusd: 2, btcusdt: 2,
  dxy: 3, usoil: 2, us100: 2,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utcLabel(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/**
 * Scan a symbol's directory, find the newest monthly CSV, and return the Unix
 * timestamp (seconds) of its very last data row.
 * Returns null if no data exists yet.
 */
function getLastCandleTimestamp(symbol) {
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
 * Existing files are never truncated — only new rows are appended.
 * Deduplication is done by comparing Unix timestamps.
 *
 * @param {string} symbol
 * @param {Array}  candles — raw objects from dukascopy-node (timestamp in ms)
 * @returns {number} total candles written
 */
function persistCandles(symbol, candles) {
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
      // ── Append to existing file ────────────────────────────────────────
      const existing    = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
      const existingSet = new Set(existing.slice(1).map(l => l.split(',')[0]));

      const toWrite = newRows.filter(r => !existingSet.has(r.split(',')[0]));
      if (toWrite.length === 0) {
        console.log(`    [${symbol}] ${fileName}: 0 new candles (all already present)`);
        continue;
      }

      // Files have no trailing newline — prefix with \n
      fs.appendFileSync(filePath, '\n' + toWrite.join('\n'));
      console.log(`    [${symbol}] ${fileName}: +${toWrite.length} candles appended`);
      totalWritten += toWrite.length;

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

// ─── Per-symbol update ────────────────────────────────────────────────────────

async function updateSymbol(symbol) {
  const pad = ' '.repeat(Math.max(0, 8 - symbol.length));
  const tag = `[${symbol.toUpperCase()}]${pad}`;

  const lastTsSec = getLastCandleTimestamp(symbol);
  if (lastTsSec === null) {
    console.log(`${tag} No existing data — run download_candles.mjs first. Skipping.`);
    return 0;
  }

  // fromDate is the minute AFTER the last known candle
  const fromDate  = new Date((lastTsSec + 60) * 1000);
  // toDate leaves BUFFER_MINS of breathing room to avoid partial candles
  const toDate    = new Date(Date.now() - BUFFER_MINS * 60 * 1000);

  console.log(`${tag} Last candle : ${utcLabel(lastTsSec * 1000)}`);
  console.log(`${tag} Fetch range : ${utcLabel(fromDate)} → ${utcLabel(toDate)}`);

  if (fromDate >= toDate) {
    console.log(`${tag} Already up-to-date. Nothing to fetch.`);
    return 0;
  }

  const gapMins = Math.round((toDate - fromDate) / 60_000);
  console.log(`${tag} Gap         : ~${gapMins} min (${(gapMins / 60).toFixed(1)} h)`);

  try {
    const raw = await getHistoricRates({
      instrument:     INSTRUMENT_MAP[symbol],
      dates:          { from: fromDate, to: toDate },
      timeframe:      Timeframe.m1,
      format:         'json',
      useCache:       false,          // always pull fresh for incremental updates
      cacheFolderPath: CACHE_DIR,
    });

    if (!raw || raw.length === 0) {
      console.log(`${tag} Dukascopy returned 0 candles (data not yet available).`);
      return 0;
    }

    // Extra safety: discard anything that isn't strictly newer than lastTsSec
    const fresh = raw.filter(c => Math.floor(c.timestamp / 1000) > lastTsSec);
    if (fresh.length === 0) {
      console.log(`${tag} Received ${raw.length} candle(s) but all already present locally.`);
      return 0;
    }

    console.log(`${tag} Received ${raw.length} candle(s), ${fresh.length} genuinely new.`);
    return persistCandles(symbol, fresh);

  } catch (err) {
    // Non-fatal: log the error and continue with the next symbol
    const msg = err?.message ?? String(err);
    console.error(`${tag} ERROR — ${msg}`);
    return 0;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const SESSION_NAME = process.env.SESSION_NAME ?? 'manual';
const RUN_AT       = new Date().toISOString();

console.log('='.repeat(60));
console.log(` STRATIX CANDLE UPDATE — ${SESSION_NAME.toUpperCase()} SESSION`);
console.log(` Run time (UTC): ${RUN_AT}`);
console.log(` Buffer        : ${BUFFER_MINS} min (avoids in-progress candles)`);
console.log(` Symbols       : ${Object.keys(INSTRUMENT_MAP).length}`);
console.log('='.repeat(60));

let grandTotal = 0;
const results  = [];

for (const symbol of Object.keys(INSTRUMENT_MAP)) {
  console.log('');
  const added = await updateSymbol(symbol);
  grandTotal += added;
  results.push({ symbol, added });
}

console.log('\n' + '='.repeat(60));
console.log(' SUMMARY');
console.log('='.repeat(60));
for (const { symbol, added } of results) {
  const bar = added > 0 ? `+${added}` : '—';
  console.log(`  ${symbol.padEnd(8)} ${bar}`);
}
console.log('─'.repeat(60));
console.log(`  TOTAL    +${grandTotal} new candles`);
console.log('='.repeat(60));

if (grandTotal === 0) {
  console.log('\nNote: 0 new candles. This is normal if Dukascopy has not yet');
  console.log('published data for the most recent period (instruments like');
  console.log('XAUUSD / metals can lag by 1-24 h). Next scheduled run will retry.');
}
