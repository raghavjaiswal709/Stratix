"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import JSZip from "jszip";
import type { AnalysisData, AspectRatio, CreatorMode, NewsItem, PosterColors, PosterConfig } from "../types";
import { drawPoster } from "../canvas/drawPoster";
import type { GradientPreset } from "../constants";
import type { SentimentScheme } from "../canvas/canvasUtils";
import { withBentoImageFallback } from "../newsJsonImport";
import { REEL_W, REEL_H, type ReelSlideSource } from "../reel/reelTypes";

/** Reels are consumed full-screen while scrolling and need to read at a glance. */
const REEL_TEXT_SCALE = 1.45;

/**
 * Single-poster download, batch ZIP download, reel-slide rendering, and the
 * debounced auto-persist-to-DB effect for an already-saved batch.
 */
export function useExportAndDownload({
  rendered,
  jsonText,
  isBatchMode,
  ar,
  colors,
  config,
  activeImgRef,
  creatorMode,
  activeNewsIndex,
  visibleNewsPosition,
  visibleNewsCount,
  posterStyle,
  activeGradient,
  gradientPresetId,
  editorialTheme,
  gradientFade,
  sentimentScheme,
  ratioId,
  analysisData,
  newsData,
  loadedImagesRef,
  zipIncludedIndices,
  activeHistoryId,
  batchMeta,
}: {
  rendered: boolean;
  jsonText: string;
  isBatchMode: boolean;
  ar: AspectRatio;
  colors: PosterColors;
  config: PosterConfig;
  activeImgRef: RefObject<HTMLImageElement | null>;
  creatorMode: CreatorMode;
  activeNewsIndex: number;
  visibleNewsPosition: number;
  visibleNewsCount: number;
  posterStyle: "editorial" | "bold";
  activeGradient: GradientPreset;
  gradientPresetId: string;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: SentimentScheme;
  ratioId: string;
  analysisData: AnalysisData;
  newsData: NewsItem[];
  loadedImagesRef: RefObject<Record<string, HTMLImageElement>>;
  zipIncludedIndices: number[];
  activeHistoryId: string | null;
  batchMeta: { timeRangeLabel: string; reportGeneratedAt: string | null } | null;
}) {
  const [downloadingZip, setDownloadingZip] = useState(false);

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

  return {
    downloadingZip,
    download,
    downloadAll,
    generateReelSlides,
  };
}

export type ExportAndDownloadState = ReturnType<typeof useExportAndDownload>;
