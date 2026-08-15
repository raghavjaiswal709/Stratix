"use client";

import type { CreatorMode, PosterData } from "../types";

/** Metrics/sections/tags CRUD for "indicator" mode. */
export function useIndicatorFields({
  parsedData,
  setParsedData,
  creatorMode,
  setJsonText,
}: {
  parsedData: PosterData;
  setParsedData: (data: PosterData) => void;
  creatorMode: CreatorMode;
  setJsonText: (text: string) => void;
}) {
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

  return {
    handleUpdateMetric,
    handleDeleteMetric,
    handleAddMetric,
    handleUpdateSection,
    handleDeleteSection,
    handleAddSection,
    handleAddTag,
    handleDeleteTag,
  };
}

export type IndicatorFieldsState = ReturnType<typeof useIndicatorFields>;
