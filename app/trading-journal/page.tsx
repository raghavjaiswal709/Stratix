"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/context";
import { TradeTable } from "@/components/trading/trade-table";
import { PerformanceDashboard } from "@/components/trading/performance-dashboard";
import { SwipeableTabs } from "@/components/shared/swipeable-tabs";

const tradeTabs = [
  { value: "trades", label: "Trade Log" },
  { value: "analytics", label: "Performance" },
];

export default function TradingJournalPage() {
  const { loading } = useAppContext();
  const [activeTab, setActiveTab] = useState("trades");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-5 animate-fade-up">
      <h1 className="text-[22px] font-semibold">Tradebook</h1>

      <SwipeableTabs
        tabs={tradeTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        <div className="glass-card p-4">
          <TradeTable />
        </div>

        <div className="glass-card p-4">
          <PerformanceDashboard />
        </div>
      </SwipeableTabs>
    </div>
  );
}
