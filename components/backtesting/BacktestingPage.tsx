"use client";

// ─── BacktestingPage Coordinator ──────────────────────────────────────────────
// Manages:
//  • Sessions Dashboard view (when activeSession is null)
//  • High-fidelity Trading Replay interface (when activeSession is active)
//  • Local Storage session syncing (drawings, trades, metrics, balance)
//  • Creating sessions via modal popover (leveraging 14 symbols and custom dates)
//  • Step replay engines, live feeds, and real-time execution panels

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { Candle, ControlsState, ReplayState, LiveStatus, ManualTrade, ReplaySpeed, Session, Drawing } from "./types";
import { getLotSpec, snapLot } from "./lotSpecs";
import { fetchCandleRange, clearCandleCache, resampleCandles, getLastFetchedSource } from "./dataFetcher";
import {
  initialReplayState, enterSelectMode, confirmStartBar,
  stepForward, stepBack, jumpToStart, startPlaying, pausePlaying, stopReplay,
  setSpeed, SPEED_INTERVALS,
} from "./replayEngine";
import { LiveDataFeed }  from "./liveDataFeed";
import { TradeTracker, computeMetrics }  from "./tradeTracker";
import { BacktestChart } from "./BacktestChart";
import { ReplayBar }     from "./ReplayBar";
import { NewSessionModal } from "./NewSessionModal";
import { SessionDashboard } from "./SessionDashboard";
import { ExecutionPanel } from "./ExecutionPanel";
import { ArrowLeft, Play, Layout, RotateCcw, AlertTriangle } from "lucide-react";

const formatPrice = (p: number) => {
  if (p < 0.001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(7);
  if (p < 0.1) return p.toFixed(6);
  if (p < 1) return p.toFixed(5);
  if (p < 10) return p.toFixed(4);
  if (p < 100) return p.toFixed(3);
  return p.toFixed(2);
};

export function BacktestingPage() {
  // ── R/R drawing selected in chart (shown in side panel) ───────────────────
  const [rrDrawing, setRRDrawing] = useState<Drawing | null>(null);

  // ── Session State & Local Storage Persistence ──────────────────────────────
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [chartSettings, setChartSettings] = useState({
    themeName: "Emerald Bull",
    upColor: "#10b981",
    downColor: "#ef4444",
    showGrid: true,
    showVolume: true,
    isYAxisLocked: false,
    isMagnetActive: false,
    bgColor: "#0f0f0f",
    favoriteTools: [] as string[],
    drawingTemplates: [] as { id: string; name: string; type: string; color: string }[],
  });

  // ── Trading & Replay State ──
  const [rawCandles,    setRawCandles]   = useState<Candle[]>([]);    // 1m base data
  const [displayCandles,setDisplay]      = useState<Candle[]>([]);    // resampled for TF
  const [isLoading,     setLoading]      = useState(false);
  const [loadProgress,  setLoadProgress] = useState(0);
  const [loadLabel,     setLoadLabel]    = useState("");
  const [error,         setError]        = useState<string | null>(null);
  const [liveStatus,    setLiveStatus]   = useState<LiveStatus>("stopped");
  const [liveCandle,    setLiveCandle]   = useState<Candle | null>(null);
  const [replay,        setReplay]       = useState<ReplayState>(initialReplayState);
  const [openTrade,     setOpenTrade]    = useState<ManualTrade | null>(null);
  const [closedTrades,  setClosedTrades] = useState<ManualTrade[]>([]);
  const [unrealised,    setUnrealised]   = useState(0);
  const [dataSource,    setDataSource]   = useState<string | null>(null);

  // Active Symbol Lot Sizing & Settings (starts at minimum for each instrument)
  const [lotSize, setLotSize] = useState(0.01);
  const [activeTimeframe, setActiveTimeframe] = useState<"1m" | "5m" | "15m" | "1H" | "4H" | "1D">("15m");

  // ── Refs ─────────────────────────────────────────────────────────────────
  const trackerRef    = useRef(new TradeTracker());
  const liveFeedRef   = useRef<LiveDataFeed | null>(null);
  const playTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const displayRef    = useRef<Candle[]>([]);

  useEffect(() => { displayRef.current = displayCandles; }, [displayCandles]);

  // Fetch saved sessions and user theme preferences from MongoDB on mount
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/backtesting/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (e) {
      console.error("Failed to fetch backtesting sessions from DB", e);
    }
  }, []);

  useEffect(() => {
    fetchSessions();

    // Fetch theme & chart settings preferences from user-data endpoint
    async function loadPreferences() {
      try {
        const res = await fetch("/api/user-data");
        if (res.ok) {
          const data = await res.json();
          if (data?.preferences?.backtestChartSettings) {
            setChartSettings((prev) => ({
              ...prev,
              ...data.preferences.backtestChartSettings,
            }));
          }
        }
      } catch (e) {
        console.error("Failed to load user preferences", e);
      }
    }
    loadPreferences();
  }, [fetchSessions]);

  const handleSettingsChange = async (newSettings: Partial<typeof chartSettings>) => {
    const updated = { ...chartSettings, ...newSettings };
    setChartSettings(updated);

    try {
      const resGet = await fetch("/api/user-data");
      const current = resGet.ok ? await resGet.json() : {};
      const updatedPrefs = {
        ...(current.preferences || {}),
        backtestChartSettings: updated,
      };

      await fetch("/api/user-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: updatedPrefs }),
      });
    } catch (e) {
      console.error("Failed to save chart settings preferences to DB", e);
    }
  };

  // ── Replay Helpers ──
  function stopPlayTimer() {
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
  }

  function startPlayTimer(speed: ReplaySpeed) {
    stopPlayTimer();
    const ms = SPEED_INTERVALS[String(speed)] ?? 1000;
    playTimerRef.current = setInterval(() => {
      setReplay((s) => {
        const next = stepForward(s, displayRef.current.length - 1);
        if (next.currentIdx >= displayRef.current.length - 1) {
          clearInterval(playTimerRef.current!);
          playTimerRef.current = null;
          return pausePlaying(next);
        }
        return next;
      });
    }, ms);
  }

  // ── Session Operations ──
  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleCreateSession = async (data: Omit<Session, "id" | "createdAt" | "trades" | "drawings">) => {
    try {
      const res = await fetch("/api/backtesting/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created: Session = await res.json();
        setSessions((prev) => [created, ...prev]);
        setIsModalOpen(false);
        handleSelectSession(created);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to create session in DB");
      }
    } catch (e) {
      console.error("Failed to create session", e);
      setError("Network error creating session");
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      const res = await fetch(`/api/backtesting/sessions?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (e) {
      console.error("Failed to delete session", e);
    }
  };

  const handleSelectSession = useCallback(async (session: Session) => {
    setActiveSession(session);
    setClosedTrades(session.trades || []);
    setOpenTrade(null);
    setUnrealised(0);
    setDataSource(null);
    
    // Sync tracking engine with session's closed trades list and symbol
    trackerRef.current.reset();
    trackerRef.current.setSymbol(session.symbol);
    trackerRef.current.closed = [...session.trades];

    // Reset lot size to the instrument's minimum
    const spec = getLotSpec(session.symbol);
    setLotSize(spec.minLot);

    // Load data from the static CSV downloader or fall back to live API
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    stopPlayTimer();
    liveFeedRef.current?.stop();
    setReplay(initialReplayState());
    setDisplay([]);
    setRawCandles([]);
    setLiveCandle(null);
    setError(null);
    setLoading(true);
    setLoadProgress(0);
    setLoadLabel("Fetching static candles...");

    try {
      const raw = await fetchCandleRange(
        session.symbol,
        session.startDate,
        session.endDate,
        (pct, label) => { setLoadProgress(pct); setLoadLabel(label); },
        abort.signal,
      );
      const resampled = resampleCandles(raw, activeTimeframe);
      setRawCandles(raw);
      setDisplay(resampled);
      setDataSource(getLastFetchedSource());

      // Start the real-time live feed for updating the chart (Disabled)
      const feed = new LiveDataFeed(
        session.symbol,
        (candle) => setLiveCandle(candle),
        (status) => setLiveStatus(status),
      );
      liveFeedRef.current = feed;
      // feed.start(); // Turned off entirely by user request
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(String(err));
      }
    } finally {
      if (!abort.signal.aborted) {
        setLoading(false);
        setLoadProgress(100);
      }
    }
  }, [activeTimeframe]);

  const handleExitToDashboard = () => {
    stopPlayTimer();
    liveFeedRef.current?.stop();
    setActiveSession(null);
    setRawCandles([]);
    setDisplay([]);
  };

  // ── Sync drawings & trades to MongoDB ──
  const handleDrawingsChange = async (newDrawings: Drawing[]) => {
    if (!activeSession) return;
    const updated: Session = { ...activeSession, drawings: newDrawings };
    setActiveSession(updated);
    setSessions((prev) => prev.map((s) => s.id === activeSession.id ? updated : s));

    try {
      await fetch(`/api/backtesting/sessions?id=${activeSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawings: newDrawings }),
      });
    } catch (e) {
      console.error("Failed to sync drawings to DB", e);
    }
  };

  const updateActiveSessionTrades = async (newTrades: ManualTrade[]) => {
    if (!activeSession) return;
    const updated: Session = { ...activeSession, trades: newTrades };
    setActiveSession(updated);
    setSessions((prev) => prev.map((s) => s.id === activeSession.id ? updated : s));

    try {
      await fetch(`/api/backtesting/sessions?id=${activeSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trades: newTrades }),
      });
    } catch (e) {
      console.error("Failed to sync trades to DB", e);
    }
  };

  // ── Orders Placement ──
  const handleBuy = useCallback(() => {
    const candle = displayRef.current[replay.currentIdx];
    if (!candle) return;
    const entered = trackerRef.current.enter("LONG", candle, lotSize);
    if (entered) {
      setOpenTrade({ ...trackerRef.current.open! });
      setClosedTrades([...trackerRef.current.closed]);
      updateActiveSessionTrades([...trackerRef.current.closed]);
    }
  }, [replay.currentIdx, lotSize, activeSession]);

  const handleSell = useCallback(() => {
    const candle = displayRef.current[replay.currentIdx];
    if (!candle) return;
    const entered = trackerRef.current.enter("SHORT", candle, lotSize);
    if (entered) {
      setOpenTrade(trackerRef.current.open ? { ...trackerRef.current.open } : null);
      setClosedTrades([...trackerRef.current.closed]);
      updateActiveSessionTrades([...trackerRef.current.closed]);
    }
  }, [replay.currentIdx, lotSize, activeSession]);

  // Handle closing of open positions
  const handleClosePosition = () => {
    const candle = displayRef.current[replay.currentIdx];
    if (!candle) return;
    const closed = trackerRef.current.close(candle);
    if (closed) {
      setOpenTrade(null);
      setClosedTrades([...trackerRef.current.closed]);
      updateActiveSessionTrades([...trackerRef.current.closed]);
    }
  };

  // Update floating P&L on replay candle changes
  useEffect(() => {
    if (!openTrade) { setUnrealised(0); return; }
    const candle = displayCandles[replay.currentIdx];
    if (candle) setUnrealised(trackerRef.current.unrealizedPnl(candle.close));
  }, [replay.currentIdx, openTrade, displayCandles]);

  // Clean play timers on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      liveFeedRef.current?.stop();
      stopPlayTimer();
      clearCandleCache();
    };
  }, []);

  // ── Timeframe resampling without re-fetching ──
  const handleTimeframeChange = (tf: typeof activeTimeframe) => {
    setActiveTimeframe(tf);
    if (rawCandles.length === 0) return;

    const resampled = resampleCandles(rawCandles, tf);
    setDisplay(resampled);
    stopPlayTimer();

    setReplay(prev => {
      // If replay was not active, just reset normally
      if (!prev.active) return initialReplayState();

      // Replay IS active — remap startIdx and currentIdx to the new timeframe
      // by finding the nearest candle time in the resampled array.
      const startTime   = displayRef.current[prev.startIdx]?.time;
      const currentTime = displayRef.current[prev.currentIdx]?.time;

      const findIdx = (t: number | undefined) => {
        if (!t) return 0;
        // Find index of first resampled candle at or after the stored time
        const i = resampled.findIndex(c => c.time >= t);
        return i === -1 ? resampled.length - 1 : i;
      };

      const newStart   = findIdx(startTime);
      const newCurrent = Math.max(newStart, findIdx(currentTime));

      return {
        ...prev,
        startIdx:   newStart,
        currentIdx: newCurrent,
        playing:    false,   // always pause on TF change
      };
    });
  };

  // ── Replay Actions ──
  const handleSelectStart = useCallback(() => {
    setReplay((s) => enterSelectMode(s));
  }, []);

  const handleStartBarSelect = useCallback((idx: number) => {
    setReplay((s) => confirmStartBar(s, idx));
    liveFeedRef.current?.stop();
    setLiveStatus("stopped");
  }, []);

  const handlePlay = useCallback(() => {
    setReplay((s) => {
      const next = startPlaying(s);
      startPlayTimer(next.speed);
      return next;
    });
  }, []);

  const handlePause = useCallback(() => {
    stopPlayTimer();
    setReplay(pausePlaying);
  }, []);

  const handleNext = useCallback(() => {
    setReplay((s) => stepForward(s, displayRef.current.length - 1));
  }, []);

  const handlePrev = useCallback(() => {
    setReplay(stepBack);
  }, []);

  const handleJumpToStart = useCallback(() => {
    stopPlayTimer();
    setReplay(jumpToStart);
  }, []);

  // Restart from the very first candle of the replay (sets currentIdx back to startIdx)
  const handleRestartFromStart = useCallback(() => {
    stopPlayTimer();
    setReplay(s => ({ ...s, currentIdx: s.startIdx, playing: false }));
  }, []);

  const handleSpeedChange = useCallback((speed: ReplaySpeed) => {
    setReplay((s) => {
      const next = setSpeed(s, speed);
      if (next.playing) startPlayTimer(speed);
      return next;
    });
  }, []);

  const handleStop = useCallback(() => {
    stopPlayTimer();
    trackerRef.current.reset();
    setReplay(stopReplay());
    setOpenTrade(null);
    setClosedTrades([]);
    setUnrealised(0);
    updateActiveSessionTrades([]);
    
    if (displayCandles.length > 0 && activeSession) {
      const feed = new LiveDataFeed(
        activeSession.symbol,
        (candle) => setLiveCandle(candle),
        (status) => setLiveStatus(status),
      );
      liveFeedRef.current = feed;
      feed.start();
    }
  }, [activeSession, displayCandles.length]);

  // ── Replay keyboard shortcuts ─────────────────────────────────────────────
  // Space     → Play / Pause          Home → Jump to start
  // →         → Next candle (+1/+10/+50 with Shift/Ctrl)
  // ←         → Prev candle (-1/-10/-50 with Shift/Ctrl)
  // R         → Restart from start    S → Stop replay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (!activeSession) return;
      const r = replay;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (!r.active) break;
          if (r.playing) handlePause(); else handlePlay();
          break;

        case "ArrowRight":
          e.preventDefault();
          if (!r.active || r.playing) break;
          setReplay(s => ({
            ...s,
            currentIdx: Math.min(displayRef.current.length - 1,
              s.currentIdx + (e.ctrlKey || e.metaKey ? 50 : e.shiftKey ? 10 : 1)),
          }));
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (!r.active || r.playing) break;
          setReplay(s => ({
            ...s,
            currentIdx: Math.max(s.startIdx,
              s.currentIdx - (e.ctrlKey || e.metaKey ? 50 : e.shiftKey ? 10 : 1)),
            playing: false,
          }));
          break;

        case "Home":
          e.preventDefault();
          if (r.active) handleJumpToStart();
          break;

        case "r": case "R":
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); if (r.active) handleRestartFromStart(); }
          break;

        case "s": case "S":
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); if (r.active) handleStop(); }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [replay, activeSession, handlePlay, handlePause, handleJumpToStart,
      handleRestartFromStart, handleStop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived real-time session stats
  const activeMetrics = useMemo(() => {
    if (!activeSession) return { totalTrades: 0, winRate: 0, totalPnl: 0, profitFactor: 0 };
    return computeMetrics(closedTrades, activeSession.startingBalance);
  }, [closedTrades, activeSession]);

  const currentCandle = replay.active && displayCandles[replay.currentIdx]
    ? displayCandles[replay.currentIdx]
    : null;

  const currentPrice = currentCandle ? currentCandle.close : (liveCandle ? liveCandle.close : 0);

  // ── Render Dashboard Mode (Active Session is null) ──
  if (!activeSession) {
    return (
      <div className="w-full h-full relative">
        <SessionDashboard
          sessions={sessions}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onOpenNewSessionModal={handleOpenModal}
        />
        <NewSessionModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onCreate={handleCreateSession}
        />
      </div>
    );
  }

  // ── Render Chart View Mode (Active Session is active) ──
  return (
    <div className="flex flex-col w-full h-full bg-[#0f0f0f] overflow-hidden text-white/75">
      
      {/* ── Active Session top bar header (Image 2 styling) ── */}
      <div className="h-14 shrink-0 bg-[#0f0f0f] border-b border-white/[0.08] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleExitToDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.20] text-white/45 hover:text-white transition-all text-xs font-bold active:scale-95"
            title="Exit Session"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Sessions
          </button>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white uppercase tracking-tight">{activeSession.symbol}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/[0.06] text-white/65 font-bold border border-white/[0.08]">Active</span>
              <span className="text-[10px] text-white/35 font-mono">Lev {activeSession.leverage}</span>
            </div>
            <span className="text-[9px] text-white/30 font-mono">{activeSession.name}</span>
          </div>
        </div>

        {/* Live balance and P&L indicators */}
        <div className="flex items-center gap-6 text-xs font-mono select-none">
          <div className="flex flex-col">
            <span className="text-white/40 text-[9px] uppercase font-semibold">Balance</span>
            <span className="text-white font-bold">${(activeSession.startingBalance + activeMetrics.totalPnl).toFixed(2)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-white/40 text-[9px] uppercase font-semibold">P&L</span>
            <span className={`font-bold ${activeMetrics.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {activeMetrics.totalPnl >= 0 ? "+" : ""}${activeMetrics.totalPnl.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Timeframe selector header section */}
        <div className="flex items-center gap-3">
          {/* Timeframe switchers */}
          <div className="flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
            {(["1m", "5m", "15m", "1H", "4H", "1D"] as const).map((tf) => (
              <button
                key={tf}
                disabled={isLoading}
                onClick={() => handleTimeframeChange(tf)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${
                  activeTimeframe === tf
                    ? "bg-white/[0.10] text-white"
                    : "text-white/40 hover:text-white"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress loaders */}
      {isLoading && (
        <div className="shrink-0 bg-white/[0.04] border-b border-white/[0.06] px-4 py-2 text-xs flex items-center gap-3">
          <span className="h-3 w-3 border-2 border-white/[0.15] border-t-white/70 rounded-full animate-spin" />
          <span className="text-white/65 font-mono">{loadProgress}% {loadLabel}</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="shrink-0 bg-red-950/25 border-b border-red-900/20 px-4 py-2 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Main Workspace Body (Chart + Replay controls + Order panel) ── */}
      <div className="flex-1 min-h-0 flex w-full relative">
        
        {/* Left Side: Chart Canvas & Bottom controls */}
        <div className="flex-1 min-w-0 flex flex-col h-full bg-[#0f0f0f]">
          
          {/* Lightweight-charts Canvas Overlay Container */}
          <div className="flex-1 min-h-0 relative w-full">
            <BacktestChart
              symbol={activeSession.symbol}
              timeframe={activeTimeframe}
              settings={chartSettings}
              onSettingsChange={handleSettingsChange}
              candles={displayCandles}
              replayIndex={replay.active ? replay.currentIdx : null}
              replayStartIndex={replay.active ? replay.startIdx : null}
              isSelectingStart={replay.selectingStart}
              onStartBarSelect={handleStartBarSelect}
              manualTrades={closedTrades}
              openTrade={openTrade}
              openTradeUnrealised={unrealised}
              liveCandle={liveCandle}
              liveStatus={liveStatus}
              isInReplay={replay.active}
              onBuy={handleBuy}
              onSell={handleSell}
              
              // Custom drawings canvas support
              drawings={activeSession.drawings || []}
              onDrawingsChange={handleDrawingsChange}
              onRRDrawingSelect={setRRDrawing}
            />

            {/* Floating Replay Controls (Curved Island Floating at bottom middle of chart) */}
            {displayCandles.length > 0 && (
              <ReplayBar
                replay={replay}
                currentCandle={currentCandle}
                totalCandles={displayCandles.length}
                hasData={displayCandles.length > 0}
                onSelectStart={handleSelectStart}
                onPlay={handlePlay}
                onPause={handlePause}
                onNext={handleNext}
                onPrev={handlePrev}
                onJumpToStart={handleJumpToStart}
                onRestartFromStart={handleRestartFromStart}
                onStop={handleStop}
                onSpeedChange={handleSpeedChange}
              />
            )}
          </div>

          {/* Bottom Open Positions Panel */}
          {openTrade && (
            <div className="h-16 bg-[#0f0f0f] border-t border-white/[0.08] px-4.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Active Position</span>
                <div className="font-mono flex items-center gap-3">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    openTrade.direction === "LONG" 
                      ? "bg-green-500/15 text-green-400" 
                      : "bg-red-500/15 text-red-400"
                  }`}>
                    {openTrade.direction}
                  </span>
                  <span>Lots: <b className="text-white">{openTrade.lotSize}</b></span>
                  <span>Entry: <b className="text-white">{formatPrice(openTrade.entryPrice)}</b></span>
                  <span>Floating P&L: <b className={unrealised >= 0 ? "text-green-500" : "text-red-500"}>
                    {unrealised >= 0 ? "+" : ""}${unrealised.toFixed(2)}
                  </b></span>
                </div>
              </div>

              <button
                onClick={handleClosePosition}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all active:scale-95 shadow-md shadow-red-950/20"
              >
                Close Position
              </button>
            </div>
          )}
        </div>

        {/* Right Side: High-Premium Execution Sidebar Panel */}
        <div className="w-64 border-l border-white/[0.08] bg-[#0f0f0f] shrink-0 h-full">
          <ExecutionPanel
            symbol={activeSession.symbol}
            currentPrice={currentPrice}
            lotSize={lotSize}
            onLotSizeChange={(v) => {
              const spec = getLotSpec(activeSession.symbol);
              setLotSize(snapLot(v, spec));
            }}
            onBuy={handleBuy}
            onSell={handleSell}

            // R/R drawing from chart selection
            rrDrawing={rrDrawing}
            onOpenRROrder={(side) => side === "buy" ? handleBuy() : handleSell()}

            // Stats feeds
            totalTrades={activeMetrics.totalTrades}
            winRate={activeMetrics.winRate}
            totalPnl={activeMetrics.totalPnl}
            profitFactor={activeMetrics.profitFactor}
          />
        </div>
      </div>
    </div>
  );
}
