"use client";

import { useEffect, useState, useCallback } from "react";
import { JournalList, JournalTrade } from "@/components/trade/journal/journal-list";
import { JournalDetail } from "@/components/trade/journal/journal-detail";
import { BookOpen } from "lucide-react";

type JournalTab = "all" | "journaled" | "pending";

export default function JournalPage() {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<JournalTab>("all");

  const load = useCallback(() => {
    fetch("/api/trade")
      .then((r) => r.json())
      .then((data: JournalTrade[]) => {
        const arr = Array.isArray(data) ? data : [];
        setTrades(arr);
        if (!selectedId && arr.length > 0) {
          setSelectedId(arr[0]._id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  const selectedTrade = trades.find((t) => t._id === selectedId);

  function handleSaved(updated: JournalTrade) {
    setTrades((prev) =>
      prev.map((t) => (t._id === updated._id ? { ...t, ...updated } : t))
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left panel — trade list */}
      <JournalList
        trades={trades}
        selectedId={selectedId}
        onSelect={setSelectedId}
        tab={tab}
        onTabChange={setTab}
      />

      {/* Right panel — journal detail */}
      {selectedTrade ? (
        <JournalDetail
          trade={selectedTrade as Parameters<typeof JournalDetail>[0]["trade"]}
          onSaved={handleSaved as Parameters<typeof JournalDetail>[0]["onSaved"]}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-white/25">
          <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
            <BookOpen className="h-6 w-6 opacity-50" />
          </div>
          <p className="text-[14px] font-medium">No trade selected</p>
          <p className="text-[12px] mt-1">
            {trades.length === 0
              ? "Add a trade first to start journaling"
              : "Select a trade from the list to journal it"}
          </p>
        </div>
      )}
    </div>
  );
}
