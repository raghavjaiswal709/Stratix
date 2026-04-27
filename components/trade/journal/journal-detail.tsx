"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { TradeChart, type TradeChartRef } from "./trade-chart";
import { format, parseISO } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  CheckSquare,
  Camera,
  FileText,
  Save,
  Plus,
  X,
  Tag,
  Star,
  Brain,
  BookOpen,
  BarChart2,
  Edit2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  item: string;
  checked: boolean;
}

export interface JournalDetailTrade {
  _id: string;
  symbol: string;
  direction: "buy" | "sell";
  lots: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: string;
  exitTime?: string;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  status: "open" | "closed";
  journaled: boolean;
  source?: "manual" | "mt5";
  timeframe?: string;
  executionChecklist: ChecklistItem[];
  screenshots: string[];
  preTradeAnalysis: string;
  postTradeReview: string;
  riskRatio: number;
  rewardRatio: number;
  emotions: string;
  lessonsLearned: string;
  tags: string[];
  rating: number;
}

interface JournalDetailProps {
  trade: JournalDetailTrade;
  onSaved: (updated: JournalDetailTrade) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const TF_OPTIONS = ["1m", "5m", "15m", "30m", "1H", "4H"];

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function JournalDetail({ trade, onSaved, onDirtyChange }: JournalDetailProps) {
  // Journal state
  const [checklist, setChecklist] = useState<ChecklistItem[]>(trade.executionChecklist ?? []);
  const [customItem, setCustomItem] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>(trade.screenshots ?? []);
  const [preTradeAnalysis, setPreTradeAnalysis] = useState(trade.preTradeAnalysis ?? "");
  const [postTradeReview, setPostTradeReview] = useState(trade.postTradeReview ?? "");
  const [riskRatio, setRiskRatio] = useState(trade.riskRatio ?? 1);
  const [rewardRatio, setRewardRatio] = useState(trade.rewardRatio ?? 2);
  const [emotions, setEmotions] = useState(trade.emotions ?? "");
  const [lessonsLearned, setLessonsLearned] = useState(trade.lessonsLearned ?? "");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>(trade.tags ?? []);
  const [rating, setRating] = useState(trade.rating ?? 5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Edit trade state
  const [editOpen, setEditOpen] = useState(false);
  const [editDirection, setEditDirection] = useState<"buy" | "sell">(trade.direction);
  const [editEntryPrice, setEditEntryPrice] = useState(String(trade.entryPrice));
  const [editExitPrice, setEditExitPrice] = useState(trade.exitPrice ? String(trade.exitPrice) : "");
  const [editSL, setEditSL] = useState(trade.stopLoss ? String(trade.stopLoss) : "");
  const [editTP, setEditTP] = useState(trade.takeProfit ? String(trade.takeProfit) : "");
  const [editLots, setEditLots] = useState(String(trade.lots));
  const [editTimeframe, setEditTimeframe] = useState(trade.timeframe ?? "");
  const [editSaving, setEditSaving] = useState(false);

  // Screenshot lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<TradeChartRef>(null);
  const handleSaveRef = useRef<() => void>(() => {});

  const markDirty = useCallback(() => {
    setIsDirty(true);
    onDirtyChange?.(true);
  }, [onDirtyChange]);

  const clearDirty = useCallback(() => {
    setIsDirty(false);
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  // Reset all state when trade switches
  useEffect(() => {
    setChecklist(trade.executionChecklist ?? []);
    setScreenshots(trade.screenshots ?? []);
    setPreTradeAnalysis(trade.preTradeAnalysis ?? "");
    setPostTradeReview(trade.postTradeReview ?? "");
    setRiskRatio(trade.riskRatio ?? 1);
    setRewardRatio(trade.rewardRatio ?? 2);
    setEmotions(trade.emotions ?? "");
    setLessonsLearned(trade.lessonsLearned ?? "");
    setTags(trade.tags ?? []);
    setRating(trade.rating ?? 5);
    setIsDirty(false);
    onDirtyChange?.(false);
    setEditOpen(false);
    setEditDirection(trade.direction);
    setEditEntryPrice(String(trade.entryPrice));
    setEditExitPrice(trade.exitPrice ? String(trade.exitPrice) : "");
    setEditSL(trade.stopLoss ? String(trade.stopLoss) : "");
    setEditTP(trade.takeProfit ? String(trade.takeProfit) : "");
    setEditLots(String(trade.lots));
    setEditTimeframe(trade.timeframe ?? "");
    setLightboxIndex(null);
  }, [trade._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep editTimeframe in sync when timeframe changes via chart's "Set default"
  // (trade._id stays the same, only timeframe changes)
  useEffect(() => {
    setEditTimeframe(trade.timeframe ?? "");
  }, [trade.timeframe]);

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Force-save event from parent (when switching trades with unsaved changes)
  useEffect(() => {
    const handler = () => handleSaveRef.current();
    window.addEventListener("journal-force-save", handler);
    return () => window.removeEventListener("journal-force-save", handler);
  }, []);

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i !== null && i < screenshots.length - 1 ? i + 1 : i));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, screenshots.length]);

  const handleChartScreenshot = useCallback((dataUrl: string) => {
    setScreenshots((prev) => [...prev, dataUrl]);
    markDirty();
  }, [markDirty]);

  const toggleCheck = (i: number) => {
    setChecklist((prev) => prev.map((c, idx) => (idx === i ? { ...c, checked: !c.checked } : c)));
    markDirty();
  };

  const addCustomItem = () => {
    if (!customItem.trim()) return;
    setChecklist((prev) => [...prev, { item: customItem.trim(), checked: false }]);
    setCustomItem("");
    markDirty();
  };

  const removeCheckItem = (i: number) => {
    setChecklist((prev) => prev.filter((_, idx) => idx !== i));
    markDirty();
  };

  const checkedCount = checklist.filter((c) => c.checked).length;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setScreenshots((prev) => [...prev, ev.target!.result as string]);
          markDirty();
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const addTag = () => {
    const trimmed = tagsInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setTagsInput("");
    markDirty();
  };

  const removeTag = (t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
    markDirty();
  };

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/trade/${trade._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journaled: true,
          executionChecklist: checklist,
          screenshots,
          preTradeAnalysis,
          postTradeReview,
          riskRatio,
          rewardRatio,
          emotions,
          lessonsLearned,
          tags,
          rating,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSaved(updated);
        clearDirty();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  // Keep ref current every render so event listener always calls latest save
  handleSaveRef.current = handleSave;

  async function handleApplyEdit() {
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        direction: editDirection,
        lots: parseFloat(editLots) || trade.lots,
        entryPrice: parseFloat(editEntryPrice) || trade.entryPrice,
        // Always include timeframe so user can set or clear it explicitly
        timeframe: editTimeframe,
      };
      if (editExitPrice) body.exitPrice = parseFloat(editExitPrice);
      if (editSL) body.stopLoss = parseFloat(editSL);
      if (editTP) body.takeProfit = parseFloat(editTP);

      const res = await fetch(`/api/trade/${trade._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        onSaved(updated);
        setEditOpen(false);
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSaveTimeframe(interval: string) {
    try {
      const res = await fetch(`/api/trade/${trade._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeframe: interval }),
      });
      if (res.ok) {
        const updated = await res.json();
        onSaved(updated);
      }
    } catch {
      // Save failed silently — chart's local state still shows it but DB didn't save
    }
  }

  const isWinner = trade.profit > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Screenshot lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition z-10"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition text-2xl z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1)); }}
            >
              ‹
            </button>
          )}
          {lightboxIndex < screenshots.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition text-2xl z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => Math.min(screenshots.length - 1, (i ?? 0) + 1)); }}
            >
              ›
            </button>
          )}
          <img
            src={screenshots[lightboxIndex]}
            alt={`Screenshot ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 text-[12px] text-white/50 bg-black/40 px-3 py-1 rounded-full">
            {lightboxIndex + 1} / {screenshots.length}
          </div>
        </div>
      )}

      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400">
            {trade.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[18px] font-bold text-foreground">{trade.symbol}</span>
              {isWinner && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  WINNER
                </span>
              )}
              {!isWinner && trade.status === "closed" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                  LOSER
                </span>
              )}
              {isDirty && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                  Unsaved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
              <span className={trade.direction === "buy" ? "text-blue-400 font-semibold" : "text-red-400 font-semibold"}>
                {trade.direction === "buy" ? "Long" : "Short"}
              </span>
              <span>· Entry ${trade.entryPrice}</span>
              <span>· Size {trade.lots}</span>
              <span>· {format(parseISO(trade.entryTime), "MMM d, yyyy, HH:mm")}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] transition",
              editOpen
                ? "border-blue-500/40 bg-blue-600/10 text-blue-400"
                : "border-border text-muted-foreground hover:text-foreground/80 hover:bg-muted"
            )}
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground/80 hover:bg-muted transition">
            <BarChart2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analytics</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition",
              saved ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
            )}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Edit Trade Panel */}
        {editOpen && (
          <div className="rounded-xl border border-blue-500/25 bg-blue-600/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-500/15">
              <Edit2 className="h-4 w-4 text-blue-400" />
              <span className="text-[12px] font-semibold text-blue-300 uppercase tracking-wider">Edit Trade</span>
              <span className="ml-auto text-[11px] text-blue-400/50">Changes apply immediately</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Direction toggle */}
              <div className="flex rounded-xl bg-muted p-1 gap-1">
                <button
                  onClick={() => setEditDirection("buy")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition",
                    editDirection === "buy" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-muted-foreground hover:text-foreground/70"
                  )}
                >
                  <TrendingUp className="h-3 w-3" /> Long
                </button>
                <button
                  onClick={() => setEditDirection("sell")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition",
                    editDirection === "sell" ? "bg-red-600 text-white shadow-lg shadow-red-500/20" : "text-muted-foreground hover:text-foreground/70"
                  )}
                >
                  <TrendingDown className="h-3 w-3" /> Short
                </button>
              </div>

              {/* Price + size fields */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Entry Price</label>
                  <input
                    type="number" step="any"
                    value={editEntryPrice}
                    onChange={(e) => setEditEntryPrice(e.target.value)}
                    className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-blue-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Exit Price</label>
                  <input
                    type="number" step="any"
                    value={editExitPrice}
                    onChange={(e) => setEditExitPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-blue-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Lots</label>
                  <input
                    type="number" step="any"
                    value={editLots}
                    onChange={(e) => setEditLots(e.target.value)}
                    className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-blue-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-red-400/70 font-semibold mb-1">Stop Loss</label>
                  <input
                    type="number" step="any"
                    value={editSL}
                    onChange={(e) => setEditSL(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-red-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-emerald-400/70 font-semibold mb-1">Take Profit</label>
                  <input
                    type="number" step="any"
                    value={editTP}
                    onChange={(e) => setEditTP(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500/40 transition"
                  />
                </div>
              </div>

              {/* Chart timeframe */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Chart Timeframe</label>
                <div className="flex gap-2 flex-wrap">
                  {TF_OPTIONS.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setEditTimeframe(editTimeframe === tf ? "" : tf)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition",
                        editTimeframe === tf
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-muted border-border text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground/70 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyEdit}
                  disabled={editSaving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-[13px] font-semibold text-white transition disabled:opacity-50"
                >
                  {editSaving ? "Applying…" : "Apply Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trade summary bar */}
        {trade.exitPrice && (
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center text-[9px] font-bold text-amber-400">
                {trade.symbol.slice(0, 2)}
              </div>
              <span className="text-[14px] font-bold text-foreground">{trade.symbol}</span>
              <span className={cn(
                "text-[11px] font-semibold px-2 py-0.5 rounded",
                trade.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"
              )}>
                {trade.direction === "buy" ? "LONG" : "SHORT"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <div><span className="text-muted-foreground">ENTRY </span><span className="text-foreground/70 font-medium">${trade.entryPrice}</span></div>
              <div><span className="text-muted-foreground">EXIT </span><span className="text-foreground/70 font-medium">${trade.exitPrice}</span></div>
              {trade.stopLoss && <div><span className="text-red-400/60">SL </span><span className="text-red-400/80 font-medium">${trade.stopLoss}</span></div>}
              {trade.takeProfit && <div><span className="text-emerald-400/60">TP </span><span className="text-emerald-400/80 font-medium">${trade.takeProfit}</span></div>}
              <div>
                <span className="text-muted-foreground">P&L </span>
                <span className={cn("font-bold", trade.profit >= 0 ? "text-blue-400" : "text-red-400")}>{fmt(trade.profit)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Live Chart */}
        <TradeChart
          ref={chartRef}
          symbol={trade.symbol}
          entryPrice={trade.entryPrice}
          exitPrice={trade.exitPrice}
          entryTime={trade.entryTime}
          exitTime={trade.exitTime}
          stopLoss={trade.stopLoss}
          takeProfit={trade.takeProfit}
          direction={trade.direction}
          defaultInterval={trade.timeframe}
          onSaveInterval={handleSaveTimeframe}
          onScreenshot={handleChartScreenshot}
        />

        {/* Execution Checklist */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-blue-400" />
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Execution Checklist</span>
            </div>
            <span className="text-[12px] text-muted-foreground">{checkedCount}/{checklist.length}</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {checklist.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition group",
                    c.checked ? "bg-blue-600/10 border-blue-500/25" : "bg-muted/20 border-border hover:border-border/80"
                  )}
                  onClick={() => toggleCheck(i)}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                    c.checked ? "bg-blue-600 border-blue-500" : "border-border"
                  )}>
                    {c.checked && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground flex-1">{c.item}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCheckItem(i); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
                placeholder="Add custom item..."
                className="flex-1 rounded-lg bg-muted border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-blue-500/40 transition"
              />
              <button
                onClick={addCustomItem}
                className="px-3 rounded-lg bg-blue-600/20 border border-blue-500/20 text-blue-400 hover:bg-blue-600/30 transition"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Screenshots */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Camera className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Screenshots</span>
            {screenshots.length > 0 && (
              <span className="ml-auto text-[11px] text-muted-foreground">{screenshots.length} image{screenshots.length !== 1 ? "s" : ""} · click to view</span>
            )}
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-3">
              {screenshots.map((src, i) => (
                <div
                  key={i}
                  className="relative group w-28 h-20 rounded-lg overflow-hidden border border-border cursor-pointer"
                  onClick={() => setLightboxIndex(i)}
                >
                  <img src={src} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-[11px] font-semibold transition">View</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setScreenshots((prev) => prev.filter((_, idx) => idx !== i));
                      markDirty();
                    }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 h-5 w-5 rounded bg-black/70 flex items-center justify-center text-white transition"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-28 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground/50 hover:border-border/80 transition"
              >
                <Plus className="h-4 w-4" />
                <span className="text-[10px]">Add image</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            </div>
          </div>
        </div>

        {/* Pre-Trade Analysis */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <FileText className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Pre-Trade Analysis</span>
          </div>
          <div className="p-4">
            <textarea
              value={preTradeAnalysis}
              onChange={(e) => { setPreTradeAnalysis(e.target.value); markDirty(); }}
              placeholder="What did you see? Plan, thesis, levels, risk..."
              rows={5}
              className="w-full bg-transparent text-[13px] text-foreground/75 placeholder:text-muted-foreground/40 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Post-Trade Review */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <BookOpen className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Post-Trade Review</span>
          </div>
          <div className="p-4">
            <textarea
              value={postTradeReview}
              onChange={(e) => { setPostTradeReview(e.target.value); markDirty(); }}
              placeholder="What happened? Execution, slippage, improvements..."
              rows={5}
              className="w-full bg-transparent text-[13px] text-foreground/75 placeholder:text-muted-foreground/40 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Risk : Reward */}
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Risk : Reward</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={riskRatio}
              onChange={(e) => { setRiskRatio(parseFloat(e.target.value) || 1); markDirty(); }}
              min="0.1" step="0.1"
              className="w-20 rounded-lg bg-muted border border-border px-3 py-2 text-[14px] font-bold text-foreground text-center focus:outline-none focus:border-blue-500/40 transition"
            />
            <span className="text-[18px] font-bold text-muted-foreground">:</span>
            <input
              type="number"
              value={rewardRatio}
              onChange={(e) => { setRewardRatio(parseFloat(e.target.value) || 2); markDirty(); }}
              min="0.1" step="0.1"
              className="w-20 rounded-lg bg-muted border border-border px-3 py-2 text-[14px] font-bold text-blue-400 text-center focus:outline-none focus:border-blue-500/40 transition"
            />
          </div>
        </div>

        {/* Emotions + Lessons Learned */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Emotions</span>
            </div>
            <div className="p-4">
              <textarea
                value={emotions}
                onChange={(e) => { setEmotions(e.target.value); markDirty(); }}
                placeholder="Calm, anxious, FOMO, confident..."
                rows={3}
                className="w-full bg-transparent text-[13px] text-foreground/75 placeholder:text-muted-foreground/40 resize-none focus:outline-none"
              />
            </div>
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Star className="h-4 w-4 text-amber-400" />
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Lessons Learned</span>
            </div>
            <div className="p-4">
              <textarea
                value={lessonsLearned}
                onChange={(e) => { setLessonsLearned(e.target.value); markDirty(); }}
                placeholder="Key takeaways to repeat or avoid..."
                rows={3}
                className="w-full bg-transparent text-[13px] text-foreground/75 placeholder:text-muted-foreground/40 resize-none focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Tags + Rating */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4 text-blue-400" />
              <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 text-[11px] bg-blue-600/15 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-0.5">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-red-400 transition">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder="breakout, trend, news (press Enter)"
                className="flex-1 rounded-lg bg-muted border border-border px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-blue-500/40 transition"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Rating</span>
              </div>
              <span className="text-[16px] font-bold text-blue-400">{rating}/10</span>
            </div>
            <div className="relative">
              <input
                type="range" min="1" max="10" value={rating}
                onChange={(e) => { setRating(parseInt(e.target.value)); markDirty(); }}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #ef4444 0%, #eab308 40%, #22c55e 70%, #3b82f6 100%)` }}
              />
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>
          </div>
        </div>

        {/* Unsaved changes sticky footer */}
        {isDirty && (
          <div className="sticky bottom-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-[12px] text-amber-300">You have unsaved changes</span>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[12px] font-semibold text-black transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Now"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
