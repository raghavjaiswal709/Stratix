"use client";

import { useState } from "react";
import { X, Puzzle, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface SimpleTrade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  profit: number;
  status: "open" | "closed";
  parentTradeId?: string;
  mergedTradeIds?: string[];
}

interface MergeModalProps {
  parentTrade: SimpleTrade;
  allTrades: SimpleTrade[]; // Pre-sorted and pre-filtered in the same order
  onClose: () => void;
  onMerged: () => void;
}

export function MergeModal({ parentTrade, allTrades, onClose, onMerged }: MergeModalProps) {
  // We list all trades that are NOT the parent trade itself
  const candidates = allTrades.filter((t) => t._id !== parentTrade._id);
  
  // Checked trade IDs are initially those where parentTradeId is the parent's ID
  const [checkedIds, setCheckedIds] = useState<string[]>(
    candidates.filter((t) => t.parentTradeId === parentTrade._id).map((t) => t._id)
  );
  const [saving, setSaving] = useState(false);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  async function handleConfirm() {
    setSaving(true);
    try {
      // 1. Update the parent trade's mergedTradeIds
      await fetch(`/api/trade/${parentTrade._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mergedTradeIds: checkedIds,
        }),
      });

      // 2. Update checked trades: point their parentTradeId to parentTrade._id and copy journal fields
      const parentRaw = parentTrade as any;
      const childPromises = checkedIds.map((childId) => {
        return fetch(`/api/trade/${childId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentTradeId: parentTrade._id,
            // Share journal information
            journaled: parentRaw.journaled ?? false,
            executionChecklist: parentRaw.executionChecklist ?? [],
            screenshots: parentRaw.screenshots ?? [],
            preTradeAnalysis: parentRaw.preTradeAnalysis ?? "",
            postTradeReview: parentRaw.postTradeReview ?? "",
            riskRatio: parentRaw.riskRatio ?? 1,
            rewardRatio: parentRaw.rewardRatio ?? 2,
            emotions: parentRaw.emotions ?? "",
            lessonsLearned: parentRaw.lessonsLearned ?? "",
            tags: parentRaw.tags ?? [],
            rating: parentRaw.rating ?? 5,
          }),
        });
      });

      // 3. Update unchecked trades that were previously child trades of this parent: unset parentTradeId
      const previouslyChildren = candidates.filter((t) => t.parentTradeId === parentTrade._id);
      const unmergePromises = previouslyChildren
        .filter((t) => !checkedIds.includes(t._id))
        .map((t) => {
          return fetch(`/api/trade/${t._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parentTradeId: null,
            }),
          });
        });

      await Promise.all([...childPromises, ...unmergePromises]);
      onMerged();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#141720] border border-white/10 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/7">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center border border-amber-500/20 text-amber-400">
            <Puzzle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-white">Merge Trades with {parentTrade.symbol}</h2>
            <p className="text-[11px] text-white/35">Select one or more trades to compile them</p>
          </div>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
          {candidates.length === 0 ? (
            <div className="text-center py-10 text-white/20 text-[12px]">No other trades to merge.</div>
          ) : (
            candidates.map((trade) => {
              const isChecked = checkedIds.includes(trade._id);
              const hasDifferentParent = trade.parentTradeId && trade.parentTradeId !== parentTrade._id;
              
              return (
                <div
                  key={trade._id}
                  onClick={() => toggleCheck(trade._id)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition rounded-xl",
                    isChecked ? "bg-white/3" : "hover:bg-white/2"
                  )}
                >
                  {/* Custom checkbox */}
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                    isChecked ? "bg-amber-500 border-amber-500 text-black" : "border-white/20"
                  )}>
                    {isChecked && <Check className="h-3 w-3 stroke-[3px]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-semibold text-white">{trade.symbol}</span>
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded",
                        trade.direction === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      )}>
                        {trade.direction === "buy" ? "Long" : "Short"}
                      </span>
                      {trade.status === "open" ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5">Open</span>
                      ) : (
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded",
                          trade.profit >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        )}>
                          {trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}
                        </span>
                      )}
                      {hasDifferentParent && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Merged elsewhere</span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/35">
                      Lots: {trade.lots} · Entry: ${trade.entryPrice} · {format(parseISO(trade.entryTime), "MMM d, yyyy, HH:mm")}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-white/7">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-white/10 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-semibold transition disabled:opacity-50"
          >
            {saving ? "Merging..." : "Confirm Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
