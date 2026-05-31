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

export function BacktestingPage() {
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

  // Active Symbol Lot Sizing & Settings
  const [lotSize, setLotSize] = useState(10);
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
    
    // Sync tracking engine with session's closed trades list
    trackerRef.current.reset();
    trackerRef.current.closed = [...session.trades];

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

      // Start the real-time live feed for updating the chart
      const feed = new LiveDataFeed(
        session.symbol,
        (candle) => setLiveCandle(candle),
        (status) => setLiveStatus(status),
      );
      liveFeedRef.current = feed;
      feed.start();
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
    if (rawCandles.length > 0) {
      const resampled = resampleCandles(rawCandles, tf);
      setDisplay(resampled);
      stopPlayTimer();
      setReplay(initialReplayState());
    }
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
    <div className="flex flex-col w-full h-full bg-[#0c0e14] overflow-hidden text-gray-200">
      
      {/* ── Active Session top bar header (Image 2 styling) ── */}
      <div className="h-14 shrink-0 bg-[#0c0e14] border-b border-[#23262f] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleExitToDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#23262f] hover:border-gray-500 text-gray-400 hover:text-white transition-all text-xs font-bold active:scale-95"
            title="Exit Session"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Sessions
          </button>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white uppercase tracking-tight">{activeSession.symbol}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-400 font-bold border border-blue-500/15">Active</span>
              <span className="text-[10px] text-gray-500 font-mono">Lev {activeSession.leverage}</span>
            </div>
            <span className="text-[9px] text-gray-600 font-mono">{activeSession.name}</span>
          </div>
        </div>

        {/* Live balance and P&L indicators */}
        <div className="flex items-center gap-6 text-xs font-mono select-none">
          <div className="flex flex-col">
            <span className="text-gray-500 text-[9px] uppercase font-semibold">Balance</span>
            <span className="text-white font-bold">${(activeSession.startingBalance + activeMetrics.totalPnl).toFixed(2)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-gray-500 text-[9px] uppercase font-semibold">P&L</span>
            <span className={`font-bold ${activeMetrics.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
              {activeMetrics.totalPnl >= 0 ? "+" : ""}${activeMetrics.totalPnl.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Timeframe selector header section */}
        <div className="flex items-center gap-3">
          {/* Timeframe switchers */}
          <div className="flex p-0.5 rounded-lg bg-[#141720] border border-[#23262f]">
            {(["1m", "5m", "15m", "1H", "4H", "1D"] as const).map((tf) => (
              <button
                key={tf}
                disabled={isLoading}
                onClick={() => handleTimeframeChange(tf)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all ${
                  activeTimeframe === tf
                    ? "bg-[#2563eb] text-white"
                    : "text-gray-400 hover:text-white"
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
        <div className="shrink-0 bg-blue-900/10 border-b border-blue-900/20 px-4 py-2 text-xs flex items-center gap-3">
          <span className="h-3 w-3 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-blue-400 font-mono">{loadProgress}% {loadLabel}</span>
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
        <div className="flex-1 min-w-0 flex flex-col h-full bg-[#0c0e14]">
          
          {/* Replay Controls (Docked right under header if replay is running) */}
          {displayCandles.length > 0 && (
            <div className="h-11 shrink-0 bg-[#0c0e14] border-b border-[#23262f]">
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
                onStop={handleStop}
                onSpeedChange={handleSpeedChange}
              />
            </div>
          )}

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
            />
          </div>

          {/* Bottom Open Positions Panel */}
          {openTrade && (
            <div className="h-16 bg-[#0c0e14] border-t border-[#23262f] px-4.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Active Position</span>
                <div className="font-mono flex items-center gap-3">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    openTrade.direction === "LONG" 
                      ? "bg-green-500/15 text-green-400" 
                      : "bg-red-500/15 text-red-400"
                  }`}>
                    {openTrade.direction}
                  </span>
                  <span>Lots: <b className="text-white">{openTrade.lotSize}</b></span>
                  <span>Entry: <b className="text-white">{openTrade.entryPrice.toFixed(3)}</b></span>
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
        <div className="w-64 border-l border-[#23262f] bg-[#0c0e14] shrink-0 h-full">
          <ExecutionPanel
            symbol={activeSession.symbol}
            currentPrice={currentPrice}
            lotSize={lotSize}
            onLotSizeChange={setLotSize}
            onBuy={handleBuy}
            onSell={handleSell}
            
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
