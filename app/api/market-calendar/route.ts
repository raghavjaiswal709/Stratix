import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchEconomicCalendar } from "@/lib/news/calendar";
import type { CalendarEvent } from "@/lib/news/types";

export const runtime = "nodejs";

// The upstream feed (nfs.faireconomy.media) only refreshes forecast/actual
// numbers a handful of times a day, so there's no reason to hit it on every
// page load or filter click — cache in memory for a few minutes.
const CACHE_TTL_MS = 3 * 60 * 1000;
let cache: { events: CalendarEvent[]; fetchedAt: number } | null = null;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache);
  }

  const events = await fetchEconomicCalendar();
  if (events.length === 0) {
    // Upstream hiccup — serve the last good snapshot instead of an empty calendar.
    if (cache) return NextResponse.json(cache);
    return NextResponse.json({ error: "Economic calendar feed unavailable — try again shortly." }, { status: 502 });
  }

  cache = { events, fetchedAt: Date.now() };
  return NextResponse.json(cache);
}
