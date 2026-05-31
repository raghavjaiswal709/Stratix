"use client";

// ─── BacktestChart ─────────────────────────────────────────────────────────────
// Renders the official TradingView Charting Widget directly inside the app!
//  • Integrates the absolute native TradingView drawing toolbar on the left.
//  • Includes all professional drawing tools, indicators, timeframes, and widgets.
//  • Synchronizes the symbol and timeframe dynamically with the dashboard.
//  • Maintains floating P&L badges and live connection status indicators.

import { useEffect, useRef, useState } from "react";
import type { Candle, ManualTrade, LiveStatus, Drawing } from "./types";

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
  
  // Custom drawings (retained in Props interface for Next.js compatibility)
  drawings?:           Drawing[];
  onDrawingsChange?:   (drawings: Drawing[]) => void;
  
  // Added for dynamic TradingView mappings
  symbol:             string;
  timeframe:          string;
}

// Map UI symbols to official TradingView codes
const getTradingViewSymbol = (sym: string): string => {
  const map: Record<string, string> = {
    xauusd: "OANDA:XAUUSD",
    xagusd: "OANDA:XAGUSD",
    eurusd: "FX:EURUSD",
    gbpusd: "FX:GBPUSD",
    usdcad: "FX:USDCAD",
    usdjpy: "FX:USDJPY",
    nzdusd: "FX:NZDUSD",
    audusd: "FX:AUDUSD",
    usdchf: "FX:USDCHF",
    ethusd: "COINBASE:ETHUSD",
    btcusdt: "BINANCE:BTCUSDT",
    dxy: "CAPITALCOM:DXY",
    usoil: "TVC:USOIL",
    us100: "NASDAQ:NDX",
  };
  return map[sym.toLowerCase()] || "FX:EURUSD";
};

// Map timeframes to TradingView resolution intervals
const getTradingViewInterval = (tf: string): string => {
  const map: Record<string, string> = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "1H": "60",
    "4H": "240",
    "1D": "D",
  };
  return map[tf] || "15";
};

export function BacktestChart({
  symbol, timeframe, openTrade, openTradeUnrealised, liveStatus,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetContainerId = "tradingview_active_widget_canvas";
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    // ── Load the TradingView Widget SDK ──
    const existingScript = document.getElementById("tradingview-widget-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "tradingview-widget-script";
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = () => setScriptLoaded(true);
      document.head.appendChild(script);
    } else {
      setScriptLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current) return;

    // Re-initialize the widget on symbol or timeframe switch
    try {
      containerRef.current.innerHTML = ""; // Clear the previous iframe to avoid duplication and overlapping issues
      new (window as any).TradingView.widget({
        autosize: true,
        symbol: getTradingViewSymbol(symbol),
        interval: getTradingViewInterval(timeframe),
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1", // Standard candlesticks representation
        locale: "en",
        toolbar_bg: "#0c0e14",
        enable_publishing: false,
        hide_side_toolbar: false, // SHOW THE FULL SIDEBAR WITH DRAWING TOOLS NATIVELY
        allow_symbol_change: true,
        container_id: containerRef.current.id,
        studies: [
          "MASimple@tv-basicstudies", // simple MA preloaded
        ],
      });
    } catch (e) {
      console.warn("Failed to initialize TradingView Widget", e);
    }
  }, [scriptLoaded, symbol, timeframe]);

  return (
    <div className="relative w-full h-full bg-[#0c0e14] flex flex-col">
      
      {/* TradingView canvas rendering target */}
      <div id={widgetContainerId} ref={containerRef} className="w-full h-full flex-1" />

      {/* Replay Active Float Badge */}
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

      {/* Active Float P&L Panel */}
      {openTrade && (
        <div className="absolute top-3 left-3 bg-[#141720]/95 border border-[#23262f] rounded-lg px-3 py-2 text-[10px] font-mono z-20 flex items-center gap-2">
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
  );
}
