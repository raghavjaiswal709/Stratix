import { useState, useEffect, useRef, useCallback } from "react";
import { useCandleStream } from "./useCandleStream.js";

/**
 * Custom React hook to orchestrate data loading, server-side multi-session queries, and live tick streams.
 * Prevents race conditions and data leaks across symbol changes using async request ID cancellation.
 * @param {string} instrument Active instrument key (e.g. 'xauusd')
 * @param {string} timeframe Active timeframe key (e.g. '1m')
 * @returns {object} { closedCandles, currentCandle, isLoading, feedStatus, refetch }
 */
export function useChartData(instrument, timeframe) {
  const [closedCandles, setClosedCandles] = useState([]);
  const [currentCandle, setCurrentCandle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedStatus, setFeedStatus] = useState("live");
  
  const lastPollTimeRef = useRef(Date.now());
  const activeRequestRef = useRef(0);
  const [renderTick, setRenderTick] = useState(0);

  // Poll current live candle every 1s
  const pollTick = useCallback(async () => {
    const requestId = activeRequestRef.current;
    
    try {
      const res = await fetch(`/api/chart-tick?instrument=${instrument}&timeframe=${timeframe}`);
      if (requestId !== activeRequestRef.current) return; // Stale request, switched symbol, abort!
      
      if (!res.ok) throw new Error("HTTP error");
      
      const data = await res.json();
      if (requestId !== activeRequestRef.current) return; // Stale request, switched symbol, abort!
      
      if (data.currentCandle) {
        setCurrentCandle(data.currentCandle);
        lastPollTimeRef.current = Date.now();
        setFeedStatus("live");
      }
    } catch (err) {
      console.warn("[useChartData] Tick poll error:", err.message);
    }
  }, [instrument, timeframe]);

  const { startStream, stopStream } = useCandleStream(pollTick, 1000);

  const initData = useCallback(async () => {
    const requestId = ++activeRequestRef.current;
    
    setIsLoading(true);
    stopStream();
    
    // Clear old data states immediately on switch to prevent leaks and old candles flashing
    setClosedCandles([]);
    setCurrentCandle(null);
    
    try {
      // 1. Fetch last 200 closed candles (concurrency-safe on server)
      const candlesRes = await fetch(`/api/chart-candles?instrument=${instrument}&timeframe=${timeframe}`);
      if (requestId !== activeRequestRef.current) return; // Switched symbol in parallel, abort!
      
      if (!candlesRes.ok) throw new Error("Failed to load historical candles");
      const candlesData = await candlesRes.json();
      
      if (requestId !== activeRequestRef.current) return; // Switched symbol in parallel, abort!
      setClosedCandles(candlesData.closedCandles || []);

      // 2. Fetch initial ticking candle
      const tickRes = await fetch(`/api/chart-tick?instrument=${instrument}&timeframe=${timeframe}`);
      if (requestId !== activeRequestRef.current) return; // Switched symbol in parallel, abort!
      
      if (tickRes.ok) {
        const tickData = await tickRes.json();
        if (requestId !== activeRequestRef.current) return;
        
        if (tickData.currentCandle) {
          setCurrentCandle(tickData.currentCandle);
        }
      }
      
      lastPollTimeRef.current = Date.now();
      setFeedStatus("live");
      setIsLoading(false);

      // 3. Kickoff 1s live poll
      startStream();
    } catch (err) {
      if (requestId === activeRequestRef.current) {
        console.error("[useChartData] Initialization failed:", err);
        setClosedCandles([]);
        setCurrentCandle(null);
        setIsLoading(false);
      }
    }
  }, [instrument, timeframe, startStream, stopStream]);

  // Handle instrument/timeframe switches
  useEffect(() => {
    initData();
    
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, timeframe]);

  // Monitor feed stale status (stale if last poll succeeded > 5 seconds ago)
  useEffect(() => {
    const monitor = setInterval(() => {
      const secondsSinceLastPoll = (Date.now() - lastPollTimeRef.current) / 1000;
      if (secondsSinceLastPoll > 5) {
        setFeedStatus("stale");
      } else {
        setFeedStatus("live");
      }
      // Force trigger state updates for hooks listening to timing changes
      setRenderTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(monitor);
  }, []);

  return {
    closedCandles,
    currentCandle,
    isLoading,
    feedStatus,
    refetch: initData
  };
}
