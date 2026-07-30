"use client";

import { FileText } from "lucide-react";
import { CopyButton } from "../modals/CopyButton";

export function PromptOutput({ text }: { text: string | null }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-white/40" />
          <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Generated Prompt</span>
        </div>
        <CopyButton text={text ?? ""} disabled={!text} />
      </div>
      <textarea
        readOnly
        value={text ?? "Fill in a topic and hit Build Prompt to generate your ready-to-paste prompt here."}
        spellCheck={false}
        className={`w-full h-80 resize-none outline-none px-4 py-3 text-[11px] leading-relaxed whitespace-pre-wrap bg-transparent font-mono ${
          text ? "text-white/70" : "text-white/25 italic"
        }`}
        style={{ fontFamily: "ui-monospace, monospace" }}
      />
    </div>
  );
}
