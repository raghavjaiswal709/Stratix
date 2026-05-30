"use client";

// ─── BacktestingPage ──────────────────────────────────────────────────────────
// Orchestrates: ControlsBar → load data → ReplayBar → BacktestChart + ResultsPanel.
// Manages replay state, live feed, and manual trade tracking.

import { useState, useRef, useCallback, useEffect } from "react";
import type { Candle, ControlsState, ReplayState, LiveStatus, ManualTrade, ReplaySpeed } from "./types";
import { fetchCandleRange, clearCandleCache, resampleCandles } from "./dataFetcher";
import {
  initialReplayState, enterSelectMode, confirmStartBar,
  stepForward, stepBack, jumpToStart, startPlaying, pausePlaying, stopReplay,
  setSpeed, SPEED_INTERVALS,
} from "./replayEngine";
import { LiveDataFeed }  from "./liveDataFeed";
import { TradeTracker }  from "./tradeTracker";
import { BacktestChart } from "./BacktestChart";
import { ControlsBar }   from "./ControlsBar";
import { ReplayBar }     from "./ReplayBar";
import { ResultsPanel }  from "./ResultsPanel";

// ── Default controls ──────────────────────────────────────────────────────────
const defaultControls = (): ControlsState => {
  const to   = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  return {
    instrument: "xauusd",
    fromDate:   from.toISOString().slice(0, 10),
    toDate:     to.toISOString().slice(0, 10),
    timeframe:  "1H",
    lotSize:    1_000,
  };
};

const INITIAL_CAPITAL = 10_000;

export function BacktestingPage() {
  // ── State ────────────────────────────────────────────────────────────────
  const [controls,      setControls]     = useState<ControlsState>(defaultControls);
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

  // ── Refs ─────────────────────────────────────────────────────────────────
  const trackerRef    = useRef(new TradeTracker());
  const liveFeedRef   = useRef<LiveDataFeed | null>(null);
  const playTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  const displayRef    = useRef<Candle[]>([]);  // mirror for use inside timers

  // Keep displayRef in sync
  useEffect(() => { displayRef.current = displayCandles; }, [displayCandles]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const handleLoad = useCallback(async (ctrl?: ControlsState) => {
    const c = ctrl ?? controls;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    stopPlayTimer();
    liveFeedRef.current?.stop();
    trackerRef.current.reset();
    setReplay(initialReplayState());
    setOpenTrade(null);
    setClosedTrades([]);
    setUnrealised(0);
    setDisplay([]);
    setRawCandles([]);
    setLiveCandle(null);
    setError(null);
    setLoading(true);
    setLoadProgress(0);
    setLoadLabel("Starting…");

    try {
      const raw = await fetchCandleRange(
        c.instrument, c.fromDate, c.toDate,
        (pct, label) => { setLoadProgress(pct); setLoadLabel(label); },
        abort.signal,
      );
      const resampled = resampleCandles(raw, c.timeframe);
      setRawCandles(raw);
      setDisplay(resampled);

      // Start live feed
      const feed = new LiveDataFeed(
        c.instrument,
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
  }, [controls]);

  // ── Timeframe change (resample without re-fetching) ───────────────────────
  const handleTimeframeChange = useCallback((tf: string) => {
    setControls((prev) => {
      const next = { ...prev, timeframe: tf as ControlsState["timeframe"] };
      if (rawCandles.length > 0) {
        const resampled = resampleCandles(rawCandles, next.timeframe);
        setDisplay(resampled);
        stopPlayTimer();
        setReplay(initialReplayState());
      }
      return next;
    });
  }, [rawCandles]);

  // ── Controls change handler ──────────────────────────────────────────────
  const handleChange = useCallback((next: Partial<ControlsState>) => {
    if ("timeframe" in next && next.timeframe) {
      handleTimeframeChange(next.timeframe);
    } else {
      setControls((prev) => ({ ...prev, ...next }));
    }
  }, [handleTimeframeChange]);

  // ── Play timer helpers ────────────────────────────────────────────────────
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
          // Reached end — stop
          clearInterval(playTimerRef.current!);
          playTimerRef.current = null;
          return pausePlaying(next);
        }
        return next;
      });
    }, ms);
  }

  // ── Replay actions ────────────────────────────────────────────────────────
  const handleSelectStart = useCallback(() => {
    setReplay((s) => enterSelectMode(s));
  }, []);

  const handleStartBarSelect = useCallback((idx: number) => {
    setReplay((s) => confirmStartBar(s, idx));
    // Pause live feed during replay
    liveFeedRef.current?.stop();
    setLiveStatus("stopped");
  }, []);

  const handlePlay = useCallback(() => {
    setReplay((s) => {
      const next = startPlaying(s);
      startPlayTimer(next.speed);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = useCallback(() => {
    stopPlayTimer();
    trackerRef.current.reset();
    setReplay(stopReplay());
    setOpenTrade(null);
    setClosedTrades([]);
    setUnrealised(0);
    // Resume live feed
    if (displayCandles.length > 0) {
      const feed = new LiveDataFeed(
        controls.instrument,
        (candle) => setLiveCandle(candle),
        (status) => setLiveStatus(status),
      );
      liveFeedRef.current = feed;
      feed.start();
    }
  }, [controls.instrument, displayCandles.length]);

  // ── Manual trade actions ──────────────────────────────────────────────────
  const handleBuy = useCallback(() => {
    const candle = displayRef.current[replay.currentIdx];
    if (!candle) return;
    const entered = trackerRef.current.enter("LONG", candle, controls.lotSize);
    if (entered) {
      setOpenTrade({ ...trackerRef.current.open! });
      setClosedTrades([...trackerRef.current.closed]);
    }
  }, [replay.currentIdx, controls.lotSize]);

  const handleSell = useCallback(() => {
    const candle = displayRef.current[replay.currentIdx];
    if (!candle) return;
    const entered = trackerRef.current.enter("SHORT", candle, controls.lotSize);
    if (entered) {
      setOpenTrade(trackerRef.current.open ? { ...trackerRef.current.open } : null);
      setClosedTrades([...trackerRef.current.closed]);
    }
  }, [replay.currentIdx, controls.lotSize]);

  // ── Update unrealised P&L on each new replay bar ─────────────────────────
  useEffect(() => {
    if (!openTrade) { setUnrealised(0); return; }
    const candle = displayCandles[replay.currentIdx];
    if (candle) setUnrealised(trackerRef.current.unrealizedPnl(candle.close));
  }, [replay.currentIdx, openTrade, displayCandles]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      liveFeedRef.current?.stop();
      stopPlayTimer();
      clearCandleCache();
    };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentCandle = replay.active && displayCandles[replay.currentIdx]
    ? displayCandles[replay.currentIdx]
    : null;

  return (
    <div className="flex flex-col w-full h-full bg-[#0c0e14] overflow-hidden">
      {/* ── Controls bar ────────────────────────────────────────────────── */}
      <ControlsBar
        controls={controls}
        onChange={handleChange}
        onLoad={() => handleLoad()}
        isLoading={isLoading}
        progress={loadProgress}
        loadLabel={loadLabel}
      />

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div className="shrink-0 bg-red-900/20 border-b border-red-800/50 px-4 py-2 text-[12px] text-red-400">
          ⚠ {error}
        </div>
      )}

      {/* ── Replay bar (only when data loaded) ──────────────────────────── */}
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
          onStop={handleStop}
          onSpeedChange={handleSpeedChange}
        />
      )}

      {/* ── Main content: chart + results ───────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Chart — 65% */}
        <div className="flex-[65] min-w-0 h-full">
          <BacktestChart
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
          />
        </div>

        {/* Divider */}
        <div className="w-px bg-[#2a2a2a] shrink-0" />

        {/* Results — 35% */}
        <div className="flex-[35] min-w-0 h-full bg-[#0f0f0f] overflow-y-auto">
          <ResultsPanel
            trades={closedTrades}
            initialCapital={INITIAL_CAPITAL}
          />
        </div>
      </div>
    </div>
  );
}
