"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Zap,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Radio,
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

interface HighImpactEvent { event_name: string; impact_explanation: string; }
interface AllNewsSection  { headline: string; summary: string; high_impact_events: HighImpactEvent[]; }
interface SymbolNews      { latest_headlines: string[]; detailed_breakdown: string; trader_alert: string; }

interface NewsReport {
  meta: { date: string; session: string; generated_at: string; language: string };
  all_news_section: AllNewsSection;
  symbol_wise_news: Record<string, SymbolNews>;
}

interface NewsEntry { date: string; session: string; source: "db" | "file"; }

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  asian: "Asian", london: "London", new_york: "New York",
};
const SESSION_ORDER = ["asian", "london", "new_york"] as const;

const SYMBOL_META: Record<string, { label: string; assetClass: string; flag: string }> = {
  XAUUSD:  { label: "XAU/USD",  assetClass: "Metals", flag: "🥇" },
  XAGUSD:  { label: "XAG/USD",  assetClass: "Metals", flag: "🥈" },
  BTCUSDT: { label: "BTC/USDT", assetClass: "Crypto", flag: "₿"  },
  ETHUSD:  { label: "ETH/USD",  assetClass: "Crypto", flag: "Ξ"  },
  GBPUSD:  { label: "GBP/USD",  assetClass: "Forex",  flag: "🇬🇧" },
  EURUSD:  { label: "EUR/USD",  assetClass: "Forex",  flag: "🇪🇺" },
  USDJPY:  { label: "USD/JPY",  assetClass: "Forex",  flag: "🇯🇵" },
  AUDUSD:  { label: "AUD/USD",  assetClass: "Forex",  flag: "🇦🇺" },
  NZDUSD:  { label: "NZD/USD",  assetClass: "Forex",  flag: "🇳🇿" },
  USDCAD:  { label: "USD/CAD",  assetClass: "Forex",  flag: "🇨🇦" },
  USDCHF:  { label: "USD/CHF",  assetClass: "Forex",  flag: "🇨🇭" },
};
const SYMBOL_DISPLAY_ORDER = [
  "XAUUSD","XAGUSD","BTCUSDT","ETHUSD",
  "EURUSD","GBPUSD","USDJPY","AUDUSD","NZDUSD","USDCAD","USDCHF",
];

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

// ─── Prompt content ───────────────────────────────────────────────────────────

const NEWS_SYSTEM_PROMPT = `You are a charismatic, expert financial news anchor and market analyst — think of yourself as a sharp, knowledgeable dost who explains complex market events in a way that every retail trader can understand. Your job is to analyze all global macroeconomic news, geopolitical developments, central bank announcements, major data releases, and breaking market headlines from the past 24 hours for XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, and USDCHF.

You MUST write the entire analysis in highly detailed, easily understandable Hinglish using the English (Latin) alphabet only. Hinglish means a natural, conversational blend of Hindi and English — for example: "Market mein bohot zyada volatility dekhne ko mil sakti hai kyunki Fed ki meeting aane wali hai", "Dollar ne aaj sab ko surprise kar diya", "Gold bulls khush hain lekin bears bhi taiyaar hain". Write like you are talking to a smart friend who trades but wants clear, jargon-free explanations.

You MUST strictly output your final response as a raw JSON object exactly matching the provided schema. Every field must be populated with real, detailed, substantive Hinglish content. Do not write placeholder text, do not leave any field empty, do not include markdown formatting or backticks. Output valid, directly parseable JSON only.`;

const NEWS_SCHEMA_TEMPLATE = `{
  "meta": {
    "date": "YYYY-MM-DD",
    "session": "Asian | London | New York",
    "generated_at": "ISO-8601 timestamp",
    "language": "Hinglish"
  },
  "all_news_section": {
    "headline": "Engaging Hinglish headline — aaj ki sabse badi khabar.",
    "summary": "150+ word Hinglish summary: pichle 24 ghante ka complete global market breakdown, major narrative jo pure market ko drive kar raha hai.",
    "high_impact_events": [
      {
        "event_name": "FOMC | NFP | CPI | BoJ Decision | ECB Meeting | etc.",
        "impact_explanation": "Is event se market par kya asar padne wala hai — detail mein Hinglish mein samjhao. Kaunse symbols affected honge, kya direction expect karo, kya levels pe nazar rakhna hai."
      }
    ]
  },
  "symbol_wise_news": {
    "XAUUSD": {
      "latest_headlines": [
        "Gold se related latest khabar 1 — specific price action ya catalyst mention karo",
        "Gold se related latest khabar 2 — another key development"
      ],
      "detailed_breakdown": "Gold mein pichle 24 ghante mein kya bada news movement hua — Hinglish mein minimum 100 words.",
      "trader_alert": "Retail traders ke liye ek urgent, specific Hinglish warning: key level, risk event, ya positioning advice."
    },
    "XAGUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "BTCUSDT": { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "ETHUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "GBPUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "EURUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "USDJPY":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "AUDUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "NZDUSD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "USDCAD":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." },
    "USDCHF":  { "latest_headlines": ["...", "..."], "detailed_breakdown": "...", "trader_alert": "..." }
  }
}`;

function buildNewsUserMessage(date: string, session: string): string {
  const ts = new Date().toISOString();
  return `Aaj ka UTC date hai ${date}. Aane wala session hai ${SESSION_LABELS[session] ?? session} Session.

Pichle 24 ghante ki saari important global financial news analyze karo: major economic data releases (NFP, CPI, GDP, PMI, retail sales), central bank decisions aur speeches (Fed, ECB, BoE, BoJ, RBA, RBNZ, SNB, BoC), geopolitical developments, equity market moves, bond yield changes, commodity price swings, aur crypto market events.

In symbols ke liye complete Hinglish news breakdown chahiye: XAUUSD, XAGUSD, BTCUSDT, ETHUSD, GBPUSD, EURUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF.

Ek single valid JSON object output karo jo is schema ko exactly match kare:

${NEWS_SCHEMA_TEMPLATE}

meta.generated_at = "${ts}", meta.date = "${date}", meta.session = "${SESSION_LABELS[session] ?? session}", meta.language = "Hinglish" set karo. all_news_section mein kam se kam 4 high_impact_events dalna. Har symbol ke liye exactly 2 headlines, ek detailed Hinglish breakdown (min 100 words), aur ek specific trader alert dalna hai.`;
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

function PromptModal({ date, session, onClose }: { date: string; session: string; onClose: () => void }) {
  const userMsg = buildNewsUserMessage(date, session);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-white/50" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Generate Hinglish News Prompt</p>
              <p className="text-[11px] text-white/30">Paste into Gemini, Claude, or any AI to generate a news report manually</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">1</span>
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">System Prompt</span>
              </div>
              <CopyButton text={NEWS_SYSTEM_PROMPT} />
            </div>
            <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-48">
              {NEWS_SYSTEM_PROMPT}
            </pre>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">2</span>
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">User Message (Hinglish)</span>
                <span className="text-[10px] text-white/20">pre-filled for {SESSION_LABELS[session]} · {date}</span>
              </div>
              <CopyButton text={userMsg} />
            </div>
            <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-56">
              {userMsg}
            </pre>
          </div>

          <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.15] px-4 py-3">
            <p className="text-[11px] font-semibold text-emerald-400/70 uppercase tracking-widest mb-1">Step 3 — Save the output</p>
            <p className="text-[12px] text-white/40 leading-relaxed">
              AI ka generated JSON copy karo aur is page ke <span className="text-white/60 font-medium">Edit JSON</span> editor mein paste karo. Save karo — DB mein store ho jayega aur turant yahan dikhega.
            </p>
          </div>

        </div>

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
  date, session, initialJson, onClose, onSaved,
}: {
  date: string; session: string; initialJson: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [json,     setJson]     = useState(initialJson);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  function validate(value: string): boolean {
    if (!value.trim()) { setParseErr("JSON empty nahi hona chahiye."); return false; }
    try { JSON.parse(value); setParseErr(null); return true; }
    catch (e) { setParseErr(e instanceof Error ? e.message : "Invalid JSON"); return false; }
  }

  function handleChange(v: string) { setJson(v); setSaveErr(null); if (parseErr) validate(v); }

  function handleFormat() {
    try { setJson(JSON.stringify(JSON.parse(json), null, 2)); setParseErr(null); }
    catch (e) { setParseErr(e instanceof Error ? e.message : "Invalid JSON"); }
  }

  async function handleSave() {
    if (!validate(json)) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch("/api/news-reports", {
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
      setSaveErr(e instanceof Error ? e.message : "Save fail ho gaya. Dobara try karo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl bg-[#0d0d0d] border border-white/[0.10] shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Pencil className="h-3.5 w-3.5 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Edit News Report JSON</p>
              <p className="text-[11px] text-white/30">{SESSION_LABELS[session]} Session · {formatDateLabel(date)} · DB mein save hoga</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleFormat}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition">
              Format JSON
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <textarea
            ref={textareaRef}
            value={json}
            onChange={(e) => handleChange(e.target.value)}
            spellCheck={false}
            className={cn(
              "w-full h-full resize-none bg-transparent px-5 py-4",
              "text-[12px] font-mono leading-[1.7] text-white/70",
              "focus:outline-none placeholder:text-white/15 border-b",
              parseErr ? "border-red-500/30" : "border-white/[0.05]",
            )}
            placeholder={'{\n  "meta": { "date": "YYYY-MM-DD", ... },\n  "all_news_section": { ... },\n  "symbol_wise_news": { ... }\n}'}
          />
        </div>

        {(parseErr || saveErr) && (
          <div className="flex items-start gap-2 px-5 py-2.5 bg-red-500/[0.08] border-t border-red-500/20 shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-red-400/70 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-400/80 font-mono leading-snug">{parseErr ?? saveErr}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.07] shrink-0 bg-[#0d0d0d]">
          <div className="flex items-center gap-1.5 text-[11px] text-white/25">
            <Database className="h-3 w-3" />
            MongoDB mein save hoga · file fallback replace karega
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.07] transition disabled:opacity-40">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || saved || !!parseErr}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-xl text-[12px] font-semibold transition",
                saved
                  ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                  : "bg-white/[0.10] border border-white/[0.15] text-white hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed",
              )}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
              {saving ? "Save ho raha hai…" : saved ? "Saved!" : "DB mein Save karo"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventCard({ event }: { event: HighImpactEvent }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 180;
  const needsExpand = event.impact_explanation.length > LIMIT;
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.08] border border-white/[0.10]">
          <Zap className="h-3 w-3 text-white/50" />
        </div>
        <p className="text-[13px] font-semibold text-white/80 leading-snug">{event.event_name}</p>
      </div>
      <p className="text-[12px] text-white/50 leading-[1.8] pl-7">
        {!expanded && needsExpand ? event.impact_explanation.slice(0, LIMIT) + "…" : event.impact_explanation}
      </p>
      {needsExpand && (
        <button onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 pl-7 text-[11px] text-white/25 hover:text-white/55 transition-colors self-start">
          {expanded ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More</>}
        </button>
      )}
    </div>
  );
}

function SymbolCard({ symbol, news }: { symbol: string; news: SymbolNews }) {
  const meta = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other", flag: "•" };
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 260;
  const needsExpand = news.detailed_breakdown.length > LIMIT;
  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.11] transition-colors duration-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.05]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-[15px] select-none">
          {meta.flag}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[14px] font-bold text-white leading-none">{meta.label}</h3>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-white/[0.05] text-white/25 border border-white/[0.07] rounded">
              {meta.assetClass}
            </span>
          </div>
          <span className="text-[10px] text-white/20 font-mono tracking-wider">{symbol}</span>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2.5">Latest Khabar</p>
        <ul className="space-y-2">
          {news.latest_headlines.map((h, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[12px] text-white/60 leading-relaxed">
              <span className="mt-[7px] h-1 w-1 rounded-full bg-white/25 shrink-0" />{h}
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 pb-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2.5">Detailed Breakdown</p>
        <p className="text-[12px] text-white/55 leading-[1.85]">
          {!expanded && needsExpand ? news.detailed_breakdown.slice(0, LIMIT) + "…" : news.detailed_breakdown}
        </p>
        {needsExpand && (
          <button onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 mt-2 text-[11px] text-white/25 hover:text-white/55 transition-colors">
            {expanded ? <><ChevronUp className="h-3 w-3" /> Kam dikhao</> : <><ChevronDown className="h-3 w-3" /> Poora padho</>}
          </button>
        )}
      </div>

      <div className="px-5 pb-5 mt-auto">
        <div className="rounded-xl bg-amber-500/[0.07] border border-amber-500/[0.18] px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="h-3 w-3 text-amber-400/70 shrink-0" />
            <span className="text-[9px] font-bold text-amber-400/60 uppercase tracking-widest">Trader Alert</span>
          </div>
          <p className="text-[12px] text-amber-300/80 leading-[1.8]">{news.trader_alert}</p>
        </div>
      </div>
    </div>
  );
}

function BannerSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 mb-6 animate-pulse">
      <div className="h-3 w-24 bg-white/[0.07] rounded mb-4" />
      <div className="h-6 w-3/4 bg-white/[0.09] rounded mb-2" /><div className="h-6 w-1/2 bg-white/[0.07] rounded mb-6" />
      <div className="space-y-2">{[1, 0.95, 0.85, 0.9, 0.75].map((w, i) => <div key={i} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />)}</div>
    </div>
  );
}
function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white/[0.025] border border-white/[0.07] overflow-hidden animate-pulse">
          <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.05]">
            <div className="h-9 w-9 bg-white/[0.07] rounded-xl shrink-0" />
            <div className="space-y-1.5"><div className="h-4 w-20 bg-white/[0.07] rounded" /><div className="h-3 w-12 bg-white/[0.04] rounded" /></div>
          </div>
          <div className="px-5 py-4 space-y-2">
            <div className="h-3 w-20 bg-white/[0.04] rounded mb-3" />{[1, 0.85].map((w, j) => <div key={j} className="h-3 bg-white/[0.04] rounded" style={{ width: `${w * 100}%` }} />)}
          </div>
          <div className="px-5 pb-5">
            <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/[0.10] p-3 space-y-1.5">
              <div className="h-3 w-24 bg-amber-500/[0.10] rounded" />{[1, 0.85].map((w, j) => <div key={j} className="h-3 bg-amber-500/[0.07] rounded" style={{ width: `${w * 100}%` }} />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsAnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) router.replace("/auth/signin");
    else if (session.user.role !== "admin") router.replace("/dashboard");
  }, [session, status, router]);

  const [reports,         setReports]         = useState<NewsEntry[]>([]);
  const [availableDates,  setAvailableDates]  = useState<string[]>([]);
  const [selectedDate,    setSelectedDate]    = useState<string>("");
  const [selectedSession, setSelectedSession] = useState<string>("asian");
  const [report,          setReport]          = useState<NewsReport | null>(null);
  const [indexLoading,    setIndexLoading]    = useState(true);
  const [reportLoading,   setReportLoading]   = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const currentSession = getCurrentSession();

  useEffect(() => {
    fetch("/api/news-reports")
      .then(r => r.json())
      .then((data: NewsEntry[]) => {
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
      .catch(() => setError("Report index load nahi hua."))
      .finally(() => setIndexLoading(false));
  }, []);

  const loadReport = useCallback(async (date: string, sess: string) => {
    const hasEntry = reports.some(r => r.date === date && r.session === sess);
    if (!hasEntry) { setReport(null); return; }
    setReportLoading(true); setError(null);
    try {
      const res = await fetch(`/api/news-reports?date=${encodeURIComponent(date)}&session=${encodeURIComponent(sess)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e: unknown) {
      setError(`Report load nahi hua: ${e instanceof Error ? e.message : "Unknown error"}`);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [reports]);

  useEffect(() => {
    if (selectedDate && selectedSession && reports.length > 0) loadReport(selectedDate, selectedSession);
  }, [selectedDate, selectedSession, reports, loadReport]);

  const dateIndex       = availableDates.indexOf(selectedDate);
  const canGoBack       = dateIndex < availableDates.length - 1;
  const canGoFwd        = dateIndex > 0;
  const sessionsForDate = reports.filter(r => r.date === selectedDate).map(r => r.session);
  const orderedSymbols  = report
    ? SYMBOL_DISPLAY_ORDER.filter(s => s in report.symbol_wise_news)
    : [];

  const currentEntry = reports.find(r => r.date === selectedDate && r.session === selectedSession);

  if (status === "loading" || !session?.user || session.user.role !== "admin") return null;

  if (indexLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
        <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
        <p className="text-[12px] text-white/30 tracking-wide">News reports load ho rahe hain…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-white/[0.055]">
        <div className="px-5 md:px-8 py-4 space-y-4">

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0">
                <Newspaper className="h-4 w-4 text-white/70" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-white leading-none mb-0.5">News Analysis</h1>
                <p className="text-[11px] text-white/30">Hinglish market news · Gemini 2.0 Flash</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
              <button onClick={() => setPromptOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition">
                <Bot className="h-3.5 w-3.5" /> Prompt
              </button>
              <button onClick={() => setEditorOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.07] border border-white/[0.12] text-white/60 hover:text-white hover:bg-white/[0.10] transition">
                <Pencil className="h-3.5 w-3.5" /> Edit JSON
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-white/30 ml-1">
                <Clock className="h-3.5 w-3.5" />
                <span>Live: <span className="text-white/60 font-medium">{SESSION_LABELS[currentSession]}</span></span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              </div>
            </div>
          </div>

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
              <Radio className="h-7 w-7 text-white/20" />
            </div>
            <div className="max-w-xs">
              <p className="text-[15px] font-semibold text-white/60 mb-2">Abhi koi news report nahi hai</p>
              <p className="text-[12px] text-white/30 leading-relaxed">
                Reports GitHub Actions se auto-generate hote hain, ya <span className="text-white/50">Edit JSON</span> button se manually add karo.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400 mb-6">{error}</div>
        )}

        {reportLoading && <><BannerSkeleton /><CardsSkeleton /></>}

        {!reportLoading && !error && selectedDate && !report && availableDates.length > 0 && (
          <div className="flex flex-col items-center justify-center min-h-[45vh] gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]">
              <RefreshCw className="h-5 w-5 text-white/20" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/50 mb-1">
                {formatDateLabel(selectedDate)} ke liye {SESSION_LABELS[selectedSession]} news report nahi hai
              </p>
              <p className="text-[11px] text-white/25">
                <span className="text-white/40">Edit JSON</span> button se manually add karo.
              </p>
            </div>
          </div>
        )}

        {!reportLoading && report && (
          <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.07] border border-white/[0.10] rounded-full text-white/65">
                {report.meta.session} Session
              </span>
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.04] border border-white/[0.07] rounded-full text-white/35">
                {report.meta.language}
              </span>
              <span className="text-[11px] text-white/25">
                {new Date(report.meta.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC par generate hua
              </span>
            </div>

            {/* All News Banner */}
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] overflow-hidden mb-3">
              <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                <Newspaper className="h-3.5 w-3.5 text-white/30 shrink-0" />
                <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">Aaj Ki Sabse Badi Khabar</span>
              </div>
              <div className="px-6 py-5">
                <h2 className="text-[18px] sm:text-[20px] font-bold text-white leading-snug mb-4">{report.all_news_section.headline}</h2>
                <p className="text-[13px] text-white/60 leading-[1.85]">{report.all_news_section.summary}</p>
              </div>
            </div>

            {/* High Impact Events */}
            {report.all_news_section.high_impact_events.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">High Impact Events</h2>
                  <span className="text-[10px] text-white/15">{report.all_news_section.high_impact_events.length} events</span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {report.all_news_section.high_impact_events.map((ev, i) => <EventCard key={i} event={ev} />)}
                </div>
              </div>
            )}

            {/* Symbol grid */}
            {orderedSymbols.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Symbol-Wise Breakdown</h2>
                  <span className="text-[10px] text-white/15">{orderedSymbols.length} instruments</span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {orderedSymbols.map(sym => <SymbolCard key={sym} symbol={sym} news={report.symbol_wise_news[sym]} />)}
                </div>
              </div>
            )}
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
