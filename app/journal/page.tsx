"use client";

import { useEffect, useState, useCallback } from "react";
import { useAppContext } from "@/lib/context";
import type { ApiTrade } from "@/types";
import { JournalList, JournalTrade } from "@/components/trade/journal/journal-list";
import { JournalDetail } from "@/components/trade/journal/journal-detail";
import { AlertCircle, BookOpen, X } from "lucide-react";

type JournalTab = "all" | "journaled" | "pending";

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
  const [selectedId, setSelectedId] = useState<string | null>(
    sharedTrades.length > 0 ? (sharedTrades[0] as ApiTrade)._id : null
  );
  const [tab, setTab] = useState<JournalTab>("all");
  const [isDirty, setIsDirty] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setHasUnsavedChanges(isDirty), 0);
    return () => {
      clearTimeout(timer);
      setHasUnsavedChanges(false);
    };
  }, [isDirty, setHasUnsavedChanges]);

  const load = useCallback((profileId: string) => {
    const url = profileId ? `/api/trade?profileId=${encodeURIComponent(profileId)}` : "/api/trade";
    fetch(url)
      .then((r) => r.json())
      .then((data: JournalTrade[]) => {
        const arr = Array.isArray(data) ? data : [];
        const timer = setTimeout(() => {
          setTrades(arr);
          setSharedTrades(arr as unknown as ApiTrade[]);
          if (!selectedId && arr.length > 0) {
            setSelectedId(arr[0]._id);
          }
          setLoading(false);
        }, 0);
        return () => clearTimeout(timer);
      })
      .catch(() => setLoading(false));
  }, [selectedId, setSharedTrades]);

  useEffect(() => { load(activeProfileId); }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setTrades((prev) => {
      const next = prev.map((t) => (t._id === updated._id ? { ...t, ...updated } : t));
      setSharedTrades(next as unknown as ApiTrade[]);
      return next;
    });
    setIsDirty(false);
  }

  function handleSelect(id: string) {
    if (id === selectedId) return;
    if (isDirty) {
      setPendingId(id);
    } else {
      setSelectedId(id);
    }
  }

  async function handleDialogSave() {
    window.dispatchEvent(new CustomEvent("journal-force-save"));
    await new Promise((r) => setTimeout(r, 700));
    if (pendingId && pendingId !== "__back__") {
      setSelectedId(pendingId);
    } else if (pendingId === "__back__") {
      setSelectedId(null);
    }
    setIsDirty(false);
    setPendingId(null);
  }

  function handleDialogDiscard() {
    if (pendingId && pendingId !== "__back__") {
      setSelectedId(pendingId);
    } else if (pendingId === "__back__") {
      setSelectedId(null);
    }
    setIsDirty(false);
    setPendingId(null);
  }

  function handleDialogCancel() {
    setPendingId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {pendingId && (
        <UnsavedDialog
          onSave={handleDialogSave}
          onDiscard={handleDialogDiscard}
          onCancel={handleDialogCancel}
        />
      )}

      <div className="flex h-full">
        {/* Left panel */}
        <div className={`${selectedTrade ? "hidden md:flex" : "flex"} w-full md:w-70 shrink-0 flex-col h-full`}>
          <JournalList
            trades={trades}
            selectedId={selectedId}
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
                  if (isDirty) setPendingId("__back__");
                  else setSelectedId(null);
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
    </>
  );
}
