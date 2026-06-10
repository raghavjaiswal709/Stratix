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
    const [loaded, setLoaded] = useState(true); // Chart loads automatically from local history
    const [loading, setLoading] = useState(false);
    const [noApiKey, setNoApiKey] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);
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
        // MT5 export times are broker-server time (commonly UTC+2/+3) but are
        // stored as UTC. Stored CSV candles are true UTC, so the real entry/
        // exit candles can sit a few hours away from the stated time. Pad the
        // fetch window by SEARCH_PAD so those candles are always included, then
        // we anchor the markers by price+time below.
        const SEARCH_PAD = 360; // minutes (±6h) — covers any broker UTC offset
        const start = subMinutes(parseISO(entryTime), CONTEXT * ivMins + SEARCH_PAD);
        const end = addMinutes(
          exitTime ? parseISO(exitTime) : new Date(),
          CONTEXT * ivMins + SEARCH_PAD
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
            background: { type: ColorType.Solid, color: isDark ? "#0f1117" : "#ffffff" },
            textColor: isDark ? "#ffffff55" : "#00000066",
            fontSize: 11,
            fontFamily: "Inter, ui-sans-serif, sans-serif",
          },
          grid: {
            vertLines: { color: isDark ? "#ffffff08" : "#00000010" },
            horzLines: { color: isDark ? "#ffffff08" : "#00000010" },
          },
          crosshair: { mode: CrosshairMode.Normal },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: isDark ? "#ffffff0f" : "#0000001a",
            barSpacing: 8,
          },
          rightPriceScale: { borderColor: isDark ? "#ffffff0f" : "#0000001a" },
          watermark: {
            visible: true,
            fontSize: 28,
            horzAlign: "center",
            vertAlign: "center",
            color: isDark ? "#ffffff07" : "#00000009",
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
          color: direction === "buy" ? "#10b981" : "#ef4444",
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

        // ── Entry / Exit markers (price + time anchored) ──────────────────────
        // Because the stored trade time can be skewed from candle UTC by the
        // broker's offset, snapping purely by time lands the marker on the
        // wrong candle. Instead we find the candle whose price RANGE is closest
        // to the trade price, nearest in time to the stated moment. From the
        // entry match we derive the broker offset and reuse it for the exit so
        // both markers stay mutually consistent.
        const SECS = (iso: string) => Math.floor(parseISO(iso).getTime() / 1000);
        const MAX_OFFSET = 6 * 3600; // clamp: ignore matches further than ±6h

        // Distance from a price to a candle's [low, high] range (0 if inside).
        const rangeDist = (price: number, c: typeof candles[number]) =>
          price >= c.low && price <= c.high ? 0 : Math.min(Math.abs(price - c.low), Math.abs(price - c.high));

        // Pick the best candle for (price, statedTime): minimise price-range
        // distance first, then time distance — but only consider candles within
        // ±MAX_OFFSET of the stated time so we never match a far-away revisit.
        function anchorCandle(price: number, statedTs: number) {
          let best: typeof candles[number] | null = null;
          let bestScore = Infinity;
          let bestTimeDist = Infinity;
          for (const c of candles) {
            const td = Math.abs(c.time - statedTs);
            if (td > MAX_OFFSET) continue;
            const rd = rangeDist(price, c);
            if (rd < bestScore || (rd === bestScore && td < bestTimeDist)) {
              best = c; bestScore = rd; bestTimeDist = td;
            }
          }
          // Fallback: nearest in time across all candles.
          if (!best) {
            best = candles.reduce((p, c) =>
              Math.abs(c.time - statedTs) < Math.abs(p.time - statedTs) ? c : p
            );
          }
          return best;
        }

        const entryTsRaw = SECS(entryTime);
        const entryCandle = anchorCandle(entryPrice, entryTsRaw);
        // Broker offset implied by the entry match (clamped for safety).
        let brokerOffset = entryCandle.time - entryTsRaw;
        if (Math.abs(brokerOffset) > MAX_OFFSET) brokerOffset = 0;

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
            color: direction === "buy" ? "#10b981" : "#ef4444",
            shape: direction === "buy" ? "arrowUp" : "arrowDown",
            text: `Entry $${entryPrice}`,
          },
        ];

        let exitCandle: typeof candles[number] | null = null;
        if (exitPrice != null && exitTime) {
          // Apply the SAME broker offset to the exit's stated time, then refine
          // by price so the exit marker also sits on its real candle.
          const exitTarget = SECS(exitTime) + brokerOffset;
          exitCandle = anchorCandle(exitPrice, exitTarget);
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

        // ── Scroll to trade period (centre on the matched candles) ────────────
        const viewPad = 30 * ivMins * 60;
        const lo = Math.min(entryCandle.time, exitCandle ? exitCandle.time : entryCandle.time);
        const hi = Math.max(entryCandle.time, exitCandle ? exitCandle.time : entryCandle.time);
        const viewFrom = (lo + tzOffset - viewPad) as UTCTimestamp;
        const viewTo = (hi + tzOffset + viewPad) as UTCTimestamp;

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
       
    }, [loaded, interval, retryKey, symbol, entryTime, exitTime, entryPrice, exitPrice, stopLoss, takeProfit, direction, isDark]);

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
        <div className="relative" style={{ height: 380 }}>
          <div ref={containerRef} className="w-full h-full" />

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
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
