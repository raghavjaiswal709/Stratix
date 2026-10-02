"use client";

import { useState, type RefObject } from "react";
import { parseTranscriptFile } from "@/lib/motion-timeline/transcript";
import { parseMotionTimeline, parseLooseJson, type AuthoredTimeline, type CompiledTimeline, type TimelineReport, type TranscriptWord } from "@/lib/motion-timeline";
import { toEditable, type EditableTimeline } from "@/lib/motion-timeline/edit";
import type {
  AnalysisData,
  CreatorMode,
  HistoryListItem,
  MotionSlide,
  NewsItem,
  PosterColors,
  PosterConfig,
  PosterData,
} from "../types";
import { parseJsonResponse } from "../apiUtils";
import { buildMotionLayoutJson } from "../motionLayoutJson";
import type { SentimentScheme } from "../canvas/canvasUtils";

/**
 * The History panel: the saved-generations list, and the big per-category
 * "Save current" / "Load entry" / "Delete entry" flows. Called last in
 * ContentCreatorPage because loadHistoryEntry restores state across every
 * other domain — it needs all of their setters.
 */
export function useHistoryPanel({
  isBatchMode,
  newsData,
  setNewsData,
  creatorMode,
  setCreatorMode,
  analysisData,
  setAnalysisData,
  parsedData,
  setParsedData,
  setActiveNewsIndex,
  setJsonText,
  setJsonError,
  setActiveTab,
  setDeselectedForZip,
  setRatioId,
  setColors,
  setConfig,
  setPosterStyle,
  setGradientPresetId,
  setEditorialTheme,
  setGradientFade,
  setSentimentScheme,
  ratioId,
  colors,
  config,
  posterStyle,
  gradientPresetId,
  editorialTheme,
  gradientFade,
  sentimentScheme,
  activeHistoryId,
  setActiveHistoryId,
  setSaveStatus,
  saveToHistory,
  motionSlides,
  setMotionSlides,
  setActiveMotionIndex,
  setMotionTimeMs,
  motionTimeRef,
  setSegmentError,
  preloadMotionSlideImages,
  motionTimelineText,
  setMotionTimelineText,
  motionManifestText,
  setMotionManifestText,
  setMotionManifestNote,
  setMotionManifestWarnings,
  setMotionTimeline,
  setMotionTimelineReport,
  setMotionDoc,
  motionUndoRef,
  motionRedoRef,
  setMotionHistoryTick,
  setMotionSaveState,
  motionAudioName,
  setMotionAudioName,
  motionMusicName,
  setMotionMusicName,
  motionMusicVolume,
  setMotionMusicVolume,
  motionPaperCutStyle,
  setMotionPaperCutStyle,
  motionTextOnlySync,
  setMotionTextOnlySync,
  motionWholeImageMotion,
  setMotionWholeImageMotion,
  motionZigzagMotion,
  setMotionZigzagMotion,
  motionZoneBorder,
  setMotionZoneBorder,
  motionMinimalMode,
  setMotionMinimalMode,
  motionHideImageCaptions,
  setMotionHideImageCaptions,
  motionIntroCard,
  setMotionIntroCard,
  motionCaptions,
  setMotionCaptions,
  motionCaptionPosition,
  setMotionCaptionPosition,
  motionCaptionBgOpacity,
  setMotionCaptionBgOpacity,
  motionCaptionLeadMs,
  setMotionCaptionLeadMs,
  motionSfxEnabled,
  setMotionSfxEnabled,
  motionSfxVolume,
  setMotionSfxVolume,
  motionExportSpeed,
  setMotionExportSpeed,
  motionHookEnabled,
  setMotionHookEnabled,
  motionSelectedHookId,
  setMotionSelectedHookId,
  motionLoop,
  setMotionLoop,
  motionTranscriptRawTextRef,
  setMotionTranscriptRawText,
  motionCsvR2UrlRef,
  setMotionCsvR2Url,
  setMotionTranscript,
  setMotionTranscriptName,
  setMotionTranscriptNote,
  motionAudioR2UrlRef,
  setMotionAudioR2Url,
  motionAudioUrlRef,
  motionAudioRef,
  clearMotionAudio,
  motionMusicR2UrlRef,
  setMotionMusicR2Url,
  motionMusicUrlRef,
  motionMusicRef,
  clearMotionMusic,
}: {
  isBatchMode: boolean;
  newsData: NewsItem[];
  setNewsData: (items: NewsItem[]) => void;
  creatorMode: CreatorMode;
  setCreatorMode: (mode: CreatorMode) => void;
  analysisData: AnalysisData;
  setAnalysisData: (data: AnalysisData) => void;
  parsedData: PosterData;
  setParsedData: (data: PosterData) => void;
  setActiveNewsIndex: (index: number) => void;
  setJsonText: (text: string) => void;
  setJsonError: (err: string | null) => void;
  setActiveTab: (tab: string) => void;
  setDeselectedForZip: (indices: Set<number>) => void;
  setRatioId: (id: string) => void;
  setColors: (colors: PosterColors) => void;
  setConfig: (config: PosterConfig) => void;
  setPosterStyle: (style: "editorial" | "bold") => void;
  setGradientPresetId: (id: string) => void;
  setEditorialTheme: (theme: "light" | "dark") => void;
  setGradientFade: (fade: number) => void;
  setSentimentScheme: (scheme: SentimentScheme) => void;
  ratioId: string;
  colors: PosterColors;
  config: PosterConfig;
  posterStyle: "editorial" | "bold";
  gradientPresetId: string;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: string;
  activeHistoryId: string | null;
  setActiveHistoryId: (id: string | null) => void;
  setSaveStatus: (status: "idle" | "saving" | "success" | "error") => void;
  saveToHistory: (
    category: HistoryListItem["category"],
    title: string,
    itemCount: number,
    payload: unknown,
    id?: string | null,
    previewUrl?: string
  ) => Promise<string | null>;
  motionSlides: MotionSlide[];
  setMotionSlides: (slides: MotionSlide[]) => void;
  setActiveMotionIndex: (index: number) => void;
  setMotionTimeMs: (ms: number) => void;
  motionTimeRef: RefObject<number>;
  setSegmentError: (msg: string | null) => void;
  preloadMotionSlideImages: (slide: MotionSlide) => Promise<void>;
  motionTimelineText: string;
  setMotionTimelineText: (text: string) => void;
  motionManifestText: string;
  setMotionManifestText: (text: string) => void;
  setMotionManifestNote: (note: string | null) => void;
  setMotionManifestWarnings: (warnings: string[]) => void;
  setMotionTimeline: (timeline: CompiledTimeline | null) => void;
  setMotionTimelineReport: (report: TimelineReport | null) => void;
  setMotionDoc: (doc: EditableTimeline | null) => void;
  motionUndoRef: RefObject<EditableTimeline[]>;
  motionRedoRef: RefObject<EditableTimeline[]>;
  setMotionHistoryTick: (updater: (t: number) => number) => void;
  setMotionSaveState: (state: "idle" | "dirty" | "saving" | "saved" | "error") => void;
  motionAudioName: string | null;
  setMotionAudioName: (name: string | null) => void;
  motionMusicName: string | null;
  setMotionMusicName: (name: string | null) => void;
  motionMusicVolume: number;
  setMotionMusicVolume: (v: number) => void;
  motionPaperCutStyle: boolean;
  setMotionPaperCutStyle: (v: boolean) => void;
  motionTextOnlySync: boolean;
  setMotionTextOnlySync: (v: boolean) => void;
  motionWholeImageMotion: boolean;
  setMotionWholeImageMotion: (v: boolean) => void;
  motionZigzagMotion: boolean;
  setMotionZigzagMotion: (v: boolean) => void;
  motionZoneBorder: boolean;
  setMotionZoneBorder: (v: boolean) => void;
  motionMinimalMode: boolean;
  setMotionMinimalMode: (v: boolean) => void;
  motionHideImageCaptions: boolean;
  setMotionHideImageCaptions: (v: boolean) => void;
  motionIntroCard: boolean;
  setMotionIntroCard: (v: boolean) => void;
  motionCaptions: boolean;
  setMotionCaptions: (v: boolean) => void;
  motionCaptionPosition: "top" | "bottom";
  setMotionCaptionPosition: (v: "top" | "bottom") => void;
  motionCaptionBgOpacity: number;
  setMotionCaptionBgOpacity: (v: number) => void;
  motionCaptionLeadMs: number;
  setMotionCaptionLeadMs: (v: number) => void;
  motionSfxEnabled: boolean;
  setMotionSfxEnabled: (v: boolean) => void;
  motionSfxVolume: number;
  setMotionSfxVolume: (v: number) => void;
  motionExportSpeed: number;
  setMotionExportSpeed: (v: number) => void;
  motionHookEnabled: boolean;
  setMotionHookEnabled: (v: boolean) => void;
  motionSelectedHookId: string | null;
  setMotionSelectedHookId: (id: string | null) => void;
  motionLoop: boolean;
  setMotionLoop: (updater: boolean | ((prev: boolean) => boolean)) => void;
  motionTranscriptRawTextRef: RefObject<string | null>;
  setMotionTranscriptRawText: (text: string | null) => void;
  motionCsvR2UrlRef: RefObject<string | null>;
  setMotionCsvR2Url: (url: string | null) => void;
  setMotionTranscript: (words: TranscriptWord[] | null) => void;
  setMotionTranscriptName: (name: string | null) => void;
  setMotionTranscriptNote: (note: string | null) => void;
  motionAudioR2UrlRef: RefObject<string | null>;
  setMotionAudioR2Url: (url: string | null) => void;
  motionAudioUrlRef: RefObject<string | null>;
  motionAudioRef: RefObject<HTMLAudioElement | null>;
  clearMotionAudio: () => void;
  motionMusicR2UrlRef: RefObject<string | null>;
  setMotionMusicR2Url: (url: string | null) => void;
  motionMusicUrlRef: RefObject<string | null>;
  motionMusicRef: RefObject<HTMLAudioElement | null>;
  clearMotionMusic: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);

  const loadHistoryList = async () => {
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
  };

  const openHistory = () => {
    setShowHistory(true);
    loadHistoryList();
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
            zoneBorder: motionZoneBorder,
            minimalMode: motionMinimalMode,
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
        setMotionZoneBorder(typeof payload.zoneBorder === "boolean" ? payload.zoneBorder : false);
        setMotionMinimalMode(typeof payload.minimalMode === "boolean" ? payload.minimalMode : false);
        setMotionHideImageCaptions(typeof payload.hideImageCaptions === "boolean" ? payload.hideImageCaptions : false);
        setMotionIntroCard(typeof payload.introCard === "boolean" ? payload.introCard : false);
        setMotionCaptions(typeof payload.captions === "boolean" ? payload.captions : false);
        setMotionCaptionPosition(payload.captionPosition === "top" ? "top" : "bottom");
        setMotionCaptionBgOpacity(typeof payload.captionBgOpacity === "number" ? payload.captionBgOpacity : 0.4);
        setMotionCaptionLeadMs(typeof payload.captionLeadMs === "number" ? payload.captionLeadMs : 200);
        setMotionSfxEnabled(typeof payload.sfxEnabled === "boolean" ? payload.sfxEnabled : true);
        setMotionSfxVolume(typeof payload.sfxVolume === "number" ? payload.sfxVolume : 0.65);
        setMotionExportSpeed(typeof payload.exportSpeed === "number" ? payload.exportSpeed : 1);
        setMotionHookEnabled(typeof payload.hookEnabled === "boolean" ? payload.hookEnabled : false);
        setMotionSelectedHookId(typeof payload.selectedHookId === "string" ? payload.selectedHookId : null);
        setMotionLoop(typeof payload.loop === "boolean" ? payload.loop : true);

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

  return {
    showHistory, setShowHistory,
    historyItems, historyLoading, historyError, historyBusyId,
    openHistory,
    handleSaveCurrentToHistory,
    loadHistoryEntry,
    deleteHistoryEntry,
  };
}

export type HistoryPanelState = ReturnType<typeof useHistoryPanel>;
