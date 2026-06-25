"use client";

/**
 * Live Chart page.
 * Uses useLivePrices hook — direct browser connections to Binance + Finnhub.
 * No separate WebSocket server needed. Works on Vercel free tier, ₹0/month.
 */

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useState } from "react";
import { PriceTicker } from "@/components/chart/PriceTicker";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { useLivePrices } from "@/lib/useLivePrices";

function ChartSkeleton() {
  return (
    <div
      className="w-full animate-pulse rounded-lg bg-white/[0.02]"
      style={{ height: "calc(100vh - 160px)", minHeight: 360 }}
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

  const [selectedSymbol, setSelectedSymbol]   = useState("XAUUSD");
  const [selectedInterval, setSelectedInterval] = useState("1m");

  // All live prices — direct browser connections, no server
  const { prices, status } = useLivePrices();

  // Auth gate
  useEffect(() => {
    if (authStatus === "loading") return;
    if (!session?.user) router.replace("/auth/signin");
  }, [session, authStatus, router]);

  if (authStatus === "loading" || !session?.user) return null;

  const currentPrice = prices.get(selectedSymbol)?.price;

  return (
    <div className="flex h-full w-full flex-col bg-[#0f0f0f]">
      <PriceTicker
        prices={prices}
        selectedSymbol={selectedSymbol}
        onSelect={setSelectedSymbol}
      />
      <SymbolSelector
        selectedSymbol={selectedSymbol}
        selectedInterval={selectedInterval}
        onSymbolChange={setSelectedSymbol}
        onIntervalChange={setSelectedInterval}
        currentPrice={currentPrice}
        connectionStatus={status}
      />
      <div className="flex-1 px-3 py-3">
        <CandlChart
          key={`${selectedSymbol}-${selectedInterval}`}
          symbol={selectedSymbol}
          interval={selectedInterval}
        />
      </div>
    </div>
  );
}
