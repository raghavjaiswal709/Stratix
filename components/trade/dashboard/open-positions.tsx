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
    <div className="rounded-2xl border border-white/[0.07] bg-[#141720] p-5">
      <h3 className="text-[14px] font-semibold text-white mb-4">Open Positions</h3>
      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-white/25">
          <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
            <TrendingUp className="h-5 w-5 opacity-50" />
          </div>
          <p className="text-[13px]">No open positions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((t) => (
            <div
              key={t._id}
              className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold ${t.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                  {t.symbol.slice(0, 3)}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white">{t.symbol}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"}`}>
                      {t.direction === "buy" ? "LONG" : "SHORT"}
                    </span>
                    <span className="text-[11px] text-white/35">{t.lots} lots @ ${t.entryPrice}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-[14px] font-bold ${t.profit >= 0 ? "text-blue-400" : "text-red-400"}`}>
                  {fmt(t.profit)}
                </p>
                {t.direction === "buy" ? (
                  <TrendingUp className="h-3.5 w-3.5 text-white/20 ml-auto" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-white/20 ml-auto" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
