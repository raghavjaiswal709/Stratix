// ─── IST-safe date bucketing ────────────────────────────────────────────────
//
// Root cause of the "trades bucketed on the wrong day/weekday" bug:
// MT5-imported trades (app/api/trade/import-csv, import-json) take the
// broker's raw "YYYY.MM.DD HH:MM:SS" export string — which is broker-SERVER
// wall-clock time, not UTC — and naively append "Z" before parsing. So every
// mt5-sourced entryTime/exitTime in the DB is really "broker civil time,
// mislabeled as UTC".
//
// Confirmed empirically: the exact same real candle reads 18:00 on this
// app's chart (which shifts true-UTC candles by +5:30 for IST display) and
// 15:30 on the MT5 terminal — a fixed 2h30m gap, which only works out if the
// broker's real offset is UTC+3 (5:30 − 3:00 = 2:30).
//
// Manually-entered trades (add-trade-modal.tsx) come from a <input
// type="datetime-local"> showing the trader's own (IST) wall clock, and are
// parsed server-side with `new Date(entryTime)` — no "Z", so the digits are
// stored as literal UTC on this app's UTC-timezone server. Net effect: the
// raw stored value's UTC-getter fields already equal true IST civil time,
// no correction needed.
//
// Both getISTDateKey/getISTWeekday/etc below read calendar fields via
// getUTC*() (never local get*()) so results never depend on the runtime's
// timezone (browser or server).

export type TradeTimeSource = "manual" | "mt5" | undefined;

/** Broker server offset from true UTC, derived from the MT5-vs-chart gap above. */
export const BROKER_UTC_OFFSET_MIN = 180; // UTC+3
/** IST is a fixed UTC+5:30 offset, no DST. */
export const IST_OFFSET_MIN = 330;

/** Net shift (minutes) from "as stored in DB" straight to true IST civil time. */
function netShiftMin(source: TradeTimeSource): number {
  // mt5: stored(=broker) - broker_offset (-> true UTC) + IST_offset (-> IST)
  // manual/unknown: stored already reads as IST digits — no shift.
  return source === "mt5" ? IST_OFFSET_MIN - BROKER_UTC_OFFSET_MIN : 0;
}

/** The real IST instant for a stored entryTime/exitTime. Read its fields with getUTC*(). */
export function toIST(input: Date | string | number, source: TradeTimeSource): Date {
  const stored = new Date(input);
  return new Date(stored.getTime() + netShiftMin(source) * 60_000);
}

/**
 * True UTC instant for a stored entryTime/exitTime — the genuine real-world
 * moment, usable to index into real UTC-timestamped market data (candles).
 * mt5: stored digits are broker civil time -> subtract the broker offset.
 * manual: stored digits are the trader's own IST civil time -> subtract IST.
 */
export function toTrueUTC(input: Date | string | number, source: TradeTimeSource): Date {
  const stored = new Date(input);
  const correctionMin = source === "mt5" ? BROKER_UTC_OFFSET_MIN : IST_OFFSET_MIN;
  return new Date(stored.getTime() - correctionMin * 60_000);
}

/** "YYYY-MM-DD" calendar-day key in true IST. */
export function getISTDateKey(input: Date | string | number, source: TradeTimeSource): string {
  const d = toIST(input, source);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM" calendar-month key in true IST. */
export function getISTMonthKey(input: Date | string | number, source: TradeTimeSource): string {
  const d = toIST(input, source);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 0=Sun..6=Sat weekday (native Date#getDay() convention), computed in true IST. */
export function getISTWeekday(input: Date | string | number, source: TradeTimeSource): number {
  return toIST(input, source).getUTCDay();
}

/** True UTC hour-of-day — for session-of-day (Asian/London/NY) bucketing, which is UTC by convention. */
export function getTrueUTCHour(input: Date | string | number, source: TradeTimeSource): number {
  return toTrueUTC(input, source).getUTCHours();
}

/** True IST calendar Date (day-granularity, for isSameDay-style comparisons). Time-of-day is zeroed. */
export function getISTCalendarDay(input: Date | string | number, source: TradeTimeSource): Date {
  const d = toIST(input, source);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Start of the current IST calendar week (Monday 00:00 IST), given a genuine
 * UTC "now" (e.g. `new Date()` — NOT a trade entryTime/exitTime, which must
 * go through toIST() above due to the mislabeling). Returned in the same
 * "IST digits stored as UTC" numeric space as toIST(), so it compares
 * directly against toIST(trade.entryTime, trade.source) results.
 */
export function getStartOfISTWeek(nowUTC: Date): Date {
  const ist = new Date(nowUTC.getTime() + IST_OFFSET_MIN * 60_000);
  const dow = ist.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMonday));
}
