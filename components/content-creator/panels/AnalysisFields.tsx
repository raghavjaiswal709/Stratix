"use client";

import type { CSSProperties, RefObject } from "react";
import { Upload } from "lucide-react";
import type { AnalysisData, PosterColors } from "../types";

export function AnalysisFields({
  analysisData,
  getFieldClassName,
  inputStyle,
  handleUpdateField,
  colors,
  handleImageDragOver,
  handleImageDragLeave,
  handleImageDrop,
  imageFileRef,
}: {
  analysisData: AnalysisData;
  getFieldClassName: (fieldId: string) => string;
  inputStyle: CSSProperties;
  handleUpdateField: (key: string, val: any) => void;
  colors: PosterColors;
  handleImageDragOver: (e: React.DragEvent<HTMLElement>, accentColor: string) => void;
  handleImageDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleImageDrop: (e: React.DragEvent<HTMLElement>) => void;
  imageFileRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      {/* Category & Date */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Category</label>
          <input
            id="input-category"
            type="text"
            className={getFieldClassName("category")}
            style={inputStyle}
            value={analysisData.category || ""}
            onChange={(e) => handleUpdateField("category", e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Date</label>
          <input
            id="input-date"
            type="text"
            className={getFieldClassName("date")}
            style={inputStyle}
            value={analysisData.date || ""}
            onChange={(e) => handleUpdateField("date", e.target.value)}
          />
        </div>
      </div>

      {/* Instrument, Timeframe & Session */}
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Instrument</label>
          <input
            id="input-instrument"
            type="text"
            placeholder="E.g. EURUSD"
            className={getFieldClassName("instrument")}
            style={inputStyle}
            value={analysisData.instrument || ""}
            onChange={(e) => handleUpdateField("instrument", e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Timeframe</label>
          <input
            id="input-timeframe"
            type="text"
            placeholder="E.g. H4"
            className={getFieldClassName("timeframe")}
            style={inputStyle}
            value={analysisData.timeframe || ""}
            onChange={(e) => handleUpdateField("timeframe", e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Session</label>
          <input
            id="input-session"
            type="text"
            placeholder="E.g. London"
            className={getFieldClassName("session")}
            style={inputStyle}
            value={analysisData.session || ""}
            onChange={(e) => handleUpdateField("session", e.target.value)}
          />
        </div>
      </div>

      {/* Level Name */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Level Name</label>
        <input
          id="input-levelName"
          type="text"
          placeholder="E.g. Daily Demand Zone"
          className={getFieldClassName("levelName")}
          style={inputStyle}
          value={analysisData.levelName || ""}
          onChange={(e) => handleUpdateField("levelName", e.target.value)}
        />
      </div>

      {/* Description / Explanation */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Explanation</label>
        <textarea
          id="input-description"
          className={getFieldClassName("description")}
          style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
          placeholder="Explain the level and strategy..."
          value={analysisData.description || ""}
          onChange={(e) => handleUpdateField("description", e.target.value)}
        />
      </div>

      {/* Action Plan (What to Do) */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Action Plan (What to Do)</label>
        <textarea
          id="input-whatToDo"
          className={getFieldClassName("whatToDo")}
          style={{ ...inputStyle, minHeight: "50px", resize: "vertical" }}
          placeholder="E.g. look for buy triggers on lower timeframe..."
          value={analysisData.whatToDo || ""}
          onChange={(e) => handleUpdateField("whatToDo", e.target.value)}
        />
      </div>

      {/* Key Levels */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Key Levels</label>
        <input
          id="input-keyLevels"
          type="text"
          placeholder="E.g. Support: 2320.50, Resistance: 2355.00"
          className={getFieldClassName("keyLevels")}
          style={inputStyle}
          value={analysisData.keyLevels || ""}
          onChange={(e) => handleUpdateField("keyLevels", e.target.value)}
        />
      </div>

      {/* Image URL — also a drag-and-drop zone */}
      <div
        className="rounded-xl border border-dashed border-transparent transition-colors p-1 -m-1"
        onDragOver={(e) => handleImageDragOver(e, colors.accent)}
        onDragLeave={handleImageDragLeave}
        onDrop={handleImageDrop}
      >
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Chart Image URL (or drag &amp; drop)</label>
        <div className="flex gap-2">
          <input
            id="input-imageUrl"
            type="text"
            placeholder="https://example.com/chart.png"
            className={getFieldClassName("imageUrl")}
            style={inputStyle}
            value={analysisData.imageUrl || ""}
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

      {/* Footer Brand */}
      <div>
        <label className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider block mb-1">Footer Brand</label>
        <input
          id="input-footer"
          type="text"
          className={getFieldClassName("footer")}
          style={inputStyle}
          value={analysisData.footer || ""}
          onChange={(e) => handleUpdateField("footer", e.target.value)}
        />
      </div>
    </>
  );
}
