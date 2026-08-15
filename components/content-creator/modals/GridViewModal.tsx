"use client";

import { ChevronLeft, ChevronRight, GripVertical, ImagePlus, LayoutGrid, Trash2, Upload, X } from "lucide-react";
import type { RefObject } from "react";
import type { NewsItem } from "../types";

/**
 * Watermark Batch Grid View — drag-and-drop rearrange + delete for the whole
 * batch at once, an alternative to stepping through the carousel one card at
 * a time.
 */
export function GridViewModal({
  newsData,
  activeNewsIndex,
  setActiveNewsIndex,
  setNewsData,
  setJsonText,
  draggedGridItemIndex,
  setDraggedGridItemIndex,
  watermarkFileInputRef,
  handleSwapIndices,
  handleMoveIndex,
  onClose,
}: {
  newsData: NewsItem[];
  activeNewsIndex: number;
  setActiveNewsIndex: (index: number) => void;
  setNewsData: (items: NewsItem[]) => void;
  setJsonText: (text: string) => void;
  draggedGridItemIndex: number | null;
  setDraggedGridItemIndex: (index: number | null) => void;
  watermarkFileInputRef: RefObject<HTMLInputElement | null>;
  handleSwapIndices: (fromIdx: number, toIdx: number) => void;
  handleMoveIndex: (index: number, direction: "up" | "down") => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#0c0d0e] shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Watermark Batch Grid View
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                  {newsData.length} {newsData.length === 1 ? "Image" : "Images"}
                </span>
              </h2>
              <p className="text-[11px] text-white/50">
                Drag &amp; drop cards to reorder images manually, or click any card to open in canvas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => watermarkFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" /> Upload More
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition border border-white/10 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {newsData.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Upload className="h-10 w-10 text-white/30 mx-auto" />
              <p className="text-sm font-semibold text-white/60">No images uploaded in batch yet</p>
              <button
                onClick={() => watermarkFileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs transition cursor-pointer inline-flex items-center gap-2"
              >
                <Upload className="h-4 w-4" /> Upload Images Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {newsData.map((item, idx) => {
                const isCurrent = idx === activeNewsIndex;
                const isBeingDragged = draggedGridItemIndex === idx;

                return (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(idx));
                      setDraggedGridItemIndex(idx);
                    }}
                    onDragEnd={() => setDraggedGridItemIndex(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
                      if (!isNaN(fromIdx) && fromIdx !== idx) {
                        handleSwapIndices(fromIdx, idx);
                      }
                      setDraggedGridItemIndex(null);
                    }}
                    className={`relative flex flex-col rounded-2xl border transition-all overflow-hidden group ${
                      isBeingDragged ? "opacity-30 scale-95 border-red-500" : ""
                    } ${
                      isCurrent
                        ? "bg-red-500/10 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                        : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    {/* Card Header Badge */}
                    <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between bg-black/40">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="truncate text-xs font-semibold text-white/90">
                          {item.title || `Image ${idx + 1}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing text-white/40 hover:text-white shrink-0 ml-1">
                        <GripVertical className="h-4 w-4" />
                      </div>
                    </div>

                    {/* Thumbnail Image Container */}
                    <div
                      onClick={() => {
                        setActiveNewsIndex(idx);
                        onClose();
                      }}
                      className="relative aspect-square w-full bg-black/60 overflow-hidden flex items-center justify-center cursor-pointer group-hover:brightness-105"
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <ImagePlus className="h-8 w-8 text-white/20" />
                      )}

                      {/* Active Overlay Badge */}
                      {isCurrent && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-[9.5px] font-bold shadow-md">
                          Active
                        </div>
                      )}
                    </div>

                    {/* Card Controls Footer */}
                    <div className="p-2.5 bg-black/50 border-t border-white/5 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveIndex(idx, "up")}
                          title="Move Left"
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed border border-white/5"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={idx === newsData.length - 1}
                          onClick={() => handleMoveIndex(idx, "down")}
                          title="Move Right"
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed border border-white/5"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setActiveNewsIndex(idx);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold border border-white/10 transition cursor-pointer"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => {
                            const next = newsData.filter((_, i) => i !== idx);
                            setNewsData(next);
                            setJsonText(JSON.stringify(next, null, 2));
                            if (activeNewsIndex >= next.length) {
                              setActiveNewsIndex(Math.max(0, next.length - 1));
                            }
                          }}
                          title="Delete"
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer border border-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-black/40 flex items-center justify-between shrink-0">
          <span className="text-xs text-white/40">
            Tip: Drag &amp; drop cards directly to rearrange sequence, or click any card to select for canvas editing.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white text-black hover:bg-white/90 font-bold text-xs transition cursor-pointer shadow-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
