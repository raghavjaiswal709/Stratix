import React from "react";
import { useInstrumentPrice } from "./useInstrumentPrice.js";
import { INSTRUMENTS, formatPrice } from "./instrumentConfig.js";

function WatchlistItem({ id, onSelect, onRemove }) {
  const priceData = useInstrumentPrice(id);
  const inst = INSTRUMENTS[id];
  
  if (!inst) return null;

  const mid = priceData?.mid ?? 0;
  const changePercent = priceData?.changePercent ?? 0;
  const isUp = changePercent >= 0;
  const formattedPrice = priceData ? formatPrice(id, mid) : "...";

  return (
    <div 
      className="flex items-center justify-between bg-[#161616] hover:bg-[#1c1c1c] border border-[#1e1e1e] rounded-xl p-3 transition-all duration-150 cursor-pointer active:scale-[0.98] group"
      onClick={() => onSelect(id)}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[16px] filter drop-shadow">{inst.icon}</span>
        <div className="flex flex-col text-left min-w-0">
          <span className="text-[12px] font-black text-white truncate tracking-wide">{inst.name}</span>
          <span className="text-[8px] text-zinc-500 font-extrabold uppercase tracking-widest mt-0.5">{inst.group}</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex flex-col text-right">
          <span className="text-[12px] font-mono font-bold text-zinc-200 tracking-tight">{formattedPrice}</span>
          <span className={`text-[9px] font-mono font-bold mt-0.5 flex items-center justify-end gap-0.5 ${
            isUp ? "text-emerald-400" : "text-rose-500"
          }`}>
            <span>{isUp ? "▲" : "▼"}</span>
            <span>{Math.abs(changePercent).toFixed(2)}%</span>
          </span>
        </div>
        <button 
          className="text-amber-500 hover:text-zinc-500 p-1 transition-colors duration-150 relative z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(id);
          }}
          aria-label="Remove from Watchlist"
        >
          ★
        </button>
      </div>
    </div>
  );
}

export function WatchlistPanel({ watchlist, onRemove, onSelect, isOpen, setIsOpen }) {
  if (!isOpen) return null;

  return (
    <div className="flex flex-col w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[#1e1e1e] bg-[#0f0f0f] shrink-0 h-[300px] lg:h-auto overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-[#1e1e1e] px-4 py-3 shrink-0 bg-[#161616]/40">
        <div className="flex items-center gap-2">
          <span className="text-[#F0B90B] font-bold">★</span>
          <span className="text-[11px] font-extrabold text-zinc-300 uppercase tracking-widest">My Watchlist</span>
          <span className="text-[9px] bg-[#1e1e1e] text-[#F0B90B] border border-[#F0B90B]/10 font-bold px-1.5 py-0.5 rounded-full ml-0.5">
            {watchlist.length}
          </span>
        </div>
        <button 
          className="text-[10px] text-zinc-500 hover:text-zinc-300 font-extrabold px-2 py-1 hover:bg-[#161616] rounded-md transition-colors uppercase tracking-wider"
          onClick={() => setIsOpen(false)}
        >
          Collapse ➔
        </button>
      </div>

      {/* List content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-8">
            <span className="text-[20px] text-zinc-700 font-bold mb-1">☆</span>
            <p className="text-[10px] text-center font-bold tracking-wide leading-relaxed text-zinc-500">
              WATCHLIST EMPTY
            </p>
            <p className="text-[9px] text-center text-zinc-600 mt-1 font-medium max-w-[160px]">
              Tap the star on any card to add it to your watchlist.
            </p>
          </div>
        ) : (
          watchlist.map((id) => (
            <WatchlistItem 
              key={id} 
              id={id} 
              onSelect={onSelect} 
              onRemove={onRemove} 
            />
          ))
        )}
      </div>
    </div>
  );
}
