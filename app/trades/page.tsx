"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { format, parseISO } from "date-fns";
import { useAppContext } from "@/lib/context";
import {
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Edit2,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { AddTradeModal, type EditableTrade } from "@/components/trade/trades/add-trade-modal";
import { MT5ConnectModal } from "@/components/trade/trades/mt5-connect-modal";
import type { TradesSortFilterPrefs, ApiTrade } from "@/types";
import { cn } from "@/lib/utils";

interface Trade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  timeframe?: string;
  profit: number;
  status: "open" | "closed";
  source: "manual" | "mt5";
  leverage?: number;
  margin?: number;
}

interface MT5Config {
  connected: boolean;
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

const DEFAULT_PREFS: TradesSortFilterPrefs = {
  sortBy: "date",
  sortDir: "desc",
  filterSymbol: "",
  filterDirection: "all",
  filterStatus: "all",
  filterSource: "all",
};

export default function TradesPage() {
  const { preferences, setPreferences, setSharedTrades } = useAppContext();
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;

  const [trades, setTrades] = useState<Trade[]>([]);
  const [mt5, setMt5] = useState<MT5Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingTrade, setEditingTrade] = useState<EditableTrade | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Initialize sort/filter from saved preferences
  const saved = preferences.tradesSortFilter ?? DEFAULT_PREFS;
  const [sortBy, setSortBy] = useState<TradesSortFilterPrefs["sortBy"]>(saved.sortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(saved.sortDir);
  const [filterSymbol, setFilterSymbol] = useState(saved.filterSymbol);
  const [filterDirection, setFilterDirection] = useState<TradesSortFilterPrefs["filterDirection"]>(saved.filterDirection);
  const [filterStatus, setFilterStatus] = useState<TradesSortFilterPrefs["filterStatus"]>(saved.filterStatus);
  const [filterSource, setFilterSource] = useState<TradesSortFilterPrefs["filterSource"]>(saved.filterSource);

  // Skip initial mount so we don't write stale prefs on first render
  const mounted = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      setPreferences({
        ...prefsRef.current,
        tradesSortFilter: { sortBy, sortDir, filterSymbol, filterDirection, filterStatus, filterSource },
      });
    }, 600);
    return () => clearTimeout(saveTimeout.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, filterSymbol, filterDirection, filterStatus, filterSource]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/trade").then((r) => r.json()),
      fetch("/api/trade/mt5").then((r) => r.json()),
    ])
      .then(([t, m]) => {
        const tradesArr = Array.isArray(t) ? t : [];
        setTrades(tradesArr);
        setSharedTrades(tradesArr);
        setMt5(m);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [setSharedTrades]);

  useEffect(() => { load(); }, [load]);

  // Apply filter
  const filtered = trades.filter((t) => {
    if (filterSymbol && !t.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) return false;
    if (filterDirection !== "all" && t.direction !== filterDirection) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterSource !== "all" && t.source !== filterSource) return false;
    return true;
  });

  // Apply sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "date") cmp = new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime();
    else if (sortBy === "pnl") cmp = a.profit - b.profit;
    else if (sortBy === "symbol") cmp = a.symbol.localeCompare(b.symbol);
    else if (sortBy === "lots") cmp = a.lots - b.lots;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const activeFilterCount = [
    filterSymbol !== "",
    filterDirection !== "all",
    filterStatus !== "all",
    filterSource !== "all",
  ].filter(Boolean).length;

  function toggleSort(col: TradesSortFilterPrefs["sortBy"]) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  }

  function resetFilters() {
    setFilterSymbol("");
    setFilterDirection("all");
    setFilterStatus("all");
    setFilterSource("all");
  }

  async function deleteTrade(id: string) {
    if (!confirm("Delete this trade?")) return;
    setDeleting(id);
    await fetch(`/api/trade/${id}`, { method: "DELETE" });
    const updated = trades.filter((t) => t._id !== id);
    setTrades(updated);
    setSharedTrades(updated);
    setDeleting(null);
  }

  async function clearAll() {
    if (!confirm("Delete ALL trades? This cannot be undone.")) return;
    await Promise.all(trades.map((t) => fetch(`/api/trade/${t._id}`, { method: "DELETE" })));
    setTrades([]);
    setSharedTrades([]);
  }

  function startEdit(trade: Trade) {
    setEditingTrade({
      _id: trade._id,
      symbol: trade.symbol,
      direction: trade.direction,
      lots: trade.lots,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      timeframe: trade.timeframe,
      leverage: trade.leverage,
    });
  }

  function SortBtn({ col, label }: { col: TradesSortFilterPrefs["sortBy"]; label: string }) {
    return (
      <button
        onClick={() => toggleSort(col)}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
          sortBy === col
            ? "bg-blue-600/20 text-blue-400 border border-blue-500/20"
            : "text-muted-foreground hover:text-foreground/65 hover:bg-muted border border-transparent"
        )}
      >
        {label}
        {sortBy === col
          ? sortDir === "asc"
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-foreground">Trades</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {mt5?.connected ? (
              <><Wifi className="h-3 w-3 text-emerald-400" /><span className="text-[11px] text-emerald-400">MT5 Connected</span></>
            ) : (
              <><WifiOff className="h-3 w-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground">Not connected</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConnect(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-card border border-border text-[13px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition"
            title="Connect MT4/MT5"
          >
            <Wifi className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Connect MT5</span>
          </button>
          <button
            onClick={clearAll}
            disabled={trades.length === 0}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-red-600/10 border border-red-500/20 text-[13px] font-medium text-red-400 hover:bg-red-600/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Clear All"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-[13px] font-semibold text-white transition shadow-lg shadow-blue-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Trade</span>
          </button>
        </div>
      </div>

      {/* Trade History */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Card header + sort/filter toolbar */}
        <div className="border-b border-border">
          <div className="flex items-center justify-between px-4 md:px-5 py-3.5 gap-2 flex-wrap">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground">Trade History</h3>
              <p className="text-[11px] text-muted-foreground">
                {sorted.length}{trades.length !== sorted.length ? `/${trades.length}` : ""} trade{sorted.length !== 1 ? "s" : ""}
              </p>
            </div>
            {/* Sort + filter controls */}
            <div className="flex items-center gap-1 flex-wrap">
              <SortBtn col="date" label="Date" />
              <SortBtn col="pnl" label="P&L" />
              <SortBtn col="symbol" label="Symbol" />
              <SortBtn col="lots" label="Lots" />
              <div className="w-px h-4 bg-white/10 mx-0.5 hidden sm:block" />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-medium transition-colors border",
                  showFilters
                    ? "bg-blue-600/20 text-blue-400 border-blue-500/20"
                    : activeFilterCount > 0
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground/80"
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="px-4 md:px-5 pb-4 pt-2 border-t border-border/50 bg-muted/10">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Symbol */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Symbol</p>
                  <div className="relative">
                    <input
                      value={filterSymbol}
                      onChange={(e) => setFilterSymbol(e.target.value)}
                      placeholder="e.g. XAUUSD"
                      className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-blue-500/40 transition pr-7"
                    />
                    {filterSymbol && (
                      <button onClick={() => setFilterSymbol("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/70">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Direction */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Direction</p>
                  <div className="flex gap-1">
                    {(["all", "buy", "sell"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setFilterDirection(d)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors border",
                          filterDirection === d
                            ? d === "buy"
                              ? "bg-blue-600/20 text-blue-400 border-blue-500/20"
                              : d === "sell"
                              ? "bg-red-500/20 text-red-400 border-red-500/20"
                              : "bg-muted text-foreground/70 border-border"
                            : "bg-muted/50 text-muted-foreground hover:text-foreground/60 border-border/50"
                        )}
                      >
                        {d === "all" ? "All" : d === "buy" ? "Long" : "Short"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
                  <div className="flex gap-1">
                    {(["all", "open", "closed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors border",
                          filterStatus === s
                            ? "bg-blue-600/20 text-blue-400 border-blue-500/20"
                            : "bg-muted/50 text-muted-foreground hover:text-foreground/60 border-border/50"
                        )}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Source */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Source</p>
                  <div className="flex gap-1">
                    {(["all", "manual", "mt5"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setFilterSource(s)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors border",
                          filterSource === s
                            ? "bg-blue-600/20 text-blue-400 border-blue-500/20"
                            : "bg-muted/50 text-muted-foreground hover:text-foreground/60 border-border/50"
                        )}
                      >
                        {s === "all" ? "All" : s === "manual" ? "Manual" : "MT5"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground/65 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-2">
              <TrendingUp className="h-5 w-5 opacity-50" />
            </div>
            {trades.length === 0 ? (
              <>
                <p className="text-[13px]">No trades yet</p>
                <p className="text-[11px] mt-1">Add a trade manually or connect MT5</p>
              </>
            ) : (
              <>
                <p className="text-[13px]">No trades match your filters</p>
                <button
                  onClick={resetFilters}
                  className="text-[11px] mt-1.5 text-blue-400/60 hover:text-blue-400 transition-colors"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-border">
              {sorted.map((trade) => (
                <div key={trade._id} className="px-4 py-3.5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">
                    {trade.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-foreground">{trade.symbol}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${trade.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                        {trade.direction === "buy" ? "Long" : "Short"}
                      </span>
                      {trade.source === "mt5" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/20 text-violet-400">MT5</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {format(parseISO(trade.entryTime), "MMM d, HH:mm")}
                      {trade.exitTime && <> → {format(parseISO(trade.exitTime), "MMM d, HH:mm")}</>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Entry ${trade.entryPrice.toLocaleString()} · {trade.lots} lots
                      {trade.leverage && <> · <span className="text-violet-400">{trade.leverage}×</span></>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-[14px] font-bold ${trade.profit > 0 ? "text-blue-400" : trade.profit < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                        {fmt(trade.profit)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => startEdit(trade)} className="text-muted-foreground/50 hover:text-blue-400 transition">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteTrade(trade._id)}
                          disabled={deleting === trade._id}
                          className="text-muted-foreground/50 hover:text-red-400 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Open / Close", "Symbol", "Type", "Entry", "Exit", "Size", "Leverage", "P&L", "Source", ""].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {sorted.map((trade) => (
                    <tr key={trade._id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="text-[11px] text-muted-foreground">Open: {format(parseISO(trade.entryTime), "MMM d, hh:mm aa")}</div>
                        {trade.exitTime && <div className="text-[11px] text-muted-foreground/70">Close: {format(parseISO(trade.exitTime), "MMM d, hh:mm aa")}</div>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center text-[9px] font-bold text-amber-400">{trade.symbol.slice(0, 2)}</div>
                          <span className="text-[13px] font-semibold text-foreground">{trade.symbol}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${trade.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                          {trade.direction === "buy" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {trade.direction === "buy" ? "Long" : "Short"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-foreground/70">${trade.entryPrice.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : "—"}</td>
                      <td className="px-5 py-3.5 text-[13px] text-foreground/60">{trade.lots}</td>
                      <td className="px-5 py-3.5">
                        <div className="text-[12px] font-bold text-violet-400">{trade.leverage ?? 100}×</div>
                        {trade.margin != null && (
                          <div className="text-[10px] text-muted-foreground">M: ${trade.margin.toFixed(2)}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[13px] font-bold ${trade.profit > 0 ? "text-blue-400" : trade.profit < 0 ? "text-red-400" : "text-muted-foreground"}`}>{fmt(trade.profit)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${trade.source === "mt5" ? "bg-violet-500/10 border-violet-500/20 text-violet-400" : "bg-muted border-border text-muted-foreground"}`}>
                          {trade.source === "mt5" ? "MT5" : "Manual"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(trade)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition"
                            title="Edit trade"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteTrade(trade._id)}
                            disabled={deleting === trade._id}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <AddTradeModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
      {editingTrade && (
        <AddTradeModal
          editTrade={editingTrade}
          onClose={() => setEditingTrade(null)}
          onSaved={(updated) => {
            setEditingTrade(null);
            if (updated && updated._id) {
              // Patch only the edited trade in-place — no full network round-trip needed
              setTrades((prev) => {
                const next = prev.map((t) =>
                  t._id === updated._id ? ({ ...t, ...updated } as Trade) : t
                );
                setSharedTrades(next as unknown as ApiTrade[]);
                return next;
              });
            } else {
              load();
            }
          }}
        />
      )}
      {showConnect && <MT5ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}


