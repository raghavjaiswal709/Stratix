"use client";

import { useState } from "react";
import type { Session, InstrumentKey } from "./types";
import { INSTRUMENTS } from "./types";
import { X, BookOpen } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (sessionData: Omit<Session, "id" | "createdAt" | "trades" | "drawings">) => void;
}

export function NewSessionModal({ isOpen, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [strategy, setStrategy] = useState("No strategy");
  const [symbol, setSymbol] = useState<InstrumentKey>("xauusd");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startingBalance, setStartingBalance] = useState(10000);
  const [leverage, setLeverage] = useState("1:100");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name,
      description,
      strategy,
      symbol,
      startDate,
      endDate,
      startingBalance: Number(startingBalance),
      leverage,
    });
    // Reset state
    setName("");
    setDescription("");
    setStrategy("No strategy");
    setSymbol("xauusd");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
      <div 
        className="relative w-full max-w-lg bg-[#0c0e14] border border-[#23262f] rounded-xl shadow-2xl p-6 flex flex-col gap-5 text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#23262f]">
          <h2 className="text-base font-bold tracking-tight text-white">New Backtest Session</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-[#1e222f] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Session Name */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
              Session Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. EURUSD Trend Following"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#F0B90B] transition-colors"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
              Description
            </label>
            <textarea
              placeholder="What are you testing?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#F0B90B] transition-colors resize-none"
            />
          </div>

          {/* Strategy Dropdown */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
              Strategy
            </label>
            <div className="relative">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="w-full bg-[#141720] border border-[#23262f] rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#F0B90B] transition-colors cursor-pointer appearance-none"
              >
                <option value="No strategy">No strategy</option>
                <option value="Trend Following">Trend Following</option>
                <option value="Range Bound">Range Bound</option>
                <option value="Scalping">Scalping</option>
                <option value="ICT / SMC">ICT / SMC</option>
              </select>
            </div>
          </div>

          {/* Symbol Selector */}
          <div className="flex flex-col">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
              Symbol *
            </label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as InstrumentKey)}
              className="bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-sm text-[#F0B90B] font-bold focus:outline-none focus:border-[#F0B90B] transition-colors cursor-pointer"
            >
              {INSTRUMENTS.map((inst) => (
                <option key={inst.key} value={inst.key} className="bg-[#0c0e14] text-gray-200">
                  {inst.label} — {inst.description}
                </option>
              ))}
            </select>
          </div>

          {/* Start and End Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#F0B90B] transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
                End Date *
              </label>
              <input
                type="date"
                required
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#F0B90B] transition-colors"
              />
            </div>
          </div>

          {/* Starting Balance and Leverage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
                Starting Balance *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-mono">$</span>
                <input
                  type="number"
                  required
                  min={100}
                  max={10000000}
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(Number(e.target.value))}
                  className="w-full bg-[#141720] border border-[#23262f] rounded-lg pl-6 pr-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-[#F0B90B] transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673] mb-1.5">
                Leverage
              </label>
              <select
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                className="bg-[#141720] border border-[#23262f] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#F0B90B] transition-colors cursor-pointer"
              >
                <option value="1:1">1:1</option>
                <option value="1:10">1:10</option>
                <option value="1:30">1:30</option>
                <option value="1:50">1:50</option>
                <option value="1:100">1:100</option>
                <option value="1:200">1:200</option>
                <option value="1:500">1:500</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#23262f]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-lg border border-[#23262f] text-gray-300 hover:text-white hover:bg-[#1a1d29] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white transition-all shadow-md shadow-blue-900/20 active:scale-95"
            >
              + Create Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
