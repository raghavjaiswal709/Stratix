"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clapperboard,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Magnet,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  CAMERA_CUE_DOCS,
  CUE_DOCS,
  CUE_NAMES,
  EASE_NAMES,
  type TranscriptWord,
  type TransitionType,
} from "@/lib/motion-timeline";
import {
  moveCue,
  resizeCue,
  resetAllModifications,
  resetCueModification,
  resetOverlayModification,
  resetSceneModification,
  resizeSceneStart,
  resizeSceneEnd,
  shiftScene,
  snapTargetsFor,
  snapTime,
  setTransition,
  setTrackVisible,
  deleteCue,
  duplicateCue,
  updateCue,
  updateOverlay,
  deleteOverlay,
  type EditableCue,
  type EditableScene,
  type EditableTimeline,
} from "@/lib/motion-timeline/edit";

/** Consistent wording across the timeline and the "Match Slides to the Script" modal — see FixSlideOrderModal.tsx. */
export const MANUAL_TIMING_LABEL = "Timing manually overridden";

/* Row geometry. The gutter and the lanes are two separate scrollers, so every
   height here has to match on both sides or the labels drift off their rows. */
const RULER_H = 22;
const WORDS_H = 18;
const OVERLAY_H = 26;
const SCENE_H = 30;
const TRACK_H = 24;
const GUTTER_W = 156;

const MIN_ZOOM = 0.008;
const MAX_ZOOM = 0.6;

export interface TimelineEditorProps {
  doc: EditableTimeline;
  /** `commit` marks the end of a gesture — the point an undo step is worth keeping. */
  onChange: (next: EditableTimeline, opts?: { commit?: boolean }) => void;
  onBeginGesture: () => void;
  timeMs: number;
  onSeek: (ms: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  words: TranscriptWord[];
  slideNames: string[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  saveState: "idle" | "dirty" | "saving" | "saved" | "error";
}

type Drag =
  | { kind: "cue"; sceneId: string; trackId: string | null; cueId: string; grabMs: number; startAt: number }
  | { kind: "cue-resize"; sceneId: string; trackId: string | null; cueId: string; startDur: number; startX: number }
  | { kind: "scene"; sceneId: string; grabMs: number }
  | { kind: "scene-resize-start"; sceneId: string }
  | { kind: "scene-resize-end"; sceneId: string }
  | { kind: "overlay"; overlayId: string; grabMs: number }
  | { kind: "overlay-resize"; overlayId: string; startDur: number; startX: number }
  | { kind: "scrub" };

const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
};

/** Distinct-but-quiet stripes so neighbouring scenes read apart at a glance. */
const sceneTint = (i: number) => (i % 2 === 0 ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.025)");

export function TimelineEditor(props: TimelineEditorProps) {
  const {
    doc, onChange, onBeginGesture, timeMs, onSeek, isPlaying, onTogglePlay,
    words, slideNames, canUndo, canRedo, onUndo, onRedo, saveState,
  } = props;

  const [zoom, setZoom] = useState(0.06);
  const [snapOn, setSnapOn] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ sceneId: string; trackId: string | null; cueId: string } | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [snapLabel, setSnapLabel] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  /* Tall enough to work in, short enough to leave the frame legible. Roughly a
     third of the viewport, which tracks the window instead of a magic number. */
  const [bodyMaxH, setBodyMaxH] = useState(230);
  useEffect(() => {
    const fit = () => setBodyMaxH(Math.max(150, Math.min(320, Math.round(window.innerHeight * 0.30))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const lanesRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const duration = Math.max(1, doc.durationMs);
  const totalPx = Math.max(320, duration * zoom);
  const msToPx = useCallback((ms: number) => ms * zoom, [zoom]);
  const pxToMs = useCallback((px: number) => px / zoom, [zoom]);

  /* ── Gesture handling ───────────────────────────────────────────────────
     One set of window listeners for every drag kind. Attaching per-element
     handlers instead would drop the gesture the moment the pointer left the
     3px-wide thing being dragged.

     A raw pointermove can fire far faster than the screen actually repaints
     — a high-polling-rate mouse or trackpad easily outpaces 60fps. Recomputing
     and re-rendering on every single one queues up more work than the display
     can show, which is what a dragged cue or a scrubbed playhead lagging
     behind the cursor looks like from the outside. Only the latest pointer
     position matters, so raw events just record it; one rAF per frame is what
     actually applies it, coalescing however many moves landed in between into
     the one update the frame can use. */
  useEffect(() => {
    if (!dragRef.current) return;

    const localMs = (clientX: number) => {
      const el = lanesRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return pxToMs(clientX - rect.left + el.scrollLeft);
    };

    let rafId: number | null = null;
    let pendingClientX: number | null = null;
    let pendingAltKey = false;

    const applyMove = () => {
      rafId = null;
      const drag = dragRef.current;
      if (!drag || pendingClientX === null) return;
      const clientX = pendingClientX;
      const altKey = pendingAltKey;
      const at = localMs(clientX);

      if (drag.kind === "scrub") {
        onSeek(Math.max(0, Math.min(duration, at)));
        return;
      }

      if (drag.kind === "cue") {
        const scene = doc.scenes.find((s) => s.id === drag.sceneId);
        if (!scene) return;
        let target = at - drag.grabMs;
        if (snapOn && !altKey) {
          const targets = snapTargetsFor(doc, drag.sceneId, words, drag.cueId);
          const snapped = snapTime(target, targets, pxToMs(7));
          target = snapped.atMs;
          setSnapLabel(snapped.hit ? `${snapped.hit.kind}${snapped.hit.label ? ` · ${snapped.hit.label}` : ""}` : null);
        }
        onChange(moveCue(doc, drag.sceneId, drag.trackId, drag.cueId, target));
        return;
      }

      if (drag.kind === "cue-resize") {
        const deltaMs = pxToMs(clientX - drag.startX);
        onChange(resizeCue(doc, drag.sceneId, drag.trackId, drag.cueId, drag.startDur + deltaMs));
        return;
      }

      if (drag.kind === "scene") {
        const dragged = doc.scenes.find((s) => s.id === drag.sceneId);
        if (!dragged) return;
        // Free drag — no neighbor clamp, overlap and gaps are both fine (see
        // shiftScene's doc comment). Reordering is just a side effect of
        // sorting by the new startMs, not a separate operation.
        onChange(shiftScene(doc, drag.sceneId, at - drag.grabMs - dragged.startMs));
        return;
      }

      if (drag.kind === "scene-resize-start" || drag.kind === "scene-resize-end") {
        let target = at;
        if (snapOn && !altKey) {
          const wordTargets = words.map((w) => ({ atMs: w.startMs, kind: "word" as const, label: w.text }));
          const snapped = snapTime(target, wordTargets, pxToMs(7));
          target = snapped.atMs;
          setSnapLabel(snapped.hit ? `word · ${snapped.hit.label}` : null);
        }
        onChange(
          drag.kind === "scene-resize-start"
            ? resizeSceneStart(doc, drag.sceneId, target)
            : resizeSceneEnd(doc, drag.sceneId, target)
        );
        return;
      }

      if (drag.kind === "overlay") {
        let target = at - drag.grabMs;
        if (snapOn && !altKey) {
          const wordTargets = words.map((w) => ({ atMs: w.startMs, kind: "word" as const, label: w.text }));
          const snapped = snapTime(target, wordTargets, pxToMs(7));
          target = snapped.atMs;
          setSnapLabel(snapped.hit ? `word · ${snapped.hit.label}` : null);
        }
        onChange(updateOverlay(doc, drag.overlayId, { startMs: Math.max(0, target) }));
        return;
      }

      if (drag.kind === "overlay-resize") {
        const deltaMs = pxToMs(clientX - drag.startX);
        onChange(updateOverlay(doc, drag.overlayId, { durationMs: drag.startDur + deltaMs }));
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      pendingClientX = e.clientX;
      pendingAltKey = e.altKey;
      if (rafId === null) rafId = requestAnimationFrame(applyMove);
    };

    const onUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      const had = dragRef.current;
      dragRef.current = null;
      setSnapLabel(null);
      if (had && had.kind !== "scrub") onChange(doc, { commit: true });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  const begin = (drag: Drag) => {
    onBeginGesture();
    dragRef.current = drag;
    // Force the effect above to re-attach against this gesture.
    setSnapLabel((s) => s);
  };

  /* Keyboard nudging — the last 30ms of a sync is faster by arrow key than by
     any drag, and this is the tool people reach for once things are close.
     Cue and overlay selection are mutually exclusive (selecting one clears
     the other — see onSelect/overlay onPointerDown below), so this only
     ever acts on whichever is actually selected. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected && !selectedOverlayId) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (selectedOverlayId) {
        const overlay = doc.overlays.find((o) => o.id === selectedOverlayId);
        if (!overlay) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const step = e.shiftKey ? 100 : 10;
          onBeginGesture();
          onChange(
            updateOverlay(doc, selectedOverlayId, {
              startMs: Math.max(0, overlay.startMs + (e.key === "ArrowLeft" ? -step : step)),
            }),
            { commit: true }
          );
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          onBeginGesture();
          onChange(deleteOverlay(doc, selectedOverlayId), { commit: true });
          setSelectedOverlayId(null);
        }
        return;
      }

      if (!selected) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 100 : 10;
        const scene = doc.scenes.find((s) => s.id === selected.sceneId);
        const cue = findCue(scene, selected.trackId, selected.cueId);
        if (!cue) return;
        onBeginGesture();
        onChange(
          moveCue(doc, selected.sceneId, selected.trackId, selected.cueId, cue.atMs + (e.key === "ArrowLeft" ? -step : step)),
          { commit: true }
        );
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onBeginGesture();
        onChange(deleteCue(doc, selected.sceneId, selected.trackId, selected.cueId), { commit: true });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, selectedOverlayId, doc, onChange, onBeginGesture]);

  // Keep the gutter's vertical scroll locked to the lanes'.
  const syncScroll = () => {
    if (gutterRef.current && lanesRef.current) gutterRef.current.scrollTop = lanesRef.current.scrollTop;
  };

  // Follow the playhead during playback rather than making the user chase it.
  useEffect(() => {
    const el = lanesRef.current;
    if (!el || !isPlaying) return;
    const x = msToPx(timeMs);
    if (x < el.scrollLeft + 40 || x > el.scrollLeft + el.clientWidth - 40) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.35);
    }
  }, [timeMs, isPlaying, msToPx]);

  const ticks = useMemo(() => {
    // Aim for a label every ~90px, on a round number of seconds.
    const targetMs = pxToMs(90);
    const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000];
    const step = steps.find((s) => s >= targetMs) ?? 60000;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step) out.push(t);
    return { step, out };
  }, [pxToMs, duration]);

  const selectedCue = useMemo(() => {
    if (!selected) return null;
    const scene = doc.scenes.find((s) => s.id === selected.sceneId);
    const cue = findCue(scene, selected.trackId, selected.cueId);
    return cue && scene ? { scene, cue } : null;
  }, [selected, doc]);

  // What freeform params (distancePct, xPct/yPct, …) this cue's action
  // actually takes — straight from the same catalog the AI prompt is built
  // from, so a new cue action never needs a second place to teach the
  // Inspector about its params.
  const selectedCueParams = useMemo(() => {
    if (!selected) return [];
    const catalog = selected.trackId === null ? CAMERA_CUE_DOCS : CUE_DOCS;
    const docEntry = catalog.find((d) => d.name === selectedCue?.cue.action);
    return docEntry ? editableParamNames(docEntry.params) : [];
  }, [selected, selectedCue]);

  const hasAnyManual = useMemo(
    () =>
      doc.scenes.some(
        (s) => s.manual || s.camera.some((c) => c.manual) || s.tracks.some((t) => t.cues.some((c) => c.manual))
      ) || doc.overlays.some((o) => o.manual),
    [doc]
  );

  const resetScene = (sceneId: string) => {
    onBeginGesture();
    onChange(resetSceneModification(doc, sceneId), { commit: true });
  };
  const resetOverlay = (overlayId: string) => {
    onBeginGesture();
    onChange(resetOverlayModification(doc, overlayId), { commit: true });
  };

  const totalTracks = doc.scenes.reduce((n, s) => n + (expanded[s.id] ? s.tracks.length : 0), 0);
  const overlayRowH = doc.overlays.length > 0 ? OVERLAY_H : 0;
  const bodyH = overlayRowH + doc.scenes.length * SCENE_H + totalTracks * TRACK_H;

  const saveBadge = {
    idle: { text: "SAVED", cls: "text-white/30 border-white/[0.08] bg-white/[0.03]" },
    dirty: { text: "UNSAVED", cls: "text-amber-300/80 border-amber-500/25 bg-amber-500/10" },
    saving: { text: "SAVING…", cls: "text-white/50 border-white/[0.10] bg-white/[0.04]" },
    saved: { text: "SAVED", cls: "text-emerald-300/90 border-emerald-500/25 bg-emerald-500/10" },
    error: { text: "SAVE FAILED", cls: "text-red-300/90 border-red-500/30 bg-red-500/10" },
  }[saveState];

  return (
    <div className="border-t border-white/[0.07] bg-black/40 shrink-0 select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06]">
        <button
          onClick={onTogglePlay}
          title={isPlaying ? "Pause" : "Play"}
          className="h-6 w-6 rounded flex items-center justify-center border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.12] text-white transition cursor-pointer"
        >
          {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
        <span className="font-mono text-[11px] text-white/80 tabular-nums w-[92px]">
          {fmt(timeMs)}
          <span className="text-white/25"> / {fmt(duration)}</span>
        </span>

        <div className="h-4 w-px bg-white/[0.08]" />

        <button onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)"
          className="h-6 w-6 rounded flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed">
          <Undo2 className="h-3 w-3" />
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo (⇧⌘Z)"
          className="h-6 w-6 rounded flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed">
          <Redo2 className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            onBeginGesture();
            onChange(resetAllModifications(doc), { commit: true });
          }}
          disabled={!hasAnyManual}
          title={hasAnyManual ? `${MANUAL_TIMING_LABEL} in one or more places — reset everything back to auto-sync` : "No manual timing overrides to reset"}
          className="h-6 px-2 rounded flex items-center gap-1 text-[9.5px] font-bold border transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed border-yellow-500/35 bg-yellow-500/10 text-yellow-300/90 hover:bg-yellow-500/20"
        >
          <RotateCcw className="h-3 w-3" /> RESET ALL
        </button>

        <button
          onClick={() => setSnapOn((v) => !v)}
          title="Snap to words, cuts and other cues — hold Alt to override"
          className={`h-6 px-2 rounded flex items-center gap-1 text-[9.5px] font-bold border transition cursor-pointer ${
            snapOn ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90" : "border-white/[0.08] bg-white/[0.03] text-white/40"
          }`}
        >
          <Magnet className="h-3 w-3" /> SNAP
        </button>

        <div className="h-4 w-px bg-white/[0.08]" />

        <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.4))} title="Zoom out"
          className="h-6 w-6 rounded flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition cursor-pointer">
          <ZoomOut className="h-3 w-3" />
        </button>
        <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.4))} title="Zoom in"
          className="h-6 w-6 rounded flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition cursor-pointer">
          <ZoomIn className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            const el = lanesRef.current;
            if (el) setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (el.clientWidth - 16) / duration)));
          }}
          title="Fit the whole reel"
          className="h-6 px-2 rounded text-[9.5px] font-bold border border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
        >
          FIT
        </button>

        <div className="ml-auto flex items-center gap-2">
          {snapLabel && (
            <span className="text-[9px] font-mono text-emerald-300/80 truncate max-w-[180px]">↦ {snapLabel}</span>
          )}
          <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border ${saveBadge.cls}`}>{saveBadge.text}</span>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Show the timeline" : "Collapse the timeline and give the frame its height back"}
            className="h-6 w-6 rounded flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
      <div className="flex" style={{ height: Math.min(bodyMaxH, RULER_H + WORDS_H + bodyH + 8) }}>
        {/* Gutter — scene and track names */}
        <div className="shrink-0 border-r border-white/[0.07] bg-black/30" style={{ width: GUTTER_W }}>
          <div style={{ height: RULER_H + WORDS_H }} className="border-b border-white/[0.06] flex items-end px-2 pb-0.5">
            <span className="text-[8.5px] uppercase tracking-wider text-white/25">Scenes &amp; elements</span>
          </div>
          <div ref={gutterRef} className="overflow-hidden" style={{ height: `calc(100% - ${RULER_H + WORDS_H}px)` }}>
            {doc.overlays.length > 0 && (
              <div
                className="flex items-center gap-1 px-1.5 border-b border-white/[0.05]"
                style={{ height: OVERLAY_H, background: "rgba(168,85,247,0.06)" }}
                title="Overlay clips — video inserted at an arbitrary point on the timeline, independent of any one slide"
              >
                <Clapperboard className="h-3 w-3 text-purple-300/70 shrink-0" />
                <span className="text-[9.5px] font-bold text-purple-200/80 truncate flex-1">Overlays</span>
                <span className="text-[8px] font-mono text-white/30 shrink-0">{doc.overlays.length}</span>
              </div>
            )}
            {doc.scenes.map((scene, i) => (
              <div key={scene.id}>
                <div
                  className="flex items-center gap-1 px-1.5 border-b border-white/[0.05] cursor-pointer hover:bg-white/[0.04]"
                  style={{ height: SCENE_H, background: sceneTint(i) }}
                  onClick={() => setExpanded((e) => ({ ...e, [scene.id]: !e[scene.id] }))}
                  title={`${scene.label} · slide ${scene.slideIndex + 1}`}
                >
                  {expanded[scene.id] ? (
                    <ChevronDown className="h-3 w-3 text-white/45 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-white/45 shrink-0" />
                  )}
                  <span className="text-[9.5px] font-bold text-white/85 truncate flex-1">{scene.label}</span>
                  <span className="text-[8px] font-mono text-white/30 shrink-0">{scene.tracks.length}</span>
                </div>
                {expanded[scene.id] &&
                  scene.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-1 pl-5 pr-1.5 border-b border-white/[0.04] hover:bg-white/[0.03]"
                      style={{ height: TRACK_H }}
                      title={track.name}
                    >
                      <button
                        onClick={() => {
                          onBeginGesture();
                          onChange(setTrackVisible(doc, scene.id, track.id, !track.visible), { commit: true });
                        }}
                        className="shrink-0 text-white/35 hover:text-white cursor-pointer"
                        title={track.visible ? "Hide this element" : "Show this element"}
                      >
                        {track.visible ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                      </button>
                      <span className={`text-[9px] truncate ${track.visible ? "text-white/60" : "text-white/25 line-through"}`}>
                        {track.name}
                      </span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* Lanes */}
        <div ref={lanesRef} onScroll={syncScroll} className="flex-1 overflow-auto [scrollbar-width:thin] relative">
          <div style={{ width: totalPx, position: "relative" }}>
            {/* Ruler */}
            <div
              className="sticky top-0 z-20 bg-black/80 backdrop-blur border-b border-white/[0.06] cursor-ew-resize"
              style={{ height: RULER_H }}
              onPointerDown={(e) => {
                const el = lanesRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                onSeek(Math.max(0, Math.min(duration, pxToMs(e.clientX - rect.left + el.scrollLeft))));
                begin({ kind: "scrub" });
              }}
            >
              {ticks.out.map((t) => (
                <div key={t} className="absolute top-0 bottom-0 border-l border-white/[0.10]" style={{ left: msToPx(t) }}>
                  <span className="absolute left-1 top-0.5 text-[8.5px] font-mono text-white/40 tabular-nums whitespace-nowrap">
                    {fmt(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* Spoken words — the reference everything is being synced against */}
            <div className="sticky z-10 bg-black/50 border-b border-white/[0.06]" style={{ height: WORDS_H, top: RULER_H }}>
              {words.map((w, i) => {
                const x = msToPx(w.startMs);
                const width = Math.max(2, msToPx(Math.max(60, w.endMs - w.startMs)) - 1);
                if (width < 3) return null;
                return (
                  <div
                    key={i}
                    className="absolute top-0.5 rounded-sm bg-white/[0.08] border border-white/[0.06] overflow-hidden"
                    style={{ left: x, width, height: WORDS_H - 5 }}
                    title={`${w.text} · ${fmt(w.startMs)}`}
                  >
                    <span className="block px-1 text-[8px] leading-[13px] text-white/45 whitespace-nowrap">{w.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Overlay clips — timeline-level, not scene-level, so they get
                their own flat row rather than nesting under any one scene. */}
            {doc.overlays.length > 0 && (
              <div className="relative border-b border-white/[0.05]" style={{ height: OVERLAY_H, background: "rgba(168,85,247,0.03)" }}>
                {doc.overlays.map((overlay) => {
                  const isSel = selectedOverlayId === overlay.id;
                  const left = msToPx(overlay.startMs);
                  const width = Math.max(10, msToPx(overlay.durationMs));
                  return (
                    <div
                      key={overlay.id}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).dataset.role) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setSelected(null);
                        setSelectedOverlayId(overlay.id);
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        begin({
                          kind: "overlay",
                          overlayId: overlay.id,
                          grabMs: (e.clientX - rect.left) / (width || 1) * overlay.durationMs,
                        });
                      }}
                      title={`${overlay.label} · ${fmt(overlay.startMs)} · ${Math.round(overlay.durationMs)}ms${
                        overlay.zIndex < 0 ? " · behind" : " · in front"
                      }${overlay.captionOverlay ? " · caption overlay" : ""}${overlay.manual ? ` · ${MANUAL_TIMING_LABEL}` : ""}`}
                      className={`absolute top-[3px] rounded-[3px] border overflow-hidden cursor-grab active:cursor-grabbing transition-colors group ${
                        isSel
                          ? "border-white bg-white/[0.30] z-10"
                          : overlay.manual
                          ? "border-yellow-400/70 bg-yellow-400/25 hover:bg-yellow-400/35"
                          : "border-purple-500/40 bg-purple-500/20 hover:bg-purple-500/30"
                      }`}
                      style={{ left, width, height: OVERLAY_H - 6 }}
                    >
                      <div className="flex items-center h-full px-1 gap-1">
                        <Clapperboard className="h-2.5 w-2.5 text-white/70 shrink-0" />
                        <span className="text-[8px] leading-[15px] font-medium text-white/85 whitespace-nowrap truncate">
                          {overlay.label}
                        </span>
                        {overlay.manual && (
                          <button
                            data-role="revert"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              resetOverlay(overlay.id);
                            }}
                            title={`${MANUAL_TIMING_LABEL} — click to reset`}
                            className="ml-auto shrink-0 text-yellow-200/80 hover:text-yellow-100 transition cursor-pointer"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                          </button>
                        )}
                        <button
                          data-role="delete"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBeginGesture();
                            onChange(deleteOverlay(doc, overlay.id), { commit: true });
                            if (selectedOverlayId === overlay.id) setSelectedOverlayId(null);
                          }}
                          title="Delete this overlay clip"
                          className={`${overlay.manual ? "" : "ml-auto"} shrink-0 text-white/0 group-hover:text-white/60 hover:!text-red-300 transition cursor-pointer`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <div
                        data-role="resize"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelected(null);
                          setSelectedOverlayId(overlay.id);
                          begin({
                            kind: "overlay-resize",
                            overlayId: overlay.id,
                            startDur: overlay.durationMs,
                            startX: e.clientX,
                          });
                        }}
                        className="absolute inset-y-0 right-0 w-[5px] cursor-col-resize hover:bg-white/40"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Scene + track rows */}
            <div className="relative">
              {doc.scenes.map((scene, i) => (
                <SceneRow
                  key={scene.id}
                  scene={scene}
                  index={i}
                  expanded={!!expanded[scene.id]}
                  msToPx={msToPx}
                  slideName={slideNames[scene.slideIndex]}
                  selected={selected}
                  onSelect={(s) => {
                    setSelected(s);
                    setSelectedOverlayId(null);
                  }}
                  onBeginDrag={begin}
                  onTransition={(which, patch) => {
                    onBeginGesture();
                    onChange(setTransition(doc, scene.id, which, patch), { commit: true });
                  }}
                  onResetScene={resetScene}
                />
              ))}
            </div>

            {/* Playhead — spans from below the sticky ruler+words down through
                the overlay row and every scene/track row, so it reads as one
                continuous line through the whole timeline rather than
                stopping short of whichever row happened to own it. */}
            <div
              className="absolute w-px bg-white pointer-events-none z-30"
              style={{ left: msToPx(timeMs), top: RULER_H + WORDS_H, bottom: 0 }}
            >
              <div className="absolute -top-1 -left-[3px] h-1.5 w-1.5 rotate-45 bg-white" />
            </div>
          </div>
        </div>
      </div>

      )}

      {/* Inspector */}
      {!collapsed && selectedCue && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-white/[0.06] bg-white/[0.02] overflow-x-auto [scrollbar-width:thin]">
          <span className="text-[8.5px] uppercase tracking-wider text-white/25 shrink-0">Cue</span>

          <select
            value={selectedCue.cue.action}
            onChange={(e) => {
              onBeginGesture();
              onChange(updateCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId, { action: e.target.value }), { commit: true });
            }}
            className="h-6 rounded border border-white/[0.10] bg-black/60 px-1.5 text-[10px] text-white/85 outline-none cursor-pointer"
          >
            {CUE_NAMES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <NumberField
            label="at"
            value={Math.round(selectedCue.cue.atMs)}
            onCommit={(v) => {
              onBeginGesture();
              onChange(moveCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId, v), { commit: true });
            }}
          />
          <NumberField
            label="dur"
            value={Math.round(selectedCue.cue.durMs)}
            onCommit={(v) => {
              onBeginGesture();
              onChange(resizeCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId, v), { commit: true });
            }}
          />

          <select
            value={selectedCue.cue.ease ?? ""}
            onChange={(e) => {
              onBeginGesture();
              onChange(updateCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId, { ease: e.target.value || undefined }), { commit: true });
            }}
            className="h-6 rounded border border-white/[0.10] bg-black/60 px-1.5 text-[10px] text-white/70 outline-none cursor-pointer"
          >
            <option value="">default ease</option>
            {EASE_NAMES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <label className="flex items-center gap-1 shrink-0">
            <span className="text-[8.5px] uppercase tracking-wider text-white/25">on word</span>
            <input
              defaultValue={selectedCue.cue.word ?? ""}
              key={selectedCue.cue.id + (selectedCue.cue.word ?? "")}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === (selectedCue.cue.word ?? "")) return;
                onBeginGesture();
                onChange(updateCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId, { word: v || undefined }), { commit: true });
              }}
              placeholder="—"
              className="h-6 w-24 rounded border border-white/[0.10] bg-black/60 px-1.5 text-[10px] font-mono text-white/85 outline-none focus:border-white/[0.28]"
            />
          </label>

          {selectedCueParams.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 pl-1.5 border-l border-white/[0.08]" title="This cue's own motion params — e.g. how far it travels, and in which direction. Unclamped: any value places the element anywhere, including fully off-frame.">
              {selectedCueParams.map((name) => (
                <ParamField
                  key={name}
                  label={name}
                  value={typeof selectedCue.cue.params[name] === "number" ? (selectedCue.cue.params[name] as number) : undefined}
                  onCommit={(v) => {
                    onBeginGesture();
                    onChange(
                      updateCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId, { params: { [name]: v } }),
                      { commit: true }
                    );
                  }}
                />
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-1 shrink-0">
            {selectedCue.cue.manual && (
              <button
                onClick={() => {
                  onBeginGesture();
                  onChange(resetCueModification(doc, selected!.sceneId, selected!.trackId, selected!.cueId), { commit: true });
                }}
                title={`${MANUAL_TIMING_LABEL} — click to reset to auto-sync`}
                className="h-6 w-6 rounded flex items-center justify-center text-yellow-300/85 hover:text-yellow-200 hover:bg-yellow-500/10 transition cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={() => {
                onBeginGesture();
                onChange(duplicateCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId), { commit: true });
              }}
              title="Duplicate"
              className="h-6 w-6 rounded flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                onBeginGesture();
                onChange(deleteCue(doc, selected!.sceneId, selected!.trackId, selected!.cueId), { commit: true });
                setSelected(null);
              }}
              title="Delete (⌫)"
              className="h-6 w-6 rounded flex items-center justify-center text-red-300/70 hover:text-red-300 hover:bg-red-500/10 transition cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

function findCue(scene: EditableScene | undefined, trackId: string | null, cueId: string): EditableCue | null {
  if (!scene) return null;
  if (trackId === null) return scene.camera.find((c) => c.id === cueId) ?? null;
  return scene.tracks.find((t) => t.id === trackId)?.cues.find((c) => c.id === cueId) ?? null;
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="flex items-center gap-1 shrink-0">
      <span className="text-[8.5px] uppercase tracking-wider text-white/25">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n !== value) onCommit(n);
          else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-6 w-16 rounded border border-white/[0.10] bg-black/60 px-1.5 text-[10px] font-mono tabular-nums text-white/85 outline-none focus:border-white/[0.28]"
      />
      <span className="text-[8px] text-white/20">ms</span>
    </label>
  );
}

/**
 * A cue's freeform param names come straight out of CUE_DOCS/CAMERA_CUE_DOCS
 * (cues.ts) — the same catalog the AI prompt is built from — so the
 * Inspector never needs its own hardcoded per-action list. `(track.wipeFrom)`
 * -style entries are documentation, not an editable number, and are dropped.
 */
function editableParamNames(paramsDoc: string): string[] {
  if (!paramsDoc || paramsDoc === "—") return [];
  return paramsDoc
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("("));
}

/** Every param in the catalog is either a percent-of-canvas, a degree, or a unitless scale/count — inferred from its name rather than a second hand-maintained table. */
function paramUnit(name: string): string {
  if (/pct$/i.test(name)) return "%";
  if (/deg$/i.test(name)) return "°";
  return "";
}

/** Like NumberField, but for an optional freeform cue param: blank reads as "using the cue's built-in default", and blurring a blank field commits nothing. */
function ParamField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  onCommit: (v: number) => void;
}) {
  const unit = paramUnit(label);
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  return (
    <label className="flex items-center gap-1 shrink-0">
      <span className="text-[8.5px] uppercase tracking-wider text-white/25">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (draft.trim() !== "" && Number.isFinite(n) && n !== value) onCommit(n);
          else setDraft(value === undefined ? "" : String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="auto"
        title={`${label} — leave blank to use this cue's built-in default`}
        className="h-6 w-14 rounded border border-white/[0.10] bg-black/60 px-1.5 text-[10px] font-mono tabular-nums text-white/85 outline-none focus:border-white/[0.28] placeholder:text-white/20"
      />
      {unit && <span className="text-[8px] text-white/20">{unit}</span>}
    </label>
  );
}

interface SceneRowProps {
  scene: EditableScene;
  index: number;
  expanded: boolean;
  msToPx: (ms: number) => number;
  slideName?: string;
  selected: { sceneId: string; trackId: string | null; cueId: string } | null;
  onSelect: (s: { sceneId: string; trackId: string | null; cueId: string } | null) => void;
  onBeginDrag: (d: Drag) => void;
  onTransition: (which: "enter" | "exit", patch: { type?: TransitionType; durationMs?: number }) => void;
  onResetScene: (sceneId: string) => void;
}

const TRANSITION_CYCLE: TransitionType[] = [
  "whooshCut",
  "glitch",
  "flashCut",
  "zoomPunch",
  "spinZoom",
  "blurDissolve",
  "slideUp",
  "slideDown",
  "irisCircle",
  "diagonalWipe",
  "splitReveal",
  "cardFlip",
  "fade",
  "dipToBlack",
  "cut",
];

const TRANSITION_LABEL: Record<TransitionType, string> = {
  whooshCut: "SLIDE",
  glitch: "GLITCH",
  flashCut: "FLASH",
  zoomPunch: "ZOOM",
  spinZoom: "SPIN",
  blurDissolve: "BLUR",
  slideUp: "UP",
  slideDown: "DOWN",
  irisCircle: "IRIS",
  diagonalWipe: "WIPE",
  splitReveal: "SPLIT",
  cardFlip: "FLIP",
  fade: "FADE",
  dipToBlack: "DIP",
  cut: "CUT",
};

function SceneRow({ scene, index, expanded, msToPx, slideName, selected, onSelect, onBeginDrag, onTransition, onResetScene }: SceneRowProps) {
  const left = msToPx(scene.startMs);
  const width = Math.max(2, msToPx(scene.endMs - scene.startMs));

  return (
    <div>
      {/* Macro row */}
      <div className="relative border-b border-white/[0.05]" style={{ height: SCENE_H, background: sceneTint(index) }}>
        <div
          className={`absolute top-1 bottom-1 rounded border transition cursor-grab active:cursor-grabbing overflow-hidden ${
            scene.manual
              ? "border-yellow-400/70 bg-yellow-400/[0.16] hover:bg-yellow-400/[0.22]"
              : "border-white/[0.14] bg-white/[0.06] hover:bg-white/[0.10]"
          }`}
          style={{ left, width }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).dataset.role) return;
            e.preventDefault();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onBeginDrag({
              kind: "scene",
              sceneId: scene.id,
              grabMs: ((e.clientX - rect.left) / (width || 1)) * (scene.endMs - scene.startMs),
            });
          }}
          title={`${scene.label} · slide ${scene.slideIndex + 1}${slideName ? ` (${slideName})` : ""}${scene.manual ? ` · ${MANUAL_TIMING_LABEL}` : ""}`}
        >
          <div className="flex items-center gap-1 h-full px-1">
            {/* The entering transition lives inline at the head of the scene —
                which is literally where it happens, and keeps it from covering
                the label the way an overlaid badge did. */}
            <button
              data-role="transition"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const next = TRANSITION_CYCLE[(TRANSITION_CYCLE.indexOf(scene.enter.type) + 1) % TRANSITION_CYCLE.length];
                onTransition("enter", { type: next });
              }}
              title={`Entering transition: ${scene.enter.type}${
                scene.enter.type !== "cut" ? ` · ${scene.enter.durationMs}ms` : ""
              } — click to cycle cut → fade → dip`}
              className={`shrink-0 h-[17px] px-1 rounded text-[7.5px] font-bold border cursor-pointer transition ${
                scene.enter.type === "cut"
                  ? "border-white/[0.10] bg-black/50 text-white/40 hover:text-white/70"
                  : "border-emerald-500/35 bg-emerald-500/15 text-emerald-200/90 hover:bg-emerald-500/25"
              }`}
            >
              {TRANSITION_LABEL[scene.enter.type]}
              {scene.enter.type !== "cut" ? ` ${scene.enter.durationMs}` : ""}
            </button>
            <span className="text-[8px] font-mono text-white/35 shrink-0">{scene.slideIndex + 1}</span>
            <span className="text-[9px] font-bold text-white/80 truncate">{scene.label}</span>
            {scene.manual && (
              <button
                data-role="revert"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onResetScene(scene.id);
                }}
                title={`${MANUAL_TIMING_LABEL} — click to reset to auto-sync`}
                className="shrink-0 ml-auto h-[15px] w-[15px] rounded-full flex items-center justify-center text-yellow-950 bg-yellow-400 hover:bg-yellow-300 transition cursor-pointer"
              >
                <RotateCcw className="h-[9px] w-[9px]" />
              </button>
            )}
            <span className={`text-[8px] font-mono text-white/25 shrink-0 pl-1 ${scene.manual ? "" : "ml-auto"}`}>
              {((scene.endMs - scene.startMs) / 1000).toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Edge handles — stretch this ONE scene from either side. Independent
            per scene (not shared with a neighbor like the old boundary drag
            was), since a resize must never touch any other scene. */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBeginDrag({ kind: "scene-resize-start", sceneId: scene.id });
          }}
          title="Stretch this scene's start"
          className="absolute top-0 bottom-0 z-20 w-[7px] -ml-[3px] cursor-col-resize group"
          style={{ left }}
        >
          <div className="absolute inset-y-0 left-[3px] w-px bg-white/25 group-hover:bg-white group-hover:w-[2px] transition-all" />
        </div>
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBeginDrag({ kind: "scene-resize-end", sceneId: scene.id });
          }}
          title="Stretch this scene's end"
          className="absolute top-0 bottom-0 z-20 w-[7px] -ml-[3px] cursor-col-resize group"
          style={{ left: left + width }}
        >
          <div className="absolute inset-y-0 left-[3px] w-px bg-white/25 group-hover:bg-white group-hover:w-[2px] transition-all" />
        </div>
      </div>

      {/* Micro rows */}
      {expanded &&
        scene.tracks.map((track) => (
          <div key={track.id} className="relative border-b border-white/[0.04]" style={{ height: TRACK_H }}>
            <div
              className="absolute inset-y-0 bg-white/[0.02]"
              style={{ left: msToPx(scene.startMs), width: msToPx(scene.endMs - scene.startMs) }}
            />
            {track.cues.map((cue) => {
              const isSel = selected?.cueId === cue.id;
              const cl = msToPx(cue.atMs);
              const cw = Math.max(8, msToPx(Math.max(cue.durMs, 90)));
              return (
                <div
                  key={cue.id}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).dataset.role === "resize") return;
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect({ sceneId: scene.id, trackId: track.id, cueId: cue.id });
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onBeginDrag({
                      kind: "cue",
                      sceneId: scene.id,
                      trackId: track.id,
                      cueId: cue.id,
                      grabMs: (e.clientX - rect.left) / (cw || 1) * Math.max(cue.durMs, 90),
                      startAt: cue.atMs,
                    });
                  }}
                  title={`${cue.action} · ${fmt(cue.atMs)} · ${Math.round(cue.durMs)}ms${cue.word ? ` · on "${cue.word}"` : ""}${cue.manual ? ` · ${MANUAL_TIMING_LABEL}` : ""}`}
                  className={`absolute top-[3px] rounded-[3px] border overflow-hidden cursor-grab active:cursor-grabbing transition-colors ${
                    isSel
                      ? "border-white bg-white/[0.30] z-10"
                      : cue.manual
                      ? "border-yellow-400/70 bg-yellow-400/25 hover:bg-yellow-400/35"
                      : cue.word
                      ? "border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30"
                      : "border-white/[0.16] bg-white/[0.10] hover:bg-white/[0.18]"
                  }`}
                  style={{ left: cl, width: cw, height: TRACK_H - 8 }}
                >
                  <span className="block px-1 text-[8px] leading-[15px] font-medium text-white/85 whitespace-nowrap">
                    {cue.action}
                  </span>
                  <div
                    data-role="resize"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect({ sceneId: scene.id, trackId: track.id, cueId: cue.id });
                      onBeginDrag({
                        kind: "cue-resize",
                        sceneId: scene.id,
                        trackId: track.id,
                        cueId: cue.id,
                        startDur: cue.durMs,
                        startX: e.clientX,
                      });
                    }}
                    className="absolute inset-y-0 right-0 w-[5px] cursor-col-resize hover:bg-white/40"
                  />
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
