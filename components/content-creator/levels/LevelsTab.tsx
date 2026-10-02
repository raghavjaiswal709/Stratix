"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown, Crosshair, Frame, ImagePlus, Loader2, Maximize2, Move, Plus, Trash2, Type, Wand2,
} from "lucide-react";
import {
  LEVELS_BG_COLORS, LEVELS_INSTRUMENTS, LEVELS_RATIOS, LEVELS_STATEMENT_TEMPLATES,
  LEVELS_TAGS, LEVELS_TIMEFRAMES,
} from "./constants";
import { CopyCaptionButton } from "./LevelsCarouselPanel";
import { buildCarouselCaption, buildLevelsStatement } from "./statement";
import { coverScaleFor } from "./textLayout";
import type { LevelsBgMode } from "./types";
import type { LevelsCarouselState } from "./useLevelsCarousel";

const CHIP =
  "px-2 py-1 rounded text-[10px] font-medium transition-all border cursor-pointer";
const CHIP_OFF = "bg-white/5 border-white/10 text-white/50 hover:text-white/85 hover:border-white/20";
const CHIP_ON = "bg-white/[0.14] border-white/30 text-white font-bold";

/**
 * Left-panel controls for the Levels carousel: what each slide is about, how
 * the chart sits on the Instagram canvas, and how the whole set looks.
 * Text formatting lives on the toolbar above the canvas instead, next to the
 * text it applies to.
 */
export function LevelsTab({ state }: { state: LevelsCarouselState }) {
  const {
    slides, activeSlide, settings, setSettings, ratio,
    addImages, updateSlide, duplicateSlide, removeSlide, clearAll, commit,
    fitImage, centerImage,
    addTextBox, addStatementBox, setSelectedTextId, selectedTextId, removeTextBox,
    importing,
  } = state;

  const fileRef = useRef<HTMLInputElement>(null);
  const [customInstrument, setCustomInstrument] = useState("");

  const statement = useMemo(
    () => (activeSlide ? buildLevelsStatement(activeSlide, settings.statementTemplate) : ""),
    [activeSlide, settings.statementTemplate],
  );
  const caption = useMemo(
    () => buildCarouselCaption(slides, settings.statementTemplate),
    [slides, settings.statementTemplate],
  );

  const patchSlide = (patch: Parameters<typeof updateSlide>[1]) => {
    if (!activeSlide) return;
    commit();
    updateSlide(activeSlide.id, patch);
  };
  const patchSettings = (patch: Partial<typeof settings>) => {
    commit();
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void addImages(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold border border-white/[0.10] bg-white/[0.05] hover:bg-white/[0.10] text-white transition-all cursor-pointer disabled:opacity-50"
      >
        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {slides.length ? "Add more chart images" : "Add chart images"}
      </button>

      {!slides.length && (
        <p className="text-[10.5px] leading-relaxed text-white/40 px-0.5">
          Pick every chart for today&apos;s levels post at once — each one becomes a slide in the carousel,
          in the order you pick them.
        </p>
      )}

      {activeSlide && (
        <>
          {/* ── What this slide is about ─────────────────────────────────── */}
          <Section title="Slide Setup" defaultOpen icon={Frame}
            badge={`${state.activeIndex + 1} of ${slides.length}`}>
            <Field label="Instrument">
              <div className="flex flex-wrap gap-1.5">
                {LEVELS_INSTRUMENTS.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => patchSlide({ instrument: activeSlide.instrument === sym ? "" : sym })}
                    className={`${CHIP} ${activeSlide.instrument === sym ? CHIP_ON : CHIP_OFF}`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 mt-1.5">
                <input
                  value={customInstrument}
                  onChange={(e) => setCustomInstrument(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !customInstrument.trim()) return;
                    patchSlide({ instrument: customInstrument.trim() });
                    setCustomInstrument("");
                  }}
                  placeholder="Other symbol… (Enter)"
                  className="flex-1 rounded-lg px-2 py-1.5 text-[11px] bg-white/[0.03] border border-white/[0.08] text-white outline-none focus:border-white/25"
                />
                {activeSlide.instrument && !LEVELS_INSTRUMENTS.includes(activeSlide.instrument) && (
                  <span className={`${CHIP} ${CHIP_ON}`}>{activeSlide.instrument}</span>
                )}
              </div>
            </Field>

            <Field label="Timeframe">
              <div className="flex flex-wrap gap-1.5">
                {LEVELS_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => patchSlide({ timeframe: activeSlide.timeframe === tf ? "" : tf })}
                    className={`${CHIP} ${activeSlide.timeframe === tf ? CHIP_ON : CHIP_OFF}`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Levels" hint="Same set the journal uses">
              <div className="flex flex-wrap gap-1.5">
                {LEVELS_TAGS.map((lvl) => {
                  const on = activeSlide.levels.includes(lvl);
                  return (
                    <button
                      key={lvl}
                      onClick={() =>
                        patchSlide({
                          levels: on
                            ? activeSlide.levels.filter((l) => l !== lvl)
                            : [...activeSlide.levels, lvl],
                        })
                      }
                      className={`${CHIP} ${
                        on ? "bg-amber-500/20 border-amber-500/45 text-amber-300 font-bold" : CHIP_OFF
                      }`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Bias">
              <div className="flex gap-1.5">
                {(["Bullish", "Bearish", "Neutral"] as const).map((b) => {
                  const on = activeSlide.bias === b;
                  const tone =
                    b === "Bullish"
                      ? "bg-emerald-500/20 border-emerald-500/45 text-emerald-300"
                      : b === "Bearish"
                      ? "bg-red-500/20 border-red-500/45 text-red-300"
                      : "bg-white/[0.14] border-white/30 text-white";
                  return (
                    <button
                      key={b}
                      onClick={() => patchSlide({ bias: on ? "" : b })}
                      className={`${CHIP} flex-1 ${on ? `${tone} font-bold` : CHIP_OFF}`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Note" hint="Goes into the caption, not the image">
              <textarea
                value={activeSlide.note}
                onChange={(e) => updateSlide(activeSlide.id, { note: e.target.value })}
                onBlur={() => commit()}
                rows={2}
                placeholder="Reaction expected at the QML, watching for a CHoCH…"
                className="w-full rounded-lg px-2 py-1.5 text-[11px] bg-white/[0.03] border border-white/[0.08] text-white outline-none focus:border-white/25 resize-none"
              />
            </Field>

            <div className="flex gap-1.5 pt-1">
              <button onClick={() => duplicateSlide(activeSlide.id)} className={`${CHIP} ${CHIP_OFF} flex-1 py-1.5`}>
                Duplicate slide
              </button>
              <button
                onClick={() => removeSlide(activeSlide.id)}
                className={`${CHIP} flex-1 py-1.5 bg-red-500/[0.08] border-red-500/25 text-red-300 hover:bg-red-500/[0.16]`}
              >
                Delete slide
              </button>
            </div>
          </Section>

          {/* ── Statement ────────────────────────────────────────────────── */}
          <Section title="Statement" defaultOpen icon={Wand2}>
            <Field label="Template">
              <select
                value={settings.statementTemplate}
                onChange={(e) => patchSettings({ statementTemplate: e.target.value })}
                className="w-full rounded-lg px-2 py-1.5 text-[11px] bg-white/[0.03] border border-white/[0.08] text-white outline-none cursor-pointer"
              >
                {LEVELS_STATEMENT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#111]">{t.label}</option>
                ))}
              </select>
            </Field>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
              <p className="text-[8.5px] font-bold uppercase tracking-widest text-white/35 mb-1">Preview</p>
              <p className="text-[12px] font-bold text-white leading-snug break-words">
                {statement || <span className="text-white/30 font-normal">Pick an instrument, timeframe or level…</span>}
              </p>
            </div>
            <button
              onClick={addStatementBox}
              disabled={!statement}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border border-white/[0.10] bg-white/[0.05] hover:bg-white/[0.10] text-white transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" /> Add statement to slide
            </button>
          </Section>

          {/* ── Chart placement ──────────────────────────────────────────── */}
          <Section title="Chart Placement" icon={Move}
            badge={`${activeSlide.imgW}×${activeSlide.imgH}`}>
            <Field label="Fit" hint="Contain keeps the whole chart with gaps top & bottom">
              <div className="flex gap-1.5">
                <button onClick={() => fitImage("contain")} className={`${CHIP} ${CHIP_OFF} flex-1 py-1.5`}>Contain</button>
                <button onClick={() => fitImage("width")} className={`${CHIP} ${CHIP_OFF} flex-1 py-1.5`}>Full width</button>
                <button onClick={() => fitImage("cover")} className={`${CHIP} ${CHIP_OFF} flex-1 py-1.5`}>Fill</button>
              </div>
            </Field>

            <Range
              label="Zoom"
              value={activeSlide.scale}
              min={0.25}
              max={Math.max(3, coverScaleFor(activeSlide, ratio.w, ratio.h) * 1.6)}
              step={0.005}
              format={(v) => `${Math.round(v * 100)}%`}
              onCommit={commit}
              onChange={(v) => updateSlide(activeSlide.id, { scale: v })}
            />
            <Range
              label="Horizontal"
              value={activeSlide.offsetX}
              min={-ratio.w}
              max={ratio.w}
              step={1}
              format={(v) => `${Math.round(v)}`}
              onCommit={commit}
              onChange={(v) => updateSlide(activeSlide.id, { offsetX: v })}
            />
            <Range
              label="Vertical"
              value={activeSlide.offsetY}
              min={-ratio.h}
              max={ratio.h}
              step={1}
              format={(v) => `${Math.round(v)}`}
              onCommit={commit}
              onChange={(v) => updateSlide(activeSlide.id, { offsetY: v })}
            />

            <div className="flex gap-1.5">
              <button onClick={() => centerImage("x")} className={`${CHIP} ${CHIP_OFF} flex-1 py-1.5`}>
                <Crosshair className="h-3 w-3 inline mr-1" />Centre X
              </button>
              <button onClick={() => centerImage("y")} className={`${CHIP} ${CHIP_OFF} flex-1 py-1.5`}>
                <Crosshair className="h-3 w-3 inline mr-1" />Centre Y
              </button>
              <button onClick={() => fitImage("contain")} className={`${CHIP} ${CHIP_OFF} flex-1 py-1.5`}>
                <Maximize2 className="h-3 w-3 inline mr-1" />Reset
              </button>
            </div>
            <p className="text-[9.5px] text-white/35 leading-relaxed">
              The chart can also be dragged straight on the canvas — it snaps back to centre as it passes through.
            </p>
          </Section>

          {/* ── Text boxes on this slide ─────────────────────────────────── */}
          <Section title="Text Boxes" icon={Type} badge={`${activeSlide.texts.length}`}>
            <button
              onClick={() => addTextBox()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border border-white/[0.10] bg-white/[0.05] hover:bg-white/[0.10] text-white transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add text box
            </button>
            {activeSlide.texts.length === 0 ? (
              <p className="text-[10px] text-white/35 leading-relaxed">
                Add as many as you like — each one carries its own font, size, colour, bold/italic and position.
                Formatting shows up on the bar above the canvas once a box is selected.
              </p>
            ) : (
              <div className="space-y-1">
                {activeSlide.texts.map((t, i) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTextId(t.id)}
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer transition-all ${
                      selectedTextId === t.id
                        ? "border-white/30 bg-white/[0.10]"
                        : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="text-[9px] font-bold text-white/35 w-4 shrink-0">{i + 1}</span>
                    <span
                      className="flex-1 truncate text-[11px]"
                      style={{
                        color: t.color,
                        fontWeight: t.bold ? 800 : 400,
                        fontStyle: t.italic ? "italic" : "normal",
                      }}
                    >
                      {t.text.split("\n")[0] || "(empty)"}
                    </span>
                    <span className="text-[9px] font-mono text-white/30 shrink-0">{Math.round(t.fontSize)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTextBox(t.id); }}
                      className="opacity-0 group-hover:opacity-100 text-red-300/80 hover:text-red-300 transition-opacity cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      {/* ── Carousel-wide look ─────────────────────────────────────────── */}
      <Section title="Carousel Look" icon={Frame}>
        <Field label="Canvas ratio">
          <div className="flex gap-1.5">
            {LEVELS_RATIOS.map((r) => (
              <button
                key={r.id}
                onClick={() => patchSettings({ ratioId: r.id })}
                className={`${CHIP} flex-1 py-1.5 ${settings.ratioId === r.id ? CHIP_ON : CHIP_OFF}`}
                title={`${r.w}×${r.h} — ${r.desc}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Gap fill" hint="What fills the space above & below a wide chart">
          <div className="flex gap-1.5">
            {(["solid", "gradient", "blur"] as LevelsBgMode[]).map((m) => (
              <button
                key={m}
                onClick={() => patchSettings({ bgMode: m })}
                className={`${CHIP} flex-1 py-1.5 capitalize ${settings.bgMode === m ? CHIP_ON : CHIP_OFF}`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>

        <Field label={settings.bgMode === "gradient" ? "Gradient" : "Background"}>
          <div className="flex flex-wrap items-center gap-1.5">
            {LEVELS_BG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => patchSettings({ bgColor: c })}
                className={`h-6 w-6 rounded-md border transition-transform cursor-pointer ${
                  settings.bgColor.toLowerCase() === c.toLowerCase() ? "border-white scale-110" : "border-white/15 hover:scale-105"
                }`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={settings.bgColor}
              onChange={(e) => setSettings((p) => ({ ...p, bgColor: e.target.value }))}
              onBlur={() => commit()}
              className="h-6 w-6 rounded-md border border-white/15 bg-transparent cursor-pointer"
              title="Custom background"
            />
            {settings.bgMode === "gradient" && (
              <input
                type="color"
                value={settings.bgColor2}
                onChange={(e) => setSettings((p) => ({ ...p, bgColor2: e.target.value }))}
                onBlur={() => commit()}
                className="h-6 w-6 rounded-md border border-white/15 bg-transparent cursor-pointer"
                title="Gradient end colour"
              />
            )}
          </div>
        </Field>

        {settings.bgMode === "blur" && (
          <>
            <Range label="Blur" value={settings.blurStrength} min={4} max={140} step={1}
              format={(v) => `${Math.round(v)}`} onCommit={commit}
              onChange={(v) => setSettings((p) => ({ ...p, blurStrength: v }))} />
            <Range label="Dim" value={settings.blurDim} min={0} max={0.85} step={0.05}
              format={(v) => `${Math.round(v * 100)}%`} onCommit={commit}
              onChange={(v) => setSettings((p) => ({ ...p, blurDim: v }))} />
          </>
        )}

        <Range label="Chart corners" value={settings.imageRadius} min={0} max={80} step={1}
          format={(v) => `${Math.round(v)}`} onCommit={commit}
          onChange={(v) => setSettings((p) => ({ ...p, imageRadius: v }))} />

        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => patchSettings({ imageShadow: !settings.imageShadow })}
            className={`${CHIP} ${settings.imageShadow ? CHIP_ON : CHIP_OFF}`}>Chart shadow</button>
          <button onClick={() => patchSettings({ imageBorder: !settings.imageBorder })}
            className={`${CHIP} ${settings.imageBorder ? CHIP_ON : CHIP_OFF}`}>Chart border</button>
          <button onClick={() => patchSettings({ showCounter: !settings.showCounter })}
            className={`${CHIP} ${settings.showCounter ? CHIP_ON : CHIP_OFF}`}>Slide counter</button>
        </div>
      </Section>

      {slides.length > 0 && (
        <Section title="Caption & Cleanup" icon={Type}>
          <pre className="max-h-40 overflow-auto rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 text-[10px] leading-relaxed text-white/65 whitespace-pre-wrap">
            {caption}
          </pre>
          <CopyCaptionButton text={caption} disabled={!caption} />
          <button
            onClick={clearAll}
            className={`${CHIP} w-full py-2 bg-red-500/[0.08] border-red-500/25 text-red-300 hover:bg-red-500/[0.16]`}
          >
            Clear the whole carousel
          </button>
        </Section>
      )}
    </div>
  );
}

// ── Small local primitives ─────────────────────────────────────────────────

function Section({
  title, icon: Icon, badge, defaultOpen = false, children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-white/[0.03] transition-colors cursor-pointer"
      >
        <Icon className="h-3.5 w-3.5 text-white/45 shrink-0" />
        <span className="flex-1 text-left text-[10px] font-bold uppercase tracking-widest text-white/70">{title}</span>
        {badge && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">{badge}</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-white/35 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-2.5 pb-2.5 space-y-2.5">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[8.5px] font-bold uppercase tracking-widest text-white/40">{label}</span>
        {hint && <span className="text-[8.5px] text-white/25 truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Range({
  label, value, min, max, step, format, onChange, onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[8.5px] font-bold uppercase tracking-widest text-white/40">{label}</span>
        <span className="text-[9.5px] font-mono text-white/55 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        // One undo entry per drag, taken as the drag starts.
        onPointerDown={onCommit}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white cursor-pointer"
      />
    </label>
  );
}
