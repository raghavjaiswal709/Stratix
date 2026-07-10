"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAppContext } from "@/lib/context";

// The overlay (framer-motion choreography + HFT canvas + 300+ quotes) is a
// separate lazy chunk — it only downloads in the sessions where the modal
// actually shows (once per 30 minutes), keeping it out of the dashboard's
// critical bundle.
const QuoteOverlay = dynamic(
  () => import("./quote-overlay").then((m) => m.QuoteOverlay),
  { ssr: false }
);

const LAST_SHOWN_KEY = "last_quote_shown_time";
const THIRTY_MINUTES = 30 * 60 * 1000;

export function TradingQuotesModal() {
  const [show, setShow] = useState(false);
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
    setShow(true);
  }, [preferences?.showQuotes]);

  if (!show) return null;

  return <QuoteOverlay onClose={() => setShow(false)} />;
}
