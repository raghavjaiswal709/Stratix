"use client";

import { useState } from "react";
import { Plus, Minus, ArrowUpRight, TrendingUp, Award, AwardIcon } from "lucide-react";

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
    <div className="w-full h-full flex flex-col bg-[#0c0e14] text-[#d1d5db] select-none font-sans">
      {/* Symbol Title */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#23262f] bg-[#0c0e14] shrink-0">
        <span className="text-sm font-bold text-white tracking-wide uppercase flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
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
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-blue-950 bg-blue-950/10 hover:bg-blue-950/35 hover:scale-[1.02] active:scale-95 transition-all text-center gap-1 cursor-pointer"
          >
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">BUY</span>
            <span className="text-lg font-bold font-mono text-white tracking-tight">{formattedPrice}</span>
          </button>
        </div>

        {/* Order Mode Tabs */}
        <div className="flex p-0.5 rounded-lg bg-[#141720] border border-[#23262f] shrink-0">
          <button
            onClick={() => setOrderType("market")}
            className={`flex-1 py-1.5 text-[11px] font-bold tracking-wide rounded-md transition-all ${
              orderType === "market"
                ? "bg-[#2563eb] text-white shadow-md shadow-blue-900/10"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType("pending")}
            className={`flex-1 py-1.5 text-[11px] font-bold tracking-wide rounded-md transition-all ${
              orderType === "pending"
                ? "bg-[#2563eb] text-white shadow-md shadow-blue-900/10"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Pending
          </button>
        </div>

        {/* Lots size increment controller */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Volume</span>
          <div className="flex items-center bg-[#141720] border border-[#23262f] rounded-lg overflow-hidden p-1.5 gap-2">
            <button
              onClick={() => onLotSizeChange(Math.max(1, lotSize - 10))}
              className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#1e222f] active:scale-90 transition-all shrink-0"
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
              <span className="text-[10px] text-gray-500 font-bold uppercase">Lots</span>
            </div>
            <button
              onClick={() => onLotSizeChange(lotSize + 10)}
              className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#1e222f] active:scale-90 transition-all shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Advanced Accordion */}
        <div className="border border-[#23262f] rounded-lg overflow-hidden shrink-0">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#141720] hover:bg-[#1e222f] text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-white transition-all"
          >
            <span>⚙️ Advanced Settings</span>
            <span>{showAdvanced ? "▲" : "▼"}</span>
          </button>
          {showAdvanced && (
            <div className="p-3 bg-[#0c0e14] border-t border-[#23262f] flex flex-col gap-3 text-xs text-gray-400">
              <div className="flex items-center justify-between">
                <span>Take Profit (TP)</span>
                <span className="text-gray-500 font-mono">Not set</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Stop Loss (SL)</span>
                <span className="text-gray-500 font-mono">Not set</span>
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
        <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-4 flex flex-col gap-3 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] border-b border-[#23262f] pb-1.5 flex items-center gap-1.5">
            📊 Active Replay Stats
          </span>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[11px]">
            {/* Net P&L */}
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-500 text-[9px] uppercase font-semibold">Net P&L</span>
              <span className={`font-bold ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
              </span>
            </div>

            {/* Win Rate */}
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-500 text-[9px] uppercase font-semibold">Win Rate</span>
              <span className="font-bold text-white">{winRate.toFixed(1)}%</span>
            </div>

            {/* Trades */}
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-500 text-[9px] uppercase font-semibold">Trades</span>
              <span className="font-bold text-white">{totalTrades}</span>
            </div>

            {/* Profit Factor */}
            <div className="flex flex-col gap-0.5">
              <span className="text-gray-500 text-[9px] uppercase font-semibold">PF</span>
              <span className="font-bold text-white">{profitFactor === 999 ? "∞" : profitFactor.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
