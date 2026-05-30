import React, { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";
import { useInstrumentPrice } from "./useInstrumentPrice.js";
import { INSTRUMENTS, formatPrice, formatSpread } from "./instrumentConfig.js";

export function ExpandedModal({ id, onClose, isStarred, onToggleStar }) {
  const priceData = useInstrumentPrice(id);
  const inst = INSTRUMENTS[id];

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const areaSeriesRef = useRef(null);

  const [dailyRange, setDailyRange] = useState(null);
  const [loadingDaily, setLoadingDaily] = useState(false);

  const mid = priceData?.mid ?? 0;
  const bid = priceData?.bid ?? 0;
  const ask = priceData?.ask ?? 0;
  const spread = priceData?.spread ?? 0;
  const isStale = priceData?.isStale ?? false;
  const ticks = priceData?.ticks ?? [];

  // 1. Fetch today's D1 candle range on mount/instrument change
  useEffect(() => {
    if (!id) return;
    
    setLoadingDaily(true);
    setDailyRange(null);

    fetch(`/api/live-price?instrument=${id}&daily=true`)
      .then((res) => res.json())
      .then((data) => {
        if (data.daily) {
          setDailyRange(data.daily);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch historical daily range:", err);
      })
      .finally(() => {
        setLoadingDaily(false);
      });
  }, [id]);

  // 2. Compute session high/low dynamically from rolling ticks buffer
  const sessionHigh = ticks.length > 0 ? Math.max(...ticks) : mid;
  const sessionLow = ticks.length > 0 ? Math.min(...ticks) : mid;

  // 3. Initialize and mount Lightweight Chart
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !id) return;

    // Create the lightweight chart
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 250,
      layout: {
        background: { color: "#161616" },
        textColor: "#8a9bb0",
        fontFamily: "JetBrains Mono, monospace, sans-serif",
      },
      grid: {
        vertLines: { color: "#222222" },
        horzLines: { color: "#222222" },
      },
      timeScale: {
        visible: false, // hide time scale for clean tick tracking
        borderColor: "#1e1e1e",
      },
      rightPriceScale: {
        borderColor: "#1e1e1e",
        alignLabels: true,
      },
      crosshair: {
        vertLine: {
          color: "rgba(240, 185, 11, 0.4)",
          width: 1,
          style: 3, // dashed
        },
        horzLine: {
          color: "rgba(240, 185, 11, 0.4)",
          width: 1,
          style: 3,
        },
      },
    });
    chartRef.current = chart;

    // Add a glowing area series for a premium modern trading look
    const areaSeries = chart.addAreaSeries({
      lineColor: "#F0B90B",
      topColor: "rgba(240, 185, 11, 0.22)",
      bottomColor: "rgba(240, 185, 11, 0.0)",
      lineWidth: 2.2,
      priceFormat: {
        type: "custom",
        formatter: (price) => formatPrice(id, price),
      },
    });
    areaSeriesRef.current = areaSeries;

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.resize(el.clientWidth, 250);
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chartRef.current = null;
      areaSeriesRef.current = null;
      try {
        chart.remove();
      } catch {
        // already disposed
      }
    };
  }, [id]);

  // 4. Feed ticks data to the Lightweight Chart area series
  useEffect(() => {
    const series = areaSeriesRef.current;
    if (!series || ticks.length === 0) return;

    // Construct strictly increasing timeline sequence (in seconds) for Lightweight Charts compatibility
    let lastTime = 0;
    const baseTime = Math.floor(Date.now() / 1000) - ticks.length * 2;
    
    const chartData = ticks.map((val, idx) => {
      let timeSecs = baseTime + idx * 2;
      if (timeSecs <= lastTime) {
        timeSecs = lastTime + 1;
      }
      lastTime = timeSecs;
      return { time: timeSecs, value: val };
    });

    series.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [ticks]);

  if (!inst) return null;

  const formattedPrice = priceData ? formatPrice(id, mid) : "...";
  const formattedBid = priceData ? formatPrice(id, bid) : "...";
  const formattedAsk = priceData ? formatPrice(id, ask) : "...";
  const formattedSpread = priceData ? formatSpread(id, spread) : "...";
  const formattedSessionHigh = priceData ? formatPrice(id, sessionHigh) : "...";
  const formattedSessionLow = priceData ? formatPrice(id, sessionLow) : "...";
  const formattedDailyHigh = dailyRange ? formatPrice(id, dailyRange.high) : null;
  const formattedDailyLow = dailyRange ? formatPrice(id, dailyRange.low) : null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg bg-[#161616] border-l border-[#1e1e1e] shadow-2xl transition-all duration-300 ease-out flex-col">
      {/* Modal Header */}
      <div className="flex items-center justify-between border-b border-[#1e1e1e] px-6 py-4.5 shrink-0 bg-[#0f0f0f]/30">
        <div className="flex items-center gap-3">
          <span className="text-[20px] filter drop-shadow">{inst.icon}</span>
          <div className="flex flex-col text-left">
            <span className="text-[15px] font-black text-white uppercase tracking-wider">{inst.name}</span>
            <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest mt-0.5">{inst.group}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Watchlist toggle star */}
          <button
            onClick={() => onToggleStar(id)}
            className={`text-[13px] font-black border border-[#1e1e1e] rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-all duration-150 ${
              isStarred 
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/15" 
                : "bg-zinc-800/10 text-zinc-400 hover:bg-zinc-800/20"
            }`}
          >
            <span>{isStarred ? "★" : "☆"}</span>
            <span className="text-[10px] font-extrabold tracking-wider uppercase">
              {isStarred ? "Starred" : "Watchlist"}
            </span>
          </button>
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="text-[10px] border border-[#1e1e1e] bg-zinc-800/10 hover:bg-zinc-800/20 text-zinc-400 hover:text-white font-extrabold px-3 py-1.5 rounded-lg transition-all duration-150 uppercase tracking-wider"
          >
            Close ➔
          </button>
        </div>
      </div>

      {/* Modal Scroll Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Live Ticking Prices Card */}
        <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-5 shadow-sm text-left">
          <p className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest leading-none">
            Current Price (Mid)
          </p>
          <div className="flex items-baseline justify-between mt-3 leading-none">
            <span className="text-[32px] font-black font-mono text-zinc-50 tracking-tighter">
              {formattedPrice}
            </span>
            <span className="text-[#F0B90B] font-mono text-[14px] font-bold">
              Spread: {formattedSpread}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 border-t border-[#1e1e1e]/60 pt-4 mt-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            <div className="flex flex-col">
              <span>Bid Price</span>
              <span className="font-mono text-zinc-200 font-bold text-[14px] mt-1.5 tracking-tight">{formattedBid}</span>
            </div>
            <div className="flex flex-col">
              <span>Ask Price</span>
              <span className="font-mono text-zinc-200 font-bold text-[14px] mt-1.5 tracking-tight">{formattedAsk}</span>
            </div>
          </div>
        </div>

        {/* Real-Time Lightweight Chart Area */}
        <div className="bg-[#161616] border border-[#1e1e1e] rounded-xl overflow-hidden relative">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-[#0f0f0f]/80 border border-[#1e1e1e] rounded-md px-2 py-1">
            <span className="h-1.5 w-1.5 bg-[#F0B90B] rounded-full animate-ping" />
            <span className="text-[8px] font-black text-[#F0B90B] uppercase tracking-widest font-mono">
              60-Tick Terminal
            </span>
          </div>
          <div ref={chartContainerRef} className="w-full bg-[#161616]" />
        </div>

        {/* Stat Ranges Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Session Range */}
          <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-4.5 text-left">
            <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">
              Session Range (High/Low)
            </span>
            <div className="flex flex-col gap-2 mt-3 text-[11px] font-bold font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Session High:</span>
                <span className="text-emerald-400">{formattedSessionHigh}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Session Low:</span>
                <span className="text-rose-500">{formattedSessionLow}</span>
              </div>
            </div>
          </div>

          {/* Daily Range */}
          <div className="bg-[#0f0f0f] border border-[#1e1e1e] rounded-xl p-4.5 text-left">
            <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">
              Daily Range (D1 Candle)
            </span>
            {loadingDaily ? (
              <div className="flex items-center gap-2 mt-3.5 text-zinc-600 animate-pulse text-[11px] font-bold">
                <div className="h-3 w-3 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" />
                <span>Fetching historical data...</span>
              </div>
            ) : formattedDailyHigh ? (
              <div className="flex flex-col gap-2 mt-3 text-[11px] font-bold font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Daily High:</span>
                  <span className="text-zinc-100">{formattedDailyHigh}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Daily Low:</span>
                  <span className="text-zinc-100">{formattedDailyLow}</span>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-zinc-600 font-bold mt-4">
                Market Closed / No candle data
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
