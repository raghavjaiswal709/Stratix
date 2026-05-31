"use client";

import { useMemo } from "react";
import type { Session } from "./types";
import { computeMetrics } from "./tradeTracker";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Plus, Play, Trash2, ArrowUpRight, TrendingUp, ShieldAlert, Award, Calendar, RefreshCw } from "lucide-react";

interface Props {
  sessions: Session[];
  onSelectSession: (session: Session) => void;
  onDeleteSession: (id: string) => void;
  onOpenNewSessionModal: () => void;
}

export function SessionDashboard({ sessions, onSelectSession, onDeleteSession, onOpenNewSessionModal }: Props) {
  // Let's compute overall metrics across all sessions or for the last active session
  const lastSession = useMemo(() => {
    if (sessions.length === 0) return null;
    return sessions[sessions.length - 1];
  }, [sessions]);

  const m = useMemo(() => {
    if (!lastSession) {
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
    const trades = lastSession.trades || [];
    const metrics = computeMetrics(trades, lastSession.startingBalance);

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
    let maxBal = lastSession.startingBalance;
    let maxDd = 0;
    const equityCurveData = [{ tradeIdx: 0, balance: lastSession.startingBalance, drawdown: 0 }];
    
    let currentBal = lastSession.startingBalance;
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
  }, [lastSession]);

  return (
    <div className="flex-1 w-full h-full bg-[#0c0e14] overflow-y-auto text-[#d1d5db]">
      {/* Upper Navigation Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#23262f] bg-[#0c0e14] shrink-0">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#5e6673]">Overview</span>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            📊 Backtesting Sessions {lastSession && <span className="text-sm font-semibold text-[#8a9bb0]">({lastSession.name})</span>}
          </h1>
        </div>
        <button
          onClick={onOpenNewSessionModal}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#2563eb] text-white hover:bg-[#1d4ed8] active:scale-95 transition-all shadow-md shadow-blue-900/10"
        >
          <Plus className="w-3.5 h-3.5" />
          New Session
        </button>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-6 flex flex-col gap-6">
        
        {/* Row 1: KPI Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Net P&L Card */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-4.5 flex flex-col justify-between min-h-28">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Net P&L</span>
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="flex flex-col my-1">
              <span className={`text-xl font-bold font-mono ${m.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {m.totalPnl >= 0 ? "+" : ""}${m.totalPnl.toFixed(2)}
              </span>
              <span className="text-[10px] text-[#4a5568] font-semibold">
                from ${lastSession?.startingBalance ?? 10000}
              </span>
            </div>
          </div>

          {/* Win Rate Card */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-4.5 flex items-center justify-between min-h-28">
            <div className="flex flex-col justify-between h-full">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Win Rate</span>
              <div className="flex flex-col my-1">
                <span className="text-xl font-bold font-mono text-white">
                  {m.winRate.toFixed(1)}%
                </span>
                <span className="text-[10px] font-mono text-[#5e6673] font-semibold">
                  <span className="text-green-500">{m.wins}W</span> / <span className="text-red-500">{m.losses}L</span>
                </span>
              </div>
            </div>
            {/* Visual Ring */}
            <div className="relative w-12 h-12">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="#1c1e26" strokeWidth="4.5" fill="transparent" />
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
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-4.5 flex flex-col justify-between min-h-28">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Total Trades</span>
              <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="flex flex-col my-1">
              <span className="text-xl font-bold font-mono text-white">
                {m.totalTrades}
              </span>
              <span className="text-[10px] text-[#5e6673] font-semibold">
                Closed trades
              </span>
            </div>
          </div>

          {/* Profit Factor Card */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-4.5 flex flex-col justify-between min-h-28">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Profit Factor</span>
              <Award className="w-3.5 h-3.5 text-yellow-500" />
            </div>
            <div className="flex flex-col my-1">
              <span className="text-xl font-bold font-mono text-white">
                {m.profitFactor === 999 ? "∞" : m.profitFactor.toFixed(2)}
              </span>
              <span className="text-[10px] text-[#5e6673] font-semibold">
                Gross profits / losses
              </span>
            </div>
          </div>

          {/* Expectancy Card */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-4.5 flex flex-col justify-between min-h-28">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Expectancy</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex flex-col my-1">
              <span className={`text-xl font-bold font-mono ${m.expectancy >= 0 ? "text-green-500" : "text-red-500"}`}>
                {m.expectancy >= 0 ? "+" : ""}${m.expectancy.toFixed(2)}
              </span>
              <span className="text-[10px] text-[#5e6673] font-semibold">
                Average payout per trade
              </span>
            </div>
          </div>

          {/* Max Drawdown Card */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-4.5 flex flex-col justify-between min-h-28">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Max Drawdown</span>
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div className="flex flex-col my-1">
              <span className="text-xl font-bold font-mono text-red-500">
                -{m.maxDrawdown.toFixed(1)}%
              </span>
              <span className="text-[10px] text-[#5e6673] font-semibold">
                Peak to trough drawdown
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Performance Area Chart and Drawdown Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Card */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-5 flex flex-col gap-4 min-h-[300px]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Performance</span>
            <div className="flex-1 w-full min-h-[220px]">
              {m.totalTrades > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={m.equityCurveData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1e26" />
                    <XAxis dataKey="tradeIdx" stroke="#5e6673" fontSize={9} />
                    <YAxis stroke="#5e6673" fontSize={9} domain={["dataMin - 100", "dataMax + 100"]} />
                    <Tooltip contentStyle={{ background: "#0c0e14", borderColor: "#23262f", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="balance" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorBal)" name="Balance" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[#4a5568] text-xs">
                  Close trades to see the equity curve
                </div>
              )}
            </div>
          </div>

          {/* Drawdown Card */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-5 flex flex-col gap-4 min-h-[300px]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Drawdown</span>
            <div className="flex-1 w-full min-h-[220px]">
              {m.totalTrades > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={m.equityCurveData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c1e26" />
                    <XAxis dataKey="tradeIdx" stroke="#5e6673" fontSize={9} />
                    <YAxis stroke="#5e6673" fontSize={9} />
                    <Tooltip contentStyle={{ background: "#0c0e14", borderColor: "#23262f", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="drawdown" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorDd)" name="Drawdown %" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[#4a5568] text-xs">
                  Close trades to see drawdown curve
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Splits & Records */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Trade Breakdown */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-5 flex flex-col gap-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Trade Breakdown</span>
            <div className="flex flex-col gap-3 font-mono text-xs">
              <SplitItem label="Long" value={`${m.longWins}W / ${m.longLosses}L`} subValue={`${m.longWinRate.toFixed(1)}% Win Rate`} />
              <SplitItem label="Short" value={`${m.shortWins}W / ${m.shortLosses}L`} subValue={`${m.shortWinRate.toFixed(1)}% Win Rate`} />
              <SplitItem label="Avg Win" value={`+$${m.avgWin.toFixed(2)}`} color="text-green-500" />
              <SplitItem label="Avg Loss" value={`-$${m.avgLoss.toFixed(2)}`} color="text-red-500" />
              <SplitItem label="Largest Win" value={`+$${m.bestTrade.toFixed(2)}`} color="text-green-500" />
              <SplitItem label="Largest Loss" value={`-$${Math.abs(m.worstTrade).toFixed(2)}`} color="text-red-500" />
            </div>
          </div>

          {/* Streaks & Records */}
          <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-5 flex flex-col gap-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Streaks & Records</span>
            <div className="flex flex-col gap-3 font-mono text-xs">
              <SplitItem label="Current Streak" value={m.currentStreak > 0 ? `${m.currentStreak} Wins` : `-`} />
              <SplitItem label="Best Win Streak" value={m.bestStreak > 0 ? `${m.bestStreak} Wins` : `-`} />
              <SplitItem label="Worst Loss Streak" value={m.worstStreak > 0 ? `${m.worstStreak} Losses` : `-`} />
              <SplitItem label="Best Day" value={m.bestDay > 0 ? `+$${m.bestDay.toFixed(2)}` : `-`} color="text-green-500" />
              <SplitItem label="Worst Day" value={m.worstDay < 0 ? `-$${Math.abs(m.worstDay).toFixed(2)}` : `-`} color="text-red-500" />
              <SplitItem label="Time Backtesting" value={`< 1m`} />
            </div>
          </div>
        </div>

        {/* Row 4: Previous Backtest Sessions List */}
        <div className="bg-[#12131a] border border-[#23262f] rounded-xl p-5 flex flex-col gap-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#5e6673]">Saved Sessions ({sessions.length})</span>
          {sessions.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {sessions.map((s) => (
                <div 
                  key={s.id}
                  className="flex items-center justify-between p-3.5 bg-[#0c0e14] border border-[#23262f] hover:border-gray-600 rounded-lg transition-all"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-bold text-white">{s.name}</span>
                    <div className="flex items-center gap-3 text-[10px] text-[#8a9bb0] font-mono">
                      <span className="text-[#F0B90B] font-bold">{s.symbol.toUpperCase()}</span>
                      <span>Leverage {s.leverage}</span>
                      <span>Balance ${s.startingBalance}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {s.startDate} ➔ {s.endDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectSession(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563eb]/20 text-[#2563eb] hover:bg-[#2563eb] hover:text-white transition-all text-xs font-bold active:scale-95"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      Start Replay
                    </button>
                    <button
                      onClick={() => onDeleteSession(s.id)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 gap-3 border border-dashed border-[#23262f] rounded-lg">
              <span className="text-2xl opacity-20">📊</span>
              <p className="text-xs text-[#4a5568] font-semibold text-center">
                No active backtesting sessions yet. Create one to begin trading!
              </p>
            </div>
          )}
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
    <div className="flex items-center justify-between border-b border-[#1c1e26] pb-2 text-[11px]">
      <span className="text-gray-500 font-semibold uppercase">{label}</span>
      <div className="flex flex-col items-end">
        <span className={`font-bold ${color ?? "text-gray-200"}`}>{value}</span>
        {subValue && <span className="text-[9px] text-gray-600 font-semibold mt-0.5">{subValue}</span>}
      </div>
    </div>
  );
}
