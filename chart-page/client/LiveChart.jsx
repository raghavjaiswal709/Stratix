import React, { useState, useEffect } from "react";
import { PriceTicker } from "./PriceTicker.jsx";
import { ChartToolbar } from "./ChartToolbar.jsx";
import { IndicatorPanel } from "./IndicatorPanel.jsx";
import { ChartContainer } from "./ChartContainer.jsx";
import { useChartData } from "./useChartData.js";

export function LiveChart() {
  const [instrument, setInstrument] = useState("xauusd");
  const [timeframe, setTimeframe] = useState("1m");
  const [seriesType, setSeriesType] = useState("Candles"); // 'Candles', 'Line', 'Area'
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);

  const [activeIndicators, setActiveIndicators] = useState({
    sma20: false,
    sma50: false,
    sma200: false,
    ema9: false,
    ema21: false,
    bb: false,
    volume: true
  });

  // Fetch candles and ticks via orchestrator hook
  const {
    closedCandles,
    currentCandle,
    isLoading,
    feedStatus
  } = useChartData(instrument, timeframe);

  // Trigger auto-fit timescale
  const handleFitContent = () => {
    setFitTrigger((t) => t + 1);
  };

  // Toggle fullscreen state
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Toggle active indicators overlay state
  const handleToggleIndicator = (id) => {
    setActiveIndicators((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Monitor instrument switches to trigger loader safeguards
  const handleInstrumentChange = (nextSymbol) => {
    setIsSwitching(true);
    setInstrument(nextSymbol);
  };

  const handleTimeframeChange = (nextTf) => {
    setIsSwitching(true);
    setTimeframe(nextTf);
  };

  useEffect(() => {
    if (!isLoading) {
      // Small timeout to allow Lightweight Charts canvas to fully paint before clearing switching overlay
      const timer = setTimeout(() => {
        setIsSwitching(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Unique React key combines symbol + timeframe to enforce clean, flicker-free canvas resets on switches
  const renderKey = `${instrument}-${timeframe}`;

  // CSS structure for fullscreen and standard layouts
  const fullscreenClasses = isFullscreen
    ? "fixed inset-0 z-50 bg-[#0f0f0f] p-6 flex flex-col h-screen w-screen overflow-hidden"
    : "flex flex-col flex-1 w-full h-full p-4 lg:p-6 overflow-hidden bg-[#0f0f0f]";

  return (
    <div className={fullscreenClasses}>
      
      {/* 1. Real-Time Price Metrics Bar */}
      {isLoading ? (
        <div className="h-[74px] bg-[#161616] border border-[#1e1e1e] rounded-xl w-full animate-pulse flex items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <div className="h-5 w-24 bg-zinc-800 rounded" />
            <div className="h-7 w-32 bg-zinc-800 rounded" />
          </div>
          <div className="h-4 w-60 bg-zinc-800 rounded hidden md:block" />
        </div>
      ) : (
        <PriceTicker
          instrument={instrument}
          currentCandle={currentCandle}
          closedCandles={closedCandles}
          feedStatus={feedStatus}
        />
      )}

      {/* 2. Controls & timeframes switcher toolbar */}
      <ChartToolbar
        instrument={instrument}
        onInstrumentChange={handleInstrumentChange}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        seriesType={seriesType}
        onSeriesTypeChange={setSeriesType}
        onFitContent={handleFitContent}
        onToggleFullscreen={handleToggleFullscreen}
        isFullscreen={isFullscreen}
        indicatorsOpen={indicatorsOpen}
        setIndicatorsOpen={setIndicatorsOpen}
      />

      {/* 3. Sliding Technical Indicators Settings tray */}
      <IndicatorPanel
        isOpen={indicatorsOpen}
        activeIndicators={activeIndicators}
        onToggleIndicator={handleToggleIndicator}
      />

      {/* 4. Ticking Lightweight Charts Container Canvas */}
      {isLoading ? (
        <div className="flex-1 w-full mt-6 bg-[#161616] border border-[#1e1e1e] rounded-xl flex flex-col items-center justify-center gap-3">
          <div className="relative flex h-5 w-5 items-center justify-center shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F0B90B] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#F0B90B]"></span>
          </div>
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">
            Prefilling historical data...
          </span>
        </div>
      ) : (
        <div key={renderKey} className="flex-1 w-full mt-6 overflow-hidden flex flex-col min-h-0 border border-[#1e1e1e] rounded-xl bg-[#161616]">
          <ChartContainer
            instrument={instrument}
            timeframe={timeframe}
            closedCandles={closedCandles}
            currentCandle={currentCandle}
            seriesType={seriesType}
            activeIndicators={activeIndicators}
            fitTrigger={fitTrigger}
            isSwitching={isSwitching}
          />
        </div>
      )}

    </div>
  );
}
export default LiveChart;
