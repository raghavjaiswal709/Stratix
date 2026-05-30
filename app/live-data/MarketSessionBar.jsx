import React, { useState, useEffect } from "react";
import { getMarketSessions } from "./sessionClock.js";

export function MarketSessionBar() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const update = () => {
      setSessions(getMarketSessions());
    };
    
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-[#161616] border border-[#1e1e1e] rounded-xl px-5 py-3.5 shrink-0">
      {/* Title section */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-3.5 w-3.5 items-center justify-center shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-black text-white uppercase tracking-wider">Live Rates</span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-widest animate-pulse">
              LIVE
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">Real-time ticks feed via Dukascopy-node</p>
        </div>
      </div>

      {/* Clocks section */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
        {sessions.map((sess) => (
          <div 
            key={sess.id} 
            className="flex items-center justify-between gap-3 bg-[#0f0f0f] border border-[#1e1e1e]/60 px-3 py-2 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  sess.isOpen 
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" 
                    : "bg-zinc-600"
                }`}
              />
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold text-zinc-400 tracking-wide uppercase">{sess.name}</span>
                <span className="text-[12px] font-mono font-medium text-zinc-100 tracking-tight mt-0.5">{sess.localTime}</span>
              </div>
            </div>
            <span 
              className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-widest ${
                sess.isOpen 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                  : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
              }`}
            >
              {sess.isOpen ? "OPEN" : "CLSD"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
