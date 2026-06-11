"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Filter, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/context";
import type { JournalDetailTrade } from "./journal-detail";
import type { JournalSortFilterPrefs } from "@/types";

// Single source of truth — all fields come from the API
export type JournalTrade = JournalDetailTrade;

type JournalTab = "all" | "journaled" | "pending";

interface JournalListProps {
  trades: JournalTrade[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tab: JournalTab;
  onTabChange: (t: JournalTab) => void;
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

const isWinner = (t: JournalTrade) => t.profit > 0;

interface AggregatedJournalInfo {
  lots: number;
  profit: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  childTrades: JournalTrade[];
}

function getAggregatedJournalInfo(parentTrade: JournalTrade, allTrades: JournalTrade[]): AggregatedJournalInfo {
  const childTrades = allTrades.filter(t => t.parentTradeId === parentTrade._id || t._id === parentTrade._id);
  
  let totalLots = 0;
  let totalProfit = 0;
  let weightedEntrySum = 0;
  let weightedExitSum = 0;
  let exitLots = 0;
  let earliestEntryTime = parentTrade.entryTime;
  let latestExitTime = parentTrade.exitTime;

  childTrades.forEach(t => {
    totalLots += t.lots;
    totalProfit += t.profit;
    weightedEntrySum += t.entryPrice * t.lots;
    if (t.exitPrice) {
      weightedExitSum += t.exitPrice * t.lots;
      exitLots += t.lots;
    }
    if (new Date(t.entryTime) < new Date(earliestEntryTime)) {
      earliestEntryTime = t.entryTime;
    }
    if (t.exitTime) {
      if (!latestExitTime || new Date(t.exitTime) > new Date(latestExitTime)) {
        latestExitTime = t.exitTime;
      }
    }
  });

  const avgEntryPrice = totalLots > 0 ? weightedEntrySum / totalLots : parentTrade.entryPrice;
  const avgExitPrice = exitLots > 0 ? weightedExitSum / exitLots : parentTrade.exitPrice;

  return {
    lots: totalLots,
    profit: totalProfit,
    entryPrice: Number(avgEntryPrice.toFixed(5)),
    exitPrice: avgExitPrice ? Number(avgExitPrice.toFixed(5)) : undefined,
    entryTime: earliestEntryTime,
    exitTime: latestExitTime,
    childTrades: childTrades.filter(t => t._id !== parentTrade._id)
  };
}

const DEFAULT_PREFS: JournalSortFilterPrefs = {
  sortBy: "date",
  sortDir: "desc",
  filterSymbol: "",
  filterDirection: "all",
  filterOutcome: "all",
};

export function JournalList({
  trades,
  selectedId,
  onSelect,
  tab,
  onTabChange,
}: JournalListProps) {
  const { preferences, setPreferences } = useAppContext();
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  const saved = preferences.journalSortFilter ?? DEFAULT_PREFS;
  const [sortBy, setSortBy] = useState<JournalSortFilterPrefs["sortBy"]>(saved.sortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(saved.sortDir);
  const [filterSymbol, setFilterSymbol] = useState(saved.filterSymbol);
  const [filterDirection, setFilterDirection] = useState<JournalSortFilterPrefs["filterDirection"]>(saved.filterDirection);
  const [filterOutcome, setFilterOutcome] = useState<JournalSortFilterPrefs["filterOutcome"]>(saved.filterOutcome);
  const [showFilters, setShowFilters] = useState(false);
  const [durationFilter, setDurationFilter] = useState<"all" | "today" | "3days" | "week" | "2weeks" | "month">("all");
  const [sortOpen, setSortOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [extendedIds, setExtendedIds] = useState<string[]>([]);

  // Persist to preferences (debounced), skip initial mount
  const mounted = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      setPreferences({
        ...prefsRef.current,
        journalSortFilter: { sortBy, sortDir, filterSymbol, filterDirection, filterOutcome },
      });
    }, 600);
    return () => clearTimeout(saveTimeout.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, filterSymbol, filterDirection, filterOutcome]);

  function toggleSort(col: JournalSortFilterPrefs["sortBy"]) {
    setCurrentPage(1);
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  }

  const activeFilterCount = [
    filterSymbol !== "",
    filterDirection !== "all",
    filterOutcome !== "all",
  ].filter(Boolean).length;

  // Tab filter - exclude child trades from the main list
  const tabFiltered =
    tab === "journaled"
      ? trades.filter((t) => t.journaled && !t.parentTradeId)
      : tab === "pending"
      ? trades.filter((t) => !t.journaled && !t.parentTradeId)
      : trades.filter((t) => !t.parentTradeId);

  // Apply symbol/direction/outcome/duration filter + sort
  const filtered = tabFiltered
    .filter((t) => {
      if (filterSymbol && !t.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) return false;
      if (filterDirection !== "all" && t.direction !== filterDirection) return false;
      if (filterOutcome !== "all") {
        if (filterOutcome === "winner" && t.profit <= 0) return false;
        if (filterOutcome === "loser" && (t.profit >= 0 || t.status === "open")) return false;
        if (filterOutcome === "open" && t.status !== "open") return false;
      }
      if (durationFilter !== "all") {
        const now = new Date();
        const entryDate = new Date(t.entryTime);
        const diffTime = now.getTime() - entryDate.getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        
        if (durationFilter === "today") {
          const todayStr = format(now, "yyyy-MM-dd");
          const entryStr = format(entryDate, "yyyy-MM-dd");
          if (todayStr !== entryStr) return false;
        } else if (durationFilter === "3days") {
          if (diffDays > 3) return false;
        } else if (durationFilter === "week") {
          if (diffDays > 7) return false;
        } else if (durationFilter === "2weeks") {
          if (diffDays > 14) return false;
        } else if (durationFilter === "month") {
          if (diffDays > 30) return false;
        }
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime();
      else if (sortBy === "pnl") cmp = a.profit - b.profit;
      else if (sortBy === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      return sortDir === "asc" ? cmp : -cmp;
    });

  const [currentPage, setCurrentPage] = useState(1);

  const counts = {
    all: trades.length,
    journaled: trades.filter((t) => t.journaled).length,
    pending: trades.filter((t) => !t.journaled).length,
  };

  const J_PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / J_PAGE_SIZE));
  const safePage   = Math.min(currentPage, totalPages);
  const paginated  = filtered.slice((safePage - 1) * J_PAGE_SIZE, safePage * J_PAGE_SIZE);

  function getSortLabel(by: string, dir: string) {
    if (by === "date") return dir === "desc" ? "Newest" : "Oldest";
    if (by === "pnl") return dir === "desc" ? "PnL (High)" : "PnL (Low)";
    if (by === "symbol") return dir === "asc" ? "A-Z" : "Z-A";
    return "Date";
  }

  function getDurationLabel(val: string) {
    if (val === "all") return "All Time";
    if (val === "today") return "Today";
    if (val === "3days") return "3 Days";
    if (val === "week") return "Last Week";
    if (val === "2weeks") return "2 Weeks";
    if (val === "month") return "Last Month";
    return "All Time";
  }

  return (
    <div className="flex flex-col h-full w-full shrink-0 border-r border-white/7 md:w-70">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/7 space-y-2">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white">Trade Journal</h2>
          <span className="text-[11px] text-white/35">{trades.length} entries</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(["all", "journaled", "pending"] as JournalTab[]).map((t) => (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition",
                tab === t
                  ? "bg-white/[0.08] text-white border border-white/[0.10]"
                  : "text-white/35 hover:text-white/60 hover:bg-white/5"
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className={cn("text-[10px] rounded-full px-1", tab === t ? "text-white/70" : "text-white/25")}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>

        {/* Sort + filter bar */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 z-20">
            {/* Custom Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => { setSortOpen(!sortOpen); setDurationOpen(false); }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-[10px] text-white/50 hover:text-white/80 hover:bg-white/5 transition"
              >
                <ArrowUpDown className="h-3 w-3" />
                <span>Sort: {getSortLabel(sortBy, sortDir)}</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
              {sortOpen && (
                <div className="absolute left-0 mt-1.5 w-36 z-30 rounded-xl bg-[#0c0e14]/95 border border-white/10 shadow-2xl p-1 flex flex-col gap-0.5 backdrop-blur-md">
                  {[
                    { label: "Newest First", by: "date", dir: "desc" },
                    { label: "Oldest First", by: "date", dir: "asc" },
                    { label: "PnL: High to Low", by: "pnl", dir: "desc" },
                    { label: "PnL: Low to High", by: "pnl", dir: "asc" },
                    { label: "Symbol: A to Z", by: "symbol", dir: "asc" },
                    { label: "Symbol: Z to A", by: "symbol", dir: "desc" },
                  ].map((opt) => (
                    <button
                      key={`${opt.by}-${opt.dir}`}
                      onClick={() => {
                        setSortBy(opt.by as any);
                        setSortDir(opt.dir as any);
                        setSortOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-2.5 py-1 rounded-md text-[10px] transition",
                        sortBy === opt.by && sortDir === opt.dir
                          ? "bg-white/[0.08] text-white font-medium"
                          : "text-white/50 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Duration Dropdown */}
            <div className="relative">
              <button
                onClick={() => { setDurationOpen(!durationOpen); setSortOpen(false); }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] transition",
                  durationFilter !== "all"
                    ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400"
                    : "border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5"
                )}
              >
                <Filter className="h-3 w-3" />
                <span>Time: {getDurationLabel(durationFilter)}</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
              {durationOpen && (
                <div className="absolute left-0 mt-1.5 w-32 z-30 rounded-xl bg-[#0c0e14]/95 border border-white/10 shadow-2xl p-1 flex flex-col gap-0.5 backdrop-blur-md">
                  {[
                    { label: "All Time", value: "all" },
                    { label: "Only Today", value: "today" },
                    { label: "Last 3 Days", value: "3days" },
                    { label: "Last Week", value: "week" },
                    { label: "Last 2 Weeks", value: "2weeks" },
                    { label: "Last Month", value: "month" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setDurationFilter(opt.value as any);
                        setDurationOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1 rounded-md text-[10px] transition",
                        durationFilter === opt.value
                          ? "bg-white/[0.08] text-white font-medium"
                          : "text-white/50 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "relative flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium transition-colors",
              showFilters
                ? "text-white/65 bg-white/[0.07] border-white/15"
                : activeFilterCount > 0
                ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                : "text-white/30 border-white/10 hover:text-white/60"
            )}
          >
            Filter
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-500 text-[8px] font-bold text-white flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="space-y-2 pt-1">
            {/* Symbol search */}
            <div className="relative">
              <input
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
                placeholder="Filter by symbol…"
                className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] transition pr-6"
              />
              {filterSymbol && (
                <button onClick={() => setFilterSymbol("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>

            {/* Direction */}
            <div className="flex gap-1">
              {(["all", "buy", "sell"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setFilterDirection(d)}
                  className={cn(
                    "flex-1 py-1 rounded text-[10px] font-medium transition-colors border",
                    filterDirection === d
                      ? d === "buy"
                        ? "bg-white/[0.08] text-white border-white/[0.10]"
                        : d === "sell"
                        ? "bg-red-500/20 text-red-400 border-red-500/20"
                        : "bg-white/10 text-white/60 border-white/15"
                      : "bg-white/3 text-white/30 hover:text-white/55 border-white/5"
                  )}
                >
                  {d === "all" ? "All" : d === "buy" ? "Long" : "Short"}
                </button>
              ))}
            </div>

            {/* Outcome */}
            <div className="flex gap-1">
              {(["all", "winner", "loser", "open"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setFilterOutcome(o)}
                  className={cn(
                    "flex-1 py-1 rounded text-[10px] font-medium transition-colors border",
                    filterOutcome === o
                      ? o === "winner"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                        : o === "loser"
                        ? "bg-red-500/20 text-red-400 border-red-500/20"
                        : o === "open"
                        ? "bg-white/10 text-white/60 border-white/15"
                        : "bg-white/[0.08] text-white border-white/[0.10]"
                      : "bg-white/3 text-white/30 hover:text-white/55 border-white/5"
                  )}
                >
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilterSymbol(""); setFilterDirection("all"); setFilterOutcome("all"); }}
                className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="h-2.5 w-2.5" /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-white/25">
            <p className="text-[13px]">{trades.length === 0 ? "No trades" : "No matches"}</p>
            {trades.length > 0 && activeFilterCount > 0 && (
              <button
                onClick={() => { setCurrentPage(1); setFilterSymbol(""); setFilterDirection("all"); setFilterOutcome("all"); }}
                className="text-[11px] mt-1 text-white/35 hover:text-white/80 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          paginated.map((trade) => {
            const isParent = trade.mergedTradeIds && trade.mergedTradeIds.length > 0;
            const agg = isParent ? getAggregatedJournalInfo(trade, trades) : null;
            const isExtended = extendedIds.includes(trade._id);
            
            const displayLots = agg ? agg.lots : trade.lots;
            const displayProfit = agg ? agg.profit : trade.profit;
            const displayEntryPrice = agg ? agg.entryPrice : trade.entryPrice;
            const displayEntryTime = agg ? agg.entryTime : trade.entryTime;

            return (
              <div key={trade._id} className="border-b border-white/5">
                <div
                  onClick={() => onSelect(trade._id)}
                  className={cn(
                    "w-full text-left px-4 py-3.5 transition hover:bg-white/3 flex items-start gap-2 relative",
                    selectedId === trade._id && "bg-white/[0.05] border-l-2 border-l-white/30",
                    trade._deleted && "opacity-40"
                  )}
                >
                  {/* Symbol badge */}
                  <div className={cn(
                    "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold",
                    trade._deleted ? "bg-white/5 text-white/30" : displayProfit > 0 ? "bg-amber-500/15 text-amber-400" : "bg-white/10 text-white/50"
                  )}>
                    {trade.symbol.slice(0, 2)}
                  </div>
                  
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center justify-between gap-1.5 w-full">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13px] font-semibold text-white truncate">{trade.symbol}</span>
                        {trade._deleted ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/10 shrink-0">
                            DELETED
                          </span>
                        ) : (
                          <>
                            {displayProfit > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shrink-0">
                                WINNER
                              </span>
                            )}
                            {displayProfit <= 0 && trade.status === "closed" && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 shrink-0">
                                LOSER
                              </span>
                            )}
                            {trade.status === "open" && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10 shrink-0">
                                OPEN
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {isParent && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            COMPILED ({agg?.childTrades.length ? agg.childTrades.length + 1 : 1})
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExtendedIds(prev =>
                                prev.includes(trade._id) ? prev.filter(x => x !== trade._id) : [...prev, trade._id]
                              );
                            }}
                            className="p-0.5 rounded hover:bg-white/10 transition text-white/40 hover:text-white flex items-center justify-center"
                            title={isExtended ? "Collapse child trades" : "Extend child trades"}
                          >
                            <ChevronDown className={cn("h-3 w-3 transition-transform", isExtended && "rotate-180")} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        "text-[10px] font-semibold",
                        trade.direction === "buy" ? "text-emerald-400" : "text-red-400"
                      )}>
                        {trade.direction === "buy" ? "Long" : "Short"}
                      </span>
                      <span className="text-[10px] text-white/30">${displayEntryPrice}</span>
                      <span className={cn(
                        "text-[10px] font-semibold ml-auto",
                        displayProfit >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {fmt(displayProfit)}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/25 mt-0.5">
                      {format(parseISO(displayEntryTime), "MMM d, yyyy, HH:mm")}
                    </p>
                  </div>
                </div>

                {isParent && isExtended && agg && (
                  <div className="bg-white/[0.02] border-t border-white/5 pl-4 divide-y divide-white/5">
                    {/* The parent trade itself as first child */}
                    <div
                      onClick={() => onSelect(trade._id)}
                      className={cn(
                        "w-full text-left px-4 py-2 transition hover:bg-white/3 flex items-center gap-2",
                        selectedId === trade._id && "bg-white/[0.05]"
                      )}
                    >
                      <span className="text-[9px] text-white/40">#1 (Main)</span>
                      <span className="text-[10px] text-white/60 font-semibold">{trade.symbol}</span>
                      <span className="text-[9px] text-white/40">{trade.lots} lots</span>
                      <span className={cn("text-[9px] font-semibold ml-auto", trade.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmt(trade.profit)}
                      </span>
                    </div>
                    
                    {/* The other children */}
                    {agg.childTrades.map((child, idx) => (
                      <div
                        key={child._id}
                        onClick={() => onSelect(child._id)}
                        className={cn(
                          "w-full text-left px-4 py-2 transition hover:bg-white/3 flex items-center gap-2 cursor-pointer",
                          selectedId === child._id && "bg-white/[0.05]"
                        )}
                      >
                        <span className="text-[9px] text-white/40">#{idx + 2}</span>
                        <span className="text-[10px] text-white/60 font-semibold">{child.symbol}</span>
                        <span className="text-[9px] text-white/40">{child.lots} lots</span>
                        <span className={cn("text-[9px] font-semibold ml-auto", child.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {fmt(child.profit)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-3 py-2 border-t border-white/7 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-white/25">
            {(safePage - 1) * J_PAGE_SIZE + 1}–{Math.min(safePage * J_PAGE_SIZE, filtered.length)} / {filtered.length}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 rounded text-[11px] text-white/35 hover:text-white hover:bg-white/[0.06] disabled:opacity-25 disabled:pointer-events-none transition"
            >‹</button>
            {Array.from({ length: Math.min(4, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(safePage - 1, totalPages - 3));
              const p = start + i;
              return p <= totalPages ? (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-6 h-6 rounded text-[10px] font-medium transition ${p === safePage ? "bg-white/[0.10] text-white" : "text-white/30 hover:text-white hover:bg-white/[0.06]"}`}
                >{p}</button>
              ) : null;
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2 py-1 rounded text-[11px] text-white/35 hover:text-white hover:bg-white/[0.06] disabled:opacity-25 disabled:pointer-events-none transition"
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}


