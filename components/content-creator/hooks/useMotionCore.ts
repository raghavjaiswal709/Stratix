"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type {
  DecompositionStrength,
  HistoryListItem,
  HookVideoEntry,
  MotionLayer,
  MotionSlide,
  MotionVideoData,
  PosterColors,
  PosterConfig,
  PosterElement,
} from "../types";
import { EMPTY_MOTION_DATA } from "../constants";
import { buildMotionLayoutJson } from "../motionLayoutJson";
import { matchSlideOrderToScript } from "../slideOrder";
import { deriveScriptSegments } from "../scriptSegments";
import {
  extractManifestLines,
  type AutoSyncReport,
  type CompiledTimeline,
  type TimelineReport,
  type TranscriptWord,
} from "@/lib/motion-timeline";
import type { EditableTimeline } from "@/lib/motion-timeline/edit";

/**
 * The motion-video subsystem's state hub.
 *
 * Almost everything about a motion project — slides, the compiled timeline,
 * the editable timeline doc, playback/export flags, every media element ref
 * — lives here rather than being spread across the other motion hooks,
 * because `ar` (ContentCreatorPage's aspect-ratio memo) reads `motionTimeline`
 * and `motionData` directly and has to be computed right after this hook
 * returns, and because several handlers here (decomposition, watermark
 * strip) reach into timeline/undo-redo state to reset it. The other motion
 * hooks (useMotionMedia, useMotionTimelineEditor, useMotionPlaybackExport)
 * are logic-only: they take this hook's state/setters as params and add
 * behavior, not more state.
 */
export function useMotionCore({
  canvasRef,
  loadedImagesRef,
  setJsonText,
  saveToHistory,
  activeHistoryId,
  setActiveHistoryId,
  ratioId,
  colors,
  config,
  posterStyle,
  gradientPresetId,
  editorialTheme,
  gradientFade,
  sentimentScheme,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  loadedImagesRef: RefObject<Record<string, HTMLImageElement>>;
  setJsonText: (text: string) => void;
  saveToHistory: (
    category: HistoryListItem["category"],
    title: string,
    itemCount: number,
    payload: unknown,
    id?: string | null,
    previewUrl?: string
  ) => Promise<string | null>;
  activeHistoryId: string | null;
  setActiveHistoryId: (id: string | null) => void;
  ratioId: string;
  colors: PosterColors;
  config: PosterConfig;
  posterStyle: "editorial" | "bold";
  gradientPresetId: string;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: string;
}) {
  const [motionSlides, setMotionSlides] = useState<MotionSlide[]>([]);
  const [activeMotionIndex, setActiveMotionIndex] = useState(0);
  const [isSegmenting, setIsSegmenting] = useState(false);
  const [segmentProgress, setSegmentProgress] = useState<{ done: number; total: number } | null>(null);
  /**
   * Picked images waiting on a strength. Decomposition is destructive to
   * whatever is on screen, and the strength cannot be changed afterwards
   * without running the whole batch again — so the choice is made before
   * anything is touched, not after.
   */
  const [pendingMotionFiles, setPendingMotionFiles] = useState<File[] | null>(null);
  /** Remembered between uploads, so a second batch of the same deck is one click. */
  const [motionStrength, setMotionStrength] = useState<DecompositionStrength>("low");
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [isRemovingWatermarks, setIsRemovingWatermarks] = useState(false);
  const [watermarkProgress, setWatermarkProgress] = useState<{ done: number; total: number } | null>(null);
  const [watermarkError, setWatermarkError] = useState<string | null>(null);
  const [isPlayingMotion, setIsPlayingMotion] = useState(true);
  const [motionTimeMs, setMotionTimeMs] = useState(0);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const motionFileInputRef = useRef<HTMLInputElement>(null);
  const motionAnimFrameRef = useRef<number | null>(null);
  // slideId -> layerId -> <img>. Layer ids repeat across slides, so they can
  // never share one flat map without slides stealing each other's pixels.
  const motionLayerImgElsRef = useRef<Record<string, Record<string, HTMLImageElement>>>({});
  /**
   * Overlay clip id → its <video>, built once per clip like the hidden hook
   * element (document.createElement, never attached to the DOM). Muted by
   * default — an overlay is normally B-roll under the voiceover, not a
   * second audio source to mix in. `motionOverlayUrlsRef` mirrors which URL
   * each element currently holds so the lifecycle effect only rebuilds an
   * element when its clip's video actually changed, not on every unrelated
   * timeline edit (compileTimeline returns a fresh object every time).
   */
  const motionOverlayVideoElsRef = useRef<Record<string, HTMLVideoElement>>({});
  const motionOverlayUrlsRef = useRef<Record<string, string>>({});
  /** Bumped on each overlay video's loadeddata/seeked/canplay, purely to force
   * a repaint — same reason motionAssetVersion exists for images: a paused
   * canvas has no other reason to redraw, so a clip that is still buffering
   * or mid-seek at the moment of the one draw call would otherwise never
   * appear until the playhead moved again. */
  const [motionOverlayVideoVersion, setMotionOverlayVideoVersion] = useState(0);
  /** URL → in-flight (or settled) decode job, so an asset loads exactly once. */
  const motionAssetJobsRef = useRef<Map<string, Promise<void>>>(new Map());
  /** Bumped as each image becomes paint-ready, purely to trigger a repaint. */
  const [motionAssetVersion, setMotionAssetVersion] = useState(0);
  const [motionAssetProgress, setMotionAssetProgress] = useState<{ done: number; total: number } | null>(null);
  const [copiedMotionJson, setCopiedMotionJson] = useState(false);

  // AI Timeline — audio-synced choreography.
  const [motionTimelineText, setMotionTimelineText] = useState("");
  const [motionTimeline, setMotionTimeline] = useState<CompiledTimeline | null>(null);

  // Keeps motionOverlayVideoElsRef in step with the compiled timeline's own
  // overlay list — one <video> per clip, rebuilt only when that clip's own
  // videoUrl actually changes, torn down when the clip is deleted.
  useEffect(() => {
    const compiled = motionTimeline?.overlays ?? [];
    const currentIds = new Set(compiled.map((o) => o.id));
    const elMap = motionOverlayVideoElsRef.current;
    const urlMap = motionOverlayUrlsRef.current;

    const bumpVersion = () => setMotionOverlayVideoVersion((v) => v + 1);

    Object.keys(elMap).forEach((id) => {
      if (currentIds.has(id)) return;
      elMap[id].pause();
      elMap[id].removeAttribute("src");
      delete elMap[id];
      delete urlMap[id];
    });

    compiled.forEach((o) => {
      if (urlMap[o.id] === o.videoUrl && elMap[o.id]) return;
      elMap[o.id]?.pause();
      const video = document.createElement("video");
      video.src = o.videoUrl;
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.addEventListener("loadeddata", bumpVersion);
      video.addEventListener("seeked", bumpVersion);
      video.addEventListener("canplay", bumpVersion);
      elMap[o.id] = video;
      urlMap[o.id] = o.videoUrl;
    });
  }, [motionTimeline]);

  const [motionTimelineReport, setMotionTimelineReport] = useState<TimelineReport | null>(null);
  const [motionLoop, setMotionLoop] = useState(true);
  const [motionTranscript, setMotionTranscript] = useState<TranscriptWord[] | null>(null);
  const [motionTranscriptName, setMotionTranscriptName] = useState<string | null>(null);
  const [motionTranscriptNote, setMotionTranscriptNote] = useState<string | null>(null);
  // PART D of the video prompt. With this plus the transcript, the timeline is
  // arithmetic — Stratix builds it locally and no second AI pass happens.
  const [motionManifestText, setMotionManifestText] = useState("");
  const [motionManifestNote, setMotionManifestNote] = useState<string | null>(null);
  const [motionManifestWarnings, setMotionManifestWarnings] = useState<string[]>([]);
  // Auto-sync needs neither of the above: the decomposer already read the
  // posters and the CSV already timed the words, so the timeline is derivable.
  const [motionAutoSyncReport, setMotionAutoSyncReport] = useState<AutoSyncReport | null>(null);
  const [motionAutoSyncNote, setMotionAutoSyncNote] = useState<string | null>(null);
  // Off by default: with this on, autoSyncTimeline drops the props inside a
  // slide into "paper mode" — they land together at the scene's start rather
  // than being paced across it.
  const [motionTextOnlySync, setMotionTextOnlySync] = useState(false);
  // Open on a black title card over the recap; burn word-by-word captions.
  const [motionIntroCard, setMotionIntroCard] = useState(false);
  const [motionCaptions, setMotionCaptions] = useState(false);
  // "bottom" by default: the same big centred lower-third position as an
  // Overlay clip's own caption, so captions never visibly jump position
  // when a clip starts/ends. "top" restores the original full-width banner.
  const [motionCaptionPosition, setMotionCaptionPosition] = useState<"top" | "bottom">("bottom");
  // Opacity of the caption's own black backing, 0–1. Default 0.4 — enough to
  // separate the text from whatever's behind it without blocking it out.
  const [motionCaptionBgOpacity, setMotionCaptionBgOpacity] = useState(0.4);
  // Burnt-in captions light up this many ms before the transcript's own
  // timing — a caption read exactly on the word always feels a beat behind
  // it. See captionLeadMs in drawMotionTimelineFrame.ts.
  const [motionCaptionLeadMs, setMotionCaptionLeadMs] = useState(200);
  const [motionOverlayUploadState, setMotionOverlayUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [motionOverlayUploadError, setMotionOverlayUploadError] = useState<string | null>(null);
  // Off by default: paints over each collage-part's own baked-in caption
  // strip at render time.
  const [motionHideImageCaptions, setMotionHideImageCaptions] = useState(false);
  // Off by default: white "cut paper" margin + staggered drop-in on every
  // collage-part layer.
  const [motionPaperCutStyle, setMotionPaperCutStyle] = useState(false);
  // On by default: decomposed parts hold their rest position/scale/rotation
  // and only the camera pans/zooms.
  const [motionWholeImageMotion, setMotionWholeImageMotion] = useState(true);
  // On by default: every graphic (non-text) layer gets a small continuous
  // in-place rotational shake.
  const [motionZigzagMotion, setMotionZigzagMotion] = useState(true);
  // Off by default: the always-on black rotating border + diagonal shine on
  // whichever zone last appeared (see motionCurrentZoneVisibleRef below).
  const [motionZoneBorder, setMotionZoneBorder] = useState(false);
  // Off by default: one decomposed part at a time, rested dead centre, on a
  // flat page — every other part and element left unpainted. See minimalMode
  // in drawMotionTimelineFrame.ts.
  const [motionMinimalMode, setMotionMinimalMode] = useState(false);
  const [motionSfxEnabled, setMotionSfxEnabled] = useState(true);
  const [motionSfxVolume, setMotionSfxVolume] = useState(0.65);
  const [copiedSpeechPrompt, setCopiedSpeechPrompt] = useState(false);
  // Post-decomposition: re-sorts a shuffled batch by each poster's own
  // printed slide number.
  const [showFixSlideOrderModal, setShowFixSlideOrderModal] = useState(false);
  // Post-decomposition, caption-based: re-sorts a shuffled batch by locating
  // each slide's own caption inside the pasted script or a loaded transcript.
  const [motionOrderNotice, setMotionOrderNotice] = useState<{ message: string; previousOrder: MotionSlide[] } | null>(null);

  /**
   * The editable document.
   *
   * Playback runs on the compiled timeline, which cannot be edited — cues have
   * already become keyframes by then. So the editor owns an authored-shape
   * document, and every edit re-serialises and re-compiles it.
   */
  const [motionDoc, setMotionDoc] = useState<EditableTimeline | null>(null);
  const motionUndoRef = useRef<EditableTimeline[]>([]);
  const motionRedoRef = useRef<EditableTimeline[]>([]);
  const [motionHistoryTick, setMotionHistoryTick] = useState(0);
  const [motionSaveState, setMotionSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const motionSaveTimerRef = useRef<number | null>(null);
  const [motionAudioName, setMotionAudioName] = useState<string | null>(null);
  const [motionAudioR2Url, setMotionAudioR2Url] = useState<string | null>(null);
  const [motionMusicName, setMotionMusicName] = useState<string | null>(null);
  const [motionMusicR2Url, setMotionMusicR2Url] = useState<string | null>(null);
  const [motionCsvR2Url, setMotionCsvR2Url] = useState<string | null>(null);
  const [motionTranscriptRawText, setMotionTranscriptRawText] = useState<string | null>(null);
  const [motionMusicVolume, setMotionMusicVolume] = useState(0.2);
  // Export speed. The clock and both audio elements are scaled by it, so the
  // recording is genuinely faster rather than a fast-forwarded playback.
  const [motionExportSpeed, setMotionExportSpeed] = useState(1);
  const [copiedMotionPrompt, setCopiedMotionPrompt] = useState(false);
  const [isExportingTimeline, setIsExportingTimeline] = useState(false);
  const [timelineExportElapsed, setTimelineExportElapsed] = useState<number | null>(null);
  // Mirrors of state the rAF loop reads: touching them must not tear down and
  // rebuild the clock effect mid-playback.
  const motionTimeRef = useRef(0);
  const motionClockOriginRef = useRef(0);
  const motionLoopRef = useRef(true);
  /**
   * Scene- and zone-appearance SFX bookkeeping for the playback render effect.
   */
  const motionLastSceneIndexRef = useRef<number>(-1);
  const motionZoneVisibleRef = useRef<Record<string, boolean>>({});
  const motionZoneSeededSceneRef = useRef<number>(-1);
  /** layer id → the timeline ms its entrance was last detected at, for the brief on-entrance glow in drawMotionTimelineFrame. */
  const motionZoneFlourishRef = useRef<Record<string, number>>({});
  /**
   * Independent of the SFX bookkeeping above — drives the always-on black
   * rotating border + diagonal shine on whichever single zone last appeared.
   */
  const motionCurrentZoneVisibleRef = useRef<Record<string, boolean>>({});
  const motionCurrentZoneIdRef = useRef<string | null>(null);
  const motionCurrentZoneSceneRef = useRef<number>(-1);
  /**
   * The zone motionCurrentZoneIdRef most recently took over from — minimal
   * mode holds it under the incoming one so a handoff never dips through an
   * empty page. Cleared whenever the current zone is re-seeded rather than
   * genuinely replaced, since a seek's "previous" is not a part the viewer
   * was ever looking at.
   */
  const motionMinimalPrevZoneIdRef = useRef<string | null>(null);
  const motionAudioRef = useRef<HTMLAudioElement | null>(null);
  const motionAudioUrlRef = useRef<string | null>(null);
  const motionAudioR2UrlRef = useRef<string | null>(null);
  const motionMusicRef = useRef<HTMLAudioElement | null>(null);
  const motionMusicUrlRef = useRef<string | null>(null);
  const motionMusicR2UrlRef = useRef<string | null>(null);
  const motionCsvR2UrlRef = useRef<string | null>(null);
  const motionTranscriptRawTextRef = useRef<string | null>(null);
  const motionSpeedRef = useRef(1);
  /**
   * The mixing graph.
   *
   * Voiceover and music are routed through gain nodes into two destinations at
   * once: the speakers, and a MediaStream the recorder can capture.
   * `createMediaElementSource` may be called once per element and permanently
   * re-routes it, so the nodes are cached here and rebuilt only when the file
   * behind them changes.
   */
  const motionMixRef = useRef<{
    ctx: AudioContext;
    dest: MediaStreamAudioDestinationNode;
    voiceGain: GainNode;
    musicGain: GainNode;
    sfxGain: GainNode;
    hookGain: GainNode;
    voiceEl: HTMLAudioElement | null;
    musicEl: HTMLAudioElement | null;
    hookEl: HTMLVideoElement | null;
  } | null>(null);

  /**
   * The "With hook" feature: when enabled, the selected clip from
   * public/hooks/hooks.json plays before the real motion video — see
   * playHookPhase in useMotionPlaybackExport. hooks.json itself is a plain
   * static file (no database); uploads/deletes go through
   * app/api/content-creator/hooks, local dev only.
   */
  const [motionHooks, setMotionHooks] = useState<HookVideoEntry[]>([]);
  const [motionHookEnabled, setMotionHookEnabled] = useState(false);
  const [motionSelectedHookId, setMotionSelectedHookId] = useState<string | null>(null);
  const [isHookPhasePlaying, setIsHookPhasePlaying] = useState(false);
  const [hookUploadState, setHookUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [hookUploadError, setHookUploadError] = useState<string | null>(null);
  /**
   * Built once per selected hook the same way motionAudioRef/motionMusicRef
   * are built — `document.createElement`, never attached to the DOM.
   */
  const motionHookVideoRef = useRef<HTMLVideoElement | null>(null);
  const motionHookUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/hooks/hooks.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { hooks: [] }))
      .then((data: { hooks?: HookVideoEntry[] }) => {
        if (cancelled) return;
        const hooks = Array.isArray(data.hooks) ? data.hooks : [];
        setMotionHooks(hooks);
        setMotionSelectedHookId((prev) => prev ?? hooks.find((h) => h.isDefault)?.id ?? hooks[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setMotionHooks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const hook = motionHooks.find((h) => h.id === motionSelectedHookId) ?? null;
    if (!hook) {
      motionHookVideoRef.current = null;
      motionHookUrlRef.current = null;
      return;
    }
    if (motionHookUrlRef.current === hook.path) return;
    const video = document.createElement("video");
    video.src = hook.path;
    video.preload = "auto";
    video.muted = false;
    video.playsInline = true;
    motionHookVideoRef.current = video;
    motionHookUrlRef.current = hook.path;
  }, [motionHooks, motionSelectedHookId]);

  const refreshMotionHooks = useCallback(async (): Promise<HookVideoEntry[]> => {
    try {
      const r = await fetch("/hooks/hooks.json", { cache: "no-store" });
      const data = r.ok ? await r.json() : { hooks: [] };
      const hooks: HookVideoEntry[] = Array.isArray(data.hooks) ? data.hooks : [];
      setMotionHooks(hooks);
      return hooks;
    } catch {
      return [];
    }
  }, []);

  const handleUploadHook = useCallback(
    async (file: File, label: string) => {
      setHookUploadState("uploading");
      setHookUploadError(null);
      try {
        // Measured client-side rather than parsed server-side — no ffmpeg
        // dependency needed just to show a duration in the picker.
        const durationMs = await new Promise<number | null>((resolve) => {
          const probe = document.createElement("video");
          const url = URL.createObjectURL(file);
          const cleanup = (value: number | null) => {
            URL.revokeObjectURL(url);
            resolve(value);
          };
          probe.preload = "metadata";
          probe.onloadedmetadata = () => cleanup(Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : null);
          probe.onerror = () => cleanup(null);
          probe.src = url;
        });

        const form = new FormData();
        form.append("file", file);
        form.append("label", label);
        if (durationMs != null) form.append("durationMs", String(durationMs));

        const res = await fetch("/api/content-creator/hooks", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Upload failed");

        await refreshMotionHooks();
        if (data?.hook?.id) setMotionSelectedHookId(data.hook.id);
        setHookUploadState("idle");
      } catch (err: any) {
        setHookUploadState("error");
        setHookUploadError(err?.message || "Upload failed");
      }
    },
    [refreshMotionHooks]
  );

  const handleDeleteHook = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/content-creator/hooks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Delete failed");
        const hooks = await refreshMotionHooks();
        setMotionSelectedHookId((prev) => (prev === id ? hooks.find((h) => h.isDefault)?.id ?? hooks[0]?.id ?? null : prev));
      } catch (err: any) {
        setHookUploadState("error");
        setHookUploadError(err?.message || "Delete failed");
      }
    },
    [refreshMotionHooks]
  );

  useEffect(() => {
    motionLoopRef.current = motionLoop;
  }, [motionLoop]);

  const motionData: MotionVideoData = motionSlides[activeMotionIndex] ?? EMPTY_MOTION_DATA;
  const activeMotionSlideId = motionSlides[activeMotionIndex]?.slideId ?? "";

  const setMotionData = useCallback(
    (updater: MotionVideoData | ((prev: MotionVideoData) => MotionVideoData)) => {
      setMotionSlides((prev) => {
        if (prev.length === 0) return prev;
        const idx = Math.min(activeMotionIndex, prev.length - 1);
        const current = prev[idx];
        const next = typeof updater === "function" ? (updater as (p: MotionVideoData) => MotionVideoData)(current) : updater;
        const copy = [...prev];
        copy[idx] = { ...next, slideId: current.slideId };
        return copy;
      });
    },
    [activeMotionIndex]
  );

  const [isDraggingMotionLayer, setIsDraggingMotionLayer] = useState(false);
  const motionLayerDragStateRef = useRef<{
    layerId: string;
    startClientX: number;
    startClientY: number;
    startLayerX: number;
    startLayerY: number;
  } | null>(null);

  const handleStartMotionLayerDrag = (e: React.MouseEvent<HTMLDivElement>, hit: PosterElement) => {
    const targetLayer = motionData.layers.find((l) => l.id === hit.id);
    if (!targetLayer) return;

    setMotionData((prev) => ({ ...prev, activeLayerId: hit.id }));

    motionLayerDragStateRef.current = {
      layerId: hit.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLayerX: targetLayer.x,
      startLayerY: targetLayer.y,
    };
    setIsDraggingMotionLayer(true);
  };

  /**
   * Builds (or extends) the mixing graph so both audio elements reach the
   * speakers and the recorder. Safe to call repeatedly: each element is wired
   * in once, on the call that first sees it.
   */
  const ensureMotionMix = useCallback(() => {
    const voiceEl = motionAudioRef.current;
    const musicEl = motionMusicRef.current;
    const hookEl = motionHookVideoRef.current;
    if (!voiceEl && !musicEl && !hookEl) return null;

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    let mix = motionMixRef.current;
    if (!mix) {
      const ctx = new Ctor();
      const dest = ctx.createMediaStreamDestination();
      const voiceGain = ctx.createGain();
      const musicGain = ctx.createGain();
      // Transition SFX shares this bus too — it is the only way a whoosh
      // played on a zone change ends up in the recorded stream rather than
      // just the live speakers.
      const sfxGain = ctx.createGain();
      // The hook clip's own embedded audio, live during the hook pre-roll only.
      const hookGain = ctx.createGain();
      [voiceGain, musicGain, sfxGain, hookGain].forEach((g) => {
        g.connect(ctx.destination);
        g.connect(dest);
      });
      mix = { ctx, dest, voiceGain, musicGain, sfxGain, hookGain, voiceEl: null, musicEl: null, hookEl: null };
      motionMixRef.current = mix;
    }

    if (voiceEl && mix.voiceEl !== voiceEl) {
      try {
        mix.ctx.createMediaElementSource(voiceEl).connect(mix.voiceGain);
        mix.voiceEl = voiceEl;
      } catch {
        /* already routed through another graph — leave it on the default output */
      }
    }
    if (musicEl && mix.musicEl !== musicEl) {
      try {
        mix.ctx.createMediaElementSource(musicEl).connect(mix.musicGain);
        mix.musicEl = musicEl;
      } catch {
        /* as above */
      }
    }
    if (hookEl && mix.hookEl !== hookEl) {
      try {
        mix.ctx.createMediaElementSource(hookEl).connect(mix.hookGain);
        mix.hookEl = hookEl;
      } catch {
        /* as above */
      }
    }

    mix.musicGain.gain.value = motionMusicVolume;
    if (mix.ctx.state === "suspended") void mix.ctx.resume();
    return mix;
  }, [motionMusicVolume]);

  /** Moves the playhead (and the voiceover with it) without restarting the clock. */
  const seekMotionTo = useCallback(
    (ms: number) => {
      const duration = motionTimeline?.durationMs ?? Infinity;
      const clamped = Math.max(0, Math.min(ms, duration));
      motionTimeRef.current = clamped;
      // Wall time advances `speed` times slower than timeline time, so the
      // origin has to be scaled with it or a seek would jump on resume.
      motionClockOriginRef.current = performance.now() - clamped / Math.max(0.01, motionSpeedRef.current);
      const audio = motionAudioRef.current;
      if (audio) {
        try {
          audio.currentTime = clamped / 1000;
        } catch {
          /* audio not seekable yet — the clock still moves */
        }
      }
      const music = motionMusicRef.current;
      if (music) {
        try {
          // The bed loops, so it is positioned within its own length.
          music.currentTime = music.duration ? (clamped / 1000) % music.duration : 0;
        } catch {
          /* not seekable yet */
        }
      }
      setMotionTimeMs(clamped);
    },
    [motionTimeline]
  );

  /**
   * Loads one image to the point where drawing it is guaranteed to paint.
   *
   * `onload` is not that point: the bitmap may still be undecoded, and the
   * first `drawImage` either stalls the frame or draws nothing. `decode()` is.
   *
   * Deduplicated by URL and cached forever.
   */
  const loadMotionImage = useCallback((url: string): Promise<void> => {
    if (!url) return Promise.resolve();
    const jobs = motionAssetJobsRef.current;
    const running = jobs.get(url);
    if (running) return running;

    const job = (async () => {
      let img = loadedImagesRef.current[url];
      if (!img) {
        img = new Image();
        img.decoding = "async";
        loadedImagesRef.current[url] = img;
        img.src = url;
      }
      try {
        if (!(img.complete && img.naturalWidth > 0)) {
          await new Promise<void>((resolve, reject) => {
            img!.addEventListener("load", () => resolve(), { once: true });
            img!.addEventListener("error", () => reject(new Error(url)), { once: true });
          });
        }
        if (img.decode) await img.decode().catch(() => {});
      } catch {
        // One broken asset must not wedge the batch. The renderer falls back to
        // the flattened poster, so the frame is still complete.
      } finally {
        // Repaint: a paused canvas has no other reason to redraw, so without
        // this an image that arrives late is simply never shown.
        setMotionAssetVersion((v) => v + 1);
      }
    })();

    jobs.set(url, job);
    return job;
  }, [loadedImagesRef]);

  // Warms loadedImagesRef/motionLayerImgElsRef for one slide's background +
  // layer images so the motion canvas can draw it immediately.
  const preloadMotionSlideImages = useCallback(
    (slide: MotionSlide): Promise<void> => {
      const urls: string[] = [];
      if (slide.backgroundUrl) urls.push(slide.backgroundUrl);
      // The flattened poster is what the renderer paints while the decomposed
      // pieces are still arriving, so it is an asset in its own right.
      if (slide.originalUrl) urls.push(slide.originalUrl);
      (slide.layers || []).forEach((l) => {
        if (l.imageUrl) urls.push(l.imageUrl);
      });

      const jobs = urls.map((u) => loadMotionImage(u));

      // Point the per-layer map at the same cached elements the URL cache holds,
      // so a layer reused across slides is downloaded and decoded once.
      const perSlide: Record<string, HTMLImageElement> = motionLayerImgElsRef.current[slide.slideId] ?? {};
      (slide.layers || []).forEach((l) => {
        if (!l.imageUrl) return;
        const el = loadedImagesRef.current[l.imageUrl];
        if (el) perSlide[l.id] = el;
      });
      motionLayerImgElsRef.current[slide.slideId] = perSlide;

      return Promise.all(jobs).then(() => undefined);
    },
    [loadMotionImage, loadedImagesRef]
  );

  /**
   * Blocks until every slide can actually be drawn. Playback and recording
   * both call this before they start.
   */
  const ensureMotionAssets = useCallback(
    async (slides: MotionSlide[], timeoutMs = 30_000): Promise<boolean> => {
      if (slides.length === 0) return true;

      let done = 0;
      setMotionAssetProgress({ done: 0, total: slides.length });

      const tracked = slides.map((slide) =>
        preloadMotionSlideImages(slide).then(() => {
          done += 1;
          setMotionAssetProgress({ done, total: slides.length });
        })
      );

      // A stalled CDN must not hold the export hostage forever; past the
      // deadline we go ahead and let the renderer's fallback carry it.
      const finished = await Promise.race([
        Promise.all(tracked).then(() => true),
        new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), timeoutMs)),
      ]);

      setMotionAssetProgress(null);
      return finished;
    },
    [preloadMotionSlideImages]
  );

  // The script's own parts, in speaking order — the canonical list every
  // slide is matched against, and the list that decides which parts have no
  // image at all. Shared by the silent auto-reorder on upload and by the Fix
  // Order modal.
  const motionScriptSegments = useMemo(
    () =>
      deriveScriptSegments({
        manifestLines: extractManifestLines(motionManifestText),
        transcript: motionTranscript,
        hintCount: motionSlides.length,
      }),
    [motionTranscript, motionManifestText, motionSlides.length]
  );

  const clearMotionTimeline = useCallback(() => {
    setMotionTimeline(null);
    setMotionTimelineReport(null);
    setMotionTimelineText("");
    setMotionAutoSyncReport(null);
    setMotionAutoSyncNote(null);
    setMotionDoc(null);
    motionUndoRef.current = [];
    motionRedoRef.current = [];
    motionTimeRef.current = 0;
    motionClockOriginRef.current = performance.now();
    setMotionTimeMs(0);
  }, []);

  /**
   * Images → decomposed slides. Shared by the batch upload below and by the
   * Fix Order modal.
   */
  const decomposeMotionFiles = useCallback(
    async (
      files: File[],
      strength: DecompositionStrength,
      onProgress?: (done: number, total: number) => void
    ): Promise<{ slides: MotionSlide[]; failures: string[] }> => {
      // Chunked, not one giant request — every layer comes back from python as
      // a base64 PNG before the route moves it to R2.
      const CHUNK_SIZE = 6;
      const failures: string[] = [];
      const slides: MotionSlide[] = [];
      const stamp = Date.now();

      for (let offset = 0; offset < files.length; offset += CHUNK_SIZE) {
        const chunk = files.slice(offset, offset + CHUNK_SIZE);

        const form = new FormData();
        chunk.forEach((f) => form.append("images", f, f.name));
        form.append("strength", strength);

        const res = await fetch("/api/content-creator/motion-segment", {
          method: "POST",
          body: form,
        });
        const payload = await res.json();

        if (!res.ok) {
          const reason = payload?.error || `Decomposition failed (${res.status})`;
          // A later chunk failing must not throw away the posters that already
          // decomposed — record it and keep what we have.
          if (slides.length === 0 && offset + CHUNK_SIZE >= files.length) throw new Error(reason);
          failures.push(`Images ${offset + 1}–${offset + chunk.length}: ${reason}`);
          continue;
        }

        const results: any[] = Array.isArray(payload?.results) ? payload.results : [payload];

        results.forEach((data, i) => {
          const name = chunk[i]?.name || `Image ${offset + i + 1}`;
          if (!data || data.error || !data.success) {
            failures.push(`${name}: ${data?.error || "no result"}`);
            return;
          }

          const layers: MotionLayer[] = data.layers || [];
          const slide: MotionSlide = {
            slideId: `slide_${stamp}_${offset + i}_${Math.random().toString(36).slice(2, 7)}`,
            fileName: name,
            backgroundUrl: data.backgroundUrl,
            originalUrl: data.originalUrl,
            layers,
            activeLayerId: layers[0]?.id,
            width: data.width,
            height: data.height,
            sourceWidth: data.sourceWidth,
            sourceHeight: data.sourceHeight,
            text: data.text,
            meta: data.meta,
          };
          slides.push(slide);
          preloadMotionSlideImages(slide);
        });

        onProgress?.(Math.min(offset + chunk.length, files.length), files.length);
      }

      return { slides, failures };
    },
    [preloadMotionSlideImages]
  );

  /** Per-slot upload from the Fix Order modal — decompose only, no state reset. */
  const handleDecomposeForSlot = useCallback(
    async (files: File[]): Promise<MotionSlide[]> => {
      // Deliberately not re-asking: a slide dropped into a gap has to match the
      // slides beside it, so it is cut at the strength this batch already used.
      const { slides: added } = await decomposeMotionFiles(files, motionStrength);
      return added;
    },
    [decomposeMotionFiles, motionStrength]
  );

  /** Picking images only queues them — the strength modal decides what happens next. */
  const handleMotionFilesUpload = (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (fileArray.length === 0) return;
    setPendingMotionFiles(fileArray);
  };

  const runMotionDecomposition = async (fileArray: File[], strength: DecompositionStrength) => {
    const MAX_BATCH = 50;
    const batch = fileArray.slice(0, MAX_BATCH);

    setIsSegmenting(true);
    setSegmentError(
      fileArray.length > MAX_BATCH
        ? `Processing the first ${MAX_BATCH} of ${fileArray.length} images — upload the rest in a second batch.`
        : null
    );
    setSegmentProgress({ done: 0, total: batch.length });
    // A fresh upload is a new workflow, not a continuation of whatever was
    // loaded before.
    setActiveHistoryId(null);
    // Element ids are per-decomposition, so a timeline written against the
    // previous batch addresses layers that no longer exist.
    clearMotionTimeline();

    try {
      // Progress counts images attempted, not images that survived, so the
      // bar still reaches the end when one poster fails.
      const { slides, failures } = await decomposeMotionFiles(batch, strength, (done, total) =>
        setSegmentProgress({ done, total })
      );

      if (slides.length === 0) {
        throw new Error(failures[0] || "No image could be decomposed");
      }

      // Auto-order from each slide's own caption, whenever a script is loaded
      // to match against. See matchSlideOrderToScript.
      const uploadOrder = slides;
      let orderedSlides = slides;
      const scriptMatch =
        motionScriptSegments.segments.length > 0
          ? matchSlideOrderToScript(slides, motionScriptSegments.segments)
          : null;
      if (scriptMatch) {
        orderedSlides = scriptMatch.order.map((i) => slides[i]);
        setMotionOrderNotice({
          message:
            `Reordered ${orderedSlides.length} slide${orderedSlides.length === 1 ? "" : "s"} to match the script.` +
            (scriptMatch.missingCount > 0
              ? ` ${scriptMatch.missingCount} part${scriptMatch.missingCount === 1 ? "" : "s"} of the script still ${
                  scriptMatch.missingCount === 1 ? "has" : "have"
                } no image — open Fix Order to see which.`
              : ""),
          previousOrder: uploadOrder,
        });
      } else {
        setMotionOrderNotice(null);
      }

      setMotionSlides(orderedSlides);
      setActiveMotionIndex(0);
      setJsonText(JSON.stringify(buildMotionLayoutJson(orderedSlides), null, 2));

      const decodeFailureMsg = failures.length > 0 ? `${failures.length} image(s) failed: ${failures.join("; ")}` : null;

      // Decomposition is destructive to whatever was on screen before it, so
      // it must be persisted the moment it succeeds. Saved in the (possibly
      // script-reordered) orderedSlides sequence, not the raw upload order.
      const firstName = orderedSlides[0]?.fileName?.replace(/\.[^.]+$/, "");
      const title = orderedSlides.length > 1 ? `Motion Video · ${orderedSlides.length} slides` : (firstName || "Motion Video");
      const previewUrl = orderedSlides[0]?.backgroundUrl || orderedSlides[0]?.originalUrl;
      const createdId = await saveToHistory(
        "motion-video",
        title,
        orderedSlides.length,
        { slides: orderedSlides, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme },
        null,
        previewUrl
      );

      if (createdId) {
        setActiveHistoryId(createdId);
        setSegmentError(decodeFailureMsg);
      } else {
        setSegmentError(
          [decodeFailureMsg, "Decomposed successfully, but saving to History failed — use Save manually."]
            .filter(Boolean)
            .join(" ")
        );
      }
    } catch (err: any) {
      console.error("Failed to decompose image(s):", err);
      setSegmentError(err?.message || "Failed to decompose image(s)");
    } finally {
      setIsSegmenting(false);
      setSegmentProgress(null);
    }
  };

  /**
   * Strips a Grok Imagine watermark from every slide currently loaded.
   *
   * A fresh upload already gets this automatically as part of decomposing —
   * this button exists for slides that were decomposed before that pass
   * existed.
   */
  const handleRemoveAllWatermarks = async () => {
    if (motionSlides.length === 0) return;

    type WatermarkTarget = { slideIndex: number; field: "backgroundUrl" | "originalUrl"; url: string; name: string };
    const targets: WatermarkTarget[] = [];
    motionSlides.forEach((slide, slideIndex) => {
      const base = slide.fileName?.replace(/\.[^.]+$/, "") || `slide_${slideIndex + 1}`;
      if (slide.backgroundUrl) {
        targets.push({ slideIndex, field: "backgroundUrl", url: slide.backgroundUrl, name: `${base}_bg.png` });
      }
      // Cleaned independently — a slide from before the auto-strip pass can
      // carry the watermark in either or both.
      if (slide.originalUrl && slide.originalUrl !== slide.backgroundUrl) {
        targets.push({ slideIndex, field: "originalUrl", url: slide.originalUrl, name: `${base}_orig.png` });
      }
    });
    if (targets.length === 0) return;

    setIsRemovingWatermarks(true);
    setWatermarkError(null);
    setWatermarkProgress({ done: 0, total: targets.length });

    const CHUNK_SIZE = 6;
    const next = [...motionSlides];
    const changedSlideIndexes = new Set<number>();
    const failures: string[] = [];
    let removedCount = 0;

    try {
      for (let offset = 0; offset < targets.length; offset += CHUNK_SIZE) {
        const chunk = targets.slice(offset, offset + CHUNK_SIZE);

        // Slide images live behind same-origin proxy URLs by this point, so
        // re-fetching them as blobs to re-upload is a same-origin read.
        const blobs = await Promise.all(
          chunk.map(async (t) => {
            const res = await fetch(t.url);
            if (!res.ok) throw new Error(`Could not re-fetch ${t.name} (${res.status})`);
            return res.blob();
          })
        );

        const form = new FormData();
        chunk.forEach((t, i) => form.append("images", blobs[i], t.name));

        const res = await fetch("/api/content-creator/remove-watermark", { method: "POST", body: form });
        const payload = await res.json();

        if (!res.ok) {
          failures.push(`Images ${offset + 1}–${offset + chunk.length}: ${payload?.error || `Watermark removal failed (${res.status})`}`);
          setWatermarkProgress({ done: Math.min(offset + chunk.length, targets.length), total: targets.length });
          continue;
        }

        const results: any[] = Array.isArray(payload?.results) ? payload.results : [payload];
        results.forEach((data, i) => {
          const t = chunk[i];
          if (!t || !data || data.error || !data.success) {
            failures.push(`${t?.name || "image"}: ${data?.error || "no result"}`);
            return;
          }
          if (data.watermarkRemoved && data.imageUrl) {
            const slide = next[t.slideIndex];
            let updatedLayers = slide.layers;
            if (Array.isArray(updatedLayers) && updatedLayers.length > 0) {
              const rBox = data.removedBox;
              updatedLayers = updatedLayers.filter((layer: any) => {
                if (layer.text && /grok|qrok|gr0k|crok|watermark|x\.ai/i.test(layer.text)) {
                  return false;
                }
                const lbox = layer.box;
                if (rBox && lbox) {
                  const lx = Array.isArray(lbox) ? lbox[0] : lbox.x;
                  const ly = Array.isArray(lbox) ? lbox[1] : lbox.y;
                  const lw = Array.isArray(lbox) ? lbox[2] : (lbox.w || lbox.width);
                  const lh = Array.isArray(lbox) ? lbox[3] : (lbox.h || lbox.height);
                  if (typeof lx === "number" && typeof ly === "number" && typeof lw === "number" && typeof lh === "number") {
                    const interX0 = Math.max(lx, rBox.left);
                    const interY0 = Math.max(ly, rBox.top);
                    const interX1 = Math.min(lx + lw, rBox.left + rBox.width);
                    const interY1 = Math.min(ly + lh, rBox.top + rBox.height);
                    if (interX1 > interX0 && interY1 > interY0) {
                      const interArea = (interX1 - interX0) * (interY1 - interY0);
                      if (interArea > 0.05 * (lw * lh)) return false;
                    }
                  }
                }
                return true;
              });
            }
            next[t.slideIndex] = { ...slide, [t.field]: data.imageUrl, layers: updatedLayers };
            changedSlideIndexes.add(t.slideIndex);
            removedCount += 1;
          }
        });

        setWatermarkProgress({ done: Math.min(offset + chunk.length, targets.length), total: targets.length });
      }

      if (changedSlideIndexes.size > 0) {
        setMotionSlides(next);
        await Promise.all(Array.from(changedSlideIndexes).map((i) => preloadMotionSlideImages(next[i])));
      }

      setWatermarkError(
        failures.length > 0
          ? `${failures.length} issue(s): ${failures.join("; ")}`
          : removedCount === 0
          ? "No Grok watermark found on any slide."
          : null
      );

      if (changedSlideIndexes.size > 0 && activeHistoryId) {
        setMotionSaveState("saving");
        const firstName = next[0]?.fileName?.replace(/\.[^.]+$/, "");
        const title = next.length > 1 ? `Motion Video · ${next.length} slides` : firstName || "Motion Video";
        const id = await saveToHistory(
          "motion-video",
          title,
          next.length,
          { slides: next, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme },
          activeHistoryId,
          next[0]?.backgroundUrl || next[0]?.originalUrl
        );
        setMotionSaveState(id ? "saved" : "error");
      }
    } catch (err: any) {
      console.error("Failed to remove watermarks:", err);
      setWatermarkError(err?.message || "Failed to remove watermarks");
    } finally {
      setIsRemovingWatermarks(false);
      setWatermarkProgress(null);
    }
  };

  return {
    motionSlides, setMotionSlides,
    activeMotionIndex, setActiveMotionIndex,
    isSegmenting, setIsSegmenting,
    segmentProgress, setSegmentProgress,
    pendingMotionFiles, setPendingMotionFiles,
    motionStrength, setMotionStrength,
    segmentError, setSegmentError,
    isRemovingWatermarks, watermarkProgress, watermarkError,
    isPlayingMotion, setIsPlayingMotion,
    motionTimeMs, setMotionTimeMs,
    isRecordingVideo, setIsRecordingVideo,
    motionFileInputRef, motionAnimFrameRef, motionLayerImgElsRef,
    motionOverlayVideoElsRef, motionOverlayUrlsRef,
    motionOverlayVideoVersion,
    motionAssetJobsRef, motionAssetVersion, motionAssetProgress,
    copiedMotionJson, setCopiedMotionJson,
    motionTimelineText, setMotionTimelineText,
    motionTimeline, setMotionTimeline,
    motionTimelineReport, setMotionTimelineReport,
    motionLoop, setMotionLoop,
    motionTranscript, setMotionTranscript,
    motionTranscriptName, setMotionTranscriptName,
    motionTranscriptNote, setMotionTranscriptNote,
    motionManifestText, setMotionManifestText,
    motionManifestNote, setMotionManifestNote,
    motionManifestWarnings, setMotionManifestWarnings,
    motionAutoSyncReport, setMotionAutoSyncReport,
    motionAutoSyncNote, setMotionAutoSyncNote,
    motionTextOnlySync, setMotionTextOnlySync,
    motionIntroCard, setMotionIntroCard,
    motionCaptions, setMotionCaptions,
    motionCaptionPosition, setMotionCaptionPosition,
    motionCaptionBgOpacity, setMotionCaptionBgOpacity,
    motionCaptionLeadMs, setMotionCaptionLeadMs,
    motionOverlayUploadState, setMotionOverlayUploadState,
    motionOverlayUploadError, setMotionOverlayUploadError,
    motionHideImageCaptions, setMotionHideImageCaptions,
    motionPaperCutStyle, setMotionPaperCutStyle,
    motionWholeImageMotion, setMotionWholeImageMotion,
    motionZigzagMotion, setMotionZigzagMotion,
    motionZoneBorder, setMotionZoneBorder,
    motionMinimalMode, setMotionMinimalMode,
    motionSfxEnabled, setMotionSfxEnabled,
    motionSfxVolume, setMotionSfxVolume,
    copiedSpeechPrompt, setCopiedSpeechPrompt,
    showFixSlideOrderModal, setShowFixSlideOrderModal,
    motionOrderNotice, setMotionOrderNotice,
    motionDoc, setMotionDoc,
    motionUndoRef, motionRedoRef,
    motionHistoryTick, setMotionHistoryTick,
    motionSaveState, setMotionSaveState,
    motionSaveTimerRef,
    motionAudioName, setMotionAudioName,
    motionAudioR2Url, setMotionAudioR2Url,
    motionMusicName, setMotionMusicName,
    motionMusicR2Url, setMotionMusicR2Url,
    motionCsvR2Url, setMotionCsvR2Url,
    motionTranscriptRawText, setMotionTranscriptRawText,
    motionMusicVolume, setMotionMusicVolume,
    motionExportSpeed, setMotionExportSpeed,
    copiedMotionPrompt, setCopiedMotionPrompt,
    isExportingTimeline, setIsExportingTimeline,
    timelineExportElapsed, setTimelineExportElapsed,
    motionTimeRef, motionClockOriginRef, motionLoopRef,
    motionLastSceneIndexRef, motionZoneVisibleRef, motionZoneSeededSceneRef, motionZoneFlourishRef,
    motionCurrentZoneVisibleRef, motionCurrentZoneIdRef, motionCurrentZoneSceneRef,
    motionMinimalPrevZoneIdRef,
    motionAudioRef, motionAudioUrlRef, motionAudioR2UrlRef,
    motionMusicRef, motionMusicUrlRef, motionMusicR2UrlRef,
    motionCsvR2UrlRef, motionTranscriptRawTextRef, motionSpeedRef, motionMixRef,
    motionHooks, motionHookEnabled, setMotionHookEnabled,
    motionSelectedHookId, setMotionSelectedHookId,
    isHookPhasePlaying, setIsHookPhasePlaying,
    hookUploadState, hookUploadError,
    motionHookVideoRef, motionHookUrlRef,
    refreshMotionHooks, handleUploadHook, handleDeleteHook,
    motionData, activeMotionSlideId, setMotionData,
    isDraggingMotionLayer, setIsDraggingMotionLayer, motionLayerDragStateRef,
    handleStartMotionLayerDrag,
    ensureMotionMix, seekMotionTo,
    loadMotionImage, preloadMotionSlideImages, ensureMotionAssets,
    motionScriptSegments,
    clearMotionTimeline,
    decomposeMotionFiles, handleDecomposeForSlot, handleMotionFilesUpload, runMotionDecomposition,
    handleRemoveAllWatermarks,
  };
}

export type MotionCoreState = ReturnType<typeof useMotionCore>;
