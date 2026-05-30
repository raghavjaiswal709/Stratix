"use client";

import { useAppContext } from "@/lib/context";
import { getDailyScore } from "@/lib/habits";
import { format } from "date-fns";

function scoreColor(n: number) {
  if (n >= 80) return "#22c55e";
  if (n >= 60) return "#eab308";
  if (n >= 40) return "#f97316";
  return "#ef4444";
}

export function ScoreOfTheDay() {
  const { habitData } = useAppContext();
  const today = format(new Date(), "yyyy-MM-dd");

  const habitScore = getDailyScore(habitData.habits, habitData.logs, today);
  const color = scoreColor(habitScore);
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (habitScore / 100) * circ;

  return (
    <div className="glass-card px-5 py-4 flex items-center gap-5">
      {/* Circular ring */}
      <div className="relative shrink-0">
        <svg width="68" height="68" className="-rotate-90">
          <circle cx="34" cy="34" r={radius} fill="none"
            stroke="var(--border)" strokeWidth="4" />
          <circle cx="34" cy="34" r={radius} fill="none"
            stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[16px] font-bold leading-none" style={{ color }}>{habitScore}</span>
          <span className="text-[9px] text-muted-foreground/70 mt-0.5">%</span>
        </div>
      </div>

      {/* Main label */}
      <div className="flex-1 min-w-0">
        <p className="text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground mb-0.5">Score of the Day</p>
        <p className="text-[26px] font-bold leading-tight" style={{ color }}>{habitScore}%</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">{format(new Date(), "EEEE, MMMM d")}</p>
      </div>
    </div>
  );
}
