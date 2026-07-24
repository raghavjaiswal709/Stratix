/**
 * backfill_candle_gaps.mjs
 *
 * One-off manual gap backfill — same mechanism as the bounded pass in
 * update_candles.mjs, but runnable directly with a higher (or unlimited)
 * call budget for clearing an existing backlog in one sitting instead of
 * waiting for it to trickle in over many scheduled runs.
 *
 * Usage:
 *   node scripts/backfill_candle_gaps.mjs --symbol=xauusd
 *   node scripts/backfill_candle_gaps.mjs --symbol=xauusd --limit=60
 *   node scripts/backfill_candle_gaps.mjs --all --limit=200
 *
 * Requires TWELVE_DATA_API_KEY in the environment (e.g. via .env.local —
 * load it yourself, this script doesn't read dotenv files).
 */

import { CANDLES_DIR, persistCandles } from './lib/candle-storage.mjs';
import { findGaps } from './lib/candle-gaps.mjs';
import { TWELVE_DATA_SYMBOL_MAP, fetchTwelveDataCandles } from './lib/twelvedata.mjs';

function utcLabel(sec) {
  return new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const has  = (name) => args.includes(`--${name}`);

const symbolArg = flag('symbol');
const runAll    = has('all');
const limit     = parseInt(flag('limit') ?? '200', 10);

if (!symbolArg && !runAll) {
  console.error('Usage: node scripts/backfill_candle_gaps.mjs --symbol=xauusd [--limit=N]');
  console.error('   or: node scripts/backfill_candle_gaps.mjs --all [--limit=N]');
  process.exit(1);
}

if (!process.env.TWELVE_DATA_API_KEY) {
  console.error('TWELVE_DATA_API_KEY is not set in the environment.');
  process.exit(1);
}

const symbols = runAll ? Object.keys(TWELVE_DATA_SYMBOL_MAP) : [symbolArg];
for (const s of symbols) {
  if (!(s in TWELVE_DATA_SYMBOL_MAP)) {
    console.error(`No Twelve Data mapping for "${s}". Mapped symbols: ${Object.keys(TWELVE_DATA_SYMBOL_MAP).join(', ')}`);
    process.exit(1);
  }
}

console.log('='.repeat(60));
console.log(' CANDLE GAP BACKFILL (manual run)');
console.log(` Symbols : ${symbols.join(', ')}`);
console.log(` Limit   : ${limit} Twelve Data call(s)`);
console.log('='.repeat(60));

let callsUsed = 0;
let totalFilled = 0;
let totalGapsSeen = 0;

for (const symbol of symbols) {
  if (callsUsed >= limit) break;

  // Newest-first: recent gaps are both more valuable to fix and more likely
  // to be within Twelve Data's plan's historical depth than decade-old ones.
  const gaps = findGaps(CANDLES_DIR, symbol, { minGapMinutes: 5 })
    .sort((a, b) => b.afterSec - a.afterSec);
  totalGapsSeen += gaps.length;
  console.log(`\n[${symbol}] ${gaps.length} known gap(s)`);
  if (gaps.length === 0) continue;

  let filled = 0;
  for (const gap of gaps) {
    if (callsUsed >= limit) {
      console.log(`  Reached call limit (${limit}) — ${gaps.length - filled} gap(s) left for next run.`);
      break;
    }
    callsUsed++;

    const from = new Date((gap.afterSec + 60) * 1000);
    const to   = new Date(gap.beforeSec * 1000);
    process.stdout.write(`  ${utcLabel(gap.afterSec)} -> ${utcLabel(gap.beforeSec)} (${gap.missingMinutes.toFixed(0)} min) ... `);

    const candles = await fetchTwelveDataCandles(symbol, from, to);
    if (candles.length === 0) {
      console.log('no data from Twelve Data');
      continue;
    }
    const written = persistCandles(symbol, candles);
    console.log(`got ${candles.length}, wrote ${written} new`);
    if (written > 0) filled++;
  }
  totalFilled += filled;
  console.log(`[${symbol}] filled ${filled}/${gaps.length} gap(s) this run`);
}

console.log('\n' + '='.repeat(60));
console.log(` DONE — filled ${totalFilled} gap(s) across ${symbols.length} symbol(s), used ${callsUsed}/${limit} call(s).`);
if (totalGapsSeen > totalFilled) {
  console.log(` ${totalGapsSeen - totalFilled} gap(s) remain — either no Twelve Data coverage for that`);
  console.log(' window, or the call limit was reached. Re-run to continue.');
}
console.log('='.repeat(60));
