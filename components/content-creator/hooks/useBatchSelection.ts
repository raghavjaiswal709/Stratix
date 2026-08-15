"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsItem } from "../types";

/**
 * Bento explainer visibility + per-item ZIP selection.
 *
 * hideBento drops every isBento card from the preview carousel, its page
 * counter/dots, and the ZIP export — without touching newsData itself, so
 * editing/history/JSON-tab round-tripping still sees the full batch.
 */
export function useBatchSelection({
  newsData,
  activeNewsIndex,
  setActiveNewsIndex,
}: {
  newsData: NewsItem[];
  activeNewsIndex: number;
  setActiveNewsIndex: (index: number) => void;
}) {
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

  return {
    hideBento,
    setHideBento,
    deselectedForZip,
    setDeselectedForZip,
    bentoFilteredIndices,
    visibleNewsIndices,
    visibleNewsPosition,
    visibleNewsCount,
    zipIncludedIndices,
    goToPrevVisibleNews,
    goToNextVisibleNews,
    toggleZipSelection,
    selectAllForZip,
    deselectAllForZip,
  };
}

export type BatchSelectionState = ReturnType<typeof useBatchSelection>;
