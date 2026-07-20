"use client";

// ─── MarketCalendarPage ────────────────────────────────────────────────────
// Forex-Factory-style economic calendar: this week's scheduled data releases
// (CPI, NFP, rate decisions, PMI, etc.), grouped by day, filterable by
// impact and currency. Sourced from the same public FF-mirror feed already
// used internally by the news-sentiment pipeline (lib/news/calendar.ts) —
// this page just renders it visually instead of folding it into scoring.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/news/types";
import {
  CalendarClock, RefreshCw, AlertTriangle, Search, X, ChevronDown,
} from "lucide-react";

type ImpactLevel = "High" | "Medium" | "Low" | "Holiday";
const IMPACT_LEVELS: ImpactLevel[] = ["High", "Medium", "Low", "Holiday"];

const IMPACT_STYLE: Record<ImpactLevel, { dot: string; text: string; chipActive: string }> = {
  High:    { dot: "bg-red-500",    text: "text-red-400",    chipActive: "bg-red-500/15 border-red-500/40 text-red-300" },
  Medium:  { dot: "bg-amber-500",  text: "text-amber-400",  chipActive: "bg-amber-500/15 border-amber-500/40 text-amber-300" },
  Low:     { dot: "bg-white/30",   text: "text-white/45",   chipActive: "bg-white/[0.10] border-white/[0.22] text-white/70" },
  Holiday: { dot: "bg-white/15",   text: "text-white/30",   chipActive: "bg-white/[0.08] border-white/[0.18] text-white/55" },
};

function normalizeImpact(raw: string): ImpactLevel {
  return (IMPACT_LEVELS as string[]).includes(raw) ? (raw as ImpactLevel) : "Low";
}

// Strips %, commas, K/M/B suffixes etc. so "3.50%" and "18,200K" can be compared numerically.
function parseNumeric(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function dayKey(d: Date): string {
  return d.toDateString();
}

function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

function formatRelative(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return diffMs >= 0 ? "now" : "just now";
  if (mins < 60) return diffMs >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  const label = remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
}

export function MarketCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedImpacts, setSelectedImpacts] = useState<Set<ImpactLevel>>(new Set(IMPACT_LEVELS));
  const [selectedCurrencies, setSelectedCurrencies] = useState<Set<string> | null>(null); // null = "all" until currencies are known
  const [search, setSearch] = useState("");
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);

  const todayRef = useRef<HTMLDivElement | null>(null);
  const hasScrolledRef = useRef(false);

  // Re-render every 60s purely so "in 2h 15m" / "3m ago" labels stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/market-calendar");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load calendar");
      const list: CalendarEvent[] = Array.isArray(data.events) ? data.events : [];
      setEvents(list);
      setFetchedAt(data.fetchedAt ?? Date.now());
      setSelectedCurrencies((prev) => {
        if (prev !== null) return prev; // keep the user's existing filter across refreshes
        return new Set(list.map((e) => e.country));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const availableCurrencies = useMemo(
    () => Array.from(new Set(events.map((e) => e.country))).sort(),
    [events]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events
      .filter((e) => selectedImpacts.has(normalizeImpact(e.impact)))
      .filter((e) => !selectedCurrencies || selectedCurrencies.has(e.country))
      .filter((e) => !q || e.title.toLowerCase().includes(q) || e.country.toLowerCase().includes(q))
      .filter((e) => !isNaN(new Date(e.date).getTime()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, selectedImpacts, selectedCurrencies, search]);

  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; items: CalendarEvent[] }>();
    for (const e of filtered) {
      const d = new Date(e.date);
      const key = dayKey(d);
      if (!map.has(key)) map.set(key, { date: d, items: [] });
      map.get(key)!.items.push(e);
    }
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filtered]);

  useEffect(() => {
    if (hasScrolledRef.current) return;
    if (groups.length === 0) return;
    if (todayRef.current) {
      todayRef.current.scrollIntoView({ block: "start" });
      hasScrolledRef.current = true;
    }
  }, [groups]);

  const now = Date.now();
  const nextEvent = useMemo(
    () => filtered.find((e) => new Date(e.date).getTime() > now) ?? null,
    [filtered, now]
  );

  const toggleImpact = (level: ImpactLevel) => {
    setSelectedImpacts((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  };

  const toggleCurrency = (code: string) => {
    setSelectedCurrencies((prev) => {
      const base = prev ?? new Set(availableCurrencies);
      const next = new Set(base);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const currencyFilterActive = selectedCurrencies !== null && selectedCurrencies.size !== availableCurrencies.length;

  return (
    <div className="flex flex-col w-full h-full bg-[#0f0f0f] overflow-hidden text-white/80">

      {/* ── Top bar — scrolls horizontally on narrow screens instead of clipping ── */}
      <div className="h-12 shrink-0 bg-[#0f0f0f] border-b border-white/[0.08] flex items-center gap-2 px-3 overflow-x-auto">
        <div className="flex items-center gap-2 mr-2 shrink-0">
          <CalendarClock className="w-4 h-4 text-white/30 shrink-0" />
          <span className="hidden sm:inline text-[11px] font-bold text-white/60 uppercase tracking-widest whitespace-nowrap">Market Calendar</span>
        </div>
        <div className="w-px h-5 bg-white/[0.08] shrink-0" />

        {/* Impact chips */}
        <div className="flex items-center gap-1 shrink-0">
          {IMPACT_LEVELS.map((level) => {
            const active = selectedImpacts.has(level);
            const style = IMPACT_STYLE[level];
            return (
              <button
                key={level}
                onClick={() => toggleImpact(level)}
                className={`flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold uppercase rounded-md border transition-all whitespace-nowrap shrink-0 ${
                  active ? style.chipActive : "bg-white/[0.03] border-white/[0.08] text-white/25 hover:text-white/50"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? style.dot : "bg-white/15"}`} />
                {level}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-white/[0.08] shrink-0" />

        {/* Currency filter */}
        <div className="relative shrink-0">
          <button
            onClick={() => setCurrencyMenuOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold rounded-md border transition-all ${
              currencyFilterActive
                ? "bg-white/[0.10] border-white/[0.22] text-white"
                : "bg-white/[0.04] border-white/[0.09] text-white/50 hover:text-white/80"
            }`}
          >
            {currencyFilterActive ? `${selectedCurrencies!.size} currencies` : "All currencies"}
            <ChevronDown className={`w-3 h-3 transition-transform ${currencyMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {currencyMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setCurrencyMenuOpen(false)} />
              <div className="absolute top-full left-0 mt-1 z-40 w-56 max-h-72 overflow-y-auto bg-black/92 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl p-2">
                <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-white/[0.06]">
                  <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider">Currencies</span>
                  <button
                    onClick={() => setSelectedCurrencies(new Set(availableCurrencies))}
                    className="text-[9px] font-bold text-white/40 hover:text-white/80"
                  >
                    Select all
                  </button>
                </div>
                {availableCurrencies.map((code) => {
                  const active = !selectedCurrencies || selectedCurrencies.has(code);
                  return (
                    <label
                      key={code}
                      className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-white/[0.05] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleCurrency(code)}
                        className="accent-emerald-500"
                      />
                      <span className="text-[11px] font-mono text-white/70">{code}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Search */}
        <div className="relative shrink-0 ml-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            className="w-28 sm:w-40 bg-white/[0.04] border border-white/[0.09] text-white/70 text-[10px] rounded-md pl-6 pr-6 py-1.5 focus:outline-none focus:border-white/[0.28] transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Next event + refresh */}
        {nextEvent && (
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] font-mono text-white/40 shrink-0">
            <span className="text-white/25">Next:</span>
            <span className="text-white/60">[{nextEvent.country}] {nextEvent.title}</span>
            <span className="text-emerald-400/80">{formatRelative(new Date(nextEvent.date).getTime() - now)}</span>
          </div>
        )}
        {fetchedAt && (
          <span className="hidden md:inline text-[9px] font-mono text-white/20 shrink-0">
            updated {formatRelative(fetchedAt - now).replace("ago", "ago").replace("in ", "")}
          </span>
        )}
        <button
          onClick={load}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-md bg-white/[0.07] border border-white/[0.12] text-white/70 hover:text-white hover:bg-white/[0.12] hover:border-white/[0.22] disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0 whitespace-nowrap"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-3 h-3 shrink-0 ${isLoading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{isLoading ? "Loading…" : "Refresh"}</span>
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="shrink-0 bg-red-950/25 border-b border-red-900/20 px-4 py-2 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!isLoading && !error && groups.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/20">
          <CalendarClock className="w-16 h-16 opacity-20" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white/30">No events match your filters</p>
            <p className="text-xs mt-1 text-white/15">Try enabling more impact levels or currencies</p>
          </div>
        </div>
      )}

      {/* ── Calendar body ── */}
      {groups.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-4 py-4">
            {groups.map(({ date, items }) => {
              const today = isSameDay(date, new Date());
              return (
                <div key={dayKey(date)} ref={today ? todayRef : undefined} className="mb-5">
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-[#0f0f0f]/95 backdrop-blur-sm py-1.5 z-10">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${today ? "text-emerald-400" : "text-white/50"}`}>
                      {date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </span>
                    {today && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Today
                      </span>
                    )}
                    <span className="text-[9px] text-white/20 font-mono">{items.length} events</span>
                    <div className="flex-1 border-t border-white/[0.06]" />
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
                    {items.map((ev, i) => {
                      const t = new Date(ev.date);
                      const impact = normalizeImpact(ev.impact);
                      const style = IMPACT_STYLE[impact];
                      const isPast = t.getTime() < now;
                      const actualNum = parseNumeric(ev.actual);
                      const forecastNum = parseNumeric(ev.forecast);
                      const actualColor =
                        actualNum != null && forecastNum != null
                          ? actualNum > forecastNum ? "text-emerald-400" : actualNum < forecastNum ? "text-red-400" : "text-white/70"
                          : "text-white/70";
                      return (
                        <div
                          key={`${ev.title}-${ev.country}-${ev.date}-${i}`}
                          className={`px-3 py-2 text-[11px] border-t border-white/[0.04] first:border-t-0 transition-colors hover:bg-white/[0.03] ${
                            isPast ? "opacity-50" : ""
                          } ${ev === nextEvent ? "bg-emerald-500/[0.04]" : ""}`}
                        >
                          {/* md+ : single-row grid */}
                          <div className="hidden md:grid grid-cols-[64px_52px_84px_minmax(0,1fr)_76px_76px_76px] items-center gap-2">
                            <span className="font-mono text-white/45">
                              {t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="font-mono font-bold text-white/60">{ev.country}</span>
                            <span className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                              <span className={`text-[9px] font-bold uppercase ${style.text}`}>{impact}</span>
                            </span>
                            <span className="text-white/80 truncate" title={ev.title}>{ev.title}</span>
                            <span className="font-mono text-white/35 text-right">{ev.previous || "—"}</span>
                            <span className="font-mono text-white/45 text-right">{ev.forecast || "—"}</span>
                            <span className={`font-mono font-bold text-right ${actualColor}`}>{ev.actual || "—"}</span>
                          </div>
                          {/* mobile: two-line stacked layout so the event name is never squeezed out */}
                          <div className="md:hidden flex flex-col gap-1">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="font-mono text-white/45 shrink-0">
                                {t.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="font-mono font-bold text-white/60 shrink-0">{ev.country}</span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                                <span className={`text-[9px] font-bold uppercase ${style.text}`}>{impact}</span>
                              </span>
                              <span className="flex-1" />
                              <span className={`font-mono font-bold shrink-0 ${actualColor}`}>{ev.actual || "—"}</span>
                            </div>
                            <p className="text-white/80 text-[12px] leading-snug">{ev.title}</p>
                            {(ev.previous || ev.forecast) && (
                              <div className="flex items-center gap-3 font-mono text-[10px] text-white/35">
                                {ev.previous && <span>Prev {ev.previous}</span>}
                                {ev.forecast && <span>Fcst {ev.forecast}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center pb-6 text-[9px] text-white/15 font-mono">
            Showing this week (Mon–Sun) · community ForexFactory-mirror feed · times in your local timezone
          </div>
        </div>
      )}
    </div>
  );
}
