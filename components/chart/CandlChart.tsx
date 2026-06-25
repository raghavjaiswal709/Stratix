"use client";

/**
 * CandlChart — live candlestick chart.
 *
 * Spec called for @candllabs/charts, but that package does not exist on npm.
 * It is implemented here with `lightweight-charts` v4 (already installed),
 * preserving the same public contract: <CandlChart symbol interval />.
 *
 * - Loads historical candles from /api/candles on mount (engine.setData).
 * - Streams live ticks from the Oracle WS backend (NEXT_PUBLIC_WS_URL),
 *   building the in-progress candle for the current interval (engine.updateLast).
 * - Auto-reconnects the WS every 5s and shows a connection status dot.
 *
 * Must be dynamically imported with { ssr: false } — it uses the canvas API.
 */

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

interface CandlChartProps {
  symbol: string;
  interval: string;
}

interface ApiCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Tick {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
  source?: string;
}

type Status = "connected" | "disconnected" | "reconnecting";

const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** Decimal precision per symbol (used for the price axis formatting). */
function precisionFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 3;
  if (s === "XAUUSD" || s === "XAGUSD") return 2;
  if (s === "BTCUSD" || s === "ETHUSD") return 2;
  return 5; // forex majors
}

export function CandlChart({ symbol, interval }: CandlChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("disconnected");
  const [error, setError] = useState<string | null>(null);

  // ── 1. Create chart + load history (re-runs on symbol/interval change) ───────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    closedRef.current = false;

    const precision = precisionFor(symbol);
    const minMove = Number((1 / Math.pow(10, precision)).toFixed(precision));

    const istFmt = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 480,
      layout: {
        background: { color: "#0f0f0f" },
        textColor: "#d1d4dc",
        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.10)",
        timeVisible: true,
        secondsVisible: false,
        // lightweight-charts tickMarkFormatter controls x-axis labels
        tickMarkFormatter: (time: number) =>
          istFmt.format(new Date(time * 1000)),
      },
      // localization.timeFormatter controls the crosshair time label
      localization: {
        timeFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).format(d) + " IST";
        },
      },
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision, minMove },
    });
    seriesRef.current = series;

    const handleResize = () => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.resize(el.clientWidth, el.clientHeight || 480);
      }
    };
    window.addEventListener("resize", handleResize);

    // Load historical candles.
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(
            interval
          )}&limit=500`
        );
        if (!res.ok) throw new Error(`history ${res.status}`);
        const data: ApiCandle[] = await res.json();
        if (closedRef.current) return;

        const bars: CandlestickData[] = data.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        series.setData(bars);
        lastCandleRef.current = bars.length ? bars[bars.length - 1] : null;
        chart.timeScale().fitContent();
      } catch (err) {
        if (!closedRef.current) setError((err as Error).message);
      } finally {
        if (!closedRef.current) setLoading(false);
      }
    })();

    return () => {
      closedRef.current = true;
      window.removeEventListener("resize", handleResize);
      seriesRef.current = null;
      lastCandleRef.current = null;
      try {
        chart.remove();
      } catch {
        /* already disposed */
      }
      chartRef.current = null;
    };
  }, [symbol, interval]);

  // ── 2. Live price stream — direct browser connections, no relay server ─────────
  useEffect(() => {
    let disposed = false;
    const bucketSec = INTERVAL_SECONDS[interval] ?? 60;

    // Map each chart symbol to the Binance streams that carry its price
    const BINANCE_STREAMS: Record<string, string> = {
      BTCUSD: "btcusdt@trade",
      ETHUSD: "ethusdt@trade",
      XAUUSD: "xautusdt@bookTicker/paxgusdt@bookTicker",
      // Forex and silver handled by REST polling below
    };

    const binanceStreams = BINANCE_STREAMS[symbol];

    if (binanceStreams) {
      // ── Binance WebSocket (BTC, ETH, XAU) ────────────────────────────────────
      let ws: WebSocket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

      const connect = () => {
        if (disposed) return;
        setStatus(s => s === "connected" ? s : "reconnecting");
        ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${binanceStreams}`);
        wsRef.current = ws;

        ws.onopen = () => { if (!disposed) setStatus("connected"); };

        ws.onmessage = (evt) => {
          if (disposed) return;
          try {
            const msg = JSON.parse(evt.data as string);
            const d = msg.data;
            if (!d) return;

            let price = 0;
            if (d.e === "trade") price = parseFloat(d.p);
            else if (d.b && d.a) price = (parseFloat(d.b) + parseFloat(d.a)) / 2;
            if (!price) return;

            const now = Date.now();
            applyTick({ symbol, price, timestamp: d.T || now }, bucketSec);
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          if (disposed) return;
          setStatus("disconnected");
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
      };

      connect();
      return () => {
        disposed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) { ws.onclose = null; try { ws.close(); } catch { /* ignore */ } }
        wsRef.current = null;
      };
    }

    // ── REST polling for Forex + Silver (Vercel proxy routes) ─────────────────
    // These symbols have no Binance stream, so we poll our Vercel API every 1s.
    setStatus("connected"); // REST polling is always "live"

    const REST_ENDPOINTS: Record<string, string> = {
      XAGUSD: "/api/silver",
      EURUSD: "/api/forex-rates",
      GBPUSD: "/api/forex-rates",
      USDJPY: "/api/forex-rates",
      USDCHF: "/api/forex-rates",
      USDCAD: "/api/forex-rates",
      AUDUSD: "/api/forex-rates",
    };

    const endpoint = REST_ENDPOINTS[symbol];
    if (!endpoint) return;

    const poll = async () => {
      if (disposed) return;
      try {
        const res = await fetch(endpoint);
        if (!res.ok) return;
        const data = await res.json();
        // /api/silver returns { price } — /api/forex-rates returns { EURUSD: x, ... }
        const price = data.price ?? data[symbol];
        if (Number.isFinite(price) && price > 0) {
          applyTick({ symbol, price, timestamp: Date.now() }, bucketSec);
        }
      } catch { /* ignore */ }
    };

    poll();
    const id = setInterval(poll, 1000);
    return () => { disposed = true; clearInterval(id); };
  }, [symbol, interval]);

  /** Fold a tick into the in-progress candle and push it to the series. */
  function applyTick(tick: Tick, bucketSec: number) {
    const series = seriesRef.current;
    if (!series) return;

    // Always use wall-clock time for the candle bucket.
    // If the server's timestamp is stale (> 5s old) — e.g. gold-api's
    // `updatedAt` which only refreshes every ~30s — fall back to Date.now()
    // so the live candle tracks the real current minute, not a frozen one.
    const now = Date.now();
    const tsMs = tick.timestamp || now;
    const effectiveMs = Math.abs(now - tsMs) > 5000 ? now : tsMs;
    const tSec = Math.floor(effectiveMs / 1000);
    const bucket = (Math.floor(tSec / bucketSec) * bucketSec) as UTCTimestamp;
    const prev = lastCandleRef.current;

    let candle: CandlestickData;
    if (!prev || (prev.time as number) < bucket) {
      // New candle opens at the tick price.
      candle = { time: bucket, open: tick.price, high: tick.price, low: tick.price, close: tick.price };
    } else if ((prev.time as number) === bucket) {
      // Update the current candle.
      candle = {
        time: bucket,
        open: prev.open,
        high: Math.max(prev.high, tick.price),
        low: Math.min(prev.low, tick.price),
        close: tick.price,
      };
    } else {
      // Out-of-order tick older than the last candle — ignore.
      return;
    }

    lastCandleRef.current = candle;
    try {
      series.update(candle);
    } catch {
      /* series disposed mid-update */
    }
  }

  const statusColor =
    status === "connected" ? "#10b981" : status === "reconnecting" ? "#f59e0b" : "#ef4444";
  const statusLabel =
    status === "connected" ? "Live" : status === "reconnecting" ? "Reconnecting…" : "Offline";

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 220px)", minHeight: 360 }}>
      {/* Connection status */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#0f0f0f]/80 px-2.5 py-1 backdrop-blur">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            animation: status === "reconnecting" ? "pulse 1s ease-in-out infinite" : undefined,
          }}
        />
        <span className="text-[10px] font-medium uppercase tracking-widest text-white/50">
          {statusLabel}
        </span>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0f0f0f]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
          <span className="text-[11px] font-medium uppercase tracking-widest text-white/30">
            Loading {symbol} · {interval}
          </span>
        </div>
      )}

      {/* Error (no data) */}
      {!loading && error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0f0f0f] text-center">
          <span className="text-[12px] font-semibold text-white/60">Couldn’t load candles</span>
          <span className="text-[11px] text-white/30">{error}</span>
        </div>
      )}

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

export default CandlChart;
