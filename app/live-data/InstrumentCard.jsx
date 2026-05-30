import React, { useState, useEffect, useRef } from "react";
import { useInstrumentPrice } from "./useInstrumentPrice.js";
import { INSTRUMENTS, formatPrice, formatSpread } from "./instrumentConfig.js";
import { generateSparklineSvgPath } from "./sparkline.js";

export function InstrumentCard({ id, onSelect, isStarred, onToggleStar }) {
  const priceData = useInstrumentPrice(id);
  const inst = INSTRUMENTS[id];
  
  const [flash, setFlash] = useState(null); // 'up', 'down', or null
  const prevPriceRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  const mid = priceData?.mid ?? 0;
  const bid = priceData?.bid ?? 0;
  const ask = priceData?.ask ?? 0;
  const spread = priceData?.spread ?? 0;
  const change = priceData?.change ?? 0;
  const changePercent = priceData?.changePercent ?? 0;
  const direction = priceData?.direction ?? "flat";
  const isStale = priceData?.isStale ?? false;
  const timestamp = priceData?.timestamp;
  const ticks = priceData?.ticks ?? [];

  // Trigger flash effect when price updates
  useEffect(() => {
    if (mid === 0 || isStale) return;

    if (prevPriceRef.current !== null && prevPriceRef.current !== mid) {
      // Clear previous timeout
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }

      const wentUp = mid > prevPriceRef.current;
      setFlash(wentUp ? "up" : "down");

      flashTimeoutRef.current = setTimeout(() => {
        setFlash(null);
      }, 400);
    }
    
    prevPriceRef.current = mid;
  }, [mid, isStale]);

  // Clean up timer
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  if (!inst) return null;

  const isUp = changePercent >= 0;
  const formattedPrice = priceData ? formatPrice(id, mid) : "...";
  const formattedBid = priceData ? formatPrice(id, bid) : "...";
  const formattedAsk = priceData ? formatPrice(id, ask) : "...";
  const formattedSpread = priceData ? formatSpread(id, spread) : "...";
  const formattedTime = timestamp 
    ? new Date(timestamp).toLocaleTimeString("en-US", { hour12: false }) 
    : "—";

  // Build mini sparkline using the last 20 tick values
  const sparklineTicks = ticks.slice(-20);
  const sparklinePath = generateSparklineSvgPath(sparklineTicks, 80, 24);
  const sparklineColor = sparklineTicks.length >= 2 && sparklineTicks[sparklineTicks.length - 1] >= sparklineTicks[0]
    ? "#34d399" // green-400
    : "#f43f5e"; // rose-500

  // Flash styling classes
  let cardStyle = "border-[#1e1e1e] bg-[#161616] shadow-sm";
  if (flash === "up") {
    cardStyle = "border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.12)]";
  } else if (flash === "down") {
    cardStyle = "border-rose-500/40 bg-rose-500/5 shadow-[0_0_12px_rgba(244,63,94,0.12)]";
  }

  return (
    <div 
      className={`relative rounded-xl border p-4 transition-all duration-300 flex flex-col justify-between h-[180px] cursor-pointer hover:border-[#F0B90B]/30 hover:shadow-md hover:scale-[1.01] select-none ${cardStyle} ${
        isStale ? "opacity-45" : ""
      }`}
      onClick={() => onSelect(id)}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[16px] shrink-0 filter drop-shadow">{inst.icon}</span>
          <div className="flex flex-col text-left min-w-0">
            <span className="text-[13px] font-black text-white truncate tracking-wide uppercase leading-tight">
              {inst.name}
            </span>
            <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest mt-0.5 leading-none">
              {inst.group}
            </span>
          </div>
        </div>

        <button
          className={`text-[15px] p-1 transition-colors duration-150 relative z-10 ${
            isStarred ? "text-amber-500 hover:text-amber-400" : "text-zinc-600 hover:text-zinc-400"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(id);
          }}
          aria-label={isStarred ? "Remove Watchlist" : "Add Watchlist"}
        >
          {isStarred ? "★" : "☆"}
        </button>
      </div>

      {/* Mid Price & Sparkline */}
      <div className="flex items-end justify-between py-2 shrink-0">
        <div className="flex flex-col text-left">
          <span className="text-[18px] font-black font-mono text-zinc-50 tracking-tight leading-none">
            {formattedPrice}
          </span>
          <div className={`text-[10px] font-bold font-mono mt-1.5 flex items-center gap-1.5 ${
            isUp ? "text-emerald-400" : "text-rose-500"
          }`}>
            <span>{isUp ? "▲" : "▼"}</span>
            <span>{isUp ? "+" : ""}{change.toFixed(inst.type === "jpy" ? 3 : 5)}</span>
            <span>({isUp ? "+" : ""}{changePercent.toFixed(2)}%)</span>
          </div>
        </div>

        {/* Custom Mini Sparkline */}
        {sparklineTicks.length >= 2 ? (
          <div className="h-6 w-20 shrink-0 self-center opacity-85">
            <svg width="80" height="24" viewBox="0 0 80 24" className="overflow-visible">
              <path
                d={sparklinePath}
                fill="none"
                stroke={sparklineColor}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <div className="h-6 w-20 bg-zinc-800/20 rounded animate-pulse shrink-0" />
        )}
      </div>

      {/* Bid / Ask / Spread */}
      <div className="grid grid-cols-3 gap-1 border-t border-[#1e1e1e]/60 pt-2.5 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0 leading-none">
        <div className="flex flex-col items-start text-left">
          <span>Bid</span>
          <span className="font-mono text-zinc-300 font-bold text-[10px] mt-1 tracking-tight">{formattedBid}</span>
        </div>
        <div className="flex flex-col items-center text-center">
          <span>Ask</span>
          <span className="font-mono text-zinc-300 font-bold text-[10px] mt-1 tracking-tight">{formattedAsk}</span>
        </div>
        <div className="flex flex-col items-end text-right">
          <span>Spread</span>
          <span className="font-mono text-[#F0B90B] font-bold text-[10px] mt-1 tracking-tight">{formattedSpread}</span>
        </div>
      </div>

      {/* Footer / Status */}
      <div className="flex items-center justify-between text-[8px] font-extrabold tracking-widest uppercase text-zinc-500 border-t border-[#1e1e1e]/20 pt-1.5 mt-1 shrink-0">
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${isStale ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
          <span>{isStale ? "STALE" : "LIVE"}</span>
        </div>
        <span>{formattedTime}</span>
      </div>

      {/* Stale / Error Badge Overlay */}
      {isStale && (
        <div className="absolute inset-0 bg-[#0f0f0f]/80 backdrop-blur-[0.5px] rounded-xl flex items-center justify-center z-10 transition-opacity">
          <div className="bg-[#161616] border border-[#1e1e1e] rounded-lg px-3 py-1.5 shadow-xl flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
              Reconnecting...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
