"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { X, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";
import { getContractSize } from "@/lib/contract-sizes";
import { cn } from "@/lib/utils";

const KNOWN_SYMBOLS = ["XAUUSD", "XAGUSD", "GBPUSD", "EURUSD", "USDCAD", "USDJPY", "ETHUSD", "BTCUSDT"];

const LOT_SIZES: Record<string, number[]> = {
  XAUUSD:  [0.01, 0.05, 0.10, 0.25, 0.50, 1.00],
  XAGUSD:  [0.01, 0.05, 0.10, 0.25, 0.50, 1.00],
  GBPUSD:  [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00],
  EURUSD:  [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00],
  USDCAD:  [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00],
  USDJPY:  [0.01, 0.05, 0.10, 0.25, 0.50, 1.00, 2.00],
  ETHUSD:  [0.01, 0.05, 0.10, 0.25, 0.50, 1.00],
  BTCUSDT: [0.001, 0.01, 0.05, 0.10, 0.25, 0.50],
};
const DEFAULT_LOT_SIZES = [0.01, 0.05, 0.10, 0.25, 0.50, 1.00];

const TF_OPTIONS = ["1m", "5m", "15m", "30m", "1H", "4H"];

const DEFAULT_CHECKLIST = [
  "A+ level",
  "Other Levels",
  "Confirmation",
  "RiskFree",
  "Risk Management",
  "News",
  "Multi timeframe analysis",
];

export interface EditableTrade {
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
  leverage?: number;
}

interface AddTradeModalProps {
  onClose: () => void;
  onSaved: (updated: Record<string, unknown> | null) => void;
  editTrade?: EditableTrade;
  profileId?: string;
}

export function AddTradeModal({ onClose, onSaved, editTrade, profileId }: AddTradeModalProps) {
  const isEdit = !!editTrade;

  const [direction, setDirection] = useState<"buy" | "sell">(editTrade?.direction ?? "buy");
  const [symbol, setSymbol] = useState(editTrade?.symbol ?? "");
  const [lots, setLots] = useState(editTrade ? String(editTrade.lots) : "");
  const [entryPrice, setEntryPrice] = useState(editTrade ? String(editTrade.entryPrice) : "");
  const [exitPrice, setExitPrice] = useState(editTrade?.exitPrice ? String(editTrade.exitPrice) : "");
  const [stopLoss, setStopLoss] = useState(editTrade?.stopLoss ? String(editTrade.stopLoss) : "");
  const [takeProfit, setTakeProfit] = useState(editTrade?.takeProfit ? String(editTrade.takeProfit) : "");
  const [timeframe, setTimeframe] = useState(editTrade?.timeframe ?? "");
  const [entryTime, setEntryTime] = useState(
    editTrade ? format(new Date(editTrade.entryTime), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [exitTime, setExitTime] = useState(
    editTrade?.exitTime ? format(new Date(editTrade.exitTime), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [notes, setNotes] = useState("");
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState(
    DEFAULT_CHECKLIST.map((item) => ({ item, checked: false }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [leverage, setLeverage] = useState(editTrade?.leverage ?? 100);

  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const symbolRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (symbolRef.current && !symbolRef.current.contains(e.target as Node)) {
        setSymbolDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filteredSymbols = symbol
    ? KNOWN_SYMBOLS.filter((s) => s.startsWith(symbol.toUpperCase()))
    : KNOWN_SYMBOLS;

  const lotSuggestions = LOT_SIZES[symbol.toUpperCase()] ?? DEFAULT_LOT_SIZES;

  const toggleCheck = (i: number) => {
    setChecklist((prev) => prev.map((c, idx) => (idx === i ? { ...c, checked: !c.checked } : c)));
  };

  const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  const preview = useMemo(() => {
    const ep = parseFloat(entryPrice);
    const l = parseFloat(lots);
    if (isNaN(ep) || isNaN(l) || l <= 0 || ep <= 0) return null;
    const cs = getContractSize(symbol);
    const notional = ep * l * cs;
    const margin = notional / leverage;
    const xp = parseFloat(exitPrice);
    if (!isNaN(xp) && exitPrice) {
      const profit = direction === "buy" ? (xp - ep) * l * cs : (ep - xp) * l * cs;
      const roi = margin > 0 ? (profit / margin) * 100 : 0;
      return { notional, margin, profit, roi, contractSize: cs };
    }
    return { notional, margin, profit: null, roi: null, contractSize: cs };
  }, [direction, entryPrice, exitPrice, lots, leverage, symbol]);

  async function handleSave() {
    if (!symbol.trim()) { setError("Symbol is required"); return; }
    if (!lots || isNaN(parseFloat(lots))) { setError("Valid quantity required"); return; }
    if (!entryPrice || isNaN(parseFloat(entryPrice))) { setError("Valid entry price required"); return; }
    if (!entryTime) { setError("Entry date required"); return; }
    const now = new Date();
    if (new Date(entryTime) > now) { setError("Entry date cannot be in the future"); return; }
    if (exitTime && new Date(exitTime) > now) { setError("Exit date cannot be in the future"); return; }
    if (exitTime && entryTime && new Date(exitTime) < new Date(entryTime)) { setError("Exit date must be after entry date"); return; }

    setSaving(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        symbol: symbol.toUpperCase(),
        direction,
        lots: parseFloat(lots),
        entryPrice: parseFloat(entryPrice),
        exitPrice: exitPrice ? parseFloat(exitPrice) : null,
        stopLoss: stopLoss ? parseFloat(stopLoss) : null,
        takeProfit: takeProfit ? parseFloat(takeProfit) : null,
        // In edit mode always send timeframe (even "" to clear it).
        // In add mode send only if set (new trades default to no timeframe).
        timeframe: isEdit ? (timeframe || null) : (timeframe || undefined),
        entryTime,
        exitTime: exitTime || null,
        executionChecklist: checklist,
        leverage,
      };

      const url = isEdit ? `/api/trade/${editTrade._id}` : "/api/trade";
      const method = isEdit ? "PUT" : "POST";
      if (!isEdit) body.notes = notes;
      if (!isEdit && profileId) body.profileId = profileId;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save");
        return;
      }
      const data = await res.json();
      // For edits pass the updated doc; for new trades pass null (caller does a full reload)
      onSaved(isEdit ? data : null);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[500px] md:max-w-[820px] rounded-2xl bg-[#141720] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/7">
          <div className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center border",
            isEdit ? "bg-amber-600/20 border-amber-500/30" : "bg-white/[0.08] border-white/[0.12]"
          )}>
            <TrendingUp className={cn("h-4 w-4", isEdit ? "text-amber-400" : "text-white/65")} />
          </div>
          <h2 className="text-[15px] font-semibold text-white flex-1">
            {isEdit ? `Edit Trade — ${editTrade.symbol}` : "Add Trade"}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Direction toggle */}
          <div className="flex rounded-xl bg-white/5 p-1 gap-1">
            <button
              onClick={() => setDirection("buy")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                direction === "buy" ? "bg-white/[0.09] text-white shadow-lg " : "text-white/40 hover:text-white/70"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" /> Long
            </button>
            <button
              onClick={() => setDirection("sell")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                direction === "sell" ? "bg-red-600 text-white shadow-lg shadow-red-500/20" : "text-white/40 hover:text-white/70"
              }`}
            >
              <TrendingDown className="h-3.5 w-3.5" /> Short
            </button>
          </div>

          {/* 2-col layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6 gap-y-4">

            {/* Left col */}
            <div className="space-y-4">
              {/* Symbol + Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div ref={symbolRef} className="relative">
                  <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Symbol</label>
                  <div className="relative">
                    <input
                      value={symbol}
                      onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setSymbolDropdownOpen(true); }}
                      onFocus={() => setSymbolDropdownOpen(true)}
                      placeholder="XAUUSD"
                      disabled={isEdit}
                      className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 pr-8 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {!isEdit && (
                      <button
                        type="button"
                        onClick={() => setSymbolDropdownOpen((o) => !o)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                      >
                        {symbolDropdownOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  {symbolDropdownOpen && !isEdit && (
                    <div className="absolute z-50 top-full mt-1 w-full rounded-xl bg-[#1a1f2e] border border-white/10 shadow-2xl overflow-hidden">
                      {filteredSymbols.length > 0 ? (
                        filteredSymbols.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={() => { setSymbol(s); setSymbolDropdownOpen(false); }}
                            className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-white/70 hover:bg-white/[0.07] hover:text-white transition text-left"
                          >
                            <span>{s}</span>
                            <span className="text-[10px] text-white/25">
                              {s.includes("BTC") || s.includes("ETH") ? "Crypto" : s.includes("XAU") || s.includes("XAG") ? "Metal" : "Forex"}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-[12px] text-white/30">Custom symbol: {symbol}</div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Quantity (Lots)</label>
                  <input
                    value={lots}
                    onChange={(e) => setLots(e.target.value)}
                    placeholder="0.10"
                    type="number" step="0.001" min="0"
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/20 transition"
                  />
                </div>
              </div>

              {/* Lot size chips */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-1.5">
                  Quick Lot Sizes {symbol && LOT_SIZES[symbol.toUpperCase()] ? `— ${symbol}` : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {lotSuggestions.map((ls) => (
                    <button
                      key={ls}
                      type="button"
                      onClick={() => setLots(String(ls))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition ${
                        lots === String(ls)
                          ? "bg-white/[0.09] border-white/30 text-white"
                          : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
                      }`}
                    >
                      {ls}
                    </button>
                  ))}
                </div>
              </div>

              {/* Leverage */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Leverage</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={leverage}
                      onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setLeverage(v); }}
                      type="number" min="1" max="3000"
                      className="w-16 text-right rounded-lg bg-white/5 border border-white/8 px-2 py-1 text-[12px] text-white focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/15 transition"
                    />
                    <span className="text-[12px] font-bold text-white/55">×</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[10, 25, 50, 100, 200, 500].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLeverage(lv)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                        leverage === lv
                          ? "bg-white/[0.12] border-white/30 text-white"
                          : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
                      }`}
                    >
                      {lv}×
                    </button>
                  ))}
                </div>
              </div>

              {/* SL + TP */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-red-400/70 font-semibold mb-1.5">Stop Loss</label>
                  <input
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="Optional"
                    type="number" step="any"
                    className="w-full rounded-xl bg-red-500/5 border border-red-500/15 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-emerald-400/70 font-semibold mb-1.5">Take Profit</label>
                  <input
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="Optional"
                    type="number" step="any"
                    className="w-full rounded-xl bg-emerald-500/5 border border-emerald-500/15 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition"
                  />
                </div>
              </div>
            </div>

            {/* Right col */}
            <div className="space-y-4">
              {/* Entry + Exit Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Entry Price</label>
                  <input
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="0.00"
                    type="number" step="any"
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/20 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Exit Price</label>
                  <input
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    placeholder="Optional"
                    type="number" step="any"
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/20 transition"
                  />
                </div>
              </div>

              {/* Position overview */}
              {preview && (
                <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Position Overview</p>
                    {preview.contractSize > 1 && (
                      <span className="text-[9px] text-white/20">contract: {preview.contractSize.toLocaleString()}/lot</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-white/5">
                    <div className="px-4 pb-3">
                      <p className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">Notional Value</p>
                      <p className="text-[14px] font-bold text-white">
                        ${preview.notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="px-4 pb-3">
                      <p className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">Margin Required</p>
                      <p className="text-[14px] font-bold text-amber-400">
                        ${preview.margin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[9px] text-white/25">{leverage}× leverage</p>
                    </div>
                  </div>
                  {preview.profit !== null && (
                    <div className={`grid grid-cols-2 divide-x divide-white/5 border-t border-white/5 ${
                      preview.profit >= 0 ? "bg-emerald-500/5" : "bg-red-500/5"
                    }`}>
                      <div className="px-4 py-3">
                        <p className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">Est. P&L</p>
                        <p className={`text-[14px] font-bold ${preview.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {preview.profit >= 0 ? "+" : ""}{preview.profit.toFixed(2)}
                        </p>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-[9px] uppercase tracking-wider text-white/30 mb-0.5">ROI on Margin</p>
                        <p className={`text-[14px] font-bold ${preview.roi! >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {preview.roi! >= 0 ? "+" : ""}{preview.roi!.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Entry + Exit Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Entry Date</label>
                  <input
                    value={entryTime}
                    onChange={(e) => setEntryTime(e.target.value)}
                    type="datetime-local" max={nowStr}
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white/80 focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/20 transition scheme-dark"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Exit Date</label>
                  <input
                    value={exitTime}
                    onChange={(e) => setExitTime(e.target.value)}
                    type="datetime-local" max={nowStr}
                    className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white/80 focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/20 transition scheme-dark"
                  />
                </div>
              </div>

              {/* Chart Timeframe */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Chart Timeframe</label>
                <div className="flex flex-wrap gap-1.5">
                  {TF_OPTIONS.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTimeframe(timeframe === tf ? "" : tf)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition",
                        timeframe === tf
                          ? "bg-white/[0.09] border-white/30 text-white"
                          : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Pre-Trade Checklist — only shown when adding */}
          {!isEdit && (
            <div className="rounded-xl border border-white/7 overflow-hidden">
              <button
                onClick={() => setChecklistOpen(!checklistOpen)}
                className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/3 transition"
              >
                <span>Pre-Trade Checklist (Optional)</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${checklistOpen ? "rotate-180" : ""}`} />
              </button>
              {checklistOpen && (
                <div className="px-4 pb-3 space-y-2 border-t border-white/7 pt-3">
                  {checklist.map((c, i) => (
                    <label key={i} className="flex items-center gap-2.5 cursor-pointer group">
                      <div
                        onClick={() => toggleCheck(i)}
                        className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                          c.checked ? "bg-white/[0.09] border-white/30" : "bg-transparent border-white/20 group-hover:border-white/40"
                        }`}
                      >
                        {c.checked && (
                          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-[12px] text-white/60">{c.item}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notes — only for new trades */}
          {!isEdit && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Trade rationale, entry/exit notes..."
                rows={3}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] focus:ring-1 focus:ring-white/20 transition resize-none"
              />
            </div>
          )}

          {error && (
            <p className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-[13px] font-medium text-white/50 hover:text-white/80 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition disabled:opacity-50",
              isEdit ? "bg-amber-600 hover:bg-amber-500" : "bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12]"
            )}
          >
            {saving ? "Saving…" : isEdit ? "Update Trade" : "Save Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
