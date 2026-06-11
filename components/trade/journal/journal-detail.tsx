"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Trash2,
  LineChart,
  Puzzle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppContext } from "@/lib/context";
import { MergeModal } from "../trades/merge-modal";

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
  _deleted?: boolean;
  parentTradeId?: string;
  mergedTradeIds?: string[];
}

interface JournalDetailProps {
  trade: JournalDetailTrade;
  onSaved: (updated: JournalDetailTrade) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

const TF_OPTIONS = ["1m", "5m", "15m", "30m", "1H", "4H"];

const EMOTION_TAGS = [
  { name: "Calm", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { name: "Confident", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { name: "Disciplined", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" },
  { name: "Patient", color: "text-teal-400 bg-teal-500/10 border-teal-500/20" },
  { name: "FOMO", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  { name: "Anxious", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { name: "Greedy", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { name: "Fearful", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { name: "Impatient", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  { name: "Hesitant", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  { name: "Frustrated", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  { name: "Euphoric", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  { name: "Regretful", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
  { name: "Bored", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" }
];

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function JournalDetail({ trade, onSaved, onDirtyChange }: JournalDetailProps) {
  const { sharedTrades, preferences } = useAppContext();

  // Chart visibility state
  const [showChart, setShowChart] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  // Analytics AI modal states
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsDuration, setAnalyticsDuration] = useState<"today" | "week" | "month" | "all">("week");
  const [copied, setCopied] = useState(false);

  // Journal state
  const [aPlusLevel, setAPlusLevel] = useState(false);
  const [otherLevels, setOtherLevels] = useState(false);
  const [otherLevelsValue, setOtherLevelsValue] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [confirmationValues, setConfirmationValues] = useState<string[]>([]);
  const [riskFree, setRiskFree] = useState(false);
  const [riskManagement, setRiskManagement] = useState(false);
  const [news, setNews] = useState(false);
  const [multiTimeframe, setMultiTimeframe] = useState(false);
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
    const rawChecklist = trade.executionChecklist ?? [];
    const hasAPlus = rawChecklist.find(c => c.item === "A+ level")?.checked ?? false;
    const hasOther = rawChecklist.find(c => c.item === "Other Levels")?.checked ?? false;
    const otherValItem = rawChecklist.find(c => c.item.startsWith("Other Level: ") && c.checked);
    const otherVal = otherValItem ? otherValItem.item.replace("Other Level: ", "") : "";
    
    const hasConf = rawChecklist.find(c => c.item === "Confirmation" || c.item === "confirnation")?.checked ?? false;
    const confVals = rawChecklist
      .filter(c => c.item.startsWith("Confirmation: ") && c.checked)
      .map(c => c.item.replace("Confirmation: ", ""));
      
    const hasRiskFree = rawChecklist.find(c => c.item === "RiskFree" || c.item === "Risk Free")?.checked ?? false;
    const hasRiskMgmt = rawChecklist.find(c => c.item === "Risk Management" || c.item === "RIsk Management")?.checked ?? false;
    const hasNews = rawChecklist.find(c => c.item === "News")?.checked ?? false;
    const hasMultiTF = rawChecklist.find(c => c.item === "Multi timeframe analysis" || c.item === "multi timeframe analysis")?.checked ?? false;

    setAPlusLevel(hasAPlus);
    setOtherLevels(hasOther);
    setOtherLevelsValue(otherVal);
    setConfirmation(hasConf);
    setConfirmationValues(confVals);
    setRiskFree(hasRiskFree);
    setRiskManagement(hasRiskMgmt);
    setNews(hasNews);
    setMultiTimeframe(hasMultiTF);
    
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
    setShowChart(false);
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

  // Global paste handler to paste images directly from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              setScreenshots((prev) => [...prev, event.target!.result as string]);
              markDirty();
            }
          };
          reader.readAsDataURL(file);
          e.preventDefault();
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [markDirty]);

  const handleChartScreenshot = useCallback((dataUrl: string) => {
    setScreenshots((prev) => [...prev, dataUrl]);
    markDirty();
  }, [markDirty]);

  const toggleAPlus = () => {
    setAPlusLevel(!aPlusLevel);
    markDirty();
  };

  const toggleOtherLevels = () => {
    const next = !otherLevels;
    setOtherLevels(next);
    if (!next) {
      setOtherLevelsValue("");
    }
    markDirty();
  };
  
  const selectOtherLevelValue = (val: string) => {
    setOtherLevelsValue(val);
    markDirty();
  };

  const toggleConfirmation = () => {
    const next = !confirmation;
    setConfirmation(next);
    if (!next) {
      setConfirmationValues([]);
    }
    markDirty();
  };

  const toggleConfirmationValue = (val: string) => {
    setConfirmationValues(prev => {
      let next;
      if (prev.includes(val)) {
        next = prev.filter(v => v !== val);
      } else {
        next = [...prev, val];
      }
      if (next.length > 0) {
        setConfirmation(true);
      }
      return next;
    });
    markDirty();
  };

  const toggleRiskFree = () => {
    setRiskFree(!riskFree);
    markDirty();
  };

  const toggleRiskManagement = () => {
    setRiskManagement(!riskManagement);
    markDirty();
  };

  const toggleNews = () => {
    setNews(!news);
    markDirty();
  };

  const toggleMultiTimeframe = () => {
    setMultiTimeframe(!multiTimeframe);
    markDirty();
  };

  const toggleEmotionTag = (tag: string) => {
    const current = emotions
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    const tagLower = tag.toLowerCase();
    
    const index = current.findIndex(e => e.toLowerCase() === tagLower);
    let next: string[];
    if (index >= 0) {
      next = current.filter((_, i) => i !== index);
    } else {
      next = [...current, tag];
    }
    setEmotions(next.join(", "));
    markDirty();
  };

  const checkedCount = [
    aPlusLevel,
    otherLevels,
    confirmation,
    riskFree,
    riskManagement,
    news,
    multiTimeframe
  ].filter(Boolean).length;

  const totalChecklistItemsCount = 7;

  const sortedCandidates = useMemo(() => {
    const journalPrefs = preferences.journalSortFilter ?? {
      sortBy: "date",
      sortDir: "desc",
      filterSymbol: "",
      filterDirection: "all",
      filterOutcome: "all",
    };

    return [...sharedTrades]
      .filter((t) => {
        if (t._deleted) return false;
        if (t.parentTradeId && t.parentTradeId !== trade._id) return false;
        if (journalPrefs.filterSymbol && !t.symbol.toLowerCase().includes(journalPrefs.filterSymbol.toLowerCase())) return false;
        if (journalPrefs.filterDirection !== "all" && t.direction !== journalPrefs.filterDirection) return false;
        if (journalPrefs.filterOutcome !== "all") {
          if (journalPrefs.filterOutcome === "winner" && t.profit <= 0) return false;
          if (journalPrefs.filterOutcome === "loser" && (t.profit >= 0 || t.status === "open")) return false;
          if (journalPrefs.filterOutcome === "open" && t.status !== "open") return false;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        const sortBy = journalPrefs.sortBy;
        const sortDir = journalPrefs.sortDir;
        if (sortBy === "date") cmp = new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime();
        else if (sortBy === "pnl") cmp = a.profit - b.profit;
        else if (sortBy === "symbol") cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [sharedTrades, trade._id, preferences.journalSortFilter]);

  const filteredTradesForAnalytics = useMemo(() => {
    const now = new Date();
    return sharedTrades.filter((t) => {
      if (t._deleted) return false;
      const entryDate = new Date(t.entryTime);
      const diffTime = now.getTime() - entryDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);

      if (analyticsDuration === "today") {
        const todayStr = format(now, "yyyy-MM-dd");
        const entryStr = format(entryDate, "yyyy-MM-dd");
        return todayStr === entryStr;
      }
      if (analyticsDuration === "week") {
        return diffDays <= 7;
      }
      if (analyticsDuration === "month") {
        return diffDays <= 30;
      }
      return true; // "all"
    });
  }, [sharedTrades, analyticsDuration]);

  const analyticsJsonString = useMemo(() => {
    const cleaned = filteredTradesForAnalytics.map((t) => ({
      symbol: t.symbol,
      direction: t.direction,
      lots: t.lots,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      profit: t.profit,
      status: t.status,
      timeframe: t.timeframe,
      executionChecklist: t.executionChecklist?.map((c) => ({
        item: c.item,
        checked: c.checked
      })),
      preTradeAnalysis: t.preTradeAnalysis,
      postTradeReview: t.postTradeReview,
      riskRatio: t.riskRatio,
      rewardRatio: t.rewardRatio,
      emotions: t.emotions,
      lessonsLearned: t.lessonsLearned,
      tags: t.tags,
      rating: t.rating
    }));
    return JSON.stringify(cleaned, null, 2);
  }, [filteredTradesForAnalytics]);

  const analyticsPrompt = useMemo(() => {
    return `You are an expert trading psychologist, coach, and risk analyst. Analyze my trading and journaling data for the selected period to help me identify mistakes, improve execution, and optimize my trading plan.

Below is the JSON data of my trades and journal entries:
\`\`\`json
${analyticsJsonString}
\`\`\`

Please analyze this data and generate a detailed report:
1. **Performance Summary**: Key metrics including win rate, net P&L, average profit/loss, and most traded symbols/timeframes.
2. **Execution Review**: Compliance rate on checklist items. Highlight any specific checks that are frequently skipped.
3. **Psychology & Emotions**: Patterns in my emotional state. Identify common emotional triggers (e.g., FOMO, anxiety) and their direct impact on my P&L.
4. **Mistakes & Takeaways**: Highlight repeating mistakes, bad risk management behaviors, and main lessons learned.
5. **Actionable Recommendations**: 3-5 concrete rules or habits I must implement to improve my trading discipline and profitability.`;
  }, [analyticsJsonString]);

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
    const compiledChecklist: ChecklistItem[] = [
      { item: "A+ level", checked: aPlusLevel },
      { item: "Other Levels", checked: otherLevels },
      ...(otherLevels && otherLevelsValue ? [{ item: `Other Level: ${otherLevelsValue}`, checked: true }] : []),
      { item: "Confirmation", checked: confirmation },
      ...(confirmation ? confirmationValues.map(v => ({ item: `Confirmation: ${v}`, checked: true })) : []),
      { item: "RiskFree", checked: riskFree },
      { item: "Risk Management", checked: riskManagement },
      { item: "News", checked: news },
      { item: "Multi timeframe analysis", checked: multiTimeframe }
    ];

    try {
      const res = await fetch(`/api/trade/${trade._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journaled: true,
          executionChecklist: compiledChecklist,
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
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0c0e14] border-b border-white/7">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400">
            {trade.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[18px] font-bold text-white">{trade.symbol}</span>
              {trade._deleted && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/8 text-white/40 border border-white/10">
                  DELETED
                </span>
              )}
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
            <div className="flex items-center gap-2 text-[11px] text-white/35 mt-0.5">
              <span className={trade.direction === "buy" ? "text-white/65 font-semibold" : "text-red-400 font-semibold"}>
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
            onClick={() => setShowChart((s) => !s)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] transition",
              showChart
                ? "border-amber-500/35 bg-amber-500/10 text-amber-400"
                : "border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5"
            )}
          >
            <LineChart className="h-3.5 w-3.5" />
            {showChart ? "Hide Chart" : "Show Chart"}
          </button>
          <button
            onClick={() => setEditOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] transition",
              editOpen
                ? "border-white/[0.15] bg-white/[0.05] text-white/65"
                : "border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5"
            )}
          >
            <Edit2 className="h-3.5 w-3.5" />
            Edit
          </button>
          {!trade.parentTradeId && (
            <button
              onClick={() => setMergeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/5 transition"
            >
              <Puzzle className="h-3.5 w-3.5" />
              Merge
            </button>
          )}
          <button
            onClick={() => setAnalyticsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/5 transition"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Analytics</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition",
              saved ? "bg-emerald-600 text-white" : "bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-white"
            )}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Deleted trade banner */}
        {trade._deleted && (
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <Trash2 className="h-4 w-4 text-white/40 shrink-0" />
            <p className="text-[12px] text-white/50">
              This trade was deleted from the Trades page. Journal notes are preserved for reference.
            </p>
          </div>
        )}

        {/* Edit Trade Panel */}
        {editOpen && (
          <div className="rounded-xl border border-white/[0.10] bg-white/[0.03] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
              <Edit2 className="h-4 w-4 text-white/65" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Edit Trade</span>
              <span className="ml-auto text-[11px] text-white/65/50">Changes apply immediately</span>
            </div>
            <div className="p-4 space-y-4">
              {/* Direction toggle */}
              <div className="flex rounded-xl bg-white/5 p-1 gap-1">
                <button
                  onClick={() => setEditDirection("buy")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition",
                    editDirection === "buy" ? "bg-white/[0.09] text-white shadow-lg " : "text-white/40 hover:text-white/70"
                  )}
                >
                  <TrendingUp className="h-3 w-3" /> Long
                </button>
                <button
                  onClick={() => setEditDirection("sell")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition",
                    editDirection === "sell" ? "bg-red-600 text-white shadow-lg shadow-red-500/20" : "text-white/40 hover:text-white/70"
                  )}
                >
                  <TrendingDown className="h-3 w-3" /> Short
                </button>
              </div>

              {/* Price + size fields */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Entry Price</label>
                  <input
                    type="number" step="any"
                    value={editEntryPrice}
                    onChange={(e) => setEditEntryPrice(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/[0.25] transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Exit Price</label>
                  <input
                    type="number" step="any"
                    value={editExitPrice}
                    onChange={(e) => setEditExitPrice(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Lots</label>
                  <input
                    type="number" step="any"
                    value={editLots}
                    onChange={(e) => setEditLots(e.target.value)}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/[0.25] transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-red-400/70 font-semibold mb-1">Stop Loss</label>
                  <input
                    type="number" step="any"
                    value={editSL}
                    onChange={(e) => setEditSL(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/40 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-emerald-400/70 font-semibold mb-1">Take Profit</label>
                  <input
                    type="number" step="any"
                    value={editTP}
                    onChange={(e) => setEditTP(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition"
                  />
                </div>
              </div>

              {/* Chart timeframe */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-2">Chart Timeframe</label>
                <div className="flex gap-2 flex-wrap">
                  {TF_OPTIONS.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setEditTimeframe(editTimeframe === tf ? "" : tf)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition",
                        editTimeframe === tf
                          ? "bg-white/[0.09] border-white/30 text-white"
                          : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white"
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
                  className="px-4 py-2 rounded-lg border border-white/10 text-[12px] text-white/40 hover:text-white/70 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyEdit}
                  disabled={editSaving}
                  className="px-4 py-2 rounded-lg bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-[13px] font-semibold text-white transition disabled:opacity-50"
                >
                  {editSaving ? "Applying…" : "Apply Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trade summary bar */}
        {trade.exitPrice && (
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-white/3 border border-white/7">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-amber-500/15 flex items-center justify-center text-[9px] font-bold text-amber-400">
                {trade.symbol.slice(0, 2)}
              </div>
              <span className="text-[14px] font-bold text-white">{trade.symbol}</span>
              <span className={cn(
                "text-[11px] font-semibold px-2 py-0.5 rounded",
                trade.direction === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
              )}>
                {trade.direction === "buy" ? "LONG" : "SHORT"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <div><span className="text-white/35">ENTRY </span><span className="text-white/70 font-medium">${trade.entryPrice}</span></div>
              <div><span className="text-white/35">EXIT </span><span className="text-white/70 font-medium">${trade.exitPrice}</span></div>
              {trade.stopLoss && <div><span className="text-red-400/60">SL </span><span className="text-red-400/80 font-medium">${trade.stopLoss}</span></div>}
              {trade.takeProfit && <div><span className="text-emerald-400/60">TP </span><span className="text-emerald-400/80 font-medium">${trade.takeProfit}</span></div>}
              <div>
                <span className="text-white/35">P&L </span>
                <span className={cn("font-bold", trade.profit >= 0 ? "text-emerald-400" : "text-red-400")}>{fmt(trade.profit)}</span>
              </div>
            </div>
          </div>
        )}


        {/* Execution Checklist */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/7">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-white/65" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Execution Checklist</span>
            </div>
            <span className="text-[12px] text-white/35">{checkedCount}/{totalChecklistItemsCount}</span>
          </div>
          <div className="p-4 space-y-4">
            {/* Main Predefined Checklist Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {/* 1. A+ Level */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                  aPlusLevel ? "bg-white/[0.05] border-white/[0.15]" : "bg-white/2 border-white/7 hover:border-white/15"
                )}
                onClick={toggleAPlus}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                  aPlusLevel ? "bg-white/[0.09] border-white/30" : "border-white/20"
                )}>
                  {aPlusLevel && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-white/60 flex-1">A+ Level</span>
              </div>

              {/* 2. Other Levels Checkbox */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                  otherLevels ? "bg-white/[0.05] border-white/[0.15]" : "bg-white/2 border-white/7 hover:border-white/15"
                )}
                onClick={toggleOtherLevels}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                  otherLevels ? "bg-white/[0.09] border-white/30" : "border-white/20"
                )}>
                  {otherLevels && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-white/60 flex-1">Other Levels</span>
              </div>

              {/* 3. Confirmation Checkbox */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                  confirmation ? "bg-white/[0.05] border-white/[0.15]" : "bg-white/2 border-white/7 hover:border-white/15"
                )}
                onClick={toggleConfirmation}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                  confirmation ? "bg-white/[0.09] border-white/30" : "border-white/20"
                )}>
                  {confirmation && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-white/60 flex-1">Confirmation</span>
              </div>

              {/* 4. RiskFree */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                  riskFree ? "bg-white/[0.05] border-white/[0.15]" : "bg-white/2 border-white/7 hover:border-white/15"
                )}
                onClick={toggleRiskFree}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                  riskFree ? "bg-white/[0.09] border-white/30" : "border-white/20"
                )}>
                  {riskFree && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-white/60 flex-1">Risk Free</span>
              </div>

              {/* 5. Risk Management */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                  riskManagement ? "bg-white/[0.05] border-white/[0.15]" : "bg-white/2 border-white/7 hover:border-white/15"
                )}
                onClick={toggleRiskManagement}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                  riskManagement ? "bg-white/[0.09] border-white/30" : "border-white/20"
                )}>
                  {riskManagement && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-white/60 flex-1">Risk Management</span>
              </div>

              {/* 6. News */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                  news ? "bg-white/[0.05] border-white/[0.15]" : "bg-white/2 border-white/7 hover:border-white/15"
                )}
                onClick={toggleNews}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                  news ? "bg-white/[0.09] border-white/30" : "border-white/20"
                )}>
                  {news && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-white/60 flex-1">News</span>
              </div>

              {/* 7. Multi timeframe analysis */}
              <div
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                  multiTimeframe ? "bg-white/[0.05] border-white/[0.15]" : "bg-white/2 border-white/7 hover:border-white/15"
                )}
                onClick={toggleMultiTimeframe}
              >
                <div className={cn(
                  "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition",
                  multiTimeframe ? "bg-white/[0.09] border-white/30" : "border-white/20"
                )}>
                  {multiTimeframe && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-white/60 flex-1">Multi Timeframe Analysis</span>
              </div>
            </div>

            {/* Conditional Sub-tags (Other Levels) */}
            {otherLevels && (
              <div className="flex flex-wrap items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <span className="text-[10px] text-white/45 font-medium tracking-wide uppercase">Other Levels:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["SBR/RBS", "DB/DT", "Level 3", "Level 4", "TJL1"].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => selectOtherLevelValue(otherLevelsValue === lvl ? "" : lvl)}
                      className={cn(
                        "px-2.5 py-1 rounded text-[10px] font-medium transition-all border",
                        otherLevelsValue === lvl
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-400 font-semibold shadow-md border-transparent"
                          : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conditional Sub-tags (Confirmation) */}
            {confirmation && (
              <div className="flex flex-wrap items-center gap-2.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <span className="text-[10px] text-white/45 font-medium tracking-wide uppercase">Confirmation:</span>
                <div className="flex flex-wrap gap-1.5">
                  {["Candle confirmation", "Choch confirmation"].map((conf) => {
                    const isActive = confirmationValues.includes(conf);
                    return (
                      <button
                        key={conf}
                        type="button"
                        onClick={() => toggleConfirmationValue(conf)}
                        className={cn(
                          "px-2.5 py-1 rounded text-[10px] font-medium transition-all border",
                          isActive
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-400 font-semibold shadow-md border-transparent"
                            : "bg-white/5 border-white/10 text-white/50 hover:text-white/80 hover:border-white/20"
                        )}
                      >
                        {conf}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Screenshots */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Camera className="h-4 w-4 text-white/65" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Screenshots</span>
            {screenshots.length > 0 && (
              <span className="ml-auto text-[11px] text-white/30">{screenshots.length} image{screenshots.length !== 1 ? "s" : ""} · click to view</span>
            )}
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-3">
              {screenshots.map((src, i) => (
                <div
                  key={i}
                  className="relative group w-28 h-20 rounded-lg overflow-hidden border border-white/10 cursor-pointer"
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
                className="w-28 h-20 rounded-lg border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-white/25 hover:text-white/50 hover:border-white/25 transition"
              >
                <Plus className="h-4 w-4" />
                <span className="text-[10px]">Add image</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            </div>
          </div>
        </div>

        {/* Pre-Trade Analysis */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <FileText className="h-4 w-4 text-white/65" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Pre-Trade Analysis</span>
          </div>
          <div className="p-4">
            <textarea
              value={preTradeAnalysis}
              onChange={(e) => { setPreTradeAnalysis(e.target.value); markDirty(); }}
              placeholder="What did you see? Plan, thesis, levels, risk..."
              rows={5}
              className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Post-Trade Review */}
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <BookOpen className="h-4 w-4 text-white/65" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Post-Trade Review</span>
          </div>
          <div className="p-4">
            <textarea
              value={postTradeReview}
              onChange={(e) => { setPostTradeReview(e.target.value); markDirty(); }}
              placeholder="What happened? Execution, slippage, improvements..."
              rows={5}
              className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Risk : Reward */}
        <div className="rounded-xl border border-white/7 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-white/65" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Risk : Reward</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={riskRatio}
              onChange={(e) => { setRiskRatio(parseFloat(e.target.value) || 1); markDirty(); }}
              min="0.1" step="0.1"
              className="w-20 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[14px] font-bold text-white text-center focus:outline-none focus:border-white/[0.25] transition"
            />
            <span className="text-[18px] font-bold text-white/30">:</span>
            <input
              type="number"
              value={rewardRatio}
              onChange={(e) => { setRewardRatio(parseFloat(e.target.value) || 2); markDirty(); }}
              min="0.1" step="0.1"
              className="w-20 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[14px] font-bold text-white/65 text-center focus:outline-none focus:border-white/[0.25] transition"
            />
          </div>
        </div>

        {/* Emotions + Lessons Learned */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Brain className="h-4 w-4 text-white/55" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Emotions</span>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                value={emotions}
                onChange={(e) => { setEmotions(e.target.value); markDirty(); }}
                placeholder="Calm, anxious, FOMO, confident..."
                rows={3}
                className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
              />
              
              <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-white/5">
                {EMOTION_TAGS.map((tag) => {
                  const currentList = emotions
                    .split(",")
                    .map((e) => e.trim().toLowerCase())
                    .filter((e) => e.length > 0);
                  const isSelected = currentList.includes(tag.name.toLowerCase());
                  return (
                    <button
                      key={tag.name}
                      type="button"
                      onClick={() => toggleEmotionTag(tag.name)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border",
                        isSelected
                          ? tag.color + " font-semibold shadow-sm border-transparent"
                          : "bg-white/5 border-white/8 text-white/40 hover:text-white/80 hover:border-white/20"
                      )}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Star className="h-4 w-4 text-amber-400" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Lessons Learned</span>
            </div>
            <div className="p-4">
              <textarea
                value={lessonsLearned}
                onChange={(e) => { setLessonsLearned(e.target.value); markDirty(); }}
                placeholder="Key takeaways to repeat or avoid..."
                rows={3}
                className="w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Tags + Rating */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/7 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4 text-white/65" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 text-[11px] bg-white/[0.08] text-white border border-white/[0.10] rounded-full px-2.5 py-0.5">
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
                className="flex-1 rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.25] transition"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/7 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Rating</span>
              </div>
              <span className="text-[16px] font-bold text-white/65">{rating}/10</span>
            </div>
            <div className="relative">
              <input
                type="range" min="1" max="10" value={rating}
                onChange={(e) => { setRating(parseInt(e.target.value)); markDirty(); }}
                className="w-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${
                    rating <= 3 ? "#ef4444" : rating <= 6 ? "#eab308" : rating <= 8 ? "#22c55e" : "#10b981"
                  } ${((rating - 1) / 9) * 100}%, rgba(255,255,255,0.08) ${((rating - 1) / 9) * 100}%)`
                }}
              />
              <div className="flex justify-between text-[9px] text-white/25 mt-1">
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Chart (if toggled on) */}
        {showChart && (
          <div className="rounded-xl border border-white/7 p-4 bg-white/3 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Live Chart</span>
              <button
                onClick={() => setShowChart(false)}
                className="text-[11px] text-white/40 hover:text-red-400 transition"
              >
                Hide Chart
              </button>
            </div>
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
          </div>
        )}

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

      {/* Analytics AI Modal */}
      {analyticsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-[15px] font-semibold text-card-foreground">AI Analytics Assistant</h3>
              <button
                onClick={() => { setAnalyticsOpen(false); setCopied(false); }}
                className="text-muted-foreground hover:text-foreground/60 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <p className="text-[12px] text-muted-foreground">
                Select a duration to fetch your trade and journaling history. We've formatted it into a clean JSON layout and pre-compiled a prompt for AI chatbot analysis.
              </p>
              
              {/* Duration tabs */}
              <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5 w-fit">
                {([
                  { label: "Today", value: "today" },
                  { label: "Last Week", value: "week" },
                  { label: "Last Month", value: "month" },
                  { label: "All Time", value: "all" },
                ] as const).map((d) => (
                  <button
                    key={d.value}
                    onClick={() => { setAnalyticsDuration(d.value); setCopied(false); }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition",
                      analyticsDuration === d.value
                        ? "bg-white/[0.09] text-white shadow-lg"
                        : "text-white/40 hover:text-white/70"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-white/35 font-medium">
                Found {filteredTradesForAnalytics.length} trade{filteredTradesForAnalytics.length !== 1 ? "s" : ""} for this duration.
              </div>

              {/* Prompt box */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold">
                  Compiled Prompt &amp; Data
                </label>
                <div className="relative group">
                  <pre className="bg-black/40 text-[11px] text-white/70 p-3 rounded-lg overflow-y-auto max-h-[35vh] whitespace-pre-wrap font-mono border border-white/5">
                    {analyticsPrompt}
                  </pre>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => { setAnalyticsOpen(false); setCopied(false); }}
                className="px-4 py-2 rounded-lg border border-white/10 text-[12px] text-white/40 hover:text-white/70 transition"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(analyticsPrompt);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch (e) {
                    console.error("Failed to copy", e);
                  }
                }}
                className={cn(
                  "px-4 py-2 rounded-lg text-[12px] font-semibold transition flex items-center gap-1.5",
                  copied
                    ? "bg-emerald-600 text-white animate-pulse"
                    : "bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-white"
                )}
              >
                {copied ? "Copied!" : "Copy Prompt for AI"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeOpen && (
        <MergeModal
          parentTrade={trade as any}
          allTrades={sortedCandidates as any}
          onClose={() => setMergeOpen(false)}
          onMerged={() => {
            setMergeOpen(false);
            window.dispatchEvent(new CustomEvent("refresh-trades"));
          }}
        />
      )}
    </div>
  );
}
