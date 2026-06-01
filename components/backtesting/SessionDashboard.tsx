"use client";

import { useMemo, useState } from "react";
import type { Session } from "./types";
import { computeMetrics } from "./tradeTracker";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { 
  Plus, Play, Trash2, ArrowUpRight, TrendingUp, ShieldAlert, 
  Award, Calendar, RefreshCw, BarChart3, FolderOpen, LineChart, Activity 
} from "lucide-react";

interface Props {
  sessions: Session[];
  onSelectSession: (session: Session) => void;
  onDeleteSession: (id: string) => void;
  onOpenNewSessionModal: () => void;
}

export function SessionDashboard({ sessions, onSelectSession, onDeleteSession, onOpenNewSessionModal }: Props) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Determine which session is selected for active analysis on the right
  const selectedSession = useMemo(() => {
    if (sessions.length === 0) return null;
    if (selectedSessionId) {
      const found = sessions.find((s) => s.id === selectedSessionId);
      if (found) return found;
    }
    // Fall back to the most recent session
    return sessions[sessions.length - 1];
  }, [sessions, selectedSessionId]);

  const m = useMemo(() => {
    if (!selectedSession) {
      return {
        totalTrades: 0,
        winRate: 0,
        totalPnl: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        bestTrade: 0,
        worstTrade: 0,
        equityCurveData: [],
        wins: 0,
        losses: 0,
        expectancy: 0,
        maxDrawdown: 0,
        longWinRate: 0,
        longWins: 0,
        longLosses: 0,
        shortWinRate: 0,
        shortWins: 0,
        shortLosses: 0,
        bestDay: 0,
        worstDay: 0,
        currentStreak: 0,
        bestStreak: 0,
        worstStreak: 0,
      };
    }
    const trades = selectedSession.trades || [];
    const metrics = computeMetrics(trades, selectedSession.startingBalance);

    // Deep analysis for streaks, records, and splits
    const closed = trades.filter((t) => t.exitTime != null);
    let wins = 0;
    let losses = 0;
    let longWins = 0, longLosses = 0;
    let shortWins = 0, shortLosses = 0;
    let currentStreak = 0, bestStreak = 0, worstStreak = 0, currentLossStreak = 0;
    let bestDay = 0, worstDay = 0;

    closed.forEach((t) => {
      const pnl = t.pnl ?? 0;
      if (pnl >= 0) {
        wins++;
        currentStreak++;
        currentLossStreak = 0;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
        if (t.direction === "LONG") longWins++;
        else shortWins++;
      } else {
        losses++;
        currentLossStreak++;
        currentStreak = 0;
        if (currentLossStreak > worstStreak) worstStreak = currentLossStreak;
        if (t.direction === "LONG") longLosses++;
        else shortLosses++;
      }
      if (pnl > bestDay) bestDay = pnl;
      if (pnl < worstDay) worstDay = pnl;
    });

    const longTotal = longWins + longLosses;
    const shortTotal = shortWins + shortLosses;
    const expectancy = closed.length > 0 ? metrics.totalPnl / closed.length : 0;

    // Calculate drawdown
    let maxBal = selectedSession.startingBalance;
    let maxDd = 0;
    const equityCurveData = [{ tradeIdx: 0, balance: selectedSession.startingBalance, drawdown: 0 }];
    
    let currentBal = selectedSession.startingBalance;
    closed.forEach((t, idx) => {
      currentBal += (t.pnl ?? 0);
      if (currentBal > maxBal) maxBal = currentBal;
      const dd = maxBal > 0 ? ((maxBal - currentBal) / maxBal) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
      equityCurveData.push({
        tradeIdx: idx + 1,
        balance: +currentBal.toFixed(2),
        drawdown: -+dd.toFixed(2),
      });
    });

    return {
      ...metrics,
      wins,
      losses,
      expectancy,
      maxDrawdown: maxDd,
      longWins,
      longLosses,
      longWinRate: longTotal > 0 ? (longWins / longTotal) * 100 : 0,
      shortWins,
      shortLosses,
      shortWinRate: shortTotal > 0 ? (shortWins / shortTotal) * 100 : 0,
      bestDay,
      worstDay,
      currentStreak,
      bestStreak,
      worstStreak,
      equityCurveData,
    };
  }, [selectedSession]);

  const glassCardClass = "relative bg-[#0f0f0f] border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_8px_30px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:border-white/[0.12] hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.7)] overflow-hidden group";

  return (
    <div className="flex-1 w-full h-full bg-[#0f0f0f] overflow-hidden flex flex-col text-[#d1d5db] font-sans selection:bg-emerald-500/30 selection:text-white">
      {/* Upper Navigation Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0f0f0f] shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Overview</span>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-white/80 shrink-0" /> Backtesting Sessions {selectedSession && <span className="text-sm font-semibold text-white/60">({selectedSession.name})</span>}
          </h1>
        </div>
        <button
          onClick={onOpenNewSessionModal}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-white text-black hover:bg-white/90 active:scale-95 transition-all shadow-[0_4px_12px_rgba(255,255,255,0.1)] hover:shadow-[0_6px_16px_rgba(255,255,255,0.2)] border border-transparent"
        >
          <Plus className="w-3.5 h-3.5" />
          New Session
        </button>
      </div>

      {/* Main Split Layout Container */}
      <div className="flex-1 min-h-0 w-full flex items-stretch overflow-hidden">
        
        {/* Left Column: Saved Sessions (30% width) - flush to left edge */}
        <div className="w-[30%] border-r border-white/[0.06] bg-[#080808]/40 flex flex-col shrink-0 p-6 overflow-hidden">
          <div className="flex flex-col gap-1.5 mb-4 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Saved Sessions</span>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-white/40 shrink-0" /> Total Sessions <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-white/[0.06] text-white/60 font-bold border border-white/[0.08] font-mono">{sessions.length}</span>
            </h2>
          </div>
          
          {/* Scrollable list container */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1 pb-10">
            {sessions.length > 0 ? (
              sessions.map((s) => {
                const isSelectedForAnalysis = selectedSession && s.id === selectedSession.id;
                return (
                  <div 
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`relative p-4 cursor-pointer border rounded-2xl transition-all duration-300 group/item ${
                      isSelectedForAnalysis 
                        ? "border-emerald-500/30 bg-emerald-500/[0.01] shadow-[inset_0_1px_1px_rgba(16,185,129,0.08),0_8px_30px_rgba(0,0,0,0.5)]" 
                        : "border-white/[0.05] bg-[#0a0a0a]/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04),0_4px_12px_rgba(0,0,0,0.3)] hover:border-white/[0.15] hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08),0_6px_20px_rgba(0,0,0,0.5)]"
                    }`}
                  >
                    {/* Glass highlight overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none rounded-2xl" />
                    
                    <div className="flex flex-col gap-3.5 z-10 relative">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-white group-hover/item:text-emerald-400 transition-colors truncate block">{s.name}</span>
                          {isSelectedForAnalysis && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 uppercase tracking-wider shrink-0 font-mono">Selected</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[10px] text-white/40 font-mono">
                          <span className="text-[#F0B90B] font-bold shrink-0">{s.symbol.toUpperCase()}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-white/[0.10]" />
                          <span>Lev {s.leverage}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.04] shrink-0">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[8px] uppercase tracking-wider text-white/30">Balance</span>
                          <span className="text-[11px] font-bold font-mono text-white/70">${s.startingBalance}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSession(s);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black active:scale-95 transition-all text-xs font-extrabold shadow-[0_2px_10px_rgba(16,185,129,0.2)] border border-transparent"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            Start Replay
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(s.id);
                            }}
                            className="p-1.5 rounded-lg text-white/30 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center p-8 gap-3 border border-dashed border-white/[0.08] rounded-2xl h-44">
                <Activity className="w-8 h-8 text-white/20 shrink-0 animate-pulse" />
                <p className="text-xs text-white/30 font-semibold text-center leading-relaxed">
                  No active sessions yet.<br />Click "New Session" to begin!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Analysis Segment (70% width) - flush to right edge */}
        <div className="w-[70%] overflow-y-auto p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-1.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Analysis dashboard</span>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <LineChart className="w-4 h-4 text-white/40 shrink-0" /> Live Session Statistics
            </h2>
          </div>

          {/* Row 1: KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 shrink-0">
            {/* Net P&L Card */}
            <div className={glassCardClass}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <div className="flex items-center justify-between text-white/40 z-10 relative">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Net P&L</span>
                <TrendingUp className="w-3.5 h-3.5 text-white/30" />
              </div>
              <div className="flex flex-col mt-3.5 z-10 relative">
                <span className={`text-2xl font-bold font-mono tracking-tight drop-shadow-[0_0_12px_rgba(16,185,129,0.15)] ${m.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {m.totalPnl >= 0 ? "+" : ""}${m.totalPnl.toFixed(2)}
                </span>
                <span className="text-[9px] text-white/30 font-semibold mt-1">
                  from ${selectedSession?.startingBalance ?? 10000}
                </span>
              </div>
            </div>

            {/* Win Rate Card */}
            <div className={`${glassCardClass} flex-row items-center gap-4`}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <div className="flex flex-col justify-between h-full z-10 relative">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Win Rate</span>
                <div className="flex flex-col mt-3.5">
                  <span className="text-2xl font-bold font-mono text-white tracking-tight">
                    {m.winRate.toFixed(1)}%
                  </span>
                  <span className="text-[9px] font-mono text-white/30 font-semibold mt-1">
                    <span className="text-emerald-400">{m.wins}W</span> / <span className="text-rose-400">{m.losses}L</span>
                  </span>
                </div>
              </div>
              {/* Visual Ring */}
              <div className="relative w-12 h-12 ml-auto shrink-0 z-10">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.03)" strokeWidth="4.5" fill="transparent" />
                  <circle 
                    cx="24" cy="24" r="20" 
                    stroke={m.winRate >= 50 ? "#10b981" : "#ef4444"} 
                    strokeWidth="4.5" 
                    fill="transparent"
                    strokeDasharray="125.6"
                    strokeDashoffset={125.6 - (125.6 * m.winRate) / 100}
                    className="transition-all duration-1000"
                  />
                </svg>
              </div>
            </div>

            {/* Total Trades Card */}
            <div className={glassCardClass}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <div className="flex items-center justify-between text-white/40 z-10 relative">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Total Trades</span>
                <RefreshCw className="w-3.5 h-3.5 text-purple-400/60" />
              </div>
              <div className="flex flex-col mt-3.5 z-10 relative">
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {m.totalTrades}
                </span>
                <span className="text-[9px] text-white/30 font-semibold mt-1">
                  Closed trades
                </span>
              </div>
            </div>

            {/* Profit Factor Card */}
            <div className={glassCardClass}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <div className="flex items-center justify-between text-white/40 z-10 relative">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Profit Factor</span>
                <Award className="w-3.5 h-3.5 text-yellow-500/60" />
              </div>
              <div className="flex flex-col mt-3.5 z-10 relative">
                <span className="text-2xl font-bold font-mono text-white tracking-tight">
                  {m.profitFactor === 999 ? "∞" : m.profitFactor.toFixed(2)}
                </span>
                <span className="text-[9px] text-white/30 font-semibold mt-1">
                  Gross profits / losses
                </span>
              </div>
            </div>

            {/* Expectancy Card */}
            <div className={glassCardClass}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <div className="flex items-center justify-between text-white/40 z-10 relative">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Expectancy</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400/60" />
              </div>
              <div className="flex flex-col mt-3.5 z-10 relative">
                <span className={`text-2xl font-bold font-mono tracking-tight ${m.expectancy >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {m.expectancy >= 0 ? "+" : ""}${m.expectancy.toFixed(2)}
                </span>
                <span className="text-[9px] text-white/30 font-semibold mt-1">
                  Average payout per trade
                </span>
              </div>
            </div>

            {/* Max Drawdown Card */}
            <div className={glassCardClass}>
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <div className="flex items-center justify-between text-white/40 z-10 relative">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Max Drawdown</span>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500/60" />
              </div>
              <div className="flex flex-col mt-3.5 z-10 relative">
                <span className="text-2xl font-bold font-mono text-rose-400 tracking-tight">
                  -{m.maxDrawdown.toFixed(1)}%
                </span>
                <span className="text-[9px] text-white/30 font-semibold mt-1">
                  Peak to trough drawdown
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: Performance Area Chart and Drawdown Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 shrink-0">
            {/* Performance Card */}
            <div className="relative bg-[#0f0f0f] border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_8px_30px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex flex-col gap-4 min-h-[300px] overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 z-10 relative">Performance</span>
              <div className="flex-1 w-full min-h-[220px] z-10 relative">
                {m.totalTrades > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={m.equityCurveData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                      <XAxis dataKey="tradeIdx" stroke="rgba(255,255,255,0.3)" fontSize={9} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} domain={["dataMin - 100", "dataMax + 100"]} />
                      <Tooltip contentStyle={{ background: "#0f0f0f", borderColor: "rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff" }} />
                      <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorBal)" name="Balance" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/20 text-xs">
                    Close trades to see the equity curve
                  </div>
                )}
              </div>
            </div>

            {/* Drawdown Card */}
            <div className="relative bg-[#0f0f0f] border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_8px_30px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex flex-col gap-4 min-h-[300px] overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 z-10 relative">Drawdown</span>
              <div className="flex-1 w-full min-h-[220px] z-10 relative">
                {m.totalTrades > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={m.equityCurveData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorDd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                      <XAxis dataKey="tradeIdx" stroke="rgba(255,255,255,0.3)" fontSize={9} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} />
                      <Tooltip contentStyle={{ background: "#0f0f0f", borderColor: "rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff" }} />
                      <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorDd)" name="Drawdown %" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white/20 text-xs">
                    Close trades to see drawdown curve
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Splits & Records */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 shrink-0">
            {/* Trade Breakdown */}
            <div className="relative bg-[#0f0f0f] border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_8px_30px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex flex-col gap-4 overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 z-10 relative">Trade Breakdown</span>
              <div className="flex flex-col gap-3 font-mono text-xs z-10 relative">
                <SplitItem label="Long" value={`${m.longWins}W / ${m.longLosses}L`} subValue={`${m.longWinRate.toFixed(1)}% Win Rate`} />
                <SplitItem label="Short" value={`${m.shortWins}W / ${m.shortLosses}L`} subValue={`${m.shortWinRate.toFixed(1)}% Win Rate`} />
                <SplitItem label="Avg Win" value={`+$${m.avgWin.toFixed(2)}`} color="text-emerald-400" />
                <SplitItem label="Avg Loss" value={`-$${m.avgLoss.toFixed(2)}`} color="text-rose-400" />
                <SplitItem label="Largest Win" value={`+$${m.bestTrade.toFixed(2)}`} color="text-emerald-400" />
                <SplitItem label="Largest Loss" value={`-$${Math.abs(m.worstTrade).toFixed(2)}`} color="text-rose-400" />
              </div>
            </div>

            {/* Streaks & Records */}
            <div className="relative bg-[#0f0f0f] border border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_8px_30px_rgba(0,0,0,0.5)] rounded-2xl p-5 flex flex-col gap-4 overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none rounded-2xl" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 z-10 relative">Streaks & Records</span>
              <div className="flex flex-col gap-3 font-mono text-xs z-10 relative">
                <SplitItem label="Current Streak" value={m.currentStreak > 0 ? `${m.currentStreak} Wins` : `-`} />
                <SplitItem label="Best Win Streak" value={m.bestStreak > 0 ? `${m.bestStreak} Wins` : `-`} />
                <SplitItem label="Worst Loss Streak" value={m.worstStreak > 0 ? `${m.worstStreak} Losses` : `-`} />
                <SplitItem label="Best Day" value={m.bestDay > 0 ? `+$${m.bestDay.toFixed(2)}` : `-`} color="text-emerald-400" />
                <SplitItem label="Worst Day" value={m.worstDay < 0 ? `-$${Math.abs(m.worstDay).toFixed(2)}` : `-`} color="text-rose-400" />
                <SplitItem label="Time Backtesting" value={`< 1m`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component Helpers ────────────────────────────────────────────────────────

function SplitItem({ label, value, subValue, color }: {
  label: string; value: string; subValue?: string; color?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] pb-2 text-[11px]">
      <span className="text-white/40 font-semibold uppercase">{label}</span>
      <div className="flex flex-col items-end">
        <span className={`font-bold ${color ?? "text-white/80"}`}>{value}</span>
        {subValue && <span className="text-[9px] text-white/30 font-semibold mt-0.5">{subValue}</span>}
      </div>
    </div>
  );
}
