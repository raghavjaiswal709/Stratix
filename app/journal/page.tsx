"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppContext } from "@/lib/context";
import type { ApiTrade } from "@/types";
import { JournalList, JournalTrade } from "@/components/trade/journal/journal-list";
import { JournalDetail } from "@/components/trade/journal/journal-detail";
import { MissedTradesView } from "@/components/trade/missed-trades/missed-trades-view";
import { ReportsView } from "@/components/trade/journal/reports-view";
import { AlertCircle, BookOpen, X, AlertTriangle, FileBarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { cachedFetch, invalidateApiCache } from "@/lib/api-cache";

type JournalTab = "all" | "journaled" | "pending";
type PageView = "journal" | "missed" | "reports";

function UnsavedDialog({
  onDiscard,
  onCancel,
  onSave,
}: {
  onDiscard: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-card-foreground">Unsaved Changes</h3>
            <p className="text-[12px] text-muted-foreground mt-1">
              You have unsaved journal changes for this trade. What would you like to do?
            </p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground/60 transition">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <button
            onClick={onSave}
            className="w-full py-2.5 rounded-xl bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-[13px] font-semibold text-white transition"
          >
            Save &amp; Continue
          </button>
          <button
            onClick={onDiscard}
            className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[13px] font-medium text-red-400 hover:bg-red-500/20 transition"
          >
            Discard Changes
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2 text-[12px] text-white/40 hover:text-white/70 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const { setHasUnsavedChanges, sharedTrades, setSharedTrades, activeProfileId } = useAppContext();

  // Pre-populate from the shared cache so navigating trades→journal shows latest data instantly
  const [trades, setTrades] = useState<JournalTrade[]>(
    sharedTrades.length > 0 ? (sharedTrades as unknown as JournalTrade[]) : []
  );
  const [loading, setLoading] = useState(sharedTrades.length === 0);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tradeId = params.get("tradeId");
      if (tradeId) {
        // Resolve parent if cached in sharedTrades
        const cached = sharedTrades.find(t => t._id === tradeId);
        if (cached && cached.parentTradeId) return cached.parentTradeId;
        return tradeId;
      }
    }
    return sharedTrades.length > 0 ? (sharedTrades[0] as ApiTrade)._id : null;
  });
  const [selectedSubTradeId, setSelectedSubTradeId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tradeId = params.get("tradeId");
      if (tradeId) {
        const cached = sharedTrades.find(t => t._id === tradeId);
        if (cached && cached.parentTradeId) return tradeId;
      }
    }
    return null;
  });
  const [tab, setTab] = useState<JournalTab>("all");
  const [isDirty, setIsDirty] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingSubTradeId, setPendingSubTradeId] = useState<string | null>(null);
  const [view, setView] = useState<PageView>("journal");
  const [pendingView, setPendingView] = useState<PageView | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setHasUnsavedChanges(isDirty), 0);
    return () => {
      clearTimeout(timer);
      setHasUnsavedChanges(false);
    };
  }, [isDirty, setHasUnsavedChanges]);

  // Sync selection to query param if it changes or loads
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tradeId = params.get("tradeId");
      if (tradeId) {
        const targetTrade = trades.find(t => t._id === tradeId);
        const resolvedId = (targetTrade && targetTrade.parentTradeId) || tradeId;
        if (resolvedId !== selectedId) {
          setSelectedId(resolvedId);
        }
        if (targetTrade && targetTrade.parentTradeId) {
          if (tradeId !== selectedSubTradeId) {
            setSelectedSubTradeId(tradeId);
          }
        }
      }
    }
  }, [trades]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback((profileId: string, opts: { force?: boolean } = {}) => {
    const url = profileId ? `/api/trade?profileId=${encodeURIComponent(profileId)}` : "/api/trade";
    cachedFetch<JournalTrade[]>(url, { ttlMs: 30_000, force: opts.force })
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        const timer = setTimeout(() => {
          setTrades(arr);
          setSharedTrades(arr as unknown as ApiTrade[]);
          
          let targetId = selectedId;
          let targetSubId = selectedSubTradeId;
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const tradeId = params.get("tradeId");
            if (tradeId) {
              const targetTrade = arr.find(t => t._id === tradeId);
              targetId = (targetTrade && targetTrade.parentTradeId) || tradeId;
              if (targetTrade && targetTrade.parentTradeId) {
                targetSubId = tradeId;
              }
            }
          }
          
          if (arr.length > 0) {
            setSelectedId(targetId || arr[0]._id);
            setSelectedSubTradeId(targetSubId);
          }
          setLoading(false);
        }, 0);
        return () => clearTimeout(timer);
      })
      .catch(() => setLoading(false));
  }, [selectedId, selectedSubTradeId, setSharedTrades]);

  useEffect(() => { load(activeProfileId); }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => {
      invalidateApiCache("/api/trade");
      load(activeProfileId, { force: true });
    };
    window.addEventListener("refresh-trades", handler);
    return () => window.removeEventListener("refresh-trades", handler);
  }, [activeProfileId, load]);

  // Reactively merge any trade edits made on the trades page into local state.
  // sharedTrades is updated immediately when a trade is edited, so this keeps
  // the journal in sync without a network round-trip.
  // Also marks trades as _deleted when they've been removed from sharedTrades.
  useEffect(() => {
    if (sharedTrades.length === 0) return;
    const timer = setTimeout(() => {
      setTrades((prev) => {
        if (prev.length === 0) return prev; // nothing to merge into yet
        return prev.map((t) => {
          const fresh = sharedTrades.find((s) => s._id === t._id);
          if (fresh) return { ...t, ...fresh, _deleted: false } as JournalTrade;
          // Trade was in journal but no longer in sharedTrades → it was deleted
          return { ...t, _deleted: true } as JournalTrade;
        });
      });
    }, 0);
    return () => clearTimeout(timer);
   
  }, [sharedTrades]);

  const selectedTrade = trades.find((t) => t._id === selectedId);

  function handleSaved(updated: JournalTrade) {
    const next = trades.map((t) => (t._id === updated._id ? { ...t, ...updated } : t));
    setTrades(next);
    setSharedTrades(next as unknown as ApiTrade[]);
    setIsDirty(false);
  }

  function handleSelect(id: string, subId: string | null = null) {
    if (id === selectedId && subId === selectedSubTradeId) return;
    if (isDirty) {
      setPendingId(id);
      setPendingSubTradeId(subId);
    } else {
      setSelectedId(id);
      setSelectedSubTradeId(subId);
    }
  }

  function handleViewChange(next: PageView) {
    if (next === view) return;
    if (isDirty) {
      setPendingView(next);
    } else {
      setView(next);
    }
  }

  async function handleDialogSave() {
    window.dispatchEvent(new CustomEvent("journal-force-save"));
    await new Promise((r) => setTimeout(r, 700));
    if (pendingView) {
      setView(pendingView);
    } else if (pendingId && pendingId !== "__back__") {
      setSelectedId(pendingId);
      setSelectedSubTradeId(pendingSubTradeId);
    } else if (pendingId === "__back__") {
      setSelectedId(null);
      setSelectedSubTradeId(null);
    }
    setIsDirty(false);
    setPendingId(null);
    setPendingSubTradeId(null);
    setPendingView(null);
  }

  function handleDialogDiscard() {
    if (pendingView) {
      setView(pendingView);
    } else if (pendingId && pendingId !== "__back__") {
      setSelectedId(pendingId);
      setSelectedSubTradeId(pendingSubTradeId);
    } else if (pendingId === "__back__") {
      setSelectedId(null);
      setSelectedSubTradeId(null);
    }
    setIsDirty(false);
    setPendingId(null);
    setPendingSubTradeId(null);
    setPendingView(null);
  }

  function handleDialogCancel() {
    setPendingId(null);
    setPendingSubTradeId(null);
    setPendingView(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  const TABS: { key: PageView; label: string; icon: typeof BookOpen }[] = [
    { key: "journal", label: "Journal", icon: BookOpen },
    { key: "missed", label: "Missed Trades", icon: AlertTriangle },
    { key: "reports", label: "Reports", icon: FileBarChart },
  ];

  return (
    <>
      {(pendingId || pendingView) && (
        <UnsavedDialog
          onSave={handleDialogSave}
          onDiscard={handleDialogDiscard}
          onCancel={handleDialogCancel}
        />
      )}

      <div className="flex flex-col h-full">
        {/* Top tab bar */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/7 shrink-0 bg-[#0c0e14]">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleViewChange(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition",
                view === key
                  ? "bg-white/[0.09] text-white border border-white/[0.12]"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.05] border border-transparent"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {view === "missed" ? (
          <MissedTradesView />
        ) : view === "reports" ? (
          <ReportsView />
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* Left panel */}
            <div className={`${selectedTrade ? "hidden md:flex" : "flex"} w-full md:w-70 shrink-0 flex-col h-full`}>
              <JournalList
                trades={trades}
                selectedId={selectedId}
                selectedSubTradeId={selectedSubTradeId}
                onSelect={handleSelect}
                tab={tab}
                onTabChange={setTab}
              />
            </div>

            {/* Right panel */}
            {selectedTrade ? (
              <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile back */}
                <div className="flex md:hidden items-center px-4 py-2 border-b border-border shrink-0">
                  <button
                    onClick={() => {
                      if (isDirty) {
                        setPendingId("__back__");
                        setPendingSubTradeId(null);
                      } else {
                        setSelectedId(null);
                        setSelectedSubTradeId(null);
                      }
                    }}
                    className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white transition"
                  >
                    <span className="text-[16px] leading-none">←</span>
                    Back to list
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <JournalDetail
                    trade={selectedTrade}
                    onSaved={handleSaved}
                    onDirtyChange={setIsDirty}
                    allTrades={trades}
                    isAggregatedView={selectedSubTradeId === null && selectedTrade.mergedTradeIds && selectedTrade.mergedTradeIds.length > 0}
                  />
                </div>
              </div>
            ) : (
              <div className="hidden md:flex flex-1 flex-col items-center justify-center text-white/25">
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
        )}
      </div>
    </>
  );
}
