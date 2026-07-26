"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAppContext } from "@/lib/context";
import { cachedFetch, peekApiCache } from "@/lib/api-cache";
import { TRADING_QUOTES, type Quote } from "./quotes-data";

// The overlay (framer-motion choreography + HFT canvas) is a separate lazy
// chunk — it only downloads in the sessions where the modal actually shows
// (once per 30 minutes), keeping it out of the dashboard's critical bundle.
const QuoteOverlay = dynamic(
  () => import("./quote-overlay").then((m) => m.QuoteOverlay),
  { ssr: false }
);

const LAST_SHOWN_KEY = "last_quote_shown_time";
const THIRTY_MINUTES = 30 * 60 * 1000;
const QUOTES_URL = "/api/quotes";

export function TradingQuotesModal() {
  const [show, setShow] = useState(false);
  // Admin-managed quotes (see /admin/quotes) — seeded instantly from any
  // cached copy (however old), so deciding what to show never waits on a
  // network round-trip. A background cachedFetch below keeps it current;
  // falls back to the bundled curated list if there's no cache yet.
  const [quotes, setQuotes] = useState<Quote[]>(
    () => peekApiCache<{ quotes: Quote[] }>(QUOTES_URL, { persist: true, allowStale: true })?.quotes ?? TRADING_QUOTES
  );
  const { preferences } = useAppContext();

  useEffect(() => {
    if (preferences?.showQuotes === false) {
      setShow(false);
      return;
    }

    const now = Date.now();
    const lastShown = localStorage.getItem(LAST_SHOWN_KEY);
    if (lastShown && now - parseInt(lastShown, 10) < THIRTY_MINUTES) {
      return;
    }

    // Save immediately when showing so navigation doesn't re-trigger it.
    localStorage.setItem(LAST_SHOWN_KEY, now.toString());

    // Show right away with whatever quotes we already have (cache or bundled
    // fallback) — the overlay's appearance should never be gated on network
    // latency. This fetch just keeps the list current for next time.
    setShow(true);

    cachedFetch<{ quotes: Quote[] }>(QUOTES_URL, { ttlMs: THIRTY_MINUTES, persist: true })
      .then((data) => {
        if (Array.isArray(data.quotes) && data.quotes.length > 0) setQuotes(data.quotes);
      })
      .catch(() => {});
  }, [preferences?.showQuotes]);

  if (!show) return null;

  return <QuoteOverlay quotes={quotes} onClose={() => setShow(false)} />;
}
