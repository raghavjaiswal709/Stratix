"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pencil,
  Bot,
  Copy,
  Check,
  X,
  AlertCircle,
  Loader2,
  Database,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KeyLevels {
  resistance: number[];
  support: number[];
}

interface SymbolData {
  past_24h_summary: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  key_levels: KeyLevels;
  session_outlook: string;
}

interface MarketReport {
  meta: { date: string; session: string; generated_at: string };
  global_macro_overview: string;
  symbols: Record<string, SymbolData>;
}

interface ReportEntry {
  date: string;
  session: string;
  source: "db" | "file";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  asian: "Asian", london: "London", new_york: "New York",
};
const SESSION_ORDER = ["asian", "london", "new_york"] as const;

const SYMBOL_META: Record<string, { label: string; assetClass: string }> = {
  XAUUSD:  { label: "XAU/USD",  assetClass: "Metals" },
  XAGUSD:  { label: "XAG/USD",  assetClass: "Metals" },
  BTCUSDT: { label: "BTC/USDT", assetClass: "Crypto" },
  ETHUSD:  { label: "ETH/USD",  assetClass: "Crypto" },
  GBPUSD:  { label: "GBP/USD",  assetClass: "Forex"  },
  EURUSD:  { label: "EUR/USD",  assetClass: "Forex"  },
  USDJPY:  { label: "USD/JPY",  assetClass: "Forex"  },
  AUDUSD:  { label: "AUD/USD",  assetClass: "Forex"  },
  NZDUSD:  { label: "NZD/USD",  assetClass: "Forex"  },
  USDCAD:  { label: "USD/CAD",  assetClass: "Forex"  },
  USDCHF:  { label: "USD/CHF",  assetClass: "Forex"  },
};
const ASSET_CLASS_ORDER = ["Metals", "Crypto", "Forex"];

function getCurrentSession(): string {
  const h = new Date().getUTCHours();
  if (h >= 22 || h < 6)  return "asian";
  if (h >= 6  && h < 12) return "london";
  return "new_york";
}

function formatDateLabel(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function formatNumber(n: number): string {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

// ─── Prompt content ───────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are an expert institutional market analyst with deep expertise in macroeconomics, technical analysis, intermarket relationships, and central bank policy. Analyze the last 24 hours of global market data, breaking news, risk sentiment shifts, central bank communications, geopolitical developments, and macroeconomic event outcomes for the following symbols: XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF.

Generate an extreme, institutional-grade detailed analysis and session outlook for the upcoming trading session. Your analysis must incorporate: price action narrative with specific price levels, volume and open interest dynamics where applicable, intermarket correlations (bonds, equities, commodities), options market signals (implied volatility, put/call ratios), central bank policy divergence, risk-on/risk-off classification of current market regime, key upcoming event risks, and specific tactical entry/exit reasoning with price targets and invalidation levels.

You MUST strictly output your response as a raw JSON object matching the provided schema exactly. Do not include markdown formatting, code blocks, backticks, or any text outside the JSON object. The JSON must be valid and parseable. Every field must be populated with detailed, substantive content — no placeholder text, no empty strings, no empty arrays.`;

const AI_SCHEMA_TEMPLATE = `{
  "meta": {
    "date": "YYYY-MM-DD",
    "session": "Asian | London | New York",
    "generated_at": "ISO-8601 timestamp"
  },
  "global_macro_overview": "200+ word comprehensive narrative of the last 24 hours: major economic releases and their beat/miss vs consensus, central bank speeches, geopolitical developments, equity and bond market moves, DXY direction, commodity complex overview, and prevailing risk-on/risk-off regime.",
  "symbols": {
    "XAUUSD": {
      "past_24h_summary": "Detailed narrative: exact high/low/close, key drivers (real yields, DXY, ETF flows, COMEX positioning), volume dynamics, and news catalysts.",
      "sentiment": "Bullish | Bearish | Neutral",
      "key_levels": { "resistance": [0.0, 0.0, 0.0], "support": [0.0, 0.0, 0.0] },
      "session_outlook": "150+ word tactical analysis: expected range, directional bias with reasoning, catalysts to watch, entry zones, price targets, invalidation levels."
    },
    "XAGUSD":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "BTCUSDT": { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "ETHUSD":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "GBPUSD":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "EURUSD":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "USDJPY":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "AUDUSD":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "NZDUSD":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "USDCAD":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." },
    "USDCHF":  { "past_24h_summary": "...", "sentiment": "Bullish | Bearish | Neutral", "key_levels": { "resistance": [], "support": [] }, "session_outlook": "..." }
  }
}`;

function buildUserMessage(date: string, session: string): string {
  const ts = new Date().toISOString();
  return `Today's UTC date is ${date}. The upcoming session is the ${SESSION_LABELS[session] ?? session} session.

Analyze the past 24 hours of global macro events, geopolitical developments, central bank communications, risk sentiment, technical positioning, and institutional flows for XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF.

Output a full institutional-grade session report as a raw JSON object strictly matching this schema:

${AI_SCHEMA_TEMPLATE}

Fill every field with detailed content. Set meta.generated_at = "${ts}", meta.date = "${date}", meta.session = "${SESSION_LABELS[session] ?? session}". Include all 11 symbols. Use arrays of 3-5 real price floats for resistance and support. Each session_outlook must be at least 150 words with specific entry zones, price targets, and invalidation levels.`;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-all shrink-0"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Prompt Modal ─────────────────────────────────────────────────────────────

function PromptModal({
  date,
  session,
  onClose,
}: {
  date: string;
  session: string;
  onClose: () => void;
}) {
  const userMsg = buildUserMessage(date, session);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-white/50" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Generate Report Prompt</p>
              <p className="text-[11px] text-white/30">Paste into Gemini, Claude, or any AI to generate a report manually</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Step 1 — System Prompt */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">1</span>
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">System Prompt</span>
              </div>
              <CopyButton text={AI_SYSTEM_PROMPT} />
            </div>
            <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">
              {AI_SYSTEM_PROMPT}
            </pre>
          </div>

          {/* Step 2 — User Message */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">2</span>
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">User Message</span>
                <span className="text-[10px] text-white/20">pre-filled for {SESSION_LABELS[session]} · {date}</span>
              </div>
              <CopyButton text={userMsg} />
            </div>
            <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-56">
              {userMsg}
            </pre>
          </div>

          {/* Step 3 — Paste JSON back */}
          <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.15] px-4 py-3">
            <p className="text-[11px] font-semibold text-emerald-400/70 uppercase tracking-widest mb-1">Step 3 — Save the output</p>
            <p className="text-[12px] text-white/40 leading-relaxed">
              After the AI generates the JSON, copy it and paste it into the <span className="text-white/60 font-medium">Edit JSON</span> editor on this page, then hit Save. It will be stored in the database and shown here immediately.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition">
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Editor Modal ─────────────────────────────────────────────────────────────

function EditorModal({
  date,
  session,
  initialJson,
  onClose,
  onSaved,
}: {
  date: string;
  session: string;
  initialJson: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [json, setJson]       = useState(initialJson);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  function validate(value: string): boolean {
    if (!value.trim()) { setParseErr("JSON cannot be empty."); return false; }
    try { JSON.parse(value); setParseErr(null); return true; }
    catch (e) { setParseErr(e instanceof Error ? e.message : "Invalid JSON"); return false; }
  }

  function handleChange(v: string) {
    setJson(v);
    setSaveErr(null);
    if (parseErr) validate(v);
  }

  function handleFormat() {
    try { setJson(JSON.stringify(JSON.parse(json), null, 2)); setParseErr(null); }
    catch (e) { setParseErr(e instanceof Error ? e.message : "Invalid JSON"); }
  }

  async function handleSave() {
    if (!validate(json)) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await fetch("/api/ai-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, session, data: JSON.parse(json) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 800);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl bg-[#0d0d0d] border border-white/[0.10] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Pencil className="h-3.5 w-3.5 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Edit Report JSON</p>
              <p className="text-[11px] text-white/30">
                {SESSION_LABELS[session]} Session · {formatDateLabel(date)} · Saves to DB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleFormat}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition"
            >
              Format JSON
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="flex-1 relative overflow-hidden">
          <textarea
            ref={textareaRef}
            value={json}
            onChange={(e) => handleChange(e.target.value)}
            spellCheck={false}
            className={cn(
              "w-full h-full resize-none bg-transparent px-5 py-4",
              "text-[12px] font-mono leading-[1.7] text-white/70",
              "focus:outline-none placeholder:text-white/15",
              "border-b",
              parseErr ? "border-red-500/30" : "border-white/[0.05]",
            )}
            placeholder={'{\n  "meta": {\n    "date": "YYYY-MM-DD",\n    ...\n  }\n}'}
          />
        </div>

        {/* Error bar */}
        {(parseErr || saveErr) && (
          <div className="flex items-start gap-2 px-5 py-2.5 bg-red-500/[0.08] border-t border-red-500/20 shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-red-400/70 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-400/80 font-mono leading-snug">{parseErr ?? saveErr}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.07] shrink-0 bg-[#0d0d0d]">
          <div className="flex items-center gap-1.5 text-[11px] text-white/25">
            <Database className="h-3 w-3" />
            Saved to MongoDB · replaces file fallback
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.07] transition disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved || !!parseErr}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-xl text-[12px] font-semibold transition",
                saved
                  ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                  : "bg-white/[0.10] border border-white/[0.15] text-white hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
              {saving ? "Saving…" : saved ? "Saved!" : "Save to DB"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Sentiment badge ──────────────────────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const lower = sentiment.toLowerCase();
  const bullish = lower === "bullish";
  const bearish = lower === "bearish";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0",
      bullish && "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      bearish && "bg-red-500/15 text-red-400 border-red-500/25",
      !bullish && !bearish && "bg-white/[0.06] text-white/50 border-white/[0.10]",
    )}>
      {bullish && <TrendingUp className="h-3 w-3" />}
      {bearish && <TrendingDown className="h-3 w-3" />}
      {!bullish && !bearish && <Minus className="h-3 w-3" />}
      {sentiment}
    </span>
  );
}

function LevelPill({ value, type }: { value: number; type: "resistance" | "support" }) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-2 px-2 py-1 rounded-md text-[11px] font-mono",
      type === "resistance" ? "bg-red-500/[0.07] text-red-400/80" : "bg-emerald-500/[0.07] text-emerald-400/80",
    )}>
      <span className={cn("text-[9px] font-bold uppercase tracking-widest font-sans",
        type === "resistance" ? "text-red-500/40" : "text-emerald-500/40")}>
        {type === "resistance" ? "R" : "S"}
      </span>
      <span>{formatNumber(value)}</span>
    </div>
  );
}

function SymbolCard({ symbol, data }: { symbol: string; data: SymbolData }) {
  const meta = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other" };
  const [expanded, setExpanded] = useState(false);
  const SUMMARY_LIMIT = 220;
  const OUTLOOK_LIMIT = 280;
  const needsExpand = data.past_24h_summary.length > SUMMARY_LIMIT || data.session_outlook.length > OUTLOOK_LIMIT;

  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.12] transition-colors duration-200 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[15px] font-bold text-white leading-none">{meta.label}</h3>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-white/[0.05] text-white/30 border border-white/[0.07] rounded">
              {meta.assetClass}
            </span>
          </div>
          <span className="text-[10px] text-white/20 font-mono tracking-wider">{symbol}</span>
        </div>
        <SentimentBadge sentiment={data.sentiment} />
      </div>

      <div className="px-5 pb-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">24h Summary</p>
        <p className="text-[12px] text-white/55 leading-relaxed">
          {!expanded && data.past_24h_summary.length > SUMMARY_LIMIT
            ? data.past_24h_summary.slice(0, SUMMARY_LIMIT) + "…"
            : data.past_24h_summary}
        </p>
      </div>

      {(data.key_levels.resistance.length > 0 || data.key_levels.support.length > 0) && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-1.5">Resistance</p>
            <div className="flex flex-col gap-1">
              {data.key_levels.resistance.slice(0, 3).map((r, i) => <LevelPill key={i} value={r} type="resistance" />)}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-1.5">Support</p>
            <div className="flex flex-col gap-1">
              {data.key_levels.support.slice(0, 3).map((s, i) => <LevelPill key={i} value={s} type="support" />)}
            </div>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 pt-3 border-t border-white/[0.05] mt-auto">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">Session Outlook</p>
        <p className="text-[12px] text-white/70 leading-relaxed">
          {!expanded && data.session_outlook.length > OUTLOOK_LIMIT
            ? data.session_outlook.slice(0, OUTLOOK_LIMIT) + "…"
            : data.session_outlook}
        </p>
      </div>

      {needsExpand && (
        <button onClick={() => setExpanded(v => !v)}
          className="flex items-center justify-center gap-1 w-full py-2.5 text-[11px] text-white/25 hover:text-white/55 border-t border-white/[0.05] transition-colors">
          {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Read full analysis</>}
        </button>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 animate-pulse">
      <div className="flex justify-between gap-3 mb-5">
        <div className="space-y-2"><div className="h-4 w-24 bg-white/[0.07] rounded" /><div className="h-3 w-14 bg-white/[0.04] rounded" /></div>
        <div className="h-6 w-20 bg-white/[0.06] rounded-full" />
      </div>
      <div className="h-3 w-20 bg-white/[0.04] rounded mb-2" />
      <div className="space-y-1.5 mb-5">
        {[1, 0.9, 0.75, 0.6].map((w, i) => <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[0, 1].map(s => (
          <div key={s} className="space-y-1.5">
            <div className="h-3 w-16 bg-white/[0.04] rounded mb-2" />
            {[0, 1, 2].map(r => <div key={r} className="h-6 bg-white/[0.04] rounded" />)}
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.05] pt-4 space-y-1.5">
        {[1, 0.9, 0.8, 0.65].map((w, i) => <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />)}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIReportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) router.replace("/auth/signin");
    else if (session.user.role !== "admin") router.replace("/dashboard");
  }, [session, status, router]);

  const [reports,         setReports]         = useState<ReportEntry[]>([]);
  const [availableDates,  setAvailableDates]  = useState<string[]>([]);
  const [selectedDate,    setSelectedDate]    = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<string>("asian");
  const [report,          setReport]          = useState<MarketReport | null>(null);
  const [indexLoading,    setIndexLoading]    = useState(true);
  const [reportLoading,   setReportLoading]   = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  // Modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const currentSession = getCurrentSession();

  useEffect(() => {
    fetch("/api/ai-reports")
      .then(r => r.json())
      .then((data: ReportEntry[]) => {
        setReports(data);
        const dates = [...new Set(data.map(r => r.date))].sort().reverse();
        setAvailableDates(dates);
        if (dates.length > 0) {
          setSelectedDate(dates[0]);
          const forDate = data.filter(r => r.date === dates[0]);
          const best = SESSION_ORDER.slice().reverse().find(s => forDate.some(r => r.session === s));
          setSelectedSession(best ?? "asian");
        }
      })
      .catch(() => setError("Failed to load report index."))
      .finally(() => setIndexLoading(false));
  }, []);

  const loadReport = useCallback(async (date: string, sess: string) => {
    const hasEntry = reports.some(r => r.date === date && r.session === sess);
    if (!hasEntry) { setReport(null); return; }
    setReportLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-reports?date=${encodeURIComponent(date)}&session=${encodeURIComponent(sess)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e: unknown) {
      setError(`Failed to load report: ${e instanceof Error ? e.message : "Unknown error"}`);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [reports]);

  useEffect(() => {
    if (selectedDate && selectedSession && reports.length > 0) {
      loadReport(selectedDate, selectedSession);
    }
  }, [selectedDate, selectedSession, reports, loadReport]);

  const dateIndex  = availableDates.indexOf(selectedDate);
  const canGoBack  = dateIndex < availableDates.length - 1;
  const canGoFwd   = dateIndex > 0;
  const sessionsForDate = reports.filter(r => r.date === selectedDate).map(r => r.session);

  const symbolGroups: Record<string, [string, SymbolData][]> = {};
  if (report) {
    for (const [sym, data] of Object.entries(report.symbols)) {
      const cls = SYMBOL_META[sym]?.assetClass ?? "Other";
      if (!symbolGroups[cls]) symbolGroups[cls] = [];
      symbolGroups[cls].push([sym, data]);
    }
  }

  const currentEntry = reports.find(r => r.date === selectedDate && r.session === selectedSession);

  if (status === "loading" || !session?.user || session.user.role !== "admin") return null;

  if (indexLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
        <p className="text-[12px] text-white/30 tracking-wide">Loading reports…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-white/[0.055]">
        <div className="px-5 md:px-8 py-4 space-y-4">

          {/* Title row */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0">
                <BrainCircuit className="h-4 w-4 text-white/70" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-white leading-none mb-0.5">AI Report</h1>
                <p className="text-[11px] text-white/30">Institutional session analysis · Gemini 2.0 Flash</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Source badge */}
              {currentEntry && (
                <span className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border",
                  currentEntry.source === "db"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/80"
                    : "bg-white/[0.04] border-white/[0.07] text-white/25",
                )}>
                  <Database className="h-2.5 w-2.5" />
                  {currentEntry.source === "db" ? "DB" : "File"}
                </span>
              )}
              {/* Prompt button */}
              <button
                onClick={() => setPromptOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition"
              >
                <Bot className="h-3.5 w-3.5" /> Prompt
              </button>
              {/* Edit button */}
              <button
                onClick={() => setEditorOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.07] border border-white/[0.12] text-white/60 hover:text-white hover:bg-white/[0.10] transition"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit JSON
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-white/30 ml-1">
                <Clock className="h-3.5 w-3.5" />
                <span>Live: <span className="text-white/60 font-medium">{SESSION_LABELS[currentSession]}</span></span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              </div>
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              {SESSION_ORDER.map(s => {
                const available = sessionsForDate.includes(s);
                const active    = selectedSession === s;
                return (
                  <button key={s} onClick={() => available && setSelectedSession(s)}
                    disabled={!available && availableDates.length > 0}
                    className={cn(
                      "px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
                      active ? "bg-white/[0.10] text-white border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                             : available ? "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
                             : "text-white/15 cursor-not-allowed",
                    )}>
                    {SESSION_LABELS[s]}
                    {currentSession === s && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => canGoBack && setSelectedDate(availableDates[dateIndex + 1])} disabled={!canGoBack}
                className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[12px] font-medium text-white/70 min-w-[148px] text-center select-none">
                {selectedDate ? formatDateLabel(selectedDate) : "No reports"}
              </span>
              <button onClick={() => canGoFwd && setSelectedDate(availableDates[dateIndex - 1])} disabled={!canGoFwd}
                className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-5 md:px-8 py-6">

        {availableDates.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <BrainCircuit className="h-7 w-7 text-white/20" />
            </div>
            <div className="max-w-xs">
              <p className="text-[15px] font-semibold text-white/60 mb-2">No reports yet</p>
              <p className="text-[12px] text-white/30 leading-relaxed">
                Reports are auto-generated before each session by GitHub Actions, or you can paste and save one manually using the <span className="text-white/50">Edit JSON</span> button above.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400 mb-6">{error}</div>
        )}

        {reportLoading && (
          <>
            <div className="h-40 rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 animate-pulse mb-6">
              <div className="h-3 w-32 bg-white/[0.07] rounded mb-4" />
              <div className="space-y-2">
                {[1, 0.95, 0.85, 0.9, 0.75].map((w, i) => <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />)}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </>
        )}

        {!reportLoading && !error && selectedDate && !report && availableDates.length > 0 && (
          <div className="flex flex-col items-center justify-center min-h-[45vh] gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <RefreshCw className="h-5 w-5 text-white/20" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/50 mb-1">No {SESSION_LABELS[selectedSession]} report for {formatDateLabel(selectedDate)}</p>
              <p className="text-[11px] text-white/25">Use the <span className="text-white/40">Edit JSON</span> button to add one manually.</p>
            </div>
          </div>
        )}

        {!reportLoading && report && (
          <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.07] border border-white/[0.10] rounded-full text-white/65">
                {report.meta.session} Session
              </span>
              <span className="text-[11px] text-white/25">
                Generated {new Date(report.meta.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC
              </span>
            </div>

            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-white/35 shrink-0" />
                <h2 className="text-[11px] font-semibold text-white/45 uppercase tracking-widest">Global Macro Overview</h2>
              </div>
              <p className="text-[13px] text-white/65 leading-[1.85]">{report.global_macro_overview}</p>
            </div>

            <div className="space-y-8">
              {ASSET_CLASS_ORDER.filter(cls => symbolGroups[cls]?.length).map(cls => (
                <section key={cls}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">{cls}</h2>
                    <span className="text-[10px] text-white/15">{symbolGroups[cls].length} instrument{symbolGroups[cls].length > 1 ? "s" : ""}</span>
                    <div className="flex-1 h-px bg-white/[0.05]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {symbolGroups[cls].map(([sym, data]) => <SymbolCard key={sym} symbol={sym} data={data} />)}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {editorOpen && (
        <EditorModal
          date={selectedDate}
          session={selectedSession}
          initialJson={report ? JSON.stringify(report, null, 2) : ""}
          onClose={() => setEditorOpen(false)}
          onSaved={() => loadReport(selectedDate, selectedSession)}
        />
      )}
      {promptOpen && (
        <PromptModal
          date={selectedDate || new Date().toISOString().slice(0, 10)}
          session={selectedSession}
          onClose={() => setPromptOpen(false)}
        />
      )}

    </div>
  );
}
