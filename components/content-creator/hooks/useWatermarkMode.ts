"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  AspectRatio,
  CreatorMode,
  LogoPosition,
  NewsItem,
  PosterColors,
  PosterConfig,
  PosterElement,
} from "../types";
import { drawPoster } from "../canvas/drawPoster";
import type { SentimentScheme } from "../canvas/canvasUtils";
import type { GradientPreset } from "../constants";

/** "Logo Watermark" mode: per-image watermark settings, batch upload, and click-drag logo positioning on the canvas. */
export function useWatermarkMode({
  newsData,
  setNewsData,
  setJsonText,
  activeNewsIndex,
  setActiveNewsIndex,
  creatorMode,
  ar,
  scale,
  colors,
  config,
  posterStyle,
  activeGradient,
  editorialTheme,
  gradientFade,
  sentimentScheme,
  visibleNewsPosition,
  visibleNewsCount,
  canvasRef,
  activeImgRef,
  setElementBounds,
}: {
  newsData: NewsItem[];
  setNewsData: (items: NewsItem[] | ((prev: NewsItem[]) => NewsItem[])) => void;
  setJsonText: (text: string) => void;
  activeNewsIndex: number;
  setActiveNewsIndex: (index: number | ((prev: number) => number)) => void;
  creatorMode: CreatorMode;
  ar: AspectRatio;
  scale: number;
  colors: PosterColors;
  config: PosterConfig;
  posterStyle: "editorial" | "bold";
  activeGradient: GradientPreset;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: SentimentScheme;
  visibleNewsPosition: number;
  visibleNewsCount: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  activeImgRef: RefObject<HTMLImageElement | null>;
  setElementBounds: (bounds: PosterElement[]) => void;
}) {
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

  return {
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
    isDraggingLogo, setIsDraggingLogo,
    logoDragStateRef,
    watermarkFileInputRef,
    handleWatermarkFiles,
    handleSwapIndices,
    handleMoveIndex,
    handleSetWatermarkPosition,
    handleSetWatermarkColors,
    handleApplyAllWatermarkSettingsToBatch,
    handleLogoMouseDown,
  };
}

export type WatermarkModeState = ReturnType<typeof useWatermarkMode>;
