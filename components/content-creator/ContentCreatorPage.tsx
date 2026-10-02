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
import { useLevelsCarousel } from "./levels/useLevelsCarousel";
import { LevelsTab } from "./levels/LevelsTab";
import { LevelsCarouselPanel } from "./levels/LevelsCarouselPanel";
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
import {
  toAuthored,
  toEditable,
  addOverlay,
  updateOverlay,
  deleteOverlay,
  type EditableTimeline,
  type EditableOverlayClip,
} from "@/lib/motion-timeline/edit";
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
import { GridViewModal } from "./modals/GridViewModal";
import { RawJsonTab } from "./panels/RawJsonTab";
import { AiPromptTab } from "./panels/AiPromptTab";
import { ColorsThemesTab } from "./panels/ColorsThemesTab";
import { LayoutTab } from "./panels/LayoutTab";
import { IndicatorFields } from "./panels/IndicatorFields";
import { FactsLearningsFields } from "./panels/FactsLearningsFields";
import { AnalysisFields } from "./panels/AnalysisFields";
import { WatermarkFields } from "./panels/WatermarkFields";
import { NewsFields } from "./panels/NewsFields";
import { MotionFields } from "./panels/MotionFields";
import { GenerateFooter } from "./panels/GenerateFooter";
import { PreviewCanvasPanel } from "./panels/PreviewCanvasPanel";
import { LeftPanelChrome } from "./panels/LeftPanelChrome";
import { DecompositionStrengthModal } from "./modals/DecompositionStrengthModal";
import { matchSlideOrderToScript } from "./slideOrder";
import { deriveScriptSegments } from "./scriptSegments";
import { ReelStudioModal } from "./reel/ReelStudioModal";
import { REEL_W, REEL_H, type ReelSlideSource } from "./reel/reelTypes";
import { PromptBuilder } from "./prompt-builder/PromptBuilder";
import { usePosterEditorState } from "./hooks/usePosterEditorState";
import { useHistoryCore } from "./hooks/useHistoryCore";
import { useIndicatorFields } from "./hooks/useIndicatorFields";
import { useBatchSelection } from "./hooks/useBatchSelection";
import { useMotionCore } from "./hooks/useMotionCore";
import { useWatermarkMode } from "./hooks/useWatermarkMode";
import { useImageEditing } from "./hooks/useImageEditing";
import { useMotionMedia } from "./hooks/useMotionMedia";
import { useMotionTimelineEditor } from "./hooks/useMotionTimelineEditor";
import { useMotionPlaybackExport } from "./hooks/useMotionPlaybackExport";
import { useAiBatchGeneration } from "./hooks/useAiBatchGeneration";
import { useExportAndDownload } from "./hooks/useExportAndDownload";
import { useHistoryPanel } from "./hooks/useHistoryPanel";

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
  const {
    creatorMode, setCreatorMode, isBatchMode,
    ratioId, setRatioId,
    analysisData, setAnalysisData,
    newsData, setNewsData,
    parsedData, setParsedData,
    activeNewsIndex, setActiveNewsIndex,
    jsonText, setJsonText, jsonError, setJsonError, showSample, setShowSample, rendered, setRendered,
    activeTab, setActiveTab,
    colors, setColors, config, setConfig,
    posterStyle, setPosterStyle, gradientPresetId, setGradientPresetId, activeGradient,
    editorialTheme, setEditorialTheme, gradientFade, setGradientFade, sentimentScheme, setSentimentScheme,
    elementBounds, setElementBounds, highlightedField, setHighlightedField,
    canvasRef, previewRef, activeImgRef, loadedImagesRef, imageFileRef,
    candlesData,
    promptSession, setPromptSession, promptDate, setPromptDate, promptCopied, setPromptCopied,
    showPromptModal, setShowPromptModal,
    showCalendarModal, setShowCalendarModal,
    showReelStudio, setShowReelStudio,
    handleUpdateField, handleElementClick,
    inputStyle, getFieldClassName, TABS,
  } = usePosterEditorState();

  const {
    activeHistoryId, setActiveHistoryId,
    saveStatus, setSaveStatus,
    defaultSaveStatus,
    saveToHistory,
    handleSetAsDefault,
  } = useHistoryCore({ ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme });

  const {
    motionSlides, setMotionSlides,
    activeMotionIndex, setActiveMotionIndex,
    isSegmenting, segmentProgress,
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
  } = useMotionCore({
    canvasRef, loadedImagesRef, setJsonText,
    saveToHistory, activeHistoryId, setActiveHistoryId,
    ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme,
  });

  const {
    hideBento, setHideBento,
    deselectedForZip, setDeselectedForZip,
    bentoFilteredIndices,
    visibleNewsIndices,
    visibleNewsPosition,
    visibleNewsCount,
    zipIncludedIndices,
    goToPrevVisibleNews,
    goToNextVisibleNews,
    toggleZipSelection,
    selectAllForZip,
    deselectAllForZip,
  } = useBatchSelection({ newsData, activeNewsIndex, setActiveNewsIndex });

  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // On phones the 350px editor panel would eat the entire viewport and leave
  // no room for the canvas preview — start collapsed there so the poster is
  // visible first; desktop/tablet keep the panel open by default.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setPanelCollapsed(true);
    }
  }, []);

  const [scale, setScale] = useState(1);

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

  const {
    watermarkPosition, setWatermarkPosition,
    watermarkStratiColor, setWatermarkStratiColor,
    watermarkXColor, setWatermarkXColor,
    watermarkBgStyle, setWatermarkBgStyle,
    watermarkScale, setWatermarkScale,
    swapFromIndex, setSwapFromIndex,
    swapToIndex, setSwapToIndex,
    showGridView, setShowGridView,
    isDraggingCanvasOver, setIsDraggingCanvasOver,
    draggedGridItemIndex, setDraggedGridItemIndex,
    isDraggingLogo,
    watermarkFileInputRef,
    handleWatermarkFiles,
    handleSwapIndices,
    handleMoveIndex,
    handleSetWatermarkPosition,
    handleSetWatermarkColors,
    handleApplyAllWatermarkSettingsToBatch,
    handleLogoMouseDown,
  } = useWatermarkMode({
    newsData, setNewsData, setJsonText, activeNewsIndex, setActiveNewsIndex, creatorMode,
    ar, scale, colors, config, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme,
    visibleNewsPosition, visibleNewsCount, canvasRef, activeImgRef, setElementBounds,
  });

  const {
    isDraggingImage,
    handleImageMouseDown,
    setImageWheelRef,
    processImageFile,
    buildWebSearchQuery,
    handleWebImageSelect,
    fetchTopPexelsImage,
    handleImageFile,
    handleImageDragOver,
    handleImageDragLeave,
    handleImageDrop,
  } = useImageEditing({
    isBatchMode, newsData, setNewsData, activeNewsIndex, setJsonText, activeImgRef, canvasRef,
    scale, ar, colors, config, creatorMode, posterStyle, activeGradient, editorialTheme, gradientFade, sentimentScheme,
    visibleNewsPosition, visibleNewsCount, setElementBounds, handleUpdateField,
  });

  const {
    handleMotionTranscriptFile,
    clearMotionTranscript,
    handleMotionAudioFile,
    clearMotionAudio,
    handleMotionMusicFile,
    clearMotionMusic,
    handleMotionCombinedFiles,
  } = useMotionMedia({
    motionAudioRef, motionAudioUrlRef, motionAudioR2UrlRef, setMotionAudioR2Url, setMotionAudioName,
    motionMusicRef, motionMusicUrlRef, motionMusicR2UrlRef, setMotionMusicR2Url, setMotionMusicName,
    motionMixRef, motionCsvR2UrlRef, setMotionCsvR2Url, motionTranscriptRawTextRef, setMotionTranscriptRawText,
    setMotionTranscript, setMotionTranscriptName, setMotionTranscriptNote, setSegmentError, seekMotionTo,
    motionMusicVolume, motionExportSpeed, motionSpeedRef,
  });

  const {
    applyMotionTimeline,
    applyBuiltTimeline,
    autoSyncMotionTimeline,
    buildMotionTimelineFromManifest,
    persistMotionState,
    beginMotionGesture,
    applyMotionDocEdit,
    probeVideoDurationMs,
    handleAddOverlayClip,
    handleUpdateOverlayClip,
    handleDeleteOverlayClip,
    undoMotionEdit,
    redoMotionEdit,
    handleApplyFixedSlideOrder,
    handleCopyMotionPrompt,
    handleCopySpeechPrompt,
  } = useMotionTimelineEditor({
    motionSlides, setMotionSlides, motionTranscript, motionTimelineText, setMotionTimelineText,
    setMotionTimelineReport, motionTimeline, setMotionTimeline, motionTimeRef, motionClockOriginRef,
    setMotionTimeMs, setActiveMotionIndex, setMotionData, motionAudioRef, ensureMotionAssets, setIsPlayingMotion,
    motionPaperCutStyle, motionTextOnlySync, motionIntroCard, motionCaptions, motionCaptionPosition,
    motionCaptionBgOpacity,
    motionCaptionLeadMs, motionSfxEnabled, motionSfxVolume, motionExportSpeed, motionHookEnabled,
    motionSelectedHookId, motionLoop, setMotionAutoSyncReport, setMotionAutoSyncNote,
    motionManifestText, setMotionManifestText, setMotionManifestNote, setMotionManifestWarnings,
    motionDoc, setMotionDoc, motionUndoRef, motionRedoRef, setMotionHistoryTick, motionSaveTimerRef,
    setMotionSaveState, saveToHistory, activeHistoryId, setActiveHistoryId, motionAudioName, motionMusicName,
    motionMusicVolume, motionWholeImageMotion, motionZigzagMotion, motionZoneBorder, motionMinimalMode, motionHideImageCaptions,
    motionCsvR2UrlRef, motionAudioR2UrlRef, motionMusicR2UrlRef, motionTranscriptRawTextRef,
    ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme,
    creatorMode, setJsonText, clearMotionTimeline, setShowFixSlideOrderModal, setCopiedMotionPrompt, setCopiedSpeechPrompt,
    isDraggingMotionLayer, setIsDraggingMotionLayer, motionLayerDragStateRef, scale, ar,
    setMotionOverlayUploadState, setMotionOverlayUploadError,
  });

  const {
    playHookPhase,
    handleToggleMotionPlay,
    playMotionSfx,
    playMotionSlideChime,
    motionActiveWord,
    waitForAudioReady,
    handleExportTimelineVideo,
    handleExportMotionVideo,
  } = useMotionPlaybackExport({
    creatorMode, canvasRef, loadedImagesRef, colors, config, ar, scale,
    motionSlides, activeMotionIndex, setActiveMotionIndex, motionData, activeMotionSlideId, setMotionData,
    motionTimeline, motionTimeMs, setMotionTimeMs, isPlayingMotion, setIsPlayingMotion,
    isExportingTimeline, setIsExportingTimeline, timelineExportElapsed, setTimelineExportElapsed,
    motionExportSpeed, motionAnimFrameRef, motionTimeRef, motionClockOriginRef, motionLoopRef, motionSpeedRef,
    ensureMotionMix, seekMotionTo, ensureMotionAssets, motionAudioRef, motionMusicRef, motionMixRef,
    motionHookEnabled, motionHooks, motionSelectedHookId, motionHookVideoRef, isHookPhasePlaying, setIsHookPhasePlaying,
    motionOverlayVideoElsRef, motionLayerImgElsRef, motionAssetVersion, motionOverlayVideoVersion,
    motionTranscript, motionCaptions, motionCaptionPosition, motionCaptionBgOpacity, motionCaptionLeadMs, motionPaperCutStyle, motionWholeImageMotion,
    motionZigzagMotion, motionZoneBorder, motionMinimalMode, motionHideImageCaptions, motionSfxEnabled, motionSfxVolume,
    motionLastSceneIndexRef, motionZoneVisibleRef, motionZoneSeededSceneRef, motionZoneFlourishRef,
    motionCurrentZoneVisibleRef, motionCurrentZoneIdRef, motionCurrentZoneSceneRef,
    motionMinimalPrevZoneIdRef,
    setElementBounds, setSegmentError, setIsRecordingVideo,
  });

  const {
    handleUpdateMetric,
    handleDeleteMetric,
    handleAddMetric,
    handleUpdateSection,
    handleDeleteSection,
    handleAddSection,
    handleAddTag,
    handleDeleteTag,
  } = useIndicatorFields({ parsedData, setParsedData, creatorMode, setJsonText });

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

  const {
    showGenerateMenu, setShowGenerateMenu,
    showPromptForCategory, setShowPromptForCategory,
    generatingBatch, generateError, setGenerateError,
    fullyAutomated, setFullyAutomated,
    batchMeta,
    rawBatchCandidates, rawBatchCover, rawBatchOutro,
    selectedPosterIndices,
    showSelectionModal, setShowSelectionModal,
    generatingImages, imageGenProgress,
    generateNewsBatch,
    generateFactsBatch,
    generateLearningsBatch,
    togglePosterSelection,
    selectAllPosters,
    clearPosterSelection,
    applyPosterSelection,
    fillAllImages,
    importAiBatch,
  } = useAiBatchGeneration({
    newsData, setNewsData, setActiveNewsIndex, setJsonText, setJsonError, setCreatorMode, setActiveTab,
    setDeselectedForZip, setActiveHistoryId, saveToHistory, buildWebSearchQuery, fetchTopPexelsImage,
    ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme,
  });

  const {
    downloadingZip,
    download,
    downloadAll,
    generateReelSlides,
  } = useExportAndDownload({
    rendered, jsonText, isBatchMode, ar, colors, config, activeImgRef, creatorMode, activeNewsIndex,
    visibleNewsPosition, visibleNewsCount, posterStyle, activeGradient, gradientPresetId, editorialTheme,
    gradientFade, sentimentScheme, ratioId, analysisData, newsData, loadedImagesRef, zipIncludedIndices,
    activeHistoryId, batchMeta,
  });

  const {
    showHistory, setShowHistory,
    historyItems, historyLoading, historyError, historyBusyId,
    openHistory,
    handleSaveCurrentToHistory,
    loadHistoryEntry,
    deleteHistoryEntry,
  } = useHistoryPanel({
    isBatchMode, newsData, setNewsData, creatorMode, setCreatorMode, analysisData, setAnalysisData,
    parsedData, setParsedData, setActiveNewsIndex, setJsonText, setJsonError, setActiveTab, setDeselectedForZip,
    setRatioId, setColors, setConfig, setPosterStyle, setGradientPresetId, setEditorialTheme, setGradientFade,
    setSentimentScheme, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade,
    sentimentScheme, activeHistoryId, setActiveHistoryId, setSaveStatus, saveToHistory,
    motionSlides, setMotionSlides, setActiveMotionIndex, setMotionTimeMs, motionTimeRef, setSegmentError,
    preloadMotionSlideImages, motionTimelineText, setMotionTimelineText, motionManifestText, setMotionManifestText,
    setMotionManifestNote, setMotionManifestWarnings, setMotionTimeline, setMotionTimelineReport, setMotionDoc,
    motionUndoRef, motionRedoRef, setMotionHistoryTick, setMotionSaveState,
    motionAudioName, setMotionAudioName, motionMusicName, setMotionMusicName, motionMusicVolume, setMotionMusicVolume,
    motionPaperCutStyle, setMotionPaperCutStyle, motionTextOnlySync, setMotionTextOnlySync,
    motionWholeImageMotion, setMotionWholeImageMotion, motionZigzagMotion, setMotionZigzagMotion,
    motionZoneBorder, setMotionZoneBorder,
    motionMinimalMode, setMotionMinimalMode,
    motionHideImageCaptions, setMotionHideImageCaptions,
    motionIntroCard, setMotionIntroCard, motionCaptions, setMotionCaptions,
    motionCaptionPosition, setMotionCaptionPosition,
    motionCaptionBgOpacity, setMotionCaptionBgOpacity,
    motionCaptionLeadMs, setMotionCaptionLeadMs,
    motionSfxEnabled, setMotionSfxEnabled, motionSfxVolume, setMotionSfxVolume,
    motionExportSpeed, setMotionExportSpeed, motionHookEnabled, setMotionHookEnabled,
    motionSelectedHookId, setMotionSelectedHookId, motionLoop, setMotionLoop,
    motionTranscriptRawTextRef, setMotionTranscriptRawText, motionCsvR2UrlRef, setMotionCsvR2Url,
    setMotionTranscript, setMotionTranscriptName, setMotionTranscriptNote,
    motionAudioR2UrlRef, setMotionAudioR2Url, motionAudioUrlRef, motionAudioRef, clearMotionAudio,
    motionMusicR2UrlRef, setMotionMusicR2Url, motionMusicUrlRef, motionMusicRef, clearMotionMusic,
  });

  // Slides whose timeline scene has a manually-overridden timing (see the
  // `manual` flag in lib/motion-timeline/edit.ts) — surfaced as a yellow
  // "retimed" indicator in the "Match Slides to the Script" modal below, so
  // a script-matching decision doesn't miss that the timing was hand-tuned.
  // A scene's own cascaded word-detach cues count too, since the scene as a
  // whole was retimed even if `scene.manual` itself happens to be false
  // (e.g. a boundary drag touches the neighbor, not the scene being dragged).
  // Levels carousel — its own self-contained editor state; the tab swaps the
  // whole right-hand panel out for the carousel workspace, so nothing here
  // touches the poster pipeline above.
  const levels = useLevelsCarousel();

  const modifiedSlideIds = useMemo(() => {
    const ids = new Set<string>();
    if (!motionDoc) return ids;
    for (const scene of motionDoc.scenes) {
      const touched =
        scene.manual ||
        scene.camera.some((c) => c.manual) ||
        scene.tracks.some((t) => t.cues.some((c) => c.manual));
      if (!touched) continue;
      const slideId = motionSlides[scene.slideIndex]?.slideId;
      if (slideId) ids.add(slideId);
    }
    return ids;
  }, [motionDoc, motionSlides]);

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
        <LeftPanelChrome
          setPanelCollapsed={setPanelCollapsed}
          handleSetAsDefault={handleSetAsDefault}
          defaultSaveStatus={defaultSaveStatus}
          creatorMode={creatorMode}
          rawBatchCandidates={rawBatchCandidates}
          setShowSelectionModal={setShowSelectionModal}
          setCreatorMode={setCreatorMode}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          TABS={TABS}
        />

        {/* Scrollable Configuration Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Levels is a whole editor of its own — one panel, its own canvas on
              the right, and no tab strip. It replaces the poster tabs outright
              rather than sitting beside them, so a stale activeTab left over
              from another mode cannot leak a Colors or JSON panel in under it. */}
          {creatorMode === "levels" ? <LevelsTab state={levels} /> : (
          <>
          
          {/* CONTENT TAB — and, in motion mode, all five of its own tabs, since
              MotionFields routes them internally off `motionTab`. */}
          {(activeTab === "content" || creatorMode === "motion") && (
            <div className="space-y-3.5">

              {creatorMode === "analysis" && (
                <AnalysisFields
                  analysisData={analysisData}
                  getFieldClassName={getFieldClassName}
                  inputStyle={inputStyle}
                  handleUpdateField={handleUpdateField}
                  colors={colors}
                  handleImageDragOver={handleImageDragOver}
                  handleImageDragLeave={handleImageDragLeave}
                  handleImageDrop={handleImageDrop}
                  imageFileRef={imageFileRef}
                />
              )}

              {creatorMode === "news" && (
                <NewsFields
                  newsData={newsData}
                  activeNewsIndex={activeNewsIndex}
                  setActiveNewsIndex={setActiveNewsIndex}
                  getFieldClassName={getFieldClassName}
                  inputStyle={inputStyle}
                  handleUpdateField={handleUpdateField}
                  colors={colors}
                  handleImageDragOver={handleImageDragOver}
                  handleImageDragLeave={handleImageDragLeave}
                  handleImageDrop={handleImageDrop}
                  imageFileRef={imageFileRef}
                  buildWebSearchQuery={buildWebSearchQuery}
                  handleWebImageSelect={handleWebImageSelect}
                  hideBento={hideBento}
                  setHideBento={setHideBento}
                  batchMeta={batchMeta}
                  visibleNewsCount={visibleNewsCount}
                  bentoFilteredIndices={bentoFilteredIndices}
                  selectAllForZip={selectAllForZip}
                  deselectAllForZip={deselectAllForZip}
                  deselectedForZip={deselectedForZip}
                  toggleZipSelection={toggleZipSelection}
                />
              )}

              {(creatorMode === "facts" || creatorMode === "learnings") && (
                <FactsLearningsFields
                  newsData={newsData}
                  activeNewsIndex={activeNewsIndex}
                  setActiveNewsIndex={setActiveNewsIndex}
                  creatorMode={creatorMode}
                  getFieldClassName={getFieldClassName}
                  inputStyle={inputStyle}
                  handleUpdateField={handleUpdateField}
                  colors={colors}
                  handleImageDragOver={handleImageDragOver}
                  handleImageDragLeave={handleImageDragLeave}
                  handleImageDrop={handleImageDrop}
                  imageFileRef={imageFileRef}
                  buildWebSearchQuery={buildWebSearchQuery}
                  handleWebImageSelect={handleWebImageSelect}
                />
              )}

              {creatorMode === "watermark" && (
                <WatermarkFields
                  watermarkFileInputRef={watermarkFileInputRef}
                  handleWatermarkFiles={handleWatermarkFiles}
                  newsData={newsData}
                  setNewsData={setNewsData}
                  setJsonText={setJsonText}
                  setActiveNewsIndex={setActiveNewsIndex}
                  activeNewsIndex={activeNewsIndex}
                  watermarkPosition={watermarkPosition}
                  handleSetWatermarkPosition={handleSetWatermarkPosition}
                  watermarkStratiColor={watermarkStratiColor}
                  watermarkXColor={watermarkXColor}
                  handleSetWatermarkColors={handleSetWatermarkColors}
                  watermarkBgStyle={watermarkBgStyle}
                  setWatermarkBgStyle={setWatermarkBgStyle}
                  watermarkScale={watermarkScale}
                  setWatermarkScale={setWatermarkScale}
                  handleApplyAllWatermarkSettingsToBatch={handleApplyAllWatermarkSettingsToBatch}
                  handleUpdateField={handleUpdateField}
                  setShowGridView={setShowGridView}
                  swapFromIndex={swapFromIndex}
                  setSwapFromIndex={setSwapFromIndex}
                  swapToIndex={swapToIndex}
                  setSwapToIndex={setSwapToIndex}
                  handleSwapIndices={handleSwapIndices}
                  handleMoveIndex={handleMoveIndex}
                />
              )}

              {creatorMode === "motion" && (
                <MotionFields
                  motionTab={activeTab}
                  handleMotionFilesUpload={handleMotionFilesUpload}
                  motionFileInputRef={motionFileInputRef}
                  motionSlides={motionSlides}
                  motionStrength={motionStrength}
                  isSegmenting={isSegmenting}
                  segmentProgress={segmentProgress}
                  segmentError={segmentError}
                  watermarkError={watermarkError}
                  motionOrderNotice={motionOrderNotice}
                  setMotionSlides={setMotionSlides}
                  setActiveMotionIndex={setActiveMotionIndex}
                  setMotionOrderNotice={setMotionOrderNotice}
                  setShowFixSlideOrderModal={setShowFixSlideOrderModal}
                  handleRemoveAllWatermarks={handleRemoveAllWatermarks}
                  isRemovingWatermarks={isRemovingWatermarks}
                  watermarkProgress={watermarkProgress}
                  activeMotionIndex={activeMotionIndex}
                  motionTimeline={motionTimeline}
                  seekMotionTo={seekMotionTo}
                  motionTimelineText={motionTimelineText}
                  setMotionTimelineText={setMotionTimelineText}
                  motionTimelineReport={motionTimelineReport}
                  applyMotionTimeline={applyMotionTimeline}
                  clearMotionTimeline={clearMotionTimeline}
                  motionTimeMs={motionTimeMs}
                  isPlayingMotion={isPlayingMotion}
                  isHookPhasePlaying={isHookPhasePlaying}
                  handleToggleMotionPlay={handleToggleMotionPlay}
                  playMotionSfx={playMotionSfx}
                  motionSfxEnabled={motionSfxEnabled}
                  setMotionSfxEnabled={setMotionSfxEnabled}
                  motionSfxVolume={motionSfxVolume}
                  setMotionSfxVolume={setMotionSfxVolume}
                  motionLoop={motionLoop}
                  setMotionLoop={setMotionLoop}
                  motionTranscript={motionTranscript}
                  motionTranscriptName={motionTranscriptName}
                  motionTranscriptNote={motionTranscriptNote}
                  handleMotionTranscriptFile={handleMotionTranscriptFile}
                  clearMotionTranscript={clearMotionTranscript}
                  handleMotionCombinedFiles={handleMotionCombinedFiles}
                  motionActiveWord={motionActiveWord}
                  motionAudioName={motionAudioName}
                  handleMotionAudioFile={handleMotionAudioFile}
                  clearMotionAudio={clearMotionAudio}
                  motionMusicName={motionMusicName}
                  handleMotionMusicFile={handleMotionMusicFile}
                  clearMotionMusic={clearMotionMusic}
                  motionMusicVolume={motionMusicVolume}
                  setMotionMusicVolume={setMotionMusicVolume}
                  motionExportSpeed={motionExportSpeed}
                  setMotionExportSpeed={setMotionExportSpeed}
                  motionHooks={motionHooks}
                  motionHookEnabled={motionHookEnabled}
                  setMotionHookEnabled={setMotionHookEnabled}
                  motionSelectedHookId={motionSelectedHookId}
                  setMotionSelectedHookId={setMotionSelectedHookId}
                  handleUploadHook={handleUploadHook}
                  handleDeleteHook={handleDeleteHook}
                  hookUploadState={hookUploadState}
                  hookUploadError={hookUploadError}
                  motionDoc={motionDoc}
                  handleAddOverlayClip={handleAddOverlayClip}
                  handleUpdateOverlayClip={handleUpdateOverlayClip}
                  handleDeleteOverlayClip={handleDeleteOverlayClip}
                  motionOverlayUploadState={motionOverlayUploadState}
                  motionOverlayUploadError={motionOverlayUploadError}
                  motionCaptionLeadMs={motionCaptionLeadMs}
                  setMotionCaptionLeadMs={setMotionCaptionLeadMs}
                  autoSyncMotionTimeline={autoSyncMotionTimeline}
                  motionTextOnlySync={motionTextOnlySync}
                  setMotionTextOnlySync={setMotionTextOnlySync}
                  motionIntroCard={motionIntroCard}
                  setMotionIntroCard={setMotionIntroCard}
                  motionCaptions={motionCaptions}
                  setMotionCaptions={setMotionCaptions}
                  motionCaptionPosition={motionCaptionPosition}
                  setMotionCaptionPosition={setMotionCaptionPosition}
                  motionCaptionBgOpacity={motionCaptionBgOpacity}
                  setMotionCaptionBgOpacity={setMotionCaptionBgOpacity}
                  motionHideImageCaptions={motionHideImageCaptions}
                  setMotionHideImageCaptions={setMotionHideImageCaptions}
                  motionPaperCutStyle={motionPaperCutStyle}
                  setMotionPaperCutStyle={setMotionPaperCutStyle}
                  motionWholeImageMotion={motionWholeImageMotion}
                  setMotionWholeImageMotion={setMotionWholeImageMotion}
                  motionZigzagMotion={motionZigzagMotion}
                  setMotionZigzagMotion={setMotionZigzagMotion}
                  motionZoneBorder={motionZoneBorder}
                  setMotionZoneBorder={setMotionZoneBorder}
                  motionMinimalMode={motionMinimalMode}
                  setMotionMinimalMode={setMotionMinimalMode}
                  handleCopySpeechPrompt={handleCopySpeechPrompt}
                  copiedSpeechPrompt={copiedSpeechPrompt}
                  motionAutoSyncReport={motionAutoSyncReport}
                  motionAutoSyncNote={motionAutoSyncNote}
                  hasManualTimingEdits={modifiedSlideIds.size > 0}
                  motionManifestText={motionManifestText}
                  setMotionManifestText={setMotionManifestText}
                  buildMotionTimelineFromManifest={buildMotionTimelineFromManifest}
                  motionManifestNote={motionManifestNote}
                  motionManifestWarnings={motionManifestWarnings}
                  handleCopyMotionPrompt={handleCopyMotionPrompt}
                  copiedMotionPrompt={copiedMotionPrompt}
                  handleExportTimelineVideo={handleExportTimelineVideo}
                  isExportingTimeline={isExportingTimeline}
                  timelineExportElapsed={timelineExportElapsed}
                  motionAssetProgress={motionAssetProgress}
                  motionData={motionData}
                  isRecordingVideo={isRecordingVideo}
                  handleExportMotionVideo={handleExportMotionVideo}
                  setMotionData={setMotionData}
                  setJsonText={setJsonText}
                  copiedMotionJson={copiedMotionJson}
                  setCopiedMotionJson={setCopiedMotionJson}
                />
              )}

              {creatorMode === "indicator" && (
                <IndicatorFields
                  parsedData={parsedData}
                  handleUpdateField={handleUpdateField}
                  getFieldClassName={getFieldClassName}
                  inputStyle={inputStyle}
                  handleDeleteTag={handleDeleteTag}
                  handleAddTag={handleAddTag}
                  colors={colors}
                  handleImageDragOver={handleImageDragOver}
                  handleImageDragLeave={handleImageDragLeave}
                  handleImageDrop={handleImageDrop}
                  imageFileRef={imageFileRef}
                  handleAddMetric={handleAddMetric}
                  handleUpdateMetric={handleUpdateMetric}
                  handleDeleteMetric={handleDeleteMetric}
                  handleAddSection={handleAddSection}
                  handleUpdateSection={handleUpdateSection}
                  handleDeleteSection={handleDeleteSection}
                />
              )}
            </div>
          )}

          {/* COLORS & THEMES TAB */}
          {activeTab === "colors" && (
            <ColorsThemesTab
              isBatchMode={isBatchMode}
              posterStyle={posterStyle}
              setPosterStyle={setPosterStyle}
              creatorMode={creatorMode}
              sentimentScheme={sentimentScheme}
              setSentimentScheme={setSentimentScheme}
              gradientFade={gradientFade}
              setGradientFade={setGradientFade}
              editorialTheme={editorialTheme}
              setEditorialTheme={setEditorialTheme}
              gradientPresetId={gradientPresetId}
              setGradientPresetId={setGradientPresetId}
              colors={colors}
              setColors={setColors}
            />
          )}

          {/* LAYOUT TAB */}
          {activeTab === "layout" && (
            <LayoutTab ratioId={ratioId} setRatioId={setRatioId} ar={ar} config={config} setConfig={setConfig} />
          )}

          {/* RAW JSON TAB */}
          {activeTab === "json" && (
            <RawJsonTab jsonText={jsonText} setJsonText={setJsonText} jsonError={jsonError} setShowSample={setShowSample} />
          )}

          {/* AI PROMPT TAB */}
          {activeTab === "ai-prompt" && (
            <AiPromptTab setShowPromptModal={setShowPromptModal} />
          )}

          {/* PROMPT BUILDER TAB */}
          {activeTab === "prompt-builder" && <PromptBuilder />}

          </>
          )}
        </div>

        {/* Generate + Re-render (Left panel footer) — poster pipeline only */}
        {creatorMode !== "levels" && (
        <GenerateFooter
          generateError={generateError}
          setGenerateError={setGenerateError}
          showGenerateMenu={showGenerateMenu}
          setShowGenerateMenu={setShowGenerateMenu}
          generateNewsBatch={generateNewsBatch}
          fullyAutomated={fullyAutomated}
          setFullyAutomated={setFullyAutomated}
          setShowPromptForCategory={setShowPromptForCategory}
          generateFactsBatch={generateFactsBatch}
          generateLearningsBatch={generateLearningsBatch}
          setCreatorMode={setCreatorMode}
          setShowPromptModal={setShowPromptModal}
          generatingBatch={generatingBatch}
          render={render}
          creatorMode={creatorMode}
          newsData={newsData}
          fillAllImages={fillAllImages}
          generatingImages={generatingImages}
          buildWebSearchQuery={buildWebSearchQuery}
          imageGenProgress={imageGenProgress}
          handleSaveCurrentToHistory={handleSaveCurrentToHistory}
          saveStatus={saveStatus}
          openHistory={openHistory}
          setShowCalendarModal={setShowCalendarModal}
        />
        )}
      </div>
      </div>

      {/* ── Right Panel: Preview ──────────────────────────────────────────── */}
      {creatorMode === "levels" ? (
        <LevelsCarouselPanel
          state={levels}
          panelCollapsed={panelCollapsed}
          setPanelCollapsed={setPanelCollapsed}
        />
      ) : (
      <PreviewCanvasPanel
        panelCollapsed={panelCollapsed}
        setPanelCollapsed={setPanelCollapsed}
        colors={colors}
        isBatchMode={isBatchMode}
        download={download}
        rendered={rendered}
        newsData={newsData}
        setShowReelStudio={setShowReelStudio}
        zipIncludedIndices={zipIncludedIndices}
        downloadAll={downloadAll}
        downloadingZip={downloadingZip}
        scale={scale}
        visibleNewsPosition={visibleNewsPosition}
        visibleNewsCount={visibleNewsCount}
        goToPrevVisibleNews={goToPrevVisibleNews}
        goToNextVisibleNews={goToNextVisibleNews}
        creatorMode={creatorMode}
        setShowGridView={setShowGridView}
        previewRef={previewRef}
        setIsDraggingCanvasOver={setIsDraggingCanvasOver}
        isDraggingCanvasOver={isDraggingCanvasOver}
        handleWatermarkFiles={handleWatermarkFiles}
        processImageFile={processImageFile}
        ar={ar}
        canvasRef={canvasRef}
        elementBounds={elementBounds}
        activeNewsIndex={activeNewsIndex}
        setImageWheelRef={setImageWheelRef}
        handleElementClick={handleElementClick}
        handleLogoMouseDown={handleLogoMouseDown}
        handleStartMotionLayerDrag={handleStartMotionLayerDrag}
        handleImageMouseDown={handleImageMouseDown}
        isDraggingLogo={isDraggingLogo}
        isDraggingMotionLayer={isDraggingMotionLayer}
        isDraggingImage={isDraggingImage}
        handleImageDragOver={handleImageDragOver}
        handleImageDragLeave={handleImageDragLeave}
        handleImageDrop={handleImageDrop}
        imageFileRef={imageFileRef}
        motionDoc={motionDoc}
        applyMotionDocEdit={applyMotionDocEdit}
        beginMotionGesture={beginMotionGesture}
        motionTimeMs={motionTimeMs}
        seekMotionTo={seekMotionTo}
        isPlayingMotion={isPlayingMotion}
        isHookPhasePlaying={isHookPhasePlaying}
        handleToggleMotionPlay={handleToggleMotionPlay}
        motionTranscript={motionTranscript}
        motionSlides={motionSlides}
        motionHistoryTick={motionHistoryTick}
        motionUndoRef={motionUndoRef}
        motionRedoRef={motionRedoRef}
        undoMotionEdit={undoMotionEdit}
        redoMotionEdit={redoMotionEdit}
        motionSaveState={motionSaveState}
      />
      )}

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
          modifiedSlideIds={modifiedSlideIds}
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
        <GridViewModal
          newsData={newsData}
          activeNewsIndex={activeNewsIndex}
          setActiveNewsIndex={setActiveNewsIndex}
          setNewsData={setNewsData}
          setJsonText={setJsonText}
          draggedGridItemIndex={draggedGridItemIndex}
          setDraggedGridItemIndex={setDraggedGridItemIndex}
          watermarkFileInputRef={watermarkFileInputRef}
          handleSwapIndices={handleSwapIndices}
          handleMoveIndex={handleMoveIndex}
          onClose={() => setShowGridView(false)}
        />
      )}
    </div>
  );
}
