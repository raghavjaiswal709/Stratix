"use client";

// ─── DataPage ────────────────────────────────────────────────────────────────
// Full-featured data explorer: browse all 14 instruments with the same
// BacktestChart canvas (all drawing tools, indicators, sessions etc.) but
// without the replay / trading engine.  Data is fetched via the same
// three-tier cache: memory → IndexedDB → Dukascopy API.

import { useState, useRef, useCallback, useEffect } from "react";
import type { Candle, InstrumentKey, Timeframe, Drawing } from "@/components/backtesting/types";
import { INSTRUMENTS } from "@/components/backtesting/types";
import { fetchCandleRange, resampleCandles, getLastFetchedSource } from "@/components/backtesting/dataFetcher";
import { BacktestChart } from "@/components/backtesting/BacktestChart";
import {
  AlertTriangle, ChevronDown, Database, RefreshCw, BarChart2,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Returns the calendar day AFTER the given YYYY-MM-DD string.
// Used as the exclusive upper-bound for fetchCandleRange so that all
// candles on `date` (which can be 23:59 IST = 18:29 UTC) are included.
function nextDayStr(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function monthsAgoStr(n: number) {
  const d = new Date();
  // For fractional months (1W = 0.25) convert to days
  if (n < 1) {
    d.setDate(d.getDate() - Math.round(n * 30));
  } else {
    d.setMonth(d.getMonth() - Math.round(n));
  }
  return d.toISOString().slice(0, 10);
}

// ── Module level Cache to persist data across page navigations/remounts ──
let pageCache: {
  instrument: InstrumentKey;
  fromDate: string;
  toDate: string;
  rawCandles: Candle[];
  dataSource: string | null;
} | null = null;

// ── Component ─────────────────────────────────────────────────────────────────

export function DataPage() {
  // ── Controls ──
  const [instrument, setInstrument] = useState<InstrumentKey>(() => pageCache?.instrument || "xauusd");
  const [fromDate, setFromDate]     = useState(() => pageCache?.fromDate || monthsAgoStr(1));
  const [toDate, setToDate]         = useState(() => pageCache?.toDate || todayStr());
  const [timeframe, setTimeframe]   = useState<Timeframe>("15m");

  // ── Data ──
  const [rawCandles,     setRawCandles]     = useState<Candle[]>(() => pageCache?.rawCandles || []);
  const [displayCandles, setDisplayCandles] = useState<Candle[]>(() => pageCache ? resampleCandles(pageCache.rawCandles, "15m") : []);
  const [isLoading,      setIsLoading]      = useState(false);
  const [loadProgress,   setLoadProgress]   = useState(0);
  const [loadLabel,      setLoadLabel]      = useState("");
  const [error,          setError]          = useState<string | null>(null);
  const [dataSource,     setDataSource]     = useState<string | null>(() => pageCache?.dataSource || null);
  const [drawings,       setDrawings]       = useState<Drawing[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  // ── Chart settings (persisted to user-data like backtesting) ──
  const [chartSettings, setChartSettings] = useState({
    themeName:      "Emerald Bull",
    upColor:        "#10b981",
    downColor:      "#ef4444",
    showGrid:       true,
    showVolume:     true,
    isYAxisLocked:  false,
    isMagnetActive: false,
    bgColor:        "#0f0f0f",
    favoriteTools:  [] as string[],
    drawingTemplates: [] as {
      id: string; name: string; type: string; color: string;
      strokeWidth?: number; fillOpacity?: number; text?: string;
      textColor?: string; textPosition?: string; fontSize?: number;
    }[],
  });

  // Load persisted chart settings on mount
  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch("/api/user-data");
        if (res.ok) {
          const data = await res.json();
          if (data?.preferences?.dataChartSettings) {
            setChartSettings(prev => ({ ...prev, ...data.preferences.dataChartSettings }));
          }
        }
      } catch { /* silent */ }
    }
    loadPrefs();
  }, []);

  const handleSettingsChange = async (newSettings: Partial<typeof chartSettings>) => {
    const updated = { ...chartSettings, ...newSettings };
    setChartSettings(updated);
    try {
      const resGet = await fetch("/api/user-data");
      const current = resGet.ok ? await resGet.json() : {};
      await fetch("/api/user-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            ...(current.preferences || {}),
            dataChartSettings: updated,
          },
        }),
      });
    } catch { /* silent */ }
  };

  // ── Fetch ──
  const fetchData = useCallback(async (
    sym: InstrumentKey,
    from: string,
    to: string,
    tf: Timeframe,
  ) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setIsLoading(true);
    setLoadProgress(0);
    setLoadLabel("Fetching data…");
    setError(null);
    setRawCandles([]);
    setDisplayCandles([]);
    setDataSource(null);

    try {
      // Pass nextDayStr(to) as the exclusive upper bound so the filter in
      // fetchCandleRange (`c.time >= toTs`) does NOT cut off candles that fall
      // on `to` itself.  Example: toDate="2026-06-11" → exclusive ceiling is
      // "2026-06-12T00:00:00Z" so every June-11 candle (including 23:59 IST)
      // is included.
      const exclusiveTo = nextDayStr(to);
      const raw = await fetchCandleRange(
        sym, from, exclusiveTo,
        (pct, label) => { setLoadProgress(pct); setLoadLabel(label); },
        abort.signal,
      );
      const resampled = resampleCandles(raw, tf);
      setRawCandles(raw);
      setDisplayCandles(resampled);
      const src = getLastFetchedSource();
      setDataSource(src);
      
      // Update pageCache
      pageCache = {
        instrument: sym,
        fromDate: from,
        toDate: to,
        rawCandles: raw,
        dataSource: src
      };
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(String(err));
      }
    } finally {
      if (!abort.signal.aborted) {
        setIsLoading(false);
        setLoadProgress(100);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    // If we have matching page cache, restore it and skip fetching
    if (pageCache && 
        pageCache.instrument === instrument && 
        pageCache.fromDate === fromDate && 
        pageCache.toDate === toDate) {
      setDisplayCandles(resampleCandles(pageCache.rawCandles, timeframe));
      return;
    }
    fetchData(instrument, fromDate, toDate, timeframe);
    return () => { abortRef.current?.abort(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resample without re-fetching when only timeframe changes (and we have data)
  const handleTimeframeChange = (tf: Timeframe) => {
    setTimeframe(tf);
    if (rawCandles.length > 0) {
      setDisplayCandles(resampleCandles(rawCandles, tf));
    }
  };

  // Full reload when symbol / date changes
  const handleLoad = () => {
    fetchData(instrument, fromDate, toDate, timeframe);
  };

  // ── Stats ──
  const stats = (() => {
    if (displayCandles.length === 0) return null;
    const first = displayCandles[0];
    const last  = displayCandles[displayCandles.length - 1];
    const hi    = displayCandles.reduce((m, c) => Math.max(m, c.high),  -Infinity);
    const lo    = displayCandles.reduce((m, c) => Math.min(m, c.low),   Infinity);
    const chg   = ((last.close - first.open) / first.open) * 100;
    return { first, last, hi, lo, chg };
  })();

  const instrInfo = INSTRUMENTS.find(i => i.key === instrument);

  return (
    <div className="flex flex-col w-full h-full bg-[#0f0f0f] overflow-hidden text-white/80">

      {/* ── Top controls bar ── */}
      <div className="h-12 shrink-0 bg-[#0f0f0f] border-b border-white/[0.08] flex items-center gap-2 px-3">

        {/* Page title */}
        <div className="flex items-center gap-2 mr-2">
          <Database className="w-4 h-4 text-white/30 shrink-0" />
          <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest">Data Explorer</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08] shrink-0" />

        {/* Instrument selector */}
        <div className="relative shrink-0">
          <select
            value={instrument}
            onChange={e => setInstrument(e.target.value as InstrumentKey)}
            className="appearance-none bg-white/[0.05] border border-white/[0.10] text-white text-[11px] font-bold uppercase rounded-md pl-2 pr-7 py-1.5 cursor-pointer hover:border-white/[0.22] focus:outline-none focus:border-white/[0.30] transition-all"
          >
            {INSTRUMENTS.map(({ key, label, description }) => (
              <option key={key} value={key}>{label} — {description}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={e => setFromDate(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.09] text-white/70 text-[10px] font-mono rounded-md px-2 py-1.5 cursor-pointer hover:border-white/[0.20] focus:outline-none focus:border-white/[0.28] transition-all w-32"
          />
          <span className="text-white/25 text-[10px]">→</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={todayStr()}
            onChange={e => setToDate(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.09] text-white/70 text-[10px] font-mono rounded-md px-2 py-1.5 cursor-pointer hover:border-white/[0.20] focus:outline-none focus:border-white/[0.28] transition-all w-32"
          />
        </div>

        {/* Quick range buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {([["1W", 0.25], ["1M", 1], ["3M", 3], ["6M", 6], ["1Y", 12], ["2Y", 24]] as [string, number][]).map(([lbl, mo]) => (
            <button
              key={lbl}
              onClick={() => {
                const f = monthsAgoStr(mo);
                setFromDate(f);
                setToDate(todayStr());
              }}
              className="px-2 py-1 text-[9px] font-bold rounded text-white/35 hover:text-white hover:bg-white/[0.07] transition-all"
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Timeframe switcher */}
        <div className="flex p-0.5 rounded bg-white/[0.04] border border-white/[0.08] shrink-0 ml-1">
          {(["1m", "5m", "15m", "1H", "4H", "1D"] as Timeframe[]).map(tf => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all ${
                timeframe === tf ? "bg-white/[0.10] text-white" : "text-white/40 hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Load button */}
        <button
          onClick={handleLoad}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-md bg-white/[0.07] border border-white/[0.12] text-white/70 hover:text-white hover:bg-white/[0.12] hover:border-white/[0.22] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 ml-1 shrink-0"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Loading…" : "Load"}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats strip */}
        {stats && (
          <div className="hidden xl:flex items-center gap-4 text-[10px] font-mono shrink-0">
            <span className="text-white/30">{instrInfo?.label}</span>
            <span className="text-white/50">O <b className="text-white/80">{stats.first.open.toFixed(2)}</b></span>
            <span className="text-white/50">H <b className="text-emerald-400">{stats.hi.toFixed(2)}</b></span>
            <span className="text-white/50">L <b className="text-red-400">{stats.lo.toFixed(2)}</b></span>
            <span className="text-white/50">C <b className="text-white/80">{stats.last.close.toFixed(2)}</b></span>
            <span className={`font-bold ${stats.chg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {stats.chg >= 0 ? "+" : ""}{stats.chg.toFixed(2)}%
            </span>
            <span className="text-white/25">{displayCandles.length.toLocaleString()} bars</span>
            {dataSource && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-white/[0.06] text-white/30 border border-white/[0.06]">
                {dataSource}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Progress bar ── */}
      {isLoading && (
        <div className="shrink-0 bg-white/[0.03] border-b border-white/[0.06] px-4 py-2 text-xs flex items-center gap-3">
          <span className="h-3 w-3 border-2 border-white/[0.15] border-t-white/70 rounded-full animate-spin" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/55 font-mono text-[10px] truncate">{loadLabel}</span>
              <span className="text-white/35 font-mono text-[10px] shrink-0 ml-2">{loadProgress}%</span>
            </div>
            <div className="h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500/60 transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="shrink-0 bg-red-950/25 border-b border-red-900/20 px-4 py-2 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && !error && displayCandles.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/20">
          <BarChart2 className="w-16 h-16 opacity-20" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white/30">No data loaded</p>
            <p className="text-xs mt-1 text-white/15">Select an instrument and date range, then click <b className="text-white/25">Load</b></p>
          </div>
        </div>
      )}

      {/* ── Chart ── */}
      {displayCandles.length > 0 && (
        <div className="flex-1 min-h-0 relative">
          <BacktestChart
            symbol={instrument}
            timeframe={timeframe}
            candles={displayCandles}
            settings={chartSettings}
            onSettingsChange={handleSettingsChange}
            replayIndex={null}
            replayStartIndex={null}
            isSelectingStart={false}
            onStartBarSelect={() => {}}
            manualTrades={[]}
            openTrade={null}
            openTradeUnrealised={0}
            liveCandle={null}
            liveStatus="stopped"
            isInReplay={false}
            onBuy={() => {}}
            onSell={() => {}}
            drawings={drawings}
            onDrawingsChange={setDrawings}
          />
        </div>
      )}
    </div>
  );
}
