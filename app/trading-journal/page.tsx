"use client";

import { useAppContext } from "@/lib/context";
import { TradeTable } from "@/components/trading/trade-table";
import { PerformanceDashboard } from "@/components/trading/performance-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TradingJournalPage() {
  const { loading } = useAppContext();

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
      <h1 className="text-[22px] font-semibold">Trading Journal</h1>

      <Tabs defaultValue="trades" className="w-full">
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="trades">Trade Log</TabsTrigger>
          <TabsTrigger value="analytics">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="trades" className="mt-5">
          <div className="glass-card p-4">
            <TradeTable />
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-5">
          <div className="glass-card p-4">
            <PerformanceDashboard />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
