"use client";

import { ChevronLeft, Layers2, ListChecks, Star } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ACTIVE_CREATOR_MODES } from "../types";
import type { CreatorMode, NewsItem } from "../types";

/** Left panel header (collapse/Set-as-Default/Select-Posters) + Creator Mode switcher strip + tab-selector strip. */
export function LeftPanelChrome({
  setPanelCollapsed,
  handleSetAsDefault,
  defaultSaveStatus,
  creatorMode,
  rawBatchCandidates,
  setShowSelectionModal,
  setCreatorMode,
  activeTab,
  setActiveTab,
  TABS,
}: {
  setPanelCollapsed: (collapsed: boolean) => void;
  handleSetAsDefault: () => void;
  defaultSaveStatus: "idle" | "saving" | "saved" | "error";
  creatorMode: CreatorMode;
  rawBatchCandidates: NewsItem[];
  setShowSelectionModal: (show: boolean) => void;
  setCreatorMode: (mode: CreatorMode) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  TABS: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}) {
  // Opening a history item saved under a retired mode (Daily Analysis,
  // Indicator, Facts, Learnings) still switches into it — its fields and
  // renderer are all intact. Give that mode a pill of its own for as long as
  // it is the one open, so the strip is never showing nothing selected; it
  // disappears again the moment you leave.
  const modes: CreatorMode[] = (ACTIVE_CREATOR_MODES as readonly CreatorMode[]).includes(creatorMode)
    ? [...ACTIVE_CREATOR_MODES]
    : [creatorMode, ...ACTIVE_CREATOR_MODES];

  return (
    <>
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanelCollapsed(true)}
            className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition cursor-pointer"
            title="Collapse Panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Layers2 className="h-4 w-4 shrink-0 text-white/60" />
          <span className="text-[12px] font-bold uppercase tracking-wider text-white/90">
            Content Creator
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSetAsDefault}
            disabled={defaultSaveStatus === "saving"}
            title="Save the current style settings (ratio, colors, poster style, gradient, fade, highlight colors) as your default for every future visit"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer disabled:cursor-wait ${
              defaultSaveStatus === "saved"
                ? "border-emerald-500/[0.35] bg-emerald-500/[0.14] text-emerald-300"
                : defaultSaveStatus === "error"
                ? "border-red-500/[0.35] bg-red-500/[0.14] text-red-300"
                : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/60 hover:text-white/90"
            }`}
          >
            <Star className={`h-3 w-3 ${defaultSaveStatus === "saved" ? "fill-emerald-300" : ""}`} />
            <span className="hidden xs:inline">
              {defaultSaveStatus === "saving" ? "Saving…" : defaultSaveStatus === "saved" ? "Saved" : defaultSaveStatus === "error" ? "Failed" : "Set as Default"}
            </span>
          </button>
          {creatorMode === "news" && rawBatchCandidates.length > 0 && (
            <button
              onClick={() => setShowSelectionModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-emerald-500/[0.25] bg-emerald-500/[0.1] hover:bg-emerald-500/[0.16] cursor-pointer text-emerald-300"
            >
              <ListChecks className="h-3 w-3" /> Select Posters
            </button>
          )}
        </div>
      </div>

      {/* Creator Mode Switcher */}
      <div className="px-4 py-1.5 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
        <label className="text-[8.5px] font-bold uppercase tracking-widest text-[#787870] block mb-1">
          Creator Mode
        </label>
        {/* Horizontally scrollable strip — two-word labels never fit evenly in
            a grid on the ~300px mobile panel without wrapping onto 2 lines, so
            each pill sizes to its own text and the strip scrolls instead. */}
        <div className="flex gap-0.5 bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {modes.map((m) => {
            const active = creatorMode === m;
            const labels: Record<CreatorMode, string> = {
              analysis: "Daily Analysis",
              news: "News Batch",
              indicator: "Indicator",
              facts: "Facts",
              learnings: "Learnings",
              watermark: "Logo Watermark",
              motion: "Motion Video",
              levels: "Levels",
            };
            return (
              <button
                key={m}
                onClick={() => setCreatorMode(m)}
                className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-md transition-all cursor-pointer text-[9.5px] font-bold uppercase tracking-wider text-center ${
                  active
                    ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    : "text-[#787870] hover:text-white/60"
                }`}
              >
                {labels[m]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Selection — Levels is a single editor and supplies no tabs. */}
      {TABS.length > 0 && (
      <div className="px-4 py-1 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
        <div className="flex bg-white/[0.03] border border-white/[0.06] p-0.5 rounded-lg">
          <TooltipProvider delay={100}>
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <Tooltip key={tab.id}>
                  <TooltipTrigger
                    render={
                      <button
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all cursor-pointer ${
                          active
                            ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                            : "text-[#787870] hover:text-white/60"
                        }`}
                      />
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent side="top">{tab.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      </div>
      )}
    </>
  );
}
