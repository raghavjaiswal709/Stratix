"use client";

import { format } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Brain,
  CheckSquare,
  Eye,
  AlertTriangle,
  Lightbulb,
  Sparkles,
  Trophy,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SymbolBreakdown {
  symbol: string;
  trades: number;
  win_rate: number;
  net_pnl: number;
}

interface Aggregate {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  avgRiskReward: number;
  journaledCount: number;
  totalMissedTrades: number;
  missedWouldHaveWon: number;
  missedWouldHaveLost: number;
}

export interface ReportData {
  performance_summary: {
    narrative: string;
    trend: "Improving" | "Declining" | "Stable";
    trend_reason: string;
  };
  strengths: string[];
  weaknesses: string[];
  discipline_score: {
    score: number;
    grade: string;
    summary: string;
  };
  strategy_execution_analysis: {
    score: number;
    summary: string;
    checklist_compliance_rate: number;
  };
  execution_checklist_compliance: {
    overall_rate: number;
    most_skipped_items: string[];
    summary: string;
  };
  emotional_patterns: {
    dominant_emotions: string[];
    summary: string;
    emotion_pnl_correlation: string;
  };
  missed_trades_analysis: {
    total_missed: number;
    would_have_won: number;
    would_have_lost: number;
    still_open_or_unknown: number;
    estimated_missed_pnl_note: string;
    common_reasons: string[];
    summary: string;
  };
  symbol_breakdown: SymbolBreakdown[];
  key_mistakes: string[];
  actionable_recommendations: string[];
  narrative_summary: string;
  aggregate?: Aggregate;
}

export interface Report {
  _id: string;
  timeRange: string;
  timeRangeLabel: string;
  tradesAnalyzed: number;
  missedTradesAnalyzed: number;
  generatedAt: string;
  data: ReportData;
}

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[18px] font-black text-white">{score}</span>
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const config = {
    Improving: { icon: TrendingUp, color: "text-emerald-400 bg-emerald-500/12 border-emerald-500/25" },
    Declining: { icon: TrendingDown, color: "text-red-400 bg-red-500/12 border-red-500/25" },
    Stable: { icon: Minus, color: "text-white/60 bg-white/5 border-white/15" },
  }[trend] ?? { icon: Minus, color: "text-white/60 bg-white/5 border-white/15" };
  const Icon = config.icon;
  return (
    <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border", config.color)}>
      <Icon className="h-3 w-3" /> {trend}
    </span>
  );
}

function StatTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const toneClass = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-white";
  return (
    <div className="rounded-xl border border-white/7 bg-white/[0.015] px-3.5 py-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">{label}</p>
      <p className={cn("text-[17px] font-black tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

export function ReportDashboard({ report }: { report: Report }) {
  const d = report.data;
  const agg = d.aggregate;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0c0e14] border-b border-white/7">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white/70" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-white">AI Journal Report</h2>
            <p className="text-[11px] text-white/35">
              {report.timeRangeLabel} · {report.tradesAnalyzed} trades · {report.missedTradesAnalyzed} missed · {format(new Date(report.generatedAt), "MMM d, yyyy HH:mm")}
            </p>
          </div>
        </div>
        <TrendBadge trend={d.performance_summary?.trend || "Stable"} />
      </div>

      <div className="px-6 py-5 space-y-5 max-w-[1600px] mx-auto">
        {/* Ground-truth stat tiles — computed server-side, never paraphrased */}
        {agg && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile label="Win Rate" value={`${agg.winRatePercent}%`} tone={agg.winRatePercent >= 50 ? "good" : "bad"} />
            <StatTile label="Net P&L" value={`${agg.netPnl >= 0 ? "+" : ""}$${agg.netPnl.toFixed(2)}`} tone={agg.netPnl >= 0 ? "good" : "bad"} />
            <StatTile label="Profit Factor" value={agg.profitFactor.toFixed(2)} tone={agg.profitFactor >= 1 ? "good" : "bad"} />
            <StatTile label="Avg R:R" value={agg.avgRiskReward.toFixed(2)} />
            <StatTile label="Trades" value={`${agg.closedTrades}/${agg.totalTrades}`} />
            <StatTile label="Journaled" value={agg.totalTrades > 0 ? `${Math.round((agg.journaledCount / agg.totalTrades) * 100)}%` : "0%"} />
          </div>
        )}

        {/* Performance summary */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Trophy className="h-4 w-4 text-amber-400/80" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Performance Summary</span>
          </div>
          <div className="p-4 space-y-2">
            <p className="text-[13px] text-white/75 leading-relaxed whitespace-pre-wrap">{d.performance_summary?.narrative || "No narrative summary available."}</p>
            <p className="text-[11px] text-white/35 italic pt-1">{d.performance_summary?.trend_reason || ""}</p>
          </div>
        </div>

        {/* Strengths & Weaknesses — professional performance-review style */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.02] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <ShieldCheck className="h-4 w-4 text-emerald-400/80" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Strengths</span>
            </div>
            <div className="p-4">
              <ul className="space-y-2">
                {(d.strengths || []).map((s, i) => (
                  <li key={i} className="text-[12.5px] text-white/75 leading-relaxed flex gap-2.5">
                    <span className="text-emerald-400 shrink-0 font-bold">+</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-xl border border-red-500/15 bg-red-500/[0.02] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <ShieldAlert className="h-4 w-4 text-red-400/80" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Weaknesses</span>
            </div>
            <div className="p-4">
              <ul className="space-y-2">
                {(d.weaknesses || []).map((s, i) => (
                  <li key={i} className="text-[12.5px] text-white/75 leading-relaxed flex gap-2.5">
                    <span className="text-red-400 shrink-0 font-bold">−</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Discipline + Strategy Execution scores */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <CheckSquare className="h-4 w-4 text-white/55" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Discipline Score</span>
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/8 text-white/60 border border-white/10">
                Grade {d.discipline_score?.grade || "N/A"}
              </span>
            </div>
            <div className="p-4 flex items-start gap-4">
              <ScoreRing score={d.discipline_score?.score || 0} />
              <p className="text-[12px] text-white/65 leading-relaxed flex-1">{d.discipline_score?.summary || "No discipline summary available."}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Target className="h-4 w-4 text-white/55" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Strategy Execution</span>
              <span className="ml-auto text-[10px] text-white/35">{d.strategy_execution_analysis?.checklist_compliance_rate || 0}% consistent</span>
            </div>
            <div className="p-4 flex items-start gap-4">
              <ScoreRing score={d.strategy_execution_analysis?.score || 0} />
              <p className="text-[12px] text-white/65 leading-relaxed flex-1 line-clamp-5">{d.strategy_execution_analysis?.summary || ""}</p>
            </div>
          </div>
        </div>

        {/* Strategy execution — deep dive */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Target className="h-4 w-4 text-white/55" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Strategy Execution — Deep Dive</span>
          </div>
          <div className="p-4">
            <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">{d.strategy_execution_analysis?.summary || "No strategy execution summary available."}</p>
          </div>
        </div>

        {/* Checklist compliance + Emotional patterns side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/7">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-white/55" />
                <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Checklist Compliance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-20 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", (d.execution_checklist_compliance?.overall_rate || 0) >= 70 ? "bg-emerald-500" : (d.execution_checklist_compliance?.overall_rate || 0) >= 40 ? "bg-amber-500" : "bg-red-500")}
                    style={{ width: `${Math.min(100, d.execution_checklist_compliance?.overall_rate || 0)}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-white/50">{d.execution_checklist_compliance?.overall_rate || 0}%</span>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-[12px] text-white/65 leading-relaxed">{d.execution_checklist_compliance?.summary || "No checklist compliance summary available."}</p>
              {d.execution_checklist_compliance?.most_skipped_items && d.execution_checklist_compliance.most_skipped_items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] text-white/30">Most skipped:</span>
                  {(d.execution_checklist_compliance.most_skipped_items || []).map((item, i) => (
                    <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400/80 border border-red-500/20">
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Brain className="h-4 w-4 text-white/55" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Emotional Patterns</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(d.emotional_patterns?.dominant_emotions || []).map((e, i) => (
                  <span key={i} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/6 text-white/70 border border-white/10">
                    {e}
                  </span>
                ))}
              </div>
              <p className="text-[12px] text-white/65 leading-relaxed">{d.emotional_patterns?.summary || "No emotional patterns summary available."}</p>
              <p className="text-[12px] text-white/50 leading-relaxed italic border-t border-white/5 pt-3">{d.emotional_patterns?.emotion_pnl_correlation || "No emotional correlation data."}</p>
            </div>
          </div>
        </div>

        {/* Missed trades + Symbol breakdown side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Eye className="h-4 w-4 text-white/55" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Missed Trades Analysis</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-white/3 p-2">
                  <p className="text-[15px] font-bold text-white">{d.missed_trades_analysis?.total_missed || 0}</p>
                  <p className="text-[9px] text-white/30 uppercase">Total</p>
                </div>
                <div className="rounded-lg bg-emerald-500/8 p-2">
                  <p className="text-[15px] font-bold text-emerald-400">{d.missed_trades_analysis?.would_have_won || 0}</p>
                  <p className="text-[9px] text-white/30 uppercase">Would Win</p>
                </div>
                <div className="rounded-lg bg-red-500/8 p-2">
                  <p className="text-[15px] font-bold text-red-400">{d.missed_trades_analysis?.would_have_lost || 0}</p>
                  <p className="text-[9px] text-white/30 uppercase">Would Lose</p>
                </div>
                <div className="rounded-lg bg-white/3 p-2">
                  <p className="text-[15px] font-bold text-white/60">{d.missed_trades_analysis?.still_open_or_unknown || 0}</p>
                  <p className="text-[9px] text-white/30 uppercase">Unknown</p>
                </div>
              </div>
              <p className="text-[12px] text-white/65 leading-relaxed">{d.missed_trades_analysis?.summary || "No missed trades summary available."}</p>
              <p className="text-[11px] text-amber-400/70 italic">{d.missed_trades_analysis?.estimated_missed_pnl_note || ""}</p>
              {d.missed_trades_analysis?.common_reasons && d.missed_trades_analysis.common_reasons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(d.missed_trades_analysis.common_reasons || []).map((r, i) => (
                    <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400/80 border border-amber-500/20">
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {d.symbol_breakdown && d.symbol_breakdown.length > 0 && (
            <div className="rounded-xl border border-white/7 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
                <Target className="h-4 w-4 text-white/55" />
                <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Symbol Breakdown</span>
              </div>
              <div className="divide-y divide-white/5">
                {(d.symbol_breakdown || []).map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-white/8 flex items-center justify-center text-[9px] font-bold text-white/60">
                        {(s.symbol || "??").slice(0, 2)}
                      </div>
                      <span className="text-[12px] font-semibold text-white/80">{s.symbol}</span>
                      <span className="text-[10px] text-white/30">{s.trades} trades</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-[11px] font-semibold", s.win_rate >= 50 ? "text-emerald-400" : "text-red-400")}>
                        {s.win_rate}% WR
                      </span>
                      <span className={cn("text-[12px] font-bold tabular-nums w-16 text-right", s.net_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {s.net_pnl >= 0 ? "+" : ""}${Math.abs(s.net_pnl).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Key mistakes + Actionable recommendations side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-red-500/15 bg-red-500/[0.02] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <AlertTriangle className="h-4 w-4 text-red-400/80" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Key Mistakes</span>
            </div>
            <div className="p-4">
              <ul className="space-y-2">
                {(d.key_mistakes || []).map((m, i) => (
                  <li key={i} className="text-[12px] text-white/70 flex gap-2.5">
                    <span className="h-5 w-5 shrink-0 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.02] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Lightbulb className="h-4 w-4 text-emerald-400/80" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Actionable Recommendations</span>
            </div>
            <div className="p-4">
              <ul className="space-y-2">
                {(d.actionable_recommendations || []).map((r, i) => (
                  <li key={i} className="text-[12px] text-white/70 flex gap-2.5">
                    <span className="h-5 w-5 shrink-0 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Full narrative */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Sparkles className="h-4 w-4 text-white/55" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Coach&apos;s Full Report</span>
          </div>
          <div className="p-4">
            <p className="text-[13px] text-white/70 leading-relaxed whitespace-pre-wrap">{d.narrative_summary || d.performance_summary?.narrative || "No narrative summary available."}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
