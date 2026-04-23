"use client";

import { format, parseISO } from "date-fns";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface JournalTrade {
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
  journaled: boolean;
  source: "manual" | "mt5";
}

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

export function JournalList({
  trades,
  selectedId,
  onSelect,
  tab,
  onTabChange,
}: JournalListProps) {
  const filtered =
    tab === "journaled"
      ? trades.filter((t) => t.journaled)
      : tab === "pending"
      ? trades.filter((t) => !t.journaled)
      : trades;

  const counts = {
    all: trades.length,
    journaled: trades.filter((t) => t.journaled).length,
    pending: trades.filter((t) => !t.journaled).length,
  };

  return (
    <div className="flex flex-col h-full w-[280px] shrink-0 border-r border-white/[0.07]">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/[0.07]">
        <div className="flex items-center justify-between mb-3">
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
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-white/25">
            <p className="text-[13px]">No trades</p>
          </div>
        ) : (
          filtered.map((trade) => (
            <button
              key={trade._id}
              onClick={() => onSelect(trade._id)}
              className={cn(
                "w-full text-left px-4 py-3.5 border-b border-white/[0.05] transition hover:bg-white/[0.03]",
                selectedId === trade._id && "bg-blue-600/10 border-l-2 border-l-blue-500"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Symbol badge */}
                  <div className={cn(
                    "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold",
                    isWinner(trade) ? "bg-amber-500/15 text-amber-400" : "bg-white/10 text-white/50"
                  )}>
                    {trade.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-white">{trade.symbol}</span>
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
