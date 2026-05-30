"use client";

// ─── BacktestChart ─────────────────────────────────────────────────────────────
// Renders candlesticks for XAUUSD/BTCUSD with:
//  • Bar-by-bar replay (sliced data)
//  • Live candle updates via series.update()
//  • Click-to-set-start-bar interaction
//  • Manual trade markers (entries/exits)
//  • BUY/SELL overlay buttons (during replay)

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type CandlestickData,
  type HistogramData,
} from "lightweight-charts";
import type { Candle, ManualTrade, LiveStatus } from "./types";

interface Props {
  candles:            Candle[];           // full loaded candles
  replayIndex:        number | null;      // if set: only show [0..replayIndex]
  replayStartIndex:   number | null;      // show gold marker here
  isSelectingStart:   boolean;            // crosshair cursor mode
  onStartBarSelect:   (idx: number) => void;
  manualTrades:       ManualTrade[];      // closed trades → markers
  openTrade:          ManualTrade | null; // unrealised position
  openTradeUnrealised: number;            // floating P&L for overlay
  liveCandle:         Candle | null;      // latest live price
  liveStatus:         LiveStatus;
  isInReplay:         boolean;            // show BUY/SELL buttons
  onBuy:              () => void;
  onSell:             () => void;
}

const CHART_BG = "#0f0f0f";
const GRID     = "#1a1a1a";
const TEXT     = "#8a9bb0";

export function BacktestChart({
  candles, replayIndex, replayStartIndex, isSelectingStart,
  onStartBarSelect, manualTrades, openTrade, openTradeUnrealised,
  liveCandle, liveStatus, isInReplay, onBuy, onSell,
}: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const candleSeriesRef= useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef   = useRef<ISeriesApi<"Histogram"> | null>(null);

  // ── Build chart on mount ──────────────────────────────────────────────────
  const buildChart = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width:  el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: CHART_BG },
        textColor:  TEXT,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible:    true,
        secondsVisible: false,
        borderColor:    GRID,
      },
      rightPriceScale: { borderColor: GRID },
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor:         "#F0B90B",
      downColor:       "#F6465D",
      borderUpColor:   "#F0B90B",
      borderDownColor: "#F6465D",
      wickUpColor:     "#F0B90B",
      wickDownColor:   "#F6465D",
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addHistogramSeries({
      color:       "rgba(240,185,11,0.3)",
      priceFormat: { type: "volume" },
      priceScaleId:"volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volSeriesRef.current = volSeries;

    // ── Tooltip ───────────────────────────────────────────────────────────────
    const tooltip = document.createElement("div");
    tooltip.style.cssText = [
      "position:absolute", "top:8px", "left:8px",
      "background:rgba(15,15,15,0.92)", "border:1px solid #2a2a2a",
      "border-radius:6px", "padding:6px 10px",
      "font-size:11px", "font-family:\"JetBrains Mono\",monospace",
      "color:#d1d5db", "pointer-events:none", "z-index:10",
      "line-height:1.7", "min-width:200px",
    ].join(";");
    el.style.position = "relative";
    el.appendChild(tooltip);

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) { tooltip.style.display = "none"; return; }
      const cData = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      if (!cData) { tooltip.style.display = "none"; return; }

      const d = new Date((param.time as number) * 1000);
      tooltip.style.display = "block";
      tooltip.innerHTML = [
        `<span style="color:#8a9bb0">${d.toISOString().replace("T"," ").slice(0,16)} UTC</span>`,
        `O <b style="color:#F0B90B">${cData.open.toFixed(2)}</b>  ` +
        `H <b style="color:#F0B90B">${cData.high.toFixed(2)}</b>  ` +
        `L <b style="color:#F6465D">${cData.low.toFixed(2)}</b>  ` +
        `C <b style="color:#F0B90B">${cData.close.toFixed(2)}</b>`,
      ].join("<br>");
    });

    // ── Auto-resize ───────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      try { chart.remove(); } catch { /* already disposed */ }
    };
  }, []);

  useEffect(() => {
    const cleanup = buildChart();
    return () => { cleanup?.(); };
  }, [buildChart]);

  // ── Click handler for start-bar selection ────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !isSelectingStart) return;

    const handler = (param: { time?: Time }) => {
      if (!param.time) return;
      const clickTime = param.time as number;
      // Find candle index by time
      const visible = replayIndex != null ? candles.slice(0, replayIndex + 1) : candles;
      const idx = visible.findIndex((c) => c.time === clickTime);
      if (idx >= 0) onStartBarSelect(idx);
    };

    chart.subscribeClick(handler);
    return () => { chart.unsubscribeClick(handler); };
  }, [isSelectingStart, candles, replayIndex, onStartBarSelect]);

  // ── Cursor style ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.style.cursor = isSelectingStart ? "crosshair" : "default";
  }, [isSelectingStart]);

  // ── Feed candle data (full or replayed slice) ────────────────────────────
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volSeriesRef.current;
    if (!cs || !vs || candles.length === 0) return;

    const slice = replayIndex != null ? candles.slice(0, replayIndex + 1) : candles;

    const cData: CandlestickData[] = slice.map((c) => ({
      time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    const vData: HistogramData[] = slice.map((c) => ({
      time:  c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "rgba(240,185,11,0.25)" : "rgba(246,70,93,0.25)",
    }));

    cs.setData(cData);
    vs.setData(vData);

    // On first full load, fit all. In replay, don't refit so user keeps their view.
    if (replayIndex == null) chartRef.current?.timeScale().fitContent();
  }, [candles, replayIndex]);

  // ── Live candle update ───────────────────────────────────────────────────
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs || !liveCandle || replayIndex != null) return; // don't update during replay

    cs.update({
      time:  liveCandle.time as Time,
      open:  liveCandle.open,
      high:  liveCandle.high,
      low:   liveCandle.low,
      close: liveCandle.close,
    });
  }, [liveCandle, replayIndex]);

  // ── Trade markers + start-bar marker ────────────────────────────────────
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;

    const markers: SeriesMarker<Time>[] = [];

    // Start bar marker
    if (replayStartIndex != null && candles[replayStartIndex]) {
      markers.push({
        time:     candles[replayStartIndex].time as Time,
        position: "belowBar",
        color:    "#F0B90B",
        shape:    "arrowUp",
        text:     "START",
      });
    }

    // Closed trade markers
    manualTrades.forEach((t) => {
      markers.push({
        time:     t.entryTime as Time,
        position: t.direction === "LONG" ? "belowBar" : "aboveBar",
        color:    t.direction === "LONG" ? "#22c55e" : "#ef4444",
        shape:    t.direction === "LONG" ? "arrowUp" : "arrowDown",
        text:     t.direction === "LONG" ? "B" : "S",
      });
      if (t.exitTime != null) {
        const pnlColor = (t.pnl ?? 0) >= 0 ? "#22c55e" : "#ef4444";
        markers.push({
          time:     t.exitTime as Time,
          position: t.direction === "LONG" ? "aboveBar" : "belowBar",
          color:    pnlColor,
          shape:    "circle",
          text:     `${(t.pnl ?? 0) >= 0 ? "+" : ""}${(t.pnl ?? 0).toFixed(0)}`,
        });
      }
    });

    // Sort ascending time (required by lightweight-charts)
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    cs.setMarkers(markers);
  }, [manualTrades, replayStartIndex, candles]);

  return (
    <div className="relative w-full h-full" style={{ background: CHART_BG }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* ── LIVE badge ───────────────────────────────────────────────── */}
      {!replayIndex && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[11px] font-semibold">
          {liveStatus === "live" && (
            <>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400">LIVE</span>
            </>
          )}
          {liveStatus === "reconnecting" && (
            <>
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-yellow-500">RECONNECTING</span>
            </>
          )}
        </div>
      )}

      {/* ── Open trade floating P&L panel ────────────────────────────── */}
      {openTrade && (
        <div className="absolute top-3 left-3 bg-[rgba(15,15,15,0.92)] border border-[#2a2a2a] rounded-md px-3 py-2 text-[11px] font-mono">
          <span className={`font-bold ${openTrade.direction === "LONG" ? "text-green-400" : "text-red-400"}`}>
            {openTrade.direction}
          </span>
          <span className="text-[#8a9bb0] ml-2">@ {openTrade.entryPrice.toFixed(2)}</span>
          <span className={`ml-3 font-bold ${openTradeUnrealised >= 0 ? "text-green-400" : "text-red-400"}`}>
            {openTradeUnrealised >= 0 ? "+" : ""}{openTradeUnrealised.toFixed(2)}
          </span>
        </div>
      )}

      {/* ── BUY / SELL overlay buttons (replay only) ─────────────────── */}
      {isInReplay && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
          <button
            onClick={onBuy}
            className="px-6 py-2 text-[13px] font-bold rounded-lg bg-green-600 text-white hover:bg-green-500 active:scale-95 transition-all shadow-lg border border-green-500"
          >
            ▲ BUY
          </button>
          <button
            onClick={onSell}
            className="px-6 py-2 text-[13px] font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all shadow-lg border border-red-500"
          >
            ▼ SELL
          </button>
        </div>
      )}
    </div>
  );
}
