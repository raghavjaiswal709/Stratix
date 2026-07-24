"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAppContext } from "@/lib/context";
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

export function TradingQuotesModal() {
  const [show, setShow] = useState(false);
  // Admin-managed quotes (see /admin/quotes) — fetched fresh each time the
  // overlay is about to show, falling back to the bundled curated list if
  // the request fails so a network hiccup never breaks the experience.
  const [quotes, setQuotes] = useState<Quote[]>(TRADING_QUOTES);
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

    fetch("/api/quotes")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data.quotes) && data.quotes.length > 0) setQuotes(data.quotes);
      })
      .catch(() => {})
      .finally(() => setShow(true));
  }, [preferences?.showQuotes]);

  if (!show) return null;

  return <QuoteOverlay quotes={quotes} onClose={() => setShow(false)} />;
}
