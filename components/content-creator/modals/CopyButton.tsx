"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";


export function CopyButton({ text, label = "Copy", disabled = false }: { text: string; label?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={cn(
        "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border",
        disabled
          ? "opacity-40 cursor-not-allowed bg-transparent border-white/[0.04] text-white/20"
          : "bg-white/[0.05] border-white/[0.10] text-white/60 hover:text-white hover:bg-white/[0.10] active:scale-95"
      )}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}
