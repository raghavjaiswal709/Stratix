// ─── smcEngine.ts ─────────────────────────────────────────────────────────────
// "Top G Trader" — Price Action & Smart Money Concepts structure engine.
//
// A single deterministic pass over a candle array that reproduces the strategy
// described in the data-explorer spec:
//
//   1. Structure via a strict TWO-candle retracement (one-candle on H4/D1).
//   2. TJL structure lines that extend from impulse origin until mitigated.
//   3. A+ demand / supply boxes restricted to the extreme 1 % of the body.
//   4. Break of Structure (BOS)  — body close beyond the last TJL.
//   5. Change of Character (ChoCh) — two consecutive bodies beyond the last
//      opposing structural extreme → trend reset + high-priority Extreme A+.
//   6. Dual-ChoCh — a freshly printed ChoCh extreme that is itself broken
//      before its A+ is tapped → trend flips back, Extreme A+ prioritised.
//   7. Fakeouts — wick sweeps a level, body fails to close beyond it.
//   8. Internal Structure Shift (ISS / 5-wave) inside the last impulse leg.
//   9. Fibonacci premium/discount (0.5–0.618) of the working leg.
//  10. Session-filtered, engulfing-confirmed execution signals.
//
// Everything is expressed in (time, price) space so the chart overlay can map
// it through lightweight-charts' timeToCoordinate / priceToCoordinate.
//
// The module is framework-free and side-effect-free: `computeSmc(candles, cfg)`
// is a pure function — identical input always yields identical output.

import type { Candle, Timeframe } from "./types";

// ── Public result shapes ──────────────────────────────────────────────────────

export type SwingKind = "high" | "low";
export type Trend     = "up" | "down" | "none";
export type Bias      = "bullish" | "bearish";

export interface Swing {
  kind:           SwingKind;
  price:          number;  // the extreme (high for a swing-high, low for a swing-low)
  time:           number;  // unix-seconds of the extreme candle
  index:          number;  // candle index of the extreme
  confirmedIndex: number;  // candle index where the retracement confirmed it
  label:          "HH" | "HL" | "LH" | "LL" | "H" | "L";
  fakeout:        boolean; // the extreme was set by a wick-sweep fakeout
}

export interface StructureLine {
  kind:      SwingKind;   // a high-line (resistance) or low-line (support)
  price:     number;
  startTime: number;      // impulse origin / extreme time
  startIndex:number;
  endTime:   number;      // mitigation time, or last candle if never mitigated
  endIndex:  number;
  mitigated: boolean;
  broken:    boolean;     // a body closed through it (BOS happened on this line)
}

export interface APlusBox {
  bias:     Bias;          // bullish = demand (buy), bearish = supply (sell)
  top:      number;
  bottom:   number;
  time:     number;        // origin (anchor) time
  index:    number;
  endTime:  number;        // right edge — extends until mitigated / last candle
  priority: "normal" | "extreme";
  label:    string;        // "A+", "Extreme A+"
  mitigated:boolean;
}

export type EventKind =
  | "BOS_UP" | "BOS_DOWN"
  | "CHOCH_UP" | "CHOCH_DOWN"
  | "DUAL_CHOCH_UP" | "DUAL_CHOCH_DOWN"
  | "FAKEOUT_HIGH" | "FAKEOUT_LOW"
  | "ISS_UP" | "ISS_DOWN";

export interface SmcEvent {
  kind:  EventKind;
  time:  number;
  index: number;
  price: number;          // the level / price the event printed at
  label: string;
}

export interface FibZone {
  bias:      Bias;
  from:      number;      // leg origin price
  to:        number;      // leg terminal price
  level50:   number;
  level618:  number;
  startTime: number;
  endTime:   number;
}

export interface SmcSignal {
  direction: "buy" | "sell";
  time:      number;
  index:     number;
  price:     number;       // the close that triggered (engulfing close)
  zoneTop:   number;
  zoneBottom:number;
  session:   string;       // "London" | "New York" | "Asian" | "Off-session"
  valid:     boolean;      // session-allowed AND engulfing-confirmed
  reason:    string;
}

export interface SmcResult {
  swings:  Swing[];
  lines:   StructureLine[];
  boxes:   APlusBox[];
  events:  SmcEvent[];
  fib:     FibZone | null;
  signals: SmcSignal[];
  trend:   Trend;
}

// ── Configuration ─────────────────────────────────────────────────────────────

export interface SmcConfig {
  pipSize:        number;   // one pip in price units (from getLotSpec)
  oneCandleRetrace: boolean;// true on H4/D1 — a single opposing candle confirms
  extremeFilterPips: number;// "50-pip rule": merge A+ levels closer than this
  boxBodyPct:     number;   // "1 % rule": fraction of body used for the box (0.01)
  sessions: {               // IST-based session windows (minutes from midnight)
    asian:  { startMin: number; endMin: number };
    london: { startMin: number; endMin: number };
    ny:     { startMin: number; endMin: number };
  };
  filterAsian:    boolean;  // when true, signals during the Asian session are invalid
}

// Whether a timeframe is allowed the relaxed one-candle retracement.
export function isHigherTimeframe(tf: Timeframe): boolean {
  return tf === "4H" || tf === "1D";
}

export function defaultSmcConfig(pipSize: number, tf: Timeframe): SmcConfig {
  return {
    pipSize,
    oneCandleRetrace:  isHigherTimeframe(tf),
    extremeFilterPips: 50,
    boxBodyPct:        0.01,
    // Defaults mirror the chart's existing IST session windows.
    sessions: {
      asian:  { startMin:  5 * 60 + 30, endMin:  9 * 60 + 30 },
      london: { startMin: 11 * 60 + 30, endMin: 14 * 60 + 30 },
      ny:     { startMin: 16 * 60 + 30, endMin: 21 * 60 + 30 },
    },
    filterAsian: false,
  };
}

// ── Small candle helpers ──────────────────────────────────────────────────────

const isBull = (c: Candle) => c.close > c.open;
const isBear = (c: Candle) => c.close < c.open;
const bodyTop = (c: Candle) => Math.max(c.open, c.close);
const bodyBot = (c: Candle) => Math.min(c.open, c.close);

// IST session name for a candle (chart uses IST / UTC+5:30).
function sessionOf(time: number, cfg: SmcConfig): string {
  const d = new Date((time + 19800) * 1000); // +5h30m
  const min = d.getUTCHours() * 60 + d.getUTCMinutes();
  const within = (w: { startMin: number; endMin: number }) =>
    w.startMin <= w.endMin
      ? min >= w.startMin && min < w.endMin
      : min >= w.startMin || min < w.endMin;
  if (within(cfg.sessions.london)) return "London";
  if (within(cfg.sessions.ny))     return "New York";
  if (within(cfg.sessions.asian))  return "Asian";
  return "Off-session";
}

// ── Retracement detectors ─────────────────────────────────────────────────────
//
// Bearish (selling) retracement that confirms a swing HIGH:
//   two consecutive red candles where the 2nd red BODY closes below the 1st red
//   candle's body close. On H4/D1 a single red candle is enough.
//
// Bullish (buying) retracement that confirms a swing LOW:
//   two consecutive green candles where the 2nd green BODY closes above the 1st
//   green candle's WICK (high). On H4/D1 a single green candle is enough.

function bearRetrace(cs: Candle[], i: number, oneCandle: boolean): boolean {
  if (i < 1) return false;
  const c = cs[i];
  if (oneCandle) return isBear(c);
  const p = cs[i - 1];
  return isBear(p) && isBear(c) && c.close < p.close;
}

function bullRetrace(cs: Candle[], i: number, oneCandle: boolean): boolean {
  if (i < 1) return false;
  const c = cs[i];
  if (oneCandle) return isBull(c);
  const p = cs[i - 1];
  return isBull(p) && isBull(c) && c.close > p.high;
}

// Argmax-high / argmin-low over an inclusive index window.
function argMaxHigh(cs: Candle[], a: number, b: number): number {
  let idx = a;
  for (let i = a + 1; i <= b; i++) if (cs[i].high >= cs[idx].high) idx = i;
  return idx;
}
function argMinLow(cs: Candle[], a: number, b: number): number {
  let idx = a;
  for (let i = a + 1; i <= b; i++) if (cs[i].low <= cs[idx].low) idx = i;
  return idx;
}

// ── Phase 1 — raw swing detection ─────────────────────────────────────────────
//
// Walk the series tracking the current leg's running extreme. When an opposing
// two-candle retracement fires, the running extreme is locked in as a swing and
// the leg direction flips. Fakeouts (wick beyond the prior swing, body inside)
// re-anchor the relevant extreme instead of breaking structure.

interface RawSwing { kind: SwingKind; index: number; confirmedIndex: number; fakeout: boolean }

function detectSwings(cs: Candle[], cfg: SmcConfig): RawSwing[] {
  const swings: RawSwing[] = [];
  if (cs.length < 3) return swings;

  let legDir: Trend = "none";
  let runHighIdx = 0;   // running max-high candidate for the next swing high
  let runLowIdx  = 0;   // running min-low candidate for the next swing low
  const oc = cfg.oneCandleRetrace;

  const pushSwing = (kind: SwingKind, index: number, confirmedIndex: number) => {
    swings.push({ kind, index, confirmedIndex, fakeout: false });
  };

  for (let i = 1; i < cs.length; i++) {
    // keep both running extremes current
    if (cs[i].high >= cs[runHighIdx].high) runHighIdx = i;
    if (cs[i].low  <= cs[runLowIdx].low)   runLowIdx  = i;

    if (legDir === "none") {
      // Seed: whichever retracement fires first establishes the first swing.
      if (bearRetrace(cs, i, oc)) {
        pushSwing("high", runHighIdx, i);
        legDir = "down";
        runLowIdx = argMinLow(cs, runHighIdx, i);
      } else if (bullRetrace(cs, i, oc)) {
        pushSwing("low", runLowIdx, i);
        legDir = "up";
        runHighIdx = argMaxHigh(cs, runLowIdx, i);
      }
    } else if (legDir === "up") {
      // climbing → looking to confirm a swing HIGH
      if (bearRetrace(cs, i, oc)) {
        pushSwing("high", runHighIdx, i);
        legDir = "down";
        runLowIdx = argMinLow(cs, runHighIdx, i);
      }
    } else {
      // legDir === "down" → looking to confirm a swing LOW
      if (bullRetrace(cs, i, oc)) {
        pushSwing("low", runLowIdx, i);
        legDir = "up";
        runHighIdx = argMaxHigh(cs, runLowIdx, i);
      }
    }
  }
  return swings;
}

// ── Phase 2 — structure, BOS, ChoCh, fakeouts, boxes ──────────────────────────

export function computeSmc(candles: Candle[], cfg: SmcConfig): SmcResult {
  const empty: SmcResult = {
    swings: [], lines: [], boxes: [], events: [], fib: null, signals: [], trend: "none",
  };
  if (!candles || candles.length < 5) return empty;
  const cs = candles;

  // 1. raw swings
  const raw = detectSwings(cs, cfg);
  if (raw.length === 0) return empty;

  // 2. label swings as HH/HL/LH/LL relative to the prior same-kind swing.
  const swings: Swing[] = raw.map(r => ({
    kind: r.kind,
    price: r.kind === "high" ? cs[r.index].high : cs[r.index].low,
    time: cs[r.index].time,
    index: r.index,
    confirmedIndex: r.confirmedIndex,
    label: r.kind === "high" ? "H" : "L",
    fakeout: false,
  }));
  {
    let prevHigh: Swing | null = null;
    let prevLow:  Swing | null = null;
    for (const s of swings) {
      if (s.kind === "high") {
        if (prevHigh) s.label = s.price > prevHigh.price ? "HH" : "LH";
        prevHigh = s;
      } else {
        if (prevLow) s.label = s.price > prevLow.price ? "HL" : "LL";
        prevLow = s;
      }
    }
  }

  // 3. forward candle walk — consume swings, detect BOS / ChoCh / fakeout.
  const events: SmcEvent[] = [];
  const boxes:  APlusBox[] = [];
  const lines:  StructureLine[] = [];

  // swings sorted by confirmation index (they already are)
  let sp = 0;                          // pointer into swings
  let curHigh: Swing | null = null;    // last confirmed swing high (resistance)
  let curLow:  Swing | null = null;    // last confirmed swing low (support)
  let trend: Trend = "none";

  // consecutive-close counters for ChoCh (need exactly two)
  let belowLowStreak = 0;
  let aboveHighStreak = 0;

  // line bookkeeping — index in `lines` of the still-active high/low line
  let activeHighLine = -1;
  let activeLowLine  = -1;

  // pending ChoCh whose Extreme A+ box has not yet been tapped (for Dual-ChoCh)
  let pendingChoch: { dir: Trend; extreme: number; boxIdx: number } | null = null;

  // absolute extremes of the working structure (for ChoCh reset anchor)
  let absHigh = { price: -Infinity, index: 0, time: cs[0].time };
  let absLow  = { price:  Infinity, index: 0, time: cs[0].time };

  const pushBox = (bias: Bias, originIdx: number, priority: "normal" | "extreme"): number => {
    const c = cs[originIdx];
    // 1 % rule — restrict the box to the extreme 1 % of the candle body.
    const bt = bodyTop(c), bb = bodyBot(c);
    const body = Math.max(bt - bb, cfg.pipSize); // guard against doji
    const thick = Math.max(body * cfg.boxBodyPct, cfg.pipSize * 0.5);
    let top: number, bottom: number;
    if (bias === "bullish") {
      // demand — anchored to the candle low (extreme of a down-origin)
      bottom = c.low;
      top    = c.low + thick;
    } else {
      // supply — anchored to the candle high
      top    = c.high;
      bottom = c.high - thick;
    }
    boxes.push({
      bias, top, bottom, time: c.time, index: originIdx,
      endTime: cs[cs.length - 1].time,
      priority, mitigated: false,
      label: priority === "extreme" ? "Extreme A+" : "A+",
    });
    return boxes.length - 1;
  };

  const openLine = (s: Swing): number => {
    lines.push({
      kind: s.kind, price: s.price,
      startTime: s.time, startIndex: s.index,
      endTime: cs[cs.length - 1].time, endIndex: cs.length - 1,
      mitigated: false, broken: false,
    });
    return lines.length - 1;
  };

  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];

    // absolute extremes of the working structure
    if (c.high > absHigh.price) absHigh = { price: c.high, index: i, time: c.time };
    if (c.low  < absLow.price)  absLow  = { price: c.low,  index: i, time: c.time };

    // promote any swings now confirmed (confirmedIndex <= i)
    while (sp < swings.length && swings[sp].confirmedIndex <= i) {
      const s = swings[sp];
      if (s.kind === "high") {
        curHigh = s;
        if (activeHighLine >= 0 && !lines[activeHighLine].mitigated)
          { lines[activeHighLine].endIndex = i; lines[activeHighLine].endTime = c.time; }
        activeHighLine = openLine(s);
      } else {
        curLow = s;
        if (activeLowLine >= 0 && !lines[activeLowLine].mitigated)
          { lines[activeLowLine].endIndex = i; lines[activeLowLine].endTime = c.time; }
        activeLowLine = openLine(s);
      }
      sp++;
    }

    // ── Mitigation of TJL lines (price trades back into the level) ──
    if (activeHighLine >= 0 && !lines[activeHighLine].mitigated) {
      const ln = lines[activeHighLine];
      if (i > ln.startIndex && c.high >= ln.price) { ln.mitigated = true; ln.endIndex = i; ln.endTime = c.time; }
    }
    if (activeLowLine >= 0 && !lines[activeLowLine].mitigated) {
      const ln = lines[activeLowLine];
      if (i > ln.startIndex && c.low <= ln.price) { ln.mitigated = true; ln.endIndex = i; ln.endTime = c.time; }
    }

    // ── Fakeout vs BOS on the high side ──
    if (curHigh && i > curHigh.confirmedIndex) {
      if (c.close > curHigh.price) {
        // body closed beyond → Break Of Structure up
        events.push({ kind: "BOS_UP", time: c.time, index: i, price: curHigh.price, label: "BOS" });
        if (activeHighLine >= 0) lines[activeHighLine].broken = true;
        if (trend !== "up") trend = "up";
        // demand A+ at the origin of the impulse = the swing low that launched it
        if (curLow) pushBox("bullish", curLow.index, "normal");
        // a fresh up-break invalidates the working bearish absolute high anchor
        absHigh = { price: c.high, index: i, time: c.time };
        // dual-choch check: broke the pending bearish-choch extreme
        if (pendingChoch && pendingChoch.dir === "down" && c.close > pendingChoch.extreme) {
          events.push({ kind: "DUAL_CHOCH_UP", time: c.time, index: i, price: pendingChoch.extreme, label: "Dual ChoCh" });
          if (pendingChoch.boxIdx >= 0) boxes[pendingChoch.boxIdx].priority = "extreme";
          pendingChoch = null;
        }
        curHigh = null;              // consumed
        aboveHighStreak = 0;
      } else if (c.high > curHigh.price) {
        // wick swept the level, body failed → Fakeout; re-anchor the reference
        events.push({ kind: "FAKEOUT_HIGH", time: c.time, index: i, price: curHigh.price, label: "Fakeout" });
        curHigh = { ...curHigh, price: c.high, index: i, fakeout: true };
        if (activeHighLine >= 0) lines[activeHighLine].price = c.high;
      }
    }

    // ── Fakeout vs BOS on the low side ──
    if (curLow && i > curLow.confirmedIndex) {
      if (c.close < curLow.price) {
        events.push({ kind: "BOS_DOWN", time: c.time, index: i, price: curLow.price, label: "BOS" });
        if (activeLowLine >= 0) lines[activeLowLine].broken = true;
        if (trend !== "down") trend = "down";
        if (curHigh) pushBox("bearish", curHigh.index, "normal");
        absLow = { price: c.low, index: i, time: c.time };
        if (pendingChoch && pendingChoch.dir === "up" && c.close < pendingChoch.extreme) {
          events.push({ kind: "DUAL_CHOCH_DOWN", time: c.time, index: i, price: pendingChoch.extreme, label: "Dual ChoCh" });
          if (pendingChoch.boxIdx >= 0) boxes[pendingChoch.boxIdx].priority = "extreme";
          pendingChoch = null;
        }
        curLow = null;
        belowLowStreak = 0;
      } else if (c.low < curLow.price) {
        events.push({ kind: "FAKEOUT_LOW", time: c.time, index: i, price: curLow.price, label: "Fakeout" });
        curLow = { ...curLow, price: c.low, index: i, fakeout: true };
        if (activeLowLine >= 0) lines[activeLowLine].price = c.low;
      }
    }

    // ── ChoCh — two consecutive bodies beyond the opposing structural extreme ──
    if (trend === "up" && curLow) {
      // bearish ChoCh references the last Higher Low
      if (c.close < curLow.price) {
        belowLowStreak++;
        if (belowLowStreak >= 2) {
          events.push({ kind: "CHOCH_DOWN", time: c.time, index: i, price: curLow.price, label: "ChoCh" });
          trend = "down";
          // structural reset → Extreme A+ at the absolute highest high
          const boxIdx = pushBox("bearish", absHigh.index, "extreme");
          pendingChoch = { dir: "down", extreme: absHigh.price, boxIdx };
          absLow = { price: c.low, index: i, time: c.time };
          belowLowStreak = 0;
          curLow = null;
        }
      } else belowLowStreak = 0;
    }
    if (trend === "down" && curHigh) {
      // bullish ChoCh references the last Lower High
      if (c.close > curHigh.price) {
        aboveHighStreak++;
        if (aboveHighStreak >= 2) {
          events.push({ kind: "CHOCH_UP", time: c.time, index: i, price: curHigh.price, label: "ChoCh" });
          trend = "up";
          const boxIdx = pushBox("bullish", absLow.index, "extreme");
          pendingChoch = { dir: "up", extreme: absLow.price, boxIdx };
          absHigh = { price: c.high, index: i, time: c.time };
          aboveHighStreak = 0;
          curHigh = null;
        }
      } else aboveHighStreak = 0;
    }

    // ── A+ box mitigation (price taps the zone) ──
    for (const b of boxes) {
      if (b.mitigated) continue;
      if (i <= b.index) continue;
      if (c.low <= b.top && c.high >= b.bottom) { b.mitigated = true; b.endTime = c.time; }
    }

    // a pending ChoCh box that gets tapped is no longer "untapped" → no dual flip
    if (pendingChoch && pendingChoch.boxIdx >= 0 && boxes[pendingChoch.boxIdx].mitigated) {
      pendingChoch = null;
    }
  }

  // 4. Extreme A+ filter — the "50-pip rule": when two boxes of the same bias
  //    sit within `extremeFilterPips`, keep only the more extreme (further) one.
  filterExtremeBoxes(boxes, cfg);

  // 5. Internal Structure Shift (ISS / 5-wave) — heuristic detection inside the
  //    last impulse leg, counter-trend, completed by a two-candle retracement.
  detectISS(cs, swings, trend, events);

  // 6. Fibonacci of the current working leg (last opposing swing → latest swing)
  const fib = buildFib(swings, trend);

  // 7. Execution signals — engulfing inside an A+ box, session-filtered.
  const signals = buildSignals(cs, boxes, cfg);

  return { swings, lines, boxes, events, fib, signals, trend };
}

// ── Extreme A+ filter (50-pip rule) ───────────────────────────────────────────

function filterExtremeBoxes(boxes: APlusBox[], cfg: SmcConfig): void {
  const tol = cfg.extremeFilterPips * cfg.pipSize;
  for (let a = 0; a < boxes.length; a++) {
    const A = boxes[a];
    if ((A as any)._dropped) continue;
    for (let b = a + 1; b < boxes.length; b++) {
      const B = boxes[b];
      if ((B as any)._dropped || B.bias !== A.bias) continue;
      const refA = A.bias === "bullish" ? A.bottom : A.top;
      const refB = B.bias === "bullish" ? B.bottom : B.top;
      if (Math.abs(refA - refB) <= tol) {
        // keep the more extreme (lower demand / higher supply)
        const keepA = A.bias === "bullish" ? refA <= refB : refA >= refB;
        const drop = keepA ? B : A;
        (drop as any)._dropped = true;
      }
    }
  }
  // strip dropped boxes in place
  for (let i = boxes.length - 1; i >= 0; i--) if ((boxes[i] as any)._dropped) boxes.splice(i, 1);
}

// ── Internal Structure Shift (5-wave) — heuristic ─────────────────────────────
//
// Within the final impulse leg, look for five consecutive alternating swings
// that move against the external trend and whose 5th wave is closed by a valid
// retracement (i.e. it is itself a confirmed swing). Marks a single ISS event.

function detectISS(cs: Candle[], swings: Swing[], trend: Trend, events: SmcEvent[]): void {
  if (trend === "none" || swings.length < 5) return;
  const last5 = swings.slice(-5);
  // alternating kinds form a 5-wave (H-L-H-L-H or L-H-L-H-L)
  let alternating = true;
  for (let i = 1; i < last5.length; i++) if (last5[i].kind === last5[i - 1].kind) { alternating = false; break; }
  if (!alternating) return;
  // counter-trend internal shift: in an uptrend the 5-wave terminates on a high
  // that is a Lower High (selling pressure building); inverse for downtrend.
  const term = last5[4];
  const counter =
    (trend === "up"   && term.kind === "high" && term.label === "LH") ||
    (trend === "down" && term.kind === "low"  && term.label === "HL");
  if (!counter) return;
  events.push({
    kind:  trend === "up" ? "ISS_DOWN" : "ISS_UP",
    time:  term.time, index: term.index, price: term.price,
    label: "ISS",
  });
}

// ── Fibonacci of the working leg ──────────────────────────────────────────────

function buildFib(swings: Swing[], trend: Trend): FibZone | null {
  if (swings.length < 2 || trend === "none") return null;
  // last swing + last opposing swing define the leg
  const last = swings[swings.length - 1];
  let opp: Swing | null = null;
  for (let i = swings.length - 2; i >= 0; i--) if (swings[i].kind !== last.kind) { opp = swings[i]; break; }
  if (!opp) return null;

  const bias: Bias = trend === "up" ? "bullish" : "bearish";
  // bullish: discount from low(opp/last-low) → high; bearish: from high → low
  let from: number, to: number, startTime: number, endTime: number;
  const lowS  = last.kind === "low"  ? last : opp;
  const highS = last.kind === "high" ? last : opp;
  if (bias === "bullish") {
    from = lowS.price; to = highS.price;
    startTime = Math.min(lowS.time, highS.time);
    endTime   = Math.max(lowS.time, highS.time);
  } else {
    from = highS.price; to = lowS.price;
    startTime = Math.min(lowS.time, highS.time);
    endTime   = Math.max(lowS.time, highS.time);
  }
  const level50  = from + (to - from) * 0.5;
  const level618 = from + (to - from) * 0.618;
  return { bias, from, to, level50, level618, startTime, endTime };
}

// ── Execution signals ─────────────────────────────────────────────────────────
//
// When a candle taps an un-mitigated A+ box and prints an engulfing candle
// (body closes beyond the previous candle's extreme) in the box's direction,
// emit a signal. Session filtering marks Asian-session (or off-session) taps
// invalid unless the user opts to include them.

function buildSignals(cs: Candle[], boxes: APlusBox[], cfg: SmcConfig): SmcSignal[] {
  const signals: SmcSignal[] = [];
  for (const b of boxes) {
    // find the first candle after the box origin that taps it
    for (let i = b.index + 1; i < cs.length; i++) {
      const c = cs[i];
      const taps = c.low <= b.top && c.high >= b.bottom;
      if (!taps) continue;
      const prev = cs[i - 1];
      const dir = b.bias === "bullish" ? "buy" : "sell";
      const engulf = dir === "buy"
        ? isBull(c) && c.close > prev.high
        : isBear(c) && c.close < prev.low;
      const session = sessionOf(c.time, cfg);
      const sessionOk = session === "London" || session === "New York" ||
        (session === "Asian" && !cfg.filterAsian);
      signals.push({
        direction: dir,
        time: c.time, index: i, price: c.close,
        zoneTop: b.top, zoneBottom: b.bottom,
        session,
        valid: engulf && sessionOk,
        reason: `${engulf ? "Engulfing" : "Tap"} ${b.label} · ${session}`,
      });
      break; // first tap rule — one signal per box
    }
  }
  return signals;
}
