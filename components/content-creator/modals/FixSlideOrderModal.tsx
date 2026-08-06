"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  GripVertical,
  ImagePlus,
  Loader2,
  Lock,
  RotateCcw,
  Shuffle,
  Upload,
  X,
} from "lucide-react";
import type { MotionSlide } from "../types";
import {
  analyzeSlideOrder,
  buildSlideOrderPlan,
  planToSlides,
  slideCaption,
  swapItem,
  type ScriptSlot,
} from "../slideOrder";
import type { ScriptSegmentation } from "../scriptSegments";

/**
 * Fix Slide Order.
 *
 * With a script loaded this is not a list of slides to be shuffled — it is
 * the SCRIPT's own list of parts, in order, each showing the image that
 * covers it. That inversion is the whole point: a part with no image is
 * visible as a gap you can upload straight into, instead of silently not
 * existing because the batch happened to be short. Every drag or upload
 * re-runs the match across everything.
 *
 * Without a script (no transcript, no manifest) it falls back to the original
 * printed-slide-number grid, unchanged.
 */
export function FixSlideOrderModal({
  slides,
  segmentation,
  onClose,
  onApply,
  onDecomposeFiles,
}: {
  slides: MotionSlide[];
  /** The script's parts, in speaking order — see scriptSegments.ts. */
  segmentation: ScriptSegmentation;
  onClose: () => void;
  onApply: (orderedSlides: MotionSlide[]) => void;
  /** Decomposes newly picked images into slides, for filling a gap in place. */
  onDecomposeFiles?: (files: File[]) => Promise<MotionSlide[]>;
}) {
  if (segmentation.segments.length === 0) {
    return <BadgeOrderView slides={slides} onClose={onClose} onApply={onApply} />;
  }
  return (
    <ScriptOrderView
      slides={slides}
      segmentation={segmentation}
      onClose={onClose}
      onApply={onApply}
      onDecomposeFiles={onDecomposeFiles}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Script-driven view — one row per spoken part
 * ──────────────────────────────────────────────────────────────────────────*/

function ScriptOrderView({
  slides,
  segmentation,
  onClose,
  onApply,
  onDecomposeFiles,
}: {
  slides: MotionSlide[];
  segmentation: ScriptSegmentation;
  onClose: () => void;
  onApply: (orderedSlides: MotionSlide[]) => void;
  onDecomposeFiles?: (files: File[]) => Promise<MotionSlide[]>;
}) {
  // Grows as gaps are filled, so the modal can add images without closing.
  const [workingSlides, setWorkingSlides] = useState<MotionSlide[]>(slides);
  // segmentIndex → slideId, pinned by hand and never overruled by the matcher.
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  // Slides deliberately pulled out of a slot — kept out until placed again.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [uploadingFor, setUploadingFor] = useState<number | "extras" | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<number | "extras" | null>(null);

  const plan = useMemo(
    () => buildSlideOrderPlan(workingSlides, segmentation.segments, { overrides, excluded }),
    [workingSlides, segmentation.segments, overrides, excluded]
  );

  const slideById = useMemo(
    () => new Map(workingSlides.map((s) => [s.slideId, s])),
    [workingSlides]
  );

  const isDirty =
    Object.keys(overrides).length > 0 || excluded.size > 0 || workingSlides.length !== slides.length;

  /** Places a slide in a slot, freeing whatever it was doing before. */
  const assign = (segmentIndex: number, slideId: string) => {
    setOverrides((cur) => {
      const next: Record<number, string> = {};
      // A slide can only be in one place, so drop any other slot holding it.
      Object.entries(cur).forEach(([k, v]) => {
        if (v !== slideId) next[Number(k)] = v;
      });
      next[segmentIndex] = slideId;
      return next;
    });
    setExcluded((cur) => {
      if (!cur.has(slideId)) return cur;
      const next = new Set(cur);
      next.delete(slideId);
      return next;
    });
  };

  /** Pulls a slide out of its slot and back into the unplaced tray. */
  const unassign = (slideId: string) => {
    setOverrides((cur) => {
      const next: Record<number, string> = {};
      Object.entries(cur).forEach(([k, v]) => {
        if (v !== slideId) next[Number(k)] = v;
      });
      return next;
    });
    setExcluded((cur) => new Set(cur).add(slideId));
  };

  const openPicker = (target: number | "extras") => {
    uploadTargetRef.current = target;
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    const target = uploadTargetRef.current;
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0 || !onDecomposeFiles) return;

    setUploadingFor(target);
    setUploadError(null);
    try {
      const added = await onDecomposeFiles(list);
      if (added.length === 0) {
        setUploadError("That image could not be decomposed — try another export.");
        return;
      }
      setWorkingSlides((cur) => [...cur, ...added]);
      // Pin the first new image to the gap it was uploaded for; anything extra
      // is left to the matcher, which may well find another gap for it.
      if (typeof target === "number") assign(target, added[0].slideId);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingFor(null);
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const extras = plan.extras.map((id) => slideById.get(id)).filter((s): s is MotionSlide => !!s);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#141412] shadow-2xl overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Shuffle className="h-4 w-4 text-white/60 shrink-0" />
            <div className="min-w-0">
              <span className="text-[13px] font-bold text-white block">Match Slides to the Script</span>
              <span className="text-[10px] text-white/35 block truncate">
                {segmentation.label} ·{" "}
                <span className="text-emerald-300/80">{plan.matchedCount} matched</span>
                {plan.weakCount > 0 && <span className="text-amber-300/80"> · {plan.weakCount} unsure</span>}
                {plan.missingCount > 0 && <span className="text-red-300/90"> · {plan.missingCount} missing</span>}
                {extras.length > 0 && <span className="text-white/50"> · {extras.length} unplaced</span>}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {plan.missingCount > 0 && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl border border-red-500/30 bg-red-500/[0.08] flex items-start gap-2 shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-red-200/85 leading-relaxed">
              <span className="font-bold">
                {plan.missingCount} part{plan.missingCount === 1 ? "" : "s"} of the script {plan.missingCount === 1 ? "has" : "have"} no image.
              </span>{" "}
              Each gap below shows the exact words it needs — upload the image for it right there, or drag one in
              from the unplaced row.
            </p>
          </div>
        )}

        {uploadError && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] flex items-start gap-2 shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-200/85 leading-relaxed break-words">{uploadError}</p>
          </div>
        )}

        {/* Slots — one per spoken part, in script order */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5">
          {plan.slots.map((slot) => (
            <SlotRow
              key={slot.segmentIndex}
              slot={slot}
              slide={slot.slideId ? slideById.get(slot.slideId) : undefined}
              isDropTarget={dragOverSlot === slot.segmentIndex}
              busy={uploadingFor === slot.segmentIndex}
              canUpload={!!onDecomposeFiles}
              onDragOver={() => setDragOverSlot(slot.segmentIndex)}
              onDragLeave={() => setDragOverSlot((c) => (c === slot.segmentIndex ? null : c))}
              onDrop={(slideId) => {
                assign(slot.segmentIndex, slideId);
                setDragOverSlot(null);
              }}
              onRemove={() => slot.slideId && unassign(slot.slideId)}
              onUpload={() => openPicker(slot.segmentIndex)}
            />
          ))}
        </div>

        {/* Unplaced tray */}
        <div className="border-t border-white/[0.06] px-5 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9.5px] font-bold text-white/45 uppercase tracking-wider">
              Unplaced images ({extras.length})
            </span>
            {onDecomposeFiles && (
              <button
                onClick={() => openPicker("extras")}
                disabled={uploadingFor !== null}
                className="flex items-center gap-1 text-[9.5px] font-bold text-white/50 hover:text-white transition cursor-pointer disabled:opacity-40"
              >
                {uploadingFor === "extras" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ImagePlus className="h-3 w-3" />
                )}
                Add images
              </button>
            )}
          </div>
          {extras.length === 0 ? (
            <p className="text-[9.5px] text-white/25">
              Every uploaded image is matched to a part of the script.
            </p>
          ) : (
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) unassign(id);
              }}
            >
              {extras.map((slide) => (
                <SlideChip key={slide.slideId} slide={slide} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.06] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[10px] text-white/40 truncate">
              Drag an image onto a part to place it. Unplaced images are kept at the end.
            </span>
            {isDirty && (
              <button
                onClick={() => {
                  setOverrides({});
                  setExcluded(new Set());
                }}
                className="flex items-center gap-1 text-[10px] font-bold text-white/60 hover:text-white transition cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3 w-3" /> Reset to auto-match
              </button>
            )}
          </div>
          <button
            onClick={() => onApply(planToSlides(plan, workingSlides))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/[0.18] text-emerald-300 hover:bg-emerald-500/[0.26] border border-emerald-500/[0.28] transition cursor-pointer shrink-0"
          >
            <Check className="h-3.5 w-3.5" /> Apply Order
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  slide,
  isDropTarget,
  busy,
  canUpload,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemove,
  onUpload,
}: {
  slot: ScriptSlot;
  slide: MotionSlide | undefined;
  isDropTarget: boolean;
  busy: boolean;
  canUpload: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (slideId: string) => void;
  onRemove: () => void;
  onUpload: () => void;
}) {
  const missing = slot.status === "missing";
  const border = isDropTarget
    ? "border-emerald-400/60 ring-2 ring-emerald-400/25"
    : missing
    ? "border-red-500/40 bg-red-500/[0.05]"
    : slot.status === "weak"
    ? "border-amber-500/40"
    : "border-white/[0.08]";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id);
      }}
      className={`flex items-stretch gap-3 rounded-xl border p-2 transition ${border}`}
    >
      <span className="w-6 shrink-0 flex items-start justify-center pt-1.5 text-[10px] font-mono font-bold text-white/35 tabular-nums">
        {slot.segmentIndex + 1}
      </span>

      {/* The spoken part — the anchor of the row, always shown */}
      <div className="flex-1 min-w-0 py-1">
        <p className={`text-[11px] leading-snug ${missing ? "text-red-100/90" : "text-white/80"}`}>{slot.text}</p>
        {slide && (
          <p className="mt-1 text-[9px] font-mono text-white/30 truncate" title={slideCaption(slide)}>
            image reads: &ldquo;{slideCaption(slide) || "no caption read"}&rdquo;
          </p>
        )}
      </div>

      {/* The image covering it, or the gap */}
      {slide ? (
        <div className="relative shrink-0 group">
          <img
            src={slide.originalUrl || slide.backgroundUrl}
            alt=""
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", slide.slideId)}
            className="h-16 w-[52px] object-contain bg-black/40 rounded-md cursor-grab active:cursor-grabbing"
          />
          <span
            title={
              slot.manual
                ? "Placed by hand"
                : slot.status === "weak"
                ? `Unsure — only ${Math.round(slot.score * 100)}% of this part's words are on the image`
                : `Matched ${Math.round(slot.score * 100)}%`
            }
            className={`absolute -top-1 -left-1 h-4 w-4 rounded-full flex items-center justify-center border bg-black ${
              slot.manual
                ? "border-emerald-500/60"
                : slot.status === "weak"
                ? "border-amber-500/60"
                : "border-emerald-500/60"
            }`}
          >
            {slot.manual ? (
              <Lock className="h-2.5 w-2.5 text-emerald-400" />
            ) : slot.status === "weak" ? (
              <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
            ) : (
              <Check className="h-2.5 w-2.5 text-emerald-400" />
            )}
          </span>
          <button
            onClick={onRemove}
            title="Remove this image from this part"
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black border border-white/20 flex items-center justify-center text-white/50 opacity-0 group-hover:opacity-100 hover:text-white transition cursor-pointer"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={onUpload}
          disabled={!canUpload || busy}
          title={canUpload ? "Upload the image for this part" : "Upload is unavailable here"}
          className="shrink-0 h-16 w-[52px] rounded-md border border-dashed border-red-500/50 bg-red-500/[0.06] flex flex-col items-center justify-center gap-0.5 text-red-300/80 hover:bg-red-500/[0.12] hover:text-red-200 transition cursor-pointer disabled:opacity-40 disabled:cursor-wait"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          <span className="text-[7.5px] font-bold uppercase tracking-wide leading-none">
            {busy ? "…" : "Missing"}
          </span>
        </button>
      )}
    </div>
  );
}

function SlideChip({ slide }: { slide: MotionSlide }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", slide.slideId)}
      title={slideCaption(slide) || slide.fileName}
      className="relative shrink-0 cursor-grab active:cursor-grabbing group"
    >
      <img
        src={slide.originalUrl || slide.backgroundUrl}
        alt=""
        draggable={false}
        className="h-16 w-[52px] object-contain bg-black/40 rounded-md border border-white/10 pointer-events-none"
      />
      <GripVertical className="absolute bottom-0.5 right-0.5 h-3 w-3 text-white/0 group-hover:text-white/60 transition pointer-events-none" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fallback — no script loaded, so order by each poster's printed number
 * (the original behaviour, unchanged)
 * ──────────────────────────────────────────────────────────────────────────*/

function BadgeOrderView({
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
    const targetPos = parseInt(targetPosStr, 10) - 1;
    if (!isNaN(targetPos) && targetPos >= 0 && targetPos < slides.length && targetPos !== currentPos) {
      setOrder((cur) => swapItem(cur, currentPos, targetPos));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#141412] shadow-2xl overflow-hidden">
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

        <div className="mx-5 mt-3 p-2.5 rounded-xl border border-white/[0.10] bg-white/[0.03] flex items-start gap-2 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 text-white/40 shrink-0 mt-0.5" />
          <p className="text-[10px] text-white/60 leading-relaxed">
            No script loaded, so these are ordered by each poster&apos;s printed number.{" "}
            <span className="font-bold text-white/80">
              Load the transcript CSV (or paste the sync manifest) to match by caption instead
            </span>{" "}
            — that also reports which parts of the script have no image yet.
          </p>
        </div>

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
