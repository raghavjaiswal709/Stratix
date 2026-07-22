"use client";

import { useState, useEffect } from "react";
import { X, AlertCircle, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderTemplate } from "@/lib/prompts/template";
import { CopyButton } from "./CopyButton";
import {
  SESSION_LABELS,
  SESSION_ORDER,
  SYMBOL_META,
  SYMBOL_DISPLAY_ORDER,
  TIME_RANGE_OPTIONS,
  NEWS_POSTER_SCHEMA_EXAMPLE,
  DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE,
  buildNewsUserMessageV5,
  buildNewsUserMessage,
} from "../promptBuilders";
import type { TimeRange } from "../promptBuilders";


import {
  NEWS_SYSTEM_PROMPT,
  NEWS_SYSTEM_PROMPT_V5,
  EXAMPLE_REFERENCE_JSON,
} from "../creatorPrompts";
export const PROMPT_VERSIONS = [
  { id: "v1", label: "V1 — Full Internet Search" },
  { id: "v5", label: "V5 — Twitter Feeds Only" },
] as const;
export type PromptVersion = typeof PROMPT_VERSIONS[number]["id"];
export function PromptModal({
  defaultDate,
  defaultSession,
  onClose,
}: {
  defaultDate: string;
  defaultSession: string;
  onClose: () => void;
}) {
  const [candles,   setCandles]   = useState<any>(null);
  const [fetching,  setFetching]  = useState(true);
  const [fetchErr,  setFetchErr]  = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [promptVersion, setPromptVersion] = useState<PromptVersion>("v5");

  const [modalDate, setModalDate]       = useState(defaultDate);
  const [modalSession, setModalSession] = useState(defaultSession);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(SYMBOL_DISPLAY_ORDER);

  const [v1SystemTemplate, setV1SystemTemplate] = useState(NEWS_SYSTEM_PROMPT);
  const [v5SystemTemplate, setV5SystemTemplate] = useState(NEWS_SYSTEM_PROMPT_V5);
  const [userTemplate, setUserTemplate] = useState(DEFAULT_DAILY_ANALYSIS_USER_TEMPLATE);
  const [recentlyCoveredBlock, setRecentlyCoveredBlock] = useState("(Loading recently-covered stories…)");

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setCandles(d); setFetching(false); })
      .catch(e => { setFetchErr(e.message); setFetching(false); });
  }, []);

  // Admin-editable prompts (Admin → Prompt Management) — fall back to the
  // built-in defaults above until these load.
  useEffect(() => {
    Promise.all([
      fetch("/api/prompts/contentCreator.dailyAnalysisV1.system").then(r => (r.ok ? r.json() : null)),
      fetch("/api/prompts/contentCreator.dailyAnalysisV5.system").then(r => (r.ok ? r.json() : null)),
      fetch("/api/prompts/contentCreator.dailyAnalysisUser").then(r => (r.ok ? r.json() : null)),
    ]).then(([v1, v5, usr]) => {
      if (v1?.content) setV1SystemTemplate(v1.content);
      if (v5?.content) setV5SystemTemplate(v5.content);
      if (usr?.content) setUserTemplate(usr.content);
    }).catch(() => { /* fall back to built-in defaults */ });
  }, []);

  // Same rolling "don't repeat the last few batches" data the automatic News
  // Batch generator uses server-side — keeps this external/copy-paste prompt
  // in sync with the internal one for the same poster feature.
  useEffect(() => {
    fetch("/api/content-creator/recently-covered")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.block) setRecentlyCoveredBlock(d.block); })
      .catch(() => setRecentlyCoveredBlock("(Unable to load recently-covered stories — proceed without this check.)"));
  }, []);

  const symbolsRule = selectedSymbols.length > 0
    ? `• ALWAYS populate all selected keys in symbol_wise_news (${selectedSymbols.join(", ")}) — none of these selected symbols can be omitted under any circumstances.`
    : "• ALWAYS populate all selected keys in symbol_wise_news — none of these selected symbols can be omitted under any circumstances.";

  const isV5 = promptVersion === "v5";

  const dynamicSystemPrompt = renderTemplate(isV5 ? v5SystemTemplate : v1SystemTemplate, {
    SYMBOLS_RULE: symbolsRule,
    RECENTLY_COVERED_BLOCK: recentlyCoveredBlock,
  });

  const userMsg = selectedSymbols.length > 0
    ? (isV5
        ? buildNewsUserMessageV5(modalDate, modalSession, candles, timeRange, selectedSymbols, userTemplate)
        : buildNewsUserMessage(modalDate, modalSession, candles, timeRange, selectedSymbols, userTemplate))
    : "(Please select at least one currency pair / symbol)";

  const copyAllText = `=== SYSTEM PROMPT ===\n${dynamicSystemPrompt}\n\n${"─".repeat(60)}\n\n=== USER MESSAGE ===\n${userMsg}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[#111] border border-white/[0.10] shadow-2xl overflow-hidden text-white font-sans">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bot className="h-4 w-4 text-white/50 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white/80 font-sans">Stratix News Prompt Generator</p>
              <p className="text-[11px] text-white/35 font-sans">
                {fetching ? "Live candle data load ho rahi hai…" : fetchErr ? "Candle fetch failed — general knowledge" : `H1+H4 data embed hua · ${SESSION_LABELS[modalSession] || modalSession} · ${modalDate}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest hidden sm:block">Prompt</span>
              <select
                value={promptVersion}
                onChange={(e) => setPromptVersion(e.target.value as PromptVersion)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.10] text-white/70 focus:outline-none focus:border-white/[0.25] cursor-pointer appearance-none pr-6 relative"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
              >
                {PROMPT_VERSIONS.map(v => (
                  <option key={v.id} value={v.id} className="bg-[#1a1a1a] text-white">
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Date, Session and News Window */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0 space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">Session</span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                {SESSION_ORDER.map(s => (
                  <button
                    key={s}
                    onClick={() => setModalSession(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                      modalSession === s
                        ? "bg-white/[0.10] text-white border border-white/[0.12]"
                        : "text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                    )}
                  >
                    {SESSION_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">Date</span>
              <input
                type="date"
                value={modalDate}
                onChange={(e) => setModalDate(e.target.value)}
                className="px-2 py-1 rounded-lg text-[11px] font-medium bg-white/[0.03] border border-white/[0.08] text-white/70 focus:outline-none focus:border-white/[0.20]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest shrink-0">News Window</span>
              <div className="flex items-center gap-1">
                {TIME_RANGE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeRange(opt.value as TimeRange)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border cursor-pointer",
                      timeRange === opt.value
                        ? "bg-white/[0.12] text-white border-white/[0.18]"
                        : "bg-white/[0.03] text-white/35 border-white/[0.06] hover:text-white/60 hover:bg-white/[0.07]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Currency Pairs / Symbols Selectors */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01] shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Currency Pairs / Symbols</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedSymbols(SYMBOL_DISPLAY_ORDER)}
                className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
              >
                Select All
              </button>
              <span className="text-white/10">|</span>
              <button
                onClick={() => setSelectedSymbols([])}
                className="text-[10px] font-semibold text-red-400/80 hover:text-red-300 transition cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SYMBOL_DISPLAY_ORDER.map(sym => {
              const isSelected = selectedSymbols.includes(sym);
              const meta = SYMBOL_META[sym];
              return (
                <button
                  key={sym}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedSymbols(prev => prev.filter(s => s !== sym));
                    } else {
                      setSelectedSymbols(prev => [...prev, sym]);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-all border cursor-pointer",
                    isSelected
                      ? "bg-white/[0.08] text-white border-white/[0.15]"
                      : "bg-white/[0.02] text-white/30 border-white/[0.05] hover:text-white/50 hover:bg-white/[0.04]"
                  )}
                >
                  <span>{meta?.flag}</span>
                  <span>{meta?.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {fetching ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 text-white/30 animate-spin" />
            <p className="text-[12px] text-white/30">Symbols ka candle data load ho raha hai…</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {isV5 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.18]">
                <span className="text-emerald-400 text-[13px] shrink-0 mt-0.5">𝕏</span>
                <div>
                  <p className="text-[11px] font-semibold text-emerald-400/80 mb-0.5">V5 — Twitter/X Feeds Only</p>
                  <p className="text-[11px] text-white/35 leading-relaxed">
                    AI sirf <span className="text-white/55 font-mono">@FirstSquawk</span>, <span className="text-white/55 font-mono">@investingLive_</span>, aur <span className="text-white/55 font-mono">@ForexFactory</span> se news fetch karega. Koi aur source nahi. Zero noise.
                  </p>
                </div>
              </div>
            )}
            {fetchErr && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 text-[12px] text-amber-400/80">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Candle data nahi mili ({fetchErr}). AI general market knowledge use karega.
              </div>
            )}

            {candles && !fetchErr && (
              <div className="grid grid-cols-3 gap-2">
                {(["H4 (7d)", "H1 (48h)", "Symbols Selected"] as const).map((label, i) => {
                  const val = i === 0
                    ? Object.entries(candles)
                        .filter(([sym]) => selectedSymbols.includes(sym.toUpperCase()))
                        .reduce((s: number, [, d]: [string, any]) => s + (d.h4?.length ?? 0), 0)
                    : i === 1
                    ? Object.entries(candles)
                        .filter(([sym]) => selectedSymbols.includes(sym.toUpperCase()))
                        .reduce((s: number, [, d]: [string, any]) => s + (d.h1?.length ?? 0), 0)
                    : selectedSymbols.length;
                  return (
                    <div key={label} className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2.5 text-center">
                      <p className="text-[18px] font-bold text-white/70">{val}</p>
                      <p className="text-[10px] text-white/25 uppercase tracking-widest">{label}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">1</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">System Prompt</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide",
                    isV5
                      ? "bg-emerald-500/[0.12] text-emerald-400/80 border border-emerald-500/[0.20]"
                      : "bg-white/[0.06] text-white/30 border border-white/[0.08]"
                  )}>
                    {isV5 ? "V5 · Twitter Only" : "V1 · Full Internet"}
                  </span>
                </div>
                <CopyButton text={dynamicSystemPrompt} disabled={selectedSymbols.length === 0} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-48">{dynamicSystemPrompt}</pre>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">2</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">
                    {isV5 ? "User Message + Candle Data (Twitter Feeds)" : "User Message + Real Candle Data"}
                  </span>
                  <span className="text-[10px] text-white/20">{SESSION_LABELS[modalSession] || modalSession} · {modalDate}</span>
                </div>
                <CopyButton text={userMsg} disabled={selectedSymbols.length === 0} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-64">{userMsg}</pre>
            </div>

            <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.10] text-[9px] font-bold text-white/50">3</span>
                  <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Reference JSON Example</span>
                </div>
                <CopyButton text={NEWS_POSTER_SCHEMA_EXAMPLE} />
              </div>
              <pre className="px-4 py-3 text-[11px] text-white/50 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto max-h-64">{NEWS_POSTER_SCHEMA_EXAMPLE}</pre>
            </div>

            <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.15] px-4 py-3">
              <p className="text-[11px] font-semibold text-emerald-400/70 uppercase tracking-widest mb-1">Step 4 — Save &amp; Create Posters</p>
              <p className="text-[12px] text-white/40 leading-relaxed">
                AI ka generated JSON copy karo → content creator ke <span className="text-white/60 font-medium">JSON Tab</span> mein paste karo → Force Re-render. Sabhi events aur symbols ke poster automatically display honge.
              </p>
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-white/[0.07] shrink-0 flex items-center justify-between gap-3">
          <CopyButton text={copyAllText} label="Copy All Blocks" disabled={selectedSymbols.length === 0} />
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[12px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition cursor-pointer">Close</button>
        </div>
      </div>
    </div>
  );
}
