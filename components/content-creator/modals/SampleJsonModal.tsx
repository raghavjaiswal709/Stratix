"use client";

import { useState } from "react";
import { Code2, X, Copy, Check, ChevronRight } from "lucide-react";
import type { CreatorMode } from "../types";
import { SAMPLE, SAMPLE_ANALYSIS, SAMPLE_NEWS, SAMPLE_FACTS, SAMPLE_LEARNINGS } from "../constants";


export function SampleJsonModal({
  mode,
  onClose,
  onApply,
}: {
  mode: CreatorMode;
  onClose: () => void;
  onApply: (json: string) => void;
}) {
  const sampleData: Record<CreatorMode, unknown> = {
    analysis: SAMPLE_ANALYSIS,
    news: SAMPLE_NEWS,
    indicator: SAMPLE,
    facts: SAMPLE_FACTS,
    learnings: SAMPLE_LEARNINGS,
    watermark: [
      {
        title: "Market Setup 1",
        description: "",
        imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
        logoPosition: "top-right",
        stratiColor: "#000000",
        xColor: "#EF4444",
        watermarkBgStyle: "glass",
        logoScale: 1
      }
    ],
    motion: {
      backgroundUrl: "",
      layers: [
        {
          id: "subject_foreground",
          name: "Extracted Subject",
          imageUrl: "",
          x: 0.2,
          y: 0.2,
          w: 0.6,
          h: 0.6,
          opacity: 1,
          scale: 1,
          rotation: 0,
          motionType: "parallax",
          motionSpeed: 1,
          motionDistance: 24
        }
      ]
    }
  };
  const json = JSON.stringify(sampleData[mode], null, 2);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const modeLabels: Record<CreatorMode, string> = {
    analysis: "Analysis", news: "News Batch", indicator: "Indicator", facts: "Facts", learnings: "Learnings", watermark: "Logo Watermark", motion: "Motion Video",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: "#0f0f0f", borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2.5">
            <Code2 className="h-4 w-4 text-white/60" />
            <span className="text-[13px] font-bold text-white tracking-wide uppercase">
              Sample JSON Schema ({modeLabels[mode]})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-white/[0.08] bg-white/5 hover:bg-white/10 cursor-pointer"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-white/5 transition-all text-white/40 hover:text-white/80 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* JSON content */}
        <div className="overflow-y-auto flex-1 p-5">
          <pre
            className="text-[11.5px] leading-relaxed whitespace-pre text-[#ffffff]"
            style={{ fontFamily: "ui-monospace, monospace" }}
          >
            <code>{json}</code>
          </pre>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-3.5 bg-white/[0.02] border-t shrink-0"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <span className="text-[11px] text-white/40">
            Paste this into the JSON tab and modify the fields
          </span>
          <button
            onClick={() => { onApply(json); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-white/90 active:scale-95 transition-all cursor-pointer"
          >
            Use Sample <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
