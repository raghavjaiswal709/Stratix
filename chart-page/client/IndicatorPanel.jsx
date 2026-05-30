import React from "react";

export function IndicatorPanel({ isOpen, activeIndicators, onToggleIndicator }) {
  if (!isOpen) return null;

  const indicators = [
    { id: "sma20", label: "SMA 20", category: "Moving Averages", color: "#2196F3", desc: "Simple Moving Average (20 periods)" },
    { id: "sma50", label: "SMA 50", category: "Moving Averages", color: "#FF9800", desc: "Simple Moving Average (50 periods)" },
    { id: "sma200", label: "SMA 200", category: "Moving Averages", color: "#E91E63", desc: "Simple Moving Average (200 periods)" },
    { id: "ema9", label: "EMA 9", category: "Exponential Averages", color: "#00BCD4", desc: "Exponential Moving Average (9 periods)" },
    { id: "ema21", label: "EMA 21", category: "Exponential Averages", color: "#9C27B0", desc: "Exponential Moving Average (21 periods)" },
    { id: "bb", label: "Bollinger Bands", category: "Bands & Channels", color: "rgba(33, 150, 243, 0.75)", desc: "Bollinger Bands (20 periods, 2 stddev)" },
    { id: "volume", label: "Volume Histogram", category: "Volume", color: "rgba(38, 166, 154, 0.75)", desc: "Volume histogram panel (bottom pane)" }
  ];

  // Group indicators by category
  const categories = {};
  indicators.forEach((ind) => {
    if (!categories[ind.category]) categories[ind.category] = [];
    categories[ind.category].push(ind);
  });

  return (
    <div className="bg-[#161616] border-x border-b border-[#1e1e1e] rounded-b-xl px-5 py-4 shrink-0 select-none text-left animate-slide-down">
      <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3.5">
        Overlay Indicators Settings
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.keys(categories).map((catName) => (
          <div key={catName} className="flex flex-col space-y-2">
            <span className="text-[9px] font-extrabold text-zinc-400 uppercase tracking-wider border-b border-[#1e1e1e]/60 pb-1.5 mb-1">
              {catName}
            </span>
            {categories[catName].map((ind) => {
              const active = activeIndicators[ind.id];
              return (
                <button
                  key={ind.id}
                  onClick={() => onToggleIndicator(ind.id)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-[11px] font-bold transition-all duration-150 text-left active:scale-[0.98] ${
                    active 
                      ? "bg-[#0f0f0f] border-zinc-700 text-white" 
                      : "bg-[#0f0f0f]/30 border-[#1e1e1e] text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span 
                      className="h-2 w-2 rounded-full shrink-0" 
                      style={{ 
                        backgroundColor: ind.color,
                        boxShadow: active ? `0 0 6px ${ind.color}` : "none" 
                      }} 
                    />
                    <span>{ind.label}</span>
                  </div>
                  
                  <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded tracking-widest ${
                    active 
                      ? "bg-zinc-700/50 text-[#F0B90B] border border-zinc-600/30" 
                      : "bg-zinc-800/10 text-zinc-600 border border-zinc-800/30"
                  }`}>
                    {active ? "ACTIVE" : "OFF"}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
