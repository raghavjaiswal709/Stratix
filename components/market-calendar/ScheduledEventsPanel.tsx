"use client";

// ─── ScheduledEventsPanel ───────────────────────────────────────────────────
// Dedicated "what's coming up" surface for the economic calendar, pulling
// straight from the same /api/market-calendar feed the full Market Calendar
// page uses — so this is always a faithful preview of it.
//
// Two render modes sharing one data/format layer:
//   "full"    — News Analysis page: its own bordered section.
//   "compact" — Dashboard: text carousel displaying 1 upcoming event at a time,
//               with auto-rotation and manual controls without increasing card height.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ArrowUpRight, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/lib/news/types";

const REFRESH_MS = 3 * 60 * 1000;
const TICK_MS = 60 * 1000;
const GRACE_MS = 10 * 60 * 1000;

function formatISTTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  });
}

function formatRelative(diffMs: number): string {
  const mins = Math.round(Math.abs(diffMs) / 60000);
  if (mins < 1) return diffMs >= 0 ? "now" : "just now";
  if (mins < 60) return diffMs >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  const label = remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
}

function parseNumeric(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

const IMPACT_DOT: Record<string, string> = { High: "bg-red-500", Medium: "bg-amber-500" };
const IMPACT_TEXT: Record<string, string> = { High: "text-red-400", Medium: "text-amber-400" };

function useUpcomingEvents(limit: number) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/market-calendar");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load calendar");
        if (!cancelled) {
          setEvents(Array.isArray(data.events) ? data.events : []);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return events
      .filter((e) => e.impact === "High" || e.impact === "Medium")
      .filter((e) => {
        const t = new Date(e.date).getTime();
        return !isNaN(t) && t >= now - GRACE_MS;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, limit);
  }, [events, limit]);

  return { upcoming, loading, error };
}

interface ScheduledEventsPanelProps {
  variant?: "full" | "compact";
  limit?: number;
  className?: string;
}

export function ScheduledEventsPanel({ variant = "full", limit, className }: ScheduledEventsPanelProps) {
  const rowLimit = limit ?? (variant === "compact" ? 6 : 8);
  const { upcoming, loading, error } = useUpcomingEvents(rowLimit);
  const now = Date.now();
  const nextIndex = upcoming.findIndex((ev) => new Date(ev.date).getTime() > now);

  const [carouselIndex, setCarouselIndex] = useState(0);

  // Synchronize initial carousel index to next upcoming event once loaded
  useEffect(() => {
    if (nextIndex >= 0) {
      setCarouselIndex(nextIndex);
    }
  }, [nextIndex]);

  // Auto-advance carousel every 4.5 seconds in compact mode
  useEffect(() => {
    if (variant !== "compact" || upcoming.length <= 1) return;
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % upcoming.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [variant, upcoming.length]);

  if (variant === "compact") {
    const activeEvent = upcoming[carouselIndex] ?? upcoming[0];
    const activeTime = activeEvent ? new Date(activeEvent.date).getTime() : 0;
    const isNext = carouselIndex === nextIndex;

    return (
      <div className={`h-full flex flex-col justify-between rounded-xl md:rounded-2xl border border-border bg-card p-3 md:p-3.5 shadow-sm ${className ?? ""}`}>
        {/* Card Header */}
        <div className="flex items-center justify-between gap-3 shrink-0 mb-1">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-white/40" />
            <h2 className="text-xs font-semibold text-white/90">Scheduled Events</h2>
          </div>
          <div className="flex items-center gap-2">
            {upcoming.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCarouselIndex((prev) => (prev - 1 + upcoming.length) % upcoming.length)}
                  className="flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Previous event"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="text-[10px] font-mono font-semibold text-white/50 px-0.5">
                  {carouselIndex + 1}/{upcoming.length}
                </span>
                <button
                  onClick={() => setCarouselIndex((prev) => (prev + 1) % upcoming.length)}
                  className="flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  title="Next event"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
            <Link href="/market-calendar" className="text-[11px] text-white/40 hover:text-white/70 flex items-center gap-1 transition shrink-0">
              Calendar <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Content Area Directly in Parent Div (No nested border box!) */}
        {loading ? (
          <div className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
        ) : error ? (
          <div className="py-2 flex items-center justify-center">
            <p className="text-[11px] text-white/40 text-center">Could not load the economic calendar.</p>
          </div>
        ) : upcoming.length === 0 || !activeEvent ? (
          <div className="py-2 flex items-center justify-center">
            <p className="text-[11px] text-white/40 text-center">No high-impact events scheduled right now.</p>
          </div>
        ) : (
          <div className="flex items-center gap-3.5 py-1 flex-1 min-w-0">
            <div className="shrink-0 text-center pr-3.5 border-r border-white/10 flex flex-col justify-center">
              <p className="text-[15px] sm:text-[17px] font-extrabold tabular-nums leading-none text-white">{formatISTTime(activeEvent.date)}</p>
              <p className="text-[8.5px] font-bold text-white/35 uppercase tracking-wider mt-1">IST</p>
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
              <p className="text-[13px] sm:text-[14px] font-semibold leading-tight truncate text-white/95" title={activeEvent.title}>
                {activeEvent.title}
              </p>
              <div className="flex items-center gap-1.5 leading-none mt-0.5">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${IMPACT_DOT[activeEvent.impact] ?? "bg-white/30"}`} />
                <span className="text-[9.5px] font-bold uppercase text-white/50 font-mono">[{activeEvent.country}]</span>
                <span className={`text-[9.5px] font-bold uppercase ${IMPACT_TEXT[activeEvent.impact] ?? "text-white/40"}`}>{activeEvent.impact}</span>
                {isNext && (
                  <span className="ml-1 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Next
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right self-center pl-1">
              <span className={`text-[12px] sm:text-[13px] font-extrabold ${activeTime <= now ? "text-white/35" : "text-emerald-400"}`}>
                {formatRelative(activeTime - now)}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── "full" variant ─────────────────────────────────────────────────────
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08] shrink-0">
            <CalendarClock className="h-4 w-4 text-white/60" />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-white/85 leading-none">Scheduled Events</h2>
            <p className="text-[10.5px] text-white/30 mt-1">High/medium-impact releases from the Market Calendar · times in IST</p>
          </div>
        </div>
        <Link href="/market-calendar" className="flex items-center gap-1 text-[11px] font-medium text-white/35 hover:text-white/70 transition shrink-0 whitespace-nowrap">
          Full calendar <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="px-5 py-6 text-xs text-white/30 text-center">Could not load the economic calendar.</p>
      ) : upcoming.length === 0 ? (
        <p className="px-5 py-6 text-xs text-white/30 text-center">No high-impact events scheduled right now — check the full calendar for lower-impact releases.</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {upcoming.map((ev, i) => {
            const t = new Date(ev.date).getTime();
            const isPast = t <= now;
            const isNext = i === nextIndex;
            const actualNum = parseNumeric(ev.actual);
            const forecastNum = parseNumeric(ev.forecast);
            const actualColor =
              actualNum != null && forecastNum != null
                ? actualNum > forecastNum ? "text-emerald-400" : actualNum < forecastNum ? "text-red-400" : "text-white/70"
                : "text-white/70";
            return (
              <div
                key={`${ev.title}-${ev.country}-${ev.date}`}
                className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.02] ${isNext ? "bg-emerald-500/[0.04]" : ""}`}
              >
                {/* Big IST time */}
                <div className="shrink-0 w-[76px] text-center">
                  <p className="text-xl font-bold text-white tabular-nums leading-none">{formatISTTime(ev.date)}</p>
                  <p className="text-[9px] font-bold text-white/25 uppercase tracking-wider mt-1.5">IST</p>
                </div>
                <div className="w-px self-stretch bg-white/[0.06] shrink-0" />
                {/* Impact + country + title */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${IMPACT_DOT[ev.impact] ?? "bg-white/30"}`} />
                    <span className="text-[9px] font-bold uppercase text-white/40 font-mono">{ev.country}</span>
                    <span className="text-white/15">·</span>
                    <span className={`text-[9px] font-bold uppercase ${IMPACT_TEXT[ev.impact] ?? "text-white/40"}`}>{ev.impact}</span>
                    {isNext && (
                      <span className="ml-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Next
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-white/85 font-medium leading-snug truncate" title={ev.title}>{ev.title}</p>
                  {(ev.forecast || ev.previous || ev.actual) && (
                    <p className="text-[10px] text-white/30 font-mono mt-0.5 truncate">
                      {ev.actual && <span className={actualColor}>Actual {ev.actual}  </span>}
                      {ev.forecast && `Fcst ${ev.forecast}  `}
                      {ev.previous && `Prev ${ev.previous}`}
                    </p>
                  )}
                </div>
                {/* Countdown */}
                <div className="shrink-0 text-right">
                  <span className={`text-[11px] font-bold whitespace-nowrap ${isPast ? "text-white/30" : "text-emerald-400/90"}`}>
                    {formatRelative(t - now)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
