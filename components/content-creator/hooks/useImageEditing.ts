"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  AspectRatio,
  CreatorMode,
  NewsItem,
  PosterColors,
  PosterConfig,
  PosterElement,
} from "../types";
import { drawPoster } from "../canvas/drawPoster";
import { computeCoverFitSlack } from "../canvas/canvasUtils";
import type { SentimentScheme } from "../canvas/canvasUtils";
import type { GradientPreset } from "../constants";
import { compressImage } from "../imageUtils";
import { parseJsonResponse } from "../apiUtils";

/**
 * Click-drag-to-pan / scroll-to-zoom on the active poster image, plus
 * file-attach (click, drop, and Pexels search) for it.
 */
export function useImageEditing({
  isBatchMode,
  newsData,
  setNewsData,
  activeNewsIndex,
  setJsonText,
  activeImgRef,
  canvasRef,
  scale,
  ar,
  colors,
  config,
  creatorMode,
  posterStyle,
  activeGradient,
  editorialTheme,
  gradientFade,
  sentimentScheme,
  visibleNewsPosition,
  visibleNewsCount,
  setElementBounds,
  handleUpdateField,
}: {
  isBatchMode: boolean;
  newsData: NewsItem[];
  setNewsData: (items: NewsItem[] | ((prev: NewsItem[]) => NewsItem[])) => void;
  activeNewsIndex: number;
  setJsonText: (text: string) => void;
  activeImgRef: RefObject<HTMLImageElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scale: number;
  ar: AspectRatio;
  colors: PosterColors;
  config: PosterConfig;
  creatorMode: CreatorMode;
  posterStyle: "editorial" | "bold";
  activeGradient: GradientPreset;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: SentimentScheme;
  visibleNewsPosition: number;
  visibleNewsCount: number;
  setElementBounds: (bounds: PosterElement[]) => void;
  handleUpdateField: (key: string, val: any) => void;
}) {
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
    setNewsData((prev: NewsItem[]) => {
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

  return {
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
  };
}

export type ImageEditingState = ReturnType<typeof useImageEditing>;
