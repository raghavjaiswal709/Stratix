import { useState, useEffect } from "react";
import { pollingEngine } from "./pollingEngine.js";

/**
 * React hook to subscribe to real-time prices for a specific instrument
 * @param {string} instrumentId 
 * @returns {object|null} { bid, ask, mid, spread, change, changePercent, direction, isStale, ticks, timestamp }
 */
export function useInstrumentPrice(instrumentId) {
  const [priceState, setPriceState] = useState(() => {
    return pollingEngine.getState(instrumentId);
  });

  useEffect(() => {
    if (!instrumentId) return;

    const unsubscribe = pollingEngine.subscribe(instrumentId, (latestState) => {
      setPriceState(latestState);
    });

    return () => {
      unsubscribe();
    };
  }, [instrumentId]);

  return priceState;
}
