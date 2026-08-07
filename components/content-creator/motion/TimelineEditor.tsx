"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  CUE_NAMES,
  EASE_NAMES,
  type TranscriptWord,
  type TransitionType,
} from "@/lib/motion-timeline";
import {
  moveCue,
  moveSceneBoundary,
  resizeCue,
  shiftScene,
  snapTargetsFor,
  snapTime,
  setTransition,
  setTrackVisible,
  deleteCue,
  duplicateCue,
  updateCue,
  type EditableCue,
  type EditableScene,
  type EditableTimeline,
} from "@/lib/motion-timeline/edit";

/* Row geometry. The gutter and the lanes are two separate scrollers, so every
   height here has to match on both sides or the labels drift off their rows. */
const RULER_H = 22;
const WORDS_H = 18;
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
  | { kind: "boundary"; index: number }
  | { kind: "scene"; sceneId: string; startX: number }
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
     3px-wide thing being dragged. */
  useEffect(() => {
    if (!dragRef.current) return;

    const localMs = (clientX: number) => {
      const el = lanesRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return pxToMs(clientX - rect.left + el.scrollLeft);
    };

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const at = localMs(e.clientX);

      if (drag.kind === "scrub") {
        onSeek(Math.max(0, Math.min(duration, at)));
        return;
      }

      if (drag.kind === "cue") {
        const scene = doc.scenes.find((s) => s.id === drag.sceneId);
        if (!scene) return;
        let target = at - drag.grabMs;
        if (snapOn && !e.altKey) {
          const targets = snapTargetsFor(doc, drag.sceneId, words, drag.cueId);
          const snapped = snapTime(target, targets, pxToMs(7));
          target = snapped.atMs;
          setSnapLabel(snapped.hit ? `${snapped.hit.kind}${snapped.hit.label ? ` · ${snapped.hit.label}` : ""}` : null);
        }
        onChange(moveCue(doc, drag.sceneId, drag.trackId, drag.cueId, target));
        return;
      }

      if (drag.kind === "cue-resize") {
        const deltaMs = pxToMs(e.clientX - drag.startX);
        onChange(resizeCue(doc, drag.sceneId, drag.trackId, drag.cueId, drag.startDur + deltaMs));
        return;
      }

      if (drag.kind === "boundary") {
        let target = at;
        if (snapOn && !e.altKey) {
          const wordTargets = words.map((w) => ({ atMs: w.startMs, kind: "word" as const, label: w.text }));
          const snapped = snapTime(target, wordTargets, pxToMs(7));
          target = snapped.atMs;
          setSnapLabel(snapped.hit ? `word · ${snapped.hit.label}` : null);
        }
        onChange(moveSceneBoundary(doc, drag.index, target));
        return;
      }

      if (drag.kind === "scene") {
        const deltaMs = pxToMs(e.clientX - drag.startX);
        dragRef.current = { ...drag, startX: e.clientX };
        onChange(shiftScene(doc, drag.sceneId, deltaMs));
      }
    };

    const onUp = () => {
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
     any drag, and this is the tool people reach for once things are close. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

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
  }, [selected, doc, onChange, onBeginGesture]);

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

  const totalTracks = doc.scenes.reduce((n, s) => n + (expanded[s.id] ? s.tracks.length : 0), 0);
  const bodyH = doc.scenes.length * SCENE_H + totalTracks * TRACK_H;

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
                  onSelect={setSelected}
                  onBeginDrag={begin}
                  onTransition={(which, patch) => {
                    onBeginGesture();
                    onChange(setTransition(doc, scene.id, which, patch), { commit: true });
                  }}
                />
              ))}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-white pointer-events-none z-30"
                style={{ left: msToPx(timeMs) }}
              >
                <div className="absolute -top-1 -left-[3px] h-1.5 w-1.5 rotate-45 bg-white" />
              </div>
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

          <div className="ml-auto flex items-center gap-1 shrink-0">
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

function SceneRow({ scene, index, expanded, msToPx, slideName, selected, onSelect, onBeginDrag, onTransition }: SceneRowProps) {
  const left = msToPx(scene.startMs);
  const width = Math.max(2, msToPx(scene.endMs - scene.startMs));

  return (
    <div>
      {/* Macro row */}
      <div className="relative border-b border-white/[0.05]" style={{ height: SCENE_H, background: sceneTint(index) }}>
        <div
          className="absolute top-1 bottom-1 rounded border border-white/[0.14] bg-white/[0.06] hover:bg-white/[0.10] transition cursor-grab active:cursor-grabbing overflow-hidden"
          style={{ left, width }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).dataset.role) return;
            e.preventDefault();
            onBeginDrag({ kind: "scene", sceneId: scene.id, startX: e.clientX });
          }}
          title={`${scene.label} · slide ${scene.slideIndex + 1}${slideName ? ` (${slideName})` : ""}`}
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
            <span className="text-[8px] font-mono text-white/25 shrink-0 ml-auto pl-1">
              {((scene.endMs - scene.startMs) / 1000).toFixed(2)}s
            </span>
          </div>
        </div>

        {/* Boundary handle — the cut between this scene and the previous one */}
        {index > 0 && (
          <div
            data-role="boundary"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBeginDrag({ kind: "boundary", index });
            }}
            title="Drag the cut"
            className="absolute top-0 bottom-0 z-20 w-[7px] -ml-[3px] cursor-col-resize group"
            style={{ left }}
          >
            <div className="absolute inset-y-0 left-[3px] w-px bg-white/25 group-hover:bg-white group-hover:w-[2px] transition-all" />
          </div>
        )}
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
                  title={`${cue.action} · ${fmt(cue.atMs)} · ${Math.round(cue.durMs)}ms${cue.word ? ` · on "${cue.word}"` : ""}`}
                  className={`absolute top-[3px] rounded-[3px] border overflow-hidden cursor-grab active:cursor-grabbing transition-colors ${
                    isSel
                      ? "border-white bg-white/[0.30] z-10"
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
