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
import { RefreshCw, Camera, BarChart2, AlertTriangle, ExternalLink, Clock, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
  defaultInterval?: string;          // saved timeframe e.g. "1H", "15m"
  onScreenshot?: (dataUrl: string) => void;
  onSaveInterval?: (interval: string) => void; // callback when user sets a default
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
      defaultInterval,
      onScreenshot,
      onSaveInterval,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    // Resolve initial interval: use saved default if valid, else auto-detect
    const initInterval: Interval = defaultInterval && TF_TO_INTERVAL[defaultInterval]
      ? TF_TO_INTERVAL[defaultInterval]
      : autoInterval(entryTime, exitTime);

    const [interval, setIntervalState] = useState<Interval>(initInterval);
    const [savedInterval, setSavedInterval] = useState<Interval | null>(
      defaultInterval && TF_TO_INTERVAL[defaultInterval] ? TF_TO_INTERVAL[defaultInterval] : null
    );
    const [retryKey, setRetryKey] = useState(0);
    const [loading, setLoading] = useState(true);
    const [noApiKey, setNoApiKey] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);

    // Sync when defaultInterval prop changes (e.g. after parent saves)
    useEffect(() => {
      if (defaultInterval && TF_TO_INTERVAL[defaultInterval]) {
        setSavedInterval(TF_TO_INTERVAL[defaultInterval]);
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
        const start = subMinutes(parseISO(entryTime), CONTEXT * ivMins);
        const end = addMinutes(
          exitTime ? parseISO(exitTime) : new Date(),
          CONTEXT * ivMins
        );

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
            background: { type: ColorType.Solid, color: "#0f1117" },
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
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });

        candleSeries.setData(
          candles.map((c) => ({ ...c, time: c.time as UTCTimestamp }))
        );

        // ── Timezone correction ───────────────────────────────────────────────
        // lightweight-charts v4 internally strips the UTC offset and renders the
        // raw UTC hour/minute values as if they were local hours. A candle at
        // 04:30 UTC therefore shows as "04:30" even for IST users (who expect
        // "10:00"). Fix: shift every timestamp by the browser's UTC offset so
        // the "UTC hour" the library reads equals the actual local hour.
        //   IST offset = getTimezoneOffset() = -330 min → tzOffset = +19800 s
        //   04:30 UTC + 19800 s = 10:00 UTC → library reads hour=10 → shows "10:00" ✓
        const tzOffset = -new Date().getTimezoneOffset() * 60; // seconds to ADD

        const shiftedCandles = candles.map((c) => ({
          ...c,
          time: (c.time + tzOffset) as UTCTimestamp,
        }));

        candleSeries.setData(shiftedCandles);

        // ── Price lines (price-only, no timestamp) ────────────────────────────
        candleSeries.createPriceLine({
          price: entryPrice,
          color: "#3b82f6",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: direction === "buy" ? "▲ Entry" : "▼ Entry",
        });

        if (exitPrice != null) {
          candleSeries.createPriceLine({
            price: exitPrice,
            color: "#f59e0b",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: "Exit",
          });
        }

        if (stopLoss != null && stopLoss > 0) {
          candleSeries.createPriceLine({
            price: stopLoss,
            color: "#ef4444",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "SL",
          });
        }

        if (takeProfit != null && takeProfit > 0) {
          candleSeries.createPriceLine({
            price: takeProfit,
            color: "#22c55e",
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "TP",
          });
        }

        // ── Entry / Exit markers ──────────────────────────────────────────────
        // Snap to nearest candle using original UTC times, then shift the
        // marker timestamp to match the shifted candle data.
        const entryTsRaw = Math.floor(parseISO(entryTime).getTime() / 1000);
        const entryCandle = candles.reduce((p, c) =>
          Math.abs(c.time - entryTsRaw) < Math.abs(p.time - entryTsRaw) ? c : p
        );
        const entryTs = (entryCandle.time + tzOffset) as UTCTimestamp;

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
            color: direction === "buy" ? "#3b82f6" : "#ef4444",
            shape: direction === "buy" ? "arrowUp" : "arrowDown",
            text: `Entry $${entryPrice}`,
          },
        ];

        if (exitPrice != null && exitTime) {
          const exitTsRaw = Math.floor(parseISO(exitTime).getTime() / 1000);
          const exitCandle = candles.reduce((p, c) =>
            Math.abs(c.time - exitTsRaw) < Math.abs(p.time - exitTsRaw) ? c : p
          );
          const exitTs = (exitCandle.time + tzOffset) as UTCTimestamp;
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

        // ── Scroll to trade period ────────────────────────────────────────────
        const viewPad = 30 * ivMins * 60;
        const viewFrom = (entryTsRaw + tzOffset - viewPad) as UTCTimestamp;
        const viewTo = (
          (exitTime
            ? Math.floor(parseISO(exitTime).getTime() / 1000)
            : Math.floor(Date.now() / 1000)) + tzOffset + viewPad
        ) as UTCTimestamp;

        try {
          chart.timeScale().setVisibleRange({ from: viewFrom, to: viewTo });
        } catch {
          // ignore — range might exceed data bounds
        }

        // ── Responsive width ──────────────────────────────────────────────────
        const ro = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: containerRef.current.offsetWidth,
            });
          }
        });
        ro.observe(containerRef.current);
        roCleanup = () => ro.disconnect();

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interval, retryKey, symbol, entryTime, exitTime, entryPrice, exitPrice, stopLoss, takeProfit, direction]);

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
      <div className="rounded-xl border border-white/7 overflow-hidden bg-[#0f1117]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/7 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
              {symbol} · Live Chart
            </span>
            {hasNoDefaultSet && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400/70 bg-amber-500/8 border border-amber-500/15 rounded px-1.5 py-0.5">
                <Clock className="h-3 w-3" />
                No default timeframe
              </span>
            )}
            {savedInterval && !hasNoDefaultSet && (
              <span className="text-[10px] text-blue-400/70 bg-blue-500/8 border border-blue-500/15 rounded px-1.5 py-0.5">
                Default: {INTERVAL_LABELS[savedInterval]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Interval tabs */}
            <div className="flex rounded-md bg-white/5 p-0.5 gap-px">
              {(Object.keys(INTERVAL_LABELS) as Interval[]).map((iv) => (
                <button
                  key={iv}
                  onClick={() => setIntervalState(iv)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[11px] font-medium transition-colors relative",
                    interval === iv
                      ? "bg-blue-600 text-white"
                      : "text-white/35 hover:text-white/65"
                  )}
                >
                  {INTERVAL_LABELS[iv]}
                  {savedInterval === iv && (
                    <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </button>
              ))}
            </div>

            {/* Set as default button — shown when current interval differs from saved */}
            {interval !== savedInterval && !loading && !error && !noApiKey && (
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
            {!loading && !error && !noApiKey && (
              <button
                onClick={handleCapture}
                title="Capture chart screenshot"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600/15 border border-blue-500/20 text-[11px] font-medium text-blue-400 hover:bg-blue-600/25 transition-colors"
              >
                <Camera className="h-3 w-3" />
                Capture
              </button>
            )}
          </div>
        </div>

        {/* No default timeframe hint */}
        {hasNoDefaultSet && !loading && !error && !noApiKey && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/5 border-b border-amber-500/10">
            <Clock className="h-3.5 w-3.5 text-amber-400/60 shrink-0" />
            <p className="text-[11px] text-amber-400/60">
              No default timeframe saved for this trade. Select a timeframe above and click <strong className="text-amber-400">Set default</strong> so the chart always opens on your setup's timeframe.
            </p>
          </div>
        )}

        {/* Chart canvas area */}
        <div className="relative" style={{ height: 380 }}>
          <div ref={containerRef} className="w-full h-full" />

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f1117]">
              <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <p className="text-[11px] text-white/25">Loading chart data…</p>
            </div>
          )}

          {!loading && noApiKey && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f1117] px-6 text-center">
              <BarChart2 className="h-9 w-9 text-white/8" />
              <p className="text-[13px] font-semibold text-white/45">
                Chart data not configured
              </p>
              <p className="text-[11px] text-white/28 max-w-sm">
                Add{" "}
                <code className="bg-white/8 px-1.5 py-0.5 rounded text-white/50">
                  TWELVE_DATA_API_KEY
                </code>{" "}
                to your{" "}
                <code className="bg-white/8 px-1.5 py-0.5 rounded text-white/50">
                  .env.local
                </code>{" "}
                to enable live charts.
              </p>
              <a
                href="https://twelvedata.com/pricing"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[12px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                Get a free API key (800 calls/day)
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {!loading && error && !noApiKey && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f1117] px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-400/30" />
              <p className="text-[12px] text-white/35 max-w-xs">{error}</p>
              <button
                onClick={() => setRetryKey((k) => k + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-[12px] text-white/45 hover:text-white/75 hover:bg-white/8 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Price-line legend */}
        {!loading && !error && !noApiKey && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 border-t border-white/5">
            <LegendItem
              color={direction === "buy" ? "#3b82f6" : "#ef4444"}
              label={`${direction === "buy" ? "▲" : "▼"} Entry $${entryPrice}`}
            />
            {exitPrice != null && (
              <LegendItem color="#f59e0b" label={`Exit $${exitPrice}`} />
            )}
            {stopLoss != null && stopLoss > 0 && (
              <LegendItem color="#ef4444" dashed label={`SL $${stopLoss}`} />
            )}
            {takeProfit != null && takeProfit > 0 && (
              <LegendItem color="#22c55e" dashed label={`TP $${takeProfit}`} />
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
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
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
      <span className="text-[10px] text-white/30">{label}</span>
    </div>
  );
}
