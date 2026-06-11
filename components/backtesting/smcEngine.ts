// ─── smcEngine.ts ─────────────────────────────────────────────────────────────
// "Top G Trader" — Price Action & Smart Money Concepts engine.
//
// RULES IMPLEMENTED (verbatim from strategy spec):
//
//  1. Structure via strict TWO-candle retracement (one-candle on H4/D1).
//     • Uptrend TJL1 (HH): 2nd red body closes BELOW 1st red body.
//     • Downtrend TJL1 (LL): 2nd green body closes ABOVE 1st green WICK.
//  2. TJL1 = trend-direction structural extreme (HH in uptrend, LL in downtrend).
//     TJL2 = pullback structural extreme (HL in uptrend, LH in downtrend).
//     Lines extend from the impulse start until the level is mitigated.
//  3. A+ BOX — FULL WICK of the origin candle:
//     • Bullish demand (bottom of impulse / HL): bottom = wick low,  top = body top.
//     • Bearish supply  (top of impulse / LH):  top = wick high, bottom = body bottom.
//  4. BOS: body close beyond the last TJL1 line.
//  5. SBR (Support→Resistance): when BOS DOWN breaks a HL/LL support →
//     that support candle's zone (wick-low to body-top) becomes resistance.
//  6. RBS (Resistance→Support): when BOS UP breaks a HH/LH resistance →
//     that resistance candle's zone (body-bottom to wick-high) becomes support.
//  7. ChoCh: TWO consecutive candle bodies beyond the last opposing structural extreme.
//     Structural reset → Extreme A+ at the absolute High/Low.
//  8. Dual ChoCh: if a new ChoCh extreme is itself broken before its A+ is tapped →
//     trend flips back; Extreme A+ priority promoted.
//  9. Fakeout: wick sweeps a level, body fails to close beyond it → re-anchor reference.
// 10. ISS / 5-wave: 5 alternating counter-trend swings inside the last impulse leg,
//     5th wave confirmed by a valid two-candle retracement.
// 11. Extreme A+ filter (50-pip rule): same-bias A+ levels within N pips → keep only
//     the more extreme one.
// 12. Double Top: two consecutive swing highs within tolerance pips → bearish reversal zone.
//     Double Bottom: two consecutive swing lows within tolerance pips → bullish reversal zone.
// 13. Fibonacci 0.5–0.618 premium/discount of the current working leg.
// 14. Execution signals: engulfing-in-zone OR wick-flip, session-filtered (London/NY).
//
// The module is framework-free and side-effect-free — computeSmc() is pure.

import type { Candle, Timeframe } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SwingKind = "high" | "low";
export type Trend     = "up"   | "down" | "none";
export type Bias      = "bullish" | "bearish";
export type BoxType   = "aplus" | "sbr" | "rbs" | "double_top" | "double_bottom";

export interface Swing {
  kind:           SwingKind;
  price:          number;          // extreme price (high for swing-high, low for swing-low)
  time:           number;          // unix-seconds of extreme candle
  index:          number;          // candle index of extreme
  confirmedIndex: number;          // candle index where retracement confirmed it
  label:          "HH" | "HL" | "LH" | "LL" | "H" | "L";
  fakeout:        boolean;
}

export interface StructureLine {
  kind:       SwingKind;
  tjlKind:    "TJL1" | "TJL2";    // TJL1 = trend-direction; TJL2 = pullback/entry level
  price:      number;
  startTime:  number;
  startIndex: number;
  endTime:    number;
  endIndex:   number;
  mitigated:  boolean;
  broken:     boolean;
}

export interface APlusBox {
  bias:       Bias;
  boxType:    BoxType;
  // Full wick zone boundaries
  top:        number;             // wick extreme top
  bottom:     number;             // wick extreme bottom
  // Body reference (drawn as a line inside the zone)
  bodyTop:    number;
  bodyBottom: number;
  time:       number;             // anchor (left edge) time
  index:      number;             // anchor candle index
  endTime:    number;             // right edge (extends until mitigated / chart edge)
  priority:   "normal" | "extreme";
  label:      string;
  mitigated:  boolean;
}

export type EventKind =
  | "BOS_UP"   | "BOS_DOWN"
  | "CHOCH_UP" | "CHOCH_DOWN"
  | "DUAL_CHOCH_UP" | "DUAL_CHOCH_DOWN"
  | "FAKEOUT_HIGH"  | "FAKEOUT_LOW"
  | "ISS_UP"   | "ISS_DOWN";

export interface SmcEvent {
  kind:  EventKind;
  time:  number;
  index: number;
  price: number;
  label: string;
}

export interface FibZone {
  bias:      Bias;
  from:      number;
  to:        number;
  level50:   number;
  level618:  number;
  startTime: number;
  endTime:   number;
}

export interface SmcSignal {
  direction: "buy" | "sell";
  time:      number;
  index:     number;
  price:     number;
  zoneTop:   number;
  zoneBottom:number;
  session:   string;
  valid:     boolean;
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

// ── Config ────────────────────────────────────────────────────────────────────

export interface SmcConfig {
  pipSize:           number;
  oneCandleRetrace:  boolean;   // H4/D1: single opposing candle confirms structure
  extremeFilterPips: number;    // "50-pip rule": merge same-bias A+ within N pips
  doublePatternPips: number;    // tolerance for double top/bottom detection
  sessions: {
    asian:  { startMin: number; endMin: number };
    london: { startMin: number; endMin: number };
    ny:     { startMin: number; endMin: number };
  };
  filterAsian: boolean;
}

export function isHigherTimeframe(tf: Timeframe): boolean {
  return tf === "4H" || tf === "1D";
}

export function defaultSmcConfig(pipSize: number, tf: Timeframe): SmcConfig {
  return {
    pipSize,
    oneCandleRetrace:  isHigherTimeframe(tf),
    extremeFilterPips: 50,
    doublePatternPips: 20,
    sessions: {
      asian:  { startMin:  5 * 60 + 30, endMin:  9 * 60 + 30 },
      london: { startMin: 11 * 60 + 30, endMin: 14 * 60 + 30 },
      ny:     { startMin: 16 * 60 + 30, endMin: 21 * 60 + 30 },
    },
    filterAsian: false,
  };
}

// ── Candle helpers ────────────────────────────────────────────────────────────

const isBull = (c: Candle) => c.close > c.open;
const isBear = (c: Candle) => c.close < c.open;
const bodyTop = (c: Candle) => Math.max(c.open, c.close);
const bodyBot = (c: Candle) => Math.min(c.open, c.close);

function sessionOf(time: number, cfg: SmcConfig): string {
  const d = new Date((time + 19800) * 1000); // IST = UTC+5:30
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

// ── Retracement rules (verbatim from spec) ────────────────────────────────────
//
//  Uptrend HH confirmed: 2nd red body CLOSES BELOW 1st red body close.
//  Downtrend LL confirmed: 2nd green body CLOSES ABOVE 1st green WICK high.

function bearRetrace(cs: Candle[], i: number, oneCandle: boolean): boolean {
  if (i < 1) return false;
  if (oneCandle) return isBear(cs[i]);
  const p = cs[i - 1], c = cs[i];
  return isBear(p) && isBear(c) && c.close < p.close;
}

function bullRetrace(cs: Candle[], i: number, oneCandle: boolean): boolean {
  if (i < 1) return false;
  if (oneCandle) return isBull(cs[i]);
  const p = cs[i - 1], c = cs[i];
  return isBull(p) && isBull(c) && c.close > p.high; // close above WICK
}

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

interface RawSwing { kind: SwingKind; index: number; confirmedIndex: number }

function detectRawSwings(cs: Candle[], cfg: SmcConfig): RawSwing[] {
  const out: RawSwing[] = [];
  if (cs.length < 3) return out;
  const oc = cfg.oneCandleRetrace;
  let legDir: Trend = "none";
  let runHighIdx = 0, runLowIdx = 0;

  for (let i = 1; i < cs.length; i++) {
    if (cs[i].high >= cs[runHighIdx].high) runHighIdx = i;
    if (cs[i].low  <= cs[runLowIdx].low)   runLowIdx  = i;

    if (legDir === "none") {
      if (bearRetrace(cs, i, oc)) {
        out.push({ kind: "high", index: runHighIdx, confirmedIndex: i });
        legDir = "down";
        runLowIdx = argMinLow(cs, runHighIdx, i);
      } else if (bullRetrace(cs, i, oc)) {
        out.push({ kind: "low", index: runLowIdx, confirmedIndex: i });
        legDir = "up";
        runHighIdx = argMaxHigh(cs, runLowIdx, i);
      }
    } else if (legDir === "up") {
      if (bearRetrace(cs, i, oc)) {
        out.push({ kind: "high", index: runHighIdx, confirmedIndex: i });
        legDir = "down";
        runLowIdx = argMinLow(cs, runHighIdx, i);
      }
    } else {
      if (bullRetrace(cs, i, oc)) {
        out.push({ kind: "low", index: runLowIdx, confirmedIndex: i });
        legDir = "up";
        runHighIdx = argMaxHigh(cs, runLowIdx, i);
      }
    }
  }
  return out;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function computeSmc(candles: Candle[], cfg: SmcConfig): SmcResult {
  const EMPTY: SmcResult = {
    swings: [], lines: [], boxes: [], events: [], fib: null, signals: [], trend: "none",
  };
  if (!candles || candles.length < 5) return EMPTY;
  const cs = candles;
  const lastTime  = cs[cs.length - 1].time;
  const lastIndex = cs.length - 1;

  // ── 1. Raw swings ──────────────────────────────────────────────────────────
  const raw = detectRawSwings(cs, cfg);
  if (raw.length === 0) return EMPTY;

  // ── 2. Label HH / HL / LH / LL ───────────────────────────────────────────
  const swings: Swing[] = raw.map(r => ({
    kind: r.kind,
    price: r.kind === "high" ? cs[r.index].high : cs[r.index].low,
    time: cs[r.index].time,
    index: r.index,
    confirmedIndex: r.confirmedIndex,
    label: r.kind === "high" ? "H" : "L",
    fakeout: false,
  } as Swing));
  {
    let prevH: Swing | null = null, prevL: Swing | null = null;
    for (const s of swings) {
      if (s.kind === "high") { if (prevH) s.label = s.price >= prevH.price ? "HH" : "LH"; prevH = s; }
      else                   { if (prevL) s.label = s.price >= prevL.price ? "HL" : "LL"; prevL = s; }
    }
  }

  const events: SmcEvent[] = [];
  const boxes:  APlusBox[] = [];
  const lines:  StructureLine[] = [];

  let sp = 0;                       // swing pointer
  let curHigh: Swing | null = null;
  let curLow:  Swing | null = null;
  let trend: Trend = "none";
  let belowLowStreak  = 0;
  let aboveHighStreak = 0;
  let activeHighLine = -1;
  let activeLowLine  = -1;
  let pendingChoch: { dir: Trend; extreme: number; boxIdx: number } | null = null;
  let absHigh = { price: -Infinity, index: 0, time: cs[0].time };
  let absLow  = { price:  Infinity, index: 0, time: cs[0].time };

  // ── Box builder — FULL WICK zones ─────────────────────────────────────────
  //  Bullish demand: bottom = wick low,  top = body top   (wick→body)
  //  Bearish supply: top = wick high, bottom = body bottom (body→wick)
  //  SBR (broken support → resistance): same shape as old demand zone at support candle
  //  RBS (broken resistance → support): same shape as old supply zone at resistance candle
  const pushBox = (
    bias: Bias, originIdx: number,
    priority: "normal" | "extreme",
    boxType: BoxType = "aplus",
    labelOverride?: string,
  ): number => {
    const c = cs[originIdx];
    const bt = bodyTop(c), bb = bodyBot(c);
    let top: number, bottom: number;
    if (bias === "bullish") {
      bottom = c.low;   // full wick bottom
      top    = bt;      // body top
    } else {
      top    = c.high;  // full wick top
      bottom = bb;      // body bottom
    }
    // Guard: minimum zone thickness of 2 pips
    const minThick = cfg.pipSize * 2;
    if (Math.abs(top - bottom) < minThick) {
      if (bias === "bullish") top    = bottom + minThick;
      else                    bottom = top    - minThick;
    }
    const label = labelOverride ?? (
      boxType === "sbr"          ? "SBR"         :
      boxType === "rbs"          ? "RBS"         :
      boxType === "double_top"   ? "2T"          :
      boxType === "double_bottom"? "2B"          :
      priority === "extreme"     ? "Extreme A+"  : "A+"
    );
    boxes.push({
      bias, boxType, top, bottom, bodyTop: bt, bodyBottom: bb,
      time: c.time, index: originIdx,
      endTime: lastTime,
      priority, label, mitigated: false,
    });
    return boxes.length - 1;
  };

  // ── Line builder — TJL1 vs TJL2 ──────────────────────────────────────────
  //  TJL1: trend-direction extreme  (HH in uptrend, LL in downtrend)
  //  TJL2: pullback extreme         (HL in uptrend, LH in downtrend)
  const openLine = (s: Swing, trendNow: Trend): number => {
    let tjlKind: "TJL1" | "TJL2";
    if      (trendNow === "up")   tjlKind = s.kind === "high" ? "TJL1" : "TJL2";
    else if (trendNow === "down") tjlKind = s.kind === "low"  ? "TJL1" : "TJL2";
    else    tjlKind = (s.label === "HH" || s.label === "LL") ? "TJL1" : "TJL2";

    lines.push({
      kind: s.kind, tjlKind,
      price: s.price,
      startTime: s.time, startIndex: s.index,
      endTime: lastTime,  endIndex: lastIndex,
      mitigated: false, broken: false,
    });
    return lines.length - 1;
  };

  // ── Forward pass ──────────────────────────────────────────────────────────
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.high > absHigh.price) absHigh = { price: c.high, index: i, time: c.time };
    if (c.low  < absLow.price)  absLow  = { price: c.low,  index: i, time: c.time };

    // Promote confirmed swings
    while (sp < swings.length && swings[sp].confirmedIndex <= i) {
      const s = swings[sp];
      if (s.kind === "high") {
        curHigh = s;
        if (activeHighLine >= 0 && !lines[activeHighLine].mitigated)
          { lines[activeHighLine].endIndex = i; lines[activeHighLine].endTime = c.time; }
        activeHighLine = openLine(s, trend);
      } else {
        curLow = s;
        if (activeLowLine >= 0 && !lines[activeLowLine].mitigated)
          { lines[activeLowLine].endIndex = i; lines[activeLowLine].endTime = c.time; }
        activeLowLine = openLine(s, trend);
      }
      sp++;
    }

    // Mitigation of active structure lines
    if (activeHighLine >= 0 && !lines[activeHighLine].mitigated
        && i > lines[activeHighLine].startIndex && c.high >= lines[activeHighLine].price) {
      lines[activeHighLine].mitigated = true;
      lines[activeHighLine].endTime   = c.time;
      lines[activeHighLine].endIndex  = i;
    }
    if (activeLowLine >= 0 && !lines[activeLowLine].mitigated
        && i > lines[activeLowLine].startIndex && c.low <= lines[activeLowLine].price) {
      lines[activeLowLine].mitigated = true;
      lines[activeLowLine].endTime   = c.time;
      lines[activeLowLine].endIndex  = i;
    }

    // ── BOS on the HIGH side ──────────────────────────────────────────────
    if (curHigh && i > curHigh.confirmedIndex) {
      if (c.close > curHigh.price) {
        // BOS UP — body closed above last structural high
        events.push({ kind: "BOS_UP", time: c.time, index: i, price: curHigh.price, label: "BOS" });
        if (activeHighLine >= 0) lines[activeHighLine].broken = true;

        // A+ demand box at the BOTTOM of the impulse (HL = origin of the up-move)
        if (curLow) pushBox("bullish", curLow.index, "normal", "aplus");

        // RBS: the broken resistance candle's zone now acts as support
        pushBox("bullish", curHigh.index, "normal", "rbs");

        if (trend !== "up") trend = "up";
        absHigh = { price: c.high, index: i, time: c.time };

        // Dual-ChoCh: broke the pending bearish-ChoCh extreme before its A+ was tapped
        if (pendingChoch && pendingChoch.dir === "down" && c.close > pendingChoch.extreme) {
          events.push({ kind: "DUAL_CHOCH_UP", time: c.time, index: i, price: pendingChoch.extreme, label: "Dual ChoCh" });
          if (pendingChoch.boxIdx >= 0) boxes[pendingChoch.boxIdx].priority = "extreme";
          pendingChoch = null;
        }
        curHigh = null;
        aboveHighStreak = 0;

      } else if (c.high > curHigh.price) {
        // Wick swept, body failed — Fakeout
        events.push({ kind: "FAKEOUT_HIGH", time: c.time, index: i, price: curHigh.price, label: "Fakeout" });
        curHigh = { ...curHigh, price: c.high, index: i, fakeout: true };
        if (activeHighLine >= 0) lines[activeHighLine].price = c.high;
      }
    }

    // ── BOS on the LOW side ───────────────────────────────────────────────
    if (curLow && i > curLow.confirmedIndex) {
      if (c.close < curLow.price) {
        // BOS DOWN — body closed below last structural low
        events.push({ kind: "BOS_DOWN", time: c.time, index: i, price: curLow.price, label: "BOS" });
        if (activeLowLine >= 0) lines[activeLowLine].broken = true;

        // A+ supply box at the TOP of the impulse (LH = origin of the down-move)
        if (curHigh) pushBox("bearish", curHigh.index, "normal", "aplus");

        // SBR: the broken support candle's zone now acts as resistance
        pushBox("bearish", curLow.index, "normal", "sbr");

        if (trend !== "down") trend = "down";
        absLow = { price: c.low, index: i, time: c.time };

        if (pendingChoch && pendingChoch.dir === "up" && c.close < pendingChoch.extreme) {
          events.push({ kind: "DUAL_CHOCH_DOWN", time: c.time, index: i, price: pendingChoch.extreme, label: "Dual ChoCh" });
          if (pendingChoch.boxIdx >= 0) boxes[pendingChoch.boxIdx].priority = "extreme";
          pendingChoch = null;
        }
        curLow = null;
        belowLowStreak = 0;

      } else if (c.low < curLow.price) {
        // Wick swept, body failed — Fakeout
        events.push({ kind: "FAKEOUT_LOW", time: c.time, index: i, price: curLow.price, label: "Fakeout" });
        curLow = { ...curLow, price: c.low, index: i, fakeout: true };
        if (activeLowLine >= 0) lines[activeLowLine].price = c.low;
      }
    }

    // ── ChoCh — two consecutive BODY closes beyond the opposing structural extreme ──
    if (trend === "up" && curLow) {
      if (c.close < curLow.price) {
        belowLowStreak++;
        if (belowLowStreak >= 2) {
          events.push({ kind: "CHOCH_DOWN", time: c.time, index: i, price: curLow.price, label: "ChoCh" });
          trend = "down";
          // Reset: Extreme A+ at absolute highest high
          const boxIdx = pushBox("bearish", absHigh.index, "extreme", "aplus");
          pendingChoch = { dir: "down", extreme: absHigh.price, boxIdx };
          absLow = { price: c.low, index: i, time: c.time };
          belowLowStreak = 0;
          curLow = null;
        }
      } else belowLowStreak = 0;
    }
    if (trend === "down" && curHigh) {
      if (c.close > curHigh.price) {
        aboveHighStreak++;
        if (aboveHighStreak >= 2) {
          events.push({ kind: "CHOCH_UP", time: c.time, index: i, price: curHigh.price, label: "ChoCh" });
          trend = "up";
          // Reset: Extreme A+ at absolute lowest low
          const boxIdx = pushBox("bullish", absLow.index, "extreme", "aplus");
          pendingChoch = { dir: "up", extreme: absLow.price, boxIdx };
          absHigh = { price: c.high, index: i, time: c.time };
          aboveHighStreak = 0;
          curHigh = null;
        }
      } else aboveHighStreak = 0;
    }

    // ── Zone mitigation (price taps the box) ─────────────────────────────
    for (const b of boxes) {
      if (b.mitigated || i <= b.index) continue;
      if (c.low <= b.top && c.high >= b.bottom) { b.mitigated = true; b.endTime = c.time; }
    }
    if (pendingChoch && pendingChoch.boxIdx >= 0 && boxes[pendingChoch.boxIdx]?.mitigated) {
      pendingChoch = null;
    }
  }

  // ── Double Top / Bottom from confirmed swings ─────────────────────────────
  detectDoublePatterns(cs, swings, boxes, cfg, lastTime);

  // ── 50-pip extreme filter ─────────────────────────────────────────────────
  filterExtremeBoxes(boxes, cfg);

  // ── ISS / 5-wave ──────────────────────────────────────────────────────────
  detectISS(swings, trend, events);

  // ── Fibonacci of the working leg ─────────────────────────────────────────
  const fib = buildFib(swings, trend);

  // ── Execution signals ─────────────────────────────────────────────────────
  const signals = buildSignals(cs, boxes, cfg);

  return { swings, lines, boxes, events, fib, signals, trend };
}

// ── Double Top / Bottom detection ─────────────────────────────────────────────
//
// Two consecutive same-kind swings within N pips with an opposing swing between
// them (the neckline) qualify as a Double Top or Double Bottom pattern.

function detectDoublePatterns(
  cs: Candle[], swings: Swing[], boxes: APlusBox[],
  cfg: SmcConfig, lastTime: number,
): void {
  const tol   = cfg.doublePatternPips * cfg.pipSize;
  const highs = swings.filter(s => s.kind === "high");
  const lows  = swings.filter(s => s.kind === "low");

  // Double Top
  for (let i = 1; i < highs.length; i++) {
    const h1 = highs[i - 1], h2 = highs[i];
    if (Math.abs(h1.price - h2.price) > tol) continue;
    const hasLow = lows.some(l => l.index > h1.index && l.index < h2.index);
    if (!hasLow) continue;
    const topPrice = Math.max(h1.price, h2.price);
    const c1 = cs[h1.index], c2 = cs[h2.index];
    const botPrice = Math.min(bodyBot(c1), bodyBot(c2));
    const minThick = cfg.pipSize * 4;
    boxes.push({
      bias: "bearish", boxType: "double_top",
      top:    topPrice,
      bottom: Math.max(botPrice, topPrice - Math.max(topPrice - botPrice, minThick)),
      bodyTop: Math.max(bodyTop(c2), bodyTop(c1)),
      bodyBottom: botPrice,
      time: cs[h1.index].time, index: h1.index,
      endTime: lastTime,
      priority: "normal", label: "2T", mitigated: false,
    });
  }

  // Double Bottom
  for (let i = 1; i < lows.length; i++) {
    const l1 = lows[i - 1], l2 = lows[i];
    if (Math.abs(l1.price - l2.price) > tol) continue;
    const hasHigh = highs.some(h => h.index > l1.index && h.index < l2.index);
    if (!hasHigh) continue;
    const botPrice = Math.min(l1.price, l2.price);
    const c1 = cs[l1.index], c2 = cs[l2.index];
    const topPrice = Math.max(bodyTop(c1), bodyTop(c2));
    const minThick = cfg.pipSize * 4;
    boxes.push({
      bias: "bullish", boxType: "double_bottom",
      bottom: botPrice,
      top: Math.min(topPrice, botPrice + Math.max(topPrice - botPrice, minThick)),
      bodyTop: topPrice,
      bodyBottom: Math.min(bodyBot(c1), bodyBot(c2)),
      time: cs[l1.index].time, index: l1.index,
      endTime: lastTime,
      priority: "normal", label: "2B", mitigated: false,
    });
  }
}

// ── Extreme A+ filter (50-pip rule) ───────────────────────────────────────────
// Same-bias same-type boxes within N pips → keep only the more extreme one.

function filterExtremeBoxes(boxes: APlusBox[], cfg: SmcConfig): void {
  const tol = cfg.extremeFilterPips * cfg.pipSize;
  const dropped = new Set<number>();

  for (let a = 0; a < boxes.length; a++) {
    if (dropped.has(a)) continue;
    const A = boxes[a];
    for (let b = a + 1; b < boxes.length; b++) {
      if (dropped.has(b)) continue;
      const B = boxes[b];
      if (B.bias !== A.bias || B.boxType !== A.boxType) continue;
      const refA = A.bias === "bullish" ? A.bottom : A.top;
      const refB = B.bias === "bullish" ? B.bottom : B.top;
      if (Math.abs(refA - refB) <= tol) {
        // Keep the more extreme: lower demand / higher supply
        const keepA = A.bias === "bullish" ? refA <= refB : refA >= refB;
        dropped.add(keepA ? b : a);
      }
    }
  }
  for (let i = boxes.length - 1; i >= 0; i--) {
    if (dropped.has(i)) boxes.splice(i, 1);
  }
}

// ── ISS / 5-wave ──────────────────────────────────────────────────────────────
// Five alternating counter-trend swings inside the last impulse leg.
// 5th wave confirmed by a valid two-candle retracement (it IS itself a confirmed swing).

function detectISS(swings: Swing[], trend: Trend, events: SmcEvent[]): void {
  if (trend === "none" || swings.length < 5) return;
  const last5 = swings.slice(-5);
  for (let i = 1; i < last5.length; i++) {
    if (last5[i].kind === last5[i - 1].kind) return; // not alternating
  }
  const term = last5[4];
  // Counter-trend: in uptrend expect the 5th wave to be a Lower High
  const counter =
    (trend === "up"   && term.kind === "high" && term.label === "LH") ||
    (trend === "down" && term.kind === "low"  && term.label === "HL");
  if (!counter) return;
  events.push({
    kind: trend === "up" ? "ISS_DOWN" : "ISS_UP",
    time: term.time, index: term.index, price: term.price,
    label: "ISS",
  });
}

// ── Fibonacci of the working leg ──────────────────────────────────────────────

function buildFib(swings: Swing[], trend: Trend): FibZone | null {
  if (swings.length < 2 || trend === "none") return null;
  const last = swings[swings.length - 1];
  let opp: Swing | null = null;
  for (let i = swings.length - 2; i >= 0; i--) {
    if (swings[i].kind !== last.kind) { opp = swings[i]; break; }
  }
  if (!opp) return null;
  const bias: Bias = trend === "up" ? "bullish" : "bearish";
  const lowS  = last.kind === "low"  ? last : opp;
  const highS = last.kind === "high" ? last : opp;
  const from     = bias === "bullish" ? lowS.price  : highS.price;
  const to       = bias === "bullish" ? highS.price : lowS.price;
  const level50  = from + (to - from) * 0.5;
  const level618 = from + (to - from) * 0.618;
  return {
    bias, from, to, level50, level618,
    startTime: Math.min(lowS.time, highS.time),
    endTime:   Math.max(lowS.time, highS.time),
  };
}

// ── Execution signals ─────────────────────────────────────────────────────────
// First tap of each un-mitigated box that produces:
//   (a) an engulfing candle (body closes beyond the previous candle's extreme), OR
//   (b) a wick-flip (candle wicks into the zone from the correct direction)
// Session filter: London/NY valid; Asian conditional.

function buildSignals(cs: Candle[], boxes: APlusBox[], cfg: SmcConfig): SmcSignal[] {
  const signals: SmcSignal[] = [];
  for (const b of boxes) {
    for (let i = b.index + 1; i < cs.length; i++) {
      const c = cs[i];
      if (c.low > b.top || c.high < b.bottom) continue; // no tap
      const prev = cs[i - 1];
      const dir  = b.bias === "bullish" ? "buy" : "sell";
      const engulf = dir === "buy"
        ? isBull(c) && c.close > prev.high
        : isBear(c) && c.close < prev.low;
      // Wick-flip: candle creates a liquidity sweep wick INTO the zone then closes away
      const wickFlip = dir === "buy"
        ? c.low <= b.top  && c.close > c.open  // lower wick dips in, closes bullish
        : c.high >= b.bottom && c.close < c.open; // upper wick rises in, closes bearish
      const session   = sessionOf(c.time, cfg);
      const sessionOk = session === "London" || session === "New York"
        || (session === "Asian" && !cfg.filterAsian);
      signals.push({
        direction: dir,
        time: c.time, index: i, price: c.close,
        zoneTop: b.top, zoneBottom: b.bottom,
        session,
        valid: (engulf || wickFlip) && sessionOk,
        reason: `${engulf ? "Engulf" : wickFlip ? "Wick-flip" : "Tap"} ${b.label} · ${session}`,
      });
      break; // first-tap rule — one signal per zone
    }
  }
  return signals;
}
