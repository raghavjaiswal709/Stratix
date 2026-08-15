"use client";

import type { CSSProperties, RefObject } from "react";
import { Move, Sparkles, Upload, ZoomIn } from "lucide-react";
import type { CreatorMode, NewsItem, PosterColors } from "../types";
import { CopyButton } from "../modals/CopyButton";
import { WebImageSearch } from "../WebImageSearch";

export function FactsLearningsFields({
  newsData,
  activeNewsIndex,
  setActiveNewsIndex,
  creatorMode,
  getFieldClassName,
  inputStyle,
  handleUpdateField,
  colors,
  handleImageDragOver,
  handleImageDragLeave,
  handleImageDrop,
  imageFileRef,
  buildWebSearchQuery,
  handleWebImageSelect,
}: {
  newsData: NewsItem[];
  activeNewsIndex: number;
  setActiveNewsIndex: (index: number) => void;
  creatorMode: CreatorMode;
  getFieldClassName: (fieldId: string) => string;
  inputStyle: CSSProperties;
  handleUpdateField: (key: string, val: any) => void;
  colors: PosterColors;
  handleImageDragOver: (e: React.DragEvent<HTMLElement>, accentColor: string) => void;
  handleImageDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleImageDrop: (e: React.DragEvent<HTMLElement>) => void;
  imageFileRef: RefObject<HTMLInputElement | null>;
  buildWebSearchQuery: (item: NewsItem | undefined | null) => string;
  handleWebImageSelect: (dataUrl: string) => void;
}) {
  return (
    <>
      {newsData.length > 0 && newsData[activeNewsIndex] ? (
        <div className="space-y-3.5">
          {creatorMode === "learnings" && newsData[activeNewsIndex].concept && (
            <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.04] px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[9.5px] font-bold text-emerald-300/80 uppercase tracking-wider">Concept</span>
              <span className="text-[11px] font-semibold text-white/85 truncate">{newsData[activeNewsIndex].concept}</span>
            </div>
          )}

          {/* Headline */}
          <div>
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">
              {creatorMode === "learnings" ? "Slide Heading" : "Headline"}
            </label>
            <input
              id="input-title"
              type="text"
              className={getFieldClassName("title")}
              style={inputStyle}
              value={newsData[activeNewsIndex].title || ""}
              onChange={(e) => handleUpdateField("title", e.target.value)}
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">
              {creatorMode === "facts" ? "The Fact" : "Body"}
            </label>
            <textarea
              id="input-description"
              className={getFieldClassName("description")}
              style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
              value={newsData[activeNewsIndex].description || ""}
              onChange={(e) => handleUpdateField("description", e.target.value)}
            />
          </div>

          {creatorMode === "facts" && newsData[activeNewsIndex].sourceNote && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2">
              <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider block mb-0.5">Source Note (internal)</span>
              <span className="text-[10.5px] text-white/55">{newsData[activeNewsIndex].sourceNote}</span>
            </div>
          )}

          {/* Image generation prompt */}
          {newsData[activeNewsIndex].imagePrompt && (
            <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.04] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-emerald-400/80" />
                  <span className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-wider">
                    Grok Image Prompt
                  </span>
                </div>
                <CopyButton text={newsData[activeNewsIndex].imagePrompt!} label="Copy" />
              </div>
              <p className="text-[10.5px] text-white/55 leading-relaxed max-h-32 overflow-y-auto select-text whitespace-pre-wrap">
                {newsData[activeNewsIndex].imagePrompt}
              </p>
              <p className="text-[9px] text-white/30 leading-snug">
                Paste into Grok Imagine → save the image → click the poster&apos;s image area (or Upload) to attach it.
              </p>
            </div>
          )}

          {/* Image URL + local file upload — also a drag-and-drop zone */}
          <div
            className="rounded-xl border border-dashed border-transparent transition-colors p-1 -m-1"
            onDragOver={(e) => handleImageDragOver(e, colors.accent)}
            onDragLeave={handleImageDragLeave}
            onDrop={handleImageDrop}
          >
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Image (or drag &amp; drop)</label>
            <div className="flex gap-2">
              <input
                id="input-imageUrl"
                type="text"
                placeholder="Paste URL or upload from PC →"
                className={getFieldClassName("imageUrl")}
                style={inputStyle}
                value={newsData[activeNewsIndex].imageUrl || ""}
                onChange={(e) => handleUpdateField("imageUrl", e.target.value)}
              />
              <button
                onClick={() => imageFileRef.current?.click()}
                title="Choose an image from your PC"
                className="flex items-center gap-1.5 px-3 rounded-xl text-[10px] font-bold shrink-0 transition-all cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
              >
                <Upload className="h-3 w-3" />
                Upload
              </button>
            </div>
            <div className="mt-2">
              <WebImageSearch query={buildWebSearchQuery(newsData[activeNewsIndex])} onSelect={handleWebImageSelect} />
            </div>
          </div>

          {/* Pan & zoom — adjusts how the image fills its frame */}
          {newsData[activeNewsIndex].imageUrl && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Move className="h-3 w-3 text-white/40" />
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Adjust Image</span>
                </div>
                <button
                  onClick={() => {
                    handleUpdateField("imageFocusX", 0.5);
                    handleUpdateField("imageFocusY", 0.5);
                    handleUpdateField("imageZoom", 1);
                  }}
                  className="text-[9.5px] font-bold text-white/35 hover:text-white/70 transition cursor-pointer"
                >
                  Reset
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

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[9px] font-mono text-[#787870]">
                  <span>Pan Horizontal</span>
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
                  <span>Pan Vertical</span>
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
          )}

          {/* Quick Item List */}
          <div className="border-t pt-3.5" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-2">
              {creatorMode === "facts" ? "Facts In Batch" : "Slides In Batch"}
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {newsData.map((item, idx) => {
                const isCurrent = idx === activeNewsIndex;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveNewsIndex(idx)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-[11px] transition-all border cursor-pointer ${
                      isCurrent
                        ? "bg-white/[0.06] border-white/20 text-white font-bold"
                        : "bg-white/[0.01] border-white/[0.04] text-white/50 hover:bg-white/[0.03] hover:text-white/80"
                    }`}
                  >
                    <span className="truncate flex-1 pr-2">{item.title || `#${idx + 1}`}</span>
                    {item.stepLabel && (
                      <span className="text-[8.5px] uppercase tracking-wider opacity-60 shrink-0">{item.stepLabel}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-white/40 text-xs">
          No {creatorMode} items yet. Click Generate to create a batch.
        </div>
      )}
    </>
  );
}
