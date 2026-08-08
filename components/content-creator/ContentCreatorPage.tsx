"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { uploadMotionAssetToR2 } from "@/lib/motion-assets";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  Download,
  Code2,
  RefreshCw,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  ImagePlus,
  Layers2,
  Palette,
  Sliders,
  Edit3,
  Plus,
  Trash2,
  Bot,
  Sparkles,
  Loader2,
  ChevronDown,
  Upload,
  History,
  Save,
  CheckSquare,
  Square,
  ListChecks,
  Move,
  ZoomIn,
  Lightbulb,
  BookOpen,
  Calendar,
  ClipboardCopy,
  Eye,
  EyeOff,
  Star,
  Clapperboard,
  Wand2,
  LayoutGrid,
  GripVertical,
  Copy,
  Shuffle,
  Eraser,
} from "lucide-react";

import type {
  PosterData,
  AnalysisData,
  NewsItem,
  CreatorMode,
  MotionVideoData,
  MotionLayer,
  MotionSlide,
  MotionTextBlock,
  DecompositionStrength,
  LogoPosition,
  AspectRatio,
  HistoryListItem,
  PosterColors,
  PosterConfig,
  PosterElement,
  HookVideoEntry,
} from "./types";
import {
  RATIOS,
  COLOR_PRESETS,
  GRADIENT_PRESETS,
  EMPTY_ANALYSIS,
  EMPTY_INDICATOR,
  EMPTY_MOTION_DATA,
} from "./constants";
import { buildInstagramCopyText } from "./promptBuilders";
import { buildLeanMotionLayout, buildMotionLayoutJson, describeMotionSlide } from "./motionLayoutJson";
import {
  buildBentoCard,
  withBentoImageFallback,
  parsePastedAiJson,
  importAiJson,
} from "./newsJsonImport";
import { compressImage, runWithConcurrency } from "./imageUtils";
import { WebImageSearch } from "./WebImageSearch";
import { parseJsonResponse } from "./apiUtils";
import { drawPoster } from "./canvas/drawPoster";
import { drawMotionTimelineFrame } from "./canvas/drawMotionTimelineFrame";
import { MotionTimelinePanel } from "./motion/MotionTimelinePanel";
import { TimelineEditor } from "./motion/TimelineEditor";
import {
  autoSyncTimeline,
  buildTimelineFromManifest,
  parseMotionTimeline,
  parseSyncManifest,
  extractManifestLines,
  sampleTimeline,
  wordAt,
  parseLooseJson,
  playTransitionSfx,
  playAudioFile,
  DEFAULT_TRANSITION_AUDIO_MAP,
  type AudioSfxType,
  type AuthoredTimeline,
  type AutoSyncReport,
  type CompiledTimeline,
  type TimelineReport,
  type TranscriptWord,
} from "@/lib/motion-timeline";
// Straight from the leaf module rather than the barrel: this one is reached on
// every transcript load, and a barrel re-export of it was the kind of thing
// Turbopack kept serving a stale export list for.
import { parseTranscriptFile } from "@/lib/motion-timeline/transcript";
import { toAuthored, toEditable, type EditableTimeline } from "@/lib/motion-timeline/edit";
import { MOTION_TIMELINE_TEMPLATE } from "@/lib/prompt-templates/motion-timeline-template";
import { SPEECH_BREAKDOWN_TEMPLATE } from "@/lib/prompt-templates/speech-breakdown-template";
import { computeCoverFitSlack, getAntonFontFamily, drawVideoCover } from "./canvas/canvasUtils";
import type { SentimentScheme } from "./canvas/canvasUtils";
import { SampleJsonModal } from "./modals/SampleJsonModal";
import { ShowPromptModal } from "./modals/ShowPromptModal";
import { PromptModal } from "./modals/PromptModal";
import { HistoryModal } from "./modals/HistoryModal";
import { PosterSelectionModal } from "./modals/PosterSelectionModal";
import { ContentCalendarModal } from "./modals/ContentCalendarModal";
import { CopyButton } from "./modals/CopyButton";
import { FixSlideOrderModal } from "./modals/FixSlideOrderModal";
import { DecompositionStrengthModal } from "./modals/DecompositionStrengthModal";
import { matchSlideOrderToScript } from "./slideOrder";
import { deriveScriptSegments } from "./scriptSegments";
import { ReelStudioModal } from "./reel/ReelStudioModal";
import { REEL_W, REEL_H, type ReelSlideSource } from "./reel/reelTypes";
import { PromptBuilder } from "./prompt-builder/PromptBuilder";

// Reels are consumed full-screen while scrolling and need to read at a
// glance — bump headline/eyebrow/body text (and, since every measurement in
// the draw functions flows through the same scale factor, the padding/gutter
// breathing room around them) well above the static-poster baseline. This
// only ever reaches drawPoster's reel-only `textScale` param (default 1
// everywhere else), so normal posters/downloads are completely unaffected.
const REEL_TEXT_SCALE = 1.45;

/**
 * MP4 only, by preference order.
 *
 * The export used to be WebM, which is not what social platforms, Premiere or
 * a phone's camera roll expect. MediaRecorder can produce H.264/AAC in an MP4
 * container directly, so no transcode is involved — but only on browsers that
 * ship the encoder, hence the probe and the explicit failure rather than a
 * silent fall back to a container nobody asked for.
 */
const MP4_MIME_CANDIDATES = [
  // High Profile first, then Main, then Baseline: at the same bitrate the
  // extra encoding tools (CABAC, B-frames) buy visibly better quality, and a
  // poster full of flat colour and hard type is exactly where blocking shows.
  // Same ordering the Reel Studio exporter settled on.
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1.4d0028,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

export function ContentCreatorPage() {
  const [creatorMode, setCreatorMode] = useState<CreatorMode>("analysis");
  // News/Facts/Learnings/Watermark all store their batch as an array in `newsData` and
  // share the carousel/download/editor plumbing below — "indicator" and
  // "analysis" are the odd ones out, each with a single object.
  const isBatchMode = creatorMode === "news" || creatorMode === "facts" || creatorMode === "learnings" || creatorMode === "watermark";
  const [ratioId, setRatioId] = useState("square");

  // Keep track of JSON states independently so switching modes doesn't lose modifications
  const [analysisData, setAnalysisData] = useState<AnalysisData>(EMPTY_ANALYSIS);
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [parsedData, setParsedData] = useState<PosterData>(EMPTY_INDICATOR);
  const [activeNewsIndex, setActiveNewsIndex] = useState(0);

  // Logo Watermark mode state
  const [watermarkPosition, setWatermarkPosition] = useState<LogoPosition>("top-right");
  const [watermarkStratiColor, setWatermarkStratiColor] = useState("#000000");
  const [watermarkXColor, setWatermarkXColor] = useState("#EF4444");
  const [watermarkBgStyle, setWatermarkBgStyle] = useState<"glass" | "light" | "dark" | "none" | "solid">("none");
  const [watermarkScale, setWatermarkScale] = useState(1.0);
  const [swapFromIndex, setSwapFromIndex] = useState<number>(0);
  const [swapToIndex, setSwapToIndex] = useState<number>(1);
  const [showGridView, setShowGridView] = useState(false);
  const [isDraggingCanvasOver, setIsDraggingCanvasOver] = useState(false);
  const [draggedGridItemIndex, setDraggedGridItemIndex] = useState<number | null>(null);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const logoDragStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startLogoX: number;
    startLogoY: number;
    badgeW: number;
    badgeH: number;
    moved: boolean;
    liveCustomX: number;
    liveCustomY: number;
  } | null>(null);
  const watermarkFileInputRef = useRef<HTMLInputElement>(null);

  // Motion Video mode state & refs
  //
  // A batch upload becomes one slide per image. `motionData` is just a view of
  // the active slide, so every existing setMotionData(...) call site keeps
  // working while the other slides stay untouched in state.
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
  /** URL → in-flight (or settled) decode job, so an asset loads exactly once. */
  const motionAssetJobsRef = useRef<Map<string, Promise<void>>>(new Map());
  /** Bumped as each image becomes paint-ready, purely to trigger a repaint. */
  const [motionAssetVersion, setMotionAssetVersion] = useState(0);
  const [motionAssetProgress, setMotionAssetProgress] = useState<{ done: number; total: number } | null>(null);
  const [copiedMotionJson, setCopiedMotionJson] = useState(false);

  // AI Timeline — audio-synced choreography.
  //
  // Without one, motion mode animates procedurally off a free-running clock
  // and can only loop. With one applied, every element's state at time t comes
  // from the timeline instead, which is what makes the result line up with a
  // voiceover word for word.
  const [motionTimelineText, setMotionTimelineText] = useState("");
  const [motionTimeline, setMotionTimeline] = useState<CompiledTimeline | null>(null);
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
  // slide into "paper mode" (lib/motion-timeline/autosync.ts · buildScene) —
  // they land together at the scene's start rather than being paced across it,
  // which is honest for an object with nothing quotable about it. Collage parts
  // are unaffected either way: a part prints its own caption, so it always
  // enters on the CSV row where that caption is spoken (see isQuotable and
  // locateSpokenLine).
  const [motionTextOnlySync, setMotionTextOnlySync] = useState(false);
  // Open on a black title card over the recap; burn word-by-word captions.
  const [motionIntroCard, setMotionIntroCard] = useState(false);
  const [motionCaptions, setMotionCaptions] = useState(false);
  // Off by default: paints over each collage-part's own baked-in caption
  // strip at render time. The strip's words are still what auto-sync reads
  // for timing — this only changes what gets drawn on top of it, on export
  // exactly as in the live preview. See hideImageCaptions in
  // drawMotionTimelineFrame.ts.
  const [motionHideImageCaptions, setMotionHideImageCaptions] = useState(false);
  // Off by default: white "cut paper" margin + staggered drop-in on every
  // collage-part layer. See lib/motion-timeline/cues.ts · paperDropIn and
  // compile.ts's synthesis step for a part nobody hand-choreographed.
  const [motionPaperCutStyle, setMotionPaperCutStyle] = useState(false);
  // On by default: decomposed parts hold their rest position/scale/rotation
  // and only the camera pans/zooms, so a collage reads as one photo instead
  // of its cut-out pieces drifting apart. See drawMotionTimelineFrame.ts.
  const [motionWholeImageMotion, setMotionWholeImageMotion] = useState(true);
  // On by default: every graphic (non-text) layer gets a small continuous
  // in-place rotational shake. See zigzagWobbleDeg in drawMotionTimelineFrame.ts.
  const [motionZigzagMotion, setMotionZigzagMotion] = useState(true);
  // Owned here rather than inside MotionTimelinePanel because the auto-trigger
  // that reads these lives in the render effect below, next to the sampled
  // frame it detects scene- and zone-appearances from.
  const [motionSfxEnabled, setMotionSfxEnabled] = useState(true);
  const [motionSfxVolume, setMotionSfxVolume] = useState(0.65);
  const [copiedSpeechPrompt, setCopiedSpeechPrompt] = useState(false);
  // Post-decomposition: re-sorts a shuffled batch by each poster's own
  // printed slide number. See components/content-creator/slideOrder.ts.
  const [showFixSlideOrderModal, setShowFixSlideOrderModal] = useState(false);
  // Post-decomposition, caption-based: re-sorts a shuffled batch by locating
  // each slide's own caption inside the pasted script or a loaded transcript.
  // Independent of the badge path above — see slideOrder.ts · matchSlideOrderToScript.
  const [motionOrderNotice, setMotionOrderNotice] = useState<{ message: string; previousOrder: MotionSlide[] } | null>(null);

  /**
   * The editable document.
   *
   * Playback runs on the compiled timeline, which cannot be edited — cues have
   * already become keyframes by then. So the editor owns an authored-shape
   * document, and every edit re-serialises and re-compiles it. That keeps one
   * source of truth: the JSON in the textarea, the timeline on screen and the
   * record in the database are always the same thing.
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
   * Scene- and zone-appearance SFX bookkeeping for the render effect below.
   *
   * `motionZoneVisibleRef` mirrors last frame's opacity*wipe > threshold per
   * layer id, so an entrance is "the moment it crosses up through that", not
   * "every frame it happens to be visible". `motionZoneSeededSceneRef` guards
   * against firing that crossing for every layer at once the instant a seek
   * (or a fresh play) lands mid-scene, when several layers are already on
   * screen — the map is re-seeded from whatever is already visible, silently,
   * the first frame a given scene index is seen, and only a crossing on a
   * later frame counts as a real entrance.
   */
  const motionLastSceneIndexRef = useRef<number>(-1);
  const motionZoneVisibleRef = useRef<Record<string, boolean>>({});
  const motionZoneSeededSceneRef = useRef<number>(-1);
  /** layer id → the timeline ms its entrance was last detected at, for the brief on-entrance glow in drawMotionTimelineFrame. */
  const motionZoneFlourishRef = useRef<Record<string, number>>({});
  /**
   * Independent of the SFX bookkeeping above (which goes silent while paused
   * or muted) — this drives the always-on black rotating border + diagonal
   * shine on whichever single zone last appeared (drawActiveZoneOverlay), so
   * it renders identically whether the editor is playing, paused or being
   * scrubbed, and in the export. `motionCurrentZoneVisibleRef` mirrors last
   * frame's visibility per layer for crossing detection, exactly like
   * motionZoneVisibleRef above but computed unconditionally every frame.
   */
  const motionCurrentZoneVisibleRef = useRef<Record<string, boolean>>({});
  const motionCurrentZoneIdRef = useRef<string | null>(null);
  const motionCurrentZoneSceneRef = useRef<number>(-1);
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
   * once: the speakers, and a MediaStream the recorder can capture. That second
   * destination is the only way to get *both* sources into one exported audio
   * track — `captureStream()` on an element yields that element alone, which is
   * why music could never have reached the file without this.
   *
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
   * public/hooks/hooks.json plays before the real motion video — in both
   * live preview and the exported file, see playHookPhase below. hooks.json
   * itself is a plain static file (no database); uploads/deletes go through
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
   * are built — `document.createElement`, never attached to the DOM, since
   * drawImage and createMediaElementSource both work fine on a detached
   * element — rather than as JSX.
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
    if (creatorMode !== "motion") return;
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

  const handleWatermarkFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const promises = fileArray.map((file) => {
      return new Promise<NewsItem>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            title: file.name.replace(/\.[^/.]+$/, ""),
            description: "",
            imageUrl: e.target?.result as string,
            logoPosition: watermarkPosition,
            stratiColor: watermarkStratiColor,
            xColor: watermarkXColor,
            watermarkBgStyle: watermarkBgStyle,
            logoScale: watermarkScale,
            imageFocusX: 0.5,
            imageFocusY: 0.5,
            imageZoom: 1,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises).then((newItems) => {
      setNewsData((prev) => {
        const next = [...prev, ...newItems];
        setTimeout(() => setJsonText(JSON.stringify(next, null, 2)), 50);
        return next;
      });
      setActiveNewsIndex((prevIndex) => (prevIndex >= 0 ? prevIndex : 0));
    });
  };

  const handleSwapIndices = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx < 0 ||
      fromIdx >= newsData.length ||
      toIdx < 0 ||
      toIdx >= newsData.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const next = [...newsData];
    const temp = next[fromIdx];
    next[fromIdx] = next[toIdx];
    next[toIdx] = temp;
    setNewsData(next);
    setJsonText(JSON.stringify(next, null, 2));
    setActiveNewsIndex(toIdx);
  };

  const handleMoveIndex = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    handleSwapIndices(index, target);
  };

  const handleSetWatermarkPosition = (pos: LogoPosition, applyToAll = false) => {
    setWatermarkPosition(pos);
    if (applyToAll || newsData.length === 0) {
      const next = newsData.map((item) => ({ ...item, logoPosition: pos }));
      setNewsData(next);
      if (next.length > 0) setJsonText(JSON.stringify(next, null, 2));
    } else if (newsData[activeNewsIndex]) {
      const next = [...newsData];
      next[activeNewsIndex] = { ...next[activeNewsIndex], logoPosition: pos };
      setNewsData(next);
      setJsonText(JSON.stringify(next, null, 2));
    }
  };

  const handleSetWatermarkColors = (strati: string, xColorVal: string, applyToAll = false) => {
    setWatermarkStratiColor(strati);
    setWatermarkXColor(xColorVal);
    if (applyToAll || newsData.length === 0) {
      const next = newsData.map((item) => ({ ...item, stratiColor: strati, xColor: xColorVal }));
      setNewsData(next);
      if (next.length > 0) setJsonText(JSON.stringify(next, null, 2));
    } else if (newsData[activeNewsIndex]) {
      const next = [...newsData];
      next[activeNewsIndex] = {
        ...next[activeNewsIndex],
        stratiColor: strati,
        xColor: xColorVal,
      };
      setNewsData(next);
      setJsonText(JSON.stringify(next, null, 2));
    }
  };

  const handleApplyAllWatermarkSettingsToBatch = () => {
    const next = newsData.map((item) => ({
      ...item,
      logoPosition: watermarkPosition,
      stratiColor: watermarkStratiColor,
      xColor: watermarkXColor,
      watermarkBgStyle: watermarkBgStyle,
      logoScale: watermarkScale,
    }));
    setNewsData(next);
    setJsonText(JSON.stringify(next, null, 2));
  };

  // ── Bento explainer visibility + per-item ZIP selection ───────────────────
  // hideBento drops every isBento card from the preview carousel, its page
  // counter/dots, and the ZIP export — without touching newsData itself, so
  // editing/history/JSON-tab round-tripping still sees the full batch.
  const [hideBento, setHideBento] = useState(false);
  // Indices (into newsData) explicitly unchecked by the user — everything is
  // included by default. Unchecking an item now removes it from the preview
  // carousel/counter/dots AND the ZIP alike; it only ever removes items, it
  // never adds ones hideBento already excludes.
  const [deselectedForZip, setDeselectedForZip] = useState<Set<number>>(new Set());

  // The full "selectable" set after only the hideBento filter — this is what
  // the Quick Item List renders (so a deselected item stays visible there,
  // checkbox and all, for the user to re-include).
  const bentoFilteredIndices = useMemo(
    () => newsData.reduce<number[]>((acc, item, i) => {
      if (!hideBento || !item.isBento) acc.push(i);
      return acc;
    }, []),
    [newsData, hideBento]
  );

  // What actually renders in the preview carousel (canvas, counter, dots,
  // prev/next) and ships in the ZIP: bento-filtered AND not unchecked.
  const visibleNewsIndices = useMemo(
    () => bentoFilteredIndices.filter((i) => !deselectedForZip.has(i)),
    [bentoFilteredIndices, deselectedForZip]
  );
  const visibleNewsPosition = visibleNewsIndices.indexOf(activeNewsIndex);
  const visibleNewsCount = visibleNewsIndices.length;

  // Unchecking removes an item from the rendering carousel entirely now, so
  // whatever remains visible is by definition what ships in the ZIP.
  const zipIncludedIndices = visibleNewsIndices;

  // If hideBento gets toggled on, an item gets unchecked, or a fresh batch
  // loads while the active card is no longer part of the visible set, jump
  // to the nearest visible card instead of leaving the preview stuck on
  // something the counter/dots no longer count.
  useEffect(() => {
    if (visibleNewsIndices.length === 0) return;
    if (visibleNewsIndices.includes(activeNewsIndex)) return;
    const next = visibleNewsIndices.find((i) => i > activeNewsIndex) ?? [...visibleNewsIndices].reverse().find((i) => i < activeNewsIndex);
    if (next !== undefined) setActiveNewsIndex(next);
  }, [activeNewsIndex, visibleNewsIndices]);

  const goToPrevVisibleNews = () => {
    const pos = visibleNewsIndices.indexOf(activeNewsIndex);
    const target = visibleNewsIndices[Math.max(0, (pos === -1 ? 0 : pos) - 1)];
    if (target !== undefined) setActiveNewsIndex(target);
  };
  const goToNextVisibleNews = () => {
    const pos = visibleNewsIndices.indexOf(activeNewsIndex);
    const target = visibleNewsIndices[Math.min(visibleNewsIndices.length - 1, (pos === -1 ? 0 : pos) + 1)];
    if (target !== undefined) setActiveNewsIndex(target);
  };
  const toggleZipSelection = (idx: number) => {
    setDeselectedForZip((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const selectAllForZip = () => setDeselectedForZip(new Set());
  const deselectAllForZip = () => setDeselectedForZip(new Set(newsData.map((_, i) => i)));

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // On phones the 350px editor panel would eat the entire viewport and leave
  // no room for the canvas preview — start collapsed there so the poster is
  // visible first; desktop/tablet keep the panel open by default.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPanelCollapsed(true);
    }
  }, []);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [downloadingZip, setDownloadingZip] = useState(false);
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  const [candlesData, setCandlesData] = useState<any>(null);
  const [promptSession, setPromptSession] = useState<string>("London");
  const [promptDate, setPromptDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [promptCopied, setPromptCopied] = useState<boolean>(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // ── AI Generate (niche dropdown) ──────────────────────────────────────────
  const [showGenerateMenu, setShowGenerateMenu] = useState(false);
  const [showPromptForCategory, setShowPromptForCategory] = useState<"news" | "facts" | "learnings" | null>(null);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // "Fully Automated" — skips the poster-selection modal for News Batch:
  // every curated story is kept, illustrated, and saved with no review step.
  const [fullyAutomated, setFullyAutomated] = useState(false);
  const [batchMeta, setBatchMeta] = useState<{ timeRangeLabel: string; reportGeneratedAt: string | null } | null>(null);
  // Raw AI-curated batch (20-30 candidates, cover excluded) from the most
  // recent generation — kept separately so the user can revisit the
  // selection modal to change which stories make the final batch without
  // re-calling the AI.
  const [rawBatchCandidates, setRawBatchCandidates] = useState<NewsItem[]>([]);
  const [rawBatchCover, setRawBatchCover] = useState<NewsItem | null>(null);
  const [rawBatchOutro, setRawBatchOutro] = useState<NewsItem | null>(null);
  const [selectedPosterIndices, setSelectedPosterIndices] = useState<Set<number>>(new Set());
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  // Auto image-fill (Pexels) for the cover/chosen stories/outro, fired when
  // the user confirms their selection — see applyPosterSelection below.
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState({ done: 0, total: 0 });

  // Attach a locally generated image (e.g. from Grok Imagine) to the active
  // news poster: clicking the poster's image area or the Upload button opens
  // the OS file picker; the chosen file is inlined as a data URL so the
  // canvas can draw it without any CORS/taint issues.
  const imageFileRef = useRef<HTMLInputElement>(null);

  // ── Content Calendar (30-day News/Learnings/Facts plan) ───────────────────
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // ── Reels (batch posters converted into a 9:16 video slideshow) ──────────
  const [showReelStudio, setShowReelStudio] = useState(false);

  // ── History (saved generations) ───────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);

  const loadHistoryList = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/content-creator/history");
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || "Failed to load history");
      setHistoryItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openHistory = () => {
    setShowHistory(true);
    loadHistoryList();
  };

  // Fire-and-forget save — a failed save should never block the creator flow,
  // so errors are swallowed (surfaced only via a console warning).
  const saveToHistory = async (
    category: HistoryListItem["category"],
    title: string,
    itemCount: number,
    payload: unknown,
    id: string | null = null,
    previewUrl?: string
  ): Promise<string | null> => {
    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/content-creator/history/${id}` : "/api/content-creator/history";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, itemCount, payload, previewUrl }),
      });
      const data = await parseJsonResponse(res);
      if (res.ok && data._id) {
        return data._id;
      }
    } catch (e) {
      console.warn("Failed to save content-creator history:", e);
    }
    return null;
  };

  // Saves the CURRENT style settings (ratio, colors, config, poster style,
  // gradient, theme, fade intensity, highlight-color scheme) as this user's
  // starting point for every future visit — deliberately excludes the
  // poster content itself (newsData/analysisData/etc.), which is what
  // "Save to History" is for.
  const handleSetAsDefault = async () => {
    setDefaultSaveStatus("saving");
    try {
      const settings = { ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme };
      const res = await fetch("/api/content-creator/defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Failed to save defaults");
      setDefaultSaveStatus("saved");
    } catch (e) {
      console.warn("Failed to save content-creator defaults:", e);
      setDefaultSaveStatus("error");
    } finally {
      setTimeout(() => setDefaultSaveStatus("idle"), 2000);
    }
  };

  const handleSaveCurrentToHistory = async () => {
    setSaveStatus("saving");
    try {
      let createdId: string | null = null;
      const firstImg = isBatchMode
        ? newsData[0]?.imageUrl
        : creatorMode === "analysis"
        ? analysisData.imageUrl
        : creatorMode === "motion"
        ? motionSlides[0]?.backgroundUrl || motionSlides[0]?.originalUrl
        : parsedData.imageUrl;
      const previewUrl = firstImg && typeof firstImg === "string" && firstImg.length < 500000 ? firstImg : undefined;

      if (creatorMode === "news") {
        const first = newsData[0];
        const title = newsData.length > 1
          ? `News Batch · ${newsData.length} stories${first?.date ? ` · ${first.date}` : ""}`
          : (first?.title || "News Batch");
        createdId = await saveToHistory("news-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId, previewUrl);
      } else if (creatorMode === "facts") {
        const title = `Facts · ${newsData.length} ${newsData.length === 1 ? "card" : "cards"}`;
        createdId = await saveToHistory("facts-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId, previewUrl);
      } else if (creatorMode === "learnings") {
        const concept = newsData.find((d) => d.concept)?.concept;
        const title = concept ? `Learnings · ${concept}` : "Learnings Batch";
        createdId = await saveToHistory("learnings-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId, previewUrl);
      } else if (creatorMode === "watermark") {
        const title = `Watermark Batch · ${newsData.length} ${newsData.length === 1 ? "image" : "images"}`;
        createdId = await saveToHistory("watermark-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId, previewUrl);
      } else if (creatorMode === "analysis") {
        const title = analysisData.instrument
          ? `${analysisData.instrument} · ${analysisData.levelName || "Daily Analysis"}`
          : "Daily Analysis";
        createdId = await saveToHistory("daily-analysis", title, 1, { analysisData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId, previewUrl);
      } else if (creatorMode === "motion") {
        const firstName = motionSlides[0]?.fileName?.replace(/\.[^.]+$/, "");
        const title = motionSlides.length > 1
          ? `Motion Video · ${motionSlides.length} slides`
          : (firstName || "Motion Video");
        createdId = await saveToHistory(
          "motion-video",
          title,
          motionSlides.length,
          {
            slides: motionSlides,
            timelineText: motionTimelineText,
            manifestText: motionManifestText,
            transcriptText: motionTranscriptRawTextRef.current,
            transcriptCsvUrl: motionCsvR2UrlRef.current,
            audioUrl: motionAudioR2UrlRef.current,
            audioName: motionAudioName,
            musicUrl: motionMusicR2UrlRef.current,
            musicName: motionMusicName,
            musicVolume: motionMusicVolume,
            paperCutStyle: motionPaperCutStyle,
            textOnlySync: motionTextOnlySync,
            wholeImageMotion: motionWholeImageMotion,
            zigzagMotion: motionZigzagMotion,
            hideImageCaptions: motionHideImageCaptions,
            ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme,
          },
          activeHistoryId,
          previewUrl
        );
      } else {
        const title = parsedData.title || parsedData.category || "Indicator Poster";
        createdId = await saveToHistory("indicator", title, 1, { parsedData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId, previewUrl);
      }
      if (createdId) {
        setActiveHistoryId(createdId);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    } catch (e) {
      console.error(e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const loadHistoryEntry = async (id: string) => {
    setHistoryBusyId(id);
    try {
      const res = await fetch(`/api/content-creator/history/${id}`);
      const doc = await parseJsonResponse(res);
      if (!res.ok) throw new Error(doc?.error || "Failed to load entry");

      setActiveHistoryId(id);
      const payload = doc.payload || {};
      if (doc.category === "news-batch" && Array.isArray(payload.posters)) {
        setCreatorMode("news");
        setNewsData(payload.posters);
        setActiveNewsIndex(0);
        setDeselectedForZip(new Set());
        setJsonText(JSON.stringify(payload.posters, null, 2));
      } else if (doc.category === "facts-batch" && Array.isArray(payload.posters)) {
        setCreatorMode("facts");
        setNewsData(payload.posters);
        setActiveNewsIndex(0);
        setDeselectedForZip(new Set());
        setJsonText(JSON.stringify(payload.posters, null, 2));
      } else if (doc.category === "learnings-batch" && Array.isArray(payload.posters)) {
        setCreatorMode("learnings");
        setNewsData(payload.posters);
        setActiveNewsIndex(0);
        setDeselectedForZip(new Set());
        setJsonText(JSON.stringify(payload.posters, null, 2));
      } else if (doc.category === "watermark-batch" && Array.isArray(payload.posters)) {
        setCreatorMode("watermark");
        setNewsData(payload.posters);
        setActiveNewsIndex(0);
        setDeselectedForZip(new Set());
        setJsonText(JSON.stringify(payload.posters, null, 2));
      } else if (doc.category === "daily-analysis" && payload.analysisData) {
        setCreatorMode("analysis");
        setAnalysisData(payload.analysisData);
        setJsonText(JSON.stringify(payload.analysisData, null, 2));
      } else if (doc.category === "motion-video" && Array.isArray(payload.slides)) {
        setCreatorMode("motion");
        const slides: MotionSlide[] = payload.slides;
        slides.forEach(preloadMotionSlideImages);
        setMotionSlides(slides);
        setActiveMotionIndex(0);
        setMotionTimeMs(0);
        motionTimeRef.current = 0;
        setSegmentError(null);
        setJsonText(JSON.stringify(buildMotionLayoutJson(slides), null, 2));

        // The saved timeline is re-compiled against the restored slides rather
        // than trusted, so a payload from an older schema surfaces as a report
        // instead of a broken playhead.
        const savedTimeline = typeof payload.timelineText === "string" ? payload.timelineText : "";
        setMotionTimelineText(savedTimeline);
        setMotionManifestText(typeof payload.manifestText === "string" ? payload.manifestText : "");
        setMotionManifestNote(null);
        setMotionManifestWarnings([]);
        // Restore the editor alongside playback — a project reopened from
        // history has to come back editable, not just watchable.
        motionUndoRef.current = [];
        motionRedoRef.current = [];
        setMotionHistoryTick((t) => t + 1);
        setMotionSaveState("idle");

        // Restore motion settings & toggles
        if (typeof payload.musicVolume === "number") setMotionMusicVolume(payload.musicVolume);
        if (typeof payload.paperCutStyle === "boolean") setMotionPaperCutStyle(payload.paperCutStyle);
        if (typeof payload.textOnlySync === "boolean") setMotionTextOnlySync(payload.textOnlySync);
        if (typeof payload.wholeImageMotion === "boolean") setMotionWholeImageMotion(payload.wholeImageMotion);
        if (typeof payload.zigzagMotion === "boolean") setMotionZigzagMotion(payload.zigzagMotion);
        setMotionHideImageCaptions(typeof payload.hideImageCaptions === "boolean" ? payload.hideImageCaptions : false);

        // Restore CSV voiceover transcript
        const transcriptText = typeof payload.transcriptText === "string" ? payload.transcriptText : null;
        const transcriptCsvUrl = typeof payload.transcriptCsvUrl === "string" ? payload.transcriptCsvUrl : null;
        motionTranscriptRawTextRef.current = transcriptText;
        setMotionTranscriptRawText(transcriptText);
        motionCsvR2UrlRef.current = transcriptCsvUrl;
        setMotionCsvR2Url(transcriptCsvUrl);

        if (transcriptText) {
          const parsed = parseTranscriptFile(transcriptText);
          if (parsed.words.length > 0) {
            setMotionTranscript(parsed.words);
            setMotionTranscriptName("CSV Voiceover");
            setMotionTranscriptNote(`Restored ${parsed.words.length} words from saved Cloudflare video project.`);
          }
        } else if (transcriptCsvUrl) {
          fetch(transcriptCsvUrl)
            .then((r) => r.text())
            .then((rawCsv) => {
              motionTranscriptRawTextRef.current = rawCsv;
              setMotionTranscriptRawText(rawCsv);
              const parsed = parseTranscriptFile(rawCsv);
              if (parsed.words.length > 0) {
                setMotionTranscript(parsed.words);
                setMotionTranscriptName("CSV Voiceover");
                setMotionTranscriptNote(`Restored ${parsed.words.length} words from saved Cloudflare video project.`);
              }
            })
            .catch((err) => console.warn("Could not fetch CSV from R2:", err));
        }

        // Restore Voiceover Audio from Cloudflare R2
        const audioUrl = typeof payload.audioUrl === "string" ? payload.audioUrl : null;
        const audioName = typeof payload.audioName === "string" ? payload.audioName : null;
        if (audioUrl) {
          motionAudioR2UrlRef.current = audioUrl;
          setMotionAudioR2Url(audioUrl);
          setMotionAudioName(audioName || "Voiceover Audio");
          motionAudioUrlRef.current = audioUrl;
          const audio = new Audio(audioUrl);
          audio.preload = "auto";
          motionAudioRef.current = audio;
        } else {
          clearMotionAudio();
        }

        // Restore Background Music from Cloudflare R2
        const musicUrl = typeof payload.musicUrl === "string" ? payload.musicUrl : null;
        const musicName = typeof payload.musicName === "string" ? payload.musicName : null;
        if (musicUrl) {
          motionMusicR2UrlRef.current = musicUrl;
          setMotionMusicR2Url(musicUrl);
          setMotionMusicName(musicName || "Background Music");
          motionMusicUrlRef.current = musicUrl;
          const music = new Audio(musicUrl);
          music.preload = "auto";
          music.loop = true;
          motionMusicRef.current = music;
        } else {
          clearMotionMusic();
        }

        if (savedTimeline.trim()) {
          const { timeline, report } = parseMotionTimeline(savedTimeline, slides, {
            paperCutStyle: typeof payload.paperCutStyle === "boolean" ? payload.paperCutStyle : motionPaperCutStyle,
            textOnlySync: typeof payload.textOnlySync === "boolean" ? payload.textOnlySync : motionTextOnlySync,
          });
          setMotionTimeline(timeline);
          setMotionTimelineReport(report);
          const restoredDoc = parseLooseJson<AuthoredTimeline>(savedTimeline).value;
          setMotionDoc(restoredDoc ? toEditable(restoredDoc, slides.length) : null);
        } else {
          setMotionTimeline(null);
          setMotionTimelineReport(null);
          setMotionDoc(null);
        }
      } else if (payload.parsedData) {
        setCreatorMode("indicator");
        setParsedData(payload.parsedData);
        setJsonText(JSON.stringify(payload.parsedData, null, 2));
      }
      if (payload.ratioId) setRatioId(payload.ratioId);
      if (payload.colors) setColors(payload.colors);
      if (payload.config) setConfig(payload.config);
      setPosterStyle(payload.posterStyle === "bold" ? "bold" : "editorial");
      if (payload.gradientPresetId) setGradientPresetId(payload.gradientPresetId);
      setEditorialTheme(payload.editorialTheme === "dark" ? "dark" : "light");
      setGradientFade(typeof payload.gradientFade === "number" ? payload.gradientFade : 100);
      setSentimentScheme(payload.sentimentScheme === "skyblue" ? "skyblue" : "emerald");
      setJsonError(null);
      setActiveTab("content");
      setShowHistory(false);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to load entry");
    } finally {
      setHistoryBusyId(null);
    }
  };

  const deleteHistoryEntry = async (id: string) => {
    setHistoryBusyId(id);
    try {
      const res = await fetch(`/api/content-creator/history/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await parseJsonResponse(res); throw new Error(d?.error || "Failed to delete"); }
      setHistoryItems((prev) => prev.filter((h) => h._id !== id));
      if (id === activeHistoryId) {
        setActiveHistoryId(null);
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Failed to delete entry");
    } finally {
      setHistoryBusyId(null);
    }
  };

  const generateNewsBatch = async () => {
    setShowGenerateMenu(false);
    setGeneratingBatch(true);
    setGenerateError(null);
    setActiveHistoryId(null);
    try {
      const res = await fetch("/api/content-creator/news-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.posters) ? data.posters : [];
      if (items.length === 0) throw new Error("AI returned no posters — try again.");

      // items[0] is always the cover slide (isCover: true); the last item is
      // always the outro slide (isOutro: true) if present; everything between
      // is the ~10 curated candidates. Don't commit to newsData yet — open
      // the selection modal so the user picks which stories make the batch,
      // unless Fully Automated is on, in which case every candidate is kept
      // and the modal never opens.
      // The outro is never a selectable candidate — it's always re-appended.
      const outro = items.length > 1 && items[items.length - 1]?.isOutro ? items[items.length - 1] : null;
      const body = outro ? items.slice(0, -1) : items;
      const [cover, ...candidates] = body;
      setCreatorMode("news");
      setActiveTab("content");
      setBatchMeta({
        timeRangeLabel: data.timeRangeLabel ?? "",
        reportGeneratedAt: data.reportGeneratedAt ?? null,
      });
      setRawBatchCover(cover ?? null);
      setRawBatchOutro(outro);
      setRawBatchCandidates(candidates);
      setSelectedPosterIndices(new Set(candidates.map((_, i) => i))); // default: everything selected

      if (fullyAutomated) {
        // Read straight off the fetch response, not batchMeta state — the
        // setBatchMeta call above hasn't re-rendered yet, so batchMeta itself
        // would still be stale here (see illustrateAndSaveBatch's doc comment).
        await illustrateAndSaveBatch(cover ?? null, candidates, outro, data.timeRangeLabel, data.reportGeneratedAt);
      } else {
        setShowSelectionModal(true);
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingBatch(false);
    }
  };

  // Facts/Learnings are fully automatic and prompt-capped (no oversized raw
  // pool like News's old 20-30), so there's no selection-review step here —
  // generate, commit straight to newsData, and save to History immediately.
  const generateFactsBatch = async (topicHint?: string) => {
    setShowGenerateMenu(false);
    setGeneratingBatch(true);
    setGenerateError(null);
    setActiveHistoryId(null);
    try {
      const res = await fetch("/api/content-creator/facts-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicHint ? { topicHint } : {}),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.cards) ? data.cards : [];
      if (items.length === 0) throw new Error("AI returned no facts — try again.");

      setCreatorMode("facts");
      setActiveTab("content");
      setNewsData(items);
      setActiveNewsIndex(0);
      setJsonText(JSON.stringify(items, null, 2));
      setJsonError(null);

      const factCount = Math.max(0, items.length - 2);
      const createdId = await saveToHistory(
        "facts-batch",
        `Facts · ${factCount} ${factCount === 1 ? "card" : "cards"}`,
        items.length,
        { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }
      );
      if (createdId) setActiveHistoryId(createdId);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingBatch(false);
    }
  };

  const generateLearningsBatch = async (topicHint?: string) => {
    setShowGenerateMenu(false);
    setGeneratingBatch(true);
    setGenerateError(null);
    setActiveHistoryId(null);
    try {
      const res = await fetch("/api/content-creator/learnings-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topicHint ? { topicHint } : {}),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.cards) ? data.cards : [];
      if (items.length === 0) throw new Error("AI returned no slides — try again.");

      setCreatorMode("learnings");
      setActiveTab("content");
      setNewsData(items);
      setActiveNewsIndex(0);
      setJsonText(JSON.stringify(items, null, 2));
      setJsonError(null);

      const title = data.concept ? `Learnings · ${data.concept}` : "Learnings Batch";
      const createdId = await saveToHistory("learnings-batch", title, items.length, { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme });
      if (createdId) setActiveHistoryId(createdId);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGeneratingBatch(false);
    }
  };

  const togglePosterSelection = (idx: number) => {
    setSelectedPosterIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const selectAllPosters = () => setSelectedPosterIndices(new Set(rawBatchCandidates.map((_, i) => i)));
  const clearPosterSelection = () => setSelectedPosterIndices(new Set());

  // Illustrates (Pexels) + commits + saves a final cover/chosen/outro set —
  // shared by the "Continue with N Posters" button (applyPosterSelection
  // below, reads the user's checked selection from state) and the "Fully
  // Automated" generate path (which calls this directly with every
  // candidate, skipping the review modal entirely). Takes timeRangeLabel/
  // reportGeneratedAt as params rather than reading batchMeta from state —
  // the automated path calls this in the same tick as setBatchMeta, before
  // React has re-rendered, so reading batchMeta here would see the stale
  // pre-update value.
  const illustrateAndSaveBatch = async (
    cover: NewsItem | null,
    chosen: NewsItem[],
    outro: NewsItem | null,
    timeRangeLabel?: string,
    reportGeneratedAt?: string | null
  ) => {
    if (chosen.length === 0 && !cover) return;

    const toIllustrate: NewsItem[] = [...(cover ? [cover] : []), ...chosen, ...(outro ? [outro] : [])];
    setImageGenProgress({ done: 0, total: toIllustrate.length });
    setGeneratingImages(true);
    let illustrated: NewsItem[];
    let imageError: string | null = null;
    let imagesAborted = false;
    try {
      illustrated = await runWithConcurrency(toIllustrate, 4, async (story) => {
        let next = story;
        // Skip the lookup for posters that already carry art, and for every
        // poster after a config-class failure — same short-circuit as
        // fillAllImages. Note this never aborts the batch itself: the posters
        // are still committed and saved, just without art, and the banner
        // below explains why. Progress still ticks either way so the counter
        // always reaches its total.
        if (!story.imageUrl && !imagesAborted) {
          const result = await fetchTopPexelsImage(buildWebSearchQuery(story));
          if (result.error && !imageError) imageError = result.error;
          if (result.fatal) imagesAborted = true;
          if (result.imageUrl) next = { ...story, imageUrl: result.imageUrl };
        }
        setImageGenProgress((p) => ({ ...p, done: p.done + 1 }));
        return next;
      });
    } finally {
      setGeneratingImages(false);
    }
    if (imageError) {
      setGenerateError(`Batch created, but images couldn't be filled. ${imageError}`);
    }

    let cursor = 0;
    const illustratedCover = cover ? illustrated[cursor++] : null;
    const illustratedChosen = illustrated.slice(cursor, cursor + chosen.length);
    cursor += chosen.length;
    const illustratedOutro = outro ? illustrated[cursor++] : null;

    // Every chosen story is immediately followed by its "explain it simply"
    // bento companion card — same story, plain-language rewrite. It inherits
    // the parent's imageUrl (buildBentoCard copies it), so this must run
    // after illustration above, not before.
    const chosenWithBento = illustratedChosen.flatMap((story) => [story, buildBentoCard(story)]);
    const items: NewsItem[] = [
      ...(illustratedCover ? [illustratedCover] : []),
      ...chosenWithBento,
      ...(illustratedOutro ? [illustratedOutro] : []),
    ];
    if (items.length === 0) return;

    setNewsData(items);
    setActiveNewsIndex(0);
    setDeselectedForZip(new Set());
    setJsonText(JSON.stringify(items, null, 2));
    setJsonError(null);
    setShowSelectionModal(false);
    setActiveHistoryId(null);

    const createdId = await saveToHistory(
      "news-batch",
      `News Batch · ${chosen.length} ${chosen.length === 1 ? "story" : "stories"} · ${timeRangeLabel || "curated"}`,
      items.length,
      { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, timeRangeLabel, reportGeneratedAt }
    );
    if (createdId) {
      setActiveHistoryId(createdId);
    }
  };

  // Builds the final batch (cover + whichever candidates are checked) — this
  // is the point the batch is actually saved to History, so History only
  // ever reflects what the user chose to keep, not the full raw AI candidate
  // pool. Triggered by the selection modal's "Continue with N Posters".
  const applyPosterSelection = async () => {
    const chosen = rawBatchCandidates.filter((_, idx) => selectedPosterIndices.has(idx));
    await illustrateAndSaveBatch(rawBatchCover, chosen, rawBatchOutro, batchMeta?.timeRangeLabel, batchMeta?.reportGeneratedAt);
  };

  // "Fill Images" — a standalone catch-up pass over whatever's already sitting
  // in newsData (loaded from History, pasted JSON, or a batch generated
  // before this feature existed), not just the moment a fresh batch is
  // confirmed — applyPosterSelection above already fills images for a fresh
  // "Generate" run, so this button mainly exists for older/imported batches.
  // Runs on Pexels with the top hit auto-applied per poster (no per-image
  // picker, see fetchTopPexelsImage below) so a full batch fills in one
  // click. Only touches items with no imageUrl yet, so it never clobbers a
  // manual upload or an existing pick — bento cards are skipped entirely
  // since they inherit their parent story's image at render time (see
  // withBentoImageFallback).
  const fillAllImages = async () => {
    const targets = newsData
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.isBento && !item.imageUrl && buildWebSearchQuery(item));
    if (targets.length === 0) return;

    setGenerateError(null);
    setImageGenProgress({ done: 0, total: targets.length });
    setGeneratingImages(true);
    let filled: { idx: number; imageUrl: string }[] = [];
    let firstError: string | null = null;
    let aborted = false;
    try {
      const results = await runWithConcurrency(targets, 4, async ({ item, idx }) => {
        // One config-class failure means every remaining poster would fail the
        // same way, so stop rather than firing the rest at a dead endpoint.
        if (aborted) return { idx, imageUrl: "" };
        const result = await fetchTopPexelsImage(buildWebSearchQuery(item));
        if (result.error && !firstError) firstError = result.error;
        if (result.fatal) aborted = true;
        setImageGenProgress((p) => ({ ...p, done: p.done + 1 }));
        return { idx, imageUrl: result.imageUrl };
      });
      filled = results.filter((r) => r.imageUrl);
    } finally {
      setGeneratingImages(false);
    }

    if (filled.length > 0) {
      const next = [...newsData];
      for (const { idx, imageUrl } of filled) next[idx] = { ...next[idx], imageUrl };
      setNewsData(next);
      setJsonText(JSON.stringify(next, null, 2));
    }

    // Never fail silently: before this, a missing API key filled nothing and
    // said nothing, leaving the button looking like it had simply worked.
    if (firstError) {
      setGenerateError(
        filled.length > 0
          ? `Filled ${filled.length} of ${targets.length} images — the rest failed. ${firstError}`
          : `Couldn't fill any images. ${firstError}`
      );
    }
  };

  // Converts a pasted external-AI JSON reply (the nested {posters}/{facts}/
  // {slides} wrapper shape the "Copy Prompt" system prompt asks for, or a
  // plain flat array) into the same NewsItem[] shape a normal generation
  // produces, then commits and saves it exactly like applyPosterSelection/
  // generateFactsBatch/generateLearningsBatch do. Throws a user-facing
  // message on any failure — the caller (ShowPromptModal) surfaces it.
  const importAiBatch = async (category: "news" | "facts" | "learnings", rawText: string) => {
    const parsed = parsePastedAiJson(rawText);
    const items = importAiJson(category, parsed);

    setCreatorMode(category);
    setActiveTab("content");
    setNewsData(items);
    setActiveNewsIndex(0);
    setDeselectedForZip(new Set());
    setJsonText(JSON.stringify(items, null, 2));
    setJsonError(null);
    setActiveHistoryId(null);

    const categoryKey: "news-batch" | "facts-batch" | "learnings-batch" =
      category === "news" ? "news-batch" : category === "facts" ? "facts-batch" : "learnings-batch";
    const title = category === "news"
      ? `News Batch · ${Math.max(0, items.length - 2)} stories · pasted`
      : category === "facts"
      ? `Facts · ${Math.max(0, items.length - 2)} cards · pasted`
      : `Learnings · ${items.find((d) => d.concept)?.concept || "pasted"}`;
    const createdId = await saveToHistory(
      categoryKey,
      title,
      items.length,
      { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }
    );
    if (createdId) setActiveHistoryId(createdId);
  };

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error("API failed"); return r.json(); })
      .then(d => setCandlesData(d))
      .catch(e => console.error("Candle summary load error:", e));
  }, []);

  const [jsonText, setJsonText] = useState(JSON.stringify(EMPTY_ANALYSIS, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [rendered, setRendered] = useState(false);

  // Dynamic customization state
  const [activeTab, setActiveTab] = useState<string>("content");
  const [colors, setColors] = useState<PosterColors>({
    bg:     "#bd533c",
    accent: "#111111",
    text:   "#FFFFFF",
    muted:  "#f5e6e1",
    card:   "#FFFFFF",
    subtle: "#a84933",
  });
  
  const [config, setConfig] = useState<PosterConfig>({
    showGrid: true,
    gridSize: 28,
    gridOpacity: 0.022,
    showBorder: true,
    borderWidth: 1.5,
    showCrosses: true,
    crossSize: 10,
    fontScale: 1.0,
  });

  // Poster visual style — "editorial" (default, existing look) or "bold"
  // (full-bleed gradient + huge condensed headline). Only News/Facts/Learnings
  // read this; Daily Analysis/Indicator keep their own separate styling.
  const [posterStyle, setPosterStyle] = useState<"editorial" | "bold">("editorial");
  const [gradientPresetId, setGradientPresetId] = useState<string>(GRADIENT_PRESETS[0].id);
  const activeGradient = GRADIENT_PRESETS.find((g) => g.id === gradientPresetId) ?? GRADIENT_PRESETS[0];
  // Editorial paper-band theme — light (cream) or dark (near-black card).
  const [editorialTheme, setEditorialTheme] = useState<"light" | "dark">("light");
  // How strongly the color fade (paper-band bleed in editorial, gradient
  // scrim in Bold) washes over the photo — 0 = photo almost fully visible,
  // 100 = the fully-tuned default look, up to 200 = heaviest wash. Defaults
  // to 200 (heaviest) per user preference.
  const [gradientFade, setGradientFade] = useState<number>(200);
  // Poster "positive" sentiment tint — emerald (default) or sky blue.
  // Negative/bearish stays red and neutral text stays white in both; only
  // the bullish highlight color swaps between the two options.
  const [sentimentScheme, setSentimentScheme] = useState<SentimentScheme>("emerald");
  // "Set as Default" — saves the settings above (not the poster content) to
  // the user's account so every future visit starts from this look instead
  // of the factory defaults. Loaded once on mount, below.
  const [defaultSaveStatus, setDefaultSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [elementBounds, setElementBounds] = useState<PosterElement[]>([]);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Click-drag-to-pan / scroll-to-zoom on the news poster image. The
  // currently-loaded image element is kept in a ref (set when render()
  // loads it) so the drag/wheel handlers can read its natural dimensions
  // synchronously without re-loading anything.
  const activeImgRef = useRef<HTMLImageElement | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const dragStateRef = useRef<{
    startClientX: number;
    startClientY: number;
    startFocusX: number;
    startFocusY: number;
    boxW: number;
    boxH: number;
    zoom: number;
    moved: boolean;
    liveFocusX: number;
    liveFocusY: number;
  } | null>(null);

  const activeItemImgUrl = isBatchMode && newsData[activeNewsIndex] ? newsData[activeNewsIndex].imageUrl : (creatorMode === "analysis" ? analysisData.imageUrl : parsedData.imageUrl);

  const ar = useMemo<AspectRatio>(() => {
    // A finished motion video is a Reel, not a carousel post — the canvas is
    // fixed at 1080×1920 (9:16) for the whole recording regardless of what
    // ratio the decomposed slides themselves are. `drawScene` already
    // contain-fits each slide into whatever canvas it is handed and the
    // canvas is filled black first, so a slide shorter than 16:9 (a 4:5 or
    // 1:1 carousel poster, say) simply letterboxes with black bars top and
    // bottom instead of stretching or cropping. Fixed rather than derived
    // from the first scene's slide also sidesteps the old problem this once
    // worked around: a canvas that resized mid-recording produced a broken
    // file, and a constant is trivially as stable as that was.
    if (creatorMode === "motion" && motionTimeline) {
      return { id: "reel", label: "Reel", w: 1080, h: 1920, desc: "1080×1920 · 9:16" };
    }
    if (creatorMode === "motion" && motionData.width && motionData.height) {
      return {
        id: "auto",
        label: "Auto",
        w: motionData.width,
        h: motionData.height,
        desc: `${motionData.width}×${motionData.height}`,
      };
    }
    if (ratioId === "auto" || creatorMode === "watermark") {
      const loadedImg = activeItemImgUrl ? loadedImagesRef.current[activeItemImgUrl] : null;
      if (loadedImg && loadedImg.naturalWidth > 0 && loadedImg.naturalHeight > 0) {
        return {
          id: "auto",
          label: "Auto",
          w: loadedImg.naturalWidth,
          h: loadedImg.naturalHeight,
          desc: `${loadedImg.naturalWidth}×${loadedImg.naturalHeight}`,
        };
      }
      if (activeImgRef.current && activeImgRef.current.naturalWidth > 0 && activeImgRef.current.naturalHeight > 0) {
        return {
          id: "auto",
          label: "Auto",
          w: activeImgRef.current.naturalWidth,
          h: activeImgRef.current.naturalHeight,
          desc: `${activeImgRef.current.naturalWidth}×${activeImgRef.current.naturalHeight}`,
        };
      }
    }
    return RATIOS.find((r) => r.id === ratioId) || RATIOS[0];
  }, [ratioId, creatorMode, activeNewsIndex, newsData, activeItemImgUrl, motionData.width, motionData.height, motionTimeline, activeImgRef.current?.naturalWidth, activeImgRef.current?.naturalHeight, loadedImagesRef.current]);

  // Compute CSS scale so canvas fits preview area
  // Load the user's saved "default settings" once on mount, if they've ever
  // saved one — overrides the hardcoded factory defaults above. Silently
  // keeps the factory defaults on any failure (logged-out, network error,
  // or simply never saved one yet).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/content-creator/defaults");
        if (!res.ok) return;
        const data = await parseJsonResponse(res);
        const s = data?.settings;
        if (!s || typeof s !== "object") return;
        if (s.ratioId) setRatioId(s.ratioId);
        if (s.colors) setColors(s.colors);
        if (s.config) setConfig(s.config);
        if (s.posterStyle === "editorial" || s.posterStyle === "bold") setPosterStyle(s.posterStyle);
        if (s.gradientPresetId) setGradientPresetId(s.gradientPresetId);
        if (s.editorialTheme === "light" || s.editorialTheme === "dark") setEditorialTheme(s.editorialTheme);
        if (typeof s.gradientFade === "number") setGradientFade(s.gradientFade);
        if (s.sentimentScheme === "emerald" || s.sentimentScheme === "skyblue") setSentimentScheme(s.sentimentScheme);
      } catch {
        // Factory defaults already in state — nothing to do.
      }
    })();
  }, []);

  useEffect(() => {
    if (!previewRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const s = Math.min(width / ar.w, (height - 0) / ar.h, 1);
      setScale(Number(s.toFixed(4)));
    });
    obs.observe(previewRef.current);
    return () => obs.disconnect();
  }, [ar.w, ar.h]);

  // Sync creatorMode -> jsonText
  useEffect(() => {
    if (creatorMode === "analysis") {
      setJsonText(JSON.stringify(analysisData, null, 2));
    } else if (isBatchMode) {
      setJsonText(JSON.stringify(newsData, null, 2));
    } else {
      setJsonText(JSON.stringify(parsedData, null, 2));
    }
    setJsonError(null);
    // ZIP-deselection indices are positions into THIS mode's newsData array —
    // carrying them across a mode switch would exclude unrelated cards in
    // the next mode's (differently-ordered, differently-sized) batch.
    setDeselectedForZip(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorMode]);

  // Sync jsonText -> parsedData
  useEffect(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonError(null);
      if (creatorMode === "analysis") {
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setAnalysisData(parsed);
        }
      } else if (isBatchMode) {
        if (Array.isArray(parsed)) {
          // Route through the same import normalizer as the "Paste The AI's
          // Reply" flow — a flat array can still be missing/malformed
          // caption+hashtags (e.g. an older round-tripped batch, or a plain
          // "posters" array copied out of an AI reply), so it needs the same
          // per-item backfill/validation, not a raw passthrough.
          try {
            const items = importAiJson(creatorMode as "news" | "facts" | "learnings", parsed);
            setNewsData(items);
            if (activeNewsIndex >= items.length) {
              setActiveNewsIndex(Math.max(0, items.length - 1));
            }
          } catch (convErr) {
            setJsonError(convErr instanceof Error ? convErr.message : "Unrecognized JSON shape for this mode.");
          }
        } else if (parsed && typeof parsed === "object") {
          // A pasted external-AI reply usually comes back as the nested
          // {posters}/{facts}/{slides} wrapper the system prompt asked for,
          // not the flat array the renderer needs — convert instead of
          // silently doing nothing.
          try {
            const items = importAiJson(creatorMode as "news" | "facts" | "learnings", parsed);
            setNewsData(items);
            setActiveNewsIndex(0);
          } catch (convErr) {
            setJsonError(convErr instanceof Error ? convErr.message : "Unrecognized JSON shape for this mode.");
          }
        }
      } else {
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setParsedData(parsed);
        }
      }
    } catch (e: any) {
      setJsonError(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsonText, creatorMode]);

  // Handler to update a field in active state & jsonText
  const handleUpdateField = (key: string, val: any) => {
    if (creatorMode === "analysis") {
      const updated = { ...analysisData, [key]: val } as AnalysisData;
      setAnalysisData(updated);
      setJsonText(JSON.stringify(updated, null, 2));
    } else if (isBatchMode) {
      const updatedList = [...newsData];
      if (updatedList[activeNewsIndex]) {
        updatedList[activeNewsIndex] = { ...updatedList[activeNewsIndex], [key]: val };
        setNewsData(updatedList);
        setJsonText(JSON.stringify(updatedList, null, 2));
      }
    } else {
      const updated = { ...parsedData, [key]: val } as PosterData;
      setParsedData(updated);
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Handler to click elements on canvas
  const handleElementClick = (fieldId: string) => {
    // News posters: clicking the empty image frame opens the OS file picker
    // to attach the first image. Once an image exists, plain clicks on it do
    // nothing — drag pans it, scroll zooms it, and the dedicated "Change
    // Image" button (rendered on the box itself) handles replacement.
    if (fieldId === "imageUrl" && isBatchMode) {
      if (!newsData[activeNewsIndex]?.imageUrl) imageFileRef.current?.click();
      return;
    }

    setActiveTab("content");
    setHighlightedField(fieldId);

    setTimeout(() => {
      const el = document.getElementById(`input-${fieldId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
      }
    }, 100);
  };

  // Click-drag-to-pan on the news poster image. Drives the canvas directly
  // (bypassing the jsonText round-trip) during the drag for smooth 60fps
  // feedback — re-stringifying the whole newsData array on every mousemove
  // would be expensive when a poster's imageUrl is a multi-MB base64 data
  // URL. State (and jsonText) is committed once, on mouseup.
  const handleImageMouseDown = (e: React.MouseEvent, box: PosterElement) => {
    if (!isBatchMode) return;
    const item = newsData[activeNewsIndex];
    if (!item?.imageUrl) return; // no image yet — let the click-to-upload flow handle it
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startFocusX: item.imageFocusX ?? 0.5,
      startFocusY: item.imageFocusY ?? 0.5,
      boxW: box.w,
      boxH: box.h,
      zoom: item.imageZoom ?? 1,
      moved: false,
      liveFocusX: item.imageFocusX ?? 0.5,
      liveFocusY: item.imageFocusY ?? 0.5,
    };
    setIsDraggingImage(true);
  };

  useEffect(() => {
    if (!isDraggingImage) return;

    const handleMove = (e: MouseEvent) => {
      const ds = dragStateRef.current;
      const img = activeImgRef.current;
      if (!ds || !img) return;

      const dxScreen = e.clientX - ds.startClientX;
      const dyScreen = e.clientY - ds.startClientY;
      if (Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3) ds.moved = true;
      const dxCanvas = dxScreen / scale;
      const dyCanvas = dyScreen / scale;

      const iAR = img.naturalWidth / img.naturalHeight;
      const { slackX, slackY } = computeCoverFitSlack(iAR, ds.boxW, ds.boxH, ds.zoom);
      const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
      ds.liveFocusX = slackX > 0 ? clamp01(ds.startFocusX - dxCanvas / slackX) : ds.startFocusX;
      ds.liveFocusY = slackY > 0 ? clamp01(ds.startFocusY - dyCanvas / slackY) : ds.startFocusY;

      const item = newsData[activeNewsIndex];
      if (item && canvasRef.current) {
        const liveData = { ...item, imageFocusX: ds.liveFocusX, imageFocusY: ds.liveFocusY };
        const bounds = drawPoster(canvasRef.current, liveData, ar, colors, config, img, creatorMode, (visibleNewsPosition === -1 ? 0 : visibleNewsPosition), visibleNewsCount, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
        setElementBounds(bounds);
      }
    };

    const handleUp = () => {
      const ds = dragStateRef.current;
      if (ds?.moved && newsData[activeNewsIndex]) {
        const updated = [...newsData];
        updated[activeNewsIndex] = { ...updated[activeNewsIndex], imageFocusX: ds.liveFocusX, imageFocusY: ds.liveFocusY };
        setNewsData(updated);
        setJsonText(JSON.stringify(updated, null, 2));
      }
      setIsDraggingImage(false);
      dragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDraggingImage, scale, ar, colors, config, creatorMode, activeNewsIndex, newsData, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme, visibleNewsPosition, visibleNewsCount]);

  // Click-drag-to-position for logo watermark directly on canvas.
  const handleLogoMouseDown = (e: React.MouseEvent, box: PosterElement) => {
    if (creatorMode !== "watermark") return;
    e.preventDefault();
    e.stopPropagation();
    logoDragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLogoX: box.x,
      startLogoY: box.y,
      badgeW: box.w,
      badgeH: box.h,
      moved: false,
      liveCustomX: box.x / ar.w,
      liveCustomY: box.y / ar.h,
    };
    setIsDraggingLogo(true);
  };

  useEffect(() => {
    if (!isDraggingLogo) return;

    const handleMove = (e: MouseEvent) => {
      const ds = logoDragStateRef.current;
      if (!ds) return;

      const dxScreen = e.clientX - ds.startClientX;
      const dyScreen = e.clientY - ds.startClientY;
      if (Math.abs(dxScreen) > 2 || Math.abs(dyScreen) > 2) ds.moved = true;

      const dxCanvas = dxScreen / scale;
      const dyCanvas = dyScreen / scale;

      const newX = Math.max(0, Math.min(ar.w - ds.badgeW, ds.startLogoX + dxCanvas));
      const newY = Math.max(0, Math.min(ar.h - ds.badgeH, ds.startLogoY + dyCanvas));

      ds.liveCustomX = newX / ar.w;
      ds.liveCustomY = newY / ar.h;

      const item = newsData[activeNewsIndex];
      const img = activeImgRef.current;
      if (item && canvasRef.current) {
        const liveData = {
          ...item,
          logoPosition: "custom" as LogoPosition,
          logoCustomX: ds.liveCustomX,
          logoCustomY: ds.liveCustomY,
        };
        const bounds = drawPoster(
          canvasRef.current,
          liveData,
          ar,
          colors,
          config,
          img,
          creatorMode,
          visibleNewsPosition === -1 ? 0 : visibleNewsPosition,
          visibleNewsCount,
          posterStyle,
          activeGradient,
          editorialTheme,
          gradientFade,
          sentimentScheme
        );
        setElementBounds(bounds);
      }
    };

    const handleUp = () => {
      const ds = logoDragStateRef.current;
      if (ds && newsData[activeNewsIndex]) {
        const updated = [...newsData];
        updated[activeNewsIndex] = {
          ...updated[activeNewsIndex],
          logoPosition: "custom" as LogoPosition,
          logoCustomX: ds.liveCustomX,
          logoCustomY: ds.liveCustomY,
        };
        setNewsData(updated);
        setJsonText(JSON.stringify(updated, null, 2));
      }
      setIsDraggingLogo(false);
      logoDragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    isDraggingLogo,
    scale,
    ar,
    colors,
    config,
    creatorMode,
    activeNewsIndex,
    newsData,
    posterStyle,
    activeGradient,
    editorialTheme,
    gradientFade,
    sentimentScheme,
    visibleNewsPosition,
    visibleNewsCount,
  ]);

  useEffect(() => {
    motionLoopRef.current = motionLoop;
  }, [motionLoop]);

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
      // just the live speakers. See playMotionSfx below.
      const sfxGain = ctx.createGain();
      // The hook clip's own embedded audio, live during the hook pre-roll
      // only — see playHookPhase.
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

  /**
   * Plays one hook clip to completion, drawing its frames into the same
   * canvas the timeline renders into (cover-fit — see drawVideoCover — since
   * a hook's own resolution may not match the fixed export canvas) and
   * routing its audio through the same mixing graph the voiceover/music use,
   * so during export it lands in the same recording as whatever follows it.
   * Branches rAF vs setInterval exactly like the main clock effect above and
   * for the same reason: a backgrounded export tab throttles rAF but not an
   * interval on a tab that is audibly playing.
   */
  const playHookPhase = useCallback(
    (hookEl: HTMLVideoElement, exporting: boolean): Promise<void> => {
      return new Promise((resolve) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d") ?? null;
        if (!canvas || !ctx) {
          resolve();
          return;
        }
        const W = Math.max(1, Math.round(ar.w));
        const H = Math.max(1, Math.round(ar.h));
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;

        const mix = ensureMotionMix();
        if (mix && mix.hookEl !== hookEl) {
          try {
            mix.ctx.createMediaElementSource(hookEl).connect(mix.hookGain);
            mix.hookEl = hookEl;
          } catch {
            /* already routed through another graph — leave it on the default output */
          }
        }

        let settled = false;
        let rafId: number | null = null;
        let intervalId: number | null = null;
        let safetyTimer: number | null = null;

        const finish = () => {
          if (settled) return;
          settled = true;
          if (rafId != null) cancelAnimationFrame(rafId);
          if (intervalId != null) window.clearInterval(intervalId);
          if (safetyTimer != null) window.clearTimeout(safetyTimer);
          hookEl.removeEventListener("ended", finish);
          hookEl.pause();
          resolve();
        };

        const draw = () => {
          if (settled) return;
          try {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, W, H);
            drawVideoCover(ctx, hookEl, W, H);
          } catch (err) {
            console.warn("Hook frame draw failed, continuing:", err);
          }
        };

        hookEl.addEventListener("ended", finish);
        try {
          hookEl.currentTime = 0;
        } catch {
          /* not seekable yet */
        }
        void hookEl.play().catch((err) => {
          console.warn("Hook video could not play, skipping it:", err);
          finish();
        });

        // A hook that never fires "ended" — a decode stall, a malformed file
        // — must not hang playback or an export forever.
        const safetyMs = (Number.isFinite(hookEl.duration) && hookEl.duration > 0 ? hookEl.duration * 1000 : 15000) + 2000;
        safetyTimer = window.setTimeout(finish, safetyMs);

        if (exporting) {
          intervalId = window.setInterval(draw, 1000 / 30);
        } else {
          const tick = () => {
            if (settled) return;
            draw();
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        }
      });
    },
    [ar, ensureMotionMix]
  );

  /**
   * Shared by every play/pause control (the timeline panel's and the
   * scrubber's). Pausing is always immediate; starting fresh from the very
   * top with a hook selected plays the hook first and only flips
   * isPlayingMotion once it finishes — resuming from mid-scrub never
   * replays the hook.
   */
  const handleToggleMotionPlay = useCallback(() => {
    if (isPlayingMotion) {
      setIsPlayingMotion(false);
      return;
    }
    const hook = motionHookEnabled ? motionHooks.find((h) => h.id === motionSelectedHookId) : undefined;
    const atStart = motionTimeRef.current < 50;
    if (hook && atStart && motionHookVideoRef.current && !isHookPhasePlaying) {
      setIsHookPhasePlaying(true);
      void playHookPhase(motionHookVideoRef.current, false).finally(() => {
        setIsHookPhasePlaying(false);
        setIsPlayingMotion(true);
      });
      return;
    }
    setIsPlayingMotion(true);
  }, [isPlayingMotion, motionHookEnabled, motionHooks, motionSelectedHookId, isHookPhasePlaying, playHookPhase]);

  /**
   * Plays a zone-transition SFX through the same graph the voiceover and
   * music already go through, so it is both audible live and — critically —
   * present in the exported MP4. Routing it through this project's own
   * private AudioContext (the sfx module's fallback) would only ever reach
   * the speakers: MediaRecorder captures `mix.dest`, and a second, unrelated
   * AudioContext has no way to feed into that stream.
   */
  const playMotionSfx = useCallback(
    (sfx: AudioSfxType, volume: number) => {
      const mix = ensureMotionMix();
      void playTransitionSfx(sfx, volume, mix?.ctx, mix?.sfxGain);
    },
    [ensureMotionMix]
  );

  /** A second, fixed chime layered under the whoosh on every slide load — see /public/text.mp3. */
  const playMotionSlideChime = useCallback(
    (volume: number) => {
      const mix = ensureMotionMix();
      void playAudioFile("/text.mp3", volume, mix?.ctx, mix?.sfxGain);
    },
    [ensureMotionMix]
  );

  // 60 FPS motion clock. Free-running when no timeline is applied (the
  // procedural preview loops forever); bounded by the timeline's duration
  // otherwise, and slaved to the voiceover whenever one is loaded — audio is
  // the only clock that cannot drift against itself.
  useEffect(() => {
    if (creatorMode !== "motion" || !isPlayingMotion) return;

    // Belt-and-suspenders against a stale loop outliving its effect — e.g. a
    // dev-mode Fast Refresh remount racing this cleanup with the previous
    // instance's still-queued frame. cancelAnimationFrame below is the real
    // guard; this is what stops that frame from calling setState even if the
    // cancel loses the race, which is what "Maximum update depth exceeded"
    // looks like from the outside: two ticking loops each advancing the clock.
    let cancelled = false;

    const audio = motionAudioRef.current;
    const music = motionMusicRef.current;
    const duration = motionTimeline?.durationMs ?? 0;
    const speed = Math.max(0.01, motionSpeedRef.current);
    motionClockOriginRef.current = performance.now() - motionTimeRef.current / speed;

    // Routing both sources through the mixer here, rather than only at export,
    // means what you hear while scrubbing is exactly what gets recorded.
    ensureMotionMix();

    if (motionTimeline) {
      if (audio) {
        void audio.play().catch(() => {
          /* autoplay refused — the performance clock carries on alone */
        });
      }
      if (music) {
        void music.play().catch(() => {});
      }
    }

    const advance = (value: number) => {
      if (cancelled) return;
      motionTimeRef.current = value;
      setMotionTimeMs(value);
    };

    /** One clock step, shared by both drivers below. False means stop entirely. */
    const step = (now: number): boolean => {
      // Audio position is already in timeline time whatever the playback rate,
      // so it needs no scaling; the wall clock does.
      const fromAudio = audio && !audio.paused && !audio.ended ? audio.currentTime * 1000 : null;
      let t = fromAudio ?? (now - motionClockOriginRef.current) * speed;

      if (duration > 0 && t >= duration) {
        if (motionLoopRef.current) {
          t = 0;
          motionClockOriginRef.current = now;
          [audio, music].forEach((el) => {
            if (!el) return;
            try {
              el.currentTime = 0;
            } catch {
              /* ignore */
            }
            void el.play().catch(() => {});
          });
        } else {
          advance(duration);
          setIsPlayingMotion(false);
          return false;
        }
      }

      advance(t);
      return true;
    };

    if (isExportingTimeline) {
      // requestAnimationFrame is throttled to roughly once a second — or
      // paused outright — the instant this tab loses focus, while the
      // <audio> element backing the clock keeps playing regardless of tab
      // visibility. That mismatch is exactly what let an export freeze on
      // its video track mid-recording with the audio carrying on
      // underneath: motionTimeMs stopped advancing, so the render effect
      // below had nothing to react to, while the recorder's audio track
      // kept rolling untouched. setInterval does not share that throttling
      // on a tab that is audibly playing — which an export always is — so
      // the recording clock is driven by it instead. A few milliseconds of
      // jitter against vsync is invisible in a captured stream; a clock
      // that never stalls is worth far more here than one that is only
      // perfectly smooth while the tab stays focused.
      const fps = Math.max(12, Math.min(60, Math.round(motionTimeline?.fps ?? 30)));
      const intervalId = window.setInterval(() => {
        if (cancelled) return;
        try {
          if (!step(performance.now())) window.clearInterval(intervalId);
        } catch (err) {
          // One bad tick must not end the recording — the interval keeps
          // firing regardless and the clock carries on from the next one.
          console.warn("Motion export clock tick failed, continuing:", err);
        }
      }, 1000 / fps);

      return () => {
        cancelled = true;
        window.clearInterval(intervalId);
        audio?.pause();
        music?.pause();
      };
    }

    const tick = (now: number) => {
      if (cancelled) return;
      try {
        if (!step(now)) return;
      } catch (err) {
        console.warn("Motion clock tick failed, continuing:", err);
      }
      if (!cancelled) motionAnimFrameRef.current = requestAnimationFrame(tick);
    };

    motionAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (motionAnimFrameRef.current) cancelAnimationFrame(motionAnimFrameRef.current);
      audio?.pause();
      music?.pause();
    };
  }, [creatorMode, isPlayingMotion, motionTimeline, ensureMotionMix, isExportingTimeline]);

  // Render canvas on motionTimeMs change when in motion mode
  useEffect(() => {
    if (creatorMode !== "motion" || !canvasRef.current) return;
    // The hook pre-roll (playHookPhase) owns the canvas and draws its own
    // frames directly while it runs — motionTimeMs isn't moving during that
    // phase, but this effect can still re-run from an unrelated dependency
    // change, and painting scene 0 over the hook mid-playback would flicker.
    if (isHookPhasePlaying) return;

    // Timeline applied: the whole batch is one video. The frame decides which
    // slide is on screen, so the slide switcher follows playback rather than
    // driving it.
    if (motionTimeline) {
      // A single bad frame — a transient image-decode race, a stray NaN, an
      // out-of-range canvas call — must not end the whole recording. The
      // clock effect above keeps advancing motionTimeMs regardless of what
      // happens in here, so swallowing the error and trying again on the
      // next tick is what stops one glitch from freezing the rest of an
      // export while its audio track keeps rolling underneath.
      try {
        const frame = sampleTimeline(motionTimeline, motionTimeMs);

        // The topmost sampled scene is the one actually settling into place —
        // mid-transition that is frame.scenes[frame.scenes.length - 1],
        // otherwise it is the only entry — and its `layers` are what the
        // viewer is actually looking at. Hoisted out of the SFX-only branch
        // below (it used to live there alone) because the always-on
        // current-zone tracking further down needs it too, regardless of
        // whether SFX is enabled or the video is even playing.
        const topScene = frame.scenes[frame.scenes.length - 1];
        const activeSlide = motionSlides[frame.activeSlideIndex];
        // Under wholeImageMotion (on by default), drawScene freezes every
        // small, non-collage layer at rest from frame 0 regardless of its own
        // cues — see isBigCollageElement in drawMotionTimelineFrame.ts. Firing
        // a whoosh — or treating it as the current zone — for that layer's
        // programmed-but-suppressed entrance would be for a "zone" that never
        // visibly appears. Mirrored here rather than reworking the renderer
        // to report back what it actually drew.
        const isBigZoneLayer = (layerId: string): boolean => {
          if (!motionWholeImageMotion) return true;
          const layer = activeSlide?.layers.find((l) => l.id === layerId);
          if (!layer) return true;
          const objType = layer.objectType || "";
          if (["collage-part", "photo", "illustration", "panel", "banner"].includes(objType)) return true;
          return (layer.w ?? 0) * (layer.h ?? 0) >= 0.1;
        };

        // Scene- AND zone-appearance SFX. Only while actually playing, so
        // scrubbing the timeline while paused stays silent — matches the old
        // scene-only behaviour this replaces.
        if (isPlayingMotion && motionSfxEnabled) {
          const sfxScene = motionTimeline.scenes[frame.activeSceneIndex];
          if (sfxScene) {
            const sceneSfx = sfxScene.enter?.soundEffect || DEFAULT_TRANSITION_AUDIO_MAP[sfxScene.enter?.type] || "whoosh";

            if (frame.activeSceneIndex !== motionLastSceneIndexRef.current) {
              playMotionSfx(sceneSfx, motionSfxVolume);
              playMotionSlideChime(motionSfxVolume);
              motionLastSceneIndexRef.current = frame.activeSceneIndex;
            }

            // A fresh scene index — whether reached by natural playback, a
            // seek, or a loop restart — re-seeds silently instead of comparing
            // against a stale or empty map, so landing mid-scene with several
            // elements already on screen does not fire a burst for all of them
            // at once. Only a crossing seen on a LATER frame counts as a real
            // "zone appearing" — see the refs' declaration above.
            const reseeding = motionZoneSeededSceneRef.current !== frame.activeSceneIndex;
            if (reseeding) {
              motionZoneVisibleRef.current = {};
              motionZoneSeededSceneRef.current = frame.activeSceneIndex;
            }
            Object.entries(topScene?.layers ?? {}).forEach(([layerId, state]) => {
              if (!isBigZoneLayer(layerId)) return;
              const visible = state.opacity * state.wipe > 0.05;
              const wasVisible = motionZoneVisibleRef.current[layerId] ?? false;
              if (!reseeding && visible && !wasVisible) {
                playMotionSfx(sceneSfx, motionSfxVolume);
                motionZoneFlourishRef.current[layerId] = motionTimeMs;
              }
              motionZoneVisibleRef.current[layerId] = visible;
            });
          }
        } else if (!isPlayingMotion) {
          motionLastSceneIndexRef.current = -1;
          motionZoneSeededSceneRef.current = -1;
        }

        // Which single zone reads as "current" right now, for the persistent
        // black rotating border + diagonal shine (drawActiveZoneOverlay).
        // Independent of the SFX bookkeeping above, which goes silent
        // whenever paused or muted — this must keep working regardless, so
        // scrubbing the timeline in the editor shows the same thing the
        // export will. Exactly one zone at a time: whichever just appeared
        // most recently, falling back to any other still-visible big zone if
        // that one leaves, mirroring the flourish's own crossing-detection
        // above but with its own independent frame-to-frame memory (see the
        // refs' declaration).
        const currentZoneReseeding = motionCurrentZoneSceneRef.current !== frame.activeSceneIndex;
        motionCurrentZoneSceneRef.current = frame.activeSceneIndex;
        const currentZoneVisibleNow: Record<string, boolean> = {};
        Object.entries(topScene?.layers ?? {}).forEach(([layerId, state]) => {
          if (isBigZoneLayer(layerId)) currentZoneVisibleNow[layerId] = state.opacity * state.wipe > 0.05;
        });
        if (currentZoneReseeding) {
          // Landing mid-scene — via a seek, a loop restart, or just opening
          // the editor — picks whatever is already on screen rather than
          // showing nothing until the next fresh entrance.
          motionCurrentZoneIdRef.current = Object.keys(currentZoneVisibleNow).find((id) => currentZoneVisibleNow[id]) ?? null;
        } else {
          Object.entries(currentZoneVisibleNow).forEach(([layerId, visible]) => {
            const wasVisible = motionCurrentZoneVisibleRef.current[layerId] ?? false;
            if (visible && !wasVisible) motionCurrentZoneIdRef.current = layerId;
          });
          if (motionCurrentZoneIdRef.current && !currentZoneVisibleNow[motionCurrentZoneIdRef.current]) {
            motionCurrentZoneIdRef.current = Object.keys(currentZoneVisibleNow).find((id) => currentZoneVisibleNow[id]) ?? null;
          }
        }
        motionCurrentZoneVisibleRef.current = currentZoneVisibleNow;

        const bounds = drawMotionTimelineFrame(
          canvasRef.current,
          frame,
          {
            slides: motionSlides,
            layerImgEls: motionLayerImgElsRef.current,
            bgImgs: loadedImagesRef.current,
          },
          { w: ar.w, h: ar.h },
          {
            activeLayerId: motionData.activeLayerId,
            showSelection: !isPlayingMotion && !isExportingTimeline,
            words: motionTranscript ?? undefined,
            captions: motionCaptions,
            paperCutStyle: motionPaperCutStyle,
            wholeImageMotion: motionWholeImageMotion,
            zigzagMotion: motionZigzagMotion,
            hideImageCaptions: motionHideImageCaptions,
            zoneFlourishes: motionZoneFlourishRef.current,
            currentZoneLayerId: motionCurrentZoneIdRef.current,
          },
          (sceneIndex) => motionTimeline.scenes[sceneIndex]?.intro
        );
        if (!isPlayingMotion && !isExportingTimeline) {
          setElementBounds(bounds);
        }
        if (frame.activeSlideIndex !== activeMotionIndex && motionSlides[frame.activeSlideIndex]) {
          setActiveMotionIndex(frame.activeSlideIndex);
        }
      } catch (err) {
        console.warn("Motion frame render failed, skipping this frame:", err);
      }
      return;
    }

    const dataWithTime = {
      ...motionData,
      timeMs: motionTimeMs,
      layerImgEls: motionLayerImgElsRef.current[activeMotionSlideId] || {},
      paperCutStyle: motionPaperCutStyle,
    };
    const bgImg = motionData.backgroundUrl ? loadedImagesRef.current[motionData.backgroundUrl] : null;
    const bounds = drawPoster(canvasRef.current, dataWithTime, ar, colors, config, bgImg, "motion");
    if (!isPlayingMotion && !isExportingTimeline) {
      setElementBounds(bounds);
    }
  }, [
    creatorMode,
    motionTimeMs,
    motionData,
    motionSlides,
    activeMotionIndex,
    activeMotionSlideId,
    motionTimeline,
    isPlayingMotion,
    isExportingTimeline,
    // A paused canvas has no other reason to redraw, so a late-decoding image
    // would otherwise never appear until the playhead moved.
    motionAssetVersion,
    motionTranscript,
    motionCaptions,
    motionPaperCutStyle,
    motionWholeImageMotion,
    motionZigzagMotion,
    motionHideImageCaptions,
    motionSfxEnabled,
    motionSfxVolume,
    playMotionSfx,
    playMotionSlideChime,
    isHookPhasePlaying,
    ar,
    colors,
    config,
  ]);

  /**
   * Loads one image to the point where drawing it is guaranteed to paint.
   *
   * `onload` is not that point: the bitmap may still be undecoded, and the
   * first `drawImage` either stalls the frame or draws nothing. `decode()` is,
   * which is the difference between a video that opens on its content and one
   * that opens on black.
   *
   * Deduplicated by URL and cached forever — the same job is shared by every
   * caller that wants the asset, so a re-render cannot restart a download.
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
  }, []);

  // Warms loadedImagesRef/motionLayerImgElsRef for one slide's background +
  // layer images so the motion canvas (which, unlike the poster renderer,
  // never lazy-loads a missing entry — see the render effect above) can draw
  // it immediately. Shared by the upload handler and by history restore,
  // since a slide reaching state either way needs the exact same warm-up.
  const preloadMotionSlideImages = useCallback(
    (slide: MotionSlide): Promise<void> => {
      const urls: string[] = [];
      if (slide.backgroundUrl) urls.push(slide.backgroundUrl);
      // The flattened poster is what the renderer paints while the decomposed
      // pieces are still arriving, so it is an asset in its own right — not
      // loading it was why an incomplete slide had nothing to fall back to.
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
    [loadMotionImage]
  );

  /**
   * Blocks until every slide can actually be drawn.
   *
   * Playback and recording both call this before they start. Firing the loads
   * and hoping — which is what used to happen — meant the first seconds of a
   * take were whatever had happened to arrive, and on a cold cache that was
   * nothing at all.
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

  // Motion Video Python segmentation handler.
  //
  // The original bytes go up untouched, as multipart. The old path re-drew
  // every upload into a 1200px JPEG at q0.90 before the server ever saw it,
  // which threw away detail the decomposer then could not recover.
  // The script's own parts, in speaking order — the canonical list every
  // slide is matched against, and the list that decides which parts have no
  // image at all. Shared by the silent auto-reorder on upload and by the Fix
  // Order modal, so both ever judge against exactly the same parts.
  // See scriptSegments.ts for how a punctuation-less word-level CSV is cut.
  const motionScriptSegments = useMemo(
    () =>
      deriveScriptSegments({
        manifestLines: extractManifestLines(motionManifestText),
        transcript: motionTranscript,
        hintCount: motionSlides.length,
      }),
    [motionTranscript, motionManifestText, motionSlides.length]
  );

  /**
   * Images → decomposed slides. Shared by the batch upload below and by the
   * Fix Order modal, which decomposes one image at a time to fill a gap in
   * the script without losing everything already on screen. Reports progress
   * through the same state as the batch path, so a per-slot upload shows the
   * same spinner the user already knows.
   */
  const decomposeMotionFiles = useCallback(
    async (
      files: File[],
      strength: DecompositionStrength,
      onProgress?: (done: number, total: number) => void
    ): Promise<{ slides: MotionSlide[]; failures: string[] }> => {
      // Chunked, not one giant request. Every layer comes back from python as a
      // base64 PNG before the route moves it to R2, so a 50-poster batch in a
      // single spawn would push hundreds of megabytes through one stdout pipe
      // and sit on one function timeout. Six at a time keeps each request the
      // size the 12-image path already proved out, and the deck grows on screen
      // as it lands instead of after everything finishes.
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
    // loaded before — same reasoning as generateNewsBatch/generateFactsBatch.
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
      // to match against — independent of, and tried before, the printed
      // slide-number path. Deliberately silent unless every uploaded slide
      // found a part of its own: a partial match is real information, but it
      // belongs in the Fix Order modal where the missing parts are visible and
      // fixable, not applied behind the user's back. See matchSlideOrderToScript.
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
      // it must be persisted the moment it succeeds — same "auto-save
      // immediately" contract as generateNewsBatch/generateFactsBatch. Every
      // image URL here is already an R2-backed proxy path (never base64), so
      // this payload stays small regardless of batch size. Saved in the
      // (possibly script-reordered) orderedSlides sequence, not the raw
      // upload order.
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
   * A fresh upload already gets this automatically as part of decomposing
   * (see scripts/watermark.py, run from process_image) — this button exists
   * for slides that were decomposed before that pass existed. Same
   * corner-OCR-and-inpaint approach, just run standalone against
   * backgroundUrl and originalUrl directly instead of as a step inside
   * decomposition, since re-decomposing a slide just to clean its corner
   * would throw away any hand-editing already done to its layers.
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
      // carry the watermark in either or both, since both were flattened
      // from the same still-watermarked source at decompose time.
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

        // Slide images live behind same-origin proxy URLs by this point (the
        // decompose route already persisted them to R2), so re-fetching them
        // as blobs to re-upload is a same-origin read, not a remote fetch.
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

  useEffect(() => {
    if (!isDraggingMotionLayer) return;

    const handleMove = (e: MouseEvent) => {
      const ds = motionLayerDragStateRef.current;
      if (!ds) return;

      const dxScreen = e.clientX - ds.startClientX;
      const dyScreen = e.clientY - ds.startClientY;

      const dxCanvas = dxScreen / scale;
      const dyCanvas = dyScreen / scale;

      const newX = ds.startLayerX + dxCanvas / ar.w;
      const newY = ds.startLayerY + dyCanvas / ar.h;

      setMotionData((prev: MotionVideoData) => {
        const updated = prev.layers.map((l: MotionLayer) =>
          l.id === ds.layerId ? { ...l, x: newX, y: newY } : l
        );
        return { ...prev, layers: updated };
      });
    };

    const handleUp = () => {
      setIsDraggingMotionLayer(false);
      motionLayerDragStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDraggingMotionLayer, scale, ar]);

  /* ── AI Timeline: apply, inputs, export ──────────────────────────────── */

  const applyMotionTimeline = useCallback(async () => {
    // The transcript is passed in so every cue carrying a `word` is retimed
    // from real audio rather than trusted — see compile.ts snapToWord.
    const { timeline, report } = parseMotionTimeline(motionTimelineText, motionSlides, {
      transcript: motionTranscript,
      paperCutStyle: motionPaperCutStyle,
      textOnlySync: motionTextOnlySync,
    });
    setMotionTimelineReport(report);
    setMotionTimeline(timeline);
    if (!timeline) return;

    // Start the new timeline from the top rather than wherever the old
    // playhead happened to sit.
    motionTimeRef.current = 0;
    motionClockOriginRef.current = performance.now();
    setMotionTimeMs(0);
    setActiveMotionIndex(timeline.scenes[0]?.slideIndex ?? 0);
    setMotionData((prev) => ({ ...prev, activeLayerId: undefined }));
    const audio = motionAudioRef.current;
    if (audio) {
      try {
        audio.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
    }
    await ensureMotionAssets(motionSlides);
    motionTimeRef.current = 0;
    motionClockOriginRef.current = performance.now();
    setMotionTimeMs(0);
    setIsPlayingMotion(true);
  }, [
    motionTimelineText,
    motionSlides,
    motionTranscript,
    motionPaperCutStyle,
    motionTextOnlySync,
    setMotionData,
    ensureMotionAssets,
  ]);

  /**
   * Installs a locally-built timeline.
   *
   * It goes through the textarea and back out through the same compiler a
   * pasted timeline uses, so a built timeline and a hand-written one are
   * indistinguishable from here on — including the re-snap against the
   * transcript and the validation report.
   */
  const applyBuiltTimeline = useCallback(
    async (timelineJson: string): Promise<CompiledTimeline | null> => {
      setMotionTimelineText(timelineJson);

      const compiled = parseMotionTimeline(timelineJson, motionSlides, {
        transcript: motionTranscript,
        paperCutStyle: motionPaperCutStyle,
        textOnlySync: motionTextOnlySync,
      });
      setMotionTimelineReport(compiled.report);
      setMotionTimeline(compiled.timeline);
      if (!compiled.timeline) return null;

      // Seed the editor from the same JSON, so the timeline strip, the textarea
      // and the compiled playback can never disagree about what the video is.
      const parsedDoc = parseLooseJson<AuthoredTimeline>(timelineJson).value;
      if (parsedDoc) {
        setMotionDoc(toEditable(parsedDoc, motionSlides.length));
        motionUndoRef.current = [];
        motionRedoRef.current = [];
        setMotionHistoryTick((t) => t + 1);
      }

      motionTimeRef.current = 0;
      motionClockOriginRef.current = performance.now();
      setMotionTimeMs(0);
      setActiveMotionIndex(compiled.timeline.scenes[0]?.slideIndex ?? 0);
      setMotionData((prev) => ({ ...prev, activeLayerId: undefined }));
      const audio = motionAudioRef.current;
      if (audio) {
        try {
          audio.currentTime = 0;
        } catch {
          /* not seekable yet */
        }
      }

      // Do not start the reel over assets that cannot be drawn yet — that is
      // exactly how playback used to open on an empty frame.
      await ensureMotionAssets(motionSlides);
      motionTimeRef.current = 0;
      motionClockOriginRef.current = performance.now();
      setMotionTimeMs(0);
      setIsPlayingMotion(true);
      return compiled.timeline;
    },
    [motionSlides, motionTranscript, motionPaperCutStyle, setMotionData, ensureMotionAssets]
  );

  /**
   * The no-input path: nothing is pasted, nothing is asked of a model.
   *
   * The decomposer has already read every word printed on every poster and the
   * CSV says when every word is spoken, so where each slide belongs in the
   * audio — and where each element belongs inside its slide — is a search over
   * two documents this app already holds. See lib/motion-timeline/autosync.ts.
   */
  const autoSyncMotionTimeline = useCallback(async () => {
    if (motionSlides.length === 0) {
      setMotionAutoSyncReport(null);
      setMotionAutoSyncNote("Upload your posters first — auto-sync animates the decomposed layers.");
      return;
    }
    if (!motionTranscript || motionTranscript.length === 0) {
      setMotionAutoSyncReport(null);
      setMotionAutoSyncNote("Load the word-level transcript CSV first — it is the only clock auto-sync has.");
      return;
    }

    const { timeline, report } = autoSyncTimeline(motionSlides, motionTranscript, {
      textOnlySync: motionTextOnlySync,
      introCard: motionIntroCard,
    });
    setMotionAutoSyncReport(report);

    if (!timeline) {
      setMotionAutoSyncNote(report.warnings[0] ?? "Auto-sync produced no usable scenes.");
      return;
    }

    await applyBuiltTimeline(JSON.stringify(timeline, null, 2));

    const onWords = report.scenes.filter((s) => s.placedBy === "text").length;
    setMotionAutoSyncNote(
      `${report.scenes.length} scene${report.scenes.length === 1 ? "" : "s"} · ` +
        `${onWords} cut on their own words · ` +
        `${report.anchoredElements}/${report.totalElements} elements enter on a word they print.`
    );
    // The manifest report below now describes an older timeline.
    setMotionManifestNote(null);
    setMotionManifestWarnings([]);
  }, [motionSlides, motionTranscript, applyBuiltTimeline, motionTextOnlySync, motionIntroCard]);

  /**
   * The zero-token path: the sync manifest already says which element enters on
   * which word, and the transcript says when every word is spoken — so the
   * timeline is built here rather than bought from a second AI pass. The result
   * is written into the same textarea so it stays inspectable and editable.
   */
  const buildMotionTimelineFromManifest = useCallback(async () => {
    setMotionManifestWarnings([]);

    const parsed = parseSyncManifest(motionManifestText);
    if (!parsed.manifest) {
      setMotionManifestNote(parsed.error ?? "Could not read that as a sync manifest.");
      return;
    }
    if (!motionTranscript || motionTranscript.length === 0) {
      setMotionManifestNote("Load the word-level transcript CSV first — the manifest supplies the words, the CSV supplies the timings.");
      return;
    }

    const { timeline, report } = buildTimelineFromManifest(parsed.manifest, motionSlides, motionTranscript, {
      textOnlySync: motionTextOnlySync,
    });
    setMotionManifestWarnings([...parsed.warnings, ...report.warnings]);

    if (!timeline) {
      setMotionManifestNote("The manifest produced no usable scenes.");
      return;
    }

    setMotionManifestNote(
      `Built ${parsed.manifest.beats.length} beats · ${report.boundElements}/${report.totalElements} elements bound to a layer.`
    );
    await applyBuiltTimeline(JSON.stringify(timeline, null, 2));
    // The auto-sync report below now describes an older timeline.
    setMotionAutoSyncReport(null);
    setMotionAutoSyncNote(null);
  }, [motionManifestText, motionTranscript, motionSlides, motionTextOnlySync, applyBuiltTimeline]);

  /**
   * Persists the current motion document.
   *
   * The editor is a live surface — nobody is going to remember to press save
   * after nudging a cue — so every committed edit schedules one of these. The
   * existing history record is updated in place when there is one, so a session
   * stays a single entry instead of littering the list with a row per keystroke.
   */
  const persistMotionState = useCallback(
    async (timelineText: string) => {
      if (motionSlides.length === 0) return;
      setMotionSaveState("saving");
      const firstName = motionSlides[0]?.fileName?.replace(/\.[^.]+$/, "");
      const title =
        motionSlides.length > 1 ? `Motion Video · ${motionSlides.length} slides` : firstName || "Motion Video";
      const id = await saveToHistory(
        "motion-video",
        title,
        motionSlides.length,
        {
          slides: motionSlides,
          timelineText,
          manifestText: motionManifestText,
          transcriptText: motionTranscriptRawTextRef.current,
          transcriptCsvUrl: motionCsvR2UrlRef.current,
          audioUrl: motionAudioR2UrlRef.current,
          audioName: motionAudioName,
          musicUrl: motionMusicR2UrlRef.current,
          musicName: motionMusicName,
          musicVolume: motionMusicVolume,
          paperCutStyle: motionPaperCutStyle,
          textOnlySync: motionTextOnlySync,
          wholeImageMotion: motionWholeImageMotion,
          zigzagMotion: motionZigzagMotion,
          hideImageCaptions: motionHideImageCaptions,
          ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme,
        },
        activeHistoryId,
        motionSlides[0]?.backgroundUrl || motionSlides[0]?.originalUrl
      );
      if (id) {
        if (!activeHistoryId) setActiveHistoryId(id);
        setMotionSaveState("saved");
      } else {
        setMotionSaveState("error");
      }
    },
    [
      motionSlides,
      motionManifestText,
      motionAudioName,
      motionMusicName,
      motionMusicVolume,
      motionPaperCutStyle,
      motionTextOnlySync,
      motionWholeImageMotion,
      motionZigzagMotion,
      motionHideImageCaptions,
      activeHistoryId,
      ratioId,
      colors,
      config,
      posterStyle,
      gradientPresetId,
      editorialTheme,
      gradientFade,
      sentimentScheme,
    ]
  );

  // Autosave for everything about a motion project that ISN'T a timeline
  // edit: the CSV transcript or the voiceover/music landing in Cloudflare R2,
  // a toggle flipped, the music volume dragged. applyMotionDocEdit already
  // covers drag-gesture edits to the timeline itself; this is what makes
  // "upload the CSV, then the WAV" alone enough to have the project waiting
  // — CSV, audio, music and every setting together — on another device,
  // without a further manual "Save to History" for each one. Debounced
  // through the same timer applyMotionDocEdit uses, so an upload landing
  // seconds after a drag settles coalesces into one PUT instead of two
  // racing writes.
  //
  // Gated on activeHistoryId already being set, same as the watermark-removal
  // autosave above — a brand new project (nothing decomposed into history
  // yet) still gets its first save from an explicit action (Save to History,
  // or a committed timeline edit), so an abandoned experiment before that
  // point never clutters the list with a half-finished entry. Everything
  // after that first save is now covered.
  useEffect(() => {
    if (creatorMode !== "motion" || motionSlides.length === 0 || !activeHistoryId) return;
    setMotionSaveState((s) => (s === "saving" ? s : "dirty"));
    if (motionSaveTimerRef.current) window.clearTimeout(motionSaveTimerRef.current);
    motionSaveTimerRef.current = window.setTimeout(() => {
      void persistMotionState(motionTimelineText);
    }, 1200);
  }, [
    creatorMode,
    motionSlides.length,
    activeHistoryId,
    motionTimelineText,
    motionCsvR2Url,
    motionAudioR2Url,
    motionAudioName,
    motionMusicR2Url,
    motionMusicName,
    motionMusicVolume,
    motionPaperCutStyle,
    motionTextOnlySync,
    motionWholeImageMotion,
    motionZigzagMotion,
    motionHideImageCaptions,
    persistMotionState,
  ]);

  /** Snapshot for undo, taken at the start of a gesture rather than per frame. */
  const beginMotionGesture = useCallback(() => {
    if (!motionDoc) return;
    motionUndoRef.current = [...motionUndoRef.current.slice(-49), motionDoc];
    motionRedoRef.current = [];
    setMotionHistoryTick((t) => t + 1);
  }, [motionDoc]);

  /**
   * Applies an edit: recompile for playback, rewrite the JSON, and — once the
   * gesture ends — schedule the save. Recompiling on every drag frame is what
   * makes the preview track the drag instead of lagging a gesture behind.
   */
  const applyMotionDocEdit = useCallback(
    (next: EditableTimeline, opts?: { commit?: boolean }) => {
      setMotionDoc(next);

      const authored = toAuthored(next);
      const json = JSON.stringify(authored, null, 2);
      setMotionTimelineText(json);

      const compiled = parseMotionTimeline(json, motionSlides, {
        transcript: motionTranscript,
        paperCutStyle: motionPaperCutStyle,
      });
      setMotionTimelineReport(compiled.report);
      if (compiled.timeline) setMotionTimeline(compiled.timeline);

      if (!opts?.commit) return;

      setMotionSaveState("dirty");
      if (motionSaveTimerRef.current) window.clearTimeout(motionSaveTimerRef.current);
      motionSaveTimerRef.current = window.setTimeout(() => {
        void persistMotionState(json);
      }, 1200);
    },
    [motionSlides, motionTranscript, motionPaperCutStyle, persistMotionState]
  );

  const undoMotionEdit = useCallback(() => {
    const prev = motionUndoRef.current.pop();
    if (!prev || !motionDoc) return;
    motionRedoRef.current = [...motionRedoRef.current, motionDoc];
    setMotionHistoryTick((t) => t + 1);
    applyMotionDocEdit(prev, { commit: true });
  }, [motionDoc, applyMotionDocEdit]);

  const redoMotionEdit = useCallback(() => {
    const next = motionRedoRef.current.pop();
    if (!next || !motionDoc) return;
    motionUndoRef.current = [...motionUndoRef.current, motionDoc];
    setMotionHistoryTick((t) => t + 1);
    applyMotionDocEdit(next, { commit: true });
  }, [motionDoc, applyMotionDocEdit]);

  // ⌘Z / ⇧⌘Z anywhere in motion mode.
  useEffect(() => {
    if (creatorMode !== "motion") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      if (e.shiftKey) redoMotionEdit();
      else undoMotionEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creatorMode, undoMotionEdit, redoMotionEdit]);

  // A pending save must not be lost to a tab close.
  useEffect(() => {
    return () => {
      if (motionSaveTimerRef.current) window.clearTimeout(motionSaveTimerRef.current);
    };
  }, []);

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
   * Applies the order chosen in the Fix Slide Order modal.
   *
   * Element ids are per-decomposition and slide positions are baked into any
   * existing timeline's `slideIndex` — reordering out from under it would
   * silently point every scene at the wrong poster, so the stale timeline is
   * cleared the same way a fresh upload clears it, not left to rot.
   */
  const handleApplyFixedSlideOrder = useCallback(
    async (reordered: MotionSlide[]) => {
      setMotionSlides(reordered);
      setActiveMotionIndex(0);
      setJsonText(JSON.stringify(buildMotionLayoutJson(reordered), null, 2));
      clearMotionTimeline();
      setShowFixSlideOrderModal(false);

      // Built from the reordered array directly, not from motionSlides state —
      // the setState above has not necessarily flushed yet, and history must
      // save the order the user just confirmed, not whatever was there before it.
      if (!activeHistoryId) return;
      setMotionSaveState("saving");
      const firstName = reordered[0]?.fileName?.replace(/\.[^.]+$/, "");
      const title = reordered.length > 1 ? `Motion Video · ${reordered.length} slides` : firstName || "Motion Video";
      const id = await saveToHistory(
        "motion-video",
        title,
        reordered.length,
        { slides: reordered, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme },
        activeHistoryId,
        reordered[0]?.backgroundUrl || reordered[0]?.originalUrl
      );
      setMotionSaveState(id ? "saved" : "error");
    },
    [activeHistoryId, clearMotionTimeline, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme]
  );

  const handleCopyMotionPrompt = useCallback(() => {
    if (motionSlides.length === 0) return;

    // Lean layout, printed compact: the full layout runs ~11.8k characters per
    // slide, and none of the weight it sheds (duplicated text blocks, per-line
    // boxes, pixel bounds, loop-preview settings) can change an animation
    // decision. See buildLeanMotionLayout.
    const layout = JSON.stringify(buildLeanMotionLayout(motionSlides));

    // The transcript goes in verbatim when one is loaded, so the AI keys its
    // cues to the same words this app will later resolve them against.
    const transcriptSection = motionTranscript?.length
      ? ["word,startMs,endMs", ...motionTranscript.map((w) => `${JSON.stringify(w.text)},${Math.round(w.startMs)},${Math.round(w.endMs)}`)].join("\n")
      : "<paste your word-by-word timestamped CSV here, then send>";

    const text = [
      MOTION_TIMELINE_TEMPLATE,
      "",
      "=== INPUT (A) — LAYOUT JSON ===",
      layout,
      "",
      "=== INPUT (B) — SYNC MANIFEST ===",
      motionManifestText.trim() || "<none supplied — derive the sync from the transcript and the slide text>",
      "",
      "=== INPUT (C) — TRANSCRIPT CSV ===",
      transcriptSection,
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopiedMotionPrompt(true);
    setTimeout(() => setCopiedMotionPrompt(false), 3000);
  }, [motionSlides, motionTranscript, motionManifestText]);

  const handleCopySpeechPrompt = useCallback(() => {
    navigator.clipboard.writeText(SPEECH_BREAKDOWN_TEMPLATE);
    setCopiedSpeechPrompt(true);
    setTimeout(() => setCopiedSpeechPrompt(false), 3000);
  }, []);

  const handleMotionTranscriptFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      motionTranscriptRawTextRef.current = text;
      setMotionTranscriptRawText(text);

      const parsed = parseTranscriptFile(text);
      if (parsed.words.length === 0) {
        setMotionTranscript(null);
        setMotionTranscriptName(null);
        setMotionTranscriptNote(
          `${file.name}: ${parsed.warnings[0] || "no timed words found in that file."}`
        );
        return;
      }
      setMotionTranscript(parsed.words);
      setMotionTranscriptName(file.name);
      setMotionTranscriptNote(
        [parsed.unit === "s" ? "Read as seconds." : "Read as milliseconds.", ...parsed.warnings].join(" ")
      );

      // Upload CSV voiceover file to Cloudflare R2 in background
      try {
        const r2Url = await uploadMotionAssetToR2(file, "motion-csv");
        motionCsvR2UrlRef.current = r2Url;
        setMotionCsvR2Url(r2Url);
      } catch (err) {
        console.warn("Could not upload CSV voiceover to Cloudflare R2:", err);
      }
    } catch (err: any) {
      setMotionTranscript(null);
      setMotionTranscriptName(null);
      setMotionTranscriptNote(`Could not read ${file.name}: ${err?.message || "unknown error"}.`);
    }
  }, []);

  const clearMotionTranscript = useCallback(() => {
    setMotionTranscript(null);
    setMotionTranscriptName(null);
    setMotionTranscriptNote(null);
    motionTranscriptRawTextRef.current = null;
    setMotionTranscriptRawText(null);
    motionCsvR2UrlRef.current = null;
    setMotionCsvR2Url(null);
  }, []);

  const handleMotionAudioFile = useCallback(async (file: File) => {
    if (motionAudioUrlRef.current && motionAudioUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionAudioUrlRef.current);
    }
    motionAudioRef.current?.pause();

    const localUrl = URL.createObjectURL(file);
    motionAudioUrlRef.current = localUrl;
    const audio = new Audio(localUrl);
    audio.preload = "auto";
    motionAudioRef.current = audio;
    setMotionAudioName(file.name);
    seekMotionTo(0);

    // Upload voiceover audio file to Cloudflare R2 in background
    try {
      const r2Url = await uploadMotionAssetToR2(file, "motion-audio");
      motionAudioR2UrlRef.current = r2Url;
      setMotionAudioR2Url(r2Url);
    } catch (err) {
      console.warn("Could not upload voiceover audio to Cloudflare R2:", err);
    }
  }, [seekMotionTo]);

  const clearMotionAudio = useCallback(() => {
    motionAudioRef.current?.pause();
    if (motionAudioUrlRef.current && motionAudioUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionAudioUrlRef.current);
    }
    motionAudioUrlRef.current = null;
    motionAudioRef.current = null;
    motionAudioR2UrlRef.current = null;
    setMotionAudioR2Url(null);
    setMotionAudioName(null);
  }, []);

  const handleMotionMusicFile = useCallback(async (file: File) => {
    if (motionMusicUrlRef.current && motionMusicUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionMusicUrlRef.current);
    }
    motionMusicRef.current?.pause();
    motionMixRef.current = null;

    const localUrl = URL.createObjectURL(file);
    motionMusicUrlRef.current = localUrl;
    const audio = new Audio(localUrl);
    audio.preload = "auto";
    audio.loop = true;
    motionMusicRef.current = audio;
    setMotionMusicName(file.name);

    // Upload background music file to Cloudflare R2 in background
    try {
      const r2Url = await uploadMotionAssetToR2(file, "motion-music");
      motionMusicR2UrlRef.current = r2Url;
      setMotionMusicR2Url(r2Url);
    } catch (err) {
      console.warn("Could not upload background music to Cloudflare R2:", err);
    }
  }, []);

  const clearMotionMusic = useCallback(() => {
    motionMusicRef.current?.pause();
    if (motionMusicUrlRef.current && motionMusicUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionMusicUrlRef.current);
    }
    motionMusicUrlRef.current = null;
    motionMusicRef.current = null;
    motionMusicR2UrlRef.current = null;
    setMotionMusicR2Url(null);
    motionMixRef.current = null;
    setMotionMusicName(null);
  }, []);

  /**
   * One combined picker for both files an auto-sync project needs, instead
   * of hunting down which of two buttons a given file goes in. Each
   * selection is routed by its own extension/MIME type — CSV-like text to
   * the transcript slot, anything audio to the voiceover slot — so a
   * multi-select of both files at once lands each one correctly on its own.
   */
  const handleMotionCombinedFiles = useCallback(
    (files: File[]) => {
      const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|flac|webm)$/i;
      const CSV_EXT = /\.(csv|tsv|txt|srt|vtt|json)$/i;

      let csvFile: File | null = null;
      let audioFile: File | null = null;
      const extras: string[] = [];
      const unrecognized: string[] = [];

      files.forEach((file) => {
        const isAudio = file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
        const isCsvLike =
          !isAudio && (file.type.startsWith("text/") || file.type === "application/json" || CSV_EXT.test(file.name));

        if (isAudio) {
          if (!audioFile) audioFile = file;
          else extras.push(file.name);
        } else if (isCsvLike) {
          if (!csvFile) csvFile = file;
          else extras.push(file.name);
        } else {
          unrecognized.push(file.name);
        }
      });

      if (csvFile) void handleMotionTranscriptFile(csvFile);
      if (audioFile) void handleMotionAudioFile(audioFile);

      if (unrecognized.length > 0 || extras.length > 0) {
        const parts: string[] = [];
        if (unrecognized.length > 0) {
          parts.push(
            `couldn't tell what ${unrecognized.join(", ")} ${
              unrecognized.length === 1 ? "is" : "are"
            } — rename with a .csv or .wav/.mp3 extension and pick it on its own`
          );
        }
        if (extras.length > 0) {
          parts.push(`only the first CSV and the first audio file are used — ignored ${extras.join(", ")}`);
        }
        setSegmentError(parts.join("; ") + ".");
      }
    },
    [handleMotionTranscriptFile, handleMotionAudioFile]
  );

  // Live volume: the gain node when the graph exists, the element otherwise.
  useEffect(() => {
    const mix = motionMixRef.current;
    if (mix) mix.musicGain.gain.value = motionMusicVolume;
    else if (motionMusicRef.current) motionMusicRef.current.volume = motionMusicVolume;
  }, [motionMusicVolume]);

  useEffect(() => {
    motionSpeedRef.current = motionExportSpeed;
    const rate = Math.max(0.25, Math.min(4, motionExportSpeed));
    [motionAudioRef.current, motionMusicRef.current].forEach((el) => {
      if (!el) return;
      try {
        el.playbackRate = rate;
      } catch {
        /* rate out of range for this element */
      }
    });
  }, [motionExportSpeed]);

  useEffect(() => {
    return () => {
      motionMusicRef.current?.pause();
      if (motionMusicUrlRef.current) URL.revokeObjectURL(motionMusicUrlRef.current);
      void motionMixRef.current?.ctx.close();
    };
  }, []);

  useEffect(() => {
    return () => {
      motionAudioRef.current?.pause();
      if (motionAudioUrlRef.current) URL.revokeObjectURL(motionAudioUrlRef.current);
    };
  }, []);

  const motionActiveWord = useMemo(
    () => (motionTranscript ? wordAt(motionTranscript, motionTimeMs) : null),
    [motionTranscript, motionTimeMs]
  );

  /**
   * Confirms audio is actually flowing before the recorder starts rolling.
   *
   * `AudioContext.resume()` and `<audio>.play()` both return promises that
   * settle on their own schedule, and nothing upstream of this used to wait
   * for either one — a MediaRecorder started on a fixed timer could start
   * capturing while the mix graph was still "suspended" or the element had
   * not yet produced a single sample. That gap is silent and invisible in
   * every later frame of the recording, which is exactly what "the voiceover
   * is sometimes missing" looks like: not corrupted, just never there.
   * Polling real state instead of guessing a delay is what closes it.
   */
  const waitForAudioReady = useCallback(async (timeoutMs: number): Promise<boolean> => {
    const audio = motionAudioRef.current;
    const music = motionMusicRef.current;
    if (!audio && !music) return true; // nothing loaded — a silent export is correct here

    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const mix = motionMixRef.current;
      const ctxRunning = mix?.ctx.state === "running";
      const audioFlowing = !audio || (!audio.paused && audio.readyState >= 2);
      const musicFlowing = !music || (!music.paused && music.readyState >= 2);
      const hasLiveTrack =
        !!mix && mix.dest.stream.getAudioTracks().some((t) => t.readyState === "live" && t.enabled);

      if (ctxRunning && audioFlowing && musicFlowing && hasLiveTrack) return true;
      await new Promise((r) => window.setTimeout(r, 40));
    }
    return false;
  }, []);

  /**
   * Records the timeline end to end.
   *
   * MediaRecorder captures a live canvas, so this runs in real time — the clip
   * takes as long as the video does. The voiceover, when loaded, is captured
   * off the same <audio> element that is driving the clock, which is what makes
   * the exported file self-consistent instead of merely close.
   */
  const handleExportTimelineVideo = async () => {
    if (!canvasRef.current || !motionTimeline || isExportingTimeline) return;
    const duration = motionTimeline.durationMs;
    const speed = Math.max(0.25, Math.min(4, motionExportSpeed));

    setIsExportingTimeline(true);
    setTimelineExportElapsed(0);
    setMotionData((prev) => ({ ...prev, activeLayerId: undefined }));

    // A loop restart mid-take would splice the opening frames onto the end.
    const restoreLoop = motionLoopRef.current;
    motionLoopRef.current = false;

    // Every pixel of every slide has to be decoded before the tape rolls. This
    // is the difference between a recording that opens on the first poster and
    // one that opens on black while the images are still arriving — and unlike
    // playback, an export cannot be re-watched once it is wrong.
    const assetsReady = await ensureMotionAssets(motionSlides);
    if (!assetsReady) {
      setSegmentError(
        "Some slide images were still loading after 30s — recording anyway, and any unfinished slide will hold on its full poster instead of animating."
      );
    }

    // A hook plays before the real timeline, inside the very same recording
    // — see playHookPhase. Resolved once, up front, so every branch below
    // agrees on whether there is one; metadata (duration/videoWidth) has to
    // be loaded before drawVideoCover or the safety timeout in playHookPhase
    // can trust it, so a hook picked and exported in the same instant still
    // gets a brief chance to finish loading rather than silently vanishing.
    const selectedHook = motionHookEnabled ? motionHooks.find((h) => h.id === motionSelectedHookId) : undefined;
    const hookEl = selectedHook ? motionHookVideoRef.current : null;
    if (hookEl && hookEl.readyState < 1) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          hookEl.removeEventListener("loadedmetadata", onReady);
          resolve();
        };
        hookEl.addEventListener("loadedmetadata", onReady);
        window.setTimeout(() => {
          hookEl.removeEventListener("loadedmetadata", onReady);
          resolve();
        }, 4000);
      });
    }
    const willPlayHook = !!hookEl && hookEl.readyState >= 1;
    if (selectedHook && !willPlayHook) {
      console.warn("Hook video metadata never loaded in time — exporting without the hook.");
    }

    seekMotionTo(0);

    let progressTimer: number | null = null;
    const finish = () => {
      if (progressTimer !== null) window.clearInterval(progressTimer);
      motionLoopRef.current = restoreLoop;
      setIsExportingTimeline(false);
      setTimelineExportElapsed(null);
    };

    try {
      const canvas = canvasRef.current;

      if (willPlayHook) {
        // Paint one black frame synchronously so the very first frame
        // captureStream sees is real, not stale/garbage — playHookPhase
        // takes over painting actual frames a moment later. The main
        // timeline's own frame 0 must not appear here: it hasn't "started"
        // yet in any sense a viewer should see.
        const W = Math.max(1, Math.round(ar.w));
        const H = Math.max(1, Math.round(ar.h));
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;
        const warmCtx = canvas.getContext("2d");
        if (warmCtx) {
          warmCtx.setTransform(1, 0, 0, 1, 0, 0);
          warmCtx.fillStyle = "#000000";
          warmCtx.fillRect(0, 0, W, H);
        }
      } else {
        setIsPlayingMotion(true);
        // Wait for the rewound frame to be on the canvas before recording —
        // but never wait forever. A backgrounded or throttled tab stops
        // firing animation frames entirely, and a bare double-rAF await
        // there leaves the export wedged on "RECORDING 0:00" with no error
        // and no way out.
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          requestAnimationFrame(() => requestAnimationFrame(done));
          window.setTimeout(done, 250);
        });
      }

      const stream = canvas.captureStream(motionTimeline.fps);

      // One mixed audio track, not one per source: the voiceover, the music
      // bed and (while it plays) the hook are all summed in the graph and
      // captured together.
      const mix = ensureMotionMix();
      if (mix) {
        mix.dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } else if (!willPlayHook) {
        const audio = motionAudioRef.current as (HTMLAudioElement & { captureStream?: () => MediaStream }) | null;
        if (audio?.captureStream) {
          try {
            audio.captureStream().getAudioTracks().forEach((track) => stream.addTrack(track));
          } catch {
            /* video-only export — the timeline is still frame-accurate */
          }
        }
      }

      const mimeType = MP4_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mimeType) {
        throw new Error(
          "This browser cannot record MP4. Chrome 126+, Edge or Safari can — open the app there and export again."
        );
      }

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
      // Set when the hook plays fine but the main timeline's own audio never
      // confirms ready below — the hook's few seconds are already inside
      // `chunks` by then, so onstop has to know to throw them away rather
      // than download a recording that silently loses its voiceover.
      let discardRecording = false;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (discardRecording) return;
        const blob = new Blob(chunks, { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const tag = speed === 1 ? "" : `-${String(speed).replace(".", "_")}x`;
        a.href = url;
        a.download = `stratix-motion-synced${tag}-${Date.now()}.mp4`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        finish();
      };

      recorder.start();

      if (willPlayHook && hookEl) {
        // Guards the render effect off the canvas for the same reason the
        // live preview does (see its isHookPhasePlaying check) — with
        // isPlayingMotion still false here, nothing is driving motionTimeMs,
        // but an unrelated re-render could still fire that effect and paint
        // the timeline's frame 0 over the hook mid-playback without it.
        setIsHookPhasePlaying(true);
        try {
          await playHookPhase(hookEl, true);
        } finally {
          setIsHookPhasePlaying(false);
        }
      }

      // Exactly the pre-hook single-phase export from here on — the main
      // timeline starts recording only once any hook has already finished,
      // into the very same recorder/stream/chunks above.
      setIsPlayingMotion(true);
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        requestAnimationFrame(() => requestAnimationFrame(done));
        window.setTimeout(done, 250);
      });

      const hasAudioSource = !!motionAudioRef.current || !!motionMusicRef.current;
      let audioConfirmed = await waitForAudioReady(1500);
      if (hasAudioSource && !audioConfirmed) {
        // One nudge before giving up — a dropped play() promise or a context
        // that needed a second resume() is recoverable, not a hard failure.
        seekMotionTo(0);
        motionAudioRef.current?.play().catch(() => {});
        motionMusicRef.current?.play().catch(() => {});
        audioConfirmed = await waitForAudioReady(1500);
      }
      if (hasAudioSource && !audioConfirmed) {
        discardRecording = true;
        if (recorder.state !== "inactive") recorder.stop();
        setSegmentError(
          "Could not confirm the voiceover was actually playing before recording started, so the export was cancelled rather than risk a silent video. Press Play once to warm up audio, then Export again."
        );
        finish();
        return;
      }

      // Confirmed a moment ago in waitForAudioReady, but the track list is
      // rebuilt above — a source that was live then and silently dropped its
      // track since (device change, element reset) must not still export as
      // if nothing were wrong.
      if (hasAudioSource && stream.getAudioTracks().length === 0) {
        throw new Error(
          "A voiceover or music file is loaded, but no audio track could be attached to the recording. Reload the audio file and export again."
        );
      }

      const startedAt = performance.now();
      progressTimer = window.setInterval(() => {
        setTimelineExportElapsed((performance.now() - startedAt) * speed);
      }, 100);

      // Recording happens in real time, so a 2x export finishes in half the
      // wall time. A short tail keeps the final frame (and any exit fade).
      window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, duration / speed + 300);
    } catch (e: any) {
      console.error("Failed to record synced motion video:", e);
      setSegmentError(e?.message || "Failed to record the video.");
      finish();
    }
  };

  // Motion Video Recording Exporter
  const handleExportMotionVideo = async () => {
    if (!canvasRef.current) return;
    setIsRecordingVideo(true);

    // Selection handles are editor chrome; without this they get recorded into
    // the exported clip.
    const restoreSelection = motionData.activeLayerId;
    setMotionData((prev) => ({ ...prev, activeLayerId: undefined, isExporting: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const canvas = canvasRef.current;
      const stream = canvas.captureStream(60);
      const mimeType = MP4_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mimeType) {
        throw new Error(
          "This browser cannot record MP4. Chrome 126+, Edge or Safari can — open the app there and export again."
        );
      }
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const slideName = (motionData.fileName || "").replace(/\.[^.]+$/, "") || `slide-${activeMotionIndex + 1}`;
        a.href = url;
        a.download = `stratix-motion-${slideName}-${Date.now()}.mp4`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setIsRecordingVideo(false);
        setMotionData((prev) => ({ ...prev, activeLayerId: restoreSelection, isExporting: false }));
      };

      recorder.start();
      setTimeout(() => {
        recorder.stop();
      }, 5000);
    } catch (e) {
      console.error("Failed to record motion video:", e);
      setIsRecordingVideo(false);
      setMotionData((prev) => ({ ...prev, activeLayerId: restoreSelection, isExporting: false }));
    }
  };

  // Scroll-to-zoom on the news poster image. React 19 attaches the delegated
  // "wheel" listener as passive by default, so preventDefault() inside a
  // normal onWheel prop is silently ignored (and warns) — a native listener
  // with { passive: false } is required to actually stop page scroll here.
  const wheelNodeRef = useRef<HTMLDivElement | null>(null);
  const handleImageWheelNative = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setNewsData((prev) => {
      const idx = activeNewsIndex;
      const item = prev[idx];
      if (!item?.imageUrl) return prev;
      const current = item.imageZoom ?? 1;
      const next = Math.max(1, Math.min(2.5, current - Math.sign(e.deltaY) * 0.08));
      const updated = [...prev];
      updated[idx] = { ...item, imageZoom: next };
      setJsonText(JSON.stringify(updated, null, 2));
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNewsIndex]);

  const setImageWheelRef = useCallback((node: HTMLDivElement | null) => {
    if (wheelNodeRef.current) {
      wheelNodeRef.current.removeEventListener("wheel", handleImageWheelNative);
    }
    wheelNodeRef.current = node;
    if (node) {
      node.addEventListener("wheel", handleImageWheelNative, { passive: false });
    }
  }, [handleImageWheelNative]);

  // File → data URL → active poster's imageUrl. Shared by the hidden file
  // input (click-to-upload) and every drag-and-drop zone below.
  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === "string") {
        const compressed = await compressImage(reader.result);
        handleUpdateField("imageUrl", compressed);
      }
    };
    reader.readAsDataURL(file);
  };

  // Query for the "Search Photos" picker — the headline alone reads like a
  // real stock-photo search query; falls back to the takeaway/description
  // for items (e.g. bento cards) that don't carry a title of their own.
  const buildWebSearchQuery = (item: NewsItem | undefined | null): string =>
    (item?.title || item?.keyTakeaway || item?.description || "").trim().slice(0, 150);

  const handleWebImageSelect = async (dataUrl: string) => {
    handleUpdateField("imageUrl", await compressImage(dataUrl));
  };

  // Pexels top-hit, no picking — used by applyPosterSelection (the
  // end-to-end "Generate" pipeline) and "Fill Images" so a whole batch can
  // be illustrated in one click instead of clicking through the picker grid
  // per poster. Never throws.
  //
  // Deliberately distinguishes three outcomes rather than collapsing them to
  // an empty string: a search that simply found nothing (fine — that poster
  // stays imageless), a one-off download failure, and a `fatal` config error
  // like an unset PEXELS_API_KEY, which will fail identically for every other
  // poster in the batch. Callers use `fatal` to stop firing a batch of doomed
  // requests and to surface one clear message instead of filling nothing at
  // all and saying nothing about it.
  const fetchTopPexelsImage = async (
    query: string
  ): Promise<{ imageUrl: string; error?: string; fatal?: boolean }> => {
    if (!query.trim()) return { imageUrl: "" };
    try {
      const searchRes = await fetch("/api/content-creator/search-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const searchData = await parseJsonResponse(searchRes);
      if (!searchRes.ok) {
        return {
          imageUrl: "",
          error: searchData?.error || `Image search failed (HTTP ${searchRes.status}).`,
          // search-image returns 500 only when PEXELS_API_KEY is missing, and
          // 401/403 mean Pexels rejected the key itself — all three are
          // configuration problems that retrying cannot get past.
          fatal: searchRes.status === 500 || searchRes.status === 401 || searchRes.status === 403,
        };
      }

      const top = Array.isArray(searchData.results) ? searchData.results[0] : null;
      if (!top?.imageUrl) return { imageUrl: "" };

      const fetchRes = await fetch("/api/content-creator/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: top.imageUrl }),
      });
      const fetchData = await parseJsonResponse(fetchRes);
      if (!fetchRes.ok || typeof fetchData?.imageUrl !== "string") {
        return {
          imageUrl: "",
          error: fetchData?.error || `Could not download that image (HTTP ${fetchRes.status}).`,
        };
      }
      return { imageUrl: await compressImage(fetchData.imageUrl) };
    } catch (e) {
      return { imageUrl: "", error: e instanceof Error ? e.message : "Image lookup failed." };
    }
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange
    e.target.value = "";
    if (file) processImageFile(file);
  };

  // Dragging a file anywhere over an image drop zone — highlight it exactly
  // like the existing hover treatment so drag feels like an extension of
  // click-to-upload, not a separate feature.
  const handleImageDragOver = (e: React.DragEvent<HTMLElement>, accentColor: string) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.currentTarget.style.borderColor = accentColor;
    e.currentTarget.style.backgroundColor = `${accentColor}25`;
    e.currentTarget.style.borderStyle = "solid";
  };

  const handleImageDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "transparent";
    e.currentTarget.style.backgroundColor = "transparent";
    e.currentTarget.style.borderStyle = "dashed";
  };

  const handleImageDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = "transparent";
    e.currentTarget.style.backgroundColor = "transparent";
    e.currentTarget.style.borderStyle = "dashed";
    const file = e.dataTransfer.files?.[0];
    if (file) processImageFile(file);
  };

  // Clear highlighted field styling after 2 seconds
  useEffect(() => {
    if (highlightedField) {
      const timer = setTimeout(() => {
        setHighlightedField(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightedField]);

  // Metrics handlers
  const handleUpdateMetric = (index: number, field: "label" | "value", val: string) => {
    const nextMetrics = [...(parsedData.metrics || [])];
    if (nextMetrics[index]) {
      nextMetrics[index] = { ...nextMetrics[index], [field]: val };
      const updated = { ...parsedData, metrics: nextMetrics };
      setParsedData(updated);
      if (creatorMode === "indicator") {
        setJsonText(JSON.stringify(updated, null, 2));
      }
    }
  };

  const handleDeleteMetric = (index: number) => {
    const nextMetrics = (parsedData.metrics || []).filter((_, i) => i !== index);
    const updated = { ...parsedData, metrics: nextMetrics };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  const handleAddMetric = () => {
    const nextMetrics = [...(parsedData.metrics || []), { label: "NEW METRIC", value: "Value" }];
    const updated = { ...parsedData, metrics: nextMetrics };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Sections handlers
  const handleUpdateSection = (index: number, field: "label" | "content", val: string) => {
    const nextSections = [...(parsedData.sections || [])];
    if (nextSections[index]) {
      nextSections[index] = { ...nextSections[index], [field]: val };
      const updated = { ...parsedData, sections: nextSections };
      setParsedData(updated);
      if (creatorMode === "indicator") {
        setJsonText(JSON.stringify(updated, null, 2));
      }
    }
  };

  const handleDeleteSection = (index: number) => {
    const nextSections = (parsedData.sections || []).filter((_, i) => i !== index);
    const updated = { ...parsedData, sections: nextSections };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  const handleAddSection = () => {
    const nextSections = [...(parsedData.sections || []), { label: "NEW SECTION", content: "Section details..." }];
    const updated = { ...parsedData, sections: nextSections };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Tag handlers
  const handleAddTag = (tagStr: string) => {
    const trimmed = tagStr.trim();
    if (!trimmed) return;
    const nextTags = [...(parsedData.tags || []), trimmed];
    const updated = { ...parsedData, tags: nextTags };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  const handleDeleteTag = (index: number) => {
    const nextTags = (parsedData.tags || []).filter((_, i) => i !== index);
    const updated = { ...parsedData, tags: nextTags };
    setParsedData(updated);
    if (creatorMode === "indicator") {
      setJsonText(JSON.stringify(updated, null, 2));
    }
  };

  // Render poster to canvas
  const render = useCallback(() => {
    // Motion mode owns the canvas from its own effect: its frames need the
    // decoded layer images, which this path has no access to. Letting it run
    // here repaints the poster from `jsonText` (the layout JSON) and wipes the
    // frame down to a bare background — visible as a blank preview the moment
    // anything else re-renders, e.g. a viewport resize changing `ar`.
    if (creatorMode === "motion") return;

    let activeData: any;
    try {
      const parsed = JSON.parse(jsonText);
      if (isBatchMode) {
        if (Array.isArray(parsed) && parsed.length > 0) {
          activeData = withBentoImageFallback(parsed[activeNewsIndex] || parsed[0], parsed);
        } else {
          activeData = parsed;
        }
      } else {
        activeData = parsed;
      }
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
      return;
    }

    if (!activeData) return;

    if (activeData.imageUrl) {
      const imageUrl = activeData.imageUrl;
      if (loadedImagesRef.current[imageUrl]) {
        const imgEl = loadedImagesRef.current[imageUrl];
        activeImgRef.current = imgEl;
        if (canvasRef.current) {
          const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, imgEl, creatorMode, (visibleNewsPosition === -1 ? 0 : visibleNewsPosition), visibleNewsCount, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
          setElementBounds(bounds);
          setRendered(true);
        }
      } else {
        const imgEl = new Image();
        imgEl.crossOrigin = "anonymous";
        imgEl.onload = () => {
          loadedImagesRef.current[imageUrl] = imgEl;
          activeImgRef.current = imgEl;
          if (canvasRef.current) {
            const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, imgEl, creatorMode, (visibleNewsPosition === -1 ? 0 : visibleNewsPosition), visibleNewsCount, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
            setElementBounds(bounds);
            setRendered(true);
          }
        };
        imgEl.onerror = () => {
          activeImgRef.current = null;
          if (canvasRef.current) {
            const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, null, creatorMode, (visibleNewsPosition === -1 ? 0 : visibleNewsPosition), visibleNewsCount, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
            setElementBounds(bounds);
            setRendered(true);
          }
        };
        imgEl.src = imageUrl;
      }
    } else {
      activeImgRef.current = null;
      if (canvasRef.current) {
        const bounds = drawPoster(canvasRef.current, activeData, ar, colors, config, null, creatorMode, (visibleNewsPosition === -1 ? 0 : visibleNewsPosition), visibleNewsCount, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme);
        setElementBounds(bounds);
        setRendered(true);
      }
    }
  }, [jsonText, ar, colors, config, creatorMode, isBatchMode, activeNewsIndex, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme, visibleNewsPosition, visibleNewsCount]);

  // Re-render when dependencies change
  useEffect(() => {
    render();
  }, [render]);

  // The Bold headline is set in Anton, a self-hosted display font — canvas
  // text doesn't wait for webfonts the way DOM text does, so a render that
  // fires before the font finishes downloading silently falls back to the
  // system stack and never self-corrects. Force one re-paint once it's ready.
  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    document.fonts.load(`400 100px ${getAntonFontFamily()}`).then(() => render()).catch(() => {});
  }, [render]);

  // Auto-persist an already-saved batch to the DB whenever it changes — most
  // importantly the moment an image is attached, so the image lands in the DB
  // for that news/facts/learnings entry without a manual re-save. Debounced,
  // PUT-only (never creates a new entry), and skips no-op saves via a cheap
  // signature (image byte-length, not the megabytes of base64 themselves).
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSaveSigRef = useRef<string>("");
  useEffect(() => {
    if (!activeHistoryId || !isBatchMode || newsData.length === 0) return;

    const sig = [
      activeHistoryId, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, ratioId,
      JSON.stringify(colors), JSON.stringify(config),
      newsData.map((d: any) => `${d.title || ""}~${d.description || ""}~${d.imageUrl?.length || 0}~${d.imageFocusX ?? ""}~${d.imageFocusY ?? ""}~${d.imageZoom ?? ""}~${d.impact || ""}~${d.sentiment || ""}`).join("#"),
    ].join("|");
    if (sig === lastAutoSaveSigRef.current) return;

    const payload: Record<string, unknown> = { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme };
    if (creatorMode === "news" && batchMeta) {
      payload.timeRangeLabel = batchMeta.timeRangeLabel;
      payload.reportGeneratedAt = batchMeta.reportGeneratedAt;
    }

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      lastAutoSaveSigRef.current = sig;
      fetch(`/api/content-creator/history/${activeHistoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemCount: newsData.length, payload }),
      }).catch((e) => console.warn("Auto-save failed:", e));
    }, 500);

    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsData, activeHistoryId, isBatchMode, creatorMode, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, batchMeta]);

  async function download() {
    if (!rendered) return;

    const tempCanvas = document.createElement("canvas");
    const scaleFactor = 3.0; // 3x high resolution
    const highResAr = {
      ...ar,
      w: ar.w * scaleFactor,
      h: ar.h * scaleFactor
    };

    let activeData: any;
    try {
      const parsed = JSON.parse(jsonText);
      if (isBatchMode) {
        if (Array.isArray(parsed) && parsed.length > 0) {
          activeData = withBentoImageFallback(parsed[activeNewsIndex] || parsed[0], parsed);
        } else {
          activeData = parsed;
        }
      } else {
        activeData = parsed;
      }
    } catch {
      return;
    }

    if (!activeData) return;

    drawPoster(
      tempCanvas,
      activeData,
      highResAr,
      colors,
      config,
      activeImgRef.current,
      creatorMode,
      (visibleNewsPosition === -1 ? 0 : visibleNewsPosition),
      visibleNewsCount,
      posterStyle,
      activeGradient,
      editorialTheme,
      gradientFade,
      sentimentScheme
    );

    let baseName = `stratix-poster-${ratioId}-${Date.now()}`;
    if (creatorMode === "analysis") {
      const symbol = (analysisData.instrument || "analysis").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      baseName = `stratix-analysis-${symbol}-${ratioId}-${Date.now()}`;
    } else if (isBatchMode && newsData[activeNewsIndex]) {
      const titleSlug = (newsData[activeNewsIndex].title || creatorMode).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20);
      baseName = `stratix-${creatorMode}-${activeNewsIndex + 1}-${titleSlug}-${ratioId}-${Date.now()}`;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      tempCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
    });

    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  // Preloads images in parallel and packages the SELECTED batch cards
  // (respecting hideBento + the per-item ZIP checkboxes) into a high-res ZIP.
  // Falls back to every item when there's no selection concept for this mode
  // (facts/learnings never populate hideBento/deselectedForZip).
  const downloadAll = async () => {
    if (!isBatchMode || newsData.length === 0) return;
    const includedIndices = zipIncludedIndices;
    if (includedIndices.length === 0) return;
    setDownloadingZip(true);

    try {
      // 1. Preload background images for the included items only, in parallel
      await Promise.all(
        includedIndices.map(async (idx) => {
          const imageUrl = newsData[idx].imageUrl;
          if (!imageUrl || loadedImagesRef.current[imageUrl]) return;

          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";
          await new Promise((resolve) => {
            imgEl.onload = () => {
              loadedImagesRef.current[imageUrl] = imgEl;
              resolve(null);
            };
            imgEl.onerror = () => resolve(null);
            imgEl.src = imageUrl;
          });
        })
      );

      // 2. Render each included poster sequentially on a high-res temporary
      // canvas and add to JSZip — numbering (both the on-canvas "X of Y" and
      // the filename) is based on position within the included subset, so
      // exported files stay gap-free regardless of what was excluded.
      const zip = new JSZip();
      const scaleFactor = 1.5;
      const highResAr = {
        ...ar,
        w: Math.round(ar.w * scaleFactor),
        h: Math.round(ar.h * scaleFactor)
      };

      for (let pos = 0; pos < includedIndices.length; pos++) {
        await new Promise((resolve) => setTimeout(resolve, 20));

        const idx = includedIndices[pos];
        const item = withBentoImageFallback(newsData[idx], newsData);
        const tempCanvas = document.createElement("canvas");
        const cachedImg = item.imageUrl ? loadedImagesRef.current[item.imageUrl] : null;

        drawPoster(
          tempCanvas,
          item,
          highResAr,
          colors,
          config,
          cachedImg,
          creatorMode,
          pos,
          includedIndices.length,
          posterStyle,
          activeGradient,
          editorialTheme,
          gradientFade,
          sentimentScheme
        );

        const blob = await new Promise<Blob | null>((resolve) => {
          tempCanvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
        });

        if (blob) {
          const titleSlug = (item.title || creatorMode)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 20);

          const fileName = `stratix-${creatorMode}-${pos + 1}-${titleSlug}.jpg`;
          zip.file(fileName, blob);
        }
      }

      const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stratix-${creatorMode}-batch-${ratioId}-${Date.now()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("ZIP Generation failed:", e);
    } finally {
      setDownloadingZip(false);
    }
  };

  // Renders every included batch poster at native reel resolution (1080x1920)
  // via the exact same drawPoster pipeline as downloadAll — reels always
  // convert to the 9:16 format regardless of the ratio currently selected in
  // the editor. Returns plain dataUrls; the Reel Studio modal owns everything
  // audio/video/export related and never touches poster-rendering internals.
  const generateReelSlides = async (): Promise<ReelSlideSource[]> => {
    if (!isBatchMode || newsData.length === 0) return [];
    const includedIndices = zipIncludedIndices;
    if (includedIndices.length === 0) return [];

    await Promise.all(
      includedIndices.map(async (idx) => {
        const imageUrl = newsData[idx].imageUrl;
        if (!imageUrl || loadedImagesRef.current[imageUrl]) return;

        const imgEl = new Image();
        imgEl.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          imgEl.onload = () => {
            loadedImagesRef.current[imageUrl] = imgEl;
            resolve(null);
          };
          imgEl.onerror = () => resolve(null);
          imgEl.src = imageUrl;
        });
      })
    );

    const reelAr = { id: "story", label: "9:16", w: REEL_W, h: REEL_H, desc: "Reel" };
    const slides: ReelSlideSource[] = [];

    for (let pos = 0; pos < includedIndices.length; pos++) {
      const idx = includedIndices[pos];
      const item = withBentoImageFallback(newsData[idx], newsData);
      const tempCanvas = document.createElement("canvas");
      const cachedImg = item.imageUrl ? loadedImagesRef.current[item.imageUrl] : null;

      drawPoster(
        tempCanvas,
        item,
        reelAr,
        colors,
        config,
        cachedImg,
        creatorMode,
        pos,
        includedIndices.length,
        posterStyle,
        activeGradient,
        editorialTheme,
        gradientFade,
        sentimentScheme,
        REEL_TEXT_SCALE,
        true // isReel
      );

      slides.push({ title: item.title || `${creatorMode} ${pos + 1}`, dataUrl: tempCanvas.toDataURL("image/png") });
    }

    return slides;
  };

  // Style helpers for text inputs
  const inputStyle = {
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    color: "#ffffff",
    outline: "none",
    fontFamily: "var(--font-sans), sans-serif",
  };

  const getFieldClassName = (fieldId: string) => {
    return `w-full rounded-xl px-3 py-2 text-[12px] outline-none transition-all duration-300 focus:border-white/20 focus:ring-1 focus:ring-white/10 ${
      highlightedField === fieldId ? "ring-2 ring-white/30 border-white/40 bg-white/5 text-white" : ""
    }`;
  };

  const TABS = [
    { id: "content", label: "Content", icon: Edit3 },
    { id: "colors", label: "Colors", icon: Palette },
    { id: "layout", label: "Layout", icon: Sliders },
    { id: "json", label: "JSON", icon: Code2 },
    { id: "ai-prompt", label: "AI Prompt", icon: Bot },
    { id: "prompt-builder", label: "Prompt Builder", icon: Wand2 },
  ];

  return (
    <div className="flex h-full overflow-hidden text-white/80 font-sans selection:bg-white/10 selection:text-white relative">
      {/* Backdrop — mobile only, closes the panel when it's shown as an overlay drawer */}
      {!panelCollapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setPanelCollapsed(true)}
          aria-hidden="true"
        />
      )}
      {/* ── Left Panel ─────────────────────────────────────────────────────── */}
      {/* On mobile this floats as a full-height overlay drawer over the canvas
          (fixed + z-40) instead of squeezing a 350px column out of a ~375px
          viewport; md+ keeps the original in-flow collapse/expand behavior. */}
      <div
        className={`flex flex-col shrink-0 overflow-hidden glass-liquid transition-all duration-300 ease-in-out fixed md:relative inset-y-0 left-0 z-40 md:z-auto ${
          panelCollapsed ? "w-0 border-r-0 opacity-0 pointer-events-none" : "w-[85vw] max-w-[350px] md:w-[350px] border-r opacity-100"
        }`}
        style={{ borderColor: "rgba(255, 255, 255, 0.08)" }}
      >
        {/* Static content container to avoid squishing during collapse transition — matches the expanded outer width exactly */}
        <div className="w-[85vw] max-w-[350px] md:w-[350px] flex flex-col h-full flex-grow">
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b shrink-0"
            style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPanelCollapsed(true)}
                className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition cursor-pointer"
                title="Collapse Panel"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Layers2 className="h-4 w-4 shrink-0 text-white/60" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-white/90">
                Content Creator
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSetAsDefault}
                disabled={defaultSaveStatus === "saving"}
                title="Save the current style settings (ratio, colors, poster style, gradient, fade, highlight colors) as your default for every future visit"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border cursor-pointer disabled:cursor-wait ${
                  defaultSaveStatus === "saved"
                    ? "border-emerald-500/[0.35] bg-emerald-500/[0.14] text-emerald-300"
                    : defaultSaveStatus === "error"
                    ? "border-red-500/[0.35] bg-red-500/[0.14] text-red-300"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/60 hover:text-white/90"
                }`}
              >
                <Star className={`h-3 w-3 ${defaultSaveStatus === "saved" ? "fill-emerald-300" : ""}`} />
                <span className="hidden xs:inline">
                  {defaultSaveStatus === "saving" ? "Saving…" : defaultSaveStatus === "saved" ? "Saved" : defaultSaveStatus === "error" ? "Failed" : "Set as Default"}
                </span>
              </button>
              {creatorMode === "news" && rawBatchCandidates.length > 0 && (
                <button
                  onClick={() => setShowSelectionModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border border-emerald-500/[0.25] bg-emerald-500/[0.1] hover:bg-emerald-500/[0.16] cursor-pointer text-emerald-300"
                >
                  <ListChecks className="h-3 w-3" /> Select Posters
                </button>
              )}
            </div>
          </div>

        {/* Creator Mode Switcher */}
        <div className="px-4 py-1.5 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          <label className="text-[8.5px] font-bold uppercase tracking-widest text-[#787870] block mb-1">
            Creator Mode
          </label>
          {/* Horizontally scrollable strip — 5 labels (incl. two-word ones like
              "Daily Analysis") never fit evenly in a 3-wide grid on the ~300px
              mobile panel without wrapping onto 2 lines, so each pill sizes to
              its own text and the strip scrolls instead. */}
          <div className="flex gap-0.5 bg-white/[0.02] border border-white/[0.06] p-0.5 rounded-lg overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["analysis", "news", "indicator", "facts", "learnings", "watermark", "motion"] as const).map((m) => {
              const active = creatorMode === m;
              const labels: Record<CreatorMode, string> = {
                analysis: "Daily Analysis",
                news: "News Batch",
                indicator: "Indicator",
                facts: "Facts",
                learnings: "Learnings",
                watermark: "Logo Watermark",
                motion: "Motion Video",
              };
              return (
                <button
                  key={m}
                  onClick={() => setCreatorMode(m)}
                  className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 rounded-md transition-all cursor-pointer text-[9.5px] font-bold uppercase tracking-wider text-center ${
                    active
                      ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                      : "text-[#787870] hover:text-white/60"
                  }`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-4 py-1 border-b shrink-0" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          <div className="flex bg-white/[0.03] border border-white/[0.06] p-0.5 rounded-lg">
            <TooltipProvider delay={100}>
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger
                      render={
                        <button
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all cursor-pointer ${
                            active
                              ? "bg-white/[0.08] text-white border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                              : "text-[#787870] hover:text-white/60"
                          }`}
                        />
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent side="top">{tab.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </div>

        {/* Scrollable Configuration Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* CONTENT TAB */}
          {activeTab === "content" && (
            <div className="space-y-3.5">
              
              {creatorMode === "analysis" && (
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
              )}

              {creatorMode === "news" && (
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
              )}

              {(creatorMode === "facts" || creatorMode === "learnings") && (
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
              )}

              {creatorMode === "watermark" && (
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
              )}

              {creatorMode === "motion" && (
                <div className="space-y-4">
                  {/* Header & Status Banner */}
                  <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clapperboard className="h-4 w-4 text-purple-400" />
                        <span className="text-xs font-bold text-white uppercase tracking-wider">Python Motion Video</span>
                      </div>
                      <span className="text-[9px] font-bold text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                        OPENCV CV (ZERO AI)
                      </span>
                    </div>
                    <p className="text-[10.5px] text-white/60 leading-relaxed">
                      Upload up to 50 images at once, processed in batches. OpenCV + tesseract read each poster&apos;s collage grid from its own divider rules, cut every part edge to edge at full resolution, and read each part&apos;s caption verbatim so it matches the script. You pick how deep to cut on upload.
                    </p>
                  </div>

                  {/* File Upload Dropzone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      if (e.dataTransfer.files?.length) {
                        handleMotionFilesUpload(e.dataTransfer.files);
                      }
                    }}
                    onClick={() => motionFileInputRef.current?.click()}
                    className="p-6 rounded-2xl border-2 border-dashed border-purple-500/40 bg-purple-500/[0.03] hover:bg-purple-500/[0.08] hover:border-purple-500/70 transition-all text-center cursor-pointer group"
                  >
                    <input
                      ref={motionFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          handleMotionFilesUpload(e.target.files);
                          e.target.value = "";
                        }
                      }}
                    />
                    <div className="w-12 h-12 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto mb-2.5 group-hover:scale-110 transition-transform">
                      <Upload className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-bold text-white mb-0.5">Click or Drag &amp; Drop Images to Decompose</p>
                    <p className="text-[10px] text-white/40">
                      Up to 50 slides at once — you&apos;ll pick the decomposition strength next
                      {motionSlides.length > 0 ? ` (last used: ${motionStrength})` : ""}
                    </p>
                  </div>

                  {/* Segmentation Loading Spinner */}
                  {isSegmenting && (
                    <div className="p-4 rounded-xl border border-purple-500/40 bg-purple-500/15 flex items-center gap-3 text-white animate-pulse">
                      <Loader2 className="h-5 w-5 text-purple-400 animate-spin shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-purple-200">
                          Decomposing {segmentProgress ? `${segmentProgress.total} image${segmentProgress.total === 1 ? "" : "s"}` : "image"}…
                        </p>
                        <p className="text-[10px] text-white/50">
                          {motionStrength === "low"
                            ? "Reading each collage part and its caption, at full resolution"
                            : motionStrength === "standard"
                            ? "Reading each collage part, its caption and the props inside it"
                            : "Reading every shape inside every collage part"}
                        </p>
                      </div>
                    </div>
                  )}

                  {segmentError && (
                    <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[10.5px] text-amber-200/90 leading-relaxed break-words">{segmentError}</p>
                    </div>
                  )}

                  {watermarkError && (
                    <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[10.5px] text-amber-200/90 leading-relaxed break-words">{watermarkError}</p>
                    </div>
                  )}

                  {motionOrderNotice && (
                    <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-start gap-2">
                      <Shuffle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-[10.5px] text-emerald-200/90 leading-relaxed break-words flex-1">
                        {motionOrderNotice.message}
                      </p>
                      <button
                        onClick={() => {
                          setMotionSlides(motionOrderNotice.previousOrder);
                          setActiveMotionIndex(0);
                          setMotionOrderNotice(null);
                        }}
                        className="text-[10px] font-bold text-emerald-300 hover:text-emerald-100 underline shrink-0 cursor-pointer"
                      >
                        Revert
                      </button>
                      <button
                        onClick={() => setMotionOrderNotice(null)}
                        className="p-0.5 rounded text-emerald-300/60 hover:text-emerald-100 shrink-0 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Slide Switcher — one entry per uploaded image */}
                  {motionSlides.length > 1 && (
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                          Slides ({motionSlides.length})
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowFixSlideOrderModal(true)}
                            title="Read each poster's printed slide number and fix a shuffled order"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] text-white/55 hover:text-white/90 transition cursor-pointer"
                          >
                            <Shuffle className="h-2.5 w-2.5" />
                            <span className="text-[8.5px] font-bold uppercase tracking-wide">Fix Order</span>
                          </button>
                          <button
                            onClick={handleRemoveAllWatermarks}
                            disabled={isRemovingWatermarks || isSegmenting}
                            title="Detect and erase a Grok Imagine watermark from every slide's image"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] text-white/55 hover:text-white/90 transition cursor-pointer disabled:opacity-40 disabled:cursor-wait"
                          >
                            {isRemovingWatermarks ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              <Eraser className="h-2.5 w-2.5" />
                            )}
                            <span className="text-[8.5px] font-bold uppercase tracking-wide">
                              {isRemovingWatermarks && watermarkProgress
                                ? `${watermarkProgress.done}/${watermarkProgress.total}`
                                : "Remove Watermark"}
                            </span>
                          </button>
                          <span className="text-[9.5px] font-mono text-white/40">
                            {activeMotionIndex + 1} / {motionSlides.length}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {motionSlides.map((s, i) => (
                          <button
                            key={s.slideId}
                            onClick={() => {
                              // Under a timeline the slide order is the video's
                              // own — picking a slide means jumping to its scene.
                              const scene = motionTimeline?.scenes.find((sc) => sc.slideIndex === i);
                              if (scene) seekMotionTo(scene.startMs);
                              else setActiveMotionIndex(i);
                            }}
                            title={s.fileName}
                            className={`relative rounded-lg border overflow-hidden transition cursor-pointer ${
                              i === activeMotionIndex
                                ? "border-purple-500/70 ring-1 ring-purple-500/40"
                                : "border-white/10 hover:border-white/30"
                            }`}
                          >
                            {s.originalUrl ? (
                              <img src={s.originalUrl} alt="" className="w-full aspect-[4/5] object-cover" />
                            ) : (
                              <div className="w-full aspect-[4/5] bg-black/40" />
                            )}
                            <span className="absolute top-0.5 left-0.5 text-[8.5px] font-bold text-white bg-black/70 rounded px-1">
                              {i + 1}
                            </span>
                            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono text-purple-200 bg-black/70 rounded px-1">
                              {s.layers.length}L
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Timeline — paste an audio-synced choreography and play it */}
                  {motionSlides.length > 0 && (
                    <MotionTimelinePanel
                      slideCount={motionSlides.length}
                      timelineText={motionTimelineText}
                      onTimelineTextChange={setMotionTimelineText}
                      timeline={motionTimeline}
                      report={motionTimelineReport}
                      onApply={applyMotionTimeline}
                      onClear={clearMotionTimeline}
                      timeMs={motionTimeMs}
                      onSeek={seekMotionTo}
                      isPlaying={isPlayingMotion || isHookPhasePlaying}
                      onTogglePlay={handleToggleMotionPlay}
                      onPlaySfx={playMotionSfx}
                      sfxEnabled={motionSfxEnabled}
                      onSfxEnabledChange={setMotionSfxEnabled}
                      sfxVolume={motionSfxVolume}
                      onSfxVolumeChange={setMotionSfxVolume}
                      loop={motionLoop}
                      onToggleLoop={() => setMotionLoop((l) => !l)}
                      transcript={motionTranscript}
                      transcriptName={motionTranscriptName}
                      transcriptNote={motionTranscriptNote}
                      onTranscriptFile={handleMotionTranscriptFile}
                      onClearTranscript={clearMotionTranscript}
                      onCombinedFiles={handleMotionCombinedFiles}
                      activeWord={motionActiveWord}
                      audioName={motionAudioName}
                      onAudioFile={handleMotionAudioFile}
                      onClearAudio={clearMotionAudio}
                      musicName={motionMusicName}
                      onMusicFile={handleMotionMusicFile}
                      onClearMusic={clearMotionMusic}
                      musicVolume={motionMusicVolume}
                      onMusicVolumeChange={setMotionMusicVolume}
                      exportSpeed={motionExportSpeed}
                      onExportSpeedChange={setMotionExportSpeed}
                      hooks={motionHooks}
                      hookEnabled={motionHookEnabled}
                      onHookEnabledChange={setMotionHookEnabled}
                      selectedHookId={motionSelectedHookId}
                      onSelectedHookIdChange={setMotionSelectedHookId}
                      onUploadHook={handleUploadHook}
                      onDeleteHook={handleDeleteHook}
                      hookUploadState={hookUploadState}
                      hookUploadError={hookUploadError}
                      onAutoSync={autoSyncMotionTimeline}
                      textOnlySync={motionTextOnlySync}
                      onTextOnlySyncChange={setMotionTextOnlySync}
                      introCard={motionIntroCard}
                      onIntroCardChange={setMotionIntroCard}
                      captions={motionCaptions}
                      onCaptionsChange={setMotionCaptions}
                      hideImageCaptions={motionHideImageCaptions}
                      onHideImageCaptionsChange={setMotionHideImageCaptions}
                      paperCutStyle={motionPaperCutStyle}
                      onPaperCutStyleChange={setMotionPaperCutStyle}
                      wholeImageMotion={motionWholeImageMotion}
                      onWholeImageMotionChange={setMotionWholeImageMotion}
                      zigzagMotion={motionZigzagMotion}
                      onZigzagMotionChange={setMotionZigzagMotion}
                      onCopySpeechPrompt={handleCopySpeechPrompt}
                      copiedSpeechPrompt={copiedSpeechPrompt}
                      autoSyncReport={motionAutoSyncReport}
                      autoSyncNote={motionAutoSyncNote}
                      manifestText={motionManifestText}
                      onManifestTextChange={setMotionManifestText}
                      onBuildFromManifest={buildMotionTimelineFromManifest}
                      manifestNote={motionManifestNote}
                      manifestWarnings={motionManifestWarnings}
                      onCopyPrompt={handleCopyMotionPrompt}
                      copiedPrompt={copiedMotionPrompt}
                      onExport={handleExportTimelineVideo}
                      isExporting={isExportingTimeline}
                      exportElapsedMs={timelineExportElapsed}
                      assetProgress={motionAssetProgress}
                    />
                  )}

                  {/* Export Motion Video Button */}
                  {motionData.layers.length > 0 && (
                    <div className="space-y-3">
                      {/* Procedural loop preview — replaced entirely by the
                          AI timeline once one is applied. */}
                      {!motionTimeline && (
                      <>
                      <button
                        disabled={isRecordingVideo}
                        onClick={handleExportMotionVideo}
                        className="w-full py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg border border-purple-400/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isRecordingVideo ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>RECORDING MOTION VIDEO (5s)…</span>
                          </>
                        ) : (
                          <>
                            <Clapperboard className="h-4 w-4" />
                            <span>EXPORT MOTION VIDEO (.WEBM / .MP4)</span>
                          </>
                        )}
                      </button>

                      {/* Global Preset Animations */}
                      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
                        <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block">Animation Style Preset</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: "parallax_3d", label: "3D Parallax Depth", motionType: "parallax" },
                            { id: "cinematic_float", label: "Floating Drift", motionType: "float" },
                            { id: "pulse_zoom", label: "Breathing Pulse", motionType: "pulse" },
                            { id: "dramatic_slide", label: "Slide Entrance", motionType: "slide_in" },
                          ].map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => {
                                const updatedLayers = motionData.layers.map((l: MotionLayer) => ({ ...l, motionType: preset.motionType as any }));
                                const updated: MotionVideoData = { ...motionData, layers: updatedLayers };
                                setMotionData(updated);
                                setJsonText(JSON.stringify(updated, null, 2));
                              }}
                              className="py-1.5 px-2 rounded-lg text-[9.5px] font-bold border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-white/80 transition cursor-pointer text-center"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      </>
                      )}

                      {/* Extracted Text — the literal words OCR read off this slide */}
                      {(motionData.text?.blocks?.length ?? 0) > 0 && (
                        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                              Extracted Text ({motionData.text!.blocks.length})
                            </span>
                            <span className="text-[9px] font-mono text-white/40">
                              {motionData.meta?.ocr === "tesseract" ? "TESSERACT OCR" : (motionData.meta?.ocr ?? "").toUpperCase()}
                            </span>
                          </div>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                            {motionData.text!.blocks.map((b: MotionTextBlock) => (
                              <button
                                key={b.id}
                                onClick={() => setMotionData((prev: MotionVideoData) => ({ ...prev, activeLayerId: b.id }))}
                                className={`w-full text-left p-2 rounded-lg border transition cursor-pointer ${
                                  motionData.activeLayerId === b.id
                                    ? "bg-purple-500/15 border-purple-500/50"
                                    : "bg-black/30 border-white/10 hover:bg-white/[0.05]"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[8.5px] font-bold uppercase tracking-wider text-purple-300 bg-purple-500/15 border border-purple-500/30 rounded px-1 py-px">
                                    {b.role}
                                  </span>
                                  {b.color && (
                                    <span
                                      className="w-2.5 h-2.5 rounded-sm border border-white/20"
                                      style={{ background: b.color }}
                                      title={b.color}
                                    />
                                  )}
                                  <span className="text-[8.5px] font-mono text-white/35 ml-auto">
                                    {Math.round(b.fontSizePx)}px · {b.textAlign} · {Math.round(b.ocrConfidence)}%
                                  </span>
                                </div>
                                <p className="text-[11px] text-white leading-snug break-words">{b.text}</p>
                                <p className="text-[8.5px] font-mono text-white/35 mt-0.5">
                                  x {b.position.x.toFixed(3)} · y {b.position.y.toFixed(3)} · {b.pixelBounds.width}×{b.pixelBounds.height}px
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Decomposed Layer Manager */}
                      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-3">
                        <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block">
                          Decomposed Layers ({motionData.layers.length})
                          {motionData.meta && (
                            <span className="ml-1.5 font-mono normal-case tracking-normal text-white/35">
                              {motionData.meta.textLayers ?? 0} text · {motionData.meta.graphicLayers ?? 0} graphic
                              {motionData.meta.watermarkRemoved && (
                                <span className="text-emerald-400/70"> · watermark removed</span>
                              )}
                            </span>
                          )}
                        </span>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {motionData.layers.map((layer: MotionLayer) => {
                            const isSelected = motionData.activeLayerId === layer.id;
                            return (
                              <div
                                key={layer.id}
                                onClick={() => setMotionData((prev: MotionVideoData) => ({ ...prev, activeLayerId: layer.id }))}
                                className={`p-2.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                                  isSelected
                                    ? "bg-purple-500/15 border-purple-500/50 text-white"
                                    : "bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/[0.05]"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {layer.imageUrl ? (
                                      <img src={layer.imageUrl} alt="" className="w-8 h-8 rounded object-contain bg-black/40 border border-white/10" />
                                    ) : (
                                      <Layers2 className="h-4 w-4 text-purple-400" />
                                    )}
                                    <span className="text-xs font-bold text-white truncate max-w-[120px]">{layer.name}</span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <select
                                      value={layer.motionType}
                                      onChange={(e) => {
                                        const val = e.target.value as any;
                                        const updated = motionData.layers.map((l: MotionLayer) => (l.id === layer.id ? { ...l, motionType: val } : l));
                                        const next: MotionVideoData = { ...motionData, layers: updated };
                                        setMotionData(next);
                                        setJsonText(JSON.stringify(next, null, 2));
                                      }}
                                      className="bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-[9.5px] font-bold text-purple-300 cursor-pointer"
                                    >
                                      <option value="parallax">Parallax</option>
                                      <option value="float">Float</option>
                                      <option value="pulse">Pulse</option>
                                      <option value="rotate">Sway</option>
                                      <option value="slide_in">Slide In</option>
                                      <option value="none">Static</option>
                                    </select>
                                  </div>
                                </div>

                                {/* Motion Speed & Distance Sliders */}
                                {isSelected && (
                                  <div className="pt-2 border-t border-white/10 space-y-2">
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[9px] font-mono text-white/60">
                                        <span>Motion Speed</span>
                                        <span>{layer.motionSpeed ?? 1}x</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0.2"
                                        max="3.0"
                                        step="0.1"
                                        value={layer.motionSpeed ?? 1}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value);
                                          const updated = motionData.layers.map((l: MotionLayer) => (l.id === layer.id ? { ...l, motionSpeed: val } : l));
                                          const next: MotionVideoData = { ...motionData, layers: updated };
                                          setMotionData(next);
                                          setJsonText(JSON.stringify(next, null, 2));
                                        }}
                                        className="w-full cursor-pointer"
                                        style={{ accentColor: "#a855f7" }}
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[9px] font-mono text-white/60">
                                        <span>Motion Distance</span>
                                        <span>{layer.motionDistance ?? 20}px</span>
                                      </div>
                                      <input
                                        type="range"
                                        min="5"
                                        max="80"
                                        step="2"
                                        value={layer.motionDistance ?? 20}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value, 10);
                                          const updated = motionData.layers.map((l: MotionLayer) => (l.id === layer.id ? { ...l, motionDistance: val } : l));
                                          const next: MotionVideoData = { ...motionData, layers: updated };
                                          setMotionData(next);
                                          setJsonText(JSON.stringify(next, null, 2));
                                        }}
                                        className="w-full cursor-pointer"
                                        style={{ accentColor: "#a855f7" }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Element Layout, Text & Position JSON with 1-Click Copy */}
                      <div className="rounded-xl border border-purple-500/30 bg-purple-500/[0.04] p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Code2 className="h-4 w-4 text-purple-400" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">Layout, Text &amp; Positions JSON</span>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                JSON.stringify(buildMotionLayoutJson(motionSlides), null, 2)
                              );
                              setCopiedMotionJson(true);
                              setTimeout(() => setCopiedMotionJson(false), 2000);
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-purple-500/40 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 transition cursor-pointer"
                          >
                            {copiedMotionJson ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">COPIED ALL {motionSlides.length} SLIDE{motionSlides.length === 1 ? "" : "S"}!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>COPY JSON{motionSlides.length > 1 ? ` (${motionSlides.length})` : ""}</span>
                              </>
                            )}
                          </button>
                        </div>

                        <p className="text-[9.5px] text-white/40 leading-relaxed">
                          Copy takes every slide. The preview below shows slide {activeMotionIndex + 1}. Each text element carries its literal words next to its position, font size and colour.
                        </p>

                        <div className="relative rounded-lg border border-white/10 bg-black/60 p-2.5 max-h-48 overflow-y-auto font-mono text-[10px] text-purple-200/90 leading-relaxed [scrollbar-width:thin]">
                          <pre className="whitespace-pre-wrap break-all">
                            {JSON.stringify(describeMotionSlide(motionData, activeMotionIndex), null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {creatorMode === "indicator" && (
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
              )}
            </div>
          )}

          {/* COLORS & THEMES TAB */}
          {activeTab === "colors" && (
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
          )}

          {/* LAYOUT TAB */}
          {activeTab === "layout" && (
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
          )}

          {/* RAW JSON TAB */}
          {activeTab === "json" && (
            <div className="flex flex-col h-full min-h-0 space-y-3.5">
              <div className="flex items-center justify-between shrink-0">
                <p
                  className="text-[10px] font-semibold text-[#787870] uppercase tracking-wider"
                >
                  Raw JSON Data
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSample(true)}
                    className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase text-white/60 hover:text-white transition border border-white/5 cursor-pointer"
                  >
                    Load Sample
                  </button>
                  {jsonError && (
                    <div className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="h-3 w-3" />
                      <span className="text-[9px]">
                        Invalid JSON
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
                className="w-full min-h-[350px] flex-1 resize-none rounded-xl p-3 text-[11px] leading-relaxed outline-none transition-all"
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${jsonError ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                  color: "#ffffff",
                  fontFamily: "var(--font-mono), monospace",
                  caretColor: "#ffffff",
                }}
              />
            </div>
          )}

          {/* AI PROMPT TAB */}
          {activeTab === "ai-prompt" && (
            <div className="flex flex-col gap-4">
              {/* Banner info */}
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-white/50" />
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">CHoCH QLM Hinglish News Prompt</span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Opens the full three-section AI prompt generator — System Prompt, User Message with live H1+H4 candle data, and Reference JSON schema. Select session, date, currency pairs and copy each block individually or all at once.
                </p>
                <div className="flex flex-wrap gap-2 text-[10px] text-white/30">
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">📊 Live H1+H4 OHLCV data</span>
                  <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">🌐 V1 — Full Internet</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/[0.08] border border-emerald-500/[0.15] text-emerald-400/60">𝕏 V5 — Twitter Feeds</span>
                </div>
              </div>

              {/* Open modal button */}
              <button
                onClick={() => setShowPromptModal(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.12)] border border-transparent"
              >
                <Bot className="h-4 w-4" />
                Open Prompt Generator
              </button>

              {/* Tip */}
              <div className="rounded-xl bg-emerald-500/[0.05] border border-emerald-500/[0.12] px-4 py-3">
                <p className="text-[10px] font-semibold text-emerald-400/60 uppercase tracking-widest mb-1">How to use</p>
                <ol className="text-[11px] text-white/35 leading-relaxed space-y-1">
                  <li>1. Open prompt generator and select session, date &amp; symbols</li>
                  <li>2. Copy all 3 blocks into your AI (ChatGPT / Gemini)</li>
                  <li>3. Paste the generated JSON into the <span className="text-white/55 font-medium">JSON Tab</span></li>
                  <li>4. Hit Force Re-render — posters appear instantly</li>
                </ol>
              </div>
            </div>
          )}

          {/* PROMPT BUILDER TAB */}
          {activeTab === "prompt-builder" && <PromptBuilder />}
        </div>

        {/* Generate + Re-render (Left panel footer) */}
        <div className="px-4 pb-4 pt-2 border-t shrink-0 space-y-2" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          {generateError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-500/[0.08] border border-red-500/[0.2]">
              <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-red-300/90 leading-relaxed flex-1">{generateError}</p>
              <button onClick={() => setGenerateError(null)} className="text-red-400/60 hover:text-red-300 shrink-0">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex gap-2 relative">
            {/* Generate — niche dropdown (opens upward) */}
            <div className="relative flex-1">
              {showGenerateMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowGenerateMenu(false)} />
                  <div className="absolute bottom-full mb-2 left-0 w-[318px] z-50 rounded-xl border border-white/[0.08] bg-[#121210] shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-xl overflow-hidden p-1 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="w-full flex items-start gap-1 rounded-lg hover:bg-white/[0.05] transition">
                      <button
                        onClick={generateNewsBatch}
                        className="flex-1 min-w-0 flex items-start gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition cursor-pointer"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                          <Sparkles className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11.5px] font-bold text-white tracking-wide">AI News Batch</span>
                          <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                            {fullyAutomated
                              ? "Curate the top 10 distinct high-impact stories, deduped, with cover + outro — every story kept and illustrated automatically, no review step."
                              : "Curate the top 10 distinct high-impact stories, deduped, with cover + outro. Select which slides to include."}
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowGenerateMenu(false); setShowPromptForCategory("news"); }}
                        title="Show the full generation prompt"
                        className="shrink-0 mt-2 mr-1.5 p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFullyAutomated((v) => !v)}
                      title="When on, News Batch keeps every curated story, fills images, and saves automatically — no selection modal."
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition cursor-pointer text-left"
                    >
                      {fullyAutomated ? (
                        <CheckSquare className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-white/30 shrink-0" />
                      )}
                      <span className={`text-[10px] font-semibold ${fullyAutomated ? "text-emerald-300/90" : "text-white/45"}`}>
                        Fully Automated — skip selection, keep every story
                      </span>
                    </button>

                    <div className="w-full flex items-start gap-1 rounded-lg hover:bg-white/[0.05] transition border-t border-white/[0.03]">
                      <button
                        onClick={() => generateFactsBatch()}
                        className="flex-1 min-w-0 flex items-start gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition cursor-pointer"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                          <Lightbulb className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11.5px] font-bold text-white tracking-wide">AI Facts Batch</span>
                          <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                            Auto-generate 5-8 verified, punchy trading/market facts with cover + outro.
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowGenerateMenu(false); setShowPromptForCategory("facts"); }}
                        title="Show the full generation prompt"
                        className="shrink-0 mt-2 mr-1.5 p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="w-full flex items-start gap-1 rounded-lg hover:bg-white/[0.05] transition border-t border-white/[0.03]">
                      <button
                        onClick={() => generateLearningsBatch()}
                        className="flex-1 min-w-0 flex items-start gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition cursor-pointer"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0 mt-0.5">
                          <BookOpen className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11.5px] font-bold text-white tracking-wide">AI Learnings Batch</span>
                          <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                            Auto-picks one concept and teaches it step by step, with cover + recap + outro.
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowGenerateMenu(false); setShowPromptForCategory("learnings"); }}
                        title="Show the full generation prompt"
                        className="shrink-0 mt-2 mr-1.5 p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setShowGenerateMenu(false);
                        setCreatorMode("analysis");
                        setShowPromptModal(true);
                      }}
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-white/[0.05] active:scale-[0.99] transition cursor-pointer border-t border-white/[0.03]"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-white/70" />
                      </div>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11.5px] font-bold text-white tracking-wide">Daily Analysis Prompt</span>
                        <span className="block text-[9.5px] text-white/40 leading-snug mt-0.5 font-normal">
                          Compile session candles and structures into prompts for external AI.
                        </span>
                      </span>
                    </button>

                    <button
                      disabled
                      className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left opacity-35 cursor-not-allowed border-t border-white/[0.03]"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/[0.02] border border-white/[0.04] shrink-0 mt-0.5">
                        <Layers2 className="h-4 w-4 text-white/30" />
                      </div>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[11.5px] font-bold text-white/50 tracking-wide">Indicator / Classic</span>
                        <span className="block text-[9.5px] text-white/25 leading-snug mt-0.5 font-normal">Coming soon</span>
                      </span>
                    </button>
                  </div>
                </>
              )}
              <button
                onClick={() => setShowGenerateMenu((v) => !v)}
                disabled={generatingBatch}
                title="Generate"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer bg-emerald-500/[0.15] text-emerald-300 hover:bg-emerald-500/[0.22] border border-emerald-500/[0.25] disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
              >
                {generatingBatch ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span className="hidden xs:inline">GENERATING…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xs:inline">GENERATE</span>
                    <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showGenerateMenu ? "rotate-180" : ""}`} />
                  </>
                )}
              </button>
            </div>

            <button
              onClick={render}
              title="Re-render"
              className="flex items-center justify-center gap-1.5 flex-grow py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.1)] border border-transparent whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline">RE-RENDER</span>
            </button>
          </div>

          {/* Utility actions — always their own row, icon-only, so this never
              competes with Generate/Re-render for space and can never get
              clipped no matter how narrow the panel or how many icons live
              here (Fill Images is conditional on mode). */}
          <div className="flex gap-2 flex-wrap">
            {(creatorMode === "news" || creatorMode === "facts" || creatorMode === "learnings") && newsData.length > 0 && (
              <button
                onClick={fillAllImages}
                disabled={generatingImages || newsData.every((item) => item.isBento || item.imageUrl || !buildWebSearchQuery(item))}
                title={
                  generatingImages
                    ? `Filling images… ${imageGenProgress.done}/${imageGenProgress.total}`
                    : "Fill every poster still missing an image with a Pexels stock photo (top match, no picking) — skips any that already have one"
                }
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generatingImages ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )}

            <button
              onClick={handleSaveCurrentToHistory}
              disabled={saveStatus === "saving"}
              title="Save current poster(s) to History"
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border ${
                saveStatus === "success"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                  : saveStatus === "error"
                  ? "border-red-500 bg-red-500/10 text-red-400"
                  : "border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
              }`}
            >
              {saveStatus === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saveStatus === "success" ? (
                <Check className="h-3.5 w-3.5" />
              ) : saveStatus === "error" ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              onClick={openHistory}
              title="View History list"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
            >
              <History className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => setShowCalendarModal(true)}
              title="Content Calendar — 30-day plan"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white/70 hover:text-white"
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* ── Right Panel: Preview ──────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col overflow-hidden bg-background relative"
      >
        {panelCollapsed && (
          <button
            onClick={() => setPanelCollapsed(false)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-8 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-r-xl transition-all duration-200 text-white/60 hover:text-white cursor-pointer group shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md"
            title="Expand Panel"
          >
            <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}
        {/* Apple liquid glass backdrop glow circles — sized down on mobile.
            At w-96 (384px) these overflow a ~375px-wide phone viewport; that
            overflow is invisible on its own (this column is overflow-hidden)
            but any focus event elsewhere on the page makes the browser
            auto-scroll this container to reveal it, permanently shifting the
            whole preview (toolbar, canvas, everything) sideways with no way
            to scroll it back. Keeping them within the container's own width
            means there's never any overflow to scroll to. */}
        <div
          className="absolute top-1/4 left-1/4 w-48 h-48 md:w-96 md:h-96 rounded-full blur-[128px] pointer-events-none"
          style={{ backgroundColor: colors.accent, opacity: 0.035 }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-48 h-48 md:w-96 md:h-96 rounded-full blur-[128px] pointer-events-none"
          style={{ backgroundColor: colors.accent, opacity: 0.035 }}
        />

        {/* Preview toolbar */}
        <div
          className="flex items-center justify-between px-4 py-1.5 border-b shrink-0 z-10"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2 min-w-0 shrink">
            <ImagePlus className="h-4 w-4 shrink-0 text-white/50" />
            {/* Redundant next to the icon once space is tight — icon alone
                reads fine at a glance, full label comes back at sm+. */}
            <span
              className="hidden sm:inline text-[12px] font-bold uppercase tracking-wider text-white whitespace-nowrap"
            >
              Interactive Preview
            </span>
            <span
              className="text-[9px] px-2 py-0.5 rounded-md border font-semibold uppercase tracking-wider shrink-0"
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "#d1d5db",
              }}
            >
              {Math.round(scale * 100)}%
            </span>
          </div>
          {isBatchMode ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={download}
                disabled={!rendered || newsData.length === 0}
                title="Download current poster"
                className="flex items-center gap-1.5 px-2.5 xs:px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 text-white whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xs:inline">Download Current</span>
              </button>
              <button
                onClick={() => setShowReelStudio(true)}
                disabled={!rendered || newsData.length === 0 || zipIncludedIndices.length === 0}
                title={zipIncludedIndices.length === 0 ? "Nothing selected — check at least one item below" : "Convert the selected posters into a 9:16 reel with music & transitions"}
                className="flex items-center gap-1.5 px-2.5 xs:px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 text-white whitespace-nowrap"
              >
                <Clapperboard className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xs:inline">Create Reel</span>
              </button>
              <button
                onClick={downloadAll}
                disabled={!rendered || newsData.length === 0 || downloadingZip || zipIncludedIndices.length === 0}
                title={zipIncludedIndices.length === 0 ? "Nothing selected — check at least one item below" : `Download ${zipIncludedIndices.length} selected poster${zipIncludedIndices.length === 1 ? "" : "s"} as a ZIP`}
                className="flex items-center gap-1.5 px-3 xs:px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 border border-transparent shadow-[0_2px_8px_rgba(255,255,255,0.1)] whitespace-nowrap"
              >
                {downloadingZip ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span className="hidden xs:inline">Packaging ZIP...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xs:inline">Download All Batch</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={download}
              disabled={!rendered}
              title="Download PNG"
              className="flex items-center gap-1.5 px-3 xs:px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 border border-transparent shadow-[0_2px_8px_rgba(255,255,255,0.1)] shrink-0 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline">Download PNG</span>
            </button>
          )}
        </div>

        {/* Batch pagination header (News/Facts/Learnings only) */}
        {isBatchMode && newsData.length > 0 && (
          <div
            className="flex items-center justify-between gap-2 px-5 py-2.5 border-b shrink-0 bg-white/[0.01] z-10"
            style={{ borderColor: "rgba(255, 255, 255, 0.04)" }}
          >
            <div className="text-[11px] text-[#787870] font-bold uppercase tracking-wider whitespace-nowrap truncate min-w-0">
              POSTER <span className="text-white font-bold">{(visibleNewsPosition === -1 ? 0 : visibleNewsPosition) + 1}</span> OF <span className="text-white font-bold">{visibleNewsCount}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled={visibleNewsPosition <= 0}
                onClick={goToPrevVisibleNews}
                title="Previous poster"
                className="flex items-center gap-1 px-2 xs:px-2.5 py-1 rounded-lg border border-white/[0.08] hover:bg-white/5 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer text-white whitespace-nowrap"
              >
                <ChevronLeft className="h-3 w-3 shrink-0 xs:hidden" />
                <span className="hidden xs:inline">Previous</span>
              </button>
              <button
                disabled={visibleNewsPosition === -1 || visibleNewsPosition >= visibleNewsCount - 1}
                onClick={goToNextVisibleNews}
                title="Next poster"
                className="flex items-center gap-1 px-2 xs:px-2.5 py-1 rounded-lg border border-white/[0.08] hover:bg-white/5 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer text-white whitespace-nowrap"
              >
                <ChevronRight className="h-3 w-3 shrink-0 xs:hidden" />
                <span className="hidden xs:inline">Next</span>
              </button>

              {creatorMode === "watermark" && newsData.length > 0 && (
                <button
                  onClick={() => setShowGridView(true)}
                  title="Open Grid View to manage and rearrange images"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/15 hover:bg-red-500/25 text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap shadow-sm"
                >
                  <LayoutGrid className="h-3 w-3 shrink-0" />
                  <span>Grid View ({newsData.length})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Canvas preview area with direct Drag & Drop image upload */}
        <div
          ref={previewRef}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingCanvasOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingCanvasOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingCanvasOver(false);
            if (e.dataTransfer.files?.length) {
              if (creatorMode === "watermark") {
                handleWatermarkFiles(e.dataTransfer.files);
              } else {
                processImageFile(e.dataTransfer.files[0]);
              }
            }
          }}
          className={`relative flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-4 md:p-6 select-none z-10 transition-colors ${
            isDraggingCanvasOver ? "bg-red-500/10 border-2 border-dashed border-red-500/50" : ""
          }`}
        >
          {/* Direct Poster Drag-and-Drop Dropzone Overlay */}
          {isDraggingCanvasOver && (
            <div className="absolute inset-4 z-50 rounded-2xl border-4 border-dashed border-red-500 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center text-white space-y-3 pointer-events-none animate-in fade-in duration-150">
              <div className="p-4 rounded-full bg-red-500/20 border border-red-500/30 text-red-400">
                <Upload className="h-10 w-10 animate-bounce" />
              </div>
              <p className="text-lg font-bold text-white">Drop Image(s) Direct onto Poster</p>
              <p className="text-xs text-white/60">Release to add logo watermark to image(s)</p>
            </div>
          )}
          {/* Carousel nav — real app buttons, not baked into the poster image.
              Changes which poster is being previewed/edited/exported. */}
          {isBatchMode && visibleNewsCount > 1 && (
            <>
              <button
                onClick={goToPrevVisibleNews}
                disabled={visibleNewsPosition <= 0}
                aria-label="Previous poster"
                title="Previous poster"
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer border border-white/[0.1] bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={goToNextVisibleNews}
                disabled={visibleNewsPosition === -1 || visibleNewsPosition >= visibleNewsCount - 1}
                aria-label="Next poster"
                title="Next poster"
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer border border-white/[0.1] bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div
            style={{
              width: ar.w * scale,
              height: ar.h * scale,
              flexShrink: 0,
              position: "relative",
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: ar.w,
                height: ar.h,
                transformOrigin: "top left",
                transform: `scale(${scale})`,
                display: "block",
                borderRadius: 2,
                boxShadow: `0 0 0 1px ${colors.accent}40, 0 24px 64px rgba(0,0,0,0.6)`,
              }}
            />
            {/* Interactive Element Boundaries Overlay */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: ar.w * scale,
                height: ar.h * scale,
                pointerEvents: "none",
              }}
            >
              {elementBounds.map((box, i) => {
                const isWatermarkLogo = box.id === "watermarkLogo";
                const isNewsImage = box.id === "imageUrl" && isBatchMode;
                const hasImage = isNewsImage && !!newsData[activeNewsIndex]?.imageUrl;

                return (
                  <div
                    key={`${box.id}-${i}-${box.x}-${box.y}`}
                    ref={hasImage ? setImageWheelRef : undefined}
                    onClick={() => handleElementClick(box.id)}
                    onMouseDown={
                      isWatermarkLogo
                        ? (e) => handleLogoMouseDown(e, box)
                        : creatorMode === "motion"
                        ? (e) => handleStartMotionLayerDrag(e, box)
                        : hasImage
                        ? (e) => handleImageMouseDown(e, box)
                        : undefined
                    }
                    className={`absolute pointer-events-auto border border-dashed group transition-all duration-200 rounded ${
                      isWatermarkLogo
                        ? "border-red-500/40 bg-red-500/[0.08] hover:border-red-500 hover:bg-red-500/20"
                        : creatorMode === "motion"
                        ? "border-purple-500/40 bg-purple-500/[0.05] hover:border-purple-500 hover:bg-purple-500/15"
                        : "border-transparent"
                    }`}
                    style={{
                      left: box.x * scale,
                      top: box.y * scale,
                      width: box.w * scale,
                      height: box.h * scale,
                      cursor: isWatermarkLogo
                        ? (isDraggingLogo ? "grabbing" : "move")
                        : creatorMode === "motion"
                        ? (isDraggingMotionLayer ? "grabbing" : "move")
                        : hasImage
                        ? (isDraggingImage ? "grabbing" : "grab")
                        : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!isWatermarkLogo) {
                        e.currentTarget.style.borderColor = colors.accent;
                        e.currentTarget.style.backgroundColor = `${colors.accent}15`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isWatermarkLogo) {
                        e.currentTarget.style.borderColor = "transparent";
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                    onDragOver={box.id === "imageUrl" ? (e) => handleImageDragOver(e, colors.accent) : undefined}
                    onDragLeave={box.id === "imageUrl" ? handleImageDragLeave : undefined}
                    onDrop={box.id === "imageUrl" ? handleImageDrop : undefined}
                  >
                    {/* Floating badge tooltip on hover */}
                    <div
                      className="absolute opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none px-2 py-0.5 rounded text-[8.5px] font-bold tracking-wider uppercase z-20 whitespace-nowrap"
                      style={{
                        top: "-20px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "rgba(255, 255, 255, 0.9)",
                        color: "#000000",
                        fontFamily: "var(--font-sans), sans-serif",
                        boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                      }}
                    >
                      {isWatermarkLogo
                        ? "Drag Logo Anywhere on Image"
                        : hasImage
                        ? "Drag to Pan · Scroll to Zoom"
                        : `Edit ${box.label}`}
                    </div>

                    {/* Dedicated replace-image button — only once an image exists;
                        clicking the box itself now pans, so replacement needs its
                        own affordance, always visible in the corner. */}
                    {hasImage && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          imageFileRef.current?.click();
                        }}
                        title="Change image"
                        className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-all opacity-0 group-hover:opacity-100"
                        style={{
                          background: "rgba(10,10,10,0.65)",
                          color: "rgba(255,255,255,0.9)",
                          backdropFilter: "blur(4px)",
                        }}
                      >
                        <Upload className="h-2.5 w-2.5" />
                        Change Image
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Timeline editor — macro (scenes) over micro (elements and their
            cues), directly under the frame it is editing. */}
        {creatorMode === "motion" && motionDoc && motionDoc.scenes.length > 0 && (
          <TimelineEditor
            doc={motionDoc}
            onChange={applyMotionDocEdit}
            onBeginGesture={beginMotionGesture}
            timeMs={motionTimeMs}
            onSeek={seekMotionTo}
            isPlaying={isPlayingMotion || isHookPhasePlaying}
            onTogglePlay={handleToggleMotionPlay}
            words={motionTranscript ?? []}
            slideNames={motionSlides.map((s) => s.fileName || "")}
            canUndo={motionHistoryTick >= 0 && motionUndoRef.current.length > 0}
            canRedo={motionHistoryTick >= 0 && motionRedoRef.current.length > 0}
            onUndo={undoMotionEdit}
            onRedo={redoMotionEdit}
            saveState={motionSaveState}
          />
        )}

        {/* Bottom hint */}
        <div
          className="hidden sm:flex items-center justify-center gap-1.5 px-3 py-2.5 border-t shrink-0 z-10"
          style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
        >
          <span
            className="text-[9px] uppercase tracking-[0.15em] text-[#787870] text-center truncate"
          >
            {isBatchMode
              ? "Click Next/Previous or select items in the sidebar to cycle through the batch"
              : "Click any element on the poster to customize it in the sidebar"
            }
          </span>
        </div>
      </div>

      {/* Hidden file picker — clicking a news poster's image frame (or the
          Upload button) routes here; the chosen file becomes the poster image */}
      <input
        ref={imageFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFile}
      />

      {/* Sample JSON modal */}
      {showSample && (
        <SampleJsonModal
          mode={creatorMode}
          onClose={() => setShowSample(false)}
          onApply={(json) => { setJsonText(json); setJsonError(null); }}
        />
      )}

      {/* AI News Prompt modal */}
      {showPromptModal && (
        <PromptModal
          defaultDate={promptDate}
          defaultSession={promptSession}
          onClose={() => setShowPromptModal(false)}
        />
      )}

      {/* History modal */}
      {showHistory && (
        <HistoryModal
          items={historyItems}
          loading={historyLoading}
          error={historyError}
          busyId={historyBusyId}
          onClose={() => setShowHistory(false)}
          onLoad={loadHistoryEntry}
          onDelete={deleteHistoryEntry}
        />
      )}

      {/* Content Calendar modal — 30-day News/Learnings/Facts plan */}
      {showCalendarModal && (
        <ContentCalendarModal
          onClose={() => setShowCalendarModal(false)}
          onGenerateNews={() => { setShowCalendarModal(false); generateNewsBatch(); }}
          onGenerateFacts={(topicHint) => { setShowCalendarModal(false); generateFactsBatch(topicHint); }}
          onGenerateLearnings={(topicHint) => { setShowCalendarModal(false); generateLearningsBatch(topicHint); }}
        />
      )}

      {/* Full generation prompt viewer — the exact system prompt, user message, and required output JSON shape for a batch category */}
      {showPromptForCategory && (
        <ShowPromptModal
          category={showPromptForCategory}
          onClose={() => setShowPromptForCategory(null)}
          onImport={importAiBatch}
        />
      )}

      {/* Poster selection modal — narrows the 20-30 AI candidates down to the final batch */}
      {showSelectionModal && (
        <PosterSelectionModal
          candidates={rawBatchCandidates}
          selected={selectedPosterIndices}
          onToggle={togglePosterSelection}
          onSelectAll={selectAllPosters}
          onClear={clearPosterSelection}
          onClose={() => setShowSelectionModal(false)}
          onApply={applyPosterSelection}
          applying={generatingImages}
          applyProgress={imageGenProgress}
        />
      )}

      {/* Decomposition strength — asked once, before the picked images are touched */}
      {pendingMotionFiles && (
        <DecompositionStrengthModal
          fileCount={pendingMotionFiles.length}
          initial={motionStrength}
          onCancel={() => setPendingMotionFiles(null)}
          onConfirm={(strength) => {
            const files = pendingMotionFiles;
            setPendingMotionFiles(null);
            setMotionStrength(strength);
            void runMotionDecomposition(files, strength);
          }}
        />
      )}

      {/* Fix Slide Order — re-sorts a shuffled motion batch by each poster's own printed slide number */}
      {showFixSlideOrderModal && (
        <FixSlideOrderModal
          slides={motionSlides}
          segmentation={motionScriptSegments}
          onClose={() => setShowFixSlideOrderModal(false)}
          onApply={handleApplyFixedSlideOrder}
          onDecomposeFiles={handleDecomposeForSlot}
        />
      )}

      {/* Reel Studio — converts the selected batch posters into a 9:16 video slideshow */}
      {showReelStudio && (
        <ReelStudioModal
          creatorMode={creatorMode}
          generateSlides={generateReelSlides}
          onClose={() => setShowReelStudio(false)}
        />
      )}
      {/* Grid View Modal for Batch Rearranging */}
      {showGridView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#0c0d0e] shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    Watermark Batch Grid View
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                      {newsData.length} {newsData.length === 1 ? "Image" : "Images"}
                    </span>
                  </h2>
                  <p className="text-[11px] text-white/50">
                    Drag &amp; drop cards to reorder images manually, or click any card to open in canvas.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => watermarkFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload More
                </button>
                <button
                  onClick={() => setShowGridView(false)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition border border-white/10 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Grid Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {newsData.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <Upload className="h-10 w-10 text-white/30 mx-auto" />
                  <p className="text-sm font-semibold text-white/60">No images uploaded in batch yet</p>
                  <button
                    onClick={() => watermarkFileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs transition cursor-pointer inline-flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" /> Upload Images Now
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {newsData.map((item, idx) => {
                    const isCurrent = idx === activeNewsIndex;
                    const isBeingDragged = draggedGridItemIndex === idx;

                    return (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(idx));
                          setDraggedGridItemIndex(idx);
                        }}
                        onDragEnd={() => setDraggedGridItemIndex(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
                          if (!isNaN(fromIdx) && fromIdx !== idx) {
                            handleSwapIndices(fromIdx, idx);
                          }
                          setDraggedGridItemIndex(null);
                        }}
                        className={`relative flex flex-col rounded-2xl border transition-all overflow-hidden group ${
                          isBeingDragged ? "opacity-30 scale-95 border-red-500" : ""
                        } ${
                          isCurrent
                            ? "bg-red-500/10 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                            : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        {/* Card Header Badge */}
                        <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between bg-black/40">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-6 h-6 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="truncate text-xs font-semibold text-white/90">
                              {item.title || `Image ${idx + 1}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing text-white/40 hover:text-white shrink-0 ml-1">
                            <GripVertical className="h-4 w-4" />
                          </div>
                        </div>

                        {/* Thumbnail Image Container */}
                        <div
                          onClick={() => {
                            setActiveNewsIndex(idx);
                            setShowGridView(false);
                          }}
                          className="relative aspect-square w-full bg-black/60 overflow-hidden flex items-center justify-center cursor-pointer group-hover:brightness-105"
                        >
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                          ) : (
                            <ImagePlus className="h-8 w-8 text-white/20" />
                          )}

                          {/* Active Overlay Badge */}
                          {isCurrent && (
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-[9.5px] font-bold shadow-md">
                              Active
                            </div>
                          )}
                        </div>

                        {/* Card Controls Footer */}
                        <div className="p-2.5 bg-black/50 border-t border-white/5 flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => handleMoveIndex(idx, "up")}
                              title="Move Left"
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed border border-white/5"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              disabled={idx === newsData.length - 1}
                              onClick={() => handleMoveIndex(idx, "down")}
                              title="Move Right"
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed border border-white/5"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setActiveNewsIndex(idx);
                                setShowGridView(false);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold border border-white/10 transition cursor-pointer"
                            >
                              Preview
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
                              title="Delete"
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 cursor-pointer border border-red-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-white/10 bg-black/40 flex items-center justify-between shrink-0">
              <span className="text-xs text-white/40">
                Tip: Drag &amp; drop cards directly to rearrange sequence, or click any card to select for canvas editing.
              </span>
              <button
                onClick={() => setShowGridView(false)}
                className="px-4 py-2 rounded-xl bg-white text-black hover:bg-white/90 font-bold text-xs transition cursor-pointer shadow-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
