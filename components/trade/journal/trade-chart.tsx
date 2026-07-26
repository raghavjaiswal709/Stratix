"use client";

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import { parseISO, differenceInMinutes, subMinutes, addMinutes } from "date-fns";
import { RefreshCw, Camera, BarChart2, AlertTriangle, ExternalLink, Clock, Check, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/context";
import { toTrueUTC, BROKER_UTC_OFFSET_MIN, IST_OFFSET_MIN } from "@/lib/utils/ist-time";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TradeChartRef {
  captureScreenshot: () => string | null;
}

interface TradeChartProps {
  symbol: string;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  direction: "buy" | "sell";
  source?: "manual" | "mt5";         // decides which timezone correction applies
  defaultInterval?: string;          // saved timeframe e.g. "1H", "15m"
  onScreenshot?: (dataUrl: string) => void;
  onSaveInterval?: (interval: string) => void; // callback when user sets a default
}

interface RRBox {
  left: number;
  width: number;
  top: number;
  height: number;
}

// ─── Interval helpers ─────────────────────────────────────────────────────────

type Interval = "1min" | "5min" | "15min" | "30min" | "1h" | "4h";

const INTERVAL_LABELS: Record<Interval, string> = {
  "1min": "1m",
  "5min": "5m",
  "15min": "15m",
  "30min": "30m",
  "1h": "1H",
  "4h": "4H",
};

// Map human-readable timeframe → internal Interval
const TF_TO_INTERVAL: Record<string, Interval> = {
  "1m": "1min", "1min": "1min",
  "5m": "5min", "5min": "5min",
  "15m": "15min", "15min": "15min",
  "30m": "30min", "30min": "30min",
  "1H": "1h", "1h": "1h",
  "4H": "4h", "4h": "4h",
};

const INTERVAL_MINS: Record<Interval, number> = {
  "1min": 1,
  "5min": 5,
  "15min": 15,
  "30min": 30,
  "1h": 60,
  "4h": 240,
};

function autoInterval(entryTime: string, exitTime?: string): Interval {
  const dur = differenceInMinutes(
    exitTime ? parseISO(exitTime) : new Date(),
    parseISO(entryTime)
  );
  if (dur < 60) return "1min";
  if (dur < 240) return "5min";
  if (dur < 4320) return "15min";
  if (dur < 20160) return "1h";
  return "4h";
}

// Use full ISO string so the API route always parses as UTC (no timezone-local ambiguity)
function toQueryStr(d: Date): string {
  return d.toISOString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export const TradeChart = forwardRef<TradeChartRef, TradeChartProps>(
  (
    {
      symbol,
      entryPrice,
      exitPrice,
      entryTime,
      exitTime,
      stopLoss,
      takeProfit,
      direction,
      source,
      defaultInterval,
      onScreenshot,
      onSaveInterval,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const [riskBox, setRiskBox] = useState<RRBox | null>(null);
    const [rewardBox, setRewardBox] = useState<RRBox | null>(null);
    const [rrLabel, setRrLabel] = useState<{ left: number; top: number; text: string } | null>(null);

    // Resolve initial interval: use saved default if valid, else auto-detect
    const initInterval: Interval = defaultInterval && TF_TO_INTERVAL[defaultInterval]
      ? TF_TO_INTERVAL[defaultInterval]
      : autoInterval(entryTime, exitTime);

    const [interval, setIntervalState] = useState<Interval>(initInterval);
    const [savedInterval, setSavedInterval] = useState<Interval | null>(
      defaultInterval && TF_TO_INTERVAL[defaultInterval] ? TF_TO_INTERVAL[defaultInterval] : null
    );
    const [retryKey, setRetryKey] = useState(0);
    const [loaded, setLoaded] = useState(true); // Chart loads automatically from local history
    const [loading, setLoading] = useState(false);
    const [noApiKey, setNoApiKey] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);
    // TradingView shows mt5 candles in IST (broker time isn't what TradingView
    // displays) — toggling this re-anchors the chart's displayed clock to IST
    // for mt5 trades too, so a candle lines up with what the trader saw on TV.
    const [tvTiming, setTvTiming] = useState(false);
    const { theme } = useAppContext();
    const isDark = theme !== "light";

    // Sync when defaultInterval prop changes (e.g. after parent saves)
    useEffect(() => {
      if (defaultInterval && TF_TO_INTERVAL[defaultInterval]) {
        const timer = setTimeout(() => setSavedInterval(TF_TO_INTERVAL[defaultInterval]), 0);
        return () => clearTimeout(timer);
      }
    }, [defaultInterval]);

    useImperativeHandle(ref, () => ({
      captureScreenshot: () => {
        if (!chartRef.current) return null;
        try {
          const canvas = chartRef.current.takeScreenshot();
          return canvas.toDataURL("image/png");
        } catch {
          return null;
        }
      },
    }));

    useEffect(() => {
      if (!loaded) return; // wait for user to click Load Chart
      let alive = true;
      let roCleanup: (() => void) | null = null;

      const run = async () => {
        if (!containerRef.current) return;

        setLoading(true);
        setError(null);
        setNoApiKey(false);

        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }

        const ivMins = INTERVAL_MINS[interval];
        const CONTEXT = 80;
        // Stored entryTime/exitTime are civil-time digits mislabeled as UTC
        // (MT5 export uses broker-server wall clock, manual entry uses the
        // trader's own IST wall clock — see lib/utils/ist-time.ts for the
        // full derivation). Undo that here so the fetch window — and every
        // anchor below — is keyed off the real UTC instant, matching the
        // candle data (which is genuinely UTC).
        const entryTrueUTC = toTrueUTC(entryTime, source);
        const exitTrueUTC = exitTime ? toTrueUTC(exitTime, source) : null;

        const start = subMinutes(entryTrueUTC, CONTEXT * ivMins);
        const end = addMinutes(exitTrueUTC ?? new Date(), CONTEXT * ivMins);

        let candles: Array<{ time: number; open: number; high: number; low: number; close: number }> = [];

        try {
          const res = await fetch(
            `/api/trade/chart-data?symbol=${encodeURIComponent(symbol)}&interval=${interval}&from=${toQueryStr(start)}&to=${toQueryStr(end)}`
          );
          const json = await res.json();

          if (!alive) return;

          if (json.noApiKey) {
            setNoApiKey(true);
            setLoading(false);
            return;
          }
          if (json.error) {
            setError(json.error);
            setLoading(false);
            return;
          }
          candles = json.candles ?? [];
          if (candles.length === 0) {
            setError("No chart data available for this symbol and period.");
            setLoading(false);
            return;
          }
        } catch {
          if (!alive) return;
          setError("Network error loading chart data.");
          setLoading(false);
          return;
        }

        if (!alive || !containerRef.current) return;

        const { createChart, ColorType, LineStyle, CrosshairMode } =
          await import("lightweight-charts");

        if (!alive || !containerRef.current) return;

        const chart = createChart(containerRef.current, {
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight || 380,
          layout: {
            background: { type: ColorType.Solid, color: "#0F0FOF" },
            textColor: "#ffffff55",
            fontSize: 11,
            fontFamily: "Inter, ui-sans-serif, sans-serif",
          },
          grid: {
            vertLines: { color: "#ffffff08" },
            horzLines: { color: "#ffffff08" },
          },
          crosshair: { mode: CrosshairMode.Normal },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: "#ffffff0f",
            barSpacing: 8,
          },
          rightPriceScale: { borderColor: "#ffffff0f" },
          watermark: {
            visible: true,
            fontSize: 28,
            horzAlign: "center",
            vertAlign: "center",
            color: "#ffffff07",
            text: symbol,
          },
        });

        chartRef.current = chart;

        const candleSeries = chart.addCandlestickSeries({
          upColor: "#b2b5be",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#b2b5be",
          wickDownColor: "#ef4444",
        });

        // ── Display timezone ───────────────────────────────────────────────────
        // Candle data is genuine UTC. lightweight-charts v4 reads a timestamp's
        // UTC hour/minute and shows those digits as the label, so shifting the
        // epoch by a fixed offset before setData is how we control what wall
        // clock the chart displays. mt5 trades must show the broker/MT5
        // terminal's own time; manual trades show the IST time the trader
        // typed in. "TradingView timing" overrides this: TV always renders in
        // IST here, so when enabled every trade (mt5 included) is shifted to
        // IST instead of the broker offset — this is what makes a candle at
        // e.g. 19:50 on TradingView line up with 19:50 on this chart too.
        const displayShiftSec = (tvTiming ? IST_OFFSET_MIN : source === "mt5" ? BROKER_UTC_OFFSET_MIN : IST_OFFSET_MIN) * 60;

        const shiftedCandles = candles.map((c) => ({
          ...c,
          time: (c.time + displayShiftSec) as UTCTimestamp,
        }));

        candleSeries.setData(shiftedCandles);

        // ── Entry price line (the only reference line — SL/TP are drawn as
        // shaded risk/reward boxes below, not more lines) ─────────────────────
        candleSeries.createPriceLine({
          price: entryPrice,
          color: "rgba(255, 255, 255, 0.4)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: direction === "buy" ? "▲ Entry" : "▼ Entry",
        });

        // ── Entry / Exit markers (true-UTC anchored) ───────────────────────────
        // entryTime/exitTime are converted to the real UTC instant above, so a
        // simple nearest-candle lookup is enough — no more price-based fuzzy
        // matching, and since both markers share the same conversion, the exit
        // is always chronologically at-or-after the entry.
        function nearestCandle(targetSec: number) {
          return candles.reduce((best, c) =>
            Math.abs(c.time - targetSec) < Math.abs(best.time - targetSec) ? c : best
          );
        }

        const entryTargetSec = Math.floor(entryTrueUTC.getTime() / 1000);
        const entryCandle = nearestCandle(entryTargetSec);
        const entryTs = (entryCandle.time + displayShiftSec) as UTCTimestamp;

        const markers: Array<{
          time: UTCTimestamp;
          position: "aboveBar" | "belowBar";
          color: string;
          shape: "arrowUp" | "arrowDown" | "circle";
          text: string;
        }> = [
          {
            time: entryTs,
            position: direction === "buy" ? "belowBar" : "aboveBar",
            color: direction === "buy" ? "#10b981" : "#ef4444",
            shape: direction === "buy" ? "arrowUp" : "arrowDown",
            text: `Entry $${entryPrice}`,
          },
        ];

        let exitCandle: typeof candles[number] | null = null;
        if (exitPrice != null && exitTrueUTC) {
          const exitTargetSec = Math.floor(exitTrueUTC.getTime() / 1000);
          exitCandle = nearestCandle(exitTargetSec);
          const exitTs = (exitCandle.time + displayShiftSec) as UTCTimestamp;
          if (exitCandle.time !== entryCandle.time) {
            markers.push({
              time: exitTs,
              position: direction === "buy" ? "aboveBar" : "belowBar",
              color: "#f59e0b",
              shape: "circle",
              text: `Exit $${exitPrice}`,
            });
          }
        }

        candleSeries.setMarkers(
          markers.sort((a, b) => (a.time as number) - (b.time as number))
        );

        // ── Scroll to trade period (centre on the matched candles) ────────────
        const viewPad = 30 * ivMins * 60;
        const lo = Math.min(entryCandle.time, exitCandle ? exitCandle.time : entryCandle.time);
        const hi = Math.max(entryCandle.time, exitCandle ? exitCandle.time : entryCandle.time);
        const viewFrom = (lo + displayShiftSec - viewPad) as UTCTimestamp;
        const viewTo = (hi + displayShiftSec + viewPad) as UTCTimestamp;

        try {
          chart.timeScale().setVisibleRange({ from: viewFrom, to: viewTo });
        } catch {
          // ignore — range might exceed data bounds
        }

        // ── Risk / Reward box overlay (TradingView Position-tool style) ───────
        const boxEndTs = exitCandle
          ? ((exitCandle.time + displayShiftSec) as UTCTimestamp)
          : ((shiftedCandles[shiftedCandles.length - 1]?.time ?? entryTs) as UTCTimestamp);

        function updateBoxes() {
          if (!containerRef.current) return;
          const timeScale = chart.timeScale();
          const x1 = timeScale.timeToCoordinate(entryTs);
          const x2 = timeScale.timeToCoordinate(boxEndTs) ?? containerRef.current.offsetWidth;
          const entryY = candleSeries.priceToCoordinate(entryPrice);

          if (x1 == null || entryY == null) {
            setRiskBox(null);
            setRewardBox(null);
            setRrLabel(null);
            return;
          }

          const left = Math.min(x1, x2);
          const width = Math.max(2, Math.abs(x2 - x1));

          const slY = stopLoss != null && stopLoss > 0 ? candleSeries.priceToCoordinate(stopLoss) : null;
          setRiskBox(
            slY != null ? { left, width, top: Math.min(entryY, slY), height: Math.abs(slY - entryY) } : null
          );

          const tpY = takeProfit != null && takeProfit > 0 ? candleSeries.priceToCoordinate(takeProfit) : null;
          setRewardBox(
            tpY != null ? { left, width, top: Math.min(entryY, tpY), height: Math.abs(tpY - entryY) } : null
          );

          if (stopLoss && takeProfit) {
            const risk = Math.abs(entryPrice - stopLoss);
            const reward = Math.abs(takeProfit - entryPrice);
            setRrLabel({
              left: left + 6,
              top: Math.min(entryY, slY ?? entryY, tpY ?? entryY) - 16,
              text: `R:R 1:${(risk > 0 ? reward / risk : 0).toFixed(2)}`,
            });
          } else {
            setRrLabel(null);
          }
        }

        // setVisibleRange() above doesn't synchronously recompute the price
        // scale/layout — calling priceToCoordinate/timeToCoordinate right away
        // reads stale bounds, which briefly puts the box way off. Rather than
        // guess how many frames the chart needs to settle, keep recomputing
        // on every frame for a short window until it stabilizes.
        let settleRaf = 0;
        let settleFrames = 0;
        const SETTLE_MAX_FRAMES = 40; // ~0.65s at 60fps — generous, cheap no-op once settled
        const settleLoop = () => {
          if (!alive) return;
          updateBoxes();
          settleFrames += 1;
          if (settleFrames < SETTLE_MAX_FRAMES) {
            settleRaf = requestAnimationFrame(settleLoop);
          }
        };
        settleRaf = requestAnimationFrame(settleLoop);
        chart.timeScale().subscribeVisibleTimeRangeChange(updateBoxes);

        // ── Drag & Scroll (Wheel) listeners for instant coordinate updates ───────
        let isMouseDown = false;
        const handleMouseDown = () => { isMouseDown = true; };
        const handleMouseUp = () => { isMouseDown = false; };
        const handleMouseMove = () => {
          if (isMouseDown) {
            updateBoxes();
          }
        };
        const handleWheel = () => {
          updateBoxes();
        };
        const handleTouchMove = () => {
          updateBoxes();
        };

        const container = containerRef.current;
        if (container) {
          container.addEventListener("mousedown", handleMouseDown);
          window.addEventListener("mouseup", handleMouseUp);
          container.addEventListener("mousemove", handleMouseMove);
          container.addEventListener("wheel", handleWheel, { passive: true });
          container.addEventListener("touchmove", handleTouchMove, { passive: true });
        }

        // ── Responsive width + height ──────────────────────────────────────────
        // Only `width` was ever re-applied here, so squeezing the chart
        // vertically left the canvas at its original fixed height while the
        // box overlay's coordinates (derived from priceToCoordinate, which
        // depends on the chart's rendered height) went stale.
        const ro = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: containerRef.current.offsetWidth,
              height: containerRef.current.offsetHeight,
            });
            updateBoxes();
            requestAnimationFrame(updateBoxes);
          }
        });
        ro.observe(containerRef.current);
        roCleanup = () => {
          cancelAnimationFrame(settleRaf);
          ro.disconnect();
          chart.timeScale().unsubscribeVisibleTimeRangeChange(updateBoxes);
          if (container) {
            container.removeEventListener("mousedown", handleMouseDown);
            window.removeEventListener("mouseup", handleMouseUp);
            container.removeEventListener("mousemove", handleMouseMove);
            container.removeEventListener("wheel", handleWheel);
            container.removeEventListener("touchmove", handleTouchMove);
          }
        };

        setLoading(false);
      };

      run();

      return () => {
        alive = false;
        roCleanup?.();
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
      };
       
    }, [loaded, interval, retryKey, symbol, entryTime, exitTime, entryPrice, exitPrice, stopLoss, takeProfit, direction, source, isDark, tvTiming]);

    function handleCapture() {
      if (!chartRef.current) return;
      try {
        const canvas = chartRef.current.takeScreenshot();
        const dataUrl = canvas.toDataURL("image/png");
        onScreenshot?.(dataUrl);
      } catch {
        // ignore
      }
    }

    function handleSaveInterval() {
      setSavedInterval(interval);
      onSaveInterval?.(INTERVAL_LABELS[interval]);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }

    const hasNoDefaultSet = !savedInterval;

    return (
      <div className="rounded-xl border border-border overflow-hidden bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-3.5 w-3.5 text-white/65" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {symbol} · Live Chart
            </span>
            {hasNoDefaultSet && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400/70 bg-amber-500/8 border border-amber-500/15 rounded px-1.5 py-0.5">
                <Clock className="h-3 w-3" />
                No default timeframe
              </span>
            )}
            {savedInterval && !hasNoDefaultSet && (
              <span className="text-[10px] text-white/40 bg-white/[0.08]/8 border border-white/[0.08] rounded px-1.5 py-0.5">
                Default: {INTERVAL_LABELS[savedInterval]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Interval tabs */}
            <div className="flex rounded-md bg-muted p-0.5 gap-px">
              {(Object.keys(INTERVAL_LABELS) as Interval[]).map((iv) => (
                <button
                  key={iv}
                  onClick={() => setIntervalState(iv)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] font-medium transition-colors relative",
                    interval === iv
                      ? "bg-white/[0.09] text-white"
                      : "text-muted-foreground hover:text-foreground/65"
                  )}
                >
                  {INTERVAL_LABELS[iv]}
                  {savedInterval === iv && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              ))}
            </div>

            {/* TradingView timing toggle — shifts candle display to match TradingView's clock */}
            <button
              type="button"
              onClick={() => setTvTiming((v) => !v)}
              title="Show candle times the way TradingView displays them"
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors",
                tvTiming
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                  : "bg-white/[0.07] border-white/[0.10] text-white/65 hover:bg-white/[0.09]"
              )}
            >
              <Clock className="h-3 w-3" />
              TradingView Timing
            </button>

            {/* Set as default button — shown when current interval differs from saved */}
            {loaded && interval !== savedInterval && !loading && !error && !noApiKey && (
              <button
                onClick={handleSaveInterval}
                title="Save this timeframe as default for this trade"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-600/15 border border-amber-500/20 text-[11px] font-medium text-amber-400 hover:bg-amber-600/25 transition-colors"
              >
                {justSaved ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {justSaved ? "Saved!" : "Set default"}
              </button>
            )}

            {/* Capture button */}
            {loaded && !loading && !error && !noApiKey && (
              <button
                onClick={handleCapture}
                title="Capture chart screenshot"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.07] border border-white/[0.10] text-[11px] font-medium text-white/65 hover:bg-white/[0.09]/25 transition-colors"
              >
                <Camera className="h-3 w-3" />
                Capture
              </button>
            )}
          </div>
        </div>

        {/* No default timeframe hint */}
        {loaded && hasNoDefaultSet && !loading && !error && !noApiKey && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
            <Clock className="h-3.5 w-3.5 text-amber-400/60 shrink-0" />
            <p className="text-[11px] text-amber-400/60">
              No default timeframe saved for this trade. Select a timeframe above and click <strong className="text-amber-400">Set default</strong> so the chart always opens on your setup&apos;s timeframe.
            </p>
          </div>
        )}

        {/* Chart canvas area */}
        <div className="relative overflow-hidden" style={{ height: 380 }}>
          <div ref={containerRef} className="w-full h-full" />

          {/* Risk / Reward box overlay — TradingView Position-tool style */}
          {riskBox && (
            <div
              className="absolute pointer-events-none whitespace-nowrap"
              style={{
                left: riskBox.left,
                width: riskBox.width,
                top: riskBox.top,
                height: riskBox.height,
                zIndex: 5,
                background: "rgba(239, 68, 68, 0.12)",
                borderTop: "1px dashed rgba(255, 255, 255, 0.15)",
                borderBottom: "1px dashed rgba(255, 255, 255, 0.15)",
                boxSizing: "border-box",
              }}
            >
              <span
                className="absolute left-1 text-[9px] font-semibold"
                style={{ bottom: -16, color: "rgba(248, 113, 113, 0.9)" }}
              >
                Risk
              </span>
            </div>
          )}
          {rewardBox && (
            <div
              className="absolute pointer-events-none whitespace-nowrap"
              style={{
                left: rewardBox.left,
                width: rewardBox.width,
                top: rewardBox.top,
                height: rewardBox.height,
                zIndex: 5,
                background: "rgba(255, 255, 255, 0.06)",
                borderTop: "1px dashed rgba(255, 255, 255, 0.15)",
                borderBottom: "1px dashed rgba(255, 255, 255, 0.15)",
                boxSizing: "border-box",
              }}
            >
              <span
                className="absolute left-1 text-[9px] font-semibold"
                style={{ top: -16, color: "rgba(255, 255, 255, 0.6)" }}
              >
                Reward
              </span>
            </div>
          )}
          {rrLabel && (
            <div
              className="absolute pointer-events-none px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{
                left: rrLabel.left,
                top: rrLabel.top,
                zIndex: 6,
                background: "rgba(0, 0, 0, 0.65)",
                color: "rgba(255, 255, 255, 0.85)",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {rrLabel.text}
            </div>
          )}

          {/* Lazy-load gate — shown before user clicks Load Chart */}
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
              <BarChart2 className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-[13px] font-semibold text-muted-foreground">Chart not loaded</p>
              <p className="text-[11px] text-muted-foreground/60 max-w-xs text-center">
                Click below to fetch candle data from local history.
              </p>
              <button
                onClick={() => { setLoaded(true); setLoading(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.08] border border-white/[0.10] text-[13px] font-semibold text-white/65 hover:bg-white/[0.09] hover:text-white/70 transition-colors"
              >
                <Play className="h-4 w-4" />
                Load candle data
              </button>
            </div>
          )}

          {loaded && loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background">
              <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
              <p className="text-[11px] text-muted-foreground/60">Loading chart data…</p>
            </div>
          )}

          {loaded && !loading && noApiKey && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
              <BarChart2 className="h-9 w-9 text-muted-foreground/30" />
              <p className="text-[13px] font-semibold text-muted-foreground">
                Chart data not configured
              </p>
              <p className="text-[11px] text-muted-foreground/60 max-w-sm">
                Add{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  TWELVE_DATA_API_KEY
                </code>{" "}
                to your{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  .env.local
                </code>{" "}
                to enable live charts.
              </p>
              <a
                href="https://twelvedata.com/pricing"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[12px] text-white/65 hover:text-white/70 transition-colors"
              >
                Get a free API key (800 calls/day)
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {loaded && !loading && error && !noApiKey && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-400/30" />
              <p className="text-[12px] text-muted-foreground max-w-xs">{error}</p>
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-[12px] text-muted-foreground hover:text-foreground/75 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Price-line legend */}
        {loaded && !loading && !error && !noApiKey && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-t border-border">
            <LegendItem
              color={direction === "buy" ? "#10b981" : "#ef4444"}
              label={`${direction === "buy" ? "▲" : "▼"} Entry $${entryPrice}`}
            />
            {exitPrice != null && (
              <LegendItem color="#f59e0b" label={`Exit $${exitPrice}`} />
            )}
            {stopLoss != null && stopLoss > 0 && (
              <LegendItem color="#ef4444" swatch label={`Risk (SL $${stopLoss})`} />
            )}
            {takeProfit != null && takeProfit > 0 && (
              <LegendItem color="#22c55e" swatch label={`Reward (TP $${takeProfit})`} />
            )}
          </div>
        )}
      </div>
    );
  }
);

TradeChart.displayName = "TradeChart";

function LegendItem({
  color,
  label,
  dashed,
  swatch,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  swatch?: boolean;
}) {
  if (swatch) {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className="h-2.5 w-2.5 rounded-sm border"
          style={{ background: `${color}30`, borderColor: `${color}90` }}
        />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-5 rounded-full"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 3px, transparent 3px, transparent 7px)`
            : color,
          height: "2px",
        }}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
