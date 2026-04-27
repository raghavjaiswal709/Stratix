"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

interface OpenTrade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  entryTime: string;
}

interface OpenPositionsProps {
  trades: OpenTrade[];
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function OpenPositions({ trades }: OpenPositionsProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4">Open Positions</h3>
      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 md:py-10 text-muted-foreground">
          <div className="h-9 w-9 md:h-10 md:w-10 rounded-xl bg-muted flex items-center justify-center mb-2">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 opacity-50" />
          </div>
          <p className="text-[12px] md:text-[13px]">No open positions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((t) => (
            <div
              key={t._id}
              className="flex items-center justify-between rounded-xl bg-muted/40 border border-border px-3 md:px-4 py-2.5 md:py-3 gap-2"
            >
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[9px] md:text-[10px] font-bold ${t.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                  {t.symbol.slice(0, 3)}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] md:text-[13px] font-semibold text-card-foreground">{t.symbol}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] md:text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                      {t.direction === "buy" ? "LONG" : "SHORT"}
                    </span>
                    <span className="text-[10px] md:text-[11px] text-muted-foreground truncate">{t.lots}L @ ${t.entryPrice}</span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[13px] md:text-[14px] font-bold ${t.profit >= 0 ? "text-blue-400" : "text-red-400"}`}>
                  {fmt(t.profit)}
                </p>
                {t.direction === "buy" ? (
                  <TrendingUp className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground/40 ml-auto" />
                ) : (
                  <TrendingDown className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground/40 ml-auto" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
