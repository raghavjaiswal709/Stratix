"use client";

import { useState } from "react";
import type { HistoryListItem, PosterColors, PosterConfig } from "../types";
import { parseJsonResponse } from "../apiUtils";

/**
 * The primitives every other domain needs to save/reference a History entry —
 * split from the History *panel* (list/load/delete) because motion and the
 * core save-current-to-history flow both need to call `saveToHistory` well
 * before the panel's own state has any reason to exist.
 */
export function useHistoryCore({
  ratioId,
  colors,
  config,
  posterStyle,
  gradientPresetId,
  editorialTheme,
  gradientFade,
  sentimentScheme,
}: {
  ratioId: string;
  colors: PosterColors;
  config: PosterConfig;
  posterStyle: "editorial" | "bold";
  gradientPresetId: string;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: string;
}) {
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  // "Set as Default" — saves the settings above (not the poster content) to
  // the user's account so every future visit starts from this look instead
  // of the factory defaults. Loaded once on mount, in usePosterEditorState.
  const [defaultSaveStatus, setDefaultSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

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

  return {
    activeHistoryId,
    setActiveHistoryId,
    saveStatus,
    setSaveStatus,
    defaultSaveStatus,
    saveToHistory,
    handleSetAsDefault,
  };
}

export type HistoryCoreState = ReturnType<typeof useHistoryCore>;
