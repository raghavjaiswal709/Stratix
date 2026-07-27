"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
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
} from "lucide-react";

import type {
  PosterData,
  AnalysisData,
  NewsItem,
  CreatorMode,
  HistoryListItem,
  PosterColors,
  PosterConfig,
  PosterElement,
} from "./types";
import {
  RATIOS,
  COLOR_PRESETS,
  GRADIENT_PRESETS,
  EMPTY_ANALYSIS,
  EMPTY_INDICATOR,
} from "./constants";
import { buildInstagramCopyText } from "./promptBuilders";
import {
  buildBentoCard,
  withBentoImageFallback,
  parsePastedAiJson,
  importAiJson,
} from "./newsJsonImport";
import { compressImage, runWithConcurrency } from "./imageUtils";
import { WebImageSearch } from "./WebImageSearch";
import { drawPoster } from "./canvas/drawPoster";
import { computeCoverFitSlack, getAntonFontFamily } from "./canvas/canvasUtils";
import type { SentimentScheme } from "./canvas/canvasUtils";
import { SampleJsonModal } from "./modals/SampleJsonModal";
import { ShowPromptModal } from "./modals/ShowPromptModal";
import { PromptModal } from "./modals/PromptModal";
import { HistoryModal } from "./modals/HistoryModal";
import { PosterSelectionModal } from "./modals/PosterSelectionModal";
import { ContentCalendarModal } from "./modals/ContentCalendarModal";
import { CopyButton } from "./modals/CopyButton";
import { ReelStudioModal } from "./reel/ReelStudioModal";
import { REEL_W, REEL_H, type ReelSlideSource } from "./reel/reelTypes";

// Reels are consumed full-screen while scrolling and need to read at a
// glance — bump headline/eyebrow/body text (and, since every measurement in
// the draw functions flows through the same scale factor, the padding/gutter
// breathing room around them) well above the static-poster baseline. This
// only ever reaches drawPoster's reel-only `textScale` param (default 1
// everywhere else), so normal posters/downloads are completely unaffected.
const REEL_TEXT_SCALE = 1.45;

export function ContentCreatorPage() {
  const [creatorMode, setCreatorMode] = useState<CreatorMode>("analysis");
  // News/Facts/Learnings all store their batch as an array in `newsData` and
  // share the carousel/download/editor plumbing below — "indicator" and
  // "analysis" are the odd ones out, each with a single object.
  const isBatchMode = creatorMode === "news" || creatorMode === "facts" || creatorMode === "learnings";
  const [ratioId, setRatioId] = useState("square");

  // Keep track of JSON states independently so switching modes doesn't lose modifications
  const [analysisData, setAnalysisData] = useState<AnalysisData>(EMPTY_ANALYSIS);
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [parsedData, setParsedData] = useState<PosterData>(EMPTY_INDICATOR);
  const [activeNewsIndex, setActiveNewsIndex] = useState(0);

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
  // Auto image-gen (Gemini) for the cover/chosen stories/outro, fired when
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
      const data = await res.json();
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
    id: string | null = null
  ): Promise<string | null> => {
    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/content-creator/history/${id}` : "/api/content-creator/history";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, itemCount, payload }),
      });
      const data = await res.json();
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
      if (creatorMode === "news") {
        const first = newsData[0];
        const title = newsData.length > 1
          ? `News Batch · ${newsData.length} stories${first?.date ? ` · ${first.date}` : ""}`
          : (first?.title || "News Batch");
        createdId = await saveToHistory("news-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else if (creatorMode === "facts") {
        const title = `Facts · ${newsData.length} ${newsData.length === 1 ? "card" : "cards"}`;
        createdId = await saveToHistory("facts-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else if (creatorMode === "learnings") {
        const concept = newsData.find((d) => d.concept)?.concept;
        const title = concept ? `Learnings · ${concept}` : "Learnings Batch";
        createdId = await saveToHistory("learnings-batch", title, newsData.length, { posters: newsData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else if (creatorMode === "analysis") {
        const title = analysisData.instrument
          ? `${analysisData.instrument} · ${analysisData.levelName || "Daily Analysis"}`
          : "Daily Analysis";
        createdId = await saveToHistory("daily-analysis", title, 1, { analysisData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
      } else {
        const title = parsedData.title || parsedData.category || "Indicator Poster";
        createdId = await saveToHistory("indicator", title, 1, { parsedData, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme }, activeHistoryId);
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
      const doc = await res.json();
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
      } else if (doc.category === "daily-analysis" && payload.analysisData) {
        setCreatorMode("analysis");
        setAnalysisData(payload.analysisData);
        setJsonText(JSON.stringify(payload.analysisData, null, 2));
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
      if (!res.ok) { const d = await res.json(); throw new Error(d?.error || "Failed to delete"); }
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.posters) ? data.posters : [];
      if (items.length === 0) throw new Error("AI returned no posters — try again.");

      // items[0] is always the cover slide (isCover: true); the last item is
      // always the outro slide (isOutro: true) if present; everything between
      // is the 8-12 curated candidates. Don't commit to newsData yet — open
      // the selection modal so the user picks which stories make the batch.
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
      setShowSelectionModal(true);
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
      const data = await res.json();
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
      const data = await res.json();
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

  // Calls the Gemini-backed /generate-image route for one poster's
  // imagePrompt and compresses the result exactly like a manual upload
  // (see processImageFile below) so generated and uploaded images end up
  // in the same shape wherever imageUrl is read. Never throws — a failed
  // or missing image just leaves imageUrl empty, same as today, and the
  // poster falls back to the existing manual-upload picker.
  const generateImageForPrompt = async (prompt: string): Promise<string> => {
    if (!prompt) return "";
    try {
      const res = await fetch("/api/content-creator/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok || typeof data?.imageUrl !== "string") return "";
      return await compressImage(data.imageUrl);
    } catch {
      return "";
    }
  };

  // Builds the final batch (cover + whichever candidates are checked) and
  // commits it as the active newsData — this is the point the batch is
  // actually saved to History, so History only ever reflects what the user
  // chose to keep, not the full raw AI candidate pool. Also the point
  // images get auto-generated: only for stories the user actually kept,
  // not the full 20-story candidate pool, so a regenerate doesn't burn
  // through Gemini's free-tier quota on stories that never make the cut.
  const applyPosterSelection = async () => {
    const chosen = rawBatchCandidates.filter((_, idx) => selectedPosterIndices.has(idx));
    if (chosen.length === 0 && !rawBatchCover) return;

    const toIllustrate: NewsItem[] = [...(rawBatchCover ? [rawBatchCover] : []), ...chosen, ...(rawBatchOutro ? [rawBatchOutro] : [])];
    setImageGenProgress({ done: 0, total: toIllustrate.length });
    setGeneratingImages(true);
    let illustrated: NewsItem[];
    try {
      illustrated = await runWithConcurrency(toIllustrate, 3, async (story) => {
        const imageUrl = story.imageUrl || (await generateImageForPrompt(story.imagePrompt || ""));
        setImageGenProgress((p) => ({ ...p, done: p.done + 1 }));
        return imageUrl ? { ...story, imageUrl } : story;
      });
    } finally {
      setGeneratingImages(false);
    }

    let cursor = 0;
    const cover = rawBatchCover ? illustrated[cursor++] : null;
    const illustratedChosen = illustrated.slice(cursor, cursor + chosen.length);
    cursor += chosen.length;
    const outro = rawBatchOutro ? illustrated[cursor++] : null;

    // Every chosen story is immediately followed by its "explain it simply"
    // bento companion card — same story, plain-language rewrite. It inherits
    // the parent's imageUrl (buildBentoCard copies it), so this must run
    // after illustration above, not before.
    const chosenWithBento = illustratedChosen.flatMap((story) => [story, buildBentoCard(story)]);
    const items: NewsItem[] = [
      ...(cover ? [cover] : []),
      ...chosenWithBento,
      ...(outro ? [outro] : []),
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
      `News Batch · ${chosen.length} ${chosen.length === 1 ? "story" : "stories"} · ${batchMeta?.timeRangeLabel ?? "curated"}`,
      items.length,
      { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, timeRangeLabel: batchMeta?.timeRangeLabel, reportGeneratedAt: batchMeta?.reportGeneratedAt }
    );
    if (createdId) {
      setActiveHistoryId(createdId);
    }
  };

  // "Fill Images" — a standalone catch-up pass over whatever's already sitting
  // in newsData (loaded from History, pasted JSON, or a batch generated
  // before this feature existed), not just the moment a fresh batch is
  // confirmed. Runs on Pexels with the top hit auto-applied per poster (no
  // per-image picker) so a full batch fills in one click — Gemini's free
  // tier is too rate-limited to fill a whole batch reliably in one pass, see
  // generateImageForPrompt/fetchTopPexelsImage above. Only touches items
  // with no imageUrl yet, so it never clobbers a manual upload or an
  // existing pick — bento cards are skipped entirely since they inherit
  // their parent story's image at render time (see withBentoImageFallback).
  const fillAllImages = async () => {
    const targets = newsData
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.isBento && !item.imageUrl && buildWebSearchQuery(item));
    if (targets.length === 0) return;

    setImageGenProgress({ done: 0, total: targets.length });
    setGeneratingImages(true);
    let filled: { idx: number; imageUrl: string }[];
    try {
      const results = await runWithConcurrency(targets, 4, async ({ item, idx }) => {
        const imageUrl = await fetchTopPexelsImage(buildWebSearchQuery(item));
        setImageGenProgress((p) => ({ ...p, done: p.done + 1 }));
        return { idx, imageUrl };
      });
      filled = results.filter((r) => r.imageUrl);
    } finally {
      setGeneratingImages(false);
    }
    if (filled.length === 0) return;

    const next = [...newsData];
    for (const { idx, imageUrl } of filled) next[idx] = { ...next[idx], imageUrl };
    setNewsData(next);
    setJsonText(JSON.stringify(next, null, 2));
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

  const ar = RATIOS.find((r) => r.id === ratioId)!;

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
        const data = await res.json();
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

  // Pexels top-hit, no picking — used by "Fill Images" so a whole batch can
  // be illustrated in one click instead of clicking through the picker grid
  // per poster. Never throws — a failed search/fetch just leaves imageUrl
  // empty, same fallback behavior as the Gemini path.
  const fetchTopPexelsImage = async (query: string): Promise<string> => {
    if (!query.trim()) return "";
    try {
      const searchRes = await fetch("/api/content-creator/search-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const searchData = await searchRes.json();
      const top = searchRes.ok && Array.isArray(searchData.results) ? searchData.results[0] : null;
      if (!top?.imageUrl) return "";

      const fetchRes = await fetch("/api/content-creator/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: top.imageUrl }),
      });
      const fetchData = await fetchRes.json();
      if (!fetchRes.ok || typeof fetchData?.imageUrl !== "string") return "";
      return await compressImage(fetchData.imageUrl);
    } catch {
      return "";
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

  function download() {
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

    let fileName = `stratix-poster-${ratioId}-${Date.now()}.png`;
    if (creatorMode === "analysis") {
      const symbol = (analysisData.instrument || "analysis").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      fileName = `stratix-analysis-${symbol}-${ratioId}-${Date.now()}.png`;
    } else if (isBatchMode && newsData[activeNewsIndex]) {
      const titleSlug = (newsData[activeNewsIndex].title || creatorMode).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20);
      fileName = `stratix-${creatorMode}-${activeNewsIndex + 1}-${titleSlug}-${ratioId}-${Date.now()}.png`;
    }

    const a = document.createElement("a");
    a.href = tempCanvas.toDataURL("image/png");
    a.download = fileName;
    a.click();
  }

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
      const scaleFactor = 3.0; // 3x high resolution
      const highResAr = {
        ...ar,
        w: ar.w * scaleFactor,
        h: ar.h * scaleFactor
      };

      for (let pos = 0; pos < includedIndices.length; pos++) {
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

        const dataUrl = tempCanvas.toDataURL("image/png");
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

        const titleSlug = (item.title || creatorMode)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 20);

        const fileName = `stratix-${creatorMode}-${pos + 1}-${titleSlug}.png`;
        zip.file(fileName, base64Data, { base64: true });
      }

      // 3. Generate ZIP and trigger browser download
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stratix-${creatorMode}-batch-${ratioId}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
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
            {(["analysis", "news", "indicator", "facts", "learnings"] as const).map((m) => {
              const active = creatorMode === m;
              const labels: Record<CreatorMode, string> = {
                analysis: "Daily Analysis",
                news: "News Batch",
                indicator: "Indicator",
                facts: "Facts",
                learnings: "Learnings",
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
                            Curate 8-12 distinct high-impact stories, deduped, with cover + outro. Select which slides to include.
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
            </div>
          </div>
        )}

        {/* Canvas preview area with clickable element overlay */}
        {/* Padding is trimmed on phones/tablets — on a ~375px-wide screen a
            full p-6 (48px) eats ~13% of the width the poster could otherwise
            use, and the poster is almost always width-bound there (portrait
            phone vs. square/landscape posters), so every px of padding
            directly costs displayed size. */}
        <div
          ref={previewRef}
          className="relative flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-4 md:p-6 select-none z-10"
        >
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
                const isNewsImage = box.id === "imageUrl" && isBatchMode;
                const hasImage = isNewsImage && !!newsData[activeNewsIndex]?.imageUrl;

                return (
                  <div
                    key={`${box.id}-${i}-${box.x}-${box.y}`}
                    ref={hasImage ? setImageWheelRef : undefined}
                    onClick={() => handleElementClick(box.id)}
                    onMouseDown={hasImage ? (e) => handleImageMouseDown(e, box) : undefined}
                    className="absolute pointer-events-auto border border-transparent border-dashed group transition-all duration-200 rounded"
                    style={{
                      left: box.x * scale,
                      top: box.y * scale,
                      width: box.w * scale,
                      height: box.h * scale,
                      cursor: hasImage ? (isDraggingImage ? "grabbing" : "grab") : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = colors.accent;
                      e.currentTarget.style.backgroundColor = `${colors.accent}15`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.backgroundColor = "transparent";
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
                      {hasImage ? "Drag to Pan · Scroll to Zoom" : `Edit ${box.label}`}
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

      {/* Reel Studio — converts the selected batch posters into a 9:16 video slideshow */}
      {showReelStudio && (
        <ReelStudioModal
          creatorMode={creatorMode}
          generateSlides={generateReelSlides}
          onClose={() => setShowReelStudio(false)}
        />
      )}
    </div>
  );
}
