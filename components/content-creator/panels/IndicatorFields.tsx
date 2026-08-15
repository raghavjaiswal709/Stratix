"use client";

import type { CSSProperties, RefObject } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { PosterColors, PosterData } from "../types";

export function IndicatorFields({
  parsedData,
  handleUpdateField,
  getFieldClassName,
  inputStyle,
  handleDeleteTag,
  handleAddTag,
  colors,
  handleImageDragOver,
  handleImageDragLeave,
  handleImageDrop,
  imageFileRef,
  handleAddMetric,
  handleUpdateMetric,
  handleDeleteMetric,
  handleAddSection,
  handleUpdateSection,
  handleDeleteSection,
}: {
  parsedData: PosterData;
  handleUpdateField: (key: string, val: any) => void;
  getFieldClassName: (fieldId: string) => string;
  inputStyle: CSSProperties;
  handleDeleteTag: (index: number) => void;
  handleAddTag: (tagStr: string) => void;
  colors: PosterColors;
  handleImageDragOver: (e: React.DragEvent<HTMLElement>, accentColor: string) => void;
  handleImageDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleImageDrop: (e: React.DragEvent<HTMLElement>) => void;
  imageFileRef: RefObject<HTMLInputElement | null>;
  handleAddMetric: () => void;
  handleUpdateMetric: (index: number, field: "label" | "value", val: string) => void;
  handleDeleteMetric: (index: number) => void;
  handleAddSection: () => void;
  handleUpdateSection: (index: number, field: "label" | "content", val: string) => void;
  handleDeleteSection: (index: number) => void;
}) {
  return (
    <>
      {/* Category & Index */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Category</label>
          <input
            id="input-category"
            type="text"
            className={getFieldClassName("category")}
            style={inputStyle}
            value={parsedData.category || ""}
            onChange={(e) => handleUpdateField("category", e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Index</label>
          <input
            id="input-index"
            type="text"
            className={getFieldClassName("index")}
            style={inputStyle}
            value={parsedData.index || ""}
            onChange={(e) => handleUpdateField("index", e.target.value)}
          />
        </div>
      </div>

      {/* Title & Subtitle */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Title</label>
        <input
          id="input-title"
          type="text"
          className={getFieldClassName("title")}
          style={inputStyle}
          value={parsedData.title || ""}
          onChange={(e) => handleUpdateField("title", e.target.value)}
        />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Subtitle</label>
        <input
          id="input-subtitle"
          type="text"
          className={getFieldClassName("subtitle")}
          style={inputStyle}
          value={parsedData.subtitle || ""}
          onChange={(e) => handleUpdateField("subtitle", e.target.value)}
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Description</label>
        <textarea
          id="input-description"
          className={getFieldClassName("description")}
          style={{ ...inputStyle, minHeight: "58px", resize: "vertical" }}
          value={parsedData.description || ""}
          onChange={(e) => handleUpdateField("description", e.target.value)}
        />
      </div>

      {/* Tags */}
      <div id="input-tags">
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Tags</label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {(parsedData.tags || []).map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-semibold uppercase tracking-wider border border-white/[0.08] bg-white/[0.04] text-white/70"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleDeleteTag(i)}
                className="hover:text-red-400 font-normal ml-0.5 cursor-pointer text-[10px]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="Press enter to add tag..."
            className="flex-1 rounded-xl px-3 py-1.5 text-[12px] outline-none"
            style={inputStyle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag(e.currentTarget.value);
                e.currentTarget.value = "";
              }
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              const inp = e.currentTarget.previousSibling as HTMLInputElement;
              handleAddTag(inp.value);
              inp.value = "";
            }}
            className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all border border-white/10 hover:bg-white/5 cursor-pointer text-white/60 hover:text-white"
          >
            +
          </button>
        </div>
      </div>

      {/* Formula */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Formula</label>
        <input
          id="input-formula"
          type="text"
          className={getFieldClassName("formula")}
          style={inputStyle}
          value={parsedData.formula || ""}
          onChange={(e) => handleUpdateField("formula", e.target.value)}
        />
      </div>

      {/* Image URL — also a drag-and-drop zone */}
      <div
        className="rounded-xl border border-dashed border-transparent transition-colors p-1 -m-1"
        onDragOver={(e) => handleImageDragOver(e, colors.accent)}
        onDragLeave={handleImageDragLeave}
        onDrop={handleImageDrop}
      >
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Image URL (or drag &amp; drop)</label>
        <div className="flex gap-2">
          <input
            id="input-imageUrl"
            type="text"
            placeholder="https://example.com/image.jpg"
            className={getFieldClassName("imageUrl")}
            style={inputStyle}
            value={parsedData.imageUrl || ""}
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
      </div>

      {/* Footer & Date */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Footer</label>
          <input
            id="input-footer"
            type="text"
            className={getFieldClassName("footer")}
            style={inputStyle}
            value={parsedData.footer || ""}
            onChange={(e) => handleUpdateField("footer", e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Date</label>
          <input
            id="input-date"
            type="text"
            className={getFieldClassName("date")}
            style={inputStyle}
            value={parsedData.date || ""}
            onChange={(e) => handleUpdateField("date", e.target.value)}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }} id="input-metrics">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider">Metrics (Max 4)</label>
          {(parsedData.metrics || []).length < 4 && (
            <button
              type="button"
              onClick={handleAddMetric}
              className="text-[10px] font-bold flex items-center gap-1 text-white/50 hover:text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Metric
            </button>
          )}
        </div>
        <div className="space-y-2">
          {(parsedData.metrics || []).map((met, i) => (
            <div key={i} className="flex gap-2 items-center bg-[#161716]/40 p-2.5 rounded-xl border border-white/5">
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  placeholder="Label"
                  className="w-full bg-transparent text-[10px] border-b border-white/10 pb-0.5 text-white/80 outline-none uppercase font-semibold"
                  value={met.label || ""}
                  onChange={(e) => handleUpdateMetric(i, "label", e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Value"
                  className="w-full bg-transparent text-[12px] py-0.5 text-white outline-none"
                  value={met.value || ""}
                  onChange={(e) => handleUpdateMetric(i, "value", e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => handleDeleteMetric(i)}
                className="text-red-400 hover:text-red-300 opacity-60 hover:opacity-100 transition-all p-1 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }} id="input-sections">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider">Sections</label>
          <button
            type="button"
            onClick={handleAddSection}
            className="text-[10px] font-bold flex items-center gap-1 text-white/50 hover:text-white cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Add Section
          </button>
        </div>
        <div className="space-y-2.5">
          {(parsedData.sections || []).map((sec, i) => (
            <div key={i} className="bg-[#161716]/40 p-3 rounded-xl border border-white/5 relative group">
              <button
                type="button"
                onClick={() => handleDeleteSection(i)}
                className="absolute top-2 right-2 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Section Label"
                  className="w-full bg-transparent text-[10px] border-b border-white/10 pb-0.5 text-white/80 outline-none uppercase font-semibold pr-6"
                  value={sec.label || ""}
                  onChange={(e) => handleUpdateSection(i, "label", e.target.value)}
                />
                <textarea
                  placeholder="Content"
                  rows={2}
                  className="w-full bg-transparent text-[11px] text-white/70 outline-none resize-y leading-relaxed"
                  value={sec.content || ""}
                  onChange={(e) => handleUpdateSection(i, "content", e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
