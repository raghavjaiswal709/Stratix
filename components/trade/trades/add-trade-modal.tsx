"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { X, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";

// ── Symbol presets ───────────────────────────────────────────────────────────
const KNOWN_SYMBOLS = ["XAUUSD", "XAGUSD", "GBPUSD", "EURUSD", "USDCAD", "USDJPY", "ETHUSD", "BTCUSDT"];

// ── Relevant lot-size suggestions per symbol ─────────────────────────────────
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

interface AddTradeModalProps {
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_CHECKLIST = [
  "Checked higher timeframe",
  "Risk within limits",
  "Fits my trading plan",
  "Key levels identified",
  "Economic calendar checked",
];

export function AddTradeModal({ onClose, onSaved }: AddTradeModalProps) {
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [symbol, setSymbol] = useState("");
  const [lots, setLots] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [entryTime, setEntryTime] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [exitTime, setExitTime] = useState("");
  const [notes, setNotes] = useState("");
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklist, setChecklist] = useState(
    DEFAULT_CHECKLIST.map((item) => ({ item, checked: false }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Symbol combo dropdown
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
    setChecklist((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, checked: !c.checked } : c))
    );
  };

  const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  // Live P&L preview
  const previewProfit = useMemo(() => {
    const ep = parseFloat(entryPrice);
    const xp = parseFloat(exitPrice);
    const l = parseFloat(lots);
    if (!isNaN(ep) && !isNaN(xp) && !isNaN(l) && l > 0) {
      return direction === "buy" ? (xp - ep) * l : (ep - xp) * l;
    }
    return null;
  }, [direction, entryPrice, exitPrice, lots]);

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
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          direction,
          lots: parseFloat(lots),
          entryPrice: parseFloat(entryPrice),
          exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
          entryTime,
          exitTime: exitTime || undefined,
          notes,
          executionChecklist: checklist,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save");
        return;
      }
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-125 rounded-2xl bg-[#141720] border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/7">
          <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-blue-400" />
          </div>
          <h2 className="text-[15px] font-semibold text-white flex-1">Add Trade</h2>
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
                direction === "buy"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Long
            </button>
            <button
              onClick={() => setDirection("sell")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                direction === "sell"
                  ? "bg-red-600 text-white shadow-lg shadow-red-500/20"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              <TrendingDown className="h-3.5 w-3.5" />
              Short
            </button>
          </div>

          {/* Symbol + Quantity */}
          <div className="grid grid-cols-2 gap-3">
            {/* Symbol — combo dropdown */}
            <div ref={symbolRef} className="relative">
              <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Symbol</label>
              <div className="relative">
                <input
                  value={symbol}
                  onChange={(e) => {
                    setSymbol(e.target.value.toUpperCase());
                    setSymbolDropdownOpen(true);
                  }}
                  onFocus={() => setSymbolDropdownOpen(true)}
                  placeholder="XAUUSD"
                  className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 pr-8 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition"
                />
                <button
                  type="button"
                  onClick={() => setSymbolDropdownOpen((o) => !o)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                >
                  {symbolDropdownOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              {symbolDropdownOpen && (
                <div className="absolute z-50 top-full mt-1 w-full rounded-xl bg-[#1a1f2e] border border-white/10 shadow-2xl overflow-hidden">
                  {filteredSymbols.length > 0 ? (
                    filteredSymbols.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onMouseDown={() => {
                          setSymbol(s);
                          setSymbolDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-white/70 hover:bg-blue-600/15 hover:text-white transition text-left"
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

            {/* Quantity / Lots */}
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Quantity (Lots)</label>
              <input
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                placeholder="0.10"
                type="number"
                step="0.001"
                min="0"
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition"
              />
            </div>
          </div>

          {/* Lot-size quick-pick chips */}
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
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
                  }`}
                >
                  {ls}
                </button>
              ))}
            </div>
          </div>

          {/* Entry + Exit Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Entry Price</label>
              <input
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                type="number"
                step="any"
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Exit Price</label>
              <input
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="Optional"
                type="number"
                step="any"
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition"
              />
            </div>
          </div>

          {/* P&L Preview */}
          {previewProfit !== null && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 border ${
              previewProfit >= 0
                ? "bg-emerald-600/10 border-emerald-500/20"
                : "bg-red-600/10 border-red-500/20"
            }`}>
              <span className="text-[11px] uppercase tracking-wider font-semibold text-white/40">Estimated P&L</span>
              <span className={`text-[15px] font-bold ${
                previewProfit >= 0 ? "text-emerald-400" : "text-red-400"
              }`}>
                {previewProfit >= 0 ? "+" : ""}{previewProfit.toFixed(2)}
              </span>
            </div>
          )}

          {/* Entry + Exit Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Entry Date</label>
              <input
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                type="datetime-local"
                max={nowStr}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white/80 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition scheme-dark"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Exit Date</label>
              <input
                value={exitTime}
                onChange={(e) => setExitTime(e.target.value)}
                type="datetime-local"
                placeholder="Optional"
                max={nowStr}
                className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white/80 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition scheme-dark"
              />
            </div>
          </div>

          {/* Pre-Trade Checklist (collapsible) */}
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
                        c.checked
                          ? "bg-blue-600 border-blue-500"
                          : "bg-transparent border-white/20 group-hover:border-white/40"
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

          {/* Notes */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Trade rationale, entry/exit notes..."
              rows={3}
              className="w-full rounded-xl bg-white/5 border border-white/8 px-3 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition resize-none"
            />
          </div>

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
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-[13px] font-semibold text-white transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
