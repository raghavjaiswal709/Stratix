"use client";

import { useState } from "react";
import { Plus, Minus, TrendingUp, TrendingDown } from "lucide-react";
import type { Drawing } from "./types";
import { getLotSpec, pipValue, snapLot } from "./lotSpecs";

interface Props {
  symbol: string;
  currentPrice: number;
  lotSize: number;
  onLotSizeChange: (lots: number) => void;
  onBuy: () => void;
  onSell: () => void;

  // R/R drawing selected/previewed in chart
  rrDrawing?: Drawing | null;
  onOpenRROrder?: (side: "buy" | "sell") => void;

  // Real-time session stats
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
}

export function ExecutionPanel({
  symbol, currentPrice, lotSize, onLotSizeChange, onBuy, onSell,
  rrDrawing, onOpenRROrder,
  totalTrades, winRate, totalPnl, profitFactor
}: Props) {
  const [orderType, setOrderType] = useState<"market" | "pending">("market");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Lot spec for the active instrument
  const spec = getLotSpec(symbol);

  // Format price beautifully: e.g. 1.17455
  const formattedPrice = currentPrice > 0 ? currentPrice.toFixed(5) : "—";

  // Pip value per lot at current price (for display)
  const pvPerLot = currentPrice > 0
    ? pipValue(spec, lotSize, currentPrice)
    : null;

  // Lot display format: 2 decimals for step < 0.1, 1 decimal otherwise
  const lotDecimals = spec.lotStep < 0.1 ? 2 : 1;
  const fmtLot = (n: number) => n.toFixed(lotDecimals);

  // Price formatter for R/R panel
  const fmtP = (n: number) => {
    if (n < 0.001) return n.toFixed(8);
    if (n < 0.01)  return n.toFixed(7);
    if (n < 0.1)   return n.toFixed(6);
    if (n < 1)     return n.toFixed(5);
    if (n < 10)    return n.toFixed(4);
    if (n < 100)   return n.toFixed(3);
    return n.toFixed(2);
  };

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

        {/* ── Lot size controller (MT5-accurate) ── */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Volume (Lots)</span>
            <span className="text-[9px] text-white/25 font-mono">
              min {fmtLot(spec.minLot)} · step {fmtLot(spec.lotStep)}
            </span>
          </div>

          {/* Increment strip: ×0.1 ×1 ×10 on left, main control center, mirror on right */}
          <div className="flex items-center gap-1.5">
            {/* Quick sub-steps (left) */}
            <div className="flex flex-col gap-0.5">
              {[10, 1, 0.1].map(mult => {
                const delta = +(spec.lotStep * mult).toFixed(2);
                return (
                  <button
                    key={mult}
                    onClick={() => onLotSizeChange(snapLot(lotSize - delta, spec))}
                    className="px-1.5 py-0.5 rounded text-[8px] font-bold font-mono text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                    title={`-${fmtLot(delta)} lots`}
                  >
                    -{fmtLot(delta)}
                  </button>
                );
              })}
            </div>

            {/* Main input */}
            <div className="flex-1 flex flex-col items-center gap-0.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onLotSizeChange(snapLot(lotSize - spec.lotStep, spec))}
                  className="p-0.5 rounded text-white/35 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <input
                  type="number"
                  value={fmtLot(lotSize)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) onLotSizeChange(snapLot(v, spec));
                  }}
                  min={spec.minLot}
                  max={spec.maxLot}
                  step={spec.lotStep}
                  className="w-16 bg-transparent text-center text-[15px] font-bold text-white font-mono focus:outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  onClick={() => onLotSizeChange(snapLot(lotSize + spec.lotStep, spec))}
                  className="p-0.5 rounded text-white/35 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <span className="text-[9px] text-white/25 font-mono">lots</span>
            </div>

            {/* Quick add-steps (right) */}
            <div className="flex flex-col gap-0.5">
              {[0.1, 1, 10].map(mult => {
                const delta = +(spec.lotStep * mult).toFixed(2);
                return (
                  <button
                    key={mult}
                    onClick={() => onLotSizeChange(snapLot(lotSize + delta, spec))}
                    className="px-1.5 py-0.5 rounded text-[8px] font-bold font-mono text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer"
                    title={`+${fmtLot(delta)} lots`}
                  >
                    +{fmtLot(delta)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pip value display */}
          {pvPerLot != null && (
            <div className="flex items-center justify-between text-[9px] font-mono px-0.5">
              <span className="text-white/25">Pip value ({fmtLot(lotSize)} lot)</span>
              <span className="text-white/50 font-bold">
                ${pvPerLot < 0.01 ? pvPerLot.toFixed(4) : pvPerLot < 1 ? pvPerLot.toFixed(3) : pvPerLot.toFixed(2)}
              </span>
            </div>
          )}
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

        {/* ── Risk / Reward Panel (shown when long/short drawing is selected) ── */}
        {rrDrawing && rrDrawing.riskSettings && (
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl overflow-hidden shrink-0">
            {/* Header */}
            <div className={`px-3.5 py-2.5 border-b border-white/[0.06] flex items-center gap-2 ${
              rrDrawing.type === "long" ? "bg-emerald-500/[0.07]" : "bg-red-500/[0.07]"
            }`}>
              {rrDrawing.type === "long"
                ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                : <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />}
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                rrDrawing.type === "long" ? "text-emerald-400" : "text-red-400"
              }`}>
                {rrDrawing.type === "long" ? "Long" : "Short"} Position
              </span>
              <span className="ml-auto text-[9px] font-bold text-white/30 font-mono">
                R/R 1:{rrDrawing.riskSettings.riskRewardRatio.toFixed(2)}
              </span>
            </div>

            {/* Price levels */}
            <div className="px-3.5 py-3 flex flex-col gap-2 font-mono text-[11px]">
              {/* Entry */}
              <div className="flex items-center justify-between">
                <span className="text-white/40 text-[9px] uppercase font-semibold tracking-wide">Entry</span>
                <span className="text-white font-bold">{fmtP(rrDrawing.riskSettings.entry)}</span>
              </div>
              {/* Stop Loss */}
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-red-500/[0.07] border border-red-500/[0.12]">
                <span className="text-red-400/70 text-[9px] uppercase font-semibold tracking-wide">Stop Loss</span>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-white/20 font-mono">
                    {Math.abs(rrDrawing.riskSettings.entry - rrDrawing.riskSettings.stopLoss).toFixed(
                      rrDrawing.riskSettings.entry < 10 ? 5 : rrDrawing.riskSettings.entry < 100 ? 4 : 2
                    )} pts
                  </span>
                  <span className="text-red-400 font-bold">{fmtP(rrDrawing.riskSettings.stopLoss)}</span>
                </div>
              </div>
              {/* Take Profit */}
              <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-emerald-500/[0.07] border border-emerald-500/[0.12]">
                <span className="text-emerald-400/70 text-[9px] uppercase font-semibold tracking-wide">Take Profit</span>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-white/20 font-mono">
                    {Math.abs(rrDrawing.riskSettings.entry - rrDrawing.riskSettings.takeProfit).toFixed(
                      rrDrawing.riskSettings.entry < 10 ? 5 : rrDrawing.riskSettings.entry < 100 ? 4 : 2
                    )} pts
                  </span>
                  <span className="text-emerald-400 font-bold">{fmtP(rrDrawing.riskSettings.takeProfit)}</span>
                </div>
              </div>
            </div>

            {/* Execute button */}
            {onOpenRROrder && (
              <div className="px-3.5 pb-3.5">
                <button
                  onClick={() => onOpenRROrder(rrDrawing.type === "long" ? "buy" : "sell")}
                  className={`w-full py-2 rounded-lg font-bold text-[12px] tracking-tight transition-all active:scale-95 cursor-pointer ${
                    rrDrawing.type === "long"
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-red-600 hover:bg-red-500 text-white"
                  }`}
                >
                  {rrDrawing.type === "long" ? "Open Long" : "Open Short"}
                </button>
                <p className="text-[8px] text-white/20 text-center mt-1.5">Opens at current candle price</p>
              </div>
            )}
          </div>
        )}

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
