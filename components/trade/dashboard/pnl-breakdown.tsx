"use client";

import { useMemo } from "react";
import { CalendarRange, Sun, Zap, Timer } from "lucide-react";
import { getISTDateKey, getISTMonthKey, getTrueUTCHour } from "@/lib/utils/ist-time";

interface Trade {
  _id: string;
  profit: number;
  swap?: number;
  commission?: number;
  status: "open" | "closed";
  entryTime: string;
  exitTime?: string;
  source?: "manual" | "mt5";
}

interface Props {
  trades: Trade[];
}

const money = (n: number, withSign = false) => {
  const sign = n > 0 && withSign ? "+" : n < 0 ? "-" : withSign ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });

type Session = "Asian" | "London" | "London/NY" | "New York" | "Late";
const SESSIONS: Session[] = ["Asian", "London", "London/NY", "New York", "Late"];
function sessionOf(hourUTC: number): Session {
  if (hourUTC < 8) return "Asian";
  if (hourUTC < 13) return "London";
  if (hourUTC < 17) return "London/NY";
  if (hourUTC < 22) return "New York";
  return "Late";
}

type DurationBucket = "Scalp" | "Intraday" | "Swing";
const BUCKETS: DurationBucket[] = ["Scalp", "Intraday", "Swing"];
function bucketOf(ms: number): DurationBucket {
  const minutes = ms / 60000;
  if (minutes < 15) return "Scalp";
  if (minutes < 24 * 60) return "Intraday";
  return "Swing";
}

export function PnlBreakdown({ trades }: Props) {
  const m = useMemo(() => {
    const net = (t: Trade) => t.profit + (t.swap || 0) + (t.commission || 0);
    const closed = trades.filter((t) => t.status === "closed");

    // ── Monthly rollup (last 6 months with activity, calendar month in true IST) ──
    const byMonth = new Map<string, { net: number; count: number; wins: number }>();
    for (const t of closed) {
      const key = getISTMonthKey(t.exitTime || t.entryTime, t.source);
      const cur = byMonth.get(key) || { net: 0, count: 0, wins: 0 };
      cur.net += net(t);
      cur.count += 1;
      if (net(t) > 0) cur.wins += 1;
      byMonth.set(key, cur);
    }
    const months = Array.from(byMonth.entries())
      .map(([key, v]) => ({ key, label: MONTH_FMT.format(new Date(`${key}-01T00:00:00`)), ...v }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6);
    const maxAbsMonthNet = Math.max(1, ...months.map((mo) => Math.abs(mo.net)));

    // ── Consistency: % of trading days that closed net-positive (true IST day) ──
    const byDay = new Map<string, number>();
    for (const t of closed) {
      const key = getISTDateKey(t.exitTime || t.entryTime, t.source);
      byDay.set(key, (byDay.get(key) || 0) + net(t));
    }
    const dayValues = Array.from(byDay.values());
    const consistency = dayValues.length ? (dayValues.filter((v) => v > 0).length / dayValues.length) * 100 : 0;

    // ── Session breakdown (true UTC hour of entry — FX sessions are UTC by convention) ──
    const sessions = new Map<Session, { net: number; count: number; wins: number }>();
    for (const s of SESSIONS) sessions.set(s, { net: 0, count: 0, wins: 0 });
    for (const t of closed) {
      const s = sessionOf(getTrueUTCHour(t.entryTime, t.source));
      const cur = sessions.get(s)!;
      cur.net += net(t);
      cur.count += 1;
      if (net(t) > 0) cur.wins += 1;
    }

    // ── Duration buckets ───────────────────────────────────────────────────
    const buckets = new Map<DurationBucket, { net: number; count: number; wins: number }>();
    for (const b of BUCKETS) buckets.set(b, { net: 0, count: 0, wins: 0 });
    for (const t of closed) {
      if (!t.exitTime) continue;
      const ms = new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime();
      if (ms <= 0) continue;
      const b = bucketOf(ms);
      const cur = buckets.get(b)!;
      cur.net += net(t);
      cur.count += 1;
      if (net(t) > 0) cur.wins += 1;
    }

    return { months, maxAbsMonthNet, consistency, sessions, buckets, closedCount: closed.length };
  }, [trades]);

  if (m.closedCount === 0) return null;

  return (
    <div className="space-y-4">
      {/* Monthly P&L rollup */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-white/55" />
            Monthly P&amp;L
          </h3>
          <span className="text-[10px] md:text-[11px] text-muted-foreground">
            <b className="text-white/70">{m.consistency.toFixed(0)}%</b> of days profitable
          </span>
        </div>
        <div className="space-y-1.5">
          {m.months.map((mo) => {
            const barPct = Math.min(100, (Math.abs(mo.net) / m.maxAbsMonthNet) * 100);
            const winRate = mo.count ? (mo.wins / mo.count) * 100 : 0;
            return (
              <div key={mo.key} className="flex items-center gap-2.5">
                <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground">{mo.label}</span>
                <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${mo.net >= 0 ? "bg-emerald-500/60" : "bg-red-500/60"}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <span className={`w-20 shrink-0 text-right text-[10px] font-mono font-semibold ${mo.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {money(mo.net, true)}
                </span>
                <span className="w-20 shrink-0 text-right text-[9px] text-muted-foreground">
                  {mo.count} trades · {winRate.toFixed(0)}% WR
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Trading sessions */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <Sun className="h-4 w-4 text-white/55" />
            Trading Sessions
          </h3>
          <div className="space-y-1.5">
            {SESSIONS.map((s) => {
              const v = m.sessions.get(s)!;
              const winRate = v.count ? (v.wins / v.count) * 100 : 0;
              return (
                <div key={s} className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11.5px] font-semibold text-card-foreground">{s}</span>
                    <span className="text-[9px] text-muted-foreground">{v.count ? `${v.count} · ${winRate.toFixed(0)}% WR` : "—"}</span>
                  </div>
                  <span className={`text-[11px] font-bold font-mono ${v.count === 0 ? "text-muted-foreground" : v.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {v.count ? money(v.net, true) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade duration buckets */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h3 className="text-[13px] md:text-[14px] font-semibold text-card-foreground mb-3 md:mb-4 flex items-center gap-2">
            <Timer className="h-4 w-4 text-white/55" />
            Trade Duration
          </h3>
          <div className="space-y-1.5">
            {BUCKETS.map((b) => {
              const v = m.buckets.get(b)!;
              const winRate = v.count ? (v.wins / v.count) * 100 : 0;
              return (
                <div key={b} className="flex items-center justify-between rounded-lg bg-muted/40 border border-border px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="h-3 w-3 text-white/35 shrink-0" />
                    <span className="text-[11.5px] font-semibold text-card-foreground">{b}</span>
                    <span className="text-[9px] text-muted-foreground">{v.count ? `${v.count} · ${winRate.toFixed(0)}% WR` : "—"}</span>
                  </div>
                  <span className={`text-[11px] font-bold font-mono ${v.count === 0 ? "text-muted-foreground" : v.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {v.count ? money(v.net, true) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
