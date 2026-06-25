"use client";

/**
 * Live Chart page.
 *
 * - Accessible to all authenticated users (redirects to /auth/signin otherwise).
 * - Holds a page-level WebSocket purely for the PriceTicker, so the ticker keeps
 *   updating every symbol even while the chart is focused on one.
 * - The chart itself (CandlChart) is dynamically imported with { ssr: false }
 *   and re-mounts via `key` whenever the symbol or interval changes.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PriceTicker } from "@/components/chart/PriceTicker";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { MarketNews } from "@/components/chart/MarketNews";

type Status = "connected" | "disconnected" | "reconnecting";
// ... (rest of the file stays same until return statement)


interface TickerEntry {
  price: number;
  change: number;
  changePercent: number;
}

function ChartSkeleton() {
  return (
    <div
      className="w-full animate-pulse rounded-lg bg-white/[0.02]"
      style={{ height: "calc(100vh - 220px)", minHeight: 360 }}
    >
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
      </div>
    </div>
  );
}

const CandlChart = dynamic(
  () => import("@/components/chart/CandlChart").then((m) => ({ default: m.CandlChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export default function ChartPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [selectedSymbol, setSelectedSymbol] = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1m");
  const [prices, setPrices] = useState<Map<string, TickerEntry>>(new Map());
  const [connStatus, setConnStatus] = useState<Status>("disconnected");

  // Baseline price per symbol (first tick seen this session) → change %.
  const openPriceRef = useRef<Map<string, number>>(new Map());
  // Per-symbol last React-state-update timestamp. BTC/ETH arrive at 100-200/sec
  // from Binance @trade; we only update React state at most 5/sec per symbol
  // (200 ms) so the ticker renders smoothly without overloading the render cycle.
  // The chart candle (in CandlChart) receives every raw tick unthrottled.
  const tickerLastMs = useRef<Map<string, number>>(new Map());
  const TICKER_THROTTLE_MS = 200;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth gate (all authenticated users) ──────────────────────────────────────
  useEffect(() => {
    if (authStatus === "loading") return;
    if (!session?.user) router.replace("/auth/signin");
  }, [session, authStatus, router]);

  // ── Page-level ticker WebSocket ──────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    const url = process.env.NEXT_PUBLIC_WS_URL;
    if (!url) {
      setConnStatus("disconnected");
      return;
    }
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setConnStatus((s) => (s === "connected" ? s : "reconnecting"));

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectRef.current = setTimeout(connect, 5000);
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => !disposed && setConnStatus("connected");

      ws.onmessage = (evt) => {
        if (disposed) return;
        let tick: { symbol: string; price: number };
        try {
          tick = JSON.parse(evt.data);
        } catch {
          return;
        }
        if (!tick.symbol || !Number.isFinite(tick.price)) return;

        // Throttle React state (ticker) to 5/sec per symbol.
        // BTC/ETH arrive at 100-200/sec from @trade; we skip most of them here.
        // The chart candle has its own WS and applies every single tick.
        const now = Date.now();
        const lastMs = tickerLastMs.current.get(tick.symbol) ?? 0;
        if (now - lastMs < TICKER_THROTTLE_MS) return;
        tickerLastMs.current.set(tick.symbol, now);

        const open = openPriceRef.current.get(tick.symbol);
        if (open == null) openPriceRef.current.set(tick.symbol, tick.price);
        const base = open ?? tick.price;
        const change = tick.price - base;
        const changePercent = base ? (change / base) * 100 : 0;

        setPrices((prev) => {
          const next = new Map(prev);
          next.set(tick.symbol, { price: tick.price, change, changePercent });
          return next;
        });
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnStatus("disconnected");
        reconnectRef.current = setTimeout(connect, 5000);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [session]);

  if (authStatus === "loading" || !session?.user) return null;

  const currentPrice = prices.get(selectedSymbol)?.price;

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#0f0f0f] overflow-y-auto">
      <PriceTicker prices={prices} selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />
      <SymbolSelector
        selectedSymbol={selectedSymbol}
        selectedInterval={selectedInterval}
        onSymbolChange={setSelectedSymbol}
        onIntervalChange={setSelectedInterval}
        currentPrice={currentPrice}
        connectionStatus={connStatus}
      />
      <div className="w-full px-3 py-3" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <CandlChart
          key={`${selectedSymbol}-${selectedInterval}`}
          symbol={selectedSymbol}
          interval={selectedInterval}
        />
      </div>
      <MarketNews symbol={selectedSymbol} />
    </div>
  );
}
