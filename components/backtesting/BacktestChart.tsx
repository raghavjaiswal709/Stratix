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
  Workflow, Settings, Check, X, Volume2
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

  // Theme settings
  settings: {
    themeName: string;
    upColor: string;
    downColor: string;
    showGrid: boolean;
    showVolume: boolean;
    isYAxisLocked: boolean;
    isMagnetActive: boolean;
    bgColor: string;
  };
  onSettingsChange: (settings: Partial<Props["settings"]>) => void;
}

const CHART_BG = "#0c0e14";
const GRID     = "#181a20";
const TEXT     = "#5e6673";

export function BacktestChart({
  candles, replayIndex, replayStartIndex, isSelectingStart,
  onStartBarSelect, manualTrades, openTrade, openTradeUnrealised,
  liveCandle, liveStatus, drawings, onDrawingsChange, settings, onSettingsChange,
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
  const lastRenderedIdxRef = useRef<number | null>(null);

  // Selection & Modal States
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [draggingAnchor, setDraggingAnchor] = useState<{ drawingId: string; pointIndex: number } | null>(null);
  const isDraggingDrawingRef = useRef(false);

  // Local Drawings Buffer to prevent high-frequency DB sync lag
  const [localDrawings, setLocalDrawings] = useState<Drawing[]>(drawings);

  useEffect(() => {
    setLocalDrawings(drawings);
  }, [drawings]);

  // TradingView Magnet, Lock, and Visibility settings
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
        background: { color: settings.bgColor || "#0f0f0f" },
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

    const upColor = settings.upColor || "#2563eb";
    const downColor = settings.downColor || "#ef4444";

    const candleSeries = chart.addCandlestickSeries({
      upColor:         upColor,
      downColor:       downColor,
      borderUpColor:   upColor,
      borderDownColor: downColor,
      wickUpColor:     upColor,
      wickDownColor:   downColor,
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

  // Dynamically update series options on theme changes
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs || !settings) return;
    const up = settings.upColor;
    const down = settings.downColor;
    cs.applyOptions({
      upColor:         up,
      downColor:       down,
      borderUpColor:   up,
      borderDownColor: down,
      wickUpColor:     up,
      wickDownColor:   down,
    });
  }, [settings.upColor, settings.downColor]);

  // Dynamically update Grid Visibility
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !settings) return;
    const gridColor = settings.showGrid ? GRID : "rgba(0,0,0,0)";
    chart.applyOptions({
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
    });
  }, [settings.showGrid]);

  // Dynamically update Volume Visibility
  useEffect(() => {
    const vs = volSeriesRef.current;
    if (!vs || !settings) return;
    vs.applyOptions({
      visible: settings.showVolume,
    });
  }, [settings.showVolume]);

  // Dynamically update Price Scale Locking (Y-Axis Lock)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !settings) return;
    chart.priceScale("right").applyOptions({
      autoScale: !settings.isYAxisLocked,
    });
  }, [settings.isYAxisLocked]);

  // Dynamically update background color
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !settings) return;
    chart.applyOptions({
      layout: {
        background: { color: settings.bgColor || "#0f0f0f" },
      },
    });
  }, [settings.bgColor]);

  // Dynamically lock chart panning and zooming when a drawing tool is active to make placement 100% stable
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const drawingActive = activeTool !== "cursor";
    chart.applyOptions({
      handleScroll: {
        mouseWheel: !drawingActive,
        pressedMouseMove: !drawingActive,
        horzTouchDrag: !drawingActive,
        vertTouchDrag: !drawingActive,
      },
      handleScale: {
        mouseWheel: !drawingActive,
        pinch: !drawingActive,
        axisPressedMouseMove: {
          time: !drawingActive,
          price: !drawingActive,
        },
      },
    });
  }, [activeTool]);

  // Cancel active drawing or deselect on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeDrawingRef.current) {
          activeDrawingRef.current = null;
          setPreviewDrawing(null);
          setRedrawTrigger((t) => t + 1);
        } else {
          setActiveTool("cursor");
        }
        setSelectedDrawingId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keep track of current cursor (time, price) coordinates dynamically
  const mouseTimePriceRef = useRef<{ time: Time; price: number } | null>(null);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;

    const handler = (param: { point?: { x: number; y: number }; time?: Time }) => {
      if (param.point && param.time) {
        const price = series.coordinateToPrice(param.point.y);
        if (price != null) {
          mouseTimePriceRef.current = {
            time: param.time,
            price: price as number,
          };
        }
      } else {
        mouseTimePriceRef.current = null;
      }
    };

    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, []);

  const getMagnetSnappedPrice = useCallback((time: number, price: number) => {
    const candle = candles.find((c) => c.time === time);
    if (!candle) return price;
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
    return closest;
  }, [candles]);

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // If dragging anchor, ignore
    if (draggingAnchor) return;
    if (activeTool === "cursor" || isLocked) return;
    e.stopPropagation();

    // Reset selection on new drawing
    setSelectedDrawingId(null);

    if (!mouseTimePriceRef.current) return;

    const timeSec = mouseTimePriceRef.current.time as number;
    let price = mouseTimePriceRef.current.price;
    if (settings.isMagnetActive) {
      price = getMagnetSnappedPrice(timeSec, price);
    }

    const p: TimePricePoint = { time: timeSec, price };

    if (!activeDrawingRef.current) {
      // Start drawing
      const newDrawing: Drawing = {
        id: String(Date.now()),
        type: activeTool,
        points: [p, p],
      };
      activeDrawingRef.current = newDrawing;
      setPreviewDrawing(newDrawing);
      isDraggingDrawingRef.current = true;
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!mouseTimePriceRef.current) return;

    const timeSec = mouseTimePriceRef.current.time as number;
    let price = mouseTimePriceRef.current.price;
    if (settings.isMagnetActive) {
      price = getMagnetSnappedPrice(timeSec, price);
    }

    const p: TimePricePoint = { time: timeSec, price };

    // Case A: Drawing creation dragging
    if (isDraggingDrawingRef.current && activeDrawingRef.current) {
      const updated: Drawing = {
        ...activeDrawingRef.current,
        points: [activeDrawingRef.current.points[0], p],
      };
      setPreviewDrawing(updated);
    }

    // Case B: Stretching existing drawing anchor
    if (draggingAnchor) {
      const { drawingId, pointIndex } = draggingAnchor;
      const updatedDrawings = drawings.map((draw) => {
        if (draw.id === drawingId) {
          const pts = [...draw.points];
          pts[pointIndex] = p;
          
          let riskSettings = draw.riskSettings;
          if (draw.type === "long" || draw.type === "short") {
            const entry = pts[0].price;
            const stopLoss = pts[1].price;
            const dist = Math.abs(entry - stopLoss);
            const tp = draw.type === "long" ? entry + dist * 2 : entry - dist * 2;
            riskSettings = {
              entry,
              stopLoss,
              takeProfit: tp,
              riskRewardRatio: 2.00,
            };
          }

          return { ...draw, points: pts, riskSettings };
        }
        return draw;
      });
      onDrawingsChange(updatedDrawings);
      setRedrawTrigger((t) => t + 1);
    }
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    // Case A: Complete drawing creation
    if (isDraggingDrawingRef.current && activeDrawingRef.current) {
      e.stopPropagation();
      if (mouseTimePriceRef.current) {
        const timeSec = mouseTimePriceRef.current.time as number;
        let price = mouseTimePriceRef.current.price;
        if (settings.isMagnetActive) {
          price = getMagnetSnappedPrice(timeSec, price);
        }
        const p: TimePricePoint = { time: timeSec, price };
        
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
      }

      activeDrawingRef.current = null;
      setPreviewDrawing(null);
      isDraggingDrawingRef.current = false;

      if (!stayInDrawingMode) {
        setActiveTool("cursor");
      }
    }

    // Case B: Complete stretching anchor
    if (draggingAnchor) {
      e.stopPropagation();
      setDraggingAnchor(null);
    }
  };

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

  // ── Feed candle data (full or replayed slice) with incremental update & jump-free lock ────────
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volSeriesRef.current;
    if (!cs || !vs || candles.length === 0) return;

    const targetIdx = replayIndex != null ? replayIndex : candles.length - 1;
    const lastIdx = lastRenderedIdxRef.current;

    const up = settings.upColor || "#2563eb";
    const down = settings.downColor || "#ef4444";

    // 🚀 Incremental update: append new candle smoothly to avoid coordinate resets & camera flickers!
    const isStepForward = lastIdx !== null && targetIdx === lastIdx + 1;

    if (isStepForward) {
      const c = candles[targetIdx];
      const candleData: CandlestickData = {
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close
      };
      const volData: HistogramData = {
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? `${up}26` : `${down}26`,
      };
      cs.update(candleData);
      vs.update(volData);
      lastRenderedIdxRef.current = targetIdx;
    } else {
      // 🔄 Full reset: required on Strategy switches, Stops, or start-bar selections
      const slice = candles.slice(0, targetIdx + 1);
      const cData: CandlestickData[] = slice.map((c) => ({
        time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      const vData: HistogramData[] = slice.map((c) => ({
        time:  c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? `${up}26` : `${down}26`,
      }));

      // 🔒 Capture visible range to restore camera view
      const timeScale = chartRef.current?.timeScale();
      const visibleRange = timeScale?.getVisibleRange();

      cs.setData(cData);
      vs.setData(vData);

      // 🔓 Restore camera position
      if (visibleRange) {
        try {
          timeScale?.setVisibleRange(visibleRange);
        } catch (e) {
          // Safe handler
        }
      } else if (replayIndex == null) {
        chartRef.current?.timeScale().fitContent();
      }

      lastRenderedIdxRef.current = targetIdx;
    }

    setRedrawTrigger((t) => t + 1);
  }, [candles, replayIndex, settings.upColor, settings.downColor]);

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
    setSelectedDrawingId(null);
  };

  const handleDeleteIndividualDrawing = useCallback((id: string) => {
    onDrawingsChange(drawings.filter((d) => d.id !== id));
    setSelectedDrawingId(null);
  }, [drawings, onDrawingsChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedDrawingId) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        handleDeleteIndividualDrawing(selectedDrawingId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDrawingId, handleDeleteIndividualDrawing]);

  const allDrawings = [...drawings, ...(previewDrawing ? [previewDrawing] : [])];

  return (
    <div className="relative w-full h-full flex transition-colors duration-200" style={{ backgroundColor: settings.bgColor || "#0f0f0f" }}>
      
      {/* ── Vertical Drawings Toolbar (Exactly matching native TradingView layout) ── */}
      <div className="w-11 border-r border-[#23262f] flex flex-col items-center py-2.5 gap-0.5 shrink-0 z-20 select-none transition-colors duration-200" style={{ backgroundColor: settings.bgColor || "#0f0f0f" }}>
        
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
          active={settings.isMagnetActive} 
          onClick={() => onSettingsChange({ isMagnetActive: !settings.isMagnetActive })} 
          icon={<Magnet className={`w-4 h-4 ${settings.isMagnetActive ? "text-blue-400" : ""}`} />} 
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
          <svg 
            className={`absolute inset-0 w-full h-full z-10 ${
              activeTool !== "cursor" || draggingAnchor !== null ? "pointer-events-auto" : "pointer-events-none"
            }`}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
          >
            {allDrawings.map((draw) => {
              const p1 = getXY(draw.points[0]);
              const p2 = getXY(draw.points[1]);
              if (!p1 || !p2) return null;

              const isSelected = selectedDrawingId === draw.id;

              // Trendline
              if (draw.type === "trendline") {
                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    {/* Transparent Click Hitbox */}
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth="12" />
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={isSelected ? "#eab308" : "#3b82f6"}
                      strokeWidth={isSelected ? "3" : "2"}
                      strokeDasharray={draw.id === previewDrawing?.id ? "4 4" : "0"}
                    />
                    {isSelected && (
                      <>
                        <circle 
                          cx={p1.x} 
                          cy={p1.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                          }}
                        />
                        <circle 
                          cx={p2.x} 
                          cy={p2.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 1 });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              // Rectangle
              if (draw.type === "rectangle") {
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w = Math.abs(p2.x - p1.x);
                const h = Math.abs(p2.y - p1.y);
                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      stroke={isSelected ? "#eab308" : "#3b82f6"}
                      strokeWidth={isSelected ? "2.5" : "1.5"}
                      fill={isSelected ? "rgba(234,179,8,0.12)" : "rgba(59,130,246,0.06)"}
                      strokeDasharray={draw.id === previewDrawing?.id ? "4 4" : "0"}
                    />
                    {isSelected && (
                      <>
                        <circle 
                          cx={p1.x} 
                          cy={p1.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                          }}
                        />
                        <circle 
                          cx={p2.x} 
                          cy={p2.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 1 });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              // Brush/Highlighter Stroke
              if (draw.type === "brush") {
                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={isSelected ? "rgba(234,179,8,0.6)" : "rgba(59,130,246,0.4)"}
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                    {isSelected && (
                      <>
                        <circle 
                          cx={p1.x} 
                          cy={p1.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                          }}
                        />
                        <circle 
                          cx={p2.x} 
                          cy={p2.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 1 });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              // Text Annotation
              if (draw.type === "text") {
                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    <rect
                      x={p1.x - 4}
                      y={p1.y - 14}
                      width={(draw.text || "Text").length * 6 + 10}
                      height={18}
                      rx="3"
                      fill="#0c0e14"
                      stroke={isSelected ? "#eab308" : "#23262f"}
                      strokeWidth={isSelected ? "1.5" : "1"}
                    />
                    <text
                      x={p1.x + 2}
                      y={p1.y - 2}
                      fill={isSelected ? "#eab308" : "#3b82f6"}
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {draw.text || "Text"}
                    </text>
                    {isSelected && (
                      <circle 
                        cx={p1.x} 
                        cy={p1.y} 
                        r="6" 
                        fill="#0c0e14" 
                        stroke="#eab308" 
                        strokeWidth="2" 
                        className="cursor-move pointer-events-auto"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                        }}
                      />
                    )}
                  </g>
                );
              }

              // Patterns (Harmonic XABCD polygon)
              if (draw.type === "patterns") {
                const xMid = (p1.x + p2.x) / 2;
                const yMid = Math.min(p1.y, p2.y) - 30;
                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    <polygon
                      points={`${p1.x},${p1.y} ${xMid},${yMid} ${p2.x},${p2.y}`}
                      stroke={isSelected ? "#eab308" : "#8b5cf6"}
                      strokeWidth={isSelected ? "2.5" : "1.5"}
                      fill={isSelected ? "rgba(234,179,8,0.22)" : "rgba(139,92,246,0.15)"}
                      strokeDasharray="2 2"
                    />
                    {isSelected && (
                      <>
                        <circle 
                          cx={p1.x} 
                          cy={p1.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                          }}
                        />
                        <circle 
                          cx={p2.x} 
                          cy={p2.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 1 });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              // Smiley Emojis
              if (draw.type === "smiley") {
                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    {isSelected && (
                      <circle 
                        cx={p1.x} 
                        cy={p1.y} 
                        r="12" 
                        fill="rgba(234,179,8,0.2)" 
                        stroke="#eab308" 
                        strokeWidth="1" 
                      />
                    )}
                    <text
                      x={p1.x - 7}
                      y={p1.y + 7}
                      fontSize="15"
                    >
                      🙂
                    </text>
                    {isSelected && (
                      <circle 
                        cx={p1.x} 
                        cy={p1.y} 
                        r="6" 
                        fill="#0c0e14" 
                        stroke="#eab308" 
                        strokeWidth="2" 
                        className="cursor-move pointer-events-auto"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                        }}
                      />
                    )}
                  </g>
                );
              }

              // Ruler Pip & Bar Measurement
              if (draw.type === "ruler") {
                const pips = Math.abs(draw.points[0].price - draw.points[1].price) * 10000;
                const candlesCount = Math.round(Math.abs(draw.points[0].time - draw.points[1].time) / 900); // 15m default divisor
                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    {/* Hitbox line */}
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth="12" />
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? "#eab308" : "#ff9f0a"} strokeWidth={isSelected ? "2.5" : "1.5"} strokeDasharray="3 3" />
                    <rect x={Math.min(p1.x, p2.x)} y={Math.min(p1.y, p2.y) - 20} width={100} height={16} rx="3" fill={isSelected ? "#eab308" : "#ff9f0a"} />
                    <text x={Math.min(p1.x, p2.x) + 50} y={Math.min(p1.y, p2.y) - 8} textAnchor="middle" fill="#000" fontSize="8" fontFamily="monospace" fontWeight="bold">
                      {pips.toFixed(1)} Pips | {candlesCount} Bars
                    </text>
                    {isSelected && (
                      <>
                        <circle 
                          cx={p1.x} 
                          cy={p1.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                          }}
                        />
                        <circle 
                          cx={p2.x} 
                          cy={p2.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 1 });
                          }}
                        />
                      </>
                    )}
                  </g>
                );
              }

              // Fibonacci Retracements
              if (draw.type === "fib") {
                const dy = p2.y - p1.y;
                const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
                const labels = ["0.0%", "23.6%", "38.2%", "50.0%", "61.8%", "78.6%", "100.0%"];

                return (
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    {/* Hitbox line */}
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth="12" />
                    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? "#eab308" : "rgba(255,255,255,0.15)"} strokeWidth={isSelected ? "2" : "1"} strokeDasharray="3 3" />
                    {levels.map((lvl, idx) => {
                      const y = p1.y + dy * lvl;
                      const priceVal = draw.points[0].price + (draw.points[1].price - draw.points[0].price) * lvl;
                      return (
                        <g key={idx}>
                          <line x1={0} y1={y} x2={2500} y2={y} stroke={isSelected ? "rgba(234,179,8,0.4)" : "rgba(59,130,246,0.2)"} strokeWidth={isSelected ? "1.5" : "1"} />
                          <text x={p1.x + 10} y={y - 4} fill={isSelected ? "#eab308" : "#5e6673"} fontSize="8" fontFamily="monospace">
                            {labels[idx]} ({priceVal.toFixed(3)})
                          </text>
                        </g>
                      );
                    })}
                    {isSelected && (
                      <>
                        <circle 
                          cx={p1.x} 
                          cy={p1.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                          }}
                        />
                        <circle 
                          cx={p2.x} 
                          cy={p2.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 1 });
                          }}
                        />
                      </>
                    )}
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
                  <g key={draw.id} className="cursor-pointer pointer-events-auto" onClick={(e) => { e.stopPropagation(); setSelectedDrawingId(draw.id); }}>
                    {/* Green Target Box */}
                    <rect 
                      x={xStart} 
                      y={isLong ? pTarget.y : yEntry} 
                      width={width} 
                      height={targetHeight} 
                      fill={isSelected ? "rgba(34,197,94,0.22)" : "rgba(34,197,94,0.14)"} 
                      stroke={isSelected ? "#eab308" : "#22c55e"} 
                      strokeWidth={isSelected ? "1.5" : "0.75"} 
                    />
                    {/* Red Stop Box */}
                    <rect 
                      x={xStart} 
                      y={isLong ? yEntry : pTarget.y} 
                      width={width} 
                      height={stopHeight} 
                      fill={isSelected ? "rgba(239,68,68,0.22)" : "rgba(239,68,68,0.14)"} 
                      stroke={isSelected ? "#eab308" : "#ef4444"} 
                      strokeWidth={isSelected ? "1.5" : "0.75"} 
                    />
                    {/* Risk Reward Ratio Text Badge */}
                    <rect x={xStart + 6} y={yEntry - 8} width={50} height={16} rx="3" fill="#0c0e14" stroke={isSelected ? "#eab308" : "#23262f"} strokeWidth="1" />
                    <text x={xStart + 31} y={yEntry + 3} textAnchor="middle" fill="#d1d5db" fontSize="8" fontFamily="monospace" fontWeight="bold">
                      R/R 2.00
                    </text>
                    {isSelected && (
                      <>
                        <circle 
                          cx={p1.x} 
                          cy={p1.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 0 });
                          }}
                        />
                        <circle 
                          cx={p2.x} 
                          cy={p2.y} 
                          r="6" 
                          fill="#0c0e14" 
                          stroke="#eab308" 
                          strokeWidth="2" 
                          className="cursor-nwse-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDraggingAnchor({ drawingId: draw.id, pointIndex: 1 });
                          }}
                        />
                      </>
                    )}
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

        {/* ── Floating Individual Drawing Deletion Context Bubble ── */}
        {selectedDrawingId && (
          (() => {
            const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId);
            if (!selectedDrawing) return null;
            const p1 = getXY(selectedDrawing.points[0]);
            if (!p1) return null;
            return (
              <div
                className="absolute z-30 flex items-center bg-[#141720] border border-[#eab308] rounded-lg px-2.5 py-1.5 shadow-xl gap-2 select-none font-mono text-[9px]"
                style={{
                  left: `${Math.max(10, p1.x - 40)}px`,
                  top: `${Math.max(10, p1.y - 45)}px`,
                  transform: "translateY(-50%)",
                }}
              >
                <span className="font-bold text-[#eab308] uppercase tracking-wider">{selectedDrawing.type}</span>
                <div className="w-px h-3.5 bg-[#23262f]" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteIndividualDrawing(selectedDrawingId);
                  }}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors active:scale-90 cursor-pointer flex items-center justify-center"
                  title="Delete Drawing"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })()
        )}

        {/* ── Chart Utility Controls Overlay (Bottom-Right scale and settings) ── */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-[#141720] border border-[#23262f] rounded-lg p-1 z-20 shadow-lg select-none font-mono text-[9px]">
          <button
            onClick={() => onSettingsChange({ isYAxisLocked: !settings.isYAxisLocked })}
            className={`px-2 py-1 rounded font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer border ${
              settings.isYAxisLocked
                ? "bg-[#eab308]/15 border-[#eab308]/30 text-[#eab308]"
                : "bg-[#2563eb]/10 border-[#2563eb]/20 text-[#2563eb] hover:bg-[#2563eb]/20"
            }`}
            title={settings.isYAxisLocked ? "Y-Axis scale is LOCKED. Click to unlock (Auto-scale)." : "Y-Axis scale is AUTO. Click to lock."}
          >
            {settings.isYAxisLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>{settings.isYAxisLocked ? "LOCKED SCALE" : "AUTO SCALE"}</span>
          </button>

          <div className="w-px h-4.5 bg-[#23262f]" />

          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#1c1e26] transition-all active:scale-90 cursor-pointer flex items-center justify-center"
            title="Open Chart Settings Modal"
          >
            <Settings className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
          </button>
        </div>

        {/* ── Gorgeous Chart Settings Modal ── */}
        {isSettingsModalOpen && (
          <div className="absolute inset-0 bg-[#06080c]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setIsSettingsModalOpen(false)}>
            <div 
              className="w-full max-w-md bg-[#0c0e14] border border-[#23262f] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#23262f] flex items-center justify-between bg-[#141720]">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-500" />
                  <span className="font-bold text-white text-sm tracking-tight font-mono">CHART CONFIGURATIONS</span>
                </div>
                <button
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[#1c1e26] text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Content */}
              <div className="p-5 flex flex-col gap-5.5 text-xs font-mono">
                {/* 1. Candlestick Themes presets dropdown */}
                <div className="flex flex-col gap-2">
                  <label className="text-gray-500 uppercase tracking-widest font-semibold text-[9px]">Candlestick Theme Preset</label>
                  <select
                    value={settings.themeName}
                    onChange={(e) => {
                      const val = e.target.value;
                      let colors = { upColor: "#10b981", downColor: "#ef4444" };
                      if (val === "Emerald Bull") colors = { upColor: "#10b981", downColor: "#ef4444" };
                      if (val === "Classic Blue") colors = { upColor: "#2563eb", downColor: "#ef4444" };
                      if (val === "Slate & Crimson") colors = { upColor: "#999BA5", downColor: "#D63939" };
                      if (val === "Vaporwave Neon") colors = { upColor: "#ec4899", downColor: "#06b6d4" };
                      if (val === "Sleek Dark") colors = { upColor: "#3b82f6", downColor: "#1e293b" };
                      if (val === "Warm Retro") colors = { upColor: "#eab308", downColor: "#ea580c" };
                      onSettingsChange({ themeName: val, ...colors });
                    }}
                    className="w-full bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-white font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Emerald Bull">Emerald Bull (Default)</option>
                    <option value="Classic Blue">Classic Blue</option>
                    <option value="Slate & Crimson">Slate & Crimson (Slate Gray / Red)</option>
                    <option value="Vaporwave Neon">Vaporwave Neon</option>
                    <option value="Sleek Dark">Sleek Dark</option>
                    <option value="Warm Retro">Warm Retro</option>
                  </select>
                </div>

                {/* 2. Custom Color Pickers */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-gray-500 uppercase tracking-widest font-semibold text-[9px]">Bull Candle Color</label>
                    <div className="flex items-center gap-2 bg-[#141720] border border-[#23262f] rounded-lg px-3 py-1.5">
                      <input 
                        type="color" 
                        value={settings.upColor} 
                        onChange={(e) => onSettingsChange({ upColor: e.target.value, themeName: "Custom" })}
                        className="w-6 h-6 border-0 bg-transparent cursor-pointer shrink-0 rounded"
                      />
                      <input 
                        type="text" 
                        value={settings.upColor} 
                        onChange={(e) => onSettingsChange({ upColor: e.target.value, themeName: "Custom" })}
                        className="bg-transparent border-0 text-white w-full text-center focus:outline-none uppercase font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-gray-500 uppercase tracking-widest font-semibold text-[9px]">Bear Candle Color</label>
                    <div className="flex items-center gap-2 bg-[#141720] border border-[#23262f] rounded-lg px-3 py-1.5">
                      <input 
                        type="color" 
                        value={settings.downColor} 
                        onChange={(e) => onSettingsChange({ downColor: e.target.value, themeName: "Custom" })}
                        className="w-6 h-6 border-0 bg-transparent cursor-pointer shrink-0 rounded"
                      />
                      <input 
                        type="text" 
                        value={settings.downColor} 
                        onChange={(e) => onSettingsChange({ downColor: e.target.value, themeName: "Custom" })}
                        className="bg-transparent border-0 text-white w-full text-center focus:outline-none uppercase font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* 2b. Canvas Background Color */}
                <div className="flex flex-col gap-2">
                  <label className="text-gray-500 uppercase tracking-widest font-semibold text-[9px]">Canvas Background Color</label>
                  <div className="flex items-center gap-2 bg-[#141720] border border-[#23262f] rounded-lg px-3 py-1.5">
                    <input 
                      type="color" 
                      value={settings.bgColor || "#0f0f0f"} 
                      onChange={(e) => onSettingsChange({ bgColor: e.target.value })}
                      className="w-6 h-6 border-0 bg-transparent cursor-pointer shrink-0 rounded animate-pulse"
                    />
                    <input 
                      type="text" 
                      value={settings.bgColor || "#0f0f0f"} 
                      onChange={(e) => onSettingsChange({ bgColor: e.target.value })}
                      className="bg-transparent border-0 text-white w-20 text-center focus:outline-none uppercase font-bold"
                    />
                    <div className="flex gap-1.5 ml-auto">
                      {["#0f0f0f", "#0c0e14", "#141720", "#000000"].map((presetBg) => (
                        <button
                          key={presetBg}
                          type="button"
                          onClick={() => onSettingsChange({ bgColor: presetBg })}
                          className="w-4 h-4 rounded-full border border-[#23262f] focus:outline-none cursor-pointer transition-all hover:scale-110 active:scale-90"
                          style={{ backgroundColor: presetBg }}
                          title={`Set background to ${presetBg}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-[#23262f] my-1" />

                {/* 3. Toggles Grid */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between py-1 bg-[#141720]/30 rounded-lg px-3.5 py-2.5 border border-[#23262f]/60 hover:bg-[#141720]/60 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white font-bold tracking-tight">Show Grid Lines</span>
                      <span className="text-[9px] text-gray-500 font-medium">Display vertical & horizontal grid lines on canvas</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={settings.showGrid} 
                        onChange={(e) => onSettingsChange({ showGrid: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-1 bg-[#141720]/30 rounded-lg px-3.5 py-2.5 border border-[#23262f]/60 hover:bg-[#141720]/60 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white font-bold tracking-tight">Show Volume Series</span>
                      <span className="text-[9px] text-gray-500 font-medium">Show semi-transparent volume histogram at bottom</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={settings.showVolume} 
                        onChange={(e) => onSettingsChange({ showVolume: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-1 bg-[#141720]/30 rounded-lg px-3.5 py-2.5 border border-[#23262f]/60 hover:bg-[#141720]/60 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white font-bold tracking-tight">Lock Price Scale (Y-Axis)</span>
                      <span className="text-[9px] text-gray-500 font-medium">Lock scale to manual pan freely anywhere on grid</span>
                    </div>
                    <label className="relative inline-flex inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={settings.isYAxisLocked} 
                        onChange={(e) => onSettingsChange({ isYAxisLocked: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-yellow-500 peer-checked:after:bg-white" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-1 bg-[#141720]/30 rounded-lg px-3.5 py-2.5 border border-[#23262f]/60 hover:bg-[#141720]/60 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white font-bold tracking-tight">Magnet Mode (Snaps OHLC)</span>
                      <span className="text-[9px] text-gray-500 font-medium">Auto snaps drawings coordinates to closest OHLC point</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={settings.isMagnetActive} 
                        onChange={(e) => onSettingsChange({ isMagnetActive: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-[#23262f] bg-[#141720] flex items-center justify-end">
                <button
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold font-mono transition-all text-xs active:scale-95 shadow-md shadow-blue-900/10 cursor-pointer"
                >
                  SAVE & CLOSE
                </button>
              </div>
            </div>
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
