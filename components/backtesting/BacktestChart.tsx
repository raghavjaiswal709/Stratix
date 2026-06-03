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
import type { Candle, ManualTrade, LiveStatus, Drawing, DrawingType, TimePricePoint, DraftOrder } from "./types";
import { getLotSpec, calcPnl } from "./lotSpecs";
import {
  Trash2, Search,
  Magnet, Lock, Unlock, Eye, EyeOff, PenTool,
  Settings, X, Star, GripVertical,
  TrendingUp, BarChart2, Clock,
  ChevronDown, ChevronUp, Minus, Plus as PlusIcon,
  Activity, Layers,
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
  onUpdateOpenTrade?:  (updates: Partial<ManualTrade>) => void;
  liveCandle:          Candle | null;
  liveStatus:          LiveStatus;
  isInReplay:          boolean;
  onBuy:               () => void;
  onSell:              () => void;
  onRRDrawingSelect?:  (drawing: Drawing | null) => void;
  // Draft trade ticket (Buy/Sell button preview)
  draftOrder?:         DraftOrder | null;
  onDraftOrderChange?: (updates: Partial<DraftOrder>) => void;
  onConfirmDraft?:     () => void;
  onDiscardDraft?:     () => void;
  onFlipDraft?:        () => void;
  drawings:            Drawing[];
  onDrawingsChange:    (drawings: Drawing[]) => void;
  symbol?:             string;
  timeframe?:          string;
  lotSize?:            number;
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
    drawingTemplates?: {
      id: string;
      name: string;
      type: string;
      color: string;
      strokeWidth?: number;
      fillOpacity?: number;
      text?: string;
      textColor?: string;
      textPosition?: string;
      fontSize?: number;
    }[];
  };
  onSettingsChange: (settings: Partial<Props["settings"]>) => void;
}

// How many points each tool needs before it finalizes
const TOOL_POINTS: Partial<Record<DrawingType, number>> = {
  hline: 1, vline: 1, smiley: 1,
  trendline: 2, ray: 2, arrow: 2, rectangle: 2, circle: 2, fib: 2,
  long: 2, short: 2, ruler: 2, text: 1,
  channel: 3, triangle: 3, patterns: 5,
};

const CHART_BG = "#0f0f0f";
const GRID_COLOR = "#181a20";
const TEXT_COLOR = "#5e6673";
const SEL_COLOR = "rgba(255,255,255,0.80)";
const LINE_COLOR = "#10b981";

const formatPrice = (p: number, minPrice: number) => {
  if (minPrice < 0.001) return p.toFixed(8);
  if (minPrice < 0.01) return p.toFixed(7);
  if (minPrice < 0.1) return p.toFixed(6);
  if (minPrice < 1) return p.toFixed(5);
  if (minPrice < 10) return p.toFixed(4);
  if (minPrice < 100) return p.toFixed(3);
  return p.toFixed(2);
};

export function BacktestChart({
  candles, replayIndex, replayStartIndex, isSelectingStart,
  onStartBarSelect, manualTrades, openTrade, openTradeUnrealised, onUpdateOpenTrade,
  liveCandle, liveStatus, isInReplay, drawings, onDrawingsChange, settings, onSettingsChange,
  onBuy, onSell, onRRDrawingSelect,
  draftOrder, onDraftOrderChange, onConfirmDraft, onDiscardDraft, onFlipDraft,
  symbol, lotSize = 0.01,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeriesRef    = useRef<ISeriesApi<"Histogram"> | null>(null);
  const minPriceRef     = useRef<number>(1.0);

  const [activeTool, setActiveTool]           = useState<DrawingType>("cursor");
  const [previewDrawing, setPreviewDrawing]   = useState<Drawing | null>(null);
  const activeDrawingRef                       = useRef<Drawing | null>(null);
  const [redrawTrigger, setRedrawTrigger]     = useState(0);
  const lastRenderedIdxRef                     = useRef<number | null>(null);

  const [selectedDrawingId, setSelectedDrawingId]   = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [draggingAnchor, setDraggingAnchor]         = useState<{ drawingId: string; pointIndex: number } | null>(null);
  const isDraggingDrawingRef                         = useRef(false);

  // Price scale margins — ref-only (no React state) for stable, flicker-free zoom
  const marginsRef = useRef({ top: 0.20, bottom: 0.10 });
  // Whether Y-axis lock is active — needs a ref so the wheel handler (created once) stays current
  const isYLockedRef = useRef(settings.isYAxisLocked);
  useEffect(() => { isYLockedRef.current = settings.isYAxisLocked; }, [settings.isYAxisLocked]);

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

  // ── Undo / Redo history ───────────────────────────────────────────────────
  // Each entry is a snapshot of localDrawings BEFORE the change.
  const undoStack = useRef<Drawing[][]>([]);
  const redoStack = useRef<Drawing[][]>([]);

  // Wrap onDrawingsChange so every external change is preceded by a history push.
  const commitDrawings = useCallback((next: Drawing[]) => {
    undoStack.current.push([...localDrawingsRef.current]);
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];               // new action clears redo future
    onDrawingsChange(next);
  }, [onDrawingsChange]);

  const [stayInDrawingMode, setStayInDrawingMode] = useState(false);
  const [isLocked, setIsLocked]                   = useState(false);
  const [areDrawingsHidden, setAreDrawingsHidden] = useState(false);
  const [showTradeMarkers, setShowTradeMarkers]   = useState(false);

  // Ref for rrDrawingSelect (avoid stale closure in effects)
  const onRRDrawingSelectRef = useRef(onRRDrawingSelect);
  useEffect(() => { onRRDrawingSelectRef.current = onRRDrawingSelect; }, [onRRDrawingSelect]);

  // ── Indicator Panel ────────────────────────────────────────────────────────
  const [indicatorPanelOpen, setIndicatorPanelOpen] = useState(false);
  const [indicatorCfg, setIndicatorCfg] = useState({
    sma:  { active: false, period: 20, color: "#f59e0b" },
    sma2: { active: false, period: 50, color: "#ec4899" },
    ema:  { active: false, period: 9,  color: "#10b981" },
    ema2: { active: false, period: 21, color: "#14b8a6" },
    bb:   { active: false, period: 20, stddev: 2, color: "#a3a3a3" },
    vwap: { active: false, color: "#f97316" },
    rsi:  { active: false, period: 14 },
  });
  // Refs for indicator series
  const smaSeriesRef  = useRef<ISeriesApi<"Line"> | null>(null);
  const sma2SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSeriesRef  = useRef<ISeriesApi<"Line"> | null>(null);
  const ema2SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef   = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef  = useRef<ISeriesApi<"Line"> | null>(null);

  // ── Sessions Indicator ────────────────────────────────────────────────────
  const [sessionsGlobalActive, setSessionsGlobalActive] = useState(false);
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(false);
  const [sessionsCfg, setSessionsCfg] = useState({
    asian:  { active: true, color: "#22d3ee", opacity: 0.0, startH: 5, startM: 30, endH: 9, endM: 30 },
    london: { active: true, color: "#f59e0b", opacity: 0.0, startH: 11, startM: 30, endH: 14, endM: 30 },
    ny:     { active: true, color: "#c084fc", opacity: 0.0, startH: 16, startM: 30, endH: 21, endM: 30 },
  });

  // ── Hover X position for the "select start" vertical guide line ──────────
  const [selectHoverX, setSelectHoverX] = useState<number | null>(null);

  // ── Rectangle edge handle dragging (constrained to one axis) ─────────────
  const [draggingEdge, setDraggingEdge] = useState<{
    drawingId: string; pointIndex: number; axis: "x" | "y";
  } | null>(null);
  const draggingEdgeRef = useRef<typeof draggingEdge>(null);
  useEffect(() => { draggingEdgeRef.current = draggingEdge; }, [draggingEdge]);

  // ── Long/Short RR 8-handle resize ────────────────────────────────────────
  const [draggingRRHandle, setDraggingRRHandle] = useState<{
    drawingId: string;
    moveTime0: boolean;    // shift left edge time (pts[0].time)
    moveTime3: boolean;    // shift right edge time (pts[3].time)
    movePriceIndices: number[]; // price indices to shift (y axis)
    startPts: TimePricePoint[];
    startMouseTime: number;
    startMousePrice: number;
    startBarWidth: number;
  } | null>(null);
  const draggingRRHandleRef = useRef<typeof draggingRRHandle>(null);
  useEffect(() => { draggingRRHandleRef.current = draggingRRHandle; }, [draggingRRHandle]);

  // ── Open Trade TP/SL drag ────────────────────────────────────────────────
  const [draggingOpenTradeLine, setDraggingOpenTradeLine] = useState<{
    type: "tp" | "sl";
    startMousePrice: number;
    startValue: number;
  } | null>(null);
  const draggingOpenTradeLineRef = useRef<typeof draggingOpenTradeLine>(null);
  useEffect(() => { draggingOpenTradeLineRef.current = draggingOpenTradeLine; }, [draggingOpenTradeLine]);

  // ── Draft order line drag (entry/tp/sl) ──────────────────────────────────
  const [draggingDraftLine, setDraggingDraftLine] = useState<{
    type: "entry" | "tp" | "sl";
    startMousePrice: number;
    startValue: number;
  } | null>(null);
  const draggingDraftLineRef = useRef<typeof draggingDraftLine>(null);
  useEffect(() => { draggingDraftLineRef.current = draggingDraftLine; }, [draggingDraftLine]);
  const draftOrderRef = useRef<DraftOrder | null>(null);
  useEffect(() => { draftOrderRef.current = draftOrder ?? null; }, [draftOrder]);
  const onDraftOrderChangeRef = useRef(onDraftOrderChange);
  useEffect(() => { onDraftOrderChangeRef.current = onDraftOrderChange; }, [onDraftOrderChange]);

  // ── Emit selected/previewed long-short drawing to side panel ─────────────
  useEffect(() => {
    const emit = onRRDrawingSelectRef.current;
    if (!emit) return;
    // While actively creating a long/short tool
    if ((activeTool === "long" || activeTool === "short") && previewDrawing) {
      emit(previewDrawing); return;
    }
    // An existing long/short drawing is selected
    if (selectedDrawingId) {
      const found = localDrawings.find(d => d.id === selectedDrawingId);
      if (found && (found.type === "long" || found.type === "short")) {
        emit(found); return;
      }
    }
    emit(null);
  }); // intentionally runs on every render — cheap and always correct

  // ── Indicator math helpers ────────────────────────────────────────────────
  const calcSMA = (cs: Candle[], p: number) => {
    if (cs.length < p) return [] as {time: number; value: number}[];
    const out: {time:number;value:number}[] = [];
    let sum = 0;
    for (let i = 0; i < p; i++) sum += cs[i].close;
    out.push({ time: cs[p-1].time, value: +(sum/p).toFixed(8) });
    for (let i = p; i < cs.length; i++) {
      sum += cs[i].close - cs[i-p].close;
      out.push({ time: cs[i].time, value: +(sum/p).toFixed(8) });
    }
    return out;
  };

  const calcEMA = (cs: Candle[], p: number) => {
    if (cs.length < p) return [] as {time:number;value:number}[];
    const out: {time:number;value:number}[] = [];
    let sum = 0;
    for (let i = 0; i < p; i++) sum += cs[i].close;
    let ema = sum / p;
    const k = 2 / (p + 1);
    out.push({ time: cs[p-1].time, value: +ema.toFixed(8) });
    for (let i = p; i < cs.length; i++) {
      ema = cs[i].close * k + ema * (1 - k);
      out.push({ time: cs[i].time, value: +ema.toFixed(8) });
    }
    return out;
  };

  const calcBB = (cs: Candle[], p: number, dev: number) => {
    const upper: {time:number;value:number}[] = [];
    const middle: {time:number;value:number}[] = [];
    const lower: {time:number;value:number}[] = [];
    for (let i = p - 1; i < cs.length; i++) {
      let sum = 0;
      for (let j = i - p + 1; j <= i; j++) sum += cs[j].close;
      const sma = sum / p;
      let varSum = 0;
      for (let j = i - p + 1; j <= i; j++) varSum += Math.pow(cs[j].close - sma, 2);
      const sd = Math.sqrt(varSum / p) * dev;
      middle.push({ time: cs[i].time, value: +sma.toFixed(8) });
      upper.push({ time: cs[i].time, value: +(sma + sd).toFixed(8) });
      lower.push({ time: cs[i].time, value: +(sma - sd).toFixed(8) });
    }
    return { upper, middle, lower };
  };

  const calcVWAP = (cs: Candle[]) => {
    let cumTPV = 0, cumVol = 0;
    return cs.map(c => {
      const tp = (c.high + c.low + c.close) / 3;
      cumTPV += tp * c.volume; cumVol += c.volume;
      return { time: c.time, value: +(cumVol > 0 ? cumTPV / cumVol : tp).toFixed(8) };
    });
  };

  const calcRSI = (cs: Candle[], p: number) => {
    if (cs.length < p + 1) return [] as {time:number;value:number}[];
    const out: {time:number;value:number}[] = [];
    let gains = 0, losses = 0;
    for (let i = 1; i <= p; i++) {
      const d = cs[i].close - cs[i-1].close;
      if (d > 0) gains += d; else losses -= d;
    }
    let ag = gains / p, al = losses / p;
    out.push({ time: cs[p].time, value: +(al === 0 ? 100 : 100 - 100/(1 + ag/al)).toFixed(2) });
    for (let i = p + 1; i < cs.length; i++) {
      const d = cs[i].close - cs[i-1].close;
      ag = (ag * (p-1) + Math.max(0, d)) / p;
      al = (al * (p-1) + Math.max(0, -d)) / p;
      out.push({ time: cs[i].time, value: +(al === 0 ? 100 : 100 - 100/(1 + ag/al)).toFixed(2) });
    }
    return out;
  };

  // ── Indicator series management ───────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;

    const mkLine = (color: string, width: number, title: string, scaleId = "right") =>
      chart.addLineSeries({ color, lineWidth: width as any, title, priceScaleId: scaleId,
        lastValueVisible: true, priceLineVisible: false });

    // SMA
    if (indicatorCfg.sma.active) {
      if (!smaSeriesRef.current) smaSeriesRef.current = mkLine(indicatorCfg.sma.color, 1.5, `SMA(${indicatorCfg.sma.period})`);
      smaSeriesRef.current.applyOptions({ color: indicatorCfg.sma.color, title: `SMA(${indicatorCfg.sma.period})` });
      try { smaSeriesRef.current.setData(calcSMA(candles, indicatorCfg.sma.period) as any); } catch { /* noop */ }
    } else if (!indicatorCfg.sma.active && smaSeriesRef.current) {
      try { chart.removeSeries(smaSeriesRef.current); } catch { /* noop */ }
      smaSeriesRef.current = null;
    }

    // SMA2
    if (indicatorCfg.sma2.active) {
      if (!sma2SeriesRef.current) sma2SeriesRef.current = mkLine(indicatorCfg.sma2.color, 1.5, `SMA(${indicatorCfg.sma2.period})`);
      sma2SeriesRef.current.applyOptions({ color: indicatorCfg.sma2.color, title: `SMA(${indicatorCfg.sma2.period})` });
      try { sma2SeriesRef.current.setData(calcSMA(candles, indicatorCfg.sma2.period) as any); } catch { /* noop */ }
    } else if (!indicatorCfg.sma2.active && sma2SeriesRef.current) {
      try { chart.removeSeries(sma2SeriesRef.current); } catch { /* noop */ }
      sma2SeriesRef.current = null;
    }

    // EMA
    if (indicatorCfg.ema.active) {
      if (!emaSeriesRef.current) emaSeriesRef.current = mkLine(indicatorCfg.ema.color, 1.5, `EMA(${indicatorCfg.ema.period})`);
      emaSeriesRef.current.applyOptions({ color: indicatorCfg.ema.color, title: `EMA(${indicatorCfg.ema.period})` });
      try { emaSeriesRef.current.setData(calcEMA(candles, indicatorCfg.ema.period) as any); } catch { /* noop */ }
    } else if (!indicatorCfg.ema.active && emaSeriesRef.current) {
      try { chart.removeSeries(emaSeriesRef.current); } catch { /* noop */ }
      emaSeriesRef.current = null;
    }

    // EMA2
    if (indicatorCfg.ema2.active) {
      if (!ema2SeriesRef.current) ema2SeriesRef.current = mkLine(indicatorCfg.ema2.color, 1.5, `EMA(${indicatorCfg.ema2.period})`);
      ema2SeriesRef.current.applyOptions({ color: indicatorCfg.ema2.color, title: `EMA(${indicatorCfg.ema2.period})` });
      try { ema2SeriesRef.current.setData(calcEMA(candles, indicatorCfg.ema2.period) as any); } catch { /* noop */ }
    } else if (!indicatorCfg.ema2.active && ema2SeriesRef.current) {
      try { chart.removeSeries(ema2SeriesRef.current); } catch { /* noop */ }
      ema2SeriesRef.current = null;
    }

    // Bollinger Bands
    if (indicatorCfg.bb.active) {
      const { upper, middle, lower } = calcBB(candles, indicatorCfg.bb.period, indicatorCfg.bb.stddev);
      if (!bbUpperRef.current)  bbUpperRef.current  = mkLine(indicatorCfg.bb.color, 1, `BB Upper`);
      if (!bbMiddleRef.current) bbMiddleRef.current = mkLine(indicatorCfg.bb.color, 1.5, `BB Mid`);
      if (!bbLowerRef.current)  bbLowerRef.current  = mkLine(indicatorCfg.bb.color, 1, `BB Lower`);
      const col = indicatorCfg.bb.color;
      bbUpperRef.current.applyOptions({ color: col, title: `BB+${indicatorCfg.bb.stddev}σ` });
      bbMiddleRef.current.applyOptions({ color: col, title: `BB(${indicatorCfg.bb.period})` });
      bbLowerRef.current.applyOptions({ color: col, title: `BB-${indicatorCfg.bb.stddev}σ` });
      try {
        bbUpperRef.current.setData(upper as any);
        bbMiddleRef.current.setData(middle as any);
        bbLowerRef.current.setData(lower as any);
      } catch { /* noop */ }
    } else if (!indicatorCfg.bb.active) {
      [bbUpperRef, bbMiddleRef, bbLowerRef].forEach(r => {
        if (r.current) { try { chart.removeSeries(r.current); } catch { /* noop */ } r.current = null; }
      });
    }

    // VWAP
    if (indicatorCfg.vwap.active) {
      if (!vwapSeriesRef.current) vwapSeriesRef.current = mkLine(indicatorCfg.vwap.color, 1.5, "VWAP");
      vwapSeriesRef.current.applyOptions({ color: indicatorCfg.vwap.color });
      try { vwapSeriesRef.current.setData(calcVWAP(candles) as any); } catch { /* noop */ }
    } else if (!indicatorCfg.vwap.active && vwapSeriesRef.current) {
      try { chart.removeSeries(vwapSeriesRef.current); } catch { /* noop */ }
      vwapSeriesRef.current = null;
    }

    // RSI — separate price scale at bottom
    if (indicatorCfg.rsi.active) {
      if (!rsiSeriesRef.current) {
        rsiSeriesRef.current = chart.addLineSeries({
          color: "#f59e0b", lineWidth: 1.5 as any, title: `RSI(${indicatorCfg.rsi.period})`,
          priceScaleId: "rsi", lastValueVisible: true, priceLineVisible: false,
        });
        chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 }, autoScale: true });
      }
      rsiSeriesRef.current.applyOptions({ title: `RSI(${indicatorCfg.rsi.period})` });
      try { rsiSeriesRef.current.setData(calcRSI(candles, indicatorCfg.rsi.period) as any); } catch { /* noop */ }
    } else if (!indicatorCfg.rsi.active && rsiSeriesRef.current) {
      try { chart.removeSeries(rsiSeriesRef.current); } catch { /* noop */ }
      rsiSeriesRef.current = null;
    }
  }, [indicatorCfg, candles]); // eslint-disable-line react-hooks/exhaustive-deps

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
        timeVisible: true,
        secondsVisible: false,
        borderColor: GRID_COLOR,
        tickMarkFormatter: (time: Time, tickMarkType: number) => {
          const timestamp = typeof time === 'number' ? time : (time && (time as any).timestamp ? (time as any).timestamp : 0);
          if (!timestamp) return "";
          const d = new Date(timestamp * 1000);
          const options: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Kolkata' };
          if (tickMarkType === 0) { // Year
            options.year = 'numeric';
          } else if (tickMarkType === 1) { // Month
            options.month = 'short';
            options.year = 'numeric';
          } else if (tickMarkType === 2) { // Day
            options.day = 'numeric';
            options.month = 'short';
          } else { // Hour / Minute
            options.hour = '2-digit';
            options.minute = '2-digit';
            options.hour12 = false;
          }
          return d.toLocaleString('en-IN', options);
        }
      },
      rightPriceScale: { borderColor: GRID_COLOR },
      localization: {
        timeFormatter: (time: Time) => {
          const timestamp = typeof time === 'number' ? time : (time && (time as any).timestamp ? (time as any).timestamp : 0);
          if (!timestamp) return "";
          const d = new Date(timestamp * 1000);
          return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).replace(',', '');
        }
      }
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
      "background:rgba(0,0,0,0.85)", "border:1px solid rgba(255,255,255,0.08)",
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
        `<span style="color:#5e6673">${d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')} IST</span>`,
        `O <b style="color:rgba(255,255,255,0.85)">${formatPrice(cData.open, minPriceRef.current)}</b>  ` +
        `H <b style="color:rgba(255,255,255,0.85)">${formatPrice(cData.high, minPriceRef.current)}</b>  ` +
        `L <b style="color:#ef4444">${formatPrice(cData.low, minPriceRef.current)}</b>  ` +
        `C <b style="color:rgba(255,255,255,0.85)">${formatPrice(cData.close, minPriceRef.current)}</b>`,
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
    const cs = candleSeriesRef.current;
    if (!cs || candles.length === 0) return;

    const minPrice = candles.reduce((min, c) => c.close < min ? c.close : min, candles[0].close);
    minPriceRef.current = minPrice;

    let precision = 2;
    let minMove = 0.01;

    if (minPrice < 0.001) {
      precision = 8;
      minMove = 0.00000001;
    } else if (minPrice < 0.01) {
      precision = 7;
      minMove = 0.0000001;
    } else if (minPrice < 0.1) {
      precision = 6;
      minMove = 0.000001;
    } else if (minPrice < 1) {
      precision = 5;
      minMove = 0.00001;
    } else if (minPrice < 10) {
      precision = 4;
      minMove = 0.0001;
    } else if (minPrice < 100) {
      precision = 3;
      minMove = 0.001;
    }

    cs.applyOptions({
      priceFormat: {
        type: "price",
        precision: precision,
        minMove: minMove,
      },
    });
  }, [candles]);

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
    const chart = chartRef.current;
    if (!chart) return;
    if (!settings.isYAxisLocked) {
      // AUTO mode — reset to symmetric margins so bars are always centred, then
      // force lightweight-charts to re-compute the scale immediately.
      const def = { top: 0.10, bottom: 0.10 };
      marginsRef.current = def;
      // Toggle trick: off → on forces an immediate re-fit instead of waiting
      // for the next user interaction (which would leave the chart blank).
      chart.priceScale("right").applyOptions({ autoScale: false });
      chart.priceScale("right").applyOptions({ autoScale: true, scaleMargins: def });
      // Also bring the time range into view in case the user panned far away
      // while in locked mode — keeps the candles visible after switching modes.
      requestAnimationFrame(() => {
        if (chartRef.current) chartRef.current.timeScale().fitContent();
      });
    } else {
      // LOCK mode — disable autoScale; user controls the price scale manually.
      chart.priceScale("right").applyOptions({
        autoScale: false,
        scaleMargins: marginsRef.current,
      });
    }
  }, [settings.isYAxisLocked]);

  useEffect(() => {
    chartRef.current?.applyOptions({ layout: { background: { color: settings.bgColor || "#0f0f0f" } } });
  }, [settings.bgColor]);

  // Lock chart panning/scaling when a drawing tool is active
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

  // ── Price scale zoom & interaction ───────────────────────────────────────────
  // Design goals (matching TradingView):
  // ── Price-scale & chart scroll handling ──────────────────────────────────────
  // Design:
  //   • Wheel over chart area  → lightweight-charts handles it natively (h-scroll/zoom).
  //   • Wheel over price scale → INFINITE vertical zoom via synthetic mouse-drag.
  //       We simulate mousedown→mousemove→mouseup directly on the chart canvas so
  //       lightweight-charts' own price-scale drag logic runs — this is the ONLY way
  //       to get a true unlimited price range zoom (scaleMargins only adjusts padding,
  //       not the actual visible price range).
  //   • Double-click on price scale → reset to auto-scale + default margins.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const PRICE_SCALE_W = 65; // approximate pixel width of the right price-scale column

    const handleInteraction = () => setRedrawTrigger(t => t + 1);

    const handleWheel = (e: WheelEvent) => {
      const cx = e.clientX;
      const cy = e.clientY;

      const canvases = container.querySelectorAll('canvas');
      if (canvases.length === 0) {
        setRedrawTrigger(t => t + 1);
        return;
      }

      const mainCanvas = canvases[0];
      const mainRect = mainCanvas.getBoundingClientRect();

      // Check if cursor is over the right price scale column (physically to the right of the main pane)
      const overPriceScale = cx > mainRect.right;

      if (!overPriceScale) {
        // Chart canvas area: let lightweight-charts handle natively (h-scroll/time zoom).
        setRedrawTrigger(t => t + 1);
        return;
      }

      // ── Price-scale: true infinite vertical zoom ───────────────────────────
      // Prevent the event from reaching the chart canvas horizontally.
      e.preventDefault();
      e.stopPropagation();

      // Find the price-axis TOP canvas — LWC creates two canvases per widget
      // (bottom z-index:1 for drawing, top z-index:2 for mouse events). The
      // MouseEventHandler is attached to the TOP canvas only. We must NOT break
      // early; iterating without break gives us the LAST matching canvas, which
      // is the top canvas. Breaking early stops at the bottom canvas and the
      // synthetic mousedown never reaches LWC's handler.
      let targetEl: HTMLElement | null = null;
      for (const canvas of Array.from(canvases)) {
        const cRect = canvas.getBoundingClientRect();
        if (cx >= cRect.left && cx <= cRect.right && cy >= cRect.top && cy <= cRect.bottom) {
          targetEl = canvas; // no break — keep overwriting; last match = top canvas
        }
      }

      // Fallback: use document.elementFromPoint, temporarily bypassing the SVG overlay
      if (!targetEl) {
        const svg = container.querySelector('svg');
        let oldPointerEvents = '';
        if (svg) {
          oldPointerEvents = svg.style.pointerEvents;
          svg.style.pointerEvents = 'none';
        }
        targetEl = document.elementFromPoint(cx, cy) as HTMLElement | null;
        if (svg) {
          svg.style.pointerEvents = oldPointerEvents;
        }
      }

      if (!targetEl) {
        setRedrawTrigger(t => t + 1);
        return;
      }

      // Normalise: trackpads produce tiny floats, mice produce multiples of 100.
      const norm = Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 53);
      // Scroll-down (deltaY>0) = zoom OUT = drag price-scale DOWN (positive move).
      // Scroll-up   (deltaY<0) = zoom IN  = drag price-scale UP   (negative move).
      let move = norm * 20; // pixels; tune for feel
      // LWC's mouseMoveWithDownHandler requires manhattan distance >= 5px to fire
      // pressedMouseMoveEvent. Ensure we always exceed that threshold.
      if (move !== 0 && Math.abs(move) < 6) {
        move = Math.sign(move) * 6;
      }

      // Per-tick: one complete mousedown→mousemove→mouseup per wheel event.
      // CRITICAL: LWC's MouseEventHandler listens for 'mousedown' NOT 'pointerdown'.
      // PointerEvents are completely ignored by LWC v4 — only MouseEvent works.
      // We do NOT call onSettingsChange here: that would trigger the isYAxisLocked
      // effect which resets scaleMargins mid-scroll and fights the zoom. LWC
      // internally disables autoScale inside startScale (called from mousedown).
      targetEl.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true,
        clientX: cx, clientY: cy,
        buttons: 1, button: 0,
      }));
      targetEl.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true, cancelable: true,
        clientX: cx, clientY: cy + move,
        buttons: 1, button: 0,
      }));
      targetEl.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true,
        clientX: cx, clientY: cy + move,
        buttons: 0, button: 0,
      }));

      setRedrawTrigger(t => t + 1);
    };

    const handleDblClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.right - e.clientX <= PRICE_SCALE_W) {
        // Double-click: reset price scale to auto-fit
        const def = { top: 0.10, bottom: 0.10 };
        marginsRef.current = def;
        chartRef.current?.priceScale("right").applyOptions({ autoScale: true, scaleMargins: def });
        setRedrawTrigger(t => t + 1);
      }
    };

    container.addEventListener("mousemove",  handleInteraction, { passive: true });
    // capture: true — our handler fires BEFORE the chart canvas's own wheel
    // listeners. When over the price scale we call stopPropagation() which
    // prevents the event reaching the canvas entirely, so the chart never
    // horizontally scrolls. When over the chart area we do nothing and let
    // the event fall through to the canvas normally.
    container.addEventListener("wheel",      handleWheel,       { passive: false, capture: true });
    container.addEventListener("dblclick",   handleDblClick,    { passive: true });

    return () => {
      container.removeEventListener("mousemove", handleInteraction);
      container.removeEventListener("wheel",     handleWheel,     { capture: true } as EventListenerOptions);
      container.removeEventListener("dblclick",  handleDblClick);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape + Undo/Redo keyboard handling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing in an input field
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;

      if (e.key === "Escape") {
        activeDrawingRef.current = null;
        setPreviewDrawing(null);
        setIsClickCreating(false);
        setMultiCreating(null);
        setSelectedDrawingId(null);
        setSelectedDrawingIds([]);
        setTextOverlay(null);
        if (!activeDrawingRef.current) setActiveTool("cursor");
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z — undo last drawing action
      if (ctrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const prev = undoStack.current.pop();
        if (prev !== undefined) {
          redoStack.current.push([...localDrawingsRef.current]);
          setLocalDrawings(prev);
          onDrawingsChange(prev);
        }
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y — redo
      if (ctrl && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        const next = redoStack.current.pop();
        if (next !== undefined) {
          undoStack.current.push([...localDrawingsRef.current]);
          setLocalDrawings(next);
          onDrawingsChange(next);
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDrawingsChange]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // (Price scale margins are now applied directly in the wheel handler
  //  and the isYAxisLocked effect — no separate React-state-driven effect needed.)

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
          commitDrawings(localDrawingsRef.current.filter(d => !selectedDrawingIds.includes(d.id)));
          setSelectedDrawingIds([]);
        } else if (selectedDrawingId) {
          commitDrawings(localDrawingsRef.current.filter(d => d.id !== selectedDrawingId));
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
      const edge   = draggingEdgeRef.current;
      const rrH    = draggingRRHandleRef.current;
      const otDrag = draggingOpenTradeLineRef.current;
      const dfDrag = draggingDraftLineRef.current;
      if (anchor || moving || edge || rrH || otDrag || dfDrag) {
        if (dragMovedRef.current && (anchor || moving || edge || rrH)) {
          commitDrawings(localDrawingsRef.current);
        }
        dragMovedRef.current = false;
        setDraggingAnchor(null);
        setDraggingDrawing(null);
        setDraggingEdge(null);
        setDraggingRRHandle(null);
        setDraggingOpenTradeLine(null);
        setDraggingDraftLine(null);
        draggingAnchorRef.current = null;
        draggingDrawingRef.current = null;
        draggingEdgeRef.current = null;
        draggingRRHandleRef.current = null;
        draggingOpenTradeLineRef.current = null;
        draggingDraftLineRef.current = null;
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
      const edge   = draggingEdgeRef.current;
      const rrH    = draggingRRHandleRef.current;
      const otl    = draggingOpenTradeLineRef.current;
      const dfl    = draggingDraftLineRef.current;
      // NOTE: must include the price-line drags (open trade + draft order) here.
      // Omitting them made this handler return before their drag code ran,
      // which is why the SL/TP/entry lines could not be dragged at all.
      if (!anchor && !moving && !edge && !rrH && !otl && !dfl) return;

      // For pure vertical price-line drags we only need the price; the time may
      // be null when the cursor is past the last candle. Fall back to a
      // price-only resolution so the line keeps tracking the cursor anywhere.
      let coords = getTimePriceFromEventNative(e);
      if (!coords && (otl || dfl)) {
        const series = candleSeriesRef.current;
        const container = containerRef.current;
        if (series && container) {
          const rect = container.getBoundingClientRect();
          const pr = series.coordinateToPrice(e.clientY - rect.top);
          if (pr != null) coords = { time: 0, price: pr as number };
        }
      }
      if (!coords) return;
      const { time: timeSec, price: rawPrice } = coords;
      const price = settings.isMagnetActive ? getMagnetSnappedPrice(timeSec, rawPrice) : rawPrice;
      const p: TimePricePoint = { time: timeSec, price };

      dragMovedRef.current = true;

      if (anchor) {
        const { drawingId, pointIndex } = anchor;
        setLocalDrawings(prev => prev.map(draw => {
          if (draw.id !== drawingId) return draw;
          const pts = [...draw.points];
          // Long/short anchors: only move price (y), keep time fixed to entry
          if (draw.type === "long" || draw.type === "short") {
            pts[pointIndex] = { time: pts[0].time, price };
          } else {
            pts[pointIndex] = p;
          }
          return rebuildRiskSettings({ ...draw, points: pts });
        }));
        setRedrawTrigger(t => t + 1);
      }

      if (moving) {
        const { id, startPoints, startMouseCoords } = moving;
        const deltaPrice = price - startMouseCoords.price;
        const deltaTime  = timeSec - startMouseCoords.time;
        
        const startMouseIdx = candles.findIndex(c => c.time === startMouseCoords.time);
        const currMouseIdx = candles.findIndex(c => c.time === timeSec);
        let deltaBars = 0;
        if (startMouseIdx !== -1 && currMouseIdx !== -1) {
          deltaBars = currMouseIdx - startMouseIdx;
        }

        setLocalDrawings(prev => prev.map(draw => {
          if (draw.id !== id) return draw;
          
          if (draw.type === "long" || draw.type === "short") {
            const entryIdx = candles.findIndex(c => c.time === startPoints[0].time);
            let newEntryTime: number;
            if (entryIdx !== -1) {
              const newIdx = Math.max(0, Math.min(candles.length - 1, entryIdx + deltaBars));
              newEntryTime = candles[newIdx].time as number;
            } else {
              // Entry time isn't on a candle boundary (e.g. after a TF resample)
              // — fall back to raw deltaTime so the drawing still tracks the cursor.
              newEntryTime = startPoints[0].time + deltaTime;
            }
            const pts = startPoints.map(pt => ({ time: newEntryTime, price: pt.price + deltaPrice }));
            return rebuildRiskSettings({ ...draw, points: pts });
          } else {
            const pts = startPoints.map(pt => ({ time: pt.time + deltaTime, price: pt.price + deltaPrice }));
            return rebuildRiskSettings({ ...draw, points: pts });
          }
        }));
        setRedrawTrigger(t => t + 1);
      }

      // Rectangle edge handle: constrain to one axis
      if (edge) {
        const { drawingId, pointIndex, axis } = edge;
        setLocalDrawings(prev => prev.map(draw => {
          if (draw.id !== drawingId) return draw;
          const pts = [...draw.points];
          const existing = pts[pointIndex];
          pts[pointIndex] = axis === "y"
            ? { time: existing.time, price }
            : { time: timeSec, price: existing.price };
          return { ...draw, points: pts };
        }));
        setRedrawTrigger(t => t + 1);
      }

      // Long/Short RR 8-handle resize
      if (rrH) {
        const { drawingId, moveTime0, moveTime3, movePriceIndices, startPts, startMouseTime, startMousePrice, startBarWidth } = rrH;
        const deltaPrice = price - startMousePrice;
        
        const startMouseIdx = candles.findIndex(c => c.time === startMouseTime);
        const currMouseIdx = candles.findIndex(c => c.time === timeSec);
        let deltaBars = 0;
        if (startMouseIdx !== -1 && currMouseIdx !== -1) {
          deltaBars = currMouseIdx - startMouseIdx;
        }

        setLocalDrawings(prev => prev.map(draw => {
          if (draw.id !== drawingId) return draw;
          const pts: TimePricePoint[] = startPts.map(q => ({ ...q }));
          let newBarWidth = draw.riskSettings?.barWidth ?? 15;

          if (moveTime0) {
            pts[0] = { ...pts[0], time: timeSec }; // snap to current time
            pts[1] = { ...pts[1], time: timeSec };
            pts[2] = { ...pts[2], time: timeSec };
            newBarWidth = Math.max(1, startBarWidth - deltaBars);
          }
          if (moveTime3) {
            newBarWidth = Math.max(1, startBarWidth + deltaBars);
          }
          movePriceIndices.forEach(idx => {
            pts[idx] = { ...pts[idx], price: pts[idx].price + deltaPrice };
          });
          
          const riskSettings = { ...(draw.riskSettings || {}), barWidth: newBarWidth };
          return rebuildRiskSettings({ ...draw, points: pts, riskSettings: riskSettings as any });
        }));
        setRedrawTrigger(t => t + 1);
      }

      // Open Trade TP/SL drag
      const draggingOTL = draggingOpenTradeLineRef.current;
      if (draggingOTL && onUpdateOpenTrade) {
        const deltaPrice = price - draggingOTL.startMousePrice;
        const newPrice = draggingOTL.startValue + deltaPrice;
        if (draggingOTL.type === "tp") {
          onUpdateOpenTrade({ takeProfit: newPrice });
        } else {
          onUpdateOpenTrade({ stopLoss: newPrice });
        }
      }

      // Draft order line drag (entry/tp/sl)
      const draggingDF = draggingDraftLineRef.current;
      const cbDraft    = onDraftOrderChangeRef.current;
      const dOrder     = draftOrderRef.current;
      if (draggingDF && cbDraft && dOrder) {
        const deltaPrice = price - draggingDF.startMousePrice;
        const newPrice = draggingDF.startValue + deltaPrice;
        // Don't allow SL/TP to cross to the wrong side of entry — clamp instead
        if (draggingDF.type === "entry") {
          cbDraft({ entry: newPrice });
        } else if (draggingDF.type === "tp") {
          const safe = dOrder.side === "buy"
            ? Math.max(newPrice, dOrder.entry + 1e-8)
            : Math.min(newPrice, dOrder.entry - 1e-8);
          cbDraft({ tp: safe });
        } else {
          const safe = dOrder.side === "buy"
            ? Math.min(newPrice, dOrder.entry - 1e-8)
            : Math.max(newPrice, dOrder.entry + 1e-8);
          cbDraft({ sl: safe });
        }
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

  // ── Hover guide line for select-start mode ────────────────────────────────
  useEffect(() => {
    if (!isSelectingStart) { setSelectHoverX(null); return; }
    const chart = chartRef.current;
    if (!chart) return;
    const h = (param: { point?: { x: number; y: number } }) => {
      setSelectHoverX(param.point ? param.point.x : null);
    };
    chart.subscribeCrosshairMove(h);
    return () => { chart.unsubscribeCrosshairMove(h); setSelectHoverX(null); };
  }, [isSelectingStart]);

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

  // ── Shared helper: extrapolate pixel-X for a time that may be outside data range ──
  const extrapolateX = useCallback((chart: IChartApi, time: number): number | null => {
    // First try the native call (works when time is within loaded data)
    const direct = chart.timeScale().timeToCoordinate(time as Time);
    if (direct != null) return direct as number;

    // Fallback: derive pixels-per-unit-time from the visible range and extrapolate
    const vis = chart.timeScale().getVisibleRange();
    if (!vis) return null;
    const fromX = chart.timeScale().timeToCoordinate(vis.from) as number | null;
    const toX   = chart.timeScale().timeToCoordinate(vis.to)   as number | null;
    if (fromX == null || toX == null) return null;
    const timeSpan  = (vis.to as number) - (vis.from as number);
    const pixelSpan = toX - fromX;
    if (timeSpan <= 0 || pixelSpan <= 0) return null;
    return fromX + ((time - (vis.from as number)) * pixelSpan) / timeSpan;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getXY = useCallback((pt: TimePricePoint) => {
    const chart  = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const x = extrapolateX(chart, pt.time);
    const y = series.priceToCoordinate(pt.price);
    if (x == null || y == null) return null;
    return { x, y: y as number };
  }, [redrawTrigger, extrapolateX]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared helper: extrapolate time for a pixel-X that may be beyond data ──
  const extrapolateTime = useCallback((chart: IChartApi, x: number): number | null => {
    // Try native first (works when x is within loaded candles)
    const direct = chart.timeScale().coordinateToTime(x);
    if (direct != null) return direct as number;

    // Fallback: derive units-per-pixel from the visible range and extrapolate
    const vis = chart.timeScale().getVisibleRange();
    if (!vis) return null;
    const fromX = chart.timeScale().timeToCoordinate(vis.from) as number | null;
    const toX   = chart.timeScale().timeToCoordinate(vis.to)   as number | null;
    if (fromX == null || toX == null) return null;
    const timeSpan  = (vis.to as number) - (vis.from as number);
    const pixelSpan = toX - fromX;
    if (timeSpan <= 0 || pixelSpan <= 0) return null;
    // Round to nearest second (same resolution as loaded candle timestamps)
    return Math.round((vis.from as number) + ((x - fromX) * timeSpan) / pixelSpan);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getTimePriceFromEvent = useCallback((e: React.MouseEvent | MouseEvent): { time: number; price: number } | null => {
    const chart     = chartRef.current;
    const series    = candleSeriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) return null;
    const rect  = container.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const time  = extrapolateTime(chart, x);
    const price = series.coordinateToPrice(y);
    if (time == null || price == null) return null;
    return { time, price: price as number };
  }, [extrapolateTime]);

  const getTimePriceFromEventNative = useCallback((e: MouseEvent): { time: number; price: number } | null => {
    const chart     = chartRef.current;
    const series    = candleSeriesRef.current;
    const container = containerRef.current;
    if (!chart || !series || !container) return null;
    const rect  = container.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const time  = extrapolateTime(chart, x);
    const price = series.coordinateToPrice(y);
    if (time == null || price == null) return null;
    return { time, price: price as number };
  }, [extrapolateTime]);

  // Rebuild riskSettings when anchors change.
  // CRITICAL: always snap SL/TP times to entry time so the bracket stays at
  // one x-position and never drifts horizontally when anchors are dragged.
  // Preserve the 4th point (right-edge time anchor) if it exists.
  const rebuildRiskSettings = (draw: Drawing): Drawing => {
    if (draw.type !== "long" && draw.type !== "short") return draw;
    const pts = draw.points;
    if (!pts || pts.length < 2) return draw;
    const entryTime = pts[0].time;          // anchor for all horizontal positions
    const entry = pts[0].price;
    // Guard against SL collapsing onto entry (which would zero-out the bracket)
    const minTick = Math.max(Math.abs(entry) * 1e-8, 1e-8);
    let stop = pts[1].price;
    if (Math.abs(stop - entry) < minTick) {
      stop = draw.type === "long" ? entry - minTick * 100 : entry + minTick * 100;
    }
    const dist  = Math.abs(entry - stop);
    const tp    = pts[2]?.price ?? (draw.type === "long" ? entry + dist * 2 : entry - dist * 2);
    const risk   = dist;
    const reward = Math.abs(tp - entry);
    const rr     = risk > 0 ? reward / risk : 0;
    const barWidth = Math.max(1, draw.riskSettings?.barWidth ?? 15);
    const newPts: TimePricePoint[] = [
      { time: entryTime, price: entry },
      { time: entryTime, price: stop },   // SL always at entry time
      { time: entryTime, price: tp },     // TP always at entry time
    ];
    return {
      ...draw,
      points: newPts,
      riskSettings: { entry, stopLoss: stop, takeProfit: tp, riskRewardRatio: rr, barWidth },
    };
  };

  // ── Finalize drawing ──────────────────────────────────────────────────────
  const finalizeDrawing = useCallback((coords: { time: number; price: number } | null) => {
    if (!activeDrawingRef.current) return;

    let { time: timeSec, price } = coords || activeDrawingRef.current.points[activeDrawingRef.current.points.length - 1];
    if (settings.isMagnetActive) price = getMagnetSnappedPrice(timeSec, price);
    const p: TimePricePoint = { time: timeSec, price };

    let finished: Drawing = { ...activeDrawingRef.current };

    if (finished.type === "long" || finished.type === "short") {
      const entryTime = finished.points[0].time;  // keep all at entry time
      const entry = finished.points[0].price;
      // Avoid a zero-distance RR: if user released on the same price as entry,
      // default to a 1% (or one-tick) stop so the bracket is still meaningful.
      let stop = p.price;
      const minTick = Math.max(Math.abs(entry) * 0.01, 1e-8);
      if (Math.abs(stop - entry) < 1e-8) {
        stop = finished.type === "long" ? entry - minTick : entry + minTick;
      }
      const dist  = Math.abs(entry - stop);
      const tp    = finished.type === "long" ? entry + dist * 2 : entry - dist * 2;
      const rr    = dist > 0 ? Math.abs(tp - entry) / dist : 2;

      const barWidth = 15;

      finished = {
        ...finished,
        points: [
          { time: entryTime, price: entry },
          { time: entryTime, price: stop },  // SL at entry time, not mouse time
          { time: entryTime, price: tp },    // TP at entry time
        ],
        riskSettings: { entry, stopLoss: stop, takeProfit: tp, riskRewardRatio: rr, barWidth },
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
            commitDrawings([...localDrawingsRef.current, withText]);
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

    commitDrawings([...localDrawingsRef.current, finished]);
    setSelectedDrawingId(finished.id);
    activeDrawingRef.current = null;
    setPreviewDrawing(null);
    setIsClickCreating(false);
    isDraggingDrawingRef.current = false;
    if (!stayInDrawingMode) setActiveTool("cursor");
  }, [settings.isMagnetActive, getMagnetSnappedPrice, commitDrawings, stayInDrawingMode, getXY]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Multi-point tools (channel=3, triangle=3, patterns=5) — accumulate clicks
    if (needed >= 3) {
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
      if (current.points.length < needed - 1) {
        const updated = { ...current, points: [...current.points, p] };
        setMultiCreating(updated);
        const nd: Drawing = { ...activeDrawingRef.current!, points: [...current.points, p, p] };
        activeDrawingRef.current = nd;
        setPreviewDrawing(nd);
        return;
      }
      if (current.points.length === needed - 1) {
        // Final click: finalize
        const allPts = [...current.points, p];
        const finished: Drawing = { id: String(Date.now()), type: activeTool, points: allPts };
        commitDrawings([...localDrawingsRef.current, finished]);
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

      // Save the scroll offset (bars from right edge) BEFORE setData so we
      // can restore it afterwards — `setVisibleRange` often fails when the range
      // includes times outside the new dataset (e.g. after cutting the chart),
      // causing an unwanted jump to the right edge.
      const scrollPos = ts?.scrollPosition();

      cs.setData(cData);
      vs.setData(vData);

      if (replayIndex != null && scrollPos != null) {
        // REPLAY / CUT mode: keep the chart exactly where the user was looking.
        // Use scrollToPosition so the right edge stays at the same bar offset.
        requestAnimationFrame(() => {
          chartRef.current?.timeScale().scrollToPosition(scrollPos, false);
        });
      } else if (replayIndex == null) {
        // Normal (live / full chart): fit everything in view on initial load.
        const range = ts?.getVisibleRange();
        if (range) {
          try { ts?.setVisibleRange(range); } catch { /* safe */ }
        } else {
          chartRef.current?.timeScale().fitContent();
        }
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

  // Trade markers (only shown when showTradeMarkers is on — off by default)
  useEffect(() => {
    const cs = candleSeriesRef.current;
    if (!cs) return;
    const markers: SeriesMarker<Time>[] = [];
    if (showTradeMarkers) {
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
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    cs.setMarkers(markers);
  }, [manualTrades, replayStartIndex, candles, showTradeMarkers]);

  // ── Delete helpers ────────────────────────────────────────────────────────
  const handleClearAllDrawings = () => {
    commitDrawings([]);
    setPreviewDrawing(null);
    activeDrawingRef.current = null;
    setSelectedDrawingId(null);
    setMultiCreating(null);
  };

  const handleDeleteDrawing = useCallback((id: string) => {
    commitDrawings(localDrawingsRef.current.filter(d => d.id !== id));
    setSelectedDrawingId(null);
  }, [commitDrawings]);

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
    commitDrawings(updatedDrawings);
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
    if (!draw.points || draw.points.length === 0) return null;
    const p1 = getXY(draw.points[0]);
    const isSelected = selectedDrawingId === draw.id || selectedDrawingIds.includes(draw.id);
    const isPreview  = draw.id === previewDrawing?.id;
    const stroke     = draw.color || (isSelected ? SEL_COLOR : LINE_COLOR);
    const dashArray  = isPreview ? "5 4" : "0";
    const sw         = draw.strokeWidth ?? 1.5; // user-configurable stroke width

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
          <line x1={0} y1={p1.y} x2={svgW} y2={p1.y} stroke={stroke} strokeWidth={isSelected ? sw + 0.5 : sw} strokeDasharray={dashArray} />
          <text x={svgW - 8} y={p1.y - 4} fill={stroke} fontSize={8} fontFamily="monospace" textAnchor="end">
            {formatPrice(draw.points[0].price, minPriceRef.current)}
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
          <line x1={p1.x} y1={0} x2={p1.x} y2={svgH} stroke={stroke} strokeWidth={isSelected ? sw + 0.5 : sw} strokeDasharray={dashArray} />
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
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={isSelected ? sw + 1 : sw} strokeDasharray={dashArray} />
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
          <line x1={p1.x} y1={p1.y} x2={ext.x} y2={ext.y} stroke={stroke} strokeWidth={isSelected ? sw + 1 : sw} strokeDasharray={dashArray} />
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
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke} strokeWidth={isSelected ? sw + 1 : sw} />
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
      
      // Calculate text position inside the rectangle
      let tx = cx;
      let ty = cy + 4;
      let textAnchor: "inherit" | "middle" | "start" | "end" = "middle";
      const pos = draw.textPosition || "center";
      const fs = draw.fontSize || 9;
      
      if (pos === "top-left") {
        tx = x + 8;
        ty = y + fs + 4;
        textAnchor = "start";
      } else if (pos === "top-center") {
        tx = cx;
        ty = y + fs + 4;
        textAnchor = "middle";
      } else if (pos === "top-right") {
        tx = x + w - 8;
        ty = y + fs + 4;
        textAnchor = "end";
      } else if (pos === "middle-left") {
        tx = x + 8;
        ty = cy + fs/2 - 1;
        textAnchor = "start";
      } else if (pos === "center") {
        tx = cx;
        ty = cy + fs/2 - 1;
        textAnchor = "middle";
      } else if (pos === "middle-right") {
        tx = x + w - 8;
        ty = cy + fs/2 - 1;
        textAnchor = "end";
      } else if (pos === "bottom-left") {
        tx = x + 8;
        ty = y + h - 8;
        textAnchor = "start";
      } else if (pos === "bottom-center") {
        tx = cx;
        ty = y + h - 8;
        textAnchor = "middle";
      } else if (pos === "bottom-right") {
        tx = x + w - 8;
        ty = y + h - 8;
        textAnchor = "end";
      }

      // Midpoint of each edge (for TradingView-style constrained resize)
      const edgeHandleStyle = inCursorMode ? "pointer-events-auto" : "pointer-events-none";
      const makeEdgeHandle = (ex: number, ey: number, ptIdx: number, axis: "x"|"y", cursorClass: string) => (
        <rect x={ex - 4} y={ey - 4} width={8} height={8} rx={2}
          fill={CHART_BG} stroke={SEL_COLOR} strokeWidth={1.5}
          className={`${edgeHandleStyle} ${inCursorMode ? cursorClass : ""}`}
          onMouseDown={inCursorMode ? (e => {
            stopEvent(e);
            const nd = { drawingId: draw.id, pointIndex: ptIdx, axis };
            draggingEdgeRef.current = nd; setDraggingEdge(nd);
            dragMovedRef.current = false;
          }) : undefined} />
      );
      return (
        <g key={draw.id} {...groupProps}>
          <rect x={x} y={y} width={w} height={h} stroke={stroke} strokeWidth={isSelected ? sw + 1 : sw}
            fill={draw.color ? hexToRgba(draw.color, draw.fillOpacity !== undefined ? draw.fillOpacity : (isSelected ? 0.08 : 0.05)) : `rgba(16,185,129,${draw.fillOpacity !== undefined ? draw.fillOpacity : (isSelected ? 0.08 : 0.05)})`} strokeDasharray={dashArray} />
          {draw.text && (
            <text x={tx} y={ty} textAnchor={textAnchor}
              fill={draw.textColor || draw.color || (isSelected ? SEL_COLOR : LINE_COLOR)}
              fontSize={fs} fontFamily="monospace" fontWeight="bold" pointerEvents="none">
              {draw.text}
            </text>
          )}
          {isSelected && <>
            {/* Corner anchors */}
            {makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}
            {makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}
            <circle cx={p2.x} cy={p1.y} r={5.5} fill={CHART_BG} stroke={SEL_COLOR} strokeWidth={1.8}
              className={inCursorMode ? "cursor-nesw-resize pointer-events-auto" : "pointer-events-none"}
              onMouseDown={inCursorMode ? (e => { stopEvent(e); const na = { drawingId: draw.id, pointIndex: 1 }; draggingAnchorRef.current = na; setDraggingAnchor(na); }) : undefined} />
            <circle cx={p1.x} cy={p2.y} r={5.5} fill={CHART_BG} stroke={SEL_COLOR} strokeWidth={1.8}
              className={inCursorMode ? "cursor-nesw-resize pointer-events-auto" : "pointer-events-none"}
              onMouseDown={inCursorMode ? (e => { stopEvent(e); const na = { drawingId: draw.id, pointIndex: 0 }; draggingAnchorRef.current = na; setDraggingAnchor(na); }) : undefined} />
            {/* Edge midpoint handles — TradingView-style: adjust only width or height */}
            {makeEdgeHandle(cx,   p1.y, 0, "y", "cursor-n-resize")}  {/* top edge → Y of p1 */}
            {makeEdgeHandle(cx,   p2.y, 1, "y", "cursor-s-resize")}  {/* bottom edge → Y of p2 */}
            {makeEdgeHandle(p1.x, cy,   0, "x", "cursor-w-resize")}  {/* left edge → X of p1 */}
            {makeEdgeHandle(p2.x, cy,   1, "x", "cursor-e-resize")}  {/* right edge → X of p2 */}
            {/* Center handle */}
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
          <ellipse cx={p1.x} cy={p1.y} rx={rx || 1} ry={ry || 1} stroke={stroke} strokeWidth={isSelected ? sw + 1 : sw}
            fill={isSelected ? "rgba(234,179,8,0.08)" : (draw.color ? hexToRgba(draw.color, 0.05) : "rgba(16,185,129,0.05)")} strokeDasharray={dashArray} />
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
          <polygon points={pts} stroke={stroke} strokeWidth={isSelected ? sw + 1 : sw}
            fill={isSelected ? "rgba(234,179,8,0.08)" : (draw.color ? hexToRgba(draw.color, 0.05) : "rgba(16,185,129,0.05)")} strokeDasharray={dashArray} />
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
          <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={stroke} strokeWidth={isSelected ? sw + 0.5 : sw} strokeDasharray={dashArray} />
          {/* Second parallel line */}
          <line x1={c1.x} y1={c1.y + dy} x2={c2.x} y2={c2.y + dy} stroke={stroke} strokeWidth={isSelected ? sw + 0.5 : sw} strokeDasharray={dashArray} />
          {/* Fill */}
          <polygon
            points={`${c1.x},${c1.y} ${c2.x},${c2.y} ${c2.x},${c2.y + dy} ${c1.x},${c1.y + dy}`}
            fill={isSelected ? "rgba(234,179,8,0.06)" : (draw.color ? hexToRgba(draw.color, 0.04) : "rgba(16,185,129,0.04)")} stroke="none"
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
          <path d={d} fill="none" stroke={isSelected ? (draw.color ? hexToRgba(draw.color, 0.55) : "rgba(234,179,8,0.55)") : (draw.color ? hexToRgba(draw.color, 0.28) : "rgba(16,185,129,0.28)")} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
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
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? SEL_COLOR : (draw.color || "#f59e0b")} strokeWidth={isSelected ? sw + 1 : sw} strokeDasharray="4 3" />
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
        "rgba(16,185,129,0.04)", "rgba(20,184,166,0.04)", "rgba(9,153,129,0.04)",
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
                <line x1={0} y1={y} x2={svgW} y2={y} stroke={isSelected ? (draw.color ? hexToRgba(draw.color, 0.4) : "rgba(234,179,8,0.4)") : (draw.color ? hexToRgba(draw.color, 0.22) : "rgba(16,185,129,0.22)")} strokeWidth={isSelected ? 1.5 : 1} />
                <text x={p1.x + 8} y={y - 3} fill={isSelected ? SEL_COLOR : (draw.color || TEXT_COLOR)} fontSize={8} fontFamily="monospace">
                  {labels[idx]} ({formatPrice(priceVal, minPriceRef.current)})
                </text>
              </g>
            );
          })}
          {isSelected && <>{makeAnchor(p1.x, p1.y, draw.id, 0, "a0")}{makeAnchor(p2.x, p2.y, draw.id, 1, "a1")}</>}
        </g>
      );
    }

    // ── Harmonic XABCD Pattern (5-click: X, A, B, C, D) ─────────────────────
    if (draw.type === "patterns") {
      const ptsXY = draw.points.map(pt => getXY(pt));
      const validXY = ptsXY.filter(Boolean) as { x: number; y: number }[];
      const col = draw.color || "#10b981";
      const sw  = draw.strokeWidth ?? 1.5;
      const labels = ["X", "A", "B", "C", "D"];

      if (draw.points.length >= 2 && draw.points.length < 5) {
        // Partial preview: show lines + placed points so far
        return (
          <g key={draw.id}>
            {validXY.length >= 2 && validXY.map((pt, i) => {
              if (i === 0) return null;
              const prev = validXY[i - 1];
              return <line key={i} x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                stroke={col} strokeWidth={sw} strokeDasharray="5 3" strokeLinecap="round" />;
            })}
            {validXY.map((pt, i) => (
              <g key={i}>
                <circle cx={pt.x} cy={pt.y} r={4} fill={col} fillOpacity={0.8} />
                <text x={pt.x} y={pt.y - 8} fill={col} fontSize={9} fontFamily="monospace" fontWeight="bold" textAnchor="middle">{labels[i]}</text>
              </g>
            ))}
          </g>
        );
      }

      if (draw.points.length < 5 || ptsXY.some(v => !v)) return null;
      const [pX, pA, pB, pC, pD] = ptsXY as { x: number; y: number }[];
      const fillAlpha = isSelected ? 0.15 : 0.07;
      const fillColor = draw.color ? hexToRgba(draw.color, fillAlpha) : `rgba(16,185,129,${fillAlpha})`;
      return (
        <g key={draw.id} {...groupProps}>
          {/* XAB wing */}
          <polygon points={`${pX.x},${pX.y} ${pA.x},${pA.y} ${pB.x},${pB.y}`}
            stroke={isSelected ? SEL_COLOR : col} strokeWidth={isSelected ? 2 : sw}
            fill={isSelected ? "rgba(255,255,255,0.10)" : fillColor} />
          {/* BCD wing */}
          <polygon points={`${pB.x},${pB.y} ${pC.x},${pC.y} ${pD.x},${pD.y}`}
            stroke={isSelected ? SEL_COLOR : col} strokeWidth={isSelected ? 2 : sw}
            fill={isSelected ? "rgba(255,255,255,0.10)" : fillColor} />
          {/* Connecting line X→D */}
          <line x1={pX.x} y1={pX.y} x2={pD.x} y2={pD.y}
            stroke={col} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="4 3" />
          {/* Labels */}
          {[{ p: pX, l: "X" }, { p: pA, l: "A" }, { p: pB, l: "B" }, { p: pC, l: "C" }, { p: pD, l: "D" }].map((v, i) => (
            <text key={i} x={v.p.x} y={v.p.y - 9} fill={isSelected ? SEL_COLOR : col}
              fontSize={9} fontFamily="monospace" fontWeight="bold" textAnchor="middle">{v.l}</text>
          ))}
          {isSelected && draw.points.map((_, idx) => {
            const xy = getXY(draw.points[idx]);
            if (!xy) return null;
            return makeAnchor(xy.x, xy.y, draw.id, idx, `a${idx}`);
          })}
        </g>
      );
    }

    // ── Long / Short Risk-Reward ─────────────────────────────────────────────
    // Three stored prices: points[0]=entry, points[1]=stop, points[2]=takeProfit
    // All share the same entry-bar time → same pixel X.
    // Width is always dynamic: entry bar → right edge of chart (svgW - 70).
    // No 4th point or fixed-pixel fallback: width reacts to chart resize because
    // svgW is recomputed on every render that redrawTrigger fires.
    if (draw.type === "long" || draw.type === "short") {
      const cs = candleSeriesRef.current;
      if (!p1 || !cs || !draw.points[0]) return null;

      const isLong = draw.type === "long";

      // ── Prices ──────────────────────────────────────────────────────────────
      const entry  = draw.points[0].price;
      const rawStop = draw.points[1]?.price;
      // If SL collapses onto entry (corrupt data), fall back to a visible offset
      const stop   = rawStop != null && Math.abs(rawStop - entry) > 1e-8
        ? rawStop
        : (isLong ? entry * 0.99 : entry * 1.01);
      const risk   = Math.abs(entry - stop);
      const tp     = draw.points[2]?.price ?? (isLong ? entry + risk * 2 : entry - risk * 2);
      const reward = Math.abs(tp - entry);
      const rr     = risk > 0 ? reward / risk : 0;

      // ── X geometry ──────────────────────────────────────────────────────────
      const xL = p1.x; // entry bar pixel-x
      
      let pixelWidthPerBar = 10; // fallback
      const chartInst = chartRef.current;
      if (chartInst) {
        const tr = chartInst.timeScale().getVisibleLogicalRange();
        const w = chartInst.timeScale().width();
        if (tr && w && tr.to > tr.from) {
          pixelWidthPerBar = w / (tr.to - tr.from);
        }
      }
      
      const barWidth = draw.riskSettings?.barWidth ?? 15;
      const xR = Math.max(xL + 2, xL + barWidth * pixelWidthPerBar);
      const W  = xR - xL;

      // ── Y geometry ──────────────────────────────────────────────────────────
      const entryY = p1.y;
      // Convert price → pixel Y. If price is far outside visible range,
      // priceToCoordinate returns null — use a linear extrapolation instead.
      const toY = (price: number): number => {
        const raw = cs.priceToCoordinate(price) as number | null;
        if (raw != null) return raw;
        // Derive px/price ratio from a tiny reference offset at the entry price
        const refRaw = cs.priceToCoordinate(entry + (entry * 0.001 || 0.001)) as number | null;
        const pxPerUnit = refRaw != null
          ? (refRaw - entryY) / (entry * 0.001 || 0.001)
          : -10; // fallback: 10px per unit downward
        return entryY + (price - entry) * pxPerUnit;
      };
      const slY = toY(stop);
      const tpY = toY(tp);

      // ── Zone rectangles ──────────────────────────────────────────────────────
      // For LONG: profit zone is ABOVE entry (tpY < entryY), loss zone is BELOW
      // For SHORT: profit zone is BELOW entry (tpY > entryY), loss zone is ABOVE
      const profitTop = Math.min(entryY, tpY);
      const profitH   = Math.max(2, Math.abs(entryY - tpY));
      const lossTop   = Math.min(entryY, slY);
      const lossH     = Math.max(2, Math.abs(entryY - slY));
      const outerTop  = Math.min(profitTop, lossTop);
      const outerBot  = Math.max(profitTop + profitH, lossTop + lossH);

      // ── Helpers ─────────────────────────────────────────────────────────────
      const fmtP = (n: number) => formatPrice(n, minPriceRef.current);

      // ── $ P&L from current lot size ─────────────────────────────────────────
      const _spec        = getLotSpec(symbol || "xauusd");
      const _dir         = isLong ? "LONG" : "SHORT";
      const profitDollar = calcPnl(_dir, entry, tp,   lotSize, _spec); // > 0
      const lossDollar   = calcPnl(_dir, entry, stop, lotSize, _spec); // < 0
      const fmtDollar    = (v: number) =>
        (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        });

      // Right-side label block: slightly wider to fit dollar amounts
      const LH  = 17;                               // label box height px
      const LW  = Math.min(148, Math.floor(W * 0.60)); // label box width px
      const lx  = xR - LW - 3;                     // label left-x

      // Direction badge sits inside the profit zone top-left corner
      const dirBadgeText = isLong ? "▲ LONG" : "▼ SHORT";
      const dirBadgeW    = isLong ? 50 : 58;
      const dirBadgeX    = Math.max(0, xL + 6);
      const dirBadgeY    = profitTop + 5;            // always inside profit zone

      // RR badge centred on the entry line (only when bracket is wide enough)
      const rrBadgeW = 74;
      const rrBadgeX = xL + (W - rrBadgeW) / 2;

      return (
        <g key={draw.id} {...groupProps}>

          {/* ── Large invisible hit zone ── */}
          <rect x={xL} y={outerTop} width={W} height={outerBot - outerTop}
            fill="transparent" />

          {/* ── Profit zone (emerald) ── */}
          <rect x={xL} y={profitTop} width={W} height={profitH}
            fill={isSelected ? "rgba(16,185,129,0.20)" : "rgba(16,185,129,0.09)"} />
          {/* Dollar profit centred inside zone (only when tall enough) */}
          {profitH > 28 && W > 80 && (
            <text
              x={xL + W / 2} y={profitTop + profitH / 2 + 4}
              textAnchor="middle"
              fill="rgba(16,185,129,0.75)"
              fontSize={Math.min(13, Math.max(9, profitH * 0.35))}
              fontFamily="monospace" fontWeight="bold"
              pointerEvents="none">
              {fmtDollar(profitDollar)}
            </text>
          )}

          {/* ── Loss zone (red) ── */}
          <rect x={xL} y={lossTop} width={W} height={lossH}
            fill={isSelected ? "rgba(239,68,68,0.20)" : "rgba(239,68,68,0.09)"} />
          {/* Dollar loss centred inside zone (only when tall enough) */}
          {lossH > 28 && W > 80 && (
            <text
              x={xL + W / 2} y={lossTop + lossH / 2 + 4}
              textAnchor="middle"
              fill="rgba(239,68,68,0.75)"
              fontSize={Math.min(13, Math.max(9, lossH * 0.35))}
              fontFamily="monospace" fontWeight="bold"
              pointerEvents="none">
              {fmtDollar(lossDollar)}
            </text>
          )}

          {/* ── Price lines ── */}
          {/* TP */}
          <line x1={xL} y1={tpY} x2={xR} y2={tpY}
            stroke="#10b981" strokeWidth={isSelected ? 1.6 : 1.1} />
          {/* Entry — slightly thicker / more opaque */}
          <line x1={xL} y1={entryY} x2={xR} y2={entryY}
            stroke="rgba(255,255,255,0.80)" strokeWidth={isSelected ? 2.2 : 1.7} />
          {/* SL */}
          <line x1={xL} y1={slY} x2={xR} y2={slY}
            stroke="#ef4444" strokeWidth={isSelected ? 1.6 : 1.1} />

          {/* ── Full border rect (all 4 sides) ── */}
          <rect x={xL} y={outerTop} width={Math.max(1, W)} height={Math.max(1, outerBot - outerTop)}
            fill="none"
            stroke={isSelected ? SEL_COLOR : "rgba(255,255,255,0.22)"}
            strokeWidth={isSelected ? 1.5 : 0.9}
            pointerEvents="none"
          />

          {/* ── Direction badge (inside profit zone) ── */}
          <rect x={dirBadgeX} y={dirBadgeY} width={dirBadgeW} height={15} rx={3}
            fill={isLong ? "rgba(16,185,129,0.30)" : "rgba(239,68,68,0.30)"}
            stroke={isLong ? "#10b981" : "#ef4444"} strokeWidth={0.7} />
          <text
            x={dirBadgeX + dirBadgeW / 2} y={dirBadgeY + 10}
            textAnchor="middle"
            fill={isLong ? "#10b981" : "#ef4444"}
            fontSize={8} fontFamily="monospace" fontWeight="bold">
            {dirBadgeText}
          </text>

          {/* ── RR ratio badge (centre of bracket on entry line) ── */}
          {W >= 110 && (
            <>
              <rect x={rrBadgeX} y={entryY - 9} width={rrBadgeW} height={17} rx={3}
                fill="rgba(0,0,0,0.82)"
                stroke={isSelected ? SEL_COLOR : "rgba(255,255,255,0.20)"} strokeWidth={0.8} />
              <text x={rrBadgeX + rrBadgeW / 2} y={entryY + 4}
                textAnchor="middle"
                fill="rgba(255,255,255,0.92)" fontSize={9} fontFamily="monospace" fontWeight="bold">
                RR 1:{rr.toFixed(2)}
              </text>
            </>
          )}

          {/* ── Right-side price labels ── */}
          {LW >= 50 && (
            <>
              {/* TP label — price + dollar profit */}
              <rect x={lx} y={tpY - LH / 2} width={LW} height={LH} rx={2}
                fill="rgba(3,12,7,0.95)" stroke="#10b981" strokeWidth={0.8} />
              <text x={lx + 4} y={tpY + 4}
                fill="#10b981" fontSize={8} fontFamily="monospace" fontWeight="bold">
                {`TP ${fmtP(tp)}  ${fmtDollar(profitDollar)}`}
              </text>

              {/* Entry label */}
              <rect x={lx} y={entryY - LH / 2} width={LW} height={LH} rx={2}
                fill="rgba(8,8,8,0.95)" stroke="rgba(255,255,255,0.40)" strokeWidth={0.8} />
              <text x={lx + 4} y={entryY + 4}
                fill="rgba(255,255,255,0.88)" fontSize={8} fontFamily="monospace" fontWeight="bold">
                {`EN ${fmtP(entry)}`}
              </text>

              {/* SL label — price + dollar loss */}
              <rect x={lx} y={slY - LH / 2} width={LW} height={LH} rx={2}
                fill="rgba(12,3,3,0.95)" stroke="#ef4444" strokeWidth={0.8} />
              <text x={lx + 4} y={slY + 4}
                fill="#ef4444" fontSize={8} fontFamily="monospace" fontWeight="bold">
                {`SL ${fmtP(stop)}  ${fmtDollar(lossDollar)}`}
              </text>
            </>
          )}

          {/* ── 8 resize handles (selected only) ── */}
          {isSelected && inCursorMode && (() => {
            const hcx = xL + W / 2;
            const hcy = (outerTop + outerBot) / 2;
            // For LONG: TP is the top price (pts[2]), SL is the bottom (pts[1]).
            // For SHORT: SL is the top price (pts[1]), TP is the bottom (pts[2]).
            const topPtIdx    = isLong ? 2 : 1;
            const bottomPtIdx = isLong ? 1 : 2;

            const mkH = (
              hx: number, hy: number, cursor: string,
              mt0: boolean, mt3: boolean, priceIdxs: number[]
            ) => (
              <rect key={`${hx}-${hy}`}
                x={hx - 5} y={hy - 5} width={10} height={10} rx={2}
                fill={CHART_BG} stroke={SEL_COLOR} strokeWidth={1.6}
                className={`${cursor} pointer-events-auto`}
                onMouseDown={e => {
                  stopEvent(e);
                  const coords = getTimePriceFromEvent(e);
                  if (!coords) return;
                  const nd = {
                    drawingId: draw.id,
                    moveTime0: mt0,
                    moveTime3: mt3,
                    movePriceIndices: priceIdxs,
                    startPts: draw.points.map(q => ({ ...q })),
                    startMouseTime: coords.time,
                    startMousePrice: coords.price,
                    startBarWidth: draw.riskSettings?.barWidth ?? 15,
                  };
                  draggingRRHandleRef.current = nd;
                  setDraggingRRHandle(nd);
                  dragMovedRef.current = false;
                }}
              />
            );

            return (
              <>
                {mkH(xL,  outerTop, "cursor-nw-resize", true,  false, [topPtIdx])}
                {mkH(hcx, outerTop, "cursor-n-resize",  false, false, [topPtIdx])}
                {mkH(xR,  outerTop, "cursor-ne-resize", false, true,  [topPtIdx])}
                {mkH(xL,  hcy,      "cursor-w-resize",  true,  false, [])}
                {mkH(xR,  hcy,      "cursor-e-resize",  false, true,  [])}
                {mkH(xL,  outerBot, "cursor-sw-resize", true,  false, [bottomPtIdx])}
                {mkH(hcx, outerBot, "cursor-s-resize",  false, false, [bottomPtIdx])}
                {mkH(xR,  outerBot, "cursor-se-resize", false, true,  [bottomPtIdx])}
              </>
            );
          })()}
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
        {/* Undo / Redo */}
        <TB active={false}
          onClick={() => {
            const prev = undoStack.current.pop();
            if (prev !== undefined) {
              redoStack.current.push([...localDrawingsRef.current]);
              setLocalDrawings(prev);
              onDrawingsChange(prev);
            }
          }}
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 7L2 4L5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 4C3.5 1.5 7 1 9.5 2.5C12 4 13 7 12 10C11 13 8 14.5 5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          } label="Undo  (Ctrl+Z)" />
        <TB active={false}
          onClick={() => {
            const next = redoStack.current.pop();
            if (next !== undefined) {
              undoStack.current.push([...localDrawingsRef.current]);
              setLocalDrawings(next);
              onDrawingsChange(next);
            }
          }}
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 7L14 4L11 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 4C12.5 1.5 9 1 6.5 2.5C4 4 3 7 4 10C5 13 8 14.5 11 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          } label="Redo  (Ctrl+Y)" />

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

      {/* ── Chart area: flex-col so controls live in a real strip below ── */}
      <div className="flex-1 min-w-0 h-full flex flex-col relative">
        {/* Inner canvas area — fills all remaining space */}
        <div className="flex-1 min-h-0 relative">
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
            {/* ── Sessions Indicator (Background shading + High/Low Lines) ── */}
            {(() => {
              const chart = chartRef.current;
              const series = candleSeriesRef.current;
              if (!chart || !series || candles.length === 0) return null;

              const sLabels = { asian: "Asian", london: "London", ny: "New-York" };

              return (["asian", "london", "ny"] as const).map(sKey => {
                const s = sessionsCfg[sKey];
                if (!sessionsGlobalActive || !s.active) return null;

                const startMin = s.startH * 60 + (s.startM ?? 0);
                const endMin = s.endH * 60 + (s.endM ?? 0);

                // Group all candles in history into session blocks
                const blocks: { startTime: number; endTime: number; high: number; low: number }[] = [];
                let currentBlock: { startTime: number; endTime: number; high: number; low: number; lastTime: number } | null = null;

                for (let i = 0; i < candles.length; i++) {
                  const c = candles[i];
                  // Convert to IST hour & minute (+5.5 hours = +19800 seconds)
                  const date = new Date((c.time + 19800) * 1000);
                  const h = date.getUTCHours();
                  const m = date.getUTCMinutes();
                  const candleMin = h * 60 + m;

                  let inSess = false;
                  if (startMin <= endMin) {
                    inSess = candleMin >= startMin && candleMin < endMin;
                  } else {
                    inSess = candleMin >= startMin || candleMin < endMin;
                  }

                  if (inSess) {
                    if (!currentBlock || (c.time - currentBlock.lastTime > 3600 * 12)) {
                      if (currentBlock) {
                        blocks.push({
                          startTime: currentBlock.startTime,
                          endTime: currentBlock.endTime,
                          high: currentBlock.high,
                          low: currentBlock.low,
                        });
                      }
                      currentBlock = {
                        startTime: c.time,
                        endTime: c.time,
                        high: c.high,
                        low: c.low,
                        lastTime: c.time,
                      };
                    } else {
                      currentBlock.endTime = c.time;
                      currentBlock.high = Math.max(currentBlock.high, c.high);
                      currentBlock.low = Math.min(currentBlock.low, c.low);
                      currentBlock.lastTime = c.time;
                    }
                  } else {
                    if (currentBlock) {
                      blocks.push({
                        startTime: currentBlock.startTime,
                        endTime: currentBlock.endTime,
                        high: currentBlock.high,
                        low: currentBlock.low,
                      });
                      currentBlock = null;
                    }
                  }
                }

                if (currentBlock) {
                  blocks.push({
                    startTime: currentBlock.startTime,
                    endTime: currentBlock.endTime,
                    high: currentBlock.high,
                    low: currentBlock.low,
                  });
                }

                // Filter to blocks visible on/near the screen for rendering performance
                const visibleBlocks = blocks.filter(b => {
                  const x1 = chart.timeScale().timeToCoordinate(b.startTime as any);
                  const x2 = chart.timeScale().timeToCoordinate(b.endTime as any);
                  return (x1 != null && x1 >= -500 && x1 <= svgW + 500) ||
                         (x2 != null && x2 >= -500 && x2 <= svgW + 500);
                });

                return (
                  <g key={sKey}>
                    {visibleBlocks.map((block, idx) => {
                      const x1 = chart.timeScale().timeToCoordinate(block.startTime as any) as number;
                      const x2 = chart.timeScale().timeToCoordinate(block.endTime as any) as number;
                      const y1 = series.priceToCoordinate(block.high) as number;
                      const y2 = series.priceToCoordinate(block.low) as number;

                      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;

                      const finalX1 = x1 - 4;
                      const finalX2 = x2 + 4;

                      return (
                        <g key={`${sKey}-${idx}`} className="pointer-events-none">
                          {/* Shading (optional based on configured opacity) */}
                          {s.opacity > 0 && (
                            <rect
                              x={finalX1}
                              y={0}
                              width={Math.max(1, finalX2 - finalX1)}
                              height={svgH}
                              fill={s.color}
                              fillOpacity={s.opacity}
                            />
                          )}

                          {/* High Line */}
                          <line
                            x1={finalX1}
                            y1={y1}
                            x2={finalX2}
                            y2={y1}
                            stroke={s.color}
                            strokeWidth={1.2}
                          />

                          {/* Low Line */}
                          <line
                            x1={finalX1}
                            y1={y2}
                            x2={finalX2}
                            y2={y2}
                            stroke={s.color}
                            strokeWidth={1.2}
                          />

                          {/* Label placed above the high line */}
                          <text
                            x={finalX1 + 4}
                            y={y1 - 6}
                            fill={s.color}
                            fontSize={9}
                            fontWeight="bold"
                            fontFamily="sans-serif"
                          >
                            {sLabels[sKey]}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              });
            })()}

            {allDrawings.map(draw => renderDrawing(draw))}

            {/* ── Select-start hover guide line ── */}
            {isSelectingStart && selectHoverX != null && (
              <g pointerEvents="none">
                <line x1={selectHoverX} y1={0} x2={selectHoverX} y2={svgH}
                  stroke="rgba(255,255,255,0.85)" strokeWidth={1.5} strokeDasharray="5 3" />
                <rect x={selectHoverX - 24} y={4} width={48} height={13} rx={3}
                  fill="#F0B90B" fillOpacity={0.9} />
                <text x={selectHoverX} y={13} textAnchor="middle"
                  fill="#000" fontSize={7} fontFamily="monospace" fontWeight="bold">
                  CUT HERE
                </text>
              </g>
            )}

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

            {/* ── Active Open Trade Lines ── */}
            {openTrade && (() => {
              const cs = candleSeriesRef.current;
              if (!cs) return null;
              const entryY = cs.priceToCoordinate(openTrade.entryPrice);
              const tpY = openTrade.takeProfit != null ? cs.priceToCoordinate(openTrade.takeProfit) : null;
              const slY = openTrade.stopLoss != null ? cs.priceToCoordinate(openTrade.stopLoss) : null;

              // Resolve grab price from container rect (matches the global
              // mousemove basis → no jump on drag start).
              const grabPrice = (e: React.MouseEvent): number | null => {
                const container = containerRef.current;
                if (container) {
                  const rect = container.getBoundingClientRect();
                  const p = cs.coordinateToPrice(e.clientY - rect.top) as number | null;
                  if (p != null) return p;
                }
                return cs.coordinateToPrice((e.nativeEvent as MouseEvent).offsetY) as number | null;
              };

              return (
                <g pointerEvents="auto">
                  {/* Entry Line */}
                  {entryY != null && !isNaN(entryY) && (
                    <g pointerEvents="none">
                      <line x1={0} y1={entryY} x2={svgW} y2={entryY} stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3 3" />
                      <rect x={0} y={entryY - 8} width={38} height={16} fill="#000" fillOpacity={0.6} rx={2} />
                      <text x={4} y={entryY + 3} fill="rgba(255,255,255,0.7)" fontSize={9} fontFamily="monospace">ENTRY</text>
                    </g>
                  )}
                  {/* Take Profit Line */}
                  {tpY != null && !isNaN(tpY) && (
                    <g style={{ cursor: "ns-resize" }}>
                      <line x1={0} y1={tpY} x2={svgW} y2={tpY} stroke="rgba(16, 185, 129, 0.5)" strokeWidth={1.5} pointerEvents="none" />
                      <rect x={0} y={tpY - 8} width={22} height={16} fill="rgba(16, 185, 129, 0.2)" rx={2} pointerEvents="none" />
                      <text x={4} y={tpY + 3} fill="#10b981" fontSize={9} fontFamily="monospace" fontWeight="bold" pointerEvents="none">TP</text>
                      <line x1={0} y1={tpY} x2={svgW} y2={tpY} stroke="transparent" strokeWidth={22}
                        pointerEvents="stroke"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const p = grabPrice(e);
                          if (p != null) setDraggingOpenTradeLine({ type: "tp", startMousePrice: p, startValue: openTrade.takeProfit! });
                        }}
                      />
                    </g>
                  )}
                  {/* Stop Loss Line */}
                  {slY != null && !isNaN(slY) && (
                    <g style={{ cursor: "ns-resize" }}>
                      <line x1={0} y1={slY} x2={svgW} y2={slY} stroke="rgba(239, 68, 68, 0.5)" strokeWidth={1.5} pointerEvents="none" />
                      <rect x={0} y={slY - 8} width={22} height={16} fill="rgba(239, 68, 68, 0.2)" rx={2} pointerEvents="none" />
                      <text x={4} y={slY + 3} fill="#ef4444" fontSize={9} fontFamily="monospace" fontWeight="bold" pointerEvents="none">SL</text>
                      <line x1={0} y1={slY} x2={svgW} y2={slY} stroke="transparent" strokeWidth={22}
                        pointerEvents="stroke"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const p = grabPrice(e);
                          if (p != null) setDraggingOpenTradeLine({ type: "sl", startMousePrice: p, startValue: openTrade.stopLoss! });
                        }}
                      />
                    </g>
                  )}
                </g>
              );
            })()}

            {/* ── Draft Order Ticket Lines (Buy/Sell preview) ── */}
            {draftOrder && (() => {
              const cs = candleSeriesRef.current;
              if (!cs) return null;
              const entryY = cs.priceToCoordinate(draftOrder.entry) as number | null;
              const tpY    = cs.priceToCoordinate(draftOrder.tp)    as number | null;
              const slY    = cs.priceToCoordinate(draftOrder.sl)    as number | null;
              const isBuy  = draftOrder.side === "buy";

              const fmtP = (n: number) => formatPrice(n, minPriceRef.current);
              const spec = getLotSpec(symbol || "xauusd");
              const dir: "LONG" | "SHORT" = isBuy ? "LONG" : "SHORT";
              const tpDollar = calcPnl(dir, draftOrder.entry, draftOrder.tp, draftOrder.lotSize, spec);
              const slDollar = calcPnl(dir, draftOrder.entry, draftOrder.sl, draftOrder.lotSize, spec);
              const fmtDollar = (v: number) =>
                (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toFixed(2);

              const startDrag = (type: "entry" | "tp" | "sl", e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                // Resolve the grab price from the container rect (same basis the
                // global mousemove handler uses) so there's no jump on drag start.
                const container = containerRef.current;
                let p: number | null = null;
                if (container) {
                  const rect = container.getBoundingClientRect();
                  p = cs.coordinateToPrice(e.clientY - rect.top) as number | null;
                }
                if (p == null) p = cs.coordinateToPrice((e.nativeEvent as MouseEvent).offsetY) as number | null;
                if (p == null) return;
                const startValue = type === "entry" ? draftOrder.entry : type === "tp" ? draftOrder.tp : draftOrder.sl;
                const drag = { type, startMousePrice: p as number, startValue };
                draggingDraftLineRef.current = drag;
                setDraggingDraftLine(drag);
              };

              return (
                // pointerEvents="auto" on the wrapper re-enables hit-testing even
                // though the parent SVG is pointer-events-none in cursor mode.
                <g pointerEvents="auto">
                  {/* TP line (emerald) */}
                  {tpY != null && !isNaN(tpY) && (
                    <g style={{ cursor: "ns-resize" }}>
                      <line x1={0} y1={tpY} x2={svgW} y2={tpY} stroke="#10b981" strokeWidth={1.2} strokeDasharray="4 3" pointerEvents="none" />
                      {/* Fat transparent hit zone — pointerEvents="stroke" makes it
                          catch the grab even though the stroke is transparent. */}
                      <line x1={0} y1={tpY} x2={svgW} y2={tpY} stroke="transparent" strokeWidth={22}
                            pointerEvents="stroke" onMouseDown={(e) => startDrag("tp", e)} />
                      <rect x={svgW - 178} y={tpY - 9} width={172} height={18} rx={3}
                            fill="rgba(3,12,7,0.92)" stroke="#10b981" strokeWidth={0.8}
                            onMouseDown={(e) => startDrag("tp", e)} />
                      <text x={svgW - 172} y={tpY + 4} fill="#10b981" fontSize={9} fontFamily="monospace" fontWeight="bold" pointerEvents="none">
                        {`TP ${fmtP(draftOrder.tp)}  ${fmtDollar(tpDollar)}`}
                      </text>
                    </g>
                  )}

                  {/* SL line (red) */}
                  {slY != null && !isNaN(slY) && (
                    <g style={{ cursor: "ns-resize" }}>
                      <line x1={0} y1={slY} x2={svgW} y2={slY} stroke="#ef4444" strokeWidth={1.2} strokeDasharray="4 3" pointerEvents="none" />
                      <line x1={0} y1={slY} x2={svgW} y2={slY} stroke="transparent" strokeWidth={22}
                            pointerEvents="stroke" onMouseDown={(e) => startDrag("sl", e)} />
                      <rect x={svgW - 178} y={slY - 9} width={172} height={18} rx={3}
                            fill="rgba(12,3,3,0.92)" stroke="#ef4444" strokeWidth={0.8}
                            onMouseDown={(e) => startDrag("sl", e)} />
                      <text x={svgW - 172} y={slY + 4} fill="#ef4444" fontSize={9} fontFamily="monospace" fontWeight="bold" pointerEvents="none">
                        {`SL ${fmtP(draftOrder.sl)}  ${fmtDollar(slDollar)}`}
                      </text>
                    </g>
                  )}

                  {/* Entry line (direction-colored) */}
                  {entryY != null && !isNaN(entryY) && (
                    <g style={{ cursor: "ns-resize" }}>
                      <line x1={0} y1={entryY} x2={svgW} y2={entryY}
                            stroke={isBuy ? "rgba(16,185,129,0.95)" : "rgba(239,68,68,0.95)"}
                            strokeWidth={1.6} pointerEvents="none" />
                      <line x1={0} y1={entryY} x2={svgW} y2={entryY} stroke="transparent" strokeWidth={22}
                            pointerEvents="stroke" onMouseDown={(e) => startDrag("entry", e)} />
                    </g>
                  )}
                </g>
              );
            })()}
          </svg>
        )}

        {/* ── Draft Order Ticket — HTML controls (Discard / Confirm / flip) ── */}
        {draftOrder && (() => {
          const cs = candleSeriesRef.current;
          if (!cs) return null;
          const entryY = cs.priceToCoordinate(draftOrder.entry) as number | null;
          if (entryY == null || isNaN(entryY)) return null;
          const isBuy = draftOrder.side === "buy";
          // Center the control bar roughly mid-chart so the user can always see it
          return (
            <div
              className="absolute z-40 flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-black/85 backdrop-blur-xl border border-white/[0.12] shadow-2xl font-mono text-[10px] select-none pointer-events-auto"
              style={{
                top: Math.max(0, entryY - 14),
                left: "50%",
                transform: "translateX(-50%)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onFlipDraft?.()}
                title="Flip direction"
                className={`px-1.5 h-6 rounded text-[10px] font-bold transition-all active:scale-95 cursor-pointer ${
                  isBuy ? "bg-emerald-600/80 hover:bg-emerald-500 text-white" : "bg-red-600/80 hover:bg-red-500 text-white"
                }`}
              >
                ⇅
              </button>
              <button
                onClick={() => onDiscardDraft?.()}
                className="px-2.5 h-6 rounded bg-white/[0.08] hover:bg-white/[0.16] text-white font-bold transition-all active:scale-95 cursor-pointer"
              >
                Discard
              </button>
              <button
                onClick={() => onConfirmDraft?.()}
                className={`px-2.5 h-6 rounded font-bold text-white transition-all active:scale-95 cursor-pointer ${
                  isBuy ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"
                }`}
              >
                Confirm {isBuy ? "Buy" : "Sell"}
              </button>
              <span className={`px-1.5 h-6 inline-flex items-center rounded text-[9px] font-bold border ${
                isBuy ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400"
              }`}>
                {isBuy ? "BUY" : "SELL"} {draftOrder.lotSize.toFixed(2)}
              </span>
              <span className="text-white/60 px-1">{formatPrice(draftOrder.entry, minPriceRef.current)}</span>
            </div>
          );
        })()}

        {/* ── Floating Multi-Selection Panel ── */}
        {selectedDrawingIds.length > 1 && (
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-3.5 px-4.5 py-2.5 bg-black/85 backdrop-blur-xl border border-red-500/30 rounded-full z-45 shadow-2xl font-mono text-[9px] text-white/70 pointer-events-auto select-none"
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
                commitDrawings(freshDrawings);
                setSelectedDrawingIds([]);
              }}
              className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer focus:outline-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selection</span>
            </button>
            <button
              onClick={() => setSelectedDrawingIds([])}
              className="p-1 rounded-full text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer focus:outline-none"
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
            <button onClick={() => { setTextOverlay(null); setTextInputVal(""); }} className="p-1 bg-white/[0.08] rounded text-white/50 text-xs">✗</button>
          </div>
        )}

        {/* ── Multi-point hint ── */}
        {multiCreating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black/80 backdrop-blur-xl border border-white/[0.08] rounded-lg px-3 py-1.5 text-[10px] font-mono text-white/50 pointer-events-none">
            {multiCreating.type === "patterns"
              ? `Click point ${multiCreating.points.length + 1}/5 — ${["X", "A", "B", "C", "D"][multiCreating.points.length]}`
              : multiCreating.points.length === 1
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
            <span className="text-white/40">Entry <b className="text-white">{formatPrice(openTrade.entryPrice, minPriceRef.current)}</b></span>
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

          const paletteColors = ["#10b981", "#ef4444", "#eab308", "#f97316", "#ec4899", "#999BA5", "#ffffff"];
          const applicableTemplates = (settings.drawingTemplates || []).filter(t => t.type === sel.type);

          return (
            <div className="absolute z-30 flex flex-col bg-black/85 backdrop-blur-xl border border-white/[0.10] rounded-lg p-2 shadow-2xl select-none font-mono text-[9px] min-w-[220px]"
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
                      value={sel.color || "#10b981"}
                      onChange={(e) => handleUpdateDrawingColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      title="Choose Custom Color"
                    />
                  </div>
                </div>

                <div className="w-px h-3.5 bg-white/[0.08]" />

                {/* Stroke width control */}
                <div className="flex items-center gap-1" title="Stroke width">
                  <button
                    onClick={() => {
                      const cur = sel.strokeWidth ?? 1.5;
                      const next = Math.max(0.5, +(cur - 0.5).toFixed(1));
                      const updated = localDrawings.map(d => d.id === sel.id ? { ...d, strokeWidth: next } : d);
                      commitDrawings(updated);
                    }}
                    className="w-4 h-4 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                  ><Minus className="w-2.5 h-2.5" /></button>
                  <span className="text-white/60 w-5 text-center font-bold">{(sel.strokeWidth ?? 1.5).toFixed(1)}</span>
                  <button
                    onClick={() => {
                      const cur = sel.strokeWidth ?? 1.5;
                      const next = Math.min(8, +(cur + 0.5).toFixed(1));
                      const updated = localDrawings.map(d => d.id === sel.id ? { ...d, strokeWidth: next } : d);
                      commitDrawings(updated);
                    }}
                    className="w-4 h-4 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                  ><PlusIcon className="w-2.5 h-2.5" /></button>
                </div>

                <div className="w-px h-3.5 bg-white/[0.08]" />

                {/* Templates trigger */}
                <button
                  onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
                  className={`px-1.5 py-0.5 rounded font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                    isTemplateMenuOpen
                      ? "bg-white/[0.07] border-white/[0.12] text-white/65"
                      : "bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white"
                  }`}
                  title="Templates menu"
                >
                  TEMPLATES
                </button>

                <div className="w-px h-3.5 bg-white/[0.08]" />

                {/* Delete button */}
                <button onClick={e => { e.stopPropagation(); handleDeleteDrawing(selectedDrawingId); }}
                  className="p-1 rounded text-white/35 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center cursor-pointer" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Row 2: Text inputs & settings (for rectangle & text drawings) */}
              {(sel.type === "rectangle" || sel.type === "text") && (
                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <span className="text-white/45 uppercase text-[8px] tracking-wider shrink-0">Text:</span>
                    <input
                      type="text"
                      value={sel.text || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = localDrawings.map(d => d.id === sel.id ? { ...d, text: val } : d);
                        commitDrawings(updated);
                      }}
                      placeholder="Add text inside drawing..."
                      className="bg-black/50 border border-white/[0.12] rounded px-1.5 py-0.5 text-white text-[9px] font-mono focus:outline-none flex-grow"
                    />
                  </div>
                  
                  {sel.type === "rectangle" && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/45 uppercase text-[8px] tracking-wider shrink-0">Align:</span>
                        <select
                          value={sel.textPosition || "center"}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = localDrawings.map(d => d.id === sel.id ? { ...d, textPosition: val } : d);
                            commitDrawings(updated);
                          }}
                          className="bg-black/50 border border-white/[0.12] rounded px-1 text-white text-[8px] font-mono focus:outline-none cursor-pointer"
                        >
                          <option value="top-left">Top Left</option>
                          <option value="top-center">Top Center</option>
                          <option value="top-right">Top Right</option>
                          <option value="middle-left">Middle Left</option>
                          <option value="center">Center</option>
                          <option value="middle-right">Middle Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="bottom-center">Bottom Center</option>
                          <option value="bottom-right">Bottom Right</option>
                        </select>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/45 uppercase text-[8px] tracking-wider shrink-0">Size:</span>
                        <select
                          value={sel.fontSize || 9}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const updated = localDrawings.map(d => d.id === sel.id ? { ...d, fontSize: val } : d);
                            commitDrawings(updated);
                          }}
                          className="bg-black/50 border border-white/[0.12] rounded px-1 text-white text-[8px] font-mono focus:outline-none cursor-pointer"
                        >
                          {[8, 9, 10, 11, 12, 14, 16, 18, 20].map(sz => (
                            <option key={sz} value={sz}>{sz}px</option>
                          ))}
                        </select>
                      </div>

                      {(() => {
                        const idx0 = candles.findIndex(c => c.time === sel.points[0]?.time);
                        const idx1 = candles.findIndex(c => c.time === sel.points[1]?.time);
                        if (idx0 !== -1 && idx1 !== -1) {
                          const currentBars = Math.abs(idx1 - idx0);
                          return (
                            <div className="flex items-center gap-1">
                              <span className="text-white/45 uppercase text-[8px] tracking-wider shrink-0">Width (Bars):</span>
                              <button
                                onClick={() => {
                                  const nextBars = Math.max(1, currentBars - 1);
                                  const newIdx1 = idx0 < idx1 ? idx0 + nextBars : idx0 - nextBars;
                                  const targetCandle = candles[Math.max(0, Math.min(candles.length - 1, newIdx1))];
                                  if (targetCandle) {
                                    const pts = [...sel.points];
                                    pts[1] = { ...pts[1], time: targetCandle.time as number };
                                    const updated = localDrawings.map(d => d.id === sel.id ? { ...d, points: pts } : d);
                                    commitDrawings(updated);
                                  }
                                }}
                                className="w-3.5 h-3.5 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/[0.08]"
                              >-</button>
                              <span className="text-white/60 font-bold text-center w-5">{currentBars}</span>
                              <button
                                onClick={() => {
                                  const nextBars = currentBars + 1;
                                  const newIdx1 = idx0 < idx1 ? idx0 + nextBars : idx0 - nextBars;
                                  const targetCandle = candles[Math.max(0, Math.min(candles.length - 1, newIdx1))];
                                  if (targetCandle) {
                                    const pts = [...sel.points];
                                    pts[1] = { ...pts[1], time: targetCandle.time as number };
                                    const updated = localDrawings.map(d => d.id === sel.id ? { ...d, points: pts } : d);
                                    commitDrawings(updated);
                                  }
                                }}
                                className="w-3.5 h-3.5 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/[0.08]"
                              >+</button>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 justify-between">
                    {/* Text color dots */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-white/45 uppercase text-[8px] tracking-wider shrink-0">Text Color:</span>
                      <div className="flex items-center gap-1">
                        {paletteColors.map((col) => (
                          <button
                            key={col}
                            onClick={() => {
                              const updated = localDrawings.map(d => d.id === sel.id ? { ...d, textColor: col } : d);
                              commitDrawings(updated);
                            }}
                            className="w-3 h-3 rounded-full border border-white/20 transition-all hover:scale-110 active:scale-90 cursor-pointer"
                            style={{ backgroundColor: col }}
                            title={`Text Color: ${col}`}
                          />
                        ))}
                        {/* Custom picker */}
                        <div className="relative w-3 h-3 rounded-full border border-white/20 overflow-hidden hover:scale-110 transition-all flex items-center justify-center cursor-pointer bg-gradient-to-tr from-red-500 via-green-500 to-blue-500">
                          <input
                            type="color"
                            value={sel.textColor || "#ffffff"}
                            onChange={(e) => {
                              const col = e.target.value;
                              const updated = localDrawings.map(d => d.id === sel.id ? { ...d, textColor: col } : d);
                              commitDrawings(updated);
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            title="Custom Text Color"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Fill Opacity (Rectangle only) */}
                    {sel.type === "rectangle" && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/45 uppercase text-[8px] tracking-wider shrink-0 font-mono">Fill:</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={sel.fillOpacity !== undefined ? sel.fillOpacity : 0.05}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const updated = localDrawings.map(d => d.id === sel.id ? { ...d, fillOpacity: val } : d);
                            commitDrawings(updated);
                          }}
                          className="w-14 accent-emerald-500 cursor-pointer h-1.5 rounded-lg bg-white/[0.08]"
                        />
                        <span className="text-white/60 font-bold text-[8px]">{Math.round((sel.fillOpacity !== undefined ? sel.fillOpacity : 0.05) * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                          color: sel.color || "#10b981",
                          strokeWidth: sel.strokeWidth ?? 1.5,
                          fillOpacity: sel.fillOpacity,
                          text: sel.text || "",
                          textColor: sel.textColor || "",
                          textPosition: sel.textPosition || "center",
                          fontSize: sel.fontSize || 9,
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
                      <span className="px-2 text-[7px] text-white/35 font-bold uppercase tracking-wider">APPLY TEMPLATE:</span>
                      {applicableTemplates.map((t) => (
                        <div key={t.id} className="flex items-center justify-between hover:bg-white/[0.06] rounded px-2 py-0.5 group/item">
                          <button
                            onClick={() => {
                              // Apply all styles from template!
                              const updatedDrawings = localDrawings.map((draw) => {
                                if (draw.id === sel.id) {
                                  return {
                                    ...draw,
                                    color: t.color,
                                    strokeWidth: t.strokeWidth !== undefined ? t.strokeWidth : draw.strokeWidth,
                                    fillOpacity: t.fillOpacity !== undefined ? t.fillOpacity : draw.fillOpacity,
                                    text: t.text !== undefined && t.text !== "" ? t.text : draw.text,
                                    textColor: t.textColor !== undefined ? t.textColor : draw.textColor,
                                    textPosition: t.textPosition !== undefined ? t.textPosition : draw.textPosition,
                                    fontSize: t.fontSize !== undefined ? t.fontSize : draw.fontSize,
                                  };
                                }
                                return draw;
                              });
                              commitDrawings(updatedDrawings);
                              setIsTemplateMenuOpen(false);
                            }}
                            className="text-left text-white/65 font-medium truncate w-[100px]"
                            title={`Apply ${t.name}`}
                          >
                            {t.name}
                          </button>
                          <button
                            onClick={() => {
                              const updatedTemplates = (settings.drawingTemplates || []).filter(item => item.id !== t.id);
                              onSettingsChange({ drawingTemplates: updatedTemplates });
                            }}
                            className="text-white/30 hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5"
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

        </div>{/* end inner canvas area */}

        {/* ── Bottom controls strip — below the chart, no overlap ── */}
        <div className="shrink-0 h-8 border-t border-white/[0.08] bg-[#0a0a0a] flex items-center justify-end px-2 gap-1 select-none font-mono text-[9px] z-20">
          {/* Trade markers toggle */}
          <button onClick={() => setShowTradeMarkers(p => !p)}
            className={`px-2 py-1 rounded font-bold transition-all flex items-center gap-1 cursor-pointer border ${showTradeMarkers ? "bg-white/[0.10] border-white/[0.14] text-white" : "bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white"}`}
            title="Toggle Entry/Exit Trade Markers">
            <BarChart2 className="w-3 h-3" /><span>MARKS</span>
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          {/* Indicators */}
          <button onClick={() => { setIndicatorPanelOpen(p => !p); setSessionsPanelOpen(false); }}
            className={`px-2 py-1 rounded font-bold transition-all flex items-center gap-1 cursor-pointer border ${indicatorPanelOpen ? "bg-white/[0.10] border-white/[0.14] text-white" : "bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white"}`}
            title="Indicators">
            <Activity className="w-3 h-3" /><span>IND</span>
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          {/* Sessions Toggle UI */}
          <div className="flex">
            <button onClick={() => setSessionsGlobalActive(p => !p)}
              className={`px-2 py-1 rounded-l font-bold transition-all flex items-center gap-1 cursor-pointer border-y border-l ${sessionsGlobalActive ? "bg-white/[0.10] border-white/[0.14] text-white" : "bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white"}`}
              title="Toggle Market Sessions">
              <Clock className="w-3 h-3" /><span>SESS</span>
            </button>
            <button onClick={() => { setSessionsPanelOpen(p => !p); setIndicatorPanelOpen(false); }}
              className={`px-1 py-1 rounded-r transition-all flex items-center justify-center cursor-pointer border ${sessionsPanelOpen ? "bg-white/[0.10] border-white/[0.14] text-white" : "bg-white/[0.04] border-white/[0.08] text-white/50 hover:text-white"}`}
              title="Session Settings">
              <ChevronUp className={`w-3 h-3 transition-transform ${sessionsPanelOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
          <div className="w-px h-4 bg-white/[0.08]" />
          <button
            onClick={() => onSettingsChange({ isYAxisLocked: !settings.isYAxisLocked })}
            className={`px-2 py-1 rounded font-bold transition-all active:scale-95 flex items-center gap-1 cursor-pointer border ${
              settings.isYAxisLocked ? "bg-white/[0.08] border-white/[0.12] text-white/80" : "bg-white/[0.04] border-white/[0.12] text-white/60 hover:bg-white/[0.08]"
            }`} title={settings.isYAxisLocked ? "Y-Axis LOCKED" : "Y-Axis AUTO"}>
            {settings.isYAxisLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>{settings.isYAxisLocked ? "LOCK" : "AUTO"}</span>
          </button>
          <div className="w-px h-4 bg-white/[0.08]" />
          <button onClick={() => setIsSettingsModalOpen(true)}
            className="p-1.5 rounded text-white/40 hover:text-white hover:bg-white/[0.06] transition-all active:scale-90 cursor-pointer flex items-center"
            title="Chart Settings">
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Indicator Panel ── */}
        {indicatorPanelOpen && (
          <div className="absolute bottom-8 right-3 z-40 bg-black/92 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl w-72 font-mono pointer-events-auto select-none overflow-hidden"
            onMouseDown={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Indicators</span>
              </div>
              <button onClick={() => setIndicatorPanelOpen(false)} className="p-1 rounded text-white/30 hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-3 flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
              {[
                { key: "sma"  as const, label: "SMA",  hasPeriod: true,  hasStddev: false },
                { key: "sma2" as const, label: "SMA 2",hasPeriod: true,  hasStddev: false },
                { key: "ema"  as const, label: "EMA",  hasPeriod: true,  hasStddev: false },
                { key: "ema2" as const, label: "EMA 2",hasPeriod: true,  hasStddev: false },
                { key: "bb"   as const, label: "Bollinger Bands", hasPeriod: true, hasStddev: true },
                { key: "vwap" as const, label: "VWAP", hasPeriod: false, hasStddev: false },
                { key: "rsi"  as const, label: "RSI",  hasPeriod: true,  hasStddev: false },
              ].map(({ key, label, hasPeriod, hasStddev }) => {
                const cfg = indicatorCfg[key] as any;
                return (
                  <div key={key} className={`rounded-lg border p-2.5 transition-colors ${cfg.active ? "border-white/[0.12] bg-white/[0.04]" : "border-white/[0.05] bg-white/[0.02]"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-bold ${cfg.active ? "text-white/80" : "text-white/35"}`}>{label}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={cfg.active}
                          onChange={e => setIndicatorCfg(prev => ({ ...prev, [key]: { ...prev[key], active: e.target.checked } }))}
                          className="sr-only peer" />
                        <div className="w-8 h-4 bg-white/[0.08] rounded-full peer peer-checked:bg-emerald-600/70 peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/60 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:bg-white" />
                      </label>
                    </div>
                    {cfg.active && (
                      <div className="flex items-center gap-2">
                        {hasPeriod && (
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[8px] text-white/30 uppercase">Period</span>
                            <input type="number" min={2} max={500} value={cfg.period}
                              onChange={e => setIndicatorCfg(prev => ({ ...prev, [key]: { ...prev[key], period: +e.target.value } }))}
                              className="w-14 bg-black/60 border border-white/[0.08] rounded px-1.5 py-0.5 text-[9px] text-white focus:outline-none focus:border-white/[0.25]" />
                          </div>
                        )}
                        {hasStddev && (
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-white/30 uppercase">σ</span>
                            <input type="number" min={0.5} max={5} step={0.5} value={(cfg as any).stddev}
                              onChange={e => setIndicatorCfg(prev => ({ ...prev, [key]: { ...prev[key], stddev: +e.target.value } }))}
                              className="w-10 bg-black/60 border border-white/[0.08] rounded px-1.5 py-0.5 text-[9px] text-white focus:outline-none" />
                          </div>
                        )}
                        {key !== "rsi" && (
                          <input type="color" value={cfg.color}
                            onChange={e => setIndicatorCfg(prev => ({ ...prev, [key]: { ...prev[key], color: e.target.value } }))}
                            className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Sessions Panel ── */}
        {sessionsPanelOpen && (
          <div className="absolute bottom-8 right-3 z-40 bg-black/92 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl w-72 font-mono pointer-events-auto select-none overflow-hidden"
            onMouseDown={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Market Sessions</span>
              </div>
              <button onClick={() => setSessionsPanelOpen(false)} className="p-1 rounded text-white/30 hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="p-3 flex flex-col gap-2">
              {(["asian", "london", "ny"] as const).map(sKey => {
                const sLabels = { asian: "Asian", london: "London", ny: "New York" };
                const s = sessionsCfg[sKey];
                return (
                  <div key={sKey} className={`rounded-lg border p-2.5 transition-colors ${s.active ? "border-white/[0.12] bg-white/[0.04]" : "border-white/[0.05] bg-white/[0.02]"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className={`text-[10px] font-bold ${s.active ? "text-white/80" : "text-white/35"}`}>{sLabels[sKey]}</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={s.active}
                          onChange={e => setSessionsCfg(prev => ({ ...prev, [sKey]: { ...prev[sKey], active: e.target.checked } }))}
                          className="sr-only peer" />
                        <div className="w-8 h-4 bg-white/[0.08] rounded-full peer peer-checked:bg-emerald-600/70 peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/60 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:bg-white" />
                      </label>
                    </div>
                    {s.active && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-white/30">START (IST)</span>
                            <div className="flex items-center bg-black/60 border border-white/[0.08] rounded px-1.5 py-0.5">
                              <input type="number" min={0} max={23} value={s.startH}
                                onChange={e => setSessionsCfg(prev => ({ ...prev, [sKey]: { ...prev[sKey], startH: +e.target.value } }))}
                                className="w-5 bg-transparent border-0 text-[9px] text-white focus:outline-none p-0 text-center" />
                              <span className="text-[8px] text-white/30 px-0.5">:</span>
                              <input type="number" min={0} max={59} value={s.startM ?? 0}
                                onChange={e => setSessionsCfg(prev => ({ ...prev, [sKey]: { ...prev[sKey], startM: +e.target.value } }))}
                                className="w-5 bg-transparent border-0 text-[9px] text-white focus:outline-none p-0 text-center" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[8px] text-white/30">END (IST)</span>
                            <div className="flex items-center bg-black/60 border border-white/[0.08] rounded px-1.5 py-0.5">
                              <input type="number" min={0} max={23} value={s.endH}
                                onChange={e => setSessionsCfg(prev => ({ ...prev, [sKey]: { ...prev[sKey], endH: +e.target.value } }))}
                                className="w-5 bg-transparent border-0 text-[9px] text-white focus:outline-none p-0 text-center" />
                              <span className="text-[8px] text-white/30 px-0.5">:</span>
                              <input type="number" min={0} max={59} value={s.endM ?? 0}
                                onChange={e => setSessionsCfg(prev => ({ ...prev, [sKey]: { ...prev[sKey], endM: +e.target.value } }))}
                                className="w-5 bg-transparent border-0 text-[9px] text-white focus:outline-none p-0 text-center" />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5 border-t border-white/[0.04] pt-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] text-white/30">SHADING</span>
                            <input type="range" min={0.00} max={0.3} step={0.01} value={s.opacity}
                              onChange={e => setSessionsCfg(prev => ({ ...prev, [sKey]: { ...prev[sKey], opacity: +e.target.value } }))}
                              className="w-18 accent-white/60" />
                            <span className="text-[7.5px] font-mono text-white/40">{Math.round(s.opacity * 100)}%</span>
                          </div>
                          <input type="color" value={s.color}
                            onChange={e => setSessionsCfg(prev => ({ ...prev, [sKey]: { ...prev[sKey], color: e.target.value } }))}
                            className="w-5 h-5 rounded border-0 bg-transparent cursor-pointer" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[8px] text-white/20 text-center mt-1">Times in IST (Indian Standard Time)</p>
            </div>
          </div>
        )}

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
                <button onClick={() => setIsSettingsModalOpen(false)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/35 hover:text-white transition-colors cursor-pointer">
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
                        "Sleek Dark":      { upColor: "#10b981", downColor: "#1e293b" },
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
                      <span className="text-[9px] text-white/35">{desc}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input type="checkbox" checked={settings[key]} onChange={e => onSettingsChange({ [key]: e.target.checked })} className="sr-only peer" />
                      <div className={`w-9 h-5 bg-white/[0.08] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/60 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${color === "yellow" ? "peer-checked:bg-white/[0.16]" : "peer-checked:bg-white/[0.12]"} peer-checked:after:bg-white`} />
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
