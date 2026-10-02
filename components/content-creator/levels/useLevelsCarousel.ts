"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  DEFAULT_LEVELS_SETTINGS,
  DEFAULT_TEXT_BOX,
  levelsRatio,
  levelsUid,
} from "./constants";
import { drawLevelsSlide, loadImageEl } from "./drawLevelsSlide";
import { intakeImageFiles } from "./imageIntake";
import { buildLevelsStatement } from "./statement";
import { boxHeight, coverScaleFor, widthScaleFor } from "./textLayout";
import type { LevelsSettings, LevelsSlide, LevelsTextBox } from "./types";

interface Snapshot {
  slides: LevelsSlide[];
  settings: LevelsSettings;
}

const HISTORY_LIMIT = 60;

/**
 * All state for the Levels carousel: the slides, the carousel-wide look, the
 * current selection, undo/redo, and export.
 *
 * Undo is snapshot-based rather than per-field. The editor's mutations are
 * mostly drags, which would otherwise push one history entry per pointermove;
 * `commit` is therefore called once at the *start* of a gesture (via
 * `beginGesture`) and skipped for the moves that follow.
 */
export function useLevelsCarousel() {
  const [slides, setSlides] = useState<LevelsSlide[]>([]);
  const [settings, setSettings] = useState<LevelsSettings>(DEFAULT_LEVELS_SETTINGS);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  // Snapshot at gesture start only, so a 200-move drag is a single undo step.
  const gestureRef = useRef(false);

  const ratio = levelsRatio(settings.ratioId);
  const activeSlide = slides[activeIndex] ?? null;

  const snapshot = useCallback(
    (): Snapshot => ({ slides: structuredClone(slides), settings: { ...settings } }),
    [slides, settings],
  );

  const commit = useCallback(() => {
    undoRef.current.push(snapshot());
    if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
    redoRef.current = [];
    setHistoryTick((t) => t + 1);
  }, [snapshot]);

  /** Call once on pointerdown; the moves that follow won't add history entries. */
  const beginGesture = useCallback(() => {
    if (gestureRef.current) return;
    gestureRef.current = true;
    commit();
  }, [commit]);

  const endGesture = useCallback(() => {
    gestureRef.current = false;
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push({ slides: structuredClone(slides), settings: { ...settings } });
    setSlides(prev.slides);
    setSettings(prev.settings);
    setHistoryTick((t) => t + 1);
  }, [slides, settings]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push({ slides: structuredClone(slides), settings: { ...settings } });
    setSlides(next.slides);
    setSettings(next.settings);
    setHistoryTick((t) => t + 1);
  }, [slides, settings]);

  // History lives in refs (a drag must not re-render per move), so these read
  // `historyTick` purely to recompute whenever an entry is pushed or popped.
  void historyTick;
  const canUndo = undoRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;

  // ── Slides ───────────────────────────────────────────────────────────────

  const addImages = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setImporting(true);
      setError(null);
      try {
        const intake = await intakeImageFiles(files);
        if (!intake.length) {
          setError("None of those files could be read as images.");
          return;
        }
        commit();
        const created: LevelsSlide[] = intake.map((r, i) => ({
          id: levelsUid("lvslide"),
          name: r.name.replace(/\.[^.]+$/, "") || `Slide ${i + 1}`,
          src: r.src,
          imgW: r.width,
          imgH: r.height,
          offsetX: 0,
          offsetY: 0,
          scale: 1,
          instrument: "",
          timeframe: "",
          levels: [],
          bias: "",
          note: "",
          texts: [],
        }));
        setSlides((prev) => [...prev, ...created]);
        // Jump to the first newly added slide so the carousel opens on it.
        setActiveIndex(slides.length);
        setSelectedTextId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not import those images.");
      } finally {
        setImporting(false);
      }
    },
    [commit, slides.length],
  );

  const updateSlide = useCallback((id: string, patch: Partial<LevelsSlide>) => {
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const removeSlide = useCallback(
    (id: string) => {
      const idx = slides.findIndex((s) => s.id === id);
      if (idx === -1) return;
      commit();
      const remaining = slides.length - 1;
      setSlides((prev) => prev.filter((s) => s.id !== id));
      // Keep the same slide in view where possible; clamp when the tail goes.
      setActiveIndex((cur) => Math.max(0, Math.min(cur > idx ? cur - 1 : cur, remaining - 1)));
      setSelectedTextId(null);
      setEditingTextId(null);
    },
    [commit, slides],
  );

  const duplicateSlide = useCallback(
    (id: string) => {
      const idx = slides.findIndex((s) => s.id === id);
      if (idx === -1) return;
      commit();
      const copy: LevelsSlide = {
        ...structuredClone(slides[idx]),
        id: levelsUid("lvslide"),
        name: `${slides[idx].name} copy`,
        texts: slides[idx].texts.map((t) => ({ ...t, id: levelsUid("lvtext") })),
      };
      setSlides((prev) => {
        const next = [...prev];
        next.splice(idx + 1, 0, copy);
        return next;
      });
      setActiveIndex(idx + 1);
    },
    [commit, slides],
  );

  const moveSlide = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0) return;
      commit();
      setSlides((prev) => {
        if (from >= prev.length || to >= prev.length) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      });
      setActiveIndex(to);
    },
    [commit],
  );

  const clearAll = useCallback(() => {
    commit();
    setSlides([]);
    setActiveIndex(0);
    setSelectedTextId(null);
  }, [commit]);

  // ── Image placement ──────────────────────────────────────────────────────

  /**
   * "contain" is the letterboxed default (gaps top and bottom for a wide
   * chart), "width" spans the full canvas width, "cover" fills it edge to edge.
   */
  const fitImage = useCallback(
    (mode: "contain" | "cover" | "width") => {
      if (!activeSlide) return;
      commit();
      const scale =
        mode === "contain"
          ? 1
          : mode === "cover"
          ? coverScaleFor(activeSlide, ratio.w, ratio.h)
          : widthScaleFor(activeSlide, ratio.w, ratio.h);
      updateSlide(activeSlide.id, { scale, offsetX: 0, offsetY: 0 });
    },
    [activeSlide, commit, ratio.w, ratio.h, updateSlide],
  );

  const centerImage = useCallback(
    (axis: "x" | "y" | "both") => {
      if (!activeSlide) return;
      commit();
      updateSlide(activeSlide.id, {
        ...(axis !== "y" ? { offsetX: 0 } : {}),
        ...(axis !== "x" ? { offsetY: 0 } : {}),
      });
    },
    [activeSlide, commit, updateSlide],
  );

  // ── Text boxes ───────────────────────────────────────────────────────────

  const addTextBox = useCallback(
    (patch: Partial<LevelsTextBox> = {}) => {
      if (!activeSlide) return null;
      commit();
      const width = patch.width ?? Math.round(ratio.w * 0.84);
      const box: LevelsTextBox = {
        ...DEFAULT_TEXT_BOX,
        id: levelsUid("lvtext"),
        text: "Double-click to edit",
        width,
        // Stagger new boxes so a second one doesn't land exactly on the first.
        x: Math.round((ratio.w - width) / 2),
        y: Math.round(ratio.h * 0.08 + activeSlide.texts.length * 40),
        ...patch,
      };
      updateSlide(activeSlide.id, { texts: [...activeSlide.texts, box] });
      setSelectedTextId(box.id);
      return box.id;
    },
    [activeSlide, commit, ratio.w, ratio.h, updateSlide],
  );

  /** Adds the auto-built "KEY LEVELS FOR XAUUSD ON H1" headline for this slide. */
  const addStatementBox = useCallback(() => {
    if (!activeSlide) return;
    const text = buildLevelsStatement(activeSlide, settings.statementTemplate);
    if (!text) {
      setError("Pick an instrument, timeframe or level first — there's nothing to write yet.");
      return;
    }
    setError(null);
    addTextBox({
      text,
      fontSize: Math.round(ratio.w * 0.052),
      bold: true,
      uppercase: true,
      align: "center",
      letterSpacing: 1,
      y: Math.round(ratio.h * 0.05),
    });
  }, [activeSlide, addTextBox, ratio.w, ratio.h, settings.statementTemplate]);

  const updateTextBox = useCallback(
    (boxId: string, patch: Partial<LevelsTextBox>) => {
      setSlides((prev) =>
        prev.map((s, i) =>
          i !== activeIndex
            ? s
            : { ...s, texts: s.texts.map((t) => (t.id === boxId ? { ...t, ...patch } : t)) },
        ),
      );
    },
    [activeIndex],
  );

  const removeTextBox = useCallback(
    (boxId: string) => {
      commit();
      setSlides((prev) =>
        prev.map((s, i) => (i !== activeIndex ? s : { ...s, texts: s.texts.filter((t) => t.id !== boxId) })),
      );
      setSelectedTextId((cur) => (cur === boxId ? null : cur));
    },
    [activeIndex, commit],
  );

  const duplicateTextBox = useCallback(
    (boxId: string) => {
      if (!activeSlide) return;
      const source = activeSlide.texts.find((t) => t.id === boxId);
      if (!source) return;
      commit();
      const copy: LevelsTextBox = {
        ...source,
        id: levelsUid("lvtext"),
        x: source.x + 24,
        y: source.y + boxHeight(source) + 16,
      };
      updateSlide(activeSlide.id, { texts: [...activeSlide.texts, copy] });
      setSelectedTextId(copy.id);
    },
    [activeSlide, commit, updateSlide],
  );

  /** Reorders a box within the slide's paint order (last = on top). */
  const reorderTextBox = useCallback(
    (boxId: string, direction: "front" | "back") => {
      if (!activeSlide) return;
      const idx = activeSlide.texts.findIndex((t) => t.id === boxId);
      if (idx === -1) return;
      commit();
      const next = [...activeSlide.texts];
      const [moved] = next.splice(idx, 1);
      if (direction === "front") next.push(moved);
      else next.unshift(moved);
      updateSlide(activeSlide.id, { texts: next });
    },
    [activeSlide, commit, updateSlide],
  );

  /** Copies a box (a handle, a disclaimer) onto every other slide at the same spot. */
  const copyTextBoxToAllSlides = useCallback(
    (boxId: string) => {
      if (!activeSlide) return;
      const source = activeSlide.texts.find((t) => t.id === boxId);
      if (!source) return;
      commit();
      setSlides((prev) =>
        prev.map((s, i) =>
          i === activeIndex
            ? s
            : { ...s, texts: [...s.texts, { ...structuredClone(source), id: levelsUid("lvtext") }] },
        ),
      );
    },
    [activeIndex, activeSlide, commit],
  );

  // Selection belongs to a slide; moving away from it must not leave a
  // dangling id pointing at a box that is no longer on screen.
  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index);
    setSelectedTextId(null);
    setEditingTextId(null);
  }, []);

  const selectedBox = useMemo(
    () => activeSlide?.texts.find((t) => t.id === selectedTextId) ?? null,
    [activeSlide, selectedTextId],
  );

  // ── Export ───────────────────────────────────────────────────────────────

  const renderSlideToBlob = useCallback(
    async (slide: LevelsSlide, index: number, total: number, img?: HTMLImageElement | null) => {
      const canvas = document.createElement("canvas");
      await drawLevelsSlide(canvas, slide, settings, index, total, img);
      return new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.94));
    },
    [settings],
  );

  const downloadSlide = useCallback(
    async (index: number) => {
      const slide = slides[index];
      if (!slide) return;
      setExporting(true);
      try {
        const blob = await renderSlideToBlob(slide, index, slides.length);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `levels-${String(index + 1).padStart(2, "0")}-${slide.instrument || "slide"}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setExporting(false);
      }
    },
    [renderSlideToBlob, slides],
  );

  const downloadAll = useCallback(async () => {
    if (!slides.length) return;
    setExporting(true);
    setExportProgress(0);
    try {
      const zip = new JSZip();
      for (let i = 0; i < slides.length; i++) {
        const img = await loadImageEl(slides[i].src);
        const blob = await renderSlideToBlob(slides[i], i, slides.length, img);
        if (blob) {
          // Zero-padded so the carousel uploads in order on every OS.
          zip.file(
            `${String(i + 1).padStart(2, "0")}-${(slides[i].instrument || "slide").replace(/[^\w-]/g, "")}.jpg`,
            blob,
          );
        }
        setExportProgress(Math.round(((i + 1) / slides.length) * 100));
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `levels-carousel-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }, [renderSlideToBlob, slides]);

  return {
    // state
    slides, setSlides,
    settings, setSettings,
    activeIndex, setActiveIndex: goToSlide,
    activeSlide,
    selectedTextId, setSelectedTextId,
    editingTextId, setEditingTextId,
    selectedBox,
    ratio,
    importing, exporting, exportProgress, error, setError,
    // history
    commit, beginGesture, endGesture, undo, redo, canUndo, canRedo,
    // slides
    addImages, updateSlide, removeSlide, duplicateSlide, moveSlide, clearAll,
    fitImage, centerImage,
    // text
    addTextBox, addStatementBox, updateTextBox, removeTextBox, duplicateTextBox,
    reorderTextBox, copyTextBoxToAllSlides,
    // export
    downloadSlide, downloadAll,
  };
}

export type LevelsCarouselState = ReturnType<typeof useLevelsCarousel>;
