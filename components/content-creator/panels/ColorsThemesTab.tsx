"use client";

import type { CreatorMode, PosterColors } from "../types";
import { COLOR_PRESETS, GRADIENT_PRESETS } from "../constants";
import type { SentimentScheme } from "../canvas/canvasUtils";

export function ColorsThemesTab({
  isBatchMode,
  posterStyle,
  setPosterStyle,
  creatorMode,
  sentimentScheme,
  setSentimentScheme,
  gradientFade,
  setGradientFade,
  editorialTheme,
  setEditorialTheme,
  gradientPresetId,
  setGradientPresetId,
  colors,
  setColors,
}: {
  isBatchMode: boolean;
  posterStyle: "editorial" | "bold";
  setPosterStyle: (style: "editorial" | "bold") => void;
  creatorMode: CreatorMode;
  sentimentScheme: SentimentScheme;
  setSentimentScheme: (scheme: SentimentScheme) => void;
  gradientFade: number;
  setGradientFade: (fade: number) => void;
  editorialTheme: "light" | "dark";
  setEditorialTheme: (theme: "light" | "dark") => void;
  gradientPresetId: string;
  setGradientPresetId: (id: string) => void;
  colors: PosterColors;
  setColors: (updater: PosterColors | ((prev: PosterColors) => PosterColors)) => void;
}) {
  return (
    <div className="space-y-4">
    {isBatchMode ? (
      <div className="space-y-4">
        <div>
          <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
            Poster Style
          </p>
          <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg">
            {(["editorial", "bold"] as const).map((s) => {
              const active = posterStyle === s;
              return (
                <button
                  key={s}
                  onClick={() => setPosterStyle(s)}
                  className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-[10px] font-bold uppercase tracking-wider text-center ${
                    active
                      ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                      : "text-[#787870] hover:text-white/60"
                  }`}
                >
                  {s === "editorial" ? "Editorial" : "Bold & Trending"}
                </button>
              );
            })}
          </div>
          <p className="text-[9px] text-[#787870] mt-1.5 leading-relaxed">
            {posterStyle === "editorial"
              ? "The classic paper-band + photo layout — pick a theme below."
              : "Full-bleed gradient, huge headline, swipe-to-read — pick a gradient below."}
          </p>
        </div>

        {creatorMode === "news" && (
          <div>
            <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
              Highlight Colors
            </p>
            <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg">
              {(["emerald", "skyblue"] as const).map((s) => {
                const active = sentimentScheme === s;
                return (
                  <button
                    key={s}
                    onClick={() => setSentimentScheme(s)}
                    className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-[10px] font-bold uppercase tracking-wider text-center ${
                      active
                        ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "text-[#787870] hover:text-white/60"
                    }`}
                  >
                    {s === "emerald" ? "Emerald / Red" : "Sky Blue / Red"}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-[#787870] mt-1.5 leading-relaxed">
              Bullish highlights render in {sentimentScheme === "emerald" ? "emerald green" : "sky blue"} — bearish stays red and base text stays white either way.
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider">
              Color Fade Intensity
            </p>
            <span className="text-[10px] font-mono text-white/50">{gradientFade}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={gradientFade}
            onChange={(e) => setGradientFade(parseInt(e.target.value, 10))}
            className="w-full cursor-pointer"
            style={{ accentColor: "#10b981" }}
          />
          <p className="text-[9px] text-[#787870] mt-1 leading-relaxed">
            How much the {posterStyle === "editorial" ? "paper-band color bleeds into" : "gradient washes over"} the photo — lower shows more of the image, 100% matches the tuned default, higher pushes past it for a heavier wash.
          </p>
        </div>

        {posterStyle === "editorial" && (
          <div>
            <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
              Theme
            </p>
            <div className="flex bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg">
              {(["light", "dark"] as const).map((t) => {
                const active = editorialTheme === t;
                return (
                  <button
                    key={t}
                    onClick={() => setEditorialTheme(t)}
                    className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-[10px] font-bold uppercase tracking-wider text-center ${
                      active
                        ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "text-[#787870] hover:text-white/60"
                    }`}
                  >
                    {t === "light" ? "Light Paper" : "Dark"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {posterStyle === "bold" && (
          <div>
            <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
              Gradient Color
            </p>
            <div className="grid grid-cols-2 gap-2">
              {GRADIENT_PRESETS.map((g) => {
                const isActive = gradientPresetId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGradientPresetId(g.id)}
                    className="flex flex-col items-start p-2 rounded-xl transition-all border text-left cursor-pointer"
                    style={{
                      background: isActive ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                      borderColor: isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <span className="text-[10px] font-bold text-white mb-1.5">
                      {g.name}
                    </span>
                    <div
                      className="h-7 w-full rounded-md border border-white/10"
                      style={{ background: `linear-gradient(135deg, ${g.stops[0]}, ${g.stops[1]})` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2">
          Color Presets
        </p>
        <div className="grid grid-cols-2 gap-2">
          {COLOR_PRESETS.map((preset) => {
            const isActive = colors.bg === preset.bg && colors.accent === preset.accent;
            return (
              <button
                key={preset.name}
                onClick={() => setColors(preset)}
                className="flex flex-col items-start p-2 rounded-xl transition-all border text-left cursor-pointer"
                style={{
                  background: isActive ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
                  borderColor: isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.06)",
                }}
              >
                <span className="text-[10px] font-bold text-white mb-1.5">
                  {preset.name}
                </span>
                <div className="flex gap-1">
                  <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.bg }} title="Background" />
                  <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.accent }} title="Accent" />
                  <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.text }} title="Text" />
                  <span className="h-3 w-3 rounded border border-white/10" style={{ background: preset.card }} title="Card BG" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
        <p className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider mb-2.5">
          Custom Theme Colors
        </p>

        <div className="space-y-2">
          {[
            { key: "bg", label: "Background", desc: "Main poster backdrop" },
            { key: "accent", label: "Accent Color", desc: "Borders, badges, decorations" },
            { key: "text", label: "Primary Text", desc: "Title & main content elements" },
            { key: "muted", label: "Muted Text", desc: "Subtitles, footnotes, labels" },
            { key: "card", label: "Card Color", desc: "Description card background" },
            { key: "subtle", label: "Subtle Color", desc: "Formula panel background" },
          ].map((colorItem) => (
            <div key={colorItem.key} className="flex items-center justify-between bg-[#161716]/40 p-2.5 rounded-xl border border-white/5">
              <div>
                <span className="text-[11px] font-semibold text-white block">
                  {colorItem.label}
                </span>
                <span className="text-[8.5px] text-[#787870] block">
                  {colorItem.desc}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={colors[colorItem.key as keyof PosterColors]}
                  onChange={(e) => setColors(prev => ({ ...prev, [colorItem.key]: e.target.value }))}
                  className="w-16 bg-transparent border-b border-[#2A2B2A] text-[10px] text-right font-mono outline-none text-white"
                />
                <div className="relative h-6 w-6 rounded border border-white/10 overflow-hidden cursor-pointer">
                  <input
                    type="color"
                    value={colors[colorItem.key as keyof PosterColors]}
                    onChange={(e) => setColors(prev => ({ ...prev, [colorItem.key]: e.target.value }))}
                    className="absolute inset-0 opacity-0 cursor-pointer h-full w-full"
                  />
                  <div className="absolute inset-0" style={{ background: colors[colorItem.key as keyof PosterColors] }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    )}
  </div>
  );
}
