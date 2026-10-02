"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Clapperboard, Code2, Edit3, Layers, Music, Palette, Sliders, Sparkles, Wand2 } from "lucide-react";
import type {
  AnalysisData,
  CreatorMode,
  NewsItem,
  PosterColors,
  PosterConfig,
  PosterData,
  PosterElement,
} from "../types";
import { EMPTY_ANALYSIS, EMPTY_INDICATOR, GRADIENT_PRESETS } from "../constants";
import { importAiJson } from "../newsJsonImport";
import { parseJsonResponse } from "../apiUtils";
import type { SentimentScheme } from "../canvas/canvasUtils";

/**
 * The core mode/content/style state almost every other hook in this editor
 * reads from — creatorMode, the per-mode data (analysis/news/parsed),
 * jsonText and its round-trip sync, and the poster style settings
 * (colors/config/theme/etc). Everything here is safe to call first: nothing
 * in it depends on `ar` or on motion state.
 */
export function usePosterEditorState() {
  const [creatorMode, setCreatorMode] = useState<CreatorMode>("news");
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

  const [elementBounds, setElementBounds] = useState<PosterElement[]>([]);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Click-drag-to-pan / scroll-to-zoom on the news poster image. The
  // currently-loaded image element is kept in a ref (set when render()
  // loads it) so the drag/wheel handlers can read its natural dimensions
  // synchronously without re-loading anything.
  const activeImgRef = useRef<HTMLImageElement | null>(null);
  const loadedImagesRef = useRef<Record<string, HTMLImageElement>>({});

  // Attach a locally generated image (e.g. from Grok Imagine) to the active
  // news poster: clicking the poster's image area or the Upload button opens
  // the OS file picker; the chosen file is inlined as a data URL so the
  // canvas can draw it without any CORS/taint issues.
  const imageFileRef = useRef<HTMLInputElement>(null);

  const [candlesData, setCandlesData] = useState<any>(null);
  const [promptSession, setPromptSession] = useState<string>("London");
  const [promptDate, setPromptDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [promptCopied, setPromptCopied] = useState<boolean>(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // ── Content Calendar (30-day News/Learnings/Facts plan) ───────────────────
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // ── Reels (batch posters converted into a 9:16 video slideshow) ──────────
  const [showReelStudio, setShowReelStudio] = useState(false);

  useEffect(() => {
    fetch("/api/candle-summary")
      .then(r => { if (!r.ok) throw new Error("API failed"); return r.json(); })
      .then(d => setCandlesData(d))
      .catch(e => console.error("Candle summary load error:", e));
  }, []);

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

  // Clear highlighted field styling after 2 seconds
  useEffect(() => {
    if (highlightedField) {
      const timer = setTimeout(() => {
        setHighlightedField(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightedField]);

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

  /**
   * The tab strip belongs to the mode, not to the page.
   *
   * The poster pipeline needs colours, a ratio, the raw JSON and the prompt
   * tools; a motion project needs none of those and instead has five stages of
   * its own that used to be one 2,000px scroll. Levels is a single canvas
   * editor with its own right-hand panel and needs no strip at all.
   */
  const TABS = useMemo(() => {
    if (creatorMode === "levels") return [];
    if (creatorMode === "motion") {
      return [
        { id: "motion-slides", label: "Slides & Layers", icon: Layers },
        { id: "motion-audio", label: "Script, Audio & SFX", icon: Music },
        { id: "motion-sync", label: "Sync", icon: Sparkles },
        { id: "motion-look", label: "Look & Captions", icon: Palette },
        { id: "motion-timeline", label: "Timeline & Export", icon: Clapperboard },
      ];
    }
    return [
      { id: "content", label: "Content", icon: Edit3 },
      { id: "colors", label: "Colors", icon: Palette },
      { id: "layout", label: "Layout", icon: Sliders },
      { id: "json", label: "JSON", icon: Code2 },
      { id: "ai-prompt", label: "AI Prompt", icon: Bot },
      { id: "prompt-builder", label: "Prompt Builder", icon: Wand2 },
    ];
  }, [creatorMode]);

  // Switching mode almost always invalidates the open tab — "colors" does not
  // exist in a motion project and "motion-sync" does not exist outside one —
  // so fall back to that mode's own first tab rather than showing an empty
  // panel. Levels has no tabs at all and keeps whatever was open, unused.
  useEffect(() => {
    if (!TABS.length) return;
    if (!TABS.some((t) => t.id === activeTab)) setActiveTab(TABS[0].id);
  }, [TABS, activeTab]);

  return {
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
  };
}

export type PosterEditorState = ReturnType<typeof usePosterEditorState>;
