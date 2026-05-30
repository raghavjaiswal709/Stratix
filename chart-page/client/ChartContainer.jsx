import React, { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import { formatPrice } from "./formatPrice.js";
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateLatestIndicatorValue
} from "./indicators.js";

export function ChartContainer({
  instrument,
  timeframe,
  closedCandles,
  currentCandle,
  seriesType,
  activeIndicators,
  fitTrigger,
  isSwitching
}) {
  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  
  const chartRef = useRef(null);
  const mainSeriesRef = useRef(null);
  const volSeriesRef = useRef(null);

  // Indicators series refs
  const sma20Ref = useRef(null);
  const sma50Ref = useRef(null);
  const sma200Ref = useRef(null);
  const ema9Ref = useRef(null);
  const ema21Ref = useRef(null);
  const bbUpperRef = useRef(null);
  const bbMiddleRef = useRef(null);
  const bbLowerRef = useRef(null);

  // Keep a ref of candles and indicators states for real-time tickers access
  const closedCandlesRef = useRef([]);
  useEffect(() => {
    closedCandlesRef.current = closedCandles;
  }, [closedCandles]);

  // ── 1. Create Chart Canvas on mount ─────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || isSwitching) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight || 450,
      layout: {
        background: { color: "#0f0f0f" },
        textColor: "#d1d4dc",
        fontFamily: "JetBrains Mono, monospace, sans-serif",
      },
      grid: {
        vertLines: { color: "#1e1e1e" },
        horzLines: { color: "#1e1e1e" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#2a2a2a" },
      timeScale: {
        borderColor: "#2a2a2a",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    // Custom tooltips div creation
    const tooltip = document.createElement("div");
    tooltip.className = "absolute hidden pointer-events-none z-30 bg-[#161616]/95 border border-[#2a2a2a] rounded-lg px-3 py-2 text-[10px] text-zinc-300 font-mono shadow-2xl leading-relaxed whitespace-nowrap text-left";
    el.style.position = "relative";
    el.appendChild(tooltip);
    tooltipRef.current = tooltip;

    // Crosshair tooltips listener
    chart.subscribeCrosshairMove((param) => {
      const tool = tooltipRef.current;
      const main = mainSeriesRef.current;
      const vol = volSeriesRef.current;

      if (!tool || !main) return;

      if (
        !param.point ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0 ||
        param.point.x > el.clientWidth ||
        param.point.y > el.clientHeight
      ) {
        tool.style.display = "none";
        return;
      }

      const candleData = param.seriesData.get(main);
      const volData = vol ? param.seriesData.get(vol) : null;

      if (!candleData) {
        tool.style.display = "none";
        return;
      }

      const date = new Date((param.time) * 1000);
      const formattedDate = date.toISOString().replace("T", " ").slice(0, 19);

      // Parse OHLC depending on Line/Area vs Candlestick format
      let o, h, l, c;
      if (candleData.open !== undefined) {
        o = formatPrice(instrument, candleData.open);
        h = formatPrice(instrument, candleData.high);
        l = formatPrice(instrument, candleData.low);
        c = formatPrice(instrument, candleData.close);
      } else {
        const val = candleData.value ?? candleData.close ?? 0;
        o = h = l = c = formatPrice(instrument, val);
      }

      const v = volData ? (volData.value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0";

      tool.style.display = "block";
      tool.innerHTML = `
        <div class="flex items-center gap-4">
          <span>O: <b class="text-zinc-50 font-bold">${o}</b></span>
          <span>H: <b class="text-emerald-400 font-bold">${h}</b></span>
          <span>L: <b class="text-rose-500 font-bold">${l}</b></span>
          <span>C: <b class="text-zinc-50 font-bold">${c}</b></span>
          <span>V: <b class="text-[#F0B90B] font-bold">${v}</b></span>
        </div>
        <div class="text-[8px] font-semibold text-zinc-500 mt-1 uppercase tracking-widest">[ ${formattedDate} UTC ]</div>
      `;

      // Position tooltip in left/right top quadrants based on crosshair point
      const tooltipWidth = tool.offsetWidth || 300;
      let left = param.point.x + 15;
      if (left + tooltipWidth > el.clientWidth) {
        left = param.point.x - tooltipWidth - 15;
      }
      tool.style.left = `${left}px`;
      tool.style.top = `${param.point.y + 15}px`;
    });

    // Auto resize chart
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0 && el.clientHeight > 0) {
        chart.resize(el.clientWidth, el.clientHeight);
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volSeriesRef.current = null;
      tooltipRef.current = null;
      try {
        chart.remove();
      } catch {
        // disposed
      }
    };
  }, [instrument, isSwitching]);

  // ── 2. Handle series creation / updates on type / indicators toggling ──────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || closedCandles.length === 0 || isSwitching) return;

    // Clean up previous main series
    if (mainSeriesRef.current) {
      try {
        chart.removeSeries(mainSeriesRef.current);
      } catch { /* already removed */ }
      mainSeriesRef.current = null;
    }
    // Clean up volume series
    if (volSeriesRef.current) {
      try {
        chart.removeSeries(volSeriesRef.current);
      } catch { /* already removed */ }
      volSeriesRef.current = null;
    }

    // A. Recreate Main price series overlay
    if (seriesType === "Candles") {
      mainSeriesRef.current = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderUpColor: "#26a69a",
        borderDownColor: "#ef5350",
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        priceFormat: { type: "custom", formatter: (p) => formatPrice(instrument, p) }
      });
    } else if (seriesType === "Line") {
      mainSeriesRef.current = chart.addLineSeries({
        color: "#F0B90B",
        lineWidth: 2,
        priceFormat: { type: "custom", formatter: (p) => formatPrice(instrument, p) }
      });
    } else {
      // Area graph
      mainSeriesRef.current = chart.addAreaSeries({
        lineColor: "#F0B90B",
        topColor: "rgba(240, 185, 11, 0.2)",
        bottomColor: "rgba(240, 185, 11, 0.0)",
        lineWidth: 2,
        priceFormat: { type: "custom", formatter: (p) => formatPrice(instrument, p) }
      });
    }

    // Set closed candles base data
    const mainData = closedCandles.map((c) => {
      if (seriesType === "Candles") {
        return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
      }
      return { time: c.time, value: c.close };
    });
    mainSeriesRef.current.setData(mainData);

    // B. Recreate Volume histogram panel at the bottom
    if (activeIndicators.volume) {
      volSeriesRef.current = chart.addHistogramSeries({
        priceScaleId: "volume",
        priceFormat: { type: "volume" }
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 }
      });

      const volData = closedCandles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(38, 166, 154, 0.28)" : "rgba(239, 83, 80, 0.28)"
      }));
      volSeriesRef.current.setData(volData);
    }

    // C. Recreate active indicator line overlays
    const rebuildLineIndicator = (ref, isEnabled, data, color) => {
      if (ref.current) {
        try { chart.removeSeries(ref.current); } catch { /* cleared */ }
        ref.current = null;
      }
      if (isEnabled && data.length > 0) {
        ref.current = chart.addLineSeries({
          color,
          lineWidth: 1.5,
          priceLineVisible: false,
          crosshairMarkerVisible: false
        });
        ref.current.setData(data);
      }
    };

    rebuildLineIndicator(sma20Ref, activeIndicators.sma20, calculateSMA(closedCandles, 20), "#2196F3");
    rebuildLineIndicator(sma50Ref, activeIndicators.sma50, calculateSMA(closedCandles, 50), "#FF9800");
    rebuildLineIndicator(sma200Ref, activeIndicators.sma200, calculateSMA(closedCandles, 200), "#E91E63");
    rebuildLineIndicator(ema9Ref, activeIndicators.ema9, calculateEMA(closedCandles, 9), "#00BCD4");
    rebuildLineIndicator(ema21Ref, activeIndicators.ema21, calculateEMA(closedCandles, 21), "#9C27B0");

    // Recreate Bollinger Bands overlays
    const rebuildBands = () => {
      if (bbUpperRef.current) {
        try { chart.removeSeries(bbUpperRef.current); chart.removeSeries(bbMiddleRef.current); chart.removeSeries(bbLowerRef.current); } catch { /* cleared */ }
        bbUpperRef.current = null;
        bbMiddleRef.current = null;
        bbLowerRef.current = null;
      }
      if (activeIndicators.bb) {
        const bands = calculateBollingerBands(closedCandles, 20, 2);
        if (bands.upper.length > 0) {
          const config = { color: "rgba(33, 150, 243, 0.35)", lineWidth: 1.2, priceLineVisible: false, crosshairMarkerVisible: false };
          bbUpperRef.current = chart.addLineSeries(config);
          bbMiddleRef.current = chart.addLineSeries({ ...config, color: "rgba(33, 150, 243, 0.2)", lineStyle: 2 });
          bbLowerRef.current = chart.addLineSeries(config);

          bbUpperRef.current.setData(bands.upper);
          bbMiddleRef.current.setData(bands.middle);
          bbLowerRef.current.setData(bands.lower);
        }
      }
    };
    rebuildBands();

    chart.timeScale().fitContent();

  }, [closedCandles, seriesType, activeIndicators, instrument, isSwitching]);

  // ── 3. Handle live currentCandle ticking updates ────────────────────────────
  useEffect(() => {
    const main = mainSeriesRef.current;
    if (!main || !currentCandle || isSwitching) return;

    // A. Update Main series tick
    if (seriesType === "Candles") {
      main.update({
        time: currentCandle.time,
        open: currentCandle.open,
        high: currentCandle.high,
        low: currentCandle.low,
        close: currentCandle.close
      });
    } else {
      main.update({
        time: currentCandle.time,
        value: currentCandle.close
      });
    }

    // B. Update Volume Series tick
    if (volSeriesRef.current && activeIndicators.volume) {
      volSeriesRef.current.update({
        time: currentCandle.time,
        value: currentCandle.volume,
        color: currentCandle.close >= currentCandle.open ? "rgba(38, 166, 154, 0.28)" : "rgba(239, 83, 80, 0.28)"
      });
    }

    // C. Update Indicator series overlay ticks dynamically
    const updateLineIndicator = (ref, isEnabled, type, period, extraParam) => {
      if (ref.current && isEnabled) {
        const val = calculateLatestIndicatorValue(closedCandlesRef.current, currentCandle, type, period, extraParam);
        if (val) ref.current.update(val);
      }
    };

    updateLineIndicator(sma20Ref, activeIndicators.sma20, "SMA", 20);
    updateLineIndicator(sma50Ref, activeIndicators.sma50, "SMA", 50);
    updateLineIndicator(sma200Ref, activeIndicators.sma200, "SMA", 200);

    // EMA EMA needs context of previous candle's resolved EMA to calculate decay multiplier
    const getPrevIndicatorValue = (dataList) => {
      if (!dataList || dataList.length === 0) return null;
      return dataList[dataList.length - 1].value;
    };
    const prevEma9 = ema9Ref.current && activeIndicators.ema9 ? getPrevIndicatorValue(calculateEMA(closedCandlesRef.current, 9)) : null;
    const prevEma21 = ema21Ref.current && activeIndicators.ema21 ? getPrevIndicatorValue(calculateEMA(closedCandlesRef.current, 21)) : null;

    updateLineIndicator(ema9Ref, activeIndicators.ema9, "EMA", 9, prevEma9);
    updateLineIndicator(ema21Ref, activeIndicators.ema21, "EMA", 21, prevEma21);

    // Update Bollinger Bands ticks
    if (bbUpperRef.current && bbMiddleRef.current && bbLowerRef.current && activeIndicators.bb) {
      const bandsVal = calculateLatestIndicatorValue(closedCandlesRef.current, currentCandle, "BB", 20, 2);
      if (bandsVal) {
        bbUpperRef.current.update({ time: currentCandle.time, value: bandsVal.upper });
        bbMiddleRef.current.update({ time: currentCandle.time, value: bandsVal.middle });
        bbLowerRef.current.update({ time: currentCandle.time, value: bandsVal.lower });
      }
    }

  }, [currentCandle, seriesType, activeIndicators, isSwitching]);

  // ── 4. Handle timeScale Auto-fit triggers ──────────────────────────────────
  useEffect(() => {
    if (chartRef.current && fitTrigger > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [fitTrigger]);

  return (
    <div className="relative w-full h-full flex flex-col flex-1 min-h-0 bg-[#0f0f0f]">
      {isSwitching && (
        <div className="absolute inset-0 bg-[#0f0f0f]/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-40 transition-opacity">
          <div className="h-5 w-5 rounded-full border-2 border-[#F0B90B] border-t-transparent animate-spin mb-3" />
          <span className="text-[10px] font-black text-[#F0B90B] uppercase tracking-widest leading-none">
            Halting previous symbol stream...
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full min-h-[350px] flex-1 relative" />
    </div>
  );
}
