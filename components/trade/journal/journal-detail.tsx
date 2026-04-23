"use client";

import { useState, useEffect, useRef } from "react";
import { format, parseISO } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  CheckSquare,
  Camera,
  FileText,
  RefreshCw,
  Save,
  Plus,
  X,
  Tag,
  Star,
  Brain,
  BookOpen,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  item: string;
  checked: boolean;
}

interface JournalDetailTrade {
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
  journaled: boolean;
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
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function JournalDetail({ trade, onSaved }: JournalDetailProps) {
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
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset when trade changes
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
  }, [trade._id]);

  const toggleCheck = (i: number) => {
    setChecklist((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, checked: !c.checked } : c))
    );
  };

  const addCustomItem = () => {
    if (!customItem.trim()) return;
    setChecklist((prev) => [...prev, { item: customItem.trim(), checked: false }]);
    setCustomItem("");
  };

  const removeCheckItem = (i: number) => {
    setChecklist((prev) => prev.filter((_, idx) => idx !== i));
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
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

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
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  const isWinner = trade.profit > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Trade header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0c0e14] border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400">
            {trade.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-bold text-white">{trade.symbol}</span>
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
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/35 mt-0.5">
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
          <button className="h-8 w-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/5 transition">
            <BarChart2 className="h-3.5 w-3.5" />
            Analytics
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition",
              saved
                ? "bg-emerald-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            )}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Trade summary bar */}
        {trade.exitPrice && (
          <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center text-[9px] font-bold text-amber-400">
                {trade.symbol.slice(0, 2)}
              </div>
              <span className="text-[14px] font-bold text-white">{trade.symbol}</span>
              <span className={cn(
                "text-[11px] font-semibold px-2 py-0.5 rounded",
                trade.direction === "buy" ? "bg-blue-500/15 text-blue-400" : "bg-red-500/15 text-red-400"
              )}>
                {trade.direction === "buy" ? "LONG" : "SHORT"}
              </span>
            </div>
            <div className="flex items-center gap-3 ml-4 text-[12px]">
              <div>
                <span className="text-white/35">ENTRY </span>
                <span className="text-white/70 font-medium">${trade.entryPrice}</span>
              </div>
              <div>
                <span className="text-white/35">EXIT </span>
                <span className="text-white/70 font-medium">${trade.exitPrice}</span>
              </div>
              <div>
                <span className="text-white/35">P&L </span>
                <span className={cn("font-bold", trade.profit >= 0 ? "text-blue-400" : "text-red-400")}>
                  {fmt(trade.profit)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Execution Checklist */}
        <div className="rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-blue-400" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Execution Checklist</span>
            </div>
            <span className="text-[12px] text-white/35">{checkedCount}/{checklist.length}</span>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {checklist.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition group",
                    c.checked
                      ? "bg-blue-600/10 border-blue-500/25"
                      : "bg-white/[0.02] border-white/[0.07] hover:border-white/15"
                  )}
                  onClick={() => toggleCheck(i)}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                    c.checked ? "bg-blue-600 border-blue-500" : "border-white/20"
                  )}>
                    {c.checked && (
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[11px] text-white/60 flex-1">{c.item}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCheckItem(i); }}
                    className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {/* Add custom item */}
            <div className="flex gap-2">
              <input
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomItem()}
                placeholder="Add custom item..."
                className="flex-1 rounded-lg bg-white/5 border border-white/[0.08] px-3 py-2 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 transition"
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
        <div className="rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
            <Camera className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Screenshots</span>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-3">
              {screenshots.map((src, i) => (
                <div key={i} className="relative group w-28 h-20 rounded-lg overflow-hidden border border-white/10">
                  <img src={src} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 h-5 w-5 rounded bg-black/60 flex items-center justify-center text-white transition"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-28 h-20 rounded-lg border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-white/25 hover:text-white/50 hover:border-white/25 transition"
              >
                <Plus className="h-4 w-4" />
                <span className="text-[10px]">Add image</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* Pre-Trade Analysis */}
        <div className="rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
            <FileText className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Pre-Trade Analysis</span>
          </div>
          <div className="p-4">
            <textarea
              value={preTradeAnalysis}
              onChange={(e) => setPreTradeAnalysis(e.target.value)}
              placeholder="What did you see? Plan, thesis, levels, risk..."
              rows={5}
              className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Post-Trade Review */}
        <div className="rounded-xl border border-white/[0.07] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
            <BookOpen className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Post-Trade Review</span>
          </div>
          <div className="p-4">
            <textarea
              value={postTradeReview}
              onChange={(e) => setPostTradeReview(e.target.value)}
              placeholder="What happened? Execution, slippage, improvements..."
              rows={5}
              className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Risk : Reward */}
        <div className="rounded-xl border border-white/[0.07] p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Risk : Reward</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={riskRatio}
              onChange={(e) => setRiskRatio(parseFloat(e.target.value) || 1)}
              min="0.1"
              step="0.1"
              className="w-20 rounded-lg bg-white/5 border border-white/[0.10] px-3 py-2 text-[14px] font-bold text-white text-center focus:outline-none focus:border-blue-500/40 transition"
            />
            <span className="text-[18px] font-bold text-white/30">:</span>
            <input
              type="number"
              value={rewardRatio}
              onChange={(e) => setRewardRatio(parseFloat(e.target.value) || 2)}
              min="0.1"
              step="0.1"
              className="w-20 rounded-lg bg-white/5 border border-white/[0.10] px-3 py-2 text-[14px] font-bold text-blue-400 text-center focus:outline-none focus:border-blue-500/40 transition"
            />
          </div>
        </div>

        {/* Emotions + Lessons Learned */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Emotions</span>
            </div>
            <div className="p-4">
              <textarea
                value={emotions}
                onChange={(e) => setEmotions(e.target.value)}
                placeholder="Calm, anxious, FOMO, confident..."
                rows={3}
                className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
              />
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]">
              <Star className="h-4 w-4 text-amber-400" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Lessons Learned</span>
            </div>
            <div className="p-4">
              <textarea
                value={lessonsLearned}
                onChange={(e) => setLessonsLearned(e.target.value)}
                placeholder="Key takeaways to repeat or avoid..."
                rows={3}
                className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Tags + Rating */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tags */}
          <div className="rounded-xl border border-white/[0.07] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4 text-blue-400" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 text-[11px] bg-blue-600/15 text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-0.5"
                >
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
                className="flex-1 rounded-lg bg-white/5 border border-white/[0.08] px-3 py-2 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 transition"
              />
            </div>
          </div>

          {/* Rating */}
          <div className="rounded-xl border border-white/[0.07] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Rating</span>
              </div>
              <span className="text-[16px] font-bold text-blue-400">{rating}/10</span>
            </div>
            <div className="relative">
              <input
                type="range"
                min="1"
                max="10"
                value={rating}
                onChange={(e) => setRating(parseInt(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ef4444 0%, #eab308 40%, #22c55e 70%, #3b82f6 100%)`,
                }}
              />
              <div className="flex justify-between text-[9px] text-white/25 mt-1">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
