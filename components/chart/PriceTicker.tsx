"use client";

/**
 * PriceTicker — compact horizontal live-price bar across the top of the chart.
 * Shows every symbol with its current price and 24h change (emerald up / red down).
 */

import { SYMBOLS } from "./SymbolSelector";
import { cn } from "@/lib/utils";

interface TickerEntry {
  price: number;
  change: number;
  changePercent: number;
}

interface PriceTickerProps {
  prices: Map<string, TickerEntry>;
  selectedSymbol?: string;
  onSelect?: (symbol: string) => void;
}

function precisionFor(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 3;
  if (s === "XAUUSD" || s === "XAGUSD" || s === "BTCUSD" || s === "ETHUSD") return 2;
  return 5;
}

export function PriceTicker({ prices, selectedSymbol, onSelect }: PriceTickerProps) {
  return (
    <div className="flex items-stretch gap-0 overflow-x-auto border-b border-white/[0.06] bg-[#0d0d0d] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SYMBOLS.map((s) => {
        const entry = prices.get(s.value);
        const up = (entry?.changePercent ?? 0) >= 0;
        const active = s.value === selectedSymbol;

        return (
          <button
            key={s.value}
            onClick={() => onSelect?.(s.value)}
            className={cn(
              "flex shrink-0 flex-col items-start gap-0.5 border-r border-white/[0.05] px-3.5 py-2 text-left transition-colors",
              active ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-white/45">
                {s.label}
              </span>
              <span className="font-mono text-[8px] text-white/20">{s.value}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[12px] font-semibold tabular-nums text-white/85">
                {entry
                  ? entry.price.toLocaleString(undefined, {
                      minimumFractionDigits: precisionFor(s.value),
                      maximumFractionDigits: precisionFor(s.value),
                    })
                  : "—"}
              </span>
              {entry && (
                <span
                  className={cn(
                    "font-mono text-[10px] font-medium tabular-nums",
                    up ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {up ? "+" : ""}
                  {entry.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default PriceTicker;
