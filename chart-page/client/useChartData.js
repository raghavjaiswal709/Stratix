import { useState, useEffect, useRef, useCallback } from "react";
import { useCandleStream } from "./useCandleStream.js";

/**
 * Custom React hook to orchestrate data loading, server-side resets, and live tick streams.
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
  const [renderTick, setRenderTick] = useState(0);

  // Poll current live candle every 1s
  const pollTick = useCallback(async () => {
    try {
      const res = await fetch(`/api/chart-tick?instrument=${instrument}&timeframe=${timeframe}`);
      if (!res.ok) throw new Error("HTTP error");
      
      const data = await res.json();
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
    setIsLoading(true);
    stopStream();
    
    try {
      // 1. Reset server session completely
      await fetch("/api/chart-session", { method: "DELETE" });

      // 2. Fetch last 200 closed candles
      const candlesRes = await fetch(`/api/chart-candles?instrument=${instrument}&timeframe=${timeframe}`);
      if (!candlesRes.ok) throw new Error("Failed to load historical candles");
      const candlesData = await candlesRes.json();
      
      setClosedCandles(candlesData.closedCandles || []);

      // 3. Fetch initial ticking candle
      const tickRes = await fetch(`/api/chart-tick?instrument=${instrument}&timeframe=${timeframe}`);
      if (tickRes.ok) {
        const tickData = await tickRes.json();
        if (tickData.currentCandle) {
          setCurrentCandle(tickData.currentCandle);
        } else {
          setCurrentCandle(null);
        }
      }
      
      lastPollTimeRef.current = Date.now();
      setFeedStatus("live");
      setIsLoading(false);

      // 4. Kickoff 1s live poll
      startStream();
    } catch (err) {
      console.error("[useChartData] Initialization failed:", err);
      setClosedCandles([]);
      setCurrentCandle(null);
      setIsLoading(false);
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
