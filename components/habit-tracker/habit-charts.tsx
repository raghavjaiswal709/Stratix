"use client";

import { useMemo } from "react";
import { useAppContext } from "@/lib/context";
import {
  getDailyScore,
  getHabitCompletionRate,
  getHeatmapData,
  getCurrentStreak,
  getLongestStreak,
  getDateRange,
} from "@/lib/habits";
import { eachDayOfInterval, format, getDay, startOfYear, getWeek } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TimeFrame } from "@/types";

interface HabitChartsProps {
  timeFrame: TimeFrame;
}

export function HabitCharts({ timeFrame }: HabitChartsProps) {
  const { habitData } = useAppContext();

  // Bar/Line/Area chart data
  const dailyData = useMemo(() => {
    const { start, end } = getDateRange(timeFrame);
    const days = eachDayOfInterval({ start, end });

    if (timeFrame === "this-week") {
      return days.map((day) => ({
        name: format(day, "EEE"),
        score: getDailyScore(habitData.habits, habitData.logs, format(day, "yyyy-MM-dd")),
      }));
    }

    // For longer time frames, aggregate by week or month
    if (days.length > 60) {
      // Group by month
      const monthMap: Record<string, number[]> = {};
      days.forEach((day) => {
        const key = format(day, "MMM yyyy");
        if (!monthMap[key]) monthMap[key] = [];
        monthMap[key].push(
          getDailyScore(habitData.habits, habitData.logs, format(day, "yyyy-MM-dd"))
        );
      });
      return Object.entries(monthMap).map(([name, scores]) => ({
        name,
        score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      }));
    }

    return days.map((day) => ({
      name: format(day, "MMM d"),
      score: getDailyScore(habitData.habits, habitData.logs, format(day, "yyyy-MM-dd")),
    }));
  }, [timeFrame, habitData]);

  // Radar chart data
  const radarData = useMemo(() => {
    return habitData.habits.map((habit) => ({
      habit: habit.name,
      completion: getHabitCompletionRate(habit.id, habitData.logs, timeFrame),
    }));
  }, [habitData, timeFrame]);

  // Heatmap data
  const heatmapData = useMemo(() => getHeatmapData(habitData.habits, habitData.logs), [habitData]);

  // Streak data
  const streakData = useMemo(() => {
    return habitData.habits.map((habit) => ({
      name: habit.name,
      current: getCurrentStreak(habit.id, habitData.logs),
      longest: getLongestStreak(habit.id, habitData.logs),
    }));
  }, [habitData]);

  // Organize heatmap into weeks
  const heatmapWeeks = useMemo(() => {
    const now = new Date();
    const yearStart = startOfYear(now);
    const weeks: { date: string; score: number; dayOfWeek: number; week: number }[][] = [];
    const dataMap: Record<string, number> = {};
    heatmapData.forEach((d) => (dataMap[d.date] = d.score));

    const allDays = eachDayOfInterval({ start: yearStart, end: now });
    allDays.forEach((day) => {
      const weekNum = getWeek(day, { weekStartsOn: 0 });
      if (!weeks[weekNum]) weeks[weekNum] = [];
      weeks[weekNum].push({
        date: format(day, "yyyy-MM-dd"),
        score: dataMap[format(day, "yyyy-MM-dd")] || 0,
        dayOfWeek: getDay(day),
        week: weekNum,
      });
    });

    return weeks.filter(Boolean);
  }, [heatmapData]);

  const getHeatColor = (score: number) => {
    if (score === 0) return "bg-muted";
    if (score <= 40) return "bg-green-200 dark:bg-green-900";
    if (score <= 70) return "bg-green-400 dark:bg-green-700";
    if (score <= 90) return "bg-green-500 dark:bg-green-500";
    return "bg-green-600 dark:bg-green-400";
  };

  const chartColors = {
    primary: "hsl(var(--primary))",
    bar: "#3b82f6",
    line: "#8b5cf6",
    area: "#06b6d4",
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Analytics</h3>
      <Tabs defaultValue="bar" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="bar">Bar</TabsTrigger>
          <TabsTrigger value="line">Line</TabsTrigger>
          <TabsTrigger value="area">Area</TabsTrigger>
          <TabsTrigger value="radar">Radar</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
          <TabsTrigger value="streak">Streak</TabsTrigger>
        </TabsList>

        <TabsContent value="bar" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Bar dataKey="score" fill={chartColors.bar} radius={[4, 4, 0, 0]} name="Score %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="line" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={chartColors.line}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Score %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="area" className="mt-4">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--card-foreground))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke={chartColors.area}
                  fill={chartColors.area}
                  fillOpacity={0.3}
                  name="Score %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="radar" className="mt-4">
          <div className="h-[300px] w-full">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="habit" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 100]} />
                  <Radar
                    dataKey="completion"
                    stroke={chartColors.line}
                    fill={chartColors.line}
                    fillOpacity={0.4}
                    name="Completion %"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Add habits to see radar chart
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="heatmap" className="mt-4">
          <div className="overflow-x-auto pb-4">
            <div className="min-w-[700px]">
              <div className="flex gap-[3px]">
                {heatmapWeeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }).map((_, di) => {
                      const day = week.find((d) => d.dayOfWeek === di);
                      if (!day) {
                        return <div key={di} className="h-3 w-3" />;
                      }
                      return (
                        <div
                          key={di}
                          className={`h-3 w-3 rounded-sm ${getHeatColor(day.score)} cursor-pointer transition-colors`}
                          title={`${day.date}: ${day.score}%`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <span>Less</span>
                <div className="h-3 w-3 rounded-sm bg-muted" />
                <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-900" />
                <div className="h-3 w-3 rounded-sm bg-green-400 dark:bg-green-700" />
                <div className="h-3 w-3 rounded-sm bg-green-500 dark:bg-green-500" />
                <div className="h-3 w-3 rounded-sm bg-green-600 dark:bg-green-400" />
                <span>More</span>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="streak" className="mt-4">
          <div className="h-[300px] w-full">
            {streakData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={streakData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--card-foreground))",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="current" fill="#3b82f6" name="Current Streak" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="longest" fill="#8b5cf6" name="Longest Streak" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Add habits to see streak data
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
