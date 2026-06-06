"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BrainCircuit, TrendingUp, TrendingDown, Minus, Globe,
  ChevronLeft, ChevronRight, Clock, RefreshCw, ChevronDown, ChevronUp,
  Pencil, Bot, Copy, Check, X, AlertCircle, Loader2, Database, Target,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KeyLevels { resistance: number[]; support: number[] }

interface ChochSetup {
  bias: "Long" | "Short" | "No Trade";
  entry: string;
  sl: number;
  tp1: number;
  tp2: number;
  rr: string;
  invalidation: string;
}

interface ChochQlm {
  htf_bias: "Bullish" | "Bearish" | "Neutral";
  structure: string;
  liquidity: { bsl: number[]; ssl: number[] };
  choch: { detected: boolean; type: string; level: number; sweep_level: number; confirmed: boolean };
  ob: {
    bullish?: { hi: number; lo: number; status: string };
    bearish?: { hi: number; lo: number; status: string };
  };
  fvg: {
    bullish?: { hi: number; lo: number; status: string };
    bearish?: { hi: number; lo: number; status: string };
  };
  premium_discount: { swing_lo: number; swing_hi: number; eq: number; current_zone: "Premium" | "Discount" | "Equilibrium" };
  setup: ChochSetup;
}

interface SymbolData {
  past_24h_summary: string;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  key_levels: KeyLevels;
  session_outlook: string;
  choch_qlm?: ChochQlm;
}

interface MarketReport {
  meta: { date: string; session: string; generated_at: string };
  global_macro_overview: string;
  symbols: Record<string, SymbolData>;
}

interface ReportEntry { date: string; session: string; source: "db" | "file" }

interface HCandle { t: number; o: number; h: number; l: number; c: number; v: number }
interface CandleSummary { [sym: string]: { h1: HCandle[]; h4: HCandle[] } }

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = { asian: "Asian", london: "London", new_york: "New York" };
const SESSION_ORDER = ["asian", "london", "new_york"] as const;

const SYMBOL_META: Record<string, { label: string; assetClass: string }> = {
  XAUUSD: { label: "XAU/USD", assetClass: "Metals"  }, XAGUSD:  { label: "XAG/USD",  assetClass: "Metals"  },
  BTCUSDT:{ label: "BTC/USDT",assetClass: "Crypto"  }, ETHUSD:  { label: "ETH/USD",  assetClass: "Crypto"  },
  GBPUSD: { label: "GBP/USD", assetClass: "Forex"   }, EURUSD:  { label: "EUR/USD",  assetClass: "Forex"   },
  USDJPY: { label: "USD/JPY", assetClass: "Forex"   }, AUDUSD:  { label: "AUD/USD",  assetClass: "Forex"   },
  NZDUSD: { label: "NZD/USD", assetClass: "Forex"   }, USDCAD:  { label: "USD/CAD",  assetClass: "Forex"   },
  USDCHF: { label: "USD/CHF", assetClass: "Forex"   },
};
const ASSET_CLASS_ORDER = ["Metals", "Crypto", "Forex"];

function getCurrentSession(): string {
  const h = new Date().getUTCHours();
  return h >= 22 || h < 6 ? "asian" : h < 12 ? "london" : "new_york";
}

function formatDateLabel(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmt(n: number): string {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

// ─── Prompt constants ─────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are an expert institutional market analyst specializing in the CHoCH QLM (Change of Character — Qualified Liquidity Model) strategy as taught by TOPG, combined with deep macroeconomic and intermarket analysis.

MANDATORY FRAMEWORK — CHoCH QLM by TOPG (apply strictly on the actual candle data provided):

① MULTI-TIMEFRAME BIAS (H4 → H1):
• H4/Daily: Determine overarching trend via HH/HL (bullish) or LH/LL (bearish) market structure.
• H1: Confirm BOS (Break of Structure — trend continuation) or CHoCH (Change of Character — reversal signal).
• Only trade in the H4 bias direction unless a confirmed H4 CHoCH has occurred.

② LIQUIDITY IDENTIFICATION:
• Buy-Side Liquidity (BSL): Equal highs, previous day/week highs, swing highs where stop-losses cluster.
• Sell-Side Liquidity (SSL): Equal lows, previous day/week lows, swing lows where stop-losses cluster.
• A liquidity sweep MUST precede any valid CHoCH for the QLM setup to qualify.

③ CHoCH (Change of Character) — THE TRIGGER:
• Bullish CHoCH: After SSL is swept, price aggressively closes above a prior H1 swing high → structure shifts bullish.
• Bearish CHoCH: After BSL is swept, price aggressively closes below a prior H1 swing low → structure shifts bearish.
• CHoCH must be confirmed on a CLOSED candle — wicks alone do not qualify.

④ ORDER BLOCKS (OB):
• Bullish OB: The last bearish candle body immediately before the impulsive move that caused the CHoCH. This is the entry zone.
• Bearish OB: The last bullish candle body before the impulsive bearish CHoCH move.
• Use the 50% level of the OB candle body for refined limit entries.
• An OB that price has already closed inside is mitigated and invalid.

⑤ FAIR VALUE GAPS (FVG):
• Bullish FVG: Gap where Candle[n-1].high < Candle[n+1].low — price tends to return and fill it.
• Bearish FVG: Gap where Candle[n-1].low > Candle[n+1].high.
• FVGs act as high-probability entry zones and price magnets.

⑥ PREMIUM / DISCOUNT ZONES:
• Draw from the most recent significant swing low to swing high.
• Equilibrium (EQ) = 50% of the range.
• Discount zone (below EQ): LONG entries only. Premium zone (above EQ): SHORT entries only.
• NEVER buy in premium. NEVER sell in discount. This is a cardinal QLM rule.

⑦ FULL QLM ENTRY SEQUENCE:
Step 1 → Identify H4 bias (bullish or bearish market structure).
Step 2 → Wait for opposing liquidity sweep (SSL for longs, BSL for shorts).
Step 3 → Confirm H1 CHoCH after the sweep on a closed candle.
Step 4 → Mark the OB and FVG that caused the CHoCH move.
Step 5 → Confirm price is in Discount (longs) or Premium (shorts).
Step 6 → Set limit entry at the OB or FVG; stop below the sweep candle wick.
Step 7 → Target the opposing liquidity pool (BSL for longs, SSL for shorts).

You will be provided with REAL H4 and H1 OHLCV candle data. Every level you identify — OBs, FVGs, CHoCH, liquidity zones — MUST be directly derivable from the provided data. Do not fabricate levels.

CRITICAL OUTPUT RULES:
1. Wrap your entire JSON response in a \`\`\`json ... \`\`\` code block.
2. Before outputting, mentally validate the JSON: every opening bracket { or [ must have a matching closing bracket } or ], every key must be followed by a colon, every value (except the last in an object/array) must be followed by a comma, every string must be properly double-quoted with no unescaped characters.
3. A syntactically invalid JSON response is unacceptable — double-check before outputting.
4. No placeholder text, no "...", no empty strings — every field must contain real substantive content.`;

const AI_SCHEMA_TEMPLATE = `{
  "meta": { "date": "YYYY-MM-DD", "session": "Asian|London|New York", "generated_at": "ISO-8601" },
  "global_macro_overview": "200+ word narrative: economic releases, central bank signals, geopolitical events, DXY, bonds, equities, prevailing risk regime.",
  "symbols": {
    "XAUUSD": {
      "past_24h_summary": "Detailed price action narrative with specific high/low/close, volume dynamics, ETF flows, COMEX positioning, and catalysts.",
      "sentiment": "Bullish|Bearish|Neutral",
      "key_levels": { "resistance": [0.0, 0.0, 0.0], "support": [0.0, 0.0, 0.0] },
      "session_outlook": "150+ word tactical outlook: expected range, directional bias with reasoning, key catalysts, entry zones, targets, invalidation.",
      "choch_qlm": {
        "htf_bias": "Bullish|Bearish|Neutral",
        "structure": "Describe H4/H1 structure: active BOS or CHoCH, HH/HL or LH/LL sequence, last structural break level.",
        "liquidity": { "bsl": [0.0, 0.0], "ssl": [0.0, 0.0] },
        "choch": { "detected": true, "type": "Bullish CHoCH|Bearish CHoCH|None", "level": 0.0, "sweep_level": 0.0, "confirmed": true },
        "ob": {
          "bullish": { "hi": 0.0, "lo": 0.0, "status": "Unmitigated|Mitigated" },
          "bearish": { "hi": 0.0, "lo": 0.0, "status": "Active|Broken" }
        },
        "fvg": {
          "bullish": { "hi": 0.0, "lo": 0.0, "status": "Open|Filled" },
          "bearish": { "hi": 0.0, "lo": 0.0, "status": "Open|Filled" }
        },
        "premium_discount": { "swing_lo": 0.0, "swing_hi": 0.0, "eq": 0.0, "current_zone": "Premium|Discount|Equilibrium" },
        "setup": { "bias": "Long|Short|No Trade", "entry": "price range + confluence reason", "sl": 0.0, "tp1": 0.0, "tp2": 0.0, "rr": "X:1", "invalidation": "condition" }
      }
    }
  }
}`;

function formatCandlesForPrompt(data: CandleSummary | null): string {
  if (!data) return "(live candle data unavailable — apply strategy on general knowledge)";

  const SYMBOLS_IN_ORDER = [
    "xauusd","xagusd","btcusdt","ethusd",
    "eurusd","gbpusd","usdjpy","audusd","nzdusd","usdcad","usdchf",
  ];

  const lines: string[] = ["=== REAL OHLCV MARKET DATA (Unix timestamps, UTC) ==="];

  for (const sym of SYMBOLS_IN_ORDER) {
    const d = data[sym];
    if (!d) continue;

    lines.push(`\n${sym.toUpperCase()}:`);

    if (d.h4?.length) {
      lines.push("  H4 candles (last 7 days):");
      for (const c of d.h4) {
        const dt = new Date(c.t * 1000).toISOString().slice(0, 13) + ":00Z";
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }

    if (d.h1?.length) {
      lines.push("  H1 candles (last 48 h):");
      for (const c of d.h1) {
        const dt = new Date(c.t * 1000).toISOString().slice(0, 16) + "Z";
        lines.push(`    ${dt}  O:${c.o}  H:${c.h}  L:${c.l}  C:${c.c}`);
      }
    }
  }

  return lines.join("\n");
}

// ─── Time range + news sources ────────────────────────────────────────────────

type TimeRange = "3h" | "6h" | "12h" | "18h" | "24h" | "2d" | "3d" | "7d";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "3h",  label: "Last 3h"   },
  { value: "6h",  label: "Last 6h"   },
  { value: "12h", label: "Last 12h"  },
  { value: "18h", label: "Last 18h"  },
  { value: "24h", label: "Last 24h"  },
  { value: "2d",  label: "Last 2d"   },
  { value: "3d",  label: "Last 3d"   },
  { value: "7d",  label: "Last week" },
];

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "3h":  "the last 3 hours",
  "6h":  "the last 6 hours",
  "12h": "the last 12 hours",
  "18h": "the last 18 hours",
  "24h": "the last 24 hours",
  "2d":  "the last 2 days (48 hours)",
  "3d":  "the last 3 days (72 hours)",
  "7d":  "the last 7 days (1 full week)",
};

const NEWS_SOURCES_BLOCK = `
VERIFIED NEWS SOURCES — cross-reference ALL of the following within the selected time window:
  Macro / Forex  : Reuters (reuters.com), Bloomberg (bloomberg.com), Financial Times (ft.com), Wall Street Journal (wsj.com), CNBC (cnbc.com), AP News (apnews.com), MarketWatch, Investing.com, ForexLive (forexlive.com), ForexFactory (forexfactory.com), DailyFX (dailyfx.com), FXStreet (fxstreet.com), BabyPips News
  Commodities    : Kitco (kitco.com — Gold & Silver), OilPrice.com, S&P Global Platts, World Gold Council (gold.org), Metal Bulletin
  Crypto         : CoinDesk (coindesk.com), CoinTelegraph (cointelegraph.com), The Block (theblock.co), Decrypt (decrypt.co), Blockworks (blockworks.co)
  Equities       : Yahoo Finance, Barron's (barrons.com), Benzinga (benzinga.com), Seeking Alpha, Business Insider Markets, TheStreet
  Central Banks  : federalreserve.gov, ecb.europa.eu, boj.or.jp, bankofengland.co.uk, rba.gov.au, rbnz.govt.nz, snb.ch, bankofcanada.ca
  Asia-Pacific   : Nikkei Asia (asia.nikkei.com), South China Morning Post (scmp.com), Economic Times (economictimes.com), AFR (afr.com)
  Geopolitical   : BBC Business, CNN Business, Al Jazeera Business, Guardian Business, Axios Markets`;

function buildUserMessage(
  date: string,
  session: string,
  candles: CandleSummary | null,
  timeRange: TimeRange = "24h",
): string {
  const ts     = new Date().toISOString();
  const period = TIME_RANGE_LABELS[timeRange];
  const candleBlock = formatCandlesForPrompt(candles);
  return `Today's UTC date is ${date}. The upcoming session is the ${SESSION_LABELS[session] ?? session} session.

⚠️ STRICT TIME CONSTRAINT: Analyze and include ONLY news, events, and data releases from ${period} (ending at ${ts} UTC). Any event that occurred BEFORE this window must be completely excluded — do not reference or mention anything older than the selected period. Take time to scan thoroughly within this window — do not procrastinate or rush; quality and depth matter.
${NEWS_SOURCES_BLOCK}

${candleBlock}

Using the REAL candle data above, apply the complete CHoCH QLM TOPG strategy framework. For EVERY symbol:
1. Determine H4 bias from the provided H4 candles (HH/HL or LH/LL structure).
2. Identify any recent liquidity sweeps (BSL or SSL raids visible in the data).
3. Confirm or deny a H1 CHoCH after a liquidity sweep.
4. Mark exact OB and FVG levels that caused the CHoCH (use prices from the data).
5. Determine premium/discount zone from the most recent swing range.
6. Construct the full QLM setup with precise entry, SL, TP1, TP2, and R:R from the data.

Incorporate news from ${period} (sourced from the platforms above) into global_macro_overview and each symbol's session_outlook.

Output a single raw JSON object matching this schema exactly:

${AI_SCHEMA_TEMPLATE}

Set meta.generated_at = "${ts}", meta.date = "${date}", meta.session = "${SESSION_LABELS[session] ?? session}". Include all 11 symbols. Use real price floats from the provided data.

BEFORE OUTPUTTING: Validate your JSON — balanced brackets, correct commas, quoted strings. Wrap the final output in a \`\`\`json ... \`\`\` code block.`;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-all shrink-0">
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Prompt Modal ─────────────────────────────────────────────────────────────

function PromptModal({ date, session, onClose }: { date: string; session: string; onClose: () => void }) {
  const [candles,  setCandles]  = useState<CandleSummary | null>(null);
  const [fetching, setFetching] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setCandles(d); setFetching(false); })
      .catch(e => { setFetchErr(e.message); setFetching(false); });
  }, []);

  const userMsg = buildUserMessage(date, session, candles);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-white/50" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">CHoCH QLM · TOPG Report Prompt</p>
              <p className="text-[11px] text-white/30">
                {fetching ? "Fetching live candle data…" : fetchErr ? "Candle fetch failed — prompt uses general knowledge" : `Live H1+H4 data embedded · ${SESSION_LABELS[session]} · ${date}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition"><X className="h-4 w-4" /></button>
        </div>

        {fetching ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
            <p className="text-[12px] text-white/30">Loading 48h of H1 + H4 candle data for 14 symbols…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {fetchErr && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 text-[12px] text-amber-400/80">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Candle data unavailable ({fetchErr}). Prompt will instruct AI to use general market knowledge.
              </div>
            )}

            {/* Data summary */}
            {candles && !fetchErr && (
              <div className="grid grid-cols-3 gap-2">
                {["H4 (7d)", "H1 (48h)", "Symbols"].map((label, i) => {
                  const val = i === 0
                    ? Object.values(candles).reduce((s, d) => s + (d.h4?.length ?? 0), 0)
                    : i === 1
                    ? Object.values(candles).reduce((s, d) => s + (d.h1?.length ?? 0), 0)
                    : Object.keys(candles).length;
                  return (
                    <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2.5 text-center">
                      <p className="text-[18px] font-bold text-white/70">{val}</p>
                      <p className="text-[10px] text-white/25 uppercase tracking-widest">{label} candles</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 1 — System prompt */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">1</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">System Prompt — CHoCH QLM TOPG</span>
                </div>
                <CopyButton text={AI_SYSTEM_PROMPT} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-52">{AI_SYSTEM_PROMPT}</pre>
            </div>

            {/* Step 2 — User message with embedded candle data */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">2</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">User Message</span>
                  <span className="text-[10px] text-white/20">includes real candle data · {SESSION_LABELS[session]} · {date}</span>
                </div>
                <CopyButton text={userMsg} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-64">{userMsg}</pre>
            </div>

            {/* Step 3 */}
            <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.15] px-4 py-3">
              <p className="text-[11px] font-semibold text-emerald-400/70 uppercase tracking-widest mb-1">Step 3 — Save the AI output</p>
              <p className="text-[12px] text-white/40 leading-relaxed">
                Copy both prompts → paste into Gemini as System + User → copy the JSON output → use the <span className="text-white/60 font-medium">Edit JSON</span> button on this page to save it. The <span className="text-white/60">choch_qlm</span> fields will display automatically on each symbol card.
              </p>
            </div>

          </div>
        )}

        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Editor Modal ─────────────────────────────────────────────────────────────

function EditorModal({ date, session, initialJson, onClose, onSaved }: {
  date: string; session: string; initialJson: string; onClose: () => void; onSaved: () => void;
}) {
  const [json,     setJson]     = useState(initialJson);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  function validate(v: string): boolean {
    if (!v.trim()) { setParseErr("JSON cannot be empty."); return false; }
    try { JSON.parse(v); setParseErr(null); return true; }
    catch (e) { setParseErr(e instanceof Error ? e.message : "Invalid JSON"); return false; }
  }

  function handleFormat() {
    try { setJson(JSON.stringify(JSON.parse(json), null, 2)); setParseErr(null); }
    catch (e) { setParseErr(e instanceof Error ? e.message : "Invalid JSON"); }
  }

  async function handleSave() {
    if (!validate(json)) return;
    setSaving(true); setSaveErr(null);
    try {
      const res = await fetch("/api/ai-reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, session, data: JSON.parse(json) }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`); }
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 800);
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[90vh] flex flex-col rounded-2xl bg-[#0d0d0d] border border-white/[0.10] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <Pencil className="h-3.5 w-3.5 text-white/40" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Edit Report JSON</p>
              <p className="text-[11px] text-white/30">{SESSION_LABELS[session]} · {formatDateLabel(date)} · saves to DB</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleFormat} className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition">Format JSON</button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 relative overflow-hidden">
          <textarea ref={ref} value={json} onChange={e => { setJson(e.target.value); setSaveErr(null); if (parseErr) validate(e.target.value); }} spellCheck={false}
            className={cn("w-full h-full resize-none bg-transparent px-5 py-4 text-[12px] font-mono leading-[1.7] text-white/70 focus:outline-none placeholder:text-white/15 border-b", parseErr ? "border-red-500/30" : "border-white/[0.05]")}
            placeholder={'{\n  "meta": { "date": "YYYY-MM-DD", ... },\n  ...\n}'} />
        </div>
        {(parseErr || saveErr) && (
          <div className="flex items-start gap-2 px-5 py-2.5 bg-red-500/[0.08] border-t border-red-500/20 shrink-0">
            <AlertCircle className="h-3.5 w-3.5 text-red-400/70 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-400/80 font-mono">{parseErr ?? saveErr}</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.07] shrink-0 bg-[#0d0d0d]">
          <div className="flex items-center gap-1.5 text-[11px] text-white/25"><Database className="h-3 w-3" />Saved to MongoDB</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.06] border border-white/[0.07] transition disabled:opacity-40">Cancel</button>
            <button onClick={handleSave} disabled={saving || saved || !!parseErr}
              className={cn("flex items-center gap-2 px-5 py-2 rounded-xl text-[12px] font-semibold transition", saved ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400" : "bg-white/[0.10] border border-white/[0.15] text-white hover:bg-white/[0.15] disabled:opacity-40 disabled:cursor-not-allowed")}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
              {saving ? "Saving…" : saved ? "Saved!" : "Save to DB"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CHOCH QLM card section ───────────────────────────────────────────────────

function ChochSection({ qlm }: { qlm: ChochQlm }) {
  const isLong  = qlm.setup?.bias === "Long";
  const isShort = qlm.setup?.bias === "Short";

  return (
    <div className="px-5 pb-5 pt-4 border-t border-white/[0.05] space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Target className="h-3 w-3 text-white/30 shrink-0" />
          <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">CHoCH · QLM · TOPG</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border",
            qlm.htf_bias === "Bullish" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
            qlm.htf_bias === "Bearish" ? "bg-red-500/15 text-red-400 border-red-500/25" :
            "bg-white/[0.05] text-white/35 border-white/[0.08]")}>
            HTF: {qlm.htf_bias}
          </span>
          {qlm.premium_discount?.current_zone && (
            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-semibold border",
              qlm.premium_discount.current_zone === "Discount"     ? "bg-emerald-500/10 text-emerald-400/70 border-emerald-500/20" :
              qlm.premium_discount.current_zone === "Premium"      ? "bg-red-500/10 text-red-400/70 border-red-500/20" :
              "bg-white/[0.04] text-white/30 border-white/[0.07]")}>
              {qlm.premium_discount.current_zone}
            </span>
          )}
          {qlm.choch?.detected && (
            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold border",
              qlm.choch.type?.includes("Bullish") ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
              qlm.choch.type?.includes("Bearish") ? "bg-red-500/15 text-red-400 border-red-500/25" :
              "bg-white/[0.05] text-white/35 border-white/[0.08]")}>
              CHoCH {qlm.choch.confirmed ? "✓" : "⏳"}
            </span>
          )}
        </div>
      </div>

      {/* Structure note */}
      {qlm.structure && (
        <p className="text-[11px] text-white/45 leading-relaxed">{qlm.structure}</p>
      )}

      {/* Liquidity pools */}
      {(qlm.liquidity?.bsl?.length || qlm.liquidity?.ssl?.length) && (
        <div className="grid grid-cols-2 gap-2">
          {[["BSL", qlm.liquidity.bsl, "emerald"] as const, ["SSL", qlm.liquidity.ssl, "red"] as const].map(([label, levels, col]) => (
            <div key={label}>
              <p className={cn("text-[9px] font-bold uppercase tracking-widest mb-1",
                col === "emerald" ? "text-emerald-500/40" : "text-red-500/40")}>{label}</p>
              <div className="flex flex-col gap-0.5">
                {(levels ?? []).slice(0, 3).map((l, i) => (
                  <span key={i} className={cn("text-[11px] font-mono px-2 py-0.5 rounded",
                    col === "emerald" ? "bg-emerald-500/[0.07] text-emerald-400/70" : "bg-red-500/[0.07] text-red-400/70")}>
                    {fmt(l)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OB + FVG row */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {qlm.ob?.bullish && (
          <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15 px-2.5 py-2">
            <p className="text-[9px] font-bold text-emerald-500/40 uppercase tracking-widest mb-1">Bullish OB</p>
            <p className="font-mono text-emerald-400/70">{fmt(qlm.ob.bullish.lo)} — {fmt(qlm.ob.bullish.hi)}</p>
            <p className="text-[10px] text-white/25 mt-0.5">{qlm.ob.bullish.status}</p>
          </div>
        )}
        {qlm.ob?.bearish && (
          <div className="rounded-lg bg-red-500/[0.06] border border-red-500/15 px-2.5 py-2">
            <p className="text-[9px] font-bold text-red-500/40 uppercase tracking-widest mb-1">Bearish OB</p>
            <p className="font-mono text-red-400/70">{fmt(qlm.ob.bearish.lo)} — {fmt(qlm.ob.bearish.hi)}</p>
            <p className="text-[10px] text-white/25 mt-0.5">{qlm.ob.bearish.status}</p>
          </div>
        )}
        {qlm.fvg?.bullish && (
          <div className="rounded-lg bg-emerald-500/[0.04] border border-emerald-500/10 px-2.5 py-2">
            <p className="text-[9px] font-bold text-emerald-500/35 uppercase tracking-widest mb-1">Bullish FVG</p>
            <p className="font-mono text-emerald-400/60">{fmt(qlm.fvg.bullish.lo)} — {fmt(qlm.fvg.bullish.hi)}</p>
            <p className="text-[10px] text-white/20 mt-0.5">{qlm.fvg.bullish.status}</p>
          </div>
        )}
        {qlm.fvg?.bearish && (
          <div className="rounded-lg bg-red-500/[0.04] border border-red-500/10 px-2.5 py-2">
            <p className="text-[9px] font-bold text-red-500/35 uppercase tracking-widest mb-1">Bearish FVG</p>
            <p className="font-mono text-red-400/60">{fmt(qlm.fvg.bearish.lo)} — {fmt(qlm.fvg.bearish.hi)}</p>
            <p className="text-[10px] text-white/20 mt-0.5">{qlm.fvg.bearish.status}</p>
          </div>
        )}
      </div>

      {/* Trade setup */}
      {qlm.setup && qlm.setup.bias !== "No Trade" && (
        <div className={cn("rounded-xl px-4 py-3 border",
          isLong  ? "bg-emerald-500/[0.07] border-emerald-500/20" :
          isShort ? "bg-red-500/[0.07] border-red-500/20" :
          "bg-white/[0.03] border-white/[0.07]")}>
          <div className="flex items-center justify-between mb-2">
            <p className={cn("text-[10px] font-bold uppercase tracking-widest",
              isLong ? "text-emerald-400/70" : "text-red-400/70")}>
              {qlm.setup.bias} Setup
            </p>
            <span className="text-[10px] text-white/30 font-medium">R:R {qlm.setup.rr}</span>
          </div>
          <p className={cn("text-[11px] font-medium mb-2", isLong ? "text-emerald-400/60" : isShort ? "text-red-400/60" : "text-white/40")}>
            Entry: {qlm.setup.entry}
          </p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
            <div><span className="text-white/20">SL</span> <span className="text-red-400/70 font-mono ml-1">{fmt(qlm.setup.sl)}</span></div>
            <div><span className="text-white/20">TP1</span> <span className="text-emerald-400/70 font-mono ml-1">{fmt(qlm.setup.tp1)}</span></div>
            <div><span className="text-white/20">TP2</span> <span className="text-emerald-400/50 font-mono ml-1">{fmt(qlm.setup.tp2)}</span></div>
          </div>
          {qlm.setup.invalidation && (
            <p className="text-[10px] text-white/25 mt-2 leading-relaxed">↯ {qlm.setup.invalidation}</p>
          )}
        </div>
      )}

      {qlm.setup?.bias === "No Trade" && (
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-4 py-2.5 text-center">
          <p className="text-[11px] text-white/35">No valid QLM setup for this session — wait for liquidity sweep + CHoCH confirmation.</p>
        </div>
      )}
    </div>
  );
}

// ─── Sentiment badge ──────────────────────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const b = sentiment.toLowerCase() === "bullish";
  const r = sentiment.toLowerCase() === "bearish";
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0",
      b && "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
      r && "bg-red-500/15 text-red-400 border-red-500/25",
      !b && !r && "bg-white/[0.06] text-white/50 border-white/[0.10]")}>
      {b && <TrendingUp className="h-3 w-3" />}{r && <TrendingDown className="h-3 w-3" />}{!b && !r && <Minus className="h-3 w-3" />}
      {sentiment}
    </span>
  );
}

function LevelPill({ value, type }: { value: number; type: "resistance" | "support" }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-2 py-1 rounded-md text-[11px] font-mono",
      type === "resistance" ? "bg-red-500/[0.07] text-red-400/80" : "bg-emerald-500/[0.07] text-emerald-400/80")}>
      <span className={cn("text-[9px] font-bold uppercase tracking-widest font-sans",
        type === "resistance" ? "text-red-500/40" : "text-emerald-500/40")}>{type === "resistance" ? "R" : "S"}</span>
      <span>{fmt(value)}</span>
    </div>
  );
}

function SymbolCard({ symbol, data }: { symbol: string; data: SymbolData }) {
  const meta = SYMBOL_META[symbol] ?? { label: symbol, assetClass: "Other" };
  const [expanded, setExpanded] = useState(false);
  const SLIMIT = 220; const OLIMIT = 280;
  const needsExpand = data.past_24h_summary.length > SLIMIT || data.session_outlook.length > OLIMIT;

  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.025] border border-white/[0.07] hover:border-white/[0.12] transition-colors duration-200 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[15px] font-bold text-white leading-none">{meta.label}</h3>
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-white/[0.05] text-white/30 border border-white/[0.07] rounded">{meta.assetClass}</span>
          </div>
          <span className="text-[10px] text-white/20 font-mono tracking-wider">{symbol}</span>
        </div>
        <SentimentBadge sentiment={data.sentiment} />
      </div>

      <div className="px-5 pb-4">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">24h Summary</p>
        <p className="text-[12px] text-white/55 leading-relaxed">
          {!expanded && data.past_24h_summary.length > SLIMIT ? data.past_24h_summary.slice(0, SLIMIT) + "…" : data.past_24h_summary}
        </p>
      </div>

      {(data.key_levels.resistance.length > 0 || data.key_levels.support.length > 0) && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-1.5">Resistance</p>
            <div className="flex flex-col gap-1">{data.key_levels.resistance.slice(0, 3).map((r, i) => <LevelPill key={i} value={r} type="resistance" />)}</div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-1.5">Support</p>
            <div className="flex flex-col gap-1">{data.key_levels.support.slice(0, 3).map((s, i) => <LevelPill key={i} value={s} type="support" />)}</div>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 pt-3 border-t border-white/[0.05]">
        <p className="text-[10px] font-semibold text-white/20 uppercase tracking-widest mb-2">Session Outlook</p>
        <p className="text-[12px] text-white/70 leading-relaxed">
          {!expanded && data.session_outlook.length > OLIMIT ? data.session_outlook.slice(0, OLIMIT) + "…" : data.session_outlook}
        </p>
      </div>

      {/* CHOCH QLM section — renders only when choch_qlm is present in the report */}
      {data.choch_qlm && <ChochSection qlm={data.choch_qlm} />}

      {needsExpand && (
        <button onClick={() => setExpanded(v => !v)} className="flex items-center justify-center gap-1 w-full py-2.5 text-[11px] text-white/25 hover:text-white/55 border-t border-white/[0.05] transition-colors">
          {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Read full analysis</>}
        </button>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 animate-pulse">
      <div className="flex justify-between gap-3 mb-5"><div className="space-y-2"><div className="h-4 w-24 bg-white/[0.07] rounded" /><div className="h-3 w-14 bg-white/[0.04] rounded" /></div><div className="h-6 w-20 bg-white/[0.06] rounded-full" /></div>
      <div className="space-y-1.5 mb-5">{[1,.9,.75,.6].map((w,i)=><div key={i} className="h-3 bg-white/[0.04] rounded" style={{width:`${w*100}%`}}/>)}</div>
      <div className="grid grid-cols-2 gap-3 mb-5">{[0,1].map(s=><div key={s} className="space-y-1.5"><div className="h-3 w-16 bg-white/[0.04] rounded mb-2"/>{[0,1,2].map(r=><div key={r} className="h-6 bg-white/[0.04] rounded"/>)}</div>)}</div>
      <div className="border-t border-white/[0.05] pt-4 space-y-1.5">{[1,.9,.8,.65].map((w,i)=><div key={i} className="h-3 bg-white/[0.04] rounded" style={{width:`${w*100}%`}}/>)}</div>
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
  const [editorOpen,      setEditorOpen]      = useState(false);
  const [promptOpen,      setPromptOpen]      = useState(false);

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
          const best = SESSION_ORDER.slice().reverse().find(s => data.filter(r => r.date === dates[0]).some(r => r.session === s));
          setSelectedSession(best ?? "asian");
        }
      })
      .catch(() => setError("Failed to load report index."))
      .finally(() => setIndexLoading(false));
  }, []);

  const loadReport = useCallback(async (date: string, sess: string) => {
    if (!reports.some(r => r.date === date && r.session === sess)) { setReport(null); return; }
    setReportLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ai-reports?date=${encodeURIComponent(date)}&session=${encodeURIComponent(sess)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e) { setError(`Failed to load: ${e instanceof Error ? e.message : "Unknown"}`); setReport(null); }
    finally { setReportLoading(false); }
  }, [reports]);

  useEffect(() => {
    if (selectedDate && selectedSession && reports.length > 0) loadReport(selectedDate, selectedSession);
  }, [selectedDate, selectedSession, reports, loadReport]);

  const dateIndex       = availableDates.indexOf(selectedDate);
  const canGoBack       = dateIndex < availableDates.length - 1;
  const canGoFwd        = dateIndex > 0;
  const sessionsForDate = reports.filter(r => r.date === selectedDate).map(r => r.session);
  const currentEntry    = reports.find(r => r.date === selectedDate && r.session === selectedSession);

  const symbolGroups: Record<string, [string, SymbolData][]> = {};
  if (report) {
    for (const [sym, data] of Object.entries(report.symbols)) {
      const cls = SYMBOL_META[sym]?.assetClass ?? "Other";
      (symbolGroups[cls] ??= []).push([sym, data]);
    }
  }

  if (status === "loading" || !session?.user || session.user.role !== "admin") return null;

  if (indexLoading) return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3">
      <div className="h-5 w-5 rounded-full border-[1.5px] border-white/20 border-t-white/70 animate-spin" />
      <p className="text-[12px] text-white/30 tracking-wide">Loading reports…</p>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-white/[0.055]">
        <div className="px-5 md:px-8 py-4 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.10] shrink-0"><BrainCircuit className="h-4 w-4 text-white/70" /></div>
              <div>
                <h1 className="text-[15px] font-bold text-white leading-none mb-0.5">AI Report</h1>
                <p className="text-[11px] text-white/30">CHoCH QLM · TOPG · Gemini 2.0 Flash</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentEntry && (
                <span className={cn("flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border",
                  currentEntry.source === "db" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400/80" : "bg-white/[0.04] border-white/[0.07] text-white/25")}>
                  <Database className="h-2.5 w-2.5" />{currentEntry.source === "db" ? "DB" : "File"}
                </span>
              )}
              <button onClick={() => setPromptOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.07] transition">
                <Bot className="h-3.5 w-3.5" /> Prompt
              </button>
              <button onClick={() => setEditorOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.07] border border-white/[0.12] text-white/60 hover:text-white hover:bg-white/[0.10] transition">
                <Pencil className="h-3.5 w-3.5" /> Edit JSON
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-white/30 ml-1">
                <Clock className="h-3.5 w-3.5" />
                <span>Live: <span className="text-white/60 font-medium">{SESSION_LABELS[currentSession]}</span></span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              {SESSION_ORDER.map(s => {
                const available = sessionsForDate.includes(s);
                const active = selectedSession === s;
                return (
                  <button key={s} onClick={() => available && setSelectedSession(s)} disabled={!available && availableDates.length > 0}
                    className={cn("px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150",
                      active ? "bg-white/[0.10] text-white border border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                             : available ? "text-white/40 hover:text-white/70 hover:bg-white/[0.05]" : "text-white/15 cursor-not-allowed")}>
                    {SESSION_LABELS[s]}{currentSession === s && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => canGoBack && setSelectedDate(availableDates[dateIndex + 1])} disabled={!canGoBack}
                className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.04] border border-white/[0.07] text-white/40 hover:text-white/80 hover:bg-white/[0.08] disabled:opacity-20 disabled:cursor-not-allowed transition">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[12px] font-medium text-white/70 min-w-[148px] text-center select-none">{selectedDate ? formatDateLabel(selectedDate) : "No reports"}</span>
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
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]"><BrainCircuit className="h-7 w-7 text-white/20" /></div>
            <div className="max-w-xs">
              <p className="text-[15px] font-semibold text-white/60 mb-2">No reports yet</p>
              <p className="text-[12px] text-white/30 leading-relaxed">Use the <span className="text-white/50">Prompt</span> button to generate a CHoCH QLM report with live candle data, then save it via <span className="text-white/50">Edit JSON</span>.</p>
            </div>
          </div>
        )}
        {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400 mb-6">{error}</div>}
        {reportLoading && (
          <>
            <div className="h-40 rounded-2xl bg-white/[0.025] border border-white/[0.07] p-5 animate-pulse mb-6">
              <div className="h-3 w-32 bg-white/[0.07] rounded mb-4" />
              <div className="space-y-2">{[1,.95,.85,.9,.75].map((w,i)=><div key={i} className="h-3 bg-white/[0.04] rounded" style={{width:`${w*100}%`}}/>)}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({length:6}).map((_,i)=><SkeletonCard key={i}/>)}</div>
          </>
        )}
        {!reportLoading && !error && selectedDate && !report && availableDates.length > 0 && (
          <div className="flex flex-col items-center justify-center min-h-[45vh] gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.07]"><RefreshCw className="h-5 w-5 text-white/20" /></div>
            <div>
              <p className="text-[14px] font-medium text-white/50 mb-1">No {SESSION_LABELS[selectedSession]} report for {formatDateLabel(selectedDate)}</p>
              <p className="text-[11px] text-white/25">Use <span className="text-white/40">Prompt</span> → generate → <span className="text-white/40">Edit JSON</span> → save.</p>
            </div>
          </div>
        )}
        {!reportLoading && report && (
          <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-white/[0.07] border border-white/[0.10] rounded-full text-white/65">{report.meta.session} Session</span>
              <span className="text-[11px] text-white/25">Generated {new Date(report.meta.generated_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"})} UTC</span>
            </div>
            <div className="rounded-2xl bg-white/[0.025] border border-white/[0.07] p-6 mb-8">
              <div className="flex items-center gap-2 mb-4"><Globe className="h-4 w-4 text-white/35 shrink-0" /><h2 className="text-[11px] font-semibold text-white/45 uppercase tracking-widest">Global Macro Overview</h2></div>
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

      {editorOpen && (
        <EditorModal date={selectedDate} session={selectedSession}
          initialJson={report ? JSON.stringify(report, null, 2) : ""}
          onClose={() => setEditorOpen(false)} onSaved={() => loadReport(selectedDate, selectedSession)} />
      )}
      {promptOpen && (
        <PromptModal date={selectedDate || new Date().toISOString().slice(0, 10)} session={selectedSession} onClose={() => setPromptOpen(false)} />
      )}
    </div>
  );
}
