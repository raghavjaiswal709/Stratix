"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from "react";
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
  Download,
  Puzzle,
  Globe,
  MonitorDot,
  FolderOpen,
  ToggleRight,
  MousePointerClick,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AddTradeModal, type EditableTrade } from "@/components/trade/trades/add-trade-modal";
import { ConnectMT5Form } from "@/components/trade/mt5/connect-form";
import { ImportModal } from "@/components/trade/trades/import-modal";
import { MergeModal } from "@/components/trade/trades/merge-modal";
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
  parentTradeId?: string;
  mergedTradeIds?: string[];
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

interface AggregatedTradeInfo {
  lots: number;
  profit: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  leverage?: number;
  margin?: number;
  childTrades: Trade[];
}

function getAggregatedTradeInfo(parentTrade: Trade, allTrades: Trade[]): AggregatedTradeInfo {
  const childTrades = allTrades.filter(t => t.parentTradeId === parentTrade._id || t._id === parentTrade._id);
  
  let totalLots = 0;
  let totalProfit = 0;
  let weightedEntrySum = 0;
  let weightedExitSum = 0;
  let exitLots = 0;
  let earliestEntryTime = parentTrade.entryTime;
  let latestExitTime = parentTrade.exitTime;
  let totalMargin = 0;
  let maxLeverage = parentTrade.leverage ?? 100;

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
    if (t.margin) {
      totalMargin += t.margin;
    }
    if (t.leverage && t.leverage > maxLeverage) {
      maxLeverage = t.leverage;
    }
  });

  const avgEntryPrice = totalLots > 0 ? weightedEntrySum / totalLots : parentTrade.entryPrice;
  const avgExitPrice = exitLots > 0 ? weightedExitSum / exitLots : parentTrade.exitPrice;

  return {
    lots: Number(totalLots.toFixed(2)),
    profit: Number(totalProfit.toFixed(2)),
    entryPrice: Number(avgEntryPrice.toFixed(5)),
    exitPrice: avgExitPrice ? Number(avgExitPrice.toFixed(5)) : undefined,
    entryTime: earliestEntryTime,
    exitTime: latestExitTime,
    leverage: maxLeverage,
    margin: totalMargin > 0 ? Number(totalMargin.toFixed(2)) : undefined,
    childTrades: childTrades.filter(t => t._id !== parentTrade._id)
  };
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
          ? "bg-white/[0.08] text-white border border-white/[0.10]"
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

const PAGE_SIZE = 25;

export default function TradesPage() {
  const { preferences, setPreferences, setSharedTrades, activeProfileId, tradingProfiles } = useAppContext();
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
  const [extendedIds, setExtendedIds] = useState<string[]>([]);
  const [mergeTrade, setMergeTrade] = useState<Trade | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

  const load = useCallback((profileId: string) => {
    setLoading(true);
    const tradeUrl = profileId ? `/api/trade?profileId=${encodeURIComponent(profileId)}` : "/api/trade";
    Promise.all([
      fetch(tradeUrl).then((r) => r.json()),
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
      load(activeProfileId);
    }, 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  useEffect(() => {
    const handler = () => load(activeProfileId);
    window.addEventListener("refresh-trades", handler);
    return () => window.removeEventListener("refresh-trades", handler);
  }, [activeProfileId, load]);

  // Apply filter
  const filtered = trades.filter((t) => {
    if (t.parentTradeId) return false;
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

  const mergeCandidates = useMemo(() => {
    if (!mergeTrade) return [];
    const candidates = trades.filter((t) => {
      if (t._id === mergeTrade._id) return false;
      if (t.parentTradeId && t.parentTradeId !== mergeTrade._id) return false;
      if (t.parentTradeId === mergeTrade._id) return true;
      if (filterSymbol && !t.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) return false;
      if (filterDirection !== "all" && t.direction !== filterDirection) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterSource !== "all" && t.source !== filterSource) return false;
      return true;
    });
    return candidates.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime();
      else if (sortBy === "pnl") cmp = a.profit - b.profit;
      else if (sortBy === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (sortBy === "lots") cmp = a.lots - b.lots;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [mergeTrade, trades, filterSymbol, filterDirection, filterStatus, filterSource, sortBy, sortDir]);

  const activeFilterCount = [
    filterSymbol !== "",
    filterDirection !== "all",
    filterStatus !== "all",
    filterSource !== "all",
  ].filter(Boolean).length;

  // Pagination — reset to page 1 whenever filter/sort changes
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(col: TradesSortFilterPrefs["sortBy"]) {
    setCurrentPage(1);
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("desc"); }
  }

  function resetFilters() {
    setCurrentPage(1);
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
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {mt5?.connected ? (
              <><Wifi className="h-3 w-3 text-emerald-400" /><span className="text-[11px] text-emerald-400">MT5 Connected</span></>
            ) : (
              <><WifiOff className="h-3 w-3 text-muted-foreground" /><span className="text-[11px] text-muted-foreground">Not connected</span></>
            )}
            {activeProfileId && tradingProfiles.find((p) => p.id === activeProfileId) && (
              <>
                <span className="text-[11px] text-white/20">·</span>
                <span
                  className="text-[11px] font-medium"
                  style={{ color: tradingProfiles.find((p) => p.id === activeProfileId)?.color }}
                >
                  {tradingProfiles.find((p) => p.id === activeProfileId)?.name}
                </span>
              </>
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
          <a
            href="/mt5/MT5-Stratix.zip"
            download="MT5-Stratix.zip"
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-card border border-border text-[13px] font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition"
            title="Download MT5 Chrome Extension"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">MT5 Extension</span>
          </a>
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
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-[13px] font-semibold text-white transition shadow-lg "
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
                {totalPages > 1 && <span className="ml-1 text-white/30">· page {safePage}/{totalPages}</span>}
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
                    ? "bg-white/[0.08] text-white border-white/[0.10]"
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
                      className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-white/[0.25] transition pr-7"
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
                              ? "bg-white/[0.08] text-white border-white/[0.10]"
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
                            ? "bg-white/[0.08] text-white border-white/[0.10]"
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
                            ? "bg-white/[0.08] text-white border-white/[0.10]"
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
            <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
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
                  className="text-[11px] mt-1.5 text-white/35 hover:text-white/80 transition-colors"
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
              {paginated.map((trade) => {
                const isParent = trade.mergedTradeIds && trade.mergedTradeIds.length > 0;
                const agg = isParent ? getAggregatedTradeInfo(trade, trades) : null;
                const isExtended = extendedIds.includes(trade._id);

                const displayLots = agg ? agg.lots : trade.lots;
                const displayProfit = agg ? agg.profit : trade.profit;
                const displayEntryPrice = agg ? agg.entryPrice : trade.entryPrice;
                const displayEntryTime = agg ? agg.entryTime : trade.entryTime;
                const displayExitTime = agg ? agg.exitTime : trade.exitTime;

                return (
                  <div key={trade._id} className="divide-y divide-white/5">
                    {/* Main card */}
                    <div className="px-4 py-3.5 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">
                        {trade.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-[13px] font-semibold text-foreground">{trade.symbol}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${trade.direction === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                            {trade.direction === "buy" ? "Long" : "Short"}
                          </span>
                          {isParent && agg && (
                            <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              COMPILED ({agg.childTrades.length + 1})
                            </span>
                          )}
                          {trade.source === "mt5" && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-white/[0.06] border-white/[0.10] text-white/55">MT5</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {format(parseISO(displayEntryTime), "MMM d, HH:mm")}
                          {displayExitTime && <> → {format(parseISO(displayExitTime), "MMM d, HH:mm")}</>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Entry ${displayEntryPrice.toLocaleString()} · {displayLots} lots
                          {trade.leverage && <> · <span className="text-white/55">{trade.leverage}×</span></>}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className={`text-[14px] font-bold ${displayProfit > 0 ? "text-emerald-400" : displayProfit < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {fmt(displayProfit)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setMergeTrade(trade)}
                            className="text-muted-foreground/50 hover:text-amber-400 transition p-1"
                            title="Merge trades"
                          >
                            <Puzzle className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => startEdit(trade)} className="text-muted-foreground/50 hover:text-white/80 transition p-1">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(trade._id)}
                            disabled={deleting === trade._id}
                            className="text-muted-foreground/50 hover:text-red-400 transition p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {isParent && (
                            <button
                              onClick={() => setExtendedIds(prev => prev.includes(trade._id) ? prev.filter(x => x !== trade._id) : [...prev, trade._id])}
                              className="text-muted-foreground/55 hover:text-foreground transition p-1"
                            >
                              {isExtended ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Extended child cards */}
                    {isParent && isExtended && agg && (
                      <div className="bg-white/[0.01] pl-6 py-1 divide-y divide-white/5">
                        {/* Parent itself as first child */}
                        <div className="py-2.5 flex items-center justify-between text-[11px] pr-4 text-muted-foreground">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white/40 font-mono text-[8px]">#1 (Main)</span>
                              <span className="font-semibold text-foreground/80">{trade.symbol}</span>
                              <span className={trade.direction === "buy" ? "text-emerald-400" : "text-red-400"}>
                                {trade.direction === "buy" ? "Long" : "Short"}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              Entry: ${trade.entryPrice} · Lots: {trade.lots} · {format(parseISO(trade.entryTime), "MMM d, HH:mm")}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={trade.profit > 0 ? "text-emerald-400/80" : trade.profit < 0 ? "text-red-400/80" : ""}>
                              {fmt(trade.profit)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => startEdit(trade)} className="text-muted-foreground/40 hover:text-white/80 transition p-0.5">
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button onClick={() => setDeleteConfirmId(trade._id)} className="text-muted-foreground/40 hover:text-red-400 transition p-0.5">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Other child trades */}
                        {agg.childTrades.map((child, idx) => (
                          <div key={child._id} className="py-2.5 flex items-center justify-between text-[11px] pr-4 text-muted-foreground">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-white/40 font-mono text-[8px]">#{idx + 2}</span>
                                <span className="font-semibold text-foreground/80">{child.symbol}</span>
                                <span className={child.direction === "buy" ? "text-emerald-400" : "text-red-400"}>
                                  {child.direction === "buy" ? "Long" : "Short"}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                Entry: ${child.entryPrice} · Lots: {child.lots} · {format(parseISO(child.entryTime), "MMM d, HH:mm")}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={child.profit > 0 ? "text-emerald-400/80" : child.profit < 0 ? "text-red-400/80" : ""}>
                                {fmt(child.profit)}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => startEdit(child)} className="text-muted-foreground/40 hover:text-white/80 transition p-0.5">
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button onClick={() => setDeleteConfirmId(child._id)} className="text-muted-foreground/40 hover:text-red-400 transition p-0.5">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                  {paginated.map((trade) => {
                    const isParent = trade.mergedTradeIds && trade.mergedTradeIds.length > 0;
                    const agg = isParent ? getAggregatedTradeInfo(trade, trades) : null;
                    const isExtended = extendedIds.includes(trade._id);

                    const displayLots = agg ? agg.lots : trade.lots;
                    const displayProfit = agg ? agg.profit : trade.profit;
                    const displayEntryPrice = agg ? agg.entryPrice : trade.entryPrice;
                    const displayExitPrice = agg ? agg.exitPrice : trade.exitPrice;
                    const displayEntryTime = agg ? agg.entryTime : trade.entryTime;
                    const displayExitTime = agg ? agg.exitTime : trade.exitTime;
                    const displayLeverage = agg ? agg.leverage : trade.leverage;
                    const displayMargin = agg ? agg.margin : trade.margin;

                    return (
                      <Fragment key={trade._id}>
                        <tr className="hover:bg-muted/20 transition-colors group">
                          <td className="px-5 py-3.5">
                            <div className="text-[11px] text-muted-foreground">Open: {format(parseISO(displayEntryTime), "MMM d, hh:mm aa")}</div>
                            {displayExitTime && <div className="text-[11px] text-muted-foreground/70">Close: {format(parseISO(displayExitTime), "MMM d, hh:mm aa")}</div>}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center text-[9px] font-bold text-amber-400 shrink-0">{trade.symbol.slice(0, 2)}</div>
                              <span className="text-[13px] font-semibold text-foreground">{trade.symbol}</span>
                              {isParent && agg && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  COMPILED ({agg.childTrades.length + 1})
                                </span>
                              )}
                              {isParent && (
                                <button
                                  onClick={() => setExtendedIds(prev => prev.includes(trade._id) ? prev.filter(x => x !== trade._id) : [...prev, trade._id])}
                                  className="p-1 rounded hover:bg-white/10 transition text-muted-foreground hover:text-foreground"
                                >
                                  {isExtended ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${trade.direction === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                              {trade.direction === "buy" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {trade.direction === "buy" ? "Long" : "Short"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[13px] text-foreground/70">${displayEntryPrice.toLocaleString()}</td>
                          <td className="px-5 py-3.5 text-[13px] text-muted-foreground">{displayExitPrice ? `$${displayExitPrice.toLocaleString()}` : "—"}</td>
                          <td className="px-5 py-3.5 text-[13px] text-foreground/60">{displayLots}</td>
                          <td className="px-5 py-3.5">
                            <div className="text-[12px] font-bold text-white/55">{displayLeverage ?? 100}×</div>
                            {displayMargin != null && (
                              <div className="text-[10px] text-muted-foreground">M: ${displayMargin.toFixed(2)}</div>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-[13px] font-bold ${displayProfit > 0 ? "text-emerald-400" : displayProfit < 0 ? "text-red-400" : "text-muted-foreground"}`}>{fmt(displayProfit)}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${trade.source === "mt5" ? "bg-white/[0.06] border-white/[0.10] text-white/55" : "bg-muted border-border text-muted-foreground"}`}>
                              {trade.source === "mt5" ? "MT5" : "Manual"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setMergeTrade(trade)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition"
                                title="Merge trades"
                              >
                                <Puzzle className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => startEdit(trade)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white/80 hover:bg-white/[0.07] transition"
                                title="Edit trade"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(trade._id)}
                                disabled={deleting === trade._id}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
                                title="Delete trade"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isParent && isExtended && agg && (
                          <>
                            {/* Main parent itself as first child row */}
                            <tr key={`${trade._id}-child-main`} className="bg-white/[0.01] hover:bg-muted/10 border-l-2 border-l-amber-500/20 text-muted-foreground/85 transition-colors group text-[12px]">
                              <td className="px-5 py-2">
                                <div className="text-[10px] text-muted-foreground/60">Open: {format(parseISO(trade.entryTime), "MMM d, hh:mm aa")}</div>
                                {trade.exitTime && <div className="text-[10px] text-muted-foreground/50">Close: {format(parseISO(trade.exitTime), "MMM d, hh:mm aa")}</div>}
                              </td>
                              <td className="px-5 py-2">
                                <div className="flex items-center gap-2 pl-4 text-[11px]">
                                  <span className="text-white/45 font-mono text-[9px]">#1 (Main)</span>
                                  <span className="font-semibold text-foreground/75">{trade.symbol}</span>
                                </div>
                              </td>
                              <td className="px-5 py-2">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.2 rounded-full ${trade.direction === "buy" ? "bg-emerald-500/10 text-emerald-400/80" : "bg-red-500/10 text-red-400/80"}`}>
                                  {trade.direction === "buy" ? "Long" : "Short"}
                                </span>
                              </td>
                              <td className="px-5 py-2 text-[12px] text-foreground/50">${trade.entryPrice.toLocaleString()}</td>
                              <td className="px-5 py-2 text-[12px] text-muted-foreground/50">{trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : "—"}</td>
                              <td className="px-5 py-2 text-[12px] text-foreground/50">{trade.lots}</td>
                              <td className="px-5 py-2">
                                <div className="text-[11px] font-bold text-white/45">{trade.leverage ?? 100}×</div>
                                {trade.margin != null && (
                                  <div className="text-[9px] text-muted-foreground/50">M: ${trade.margin.toFixed(2)}</div>
                                )}
                              </td>
                              <td className="px-5 py-2">
                                <span className={`text-[12px] font-semibold ${trade.profit > 0 ? "text-emerald-400/80" : trade.profit < 0 ? "text-red-400/80" : "text-muted-foreground/50"}`}>{fmt(trade.profit)}</span>
                              </td>
                              <td className="px-5 py-2">
                                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-muted text-muted-foreground/75">
                                  {trade.source === "mt5" ? "MT5" : "Manual"}
                                </span>
                              </td>
                              <td className="px-5 py-2">
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => startEdit(trade)}
                                    className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-white/80 hover:bg-white/[0.07] transition"
                                    title="Edit trade"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(trade._id)}
                                    disabled={deleting === trade._id}
                                    className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
                                    title="Delete trade"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Aggregated child rows */}
                            {agg.childTrades.map((child, idx) => (
                              <tr key={child._id} className="bg-white/[0.01] hover:bg-muted/10 border-l-2 border-l-amber-500/20 text-muted-foreground/80 transition-colors group text-[12px]">
                                <td className="px-5 py-2">
                                  <div className="text-[10px] text-muted-foreground/60">Open: {format(parseISO(child.entryTime), "MMM d, hh:mm aa")}</div>
                                  {child.exitTime && <div className="text-[10px] text-muted-foreground/50">Close: {format(parseISO(child.exitTime), "MMM d, hh:mm aa")}</div>}
                                </td>
                                <td className="px-5 py-2">
                                  <div className="flex items-center gap-2 pl-4 text-[11px]">
                                    <span className="text-white/45 font-mono text-[9px]">#{idx + 2}</span>
                                    <span className="font-semibold text-foreground/75">{child.symbol}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-2">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.2 rounded-full ${child.direction === "buy" ? "bg-emerald-500/10 text-emerald-400/80" : "bg-red-500/10 text-red-400/80"}`}>
                                    {child.direction === "buy" ? "Long" : "Short"}
                                  </span>
                                </td>
                                <td className="px-5 py-2 text-[12px] text-foreground/50">${child.entryPrice.toLocaleString()}</td>
                                <td className="px-5 py-2 text-[12px] text-muted-foreground/50">{child.exitPrice ? `$${child.exitPrice.toLocaleString()}` : "—"}</td>
                                <td className="px-5 py-2 text-[12px] text-foreground/50">{child.lots}</td>
                                <td className="px-5 py-2">
                                  <div className="text-[11px] font-bold text-white/40">{child.leverage ?? 100}×</div>
                                  {child.margin != null && (
                                    <div className="text-[9px] text-muted-foreground/50">M: ${child.margin.toFixed(2)}</div>
                                  )}
                                </td>
                                <td className="px-5 py-2">
                                  <span className={`text-[12px] font-semibold ${child.profit > 0 ? "text-emerald-400/80" : child.profit < 0 ? "text-red-400/80" : "text-muted-foreground/50"}`}>{fmt(child.profit)}</span>
                                </td>
                                <td className="px-5 py-2">
                                  <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-muted text-muted-foreground/75">
                                    {child.source === "mt5" ? "MT5" : "Manual"}
                                  </span>
                                </td>
                                <td className="px-5 py-2">
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => startEdit(child)}
                                      className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-white/80 hover:bg-white/[0.07] transition"
                                      title="Edit trade"
                                    >
                                      <Edit2 className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirmId(child._id)}
                                      disabled={deleting === child._id}
                                      className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition"
                                      title="Delete trade"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 md:px-5 py-3 border-t border-border/50">
                <span className="text-[11px] text-muted-foreground">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={safePage === 1}
                    className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition"
                  >«</button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="px-2.5 py-1 rounded text-[11px] text-muted-foreground hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition"
                  >‹ Prev</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                    const p = start + i;
                    return p <= totalPages ? (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-7 h-7 rounded text-[11px] font-medium transition ${p === safePage ? "bg-white/[0.10] text-white border border-white/[0.12]" : "text-muted-foreground hover:text-white hover:bg-white/[0.06]"}`}
                      >{p}</button>
                    ) : null;
                  })}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="px-2.5 py-1 rounded text-[11px] text-muted-foreground hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition"
                  >Next ›</button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safePage === totalPages}
                    className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition"
                  >»</button>
                </div>
              </div>
            )}
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
          onSaved={() => { setShowAdd(false); load(activeProfileId); }}
          profileId={activeProfileId || undefined}
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
              load(activeProfileId);
            }
          }}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            load(activeProfileId);
          }}
          profileId={activeProfileId || undefined}
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
                <Puzzle className="h-3.5 w-3.5" />
                Chrome Extension <span className="text-[10px] text-emerald-400 font-semibold">FREE</span>
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
              <div className="space-y-4 text-[13px]">
                {/* Intro */}
                <p className="text-muted-foreground text-[12px] leading-relaxed">
                  A free Chrome extension that reads your trade history directly from the MT5 Web Terminal and syncs it to Stratix in one click — no subscriptions, no API keys.
                </p>

                {/* Download CTA */}
                <a
                  href="/mt5/MT5-Stratix.zip"
                  download="MT5-Stratix.zip"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/[0.09] hover:bg-white/[0.14] border border-white/[0.12] text-white text-[13px] font-semibold transition"
                >
                  <Download className="h-4 w-4" />
                  Download MT5 Stratix Extension (.zip)
                </a>

                {/* Step-by-step */}
                <div className="space-y-2.5">
                  {/* Step 1 */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-white/70 flex items-center justify-center shrink-0">1</span>
                      <div className="flex items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-foreground">Download &amp; Extract</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                      Click the button above to download <code className="bg-muted px-1 py-0.5 rounded text-[10px]">MT5-Stratix.zip</code>.
                      Right-click the file and select <strong className="text-foreground">Extract All</strong> (Windows) or double-click (Mac).
                      You will get a folder called <code className="bg-muted px-1 py-0.5 rounded text-[10px]">MT5 Sync v5</code>.
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-white/70 flex items-center justify-center shrink-0">2</span>
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-foreground">Open Chrome Extensions</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                      In Google Chrome, go to{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-[10px]">chrome://extensions</code>{" "}
                      in the address bar and press <kbd className="px-1 py-0.5 rounded bg-muted text-foreground text-[10px]">Enter</kbd>.
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-white/70 flex items-center justify-center shrink-0">3</span>
                      <div className="flex items-center gap-1.5">
                        <ToggleRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-foreground">Enable Developer Mode</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                      In the top-right corner of the Extensions page, toggle <strong className="text-foreground">Developer mode</strong> ON. Three new buttons will appear at the top left.
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-white/70 flex items-center justify-center shrink-0">4</span>
                      <div className="flex items-center gap-1.5">
                        <Puzzle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-foreground">Load the Extension</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                      Click <strong className="text-foreground">Load unpacked</strong> → navigate to and select the <code className="bg-muted px-1 py-0.5 rounded text-[10px]">MT5 Sync v5</code> folder you extracted. The <strong className="text-foreground">MT5 Trade Extractor</strong> extension will appear in your list.
                    </p>
                  </div>

                  {/* Step 5 */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-white/70 flex items-center justify-center shrink-0">5</span>
                      <div className="flex items-center gap-1.5">
                        <MonitorDot className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-foreground">Open MT5 Web Terminal</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                      In the same Chrome window, open your broker&apos;s <strong className="text-foreground">MT5 Web Terminal</strong> and log in with your trading account credentials. Navigate to the <strong className="text-foreground">History</strong> tab to ensure your trades are visible.
                    </p>
                  </div>

                  {/* Step 6 */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-white/70 flex items-center justify-center shrink-0">6</span>
                      <div className="flex items-center gap-1.5">
                        <MousePointerClick className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-foreground">Sync Your Trades</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                      Click the <strong className="text-foreground">MT5 Trade Extractor</strong> icon in your Chrome toolbar (pin it first using the puzzle-piece icon). In the popup, click <strong className="text-foreground">Sync to Stratix</strong>. Your trades will import into this page instantly.
                    </p>
                  </div>

                  {/* Step 7 */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-white/70 flex items-center justify-center shrink-0">7</span>
                      <div className="flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[12px] font-semibold text-foreground">Ongoing Sync</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-7 leading-relaxed">
                      Repeat step 6 whenever you want to refresh your trades. The extension only imports new trades — duplicates are automatically ignored.
                    </p>
                  </div>
                </div>

                {/* Tip */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    <strong className="text-amber-300">Tip:</strong> Pin the extension by clicking the Chrome puzzle-piece icon (top-right) and selecting the pin next to <em>MT5 Trade Extractor</em> — this keeps it one click away.
                  </p>
                </div>

                <button
                  onClick={() => setShowConnect(false)}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-semibold transition"
                >
                  Done — extension is installed
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {mergeTrade && (
        <MergeModal
          parentTrade={mergeTrade as any}
          allTrades={mergeCandidates as any}
          onClose={() => setMergeTrade(null)}
          onMerged={() => {
            setMergeTrade(null);
            window.dispatchEvent(new CustomEvent("refresh-trades"));
          }}
        />
      )}
    </div>
  );
}
