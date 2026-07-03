import type { CalendarEvent, ScoredItem } from "./types";
import { scoreArticle } from "./scoring";

// ─── Economic calendar — the single strongest predictor of forex/gold moves ───
// Real economic data releases (NFP, CPI, GDP, PMI, Fed rate decisions) with
// forecast vs previous numbers are what actually moves markets — far more
// reliably than headline sentiment from blog-style RSS feeds. This is the
// public JSON mirror that powers many ForexFactory-calendar-style widgets.

const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

// Currency code → instruments it primarily drives (for cross-referencing)
export const CURRENCY_TO_SYMBOLS: Record<string, string[]> = {
  USD: ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD", "BTCUSD", "BTCUSDT", "ETHUSD"],
  EUR: ["EURUSD"],
  GBP: ["GBPUSD"],
  JPY: ["USDJPY"],
  CHF: ["USDCHF"],
  CAD: ["USDCAD"],
  AUD: ["AUDUSD"],
  NZD: ["NZDUSD"],
  CNY: ["XAUUSD", "AUDUSD"], // China data ripples through gold + AUD (China proxy)
};

export async function fetchEconomicCalendar(timeoutMs = 6000): Promise<CalendarEvent[]> {
  try {
    const res = await fetch(CALENDAR_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StratixNewsBot/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as CalendarEvent[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function formatEventTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }) + " UTC";
  } catch {
    return iso;
  }
}

/**
 * Converts high/medium-impact calendar events within the relevance window
 * into fully-scored article-shaped items the rest of the pipeline can dedupe,
 * sort and render identically to RSS/X items — scoring happens right here so
 * callers never have to re-match events back to their impact level.
 *
 * Window: events released in the last 12h (so "actual vs forecast" outcomes
 * are still fresh) through the next 48h (so upcoming volatility is visible).
 *
 * @param currencyFilter optional — restrict to these currency codes (e.g. for
 *   a symbol-specific request). Omit for the "ALL instruments" view.
 */
export function calendarEventsToArticles(events: CalendarEvent[], currencyFilter?: string[]): ScoredItem[] {
  const now = Date.now();
  const windowPastMs = 12 * 60 * 60 * 1000;
  const windowFutureMs = 48 * 60 * 60 * 1000;

  const items: ScoredItem[] = [];

  for (const ev of events) {
    if (ev.impact !== "High" && ev.impact !== "Medium") continue; // Low/Holiday = noise for this purpose
    if (currencyFilter && !currencyFilter.includes(ev.country)) continue;
    if (!ev.date) continue;

    const t = new Date(ev.date).getTime();
    if (isNaN(t)) continue;
    const diff = t - now;
    if (diff < -windowPastMs || diff > windowFutureMs) continue;

    const isPast = diff <= 0;
    const hasActual = !!ev.actual;
    const timeLabel = formatEventTime(ev.date);

    let description: string;
    if (hasActual) {
      description = `ACTUAL: ${ev.actual} | Forecast: ${ev.forecast || "n/a"} | Previous: ${ev.previous || "n/a"} — released ${timeLabel}`;
    } else if (isPast) {
      description = `Forecast: ${ev.forecast || "n/a"} | Previous: ${ev.previous || "n/a"} — released ${timeLabel} (actual pending)`;
    } else {
      const hoursAway = Math.round(diff / (60 * 60 * 1000));
      description = `UPCOMING in ~${hoursAway}h — Forecast: ${ev.forecast || "n/a"} | Previous: ${ev.previous || "n/a"} — scheduled ${timeLabel}`;
    }

    const title = `[${ev.country}] ${ev.title}`;
    const { score, breakdown } = scoreArticle(title, description, ev.date, {
      isCalendarEvent: true,
      calendarImpact: ev.impact,
    });

    items.push({
      title,
      link: `calendar://${ev.country}-${ev.title}-${ev.date}`.replace(/\s+/g, "-"),
      pubDate: ev.date,
      source: "Economic Calendar",
      description,
      feedCategory: "Economic Data",
      impactScore: score,
      scoreBreakdown: breakdown,
      isCalendarEvent: true,
    });
  }

  return items;
}
