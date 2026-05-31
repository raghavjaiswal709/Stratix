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
  Layers, TrendingUp,
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

const CHART_BG = "#0c0e14";
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

    const up = settings.upColor || "#2563eb";
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
        `O <b style="color:#2563eb">${cData.open.toFixed(3)}</b>  ` +
        `H <b style="color:#2563eb">${cData.high.toFixed(3)}</b>  ` +
        `L <b style="color:#ef4444">${cData.low.toFixed(3)}</b>  ` +
        `C <b style="color:#2563eb">${cData.close.toFixed(3)}</b>`,
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

  // Redraw on scroll/zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = () => setRedrawTrigger(t => t + 1);
    container.addEventListener("mousemove", handler, { passive: true });
    container.addEventListener("wheel", handler, { passive: true });
    return () => {
      container.removeEventListener("mousemove", handler);
      container.removeEventListener("wheel", handler);
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
        setTextOverlay(null);
        if (!activeDrawingRef.current) setActiveTool("cursor");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Delete key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedDrawingId) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") handleDeleteDrawing(selectedDrawingId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDrawingId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (activeTool === "cursor" || isLocked) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedDrawingId(null);

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
    const up        = settings.upColor || "#2563eb";
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
      markers.push({ time: candles[replayStartIndex].time as Time, position: "belowBar", color: "#2563eb", shape: "arrowUp", text: "START" });
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

  // ── Event forwarding from SVG overlay to chart canvas ────────────────────
  // The SVG is a DOM sibling of the chart host div, so wheel/mousemove events
  // on drawings bubble to the wrapper — NOT to the chart canvas. We re-dispatch
  // them directly so lightweight-charts always receives scroll and crosshair input.
  const getChartCanvas = useCallback(
    () => containerRef.current?.querySelector('canvas') ?? null,
    [],
  );

  const forwardWheelToChart = useCallback((e: React.WheelEvent) => {
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
    const isSelected = selectedDrawingId === draw.id;
    const isPreview  = draw.id === previewDrawing?.id;
    const stroke     = isSelected ? SEL_COLOR : LINE_COLOR;
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
      key: draw.id,
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
        <g {...groupProps}>
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
        <g {...groupProps}>
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
        <g {...groupProps}>
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
        <g {...groupProps}>
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
        <g {...groupProps}>
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
        <g {...groupProps}>
          <rect x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5}
            fill={isSelected ? "rgba(234,179,8,0.08)" : "rgba(59,130,246,0.05)"} strokeDasharray={dashArray} />
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
        <g {...groupProps}>
          <ellipse cx={p1.x} cy={p1.y} rx={rx || 1} ry={ry || 1} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5}
            fill={isSelected ? "rgba(234,179,8,0.08)" : "rgba(59,130,246,0.05)"} strokeDasharray={dashArray} />
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
        <g {...groupProps}>
          <polygon points={pts} stroke={stroke} strokeWidth={isSelected ? 2.5 : 1.5}
            fill={isSelected ? "rgba(234,179,8,0.08)" : "rgba(59,130,246,0.05)"} strokeDasharray={dashArray} />
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
        <g {...groupProps}>
          {/* First line */}
          <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={stroke} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dashArray} />
          {/* Second parallel line */}
          <line x1={c1.x} y1={c1.y + dy} x2={c2.x} y2={c2.y + dy} stroke={stroke} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dashArray} />
          {/* Fill */}
          <polygon
            points={`${c1.x},${c1.y} ${c2.x},${c2.y} ${c2.x},${c2.y + dy} ${c1.x},${c1.y + dy}`}
            fill={isSelected ? "rgba(234,179,8,0.06)" : "rgba(59,130,246,0.04)"} stroke="none"
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
        <g {...groupProps}>
          <path d={d} fill="none" stroke="transparent" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={isSelected ? "rgba(234,179,8,0.55)" : "rgba(59,130,246,0.28)"} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }

    // ── Text Annotation ───────────────────────────────────────────────────
    if (draw.type === "text") {
      if (!p1) return null;
      const label = draw.text || "Text";
      const fw    = label.length * 6.5 + 12;
      return (
        <g {...groupProps}>
          <rect x={p1.x - 4} y={p1.y - 15} width={fw} height={19} rx={4} fill={CHART_BG} stroke={isSelected ? SEL_COLOR : "#23262f"} strokeWidth={isSelected ? 1.5 : 1} />
          <text x={p1.x + 2} y={p1.y - 2} fill={isSelected ? SEL_COLOR : LINE_COLOR} fontSize={9} fontFamily="monospace" fontWeight="bold">{label}</text>
          {isSelected && makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}
        </g>
      );
    }

    // ── Smiley / Emoji ────────────────────────────────────────────────────
    if (draw.type === "smiley") {
      if (!p1) return null;
      return (
        <g {...groupProps}>
          {isSelected && <circle cx={p1.x} cy={p1.y} r={14} fill="rgba(234,179,8,0.18)" stroke={SEL_COLOR} strokeWidth={1} />}
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
        <g {...groupProps}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={12} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? SEL_COLOR : "#f59e0b"} strokeWidth={isSelected ? 2.5 : 1.5} strokeDasharray="4 3" />
          <rect x={bx} y={by} width={108} height={17} rx={4} fill={isSelected ? SEL_COLOR : "#f59e0b"} />
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
        <g {...groupProps}>
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
                <line x1={0} y1={y} x2={svgW} y2={y} stroke={isSelected ? "rgba(234,179,8,0.4)" : "rgba(59,130,246,0.22)"} strokeWidth={isSelected ? 1.5 : 1} />
                <text x={p1.x + 8} y={y - 3} fill={isSelected ? SEL_COLOR : TEXT_COLOR} fontSize={8} fontFamily="monospace">
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
        <g {...groupProps}>
          <polygon points={`${pX.x},${pX.y} ${pA.x},${pA.y} ${pB.x},${pB.y}`}
            stroke={isSelected ? SEL_COLOR : "#8b5cf6"} strokeWidth={isSelected ? 2 : 1.5}
            fill={isSelected ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)"} />
          <polygon points={`${pB.x},${pB.y} ${pC.x},${pC.y} ${pD.x},${pD.y}`}
            stroke={isSelected ? SEL_COLOR : "#8b5cf6"} strokeWidth={isSelected ? 2 : 1.5}
            fill={isSelected ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)"} />
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
        <g {...groupProps}>
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
      <div className="w-11 border-r border-[#23262f] flex flex-col items-center py-2 gap-0 shrink-0 z-20 select-none overflow-y-auto"
        style={{ backgroundColor: settings.bgColor || "#0f0f0f" }}>

        {/* Cursor */}
        <TB active={activeTool === "cursor"} onClick={() => setActiveTool("cursor")} icon={<MousePointer className="w-4 h-4" />} label="Crosshair / Cursor" />

        <Sep />

        {/* Lines group */}
        <TB active={activeTool === "trendline"} onClick={() => setActiveTool("trendline")} icon={<Slash className="w-4 h-4" />} label="Trend Line" />
        <TB active={activeTool === "ray"} onClick={() => setActiveTool("ray")} icon={<ArrowRight className="w-4 h-4" />} label="Ray (extends right)" />
        <TB active={activeTool === "hline"} onClick={() => setActiveTool("hline")} icon={<Minus className="w-4 h-4" />} label="Horizontal Line" />
        <TB active={activeTool === "vline"} onClick={() => setActiveTool("vline")}
          icon={<span className="inline-block rotate-90"><Minus className="w-4 h-4" /></span>} label="Vertical Line" />
        <TB active={activeTool === "arrow"} onClick={() => setActiveTool("arrow")} icon={<ArrowUpRight className="w-4 h-4" />} label="Arrow" />

        <Sep />

        {/* Shapes group */}
        <TB active={activeTool === "rectangle"} onClick={() => setActiveTool("rectangle")} icon={<Square className="w-4 h-4" />} label="Rectangle" />
        <TB active={activeTool === "circle"} onClick={() => setActiveTool("circle")} icon={<Circle className="w-4 h-4" />} label="Circle / Ellipse" />
        <TB active={activeTool === "triangle"} onClick={() => setActiveTool("triangle")} icon={<Triangle className="w-4 h-4" />} label="Triangle (3 clicks)" />
        <TB active={activeTool === "channel"} onClick={() => setActiveTool("channel")} icon={<Layers className="w-4 h-4" />} label="Parallel Channel (3 clicks)" />

        <Sep />

        {/* Fib */}
        <TB active={activeTool === "fib"} onClick={() => setActiveTool("fib")} icon={<Grid className="w-4 h-4" />} label="Fibonacci Retracement" />

        <Sep />

        {/* Risk positions */}
        <TB active={activeTool === "long"} onClick={() => setActiveTool("long")}
          icon={<TrendingUp className="w-4 h-4 text-green-500" />} label="Long Position (Risk/Reward)" />
        <TB active={activeTool === "short"} onClick={() => setActiveTool("short")}
          icon={<TrendingUp className="w-4 h-4 text-red-500 rotate-180 scale-x-[-1]" />} label="Short Position (Risk/Reward)" />
        <TB active={activeTool === "patterns"} onClick={() => setActiveTool("patterns")}
          icon={<Workflow className="w-4 h-4 text-[#8b5cf6]" />} label="Harmonic XABCD Pattern" />

        <Sep />

        {/* Annotations */}
        <TB active={activeTool === "text"} onClick={() => setActiveTool("text")} icon={<Type className="w-4 h-4" />} label="Text Annotation" />
        <TB active={activeTool === "brush"} onClick={() => setActiveTool("brush")} icon={<Paintbrush className="w-4 h-4" />} label="Highlighter Brush" />
        <TB active={activeTool === "ruler"} onClick={() => setActiveTool("ruler")} icon={<Ruler className="w-4 h-4 text-amber-500" />} label="Ruler (Pips & Bars)" />
        <TB active={activeTool === "smiley"} onClick={() => setActiveTool("smiley")} icon={<Smile className="w-4 h-4 text-yellow-500" />} label="Emoji Marker" />

        <Sep />

        {/* Utilities */}
        <TB active={false} onClick={() => chartRef.current?.timeScale().fitContent()}
          icon={<Search className="w-4 h-4" />} label="Fit / Reset Zoom" />
        <TB active={settings.isMagnetActive} onClick={() => onSettingsChange({ isMagnetActive: !settings.isMagnetActive })}
          icon={<Magnet className={`w-4 h-4 ${settings.isMagnetActive ? "text-blue-400" : ""}`} />} label="Magnet Mode (snap OHLC)" />
        <TB active={stayInDrawingMode} onClick={() => setStayInDrawingMode(p => !p)}
          icon={<PenTool className={`w-4 h-4 ${stayInDrawingMode ? "text-blue-400" : ""}`} />} label="Stay in Drawing Mode" />
        <TB active={isLocked} onClick={() => setIsLocked(p => !p)}
          icon={isLocked ? <Lock className="w-4 h-4 text-red-400" /> : <Unlock className="w-4 h-4" />} label={isLocked ? "Unlock Drawings" : "Lock Drawings"} />
        <TB active={areDrawingsHidden} onClick={() => setAreDrawingsHidden(p => !p)}
          icon={areDrawingsHidden ? <EyeOff className="w-4 h-4 text-yellow-500" /> : <Eye className="w-4 h-4" />} label={areDrawingsHidden ? "Show Drawings" : "Hide Drawings"} />

        <Sep />

        <button onClick={handleClearAllDrawings}
          className="p-2 rounded-lg text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-90 cursor-pointer"
          title="Clear All Drawings">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* ── Chart area ── */}
      <div className="flex-1 min-w-0 h-full relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* ── SVG Drawing Overlay ── */}
        {!areDrawingsHidden && (
          <svg
            className={`absolute inset-0 w-full h-full z-10 ${
              activeTool !== "cursor" || isClickCreating || !!multiCreating
                ? "pointer-events-auto"
                : "pointer-events-none"
            }`}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={(e) => { handleSvgMouseMove(e); forwardMouseMoveToChart(e); }}
            onMouseUp={handleSvgMouseUp}
            onWheel={forwardWheelToChart}
          >
            {allDrawings.map(draw => renderDrawing(draw))}
          </svg>
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
              className="bg-[#141720] border border-[#eab308] rounded px-2 py-1 text-white text-xs font-mono focus:outline-none w-36 shadow-lg"
            />
            <button onClick={() => textOverlay.onSubmit(textInputVal)} className="p-1 bg-blue-600 rounded text-white text-xs">✓</button>
            <button onClick={() => { setTextOverlay(null); setTextInputVal(""); }} className="p-1 bg-[#23262f] rounded text-gray-400 text-xs">✗</button>
          </div>
        )}

        {/* ── Multi-point hint ── */}
        {multiCreating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#141720] border border-[#eab308] rounded-lg px-3 py-1.5 text-[10px] font-mono text-yellow-400 pointer-events-none">
            {multiCreating.points.length === 1
              ? `Click to set 2nd point (${multiCreating.type})`
              : `Click to set 3rd point and finalize`}
          </div>
        )}

        {/* ── Replay / Live badge ── */}
        {replayIndex == null && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[9px] font-bold bg-[#141720] border border-[#23262f] rounded px-2 py-1 select-none font-mono z-20">
            {liveStatus === "live" && <><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-green-500 tracking-wider">LIVE FEED</span></>}
            {liveStatus === "reconnecting" && <><span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" /><span className="text-yellow-500 tracking-wider">RECONNECTING</span></>}
            {liveStatus === "stopped" && <span className="text-gray-500 tracking-wider">REPLAY DOCKED</span>}
          </div>
        )}

        {/* ── Open trade P&L ── */}
        {openTrade && (
          <div className="absolute top-3 left-3 bg-[#141720]/90 border border-[#23262f] rounded-lg px-3 py-2 text-[10px] font-mono z-20 flex items-center gap-2">
            <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${openTrade.direction === "LONG" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {openTrade.direction}
            </span>
            <span className="text-gray-500">Entry <b className="text-white">{openTrade.entryPrice.toFixed(3)}</b></span>
            <span className="w-px h-3 bg-[#23262f]" />
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
          return (
            <div className="absolute z-30 flex items-center bg-[#141720] border border-[#eab308] rounded-lg px-2.5 py-1.5 shadow-xl gap-2 select-none font-mono text-[9px]"
              style={{ left: `${Math.max(10, xy.x - 40)}px`, top: `${Math.max(10, xy.y - 45)}px`, transform: "translateY(-50%)" }}>
              <span className="font-bold text-[#eab308] uppercase tracking-wider">{sel.type}</span>
              <div className="w-px h-3.5 bg-[#23262f]" />
              <button onClick={e => { e.stopPropagation(); handleDeleteDrawing(selectedDrawingId); }}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex items-center cursor-pointer" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })()}

        {/* ── Bottom-right controls ── */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-[#141720] border border-[#23262f] rounded-lg p-1 z-20 select-none font-mono text-[9px]">
          <button
            onClick={() => onSettingsChange({ isYAxisLocked: !settings.isYAxisLocked })}
            className={`px-2 py-1 rounded font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer border ${
              settings.isYAxisLocked ? "bg-[#eab308]/15 border-[#eab308]/30 text-[#eab308]" : "bg-[#2563eb]/10 border-[#2563eb]/20 text-[#2563eb] hover:bg-[#2563eb]/20"
            }`} title={settings.isYAxisLocked ? "Y-Axis LOCKED" : "Y-Axis AUTO"}>
            {settings.isYAxisLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>{settings.isYAxisLocked ? "LOCKED SCALE" : "AUTO SCALE"}</span>
          </button>
          <div className="w-px h-4 bg-[#23262f]" />
          <button onClick={() => setIsSettingsModalOpen(true)}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-[#1c1e26] transition-all active:scale-90 cursor-pointer flex items-center"
            title="Chart Settings">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Settings Modal ── */}
        {isSettingsModalOpen && (
          <div className="absolute inset-0 bg-[#06080c]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsSettingsModalOpen(false)}>
            <div className="w-full max-w-md bg-[#0c0e14] border border-[#23262f] rounded-xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[#23262f] flex items-center justify-between bg-[#141720]">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-500" />
                  <span className="font-bold text-white text-sm tracking-tight font-mono">CHART SETTINGS</span>
                </div>
                <button onClick={() => setIsSettingsModalOpen(false)} className="p-1.5 rounded-lg hover:bg-[#1c1e26] text-gray-500 hover:text-white transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 flex flex-col gap-5 text-xs font-mono">
                <div className="flex flex-col gap-2">
                  <label className="text-gray-500 uppercase tracking-widest font-semibold text-[9px]">Candlestick Theme</label>
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
                    className="w-full bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 cursor-pointer">
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
                      <label className="text-gray-500 uppercase tracking-widest font-semibold text-[9px]">{label}</label>
                      <div className="flex items-center gap-2 bg-[#141720] border border-[#23262f] rounded-lg px-3 py-1.5">
                        <input type="color" value={settings[key]} onChange={e => onSettingsChange({ [key]: e.target.value, themeName: "Custom" })} className="w-6 h-6 border-0 bg-transparent cursor-pointer shrink-0 rounded" />
                        <input type="text" value={settings[key]} onChange={e => onSettingsChange({ [key]: e.target.value, themeName: "Custom" })} className="bg-transparent border-0 text-white w-full text-center focus:outline-none uppercase font-bold" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-gray-500 uppercase tracking-widest font-semibold text-[9px]">Canvas Background</label>
                  <div className="flex items-center gap-2 bg-[#141720] border border-[#23262f] rounded-lg px-3 py-1.5">
                    <input type="color" value={settings.bgColor || "#0f0f0f"} onChange={e => onSettingsChange({ bgColor: e.target.value })} className="w-6 h-6 border-0 bg-transparent cursor-pointer shrink-0 rounded" />
                    <input type="text" value={settings.bgColor || "#0f0f0f"} onChange={e => onSettingsChange({ bgColor: e.target.value })} className="bg-transparent border-0 text-white w-20 text-center focus:outline-none uppercase font-bold" />
                    <div className="flex gap-1.5 ml-auto">
                      {["#0f0f0f", "#0c0e14", "#141720", "#000000"].map(bg => (
                        <button key={bg} type="button" onClick={() => onSettingsChange({ bgColor: bg })}
                          className="w-4 h-4 rounded-full border border-[#23262f] cursor-pointer hover:scale-110 transition-all"
                          style={{ backgroundColor: bg }} title={bg} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="w-full h-px bg-[#23262f]" />

                {[
                  { label: "Show Grid Lines", desc: "Vertical & horizontal grid lines", key: "showGrid" as const, color: "blue" },
                  { label: "Show Volume",     desc: "Volume histogram at bottom",        key: "showVolume" as const, color: "blue" },
                  { label: "Lock Y-Axis",     desc: "Fix price scale for free panning",  key: "isYAxisLocked" as const, color: "yellow" },
                  { label: "Magnet Mode",     desc: "Snap drawings to OHLC levels",      key: "isMagnetActive" as const, color: "blue" },
                ].map(({ label, desc, key, color }) => (
                  <div key={key} className="flex items-center justify-between bg-[#141720]/30 rounded-lg px-3.5 py-2.5 border border-[#23262f]/60 hover:bg-[#141720]/60 transition-colors">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white font-bold tracking-tight">{label}</span>
                      <span className="text-[9px] text-gray-500">{desc}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input type="checkbox" checked={settings[key]} onChange={e => onSettingsChange({ [key]: e.target.checked })} className="sr-only peer" />
                      <div className={`w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${color === "yellow" ? "peer-checked:bg-yellow-500" : "peer-checked:bg-blue-600"} peer-checked:after:bg-white`} />
                    </label>
                  </div>
                ))}
              </div>

              <div className="px-5 py-3 border-t border-[#23262f] bg-[#141720] flex justify-end">
                <button onClick={() => setIsSettingsModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold font-mono text-xs transition-all active:scale-95 cursor-pointer">
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
function TB({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <div className="relative group select-none">
      <button onClick={onClick}
        className={`p-2 rounded-lg transition-all active:scale-90 cursor-pointer ${
          active ? "bg-[#2563eb] text-white shadow-md shadow-blue-900/20" : "text-gray-500 hover:text-white hover:bg-[#1c1e26]"
        }`} title={label}>
        {icon}
      </button>
      <span className="absolute left-12 top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black border border-[#23262f] text-[9px] font-bold text-gray-200 px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

// ── Separator ──────────────────────────────────────────────────────────────────
function Sep() {
  return <div className="w-6 h-px bg-[#23262f] my-1.5 shrink-0" />;
}
