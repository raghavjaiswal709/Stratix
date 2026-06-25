"use client";

/**
 * SymbolSelector — symbol dropdown + interval tabs for the live chart page.
 * Matches the Stratix dark/glass theme (no blue; white/glass surfaces).
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SymbolSelectorProps {
  selectedSymbol: string;
  selectedInterval: string;
  onSymbolChange: (symbol: string) => void;
  onIntervalChange: (interval: string) => void;
  currentPrice?: number;
  connectionStatus: "connected" | "disconnected" | "reconnecting";
}

export const SYMBOLS = [
  { value: "XAUUSD", label: "Gold", category: "Metals" },
  { value: "XAGUSD", label: "Silver", category: "Metals" },
  { value: "EURUSD", label: "EUR/USD", category: "Forex" },
  { value: "GBPUSD", label: "GBP/USD", category: "Forex" },
  { value: "USDJPY", label: "USD/JPY", category: "Forex" },
  { value: "USDCHF", label: "USD/CHF", category: "Forex" },
  { value: "USDCAD", label: "USD/CAD", category: "Forex" },
  { value: "AUDUSD", label: "AUD/USD", category: "Forex" },
  { value: "BTCUSD", label: "Bitcoin", category: "Crypto" },
  { value: "ETHUSD", label: "Ethereum", category: "Crypto" },
] as const;

export const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;

const CATEGORIES = ["Metals", "Forex", "Crypto"] as const;

function precisionFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 3;
  if (s === "XAUUSD" || s === "XAGUSD" || s === "BTCUSD" || s === "ETHUSD") return 2;
  return 5;
}

export function SymbolSelector({
  selectedSymbol,
  selectedInterval,
  onSymbolChange,
  onIntervalChange,
  currentPrice,
  connectionStatus,
}: SymbolSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = SYMBOLS.find((s) => s.value === selectedSymbol);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const dotColor =
    connectionStatus === "connected"
      ? "#10b981"
      : connectionStatus === "reconnecting"
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0f0f0f] px-3 py-2.5">
      {/* Left: symbol dropdown + price */}
      <div className="flex items-center gap-3">
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[13px] font-semibold text-white/85 transition-all hover:bg-white/[0.07]"
          >
            <span>{active?.label ?? selectedSymbol}</span>
            <span className="text-[11px] font-mono text-white/35">{selectedSymbol}</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-white/35 transition-transform", open && "rotate-180")}
            />
          </button>

          {open && (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111]/95 shadow-2xl backdrop-blur-2xl">
              {CATEGORIES.map((cat) => (
                <div key={cat} className="border-b border-white/[0.05] py-1 last:border-b-0">
                  <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-white/20">
                    {cat}
                  </div>
                  {SYMBOLS.filter((s) => s.category === cat).map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        onSymbolChange(s.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-all hover:bg-white/[0.05]",
                        s.value === selectedSymbol
                          ? "font-medium text-white"
                          : "text-white/55 hover:text-white/85"
                      )}
                    >
                      <span className="flex-1 text-left">{s.label}</span>
                      <span className="font-mono text-[10px] text-white/30">{s.value}</span>
                      {s.value === selectedSymbol && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-white/60" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live price */}
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
          />
          <span className="font-mono text-[15px] font-semibold tabular-nums text-white/90">
            {currentPrice != null
              ? currentPrice.toLocaleString(undefined, {
                  minimumFractionDigits: precisionFor(selectedSymbol),
                  maximumFractionDigits: precisionFor(selectedSymbol),
                })
              : "—"}
          </span>
        </div>
      </div>

      {/* Right: interval tabs */}
      <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            onClick={() => onIntervalChange(iv)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-all",
              iv === selectedInterval
                ? "bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                : "text-white/35 hover:text-white/70 hover:bg-white/[0.05]"
            )}
          >
            {iv}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SymbolSelector;
