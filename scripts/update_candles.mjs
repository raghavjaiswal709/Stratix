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

import path from 'path';
import { fileURLToPath } from 'url';
import { getHistoricRates, Timeframe, Instrument } from 'dukascopy-node';
import { CANDLES_DIR, getLastCandleTimestamp, persistCandles } from './lib/candle-storage.mjs';
import { findGaps } from './lib/candle-gaps.mjs';
import { TWELVE_DATA_SYMBOL_MAP, fetchTwelveDataCandles } from './lib/twelvedata.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Config ───────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utcLabel(ts) {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ─── Chunked fetch with retry ─────────────────────────────────────────────────

const CHUNK_HOURS  = 24;   // fetch in 24-hour slices — keeps requests small & reliable
const MAX_RETRIES  = 3;    // per-chunk retry attempts
const RETRY_DELAY  = 4000; // ms between retries (linear backoff × attempt)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Fetch one time-slice for a given instrument, with up to MAX_RETRIES attempts.
 * Returns an array of candle objects (may be empty if the market was closed).
 */
async function fetchChunkWithRetry(instrument, from, to, tag, chunkLabel) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await getHistoricRates({
        instrument,
        dates:    { from, to },
        timeframe: Timeframe.m1,
        format:    'json',
        useCache:  false,
        cacheFolderPath: CACHE_DIR,
      });
      if (raw && raw.length > 0) return raw;

      // Got empty — may be a closed market window (weekend) or transient API gap.
      // Skip retries if the chunk is entirely within a known market-closed window:
      //   - Chunk ends on Saturday or Sunday (weekend)
      //   - Chunk starts on Friday at/after 21:00 UTC (market close)
      const toDay  = to.getUTCDay();
      const fromDay = from.getUTCDay();
      const isClosed =
        toDay === 6 || toDay === 0 ||                                   // to is Sat/Sun
        (fromDay === 5 && from.getUTCHours() >= 21);                    // from is Fri post-close
      if (isClosed || attempt === MAX_RETRIES) return [];

      console.log(`${tag}   chunk ${chunkLabel} attempt ${attempt}/${MAX_RETRIES}: 0 candles — retrying…`);
      await sleep(RETRY_DELAY * attempt);
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error(`${tag}   chunk ${chunkLabel} failed after ${MAX_RETRIES} attempts: ${err?.message ?? err}`);
        return [];
      }
      console.log(`${tag}   chunk ${chunkLabel} attempt ${attempt}/${MAX_RETRIES} error: ${err?.message ?? err} — retrying…`);
      await sleep(RETRY_DELAY * attempt);
    }
  }
  return [];
}

// ─── Per-symbol update ────────────────────────────────────────────────────────

async function updateSymbol(symbol) {
  const pad = ' '.repeat(Math.max(0, 8 - symbol.length));
  const tag = `[${symbol.toUpperCase()}]${pad}`;

  const lastTsSec = await getLastCandleTimestamp(symbol);
  if (lastTsSec === null) {
    console.log(`${tag} No existing data — run download_candles.mjs first. Skipping.`);
    return 0;
  }

  // fromDate is the minute AFTER the last known candle
  const fromDate = new Date((lastTsSec + 60) * 1000);
  // toDate leaves BUFFER_MINS of breathing room to avoid partial candles
  const toDate   = new Date(Date.now() - BUFFER_MINS * 60 * 1000);

  console.log(`${tag} Last candle : ${utcLabel(lastTsSec * 1000)}`);
  console.log(`${tag} Fetch range : ${utcLabel(fromDate)} → ${utcLabel(toDate)}`);

  if (fromDate >= toDate) {
    console.log(`${tag} Already up-to-date. Nothing to fetch.`);
    return 0;
  }

  const gapMins = Math.round((toDate - fromDate) / 60_000);
  console.log(`${tag} Gap         : ~${gapMins} min (${(gapMins / 60).toFixed(1)} h)`);

  // ── Split the gap into CHUNK_HOURS-sized slices ──────────────────────────
  const chunkMs = CHUNK_HOURS * 60 * 60 * 1000;
  const chunks  = [];
  let chunkStart = fromDate;
  while (chunkStart < toDate) {
    const chunkEnd = new Date(Math.min(chunkStart.getTime() + chunkMs, toDate.getTime()));
    chunks.push({ from: new Date(chunkStart), to: chunkEnd });
    chunkStart = chunkEnd;
  }

  const useChunks = chunks.length > 1;
  if (useChunks) {
    console.log(`${tag} Chunks      : ${chunks.length} × ${CHUNK_HOURS}h slices`);
  }

  // ── Fetch all chunks, collecting candles ─────────────────────────────────
  const allRaw = [];
  let failedChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    const { from, to } = chunks[i];
    const label = useChunks ? `${i + 1}/${chunks.length}` : '1/1';
    const raw   = await fetchChunkWithRetry(INSTRUMENT_MAP[symbol], from, to, tag, label);

    if (raw.length > 0) {
      allRaw.push(...raw);
    } else {
      // Count as failure only for weekday chunks during market hours
      const toDay   = to.getUTCDay();
      const fromDay = from.getUTCDay();
      const isKnownClosed =
        toDay === 6 || toDay === 0 ||
        (fromDay === 5 && from.getUTCHours() >= 21);
      if (!isKnownClosed) failedChunks++;
    }
  }

  if (failedChunks > 0) {
    console.log(`${tag} Warning: ${failedChunks}/${chunks.length} weekday chunk(s) returned 0 candles.`);
  }

  if (allRaw.length === 0) {
    console.log(`${tag} Dukascopy returned 0 candles total (market closed or data not yet available).`);
    return 0;
  }

  // Extra safety: discard anything that isn't strictly newer than lastTsSec
  const fresh = allRaw.filter(c => Math.floor(c.timestamp / 1000) > lastTsSec);
  if (fresh.length === 0) {
    console.log(`${tag} Received ${allRaw.length} candle(s) but all already present locally.`);
    return 0;
  }

  console.log(`${tag} Received ${allRaw.length} candle(s) total, ${fresh.length} genuinely new.`);
  return await persistCandles(symbol, fresh);
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

// ─── Gap backfill (Twelve Data) ────────────────────────────────────────────────
//
// A Dukascopy chunk that's still empty after retries (see fetchChunkWithRetry
// above) is silently skipped for that run — later, successful chunks still
// advance the file's "last timestamp" past it, so the normal incremental loop
// never revisits it. This pass finds those holes and fills them from Twelve
// Data instead, capped per run so one bad backlog can't blow the workflow's
// timeout or the API's rate limit. Steady-state, once history is caught up,
// this finds ~nothing and costs ~0 calls.

const BACKFILL_CAP = parseInt(process.env.BACKFILL_CAP ?? '15', 10);

console.log('\n' + '='.repeat(60));
console.log(` GAP BACKFILL — Twelve Data, up to ${BACKFILL_CAP} call(s) this run`);
console.log('='.repeat(60));

if (!process.env.TWELVE_DATA_API_KEY) {
  console.log('  TWELVE_DATA_API_KEY not set — skipping.');
} else {
  let callsUsed = 0;
  let totalFilled = 0;

  for (const symbol of Object.keys(TWELVE_DATA_SYMBOL_MAP)) {
    if (callsUsed >= BACKFILL_CAP) break;

    // Newest-first: recent gaps are both more valuable to fix and more likely
    // to be within Twelve Data's plan's historical depth than decade-old ones.
    const gaps = (await findGaps(CANDLES_DIR, symbol, { minGapMinutes: 5 }))
      .sort((a, b) => b.afterSec - a.afterSec);
    if (gaps.length === 0) continue;

    let filled = 0;
    for (const gap of gaps) {
      if (callsUsed >= BACKFILL_CAP) break;
      callsUsed++;

      const from = new Date((gap.afterSec + 60) * 1000);
      const to   = new Date(gap.beforeSec * 1000);
      const candles = await fetchTwelveDataCandles(symbol, from, to);
      if (candles.length > 0) {
        const written = await persistCandles(symbol, candles);
        if (written > 0) filled++;
      }
    }
    totalFilled += filled;
    console.log(`  [${symbol}] ${gaps.length} known gap(s), filled ${filled} this run`);
  }

  console.log('─'.repeat(60));
  console.log(`  Backfilled ${totalFilled} gap(s) using ${callsUsed} Twelve Data call(s).`);
  console.log('='.repeat(60));
}
