"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyButton } from "../modals/CopyButton";

export function PromptOutput({
  text,
  label = "Generated Prompt",
  placeholder = "Fill in a topic and hit Build Prompt to generate your ready-to-paste prompt here.",
  hint,
  collapsible = false,
  defaultOpen = true,
}: {
  text: string | null;
  label?: string;
  placeholder?: string;
  hint?: string;
  /** Renders the body behind a toggle — for secondary prompts that would
   *  otherwise dominate the panel. Copy stays reachable while collapsed. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.02]">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={isOpen}
            className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-white/40 transition-transform group-hover:text-white/70",
                !isOpen && "-rotate-90"
              )}
            />
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest truncate group-hover:text-white/70 transition-colors">
              {label}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 shrink-0 text-white/40" />
            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest truncate">{label}</span>
          </div>
        )}
        <CopyButton text={text ?? ""} disabled={!text} />
      </div>

      {isOpen && (
        <>
          {hint ? (
            <p className="px-4 pt-2.5 text-[10.5px] text-white/35 leading-relaxed">{hint}</p>
          ) : null}
          <textarea
            readOnly
            value={text ?? placeholder}
            spellCheck={false}
            className={cn(
              "w-full h-80 resize-none outline-none px-4 py-3 text-[11px] leading-relaxed whitespace-pre-wrap bg-transparent font-mono",
              text ? "text-white/70" : "text-white/25 italic"
            )}
            style={{ fontFamily: "ui-monospace, monospace" }}
          />
        </>
      )}
    </div>
  );
}
