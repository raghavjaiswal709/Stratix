"use client";

import { useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, ChevronDown, Copy, CopyPlus,
  Italic, Lock, Minus, MoveDown, MoveUp, Plus, RotateCcw, Trash2, Type, Underline, Unlock,
} from "lucide-react";
import { LEVELS_FONTS, LEVELS_FONT_SIZE_MAX, LEVELS_FONT_SIZE_MIN, LEVELS_TEXT_COLORS } from "./constants";
import type { LevelsCarouselState } from "./useLevelsCarousel";

const BTN =
  "flex items-center justify-center h-7 min-w-7 px-1.5 rounded-md text-[11px] font-bold transition-all cursor-pointer border";
const OFF = "border-white/[0.07] bg-white/[0.03] text-white/55 hover:text-white hover:bg-white/[0.07]";
const ON = "border-white/25 bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]";

/**
 * Formatting controls for whichever text box is selected. Lives directly above
 * the canvas so styling is one click away from the text being styled — bold,
 * italic and everything else stack freely on the same box.
 */
export function LevelsTextToolbar({ state }: { state: LevelsCarouselState }) {
  const {
    selectedBox, updateTextBox, removeTextBox, duplicateTextBox, reorderTextBox,
    copyTextBoxToAllSlides, commit, slides,
  } = state;
  const [showMore, setShowMore] = useState(false);

  if (!selectedBox) return null;
  const box = selectedBox;

  /** Style flips are discrete, so each one is its own undo step. */
  const set = (patch: Parameters<typeof updateTextBox>[1]) => {
    commit();
    updateTextBox(box.id, patch);
  };
  /** Slider drags would otherwise push an undo entry per pixel. */
  const setLive = (patch: Parameters<typeof updateTextBox>[1]) => updateTextBox(box.id, patch);

  const bumpSize = (delta: number) =>
    set({ fontSize: Math.max(LEVELS_FONT_SIZE_MIN, Math.min(LEVELS_FONT_SIZE_MAX, box.fontSize + delta)) });

  return (
    <div className="shrink-0 border-b border-white/[0.06] bg-black/40 backdrop-blur-xl">
      <div className="flex items-center gap-1 px-2.5 py-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Font */}
        <select
          value={box.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="h-7 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 text-[11px] text-white/80 outline-none cursor-pointer shrink-0"
        >
          {LEVELS_FONTS.map((f) => (
            <option key={f.id} value={f.id} className="bg-[#111]">{f.label}</option>
          ))}
        </select>

        {/* Size */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button className={`${BTN} ${OFF}`} onClick={() => bumpSize(-2)} title="Smaller"><Minus className="h-3 w-3" /></button>
          <input
            type="number"
            value={Math.round(box.fontSize)}
            onChange={(e) => setLive({ fontSize: Math.max(LEVELS_FONT_SIZE_MIN, Math.min(LEVELS_FONT_SIZE_MAX, Number(e.target.value) || box.fontSize)) })}
            onBlur={() => commit()}
            className="h-7 w-12 rounded-md border border-white/[0.07] bg-white/[0.03] text-center text-[11px] font-bold text-white outline-none"
          />
          <button className={`${BTN} ${OFF}`} onClick={() => bumpSize(2)} title="Bigger"><Plus className="h-3 w-3" /></button>
        </div>

        <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />

        {/* B / I / U / caps — freely combinable */}
        <button className={`${BTN} ${box.bold ? ON : OFF}`} onClick={() => set({ bold: !box.bold })} title="Bold"><Bold className="h-3.5 w-3.5" /></button>
        <button className={`${BTN} ${box.italic ? ON : OFF}`} onClick={() => set({ italic: !box.italic })} title="Italic"><Italic className="h-3.5 w-3.5" /></button>
        <button className={`${BTN} ${box.underline ? ON : OFF}`} onClick={() => set({ underline: !box.underline })} title="Underline"><Underline className="h-3.5 w-3.5" /></button>
        <button className={`${BTN} ${box.uppercase ? ON : OFF}`} onClick={() => set({ uppercase: !box.uppercase })} title="UPPERCASE"><CaseUpper className="h-3.5 w-3.5" /></button>

        <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />

        {/* Alignment */}
        <button className={`${BTN} ${box.align === "left" ? ON : OFF}`} onClick={() => set({ align: "left" })} title="Align left"><AlignLeft className="h-3.5 w-3.5" /></button>
        <button className={`${BTN} ${box.align === "center" ? ON : OFF}`} onClick={() => set({ align: "center" })} title="Align center"><AlignCenter className="h-3.5 w-3.5" /></button>
        <button className={`${BTN} ${box.align === "right" ? ON : OFF}`} onClick={() => set({ align: "right" })} title="Align right"><AlignRight className="h-3.5 w-3.5" /></button>

        <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />

        {/* Color */}
        <div className="flex items-center gap-0.5 shrink-0">
          {LEVELS_TEXT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => set({ color: c })}
              title={c}
              className={`h-5 w-5 rounded-full border transition-transform cursor-pointer ${
                box.color.toLowerCase() === c.toLowerCase() ? "border-white scale-110" : "border-white/20 hover:scale-105"
              }`}
              style={{ background: c }}
            />
          ))}
          <label className="h-5 w-5 rounded-full border border-white/20 overflow-hidden cursor-pointer relative" title="Custom color">
            <span className="absolute inset-0" style={{ background: "conic-gradient(#fff,#10b981,#f59e0b,#ef4444,#fff)" }} />
            <input
              type="color"
              value={box.color}
              onChange={(e) => setLive({ color: e.target.value })}
              onBlur={() => commit()}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>

        <div className="w-px h-5 bg-white/10 mx-0.5 shrink-0" />

        <button className={`${BTN} ${showMore ? ON : OFF}`} onClick={() => setShowMore((v) => !v)} title="More text options">
          <Type className="h-3.5 w-3.5" />
          <ChevronDown className={`h-3 w-3 ml-0.5 transition-transform ${showMore ? "rotate-180" : ""}`} />
        </button>

        <div className="flex-1" />

        {/* Box actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button className={`${BTN} ${OFF}`} onClick={() => reorderTextBox(box.id, "front")} title="Bring to front"><MoveUp className="h-3.5 w-3.5" /></button>
          <button className={`${BTN} ${OFF}`} onClick={() => reorderTextBox(box.id, "back")} title="Send to back"><MoveDown className="h-3.5 w-3.5" /></button>
          <button className={`${BTN} ${box.locked ? ON : OFF}`} onClick={() => set({ locked: !box.locked })} title={box.locked ? "Unlock" : "Lock position"}>
            {box.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button className={`${BTN} ${OFF}`} onClick={() => duplicateTextBox(box.id)} title="Duplicate (⌘D)"><Copy className="h-3.5 w-3.5" /></button>
          {slides.length > 1 && (
            <button className={`${BTN} ${OFF}`} onClick={() => copyTextBoxToAllSlides(box.id)} title="Copy this text box onto every slide">
              <CopyPlus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            className={`${BTN} border-red-500/25 bg-red-500/[0.08] text-red-300 hover:bg-red-500/[0.16]`}
            onClick={() => removeTextBox(box.id)}
            title="Delete text box (Del)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Second row — the finer typographic controls */}
      {showMore && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-2 pt-0.5 border-t border-white/[0.05]">
          <Slider label="Line height" value={box.lineHeight} min={0.7} max={2.4} step={0.05} suffix="×"
            onChange={(v) => setLive({ lineHeight: v })} onCommit={commit} />
          <Slider label="Letter spacing" value={box.letterSpacing} min={-8} max={40} step={0.5}
            onChange={(v) => setLive({ letterSpacing: v })} onCommit={commit} />
          <Slider label="Opacity" value={box.opacity} min={0.05} max={1} step={0.05}
            onChange={(v) => setLive({ opacity: v })} onCommit={commit} />
          <Slider label="Rotation" value={box.rotation} min={-180} max={180} step={1} suffix="°"
            onChange={(v) => setLive({ rotation: v })} onCommit={commit} />
          <Slider label="Box width" value={box.width} min={60} max={1200} step={5}
            onChange={(v) => setLive({ width: v })} onCommit={commit} />

          <div className="flex items-center gap-1">
            <button className={`${BTN} ${box.shadow ? ON : OFF}`} onClick={() => set({ shadow: !box.shadow })} title="Drop shadow — keeps white text readable on a light chart">Shadow</button>
            <button className={`${BTN} ${box.outline ? ON : OFF}`} onClick={() => set({ outline: !box.outline })} title="Outline each glyph">Outline</button>
            {box.outline && (
              <input type="color" value={box.outlineColor} onChange={(e) => setLive({ outlineColor: e.target.value })} onBlur={() => commit()}
                className="h-6 w-6 rounded border border-white/15 bg-transparent cursor-pointer" title="Outline color" />
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              className={`${BTN} ${box.bgColor ? ON : OFF}`}
              onClick={() => set({ bgColor: box.bgColor ? null : "#000000" })}
              title="Filled pill behind the text"
            >
              Highlight
            </button>
            {box.bgColor && (
              <>
                <input type="color" value={box.bgColor} onChange={(e) => setLive({ bgColor: e.target.value })} onBlur={() => commit()}
                  className="h-6 w-6 rounded border border-white/15 bg-transparent cursor-pointer" title="Highlight color" />
                <Slider label="Fill" value={box.bgOpacity} min={0} max={1} step={0.05} onChange={(v) => setLive({ bgOpacity: v })} onCommit={commit} compact />
                <Slider label="Pad" value={box.bgPadding} min={0} max={90} step={1} onChange={(v) => setLive({ bgPadding: v })} onCommit={commit} compact />
                <Slider label="Round" value={box.bgRadius} min={0} max={90} step={1} onChange={(v) => setLive({ bgRadius: v })} onCommit={commit} compact />
              </>
            )}
          </div>

          <button
            className={`${BTN} ${OFF}`}
            onClick={() => set({ rotation: 0, letterSpacing: 0, lineHeight: 1.2, opacity: 1 })}
            title="Reset spacing, rotation and opacity"
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </button>
        </div>
      )}
    </div>
  );
}

function Slider({
  label, value, min, max, step, suffix = "", onChange, onCommit, compact = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
  onCommit: () => void;
  compact?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 shrink-0">
      <span className="text-[9px] font-bold uppercase tracking-wider text-white/40 whitespace-nowrap">{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        // Snapshot once, when the drag starts — not on every pixel of travel.
        onPointerDown={onCommit}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${compact ? "w-14" : "w-20"} accent-white cursor-pointer`}
      />
      <span className="text-[9.5px] font-mono text-white/55 w-8 tabular-nums">
        {Number.isInteger(value) ? value : value.toFixed(2)}{suffix}
      </span>
    </label>
  );
}
