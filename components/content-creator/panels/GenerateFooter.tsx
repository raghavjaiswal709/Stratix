"use client";

import {
  AlertCircle,
  Bot,
  BookOpen,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Eye,
  History,
  ImagePlus,
  Layers2,
  Lightbulb,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { CreatorMode, NewsItem } from "../types";

/** The Generate/Re-render row + utility actions row at the bottom of the left panel. */
export function GenerateFooter({
  generateError,
  setGenerateError,
  showGenerateMenu,
  setShowGenerateMenu,
  generateNewsBatch,
  fullyAutomated,
  setFullyAutomated,
  setShowPromptForCategory,
  generateFactsBatch,
  generateLearningsBatch,
  setCreatorMode,
  setShowPromptModal,
  generatingBatch,
  render,
  creatorMode,
  newsData,
  fillAllImages,
  generatingImages,
  buildWebSearchQuery,
  imageGenProgress,
  handleSaveCurrentToHistory,
  saveStatus,
  openHistory,
  setShowCalendarModal,
}: {
  generateError: string | null;
  setGenerateError: (err: string | null) => void;
  showGenerateMenu: boolean;
  setShowGenerateMenu: (updater: boolean | ((prev: boolean) => boolean)) => void;
  generateNewsBatch: () => void;
  fullyAutomated: boolean;
  setFullyAutomated: (updater: boolean | ((prev: boolean) => boolean)) => void;
  setShowPromptForCategory: (category: "news" | "facts" | "learnings" | null) => void;
  generateFactsBatch: (topicHint?: string) => void;
  generateLearningsBatch: (topicHint?: string) => void;
  setCreatorMode: (mode: CreatorMode) => void;
  setShowPromptModal: (show: boolean) => void;
  generatingBatch: boolean;
  render: () => void;
  creatorMode: CreatorMode;
  newsData: NewsItem[];
  fillAllImages: () => void;
  generatingImages: boolean;
  buildWebSearchQuery: (item: NewsItem | undefined | null) => string;
  imageGenProgress: { done: number; total: number };
  handleSaveCurrentToHistory: () => void;
  saveStatus: "idle" | "saving" | "success" | "error";
  openHistory: () => void;
  setShowCalendarModal: (show: boolean) => void;
}) {
  return (
    <div className="px-4 pb-4 pt-2 border-t shrink-0 space-y-2" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
      {generateError && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/[0.08] border border-red-500/[0.2]">
          <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-300/90 leading-relaxed flex-1">{generateError}</p>
          <button onClick={() => setGenerateError(null)} className="text-red-400/60 hover:text-red-300 shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Generate / Re-render drive the poster pipeline. A motion project has
          neither: it is decomposed from uploaded artwork, not generated, and it
          repaints every frame on its own clock. Only the utility row below
          applies there. */}
      {creatorMode !== "motion" && (
      <div className="flex gap-2 relative">
        {/* Generate — niche dropdown (opens upward) */}
        <div className="relative flex-1">
          {showGenerateMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowGenerateMenu(false)} />
              <div className="absolute bottom-full mb-2 left-0 w-[318px] z-50 rounded-xl border border-white/[0.08] bg-[#121210] shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-xl overflow-hidden p-1 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="w-full flex items-start gap-1 rounded-lg hover:bg-white/[0.05] transition">
                  <button
                    onClick={generateNewsBatch}
                    className="flex-1 min-w-0 flex items-start gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition cursor-pointer"
                  >
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                      <Sparkles className="h-4 w-4 text-emerald-400" />
                    </div>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11.5px] font-bold text-white tracking-wide">AI News Batch</span>
                      <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                        {fullyAutomated
                          ? "Curate the top 10 distinct high-impact stories, deduped, with cover + outro — every story kept and illustrated automatically, no review step."
                          : "Curate the top 10 distinct high-impact stories, deduped, with cover + outro. Select which slides to include."}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowGenerateMenu(false); setShowPromptForCategory("news"); }}
                    title="Show the full generation prompt"
                    className="shrink-0 mt-2 mr-1.5 p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setFullyAutomated((v) => !v)}
                  title="When on, News Batch keeps every curated story, fills images, and saves automatically — no selection modal."
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition cursor-pointer text-left"
                >
                  {fullyAutomated ? (
                    <CheckSquare className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  )}
                  <span className={`text-[10px] font-semibold ${fullyAutomated ? "text-emerald-300/90" : "text-white/45"}`}>
                    Fully Automated — skip selection, keep every story
                  </span>
                </button>

              </div>
            </>
          )}
          <button
            onClick={() => setShowGenerateMenu((v) => !v)}
            disabled={generatingBatch}
            title="Generate"
            className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer bg-emerald-500/[0.15] text-emerald-300 hover:bg-emerald-500/[0.22] border border-emerald-500/[0.25] disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
          >
            {generatingBatch ? (
              <>
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                <span className="hidden xs:inline">GENERATING…</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xs:inline">GENERATE</span>
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showGenerateMenu ? "rotate-180" : ""}`} />
              </>
            )}
          </button>
        </div>

        <button
          onClick={render}
          title="Re-render"
          className="flex items-center justify-center gap-1.5 flex-grow py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.1)] border border-transparent whitespace-nowrap"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden xs:inline">RE-RENDER</span>
        </button>
      </div>
      )}

      {/* Utility actions — always their own row, icon-only, so this never
          competes with Generate/Re-render for space and can never get
          clipped no matter how narrow the panel or how many icons live
          here (Fill Images is conditional on mode). */}
      <div className="flex gap-2 flex-wrap">
        {(creatorMode === "news" || creatorMode === "facts" || creatorMode === "learnings") && newsData.length > 0 && (
          <button
            onClick={fillAllImages}
            disabled={generatingImages || newsData.every((item) => item.isBento || item.imageUrl || !buildWebSearchQuery(item))}
            title={
              generatingImages
                ? `Filling images… ${imageGenProgress.done}/${imageGenProgress.total}`
                : "Fill every poster still missing an image with a Pexels stock photo (top match, no picking) — skips any that already have one"
            }
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generatingImages ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 shrink-0" />}
          </button>
        )}

        <button
          onClick={handleSaveCurrentToHistory}
          disabled={saveStatus === "saving"}
          title="Save current poster(s) to History"
          className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border ${
            saveStatus === "success"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
              : saveStatus === "error"
              ? "border-red-500 bg-red-500/10 text-red-400"
              : "border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
          }`}
        >
          {saveStatus === "saving" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saveStatus === "success" ? (
            <Check className="h-3.5 w-3.5" />
          ) : saveStatus === "error" ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          onClick={openHistory}
          title="View History list"
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
        >
          <History className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => setShowCalendarModal(true)}
          title="Content Calendar — 30-day plan"
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
        >
          <Calendar className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
