/**
 * candle-gaps.mjs
 *
 * Detects unexplained holes in a symbol's M1 candle history — timestamp jumps
 * larger than a threshold that aren't accounted for by an expected market
 * closure (weekend, or the daily settlement/rollover window brokers observe
 * around 21:00-22:00 UTC).
 *
 * Root cause this exists for: update_candles.mjs fetches in 24h chunks with
 * retry (see its history — fix(candles): chunked 24h fetch + retry, 2026-06-07).
 * A chunk that's still empty after retries is silently dropped: later chunks
 * in the same run still get merged and persisted, which advances the file's
 * "last timestamp" past the failed chunk — so that gap is never retried by
 * the normal incremental logic. This module finds those holes so they can be
 * backfilled from a second data source (see twelvedata.mjs).
 */

import fs from 'fs';
import path from 'path';

/**
 * True when [fromSec, toSec] is entirely inside an expected closure: the
 * weekly weekend, or the daily rollover window. The rollover is checked in
 * both UTC variants because it shifts an hour with US DST — the underlying
 * broker-local time is fixed, but its UTC clock time isn't.
 */
export function isExpectedClosure(fromSec, toSec) {
  const from = new Date(fromSec * 1000);
  const to   = new Date(toSec * 1000);
  const fromDay = from.getUTCDay();
  const toDay   = to.getUTCDay();

  const isWeekend =
    (fromDay === 6 || fromDay === 0 || (fromDay === 5 && from.getUTCHours() >= 20)) &&
    (toDay === 6 || toDay === 0 || (toDay === 1 && to.getUTCHours() <= 23));

  const fh = from.getUTCHours(), fm = from.getUTCMinutes();
  const th = to.getUTCHours(), tm = to.getUTCMinutes();
  const isDailyRollover =
    (fh === 20 && fm >= 55 && th === 22 && tm === 0) ||   // summer (DST) variant
    (fh === 21 && fm >= 55 && th === 23 && tm === 0);     // winter variant

  return isWeekend || isDailyRollover;
}

/** All existing candle timestamps (seconds, sorted) for a symbol across its monthly CSVs. */
export function readAllTimestamps(candlesDir, symbol) {
  const dir = path.join(candlesDir, symbol);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => /^.+_\d{4}_\d{2}\.csv$/.test(f)).sort();
  const ts = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    for (let i = 1; i < lines.length; i++) {
      const t = parseInt(lines[i].split(',')[0], 10);
      if (Number.isFinite(t)) ts.push(t);
    }
  }
  ts.sort((a, b) => a - b);
  return ts;
}

/**
 * Find unexplained gaps in a symbol's existing history.
 *
 * @param {string} candlesDir
 * @param {string} symbol
 * @param {{ minGapMinutes?: number }} opts — gaps at or below this size are
 *   ignored (normal thin-liquidity minute silences, not worth an API call).
 * @returns {{ afterSec: number, beforeSec: number, missingMinutes: number }[]}
 *   afterSec/beforeSec are the existing candles bracketing the hole — the
 *   caller should fetch (afterSec + 60) .. beforeSec to fill it.
 */
export function findGaps(candlesDir, symbol, { minGapMinutes = 5 } = {}) {
  const ts = readAllTimestamps(candlesDir, symbol);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) {
    const diffMin = (ts[i] - ts[i - 1]) / 60;
    if (diffMin > minGapMinutes && !isExpectedClosure(ts[i - 1], ts[i])) {
      gaps.push({ afterSec: ts[i - 1], beforeSec: ts[i], missingMinutes: diffMin - 1 });
    }
  }
  return gaps;
}
