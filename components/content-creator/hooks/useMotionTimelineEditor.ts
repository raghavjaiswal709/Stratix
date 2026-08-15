"use client";

import { useCallback, useEffect, type RefObject } from "react";
import { uploadMotionAssetToR2 } from "@/lib/motion-assets";
import type {
  HistoryListItem,
  MotionLayer,
  MotionSlide,
  MotionVideoData,
  PosterColors,
  PosterConfig,
} from "../types";
import { buildMotionLayoutJson, buildLeanMotionLayout } from "../motionLayoutJson";
import {
  parseMotionTimeline,
  parseLooseJson,
  parseSyncManifest,
  autoSyncTimeline,
  buildTimelineFromManifest,
  type AuthoredTimeline,
  type AutoSyncReport,
  type CompiledTimeline,
  type TimelineReport,
  type TranscriptWord,
} from "@/lib/motion-timeline";
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

/**
 * The AI Timeline editor: applying/building a compiled timeline, the
 * editable-doc + undo/redo surface, overlay clip CRUD, autosave, the "Fix
 * Slide Order" apply handler, prompt-copy helpers, and (because it needs
 * `scale`/`ar`, which don't exist yet inside useMotionCore) the motion-layer
 * drag effect.
 */
export function useMotionTimelineEditor({
  motionSlides,
  setMotionSlides,
  motionTranscript,
  motionTimelineText,
  setMotionTimelineText,
  setMotionTimelineReport,
  motionTimeline,
  setMotionTimeline,
  motionTimeRef,
  motionClockOriginRef,
  setMotionTimeMs,
  setActiveMotionIndex,
  setMotionData,
  motionAudioRef,
  ensureMotionAssets,
  setIsPlayingMotion,
  motionPaperCutStyle,
  motionTextOnlySync,
  motionIntroCard,
  motionCaptions,
  motionCaptionPosition,
  motionCaptionBgOpacity,
  motionCaptionLeadMs,
  motionSfxEnabled,
  motionSfxVolume,
  motionExportSpeed,
  motionHookEnabled,
  motionSelectedHookId,
  motionLoop,
  setMotionAutoSyncReport,
  setMotionAutoSyncNote,
  motionManifestText,
  setMotionManifestText,
  setMotionManifestNote,
  setMotionManifestWarnings,
  motionDoc,
  setMotionDoc,
  motionUndoRef,
  motionRedoRef,
  setMotionHistoryTick,
  motionSaveTimerRef,
  setMotionSaveState,
  saveToHistory,
  activeHistoryId,
  setActiveHistoryId,
  motionAudioName,
  motionMusicName,
  motionMusicVolume,
  motionWholeImageMotion,
  motionZigzagMotion,
  motionZoneBorder,
  motionHideImageCaptions,
  motionCsvR2UrlRef,
  motionAudioR2UrlRef,
  motionMusicR2UrlRef,
  motionTranscriptRawTextRef,
  ratioId,
  colors,
  config,
  posterStyle,
  gradientPresetId,
  editorialTheme,
  gradientFade,
  sentimentScheme,
  creatorMode,
  setJsonText,
  clearMotionTimeline,
  setShowFixSlideOrderModal,
  setCopiedMotionPrompt,
  setCopiedSpeechPrompt,
  isDraggingMotionLayer,
  setIsDraggingMotionLayer,
  motionLayerDragStateRef,
  scale,
  ar,
  setMotionOverlayUploadState,
  setMotionOverlayUploadError,
}: {
  motionSlides: MotionSlide[];
  setMotionSlides: (slides: MotionSlide[]) => void;
  motionTranscript: TranscriptWord[] | null;
  motionTimelineText: string;
  setMotionTimelineText: (text: string) => void;
  setMotionTimelineReport: (report: TimelineReport | null) => void;
  motionTimeline: CompiledTimeline | null;
  setMotionTimeline: (timeline: CompiledTimeline | null) => void;
  motionTimeRef: RefObject<number>;
  motionClockOriginRef: RefObject<number>;
  setMotionTimeMs: (ms: number) => void;
  setActiveMotionIndex: (index: number) => void;
  setMotionData: (updater: MotionVideoData | ((prev: MotionVideoData) => MotionVideoData)) => void;
  motionAudioRef: RefObject<HTMLAudioElement | null>;
  ensureMotionAssets: (slides: MotionSlide[], timeoutMs?: number) => Promise<boolean>;
  setIsPlayingMotion: (playing: boolean) => void;
  motionPaperCutStyle: boolean;
  motionTextOnlySync: boolean;
  motionIntroCard: boolean;
  motionCaptions: boolean;
  motionCaptionPosition: "top" | "bottom";
  motionCaptionBgOpacity: number;
  motionCaptionLeadMs: number;
  motionSfxEnabled: boolean;
  motionSfxVolume: number;
  motionExportSpeed: number;
  motionHookEnabled: boolean;
  motionSelectedHookId: string | null;
  motionLoop: boolean;
  setMotionAutoSyncReport: (report: AutoSyncReport | null) => void;
  setMotionAutoSyncNote: (note: string | null) => void;
  motionManifestText: string;
  setMotionManifestText: (text: string) => void;
  setMotionManifestNote: (note: string | null) => void;
  setMotionManifestWarnings: (warnings: string[]) => void;
  motionDoc: EditableTimeline | null;
  setMotionDoc: (doc: EditableTimeline | null) => void;
  motionUndoRef: RefObject<EditableTimeline[]>;
  motionRedoRef: RefObject<EditableTimeline[]>;
  setMotionHistoryTick: (updater: (t: number) => number) => void;
  motionSaveTimerRef: RefObject<number | null>;
  setMotionSaveState: (state: "idle" | "dirty" | "saving" | "saved" | "error" | ((s: "idle" | "dirty" | "saving" | "saved" | "error") => "idle" | "dirty" | "saving" | "saved" | "error")) => void;
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
  motionAudioName: string | null;
  motionMusicName: string | null;
  motionMusicVolume: number;
  motionWholeImageMotion: boolean;
  motionZigzagMotion: boolean;
  motionZoneBorder: boolean;
  motionHideImageCaptions: boolean;
  motionCsvR2UrlRef: RefObject<string | null>;
  motionAudioR2UrlRef: RefObject<string | null>;
  motionMusicR2UrlRef: RefObject<string | null>;
  motionTranscriptRawTextRef: RefObject<string | null>;
  ratioId: string;
  colors: PosterColors;
  config: PosterConfig;
  posterStyle: "editorial" | "bold";
  gradientPresetId: string;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: string;
  creatorMode: string;
  setJsonText: (text: string) => void;
  clearMotionTimeline: () => void;
  setShowFixSlideOrderModal: (show: boolean) => void;
  setCopiedMotionPrompt: (copied: boolean) => void;
  setCopiedSpeechPrompt: (copied: boolean) => void;
  isDraggingMotionLayer: boolean;
  setIsDraggingMotionLayer: (dragging: boolean) => void;
  motionLayerDragStateRef: RefObject<{ layerId: string; startClientX: number; startClientY: number; startLayerX: number; startLayerY: number } | null>;
  scale: number;
  ar: { w: number; h: number };
  setMotionOverlayUploadState: (s: "idle" | "uploading" | "error") => void;
  setMotionOverlayUploadError: (e: string | null) => void;
}) {
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
    setMotionTimelineReport,
    setMotionTimeline,
    motionTimeRef,
    motionClockOriginRef,
    setMotionTimeMs,
    setActiveMotionIndex,
    motionAudioRef,
    setIsPlayingMotion,
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
    [motionSlides, motionTranscript, motionPaperCutStyle, motionTextOnlySync, setMotionData, ensureMotionAssets, setMotionTimelineText, setMotionTimelineReport, setMotionTimeline, setMotionDoc, motionUndoRef, motionRedoRef, setMotionHistoryTick, motionTimeRef, motionClockOriginRef, setMotionTimeMs, setActiveMotionIndex, motionAudioRef, setIsPlayingMotion]
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
  }, [motionSlides, motionTranscript, applyBuiltTimeline, motionTextOnlySync, motionIntroCard, setMotionAutoSyncReport, setMotionAutoSyncNote, setMotionManifestNote, setMotionManifestWarnings]);

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
  }, [motionManifestText, motionTranscript, motionSlides, motionTextOnlySync, applyBuiltTimeline, setMotionManifestWarnings, setMotionManifestNote, setMotionAutoSyncReport, setMotionAutoSyncNote]);

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
          zoneBorder: motionZoneBorder,
          hideImageCaptions: motionHideImageCaptions,
          introCard: motionIntroCard,
          captions: motionCaptions,
          captionPosition: motionCaptionPosition,
          captionBgOpacity: motionCaptionBgOpacity,
          captionLeadMs: motionCaptionLeadMs,
          sfxEnabled: motionSfxEnabled,
          sfxVolume: motionSfxVolume,
          exportSpeed: motionExportSpeed,
          hookEnabled: motionHookEnabled,
          selectedHookId: motionSelectedHookId,
          loop: motionLoop,
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
      motionZoneBorder,
      motionHideImageCaptions,
      motionIntroCard,
      motionCaptions,
      motionCaptionPosition,
      motionCaptionBgOpacity,
      motionCaptionLeadMs,
      motionSfxEnabled,
      motionSfxVolume,
      motionExportSpeed,
      motionHookEnabled,
      motionSelectedHookId,
      motionLoop,
      activeHistoryId,
      ratioId,
      colors,
      config,
      posterStyle,
      gradientPresetId,
      editorialTheme,
      gradientFade,
      sentimentScheme,
      saveToHistory,
      setActiveHistoryId,
      setMotionSaveState,
      motionTranscriptRawTextRef,
      motionCsvR2UrlRef,
      motionAudioR2UrlRef,
      motionMusicR2UrlRef,
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
    motionMusicVolume,
    motionPaperCutStyle,
    motionTextOnlySync,
    motionWholeImageMotion,
    motionZigzagMotion,
    motionZoneBorder,
    motionHideImageCaptions,
    motionIntroCard,
    motionCaptions,
    motionCaptionPosition,
    motionCaptionBgOpacity,
    motionCaptionLeadMs,
    motionSfxEnabled,
    motionSfxVolume,
    motionExportSpeed,
    motionHookEnabled,
    motionSelectedHookId,
    motionLoop,
    persistMotionState,
    setMotionSaveState,
    motionSaveTimerRef,
  ]);

  /** Snapshot for undo, taken at the start of a gesture rather than per frame. */
  const beginMotionGesture = useCallback(() => {
    if (!motionDoc) return;
    motionUndoRef.current = [...motionUndoRef.current.slice(-49), motionDoc];
    motionRedoRef.current = [];
    setMotionHistoryTick((t) => t + 1);
  }, [motionDoc, motionUndoRef, motionRedoRef, setMotionHistoryTick]);

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
    [motionSlides, motionTranscript, motionPaperCutStyle, persistMotionState, setMotionDoc, setMotionTimelineText, setMotionTimelineReport, setMotionTimeline, setMotionSaveState, motionSaveTimerRef]
  );

  /** Client-side only — avoids needing a server-side video parse just to show a duration in the clip list. */
  const probeVideoDurationMs = useCallback((url: string): Promise<number | null> => {
    return new Promise((resolve) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => resolve(Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : null);
      probe.onerror = () => resolve(null);
      probe.src = url;
    });
  }, []);

  /**
   * Inserts a clip at the current playhead. `source` is either a freshly
   * uploaded file (goes to R2 under the "motion-video" scope, same presigned
   * flow as the voiceover/music) or an already-hosted URL — the default
   * "Use USD.mov" quick-add passes /hooks/usd.mov directly, no upload needed.
   */
  const handleAddOverlayClip = useCallback(
    async (source: { file: File } | { videoUrl: string; label: string }) => {
      if (!motionDoc) return;
      setMotionOverlayUploadState("uploading");
      setMotionOverlayUploadError(null);
      try {
        let videoUrl: string;
        let label: string;
        if ("file" in source) {
          videoUrl = await uploadMotionAssetToR2(source.file, "motion-video");
          label = source.file.name.replace(/\.[^.]+$/, "") || "Clip";
        } else {
          videoUrl = source.videoUrl;
          label = source.label;
        }
        const durationMs = (await probeVideoDurationMs(videoUrl)) ?? 3000;
        const next = addOverlay(motionDoc, {
          label,
          videoUrl,
          startMs: Math.round(motionTimeRef.current),
          durationMs,
          zIndex: 0,
          captionOverlay: false,
        });
        applyMotionDocEdit(next, { commit: true });
        setMotionOverlayUploadState("idle");
      } catch (err: any) {
        setMotionOverlayUploadState("error");
        setMotionOverlayUploadError(err?.message || "Could not add the clip.");
      }
    },
    [motionDoc, applyMotionDocEdit, probeVideoDurationMs, motionTimeRef, setMotionOverlayUploadState, setMotionOverlayUploadError]
  );

  const handleUpdateOverlayClip = useCallback(
    (id: string, patch: Partial<Omit<EditableOverlayClip, "id">>) => {
      if (!motionDoc) return;
      applyMotionDocEdit(updateOverlay(motionDoc, id, patch), { commit: true });
    },
    [motionDoc, applyMotionDocEdit]
  );

  const handleDeleteOverlayClip = useCallback(
    (id: string) => {
      if (!motionDoc) return;
      applyMotionDocEdit(deleteOverlay(motionDoc, id), { commit: true });
    },
    [motionDoc, applyMotionDocEdit]
  );

  const undoMotionEdit = useCallback(() => {
    const prev = motionUndoRef.current.pop();
    if (!prev || !motionDoc) return;
    motionRedoRef.current = [...motionRedoRef.current, motionDoc];
    setMotionHistoryTick((t) => t + 1);
    applyMotionDocEdit(prev, { commit: true });
  }, [motionDoc, applyMotionDocEdit, motionUndoRef, motionRedoRef, setMotionHistoryTick]);

  const redoMotionEdit = useCallback(() => {
    const next = motionRedoRef.current.pop();
    if (!next || !motionDoc) return;
    motionUndoRef.current = [...motionUndoRef.current, motionDoc];
    setMotionHistoryTick((t) => t + 1);
    applyMotionDocEdit(next, { commit: true });
  }, [motionDoc, applyMotionDocEdit, motionUndoRef, motionRedoRef, setMotionHistoryTick]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Applies the order chosen in the Fix Slide Order modal.
   *
   * Element ids are per-decomposition and slide positions are baked into any
   * existing timeline's `slideIndex` — reordering out from under it would
   * silently point every scene at the wrong poster, so the stale timeline is
   * cleared the same way a fresh upload clears it, not left to rot.
   *
   * Saves the exact same full payload shape persistMotionState does — this
   * used to save a stripped-down `{slides, ratioId, colors, ...}` object,
   * which as a straight PUT-replace (see the history API route) silently
   * wiped the transcript, audio, music and every toggle the next time the
   * project was reopened, not just the timeline this comment already
   * accounts for clearing. A reorder is as real a save-worthy edit as any
   * drag on the AI timeline, so it also no longer skips saving when this is
   * the very first save for a brand-new project (no activeHistoryId yet) —
   * it creates the record instead, same as persistMotionState does.
   */
  const handleApplyFixedSlideOrder = useCallback(
    async (reordered: MotionSlide[]) => {
      setMotionSlides(reordered);
      setActiveMotionIndex(0);
      setJsonText(JSON.stringify(buildMotionLayoutJson(reordered), null, 2));
      clearMotionTimeline();
      setShowFixSlideOrderModal(false);

      // Built from the reordered array directly, and an explicitly empty
      // timeline (matching what clearMotionTimeline just did) — not from
      // motionSlides/motionTimelineText state, which have not necessarily
      // flushed yet, so history must save the order the user just
      // confirmed, not whatever was there before it.
      setMotionSaveState("saving");
      const firstName = reordered[0]?.fileName?.replace(/\.[^.]+$/, "");
      const title = reordered.length > 1 ? `Motion Video · ${reordered.length} slides` : firstName || "Motion Video";
      const id = await saveToHistory(
        "motion-video",
        title,
        reordered.length,
        {
          slides: reordered,
          timelineText: "",
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
          zoneBorder: motionZoneBorder,
          hideImageCaptions: motionHideImageCaptions,
          introCard: motionIntroCard,
          captions: motionCaptions,
          captionPosition: motionCaptionPosition,
          captionBgOpacity: motionCaptionBgOpacity,
          captionLeadMs: motionCaptionLeadMs,
          sfxEnabled: motionSfxEnabled,
          sfxVolume: motionSfxVolume,
          exportSpeed: motionExportSpeed,
          hookEnabled: motionHookEnabled,
          selectedHookId: motionSelectedHookId,
          loop: motionLoop,
          ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme,
        },
        activeHistoryId,
        reordered[0]?.backgroundUrl || reordered[0]?.originalUrl
      );
      if (id) {
        if (!activeHistoryId) setActiveHistoryId(id);
        setMotionSaveState("saved");
      } else {
        setMotionSaveState("error");
      }
    },
    [
      activeHistoryId,
      clearMotionTimeline,
      ratioId,
      colors,
      config,
      posterStyle,
      gradientPresetId,
      editorialTheme,
      gradientFade,
      sentimentScheme,
      setMotionSlides,
      setActiveMotionIndex,
      setJsonText,
      setShowFixSlideOrderModal,
      setMotionSaveState,
      setActiveHistoryId,
      saveToHistory,
      motionManifestText,
      motionTranscriptRawTextRef,
      motionCsvR2UrlRef,
      motionAudioR2UrlRef,
      motionAudioName,
      motionMusicR2UrlRef,
      motionMusicName,
      motionMusicVolume,
      motionPaperCutStyle,
      motionTextOnlySync,
      motionWholeImageMotion,
      motionZigzagMotion,
      motionZoneBorder,
      motionHideImageCaptions,
      motionIntroCard,
      motionCaptions,
      motionCaptionPosition,
      motionCaptionBgOpacity,
      motionCaptionLeadMs,
      motionSfxEnabled,
      motionSfxVolume,
      motionExportSpeed,
      motionHookEnabled,
      motionSelectedHookId,
      motionLoop,
    ]
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
  }, [motionSlides, motionTranscript, motionManifestText, setCopiedMotionPrompt]);

  const handleCopySpeechPrompt = useCallback(() => {
    navigator.clipboard.writeText(SPEECH_BREAKDOWN_TEMPLATE);
    setCopiedSpeechPrompt(true);
    setTimeout(() => setCopiedSpeechPrompt(false), 3000);
  }, [setCopiedSpeechPrompt]);

  // Motion-layer drag-to-reposition on canvas. Lives here (not in
  // useMotionCore) because it needs `scale`/`ar`, which don't exist until
  // after useMotionCore returns.
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
  }, [isDraggingMotionLayer, scale, ar, setMotionData, setIsDraggingMotionLayer, motionLayerDragStateRef]);

  return {
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
  };
}

export type MotionTimelineEditorState = ReturnType<typeof useMotionTimelineEditor>;
