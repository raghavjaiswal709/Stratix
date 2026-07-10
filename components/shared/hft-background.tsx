"use client";

import { useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Ambient trading-floor backdrop — calm, dim, professional.
// Composition: drifting emerald aurora glows, a fine static dot grid, a
// slow marquee ticker, one sparse execution feed (left), one order-depth
// ladder (right), and a full-width smooth spline price stream along the
// bottom with a breathing live node. Everything stays under ~0.45 alpha so
// foreground content always owns the frame. Honors prefers-reduced-motion
// by painting a single static frame.
// ─────────────────────────────────────────────────────────────────────────

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const EMERALD = "16, 185, 129";
const RED = "239, 68, 68";

interface FeedRow {
  time: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: string;
  y: number;
  opacity: number;
}

interface DepthRow {
  price: string;
  size: number;
  target: number;
}

interface Ticker {
  name: string;
  price: number;
  change: number;
  isUp: boolean;
  decimals: number;
}

const SYMBOLS: Array<{ name: string; base: number; decimals: number }> = [
  { name: "EURUSD", base: 1.0892, decimals: 5 },
  { name: "GBPUSD", base: 1.2743, decimals: 5 },
  { name: "USDJPY", base: 156.42, decimals: 2 },
  { name: "XAUUSD", base: 2354.1, decimals: 2 },
  { name: "BTCUSD", base: 68579, decimals: 1 },
  { name: "ETHUSD", base: 3745.2, decimals: 2 },
];

function timeStamp(offsetMs = 0): string {
  const d = new Date(Date.now() - offsetMs);
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function makeFeedRow(): Omit<FeedRow, "y" | "opacity"> {
  const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const price = (s.base * (1 + (Math.random() - 0.5) * 0.004)).toFixed(s.decimals);
  return {
    time: timeStamp(),
    symbol: s.name,
    side: Math.random() > 0.5 ? "BUY" : "SELL",
    price,
  };
}

export function HftBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let width = 0;
    let height = 0;

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

    // ── State ────────────────────────────────────────────────────────────
    const tickers: Ticker[] = SYMBOLS.map((s) => ({
      name: s.name,
      price: s.base,
      change: (Math.random() - 0.4) * 0.8,
      isUp: Math.random() > 0.4,
      decimals: s.decimals,
    }));
    let tickerX = 0;

    const feed: FeedRow[] = Array.from({ length: 12 }, (_, i) => ({
      ...makeFeedRow(),
      time: timeStamp((12 - i) * 1600),
      y: -1, // resolved on first draw
      opacity: 0.5,
    }));

    const depth: DepthRow[] = [];
    for (let i = 0; i < 10; i++) {
      depth.push({ price: (1.085 + (i + 1) * 0.0001).toFixed(5), size: 20 + Math.random() * 60, target: 20 + Math.random() * 60 });
    }
    for (let i = 0; i < 10; i++) {
      depth.push({ price: (1.0849 - i * 0.0001).toFixed(5), size: 20 + Math.random() * 60, target: 20 + Math.random() * 60 });
    }

    // Price stream: values in [0,1]; rendered as a smooth spline that flows
    // left continuously (phase interpolation between point insertions).
    const WAVE_POINTS = 90;
    const wave: number[] = [];
    let v = 0.5;
    for (let i = 0; i < WAVE_POINTS + 1; i++) {
      v = Math.min(0.9, Math.max(0.1, v + (Math.random() - 0.5) * 0.09));
      wave.push(v);
    }
    let wavePhase = 0; // 0..1 progress toward next point insertion

    let lastTs = 0;
    let updateAccum = 0;
    let feedAccum = 0;

    // ── Drawing helpers ──────────────────────────────────────────────────
    const drawGlows = (t: number) => {
      const blobs = [
        { x: width * (0.5 + 0.18 * Math.sin(t * 0.00006)), y: height * 0.95, r: width * 0.55, c: `rgba(${EMERALD}, 0.045)` },
        { x: width * (0.15 + 0.05 * Math.cos(t * 0.00004)), y: height * 0.2, r: width * 0.35, c: "rgba(255,255,255,0.022)" },
        { x: width * (0.85 + 0.04 * Math.sin(t * 0.00005)), y: height * 0.3, r: width * 0.3, c: `rgba(${EMERALD}, 0.028)` },
      ];
      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, b.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
    };

    const drawDotGrid = () => {
      const step = 30;
      ctx.fillStyle = "rgba(255,255,255,0.028)";
      for (let x = step; x < width; x += step) {
        for (let y = step + 30; y < height - 20; y += step) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    };

    const drawTicker = () => {
      const spacing = 190;
      const total = tickers.length * spacing;
      if (Math.abs(tickerX) >= total) tickerX = 0;

      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 30);
      ctx.lineTo(width, 30);
      ctx.stroke();

      ctx.font = `9px ${MONO}`;
      ctx.textBaseline = "middle";
      for (let rep = 0; rep < 2; rep++) {
        tickers.forEach((tk, i) => {
          const x = tickerX + i * spacing + rep * total;
          if (x < -spacing || x > width) return;
          ctx.fillStyle = "rgba(255,255,255,0.32)";
          ctx.fillText(tk.name, x, 15);
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fillText(tk.price.toFixed(tk.decimals), x + 55, 15);
          ctx.fillStyle = tk.isUp ? `rgba(${EMERALD}, 0.55)` : `rgba(${RED}, 0.5)`;
          ctx.fillText(`${tk.isUp ? "▲" : "▼"} ${Math.abs(tk.change).toFixed(2)}%`, x + 122, 15);
        });
      }
      ctx.textBaseline = "top";
    };

    const drawFeed = () => {
      if (width < 760) return;
      const x = 36;
      const top = 64;
      const lineH = 19;

      ctx.font = `bold 8px ${MONO}`;
      ctx.fillStyle = `rgba(${EMERALD}, 0.55)`;
      ctx.fillText("EXECUTION FEED", x, top - 20);

      const count = Math.min(feed.length, Math.floor((height * 0.55 - top) / lineH));
      feed.forEach((row, idx) => {
        const slot = feed.length - 1 - idx;
        if (slot >= count) return;
        const targetY = top + slot * lineH;
        if (row.y < 0) {
          row.y = targetY;
        } else {
          row.y += (targetY - row.y) * 0.12;
        }
        row.opacity += (0.85 - row.opacity) * 0.08;

        // fade rows out toward the bottom of the column
        const edgeFade = 1 - Math.max(0, (slot - (count - 4)) / 4);
        const a = row.opacity * Math.max(0.15, edgeFade);

        ctx.font = `9px ${MONO}`;
        ctx.fillStyle = `rgba(255,255,255,${0.42 * a})`;
        ctx.fillText(row.time, x, row.y);
        ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
        ctx.fillText(row.symbol, x + 82, row.y);
        ctx.fillStyle = row.side === "BUY" ? `rgba(${EMERALD}, ${0.9 * a})` : `rgba(${RED}, ${0.85 * a})`;
        ctx.fillText(row.side, x + 138, row.y);
        ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
        ctx.fillText(row.price, x + 175, row.y);
      });
    };

    const drawDepth = () => {
      if (width < 980) return;
      const w = 180;
      const x = width - w - 36;
      const top = 64;
      const rowH = 15;
      const half = 10;

      ctx.font = `bold 8px ${MONO}`;
      ctx.fillStyle = `rgba(${EMERALD}, 0.55)`;
      ctx.fillText("ORDER DEPTH · EURUSD", x, top - 20);

      depth.forEach((row, i) => {
        const isAsk = i < half;
        const y = top + (i + (isAsk ? 0 : 0.6)) * rowH;
        if (y > height * 0.55) return;
        row.size += (row.target - row.size) * 0.05;

        // center rows (near the spread) glow slightly brighter
        const centerBoost = 1 - Math.abs(i - half + 0.5) / half;
        const a = 0.5 + centerBoost * 0.5;
        const rgb = isAsk ? RED : EMERALD;

        const barW = (row.size / 100) * (w - 62);
        ctx.fillStyle = `rgba(${rgb}, ${0.1 * a})`;
        ctx.beginPath();
        ctx.roundRect(x + w - barW, y + 1, barW, rowH - 5, 2);
        ctx.fill();

        ctx.font = `9px ${MONO}`;
        ctx.fillStyle = `rgba(${rgb}, ${0.6 * a})`;
        ctx.fillText(row.price, x, y);
        ctx.fillStyle = `rgba(255,255,255,${0.38 * a})`;
        ctx.fillText(row.size.toFixed(1), x + 62, y);
      });

      // spread divider
      const spreadY = top + half * rowH + 2;
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.beginPath();
      ctx.moveTo(x, spreadY);
      ctx.lineTo(x + w, spreadY);
      ctx.stroke();
    };

    const drawStream = () => {
      const margin = 36;
      const chartH = Math.min(150, height * 0.2);
      const baseY = height - 34;
      const topY = baseY - chartH;
      const w = width - margin * 2;
      const seg = w / (WAVE_POINTS - 2);

      const pts = wave.slice(0, WAVE_POINTS).map((val, i) => ({
        x: margin + i * seg - wavePhase * seg,
        y: topY + (1 - val) * chartH,
      }));

      const spline = () => {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
      };

      // area fill
      const grad = ctx.createLinearGradient(0, topY, 0, baseY);
      grad.addColorStop(0, `rgba(${EMERALD}, 0.07)`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      spline();
      ctx.lineTo(pts[pts.length - 1].x, baseY);
      ctx.lineTo(pts[0].x, baseY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // glow pass + crisp line
      ctx.beginPath();
      spline();
      ctx.strokeStyle = `rgba(${EMERALD}, 0.08)`;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      spline();
      ctx.strokeStyle = `rgba(${EMERALD}, 0.4)`;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // breathing live node at the newest point
      const last = pts[pts.length - 1];
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.003);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${EMERALD}, 0.85)`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(last.x, last.y, 5 + pulse * 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${EMERALD}, ${0.12 * (1 - pulse * 0.6)})`;
      ctx.fill();

      ctx.font = `bold 8px ${MONO}`;
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillText("EURUSD · LIVE STREAM", margin, topY - 14);
    };

    const drawSessions = () => {
      const now = new Date();
      const fmt = (offsetH: number) => {
        const d = new Date(now.getTime() + (offsetH + now.getTimezoneOffset() / 60) * 3600000);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      };
      const text = `LONDON ${fmt(1)}   ·   NEW YORK ${fmt(-4)}   ·   TOKYO ${fmt(9)}`;
      ctx.font = `8px ${MONO}`;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, width - tw - 36, height - 18);
    };

    // ── Frame ────────────────────────────────────────────────────────────
    const drawFrame = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = "top";
      drawGlows(t);
      drawDotGrid();
      drawTicker();
      drawFeed();
      drawDepth();
      drawStream();
      drawSessions();
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = lastTs === 0 ? 16.7 : Math.min(64, t - lastTs);
      lastTs = t;

      // gentle motion — everything flows, nothing rushes
      tickerX -= 0.022 * dt;
      wavePhase += dt / 900;
      if (wavePhase >= 1) {
        wavePhase -= 1;
        wave.shift();
        const prev = wave[wave.length - 1];
        wave.push(Math.min(0.9, Math.max(0.1, prev + (Math.random() - 0.5) * 0.11)));
      }

      updateAccum += dt;
      if (updateAccum > 700) {
        updateAccum = 0;
        tickers.forEach((tk) => {
          const delta = (Math.random() - 0.5) * tk.price * 0.0004;
          tk.price += delta;
          tk.isUp = delta >= 0;
          tk.change += (Math.random() - 0.5) * 0.015;
        });
        depth.forEach((row) => {
          row.target = Math.min(95, Math.max(8, row.target + (Math.random() - 0.5) * 26));
        });
      }

      feedAccum += dt;
      if (feedAccum > 1500) {
        feedAccum = 0;
        feed.push({ ...makeFeedRow(), y: -1, opacity: 0 });
        if (feed.length > 14) feed.shift();
      }

      drawFrame(t);
    };

    if (reducedMotion) {
      drawFrame(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 1,
        background:
          "radial-gradient(circle at 50% 45%, rgba(4, 6, 5, 0.1) 0%, rgba(3, 5, 4, 0.85) 100%)",
      }}
    />
  );
}
