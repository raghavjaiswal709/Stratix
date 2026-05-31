"use client";

// ─── BacktestChart ─────────────────────────────────────────────────────────────
// TradingView-parity drawing tools on lightweight-charts SVG overlay.
// Tools: trendline, ray, hline, vline, arrow, rectangle, circle, triangle,
//        channel, fib, long/short, patterns, text, brush, ruler, smiley
// Stability: global window mouseup/mousemove, no window.prompt, 4-corner rect
//            anchors, smooth brush bezier, stable localDrawings sync.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, CrosshairMode,
  type IChartApi, type ISeriesApi, type SeriesMarker, type Time,
  type CandlestickData, type HistogramData,
} from "lightweight-charts";
import type { Candle, ManualTrade, LiveStatus, Drawing, DrawingType, TimePricePoint } from "./types";
import {
  MousePointer, Slash, Square, Grid, ArrowUpRight, Trash2,
  Paintbrush, Type, Smile, Ruler, Search,
  Magnet, Lock, Unlock, Eye, EyeOff, PenTool,
  Workflow, Settings, X, Minus, ArrowRight, Circle, Triangle,
  Layers, TrendingUp, Star, GripVertical,
} from "lucide-react";

interface Props {
  candles:             Candle[];
  replayIndex:         number | null;
  replayStartIndex:    number | null;
  isSelectingStart:    boolean;
  onStartBarSelect:    (idx: number) => void;
  manualTrades:        ManualTrade[];
  openTrade:           ManualTrade | null;
  openTradeUnrealised: number;
  liveCandle:          Candle | null;
  liveStatus:          LiveStatus;
  isInReplay:          boolean;
  onBuy:               () => void;
  onSell:              () => void;
  drawings:            Drawing[];
  onDrawingsChange:    (drawings: Drawing[]) => void;
  symbol?:             string;
  timeframe?:          string;
  settings: {
    themeName:      string;
    upColor:        string;
    downColor:      string;
    showGrid:       boolean;
    showVolume:     boolean;
    isYAxisLocked:  boolean;
    isMagnetActive: boolean;
    bgColor:        string;
    favoriteTools?: string[];
    drawingTemplates?: { id: string; name: string; type: string; color: string }[];
  };
  onSettingsChange: (settings: Partial<Props["settings"]>) => void;
}

// How many points each tool needs before it finalizes
const TOOL_POINTS: Partial<Record<DrawingType, number>> = {
  hline: 1, vline: 1, smiley: 1,
  trendline: 2, ray: 2, arrow: 2, rectangle: 2, circle: 2, fib: 2,
  long: 2, short: 2, ruler: 2, text: 1,
  channel: 3, triangle: 3, patterns: 2,
};

const CHART_BG = "#0f0f0f";
const GRID_COLOR = "#181a20";
const TEXT_COLOR = "#5e6673";
const SEL_COLOR = "#eab308";
const LINE_COLOR = "#3b82f6";

export function BacktestChart({
  candles, replayIndex, replayStartIndex, isSelectingStart,
  onStartBarSelect, manualTrades, openTrade, openTradeUnrealised,
  liveCandle, liveStatus, drawings, onDrawingsChange, settings, onSettingsChange,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [activeTool, setActiveTool]           = useState<DrawingType>("cursor");
  const [previewDrawing, setPreviewDrawing]   = useState<Drawing | null>(null);
  const activeDrawingRef                       = useRef<Drawing | null>(null);
  const [redrawTrigger, setRedrawTrigger]     = useState(0);
  const lastRenderedIdxRef                     = useRef<number | null>(null);

  const [selectedDrawingId, setSelectedDrawingId]   = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [draggingAnchor, setDraggingAnchor]         = useState<{ drawingId: string; pointIndex: number } | null>(null);
  const isDraggingDrawingRef                         = useRef(false);

  // Price scale margins for expand/contract zooming
  const [margins, setMargins] = useState({ top: 0.2, bottom: 0.1 });

  // Draggable Favorites Toolbar Position & Dragging State
  const [favsPos, setFavsPos] = useState<{ x: number | null; y: number }>({ x: null, y: 12 });
  const [isFavsDragging, setIsFavsDragging] = useState(false);
  const favsDragStartRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  // Lasso Selector States
  const [lassoBox, setLassoBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<string[]>([]);
  const [isModifierHeld, setIsModifierHeld] = useState(false);
  
  // Template menu open state
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);

  const [draggingDrawing, setDraggingDrawing] = useState<{
    id: string;
    startPoints: TimePricePoint[];
    startMouseCoords: { time: number; price: number };
  } | null>(null);

  const [isClickCreating, setIsClickCreating] = useState(false);
  const dragStartPosRef  = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // True only when the pointer actually moved during a drag — prevents a
  // plain click from triggering an unnecessary onDrawingsChange save.
  const dragMovedRef = useRef(false);

  // Multi-point creation (channel, triangle need 3 clicks)
  const [multiCreating, setMultiCreating] = useState<{
    type: DrawingType;
    points: TimePricePoint[];
  } | null>(null);
  const multiCreatingRef = useRef<typeof multiCreating>(null);
  useEffect(() => { multiCreatingRef.current = multiCreating; }, [multiCreating]);

  // Text input overlay (replaces window.prompt)
  const [textOverlay, setTextOverlay] = useState<{
    x: number; y: number;
    onSubmit: (text: string) => void;
  } | null>(null);
  const [textInputVal, setTextInputVal] = useState("");

  // Lock ref copies for stable global handlers
  const draggingAnchorRef  = useRef<typeof draggingAnchor>(null);
  const draggingDrawingRef = useRef<typeof draggingDrawing>(null);
  const localDrawingsRef   = useRef<Drawing[]>(drawings || []);
  const [localDrawings, setLocalDrawingsState] = useState<Drawing[]>(drawings || []);
  const setLocalDrawings = useCallback((d: Drawing[] | ((prev: Drawing[]) => Drawing[])) => {
    setLocalDrawingsState(prev => {
      const next = typeof d === "function" ? d(prev) : d;
      localDrawingsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => { draggingAnchorRef.current = draggingAnchor; }, [draggingAnchor]);
  useEffect(() => { draggingDrawingRef.current = draggingDrawing; }, [draggingDrawing]);
  useEffect(() => {
    setLocalDrawings(drawings || []);
  }, [drawings]);

  const [stayInDrawingMode, setStayInDrawingMode] = useState(false);
  const [isLocked, setIsLocked]                   = useState(false);
  const [areDrawingsHidden, setAreDrawingsHidden] = useState(false);

  const stopEvent = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
  }, []);

  // Cancel active creation on tool switch
  useEffect(() => {
    activeDrawingRef.current = null;
    setPreviewDrawing(null);
    setIsClickCreating(false);
    setMultiCreating(null);
  }, [activeTool]);

  // ── Build chart ───────────────────────────────────────────────────────────
  const buildChart = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width:  el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: settings.bgColor || "#0f0f0f" },
        textColor:  TEXT_COLOR,
        fontSize:   10,
        fontFamily: "monospace",
      },
      grid: {
        vertLines: { color: GRID_COLOR, style: 2 },
        horzLines: { color: GRID_COLOR, style: 2 },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible: true, secondsVisible: false, borderColor: GRID_COLOR,
      },
      rightPriceScale: { borderColor: GRID_COLOR },
    });
    chartRef.current = chart;

    const up = settings.upColor || "#10b981";
    const dn = settings.downColor || "#ef4444";

    const candleSeries = chart.addCandlestickSeries({
      upColor: up, downColor: dn,
      borderUpColor: up, borderDownColor: dn,
      wickUpColor: up, wickDownColor: dn,
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addHistogramSeries({
      color: "rgba(37,99,235,0.15)",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volSeriesRef.current = volSeries;

    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      setRedrawTrigger(t => t + 1);
    });

    // Tooltip
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
        `<span style="color:#5e6673">${d.toISOString().replace("T", " ").slice(0, 16)} UTC</span>`,
        `O <b style="color:rgba(255,255,255,0.85)">${cData.open.toFixed(3)}</b>  ` +
        `H <b style="color:rgba(255,255,255,0.85)">${cData.high.toFixed(3)}</b>  ` +
        `L <b style="color:#ef4444">${cData.low.toFixed(3)}</b>  ` +
        `C <b style="color:rgba(255,255,255,0.85)">${cData.close.toFixed(3)}</b>`,
      ].join("<br>");
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.resize(el.clientWidth, el.clientHeight);
      setRedrawTrigger(t => t + 1);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volSeriesRef.current = null;
      try { chart.remove(); } catch { /* disposed */ }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cleanup = buildChart();
    return () => { cleanup?.(); };
  }, [buildChart]);

  // Dynamic settings sync
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;
    const up = settings.upColor, dn = settings.downColor;
    cs.applyOptions({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn });
  }, [settings.upColor, settings.downColor]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = settings.showGrid ? GRID_COLOR : "rgba(0,0,0,0)";
    chart.applyOptions({ grid: { vertLines: { color: c }, horzLines: { color: c } } });
  }, [settings.showGrid]);

  useEffect(() => {
    volSeriesRef.current?.applyOptions({ visible: settings.showVolume });
  }, [settings.showVolume]);

  useEffect(() => {
    chartRef.current?.priceScale("right").applyOptions({ autoScale: !settings.isYAxisLocked });
  }, [settings.isYAxisLocked]);

  useEffect(() => {
    chartRef.current?.applyOptions({ layout: { background: { color: settings.bgColor || "#0f0f0f" } } });
  }, [settings.bgColor]);

  // Lock chart panning when drawing
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const locked = activeTool !== "cursor" || draggingAnchor !== null;
    chart.applyOptions({
      handleScroll: { mouseWheel: !locked, pressedMouseMove: !locked, horzTouchDrag: !locked, vertTouchDrag: !locked },
      handleScale:  { mouseWheel: !locked, pinch: !locked, axisPressedMouseMove: { time: !locked, price: !locked } },
    });
  }, [activeTool, draggingAnchor]);

  // Deselect on blank canvas click
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => setSelectedDrawingId(null);
    container.addEventListener("mousedown", handler);
    return () => container.removeEventListener("mousedown", handler);
  }, []);

  // Redraw on scroll/zoom and vertical price scale expand/contract zooming
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleInteraction = () => setRedrawTrigger(t => t + 1);

    const handleWheel = (e: WheelEvent) => {
      const rect = container.getBoundingClientRect();
      // The right price scale of lightweight-charts is roughly 50-60 pixels wide.
      const isOverPriceScale = rect.right - e.clientX <= 60;
      
      if (isOverPriceScale) {
        e.preventDefault();
        e.stopPropagation();

        // scroll down (deltaY > 0) -> contract / zoom out -> increase margins
        // scroll up (deltaY < 0) -> expand / zoom in -> decrease margins
        const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;

        setMargins((prev) => {
          let newTop = Math.max(0.01, prev.top * zoomFactor);
          let newBottom = Math.max(0.01, prev.bottom * zoomFactor);
          if (newTop + newBottom > 0.8) {
            const factor = 0.8 / (newTop + newBottom);
            newTop *= factor;
            newBottom *= factor;
          }
          return { top: newTop, bottom: newBottom };
        });
        setRedrawTrigger(t => t + 1);
      } else {
        setRedrawTrigger(t => t + 1);
      }
    };

    const handleDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const isOverPriceScale = rect.right - e.clientX <= 60;
      if (isOverPriceScale) {
        setMargins({ top: 0.2, bottom: 0.1 });
        setRedrawTrigger(t => t + 1);
      }
    };

    container.addEventListener("mousemove", handleInteraction, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("dblclick", handleDblClick, { passive: true });

    return () => {
      container.removeEventListener("mousemove", handleInteraction);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("dblclick", handleDblClick);
    };
  }, []);

  // Escape key handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        activeDrawingRef.current = null;
        setPreviewDrawing(null);
        setIsClickCreating(false);
        setMultiCreating(null);
        setSelectedDrawingId(null);
        setSelectedDrawingIds([]);
        setTextOverlay(null);
        if (!activeDrawingRef.current) setActiveTool("cursor");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Cmd / Ctrl key modifier tracker for drag-selection pointer capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control" || e.metaKey || e.ctrlKey) {
        setIsModifierHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsModifierHeld(false);
      }
    };
    const handleBlur = () => setIsModifierHeld(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Dynamically update price scale margins (expansion/contraction)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("right").applyOptions({
      scaleMargins: {
        top: margins.top,
        bottom: margins.bottom,
      }
    });
  }, [margins]);

  // Close template menu when selected drawing changes
  useEffect(() => {
    setIsTemplateMenuOpen(false);
  }, [selectedDrawingId]);

  // Draggable Favorites Toolbar window listeners
  useEffect(() => {
    if (!isFavsDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!favsDragStartRef.current || !containerRef.current) return;
      const { startX, startY, startPosX, startPosY } = favsDragStartRef.current;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      const newX = startPosX + deltaX;
      const newY = startPosY + deltaY;

      // Constrain within container bounds to prevent dragging offscreen
      const maxX = Math.max(100, containerRect.width - 150);
      const maxY = Math.max(100, containerRect.height - 40);
      const boundedX = Math.max(4, Math.min(maxX, newX));
      const boundedY = Math.max(4, Math.min(maxY, newY));

      setFavsPos({ x: boundedX, y: boundedY });
    };

    const handleMouseUp = () => {
      setIsFavsDragging(false);
      favsDragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isFavsDragging]);

  const handleFavsMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget.parentElement;
    const container = containerRef.current;
    if (!el || !container) return;
    const rect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    const curX = rect.left - containerRect.left;
    const curY = rect.top - containerRect.top;

    favsDragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: curX,
      startPosY: curY,
    };
    setIsFavsDragging(true);
  };

  // Hex color to RGBA utility helper
  const hexToRgba = useCallback((hex: string, alpha: number) => {
    if (!hex || !hex.startsWith("#")) return hex || "";
    try {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } catch {
      return hex;
    }
  }, []);

  // Delete key for both single and multi-selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedDrawingIds.length > 0) {
          onDrawingsChange(localDrawingsRef.current.filter(d => !selectedDrawingIds.includes(d.id)));
          setSelectedDrawingIds([]);
        } else if (selectedDrawingId) {
          onDrawingsChange(localDrawingsRef.current.filter(d => d.id !== selectedDrawingId));
          setSelectedDrawingId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDrawingId, selectedDrawingIds, onDrawingsChange]);

  // ── CRITICAL: Global window mouseup ──────────────────────────────────────
  // We MUST NOT stop propagation in drawing onMouseUp handlers — that would
  // block this handler, leaving draggingDrawing stuck and the drawing glued to
  // the cursor forever. This handler is the single cleanup point for all drags.
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      const anchor = draggingAnchorRef.current;
      const moving = draggingDrawingRef.current;
      if (anchor || moving) {
        // Only persist if the pointer actually moved — avoids spurious saves on plain clicks
        if (dragMovedRef.current) {
          onDrawingsChange(localDrawingsRef.current);
        }
        dragMovedRef.current = false;
        setDraggingAnchor(null);
        setDraggingDrawing(null);
        draggingAnchorRef.current = null;
        draggingDrawingRef.current = null;
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [onDrawingsChange]);

  // Global mousemove for dragging existing drawings / anchors outside SVG bounds
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      const anchor = draggingAnchorRef.current;
      const moving = draggingDrawingRef.current;
      if (!anchor && !moving) return;

      const coords = getTimePriceFromEventNative(e);
      if (!coords) return;
      const { time: timeSec, price: rawPrice } = coords;
      const price = settings.isMagnetActive ? getMagnetSnappedPrice(timeSec, rawPrice) : rawPrice;
      const p: TimePricePoint = { time: timeSec, price };

      dragMovedRef.current = true; // mark that real movement occurred

      if (anchor) {
        const { drawingId, pointIndex } = anchor;
        setLocalDrawings(prev => prev.map(draw => {
          if (draw.id !== drawingId) return draw;
          const pts = [...draw.points];
          pts[pointIndex] = p;
          return rebuildRiskSettings({ ...draw, points: pts });
        }));
        setRedrawTrigger(t => t + 1);
      }

      if (moving) {
        const { id, startPoints, startMouseCoords } = moving;
        const deltaPrice = price - startMouseCoords.price;
        const deltaTime  = timeSec - startMouseCoords.time;
        setLocalDrawings(prev => prev.map(draw => {
          if (draw.id !== id) return draw;
          const pts = startPoints.map(pt => ({ time: pt.time + deltaTime, price: pt.price + deltaPrice }));
          return rebuildRiskSettings({ ...draw, points: pts });
        }));
        setRedrawTrigger(t => t + 1);
      }
    };
    window.addEventListener("mousemove", handleGlobalMove);
    return () => window.removeEventListener("mousemove", handleGlobalMove);
  }, [settings.isMagnetActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Crosshair time/price tracker
  const mouseTimePriceRef = useRef<{ time: Time; price: number } | null>(null);
  useEffect(() => {
    const chart  = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;
    const handler = (param: { point?: { x: number; y: number }; time?: Time }) => {
      if (param.point && param.time) {
        const price = series.coordinateToPrice(param.point.y);
        if (price != null) mouseTimePriceRef.current = { time: param.time, price: price as number };
      } else {
        mouseTimePriceRef.current = null;
      }
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, []);

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const getMagnetSnappedPrice = useCallback((time: number, price: number) => {
    const candle = candles.find(c => c.time === time);
    if (!candle) return price;
    const ohlc = [candle.open, candle.high, candle.low, candle.close];
    let closest = ohlc[0], minDist = Math.abs(price - closest);
    for (let i = 1; i < ohlc.length; i++) {
      const d = Math.abs(price - ohlc[i]);
      if (d < minDist) { minDist = d; closest = ohlc[i]; }
    }
    return closest;
  }, [candles]);

  const getXY = useCallback((pt: TimePricePoint) => {
    const chart  = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const x = chart.timeScale().timeToCoordinate(pt.time as Time);
    const y = series.priceToCoordinate(pt.price);
    if (x == null || y == null) return null;
    return { x: x as number, y: y as number };
  }, [redrawTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const getTimePriceFromEvent = useCallback((e: React.MouseEvent | MouseEvent): { time: number; price: number } | null => {
    const chart     = chartRef.current;
    const series    = candleSeriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) return null;
    const rect  = container.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const time  = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time == null || price == null) return null;
    return { time: time as number, price: price as number };
  }, []);

  const getTimePriceFromEventNative = useCallback((e: MouseEvent): { time: number; price: number } | null => {
    const chart     = chartRef.current;
    const series    = candleSeriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) return null;
    const rect  = container.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const time  = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time == null || price == null) return null;
    return { time: time as number, price: price as number };
  }, []);

  // Rebuild riskSettings when anchors change
  const rebuildRiskSettings = (draw: Drawing): Drawing => {
    if (draw.type !== "long" && draw.type !== "short") return draw;
    const pts = draw.points;
    if (pts.length < 2) return draw;
    const entry = pts[0].price;
    const stop  = pts[1].price;
    const dist  = Math.abs(entry - stop);
    const tp    = pts[2]?.price ?? (draw.type === "long" ? entry + dist * 2 : entry - dist * 2);
    const risk   = Math.abs(entry - stop);
    const reward = Math.abs(tp - entry);
    const riskSettings = { entry, stopLoss: stop, takeProfit: tp, riskRewardRatio: risk > 0 ? reward / risk : 2 };
    const newPts = [...pts];
    if (newPts.length < 3) newPts[2] = { time: pts[1].time, price: tp };
    return { ...draw, points: newPts, riskSettings };
  };

  // ── Finalize drawing ──────────────────────────────────────────────────────
  const finalizeDrawing = useCallback((coords: { time: number; price: number } | null) => {
    if (!activeDrawingRef.current) return;

    let { time: timeSec, price } = coords || activeDrawingRef.current.points[activeDrawingRef.current.points.length - 1];
    if (settings.isMagnetActive) price = getMagnetSnappedPrice(timeSec, price);
    const p: TimePricePoint = { time: timeSec, price };

    let finished: Drawing = { ...activeDrawingRef.current };

    if (finished.type === "long" || finished.type === "short") {
      const entry = finished.points[0].price;
      const stop  = p.price;
      const dist  = Math.abs(entry - stop);
      const tp    = finished.type === "long" ? entry + dist * 2 : entry - dist * 2;
      finished = {
        ...finished,
        points: [finished.points[0], p, { time: p.time, price: tp }],
        riskSettings: { entry, stopLoss: stop, takeProfit: tp, riskRewardRatio: 2 },
      };
    } else if (finished.type === "patterns") {
      const p1 = finished.points[0];
      const dx = p.time - p1.time;
      const dy = p.price - p1.price;
      finished = {
        ...finished,
        points: [
          p1,
          { time: p1.time + dx * 0.25, price: p1.price + dy * 0.85 },
          { time: p1.time + dx * 0.50, price: p1.price + dy * 0.25 },
          { time: p1.time + dx * 0.75, price: p1.price + dy * 0.90 },
          p,
        ],
      };
    } else if (finished.type === "hline" || finished.type === "vline") {
      finished = { ...finished, points: [p] };
    } else if (finished.type === "text" || finished.type === "smiley") {
      finished = { ...finished, points: [finished.points[0]] };
    } else {
      finished = { ...finished, points: [finished.points[0], p] };
    }

    // Text tool: show inline overlay instead of prompt
    if (finished.type === "text") {
      const xy = getXY(finished.points[0]);
      if (xy) {
        const pendingDrawing = finished;
        setTextOverlay({
          x: xy.x,
          y: xy.y,
          onSubmit: (text: string) => {
            const withText = { ...pendingDrawing, text: text || "Text" };
            onDrawingsChange([...localDrawingsRef.current, withText]);
            setSelectedDrawingId(withText.id);
            setTextOverlay(null);
            setTextInputVal("");
            if (!stayInDrawingMode) setActiveTool("cursor");
          },
        });
      }
      activeDrawingRef.current = null;
      setPreviewDrawing(null);
      setIsClickCreating(false);
      isDraggingDrawingRef.current = false;
      return;
    }

    onDrawingsChange([...localDrawingsRef.current, finished]);
    setSelectedDrawingId(finished.id);
    activeDrawingRef.current = null;
    setPreviewDrawing(null);
    setIsClickCreating(false);
    isDraggingDrawingRef.current = false;
    if (!stayInDrawingMode) setActiveTool("cursor");
  }, [settings.isMagnetActive, getMagnetSnappedPrice, onDrawingsChange, stayInDrawingMode, getXY]);

  // ── SVG event handlers ────────────────────────────────────────────────────
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingAnchor) return;

    // Check if Cmd (metaKey) or Ctrl (ctrlKey) is held to start lasso select
    const isLassoSelect = e.metaKey || e.ctrlKey;
    if (isLassoSelect) {
      e.stopPropagation();
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setLassoBox({ x1: x, y1: y, x2: x, y2: y });
      setSelectedDrawingIds([]); // reset selection
      setSelectedDrawingId(null);
      return;
    }

    if (activeTool === "cursor" || isLocked) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedDrawingId(null);
    setSelectedDrawingIds([]); // clear multi-selection

    const coords = getTimePriceFromEvent(e);
    if (!coords) return;
    let { time: timeSec, price } = coords;
    if (settings.isMagnetActive) price = getMagnetSnappedPrice(timeSec, price);
    const p: TimePricePoint = { time: timeSec, price };

    const needed = TOOL_POINTS[activeTool] ?? 2;

    // Single-point tools: finalize immediately on mousedown
    if (needed === 1) {
      const newDrawing: Drawing = { id: String(Date.now()), type: activeTool, points: [p] };
      activeDrawingRef.current = newDrawing;
      finalizeDrawing(coords);
      return;
    }

    // Multi-point tools (channel, triangle) — accumulate clicks
    if (needed === 3) {
      const current = multiCreatingRef.current;
      if (!current) {
        const nd: Drawing = { id: String(Date.now()), type: activeTool, points: [p, p] };
        activeDrawingRef.current = nd;
        setPreviewDrawing(nd);
        setMultiCreating({ type: activeTool, points: [p] });
        isDraggingDrawingRef.current = false;
        dragStartPosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (current.points.length === 1) {
        const updated = { ...current, points: [...current.points, p] };
        setMultiCreating(updated);
        const nd: Drawing = { ...activeDrawingRef.current!, points: [...current.points, p, p] };
        activeDrawingRef.current = nd;
        setPreviewDrawing(nd);
        return;
      }
      if (current.points.length === 2) {
        // Third click: finalize
        const allPts = [...current.points, p];
        const finished: Drawing = { id: String(Date.now()), type: activeTool, points: allPts };
        onDrawingsChange([...localDrawingsRef.current, finished]);
        setSelectedDrawingId(finished.id);
        activeDrawingRef.current = null;
        setPreviewDrawing(null);
        setMultiCreating(null);
        if (!stayInDrawingMode) setActiveTool("cursor");
        return;
      }
      return;
    }

    // Standard 2-point tools
    if (isClickCreating && activeDrawingRef.current) {
      finalizeDrawing(coords);
      return;
    }

    if (!activeDrawingRef.current) {
      const newDrawing: Drawing = { id: String(Date.now()), type: activeTool, points: [p, p] };
      activeDrawingRef.current = newDrawing;
      setPreviewDrawing(newDrawing);
      isDraggingDrawingRef.current = true;
      dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (lassoBox) {
      e.stopPropagation();
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setLassoBox(prev => prev ? { ...prev, x2: x, y2: y } : null);
      return;
    }

    const coords = getTimePriceFromEvent(e);
    if (!coords) return;
    let { time: timeSec, price } = coords;
    if (settings.isMagnetActive) price = getMagnetSnappedPrice(timeSec, price);
    const p: TimePricePoint = { time: timeSec, price };

    // Update preview for active drawing
    if (activeDrawingRef.current && (isDraggingDrawingRef.current || isClickCreating)) {
      if (activeDrawingRef.current.type === "brush") {
        const last = activeDrawingRef.current.points[activeDrawingRef.current.points.length - 1];
        if (last.time !== timeSec || last.price !== price) {
          const updated: Drawing = { ...activeDrawingRef.current, points: [...activeDrawingRef.current.points, p] };
          activeDrawingRef.current = updated;
          setPreviewDrawing(updated);
        }
      } else {
        const pts = [...activeDrawingRef.current.points];
        pts[pts.length - 1] = p;
        const updated: Drawing = { ...activeDrawingRef.current, points: pts };
        activeDrawingRef.current = updated;
        setPreviewDrawing(updated);
      }
    }

    // Multi-point preview: update last segment
    if (multiCreating && activeDrawingRef.current) {
      const pts = [...activeDrawingRef.current.points];
      pts[pts.length - 1] = p;
      const updated: Drawing = { ...activeDrawingRef.current, points: pts };
      activeDrawingRef.current = updated;
      setPreviewDrawing(updated);
    }

    // NOTE: draggingDrawing and draggingAnchor are now handled by the global window mousemove
  };

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (lassoBox) {
      e.stopPropagation();
      e.preventDefault();
      
      const minX = Math.min(lassoBox.x1, lassoBox.x2);
      const maxX = Math.max(lassoBox.x1, lassoBox.x2);
      const minY = Math.min(lassoBox.y1, lassoBox.y2);
      const maxY = Math.max(lassoBox.y1, lassoBox.y2);
      
      const w = maxX - minX;
      const h = maxY - minY;
      
      if (w > 5 && h > 5) {
        const ids: string[] = [];
        localDrawingsRef.current.forEach((draw) => {
          const hasPtInside = draw.points.some((pt) => {
            const xy = getXY(pt);
            if (!xy) return false;
            return xy.x >= minX && xy.x <= maxX && xy.y >= minY && xy.y <= maxY;
          });
          if (hasPtInside) {
            ids.push(draw.id);
          }
        });
        setSelectedDrawingIds(ids);
        if (ids.length === 1) {
          setSelectedDrawingId(ids[0]);
        }
      }
      setLassoBox(null);
      return;
    }

    if (isDraggingDrawingRef.current && activeDrawingRef.current && !multiCreating) {
      e.stopPropagation();
      const coords = getTimePriceFromEvent(e);
      const dist = Math.hypot(e.clientX - dragStartPosRef.current.x, e.clientY - dragStartPosRef.current.y);
      if (activeDrawingRef.current.type === "brush") {
        finalizeDrawing(coords);
      } else if (dist > 5) {
        finalizeDrawing(coords);
      } else {
        isDraggingDrawingRef.current = false;
        setIsClickCreating(true);
      }
      return;
    }
    // Anchor/translation: handled by global mouseup
  };

  // Cursor style
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.style.cursor = activeTool !== "cursor" || isSelectingStart ? "crosshair" : "default";
  }, [activeTool, isSelectingStart]);

  // Start bar selection click
  useEffect(() => {
    const chart  = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !isSelectingStart) return;
    const handler = (param: { time?: Time }) => {
      if (!param.time) return;
      const clickTime = param.time as number;
      const visible = replayIndex != null ? candles.slice(0, replayIndex + 1) : candles;
      const idx = visible.findIndex(c => c.time === clickTime);
      if (idx >= 0) onStartBarSelect(idx);
    };
    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [isSelectingStart, candles, replayIndex, onStartBarSelect]);

  // Feed candle data
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volSeriesRef.current;
    if (!cs || !vs || candles.length === 0) return;

    const targetIdx = replayIndex != null ? replayIndex : candles.length - 1;
    const lastIdx   = lastRenderedIdxRef.current;
    const up        = settings.upColor || "#10b981";
    const dn        = settings.downColor || "#ef4444";
    const isStep    = lastIdx !== null && targetIdx === lastIdx + 1;

    if (isStep) {
      const c = candles[targetIdx];
      cs.update({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close });
      vs.update({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? `${up}26` : `${dn}26` });
      lastRenderedIdxRef.current = targetIdx;
    } else {
      const slice  = candles.slice(0, targetIdx + 1);
      const cData  = slice.map(c => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close }));
      const vData  = slice.map(c => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? `${up}26` : `${dn}26` }));
      const ts     = chartRef.current?.timeScale();
      const range  = ts?.getVisibleRange();
      cs.setData(cData);
      vs.setData(vData);
      if (range) {
        try { ts?.setVisibleRange(range); } catch { /* safe */ }
      } else if (replayIndex == null) {
        chartRef.current?.timeScale().fitContent();
      }
      lastRenderedIdxRef.current = targetIdx;
    }
    setRedrawTrigger(t => t + 1);
  }, [candles, replayIndex, settings.upColor, settings.downColor]);

  // Live candle
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs || !liveCandle || replayIndex != null) return;
    cs.update({ time: liveCandle.time as Time, open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close });
    setRedrawTrigger(t => t + 1);
  }, [liveCandle, replayIndex]);

  // Trade markers
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;
    const markers: SeriesMarker<Time>[] = [];
    if (replayStartIndex != null && candles[replayStartIndex]) {
      markers.push({ time: candles[replayStartIndex].time as Time, position: "belowBar", color: "#10b981", shape: "arrowUp", text: "START" });
    }
    manualTrades.forEach(t => {
      markers.push({ time: t.entryTime as Time, position: t.direction === "LONG" ? "belowBar" : "aboveBar", color: t.direction === "LONG" ? "#22c55e" : "#ef4444", shape: t.direction === "LONG" ? "arrowUp" : "arrowDown", text: t.direction === "LONG" ? "BUY" : "SELL" });
      if (t.exitTime != null) {
        const win = (t.pnl ?? 0) >= 0;
        markers.push({ time: t.exitTime as Time, position: t.direction === "LONG" ? "aboveBar" : "belowBar", color: win ? "#22c55e" : "#ef4444", shape: "circle", text: `EXIT (${win ? "+" : ""}${(t.pnl ?? 0).toFixed(0)})` });
      }
    });
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    cs.setMarkers(markers);
  }, [manualTrades, replayStartIndex, candles]);

  // ── Delete helpers ────────────────────────────────────────────────────────
  const handleClearAllDrawings = () => {
    onDrawingsChange([]);
    setPreviewDrawing(null);
    activeDrawingRef.current = null;
    setSelectedDrawingId(null);
    setMultiCreating(null);
  };

  const handleDeleteDrawing = useCallback((id: string) => {
    // Use localDrawingsRef to get the freshest list
    onDrawingsChange(localDrawingsRef.current.filter(d => d.id !== id));
    setSelectedDrawingId(null);
  }, [onDrawingsChange]);

  const handleToggleFavorite = (tool: DrawingType) => {
    const current = settings.favoriteTools || [];
    const updated = current.includes(tool)
      ? current.filter(t => t !== tool)
      : [...current, tool];
    onSettingsChange({ favoriteTools: updated });
  };

  const handleUpdateDrawingColor = (color: string) => {
    const updatedDrawings = localDrawingsRef.current.map((draw) => {
      if (draw.id === selectedDrawingId) {
        return { ...draw, color };
      }
      return draw;
    });
    onDrawingsChange(updatedDrawings);
    setRedrawTrigger((t) => t + 1);
  };

  // ── Event forwarding from SVG overlay to chart canvas ────────────────────
  // The SVG is a DOM sibling of the chart host div, so wheel/mousemove events
  // on drawings bubble to the wrapper — NOT to the chart canvas. We re-dispatch
  // them directly so lightweight-charts always receives scroll and crosshair input.
  const getChartCanvas = useCallback(
    () => containerRef.current?.querySelector('canvas') ?? null,
    [],
  );

  const forwardWheelToChart = useCallback((e: React.WheelEvent) => {
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const isOverPriceScale = rect.right - e.clientX <= 60;
      if (isOverPriceScale) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    const canvas = getChartCanvas();
    if (!canvas) return;
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaX:    e.deltaX,
      deltaY:    e.deltaY,
      deltaZ:    e.deltaZ,
      deltaMode: e.deltaMode,
      clientX:   e.clientX,
      clientY:   e.clientY,
      screenX:   e.screenX,
      screenY:   e.screenY,
      ctrlKey:   e.ctrlKey,
      altKey:    e.altKey,
      shiftKey:  e.shiftKey,
      metaKey:   e.metaKey,
      bubbles:   true,
      cancelable: true,
      composed:  true,
    }));
  }, [getChartCanvas]);

  // Also forward mousemove so the crosshair + tooltip stays live while
  // the pointer is hovering over a drawing.
  const forwardMouseMoveToChart = useCallback((e: React.MouseEvent) => {
    const canvas = getChartCanvas();
    if (!canvas) return;
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      clientX:  e.clientX,
      clientY:  e.clientY,
      screenX:  e.screenX,
      screenY:  e.screenY,
      ctrlKey:  e.ctrlKey,
      altKey:   e.altKey,
      shiftKey: e.shiftKey,
      metaKey:  e.metaKey,
      bubbles:  true,
      cancelable: true,
      composed: true,
    }));
  }, [getChartCanvas]);

  // ── SVG rendering helpers ─────────────────────────────────────────────────
  const svgW = containerRef.current?.clientWidth ?? 3000;
  const svgH = containerRef.current?.clientHeight ?? 1000;

  // Anchors are only interactive in cursor mode — prevents accidental drags while drawing
  const makeAnchor = (cx: number, cy: number, drawingId: string, pointIndex: number, key: string) => (
    <circle
      key={key}
      cx={cx} cy={cy} r={5.5}
      fill={CHART_BG} stroke={SEL_COLOR} strokeWidth={1.8}
      className={activeTool === "cursor" ? "cursor-nwse-resize pointer-events-auto" : "pointer-events-none"}
      onMouseDown={activeTool === "cursor" ? (e => {
        stopEvent(e);
        const newAnchor = { drawingId, pointIndex };
        draggingAnchorRef.current = newAnchor;
        setDraggingAnchor(newAnchor);
      }) : undefined}
    />
  );

  // Compute the arrowhead points for an arrow line
  const arrowHead = (x1: number, y1: number, x2: number, y2: number, size = 10) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const a1 = angle + Math.PI * 0.8;
    const a2 = angle - Math.PI * 0.8;
    return `${x2},${y2} ${x2 + size * Math.cos(a1)},${y2 + size * Math.sin(a1)} ${x2 + size * Math.cos(a2)},${y2 + size * Math.sin(a2)}`;
  };

  // Extend a line from p1 through p2 to the SVG right edge
  const extendToRight = (x1: number, y1: number, x2: number, y2: number) => {
    if (x2 === x1) return { x: x2, y: svgH };
    const slope = (y2 - y1) / (x2 - x1);
    const ex = svgW + 100;
    const ey = y1 + slope * (ex - x1);
    return { x: ex, y: ey };
  };

  const allDrawings = [...(localDrawings || []), ...(previewDrawing ? [previewDrawing] : [])];

  // ── Render single drawing ─────────────────────────────────────────────────
  const renderDrawing = (draw: Drawing) => {
    const p1 = getXY(draw.points[0]);
    const isSelected = selectedDrawingId === draw.id || selectedDrawingIds.includes(draw.id);
    const isPreview  = draw.id === previewDrawing?.id;
    const stroke     = draw.color || (isSelected ? SEL_COLOR : LINE_COLOR);
    const dashArray  = isPreview ? "5 4" : "0";

    // Drawings are only interactive in cursor mode.
    // In any drawing tool mode, <g> elements are pointer-events-none so clicks
    // fall through to the SVG to start a new drawing — this is the fix for
    // the "drawing stays stuck to cursor" bug (startDrag was firing on finalized
    // drawings when user clicked in drawing mode).
    const inCursorMode = activeTool === "cursor";

    const startDrag = (e: React.MouseEvent) => {
      stopEvent(e);
      setSelectedDrawingId(draw.id);
      if (isLocked) return;
      const coords = getTimePriceFromEvent(e);
      if (coords) {
        const nd = { id: draw.id, startPoints: [...draw.points], startMouseCoords: coords };
        draggingDrawingRef.current = nd;
        setDraggingDrawing(nd);
      }
    };
    const groupProps = {
      className: inCursorMode ? "cursor-pointer pointer-events-auto" : "pointer-events-none",
      onClick: inCursorMode ? ((e: React.MouseEvent) => { stopEvent(e); setSelectedDrawingId(draw.id); }) : undefined,
      onMouseDown: inCursorMode ? startDrag : undefined,
      // NO onMouseUp here — stopImmediatePropagation on mouseup would block the
      // global window.mouseup handler, leaving draggingDrawing set and the
      // drawing stuck to the cursor. Global handler is the sole cleanup point.
    };

    // ── Horizontal Line ───────────────────────────────────────────────────
    if (draw.type === "hline") {
      if (!p1) return null;
      return (
        <g key={draw.id} {...groupProps}>
          <line x1={0} y1={p1.y} x2={svgW} y2={p1.y} stroke="transparent" strokeWidth={12} />
          <line x1={0} y1={p1.y} x2={svgW} y2={p1.y} stroke={stroke} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dashArray} />
          <text x={svgW - 8} y={p1.y - 4} fill={stroke} fontSize={8} fontFamily="monospace" textAnchor="end">
            {draw.points[0].price.toFixed(4)}
          </text>
          {isSelected && makeAnchor(80, p1.y, draw.id, 0, "anc0")}
        </g>
      );
    }

    // ── Vertical Line ─────────────────────────────────────────────────────
    if (draw.type === "vline") {
      if (!p1) return null;
      return (
        <g key={draw.id} {...groupProps}>
          <line x1={p1.x} y1={0} x2={p1.x} y2={svgH} stroke="transparent" strokeWidth={12} />
          <line x1={p1.x} y1={0} x2={p1.x} y2={svgH} stroke={stroke} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dashArray} />
          {isSelected && makeAnchor(p1.x, 40, draw.id, 0, "anc0")}
        </g>
      );
    }

    // ── Trendline ─────────────────────────────────────────────────────────
    if (draw.type === "trendline") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      return (
        <g key={draw.id} {...groupProps}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={12} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5} strokeDasharray={dashArray} />
          {isSelected && <>{makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}{makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}</>}
        </g>
      );
    }

    // ── Ray (extends right) ───────────────────────────────────────────────
    if (draw.type === "ray") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      const ext = extendToRight(p1.x, p1.y, p2.x, p2.y);
      return (
        <g key={draw.id} {...groupProps}>
          <line x1={p1.x} y1={p1.y} x2={ext.x} y2={ext.y} stroke="transparent" strokeWidth={12} />
          <line x1={p1.x} y1={p1.y} x2={ext.x} y2={ext.y} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5} strokeDasharray={dashArray} />
          {isSelected && <>{makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}{makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}</>}
        </g>
      );
    }

    // ── Arrow ─────────────────────────────────────────────────────────────
    if (draw.type === "arrow") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      return (
        <g key={draw.id} {...groupProps}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={12} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.8} />
          <polygon points={arrowHead(p1.x, p1.y, p2.x, p2.y, 10)} fill={stroke} />
          {isSelected && <>{makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}{makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}</>}
        </g>
      );
    }

    // ── Rectangle ─────────────────────────────────────────────────────────
    if (draw.type === "rectangle") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
      return (
        <g key={draw.id} {...groupProps}>
          <rect x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5}
            fill={isSelected ? "rgba(234,179,8,0.08)" : (draw.color ? hexToRgba(draw.color, 0.05) : "rgba(59,130,246,0.05)")} strokeDasharray={dashArray} />
          {isSelected && <>
            {makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}
            {makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}
            {/* Opposite corners — visually shown, clicking moves to nearest real anchor */}
            <circle cx={p2.x} cy={p1.y} r={5.5} fill={CHART_BG} stroke={SEL_COLOR} strokeWidth={1.8}
              className={inCursorMode ? "cursor-nesw-resize pointer-events-auto" : "pointer-events-none"}
              onMouseDown={inCursorMode ? (e => { stopEvent(e); const na = { drawingId: draw.id, pointIndex: 1 }; draggingAnchorRef.current = na; setDraggingAnchor(na); }) : undefined} />
            <circle cx={p1.x} cy={p2.y} r={5.5} fill={CHART_BG} stroke={SEL_COLOR} strokeWidth={1.8}
              className={inCursorMode ? "cursor-nesw-resize pointer-events-auto" : "pointer-events-none"}
              onMouseDown={inCursorMode ? (e => { stopEvent(e); const na = { drawingId: draw.id, pointIndex: 0 }; draggingAnchorRef.current = na; setDraggingAnchor(na); }) : undefined} />
            {/* Center handle for whole-drawing movement */}
            <circle cx={cx} cy={cy} r={4} fill={SEL_COLOR} fillOpacity={0.4}
              className={inCursorMode ? "cursor-move pointer-events-auto" : "pointer-events-none"}
              onMouseDown={inCursorMode ? startDrag : undefined} />
          </>}
        </g>
      );
    }

    // ── Circle / Ellipse ─────────────────────────────────────────────────
    if (draw.type === "circle") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      const rx = Math.abs(p2.x - p1.x);
      const ry = Math.abs(p2.y - p1.y);
      return (
        <g key={draw.id} {...groupProps}>
          <ellipse cx={p1.x} cy={p1.y} rx={rx || 1} ry={ry || 1} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5}
            fill={isSelected ? "rgba(234,179,8,0.08)" : (draw.color ? hexToRgba(draw.color, 0.05) : "rgba(59,130,246,0.05)")} strokeDasharray={dashArray} />
          {isSelected && <>{makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}{makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}</>}
        </g>
      );
    }

    // ── Triangle ─────────────────────────────────────────────────────────
    if (draw.type === "triangle") {
      if (draw.points.length < 3) {
        // Partial preview
        const p2 = draw.points[1] ? getXY(draw.points[1]) : null;
        if (!p1 || !p2) return null;
        return <line key={draw.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={1.5} strokeDasharray="5 4" />;
      }
      const coords3 = draw.points.map(pt => getXY(pt));
      if (coords3.some(c => !c)) return null;
      const [c1, c2, c3] = coords3 as { x: number; y: number }[];
      const pts = `${c1.x},${c1.y} ${c2.x},${c2.y} ${c3.x},${c3.y}`;
      return (
        <g key={draw.id} {...groupProps}>
          <polygon points={pts} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5}
            fill={isSelected ? "rgba(234,179,8,0.08)" : (draw.color ? hexToRgba(draw.color, 0.05) : "rgba(59,130,246,0.05)")} strokeDasharray={dashArray} />
          {isSelected && draw.points.map((_, i) => {
            const xy = getXY(draw.points[i])!;
            return makeAnchor(xy.x, xy.y, draw.id, i, `a${i}`);
          })}
        </g>
      );
    }

    // ── Parallel Channel ─────────────────────────────────────────────────
    if (draw.type === "channel") {
      if (draw.points.length < 3) {
        const p2 = draw.points[1] ? getXY(draw.points[1]) : null;
        if (!p1 || !p2) return null;
        return <line key={draw.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={1.5} strokeDasharray="5 4" />;
      }
      const [c1, c2, c3] = draw.points.map(pt => getXY(pt)) as ({ x: number; y: number } | null)[];
      if (!c1 || !c2 || !c3) return null;
      // Offset: c3 defines the y-offset for the parallel line
      const dy = c3.y - c1.y;
      return (
        <g key={draw.id} {...groupProps}>
          {/* First line */}
          <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={stroke} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dashArray} />
          {/* Second parallel line */}
          <line x1={c1.x} y1={c1.y + dy} x2={c2.x} y2={c2.y + dy} stroke={stroke} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dashArray} />
          {/* Fill */}
          <polygon
            points={`${c1.x},${c1.y} ${c2.x},${c2.y} ${c2.x},${c2.y + dy} ${c1.x},${c1.y + dy}`}
            fill={isSelected ? "rgba(234,179,8,0.06)" : (draw.color ? hexToRgba(draw.color, 0.04) : "rgba(59,130,246,0.04)")} stroke="none"
          />
          {/* End caps */}
          <line x1={c1.x} y1={c1.y} x2={c1.x} y2={c1.y + dy} stroke={stroke} strokeWidth={1} strokeDasharray="3 3" />
          <line x1={c2.x} y1={c2.y} x2={c2.x} y2={c2.y + dy} stroke={stroke} strokeWidth={1} strokeDasharray="3 3" />
          {isSelected && <>
            {makeAnchor(c1.x, c1.y, draw.id, 0, "a0")}
            {makeAnchor(c2.x, c2.y, draw.id, 1, "a1")}
            {makeAnchor(c3.x, c3.y, draw.id, 2, "a2")}
          </>}
        </g>
      );
    }

    // ── Brush / Highlighter ───────────────────────────────────────────────
    if (draw.type === "brush") {
      const pts = draw.points.map(pt => getXY(pt)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length < 2) return null;
      // Smooth catmull-rom style path
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const prev  = pts[i - 1];
        const curr  = pts[i];
        const cpx   = (prev.x + curr.x) / 2;
        const cpy   = (prev.y + curr.y) / 2;
        if (i === 1) {
          d += ` Q ${prev.x} ${prev.y} ${cpx} ${cpy}`;
        } else {
          d += ` T ${cpx} ${cpy}`;
        }
      }
      d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
      return (
        <g key={draw.id} {...groupProps}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={isSelected ? (draw.color ? hexToRgba(draw.color, 0.55) : "rgba(234,179,8,0.55)") : (draw.color ? hexToRgba(draw.color, 0.28) : "rgba(59,130,246,0.28)")} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }

    // ── Text Annotation ───────────────────────────────────────────────────
    if (draw.type === "text") {
      if (!p1) return null;
      const label = draw.text || "Text";
      const fw    = label.length * 6.5 + 12;
      return (
        <g key={draw.id} {...groupProps}>
          <rect x={p1.x - 4} y={p1.y - 15} width={fw} height={19} rx={4} fill={CHART_BG} stroke={isSelected ? SEL_COLOR : (draw.color || "#23262f")} strokeWidth={isSelected ? 1.5 : 1} />
          <text x={p1.x + 2} y={p1.y - 2} fill={isSelected ? SEL_COLOR : (draw.color || LINE_COLOR)} fontSize={9} fontFamily="monospace" fontWeight="bold">{label}</text>
          {isSelected && makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}
        </g>
      );
    }

    // ── Smiley / Emoji ────────────────────────────────────────────────────
    if (draw.type === "smiley") {
      if (!p1) return null;
      return (
        <g key={draw.id} {...groupProps}>
          {isSelected && <circle cx={p1.x} cy={p1.y} r={14} fill={draw.color ? hexToRgba(draw.color, 0.18) : "rgba(234,179,8,0.18)"} stroke={draw.color || SEL_COLOR} strokeWidth={1} />}
          <text x={p1.x - 8} y={p1.y + 8} fontSize={16}>🙂</text>
          {isSelected && makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}
        </g>
      );
    }

    // ── Ruler ─────────────────────────────────────────────────────────────
    if (draw.type === "ruler") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      const pips  = Math.abs(draw.points[0].price - draw.points[1].price) * 10000;
      const bars  = Math.round(Math.abs(draw.points[0].time - draw.points[1].time) / 900);
      const bx    = Math.min(p1.x, p2.x);
      const by    = Math.min(p1.y, p2.y) - 22;
      return (
        <g key={draw.id} {...groupProps}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={12} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? SEL_COLOR : (draw.color || "#f59e0b")} strokeWidth={isSelected ? 2.5 : 1.5} strokeDasharray="4 3" />
          <rect x={bx} y={by} width={108} height={17} rx={4} fill={isSelected ? SEL_COLOR : (draw.color || "#f59e0b")} />
          <text x={bx + 54} y={by + 11} textAnchor="middle" fill="#000" fontSize={8} fontFamily="monospace" fontWeight="bold">
            {pips.toFixed(1)} Pips | {bars} Bars
          </text>
          {isSelected && <>{makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}{makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}</>}
        </g>
      );
    }

    // ── Fibonacci Retracements ────────────────────────────────────────────
    if (draw.type === "fib") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      const dy  = p2.y - p1.y;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
      const labels = ["0%", "23.6%", "38.2%", "50%", "61.8%", "78.6%", "100%"];
      const zoneColors = [
        "rgba(239,68,68,0.04)", "rgba(249,115,22,0.04)", "rgba(234,179,8,0.04)",
        "rgba(16,185,129,0.04)", "rgba(59,130,246,0.04)", "rgba(139,92,246,0.04)",
      ];
      return (
        <g key={draw.id} {...groupProps}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={12} />
          {zoneColors.map((color, idx) => {
            const yTop = p1.y + dy * levels[idx];
            const yBot = p1.y + dy * levels[idx + 1];
            return <rect key={`z${idx}`} x={0} y={Math.min(yTop, yBot)} width={svgW} height={Math.abs(yBot - yTop)} fill={color} pointerEvents="none" />;
          })}
          {levels.map((lvl, idx) => {
            const y = p1.y + dy * lvl;
            const priceVal = draw.points[0].price + (draw.points[1].price - draw.points[0].price) * lvl;
            return (
              <g key={idx}>
                <line x1={0} y1={y} x2={svgW} y2={y} stroke={isSelected ? (draw.color ? hexToRgba(draw.color, 0.4) : "rgba(234,179,8,0.4)") : (draw.color ? hexToRgba(draw.color, 0.22) : "rgba(59,130,246,0.22)")} strokeWidth={isSelected ? 1.5 : 1} />
                <text x={p1.x + 8} y={y - 3} fill={isSelected ? SEL_COLOR : (draw.color || TEXT_COLOR)} fontSize={8} fontFamily="monospace">
                  {labels[idx]} ({priceVal.toFixed(4)})
                </text>
              </g>
            );
          })}
          {isSelected && <>{makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}{makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}</>}
        </g>
      );
    }

    // ── Harmonic XABCD ────────────────────────────────────────────────────
    if (draw.type === "patterns") {
      const ptsXY = draw.points.map(pt => getXY(pt));
      if (draw.points.length < 5 || ptsXY.some(p => !p)) return null;
      const [pX, pA, pB, pC, pD] = ptsXY as { x: number; y: number }[];
      return (
        <g key={draw.id} {...groupProps}>
          <polygon points={`${pX.x},${pX.y} ${pA.x},${pA.y} ${pB.x},${pB.y}`}
            stroke={isSelected ? SEL_COLOR : (draw.color || "#8b5cf6")} strokeWidth={isSelected ? 2 : 1.5}
            fill={isSelected ? "rgba(139,92,246,0.2)" : (draw.color ? hexToRgba(draw.color, 0.1) : "rgba(139,92,246,0.1)")} />
          <polygon points={`${pB.x},${pB.y} ${pC.x},${pC.y} ${pD.x},${pD.y}`}
            stroke={isSelected ? SEL_COLOR : (draw.color || "#8b5cf6")} strokeWidth={isSelected ? 2 : 1.5}
            fill={isSelected ? "rgba(139,92,246,0.2)" : (draw.color ? hexToRgba(draw.color, 0.1) : "rgba(139,92,246,0.1)")} />
          {[{ p: pX, l: "X" }, { p: pA, l: "A" }, { p: pB, l: "B" }, { p: pC, l: "C" }, { p: pD, l: "D" }].map((v, i) => (
            <text key={i} x={v.p.x} y={v.p.y - 8} fill="#c084fc" fontSize={9} fontFamily="monospace" fontWeight="bold" textAnchor="middle">{v.l}</text>
          ))}
          {isSelected && draw.points.map((_, idx) => {
            const xy = getXY(draw.points[idx])!;
            return makeAnchor(xy.x, xy.y, draw.id, idx, `a${idx}`);
          })}
        </g>
      );
    }

    // ── Long / Short Risk Bracket ─────────────────────────────────────────
    if (draw.type === "long" || draw.type === "short") {
      const p2 = getXY(draw.points[1]);
      if (!p1 || !p2) return null;
      const isLong = draw.type === "long";
      const entry  = draw.points[0].price;
      const stop   = draw.points[1].price;
      const dist   = Math.abs(entry - stop);
      const tp     = draw.points[2]?.price ?? (isLong ? entry + dist * 2 : entry - dist * 2);
      const tpPt   = draw.points[2] ? getXY(draw.points[2]) : null;
      const tpY    = tpPt?.y ?? (p1.y - (p2.y - p1.y) * 2);
      const xStart = p1.x;
      const width  = Math.max(90, Math.abs(p2.x - p1.x) + 40);
      const rrRatio = Math.abs(tp - entry) / (dist || 1);
      return (
        <g key={draw.id} {...groupProps}>
          <rect x={xStart} y={Math.min(p1.y, tpY)} width={width} height={Math.abs(tpY - p1.y)}
            fill={isSelected ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.12)"} stroke={isSelected ? SEL_COLOR : "#22c55e"} strokeWidth={isSelected ? 1.5 : 0.75} />
          <rect x={xStart} y={Math.min(p1.y, p2.y)} width={width} height={Math.abs(p2.y - p1.y)}
            fill={isSelected ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.12)"} stroke={isSelected ? SEL_COLOR : "#ef4444"} strokeWidth={isSelected ? 1.5 : 0.75} />
          <rect x={xStart + 6} y={p1.y - 9} width={70} height={17} rx={4} fill={CHART_BG} stroke={isSelected ? SEL_COLOR : "#23262f"} strokeWidth={1} />
          <text x={xStart + 41} y={p1.y + 3} textAnchor="middle" fill="#d1d5db" fontSize={8} fontFamily="monospace" fontWeight="bold">
            R/R: {rrRatio.toFixed(2)}
          </text>
          {isSelected && <>
            {makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}
            {makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}
            {makeAnchor(p2.x, tpY, draw.id, 2, "a2")}
          </>}
        </g>
      );
    }

    return null;
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full flex transition-colors duration-200" style={{ backgroundColor: settings.bgColor || "#0f0f0f" }}>

      {/* ── Toolbar ── */}
      <div className="group/panel w-11 border-r border-white/[0.08] flex flex-col items-center py-2 gap-0 shrink-0 z-20 select-none overflow-y-auto opacity-40 hover:opacity-100 transition-opacity duration-300"
        style={{ backgroundColor: settings.bgColor || "#0f0f0f" }}>

        {/* Cursor */}
        <TB active={activeTool === "cursor"} onClick={() => setActiveTool("cursor")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2L3 12.5L5.8 9.5L7.5 14L9.3 13.2L7.6 9H12L3 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"/></svg>
        } label="Crosshair / Cursor" />

        <Sep />

        {/* Lines group */}
        <TB active={activeTool === "trendline"} onClick={() => setActiveTool("trendline")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="2" y1="13.5" x2="14" y2="2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="2" cy="13.5" r="1.4" fill="currentColor"/><circle cx="14" cy="2.5" r="1.4" fill="currentColor"/></svg>
        } label="Trend Line" isFavorited={settings.favoriteTools?.includes("trendline")} onStarClick={() => handleToggleFavorite("trendline")} />
        <TB active={activeTool === "ray"} onClick={() => setActiveTool("ray")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="2.5" cy="11" r="1.3" fill="currentColor"/><line x1="3.7" y1="10.4" x2="11" y2="5.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 5.5L14 3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1.8 1.5" strokeOpacity="0.6"/></svg>
        } label="Ray (extends right)" isFavorited={settings.favoriteTools?.includes("ray")} onStarClick={() => handleToggleFavorite("ray")} />
        <TB active={activeTool === "hline"} onClick={() => setActiveTool("hline")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="1.5" y1="5.5" x2="1.5" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/><line x1="14.5" y1="5.5" x2="14.5" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/></svg>
        } label="Horizontal Line" isFavorited={settings.favoriteTools?.includes("hline")} onStarClick={() => handleToggleFavorite("hline")} />
        <TB active={activeTool === "vline"} onClick={() => setActiveTool("vline")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="5.5" y1="1.5" x2="10.5" y2="1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/><line x1="5.5" y1="14.5" x2="10.5" y2="14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/></svg>
        } label="Vertical Line" isFavorited={settings.favoriteTools?.includes("vline")} onStarClick={() => handleToggleFavorite("vline")} />
        <TB active={activeTool === "arrow"} onClick={() => setActiveTool("arrow")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="3.5" y1="12.5" x2="12" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M7 4H12V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        } label="Arrow" isFavorited={settings.favoriteTools?.includes("arrow")} onStarClick={() => handleToggleFavorite("arrow")} />

        <Sep />

        {/* Shapes group */}
        <TB active={activeTool === "rectangle"} onClick={() => setActiveTool("rectangle")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="4.5" width="12" height="7" stroke="currentColor" strokeWidth="1.4"/></svg>
        } label="Rectangle" isFavorited={settings.favoriteTools?.includes("rectangle")} onStarClick={() => handleToggleFavorite("rectangle")} />
        <TB active={activeTool === "circle"} onClick={() => setActiveTool("circle")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><ellipse cx="8" cy="8" rx="5.5" ry="4" stroke="currentColor" strokeWidth="1.4"/></svg>
        } label="Circle / Ellipse" isFavorited={settings.favoriteTools?.includes("circle")} onStarClick={() => handleToggleFavorite("circle")} />
        <TB active={activeTool === "triangle"} onClick={() => setActiveTool("triangle")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
        } label="Triangle (3 clicks)" isFavorited={settings.favoriteTools?.includes("triangle")} onStarClick={() => handleToggleFavorite("triangle")} />
        <TB active={activeTool === "channel"} onClick={() => setActiveTool("channel")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 5L14 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 9.5L14 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5"/></svg>
        } label="Parallel Channel (3 clicks)" isFavorited={settings.favoriteTools?.includes("channel")} onStarClick={() => handleToggleFavorite("channel")} />

        <Sep />

        {/* Fib */}
        <TB active={activeTool === "fib"} onClick={() => setActiveTool("fib")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.65"/><line x1="2" y1="9.5" x2="14" y2="9.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeOpacity="0.45"/><line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeOpacity="0.3"/><path d="M3 4L13 12" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="2 1.5" strokeOpacity="0.5"/></svg>
        } label="Fibonacci Retracement" isFavorited={settings.favoriteTools?.includes("fib")} onStarClick={() => handleToggleFavorite("fib")} />

        <Sep />

        {/* Risk positions */}
        <TB active={activeTool === "long"} onClick={() => setActiveTool("long")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3.5" width="9" height="5" stroke="#10b981" strokeWidth="1.1" fill="rgba(16,185,129,0.15)"/><rect x="2" y="8.5" width="9" height="4" stroke="#ef4444" strokeWidth="1.1" fill="rgba(239,68,68,0.1)"/><path d="M13 6.5L13 2M11.5 3.5L13 2L14.5 3.5" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        } label="Long Position (Risk/Reward)" isFavorited={settings.favoriteTools?.includes("long")} onStarClick={() => handleToggleFavorite("long")} />
        <TB active={activeTool === "short"} onClick={() => setActiveTool("short")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3.5" width="9" height="4" stroke="#10b981" strokeWidth="1.1" fill="rgba(16,185,129,0.1)"/><rect x="2" y="7.5" width="9" height="5" stroke="#ef4444" strokeWidth="1.1" fill="rgba(239,68,68,0.15)"/><path d="M13 9.5L13 14M11.5 12.5L13 14L14.5 12.5" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        } label="Short Position (Risk/Reward)" isFavorited={settings.favoriteTools?.includes("short")} onStarClick={() => handleToggleFavorite("short")} />
        <TB active={activeTool === "patterns"} onClick={() => setActiveTool("patterns")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12L5 4.5L8.5 9L11.5 3L14 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="2" cy="12" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="5" cy="4.5" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="8.5" cy="9" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="11.5" cy="3" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="14" cy="7" r="1" fill="currentColor" fillOpacity="0.7"/></svg>
        } label="Harmonic XABCD Pattern" isFavorited={settings.favoriteTools?.includes("patterns")} onStarClick={() => handleToggleFavorite("patterns")} />

        <Sep />

        {/* Annotations */}
        <TB active={activeTool === "text"} onClick={() => setActiveTool("text")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.5 4H12.5M8 4V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5.5 13H10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/></svg>
        } label="Text Annotation" isFavorited={settings.favoriteTools?.includes("text")} onStarClick={() => handleToggleFavorite("text")} />
        <TB active={activeTool === "brush"} onClick={() => setActiveTool("brush")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 12Q6 8 9 9Q12 10 14 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.18"/><path d="M3 12Q6 8 9 9Q12 10 14 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        } label="Highlighter Brush" isFavorited={settings.favoriteTools?.includes("brush")} onStarClick={() => handleToggleFavorite("brush")} />
        <TB active={activeTool === "ruler"} onClick={() => setActiveTool("ruler")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="5.5" width="13" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><line x1="4" y1="5.5" x2="4" y2="8" stroke="currentColor" strokeWidth="1"/><line x1="6.5" y1="5.5" x2="6.5" y2="9.5" stroke="currentColor" strokeWidth="1"/><line x1="9" y1="5.5" x2="9" y2="8" stroke="currentColor" strokeWidth="1"/><line x1="11.5" y1="5.5" x2="11.5" y2="9.5" stroke="currentColor" strokeWidth="1"/></svg>
        } label="Ruler (Pips & Bars)" isFavorited={settings.favoriteTools?.includes("ruler")} onStarClick={() => handleToggleFavorite("ruler")} />
        <TB active={activeTool === "smiley"} onClick={() => setActiveTool("smiley")} icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 9.5Q8 11.5 10.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6.2" cy="7" r="0.9" fill="currentColor"/><circle cx="9.8" cy="7" r="0.9" fill="currentColor"/></svg>
        } label="Emoji Marker" isFavorited={settings.favoriteTools?.includes("smiley")} onStarClick={() => handleToggleFavorite("smiley")} />

        <Sep />

        {/* Utilities */}
        <TB active={false} onClick={() => chartRef.current?.timeScale().fitContent()}
          icon={<Search className="w-4 h-4" />} label="Fit / Reset Zoom" />
        <TB active={settings.isMagnetActive} onClick={() => onSettingsChange({ isMagnetActive: !settings.isMagnetActive })}
          icon={<Magnet className={`w-4 h-4 ${settings.isMagnetActive ? "text-white/65" : ""}`} />} label="Magnet Mode (snap OHLC)" />
        <TB active={stayInDrawingMode} onClick={() => setStayInDrawingMode(p => !p)}
          icon={<PenTool className={`w-4 h-4 ${stayInDrawingMode ? "text-white/65" : ""}`} />} label="Stay in Drawing Mode" />
        <TB active={isLocked} onClick={() => setIsLocked(p => !p)}
          icon={isLocked ? <Lock className="w-4 h-4 text-red-400" /> : <Unlock className="w-4 h-4" />} label={isLocked ? "Unlock Drawings" : "Lock Drawings"} />
        <TB active={areDrawingsHidden} onClick={() => setAreDrawingsHidden(p => !p)}
          icon={areDrawingsHidden ? <EyeOff className="w-4 h-4 text-white/55" /> : <Eye className="w-4 h-4" />} label={areDrawingsHidden ? "Show Drawings" : "Hide Drawings"} />

        <Sep />

        <button onClick={handleClearAllDrawings}
          className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all active:scale-90 cursor-pointer"
          title="Clear All Drawings">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* ── Chart area ── */}
      <div className="flex-1 min-w-0 h-full relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* ── Floating Favorites Toolbar ── */}
        {settings.favoriteTools && settings.favoriteTools.length > 0 && (
          <div
            className="absolute flex items-center gap-1 bg-black/80 backdrop-blur-xl border border-white/[0.10] rounded-lg p-1 z-20 shadow-xl select-none font-mono text-[9px] pointer-events-auto transition-shadow duration-150"
            style={{
              left: favsPos.x !== null ? `${favsPos.x}px` : "50%",
              top: `${favsPos.y}px`,
              transform: favsPos.x !== null ? "none" : "translateX(-50%)",
              cursor: isFavsDragging ? "grabbing" : "default",
              boxShadow: isFavsDragging ? "0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)" : undefined,
            }}
          >
            {/* Draggable Grip Handle */}
            <div
              onMouseDown={handleFavsMouseDown}
              className="p-1 text-white/30 hover:text-white/70 cursor-grab active:cursor-grabbing flex items-center justify-center rounded hover:bg-white/[0.06] transition-colors shrink-0"
              title="Drag Favorites Toolbar"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>

            {/* Star Icon Indicator */}
            <div className="pl-0.5 pr-0.5 flex items-center justify-center text-white/40 shrink-0">
              <Star className="w-3.5 h-3.5 fill-white/55 text-white/55" />
            </div>

            {/* Vertical Divider */}
            <div className="w-px h-4.5 bg-white/[0.08] mx-1 shrink-0" />

            <div className="flex items-center gap-0.5">
              {settings.favoriteTools.map((tool) => {
                const icon = getToolIcon(tool as DrawingType);
                const label = getToolLabel(tool as DrawingType);
                return (
                  <button
                    key={tool}
                    onClick={() => setActiveTool(tool as DrawingType)}
                    className={`p-1.5 rounded transition-all active:scale-90 cursor-pointer ${
                      activeTool === tool
                        ? "bg-white/[0.10] text-white"
                        : "text-white/40 hover:text-white hover:bg-white/[0.06]"
                    }`}
                    title={label}
                  >
                    {icon}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SVG Drawing Overlay ── */}
        {!areDrawingsHidden && (
          <svg
            className={`absolute inset-0 w-full h-full z-10 ${
              activeTool !== "cursor" || isClickCreating || !!multiCreating || isModifierHeld || lassoBox
                ? "pointer-events-auto"
                : "pointer-events-none"
            }`}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={(e) => { handleSvgMouseMove(e); forwardMouseMoveToChart(e); }}
            onMouseUp={handleSvgMouseUp}
            onWheel={forwardWheelToChart}
          >
            {allDrawings.map(draw => renderDrawing(draw))}

            {/* Lasso Selector Box */}
            {lassoBox && (
              <rect
                x={Math.min(lassoBox.x1, lassoBox.x2)}
                y={Math.min(lassoBox.y1, lassoBox.y2)}
                width={Math.abs(lassoBox.x2 - lassoBox.x1)}
                height={Math.abs(lassoBox.y2 - lassoBox.y1)}
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth={1.2}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
            )}
          </svg>
        )}

        {/* ── Floating Multi-Selection Panel ── */}
        {selectedDrawingIds.length > 1 && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-3.5 px-4.5 py-2.5 bg-black/85 backdrop-blur-md border border-red-500/35 rounded-full z-45 shadow-2xl font-mono text-[9px] text-gray-200 pointer-events-auto select-none"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="font-bold text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {selectedDrawingIds.length} DRAWINGS SELECTED
            </span>
            <div className="h-4 w-px bg-white/10" />
            <button
              onClick={() => {
                const freshDrawings = localDrawings.filter(d => !selectedDrawingIds.includes(d.id));
                onDrawingsChange(freshDrawings);
                setSelectedDrawingIds([]);
              }}
              className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer focus:outline-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selection</span>
            </button>
            <button
              onClick={() => setSelectedDrawingIds([])}
              className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer focus:outline-none"
              title="Cancel Selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Inline Text Input Overlay ── */}
        {textOverlay && (
          <div
            className="absolute z-50 flex items-center gap-1"
            style={{ left: textOverlay.x, top: textOverlay.y - 30, transform: "translateX(-4px)" }}
          >
            <input
              autoFocus
              value={textInputVal}
              onChange={e => setTextInputVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { textOverlay.onSubmit(textInputVal); }
                if (e.key === "Escape") { setTextOverlay(null); setTextInputVal(""); setActiveTool("cursor"); }
              }}
              onBlur={() => { if (textInputVal.trim()) textOverlay.onSubmit(textInputVal); else { setTextOverlay(null); setTextInputVal(""); } }}
              placeholder="Type text…"
              className="bg-black/90 border border-white/[0.10] backdrop-blur-xl rounded px-2 py-1 text-white text-xs font-mono focus:outline-none w-36 shadow-lg"
            />
            <button onClick={() => textOverlay.onSubmit(textInputVal)} className="p-1 bg-white/[0.09] rounded text-white text-xs">✓</button>
            <button onClick={() => { setTextOverlay(null); setTextInputVal(""); }} className="p-1 bg-white/[0.08] rounded text-gray-400 text-xs">✗</button>
          </div>
        )}

        {/* ── Multi-point hint ── */}
        {multiCreating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-lg px-3 py-1.5 text-[10px] font-mono text-white/50 pointer-events-none">
            {multiCreating.points.length === 1
              ? `Click to set 2nd point (${multiCreating.type})`
              : `Click to set 3rd point and finalize`}
          </div>
        )}

        {/* ── Replay / Live badge ── */}
        {replayIndex == null && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[9px] font-bold bg-black/80 border border-white/[0.08] rounded px-2 py-1 select-none font-mono z-20">
            {liveStatus === "live" && <><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-green-500 tracking-wider">LIVE FEED</span></>}
            {liveStatus === "reconnecting" && <><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" /><span className="text-white/55 tracking-wider">RECONNECTING</span></>}
            {liveStatus === "stopped" && <span className="text-white/40 tracking-wider">REPLAY DOCKED</span>}
          </div>
        )}

        {/* ── Open trade P&L ── */}
        {openTrade && (
          <div className="absolute top-3 left-3 bg-black/80 border border-white/[0.08] rounded-lg px-3 py-2 text-[10px] font-mono z-20 flex items-center gap-2">
            <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${openTrade.direction === "LONG" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {openTrade.direction}
            </span>
            <span className="text-gray-500">Entry <b className="text-white">{openTrade.entryPrice.toFixed(3)}</b></span>
            <span className="w-px h-3 bg-white/[0.08]" />
            <span className={`font-bold ${openTradeUnrealised >= 0 ? "text-green-500" : "text-red-500"}`}>
              {openTradeUnrealised >= 0 ? "+" : ""}${openTradeUnrealised.toFixed(2)}
            </span>
          </div>
        )}

        {/* ── Selected drawing context bubble ── */}
        {selectedDrawingId && (() => {
          const sel = localDrawings.find(d => d.id === selectedDrawingId);
          if (!sel) return null;
          const xy = getXY(sel.points[0]);
          if (!xy) return null;

          const paletteColors = ["#3b82f6", "#10b981", "#ef4444", "#eab308", "#8b5cf6", "#999BA5", "#ffffff"];
          const applicableTemplates = (settings.drawingTemplates || []).filter(t => t.type === sel.type);

          return (
            <div className="absolute z-30 flex flex-col bg-black/80 border border-white/[0.10] rounded-lg p-2 shadow-2xl select-none font-mono text-[9px] min-w-[220px]"
              style={{ left: `${Math.max(10, xy.x - 40)}px`, top: `${Math.max(10, xy.y - 65)}px`, transform: "translateY(-50%)" }}>
              
              <div className="flex items-center gap-2">
                <span className="font-bold text-white/80 uppercase tracking-wider">{sel.type}</span>
                
                <div className="w-px h-3.5 bg-white/[0.08]" />
                
                {/* Palette color dots */}
                <div className="flex items-center gap-1">
                  {paletteColors.map((col) => (
                    <button
                      key={col}
                      onClick={() => handleUpdateDrawingColor(col)}
                      className="w-3.5 h-3.5 rounded-full border border-white/20 transition-all hover:scale-110 active:scale-90 cursor-pointer"
                      style={{ backgroundColor: col }}
                      title={`Set color to ${col}`}
                    />
                  ))}
                  
                  {/* Custom picker */}
                  <div className="relative w-3.5 h-3.5 rounded-full border border-white/20 overflow-hidden hover:scale-110 transition-all flex items-center justify-center cursor-pointer bg-gradient-to-tr from-red-500 via-green-500 to-blue-500">
                    <input
                      type="color"
                      value={sel.color || "#3b82f6"}
                      onChange={(e) => handleUpdateDrawingColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      title="Choose Custom Color"
                    />
                  </div>
                </div>

                <div className="w-px h-3.5 bg-white/[0.08]" />

                {/* Templates trigger */}
                <button
                  onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                  className={`px-1.5 py-0.5 rounded font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                    isTemplateMenuOpen
                      ? "bg-white/[0.07] border-white/[0.12] text-white/65"
                      : "bg-white/[0.06] border-white/[0.08] text-gray-400 hover:text-white"
                  }`}
                  title="Templates menu"
                >
                  TEMPLATES
                </button>

                <div className="w-px h-3.5 bg-white/[0.08]" />

                {/* Delete button */}
                <button onClick={e => { e.stopPropagation(); handleDeleteDrawing(selectedDrawingId); }}
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex items-center cursor-pointer" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Templates Popover */}
              {isTemplateMenuOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-40 bg-black/90 backdrop-blur-xl border border-white/[0.10] rounded-lg p-2 shadow-2xl flex flex-col gap-1.5 min-w-[150px]">
                  <button
                    onClick={() => {
                      const name = prompt("Enter template name:");
                      if (name) {
                        const newTemplate = {
                          id: String(Date.now()),
                          name,
                          type: sel.type,
                          color: sel.color || "#3b82f6",
                        };
                        const updatedTemplates = [...(settings.drawingTemplates || []), newTemplate];
                        onSettingsChange({ drawingTemplates: updatedTemplates });
                      }
                      setIsTemplateMenuOpen(false);
                    }}
                    className="w-full text-left px-2 py-1 hover:bg-white/[0.09] hover:text-white rounded transition-colors text-[8px] font-bold text-white/65"
                  >
                    + SAVE AS TEMPLATE...
                  </button>
                  {applicableTemplates.length > 0 && (
                    <>
                      <div className="h-px bg-white/[0.08] my-0.5" />
                      <span className="px-2 text-[7px] text-gray-500 font-bold uppercase tracking-wider">APPLY TEMPLATE:</span>
                      {applicableTemplates.map((t) => (
                        <div key={t.id} className="flex items-center justify-between hover:bg-white/[0.06] rounded px-2 py-0.5 group/item">
                          <button
                            onClick={() => {
                              handleUpdateDrawingColor(t.color);
                              setIsTemplateMenuOpen(false);
                            }}
                            className="text-left text-gray-300 font-medium truncate w-[100px]"
                            title={`Apply ${t.name}`}
                          >
                            {t.name}
                          </button>
                          <button
                            onClick={() => {
                              const updatedTemplates = (settings.drawingTemplates || []).filter(item => item.id !== t.id);
                              onSettingsChange({ drawingTemplates: updatedTemplates });
                            }}
                            className="text-gray-500 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5"
                            title="Delete Template"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

            </div>
          );
        })()}

        {/* ── Bottom-right controls ── */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-lg p-1 z-20 select-none font-mono text-[9px]">
          <button
            onClick={() => onSettingsChange({ isYAxisLocked: !settings.isYAxisLocked })}
            className={`px-2 py-1 rounded font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer border ${
              settings.isYAxisLocked ? "bg-white/[0.08] border-white/[0.12] text-white/80" : "bg-white/[0.04] border-white/[0.12] text-white/60 hover:bg-white/[0.08]"
            }`} title={settings.isYAxisLocked ? "Y-Axis LOCKED" : "Y-Axis AUTO"}>
            {settings.isYAxisLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>{settings.isYAxisLocked ? "LOCKED SCALE" : "AUTO SCALE"}</span>
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <button onClick={() => setIsSettingsModalOpen(true)}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90 cursor-pointer flex items-center"
            title="Chart Settings">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Settings Modal ── */}
        {isSettingsModalOpen && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsSettingsModalOpen(false)}>
            <div className="w-full max-w-md bg-[#0f0f0f]/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-black/80">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-white/55" />
                  <span className="font-bold text-white text-sm tracking-tight font-mono">CHART SETTINGS</span>
                </div>
                <button onClick={() => setIsSettingsModalOpen(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-500 hover:text-white transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 flex flex-col gap-5 text-xs font-mono">
                <div className="flex flex-col gap-2">
                  <label className="text-white/40 uppercase tracking-widest font-semibold text-[9px]">Candlestick Theme</label>
                  <select value={settings.themeName}
                    onChange={e => {
                      const v = e.target.value;
                      const themes: Record<string, { upColor: string; downColor: string }> = {
                        "Emerald Bull":    { upColor: "#10b981", downColor: "#ef4444" },
                        "Classic Blue":    { upColor: "#2563eb", downColor: "#ef4444" },
                        "Slate & Crimson": { upColor: "#999BA5", downColor: "#D63939" },
                        "Vaporwave Neon":  { upColor: "#ec4899", downColor: "#06b6d4" },
                        "Sleek Dark":      { upColor: "#3b82f6", downColor: "#1e293b" },
                        "Warm Retro":      { upColor: "#eab308", downColor: "#ea580c" },
                      };
                      onSettingsChange({ themeName: v, ...(themes[v] || {}) });
                    }}
                    className="w-full bg-black/80 border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-white/[0.25] cursor-pointer">
                    <option>Emerald Bull</option>
                    <option>Classic Blue</option>
                    <option>Slate & Crimson</option>
                    <option>Vaporwave Neon</option>
                    <option>Sleek Dark</option>
                    <option>Warm Retro</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Bull Color", key: "upColor" as const },
                    { label: "Bear Color", key: "downColor" as const },
                  ].map(({ label, key }) => (
                    <div key={key} className="flex flex-col gap-2">
                      <label className="text-white/40 uppercase tracking-widest font-semibold text-[9px]">{label}</label>
                      <div className="flex items-center gap-2 bg-black/80 border border-white/[0.08] rounded-lg px-3 py-1.5">
                        <input type="color" value={settings[key]} onChange={e => onSettingsChange({ [key]: e.target.value, themeName: "Custom" })} className="w-6 h-6 border-0 bg-transparent cursor-pointer shrink-0 rounded" />
                        <input type="text" value={settings[key]} onChange={e => onSettingsChange({ [key]: e.target.value, themeName: "Custom" })} className="bg-transparent border-0 text-white w-full text-center focus:outline-none uppercase font-bold" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-white/40 uppercase tracking-widest font-semibold text-[9px]">Canvas Background</label>
                  <div className="flex items-center gap-2 bg-black/80 border border-white/[0.08] rounded-lg px-3 py-1.5">
                    <input type="color" value={settings.bgColor || "#0f0f0f"} onChange={e => onSettingsChange({ bgColor: e.target.value })} className="w-6 h-6 border-0 bg-transparent cursor-pointer shrink-0 rounded" />
                    <input type="text" value={settings.bgColor || "#0f0f0f"} onChange={e => onSettingsChange({ bgColor: e.target.value })} className="bg-transparent border-0 text-white w-20 text-center focus:outline-none uppercase font-bold" />
                    <div className="flex gap-1.5 ml-auto">
                      {["#0f0f0f", "#0c0e14", "#141720", "#000000"].map(bg => (
                        <button key={bg} type="button" onClick={() => onSettingsChange({ bgColor: bg })}
                          className="w-4 h-4 rounded-full border border-white/[0.08] cursor-pointer hover:scale-110 transition-all"
                          style={{ backgroundColor: bg }} title={bg} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-white/[0.08]" />

                {[
                  { label: "Show Grid Lines", desc: "Vertical & horizontal grid lines", key: "showGrid" as const, color: "blue" },
                  { label: "Show Volume",     desc: "Volume histogram at bottom",        key: "showVolume" as const, color: "blue" },
                  { label: "Lock Y-Axis",     desc: "Fix price scale for free panning",  key: "isYAxisLocked" as const, color: "yellow" },
                  { label: "Magnet Mode",     desc: "Snap drawings to OHLC levels",      key: "isMagnetActive" as const, color: "blue" },
                ].map(({ label, desc, key, color }) => (
                  <div key={key} className="flex items-center justify-between bg-black/80/30 rounded-lg px-3.5 py-2.5 border border-white/[0.08]/60 hover:bg-black/80/60 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white font-bold tracking-tight">{label}</span>
                      <span className="text-[9px] text-gray-500">{desc}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input type="checkbox" checked={settings[key]} onChange={e => onSettingsChange({ [key]: e.target.checked })} className="sr-only peer" />
                      <div className={`w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${color === "yellow" ? "peer-checked:bg-white/[0.16]" : "peer-checked:bg-white/[0.12]"} peer-checked:after:bg-white`} />
                    </label>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-white/[0.08] bg-black/80 flex justify-end">
                <button onClick={() => setIsSettingsModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-white font-bold font-mono text-xs transition-all active:scale-95 cursor-pointer">
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

// ── Toolbar button ─────────────────────────────────────────────────────────────
function TB({
  active,
  onClick,
  icon,
  label,
  isFavorited,
  onStarClick,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isFavorited?: boolean;
  onStarClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative group select-none">
      <button onClick={onClick}
        className={`p-2 rounded-lg transition-all active:scale-90 cursor-pointer ${
          active ? "bg-white/[0.10] text-white shadow-md " : "text-white/35 hover:text-white hover:bg-white/[0.06]"
        }`} title={label}>
        {icon}
      </button>
      {onStarClick && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStarClick(e);
          }}
          className={`absolute -top-1 -right-1 p-0.5 rounded-full bg-black/80 border border-white/[0.10] hover:scale-110 active:scale-90 transition-all cursor-pointer z-30 ${
            isFavorited
              ? "opacity-100 text-white/70"
              : "opacity-0 group-hover:opacity-100 group-hover/panel:opacity-100 text-white/30 hover:text-white/70"
          }`}
          title={isFavorited ? "Remove from Favorites" : "Add to Favorites"}
        >
          <Star className={`w-2.5 h-2.5 ${isFavorited ? "fill-white/70" : ""}`} />
        </button>
      )}
      <span className="absolute left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 border border-white/[0.08] text-[9px] font-bold text-white/70 px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

// ── Separator ──────────────────────────────────────────────────────────────────
function Sep() {
  return <div className="w-6 h-px bg-white/[0.08] my-1.5 shrink-0" />;
}

// ── Favorites Helpers ─────────────────────────────────────────────────────────
function getToolIcon(tool: DrawingType) {
  switch (tool) {
    case "trendline": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="2" y1="13.5" x2="14" y2="2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="2" cy="13.5" r="1.4" fill="currentColor"/><circle cx="14" cy="2.5" r="1.4" fill="currentColor"/></svg>;
    case "ray": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="2.5" cy="11" r="1.3" fill="currentColor"/><line x1="3.7" y1="10.4" x2="11" y2="5.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 5.5L14 3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1.8 1.5" strokeOpacity="0.6"/></svg>;
    case "hline": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="1.5" y1="5.5" x2="1.5" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/><line x1="14.5" y1="5.5" x2="14.5" y2="10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/></svg>;
    case "vline": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><line x1="5.5" y1="1.5" x2="10.5" y2="1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/><line x1="5.5" y1="14.5" x2="10.5" y2="14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45"/></svg>;
    case "arrow": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="3.5" y1="12.5" x2="12" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M7 4H12V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "rectangle": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="4.5" width="12" height="7" stroke="currentColor" strokeWidth="1.4"/></svg>;
    case "circle": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><ellipse cx="8" cy="8" rx="5.5" ry="4" stroke="currentColor" strokeWidth="1.4"/></svg>;
    case "triangle": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
    case "channel": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 5L14 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M2 9.5L14 14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.5"/></svg>;
    case "fib": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.65"/><line x1="2" y1="9.5" x2="14" y2="9.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeOpacity="0.45"/><line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeOpacity="0.3"/></svg>;
    case "long": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3.5" width="9" height="5" stroke="#10b981" strokeWidth="1.1" fill="rgba(16,185,129,0.15)"/><rect x="2" y="8.5" width="9" height="4" stroke="#ef4444" strokeWidth="1.1" fill="rgba(239,68,68,0.1)"/><path d="M13 6.5L13 2M11.5 3.5L13 2L14.5 3.5" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "short": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3.5" width="9" height="4" stroke="#10b981" strokeWidth="1.1" fill="rgba(16,185,129,0.1)"/><rect x="2" y="7.5" width="9" height="5" stroke="#ef4444" strokeWidth="1.1" fill="rgba(239,68,68,0.15)"/><path d="M13 9.5L13 14M11.5 12.5L13 14L14.5 12.5" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
    case "patterns": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 12L5 4.5L8.5 9L11.5 3L14 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="2" cy="12" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="5" cy="4.5" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="8.5" cy="9" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="11.5" cy="3" r="1" fill="currentColor" fillOpacity="0.7"/><circle cx="14" cy="7" r="1" fill="currentColor" fillOpacity="0.7"/></svg>;
    case "text": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 4H12.5M8 4V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M5.5 13H10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/></svg>;
    case "brush": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 12Q6 8 9 9Q12 10 14 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.18"/><path d="M3 12Q6 8 9 9Q12 10 14 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
    case "ruler": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="5.5" width="13" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><line x1="4" y1="5.5" x2="4" y2="8" stroke="currentColor" strokeWidth="1"/><line x1="6.5" y1="5.5" x2="6.5" y2="9.5" stroke="currentColor" strokeWidth="1"/><line x1="9" y1="5.5" x2="9" y2="8" stroke="currentColor" strokeWidth="1"/><line x1="11.5" y1="5.5" x2="11.5" y2="9.5" stroke="currentColor" strokeWidth="1"/></svg>;
    case "smiley": return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 9.5Q8 11.5 10.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6.2" cy="7" r="0.9" fill="currentColor"/><circle cx="9.8" cy="7" r="0.9" fill="currentColor"/></svg>;
    default: return null;
  }
}

function getToolLabel(tool: DrawingType) {
  switch (tool) {
    case "trendline": return "Trend Line";
    case "ray": return "Ray";
    case "hline": return "Horizontal Line";
    case "vline": return "Vertical Line";
    case "arrow": return "Arrow";
    case "rectangle": return "Rectangle";
    case "circle": return "Circle";
    case "triangle": return "Triangle";
    case "channel": return "Parallel Channel";
    case "fib": return "Fibonacci Retracement";
    case "long": return "Long Position";
    case "short": return "Short Position";
    case "patterns": return "Harmonic XABCD Pattern";
    case "text": return "Text Annotation";
    case "brush": return "Highlighter Brush";
    case "ruler": return "Ruler";
    case "smiley": return "Emoji Marker";
    default: return "";
  }
}
