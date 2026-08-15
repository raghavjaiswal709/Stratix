"use client";

import type { CSSProperties, RefObject } from "react";
import { CheckSquare, ClipboardCopy, Eye, EyeOff, Move, Plus, Sparkles, Square, Trash2, Upload, ZoomIn } from "lucide-react";
import type { NewsItem, PosterColors } from "../types";
import { CopyButton } from "../modals/CopyButton";
import { WebImageSearch } from "../WebImageSearch";
import { buildInstagramCopyText } from "../promptBuilders";

export function NewsFields({
  newsData,
  activeNewsIndex,
  setActiveNewsIndex,
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
  hideBento,
  setHideBento,
  batchMeta,
  visibleNewsCount,
  bentoFilteredIndices,
  selectAllForZip,
  deselectAllForZip,
  deselectedForZip,
  toggleZipSelection,
}: {
  newsData: NewsItem[];
  activeNewsIndex: number;
  setActiveNewsIndex: (index: number) => void;
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
  hideBento: boolean;
  setHideBento: (updater: boolean | ((prev: boolean) => boolean)) => void;
  batchMeta: { timeRangeLabel: string; reportGeneratedAt: string | null } | null;
  visibleNewsCount: number;
  bentoFilteredIndices: number[];
  selectAllForZip: () => void;
  deselectAllForZip: () => void;
  deselectedForZip: Set<number>;
  toggleZipSelection: (idx: number) => void;
}) {
  return (
    <>
      {newsData.length > 0 && newsData[activeNewsIndex] ? (
        <div className="space-y-3.5">
          {/* Bento explainer companion card — a distinct, simpler field set */}
          {newsData[activeNewsIndex].isBento && (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.05] px-3 py-2">
                <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                  Explains <span className="font-semibold">&ldquo;{newsData[activeNewsIndex].relatedTitle || "this story"}&rdquo;</span> in plain language — this card renders as a bento grid, no photo needed.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Simple Headline</label>
                <input
                  id="input-simpleHeadline"
                  type="text"
                  className={getFieldClassName("simpleHeadline")}
                  style={inputStyle}
                  value={newsData[activeNewsIndex].simpleHeadline || ""}
                  onChange={(e) => handleUpdateField("simpleHeadline", e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">What Happened</label>
                <textarea
                  id="input-whatHappened"
                  className={getFieldClassName("whatHappened")}
                  style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                  value={newsData[activeNewsIndex].whatHappened || ""}
                  onChange={(e) => handleUpdateField("whatHappened", e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Why It Matters</label>
                <textarea
                  id="input-whyItMatters"
                  className={getFieldClassName("whyItMatters")}
                  style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
                  value={newsData[activeNewsIndex].whyItMatters || ""}
                  onChange={(e) => handleUpdateField("whyItMatters", e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-2">
                  Who This Affects
                </label>
                <div className="space-y-2">
                  {(newsData[activeNewsIndex].simpleImpacts || []).map((imp, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Market"
                        className={getFieldClassName("simpleImpacts")}
                        style={{ ...inputStyle, flex: "0 0 30%" }}
                        value={imp.market}
                        onChange={(e) => {
                          const next = [...(newsData[activeNewsIndex].simpleImpacts || [])];
                          next[idx] = { ...next[idx], market: e.target.value };
                          handleUpdateField("simpleImpacts", next);
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Effect, in plain words"
                        className={getFieldClassName("simpleImpacts")}
                        style={{ ...inputStyle, flex: "1" }}
                        value={imp.effect}
                        onChange={(e) => {
                          const next = [...(newsData[activeNewsIndex].simpleImpacts || [])];
                          next[idx] = { ...next[idx], effect: e.target.value };
                          handleUpdateField("simpleImpacts", next);
                        }}
                      />
                      <select
                        className={getFieldClassName("simpleImpacts")}
                        style={{ ...inputStyle, flex: "0 0 76px", background: "#181614", color: "#F0EBE3" }}
                        value={imp.direction}
                        onChange={(e) => {
                          const next = [...(newsData[activeNewsIndex].simpleImpacts || [])];
                          next[idx] = { ...next[idx], direction: e.target.value as "up" | "down" | "neutral" };
                          handleUpdateField("simpleImpacts", next);
                        }}
                      >
                        <option value="up">Up</option>
                        <option value="down">Down</option>
                        <option value="neutral">Same</option>
                      </select>
                      <button
                        onClick={() => {
                          const next = (newsData[activeNewsIndex].simpleImpacts || []).filter((_, i) => i !== idx);
                          handleUpdateField("simpleImpacts", next);
                        }}
                        className="shrink-0 flex items-center justify-center w-7 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const next = [...(newsData[activeNewsIndex].simpleImpacts || []), { market: "", effect: "", direction: "neutral" as const }];
                      handleUpdateField("simpleImpacts", next);
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 hover:text-white/70 transition cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Add market
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Title / Headline */}
          {!newsData[activeNewsIndex].isBento && (
          <div>
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Headline</label>
            <input
              id="input-title"
              type="text"
              className={getFieldClassName("title")}
              style={inputStyle}
              value={newsData[activeNewsIndex].title || ""}
              onChange={(e) => handleUpdateField("title", e.target.value)}
            />
          </div>
          )}

          {/* Description */}
          {!newsData[activeNewsIndex].isBento && (
          <div>
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Summary</label>
            <textarea
              id="input-description"
              className={getFieldClassName("description")}
              style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
              value={newsData[activeNewsIndex].description || ""}
              onChange={(e) => handleUpdateField("description", e.target.value)}
            />
          </div>
          )}

          {/* Impact & Sentiment Biases */}
          {!newsData[activeNewsIndex].isBento && (
          <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Impact Level</label>
              <select
                className={getFieldClassName("impact")}
                style={{ ...inputStyle, background: "#181614", color: "#F0EBE3" }}
                value={newsData[activeNewsIndex].impact || "Medium"}
                onChange={(e) => handleUpdateField("impact", e.target.value)}
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Sentiment Bias</label>
              <select
                className={getFieldClassName("sentiment")}
                style={{ ...inputStyle, background: "#181614", color: "#F0EBE3" }}
                value={newsData[activeNewsIndex].sentiment || "Neutral"}
                onChange={(e) => handleUpdateField("sentiment", e.target.value)}
              >
                <option value="Bullish">Bullish</option>
                <option value="Bearish">Bearish</option>
                <option value="Neutral">Neutral</option>
              </select>
            </div>
          </div>

          {/* Affected Assets */}
          <div>
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Affected Assets</label>
            <input
              id="input-affectedAssets"
              type="text"
              placeholder="E.g. USD, XAUUSD, Equities"
              className={getFieldClassName("affectedAssets")}
              style={inputStyle}
              value={newsData[activeNewsIndex].affectedAssets || ""}
              onChange={(e) => handleUpdateField("affectedAssets", e.target.value)}
            />
          </div>

          {/* Key Takeaway */}
          <div>
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Key Takeaway & Market Bias</label>
            <textarea
              id="input-keyTakeaway"
              className={getFieldClassName("keyTakeaway")}
              style={{ ...inputStyle, minHeight: "50px", resize: "vertical" }}
              placeholder="E.g. Yields collapsed, reinforcing Gold demand..."
              value={newsData[activeNewsIndex].keyTakeaway || ""}
              onChange={(e) => handleUpdateField("keyTakeaway", e.target.value)}
            />
          </div>

          {/* Instagram Caption + Hashtags — editable, plus a single
              button that copies both together, spaced with the
              standard creator "dot trick" so hashtags land below
              the caption's "...more" fold instead of cluttering it. */}
          <div className="rounded-xl border border-emerald-500/[0.18] bg-emerald-500/[0.04] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ClipboardCopy className="h-3 w-3 text-emerald-400/80" />
                <span className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-wider">
                  {newsData[activeNewsIndex].isCover ? "Instagram Caption (Whole Carousel)" : "Instagram Caption + Hashtags"}
                </span>
              </div>
              <CopyButton
                text={buildInstagramCopyText(newsData[activeNewsIndex].caption || "", newsData[activeNewsIndex].hashtags || [])}
                label="Copy All"
                disabled={!newsData[activeNewsIndex].caption && !(newsData[activeNewsIndex].hashtags || []).length}
              />
            </div>
            <div>
              <label className="text-[9px] font-semibold text-white/40 uppercase tracking-wider block mb-1">Caption</label>
              <textarea
                id="input-caption"
                className={getFieldClassName("caption")}
                style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }}
                placeholder="E.g. Inflation just cooled to 2.8%... here's what it means for your trades."
                value={newsData[activeNewsIndex].caption || ""}
                onChange={(e) => handleUpdateField("caption", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[9px] font-semibold text-white/40 uppercase tracking-wider block mb-1">
                Hashtags ({(newsData[activeNewsIndex].hashtags || []).length})
              </label>
              <textarea
                id="input-hashtags"
                className={getFieldClassName("hashtags")}
                style={{ ...inputStyle, minHeight: "60px", resize: "vertical", fontFamily: "var(--font-mono), monospace", fontSize: "10.5px" }}
                placeholder="#Trading #Forex #Gold ..."
                value={(newsData[activeNewsIndex].hashtags || []).join(" ")}
                onChange={(e) => handleUpdateField("hashtags", e.target.value.split(/\s+/).map((s) => s.trim()).filter(Boolean))}
              />
            </div>
            <p className="text-[9px] text-white/30 leading-snug">
              &quot;Copy All&quot; pastes the caption and hashtags together in one go, ready to paste straight into Instagram.
            </p>
          </div>

          {/* Grok Imagine prompt for this poster's image */}
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
            <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">News Image (or drag &amp; drop)</label>
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

          {/* Source & Date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Source</label>
              <input
                id="input-source"
                type="text"
                className={getFieldClassName("source")}
                style={inputStyle}
                value={newsData[activeNewsIndex].source || ""}
                onChange={(e) => handleUpdateField("source", e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Date</label>
              <input
                id="input-date"
                type="text"
                className={getFieldClassName("date")}
                style={inputStyle}
                value={newsData[activeNewsIndex].date || ""}
                onChange={(e) => handleUpdateField("date", e.target.value)}
              />
            </div>
          </div>
          </div>
          )}

          {/* Quick Item List */}
          <div className="border-t pt-3.5" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider">
                News Items in Batch
              </label>
              <button
                type="button"
                onClick={() => setHideBento((v) => !v)}
                title="Remove the ELI5 explainer cards from the preview, page counter, and ZIP export"
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider transition-all cursor-pointer border shrink-0 ${
                  hideBento
                    ? "bg-white/[0.10] border-white/20 text-white"
                    : "bg-white/[0.02] border-white/[0.08] text-white/40 hover:text-white/70"
                }`}
              >
                {hideBento ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {hideBento ? "Bento Hidden" : "Hide Bento"}
              </button>
            </div>
            {batchMeta && (
              <p className="text-[9px] text-emerald-400/50 mb-2 -mt-1">
                AI-curated from filtered news · {batchMeta.timeRangeLabel}
                {batchMeta.reportGeneratedAt && ` · report ${new Date(batchMeta.reportGeneratedAt).toLocaleString()}`}
              </p>
            )}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] text-white/30">
                {visibleNewsCount} of {bentoFilteredIndices.length} selected for ZIP
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={selectAllForZip} className="text-[9px] font-bold text-white/40 hover:text-white/85 transition cursor-pointer">
                  Select All
                </button>
                <span className="text-white/15">·</span>
                <button type="button" onClick={deselectAllForZip} className="text-[9px] font-bold text-white/40 hover:text-white/85 transition cursor-pointer">
                  None
                </button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {newsData.map((item, idx) => {
                if (hideBento && item.isBento) return null;
                const isCurrent = idx === activeNewsIndex;
                const includedInZip = !deselectedForZip.has(idx);
                const zipCheckboxLabel = includedInZip
                  ? "Shown in preview + included in ZIP — click to hide"
                  : "Hidden from preview + ZIP — click to show";
                return (
                  <div
                    key={idx}
                    className={`w-full flex items-center gap-1.5 p-2 rounded-xl text-left text-[11px] transition-all border ${
                      isCurrent
                        ? "bg-white/[0.06] border-white/20 text-white font-bold"
                        : "bg-white/[0.01] border-white/[0.04] text-white/50 hover:bg-white/[0.03] hover:text-white/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleZipSelection(idx)}
                      title={zipCheckboxLabel}
                      className="shrink-0 cursor-pointer p-0.5 -m-0.5"
                    >
                      {includedInZip ? (
                        <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-white/25" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveNewsIndex(idx)}
                      className="flex items-center justify-between flex-1 min-w-0 cursor-pointer"
                    >
                      <span className="truncate flex-1 pr-2">{item.title || `News #${idx + 1}`}</span>
                      <span className="text-[8.5px] uppercase tracking-wider opacity-60 shrink-0">
                        {item.isBento ? "BENTO" : (item.source || "NEWS")}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-white/40 text-xs">
          No news items found. Paste news JSON in the JSON tab.
        </div>
      )}
    </>
  );
}
