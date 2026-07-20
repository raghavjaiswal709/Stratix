// ─── tjlChochEngine.ts ──────────────────────────────────────────────────────
// TJL / CHoCH / QML structure-mapping engine.
//
// RULES IMPLEMENTED (verbatim from strategy spec — independent of smcEngine.ts,
// which implements a different, unrelated interpretation of TJL/CHoCH):
//
//  1. TJL1 (anchor) — inside an existing trend, watch for a 2-candle retracement
//     where the 2nd candle's body closes beyond the entire body of the 1st candle
//     (above it in a downtrend, below it in an uptrend). The moment that confirms,
//     TJL1 is placed at the swing extreme that started the leg immediately
//     preceding the retracement (the lowest low in a downtrend, highest high in
//     an uptrend). Drawn as a line extended right.
//  2. TJL2 (zone/cap) — after TJL1, price forms a rounded pullback. TJL2 = the
//     extreme wick of that pullback (topmost in a downtrend, bottommost in an
//     uptrend), confirmed one candle later once a close-based confirmation
//     exists (a 1-left/1-right pivot). Sits on the opposite side of TJL1.
//  3. CHoCH — a full candle BODY close through TJL2 (wicks don't count). This is
//     the structural signal that the prior trend has ended.
//  4. On CHoCH the TJL1/TJL2 pair graduates into three levels: old TJL1 → QML
//     (origin/reaction zone), old TJL2 → RBS (down→up) or SBR (up→down) (the
//     flip zone), and a new Double Down (down→up) / Double Top (up→down) at the
//     bottom-most / top-most wick of the whole move (the liquidity sweep point).
//  5. Dual CHoCH — if a full body close breaks back through the Double Down/Top
//     level, the original three levels stay on the chart unchanged and a 4th
//     level, L4, is created at the extreme wick reached just before the
//     dual-CHoCH confirmation candle.
//  6. Zone lifecycle — when price closes fully through an active zone (QML,
//     RBS/SBR, Double Top/Down, L4), that zone freezes in place at the break bar
//     — it stops extending right but remains visible (frozen flag).
//  7. Five-wave structure — the alternating impulsive/corrective swings that lead
//     into a CHoCH, numbered sequentially and reset after each CHoCH.
//
// The module is framework-free and side-effect-free — computeTjlChoch() is pure.
// It intentionally shares no code or state with smcEngine.ts.

import type { Candle, Timeframe } from "./types";
import { resampleCandles } from "./dataFetcher";

// ── Types ────────────────────────────────────────────────────────────────────

export type StructTrend = "up" | "down" | "none";

export interface TjlLine {
  kind:       "TJL1" | "TJL2";
  price:      number;
  startTime:  number;
  startIndex: number;
  endTime:    number;
  endIndex:   number;
  active:     boolean;   // false once superseded or graduated into a zone
}

export type TjlZoneType = "QML" | "RBS" | "SBR" | "DOUBLE_DOWN" | "DOUBLE_TOP" | "L4";

export interface TjlZone {
  type:       TjlZoneType;
  bias:       "bullish" | "bearish";
  price:      number;
  top:        number;
  bottom:     number;
  startTime:  number;
  startIndex: number;
  endTime:    number;
  endIndex:   number;
  frozen:     boolean;   // price has closed through it — stopped extending
}

export type TjlEventKind = "CHOCH_UP" | "CHOCH_DOWN" | "DUAL_CHOCH_UP" | "DUAL_CHOCH_DOWN";

export interface TjlEvent {
  kind:  TjlEventKind;
  time:  number;
  index: number;
  price: number;
  label: string;
}

export interface TjlWavePoint {
  kind:  "high" | "low";
  price: number;
  time:  number;
  index: number;
  wave:  number;   // sequence number, resets to 1 after each CHoCH
}

export interface TjlChochResult {
  lines:  TjlLine[];
  zones:  TjlZone[];
  events: TjlEvent[];
  waves:  TjlWavePoint[];
  trend:  StructTrend;
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface TjlChochConfig {
  pipSize:           number;
  zoneThicknessPips:  number;   // half-thickness of QML/RBS/SBR/Double/L4 zones
  bootstrapLen:       number;   // bars used once, at the very start, to seed an initial trend bias
  waveLen:            number;   // left/right pivot length for the 5-wave zigzag
}

export function defaultTjlChochConfig(pipSize: number): TjlChochConfig {
  return { pipSize, zoneThicknessPips: 3, bootstrapLen: 20, waveLen: 5 };
}

// ── Pivot helpers ────────────────────────────────────────────────────────────

function isPivotHigh(cs: Candle[], idx: number, left: number, right: number): boolean {
  if (idx - left < 0 || idx + right >= cs.length) return false;
  const h = cs[idx].high;
  for (let k = idx - left; k <= idx + right; k++) {
    if (k !== idx && cs[k].high > h) return false;
  }
  return true;
}

function isPivotLow(cs: Candle[], idx: number, left: number, right: number): boolean {
  if (idx - left < 0 || idx + right >= cs.length) return false;
  const l = cs[idx].low;
  for (let k = idx - left; k <= idx + right; k++) {
    if (k !== idx && cs[k].low < l) return false;
  }
  return true;
}

// ── Main engine — single timeframe ──────────────────────────────────────────

interface Point { price: number; time: number; index: number }

export function computeTjlChoch(candles: Candle[], cfg: TjlChochConfig): TjlChochResult {
  const EMPTY: TjlChochResult = { lines: [], zones: [], events: [], waves: [], trend: "none" };
  if (!candles || candles.length < cfg.bootstrapLen + 3) return EMPTY;
  const cs = candles;
  const lastIndex = cs.length - 1;
  const lastTime  = cs[lastIndex].time;
  const half      = cfg.zoneThicknessPips * cfg.pipSize;

  const lines:  TjlLine[]  = [];
  const zones:  TjlZone[]  = [];
  const events: TjlEvent[] = [];
  const waves:  TjlWavePoint[] = [];

  let trend: StructTrend = "none";
  let chN: 0 | 1 | 2 = 0;

  let legExt:      Point | null = null;
  let trendExt:    Point | null = null;
  let postExt:     Point | null = null;
  let postExtPrev: Point | null = null;

  let tjl1: Point | null = null;
  let tjl1Idx = -1;
  let tjl2: Point | null = null;
  let tjl2Idx = -1;

  let qmlIdx = -1, rIdx = -1, dIdx = -1, lIdx = -1;
  let rIsRbs = false;
  let dIsDown = false;

  const pushLine = (kind: "TJL1" | "TJL2", p: Point): number => {
    lines.push({ kind, price: p.price, startTime: p.time, startIndex: p.index, endTime: lastTime, endIndex: lastIndex, active: true });
    return lines.length - 1;
  };

  const pushZone = (type: TjlZoneType, bias: "bullish" | "bearish", p: Point): number => {
    zones.push({
      type, bias, price: p.price,
      top: p.price + half, bottom: p.price - half,
      startTime: p.time, startIndex: p.index,
      endTime: lastTime, endIndex: lastIndex,
      frozen: false,
    });
    return zones.length - 1;
  };

  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];

    if (trend === "none" && i >= cfg.bootstrapLen) {
      trend = c.close > cs[i - cfg.bootstrapLen].close ? "up" : "down";
    }
    if (trend === "none") continue;

    // ── whole-move extreme -> feeds Double Down / Double Top ──────────────
    if (chN === 0) {
      if (trend === "down") { if (!trendExt || c.low  < trendExt.price) trendExt = { price: c.low,  time: c.time, index: i }; }
      else                  { if (!trendExt || c.high > trendExt.price) trendExt = { price: c.high, time: c.time, index: i }; }
    }

    // ── TJL1 / TJL2 / CHoCH hunt — only runs pre-CHoCH ─────────────────────
    if (chN === 0) {
      if (trend === "down") { if (!legExt || c.low  < legExt.price) legExt = { price: c.low,  time: c.time, index: i }; }
      else                  { if (!legExt || c.high > legExt.price) legExt = { price: c.high, time: c.time, index: i }; }

      if (i >= 1) {
        const bodyTop1 = Math.max(cs[i - 1].open, cs[i - 1].close);
        const bodyBot1 = Math.min(cs[i - 1].open, cs[i - 1].close);
        const retrace  = trend === "down" ? c.close > bodyTop1 : c.close < bodyBot1;
        if (retrace && legExt) {
          if (tjl1Idx >= 0) { lines[tjl1Idx].active = false; lines[tjl1Idx].endIndex = i; lines[tjl1Idx].endTime = c.time; }
          if (tjl2Idx >= 0) { lines[tjl2Idx].active = false; lines[tjl2Idx].endIndex = i; lines[tjl2Idx].endTime = c.time; }
          tjl1 = legExt;
          tjl1Idx = pushLine("TJL1", tjl1);
          tjl2 = null;
          tjl2Idx = -1;
          legExt = null;
        }
      }

      if (tjl1 && i >= 2) {
        const pIdx = i - 1;
        if (trend === "down" && isPivotHigh(cs, pIdx, 1, 1)) {
          const pv = cs[pIdx].high;
          if (!tjl2 || pv > tjl2.price) {
            tjl2 = { price: pv, time: cs[pIdx].time, index: pIdx };
            if (tjl2Idx < 0) tjl2Idx = pushLine("TJL2", tjl2);
            else { lines[tjl2Idx].price = pv; lines[tjl2Idx].startTime = tjl2.time; lines[tjl2Idx].startIndex = pIdx; }
          }
        }
        if (trend === "up" && isPivotLow(cs, pIdx, 1, 1)) {
          const pv = cs[pIdx].low;
          if (!tjl2 || pv < tjl2.price) {
            tjl2 = { price: pv, time: cs[pIdx].time, index: pIdx };
            if (tjl2Idx < 0) tjl2Idx = pushLine("TJL2", tjl2);
            else { lines[tjl2Idx].price = pv; lines[tjl2Idx].startTime = tjl2.time; lines[tjl2Idx].startIndex = pIdx; }
          }
        }
      }

      if (tjl2) {
        if (trend === "down" && c.close > tjl2.price) {
          events.push({ kind: "CHOCH_UP", time: c.time, index: i, price: tjl2.price, label: "CHoCH" });
          qmlIdx = pushZone("QML", "bullish", tjl1!);
          rIdx   = pushZone("RBS", "bullish", tjl2);
          rIsRbs = true;
          dIdx   = pushZone("DOUBLE_DOWN", "bullish", trendExt!);
          dIsDown = true;
          lines[tjl1Idx].active = false; lines[tjl1Idx].endIndex = i; lines[tjl1Idx].endTime = c.time;
          lines[tjl2Idx].active = false; lines[tjl2Idx].endIndex = i; lines[tjl2Idx].endTime = c.time;
          trend = "up"; chN = 1;
          trendExt = null; legExt = null; postExt = null; postExtPrev = null;
          tjl1 = null; tjl2 = null;
        } else if (trend === "up" && c.close < tjl2.price) {
          events.push({ kind: "CHOCH_DOWN", time: c.time, index: i, price: tjl2.price, label: "CHoCH" });
          qmlIdx = pushZone("QML", "bearish", tjl1!);
          rIdx   = pushZone("SBR", "bearish", tjl2);
          rIsRbs = false;
          dIdx   = pushZone("DOUBLE_TOP", "bearish", trendExt!);
          dIsDown = false;
          lines[tjl1Idx].active = false; lines[tjl1Idx].endIndex = i; lines[tjl1Idx].endTime = c.time;
          lines[tjl2Idx].active = false; lines[tjl2Idx].endIndex = i; lines[tjl2Idx].endTime = c.time;
          trend = "down"; chN = 1;
          trendExt = null; legExt = null; postExt = null; postExtPrev = null;
          tjl1 = null; tjl2 = null;
        }
      }
    }

    // ── extreme reached since CHoCH #1 -> feeds L4 on a dual CHoCH ─────────
    if (chN === 1) {
      postExtPrev = postExt;
      if (dIsDown) { if (!postExt || c.low  < postExt.price) postExt = { price: c.low,  time: c.time, index: i }; }
      else         { if (!postExt || c.high > postExt.price) postExt = { price: c.high, time: c.time, index: i }; }
    }

    // ── freeze-on-break: QML ────────────────────────────────────────────────
    if (qmlIdx >= 0 && !zones[qmlIdx].frozen) {
      const broken = rIsRbs ? c.close < zones[qmlIdx].price : c.close > zones[qmlIdx].price;
      if (broken) { zones[qmlIdx].frozen = true; zones[qmlIdx].endIndex = i; zones[qmlIdx].endTime = c.time; }
    }
    // ── freeze-on-break: RBS / SBR ──────────────────────────────────────────
    if (rIdx >= 0 && !zones[rIdx].frozen) {
      const broken = rIsRbs ? c.close < zones[rIdx].price : c.close > zones[rIdx].price;
      if (broken) { zones[rIdx].frozen = true; zones[rIdx].endIndex = i; zones[rIdx].endTime = c.time; }
    }
    // ── freeze-on-break: Double Down / Double Top -> triggers Dual CHoCH ───
    if (dIdx >= 0 && !zones[dIdx].frozen) {
      const broken = dIsDown ? c.close < zones[dIdx].price : c.close > zones[dIdx].price;
      if (broken) {
        zones[dIdx].frozen = true; zones[dIdx].endIndex = i; zones[dIdx].endTime = c.time;
        const l4Point = postExtPrev ?? postExt ?? { price: zones[dIdx].price, time: c.time, index: i };
        lIdx = pushZone("L4", dIsDown ? "bearish" : "bullish", l4Point);
        events.push({
          kind: dIsDown ? "DUAL_CHOCH_DOWN" : "DUAL_CHOCH_UP",
          time: c.time, index: i, price: zones[dIdx].price, label: "Dual CHoCH",
        });
        chN = 2;
        trend = dIsDown ? "down" : "up";
      }
    }
    // ── freeze-on-break: L4 ─────────────────────────────────────────────────
    if (lIdx >= 0 && !zones[lIdx].frozen) {
      const broken = dIsDown ? c.close > zones[lIdx].price : c.close < zones[lIdx].price;
      if (broken) { zones[lIdx].frozen = true; zones[lIdx].endIndex = i; zones[lIdx].endTime = c.time; }
    }
  }

  // ── 5-wave zigzag (post-pass): alternating pivots, numbered, reset after each CHoCH ──
  {
    let lastKind: "high" | "low" | null = null;
    let seq = 0;
    let chochPtr = 0;
    const chochAt = events
      .filter(e => e.kind === "CHOCH_UP" || e.kind === "CHOCH_DOWN")
      .map(e => e.index)
      .sort((a, b) => a - b);

    for (let i = cfg.waveLen; i < cs.length - cfg.waveLen; i++) {
      while (chochPtr < chochAt.length && chochAt[chochPtr] <= i) { lastKind = null; seq = 0; chochPtr++; }

      if (isPivotHigh(cs, i, cfg.waveLen, cfg.waveLen)) {
        if (lastKind !== "high") {
          seq++;
          waves.push({ kind: "high", price: cs[i].high, time: cs[i].time, index: i, wave: seq });
          lastKind = "high";
        } else if (waves.length && cs[i].high > waves[waves.length - 1].price) {
          const last = waves[waves.length - 1];
          waves[waves.length - 1] = { ...last, price: cs[i].high, time: cs[i].time, index: i };
        }
      }
      if (isPivotLow(cs, i, cfg.waveLen, cfg.waveLen)) {
        if (lastKind !== "low") {
          seq++;
          waves.push({ kind: "low", price: cs[i].low, time: cs[i].time, index: i, wave: seq });
          lastKind = "low";
        } else if (waves.length && cs[i].low < waves[waves.length - 1].price) {
          const last = waves[waves.length - 1];
          waves[waves.length - 1] = { ...last, price: cs[i].low, time: cs[i].time, index: i };
        }
      }
    }
  }

  return { lines, zones, events, waves, trend };
}

// ── Multi-timeframe wrapper — chart timeframe + 2 configurable higher timeframes ──
// Any configured HTF that is lower-resolution... i.e. LOWER than the chart's
// current timeframe is skipped, since structure can only reliably be computed
// on the chart TF or coarser. Higher timeframes are built by resampling the
// already-loaded chart candles (no extra network fetch required).

const TF_SECONDS: Record<Timeframe, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400,
};

export interface TjlChochMtfResult {
  chart:      TjlChochResult;
  htf1:       TjlChochResult | null;
  htf2:       TjlChochResult | null;
  htf1Valid:  boolean;
  htf2Valid:  boolean;
}

export function computeTjlChochMtf(
  candles: Candle[],
  chartTf: Timeframe,
  cfg: TjlChochConfig,
  mtf: { enableHtf1: boolean; htf1: Timeframe; enableHtf2: boolean; htf2: Timeframe },
): TjlChochMtfResult {
  const chart = computeTjlChoch(candles, cfg);
  const htf1Valid = mtf.enableHtf1 && TF_SECONDS[mtf.htf1] >= TF_SECONDS[chartTf];
  const htf2Valid = mtf.enableHtf2 && TF_SECONDS[mtf.htf2] >= TF_SECONDS[chartTf];
  const htf1 = htf1Valid ? computeTjlChoch(resampleCandles(candles, mtf.htf1), cfg) : null;
  const htf2 = htf2Valid ? computeTjlChoch(resampleCandles(candles, mtf.htf2), cfg) : null;
  return { chart, htf1, htf2, htf1Valid, htf2Valid };
}

export function tfLabel(tf: Timeframe): string {
  switch (tf) {
    case "1m":  return "M1";
    case "5m":  return "M5";
    case "15m": return "M15";
    case "1H":  return "H1";
    case "4H":  return "H4";
    case "1D":  return "D1";
    default:    return tf;
  }
}
