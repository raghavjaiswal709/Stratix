"use client";

import { Bot } from "lucide-react";

export function AiPromptTab({
  setShowPromptModal,
}: {
  setShowPromptModal: (show: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Banner info */}
      <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-white/50" />
          <span className="text-[11px] font-bold text-white uppercase tracking-wider">CHoCH QLM Hinglish News Prompt</span>
        </div>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Opens the full three-section AI prompt generator — System Prompt, User Message with live H1+H4 candle data, and Reference JSON schema. Select session, date, currency pairs and copy each block individually or all at once.
        </p>
        <div className="flex flex-wrap gap-2 text-[10px] text-white/30">
          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">📊 Live H1+H4 OHLCV data</span>
          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">🌐 V1 — Full Internet</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/[0.08] border border-emerald-500/[0.15] text-emerald-400/60">𝕏 V5 — Twitter Feeds</span>
        </div>
      </div>

      {/* Open modal button */}
      <button
        onClick={() => setShowPromptModal(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.12)] border border-transparent"
      >
        <Bot className="h-4 w-4" />
        Open Prompt Generator
      </button>

      {/* Tip */}
      <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.12] px-4 py-3">
        <p className="text-[10px] font-semibold text-emerald-400/60 uppercase tracking-widest mb-1">How to use</p>
        <ol className="text-[11px] text-white/35 leading-relaxed space-y-1">
          <li>1. Open prompt generator and select session, date &amp; symbols</li>
          <li>2. Copy all 3 blocks into your AI (ChatGPT / Gemini)</li>
          <li>3. Paste the generated JSON into the <span className="text-white/55 font-medium">JSON Tab</span></li>
          <li>4. Hit Force Re-render — posters appear instantly</li>
        </ol>
      </div>
    </div>
  );
}
