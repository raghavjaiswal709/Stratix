import React from "react";
import { formatPrice } from "./formatPrice.js";
import { INSTRUMENTS } from "../../app/live-data/instrumentConfig.js";
import { SVGIcons } from "./WatchlistSidebar.jsx";

export function PriceTicker({ instrument, currentCandle, closedCandles, feedStatus }) {
  const key = instrument.toLowerCase();
  const inst = INSTRUMENTS[key];
  const displayName = inst ? inst.name : instrument.toUpperCase();

  const lastClosed = closedCandles && closedCandles.length > 0
    ? closedCandles[closedCandles.length - 1]
    : null;

  const open = currentCandle ? currentCandle.open : 0;
  const high = currentCandle ? currentCandle.high : 0;
  const low = currentCandle ? currentCandle.low : 0;
  const close = currentCandle ? currentCandle.close : 0;
  const volume = currentCandle ? currentCandle.volume : 0;

  // Color logic: green if close > open of current candle, red if below
  const isCandleGreen = close >= open;
  const priceColorClass = isCandleGreen ? "text-emerald-400" : "text-rose-500";

  // Arrow & change from last CLOSED candle's close to current candle's close
  const baseClose = lastClosed ? lastClosed.close : open;
  const change = close - baseClose;
  const changePercent = baseClose !== 0 ? (change / baseClose) * 100 : 0;
  const isChangePositive = change >= 0;
  
  const changeColorClass = isChangePositive ? "text-emerald-400" : "text-rose-500";

  const formattedPrice = currentCandle ? formatPrice(instrument, close) : "—";
  const formattedOpen = currentCandle ? formatPrice(instrument, open) : "—";
  const formattedHigh = currentCandle ? formatPrice(instrument, high) : "—";
  const formattedLow = currentCandle ? formatPrice(instrument, low) : "—";
  const formattedClose = currentCandle ? formatPrice(instrument, close) : "—";
  const formattedVolume = currentCandle 
    ? volume.toLocaleString(undefined, { maximumFractionDigits: 1 }) 
    : "—";

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-[#161616] border border-[#1e1e1e] rounded-xl px-5 py-4 w-full select-none text-left shrink-0 gap-4 md:gap-0">
      
      {/* Symbol, Price, & Change Offset */}
      <div className="flex flex-wrap items-center gap-6">
        {/* Symbol badge */}
        <div className="flex items-center gap-2.5">
          {SVGIcons[key] || SVGIcons.generic}
          <span className="text-[15px] font-black text-white uppercase tracking-wider">
            {displayName}
          </span>
        </div>

        {/* Large Close Price */}
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className={`text-[23px] font-black font-mono tracking-tight transition-colors duration-150 ${priceColorClass}`}>
            {formattedPrice}
          </span>
        </div>

        {/* Absolute / Percent Change */}
        <div className={`text-[12px] font-bold font-mono flex items-center gap-1.5 mt-0.5 ${changeColorClass}`}>
          {isChangePositive ? (
            <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0 fill-current" viewBox="0 0 24 24">
              <path d="M12 4l9 16H3L12 4z"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-rose-500 shrink-0 fill-current" viewBox="0 0 24 24">
              <path d="M12 20L3 4h18L12 20z"/>
            </svg>
          )}
          <span>{isChangePositive ? "+" : ""}{change.toFixed(inst?.type === "jpy" ? 3 : 5)}</span>
          <span>({isChangePositive ? "+" : ""}{changePercent.toFixed(2)}%)</span>
        </div>
      </div>

      {/* OHLCV metrics details */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
        <div>
          <span>O: </span>
          <span className="text-zinc-200 font-bold ml-0.5">{formattedOpen}</span>
        </div>
        <div>
          <span>H: </span>
          <span className="text-emerald-400 font-bold ml-0.5">{formattedHigh}</span>
        </div>
        <div>
          <span>L: </span>
          <span className="text-rose-500 font-bold ml-0.5">{formattedLow}</span>
        </div>
        <div>
          <span>C: </span>
          <span className="text-zinc-200 font-bold ml-0.5">{formattedClose}</span>
        </div>
        <div>
          <span>Vol: </span>
          <span className="text-zinc-300 font-bold ml-0.5">{formattedVolume}</span>
        </div>
      </div>

      {/* Stream health status */}
      <div className="flex items-center gap-2 shrink-0">
        {feedStatus === "live" ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[9px] px-2.5 py-1 rounded-md tracking-widest flex items-center gap-1.5 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>LIVE</span>
          </div>
        ) : (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black text-[9px] px-2.5 py-1 rounded-md tracking-widest flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
            <span>STALE</span>
          </div>
        )}
      </div>

    </div>
  );
}
