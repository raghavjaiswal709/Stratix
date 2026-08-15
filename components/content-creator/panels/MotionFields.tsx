"use client";

import type { RefObject } from "react";
import {
  AlertCircle,
  Check,
  Clapperboard,
  Code2,
  Copy,
  Eraser,
  Layers2,
  Loader2,
  Shuffle,
  Upload,
  X,
} from "lucide-react";
import type { DecompositionStrength, MotionLayer, MotionSlide, MotionTextBlock, MotionVideoData } from "../types";
import { buildMotionLayoutJson, describeMotionSlide } from "../motionLayoutJson";
import { MotionTimelinePanel } from "../motion/MotionTimelinePanel";

/**
 * The "Motion Video" content-tab panel: upload/decompose UI, the AI Timeline
 * panel (MotionTimelinePanel — already its own component), per-slide export
 * + layer manager, and the layout/text JSON copy box. Deliberately takes a
 * large flat prop list rather than a contrived grouping — it's a thin pass-
 * through wrapper over MotionTimelinePanel's own equally large prop surface.
 */
export function MotionFields(props: {
  handleMotionFilesUpload: (files: FileList | File[]) => void;
  motionFileInputRef: RefObject<HTMLInputElement | null>;
  motionSlides: MotionSlide[];
  motionStrength: DecompositionStrength;
  isSegmenting: boolean;
  segmentProgress: { done: number; total: number } | null;
  segmentError: string | null;
  watermarkError: string | null;
  motionOrderNotice: { message: string; previousOrder: MotionSlide[] } | null;
  setMotionSlides: (slides: MotionSlide[]) => void;
  setActiveMotionIndex: (index: number) => void;
  setMotionOrderNotice: (notice: { message: string; previousOrder: MotionSlide[] } | null) => void;
  setShowFixSlideOrderModal: (show: boolean) => void;
  handleRemoveAllWatermarks: () => void;
  isRemovingWatermarks: boolean;
  watermarkProgress: { done: number; total: number } | null;
  activeMotionIndex: number;
  motionTimeline: any;
  seekMotionTo: (ms: number) => void;
  motionTimelineText: string;
  setMotionTimelineText: (text: string) => void;
  motionTimelineReport: any;
  applyMotionTimeline: () => void;
  clearMotionTimeline: () => void;
  motionTimeMs: number;
  isPlayingMotion: boolean;
  isHookPhasePlaying: boolean;
  handleToggleMotionPlay: () => void;
  playMotionSfx: (sfx: any, volume: number) => void;
  motionSfxEnabled: boolean;
  setMotionSfxEnabled: (v: boolean) => void;
  motionSfxVolume: number;
  setMotionSfxVolume: (v: number) => void;
  motionLoop: boolean;
  setMotionLoop: (updater: boolean | ((prev: boolean) => boolean)) => void;
  motionTranscript: any;
  motionTranscriptName: string | null;
  motionTranscriptNote: string | null;
  handleMotionTranscriptFile: (file: File) => void;
  clearMotionTranscript: () => void;
  handleMotionCombinedFiles: (files: File[]) => void;
  motionActiveWord: any;
  motionAudioName: string | null;
  handleMotionAudioFile: (file: File) => void;
  clearMotionAudio: () => void;
  motionMusicName: string | null;
  handleMotionMusicFile: (file: File) => void;
  clearMotionMusic: () => void;
  motionMusicVolume: number;
  setMotionMusicVolume: (v: number) => void;
  motionExportSpeed: number;
  setMotionExportSpeed: (v: number) => void;
  motionHooks: any[];
  motionHookEnabled: boolean;
  setMotionHookEnabled: (v: boolean) => void;
  motionSelectedHookId: string | null;
  setMotionSelectedHookId: (id: string | null) => void;
  handleUploadHook: (file: File, label: string) => void;
  handleDeleteHook: (id: string) => void;
  hookUploadState: "idle" | "uploading" | "error";
  hookUploadError: string | null;
  motionDoc: any;
  handleAddOverlayClip: (source: { file: File } | { videoUrl: string; label: string }) => void;
  handleUpdateOverlayClip: (id: string, patch: any) => void;
  handleDeleteOverlayClip: (id: string) => void;
  motionOverlayUploadState: "idle" | "uploading" | "error";
  motionOverlayUploadError: string | null;
  motionCaptionLeadMs: number;
  setMotionCaptionLeadMs: (v: number) => void;
  autoSyncMotionTimeline: () => void;
  motionTextOnlySync: boolean;
  setMotionTextOnlySync: (v: boolean) => void;
  motionIntroCard: boolean;
  setMotionIntroCard: (v: boolean) => void;
  motionCaptions: boolean;
  setMotionCaptions: (v: boolean) => void;
  motionCaptionPosition: "top" | "bottom";
  setMotionCaptionPosition: (v: "top" | "bottom") => void;
  motionCaptionBgOpacity: number;
  setMotionCaptionBgOpacity: (v: number) => void;
  motionHideImageCaptions: boolean;
  setMotionHideImageCaptions: (v: boolean) => void;
  motionPaperCutStyle: boolean;
  setMotionPaperCutStyle: (v: boolean) => void;
  motionWholeImageMotion: boolean;
  setMotionWholeImageMotion: (v: boolean) => void;
  motionZigzagMotion: boolean;
  setMotionZigzagMotion: (v: boolean) => void;
  motionZoneBorder: boolean;
  setMotionZoneBorder: (v: boolean) => void;
  handleCopySpeechPrompt: () => void;
  copiedSpeechPrompt: boolean;
  motionAutoSyncReport: any;
  motionAutoSyncNote: string | null;
  motionManifestText: string;
  setMotionManifestText: (text: string) => void;
  buildMotionTimelineFromManifest: () => void;
  motionManifestNote: string | null;
  motionManifestWarnings: string[];
  handleCopyMotionPrompt: () => void;
  copiedMotionPrompt: boolean;
  handleExportTimelineVideo: () => void;
  isExportingTimeline: boolean;
  timelineExportElapsed: number | null;
  motionAssetProgress: { done: number; total: number } | null;
  motionData: MotionVideoData;
  isRecordingVideo: boolean;
  handleExportMotionVideo: () => void;
  setMotionData: (updater: MotionVideoData | ((prev: MotionVideoData) => MotionVideoData)) => void;
  setJsonText: (text: string) => void;
  copiedMotionJson: boolean;
  setCopiedMotionJson: (v: boolean) => void;
}) {
  const {
    handleMotionFilesUpload, motionFileInputRef, motionSlides, motionStrength, isSegmenting, segmentProgress,
    segmentError, watermarkError, motionOrderNotice, setMotionSlides, setActiveMotionIndex, setMotionOrderNotice,
    setShowFixSlideOrderModal, handleRemoveAllWatermarks, isRemovingWatermarks, watermarkProgress, activeMotionIndex,
    motionTimeline, seekMotionTo, motionTimelineText, setMotionTimelineText, motionTimelineReport,
    applyMotionTimeline, clearMotionTimeline, motionTimeMs, isPlayingMotion, isHookPhasePlaying,
    handleToggleMotionPlay, playMotionSfx, motionSfxEnabled, setMotionSfxEnabled, motionSfxVolume, setMotionSfxVolume,
    motionLoop, setMotionLoop, motionTranscript, motionTranscriptName, motionTranscriptNote,
    handleMotionTranscriptFile, clearMotionTranscript, handleMotionCombinedFiles, motionActiveWord, motionAudioName,
    handleMotionAudioFile, clearMotionAudio, motionMusicName, handleMotionMusicFile, clearMotionMusic,
    motionMusicVolume, setMotionMusicVolume, motionExportSpeed, setMotionExportSpeed, motionHooks, motionHookEnabled,
    setMotionHookEnabled, motionSelectedHookId, setMotionSelectedHookId, handleUploadHook, handleDeleteHook,
    hookUploadState, hookUploadError, motionDoc, handleAddOverlayClip, handleUpdateOverlayClip,
    handleDeleteOverlayClip, motionOverlayUploadState, motionOverlayUploadError, motionCaptionLeadMs,
    setMotionCaptionLeadMs, autoSyncMotionTimeline, motionTextOnlySync, setMotionTextOnlySync, motionIntroCard,
    setMotionIntroCard, motionCaptions, setMotionCaptions, motionCaptionPosition, setMotionCaptionPosition,
    motionCaptionBgOpacity, setMotionCaptionBgOpacity,
    motionHideImageCaptions, setMotionHideImageCaptions,
    motionPaperCutStyle, setMotionPaperCutStyle, motionWholeImageMotion, setMotionWholeImageMotion,
    motionZigzagMotion, setMotionZigzagMotion, motionZoneBorder, setMotionZoneBorder,
    handleCopySpeechPrompt, copiedSpeechPrompt, motionAutoSyncReport,
    motionAutoSyncNote, motionManifestText, setMotionManifestText, buildMotionTimelineFromManifest,
    motionManifestNote, motionManifestWarnings, handleCopyMotionPrompt, copiedMotionPrompt,
    handleExportTimelineVideo, isExportingTimeline, timelineExportElapsed, motionAssetProgress, motionData,
    isRecordingVideo, handleExportMotionVideo, setMotionData, setJsonText, copiedMotionJson, setCopiedMotionJson,
  } = props;

  return (
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
                  const scene = motionTimeline?.scenes.find((sc: any) => sc.slideIndex === i);
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
          onToggleLoop={() => setMotionLoop((l: boolean) => !l)}
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
          overlays={motionDoc?.overlays ?? []}
          onAddOverlayClip={handleAddOverlayClip}
          onUpdateOverlayClip={handleUpdateOverlayClip}
          onDeleteOverlayClip={handleDeleteOverlayClip}
          overlayUploadState={motionOverlayUploadState}
          overlayUploadError={motionOverlayUploadError}
          captionLeadMs={motionCaptionLeadMs}
          onCaptionLeadMsChange={setMotionCaptionLeadMs}
          onAutoSync={autoSyncMotionTimeline}
          textOnlySync={motionTextOnlySync}
          onTextOnlySyncChange={setMotionTextOnlySync}
          introCard={motionIntroCard}
          onIntroCardChange={setMotionIntroCard}
          captions={motionCaptions}
          onCaptionsChange={setMotionCaptions}
          captionPosition={motionCaptionPosition}
          onCaptionPositionChange={setMotionCaptionPosition}
          captionBgOpacity={motionCaptionBgOpacity}
          onCaptionBgOpacityChange={setMotionCaptionBgOpacity}
          hideImageCaptions={motionHideImageCaptions}
          onHideImageCaptionsChange={setMotionHideImageCaptions}
          paperCutStyle={motionPaperCutStyle}
          onPaperCutStyleChange={setMotionPaperCutStyle}
          wholeImageMotion={motionWholeImageMotion}
          onWholeImageMotionChange={setMotionWholeImageMotion}
          zigzagMotion={motionZigzagMotion}
          onZigzagMotionChange={setMotionZigzagMotion}
          zoneBorder={motionZoneBorder}
          onZoneBorderChange={setMotionZoneBorder}
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
  );
}
