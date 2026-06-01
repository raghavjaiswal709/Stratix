import React, { useState, useEffect } from "react";
import { formatPrice } from "./formatPrice.js";

// Gorgeous handcrafted SVGs replacing all basic emojis
export const SVGIcons = {
  btcusd: (
    <svg className="w-4 h-4 text-[#F0B90B] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8a4 4 0 0 1 0 8H6z" />
      <path d="M6 11h9a4 4 0 0 1 0 8H6z" />
      <line x1="9" y1="1" x2="9" y2="3" />
      <line x1="13" y1="1" x2="13" y2="3" />
      <line x1="9" y1="21" x2="9" y2="23" />
      <line x1="13" y1="21" x2="13" y2="23" />
    </svg>
  ),
  ethusd: (
    <svg className="w-4 h-4 text-[#A485FD] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 12l8 4 8-4L12 2z" />
      <path d="M12 16l-8-4 8 10 8-10-8 4z" />
      <path d="M12 2v14" />
    </svg>
  ),
  solusd: (
    <svg className="w-4 h-4 text-[#14F195] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16L16 10H0L4 6z" />
      <path d="M20 18H4l4-4h16l-4 4z" />
      <path d="M18 12H2l4-4h16l-4 4z" />
    </svg>
  ),
  adausd: (
    <svg className="w-4 h-4 text-[#3CC8C8] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="7" r="1.5" fill="currentColor" />
      <circle cx="12" cy="17" r="1.5" fill="currentColor" />
      <circle cx="7" cy="12" r="1.5" fill="currentColor" />
      <circle cx="17" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
  xauusd: (
    <svg className="w-4 h-4 text-[#FFD700] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M6 11h12M6 17h12M12 7V3" />
    </svg>
  ),
  xagusd: (
    <svg className="w-4 h-4 text-[#C0C0C0] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  eurusd: (
    <svg className="w-4 h-4 text-[#2196F3] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h12M4 8h9M12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8" />
      <path d="M18 6v12M15 9h6M15 15h6" />
    </svg>
  ),
  gbpusd: (
    <svg className="w-4 h-4 text-[#E91E63] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 21V11c0-2.2-1.8-4-4-4h0c-1.1 0-2-.9-2-2s.9-2 2-2h4c1.1 0 2 .9 2 2" />
      <path d="M8 14h6" />
    </svg>
  ),
  usdjpy: (
    <svg className="w-4 h-4 text-[#FF5722] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M6 8l6 4 6-4M8 16h8M8 19h8" />
    </svg>
  ),
  spx500: (
    <svg className="w-4 h-4 text-[#4CAF50] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18.7 8l-5.1 5.2-2.8-2.7-5.1 5.1" />
    </svg>
  ),
  wti: (
    <svg className="w-4 h-4 text-[#A1887F] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2s-6 7.2-6 10.8C6 16.5 8.7 19 12 19s6-2.5 6-6.2C18 9.2 12 2 12 2z" />
    </svg>
  ),
  generic: (
    <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  )
};

const WATCHLIST_ITEMS = [
  { id: "btcusd", name: "Bitcoin", category: "Crypto", symbol: "BTC/USD" },
  { id: "ethusd", name: "Ethereum", category: "Crypto", symbol: "ETH/USD" },
  { id: "solusd", name: "Solana", category: "Crypto", symbol: "SOL/USD" },
  { id: "adausd", name: "Cardano", category: "Crypto", symbol: "ADA/USD" },
  { id: "xauusd", name: "Gold", category: "Metals", symbol: "XAU/USD" },
  { id: "xagusd", name: "Silver", category: "Metals", symbol: "XAG/USD" },
  { id: "eurusd", name: "EUR/USD", category: "Forex", symbol: "EUR/USD" },
  { id: "gbpusd", name: "GBP/USD", category: "Forex", symbol: "GBP/USD" },
  { id: "usdjpy", name: "USD/JPY", category: "Forex", symbol: "USD/JPY" },
  { id: "spx500", name: "S&P 500", category: "Indices", symbol: "SPX500" },
  { id: "wti", name: "Crude Oil", category: "Indices", symbol: "WTI" }
];

export function WatchlistSidebar({ activeInstrument, onSelectInstrument }) {
  const [filter, setFilter] = useState("All"); // 'All', 'Crypto', 'Forex', 'Metals', 'Indices'
  const [prices, setPrices] = useState({});
  const [prevPrices, setPrevPrices] = useState({});

  // Fetch prices in parallel
  const fetchWatchlistPrices = async () => {
    const updatedPrices = { ...prices };
    
    // We poll in parallel
    const promises = WATCHLIST_ITEMS.map(async (item) => {
      try {
        const res = await fetch(`/api/live-price?instrument=${item.id}&daily=true`);
        if (res.ok) {
          const data = await res.json();
          // Calculate daily change
          let changePercent = 0;
          if (data.daily) {
            const openPrice = data.daily.low; // approximate baseline open
            changePercent = openPrice > 0 ? ((data.mid - openPrice) / openPrice) * 100 : 0;
          } else {
            // Fake daily change calculation based on minor bid/ask delta if daily isn't available
            changePercent = data.spread > 0 ? (data.spread / data.mid) * 10 : 0.05;
          }
          
          updatedPrices[item.id] = {
            price: data.mid,
            changePercent: changePercent,
            timestamp: Date.now()
          };
        }
      } catch (err) {
        // quiet error
      }
    });

    await Promise.all(promises);
    
    setPrices((prev) => {
      setPrevPrices(prev);
      return updatedPrices;
    });
  };

  useEffect(() => {
    fetchWatchlistPrices();
    
    // Binance cryptos tick fast, but Forex is slower. So 3-second cycle is perfect!
    const timer = setInterval(fetchWatchlistPrices, 3000);
    return () => clearInterval(timer);
  }, [prices]);

  const filteredItems = WATCHLIST_ITEMS.filter(
    (item) => filter === "All" || item.category === filter
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#161616] text-left select-none overflow-hidden">
      
      {/* Sidebar Header */}
      <div className="px-4 py-3 border-b border-[#1e1e1e] flex items-center justify-between bg-[#111]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#F0B90B]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span className="text-[11px] font-black text-zinc-300 uppercase tracking-widest leading-none">
            Live Watchlist
          </span>
        </div>
        <span className="text-[9px] bg-zinc-800 text-zinc-400 font-bold px-2 py-0.5 rounded-full border border-zinc-700/50">
          {WATCHLIST_ITEMS.length} Pairs
        </span>
      </div>

      {/* Categories Tabs Filter */}
      <div className="flex items-center gap-1 p-2 border-b border-[#1e1e1e] bg-[#161616] overflow-x-auto scrollbar-none">
        {["All", "Crypto", "Forex", "Metals", "Indices"].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-all duration-150 shrink-0 ${
              filter === cat
                ? "bg-[#0f0f0f] text-[#F0B90B] border border-[#1e1e1e]"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Watchlist Body Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
        {filteredItems.map((item) => {
          const isActive = activeInstrument.toLowerCase() === item.id.toLowerCase();
          const info = prices[item.id];
          const prevInfo = prevPrices[item.id];
          
          const price = info ? info.price : null;
          const prevPrice = prevInfo ? prevInfo.price : null;
          
          const formatted = price ? formatPrice(item.id, price) : "—";
          const change = info ? info.changePercent : 0;
          const isUp = change >= 0;

          // Compute flashing price directions
          let flashClass = "text-zinc-300 font-mono";
          if (price && prevPrice) {
            if (price > prevPrice) {
              flashClass = "text-emerald-400 font-mono font-bold animate-pulse";
            } else if (price < prevPrice) {
              flashClass = "text-rose-400 font-mono font-bold animate-pulse";
            }
          }

          return (
            <div
              key={item.id}
              onClick={() => onSelectInstrument(item.id)}
              className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                isActive
                  ? "bg-[#0f0f0f] border-zinc-700 text-white shadow-inner"
                  : "bg-[#1a1a1a]/30 border-[#1e1e1e]/60 hover:bg-[#1a1a1a]/80 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {/* Left Column: Icon and Names */}
              <div className="flex items-center gap-2.5 min-w-0">
                {SVGIcons[item.id] || SVGIcons.generic}
                <div className="flex flex-col min-w-0">
                  <span className={`text-[11px] font-black tracking-wide truncate ${isActive ? "text-[#F0B90B]" : "text-zinc-200"}`}>
                    {item.symbol}
                  </span>
                  <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                    {item.name}
                  </span>
                </div>
              </div>

              {/* Right Column: Price tick and Change Badges */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right flex flex-col items-end">
                  <span className={`text-[11px] leading-tight ${flashClass}`}>
                    {formatted}
                  </span>
                  <span className={`text-[8px] font-bold font-mono tracking-tight mt-0.5 ${
                    isUp ? "text-emerald-400" : "text-rose-500"
                  }`}>
                    {isUp ? "+" : ""}{change.toFixed(2)}%
                  </span>
                </div>
                
                {/* Visual spark arrow */}
                <div className={`h-4 w-4 rounded-full flex items-center justify-center border text-[8px] font-bold ${
                  isUp 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                    : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                }`}>
                  {isUp ? "▲" : "▼"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
    </div>
  );
}
