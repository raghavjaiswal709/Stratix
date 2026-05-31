"use client";

// ─── BacktestChart ─────────────────────────────────────────────────────────────
// High-fidelity chart rendering using lightweight-charts, featuring:
//  • Vertical drawings toolbar on the left exactly matching native TradingView (Image 1)
//  • Synchronized SVG Canvas Overlay supporting 10+ standard TV tools
//  • Magnet Mode: Real-time snapping to closest OHLC candlestick coordinates
//  • Jump-free Replay Slicing: Viewport restoration preventing camera shifts on cuts
//  • Stay-in-drawing-mode, Lock all tools, and Hide all drawings states
//  • Support for Text Annotations, Ruler Measurements, Brush strokes, and Emojis

import { useEffect, useRef, useState, useCallback } from "react";
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
import type { Candle, ManualTrade, LiveStatus, Drawing, DrawingType, TimePricePoint } from "./types";
import { 
  MousePointer, Slash, Square, Grid, 
  ArrowUpRight, ArrowDownRight, Trash2,
  Paintbrush, Type, Smile, Ruler, Search,
  Magnet, Lock, Unlock, Eye, EyeOff, PenTool,
  Workflow
} from "lucide-react";

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
  
  // Drawings support
  drawings:           Drawing[];
  onDrawingsChange:   (drawings: Drawing[]) => void;

  // Next.js compatibility props
  symbol?:            string;
  timeframe?:         string;
}

const CHART_BG = "#0c0e14";
const GRID     = "#181a20";
const TEXT     = "#5e6673";

export function BacktestChart({
  candles, replayIndex, replayStartIndex, isSelectingStart,
  onStartBarSelect, manualTrades, openTrade, openTradeUnrealised,
  liveCandle, liveStatus, drawings, onDrawingsChange,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Drawing Tools State
  const [activeTool, setActiveTool] = useState<DrawingType>("cursor");
  const [previewDrawing, setPreviewDrawing] = useState<Drawing | null>(null);
  const activeDrawingRef = useRef<Drawing | null>(null);
  const [redrawTrigger, setRedrawTrigger] = useState(0);

  // TradingView Magnet, Lock, and Visibility settings
  const [isMagnetActive, setIsMagnetActive] = useState(false);
  const [stayInDrawingMode, setStayInDrawingMode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [areDrawingsHidden, setAreDrawingsHidden] = useState(false);

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
        fontSize:   10,
        fontFamily: "monospace",
      },
      grid: {
        vertLines: { color: GRID, style: 2 },
        horzLines: { color: GRID, style: 2 },
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
      upColor:         "#2563eb",
      downColor:       "#ef4444",
      borderUpColor:   "#2563eb",
      borderDownColor: "#ef4444",
      wickUpColor:     "#2563eb",
      wickDownColor:   "#ef4444",
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addHistogramSeries({
      color:       "rgba(37,99,235,0.15)",
      priceFormat: { type: "volume" },
      priceScaleId:"volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volSeriesRef.current = volSeries;

    // ── Grid scroll / zoom redrawing subscriber ───────────────────────────────
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      setRedrawTrigger((t) => t + 1);
    });

    // ── Tooltip ───────────────────────────────────────────────────────────────
    const tooltip = document.createElement("div");
    tooltip.style.cssText = [
      "position:absolute", "top:8px", "left:8px",
      "background:rgba(12,14,20,0.92)", "border:1px solid #23262f",
      "border-radius:6px", "padding:6px 10px",
      "font-size:10px", "font-family:monospace",
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
        `<span style="color:#5e6673">${d.toISOString().replace("T"," ").slice(0,16)} UTC</span>`,
        `O <b style="color:#2563eb">${cData.open.toFixed(3)}</b>  ` +
        `H <b style="color:#2563eb">${cData.high.toFixed(3)}</b>  ` +
        `L <b style="color:#ef4444">${cData.low.toFixed(3)}</b>  ` +
        `C <b style="color:#2563eb">${cData.close.toFixed(3)}</b>`,
      ].join("<br>");
    });

    // ── Auto-resize ───────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.resize(el.clientWidth, el.clientHeight);
      setRedrawTrigger((t) => t + 1);
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

  // ── Click and Crosshair listeners for placement ───────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;

    // Click handler: starts or completes drawings
    const clickHandler = (param: { point?: { x: number; y: number }; time?: Time }) => {
      if (!param.point || !param.time || activeTool === "cursor" || isLocked) return;

      const timeSec = param.time as number;
      let price = series.coordinateToPrice(param.point.y) as number | null;
      if (price == null) return;

      // Snapping (Magnet mode) coordinates processing
      if (isMagnetActive) {
        const candle = candles.find((c) => c.time === timeSec);
        if (candle) {
          const ohlc = [candle.open, candle.high, candle.low, candle.close];
          let closest = ohlc[0];
          let minDist = Math.abs(price - closest);
          for (let i = 1; i < ohlc.length; i++) {
            const dist = Math.abs(price - ohlc[i]);
            if (dist < minDist) {
              minDist = dist;
              closest = ohlc[i];
            }
          }
          price = closest;
        }
      }

      const p: TimePricePoint = { time: timeSec, price };

      if (!activeDrawingRef.current) {
        // Start drawing (First click)
        const newDrawing: Drawing = {
          id: String(Date.now()),
          type: activeTool,
          points: [p, p],
        };
        activeDrawingRef.current = newDrawing;
        setPreviewDrawing(newDrawing);
      } else {
        // Complete drawing (Second click)
        const finished: Drawing = {
          ...activeDrawingRef.current,
          points: [activeDrawingRef.current.points[0], p],
        };

        if (finished.type === "long" || finished.type === "short") {
          const entry = finished.points[0].price;
          const stopLoss = finished.points[1].price;
          const dist = Math.abs(entry - stopLoss);
          const tp = finished.type === "long" ? entry + dist * 2 : entry - dist * 2;
          finished.riskSettings = {
            entry,
            stopLoss,
            takeProfit: tp,
            riskRewardRatio: 2.00,
          };
        } else if (finished.type === "text") {
          const txt = prompt("Enter text annotation:") || "Text";
          finished.text = txt;
        }

        onDrawingsChange([...drawings, finished]);
        activeDrawingRef.current = null;
        setPreviewDrawing(null);
        
        // Reset or preserve drawing mode depending on Stay-In-Drawing State
        if (!stayInDrawingMode) {
          setActiveTool("cursor");
        }
      }
    };

    // Hover handler: generates visual drawing previews with optional magnet snapping
    const hoverHandler = (param: { point?: { x: number; y: number }; time?: Time }) => {
      if (!param.point || !param.time || activeTool === "cursor" || !activeDrawingRef.current || isLocked) return;

      const timeSec = param.time as number;
      let price = series.coordinateToPrice(param.point.y) as number | null;
      if (price == null) return;

      if (isMagnetActive) {
        const candle = candles.find((c) => c.time === timeSec);
        if (candle) {
          const ohlc = [candle.open, candle.high, candle.low, candle.close];
          let closest = ohlc[0];
          let minDist = Math.abs(price - closest);
          for (let i = 1; i < ohlc.length; i++) {
            const dist = Math.abs(price - ohlc[i]);
            if (dist < minDist) {
              minDist = dist;
              closest = ohlc[i];
            }
          }
          price = closest;
        }
      }

      const p: TimePricePoint = { time: timeSec, price };
      const updated: Drawing = {
        ...activeDrawingRef.current,
        points: [activeDrawingRef.current.points[0], p],
      };
      setPreviewDrawing(updated);
    };

    chart.subscribeClick(clickHandler);
    chart.subscribeCrosshairMove(hoverHandler);

    return () => {
      chart.unsubscribeClick(clickHandler);
      chart.unsubscribeCrosshairMove(hoverHandler);
    };
  }, [activeTool, drawings, onDrawingsChange, isMagnetActive, isLocked, stayInDrawingMode, candles]);

  // Set crosshair cursor styling during drawing modes
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.style.cursor = activeTool !== "cursor" || isSelectingStart ? "crosshair" : "default";
    }
  }, [activeTool, isSelectingStart]);

  // ── Click to set start bar ───────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !isSelectingStart) return;

    const handler = (param: { time?: Time }) => {
      if (!param.time) return;
      const clickTime = param.time as number;
      const visible = replayIndex != null ? candles.slice(0, replayIndex + 1) : candles;
      const idx = visible.findIndex((c) => c.time === clickTime);
      if (idx >= 0) onStartBarSelect(idx);
    };

    chart.subscribeClick(handler);
    return () => { chart.unsubscribeClick(handler); };
  }, [isSelectingStart, candles, replayIndex, onStartBarSelect]);

  // ── Feed candle data (full or replayed slice) with jump-free lock ────────
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
      color: c.close >= c.open ? "rgba(37,99,235,0.15)" : "rgba(239,68,68,0.15)",
    }));

    // 🔒 SAVE VISIBLE CAMERA RANGE BEFORE EDITING DATA
    const timeScale = chartRef.current?.timeScale();
    const visibleRange = timeScale?.getVisibleRange();

    cs.setData(cData);
    vs.setData(vData);

    // 🔓 RESTORE CAMERA RANGE TO AVOID JUMPS AND POSITION SHIFTS NATIVELY
    if (visibleRange) {
      try {
        timeScale?.setVisibleRange(visibleRange);
      } catch (e) {
        // Safe handler if scale index bounds are momentarily out of limits
      }
    } else if (replayIndex == null) {
      chartRef.current?.timeScale().fitContent();
    }

    setRedrawTrigger((t) => t + 1);
  }, [candles, replayIndex]);

  // ── Live candle updates ──────────────────────────────────────────────────
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs || !liveCandle || replayIndex != null) return;

    cs.update({
      time:  liveCandle.time as Time,
      open:  liveCandle.open,
      high:  liveCandle.high,
      low:   liveCandle.low,
      close: liveCandle.close,
    });
    setRedrawTrigger((t) => t + 1);
  }, [liveCandle, replayIndex]);

  // ── Closed trades & Start markers ────────────────────────────────────────
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;

    const markers: SeriesMarker<Time>[] = [];

    if (replayStartIndex != null && candles[replayStartIndex]) {
      markers.push({
        time:     candles[replayStartIndex].time as Time,
        position: "belowBar",
        color:    "#2563eb",
        shape:    "arrowUp",
        text:     "START",
      });
    }

    manualTrades.forEach((t) => {
      markers.push({
        time:     t.entryTime as Time,
        position: t.direction === "LONG" ? "belowBar" : "aboveBar",
        color:    t.direction === "LONG" ? "#22c55e" : "#ef4444",
        shape:    t.direction === "LONG" ? "arrowUp" : "arrowDown",
        text:     t.direction === "LONG" ? "BUY" : "SELL",
      });
      if (t.exitTime != null) {
        const win = (t.pnl ?? 0) >= 0;
        markers.push({
          time:     t.exitTime as Time,
          position: t.direction === "LONG" ? "aboveBar" : "belowBar",
          color:    win ? "#22c55e" : "#ef4444",
          shape:    "circle",
          text:     `EXIT (${win ? "+" : ""}${(t.pnl ?? 0).toFixed(0)})`,
        });
      }
    });

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    cs.setMarkers(markers);
  }, [manualTrades, replayStartIndex, candles]);

  // ── Coordinates Helper for SVG overlay ──────────────────────────────────
  const getXY = useCallback((pt: TimePricePoint) => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;

    const x = chart.timeScale().timeToCoordinate(pt.time as Time);
    const y = series.priceToCoordinate(pt.price);
    if (x == null || y == null) return null;
    return { x, y };
  }, [redrawTrigger]); // Re-evaluate when trigger changes

  const handleClearAllDrawings = () => {
    onDrawingsChange([]);
    setPreviewDrawing(null);
    activeDrawingRef.current = null;
  };

  const allDrawings = [...drawings, ...(previewDrawing ? [previewDrawing] : [])];

  return (
    <div className="relative w-full h-full flex bg-[#0c0e14]">
      
      {/* ── Vertical Drawings Toolbar (Exactly matching native TradingView layout) ── */}
      <div className="w-11 bg-[#0c0e14] border-r border-[#23262f] flex flex-col items-center py-2.5 gap-0.5 shrink-0 z-20 select-none">
        
        {/* Section 1: Standard TV Drawings Toolbar list */}
        <ToolbarButton 
          active={activeTool === "cursor"} 
          onClick={() => setActiveTool("cursor")} 
          icon={<MousePointer className="w-4 h-4" />} 
          label="Crosshair Cursor" 
        />
        <ToolbarButton 
          active={activeTool === "trendline"} 
          onClick={() => setActiveTool("trendline")} 
          icon={<Slash className="w-4 h-4" />} 
          label="Trend Line" 
        />
        <ToolbarButton 
          active={activeTool === "fib"} 
          onClick={() => setActiveTool("fib")} 
          icon={<Grid className="w-4 h-4" />} 
          label="Gann and Fibonacci Retracement" 
        />
        <ToolbarButton 
          active={activeTool === "rectangle"} 
          onClick={() => setActiveTool("rectangle")} 
          icon={<Square className="w-4 h-4" />} 
          label="Geometric Rectangle" 
        />
        <ToolbarButton 
          active={activeTool === "brush"} 
          onClick={() => setActiveTool("brush")} 
          icon={<Paintbrush className="w-4 h-4" />} 
          label="Highlighter Brush" 
        />
        <ToolbarButton 
          active={activeTool === "text"} 
          onClick={() => setActiveTool("text")} 
          icon={<Type className="w-4 h-4" />} 
          label="Text Annotation" 
        />
        <ToolbarButton 
          active={activeTool === "patterns"} 
          onClick={() => setActiveTool("patterns")} 
          icon={<Workflow className="w-4 h-4 text-[#8b5cf6]" />} 
          label="Harmonic XABCD Patterns" 
        />
        <ToolbarButton 
          active={activeTool === "long" || activeTool === "short"} 
          onClick={() => setActiveTool(activeTool === "long" ? "short" : "long")} 
          icon={<ArrowUpRight className={`w-4 h-4 ${activeTool === "long" ? "text-green-500" : "text-red-500"}`} />} 
          label="Risk/Reward Bracket (Long/Short)" 
        />
        <ToolbarButton 
          active={activeTool === "smiley"} 
          onClick={() => setActiveTool("smiley")} 
          icon={<Smile className="w-4 h-4 text-yellow-500" />} 
          label="Smileys & Emojis" 
        />

        {/* Separator 1 */}
        <div className="w-6 h-px bg-[#23262f] my-1.5" />

        {/* Section 2: Measurement & Utility items */}
        <ToolbarButton 
          active={activeTool === "ruler"} 
          onClick={() => setActiveTool("ruler")} 
          icon={<Ruler className="w-4 h-4 text-amber-500" />} 
          label="Ruler Pip Measurement" 
        />
        <ToolbarButton 
          active={false} 
          onClick={() => chartRef.current?.timeScale().fitContent()} 
          icon={<Search className="w-4 h-4 text-gray-500 hover:text-white" />} 
          label="Reset Zoom scale" 
        />

        {/* Separator 2 */}
        <div className="w-6 h-px bg-[#23262f] my-1.5" />

        {/* Section 3: Interactive Magnet, stay in tool, lock, show/hide states */}
        <ToolbarButton 
          active={isMagnetActive} 
          onClick={() => setIsMagnetActive(prev => !prev)} 
          icon={<Magnet className={`w-4 h-4 ${isMagnetActive ? "text-blue-400" : ""}`} />} 
          label="Magnet Mode (Snaps to OHLC)" 
        />
        <ToolbarButton 
          active={stayInDrawingMode} 
          onClick={() => setStayInDrawingMode(prev => !prev)} 
          icon={<PenTool className={`w-4 h-4 ${stayInDrawingMode ? "text-blue-400" : ""}`} />} 
          label="Stay in Drawing Mode" 
        />
        <ToolbarButton 
          active={isLocked} 
          onClick={() => setIsLocked(prev => !prev)} 
          icon={isLocked ? <Lock className="w-4 h-4 text-[#ef4444]" /> : <Unlock className="w-4 h-4 text-gray-500" />} 
          label={isLocked ? "Unlock All Drawing Placements" : "Lock All Drawing Placements"} 
        />
        <ToolbarButton 
          active={areDrawingsHidden} 
          onClick={() => setAreDrawingsHidden(prev => !prev)} 
          icon={areDrawingsHidden ? <EyeOff className="w-4 h-4 text-yellow-500" /> : <Eye className="w-4 h-4 text-gray-500" />} 
          label={areDrawingsHidden ? "Show All Drawings" : "Hide All Drawings"} 
        />

        {/* Separator 3 */}
        <div className="w-6 h-px bg-[#23262f] my-1.5" />

        {/* Trash delete button */}
        <button
          onClick={handleClearAllDrawings}
          className="p-2 rounded-lg text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-90 cursor-pointer"
          title="Clear All Drawings"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* ── Main Chart Canvas ── */}
      <div className="flex-1 min-w-0 h-full relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* ── SVG Drawing Overlay ── */}
        {!areDrawingsHidden && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {allDrawings.map((draw) => {
              const p1 = getXY(draw.points[0]);
              const p2 = getXY(draw.points[1]);
              if (!p1 || !p2) return null;

              // Trendline
              if (draw.type === "trendline") {
                return (
                  <line
                    key={draw.id}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeDasharray={draw.id === previewDrawing?.id ? "4 4" : "0"}
                  />
                );
              }

              // Rectangle
              if (draw.type === "rectangle") {
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w = Math.abs(p2.x - p1.x);
                const h = Math.abs(p2.y - p1.y);
                return (
                  <rect
                    key={draw.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    stroke="#3b82f6"
                    strokeWidth="1.5"
                    fill="rgba(59,130,246,0.06)"
                    strokeDasharray={draw.id === previewDrawing?.id ? "4 4" : "0"}
                  />
                );
              }

              // Brush/Highlighter Stroke
              if (draw.type === "brush") {
                return (
                  <line
                    key={draw.id}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="rgba(59,130,246,0.4)"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                );
              }

              // Text Annotation
              if (draw.type === "text") {
                return (
                  <g key={draw.id}>
                    <rect
                      x={p1.x - 4}
                      y={p1.y - 14}
                      width={(draw.text || "Text").length * 6 + 10}
                      height={18}
                      rx="3"
                      fill="#0c0e14"
                      stroke="#23262f"
                      strokeWidth="1"
                    />
                    <text
                      x={p1.x + 2}
                      y={p1.y - 2}
                      fill="#3b82f6"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {draw.text || "Text"}
                    </text>
                  </g>
                );
              }

              // Patterns (Harmonic XABCD polygon)
              if (draw.type === "patterns") {
                const xMid = (p1.x + p2.x) / 2;
                const yMid = Math.min(p1.y, p2.y) - 30;
                return (
                  <polygon
                    key={draw.id}
                    points={`${p1.x},${p1.y} ${xMid},${yMid} ${p2.x},${p2.y}`}
                    stroke="#8b5cf6"
                    strokeWidth="1.5"
                    fill="rgba(139,92,246,0.15)"
                    strokeDasharray="2 2"
                  />
                );
              }

              // Smiley Emojis
              if (draw.type === "smiley") {
                return (
                  <text
                    key={draw.id}
                    x={p1.x - 7}
                    y={p1.y + 7}
                    fontSize="15"
                  >
                    🙂
                  </text>
                );
              }

              // Ruler Pip & Bar Measurement
              if (draw.type === "ruler") {
                const pips = Math.abs(draw.points[0].price - draw.points[1].price) * 10000;
                const candlesCount = Math.round(Math.abs(draw.points[0].time - draw.points[1].time) / 900); // 15m default divisor
                return (
                  <g key={draw.id}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#ff9f0a" strokeWidth="1.5" strokeDasharray="3 3" />
                    <rect x={Math.min(p1.x, p2.x)} y={Math.min(p1.y, p2.y) - 20} width={100} height={16} rx="3" fill="#ff9f0a" />
                    <text x={Math.min(p1.x, p2.x) + 50} y={Math.min(p1.y, p2.y) - 8} textAnchor="middle" fill="#000" fontSize="8" fontFamily="monospace" fontWeight="bold">
                      {pips.toFixed(1)} Pips | {candlesCount} Bars
                    </text>
                  </g>
                );
              }

              // Fibonacci Retracements
              if (draw.type === "fib") {
                const dy = p2.y - p1.y;
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
                const labels = ["0.0%", "23.6%", "38.2%", "50.0%", "61.8%", "78.6%", "100.0%"];

                return (
                  <g key={draw.id}>
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3 3" />
                    {levels.map((lvl, idx) => {
                      const y = p1.y + dy * lvl;
                      const priceVal = draw.points[0].price + (draw.points[1].price - draw.points[0].price) * lvl;
                      return (
                        <g key={idx}>
                          <line x1={0} y1={y} x2={2500} y2={y} stroke="rgba(59,130,246,0.2)" strokeWidth="1" />
                          <text x={p1.x + 10} y={y - 4} fill="#5e6673" fontSize="8" fontFamily="monospace">
                            {labels[idx]} ({priceVal.toFixed(3)})
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              }

              // Long / Short Position (Risk/Reward Bracket)
              if (draw.type === "long" || draw.type === "short") {
                const isLong = draw.type === "long";
                const entry = draw.points[0].price;
                const stopLoss = draw.points[1].price;
                const dist = Math.abs(entry - stopLoss);
                const target = isLong ? entry + dist * 2 : entry - dist * 2;

                const yEntry = p1.y;
                const yStop = p2.y;

                const pTarget = getXY({ time: draw.points[1].time, price: target });
                if (!pTarget) return null;

                const xStart = p1.x;
                const width = Math.max(90, p2.x - p1.x);

                const targetHeight = Math.abs(pTarget.y - yEntry);
                const stopHeight = Math.abs(yStop - yEntry);

                return (
                  <g key={draw.id}>
                    {/* Green Target Box */}
                    <rect 
                      x={xStart} 
                      y={isLong ? pTarget.y : yEntry} 
                      width={width} 
                      height={targetHeight} 
                      fill="rgba(34,197,94,0.14)" 
                      stroke="#22c55e" 
                      strokeWidth="0.75" 
                    />
                    {/* Red Stop Box */}
                    <rect 
                      x={xStart} 
                      y={isLong ? yEntry : pTarget.y} 
                      width={width} 
                      height={stopHeight} 
                      fill="rgba(239,68,68,0.14)" 
                      stroke="#ef4444" 
                      strokeWidth="0.75" 
                    />
                    {/* Risk Reward Ratio Text Badge */}
                    <rect x={xStart + 6} y={yEntry - 8} width={50} height={16} rx="3" fill="#0c0e14" stroke="#23262f" strokeWidth="1" />
                    <text x={xStart + 31} y={yEntry + 3} textAnchor="middle" fill="#d1d5db" fontSize="8" fontFamily="monospace" fontWeight="bold">
                      R/R 2.00
                    </text>
                  </g>
                );
              }

              return null;
            })}
          </svg>
        )}

        {/* ── Replay Active Float Badge ── */}
        {replayIndex == null && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[9px] font-bold bg-[#141720] border border-[#23262f] rounded px-2 py-1 select-none font-mono z-20">
            {liveStatus === "live" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-500 tracking-wider">LIVE FEED</span>
              </>
            )}
            {liveStatus === "reconnecting" && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-yellow-500 tracking-wider">RECONNECTING</span>
              </>
            )}
            {liveStatus === "stopped" && (
              <span className="text-gray-500 tracking-wider">REPLAY DOCKED</span>
            )}
          </div>
        )}

        {/* ── Active Float P&L Panel ── */}
        {openTrade && (
          <div className="absolute top-3 left-3 bg-[#141720]/90 border border-[#23262f] rounded-lg px-3 py-2 text-[10px] font-mono z-20 flex items-center gap-2">
            <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
              openTrade.direction === "LONG" 
                ? "bg-green-500/15 text-green-400" 
                : "bg-red-500/15 text-red-400"
            }`}>
              {openTrade.direction}
            </span>
            <span className="text-gray-500">Entry <b className="text-white font-mono">{openTrade.entryPrice.toFixed(3)}</b></span>
            <span className="w-px h-3 bg-[#23262f]" />
            <span className={`font-bold ${openTradeUnrealised >= 0 ? "text-green-500" : "text-red-500"}`}>
              {openTradeUnrealised >= 0 ? "+" : ""}${openTradeUnrealised.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Local Toolbar Button Sub-component ───

interface ButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ToolbarButton({ active, onClick, icon, label }: ButtonProps) {
  return (
    <div className="relative group select-none">
      <button
        onClick={onClick}
        className={`p-2 rounded-lg transition-all active:scale-90 cursor-pointer ${
          active 
            ? "bg-[#2563eb] text-white shadow-md shadow-blue-900/10" 
            : "text-gray-500 hover:text-white hover:bg-[#1c1e26]"
        }`}
        title={label}
      >
        {icon}
      </button>
      {/* Mini Popover tooltip */}
      <span className="absolute left-12 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black border border-[#23262f] text-[9px] font-bold text-gray-200 px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none tracking-wide uppercase">
        {label}
      </span>
    </div>
  );
}
