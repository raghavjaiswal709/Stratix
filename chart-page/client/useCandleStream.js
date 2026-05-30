import { useEffect, useRef, useCallback } from "react";

/**
 * Custom React hook to orchestrate 1-second polling loops safely.
 * Solves React's stale closure problems by binding interval callback to a mutable ref.
 * @param {Function} pollCallback Action called every second
 * @param {number} intervalMs Default 1000ms
 * @returns {object} { startStream, stopStream }
 */
export function useCandleStream(pollCallback, intervalMs = 1000) {
  const pollCallbackRef = useRef(pollCallback);
  const intervalRef = useRef(null);

  // Sync ref with the latest callback closure on every render
  useEffect(() => {
    pollCallbackRef.current = pollCallback;
  }, [pollCallback]);

  // Handle unmount component safety: stop active interval immediately
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const stopStream = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startStream = useCallback(() => {
    stopStream();
    
    // Immediate execution
    if (pollCallbackRef.current) {
      pollCallbackRef.current();
    }

    intervalRef.current = setInterval(() => {
      if (pollCallbackRef.current) {
        pollCallbackRef.current();
      }
    }, intervalMs);
  }, [intervalMs, stopStream]);

  return { startStream, stopStream };
}
