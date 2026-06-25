"use client";
/**
 * useLivePrices — browser-direct live price hook.
 *
 * Replaces the separate Node.js WebSocket relay server entirely.
 * Everything runs in the browser — zero extra hosting cost, zero deployment.
 *
 * Sources:
 *   Binance WS (direct)  → BTC, ETH, XAU (via XAUT/PAXG bookTicker)
 *                          + EUR/USD cross-rate (BTCUSDT / BTCEUR)
 *   Finnhub WS (direct)  → GBP/USD, USD/JPY, USD/CHF, USD/CAD, AUD/USD
 *   /api/forex-rates     → Forex REST fallback (Vercel proxy, every 10s)
 *   /api/silver          → XAG/USD (Vercel proxy, every 1s)
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface TickerEntry {
  price: number;
  change: number;
  changePercent: number;
}

type Status = "connected" | "disconnected" | "reconnecting";

const BINANCE_WS = "wss://stream.binance.com:9443/stream";
const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_KEY ?? "";

// Finnhub symbols → our normalized symbols
const FINNHUB_MAP: Record<string, string> = {
  "OANDA:GBP_USD": "GBPUSD",
  "OANDA:USD_JPY": "USDJPY",
  "OANDA:USD_CHF": "USDCHF",
  "OANDA:USD_CAD": "USDCAD",
  "OANDA:AUD_USD": "AUDUSD",
};
const FINNHUB_SYMBOLS = Object.keys(FINNHUB_MAP);

export function useLivePrices() {
  const [prices, setPrices] = useState<Map<string, TickerEntry>>(new Map());
  const [status, setStatus] = useState<Status>("disconnected");

  const openRef  = useRef<Map<string, number>>(new Map());  // baseline (first tick)
  const crossRef = useRef({ BTCUSD: 0, BTCEUR: 0 });       // for EUR/USD derivation

  // ── Helper: update one symbol's price in state ──────────────────────────────
  const tick = useCallback((symbol: string, price: number) => {
    if (!Number.isFinite(price) || price <= 0) return;
    if (!openRef.current.has(symbol)) openRef.current.set(symbol, price);
    const base = openRef.current.get(symbol)!;
    const change = price - base;
    setPrices(prev => {
      const next = new Map(prev);
      next.set(symbol, { price, change, changePercent: base ? (change / base) * 100 : 0 });
      return next;
    });
  }, []);

  // ── Source 1: Binance WebSocket (BTC, ETH, XAU, EUR/USD cross) ──────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const streams = [
      "btcusdt@trade",        // BTC trades
      "ethusdt@trade",        // ETH trades
      "xautusdt@bookTicker",  // Tether Gold bookTicker (fast gold price)
      "paxgusdt@bookTicker",  // Paxos Gold bookTicker (second gold source)
      "btcusdt@bookTicker",   // needed for EUR/USD cross-rate
      "btceur@bookTicker",    // needed for EUR/USD cross-rate
    ].join("/");

    const connect = () => {
      if (disposed) return;
      setStatus(s => s === "connected" ? s : "reconnecting");
      ws = new WebSocket(`${BINANCE_WS}?streams=${streams}`);

      ws.onopen = () => { if (!disposed) setStatus("connected"); };

      ws.onmessage = (evt) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(evt.data as string);
          const d = msg.data;
          if (!d || !d.s) return;

          // @trade events: BTC and ETH
          if (d.e === "trade") {
            if (d.s === "BTCUSDT") tick("BTCUSD", parseFloat(d.p));
            if (d.s === "ETHUSDT") tick("ETHUSD", parseFloat(d.p));
          }

          // @bookTicker events: gold + EUR/USD cross-rate
          if (d.b !== undefined && d.a !== undefined) {
            const mid = (parseFloat(d.b) + parseFloat(d.a)) / 2;

            if (d.s === "XAUTUSDT" || d.s === "PAXGUSDT") tick("XAUUSD", mid);

            if (d.s === "BTCUSDT") crossRef.current.BTCUSD = mid;
            if (d.s === "BTCEUR")  crossRef.current.BTCEUR = mid;

            const { BTCUSD, BTCEUR } = crossRef.current;
            if (BTCUSD > 0 && BTCEUR > 0 && (d.s === "BTCUSDT" || d.s === "BTCEUR")) {
              tick("EURUSD", BTCUSD / BTCEUR);
            }
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        if (disposed) return;
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; try { ws.close(); } catch { /* ignore */ } }
    };
  }, [tick]);

  // ── Source 2: Finnhub WebSocket (remaining forex pairs) ─────────────────────
  useEffect(() => {
    if (!FINNHUB_KEY) return;

    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

      ws.onopen = () => {
        // 1-second delay before subscribing (Finnhub requires this)
        setTimeout(() => {
          if (ws?.readyState !== WebSocket.OPEN) return;
          FINNHUB_SYMBOLS.forEach(sym =>
            ws!.send(JSON.stringify({ type: "subscribe", symbol: sym }))
          );
          pingTimer = setInterval(() => {
            if (ws?.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "ping" }));
          }, 25000);
        }, 1000);
      };

      ws.onmessage = (evt) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(evt.data as string);
          if (msg.type === "pong" || msg.type === "ping") return;
          if (msg.type !== "trade" || !Array.isArray(msg.data)) return;
          msg.data.forEach((t: { s: string; p: number }) => {
            const symbol = FINNHUB_MAP[t.s];
            if (symbol) tick(symbol, t.p);
          });
        } catch { /* ignore */ }
      };

      ws.onclose = (e) => {
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        if (disposed) return;
        const delay = e.code === 1006 ? 60000 : 5000; // back off on Finnhub free-tier drops
        reconnectTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
    };

    connect();
    return () => {
      disposed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; try { ws.close(); } catch { /* ignore */ } }
    };
  }, [tick]);

  // ── Source 3: Forex REST fallback via Vercel proxy (every 10s) ───────────────
  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      if (disposed) return;
      try {
        const res = await fetch("/api/forex-rates");
        if (!res.ok) return;
        const rates: Record<string, number | null> = await res.json();
        Object.entries(rates).forEach(([sym, price]) => {
          if (price !== null) tick(sym, price);
        });
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => { disposed = true; clearInterval(id); };
  }, [tick]);

  // ── Source 4: Silver via Vercel proxy (every 1s) ─────────────────────────────
  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      if (disposed) return;
      try {
        const res = await fetch("/api/silver");
        if (!res.ok) return;
        const { price } = await res.json();
        if (price) tick("XAGUSD", price);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => { disposed = true; clearInterval(id); };
  }, [tick]);

  return { prices, status };
}
