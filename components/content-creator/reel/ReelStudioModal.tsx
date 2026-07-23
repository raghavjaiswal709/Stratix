"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Clapperboard,
  Loader2,
  Download,
  Music2,
  Volume2,
  VolumeX,
  Upload,
  Trash2,
  RefreshCw,
  AlertCircle,
  Play,
  Pause,
} from "lucide-react";
import type { CreatorMode } from "../types";
import {
  REEL_W,
  REEL_H,
  REEL_FPS,
  DEFAULT_REEL_SETTINGS,
  TRANSITION_LABELS,
  MOTION_LABELS,
  buildReelTimeline,
  type ReelSlideSource,
  type ReelSlide,
  type ReelExportSettings,
  type ReelExportProgress,
  type ReelExportResult,
  type TransitionStyle,
  type MotionIntensity,
} from "./reelTypes";
import { drawReelFrame } from "./reelRenderer";
import { exportReel, ReelExportCancelledError } from "./reelExporter";
import { createTicker } from "./reelTicker";
import { synthesizeWhooshBuffer } from "./reelWhoosh";
import { MUSIC_PRESETS, synthesizeTrackById } from "./reelMusicPresets";

const DEFAULT_SLIDE_DURATION = 3.2;
const MIN_SLIDE_DURATION = 1.5;
const MAX_SLIDE_DURATION = 8;

type Phase = "loading" | "ready" | "exporting" | "done" | "error";

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode a rendered slide image."));
    img.src = dataUrl;
  });
}

export function ReelStudioModal({
  onClose,
  creatorMode,
  generateSlides,
}: {
  onClose: () => void;
  creatorMode: CreatorMode;
  generateSlides: () => Promise<ReelSlideSource[]>;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [slides, setSlides] = useState<ReelSlide[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReelExportSettings>(DEFAULT_REEL_SETTINGS);
  const [progress, setProgress] = useState<ReelExportProgress>({ stage: "idle", fraction: 0, message: "" });
  const [result, setResult] = useState<ReelExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [bulkDuration, setBulkDuration] = useState(DEFAULT_SLIDE_DURATION);
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const loadStartedRef = useRef(false);
  const previewLastTsRef = useRef<number | null>(null);
  const previewAudioCtxRef = useRef<AudioContext | null>(null);
  const whooshBufferRef = useRef<AudioBuffer | null>(null);
  const whooshSettingsRef = useRef({ enabled: DEFAULT_REEL_SETTINGS.whooshEnabled, volume: DEFAULT_REEL_SETTINGS.whooshVolume });
  const trackPreviewRef = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode } | null>(null);

  const getPreviewAudioCtx = (): AudioContext => {
    if (!previewAudioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      previewAudioCtxRef.current = new AudioCtx();
    }
    return previewAudioCtxRef.current;
  };

  // Fires the same synthesized whoosh the export uses, live, at each
  // transition boundary while the preview is playing — reads from a ref
  // (kept in sync below) rather than `settings` directly so a volume-slider
  // drag doesn't have to restart the play loop.
  const playPreviewWhoosh = async () => {
    if (!whooshSettingsRef.current.enabled) return;
    try {
      const ctx = getPreviewAudioCtx();
      await ctx.resume();
      if (!whooshBufferRef.current) {
        whooshBufferRef.current = await synthesizeWhooshBuffer(0.42, ctx.sampleRate);
      }
      const source = ctx.createBufferSource();
      source.buffer = whooshBufferRef.current;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, whooshSettingsRef.current.volume));
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch {
      /* preview audio is best-effort — never block playback over it */
    }
  };

  const stopTrackPreview = () => {
    if (trackPreviewRef.current) {
      try {
        trackPreviewRef.current.source.stop();
      } catch {
        /* already stopped */
      }
      trackPreviewRef.current.ctx.close().catch(() => {});
      trackPreviewRef.current = null;
    }
    setPreviewingTrackId(null);
  };

  const toggleTrackPreview = async (presetId: string) => {
    if (previewingTrackId === presetId) {
      stopTrackPreview();
      return;
    }
    stopTrackPreview();
    setPreviewingTrackId(presetId);
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      await ctx.resume();
      const buffer = await synthesizeTrackById(presetId, 5, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.7;
      source.connect(gain).connect(ctx.destination);
      source.onended = () => {
        if (trackPreviewRef.current?.source === source) stopTrackPreview();
      };
      trackPreviewRef.current = { ctx, source };
      source.start();
    } catch {
      setPreviewingTrackId(null);
    }
  };

  // Load + decode the rendered posters exactly once per time the modal opens.
  useEffect(() => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    (async () => {
      try {
        const sources = await generateSlides();
        if (sources.length === 0) throw new Error("No posters available to convert — select at least one in the batch.");
        const images = await Promise.all(sources.map((s) => loadImage(s.dataUrl)));
        setSlides(images.map((image, i) => ({ title: sources[i].title, image, duration: DEFAULT_SLIDE_DURATION })));
        setPhase("ready");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to prepare slides.");
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Size the canvas once when slides land — resizing a canvas clears and
  // reallocates its backing bitmap, so this must NOT re-run on every preview
  // frame (the draw effect below just paints, never touches width/height).
  useEffect(() => {
    if (phase !== "ready" || slides.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = REEL_W;
    canvas.height = REEL_H;
  }, [phase, slides.length]);

  // Live, scrubbable preview — the exact same drawReelFrame the exporter
  // uses, driven either by the play loop below or by dragging the seek bar.
  useEffect(() => {
    if (phase !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas || slides.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const timeline = buildReelTimeline(slides.map((s) => s.duration), settings.transitionDuration);
    const t = Math.min(previewTime, timeline.totalDuration);
    drawReelFrame({
      ctx,
      images: slides.map((s) => s.image),
      timeline,
      time: t,
      motionIntensity: settings.motionIntensity,
      transitionStyle: settings.transitionStyle,
    });
  }, [phase, slides, settings.transitionDuration, settings.motionIntensity, settings.transitionStyle, previewTime]);

  // Keep the ref in sync so the play loop below can read current whoosh
  // settings without needing to restart (and re-anchor its timing) on every
  // volume-slider drag.
  useEffect(() => {
    whooshSettingsRef.current = { enabled: settings.whooshEnabled, volume: settings.whooshVolume };
  }, [settings.whooshEnabled, settings.whooshVolume]);

  // Play loop — driven by the same Worker ticker the exporter uses rather
  // than requestAnimationFrame, which some hosting environments suspend
  // outright unless the tab is actively compositing (see reelTicker.ts).
  // Loops back to 0 at the end so the preview keeps playing for review, and
  // fires the whoosh SFX live whenever playback crosses a transition
  // boundary (skipped on the loop-wrap tick so it doesn't fire "all at once").
  useEffect(() => {
    if (!isPreviewPlaying || phase !== "ready") {
      previewLastTsRef.current = null;
      return;
    }
    const timeline = buildReelTimeline(slides.map((s) => s.duration), settings.transitionDuration);
    const ticker = createTicker(1000 / REEL_FPS, () => {
      const ts = performance.now();
      if (previewLastTsRef.current == null) previewLastTsRef.current = ts;
      const delta = (ts - previewLastTsRef.current) / 1000;
      previewLastTsRef.current = ts;
      setPreviewTime((t) => {
        const raw = t + delta;
        const next = timeline.totalDuration > 0 ? raw % timeline.totalDuration : 0;
        if (next >= t) {
          for (let i = 0; i < timeline.slides.length - 1; i++) {
            const boundary = timeline.slides[i].holdEnd;
            if (t < boundary && next >= boundary) {
              playPreviewWhoosh();
              break;
            }
          }
        }
        return next;
      });
    });
    return () => {
      ticker.stop();
      previewLastTsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewPlaying, phase, slides, settings.transitionDuration]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      stopTrackPreview();
      previewAudioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const totalDuration = buildReelTimeline(slides.map((s) => s.duration), settings.transitionDuration).totalDuration;

  const updateDuration = (idx: number, duration: number) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, duration } : s)));
  };

  const handleExport = async () => {
    if (!canvasRef.current || slides.length === 0) return;
    setIsPreviewPlaying(false);
    setPhase("exporting");
    setExportError(null);
    setResult(null);
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const res = await exportReel({
        canvas: canvasRef.current,
        images: slides.map((s) => s.image),
        slideDurations: slides.map((s) => s.duration),
        settings,
        onProgress: setProgress,
        signal: controller.signal,
      });
      resultUrlRef.current = res.url;
      setResult(res);
      setPhase("done");
    } catch (e) {
      if (e instanceof ReelExportCancelledError) {
        setPhase("ready");
      } else {
        setExportError(e instanceof Error ? e.message : "Export failed — please try again.");
        setPhase("error");
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => abortControllerRef.current?.abort();

  const fileName = `stratix-reel-${creatorMode}-${Date.now()}.${result?.fileExtension ?? "webm"}`;
  const isExporting = phase === "exporting";
  const isBusy = phase === "loading" || isExporting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={isBusy ? undefined : onClose} />
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#141412] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-white/60" />
            <div>
              <span className="text-[13px] font-bold text-white block">Create Reel</span>
              <span className="text-[10px] text-white/35">
                {slides.length > 0 ? `${slides.length} slide${slides.length === 1 ? "" : "s"} · ~${totalDuration.toFixed(1)}s · 1080×1920` : "Converting posters into reel slides…"}
              </span>
            </div>
          </div>
          <button
            onClick={isBusy ? handleCancel : onClose}
            disabled={phase === "loading"}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.07] transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={isExporting ? "Cancel export" : "Close"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* Preview */}
          <div className="md:w-[300px] shrink-0 flex flex-col items-center gap-3 p-4 border-b md:border-b-0 md:border-r border-white/[0.06] md:overflow-y-auto">
            <div className="w-full max-w-[240px] aspect-[9/16] rounded-xl border border-white/10 bg-black overflow-hidden shrink-0">
              {phase === "loading" ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/40">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[10px]">Rendering posters…</span>
                </div>
              ) : phase === "error" && slides.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-red-300/70 px-3 text-center">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-[10px]">{loadError}</span>
                </div>
              ) : (
                <canvas ref={canvasRef} className="w-full h-full object-contain" />
              )}
            </div>

            {phase === "ready" && slides.length > 0 && (
              <div className="w-full flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPreviewPlaying((p) => !p)}
                    title={isPreviewPlaying ? "Pause preview" : "Play preview"}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white transition cursor-pointer shrink-0"
                  >
                    {isPreviewPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={totalDuration}
                    step={0.01}
                    value={Math.min(previewTime, totalDuration)}
                    onChange={(e) => setPreviewTime(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-400"
                  />
                  <span className="text-[10px] text-white/40 w-16 text-right shrink-0 tabular-nums">
                    {previewTime.toFixed(1)}/{totalDuration.toFixed(1)}s
                  </span>
                </div>
              </div>
            )}

            {phase === "done" && result && (
              <div className="w-full flex flex-col gap-2">
                <video src={result.url} controls loop playsInline className="w-full max-w-[240px] aspect-[9/16] rounded-xl border border-white/10 bg-black" />
                <a
                  href={result.url}
                  download={fileName}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-white text-black hover:bg-white/90 transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" /> Download Reel
                </a>
                <button
                  onClick={() => {
                    setPreviewTime(0);
                    setPhase("ready");
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-white transition cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Export Another Version
                </button>
              </div>
            )}

            {isExporting && (
              <div className="w-full flex flex-col gap-1.5">
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-white/45 text-center">{progress.message}</span>
                <button
                  onClick={handleCancel}
                  className="mt-1 text-[10.5px] font-bold text-white/50 hover:text-white/85 transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {phase === "error" && exportError && (
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-start gap-1.5 text-red-300/80 text-[10.5px]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {exportError}
                </div>
                <button
                  onClick={() => setPhase("ready")}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-white transition cursor-pointer"
                >
                  Back to Settings
                </button>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Slides & per-slide duration */}
            <section>
              <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-white/50 mb-2">Slides</h3>
              <div className="flex items-center gap-2 mb-2 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                <span className="text-[10px] font-bold text-white/60 w-20 shrink-0">All Slides</span>
                <input
                  type="range"
                  min={MIN_SLIDE_DURATION}
                  max={MAX_SLIDE_DURATION}
                  step={0.1}
                  value={bulkDuration}
                  disabled={isBusy}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setBulkDuration(v);
                    setSlides((prev) => prev.map((s) => ({ ...s, duration: v })));
                  }}
                  title="Set every slide to this duration at once"
                  className="flex-1 accent-emerald-400"
                />
                <span className="text-[10px] text-white/40 w-9 text-right shrink-0">{bulkDuration.toFixed(1)}s</span>
              </div>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {slides.map((s, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                    <img src={s.image.src} alt="" className="w-7 h-12 rounded object-cover border border-white/10 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10.5px] text-white/70 truncate">{s.title || `Slide ${i + 1}`}</p>
                      <input
                        type="range"
                        min={MIN_SLIDE_DURATION}
                        max={MAX_SLIDE_DURATION}
                        step={0.1}
                        value={s.duration}
                        disabled={isBusy}
                        onChange={(e) => updateDuration(i, parseFloat(e.target.value))}
                        className="w-full accent-emerald-400"
                      />
                    </div>
                    <span className="text-[10px] text-white/40 w-9 text-right shrink-0">{s.duration.toFixed(1)}s</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Transition style */}
            <section>
              <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-white/50 mb-2">Transition <span className="text-white/25 normal-case font-semibold">· 14 styles</span></h3>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(TRANSITION_LABELS) as TransitionStyle[]).map((style) => {
                  const active = settings.transitionStyle === style;
                  return (
                    <button
                      key={style}
                      disabled={isBusy}
                      onClick={() => setSettings((s) => ({ ...s, transitionStyle: style }))}
                      className={`px-2 py-2 rounded-lg text-[9.5px] leading-tight font-bold transition-all cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
                        active ? "bg-white/[0.1] text-white border-white/[0.15]" : "bg-white/[0.02] text-white/45 border-white/[0.06] hover:text-white/70"
                      }`}
                    >
                      {TRANSITION_LABELS[style]}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-white/40 w-20 shrink-0">Duration</span>
                <input
                  type="range"
                  min={0.25}
                  max={1.0}
                  step={0.05}
                  value={settings.transitionDuration}
                  disabled={isBusy}
                  onChange={(e) => setSettings((s) => ({ ...s, transitionDuration: parseFloat(e.target.value) }))}
                  className="flex-1 accent-emerald-400"
                />
                <span className="text-[10px] text-white/40 w-9 text-right shrink-0">{settings.transitionDuration.toFixed(2)}s</span>
              </div>
            </section>

            {/* Motion */}
            <section>
              <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-white/50 mb-2">Ken Burns Motion</h3>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(MOTION_LABELS) as MotionIntensity[]).map((m) => {
                  const active = settings.motionIntensity === m;
                  return (
                    <button
                      key={m}
                      disabled={isBusy}
                      onClick={() => setSettings((s) => ({ ...s, motionIntensity: m }))}
                      className={`px-2.5 py-2 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
                        active ? "bg-white/[0.1] text-white border-white/[0.15]" : "bg-white/[0.02] text-white/45 border-white/[0.06] hover:text-white/70"
                      }`}
                    >
                      {MOTION_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Music */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                  <Music2 className="h-3 w-3" /> Music
                </h3>
                <button
                  disabled={isBusy}
                  onClick={() => setSettings((s) => ({ ...s, musicEnabled: !s.musicEnabled }))}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer disabled:opacity-40 ${
                    settings.musicEnabled ? "bg-emerald-500/[0.16] text-emerald-300 border-emerald-500/[0.28]" : "bg-white/[0.03] text-white/40 border-white/[0.08]"
                  }`}
                >
                  {settings.musicEnabled ? "On" : "Off"}
                </button>
              </div>
              {settings.musicEnabled && (
                <div className="space-y-2">
                  <p className="text-[9px] text-white/30">10 trending tracks, ready to go — no upload needed. Tap ▶ to audition.</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MUSIC_PRESETS.map((preset) => {
                      const active = !settings.customMusicFile && settings.selectedTrackId === preset.id;
                      const previewing = previewingTrackId === preset.id;
                      return (
                        <div
                          key={preset.id}
                          className={`flex items-center gap-1 pl-2.5 pr-1 py-1.5 rounded-lg border transition ${
                            active ? "bg-white/[0.1] border-white/[0.15]" : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]"
                          }`}
                        >
                          <button
                            disabled={isBusy}
                            onClick={() => setSettings((s) => ({ ...s, selectedTrackId: preset.id, customMusicFile: null }))}
                            className="flex-1 min-w-0 text-left cursor-pointer disabled:cursor-not-allowed"
                          >
                            <span className={`block text-[10px] font-bold truncate ${active ? "text-white" : "text-white/70"}`}>{preset.name}</span>
                            <span className="block text-[8px] text-white/35 uppercase tracking-wide">{preset.mood}</span>
                          </button>
                          <button
                            onClick={() => toggleTrackPreview(preset.id)}
                            title={previewing ? "Stop preview" : "Preview track"}
                            className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] transition cursor-pointer shrink-0"
                          >
                            {previewing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <label className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border cursor-pointer transition ${settings.customMusicFile ? "bg-white/[0.1] text-white border-white/[0.15]" : "bg-white/[0.02] text-white/45 border-white/[0.06] hover:text-white/70"}`}>
                      <input
                        type="file"
                        accept="audio/*"
                        disabled={isBusy}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setSettings((s) => ({ ...s, customMusicFile: file }));
                        }}
                      />
                      <Upload className="h-3 w-3" /> {settings.customMusicFile ? "Replace Uploaded Track" : "Or Upload Your Own"}
                    </label>
                    {settings.customMusicFile && (
                      <button
                        disabled={isBusy}
                        onClick={() => setSettings((s) => ({ ...s, customMusicFile: null }))}
                        title="Remove — fall back to the selected trending track"
                        className="p-2 rounded-lg border border-white/[0.08] text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {settings.customMusicFile && <p className="text-[9.5px] text-white/30 truncate">{settings.customMusicFile.name}</p>}

                  <div className="flex items-center gap-2 pt-1">
                    <Volume2 className="h-3.5 w-3.5 text-white/35 shrink-0" />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={settings.musicVolume}
                      disabled={isBusy}
                      onChange={(e) => setSettings((s) => ({ ...s, musicVolume: parseFloat(e.target.value) }))}
                      className="flex-1 accent-emerald-400"
                    />
                    <span className="text-[10px] text-white/40 w-9 text-right shrink-0">{Math.round(settings.musicVolume * 100)}%</span>
                  </div>
                </div>
              )}
            </section>

            {/* Whoosh */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-white/50">Whoosh Transition SFX</h3>
                <button
                  disabled={isBusy}
                  onClick={() => setSettings((s) => ({ ...s, whooshEnabled: !s.whooshEnabled }))}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer disabled:opacity-40 ${
                    settings.whooshEnabled ? "bg-emerald-500/[0.16] text-emerald-300 border-emerald-500/[0.28]" : "bg-white/[0.03] text-white/40 border-white/[0.08]"
                  }`}
                >
                  {settings.whooshEnabled ? "On" : "Off"}
                </button>
              </div>
              {settings.whooshEnabled && (
                <div className="flex items-center gap-2">
                  <VolumeX className="h-3.5 w-3.5 text-white/35 shrink-0" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.whooshVolume}
                    disabled={isBusy}
                    onChange={(e) => setSettings((s) => ({ ...s, whooshVolume: parseFloat(e.target.value) }))}
                    className="flex-1 accent-emerald-400"
                  />
                  <span className="text-[10px] text-white/40 w-9 text-right shrink-0">{Math.round(settings.whooshVolume * 100)}%</span>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.06] shrink-0">
          <span className="text-[10.5px] text-white/35">
            {phase === "ready" && `${slides.length} slide${slides.length === 1 ? "" : "s"} ready — reels format 9:16`}
            {isExporting && "Exporting… keep this tab open and in the foreground"}
            {phase === "done" && "Reel exported"}
          </span>
          <button
            onClick={handleExport}
            disabled={phase !== "ready" || slides.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold bg-emerald-500/[0.18] text-emerald-300 hover:bg-emerald-500/[0.26] border border-emerald-500/[0.28] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
            {isExporting ? "Exporting…" : "Export Reel"}
          </button>
        </div>
      </div>
    </div>
  );
}
