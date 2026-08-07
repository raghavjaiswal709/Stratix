"use client";

import { useMemo, useState } from "react";
import { X, Puzzle, Check, Edit2, Crown, ChevronDown, Sparkles, ListFilter } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

// A compilation is one trading decision split across multiple broker
// tickets (partial fills) — those land within seconds of each other, but
// broker/EA clock drift and slow fills can push that out further, so the
// "Recommended" tab uses a forgiving window rather than an exact match.
// Deliberately time-only: price is NOT part of the recommendation, since a
// partial fill's price can legitimately differ from the main trade's.
const RECOMMENDED_WINDOW_MS = 2 * 60 * 1000;

function formatTimeDelta(deltaMs: number): string {
  const totalSeconds = Math.round(Math.abs(deltaMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const sign = deltaMs >= 0 ? "+" : "-";
  return minutes > 0 ? `${sign}${minutes}m ${seconds}s` : `${sign}${seconds}s`;
}

interface SimpleTrade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  timeframe?: string;
  entryTime: string;
  exitTime?: string;
  profit: number;
  status: "open" | "closed";
  parentTradeId?: string;
  mergedTradeIds?: string[];
  journaled?: boolean;
}

interface MergeModalProps {
  parentTrade: SimpleTrade;
  allTrades: SimpleTrade[]; // Every other trade for this symbol — unfiltered by time
  onClose: () => void;
  onMerged: () => void;
}

export function MergeModal({ parentTrade, allTrades, onClose, onMerged }: MergeModalProps) {
  // Allow user to select which trade is the main parent trade
  const [currentParentId, setCurrentParentId] = useState<string>(parentTrade._id);
  const mainTrade = allTrades.find((t) => t._id === currentParentId) || parentTrade;

  // Candidates are all trades except the designated main trade — this is the
  // "All Trades" tab's full list.
  const candidates = allTrades.filter((t) => t._id !== mainTrade._id);

  const [activeTab, setActiveTab] = useState<"recommended" | "all">("recommended");
  const mainEntryMs = new Date(mainTrade.entryTime).getTime();

  // "Recommended" — time-proximity only, never price: a partial fill can
  // legitimately print at a different price than the main ticket, so price
  // would only cause real matches to be filtered out. Sorted nearest-first so
  // the most likely fills lead. Already-linked children are pinned in
  // regardless of drift, matching the guarantee the old single-list view
  // gave: re-saving a compilation must never silently drop a member.
  const recommended = useMemo(() => {
    return candidates
      .map((t) => ({ trade: t, deltaMs: new Date(t.entryTime).getTime() - mainEntryMs }))
      .filter(({ trade, deltaMs }) => trade.parentTradeId === mainTrade._id || Math.abs(deltaMs) <= RECOMMENDED_WINDOW_MS)
      .sort((a, b) => Math.abs(a.deltaMs) - Math.abs(b.deltaMs));
  }, [candidates, mainTrade._id, mainEntryMs]);

  const visibleCandidates = activeTab === "recommended" ? recommended.map((r) => r.trade) : candidates;
  const deltaById = useMemo(() => new Map(recommended.map((r) => [r.trade._id, r.deltaMs])), [recommended]);
  
  // Checked trade IDs: trades that belong to this compilation
  const [checkedIds, setCheckedIds] = useState<string[]>(
    candidates
      .filter((t) => t.parentTradeId === mainTrade._id || (parentTrade.mergedTradeIds?.includes(t._id) && t._id !== currentParentId))
      .map((t) => t._id)
  );

  // Main trade edit fields state
  const [showMainTradeEdit, setShowMainTradeEdit] = useState(false);
  const [editSymbol, setEditSymbol] = useState(mainTrade.symbol);
  const [editDirection, setEditDirection] = useState<"buy" | "sell">(mainTrade.direction);
  const [editLots, setEditLots] = useState(String(mainTrade.lots));
  const [editEntryPrice, setEditEntryPrice] = useState(String(mainTrade.entryPrice));
  const [editExitPrice, setEditExitPrice] = useState(mainTrade.exitPrice ? String(mainTrade.exitPrice) : "");
  const [editSL, setEditSL] = useState(mainTrade.stopLoss ? String(mainTrade.stopLoss) : "");
  const [editTP, setEditTP] = useState(mainTrade.takeProfit ? String(mainTrade.takeProfit) : "");
  const [editTimeframe, setEditTimeframe] = useState(mainTrade.timeframe ?? "");

  const [saving, setSaving] = useState(false);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSwitchMainTrade = (newMainId: string) => {
    setCurrentParentId(newMainId);
    const newMain = allTrades.find((t) => t._id === newMainId);
    if (newMain) {
      setEditSymbol(newMain.symbol);
      setEditDirection(newMain.direction);
      setEditLots(String(newMain.lots));
      setEditEntryPrice(String(newMain.entryPrice));
      setEditExitPrice(newMain.exitPrice ? String(newMain.exitPrice) : "");
      setEditSL(newMain.stopLoss ? String(newMain.stopLoss) : "");
      setEditTP(newMain.takeProfit ? String(newMain.takeProfit) : "");
      setEditTimeframe(newMain.timeframe ?? "");
      setCheckedIds((prev) => prev.filter((id) => id !== newMainId));
    }
  };

  async function handleConfirm() {
    setSaving(true);
    try {
      // 1. Update the main trade's details and mergedTradeIds
      const mainPayload: Record<string, unknown> = {
        symbol: editSymbol.toUpperCase(),
        direction: editDirection,
        lots: parseFloat(editLots) || mainTrade.lots,
        entryPrice: parseFloat(editEntryPrice) || mainTrade.entryPrice,
        exitPrice: editExitPrice ? parseFloat(editExitPrice) : null,
        stopLoss: editSL ? parseFloat(editSL) : null,
        takeProfit: editTP ? parseFloat(editTP) : null,
        timeframe: editTimeframe || undefined,
        mergedTradeIds: checkedIds,
        parentTradeId: null,
      };

      await fetch(`/api/trade/${mainTrade._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mainPayload),
      });

      // 2. Update checked child trades: point parentTradeId to mainTrade._id and share journal info
      const parentRaw = mainTrade as any;
      const childPromises = checkedIds.map((childId) => {
        const child = allTrades.find((t) => t._id === childId);
        const payload: Record<string, unknown> = { parentTradeId: mainTrade._id };
        // Never clobber a child that's already been journaled on its own —
        // this is only a one-time seed for children with no journal yet.
        // Once linked, the PUT route keeps parent/children in sync going
        // forward regardless of which side gets edited next.
        if (!child?.journaled) {
          payload.journaled = parentRaw.journaled ?? false;
          payload.executionChecklist = parentRaw.executionChecklist ?? [];
          payload.screenshots = parentRaw.screenshots ?? [];
          payload.preTradeAnalysis = parentRaw.preTradeAnalysis ?? "";
          payload.postTradeReview = parentRaw.postTradeReview ?? "";
          payload.riskRatio = parentRaw.riskRatio ?? 1;
          payload.rewardRatio = parentRaw.rewardRatio ?? 2;
          payload.emotions = parentRaw.emotions ?? "";
          payload.lessonsLearned = parentRaw.lessonsLearned ?? "";
          payload.tags = parentRaw.tags ?? [];
          payload.rating = parentRaw.rating ?? 5;
        }
        return fetch(`/api/trade/${childId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      });

      // 3. Update unchecked trades that were previously child trades of either parentTrade or mainTrade: unset parentTradeId
      const previouslyChildren = allTrades.filter((t) => t.parentTradeId === parentTrade._id || t.parentTradeId === mainTrade._id);
      const unmergePromises = previouslyChildren
        .filter((t) => !checkedIds.includes(t._id) && t._id !== mainTrade._id)
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
      window.dispatchEvent(new CustomEvent("refresh-trades"));
      onMerged();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#141720] border border-white/10 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/7">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 flex items-center justify-center border border-amber-500/20 text-amber-400">
            <Puzzle className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-white truncate">Compilation: {mainTrade.symbol}</h2>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                MAIN
              </span>
            </div>
            <p className="text-[11px] text-white/35">Select compiled child trades & edit main trade data</p>
          </div>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white/80 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main Trade Quick Editor Section */}
        <div className="bg-white/[0.02] border-b border-white/7 px-5 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">Main Trade Details</span>
            </div>
            <button
              type="button"
              onClick={() => setShowMainTradeEdit(!showMainTradeEdit)}
              className="flex items-center gap-1 text-[11px] text-amber-400/90 hover:text-amber-300 font-medium transition"
            >
              <Edit2 className="h-3 w-3" />
              <span>{showMainTradeEdit ? "Hide Form" : "Edit Main Trade"}</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", showMainTradeEdit && "rotate-180")} />
            </button>
          </div>

          {showMainTradeEdit ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Symbol</label>
                <input
                  type="text"
                  value={editSymbol}
                  onChange={(e) => setEditSymbol(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] font-bold text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Direction</label>
                <div className="flex rounded overflow-hidden border border-white/10 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setEditDirection("buy")}
                    className={cn(
                      "flex-1 py-1 font-bold transition",
                      editDirection === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/40"
                    )}
                  >
                    BUY
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDirection("sell")}
                    className={cn(
                      "flex-1 py-1 font-bold transition",
                      editDirection === "sell" ? "bg-red-500/20 text-red-400" : "bg-white/5 text-white/40"
                    )}
                  >
                    SELL
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Lots</label>
                <input
                  type="number"
                  step="0.01"
                  value={editLots}
                  onChange={(e) => setEditLots(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Timeframe</label>
                <input
                  type="text"
                  placeholder="e.g. M5"
                  value={editTimeframe}
                  onChange={(e) => setEditTimeframe(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Entry Price</label>
                <input
                  type="number"
                  step="any"
                  value={editEntryPrice}
                  onChange={(e) => setEditEntryPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Exit Price</label>
                <input
                  type="number"
                  step="any"
                  value={editExitPrice}
                  onChange={(e) => setEditExitPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Stop Loss</label>
                <input
                  type="number"
                  step="any"
                  value={editSL}
                  onChange={(e) => setEditSL(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <div>
                <label className="text-[9px] text-white/40 font-medium block mb-1">Take Profit</label>
                <input
                  type="number"
                  step="any"
                  value={editTP}
                  onChange={(e) => setEditTP(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500/40"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
              <span>Lots: <b className="text-white">{mainTrade.lots}</b></span>
              <span>Entry: <b className="text-white">${mainTrade.entryPrice}</b></span>
              {mainTrade.exitPrice && <span>Exit: <b className="text-white">${mainTrade.exitPrice}</b></span>}
              {mainTrade.stopLoss && <span>SL: <b className="text-red-400">${mainTrade.stopLoss}</b></span>}
              {mainTrade.takeProfit && <span>TP: <b className="text-emerald-400">${mainTrade.takeProfit}</b></span>}
            </div>
          )}
        </div>

        {/* Recommended / All Trades tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-white/7 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("recommended")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-t-lg border-b-2 -mb-px transition",
              activeTab === "recommended"
                ? "text-amber-400 border-amber-400"
                : "text-white/40 border-transparent hover:text-white/70"
            )}
          >
            <Sparkles className="h-3 w-3" />
            Recommended
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10">{recommended.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-t-lg border-b-2 -mb-px transition",
              activeTab === "all"
                ? "text-amber-400 border-amber-400"
                : "text-white/40 border-transparent hover:text-white/70"
            )}
          >
            <ListFilter className="h-3 w-3" />
            All Trades
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10">{candidates.length}</span>
          </button>
        </div>
        {activeTab === "recommended" && (
          <p className="px-5 pt-2 text-[10px] text-white/30 shrink-0">
            Matched by entry time only (within 2 minutes) — price isn&apos;t part of the match, since a partial fill can print at a different price.
          </p>
        )}

        {/* List of Trades to Compile */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
          {visibleCandidates.length === 0 ? (
            <div className="text-center py-10 text-white/20 text-[12px]">
              {activeTab === "recommended"
                ? "No trades within 2 minutes of the main trade — try the All Trades tab."
                : "No other trades of this instrument to merge with this main trade."}
            </div>
          ) : (
            visibleCandidates.map((trade) => {
              const isChecked = checkedIds.includes(trade._id);
              const hasDifferentParent = trade.parentTradeId && trade.parentTradeId !== mainTrade._id;
              const deltaMs = deltaById.get(trade._id);

              return (
                <div
                  key={trade._id}
                  onClick={() => toggleCheck(trade._id)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition rounded-xl group",
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
                      {activeTab === "recommended" && deltaMs !== undefined && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-white/45"
                          title="Entry time vs. the main trade"
                        >
                          {deltaMs === 0 ? "same time" : formatTimeDelta(deltaMs)}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/35">
                      Lots: {trade.lots} · Entry: ${trade.entryPrice} · {format(parseISO(trade.entryTime), "MMM d, yyyy, HH:mm:ss")}
                    </div>
                  </div>

                  {/* Make Main Trade Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSwitchMainTrade(trade._id);
                    }}
                    className="px-2 py-1 rounded bg-white/5 hover:bg-amber-500/20 text-white/40 hover:text-amber-400 border border-white/10 hover:border-amber-500/30 text-[10px] font-medium transition shrink-0 flex items-center gap-1 opacity-60 group-hover:opacity-100"
                    title="Set this trade as the Main Trade for this compilation"
                  >
                    <Crown className="h-3 w-3" />
                    <span>Set Main</span>
                  </button>
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
            {saving ? "Saving Compilation..." : "Save Compilation & Main Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
