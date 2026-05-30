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
  Copy,
  Check,
  Terminal,
} from "lucide-react";
import { AddTradeModal, type EditableTrade } from "@/components/trade/trades/add-trade-modal";
import { ConnectMT5Form } from "@/components/trade/mt5/connect-form";
import { ImportModal } from "@/components/trade/trades/import-modal";
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
  state: string;
  mt5Login?: string;
  mt5Server?: string;
  mt5AccountId?: string;
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

function SortBtn({ 
  col, 
  label, 
  activeCol, 
  sortDir, 
  onClick 
}: { 
  col: TradesSortFilterPrefs["sortBy"]; 
  label: string;
  activeCol: TradesSortFilterPrefs["sortBy"];
  sortDir: "asc" | "desc";
  onClick: (col: TradesSortFilterPrefs["sortBy"]) => void;
}) {
  return (
    <button
      onClick={() => onClick(col)}
      className={cn(
        "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
        activeCol === col
          ? "bg-blue-600/20 text-blue-400 border border-blue-500/20"
          : "text-muted-foreground hover:text-foreground/65 hover:bg-muted border border-transparent"
      )}
    >
      {label}
      {activeCol === col
        ? sortDir === "asc"
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />
        : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

export default function TradesPage() {
  const { preferences, setPreferences, setSharedTrades } = useAppContext();
  const prefsRef = useRef(preferences);
  
  useEffect(() => {
    prefsRef.current = preferences;
  }, [preferences]);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [mt5, setMt5] = useState<MT5Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [connectTab, setConnectTab] = useState<"metaapi" | "ea">("ea");
  const [eaUserId, setEaUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  useEffect(() => {
    if (showConnect && connectTab === "ea" && !eaUserId) {
      fetch("/api/me")
        .then((r) => r.json())
        .then((d) => setEaUserId(d.id ?? null))
        .catch(() => null);
    }
  }, [showConnect, connectTab, eaUserId]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
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
      fetch("/api/mt5/status").then((r) => r.json()),
    ])
      .then(([t, m]) => {
        const tradesArr = Array.isArray(t) ? t : [];
        const timer = setTimeout(() => {
          setTrades(tradesArr);
          setSharedTrades(tradesArr as unknown as ApiTrade[]);
          setMt5(m);
          setLoading(false);
        }, 0);
        return () => clearTimeout(timer);
      })
      .catch(() => setLoading(false));
  }, [setSharedTrades]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

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

  async function confirmDelete(id: string) {
    setDeleting(id);
    setDeleteConfirmId(null);
    const res = await fetch(`/api/trade/${id}`, { method: "DELETE" });
    if (res.ok) {
      const updated = trades.filter((t) => t._id !== id);
      setTrades(updated);
      setSharedTrades(updated as unknown as ApiTrade[]);
    }
    setDeleting(null);
  }

  async function confirmClearAll() {
    setClearConfirm(false);
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
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-card border border-border text-[13px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition"
            title="Import trades from JSON / CSV"
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button
            onClick={() => setShowConnect(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-card border border-border text-[13px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition"
            title="Connect MT4/MT5"
          >
            <Wifi className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Connect MT5</span>
          </button>
          <button
            onClick={() => setClearConfirm(true)}
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
              <SortBtn col="date" label="Date" activeCol={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <SortBtn col="pnl" label="P&L" activeCol={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <SortBtn col="symbol" label="Symbol" activeCol={sortBy} sortDir={sortDir} onClick={toggleSort} />
              <SortBtn col="lots" label="Lots" activeCol={sortBy} sortDir={sortDir} onClick={toggleSort} />
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
                          onClick={() => setDeleteConfirmId(trade._id)}
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
                            onClick={() => setDeleteConfirmId(trade._id)}
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

      {/* ── Delete single trade confirm ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="rounded-xl border border-border bg-card p-5 w-full max-w-xs space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">Delete Trade?</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  The trade and all its journal data will be permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition">
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(deleteConfirmId)}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear all confirm ── */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setClearConfirm(false)}>
          <div className="rounded-xl border border-border bg-card p-5 w-full max-w-xs space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">Delete ALL Trades?</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  This will permanently delete all {trades.length} trade{trades.length !== 1 ? "s" : ""} and their journal data. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setClearConfirm(false)} className="flex-1 py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition">
                Cancel
              </button>
              <button
                onClick={confirmClearAll}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold transition"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}

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
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      {showConnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowConnect(false)}>
          <div className="rounded-xl border border-border bg-card p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Connect MT5 Account</h2>
              <button onClick={() => setShowConnect(false)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex gap-1 mb-5 rounded-lg bg-muted p-1">
              <button
                onClick={() => setConnectTab("ea")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  connectTab === "ea" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                EA Webhook <span className="text-[10px] text-emerald-400 font-semibold">FREE</span>
              </button>
              <button
                onClick={() => setConnectTab("metaapi")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  connectTab === "metaapi" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Wifi className="h-3.5 w-3.5" />
                MetaApi Cloud
              </button>
            </div>

            {connectTab === "metaapi" && (
              <ConnectMT5Form
                onConnected={(info) => {
                  setMt5({ state: "DEPLOYED", connected: true, ...info });
                  setShowConnect(false);
                }}
              />
            )}

            {connectTab === "ea" && (
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground text-[13px]">
                  Run a free Expert Advisor in your MT5 desktop app. Trades sync instantly every time you open or close a position — no subscriptions needed.
                </p>

                <div className="space-y-3">
                  <h3 className="text-[12px] font-semibold text-foreground uppercase tracking-wide">Setup steps</h3>

                  <ol className="space-y-2.5 text-[12px] text-muted-foreground list-decimal list-inside">
                    <li>Download <a href="/mt5/StratixEA.mq5" download className="text-blue-400 underline">StratixEA.mq5</a> and open it in MetaEditor (press <kbd className="px-1 py-0.5 rounded bg-muted text-foreground text-[10px]">F4</kbd> in MT5).</li>
                    <li>Set the three input values shown below and compile (<kbd className="px-1 py-0.5 rounded bg-muted text-foreground text-[10px]">F7</kbd>).</li>
                    <li>In MT5: <strong className="text-foreground">Tools → Options → Expert Advisors</strong> → tick <em>Allow WebRequest</em> → add your app URL.</li>
                    <li>Drag the EA onto any chart. It monitors <em>all</em> trades automatically.</li>
                  </ol>

                  {/* Config values */}
                  <div className="rounded-lg border border-border bg-muted/30 divide-y divide-border">
                    {([
                      {
                        label: "STRATIX_WEBHOOK_URL",
                        value: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/trade/webhook`,
                        key: "url",
                      },
                      {
                        label: "STRATIX_USER_ID",
                        value: eaUserId ?? "loading…",
                        key: "uid",
                      },
                      {
                        label: "WEBHOOK_SECRET",
                        value: "(copy from your .env.local WEBHOOK_SECRET)",
                        key: "secret",
                        muted: true,
                      },
                    ] as { label: string; value: string; key: string; muted?: boolean }[]).map((row) => (
                      <div key={row.key} className="flex items-center justify-between px-3 py-2 gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground font-mono">{row.label}</p>
                          <p className={`text-[12px] font-mono truncate ${row.muted ? "text-muted-foreground italic" : "text-foreground"}`}>{row.value}</p>
                        </div>
                        {!row.muted && (
                          <button
                            onClick={() => copyToClipboard(row.value, row.key)}
                            className="shrink-0 p-1.5 rounded hover:bg-muted transition-colors"
                            title="Copy"
                          >
                            {copied === row.key ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Your <code className="bg-muted px-1 rounded text-[10px]">WEBHOOK_SECRET</code> is in <code className="bg-muted px-1 rounded text-[10px]">.env.local</code>. Use the same value as the EA input — it prevents unauthorized trade submissions.
                  </p>
                </div>

                <button
                  onClick={() => setShowConnect(false)}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-semibold transition"
                >
                  Done — EA is set up
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
