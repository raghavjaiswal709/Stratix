"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, GripVertical, Lock, RotateCcw, Shuffle, X } from "lucide-react";
import type { MotionSlide } from "../types";
import { analyzeSlideOrder, swapItem } from "../slideOrder";

/**
 * Fix Slide Order.
 *
 * Opens auto-sorted by each poster's own printed slide number.
 * Correctly recognized slides are LOCKED to their exact number position.
 * Dragging or selecting a position performs a 1-to-1 SWAP so that other
 * locked slides are never shifted or incremented by +1.
 */
export function FixSlideOrderModal({
  slides,
  onClose,
  onApply,
}: {
  slides: MotionSlide[];
  onClose: () => void;
  onApply: (orderedSlides: MotionSlide[]) => void;
}) {
  const analysis = useMemo(() => analyzeSlideOrder(slides), [slides]);
  const entryByIndex = useMemo(
    () => new Map(analysis.entries.map((e) => [e.originalIndex, e])),
    [analysis]
  );
  const [order, setOrder] = useState<number[]>(analysis.suggestedOrder);
  const [draggedPos, setDraggedPos] = useState<number | null>(null);
  const [dragOverPos, setDragOverPos] = useState<number | null>(null);

  const isDirty = order.some((originalIdx, pos) => originalIdx !== analysis.suggestedOrder[pos]);

  const handleSwapPosition = (currentPos: number, targetPosStr: string) => {
    const targetPos = parseInt(targetPosStr, 10) - 1; // 1-indexed to 0-indexed
    if (!isNaN(targetPos) && targetPos >= 0 && targetPos < slides.length && targetPos !== currentPos) {
      setOrder((cur) => swapItem(cur, currentPos, targetPos));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#141412] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <Shuffle className="h-4 w-4 text-white/60" />
            <div>
              <span className="text-[13px] font-bold text-white block">Fix Slide Order</span>
              <span className="text-[10px] text-white/35">
                {analysis.alreadyInOrder
                  ? `All ${slides.length} slides are already in the right order.`
                  : `${analysis.recognizedCount} of ${slides.length} recognized & locked from their printed number` +
                    (analysis.unresolvedCount > 0 ? ` · ${analysis.unresolvedCount} unassigned` : "")}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Notice for anything that needs a manual fix */}
        {analysis.unresolvedCount > 0 && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] flex items-start gap-2 shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-200/85 leading-relaxed">
              {analysis.unresolvedCount} slide{analysis.unresolvedCount === 1 ? "" : "s"} marked{" "}
              <span className="text-amber-300 font-bold">yellow/red</span> couldn&apos;t be auto-read. Drag to swap or use the position picker to lock them without shifting ordered slides.
            </p>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {order.map((originalIdx, pos) => {
              const entry = entryByIndex.get(originalIdx);
              if (!entry) return null;
              const slide = entry.slide;
              const isBeingDragged = draggedPos === pos;
              const isDropTarget = dragOverPos === pos && draggedPos !== null && draggedPos !== pos;
              const thumb = slide.originalUrl || slide.backgroundUrl;
              const isLockedSlot = entry.resolved && entry.targetSlot === pos;

              return (
                <div
                  key={slide.slideId}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(pos));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedPos(pos);
                  }}
                  onDragEnd={() => {
                    setDraggedPos(null);
                    setDragOverPos(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverPos !== pos) setDragOverPos(pos);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromPos = parseInt(e.dataTransfer.getData("text/plain"), 10);
                    if (!Number.isNaN(fromPos) && fromPos !== pos) {
                      setOrder((cur) => swapItem(cur, fromPos, pos));
                    }
                    setDraggedPos(null);
                    setDragOverPos(null);
                  }}
                  title={slide.fileName}
                  className={`relative rounded-xl border overflow-hidden cursor-grab active:cursor-grabbing transition-all group ${
                    isBeingDragged
                      ? "opacity-30 scale-95 border-white/30"
                      : isDropTarget
                      ? "border-emerald-400/60 ring-2 ring-emerald-400/30"
                      : isLockedSlot
                      ? "border-emerald-500/40 hover:border-emerald-500/70"
                      : entry.resolved
                      ? "border-amber-500/40 hover:border-amber-500/70"
                      : "border-red-500/50 hover:border-red-500/70"
                  }`}
                >
                  {thumb ? (
                    <img src={thumb} alt="" draggable={false} className="w-full aspect-[4/5] object-contain bg-black/40 pointer-events-none select-none" />
                  ) : (
                    <div className="w-full aspect-[4/5] bg-black/40" />
                  )}

                  {/* Position selector pill */}
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-1 z-10">
                    <select
                      value={pos + 1}
                      onChange={(e) => handleSwapPosition(pos, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className={`min-w-[28px] h-[22px] px-1 rounded-md text-[11px] font-mono font-bold flex items-center justify-center border bg-black/80 backdrop-blur-sm cursor-pointer outline-none ${
                        isLockedSlot
                          ? "text-emerald-300 border-emerald-500/50"
                          : entry.resolved
                          ? "text-amber-300 border-amber-500/50"
                          : "text-red-300 border-red-500/50"
                      }`}
                      title="Click to swap to a specific position"
                    >
                      {slides.map((_, i) => (
                        <option key={i} value={i + 1} className="bg-neutral-900 text-white">
                          #{i + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Lock / Recognition state icon (bottom-left, icon only) */}
                  <span
                    title={
                      isLockedSlot
                        ? `Locked to position #${pos + 1}`
                        : entry.resolved
                        ? `Recognized as #${entry.detectedNumber}`
                        : "Manual placement required"
                    }
                    className={`absolute bottom-7 left-1.5 h-6 w-6 rounded-md bg-black/80 backdrop-blur-sm flex items-center justify-center border z-10 ${
                      isLockedSlot
                        ? "border-emerald-500/50"
                        : entry.resolved
                        ? "border-amber-500/50"
                        : "border-red-500/50"
                    }`}
                  >
                    {isLockedSlot ? (
                      <Lock className="h-3.5 w-3.5 text-emerald-400" />
                    ) : entry.resolved ? (
                      <Check className="h-3.5 w-3.5 text-amber-400" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </span>

                  <GripVertical className="absolute bottom-7 right-1.5 h-3.5 w-3.5 text-white/0 group-hover:text-white/50 transition pointer-events-none" />

                  {/* Badge text tag */}
                  <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-sm px-1.5 py-1">
                    <p className="text-[8.5px] font-mono text-white/70 truncate">
                      {entry.badgeText
                        ? `read: "${entry.badgeText}"`
                        : entry.detectedNumber !== null
                        ? `read #: ${entry.detectedNumber}`
                        : "badge not read"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/40">Drag or use position selector to swap 1-to-1 without shifting locked cards.</span>
            {isDirty && (
              <button
                onClick={() => setOrder(analysis.suggestedOrder)}
                className="flex items-center gap-1 text-[10px] font-bold text-white/60 hover:text-white transition cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" /> Reset to detected order
              </button>
            )}
          </div>
          <button
            onClick={() => onApply(order.map((i) => slides[i]))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/[0.18] text-emerald-300 hover:bg-emerald-500/[0.26] border border-emerald-500/[0.28] transition cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" /> Apply Order
          </button>
        </div>
      </div>
    </div>
  );
}
