"use client";

import type { RefObject } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, LayoutGrid, Move, Palette, Plus, Trash2, Upload, ZoomIn } from "lucide-react";
import type { LogoPosition, NewsItem } from "../types";

export function WatermarkFields({
  watermarkFileInputRef,
  handleWatermarkFiles,
  newsData,
  setNewsData,
  setJsonText,
  setActiveNewsIndex,
  activeNewsIndex,
  watermarkPosition,
  handleSetWatermarkPosition,
  watermarkStratiColor,
  watermarkXColor,
  handleSetWatermarkColors,
  watermarkBgStyle,
  setWatermarkBgStyle,
  watermarkScale,
  setWatermarkScale,
  handleApplyAllWatermarkSettingsToBatch,
  handleUpdateField,
  setShowGridView,
  swapFromIndex,
  setSwapFromIndex,
  swapToIndex,
  setSwapToIndex,
  handleSwapIndices,
  handleMoveIndex,
}: {
  watermarkFileInputRef: RefObject<HTMLInputElement | null>;
  handleWatermarkFiles: (files: FileList | File[]) => void;
  newsData: NewsItem[];
  setNewsData: (items: NewsItem[]) => void;
  setJsonText: (text: string) => void;
  setActiveNewsIndex: (index: number) => void;
  activeNewsIndex: number;
  watermarkPosition: LogoPosition;
  handleSetWatermarkPosition: (pos: LogoPosition, applyToAll?: boolean) => void;
  watermarkStratiColor: string;
  watermarkXColor: string;
  handleSetWatermarkColors: (strati: string, xColorVal: string, applyToAll?: boolean) => void;
  watermarkBgStyle: "glass" | "light" | "dark" | "none" | "solid";
  setWatermarkBgStyle: (style: any) => void;
  watermarkScale: number;
  setWatermarkScale: (scale: number) => void;
  handleApplyAllWatermarkSettingsToBatch: () => void;
  handleUpdateField: (key: string, val: any) => void;
  setShowGridView: (show: boolean) => void;
  swapFromIndex: number;
  setSwapFromIndex: (index: number) => void;
  swapToIndex: number;
  setSwapToIndex: (index: number) => void;
  handleSwapIndices: (fromIdx: number, toIdx: number) => void;
  handleMoveIndex: (index: number, direction: "up" | "down") => void;
}) {
  return (
    <div className="space-y-4">
      {/* Upload Section */}
      <div
        className="rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] hover:bg-white/[0.04] p-5 text-center transition-all cursor-pointer group"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files?.length) {
            handleWatermarkFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => watermarkFileInputRef.current?.click()}
      >
        <input
          ref={watermarkFileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleWatermarkFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-2.5 group-hover:scale-110 transition-transform">
          <Upload className="h-5 w-5" />
        </div>
        <p className="text-xs font-bold text-white mb-0.5">Click or Drag &amp; Drop Images Here</p>
        <p className="text-[10px] text-white/40">Select single or multiple images (PNG, JPG, WEBP)</p>
      </div>

      {newsData.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => watermarkFileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10.5px] font-bold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Add More Images
          </button>
          <button
            onClick={() => {
              setNewsData([]);
              setJsonText(JSON.stringify([], null, 2));
              setActiveNewsIndex(0);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-semibold border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-all cursor-pointer"
          >
            <Trash2 className="h-3 w-3" /> Clear All ({newsData.length})
          </button>
        </div>
      )}

      {/* Logo Position Selector */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
            <Move className="h-3.5 w-3.5 text-red-400" /> Logo Position
          </label>
          <span className="text-[9.5px] font-mono text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
            {(newsData[activeNewsIndex]?.logoPosition || watermarkPosition).toUpperCase()}
          </span>
        </div>

        {/* 3x3 Position Matrix / Grid Buttons */}
        <div className="grid grid-cols-3 gap-1.5 bg-black/30 p-2 rounded-xl border border-white/[0.05]">
          {[
            { id: "top-left", label: "Top Left" },
            { id: "top-center", label: "Top Center" },
            { id: "top-right", label: "Top Right (Default)" },
            { id: "center", label: "Center" },
            { id: "bottom-left", label: "Bottom Left" },
            { id: "bottom-center", label: "Bottom Center" },
            { id: "bottom-right", label: "Bottom Right" },
          ].map((pos) => {
            const currentPos = newsData[activeNewsIndex]?.logoPosition || watermarkPosition;
            const active = currentPos === pos.id;
            return (
              <button
                key={pos.id}
                onClick={() => handleSetWatermarkPosition(pos.id as LogoPosition)}
                className={`py-2 px-1 rounded-lg text-[9.5px] font-bold transition-all cursor-pointer border text-center ${
                  pos.id === "center" ? "col-span-3 my-0.5" : ""
                } ${
                  active
                    ? "bg-red-500/20 border-red-500/50 text-white shadow-[0_0_12px_rgba(239,68,68,0.25)]"
                    : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                {pos.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => handleSetWatermarkPosition(newsData[activeNewsIndex]?.logoPosition || watermarkPosition, true)}
          className="w-full py-1.5 rounded-lg text-[10px] font-bold border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/80 hover:text-white transition cursor-pointer"
        >
          Apply Position to All Images in Batch
        </button>
      </div>

      {/* Color & Style Controls */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-red-400" /> Logo Colors &amp; Style
          </label>
          <button
            onClick={() => handleSetWatermarkColors("#000000", "#EF4444", true)}
            className="text-[9.5px] font-bold text-red-400 hover:text-red-300 transition cursor-pointer"
          >
            Reset to Black &amp; Red
          </button>
        </div>

        {/* Strati Text Color */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-white/70">STRATI Color (Default Black)</span>
            <span className="font-mono text-[9px] text-white/40">{newsData[activeNewsIndex]?.stratiColor || watermarkStratiColor}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newsData[activeNewsIndex]?.stratiColor || watermarkStratiColor}
              onChange={(e) => handleSetWatermarkColors(e.target.value, newsData[activeNewsIndex]?.xColor || watermarkXColor)}
              className="w-8 h-8 rounded-lg border border-white/20 bg-transparent cursor-pointer shrink-0"
            />
            <div className="flex gap-1.5 flex-1 overflow-x-auto">
              {[
                { label: "Black", color: "#000000" },
                { label: "White", color: "#FFFFFF" },
                { label: "Dark Slate", color: "#0F172A" },
                { label: "Gold", color: "#F59E0B" },
              ].map((preset) => (
                <button
                  key={preset.color}
                  onClick={() => handleSetWatermarkColors(preset.color, newsData[activeNewsIndex]?.xColor || watermarkXColor)}
                  className="px-2 py-1 rounded-md text-[9px] font-bold border border-white/10 hover:border-white/30 text-white/80 flex items-center gap-1 shrink-0 cursor-pointer"
                  style={{ backgroundColor: preset.color === "#FFFFFF" ? "#333" : preset.color }}
                >
                  <span className="w-2 h-2 rounded-full border border-white/20" style={{ backgroundColor: preset.color }} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* X Text Color */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-white/70">X Color (Default Red)</span>
            <span className="font-mono text-[9px] text-red-400 font-bold">{newsData[activeNewsIndex]?.xColor || watermarkXColor}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newsData[activeNewsIndex]?.xColor || watermarkXColor}
              onChange={(e) => handleSetWatermarkColors(newsData[activeNewsIndex]?.stratiColor || watermarkStratiColor, e.target.value)}
              className="w-8 h-8 rounded-lg border border-white/20 bg-transparent cursor-pointer shrink-0"
            />
            <div className="flex gap-1.5 flex-1 overflow-x-auto">
              {[
                { label: "Red", color: "#EF4444" },
                { label: "Crimson", color: "#DC2626" },
                { label: "Gold", color: "#F59E0B" },
                { label: "Cyan", color: "#06B6D4" },
                { label: "White", color: "#FFFFFF" },
              ].map((preset) => (
                <button
                  key={preset.color}
                  onClick={() => handleSetWatermarkColors(newsData[activeNewsIndex]?.stratiColor || watermarkStratiColor, preset.color)}
                  className="px-2 py-1 rounded-md text-[9px] font-bold border border-white/10 hover:border-white/30 text-white/80 flex items-center gap-1 shrink-0 cursor-pointer"
                  style={{ backgroundColor: "#1e1e24" }}
                >
                  <span className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ backgroundColor: preset.color }} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Background Badge Style */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-white/70 block">Logo Pill Style</span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "none", label: "Transparent (No Box)" },
              { id: "glass", label: "Frosted Glass" },
              { id: "light", label: "Solid Light" },
              { id: "dark", label: "Solid Dark" },
              { id: "solid", label: "Accent Border" },
            ].map((st) => {
              const currentSt = newsData[activeNewsIndex]?.watermarkBgStyle || watermarkBgStyle;
              const active = currentSt === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => {
                    setWatermarkBgStyle(st.id as any);
                    if (newsData[activeNewsIndex]) {
                      const updated = [...newsData];
                      updated[activeNewsIndex] = { ...updated[activeNewsIndex], watermarkBgStyle: st.id as any };
                      setNewsData(updated);
                      setJsonText(JSON.stringify(updated, null, 2));
                    }
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[9px] font-bold transition cursor-pointer border text-center ${
                    active
                      ? "bg-white/15 border-white/40 text-white"
                      : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Logo Scale Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[9.5px] font-semibold text-white/70">
            <span>Logo Scale</span>
            <span className="font-mono text-white/50">{Math.round((newsData[activeNewsIndex]?.logoScale || watermarkScale) * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={newsData[activeNewsIndex]?.logoScale || watermarkScale}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setWatermarkScale(val);
              if (newsData[activeNewsIndex]) {
                const updated = [...newsData];
                updated[activeNewsIndex] = { ...updated[activeNewsIndex], logoScale: val };
                setNewsData(updated);
                setJsonText(JSON.stringify(updated, null, 2));
              }
            }}
            className="w-full cursor-pointer"
            style={{ accentColor: "#ef4444" }}
          />
        </div>

        <button
          onClick={handleApplyAllWatermarkSettingsToBatch}
          className="w-full py-1.5 rounded-lg text-[10px] font-bold border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 transition cursor-pointer"
        >
          Apply Colors &amp; Style to All Images in Batch
        </button>
      </div>

      {/* Image Pan/Zoom Adjustment */}
      {newsData[activeNewsIndex]?.imageUrl && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Move className="h-3.5 w-3.5 text-white/50" />
              <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Position &amp; Zoom Image</span>
            </div>
            <button
              onClick={() => {
                handleUpdateField("imageFocusX", 0.5);
                handleUpdateField("imageFocusY", 0.5);
                handleUpdateField("imageZoom", 1);
              }}
              className="text-[9.5px] font-bold text-white/40 hover:text-white transition cursor-pointer"
            >
              Reset Image
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
              <span className="flex items-center gap-1"><ZoomIn className="h-2.5 w-2.5" /> Zoom</span>
              <span>{Math.round((newsData[activeNewsIndex].imageZoom ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.05"
              value={newsData[activeNewsIndex].imageZoom ?? 1}
              onChange={(e) => handleUpdateField("imageZoom", parseFloat(e.target.value))}
              className="w-full cursor-pointer"
              style={{ accentColor: "#ffffff" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                <span>Pan Horiz</span>
                <span>{Math.round((newsData[activeNewsIndex].imageFocusX ?? 0.5) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={newsData[activeNewsIndex].imageFocusX ?? 0.5}
                onChange={(e) => handleUpdateField("imageFocusX", parseFloat(e.target.value))}
                className="w-full cursor-pointer"
                style={{ accentColor: "#ffffff" }}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                <span>Pan Vert</span>
                <span>{Math.round((newsData[activeNewsIndex].imageFocusY ?? 0.5) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={newsData[activeNewsIndex].imageFocusY ?? 0.5}
                onChange={(e) => handleUpdateField("imageFocusY", parseFloat(e.target.value))}
                className="w-full cursor-pointer"
                style={{ accentColor: "#ffffff" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Index Swapping & Reordering Section */}
      {newsData.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
              Reorder &amp; Swap Images ({newsData.length})
            </span>
            <span className="text-[9px] text-white/40 font-mono">Active: #{activeNewsIndex + 1}</span>
          </div>

          <button
            onClick={() => setShowGridView(true)}
            className="w-full py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
          >
            <LayoutGrid className="h-4 w-4" /> Open Interactive Grid View ({newsData.length})
          </button>

          {/* Quick Direct Swap Tool */}
          {newsData.length > 1 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex items-center gap-2">
              <span className="text-[9.5px] font-bold text-white/70 shrink-0">Swap #</span>
              <select
                value={swapFromIndex}
                onChange={(e) => setSwapFromIndex(parseInt(e.target.value, 10))}
                className="bg-black/50 border border-white/20 rounded px-1.5 py-1 text-[10px] font-bold text-white cursor-pointer"
              >
                {newsData.map((_, idx) => (
                  <option key={idx} value={idx}>
                    #{idx + 1}
                  </option>
                ))}
              </select>
              <span className="text-[9.5px] font-bold text-white/70 shrink-0">with #</span>
              <select
                value={swapToIndex}
                onChange={(e) => setSwapToIndex(parseInt(e.target.value, 10))}
                className="bg-black/50 border border-white/20 rounded px-1.5 py-1 text-[10px] font-bold text-white cursor-pointer"
              >
                {newsData.map((_, idx) => (
                  <option key={idx} value={idx}>
                    #{idx + 1}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleSwapIndices(swapFromIndex, swapToIndex)}
                className="ml-auto px-2.5 py-1 rounded bg-red-500 hover:bg-red-600 text-white font-bold text-[9.5px] transition cursor-pointer shrink-0"
              >
                Swap
              </button>
            </div>
          )}

          {/* Thumbnail List with Swap Buttons */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {newsData.map((item, idx) => {
              const isCurrent = idx === activeNewsIndex;
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                    isCurrent
                      ? "bg-red-500/10 border-red-500/40 text-white"
                      : "bg-white/[0.015] border-white/[0.05] text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  <div
                    onClick={() => setActiveNewsIndex(idx)}
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                  >
                    <span className="w-5 h-5 rounded-md bg-white/10 text-white flex items-center justify-center text-[9.5px] font-mono font-bold shrink-0">
                      {idx + 1}
                    </span>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0 border border-white/10" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                        <ImagePlus className="h-3.5 w-3.5 text-white/30" />
                      </div>
                    )}
                    <span className="truncate text-[10.5px] font-medium">{item.title || `Image ${idx + 1}`}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMoveIndex(idx, "up")}
                      title="Move Left / Up"
                      className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={idx === newsData.length - 1}
                      onClick={() => handleMoveIndex(idx, "down")}
                      title="Move Right / Down"
                      className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
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
                      title="Delete Image"
                      className="p-1 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
