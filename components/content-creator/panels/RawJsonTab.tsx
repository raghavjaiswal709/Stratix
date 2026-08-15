"use client";

import { AlertCircle } from "lucide-react";

export function RawJsonTab({
  jsonText,
  setJsonText,
  jsonError,
  setShowSample,
}: {
  jsonText: string;
  setJsonText: (text: string) => void;
  jsonError: string | null;
  setShowSample: (show: boolean) => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0 space-y-3.5">
      <div className="flex items-center justify-between shrink-0">
        <p
          className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider"
        >
          Raw JSON Data
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSample(true)}
            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase text-white/60 hover:text-white transition border border-white/5 cursor-pointer"
          >
            Load Sample
          </button>
          {jsonError && (
            <div className="flex items-center gap-1 text-red-500">
              <AlertCircle className="h-3 w-3" />
              <span className="text-[9px]">
                Invalid JSON
              </span>
            </div>
          )}
        </div>
      </div>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        spellCheck={false}
        className="w-full min-h-[350px] flex-1 resize-none rounded-xl p-3 text-[11px] leading-relaxed outline-none transition-all"
        style={{
          background: "rgba(255, 255, 255, 0.03)",
          border: `1px solid ${jsonError ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
          color: "#ffffff",
          fontFamily: "var(--font-mono), monospace",
          caretColor: "#ffffff",
        }}
      />
    </div>
  );
}
