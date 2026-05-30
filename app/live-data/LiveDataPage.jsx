import React, { useState, useEffect } from "react";
import { MarketSessionBar } from "./MarketSessionBar.jsx";
import { WatchlistPanel } from "./WatchlistPanel.jsx";
import { InstrumentCard } from "./InstrumentCard.jsx";
import { TableView } from "./TableView.jsx";
import { ExpandedModal } from "./ExpandedModal.jsx";
import { getInstrumentList, GROUPS } from "./instrumentConfig.js";

export function LiveDataPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'table'
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("stratix_watchlist");
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (err) {
        console.warn("Failed to load watchlist:", err);
      }
    }
  }, []);

  // Watchlist toggle handler
  const handleToggleStar = (id) => {
    setWatchlist((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("stratix_watchlist", JSON.stringify(next));
      return next;
    });
  };

  // Filter instruments based on search query and active tab
  const allInstruments = getInstrumentList();
  
  const filtered = allInstruments.filter((inst) => {
    // 1. Tab filter
    if (activeTab !== "All") {
      if (activeTab === "Forex" && inst.group !== GROUPS.FOREX) return false;
      if (activeTab === "Metals" && inst.group !== GROUPS.METALS) return false;
      if (activeTab === "Crypto" && inst.group !== GROUPS.CRYPTO) return false;
      if (activeTab === "Crosses" && inst.group !== GROUPS.CROSSES) return false;
      if (activeTab === "Indices" && inst.group !== GROUPS.INDICES) return false;
    }

    // 2. Search filter
    const query = search.toLowerCase().trim();
    if (!query) return true;
    return (
      inst.name.toLowerCase().includes(query) ||
      inst.id.toLowerCase().includes(query) ||
      inst.group.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex h-full w-full bg-[#0f0f0f] text-zinc-100 overflow-hidden relative font-sans">
      
      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full p-4 lg:p-6 overflow-hidden">
        
        {/* Market clocks header */}
        <MarketSessionBar />

        {/* Toolbar & filters */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between mt-6 shrink-0 bg-[#161616] border border-[#1e1e1e] rounded-xl px-4 py-3.5">
          
          {/* Group Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
            {["All", "Forex", "Metals", "Crypto", "Crosses", "Indices"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-lg border transition-all duration-150 ${
                  activeTab === tab
                    ? "bg-[#F0B90B] text-[#0f0f0f] border-[#F0B90B] shadow-[0_0_10px_rgba(240,185,11,0.2)]"
                    : "bg-[#0f0f0f]/50 text-zinc-400 border-[#1e1e1e] hover:text-zinc-200 hover:bg-[#0f0f0f]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Search, Watchlist Toggle & Grid/Table Toggles */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            {/* Search Input */}
            <div className="relative w-full sm:w-56 min-w-0">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg pl-3 pr-8 py-2 text-[11px] font-bold text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#F0B90B]/50 transition-colors"
              />
              {search && (
                <button 
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-[10px] font-black uppercase"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Grid vs Table View Toggle */}
            <div className="flex items-center bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-[#161616] text-[#F0B90B] border border-[#1e1e1e]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors ${
                  viewMode === "table"
                    ? "bg-[#161616] text-[#F0B90B] border border-[#1e1e1e]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Table
              </button>
            </div>

            {/* Watchlist toggle drawer */}
            <button
              onClick={() => setWatchlistOpen(!watchlistOpen)}
              className={`text-[10px] font-black uppercase tracking-wider border rounded-lg px-3 py-2 flex items-center gap-1.5 transition-all duration-150 ${
                watchlistOpen 
                  ? "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/20" 
                  : "bg-[#0f0f0f] text-zinc-400 border-[#1e1e1e] hover:text-zinc-200"
              }`}
            >
              <span>★</span>
              <span>Watchlist</span>
            </button>

          </div>
        </div>

        {/* Dashboard grid or table content */}
        <div className="flex-1 mt-6 overflow-hidden flex flex-col min-h-0">
          {filtered.length === 0 ? (
            <div className="flex-1 bg-[#161616] border border-[#1e1e1e] rounded-xl flex flex-col items-center justify-center text-zinc-500">
              <span className="text-4xl text-zinc-700">🔎</span>
              <p className="text-[12px] font-bold uppercase tracking-widest text-zinc-500 mt-2">
                No Instruments Found
              </p>
              <p className="text-[10px] text-zinc-600 font-medium mt-1">
                Try searching for another keyword or change your category tab.
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((inst) => (
                  <InstrumentCard
                    key={inst.id}
                    id={inst.id}
                    onSelect={setSelectedId}
                    isStarred={watchlist.includes(inst.id)}
                    onToggleStar={handleToggleStar}
                  />
                ))}
              </div>
            </div>
          ) : (
            <TableView
              instruments={filtered}
              onSelect={setSelectedId}
              watchlist={watchlist}
              onToggleStar={handleToggleStar}
            />
          )}
        </div>

      </div>

      {/* Persistent Watchlist Side Panel */}
      <WatchlistPanel
        watchlist={watchlist}
        onRemove={handleToggleStar}
        onSelect={setSelectedId}
        isOpen={watchlistOpen}
        setIsOpen={setWatchlistOpen}
      />

      {/* Slide-over details modal */}
      {selectedId && (
        <>
          {/* Overlay backdrop */}
          <div 
            onClick={() => setSelectedId(null)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          {/* Modal body */}
          <ExpandedModal
            id={selectedId}
            onClose={() => setSelectedId(null)}
            isStarred={watchlist.includes(selectedId)}
            onToggleStar={handleToggleStar}
          />
        </>
      )}

    </div>
  );
}
