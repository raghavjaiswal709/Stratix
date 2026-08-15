"use client";

import { useState } from "react";
import type { CreatorMode, HistoryListItem, NewsItem, PosterColors, PosterConfig } from "../types";
import { parseJsonResponse } from "../apiUtils";
import { buildBentoCard, parsePastedAiJson, importAiJson } from "../newsJsonImport";
import { runWithConcurrency } from "../imageUtils";

/**
 * AI batch generation for News/Facts/Learnings: the "Generate" menu, the
 * poster-selection review step, illustrating + saving the final batch,
 * "Fill Images", and importing a pasted AI reply.
 */
export function useAiBatchGeneration({
  newsData,
  setNewsData,
  setActiveNewsIndex,
  setJsonText,
  setJsonError,
  setCreatorMode,
  setActiveTab,
  setDeselectedForZip,
  setActiveHistoryId,
  saveToHistory,
  buildWebSearchQuery,
  fetchTopPexelsImage,
  ratioId,
  colors,
  config,
  posterStyle,
  gradientPresetId,
  editorialTheme,
  gradientFade,
  sentimentScheme,
}: {
  newsData: NewsItem[];
  setNewsData: (items: NewsItem[]) => void;
  setActiveNewsIndex: (index: number) => void;
  setJsonText: (text: string) => void;
  setJsonError: (err: string | null) => void;
  setCreatorMode: (mode: CreatorMode) => void;
  setActiveTab: (tab: string) => void;
  setDeselectedForZip: (indices: Set<number>) => void;
  setActiveHistoryId: (id: string | null) => void;
  saveToHistory: (
    category: HistoryListItem["category"],
    title: string,
    itemCount: number,
    payload: unknown,
    id?: string | null,
    previewUrl?: string
  ) => Promise<string | null>;
  buildWebSearchQuery: (item: NewsItem | undefined | null) => string;
  fetchTopPexelsImage: (query: string) => Promise<{ imageUrl: string; error?: string; fatal?: boolean }>;
  ratioId: string;
  colors: PosterColors;
  config: PosterConfig;
  posterStyle: "editorial" | "bold";
  gradientPresetId: string;
  editorialTheme: "light" | "dark";
  gradientFade: number;
  sentimentScheme: string;
}) {
  // ── AI Generate (niche dropdown) ──────────────────────────────────────────
  const [showGenerateMenu, setShowGenerateMenu] = useState(false);
  const [showPromptForCategory, setShowPromptForCategory] = useState<"news" | "facts" | "learnings" | null>(null);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  // "Fully Automated" — skips the poster-selection modal for News Batch:
  // every curated story is kept, illustrated, and saved with no review step.
  const [fullyAutomated, setFullyAutomated] = useState(false);
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
  // Auto image-fill (Pexels) for the cover/chosen stories/outro, fired when
  // the user confirms their selection — see applyPosterSelection below.
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState({ done: 0, total: 0 });

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
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const items: NewsItem[] = Array.isArray(data.posters) ? data.posters : [];
      if (items.length === 0) throw new Error("AI returned no posters — try again.");

      // items[0] is always the cover slide (isCover: true); the last item is
      // always the outro slide (isOutro: true) if present; everything between
      // is the ~10 curated candidates. Don't commit to newsData yet — open
      // the selection modal so the user picks which stories make the batch,
      // unless Fully Automated is on, in which case every candidate is kept
      // and the modal never opens.
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

      if (fullyAutomated) {
        // Read straight off the fetch response, not batchMeta state — the
        // setBatchMeta call above hasn't re-rendered yet, so batchMeta itself
        // would still be stale here (see illustrateAndSaveBatch's doc comment).
        await illustrateAndSaveBatch(cover ?? null, candidates, outro, data.timeRangeLabel, data.reportGeneratedAt);
      } else {
        setShowSelectionModal(true);
      }
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
      const data = await parseJsonResponse(res);
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
      const data = await parseJsonResponse(res);
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

  // Illustrates (Pexels) + commits + saves a final cover/chosen/outro set —
  // shared by the "Continue with N Posters" button (applyPosterSelection
  // below, reads the user's checked selection from state) and the "Fully
  // Automated" generate path (which calls this directly with every
  // candidate, skipping the review modal entirely). Takes timeRangeLabel/
  // reportGeneratedAt as params rather than reading batchMeta from state —
  // the automated path calls this in the same tick as setBatchMeta, before
  // React has re-rendered, so reading batchMeta here would see the stale
  // pre-update value.
  const illustrateAndSaveBatch = async (
    cover: NewsItem | null,
    chosen: NewsItem[],
    outro: NewsItem | null,
    timeRangeLabel?: string,
    reportGeneratedAt?: string | null
  ) => {
    if (chosen.length === 0 && !cover) return;

    const toIllustrate: NewsItem[] = [...(cover ? [cover] : []), ...chosen, ...(outro ? [outro] : [])];
    setImageGenProgress({ done: 0, total: toIllustrate.length });
    setGeneratingImages(true);
    let illustrated: NewsItem[];
    let imageError: string | null = null;
    let imagesAborted = false;
    try {
      illustrated = await runWithConcurrency(toIllustrate, 4, async (story) => {
        let next = story;
        // Skip the lookup for posters that already carry art, and for every
        // poster after a config-class failure — same short-circuit as
        // fillAllImages. Note this never aborts the batch itself: the posters
        // are still committed and saved, just without art, and the banner
        // below explains why. Progress still ticks either way so the counter
        // always reaches its total.
        if (!story.imageUrl && !imagesAborted) {
          const result = await fetchTopPexelsImage(buildWebSearchQuery(story));
          if (result.error && !imageError) imageError = result.error;
          if (result.fatal) imagesAborted = true;
          if (result.imageUrl) next = { ...story, imageUrl: result.imageUrl };
        }
        setImageGenProgress((p) => ({ ...p, done: p.done + 1 }));
        return next;
      });
    } finally {
      setGeneratingImages(false);
    }
    if (imageError) {
      setGenerateError(`Batch created, but images couldn't be filled. ${imageError}`);
    }

    let cursor = 0;
    const illustratedCover = cover ? illustrated[cursor++] : null;
    const illustratedChosen = illustrated.slice(cursor, cursor + chosen.length);
    cursor += chosen.length;
    const illustratedOutro = outro ? illustrated[cursor++] : null;

    // Every chosen story is immediately followed by its "explain it simply"
    // bento companion card — same story, plain-language rewrite. It inherits
    // the parent's imageUrl (buildBentoCard copies it), so this must run
    // after illustration above, not before.
    const chosenWithBento = illustratedChosen.flatMap((story) => [story, buildBentoCard(story)]);
    const items: NewsItem[] = [
      ...(illustratedCover ? [illustratedCover] : []),
      ...chosenWithBento,
      ...(illustratedOutro ? [illustratedOutro] : []),
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
      `News Batch · ${chosen.length} ${chosen.length === 1 ? "story" : "stories"} · ${timeRangeLabel || "curated"}`,
      items.length,
      { posters: items, ratioId, colors, config, posterStyle, gradientPresetId, editorialTheme, gradientFade, sentimentScheme, timeRangeLabel, reportGeneratedAt }
    );
    if (createdId) {
      setActiveHistoryId(createdId);
    }
  };

  // Builds the final batch (cover + whichever candidates are checked) — this
  // is the point the batch is actually saved to History, so History only
  // ever reflects what the user chose to keep, not the full raw AI candidate
  // pool. Triggered by the selection modal's "Continue with N Posters".
  const applyPosterSelection = async () => {
    const chosen = rawBatchCandidates.filter((_, idx) => selectedPosterIndices.has(idx));
    await illustrateAndSaveBatch(rawBatchCover, chosen, rawBatchOutro, batchMeta?.timeRangeLabel, batchMeta?.reportGeneratedAt);
  };

  // "Fill Images" — a standalone catch-up pass over whatever's already sitting
  // in newsData (loaded from History, pasted JSON, or a batch generated
  // before this feature existed), not just the moment a fresh batch is
  // confirmed — applyPosterSelection above already fills images for a fresh
  // "Generate" run, so this button mainly exists for older/imported batches.
  // Runs on Pexels with the top hit auto-applied per poster (no per-image
  // picker, see fetchTopPexelsImage below) so a full batch fills in one
  // click. Only touches items with no imageUrl yet, so it never clobbers a
  // manual upload or an existing pick — bento cards are skipped entirely
  // since they inherit their parent story's image at render time (see
  // withBentoImageFallback).
  const fillAllImages = async () => {
    const targets = newsData
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.isBento && !item.imageUrl && buildWebSearchQuery(item));
    if (targets.length === 0) return;

    setGenerateError(null);
    setImageGenProgress({ done: 0, total: targets.length });
    setGeneratingImages(true);
    let filled: { idx: number; imageUrl: string }[] = [];
    let firstError: string | null = null;
    let aborted = false;
    try {
      const results = await runWithConcurrency(targets, 4, async ({ item, idx }) => {
        // One config-class failure means every remaining poster would fail the
        // same way, so stop rather than firing the rest at a dead endpoint.
        if (aborted) return { idx, imageUrl: "" };
        const result = await fetchTopPexelsImage(buildWebSearchQuery(item));
        if (result.error && !firstError) firstError = result.error;
        if (result.fatal) aborted = true;
        setImageGenProgress((p) => ({ ...p, done: p.done + 1 }));
        return { idx, imageUrl: result.imageUrl };
      });
      filled = results.filter((r) => r.imageUrl);
    } finally {
      setGeneratingImages(false);
    }

    if (filled.length > 0) {
      const next = [...newsData];
      for (const { idx, imageUrl } of filled) next[idx] = { ...next[idx], imageUrl };
      setNewsData(next);
      setJsonText(JSON.stringify(next, null, 2));
    }

    // Never fail silently: before this, a missing API key filled nothing and
    // said nothing, leaving the button looking like it had simply worked.
    if (firstError) {
      setGenerateError(
        filled.length > 0
          ? `Filled ${filled.length} of ${targets.length} images — the rest failed. ${firstError}`
          : `Couldn't fill any images. ${firstError}`
      );
    }
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

  return {
    showGenerateMenu, setShowGenerateMenu,
    showPromptForCategory, setShowPromptForCategory,
    generatingBatch, generateError, setGenerateError,
    fullyAutomated, setFullyAutomated,
    batchMeta,
    rawBatchCandidates, rawBatchCover, rawBatchOutro,
    selectedPosterIndices,
    showSelectionModal, setShowSelectionModal,
    generatingImages, imageGenProgress,
    generateNewsBatch,
    generateFactsBatch,
    generateLearningsBatch,
    togglePosterSelection,
    selectAllPosters,
    clearPosterSelection,
    applyPosterSelection,
    fillAllImages,
    importAiBatch,
  };
}

export type AiBatchGenerationState = ReturnType<typeof useAiBatchGeneration>;
