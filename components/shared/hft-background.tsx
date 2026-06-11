"use client";

import { useEffect, useRef } from "react";

interface TradeFeedItem {
  id: number;
  time: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: string;
  size: string;
  y: number;
  opacity: number;
}

interface RoutingLogItem {
  id: number;
  text: string;
  y: number;
  opacity: number;
}

interface OrderBookRow {
  price: string;
  size: number;
  type: "bid" | "ask";
}

interface TickerSymbol {
  name: string;
  price: number;
  change: number;
  isUp: boolean;
}

export function HftBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = 0;
    let height = 0;

    // Responsive sizing
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    // Ticker Tape Setup (Marquee at the top)
    const tickers: TickerSymbol[] = [
      { name: "EURUSD", price: 1.08920, change: 0.12, isUp: true },
      { name: "GBPUSD", price: 1.27430, change: -0.05, isUp: false },
      { name: "USDJPY", price: 156.42, change: 0.28, isUp: true },
      { name: "XAUUSD", price: 2354.12, change: 0.81, isUp: true },
      { name: "BTCUSD", price: 68579.9, change: 1.45, isUp: true },
      { name: "ETHUSD", price: 3745.25, change: -0.92, isUp: false },
      { name: "AUDUSD", price: 0.6652, change: 0.18, isUp: true },
      { name: "USDCAD", price: 1.3685, change: -0.11, isUp: false }
    ];
    let tickerScrollX = 0;

    // Grid coordinates
    const gridSpacing = 80;

    // Trade feed generator setup
    const symbols = ["EURUSD", "GBPUSD", "XAUUSD", "BTCUSD", "US30", "NAS100"];
    let trades: TradeFeedItem[] = [];
    let tradeIdCounter = 0;

    // Routing Log Feed Setup (Technical websocket messages)
    let routingLogs: RoutingLogItem[] = [];
    let logIdCounter = 0;
    const logTemplates = [
      "ROUTE ORDER {sym} -> LMAX [OK]",
      "ROUTE ORDER {sym} -> FXCM [OK]",
      "WS TICK DATA DISPATCH (128b)",
      "WS DEPTH STREAM DELTA UPDATE",
      "SPREAD CONTRACTED // {sym}",
      "VOLATILITY JOLT DETECTED",
      "MATCHING_ENGINE FLUSH CACHE",
      "AUTO_CLOSE SL TRIGGERED",
      "REBALANCE PORTFOLIO SHIELD",
      "LIQUIDITY PROVIDER SYNCRONIZED",
      "PING TIME: 0.421ms (LD4 -> NY4)"
    ];

    // Order book data setup
    let orderBook: OrderBookRow[] = [];
    const initOrderBook = () => {
      orderBook = [];
      // Asks (Sells)
      for (let i = 0; i < 15; i++) {
        const p = (1.08500 + i * 0.0001).toFixed(5);
        orderBook.push({ price: p, size: Math.random() * 80 + 10, type: "ask" });
      }
      // Bids (Buys)
      for (let i = 0; i < 15; i++) {
        const p = (1.08450 - i * 0.0001).toFixed(5);
        orderBook.push({ price: p, size: Math.random() * 80 + 10, type: "bid" });
      }
    };
    initOrderBook();

    // Multi-Chart Ticks Setup (3 charts)
    const maxWavePoints = 50;
    let xauWave: number[] = [];
    let eurWave: number[] = [];
    let btcWave: number[] = [];

    const initWave = (arr: number[]) => {
      let val = 0.5;
      for (let i = 0; i < maxWavePoints; i++) {
        val += (Math.random() - 0.5) * 0.12;
        if (val < 0.15) val = 0.15;
        if (val > 0.85) val = 0.85;
        arr.push(val);
      }
    };
    initWave(xauWave);
    initWave(eurWave);
    initWave(btcWave);

    const updateWave = (arr: number[]) => {
      let lastVal = arr[arr.length - 1];
      lastVal += (Math.random() - 0.5) * 0.14;
      if (lastVal < 0.1) lastVal = 0.1;
      if (lastVal > 0.9) lastVal = 0.9;
      arr.push(lastVal);
      if (arr.length > maxWavePoints) {
        arr.shift();
      }
    };

    // Performance throttled updates
    let lastUpdate = 0;
    const updateInterval = 40; // 25 updates per second

    // Animation Loop
    const draw = (timestamp: number) => {
      ctx.clearRect(0, 0, width, height);

      // --- Draw Grid Background ---
      ctx.strokeStyle = "rgba(16, 185, 129, 0.025)";
      ctx.lineWidth = 1;
      
      const offsetX = (timestamp * 0.015) % gridSpacing;
      const offsetY = (timestamp * 0.015) % gridSpacing;

      // Vertical lines
      for (let x = -gridSpacing; x < width + gridSpacing; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x + offsetX, 0);
        ctx.lineTo(x + offsetX, height);
        ctx.stroke();
      }
      // Horizontal lines
      for (let y = -gridSpacing; y < height + gridSpacing; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + offsetY);
        ctx.lineTo(width, y + offsetY);
        ctx.stroke();
      }

      // Fast-Ticking calculations
      if (timestamp - lastUpdate > updateInterval) {
        lastUpdate = timestamp;

        // 1. Add Execution Trades
        if (Math.random() < 0.45) {
          const now = new Date();
          const ms = String(now.getMilliseconds()).padStart(3, "0");
          const timeStr = `${now.toTimeString().split(" ")[0]}.${ms}`;
          const symbol = symbols[Math.floor(Math.random() * symbols.length)];
          const side = Math.random() > 0.5 ? "BUY" : "SELL";
          const basePrice = symbol === "BTCUSD" ? 68500 : symbol === "XAUUSD" ? 2350 : 1.085;
          const price = (basePrice + (Math.random() - 0.5) * (basePrice * 0.005)).toFixed(symbol === "BTCUSD" ? 1 : symbol === "XAUUSD" ? 2 : 5);
          const size = (Math.random() * 5 + 0.1).toFixed(2);

          trades.push({
            id: tradeIdCounter++,
            time: timeStr,
            symbol,
            side,
            price,
            size,
            y: 0,
            opacity: 0
          });
          if (trades.length > 25) trades.shift();
        }

        // 2. Add Routing Logs (Middle Column Noise)
        if (Math.random() < 0.5) {
          const now = new Date();
          const ms = String(now.getMilliseconds()).padStart(3, "0");
          const timeStr = `${now.toTimeString().split(" ")[0]}.${ms}`;
          const template = logTemplates[Math.floor(Math.random() * logTemplates.length)];
          const sym = symbols[Math.floor(Math.random() * symbols.length)];
          const text = `[${timeStr}] ` + template.replace("{sym}", sym);

          routingLogs.push({
            id: logIdCounter++,
            text,
            y: 0,
            opacity: 0
          });
          if (routingLogs.length > 20) routingLogs.shift();
        }

        // 3. Jitter Order Book Entries
        orderBook.forEach(row => {
          row.size += (Math.random() - 0.5) * 12;
          if (row.size < 5) row.size = 5;
          if (row.size > 95) row.size = 95;
        });

        // 4. Update Tickers slightly
        tickers.forEach(t => {
          const delta = (Math.random() - 0.5) * (t.price * 0.0008);
          t.price += delta;
          t.isUp = delta >= 0;
          t.change += (Math.random() - 0.5) * 0.02;
        });

        // 5. Update Waveforms
        updateWave(xauWave);
        updateWave(eurWave);
        updateWave(btcWave);
      }

      ctx.textBaseline = "top";

      // --- Draw Top Ticker Tape (Marquee) ---
      tickerScrollX -= 0.65;
      const tickerSpacing = 160;
      const totalWidth = tickers.length * tickerSpacing;
      if (Math.abs(tickerScrollX) >= totalWidth) {
        tickerScrollX = 0;
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(0, 0, width, 25);
      ctx.strokeStyle = "rgba(16, 185, 129, 0.06)";
      ctx.beginPath();
      ctx.moveTo(0, 25);
      ctx.lineTo(width, 25);
      ctx.stroke();

      ctx.font = 'bold 9px "JetBrains Mono", "Courier New", monospace';
      
      // Draw double set of tickers for infinite marquee loop
      for (let offset = 0; offset < 2; offset++) {
        tickers.forEach((t, i) => {
          const x = tickerScrollX + i * tickerSpacing + offset * totalWidth;
          if (x > -tickerSpacing && x < width) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            ctx.fillText(t.name, x, 8);

            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillText(t.price.toFixed(t.name.includes("JPY") ? 2 : t.name.includes("USD") && t.price > 1000 ? 1 : 5), x + 50, 8);

            // Change percent + indicator
            if (t.isUp) {
              ctx.fillStyle = "rgba(16, 185, 129, 0.7)";
              ctx.fillText(`▲ +${t.change.toFixed(2)}%`, x + 105, 8);
            } else {
              ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
              ctx.fillText(`▼ ${t.change.toFixed(2)}%`, x + 105, 8);
            }
          }
        });
      }

      // --- Draw Left Column: Trade Executions ---
      const colX1 = 30;
      const colYStart = 50;
      const lineHeight = 16;
      const colWidth = 260;

      ctx.fillStyle = "rgba(16, 185, 129, 0.18)";
      ctx.font = 'bold 9px "JetBrains Mono", "Courier New", monospace';
      ctx.fillText("TICK_EXECUTION_FEED // LOCAL_PORT", colX1, colYStart);
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillText("TIMESTAMP    TICKER   SIDE   PRICE      SIZE", colX1, colYStart + 12);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.beginPath();
      ctx.moveTo(colX1, colYStart + 23);
      ctx.lineTo(colX1 + colWidth, colYStart + 23);
      ctx.stroke();

      const maxFeedItems = Math.floor((height - colYStart - 180) / lineHeight);
      
      trades.forEach((trade, idx) => {
        const targetY = colYStart + 28 + (trades.length - 1 - idx) * lineHeight;
        if (trade.y === 0) {
          trade.y = targetY + 8;
          trade.opacity = 0;
        }
        trade.y += (targetY - trade.y) * 0.18;
        trade.opacity += (0.65 - trade.opacity) * 0.15;

        if (trade.y < height - 150 && idx >= trades.length - maxFeedItems) {
          ctx.fillStyle = `rgba(255, 255, 255, ${trade.opacity * 0.35})`;
          ctx.font = '10px "JetBrains Mono", "Courier New", monospace';
          ctx.fillText(`[${trade.time}] ${trade.symbol.padEnd(7)}`, colX1, trade.y);

          if (trade.side === "BUY") {
            ctx.fillStyle = `rgba(16, 185, 129, ${trade.opacity})`;
          } else {
            ctx.fillStyle = `rgba(239, 68, 68, ${trade.opacity})`;
          }
          ctx.fillText(trade.side, colX1 + 105, trade.y);

          ctx.fillStyle = `rgba(255, 255, 255, ${trade.opacity * 0.5})`;
          ctx.fillText(`${trade.price.padStart(10)} | ${trade.size.padStart(4)}L`, colX1 + 135, trade.y);
        }
      });

      // --- Draw Left-Center Column: Routing / API System Logs ---
      const colX2 = colX1 + colWidth + 25;
      if (colX2 < width / 2 - 120) {
        ctx.fillStyle = "rgba(16, 185, 129, 0.18)";
        ctx.font = 'bold 9px "JetBrains Mono", "Courier New", monospace';
        ctx.fillText("WEBSOCKET_ROUTING_METRICS // L2_PORT", colX2, colYStart);
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillText("NETWORK LOGS / ROUTER PATH", colX2, colYStart + 12);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.beginPath();
        ctx.moveTo(colX2, colYStart + 23);
        ctx.lineTo(colX2 + colWidth - 20, colYStart + 23);
        ctx.stroke();

        routingLogs.forEach((log, idx) => {
          const targetY = colYStart + 28 + (routingLogs.length - 1 - idx) * lineHeight;
          if (log.y === 0) {
            log.y = targetY + 8;
            log.opacity = 0;
          }
          log.y += (targetY - log.y) * 0.18;
          log.opacity += (0.55 - log.opacity) * 0.15;

          if (log.y < height - 150 && idx >= routingLogs.length - maxFeedItems) {
            ctx.fillStyle = `rgba(16, 185, 129, ${log.opacity * 0.75})`;
            ctx.font = '9px "JetBrains Mono", "Courier New", monospace';
            ctx.fillText(log.text, colX2, log.y);
          }
        });
      }

      // --- Draw Right Column: Order Depth Matrix ---
      const colX3 = width - 240;
      ctx.fillStyle = "rgba(16, 185, 129, 0.18)";
      ctx.font = 'bold 9px "JetBrains Mono", "Courier New", monospace';
      ctx.fillText("ORDER_DEPTH_MATRIX // EURUSD", colX3, colYStart);
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      ctx.fillText("PRICE         DEPTH (VOL %)", colX3, colYStart + 12);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.beginPath();
      ctx.moveTo(colX3, colYStart + 23);
      ctx.lineTo(colX3 + 210, colYStart + 23);
      ctx.stroke();

      const rowHeight = 13;
      const maxBookRows = Math.floor((height - colYStart - 200) / rowHeight);
      const halfDraw = Math.floor(maxBookRows / 2);

      // Draw Asks (Red)
      for (let i = 0; i < halfDraw; i++) {
        const row = orderBook[i % orderBook.length];
        const y = colYStart + 28 + i * rowHeight;
        
        ctx.fillStyle = "rgba(239, 68, 68, 0.02)";
        ctx.fillRect(colX3, y, 210, rowHeight - 2);

        ctx.fillStyle = "rgba(239, 68, 68, 0.065)";
        const barW = (row.size / 100) * 110;
        ctx.fillRect(colX3 + 210 - barW, y, barW, rowHeight - 2);

        ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
        ctx.font = '10px "JetBrains Mono", "Courier New", monospace';
        ctx.fillText(row.price, colX3 + 5, y + 1);
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.fillText(row.size.toFixed(1), colX3 + 100, y + 1);
      }

      // Middle Spread
      const spreadY = colYStart + 28 + halfDraw * rowHeight;
      ctx.fillStyle = "rgba(16, 185, 129, 0.04)";
      ctx.fillRect(colX3, spreadY, 210, rowHeight - 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.font = 'bold 8px "JetBrains Mono", "Courier New", monospace';
      ctx.fillText("SPREAD: 0.00003 (3.0 Pips)", colX3 + 30, spreadY + 2);

      // Draw Bids (Green)
      for (let i = 0; i < halfDraw; i++) {
        const row = orderBook[(halfDraw + i) % orderBook.length];
        const y = colYStart + 28 + (halfDraw + 1 + i) * rowHeight;

        ctx.fillStyle = "rgba(16, 185, 129, 0.02)";
        ctx.fillRect(colX3, y, 210, rowHeight - 2);

        ctx.fillStyle = "rgba(16, 185, 129, 0.065)";
        const barW = (row.size / 100) * 110;
        ctx.fillRect(colX3 + 210 - barW, y, barW, rowHeight - 2);

        ctx.fillStyle = "rgba(16, 185, 129, 0.45)";
        ctx.font = '10px "JetBrains Mono", "Courier New", monospace';
        ctx.fillText(row.price, colX3 + 5, y + 1);

        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.fillText(row.size.toFixed(1), colX3 + 100, y + 1);
      }

      // --- Draw Right-Center Column: Volatility / Indicators ---
      const colX4 = colX3 - colWidth + 30;
      if (colX4 > width / 2 + 120) {
        ctx.fillStyle = "rgba(16, 185, 129, 0.18)";
        ctx.font = 'bold 9px "JetBrains Mono", "Courier New", monospace';
        ctx.fillText("TECHNICAL_VOLATILITY // INDICATORS", colX4, colYStart);
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillText("VOLATILITY   STOCHASTIC   RSI FEED", colX4, colYStart + 12);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
        ctx.beginPath();
        ctx.moveTo(colX4, colYStart + 23);
        ctx.lineTo(colX4 + colWidth - 20, colYStart + 23);
        ctx.stroke();

        // Draw dynamic signal indicators
        const indicators = [
          { name: "RSI_M15_TREND", val: 56.4, desc: "BULLISH_STABLE" },
          { name: "STOCH_K_M5", val: 78.2, desc: "OVERBOUGHT_WARN" },
          { name: "ATR_14_DAILY", val: 142.1, desc: "HIGH_EXPANSION" },
          { name: "MACD_HISTOGRAM", val: 0.00042, desc: "CROSSOVER_BUY" },
          { name: "BOLLINGER_BAND", val: 0.82, desc: "UPPER_BAND_TEST" },
          { name: "ORDER_VOLUME_AI", val: 94.2, desc: "ACCUMULATION" }
        ];

        indicators.forEach((ind, i) => {
          const y = colYStart + 28 + i * 22;
          
          ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
          ctx.font = '9px "JetBrains Mono", "Courier New", monospace';
          ctx.fillText(ind.name, colX4, y);

          // Bar gauge
          ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
          ctx.fillRect(colX4, y + 10, 160, 4);

          const fillVal = ind.name.includes("ATR") ? 60 : ind.name.includes("MACD") ? 45 : ind.val;
          const fillPercent = Math.min(100, Math.max(0, fillVal)) / 100;
          ctx.fillStyle = fillPercent > 0.75 ? "rgba(239, 68, 68, 0.3)" : "rgba(16, 185, 129, 0.3)";
          ctx.fillRect(colX4, y + 10, 160 * fillPercent, 4);

          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
          ctx.fillText(`${ind.desc} (${ind.val.toFixed(1)})`, colX4, y + 15);
        });
      }

      // --- Draw Bottom Row: Multi-Charts (3 charts side-by-side) ---
      const gap = 16;
      const chartH = 90;
      const totalAvailableWidth = width - 60;
      const chartW = (totalAvailableWidth - 2 * gap) / 3;
      const chartY = height - chartH - 25;

      const drawWaveChart = (x: number, y: number, w: number, title: string, wave: number[], lastMove: number) => {
        // Box border
        ctx.strokeStyle = "rgba(16, 185, 129, 0.04)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, chartH);

        // Chart grid
        ctx.strokeStyle = "rgba(16, 185, 129, 0.012)";
        for (let j = 1; j < 3; j++) {
          const gridY = y + (chartH / 3) * j;
          ctx.beginPath();
          ctx.moveTo(x, gridY);
          ctx.lineTo(x + w, gridY);
          ctx.stroke();
        }
        for (let j = 1; j < 4; j++) {
          const gridX = x + (w / 4) * j;
          ctx.beginPath();
          ctx.moveTo(gridX, y);
          ctx.lineTo(gridX, y + chartH);
          ctx.stroke();
        }

        // Draw line
        if (wave.length > 1) {
          ctx.beginPath();
          ctx.lineWidth = 1.25;
          const segmentW = w / (maxWavePoints - 1);
          
          wave.forEach((val, idx) => {
            const ptX = x + idx * segmentW;
            const ptY = y + (1 - val) * chartH;
            if (idx === 0) ctx.moveTo(ptX, ptY);
            else ctx.lineTo(ptX, ptY);
          });

          ctx.strokeStyle = lastMove >= 0 ? "rgba(16, 185, 129, 0.18)" : "rgba(239, 68, 68, 0.18)";
          ctx.stroke();

          // Fill underneath
          ctx.lineTo(x + w, y + chartH);
          ctx.lineTo(x, y + chartH);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, y, 0, y + chartH);
          grad.addColorStop(0, lastMove >= 0 ? "rgba(16, 185, 129, 0.025)" : "rgba(239, 68, 68, 0.025)");
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Text
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.font = '8px "JetBrains Mono", "Courier New", monospace';
        ctx.fillText(title, x + 6, y + 6);
        ctx.fillStyle = lastMove >= 0 ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)";
        ctx.fillText(lastMove >= 0 ? "▲ BULLISH" : "▼ BEARISH", x + w - 50, y + 6);
      };

      if (chartW > 120) {
        // Chart 1: XAUUSD Ticks
        const xauMove = xauWave[xauWave.length - 1] - xauWave[xauWave.length - 2];
        drawWaveChart(30, chartY, chartW, "XAUUSD // TICK_STREAM", xauWave, xauMove);

        // Chart 2: EURUSD Ticks
        const eurMove = eurWave[eurWave.length - 1] - eurWave[eurWave.length - 2];
        drawWaveChart(30 + chartW + gap, chartY, chartW, "EURUSD // TICK_STREAM", eurWave, eurMove);

        // Chart 3: BTCUSD Ticks
        const btcMove = btcWave[btcWave.length - 1] - btcWave[btcWave.length - 2];
        drawWaveChart(30 + 2 * (chartW + gap), chartY, chartW, "BTCUSD // TICK_STREAM", btcWave, btcMove);
      }

      // --- Draw Ambient Tech Info at the bottom edge ---
      ctx.fillStyle = "rgba(16, 185, 129, 0.02)";
      ctx.font = '7px "JetBrains Mono", "Courier New", monospace';
      const statsText = `PACKETS_IN: 812K/s // PACKETS_OUT: 42K/s // NODE_ENGINE: UP // ADAPTER: MONGO_OK // MEMORY_HEAP: 142MB / 512MB // ACTIVE_PIPELINES: 12`;
      ctx.fillText(statsText, 30, height - 13);

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 1,
        // Soft vignette overlay
        background: "radial-gradient(circle at 50% 50%, rgba(3, 5, 4, 0.25) 0%, rgba(3, 5, 4, 0.94) 85%)"
      }}
    />
  );
}
