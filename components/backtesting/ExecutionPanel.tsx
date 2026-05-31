"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

interface Props {
  symbol: string;
  currentPrice: number;
  lotSize: number;
  onLotSizeChange: (lots: number) => void;
  onBuy: () => void;
  onSell: () => void;
  
  // Real-time session stats
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
}

export function ExecutionPanel({
  symbol, currentPrice, lotSize, onLotSizeChange, onBuy, onSell,
  totalTrades, winRate, totalPnl, profitFactor
}: Props) {
  const [orderType, setOrderType] = useState<"market" | "pending">("market");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Format price beautifully: e.g. 1.17455
  const formattedPrice = currentPrice > 0 ? currentPrice.toFixed(5) : "—";

  return (
    <div className="w-full h-full flex flex-col bg-transparent text-white/65 select-none font-sans">
      {/* Symbol Title */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-transparent shrink-0">
        <span className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white/[0.08]" />
          {symbol.toUpperCase()}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* SELL & BUY price button boxes */}
        <div className="grid grid-cols-2 gap-3">
          {/* Sell Price Card */}
          <button
            onClick={onSell}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-red-950 bg-red-950/10 hover:bg-red-950/35 hover:scale-[1.02] active:scale-95 transition-all text-center gap-1 cursor-pointer"
          >
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">SELL</span>
            <span className="text-lg font-bold font-mono text-white tracking-tight">{formattedPrice}</span>
          </button>

          {/* Buy Price Card */}
          <button
            onClick={onBuy}
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] hover:scale-[1.02] active:scale-95 transition-all text-center gap-1 cursor-pointer"
          >
            <span className="text-[10px] font-bold text-white/55 uppercase tracking-widest">BUY</span>
            <span className="text-lg font-bold font-mono text-white tracking-tight">{formattedPrice}</span>
          </button>
        </div>

        {/* Order Mode Tabs */}
        <div className="flex p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] shrink-0">
          <button
            onClick={() => setOrderType("market")}
            className={`flex-1 py-1.5 text-[11px] font-bold tracking-wide rounded-md transition-all ${
              orderType === "market"
                ? "bg-white/[0.10] text-white shadow-md "
                : "text-white/40 hover:text-white"
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType("pending")}
            className={`flex-1 py-1.5 text-[11px] font-bold tracking-wide rounded-md transition-all ${
              orderType === "pending"
                ? "bg-white/[0.10] text-white shadow-md "
                : "text-white/40 hover:text-white"
            }`}
          >
            Pending
          </button>
        </div>

        {/* Lots size increment controller */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Volume</span>
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg overflow-hidden p-1.5 gap-2">
            <button
              onClick={() => onLotSizeChange(Math.max(1, lotSize - 10))}
              className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] active:scale-90 transition-all shrink-0"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 flex items-baseline justify-center gap-1">
              <input
                type="number"
                value={lotSize}
                onChange={(e) => onLotSizeChange(Number(e.target.value))}
                min={1}
                className="w-16 bg-transparent text-center text-sm font-bold text-white font-mono focus:outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-[10px] text-white/35 font-bold uppercase">Lots</span>
            </div>
            <button
              onClick={() => onLotSizeChange(lotSize + 10)}
              className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] active:scale-90 transition-all shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Advanced Accordion */}
        <div className="border border-white/[0.08] rounded-lg overflow-hidden shrink-0">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-all"
          >
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.2 3.2L4.2 4.2M11.8 11.8L12.8 12.8M12.8 3.2L11.8 4.2M4.2 11.8L3.2 12.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Advanced Settings
            </span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {showAdvanced && (
            <div className="p-3 bg-transparent border-t border-white/[0.08] flex flex-col gap-3 text-xs text-white/45">
              <div className="flex items-center justify-between">
                <span>Take Profit (TP)</span>
                <span className="text-white/35 font-mono">Not set</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Stop Loss (SL)</span>
                <span className="text-white/35 font-mono">Not set</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Max Slippage</span>
                <span className="text-white font-mono">1.0 Pip</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Real-time Session Stats Card */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-4 flex flex-col gap-3 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 border-b border-white/[0.08] pb-1.5 flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="9" width="3" height="5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><rect x="6.5" y="6" width="3" height="8" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><rect x="11" y="3" width="3" height="11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
            Active Replay Stats
          </span>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[11px]">
            {/* Net P&L */}
            <div className="flex flex-col gap-0.5">
              <span className="text-white/35 text-[9px] uppercase font-semibold">Net P&L</span>
              <span className={`font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
              </span>
            </div>

            {/* Win Rate */}
            <div className="flex flex-col gap-0.5">
              <span className="text-white/35 text-[9px] uppercase font-semibold">Win Rate</span>
              <span className="font-bold text-white">{winRate.toFixed(1)}%</span>
            </div>

            {/* Trades */}
            <div className="flex flex-col gap-0.5">
              <span className="text-white/35 text-[9px] uppercase font-semibold">Trades</span>
              <span className="font-bold text-white">{totalTrades}</span>
            </div>

            {/* Profit Factor */}
            <div className="flex flex-col gap-0.5">
              <span className="text-white/35 text-[9px] uppercase font-semibold">PF</span>
              <span className="font-bold text-white">{profitFactor === 999 ? "∞" : profitFactor.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
