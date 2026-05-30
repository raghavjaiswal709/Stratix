"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from "lucide-react";
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
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  }

  const activeFilterCount = [
    filterSymbol !== "",
    filterDirection !== "all",
    filterOutcome !== "all",
  ].filter(Boolean).length;

  // Tab filter
  const tabFiltered =
    tab === "journaled"
      ? trades.filter((t) => t.journaled)
      : tab === "pending"
      ? trades.filter((t) => !t.journaled)
      : trades;

  // Apply symbol/direction/outcome filter + sort
  const filtered = tabFiltered
    .filter((t) => {
      if (filterSymbol && !t.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) return false;
      if (filterDirection !== "all" && t.direction !== filterDirection) return false;
      if (filterOutcome !== "all") {
        if (filterOutcome === "winner" && t.profit <= 0) return false;
        if (filterOutcome === "loser" && (t.profit >= 0 || t.status === "open")) return false;
        if (filterOutcome === "open" && t.status !== "open") return false;
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

  const counts = {
    all: trades.length,
    journaled: trades.filter((t) => t.journaled).length,
    pending: trades.filter((t) => !t.journaled).length,
  };

  function SortChip({ col, label }: { col: JournalSortFilterPrefs["sortBy"]; label: string }) {
    return (
      <button
        onClick={() => toggleSort(col)}
        className={cn(
          "flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
          sortBy === col
            ? "bg-blue-600/20 text-blue-400"
            : "text-white/30 hover:text-white/60"
        )}
      >
        {label}
        {sortBy === col
          ? sortDir === "asc" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
          : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
      </button>
    );
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
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/20"
                  : "text-white/35 hover:text-white/60 hover:bg-white/5"
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span className={cn("text-[10px] rounded-full px-1", tab === t ? "text-blue-300" : "text-white/25")}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>

        {/* Sort + filter bar */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-0.5">
            <SortChip col="date" label="Date" />
            <SortChip col="pnl" label="P&L" />
            <SortChip col="symbol" label="A-Z" />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "relative flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
              showFilters
                ? "text-blue-400 bg-blue-600/15"
                : activeFilterCount > 0
                ? "text-amber-400 bg-amber-500/10"
                : "text-white/30 hover:text-white/60"
            )}
          >
            <Filter className="h-3 w-3" />
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
                className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 transition pr-6"
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
                        ? "bg-blue-600/20 text-blue-400 border-blue-500/20"
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
                        : "bg-blue-600/20 text-blue-400 border-blue-500/20"
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
                onClick={() => { setFilterSymbol(""); setFilterDirection("all"); setFilterOutcome("all"); }}
                className="text-[11px] mt-1 text-blue-400/60 hover:text-blue-400 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((trade) => (
            <button
              key={trade._id}
              onClick={() => onSelect(trade._id)}
              className={cn(
                "w-full text-left px-4 py-3.5 border-b border-white/5 transition hover:bg-white/3",
                selectedId === trade._id && "bg-blue-600/10 border-l-2 border-l-blue-500",
                trade._deleted && "opacity-40"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Symbol badge */}
                  <div className={cn(
                    "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold",
                    trade._deleted ? "bg-white/5 text-white/30" : isWinner(trade) ? "bg-amber-500/15 text-amber-400" : "bg-white/10 text-white/50"
                  )}>
                    {trade.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-white">{trade.symbol}</span>
                      {trade._deleted ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/10">
                          DELETED
                        </span>
                      ) : (
                        <>
                          {isWinner(trade) && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                              WINNER
                            </span>
                          )}
                          {!isWinner(trade) && trade.status === "closed" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                              LOSER
                            </span>
                          )}
                          {trade.status === "open" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/10">
                              OPEN
                            </span>
                          )}
                          {!trade.journaled && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400/80 border border-blue-500/15">
                              NEW
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn(
                        "text-[10px] font-semibold",
                        trade.direction === "buy" ? "text-blue-400" : "text-red-400"
                      )}>
                        {trade.direction === "buy" ? "Long" : "Short"}
                      </span>
                      <span className="text-[10px] text-white/30">${trade.entryPrice}</span>
                      <span className={cn(
                        "text-[10px] font-semibold ml-auto",
                        trade.profit >= 0 ? "text-blue-400" : "text-red-400"
                      )}>
                        {fmt(trade.profit)}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/25 mt-0.5">
                      {format(parseISO(trade.entryTime), "MMM d, yyyy, HH:mm")}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}


