"use client";

import { useMemo } from "react";
import { useAppContext } from "@/lib/context";
import {
  getWinRate,
  getTotalPnL,
  getAvgPnL,
  getAvgWin,
  getAvgLoss,
  getProfitFactor,
  getExpectancy,
  getMaxDrawdown,
  getMaxConsecutive,
  getBestTrade,
  getWorstTrade,
  getAvgHoldDuration,
  getEquityCurve,
  getPnLByDayOfWeek,
  getPnLByAssetClass,
  getPnLByStrategy,
  getPnLByEmotion,
  getWinLossDistribution,
  getRRRDistribution,
  getStopLossHitRate,
  getTargetHitRate,
  getEntryAccuracy,
} from "@/lib/trades";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { parseISO, differenceInMinutes } from "date-fns";

const PIE_COLORS = ["#22c55e", "#ef4444", "#eab308"];
const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  color: "hsl(var(--card-foreground))",
};

export function PerformanceDashboard() {
  const { tradeData } = useAppContext();
  const trades = tradeData.trades;

  const metrics = useMemo(() => {
    const best = getBestTrade(trades);
    const worst = getWorstTrade(trades);
    return {
      totalTrades: trades.length,
      winRate: getWinRate(trades),
      totalPnL: getTotalPnL(trades),
      avgPnL: getAvgPnL(trades),
      avgWin: getAvgWin(trades),
      avgLoss: getAvgLoss(trades),
      profitFactor: getProfitFactor(trades),
      expectancy: getExpectancy(trades),
      maxDrawdown: getMaxDrawdown(trades),
      maxConsWins: getMaxConsecutive(trades, "win"),
      maxConsLosses: getMaxConsecutive(trades, "loss"),
      bestTrade: best ? `${best.symbol} +${best.pnl.toFixed(2)}` : "-",
      worstTrade: worst ? `${worst.symbol} ${worst.pnl.toFixed(2)}` : "-",
      avgHoldDuration: getAvgHoldDuration(trades),
      entryAccuracy: getEntryAccuracy(trades),
      slHitRate: getStopLossHitRate(trades),
      tpHitRate: getTargetHitRate(trades),
    };
  }, [trades]);

  const equityCurve = useMemo(() => getEquityCurve(trades), [trades]);
  const pnlByDay = useMemo(() => getPnLByDayOfWeek(trades), [trades]);
  const pnlByAsset = useMemo(() => getPnLByAssetClass(trades), [trades]);
  const pnlByStrategy = useMemo(() => getPnLByStrategy(trades), [trades]);
  const pnlByEmotion = useMemo(() => getPnLByEmotion(trades), [trades]);
  const winLoss = useMemo(() => getWinLossDistribution(trades), [trades]);
  const rrrDist = useMemo(() => getRRRDistribution(trades), [trades]);

  const scatterData = useMemo(() => {
    return trades.map((t) => ({
      duration: differenceInMinutes(parseISO(t.exitDate), parseISO(t.entryDate)),
      pnl: t.pnl,
      symbol: t.symbol,
    }));
  }, [trades]);

  const kpiCards = [
    { label: "Total Trades", value: metrics.totalTrades },
    { label: "Win Rate", value: `${metrics.winRate}%` },
    { label: "Total P&L", value: metrics.totalPnL.toFixed(2), color: metrics.totalPnL >= 0 },
    { label: "Avg P&L", value: metrics.avgPnL.toFixed(2), color: metrics.avgPnL >= 0 },
    { label: "Avg Win", value: metrics.avgWin.toFixed(2), color: true },
    { label: "Avg Loss", value: metrics.avgLoss.toFixed(2), color: false },
    { label: "Profit Factor", value: metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2) },
    { label: "Expectancy", value: metrics.expectancy.toFixed(2), color: metrics.expectancy >= 0 },
    { label: "Max Drawdown", value: metrics.maxDrawdown.toFixed(2) },
    { label: "Max Cons. Wins", value: metrics.maxConsWins },
    { label: "Max Cons. Losses", value: metrics.maxConsLosses },
    { label: "Best Trade", value: metrics.bestTrade },
    { label: "Worst Trade", value: metrics.worstTrade },
    { label: "Avg Hold", value: metrics.avgHoldDuration },
    { label: "Entry Accuracy", value: `${metrics.entryAccuracy}%` },
    { label: "SL Hit Rate", value: `${metrics.slHitRate}%` },
    { label: "TP Hit Rate", value: `${metrics.tpHitRate}%` },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p
                className={`text-lg font-bold ${
                  kpi.color !== undefined
                    ? kpi.color
                      ? "text-green-500"
                      : "text-red-500"
                    : ""
                }`}
              >
                {kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <Tabs defaultValue="equity" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
          <TabsTrigger value="winloss">Win/Loss</TabsTrigger>
          <TabsTrigger value="day">By Day</TabsTrigger>
          <TabsTrigger value="asset">By Asset</TabsTrigger>
          <TabsTrigger value="strategy">By Strategy</TabsTrigger>
          <TabsTrigger value="emotion">By Emotion</TabsTrigger>
          <TabsTrigger value="scatter">Duration vs P&L</TabsTrigger>
          <TabsTrigger value="rrr">RRR Dist.</TabsTrigger>
        </TabsList>

        <TabsContent value="equity" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityCurve}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="cumPnl"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Cumulative P&L"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="winloss" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={winLoss}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {winLoss.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="day" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlByDay}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
                  {pnlByDay.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="asset" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlByAsset} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="assetClass" type="category" tick={{ fontSize: 12 }} width={80} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="pnl" name="P&L" radius={[0, 4, 4, 0]}>
                  {pnlByAsset.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="strategy" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlByStrategy}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="strategy" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="pnl" name="P&L" radius={[4, 4, 0, 0]}>
                  {pnlByStrategy.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="emotion" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlByEmotion}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="emotion" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="avgPnl" name="Avg P&L" radius={[4, 4, 0, 0]}>
                  {pnlByEmotion.map((entry, i) => (
                    <Cell key={i} fill={entry.avgPnl >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="scatter" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="duration" name="Duration (min)" tick={{ fontSize: 11 }} />
                <YAxis dataKey="pnl" name="P&L" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                />
                <Scatter data={scatterData} fill="#8b5cf6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="rrr" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rrrDist}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#06b6d4" name="Trades" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
