"use client";

import { useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Copy, Download, FileDown, ImagePlus, Layers2, Loader2,
  Redo2, Trash2, Type, Undo2, Wand2, X,
} from "lucide-react";
import { LevelsCanvasStage, LevelsSlideThumb } from "./LevelsCanvasStage";
import { LevelsTextToolbar } from "./LevelsTextToolbar";
import type { LevelsCarouselState } from "./useLevelsCarousel";

const ACT =
  "flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 cursor-pointer border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.09] text-white whitespace-nowrap";

/**
 * Right-hand carousel workspace: the slide being edited, the format toolbar
 * for the selected text, and the filmstrip of every slide in post order.
 */
export function LevelsCarouselPanel({
  state,
  panelCollapsed,
  setPanelCollapsed,
}: {
  state: LevelsCarouselState;
  panelCollapsed: boolean;
  setPanelCollapsed: (v: boolean) => void;
}) {
  const {
    slides, activeIndex, setActiveIndex, activeSlide, settings, ratio,
    addImages, removeSlide, moveSlide, addTextBox, addStatementBox,
    undo, redo, canUndo, canRedo, downloadSlide, downloadAll,
    importing, exporting, exportProgress, error, setError,
  } = state;

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    void addImages(Array.from(list));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background relative">
      {panelCollapsed && (
        <button
          onClick={() => setPanelCollapsed(false)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-8 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-r-xl transition-all duration-200 text-white/60 hover:text-white cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md"
          title="Expand Panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/[0.06] shrink-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Layers2 className="h-4 w-4 shrink-0 text-white/50" />
          <span className="hidden sm:inline text-[12px] font-bold uppercase tracking-wider text-white whitespace-nowrap">
            Levels Carousel
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.04] font-semibold uppercase tracking-wider text-white/70 shrink-0">
            {slides.length ? `${activeIndex + 1} / ${slides.length}` : "empty"} · {ratio.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button className={ACT} onClick={undo} disabled={!canUndo} title="Undo"><Undo2 className="h-3.5 w-3.5" /></button>
          <button className={ACT} onClick={redo} disabled={!canRedo} title="Redo"><Redo2 className="h-3.5 w-3.5" /></button>
          <button className={ACT} onClick={() => addTextBox()} disabled={!activeSlide} title="Add a text box">
            <Type className="h-3.5 w-3.5" /><span className="hidden md:inline">Text</span>
          </button>
          <button className={ACT} onClick={addStatementBox} disabled={!activeSlide} title="Add the auto-built levels statement for this slide">
            <Wand2 className="h-3.5 w-3.5" /><span className="hidden md:inline">Statement</span>
          </button>
          <button className={ACT} onClick={() => void downloadSlide(activeIndex)} disabled={!activeSlide || exporting} title="Download this slide">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button className={ACT} onClick={() => void downloadAll()} disabled={!slides.length || exporting} title="Download the whole carousel as a ZIP, numbered in post order">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{exporting ? `${exportProgress}%` : "Export all"}</span>
          </button>
        </div>
      </div>

      {/* Formatting bar for the selected text */}
      <LevelsTextToolbar state={state} />

      {error && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] bg-red-500/[0.09] border-b border-red-500/20 text-red-300 shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="cursor-pointer hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Stage / drop target */}
      <div
        className="flex-1 min-h-0 relative"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          pickFiles(e.dataTransfer.files);
        }}
      >
        {slides.length === 0 ? (
          <button
            onClick={() => fileRef.current?.click()}
            className={`absolute inset-6 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
              dragOver ? "border-emerald-400/60 bg-emerald-400/[0.06]" : "border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04]"
            }`}
          >
            {importing ? <Loader2 className="h-7 w-7 text-white/50 animate-spin" /> : <ImagePlus className="h-7 w-7 text-white/40" />}
            <div className="text-center px-6">
              <p className="text-[13px] font-bold text-white/85">Drop your chart screenshots here</p>
              <p className="text-[11px] text-white/45 mt-1 max-w-[380px]">
                Every image becomes one carousel slide. A wide chart (1998×1080 and the like) is placed
                whole and centred, with even gaps above and below — drag it anywhere from there.
              </p>
            </div>
          </button>
        ) : (
          <>
            <LevelsCanvasStage state={state} className="absolute inset-0" />
            {dragOver && (
              <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-emerald-400/60 bg-emerald-400/[0.06] pointer-events-none flex items-center justify-center">
                <span className="text-[12px] font-bold text-emerald-300">Drop to add more slides</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Filmstrip */}
      {slides.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] bg-black/30">
          <div className="flex items-center gap-2 px-2 py-2">
            <button
              onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              className="shrink-0 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
              title="Previous slide"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex-1 flex items-end gap-2 overflow-x-auto py-0.5 [scrollbar-width:thin]">
              {slides.map((slide, i) => (
                <div
                  key={slide.id}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom !== null && dragFrom !== i) moveSlide(dragFrom, i);
                    setDragFrom(null);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                  onClick={() => setActiveIndex(i)}
                  className={`group relative shrink-0 rounded-lg p-1 border transition-all cursor-pointer ${
                    i === activeIndex
                      ? "border-white/40 bg-white/[0.09]"
                      : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06]"
                  }`}
                  title={`${slide.name} — drag to reorder`}
                >
                  <LevelsSlideThumb
                    slide={slide}
                    ratioW={ratio.w}
                    ratioH={ratio.h}
                    bg={settings.bgMode === "gradient" ? settings.bgColor2 : settings.bgColor}
                    width={52}
                  />
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-bold px-1 rounded bg-black/70 text-white/85">
                    {i + 1}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSlide(slide.id); }}
                    className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-0.5 rounded-full bg-red-500/85 text-white transition-opacity cursor-pointer"
                    title="Remove slide"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}

              <button
                onClick={() => fileRef.current?.click()}
                className="shrink-0 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/[0.14] bg-white/[0.02] hover:bg-white/[0.06] text-white/45 hover:text-white/80 cursor-pointer transition-all"
                style={{ width: 60, height: (ratio.h / ratio.w) * 52 + 8 }}
                title="Add more chart images"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                <span className="text-[8px] font-bold uppercase tracking-wider">Add</span>
              </button>
            </div>

            <button
              onClick={() => setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))}
              disabled={activeIndex >= slides.length - 1}
              className="shrink-0 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.07] disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
              title="Next slide"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <p className="px-3 pb-1.5 text-[9.5px] text-white/30 leading-tight">
            Drag the chart to reposition · double-click any text to edit · arrows nudge, Shift+arrows jump ·
            ⌘D duplicates · Del removes · filmstrip drag reorders the carousel
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

/** Small helper the left panel uses to copy the built caption. */
export function CopyCaptionButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border disabled:opacity-35 disabled:cursor-not-allowed ${
        copied
          ? "border-emerald-500/35 bg-emerald-500/[0.14] text-emerald-300"
          : "border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.09] text-white/85"
      }`}
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Caption copied" : "Copy Instagram caption"}
    </button>
  );
}
