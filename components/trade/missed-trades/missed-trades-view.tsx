"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppContext } from "@/lib/context";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Plus,
  X,
  Save,
  Camera,
  TrendingUp,
  TrendingDown,
  Tag,
  BookOpen,
  Target,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyzingOverlay, RefineDiff, RefineIconButton } from "@/components/trade/journal/ai-refine";

type Outcome = "hit-tp" | "hit-sl" | "partial" | "still-open" | "unknown";
type Direction = "buy" | "sell";

interface MissedTrade {
  _id: string;
  symbol: string;
  direction: Direction;
  date: string;
  timeframe?: string;
  idealEntry: number;
  idealSL?: number;
  idealTP?: number;
  estimatedRR?: number;
  potentialPips?: number;
  reasonMissed: string;
  setup?: string;
  outcome: Outcome;
  outcomeNotes?: string;
  analysis: string;
  lessonsLearned: string;
  screenshots: string[];
  tags: string[];
}

const OUTCOME_CONFIG: Record<Outcome, { label: string; color: string }> = {
  "hit-tp":    { label: "Hit TP",     color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
  "hit-sl":    { label: "Hit SL",     color: "text-red-400 bg-red-500/10 border-red-500/25" },
  "partial":   { label: "Partial",    color: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
  "still-open":{ label: "Still Open", color: "text-white/60 bg-white/5 border-white/15" },
  "unknown":   { label: "Unknown",    color: "text-white/35 bg-white/3 border-white/10" },
};

const TF_OPTIONS = ["1m", "5m", "15m", "30m", "1H", "4H", "D1"];

const MISS_REASONS = [
  "Hesitation", "Not at screen", "Woke up late", "In another trade",
  "Missed the entry", "No confirmation", "Distracted", "News conflict",
  "Fear", "Risk too high", "Overtrading block",
];

const EMPTY_FORM = {
  symbol: "",
  direction: "buy" as Direction,
  date: new Date().toISOString().slice(0, 16),
  timeframe: "",
  idealEntry: "",
  idealSL: "",
  idealTP: "",
  estimatedRR: "",
  potentialPips: "",
  reasonMissed: "",
  setup: "",
  outcome: "unknown" as Outcome,
  outcomeNotes: "",
  analysis: "",
  lessonsLearned: "",
  tags: [] as string[],
  screenshots: [] as string[],
};

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

type MissedRefineField = "outcomeNotes" | "analysis" | "lessonsLearned";

const MISSED_REFINE_LABELS: Record<MissedRefineField, string> = {
  outcomeNotes: "what happened notes",
  analysis: "missed trade analysis",
  lessonsLearned: "lessons learned",
};

function MissedTradeList({
  trades,
  selectedId,
  onSelect,
  onNew,
}: {
  trades: MissedTrade[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col h-full w-full shrink-0 border-r border-white/7 md:w-72">
      <div className="px-4 py-3 border-b border-white/7 flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-white">Missed Trades</h2>
          <p className="text-[10px] text-white/35 mt-0.5">{trades.length} logged</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.13] border border-white/[0.10] text-[11px] font-semibold text-white transition"
        >
          <Plus className="h-3 w-3" /> Log Missed
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-white/25 gap-2">
            <Eye className="h-8 w-8 opacity-30" />
            <p className="text-[12px]">No missed trades logged</p>
            <p className="text-[10px] text-white/20">Track setups you didn&apos;t take</p>
          </div>
        ) : (
          trades.map((t) => {
            const outcome = OUTCOME_CONFIG[t.outcome];
            const isWouldHaveWon = t.outcome === "hit-tp";
            return (
              <div
                key={t._id}
                onClick={() => onSelect(t._id)}
                className={cn(
                  "w-full text-left px-4 py-3.5 border-b border-white/5 transition hover:bg-white/3 cursor-pointer flex items-start gap-3",
                  selectedId === t._id && "bg-white/[0.05] border-l-2 border-l-amber-400/50"
                )}
              >
                <div className={cn(
                  "h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold",
                  isWouldHaveWon ? "bg-emerald-500/15 text-emerald-400" : "bg-white/8 text-white/45"
                )}>
                  {t.symbol.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[13px] font-semibold text-white truncate">{t.symbol}</span>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0", outcome.color)}>
                      {outcome.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn("text-[10px] font-semibold", t.direction === "buy" ? "text-emerald-400" : "text-red-400")}>
                      {t.direction === "buy" ? "Long" : "Short"}
                    </span>
                    {t.timeframe && <span className="text-[10px] text-white/30">{t.timeframe}</span>}
                    {t.estimatedRR && (
                      <span className="text-[10px] text-white/35">RR {t.estimatedRR}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/25 mt-0.5">
                    {format(parseISO(t.date), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function MissedTradeDetail({
  trade,
  onSaved,
  onDelete,
}: {
  trade: MissedTrade | null;
  onSaved: (t: MissedTrade) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tagsInput, setTagsInput] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI Refine — per-field inline diff (analyze → accept/discard), plus "Refine All"
  const [refining, setRefining] = useState(false);
  const [refineFields, setRefineFields] = useState<MissedRefineField[]>([]);
  const [refineSuggestions, setRefineSuggestions] = useState<Partial<Record<MissedRefineField, string>>>({});
  const [refineError, setRefineError] = useState<string | null>(null);

  useEffect(() => {
    if (!trade) {
      setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 16) });
      return;
    }
    setForm({
      symbol: trade.symbol,
      direction: trade.direction,
      date: trade.date.slice(0, 16),
      timeframe: trade.timeframe ?? "",
      idealEntry: String(trade.idealEntry),
      idealSL: trade.idealSL !== undefined ? String(trade.idealSL) : "",
      idealTP: trade.idealTP !== undefined ? String(trade.idealTP) : "",
      estimatedRR: trade.estimatedRR !== undefined ? String(trade.estimatedRR) : "",
      potentialPips: trade.potentialPips !== undefined ? String(trade.potentialPips) : "",
      reasonMissed: trade.reasonMissed ?? "",
      setup: trade.setup ?? "",
      outcome: trade.outcome,
      outcomeNotes: trade.outcomeNotes ?? "",
      analysis: trade.analysis ?? "",
      lessonsLearned: trade.lessonsLearned ?? "",
      tags: [...(trade.tags ?? [])],
      screenshots: [...(trade.screenshots ?? [])],
    });
    setSaved(false);
    setRefining(false);
    setRefineFields([]);
    setRefineSuggestions({});
    setRefineError(null);
  }, [trade?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex(i => i !== null && i > 0 ? i - 1 : i);
      if (e.key === "ArrowRight") setLightboxIndex(i => i !== null && i < form.screenshots.length - 1 ? i + 1 : i);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, form.screenshots.length]);

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: typeof EMPTY_FORM[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function getMissedRefineText(field: MissedRefineField): string {
    if (field === "outcomeNotes") return form.outcomeNotes;
    if (field === "analysis") return form.analysis;
    return form.lessonsLearned;
  }

  async function refineOneField(field: MissedRefineField): Promise<{ field: MissedRefineField; refined?: string; error?: string }> {
    const text = getMissedRefineText(field);
    try {
      const res = await fetch("/api/journal/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          fieldLabel: MISSED_REFINE_LABELS[field],
          context: { symbol: form.symbol, direction: form.direction },
        }),
      });
      const data = await res.json();
      if (!res.ok) return { field, error: data.error ?? "Refinement failed" };
      return { field, refined: data.refined as string };
    } catch {
      return { field, error: "Network error — please try again" };
    }
  }

  async function runRefine(fields: MissedRefineField[]) {
    if (fields.length === 0) return;
    setRefining(true);
    setRefineFields(fields);
    setRefineError(null);
    setRefineSuggestions(prev => {
      const next = { ...prev };
      fields.forEach(f => delete next[f]);
      return next;
    });
    try {
      const results = await Promise.all(fields.map(refineOneField));
      const newSuggestions: Partial<Record<MissedRefineField, string>> = {};
      let anyError: string | null = null;
      for (const r of results) {
        if (r.error) { anyError = r.error; continue; }
        const original = getMissedRefineText(r.field);
        if (r.refined && r.refined.trim() && r.refined.trim() !== original.trim()) {
          newSuggestions[r.field] = r.refined;
        }
      }
      setRefineSuggestions(prev => ({ ...prev, ...newSuggestions }));
      if (Object.keys(newSuggestions).length === 0) {
        setRefineError(anyError ?? "AI didn't suggest any changes — this entry already reads well.");
      } else if (anyError) {
        setRefineError(anyError);
      }
    } finally {
      setRefining(false);
      setRefineFields([]);
    }
  }

  function handleRefineField(field: MissedRefineField) {
    if (getMissedRefineText(field).trim().length <= 5) {
      setRefineError("Write something in this section before refining");
      return;
    }
    runRefine([field]);
  }

  function handleRefineAll() {
    const fieldsToRefine: MissedRefineField[] = [];
    if (form.outcomeNotes.trim().length > 5) fieldsToRefine.push("outcomeNotes");
    if (form.analysis.trim().length > 5) fieldsToRefine.push("analysis");
    if (form.lessonsLearned.trim().length > 5) fieldsToRefine.push("lessonsLearned");
    if (fieldsToRefine.length === 0) {
      setRefineError("Write something before refining");
      return;
    }
    runRefine(fieldsToRefine);
  }

  function acceptRefine(field: MissedRefineField) {
    const value = refineSuggestions[field];
    if (value === undefined) return;
    set(field, value);
    setRefineSuggestions(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function discardRefine(field: MissedRefineField) {
    setRefineSuggestions(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function addTag() {
    const v = tagsInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!v || form.tags.includes(v)) return;
    set("tags", [...form.tags, v]);
    setTagsInput("");
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) {
          setForm(prev => ({ ...prev, screenshots: [...prev.screenshots, ev.target!.result as string] }));
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleSave() {
    if (!form.symbol.trim() || !form.idealEntry) return;
    setSaving(true);
    try {
      const payload = {
        symbol: form.symbol.trim().toUpperCase(),
        direction: form.direction,
        date: new Date(form.date).toISOString(),
        timeframe: form.timeframe,
        idealEntry: parseFloat(form.idealEntry as string) || 0,
        idealSL: form.idealSL ? parseFloat(form.idealSL as string) : undefined,
        idealTP: form.idealTP ? parseFloat(form.idealTP as string) : undefined,
        estimatedRR: form.estimatedRR ? parseFloat(form.estimatedRR as string) : undefined,
        potentialPips: form.potentialPips ? parseFloat(form.potentialPips as string) : undefined,
        reasonMissed: form.reasonMissed,
        setup: form.setup,
        outcome: form.outcome,
        outcomeNotes: form.outcomeNotes,
        analysis: form.analysis,
        lessonsLearned: form.lessonsLearned,
        tags: form.tags,
        screenshots: form.screenshots,
      };

      const url = trade ? `/api/missed-trade/${trade._id}` : "/api/missed-trade";
      const method = trade ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const isNew = !trade;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92" onClick={() => setLightboxIndex(null)}>
          <button className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition z-10" onClick={() => setLightboxIndex(null)}>
            <X className="h-5 w-5" />
          </button>
          {lightboxIndex > 0 && (
            <button className="absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition text-2xl z-10" onClick={e => { e.stopPropagation(); setLightboxIndex(i => Math.max(0, (i ?? 0) - 1)); }}>‹</button>
          )}
          {lightboxIndex < form.screenshots.length - 1 && (
            <button className="absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition text-2xl z-10" onClick={e => { e.stopPropagation(); setLightboxIndex(i => Math.min(form.screenshots.length - 1, (i ?? 0) + 1)); }}>›</button>
          )}
          <img src={form.screenshots[lightboxIndex]} alt="" className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
          <div className="absolute bottom-4 text-[12px] text-white/50 bg-black/40 px-3 py-1 rounded-full">{lightboxIndex + 1} / {form.screenshots.length}</div>
        </div>
      )}

      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#0c0e14] border-b border-white/7">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-500/15 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-white">
              {isNew ? "Log Missed Trade" : `${form.symbol} — Missed Trade`}
            </h2>
            {!isNew && trade && (
              <p className="text-[11px] text-white/35">{format(parseISO(trade.date), "MMM d, yyyy HH:mm")}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 text-[12px] text-red-400 hover:bg-red-500/10 transition"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
          {!isNew && (
            <button
              onClick={handleRefineAll}
              disabled={refining}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition",
                refining
                  ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
                  : "border-white/[0.15] bg-gradient-to-r from-white/[0.07] to-white/[0.04] text-white/80 hover:from-white/[0.12] hover:to-white/[0.08] hover:text-white"
              )}
              title="Refine all text with AI (gpt-4o-mini)"
            >
              {refining ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{refining ? "Refining…" : "Refine All"}</span>
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.symbol.trim()}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition",
              saved ? "bg-emerald-600 text-white" : "bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-white disabled:opacity-40"
            )}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : saved ? "Saved!" : isNew ? "Save" : "Update"}
          </button>
        </div>
      </div>

      {showDeleteConfirm && trade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#0c0e14] border border-white/10 shadow-2xl p-5">
            <h3 className="text-[15px] font-semibold text-white mb-2">Delete this missed trade?</h3>
            <p className="text-[12px] text-white/40 mb-5">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl border border-white/10 text-[12px] text-white/40 hover:text-white/70 transition">Cancel</button>
              <button
                onClick={async () => {
                  await fetch(`/api/missed-trade/${trade._id}`, { method: "DELETE" });
                  onDelete(trade._id);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 py-2 rounded-xl bg-red-500/15 border border-red-500/25 text-[12px] font-semibold text-red-400 hover:bg-red-500/25 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 py-5 space-y-5">
        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Target className="h-4 w-4 text-amber-400/70" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Trade Details</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Symbol</label>
                <input
                  value={form.symbol}
                  onChange={e => set("symbol", e.target.value.toUpperCase())}
                  placeholder="XAUUSD, EURUSD…"
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[13px] font-semibold text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={form.date}
                  onChange={e => set("date", e.target.value)}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[12px] text-white/75 focus:outline-none focus:border-white/25 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1.5">Direction</label>
              <div className="flex rounded-xl bg-white/5 p-1 gap-1">
                <button
                  onClick={() => set("direction", "buy")}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition",
                    form.direction === "buy" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-white/40 hover:text-white/70"
                  )}
                >
                  <TrendingUp className="h-3 w-3" /> Long
                </button>
                <button
                  onClick={() => set("direction", "sell")}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold transition",
                    form.direction === "sell" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-white/40 hover:text-white/70"
                  )}
                >
                  <TrendingDown className="h-3 w-3" /> Short
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Ideal Entry</label>
                <input type="number" step="any" value={form.idealEntry} onChange={e => set("idealEntry", e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white focus:outline-none focus:border-white/25 transition" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-red-400/60 font-semibold mb-1">Stop Loss</label>
                <input type="number" step="any" value={form.idealSL} onChange={e => set("idealSL", e.target.value)} placeholder="Optional" className="w-full rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/40 transition" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-emerald-400/60 font-semibold mb-1">Take Profit</label>
                <input type="number" step="any" value={form.idealTP} onChange={e => set("idealTP", e.target.value)} placeholder="Optional" className="w-full rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-3 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Est. R:R</label>
                <input type="number" step="0.1" value={form.estimatedRR} onChange={e => set("estimatedRR", e.target.value)} placeholder="e.g. 3" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1.5">Timeframe</label>
                <div className="flex gap-1.5 flex-wrap">
                  {TF_OPTIONS.map(tf => (
                    <button
                      key={tf}
                      onClick={() => set("timeframe", form.timeframe === tf ? "" : tf)}
                      className={cn("px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition",
                        form.timeframe === tf ? "bg-white/[0.09] border-white/30 text-white" : "bg-white/5 border-white/10 text-white/45 hover:border-white/20 hover:text-white"
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Potential Pips/$</label>
                <input type="number" step="any" value={form.potentialPips} onChange={e => set("potentialPips", e.target.value)} placeholder="How far it moved" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[12px] text-white placeholder:text-white/15 focus:outline-none focus:border-white/25 transition" />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-white/35 font-semibold mb-1">Setup Type</label>
                <input value={form.setup} onChange={e => set("setup", e.target.value)} placeholder="A+, OL, SBR…" className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-[12px] text-white placeholder:text-white/15 focus:outline-none focus:border-white/25 transition" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <AlertTriangle className="h-4 w-4 text-amber-400/70" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Why Missed</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {MISS_REASONS.map(r => (
                <button
                  key={r}
                  onClick={() => set("reasonMissed", form.reasonMissed === r ? "" : r)}
                  className={cn("px-2.5 py-1 rounded-full text-[10px] font-medium border transition",
                    form.reasonMissed === r
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : "bg-white/5 border-white/10 text-white/40 hover:border-white/20 hover:text-white"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={form.reasonMissed}
              onChange={e => set("reasonMissed", e.target.value)}
              placeholder="Or describe the reason…"
              className="w-full rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </div>
        </div>

        {refineError && (
          <div className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-[12px] text-red-300 flex-1">{refineError}</span>
            <button onClick={() => setRefineError(null)} className="text-red-400/60 hover:text-red-400 transition">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Eye className="h-4 w-4 text-white/55" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">What Happened</span>
            {form.outcomeNotes.length > 10 && refineSuggestions.outcomeNotes === undefined && (
              <div className="ml-auto">
                <RefineIconButton
                  onClick={() => handleRefineField("outcomeNotes")}
                  disabled={refining}
                  title="Refine with AI"
                />
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(Object.entries(OUTCOME_CONFIG) as [Outcome, typeof OUTCOME_CONFIG[Outcome]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => set("outcome", key)}
                  className={cn("py-2 rounded-lg text-[11px] font-semibold border transition",
                    form.outcome === key ? cfg.color : "bg-white/3 border-white/8 text-white/35 hover:border-white/15 hover:text-white/60"
                  )}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            {refineSuggestions.outcomeNotes !== undefined ? (
              <RefineDiff
                original={form.outcomeNotes}
                suggestion={refineSuggestions.outcomeNotes}
                onReplace={() => acceptRefine("outcomeNotes")}
                onDiscard={() => discardRefine("outcomeNotes")}
              />
            ) : (
              <div className="relative">
                <textarea
                  value={form.outcomeNotes}
                  onChange={e => set("outcomeNotes", e.target.value)}
                  placeholder="Describe what actually happened after…"
                  rows={3}
                  disabled={refining && refineFields.includes("outcomeNotes")}
                  className={cn(
                    "w-full bg-transparent text-[12px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none transition",
                    refining && refineFields.includes("outcomeNotes") && "opacity-30"
                  )}
                />
                {refining && refineFields.includes("outcomeNotes") && <AnalyzingOverlay label="AI is analyzing…" />}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <BookOpen className="h-4 w-4 text-white/55" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Analysis</span>
              {form.analysis.length > 10 && refineSuggestions.analysis === undefined && (
                <div className="ml-auto">
                  <RefineIconButton
                    onClick={() => handleRefineField("analysis")}
                    disabled={refining}
                    title="Refine with AI"
                  />
                </div>
              )}
            </div>
            <div className="p-4 relative">
              {refineSuggestions.analysis !== undefined ? (
                <RefineDiff
                  original={form.analysis}
                  suggestion={refineSuggestions.analysis}
                  onReplace={() => acceptRefine("analysis")}
                  onDiscard={() => discardRefine("analysis")}
                />
              ) : (
                <>
                  <textarea
                    value={form.analysis}
                    onChange={e => set("analysis", e.target.value)}
                    placeholder="What did you see? Why was it a valid setup? What would have been your confluence?"
                    rows={6}
                    disabled={refining && refineFields.includes("analysis")}
                    className={cn(
                      "w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none transition",
                      refining && refineFields.includes("analysis") && "opacity-30"
                    )}
                  />
                  {refining && refineFields.includes("analysis") && <AnalyzingOverlay label="AI is analyzing…" />}
                </>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-white/7 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
              <Target className="h-4 w-4 text-amber-400/70" />
              <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Lessons Learned</span>
              {form.lessonsLearned.length > 10 && refineSuggestions.lessonsLearned === undefined && (
                <div className="ml-auto">
                  <RefineIconButton
                    onClick={() => handleRefineField("lessonsLearned")}
                    disabled={refining}
                    title="Refine with AI"
                  />
                </div>
              )}
            </div>
            <div className="p-4 relative">
              {refineSuggestions.lessonsLearned !== undefined ? (
                <RefineDiff
                  original={form.lessonsLearned}
                  suggestion={refineSuggestions.lessonsLearned}
                  onReplace={() => acceptRefine("lessonsLearned")}
                  onDiscard={() => discardRefine("lessonsLearned")}
                />
              ) : (
                <>
                  <textarea
                    value={form.lessonsLearned}
                    onChange={e => set("lessonsLearned", e.target.value)}
                    placeholder="What will you do differently next time? What pattern do you need to watch for?"
                    rows={6}
                    disabled={refining && refineFields.includes("lessonsLearned")}
                    className={cn(
                      "w-full bg-transparent text-[13px] text-white/75 placeholder:text-white/20 resize-none focus:outline-none transition",
                      refining && refineFields.includes("lessonsLearned") && "opacity-30"
                    )}
                  />
                  {refining && refineFields.includes("lessonsLearned") && <AnalyzingOverlay label="AI is analyzing…" />}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/7 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/7">
            <Camera className="h-4 w-4 text-white/55" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Screenshots</span>
            {form.screenshots.length > 0 && <span className="ml-auto text-[10px] text-white/30">{form.screenshots.length} image{form.screenshots.length !== 1 ? "s" : ""}</span>}
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-3">
              {form.screenshots.map((src, i) => (
                <div key={i} className="relative group w-28 h-20 rounded-lg overflow-hidden border border-white/10 cursor-pointer" onClick={() => setLightboxIndex(i)}>
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-[11px] font-semibold transition">View</span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setForm(prev => ({ ...prev, screenshots: prev.screenshots.filter((_, idx) => idx !== i) })); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 h-5 w-5 rounded bg-black/70 flex items-center justify-center text-white transition">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()} className="w-28 h-20 rounded-lg border-2 border-dashed border-white/15 flex flex-col items-center justify-center gap-1 text-white/25 hover:text-white/50 hover:border-white/25 transition">
                <Plus className="h-4 w-4" />
                <span className="text-[10px]">Add image</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/7 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-white/55" />
            <span className="text-[12px] font-semibold text-white/70 uppercase tracking-wider">Tags</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {form.tags.map(t => (
              <span key={t} className="flex items-center gap-1 text-[11px] bg-white/[0.08] text-white border border-white/[0.10] rounded-full px-2.5 py-0.5">
                {t}
                <button onClick={() => set("tags", form.tags.filter(x => x !== t))} className="hover:text-red-400 transition">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTag()}
              placeholder="Add tag (press Enter)"
              className="flex-1 rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 transition"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MissedTradesView() {
  const { activeProfileId } = useAppContext();
  const [trades, setTrades] = useState<MissedTrade[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((profileId: string) => {
    const url = profileId ? `/api/missed-trade?profileId=${encodeURIComponent(profileId)}` : "/api/missed-trade";
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setTrades(arr);
        setSelectedId(prev => prev ?? (arr.length > 0 ? arr[0]._id : null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(activeProfileId); }, [activeProfileId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSaved(updated: MissedTrade) {
    setTrades(prev => {
      const idx = prev.findIndex(t => t._id === updated._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
    setSelectedId(updated._id);
  }

  function handleDelete(id: string) {
    setTrades(prev => prev.filter(t => t._id !== id));
    setSelectedId(null);
  }

  const selectedTrade = selectedId === "new" ? null : trades.find(t => t._id === selectedId) ?? null;
  const showDetail = selectedId !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full flex-1">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 min-h-0">
      <div className={`${showDetail ? "hidden md:flex" : "flex"} w-full md:w-72 shrink-0 flex-col h-full`}>
        <MissedTradeList
          trades={trades}
          selectedId={selectedId as string | null}
          onSelect={id => setSelectedId(id)}
          onNew={() => setSelectedId("new")}
        />
      </div>

      {showDetail ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex md:hidden items-center px-4 py-2 border-b border-border shrink-0">
            <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white transition">
              <span className="text-[16px] leading-none">←</span> Back to list
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <MissedTradeDetail
              trade={selectedTrade}
              onSaved={handleSaved}
              onDelete={handleDelete}
            />
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-white/25">
          <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
            <EyeOff className="h-6 w-6 opacity-50" />
          </div>
          <p className="text-[14px] font-medium">No missed trade selected</p>
          <p className="text-[12px] mt-1">Log setups you passed on to learn from them</p>
        </div>
      )}
    </div>
  );
}
