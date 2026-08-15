"use client";

import { RATIOS } from "../constants";
import type { AspectRatio, PosterConfig } from "../types";

export function LayoutTab({
  ratioId,
  setRatioId,
  ar,
  config,
  setConfig,
}: {
  ratioId: string;
  setRatioId: (id: string) => void;
  ar: AspectRatio;
  config: PosterConfig;
  setConfig: (updater: PosterConfig | ((prev: PosterConfig) => PosterConfig)) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Aspect ratio selector */}
      <div>
        <p
          className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2"
        >
          Aspect Ratio
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {RATIOS.map((ratio) => {
            const active = ratio.id === ratioId;
            return (
              <button
                key={ratio.id}
                onClick={() => setRatioId(ratio.id)}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all cursor-pointer border ${
                  active
                    ? "bg-white/[0.08] text-white border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    : "bg-white/[0.02] border-white/[0.05] text-[#787870] hover:border-white/[0.12] hover:text-white"
                }`}
              >
                <span className="text-[10px] font-bold">{ratio.label}</span>
                <span className="text-[7.5px] opacity-60 mt-0.5">{ratio.desc}</span>
              </button>
            );
          })}
        </div>
        <p
          className="text-[9px] mt-1.5 text-[#787870]"
        >
          Canvas size: {ar.w} × {ar.h}px
        </p>
      </div>

      {/* Grid Options */}
      <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
        <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
          Grid Options
        </p>
        <div className="bg-[#161716]/40 p-3 rounded-xl border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white">Show Grid</span>
            <button
              onClick={() => setConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
              className="w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer"
              style={{ background: config.showGrid ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)" }}
            >
              <div
                className="w-3 h-3 bg-white rounded-full transition-transform duration-200"
                style={{ transform: config.showGrid ? "translateX(16px)" : "translateX(0px)" }}
              />
            </button>
          </div>

          {config.showGrid && (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                  <span>Grid Spacing</span>
                  <span>{config.gridSize}px</span>
                </div>
                <input
                  type="range"
                  min="14"
                  max="60"
                  step="2"
                  value={config.gridSize}
                  onChange={(e) => setConfig(prev => ({ ...prev, gridSize: parseInt(e.target.value) }))}
                  className="w-full cursor-pointer"
                  style={{ accentColor: "#ffffff" }}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                  <span>Grid Opacity</span>
                  <span>{Math.round(config.gridOpacity * 1000) / 10}%</span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.08"
                  step="0.005"
                  value={config.gridOpacity}
                  onChange={(e) => setConfig(prev => ({ ...prev, gridOpacity: parseFloat(e.target.value) }))}
                  className="w-full cursor-pointer"
                  style={{ accentColor: "#ffffff" }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Borders & Corners */}
      <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
        <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
          Borders & Corner Crosses
        </p>
        <div className="bg-[#161716]/40 p-3 rounded-xl border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-white">Outer Border</span>
            <button
              onClick={() => setConfig(prev => ({ ...prev, showBorder: !prev.showBorder }))}
              className="w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer"
              style={{ background: config.showBorder ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)" }}
            >
              <div
                className="w-3 h-3 bg-white rounded-full transition-transform duration-200"
                style={{ transform: config.showBorder ? "translateX(16px)" : "translateX(0px)" }}
              />
            </button>
          </div>

          {config.showBorder && (
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                <span>Border Width</span>
                <span>{config.borderWidth.toFixed(1)}px</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="4.0"
                step="0.5"
                value={config.borderWidth}
                onChange={(e) => setConfig(prev => ({ ...prev, borderWidth: parseFloat(e.target.value) }))}
                className="w-full cursor-pointer"
                style={{ accentColor: "#ffffff" }}
              />
            </div>
          )}

          <div className="flex items-center justify-between border-t border-[#2A2B2A] pt-2">
            <span className="text-[11px] font-bold text-white">Corner Crosshairs</span>
            <button
              onClick={() => setConfig(prev => ({ ...prev, showCrosses: !prev.showCrosses }))}
              className="w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer"
              style={{ background: config.showCrosses ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.08)" }}
            >
              <div
                className="w-3 h-3 bg-white rounded-full transition-transform duration-200"
                style={{ transform: config.showCrosses ? "translateX(16px)" : "translateX(0px)" }}
              />
            </button>
          </div>

          {config.showCrosses && (
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-mono text-[#787870]">
                <span>Crosshair Size</span>
                <span>{config.crossSize}px</span>
              </div>
              <input
                type="range"
                min="5"
                max="25"
                step="1"
                value={config.crossSize}
                onChange={(e) => setConfig(prev => ({ ...prev, crossSize: parseInt(e.target.value) }))}
                className="w-full cursor-pointer"
                style={{ accentColor: "#ffffff" }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Typography Scale */}
      <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
        <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
          Typography Options
        </p>
        <div className="bg-[#161716]/40 p-3 rounded-xl border border-white/5">
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] font-mono text-[#787870]">
              <span>Font Scaling</span>
              <span>{Math.round(config.fontScale * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.3"
              step="0.05"
              value={config.fontScale}
              onChange={(e) => setConfig(prev => ({ ...prev, fontScale: parseFloat(e.target.value) }))}
              className="w-full cursor-pointer"
              style={{ accentColor: "#ffffff" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
