"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LEVELS_FONT_SIZE_MAX, LEVELS_FONT_SIZE_MIN } from "./constants";
import { boxHeight, computeImageRect, displayText, layoutBox, resolveFontFamily } from "./textLayout";
import type { LevelsSlide, LevelsTextBox } from "./types";
import type { LevelsCarouselState } from "./useLevelsCarousel";

/**
 * The interactive slide. Everything is laid out in canvas units and simply
 * multiplied by `scale` for display, so this is the same geometry the
 * exporter draws — including the wrapped lines, which come from the shared
 * `wrapBoxText` rather than from the browser re-wrapping at display size.
 */

type DragMode = "move" | "resize-l" | "resize-r" | "scale" | "rotate" | "image";

interface DragState {
  mode: DragMode;
  boxId: string | null;
  startX: number;
  startY: number;
  origin: { x: number; y: number; width: number; fontSize: number; rotation: number };
  slideOrigin: { offsetX: number; offsetY: number };
}

/** Pointer delta rotated into the box's own frame, so handles stay intuitive when tilted. */
function toLocal(dx: number, dy: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  return { x: dx * Math.cos(r) + dy * Math.sin(r), y: -dx * Math.sin(r) + dy * Math.cos(r) };
}

const SNAP = 10; // canvas units

export function LevelsCanvasStage({
  state,
  className = "",
}: {
  state: LevelsCarouselState;
  className?: string;
}) {
  const {
    activeSlide, ratio, settings,
    selectedTextId, setSelectedTextId,
    editingTextId, setEditingTextId,
    updateSlide, updateTextBox, removeTextBox, duplicateTextBox,
    beginGesture, endGesture, commit,
  } = state;

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [scale, setScale] = useState(0.3);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  // Fit the stage to whatever space the panel gives it, on resize and on ratio change.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const availW = el.clientWidth - 24;
      const availH = el.clientHeight - 24;
      if (availW <= 0 || availH <= 0) return;
      setScale(Math.max(0.05, Math.min(availW / ratio.w, availH / ratio.h)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio.w, ratio.h]);

  const dispW = ratio.w * scale;
  const dispH = ratio.h * scale;
  const imgRect = activeSlide ? computeImageRect(activeSlide, ratio.w, ratio.h) : null;

  // ── Dragging ─────────────────────────────────────────────────────────────

  const startDrag = useCallback(
    (e: React.PointerEvent, mode: DragMode, box: LevelsTextBox | null) => {
      if (!activeSlide) return;
      if (box?.locked && mode !== "move") return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      beginGesture();
      dragRef.current = {
        mode,
        boxId: box?.id ?? null,
        startX: e.clientX,
        startY: e.clientY,
        origin: {
          x: box?.x ?? 0,
          y: box?.y ?? 0,
          width: box?.width ?? 0,
          fontSize: box?.fontSize ?? 0,
          rotation: box?.rotation ?? 0,
        },
        slideOrigin: { offsetX: activeSlide.offsetX, offsetY: activeSlide.offsetY },
      };
    },
    [activeSlide, beginGesture],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !activeSlide) return;
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;

      if (drag.mode === "image") {
        let offsetX = drag.slideOrigin.offsetX + dx;
        let offsetY = drag.slideOrigin.offsetY + dy;
        const gx: number[] = [];
        const gy: number[] = [];
        // Snap back to dead-centre — the placement this carousel starts from.
        if (Math.abs(offsetX) < SNAP) { offsetX = 0; gx.push(ratio.w / 2); }
        if (Math.abs(offsetY) < SNAP) { offsetY = 0; gy.push(ratio.h / 2); }
        setGuides({ x: gx, y: gy });
        updateSlide(activeSlide.id, { offsetX, offsetY });
        return;
      }

      const box = activeSlide.texts.find((t) => t.id === drag.boxId);
      if (!box) return;

      if (drag.mode === "move") {
        let x = drag.origin.x + dx;
        let y = drag.origin.y + dy;
        const h = boxHeight(box);
        const gx: number[] = [];
        const gy: number[] = [];
        // Centre lines and the 5% safe margins are what these posts line up to.
        const centerX = x + box.width / 2;
        const centerY = y + h / 2;
        const marginL = ratio.w * 0.05;
        const marginR = ratio.w * 0.95;
        if (Math.abs(centerX - ratio.w / 2) < SNAP) { x = (ratio.w - box.width) / 2; gx.push(ratio.w / 2); }
        else if (Math.abs(x - marginL) < SNAP) { x = marginL; gx.push(marginL); }
        else if (Math.abs(x + box.width - marginR) < SNAP) { x = marginR - box.width; gx.push(marginR); }
        if (Math.abs(centerY - ratio.h / 2) < SNAP) { y = (ratio.h - h) / 2; gy.push(ratio.h / 2); }
        setGuides({ x: gx, y: gy });
        updateTextBox(box.id, { x, y });
        return;
      }

      const local = toLocal(dx, dy, drag.origin.rotation);

      if (drag.mode === "resize-r") {
        updateTextBox(box.id, { width: Math.max(40, drag.origin.width + local.x) });
        return;
      }
      if (drag.mode === "resize-l") {
        const width = Math.max(40, drag.origin.width - local.x);
        updateTextBox(box.id, { x: drag.origin.x + (drag.origin.width - width), width });
        return;
      }
      if (drag.mode === "scale") {
        // Corner drag scales the type; the wrap width follows so the block
        // keeps its proportions instead of re-flowing under the pointer.
        const k = Math.max(0.15, 1 + (local.x + local.y) / Math.max(120, drag.origin.width));
        updateTextBox(box.id, {
          fontSize: Math.round(
            Math.max(LEVELS_FONT_SIZE_MIN, Math.min(LEVELS_FONT_SIZE_MAX, drag.origin.fontSize * k)),
          ),
          width: Math.max(40, Math.round(drag.origin.width * k)),
        });
        return;
      }
      if (drag.mode === "rotate") {
        const rect = stageRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = rect.left + (box.x + box.width / 2) * scale;
        const cy = rect.top + (box.y + boxHeight(box) / 2) * scale;
        const deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
        // Shift snaps to 15° increments.
        updateTextBox(box.id, { rotation: e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg) });
      }
    },
    [activeSlide, ratio.h, ratio.w, scale, updateSlide, updateTextBox],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setGuides({ x: [], y: [] });
    endGesture();
  }, [endGesture]);

  // ── Keyboard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingTextId) return;
      const target = e.target as HTMLElement | null;
      // Never steal keys from the left panel's own inputs.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (!selectedTextId || !activeSlide) return;
      const box = activeSlide.texts.find((t) => t.id === selectedTextId);
      if (!box) return;

      if (e.key === "Escape") { setSelectedTextId(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeTextBox(box.id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateTextBox(box.id);
        return;
      }
      const step = e.shiftKey ? 20 : 2;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const delta = nudge[e.key];
      if (delta) {
        e.preventDefault();
        updateTextBox(box.id, { x: box.x + delta[0], y: box.y + delta[1] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeSlide, duplicateTextBox, editingTextId, removeTextBox, selectedTextId, setSelectedTextId, updateTextBox]);

  const backgroundStyle = useMemo(() => {
    if (settings.bgMode === "gradient") {
      return { background: `linear-gradient(180deg, ${settings.bgColor} 0%, ${settings.bgColor2} 100%)` };
    }
    return { background: settings.bgColor };
  }, [settings.bgColor, settings.bgColor2, settings.bgMode]);

  return (
    <div ref={wrapRef} className={`relative flex items-center justify-center overflow-hidden ${className}`}>
      <div
        ref={stageRef}
        className="relative shrink-0 overflow-hidden select-none shadow-[0_20px_70px_rgba(0,0,0,0.6)]"
        style={{ width: dispW, height: dispH, ...backgroundStyle, touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={(e) => {
          // A click on empty canvas clears the selection.
          if (e.target === e.currentTarget) { setSelectedTextId(null); setEditingTextId(null); }
        }}
      >
        {/* Blurred blow-up of the same chart filling the letterbox gaps */}
        {settings.bgMode === "blur" && activeSlide && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeSlide.src}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ filter: `blur(${settings.blurStrength * scale}px)`, transform: "scale(1.15)" }}
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `rgba(0,0,0,${settings.blurDim})` }}
            />
          </>
        )}

        {/* The chart itself — drag anywhere */}
        {activeSlide && imgRect && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeSlide.src}
            alt={activeSlide.name}
            draggable={false}
            onPointerDown={(e) => { setSelectedTextId(null); startDrag(e, "image", null); }}
            className="absolute cursor-grab active:cursor-grabbing"
            style={{
              left: imgRect.x * scale,
              top: imgRect.y * scale,
              width: imgRect.w * scale,
              height: imgRect.h * scale,
              borderRadius: settings.imageRadius * scale,
              boxShadow: settings.imageShadow ? `0 ${14 * scale}px ${48 * scale}px rgba(0,0,0,0.55)` : undefined,
              border: settings.imageBorder ? `${Math.max(1, 2 * scale)}px solid ${settings.imageBorderColor}59` : undefined,
              touchAction: "none",
            }}
          />
        )}

        {/* Text boxes */}
        {activeSlide?.texts.map((box) => (
          <TextLayer
            key={box.id}
            box={box}
            scale={scale}
            selected={selectedTextId === box.id}
            editing={editingTextId === box.id}
            onSelect={() => setSelectedTextId(box.id)}
            onStartEdit={() => { setSelectedTextId(box.id); setEditingTextId(box.id); }}
            onCommitEdit={(text) => {
              // Snapshot before applying, so one edit session is one undo step.
              if (text !== box.text) { commit(); updateTextBox(box.id, { text }); }
              setEditingTextId(null);
            }}
            onDragStart={(e, mode) => startDrag(e, mode, box)}
          />
        ))}

        {/* Alignment guides — only while something is being dragged */}
        {guides.x.map((gx) => (
          <div key={`gx${gx}`} className="absolute top-0 bottom-0 w-px bg-emerald-400/70 pointer-events-none" style={{ left: gx * scale }} />
        ))}
        {guides.y.map((gy) => (
          <div key={`gy${gy}`} className="absolute left-0 right-0 h-px bg-emerald-400/70 pointer-events-none" style={{ top: gy * scale }} />
        ))}

        {settings.showCounter && state.slides.length > 1 && (
          <div
            className="absolute pointer-events-none font-bold"
            style={{
              right: ratio.w * 0.05 * scale,
              top: ratio.w * 0.05 * scale,
              fontSize: ratio.w * 0.026 * scale,
              color: settings.counterColor,
              opacity: 0.75,
              textShadow: "0 1px 10px rgba(0,0,0,0.6)",
            }}
          >
            {state.activeIndex + 1}/{state.slides.length}
          </div>
        )}
      </div>
    </div>
  );
}

/** One text box: exact wrapped lines when idle, a live textarea while editing. */
function TextLayer({
  box, scale, selected, editing, onSelect, onStartEdit, onCommitEdit, onDragStart,
}: {
  box: LevelsTextBox;
  scale: number;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommitEdit: (text: string) => void;
  onDragStart: (e: React.PointerEvent, mode: DragMode) => void;
}) {
  // Positions come from the shared layout pass, so a line sits exactly where
  // the exported JPEG puts it no matter how the font behaves at preview size.
  const lines = useMemo(() => layoutBox(box), [box]);
  const lineH = box.fontSize * box.lineHeight;
  const h = lineH * Math.max(1, lines.length);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(box.text);

  useEffect(() => {
    if (!editing) return;
    setDraft(box.text);
    const ta = taRef.current;
    if (ta) { ta.focus(); ta.select(); }
    // Only re-sync when edit mode opens — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const fs = box.fontSize * scale;
  const typography: React.CSSProperties = {
    fontFamily: resolveFontFamily(box.fontFamily),
    fontSize: fs,
    fontWeight: box.bold ? 800 : 400,
    fontStyle: box.italic ? "italic" : "normal",
    letterSpacing: box.letterSpacing * scale,
    lineHeight: `${box.fontSize * box.lineHeight * scale}px`,
    color: box.color,
    textDecoration: box.underline ? "underline" : "none",
    textDecorationThickness: box.underline ? Math.max(1, fs * 0.055) : undefined,
    textUnderlineOffset: box.underline ? fs * 0.16 : undefined,
    textShadow: box.shadow ? `0 ${fs * 0.06}px ${fs * 0.35}px rgba(0,0,0,0.65)` : "none",
    // `paint-order: stroke` puts the outline behind the fill, matching the
    // canvas exporter which strokes first and fills over it.
    WebkitTextStrokeWidth: box.outline ? Math.max(1, fs * 0.09) : undefined,
    WebkitTextStrokeColor: box.outline ? box.outlineColor : undefined,
    paintOrder: box.outline ? "stroke fill" : undefined,
  };

  const handle = "absolute bg-white border border-black/40 rounded-sm shadow";
  const handleSize = 9;

  return (
    <div
      className="absolute"
      style={{
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: h * scale,
        opacity: box.opacity,
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
        transformOrigin: "center center",
        touchAction: "none",
        cursor: box.locked ? "default" : editing ? "text" : "move",
      }}
      onPointerDown={(e) => {
        if (editing) return;
        onSelect();
        if (!box.locked) onDragStart(e, "move");
      }}
      onDoubleClick={(e) => { e.stopPropagation(); if (!box.locked) onStartEdit(); }}
    >
      {/* Pill behind the text */}
      {box.bgColor && (
        <div
          className="absolute pointer-events-none"
          style={{
            inset: -box.bgPadding * scale,
            background: box.bgColor,
            opacity: box.bgOpacity,
            borderRadius: box.bgRadius * scale,
          }}
        />
      )}

      {editing ? (
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommitEdit(draft)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
              e.preventDefault();
              onCommitEdit(draft);
            }
          }}
          spellCheck={false}
          className="absolute inset-0 w-full h-full bg-transparent border-0 outline-none resize-none overflow-visible p-0 m-0"
          style={{
            ...typography,
            textAlign: box.align,
            textTransform: box.uppercase ? "uppercase" : "none",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            caretColor: "#10b981",
          }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none" style={typography}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: (line.x - box.x) * scale,
                top: (line.y - box.y) * scale,
                height: lineH * scale,
                whiteSpace: "pre",
              }}
            >
              {line.text || " "}
            </div>
          ))}
        </div>
      )}

      {/* Selection chrome */}
      {selected && !editing && (
        <>
          <div className="absolute -inset-px border border-emerald-400/80 pointer-events-none rounded-[2px]" />
          {!box.locked && (
            <>
              {/* width, from either edge */}
              <div
                className={`${handle} cursor-ew-resize`}
                style={{ left: -handleSize / 2, top: `calc(50% - ${handleSize / 2}px)`, width: handleSize, height: handleSize }}
                onPointerDown={(e) => onDragStart(e, "resize-l")}
              />
              <div
                className={`${handle} cursor-ew-resize`}
                style={{ right: -handleSize / 2, top: `calc(50% - ${handleSize / 2}px)`, width: handleSize, height: handleSize }}
                onPointerDown={(e) => onDragStart(e, "resize-r")}
              />
              {/* type size */}
              <div
                className={`${handle} cursor-nwse-resize`}
                style={{ right: -handleSize / 2, bottom: -handleSize / 2, width: handleSize, height: handleSize }}
                onPointerDown={(e) => onDragStart(e, "scale")}
                title="Drag to resize the text"
              />
              {/* rotation */}
              <div
                className={`${handle} cursor-grab rounded-full`}
                style={{ left: `calc(50% - ${handleSize / 2}px)`, top: -handleSize * 2.4, width: handleSize, height: handleSize }}
                onPointerDown={(e) => onDragStart(e, "rotate")}
                title="Drag to rotate (hold Shift for 15° steps)"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Small non-interactive preview used by the filmstrip. */
export function LevelsSlideThumb({
  slide, ratioW, ratioH, bg, width,
}: {
  slide: LevelsSlide;
  ratioW: number;
  ratioH: number;
  bg: string;
  width: number;
}) {
  const scale = width / ratioW;
  const rect = computeImageRect(slide, ratioW, ratioH);
  return (
    <div className="relative overflow-hidden rounded" style={{ width, height: ratioH * scale, background: bg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={slide.src}
        alt={slide.name}
        draggable={false}
        className="absolute"
        style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale }}
      />
      {slide.texts.map((t) => (
        <div
          key={t.id}
          className="absolute overflow-hidden"
          style={{
            left: t.x * scale,
            top: t.y * scale,
            width: t.width * scale,
            fontFamily: resolveFontFamily(t.fontFamily),
            fontSize: Math.max(2, t.fontSize * scale),
            fontWeight: t.bold ? 800 : 400,
            fontStyle: t.italic ? "italic" : "normal",
            lineHeight: `${t.fontSize * t.lineHeight * scale}px`,
            color: t.color,
            textAlign: t.align,
            opacity: t.opacity,
            transform: t.rotation ? `rotate(${t.rotation}deg)` : undefined,
            whiteSpace: "pre-wrap",
          }}
        >
          {displayText(t)}
        </div>
      ))}
    </div>
  );
}
