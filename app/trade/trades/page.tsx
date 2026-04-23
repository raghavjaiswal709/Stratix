"use client";

import { useEffect, useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Edit2,
  Filter,
} from "lucide-react";
import { AddTradeModal } from "@/components/trade/trades/add-trade-modal";
import { MT5ConnectModal } from "@/components/trade/trades/mt5-connect-modal";

interface Trade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  profit: number;
  status: "open" | "closed";
  source: "manual" | "mt5";
}

interface MT5Config {
  connected: boolean;
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [mt5, setMt5] = useState<MT5Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/trade").then((r) => r.json()),
      fetch("/api/trade/mt5").then((r) => r.json()),
    ])
      .then(([t, m]) => {
        setTrades(Array.isArray(t) ? t : []);
        setMt5(m);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteTrade(id: string) {
    if (!confirm("Delete this trade?")) return;
    setDeleting(id);
    await fetch(`/api/trade/${id}`, { method: "DELETE" });
    setTrades((prev) => prev.filter((t) => t._id !== id));
    setDeleting(null);
  }

  async function clearAll() {
    if (!confirm("Delete ALL trades? This cannot be undone.")) return;
    await Promise.all(trades.map((t) => fetch(`/api/trade/${t._id}`, { method: "DELETE" })));
    setTrades([]);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] md:text-[20px] font-bold text-white">Trades</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {mt5?.connected ? (
              <><Wifi className="h-3 w-3 text-emerald-400" /><span className="text-[11px] text-emerald-400">MT5 Connected</span></>
            ) : (
              <><WifiOff className="h-3 w-3 text-white/30" /><span className="text-[11px] text-white/30">Not connected</span></>
            )}
          </div>
        </div>
        {/* Action buttons — icon-only on mobile */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConnect(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl bg-[#1e2536] border border-white/10 text-[13px] font-medium text-white/70 hover:text-white hover:bg-[#252d42] transition"
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
      <div className="rounded-2xl border border-white/7 bg-[#141720] overflow-hidden">
        <div className="flex items-center justify-between px-4 md:px-5 py-4 border-b border-white/7">
          <div>
            <h3 className="text-[14px] font-semibold text-white">Trade History</h3>
            <p className="text-[11px] text-white/35">{trades.length} trade{trades.length !== 1 ? "s" : ""}</p>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-[12px] text-white/50 hover:text-white/80 transition">
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        ) : trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/25">
            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
              <TrendingUp className="h-5 w-5 opacity-50" />
            </div>
            <p className="text-[13px]">No trades yet</p>
            <p className="text-[11px] mt-1">Add a trade manually or connect MT5</p>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-white/4">
              {trades.map((trade) => (
                <div key={trade._id} className="px-4 py-3.5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">
                    {trade.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-white">{trade.symbol}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${trade.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                        {trade.direction === "buy" ? "Long" : "Short"}
                      </span>
                      {trade.source === "mt5" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/20 text-violet-400">MT5</span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/40">
                      {format(parseISO(trade.entryTime), "MMM d, HH:mm")}
                      {trade.exitTime && <> → {format(parseISO(trade.exitTime), "MMM d, HH:mm")}</>}
                    </p>
                    <p className="text-[11px] text-white/40">
                      Entry ${trade.entryPrice.toLocaleString()} · {trade.lots} lots
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[14px] font-bold ${trade.profit > 0 ? "text-blue-400" : trade.profit < 0 ? "text-red-400" : "text-white/40"}`}>
                      {fmt(trade.profit)}
                    </span>
                    <button
                      onClick={() => deleteTrade(trade._id)}
                      disabled={deleting === trade._id}
                      className="text-white/20 hover:text-red-400 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Open / Close", "Symbol", "Type", "Entry", "Exit", "Size", "P&L", "Source", ""].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-white/30 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/4">
                  {trades.map((trade) => (
                    <tr key={trade._id} className="hover:bg-white/2 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="text-[11px] text-white/60">Open: {format(parseISO(trade.entryTime), "MMM d, hh:mm aa")}</div>
                        {trade.exitTime && <div className="text-[11px] text-white/35">Close: {format(parseISO(trade.exitTime), "MMM d, hh:mm aa")}</div>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center text-[9px] font-bold text-amber-400">{trade.symbol.slice(0, 2)}</div>
                          <span className="text-[13px] font-semibold text-white">{trade.symbol}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${trade.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                          {trade.direction === "buy" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {trade.direction === "buy" ? "Long" : "Short"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-white/70">${trade.entryPrice.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-[13px] text-white/50">{trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : "—"}</td>
                      <td className="px-5 py-3.5 text-[13px] text-white/60">{trade.lots}</td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[13px] font-bold ${trade.profit > 0 ? "text-blue-400" : trade.profit < 0 ? "text-red-400" : "text-white/40"}`}>{fmt(trade.profit)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${trade.source === "mt5" ? "bg-violet-500/10 border-violet-500/20 text-violet-400" : "bg-white/5 border-white/10 text-white/40"}`}>
                          {trade.source === "mt5" ? "MT5" : "Manual"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => deleteTrade(trade._id)} disabled={deleting === trade._id} className="h-7 w-7 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition">
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
      {showConnect && <MT5ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}
