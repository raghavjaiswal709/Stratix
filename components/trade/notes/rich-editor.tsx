"use client";

import { Node, Extension, mergeAttributes } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Slice, Fragment } from "@tiptap/pm/model";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type ReactNodeViewProps,
  useEditor,
  EditorContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  ImageIcon,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Pencil,
  Circle,
  Square,
  Minus as LineIcon,
  ArrowRight,
  Eraser,
  Undo2,
  Trash2,
  Check,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactDOM from "react-dom";

// ── Types ──────────────────────────────────────────────────────────────────
type DrawTool = "pen" | "eraser" | "rect" | "circle" | "line" | "arrow";

// ── Constants ──────────────────────────────────────────────────────────────
const COLORS = [
  "#000000",
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#ec4899",
  "#6b7280",
  "#f43f5e",
  "#a3a3a3",
];

const LINE_WIDTHS = [2, 4, 8, 16];

// ── Arrow helper ──────────────────────────────────────────────────────────
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lw: number
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(12, lw * 3);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

// ── DrawingCanvas ─────────────────────────────────────────────────────────
interface DrawingCanvasProps {
  backgroundSrc?: string;
  initialDataUrl?: string;
  canvasWidth: number;
  canvasHeight: number;
  onSave?: (dataUrl: string) => void;
  onCancel?: () => void;
}

function DrawingCanvas({
  backgroundSrc,
  initialDataUrl,
  canvasWidth,
  canvasHeight,
  onSave,
  onCancel,
}: DrawingCanvasProps) {
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState("#10b981");
  const [lineWidth, setLineWidth] = useState(3);
  const [canUndo, setCanUndo] = useState(false);
  const isDrawing = useRef(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<string[]>([]);

  useLayoutEffect(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;

    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    const load = async () => {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      if (backgroundSrc) {
        try {
          const img = await loadImg(backgroundSrc);
          if (!cancelled) ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
        } catch { /* ignore */ }
      }

      if (initialDataUrl && !cancelled) {
        try {
          const img = await loadImg(initialDataUrl);
          if (!cancelled) ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
        } catch { /* ignore */ }
      }
    };

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getCoords = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = overlayRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;
      const clientX =
        "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY =
        "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    [canvasWidth, canvasHeight]
  );

  const takeSnapshot = useCallback(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    historyRef.current.push(canvas.toDataURL());
    if (historyRef.current.length > 50) historyRef.current.shift();
    setCanUndo(true);
  }, []);

  const undo = useCallback(() => {
    const canvas = mainRef.current;
    if (!canvas || historyRef.current.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const prev = historyRef.current.pop()!;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = prev;
    setCanUndo(historyRef.current.length > 0);
  }, []);

  const clear = useCallback(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    takeSnapshot();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    if (backgroundSrc) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      img.src = backgroundSrc;
    }
  }, [takeSnapshot, backgroundSrc, canvasWidth, canvasHeight]);

  const applyCtxStyle = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = tool === "eraser" ? "#1a1a2e" : color;
      ctx.lineWidth = tool === "eraser" ? lineWidth * 4 : lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    },
    [tool, color, lineWidth]
  );

  const onDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const pt = getCoords(e);
      takeSnapshot();
      isDrawing.current = true;
      startPt.current = pt;

      if (tool === "pen" || tool === "eraser") {
        const ctx = mainRef.current?.getContext("2d");
        if (!ctx) return;
        applyCtxStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
      }
    },
    [getCoords, takeSnapshot, tool, applyCtxStyle]
  );

  const onMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current) return;
      const pt = getCoords(e);
      const start = startPt.current;
      if (!start) return;

      if (tool === "pen" || tool === "eraser") {
        const ctx = mainRef.current?.getContext("2d");
        if (!ctx) return;
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      } else {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const ctx = overlay.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        applyCtxStyle(ctx);
        ctx.beginPath();

        switch (tool) {
          case "rect":
            ctx.strokeRect(start.x, start.y, pt.x - start.x, pt.y - start.y);
            break;
          case "circle": {
            const rx = (pt.x - start.x) / 2;
            const ry = (pt.y - start.y) / 2;
            ctx.ellipse(start.x + rx, start.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
            ctx.stroke();
            break;
          }
          case "line":
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
            break;
          case "arrow":
            drawArrow(ctx, start.x, start.y, pt.x, pt.y, lineWidth);
            break;
        }
      }
    },
    [getCoords, tool, applyCtxStyle, canvasWidth, canvasHeight, lineWidth]
  );

  const onUp = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      const pt = getCoords(e);
      const start = startPt.current;
      startPt.current = null;

      if ((tool === "rect" || tool === "circle" || tool === "line" || tool === "arrow") && start) {
        const main = mainRef.current;
        const overlay = overlayRef.current;
        if (!main || !overlay) return;
        const mainCtx = main.getContext("2d");
        const overlayCtx = overlay.getContext("2d");
        if (!mainCtx || !overlayCtx) return;

        applyCtxStyle(mainCtx);
        mainCtx.beginPath();
        switch (tool) {
          case "rect":
            mainCtx.strokeRect(start.x, start.y, pt.x - start.x, pt.y - start.y);
            break;
          case "circle": {
            const rx = (pt.x - start.x) / 2;
            const ry = (pt.y - start.y) / 2;
            mainCtx.ellipse(start.x + rx, start.y + ry, Math.abs(rx), Math.abs(ry), 0, 0, 2 * Math.PI);
            mainCtx.stroke();
            break;
          }
          case "line":
            mainCtx.moveTo(start.x, start.y);
            mainCtx.lineTo(pt.x, pt.y);
            mainCtx.stroke();
            break;
          case "arrow":
            drawArrow(mainCtx, start.x, start.y, pt.x, pt.y, lineWidth);
            break;
        }
        overlayCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      }
    },
    [getCoords, tool, applyCtxStyle, canvasWidth, canvasHeight, lineWidth]
  );

  const handleSave = useCallback(() => {
    const canvas = mainRef.current;
    if (!canvas) return;
    onSave?.(canvas.toDataURL("image/png"));
  }, [onSave]);

  const tools: { id: DrawTool; Icon: React.ElementType; label: string }[] = [
    { id: "pen", Icon: Pencil, label: "Pen" },
    { id: "eraser", Icon: Eraser, label: "Eraser" },
    { id: "rect", Icon: Square, label: "Rectangle" },
    { id: "circle", Icon: Circle, label: "Circle" },
    { id: "line", Icon: LineIcon, label: "Line" },
    { id: "arrow", Icon: ArrowRight, label: "Arrow" },
  ];

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2 flex-wrap bg-card/60 border border-border rounded-xl px-3 py-2">
        <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5">
          {tools.map(({ id, Icon, label }) => (
            <button
              key={id}
              title={label}
              onClick={() => setTool(id)}
              className={cn(
                "p-1.5 rounded-md transition-all",
                tool === id
                  ? "bg-white/[0.08]/20 text-white/65"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border" />

        <div className="flex items-center gap-1 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => { setTool((t) => t === "eraser" ? "pen" : t); setColor(c); }}
              className={cn(
                "w-5 h-5 rounded-full transition-all border-2",
                c === color && tool !== "eraser"
                  ? "border-white/80 scale-125"
                  : "border-transparent hover:scale-110"
              )}
              style={{ backgroundColor: c, outline: c === "#ffffff" ? "1px solid #aaa" : undefined }}
            />
          ))}
        </div>

        <div className="w-px h-5 bg-border" />

        <div className="flex items-center gap-1">
          {LINE_WIDTHS.map((w) => (
            <button
              key={w}
              title={`${w}px`}
              onClick={() => setLineWidth(w)}
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                lineWidth === w
                  ? "bg-white/[0.08]/20 text-white/65"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <div className="rounded-full bg-current" style={{ width: w + 4, height: Math.min(w, 8) }} />
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-all"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={clear}
          title="Clear canvas"
          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {onSave && (
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-2.5 py-1 bg-white/[0.10] hover:bg-white/[0.16] border border-white/[0.12] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Check className="h-3 w-3" />
            Save
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-2.5 py-1 bg-muted hover:bg-muted/70 text-muted-foreground text-xs font-semibold rounded-lg transition-colors"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        )}
      </div>

      <div
        className="relative w-full rounded-xl overflow-hidden border border-border"
        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
      >
        <canvas ref={mainRef} width={canvasWidth} height={canvasHeight} className="absolute inset-0 w-full h-full" />
        <canvas
          ref={overlayRef}
          width={canvasWidth}
          height={canvasHeight}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        />
      </div>
    </div>
  );
}

// ── DrawingModal ──────────────────────────────────────────────────────────
interface DrawingModalProps {
  imageSrc: string;
  onSave: (mergedDataUrl: string) => void;
  onClose: () => void;
}

function DrawingModal({ imageSrc, onSave, onClose }: DrawingModalProps) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const maxW = window.innerWidth * 0.9;
      const maxH = window.innerHeight * 0.75;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setDims({
        w: Math.round(img.naturalWidth * scale),
        h: Math.round(img.naturalHeight * scale),
      });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const modal = (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 max-w-[95vw] max-h-[95vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Draw on Image</h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        {dims ? (
          <DrawingCanvas backgroundSrc={imageSrc} canvasWidth={dims.w} canvasHeight={dims.h} onSave={onSave} onCancel={onClose} />
        ) : (
          <div className="flex items-center justify-center w-64 h-40 text-muted-foreground text-sm">Loading…</div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

// ── FigureExtension ───────────────────────────────────────────────────────
const FigureExtension = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      caption: { default: "" },
      width: { default: "100%" },
      align: { default: "center" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-figure]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            src: e.getAttribute("data-src") || "",
            caption: e.getAttribute("data-caption") || "",
            width: e.getAttribute("data-width") || "100%",
            align: e.getAttribute("data-align") || "center",
          };
        },
      },
      {
        tag: "img[src]:not([data-drawing])",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            src: e.getAttribute("src") || "",
            caption: e.getAttribute("alt") || "",
            width: e.getAttribute("width") || e.style.width || "100%",
            align: e.getAttribute("data-align") || "center",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const align = HTMLAttributes.align || "center";
    const floatStyle = align === "center" ? "" : `float: ${align};`;
    const marginStyle =
      align === "left"
        ? "margin: 0.5rem 1.5rem 0.5rem 0;"
        : align === "right"
        ? "margin: 0.5rem 0 0.5rem 1.5rem;"
        : "margin: 0.5rem auto;";
    const displayStyle = "display: block;";

    return [
      "figure",
      mergeAttributes(
        { "data-figure": "true" },
        {
          "data-src": HTMLAttributes.src,
          "data-caption": HTMLAttributes.caption,
          "data-width": HTMLAttributes.width,
          "data-align": align,
          style: `width: ${HTMLAttributes.width || "100%"}; max-width: 100%; ${floatStyle} ${marginStyle} ${displayStyle}`,
        }
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});

// ── FigureView ────────────────────────────────────────────────────────────
function FigureView({ node, updateAttributes, selected, deleteNode }: ReactNodeViewProps) {
  const [showDraw, setShowDraw] = useState(false);
  const attrs = node.attrs as { src: string; caption: string; width: string; align?: string };
  const align = attrs.align || "center";
  const wrapperRef = useRef<HTMLElement>(null);

  // Fix: TipTap wraps NodeViewWrapper in <div class="react-renderer">.
  // Float on the inner figure won't cause text-wrapping — we must float the OUTER div.
  useLayoutEffect(() => {
    const inner = wrapperRef.current;
    if (!inner) return;
    const outer = inner.parentElement;
    if (!outer) return;

    const w = attrs.width || "100%";
    if (align === "center") {
      outer.style.float = "";
      outer.style.width = w;             // keep existing width — don't reset to 100%
      outer.style.margin = "0.75rem auto";
      outer.style.clear = "both";
      outer.style.display = "block";
    } else {
      outer.style.float = align;
      outer.style.width = w;
      outer.style.maxWidth = "100%";
      outer.style.margin = align === "left" ? "0.5rem 1.5rem 0.5rem 0" : "0.5rem 0 0.5rem 1.5rem";
      outer.style.clear = "";
      outer.style.display = "block";
    }
  }, [align, attrs.width]);

  const handleResizeStart = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    const outerDiv = wrapperRef.current?.parentElement;
    if (!outerDiv) return;

    const startX = e.clientX;
    const startWidthPx = outerDiv.getBoundingClientRect().width;

    // Use the ProseMirror container to get the full available width for % calc
    const proseMirrorEl = outerDiv.closest(".ProseMirror");
    const containerWidth = Math.max(
      proseMirrorEl?.getBoundingClientRect().width ?? startWidthPx,
      100
    );

    // Apply a grabbing cursor on the document during resize
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = corner.includes("right") !== corner.includes("top")
      ? "nesw-resize" : "nwse-resize";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const isRight = corner.includes("right");
      const deltaX = isRight ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const newWidthPx = Math.max(80, startWidthPx + deltaX);
      const pct = Math.max(10, Math.min(100, (newWidthPx / containerWidth) * 100));
      // Update DOM directly — zero React re-renders during drag = zero glitch
      outerDiv.style.width = `${pct}%`;
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = prevCursor;

      // Persist the final width to TipTap state exactly once
      const isRight = corner.includes("right");
      const deltaX = isRight ? upEvent.clientX - startX : startX - upEvent.clientX;
      const newWidthPx = Math.max(80, startWidthPx + deltaX);
      const finalPct = Math.max(10, Math.min(100, Math.round((newWidthPx / containerWidth) * 100)));
      updateAttributes({ width: `${finalPct}%` });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef as any}
      as="figure"
      className="my-0 group relative block"
      style={{ width: "100%" }}
    >
      <div className="relative rounded-xl overflow-hidden" style={{ width: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attrs.src}
          alt={attrs.caption}
          className="w-full h-auto block rounded-xl"
          draggable={false}
        />
        {selected && (
          <div className="absolute inset-0 ring-2 ring-emerald-500 ring-offset-1 rounded-xl pointer-events-none" />
        )}

        {selected && (
          <>
            <div className="absolute top-1.5 left-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nwse-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "top-left")} />
            <div className="absolute top-1.5 right-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nesw-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "top-right")} />
            <div className="absolute bottom-1.5 left-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nesw-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "bottom-left")} />
            <div className="absolute bottom-1.5 right-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nwse-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "bottom-right")} />
          </>
        )}

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end gap-2 p-2 bg-gradient-to-t from-black/40 to-transparent pointer-events-none flex-wrap">
          <div className="flex items-center gap-0.5 bg-black/60 rounded-lg p-0.5 pointer-events-auto">
            <button
              contentEditable={false}
              title="Align Left"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ align: "left" }); }}
              className={cn("p-1 rounded transition-colors", align === "left" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              contentEditable={false}
              title="Align Center"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ align: "center" }); }}
              className={cn("p-1 rounded transition-colors", align === "center" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              contentEditable={false}
              title="Align Right"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ align: "right" }); }}
              className={cn("p-1 rounded transition-colors", align === "right" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            contentEditable={false}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowDraw(true); }}
            className="flex items-center gap-1 bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors pointer-events-auto"
          >
            <Pencil className="h-3 w-3" />
            Draw
          </button>
          <button
            contentEditable={false}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); }}
            className="flex items-center gap-1 bg-red-500/70 hover:bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors pointer-events-auto"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <figcaption className="mt-1.5">
        <input
          contentEditable={false}
          value={attrs.caption}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          onMouseDown={(ev) => ev.stopPropagation()}
          onKeyDown={(ev) => ev.stopPropagation()}
          placeholder="Add a caption…"
          className="w-full text-center text-[13px] text-muted-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/30 py-0.5"
        />
      </figcaption>

      {showDraw && (
        <DrawingModal
          imageSrc={attrs.src}
          onSave={(merged) => { updateAttributes({ src: merged }); setShowDraw(false); }}
          onClose={() => setShowDraw(false)}
        />
      )}
    </NodeViewWrapper>
  );
}

// ── DrawingExtension ──────────────────────────────────────────────────────
const DrawingExtension = Node.create({
  name: "drawing",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      data: { default: "" },
      canvasWidth: { default: 800 },
      canvasHeight: { default: 400 },
      width: { default: "100%" },
      align: { default: "center" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[data-drawing]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            data: e.getAttribute("src") || "",
            canvasWidth: parseInt(e.getAttribute("data-w") || "800", 10),
            canvasHeight: parseInt(e.getAttribute("data-h") || "400", 10),
            width: e.getAttribute("data-width") || "100%",
            align: e.getAttribute("data-align") || "center",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const align = HTMLAttributes.align || "center";
    const floatStyle = align === "center" ? "" : `float: ${align};`;
    const marginStyle =
      align === "left"
        ? "margin: 0.5rem 1.5rem 0.5rem 0;"
        : align === "right"
        ? "margin: 0.5rem 0 0.5rem 1.5rem;"
        : "margin: 0.5rem auto;";

    return [
      "img",
      mergeAttributes({
        "data-drawing": "true",
        src: HTMLAttributes.data || "",
        "data-w": HTMLAttributes.canvasWidth,
        "data-h": HTMLAttributes.canvasHeight,
        "data-width": HTMLAttributes.width,
        "data-align": align,
        style: `border-radius:8px;max-width:100%;width:${HTMLAttributes.width || "100%"};display:block;${floatStyle} ${marginStyle} border: 1px solid var(--border);`,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingView);
  },
});

// ── DrawingView ───────────────────────────────────────────────────────────
function DrawingView({ node, updateAttributes, selected, deleteNode }: ReactNodeViewProps) {
  const [editing, setEditing] = useState(false);
  const attrs = node.attrs as {
    data: string;
    canvasWidth: number;
    canvasHeight: number;
    width: string;
    align?: string;
  };
  const align = attrs.align || "center";
  const wrapperRef = useRef<HTMLElement>(null);

  // Fix: apply float to the outer react-renderer div so text flows beside the drawing
  useLayoutEffect(() => {
    const inner = wrapperRef.current;
    if (!inner) return;
    const outer = inner.parentElement;
    if (!outer) return;

    const w = attrs.width || "100%";
    if (align === "center") {
      outer.style.float = "";
      outer.style.width = w;
      outer.style.margin = "0.75rem auto";
      outer.style.clear = "both";
      outer.style.display = "block";
    } else {
      outer.style.float = align;
      outer.style.width = w;
      outer.style.maxWidth = "100%";
      outer.style.margin = align === "left" ? "0.5rem 1.5rem 0.5rem 0" : "0.5rem 0 0.5rem 1.5rem";
      outer.style.clear = "";
      outer.style.display = "block";
    }
  }, [align, attrs.width]);

  const handleResizeStart = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();

    const outerDiv = wrapperRef.current?.parentElement;
    if (!outerDiv) return;

    const startX = e.clientX;
    const startWidthPx = outerDiv.getBoundingClientRect().width;

    const proseMirrorEl = outerDiv.closest(".ProseMirror");
    const containerWidth = Math.max(
      proseMirrorEl?.getBoundingClientRect().width ?? startWidthPx,
      100
    );

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = corner.includes("right") !== corner.includes("top")
      ? "nesw-resize" : "nwse-resize";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const isRight = corner.includes("right");
      const deltaX = isRight ? moveEvent.clientX - startX : startX - moveEvent.clientX;
      const newWidthPx = Math.max(80, startWidthPx + deltaX);
      const pct = Math.max(10, Math.min(100, (newWidthPx / containerWidth) * 100));
      outerDiv.style.width = `${pct}%`;
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = prevCursor;

      const isRight = corner.includes("right");
      const deltaX = isRight ? upEvent.clientX - startX : startX - upEvent.clientX;
      const newWidthPx = Math.max(80, startWidthPx + deltaX);
      const finalPct = Math.max(10, Math.min(100, Math.round((newWidthPx / containerWidth) * 100)));
      updateAttributes({ width: `${finalPct}%` });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef as any}
      className="my-0 group relative block"
      style={{ width: "100%" }}
    >
      {!editing ? (
        <div className="relative rounded-xl overflow-hidden border border-border" style={{ width: "100%" }}>
          {attrs.data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attrs.data} alt="drawing" className="w-full h-auto block rounded-xl" draggable={false} />
          ) : (
            <div className="w-full flex items-center justify-center bg-muted/30 rounded-xl text-muted-foreground text-sm" style={{ minHeight: 120 }}>
              <PenLine className="h-5 w-5 mr-2 opacity-40" />
              Empty drawing
            </div>
          )}
          {selected && (
            <div className="absolute inset-0 ring-2 ring-emerald-500 ring-offset-1 rounded-xl pointer-events-none" />
          )}

          {selected && (
            <>
              <div className="absolute top-1.5 left-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nwse-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "top-left")} />
              <div className="absolute top-1.5 right-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nesw-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "top-right")} />
              <div className="absolute bottom-1.5 left-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nesw-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "bottom-left")} />
              <div className="absolute bottom-1.5 right-1.5 w-3 h-3 bg-white border-2 border-emerald-500 rounded-full cursor-nwse-resize z-20 shadow-md hover:scale-110 transition-transform" onMouseDown={(e) => handleResizeStart(e, "bottom-right")} />
            </>
          )}

          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end gap-2 p-2 bg-gradient-to-t from-black/40 to-transparent pointer-events-none flex-wrap">
            <div className="flex items-center gap-0.5 bg-black/60 rounded-lg p-0.5 pointer-events-auto">
              <button contentEditable={false} title="Align Left" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ align: "left" }); }} className={cn("p-1 rounded transition-colors", align === "left" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}>
                <AlignLeft className="h-3.5 w-3.5" />
              </button>
              <button contentEditable={false} title="Align Center" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ align: "center" }); }} className={cn("p-1 rounded transition-colors", align === "center" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}>
                <AlignCenter className="h-3.5 w-3.5" />
              </button>
              <button contentEditable={false} title="Align Right" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); updateAttributes({ align: "right" }); }} className={cn("p-1 rounded transition-colors", align === "right" ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")}>
                <AlignRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <button contentEditable={false} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }} className="flex items-center gap-1 bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors pointer-events-auto">
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button contentEditable={false} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); deleteNode(); }} className="flex items-center gap-1 bg-red-500/70 hover:bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors pointer-events-auto">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : (
        <div onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <DrawingCanvas
            initialDataUrl={attrs.data || undefined}
            canvasWidth={attrs.canvasWidth}
            canvasHeight={attrs.canvasHeight}
            onSave={(dataUrl) => { updateAttributes({ data: dataUrl }); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

// ── DragHandleExtension ───────────────────────────────────────────────────
// Adds a floating drag handle to the left of each block on hover.
// On drag, it selects the block node and lets ProseMirror's built-in
// drag-drop handle the reordering.
const DragHandleExtension = Extension.create({
  name: "dragHandle",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("dragHandle"),
      view(editorView) {
        const handle = document.createElement("div");
        handle.className = "notion-block-drag-handle";
        handle.draggable = true;
        handle.title = "Drag to reorder";
        handle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
          <circle cx="3" cy="2.5" r="1.25"/><circle cx="7" cy="2.5" r="1.25"/>
          <circle cx="3" cy="7" r="1.25"/><circle cx="7" cy="7" r="1.25"/>
          <circle cx="3" cy="11.5" r="1.25"/><circle cx="7" cy="11.5" r="1.25"/>
        </svg>`;
        document.body.appendChild(handle);

        let dragPos = -1;
        let animFrame = 0;
        let isHandleHovered = false;

        const showHandle = (editorRect: DOMRect, blockDom: HTMLElement) => {
          const rect = blockDom.getBoundingClientRect();
          handle.style.opacity = "1";
          handle.style.pointerEvents = "auto";
          handle.style.left = `${editorRect.left - 26}px`;
          handle.style.top = `${rect.top + rect.height / 2 - 10}px`;
        };

        const hideHandle = () => {
          handle.style.opacity = "0";
          handle.style.pointerEvents = "none";
        };

        const onMouseMove = (e: MouseEvent) => {
          cancelAnimationFrame(animFrame);
          animFrame = requestAnimationFrame(() => {
            if (!editorView.dom.isConnected) return;

            const editorRect = editorView.dom.getBoundingClientRect();

            // Extend hover zone left by 40px so handle stays visible while hovering it
            if (
              e.clientX < editorRect.left - 40 ||
              e.clientX > editorRect.right + 10 ||
              e.clientY < editorRect.top - 10 ||
              e.clientY > editorRect.bottom + 10
            ) {
              if (!isHandleHovered) hideHandle();
              return;
            }

            // Clamp x inside editor so posAtCoords works
            const clampedX = Math.max(editorRect.left + 4, Math.min(editorRect.right - 4, e.clientX));
            const result = editorView.posAtCoords({ left: clampedX, top: e.clientY });

            // Helper: try to resolve a doc position to a top-level block offset
            const tryBlockAt = (pos: number): number => {
              try {
                let $p = editorView.state.doc.resolve(
                  Math.max(0, Math.min(pos, editorView.state.doc.content.size - 1))
                );
                while ($p.depth > 1) {
                  $p = editorView.state.doc.resolve($p.before($p.depth));
                }
                return $p.depth === 1 ? $p.before(1) : -1;
              } catch (_e) { return -1; }
            };

            let foundBlock = -1;

            if (result) {
              // Standard text nodes: resolve directly
              foundBlock = tryBlockAt(result.pos);

              // Atom nodes (figure, drawing): posAtCoords returns a boundary
              // position that resolves to depth-0. Try adjacent positions.
              if (foundBlock < 0 && result.pos > 0) {
                foundBlock = tryBlockAt(result.pos - 1);
              }
              if (foundBlock < 0) {
                foundBlock = tryBlockAt(result.pos + 1);
              }
            }

            // Final fallback: scan all top-level blocks by their DOM rect.
            // This reliably handles floated atom nodes (images, drawings) whose
            // DOM position doesn't correspond 1-to-1 with the posAtCoords result.
            if (foundBlock < 0) {
              editorView.state.doc.forEach((_node, offset) => {
                if (foundBlock >= 0) return false;
                const dom = editorView.nodeDOM(offset);
                if (dom instanceof HTMLElement) {
                  const r = dom.getBoundingClientRect();
                  if (r.top - 6 <= e.clientY && r.bottom + 6 >= e.clientY) {
                    foundBlock = offset;
                  }
                }
              });
            }

            if (foundBlock < 0) {
              if (!isHandleHovered) hideHandle();
              return;
            }

            dragPos = foundBlock;
            const blockDom = editorView.nodeDOM(foundBlock);
            if (blockDom instanceof HTMLElement) {
              showHandle(editorRect, blockDom);
            } else {
              if (!isHandleHovered) hideHandle();
            }
          });
        };

        handle.addEventListener("mouseenter", () => { isHandleHovered = true; });
        handle.addEventListener("mouseleave", () => { isHandleHovered = false; });

        // mousedown: select the block node BEFORE dragstart fires.
        // This must happen first so ProseMirror knows the source when it
        // processes the drop (it calls tr.deleteSelection() to remove the origin).
        handle.addEventListener("mousedown", () => {
          if (dragPos < 0) return;
          try {
            const sel = NodeSelection.create(editorView.state.doc, dragPos);
            editorView.dispatch(editorView.state.tr.setSelection(sel));
          } catch { /* position may be invalid */ }
        });

        handle.addEventListener("dragstart", function(e) {
          if (dragPos < 0 || !e.dataTransfer) return;
          try {
            const node = editorView.state.doc.nodeAt(dragPos);
            if (!node) return;

            // Build slice without a second dispatch (avoids React re-render during dragstart)
            const slice = new Slice(Fragment.from(node), 0, 0);

            // dataTransfer needs non-empty content or browsers abort the drag
            const txt = node.textContent || " ";
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", txt);
            e.dataTransfer.setData("text/html", "<div>" + txt + "</div>");

            // Small labelled ghost image instead of the tiny dot handle
            const ghost = document.createElement("div");
            const n = node.type.name;
            let label = "Block";
            if (n === "paragraph") { label = "Paragraph"; }
            else if (n === "heading") { label = "Heading"; }
            else if (n === "bulletList") { label = "Bullet list"; }
            else if (n === "orderedList") { label = "Numbered list"; }
            else if (n === "blockquote") { label = "Quote"; }
            else if (n === "codeBlock") { label = "Code"; }
            else if (n === "figure") { label = "Image"; }
            else if (n === "drawing") { label = "Drawing"; }
            ghost.textContent = label;
            ghost.style.position = "fixed";
            ghost.style.top = "-9999px";
            ghost.style.left = "-9999px";
            ghost.style.padding = "4px 10px";
            ghost.style.borderRadius = "6px";
            ghost.style.background = "rgba(30,30,40,0.9)";
            ghost.style.border = "1px solid rgba(255,255,255,0.15)";
            ghost.style.color = "rgba(255,255,255,0.85)";
            ghost.style.fontSize = "12px";
            ghost.style.fontWeight = "500";
            ghost.style.pointerEvents = "none";
            ghost.style.whiteSpace = "nowrap";
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, -12, -8);
            setTimeout(function() { ghost.remove(); }, 0);

            (editorView as any).dragging = { slice: slice, move: true };
            handle.style.cursor = "grabbing";
          } catch (err) { /* ignore */ }
        });

        handle.addEventListener("dragend", () => {
          (editorView as any).dragging = null;
          handle.style.cursor = "grab";
          hideHandle();
        });

        window.addEventListener("mousemove", onMouseMove);

        return {
          destroy() {
            window.removeEventListener("mousemove", onMouseMove);
            cancelAnimationFrame(animFrame);
            handle.remove();
          },
        };
      },
    })];
  },
});

// ── EditorToolbar ─────────────────────────────────────────────────────────
type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

interface EditorToolbarProps {
  editor: EditorInstance;
  onImageUpload: () => void;
  onInsertDrawing: () => void;
}

function EditorToolbar({ editor, onImageUpload, onInsertDrawing }: EditorToolbarProps) {
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const applyLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkMode(false);
    setLinkUrl("");
  };

  return (
    <div className="sticky top-0 z-10 flex items-center gap-0.5 flex-wrap bg-background/95 backdrop-blur border-b border-border px-1 py-1.5 mb-4 -mx-1 rounded-t-lg">
      {linkMode ? (
        <div className="flex items-center gap-2 px-2 w-full">
          <input
            autoFocus
            type="url"
            placeholder="Paste URL…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") { setLinkMode(false); setLinkUrl(""); }
            }}
            className="flex-1 text-xs bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 outline-none text-foreground placeholder:text-muted-foreground"
          />
          <button onMouseDown={(e) => { e.preventDefault(); applyLink(); }} className="text-xs text-white/65 font-semibold hover:text-white/70">Apply</button>
          <button onMouseDown={(e) => { e.preventDefault(); setLinkMode(false); setLinkUrl(""); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      ) : (
        <>
          <TBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon className="h-3.5 w-3.5" /></TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1"><Heading1 className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3"><Heading3 className="h-3.5 w-3.5" /></TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote"><Quote className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block"><Code className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Minus className="h-3.5 w-3.5" /></TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn
            active={editor.isActive("link")}
            onClick={() => { const existing = editor.getAttributes("link").href ?? ""; setLinkUrl(existing); setLinkMode(true); }}
            title="Link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn active={false} onClick={onImageUpload} title="Upload image"><ImageIcon className="h-3.5 w-3.5" /></TBtn>
          <TBtn active={false} onClick={onInsertDrawing} title="Insert drawing canvas"><PenLine className="h-3.5 w-3.5" /></TBtn>
        </>
      )}
    </div>
  );
}

function TBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        "p-1.5 rounded-md transition-all",
        active
          ? "bg-white/[0.08]/20 text-white/65"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ── InsertConflictModal ───────────────────────────────────────────────────
type InsertPlacement = "replace" | "above" | "below";

interface InsertConflictModalProps {
  mediaType: "image" | "drawing";
  onChoose: (placement: InsertPlacement) => void;
  onCancel: () => void;
}

function InsertConflictModal({ mediaType, onChoose, onCancel }: InsertConflictModalProps) {
  const label = mediaType === "image" ? "image" : "drawing";
  const modal = (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 w-80">
        <h3 className="text-sm font-semibold text-foreground mb-1">Insert {label}</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          A {label === "image" ? "image or drawing" : "drawing or image"} is already selected. Where would you like to place the new {label}?
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => onChoose("above")} className="w-full text-left px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted text-sm font-medium text-foreground transition-colors">Add above selected</button>
          <button onClick={() => onChoose("below")} className="w-full text-left px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted text-sm font-medium text-foreground transition-colors">Add below selected</button>
          <button onClick={() => onChoose("replace")} className="w-full text-left px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-sm font-medium text-red-400 transition-colors">Replace selected</button>
          <button onClick={onCancel} className="w-full text-center px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mt-1">Cancel — I&apos;ll reposition and try again</button>
        </div>
      </div>
    </div>
  );
  return ReactDOM.createPortal(modal, document.body);
}

// ── SlashMenu ─────────────────────────────────────────────────────────────
// Notion-like / command menu: type "/" at the start of a paragraph to insert block types.

interface SlashMenuState {
  query: string;
  from: number; // position of the "/" character in the doc
  x: number;
  y: number;
}

type SlashCallbacks = {
  onImageUpload: () => void;
  onInsertDrawing: () => void;
};

type SlashItem = {
  label: string;
  description: string;
  Icon: React.ElementType;
  keywords: string[];
  action: (editor: EditorInstance, cbs: SlashCallbacks) => void;
};

const SLASH_ITEMS: SlashItem[] = [
  // ── Text blocks ──────────────────────────────────────────────────────────
  { label: "Text", description: "Plain paragraph block", Icon: AlignLeft, keywords: ["text", "paragraph", "plain", "p", "normal"], action: (e) => e.chain().focus().setParagraph().run() },
  { label: "Heading 1", description: "Large section heading", Icon: Heading1, keywords: ["h1", "heading", "title", "large", "big"], action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: "Heading 2", description: "Medium section heading", Icon: Heading2, keywords: ["h2", "heading", "subtitle", "medium", "section"], action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Heading 3", description: "Small section heading", Icon: Heading3, keywords: ["h3", "heading", "small", "sub", "subsection"], action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  // ── Lists ────────────────────────────────────────────────────────────────
  { label: "Bullet List", description: "Unordered list with dots", Icon: List, keywords: ["bullet", "list", "ul", "unordered", "dot", "item", "dash", "-"], action: (e) => e.chain().focus().toggleBulletList().run() },
  { label: "Numbered List", description: "Ordered numbered list", Icon: ListOrdered, keywords: ["numbered", "ordered", "ol", "list", "1.", "number", "enum"], action: (e) => e.chain().focus().toggleOrderedList().run() },
  // ── Content blocks ───────────────────────────────────────────────────────
  { label: "Blockquote", description: "Highlight a quote or insight", Icon: Quote, keywords: ["quote", "blockquote", "callout", "highlight", "insight", "note"], action: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: "Code", description: "Monospace code block", Icon: Code, keywords: ["code", "snippet", "monospace", "pre", "terminal", "bash", "script", "function"], action: (e) => e.chain().focus().toggleCodeBlock().run() },
  { label: "Bold Text", description: "Insert bold formatted text", Icon: Bold, keywords: ["bold", "strong", "emphasis", "b", "fat"], action: (e) => { e.chain().focus().toggleBold().run(); } },
  { label: "Italic Text", description: "Insert italic formatted text", Icon: Italic, keywords: ["italic", "em", "emphasis", "slant", "i"], action: (e) => { e.chain().focus().toggleItalic().run(); } },
  // ── Structure ────────────────────────────────────────────────────────────
  { label: "Divider", description: "Horizontal separator line", Icon: Minus, keywords: ["divider", "separator", "hr", "line", "rule", "break", "section", "---"], action: (e) => e.chain().focus().setHorizontalRule().run() },
  // ── Media ────────────────────────────────────────────────────────────────
  { label: "Image", description: "Upload a photo or screenshot", Icon: ImageIcon, keywords: ["image", "photo", "picture", "upload", "img", "screenshot", "chart", "graph", "file"], action: (_e, cbs) => cbs.onImageUpload() },
  { label: "Drawing", description: "Insert a freehand drawing canvas", Icon: PenLine, keywords: ["draw", "drawing", "sketch", "canvas", "pen", "freehand", "annotate", "paint"], action: (_e, cbs) => cbs.onInsertDrawing() },
];

function SlashMenu({
  state,
  editor,
  onClose,
  onImageUpload,
  onInsertDrawing,
}: {
  state: SlashMenuState;
  editor: EditorInstance;
  onClose: () => void;
  onImageUpload: () => void;
  onInsertDrawing: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = state.query.toLowerCase().trim();
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.includes(q))
    );
  }, [state.query]);

  // Reset active when filter changes
  useEffect(() => { setActiveIndex(0); }, [state.query]);

  const callbacks: SlashCallbacks = useMemo(
    () => ({ onImageUpload, onInsertDrawing }),
    [onImageUpload, onInsertDrawing]
  );

  const applyItem = useCallback(
    (item: SlashItem) => {
      onClose();
      const cursorPos = editor.state.selection.from;
      editor.chain().focus().deleteRange({ from: state.from, to: cursorPos }).run();
      setTimeout(() => { item.action(editor, callbacks); }, 0);
    },
    [editor, state.from, onClose, callbacks]
  );

  // Keyboard navigation — capture phase so we intercept before TipTap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && filtered.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        applyItem(filtered[activeIndex]);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [filtered, activeIndex, applyItem, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const el = menu.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (filtered.length === 0) return null;

  // Clamp position to viewport
  const menuW = 240;
  const x = Math.min(state.x, window.innerWidth - menuW - 8);
  const y = state.y + 6;

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {filtered.map((item, i) => (
        <button
          key={item.label}
          className={cn("slash-command-item", i === activeIndex && "slash-command-item--active")}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={() => applyItem(item)}
        >
          <span className="slash-command-icon">
            <item.Icon className="h-3.5 w-3.5" />
          </span>
          <span className="slash-command-text">
            <span className="slash-command-label">{item.label}</span>
            <span className="slash-command-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>,
    document.body
  );
}

// ── RichEditor ────────────────────────────────────────────────────────────
interface RichEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function RichEditor({ content, onChange }: RichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [conflictModal, setConflictModal] = useState<{
    mediaType: "image" | "drawing";
    from: number;
    to: number;
  } | null>(null);

  const pendingPlacementRef = useRef<{
    placement: InsertPlacement;
    from: number;
    to: number;
  } | null>(null);

  // Slash command state
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      FigureExtension,
      DrawingExtension,
      DragHandleExtension,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Heading";
          return "Write something, or type '/' for commands…";
        },
        showOnlyCurrent: true,
      }),
    ],
    content,
    editable: true,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());

      // Slash command detection: show menu when paragraph starts with /
      const { state } = e;
      const { $from, from } = state.selection;

      if ($from.parent.type.name === "paragraph") {
        const text = $from.parent.textContent;
        const offset = $from.parentOffset;
        const textBeforeCursor = text.slice(0, offset);

        // Only trigger if the text up to cursor is "/" optionally followed by letters/spaces
        if (textBeforeCursor.length > 0 && /^\/[a-zA-Z0-9 ]*$/.test(textBeforeCursor)) {
          try {
            const coords = e.view.coordsAtPos(from);
            const blockStart = from - offset; // position before the "/" character
            setSlashMenu({
              query: textBeforeCursor.slice(1), // everything after the /
              from: blockStart,
              x: coords.left,
              y: coords.bottom,
            });
            return;
          } catch {
            // coordsAtPos can fail during rapid updates
          }
        }
      }
      setSlashMenu(null);
    },
  });

  // ── Conflict detection helper ─────────────────────────────────────────
  const getConflict = useCallback(
    (mediaType: "image" | "drawing") => {
      if (!editor) return null;
      const { selection } = editor.state;
      if (
        selection instanceof NodeSelection &&
        (selection.node.type.name === "figure" || selection.node.type.name === "drawing")
      ) {
        return { mediaType, from: selection.from, to: selection.to };
      }
      return null;
    },
    [editor]
  );

  // ── Node insertion ─────────────────────────────────────────────────────
  const doInsertNode = useCallback(
    (nodeDesc: Record<string, unknown>, placement: InsertPlacement, from: number, to: number) => {
      if (!editor) return;
      if (placement === "replace") {
        editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, nodeDesc).run();
      } else if (placement === "above") {
        editor.chain().focus().insertContentAt(from, nodeDesc).run();
      } else {
        editor.chain().focus().insertContentAt(to, nodeDesc).run();
      }
    },
    [editor]
  );

  // ── Image upload ──────────────────────────────────────────────────────
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        if (!src) return;
        const nodeDesc = { type: "figure", attrs: { src, caption: "" } };
        const pending = pendingPlacementRef.current;
        if (pending) {
          doInsertNode(nodeDesc, pending.placement, pending.from, pending.to);
          pendingPlacementRef.current = null;
        } else {
          editor.chain().focus().insertContent(nodeDesc).run();
        }
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [editor, doInsertNode]
  );

  const handleImageButtonClick = useCallback(() => {
    const conflict = getConflict("image");
    if (conflict) {
      setConflictModal(conflict);
    } else {
      fileInputRef.current?.click();
    }
  }, [getConflict]);

  // ── Drawing insertion ─────────────────────────────────────────────────
  const doInsertDrawing = useCallback(
    (placement?: InsertPlacement, from?: number, to?: number) => {
      if (!editor) return;
      const nodeDesc = { type: "drawing", attrs: { data: "", canvasWidth: 800, canvasHeight: 400 } };
      if (placement && from !== undefined && to !== undefined) {
        doInsertNode(nodeDesc, placement, from, to);
      } else {
        editor.chain().focus().insertContent(nodeDesc).run();
      }
    },
    [editor, doInsertNode]
  );

  const handleDrawingButtonClick = useCallback(() => {
    const conflict = getConflict("drawing");
    if (conflict) {
      setConflictModal(conflict);
    } else {
      doInsertDrawing();
    }
  }, [getConflict, doInsertDrawing]);

  // ── Conflict modal resolution ─────────────────────────────────────────
  const handleConflictChoose = useCallback(
    (placement: InsertPlacement) => {
      if (!conflictModal) return;
      const { mediaType, from, to } = conflictModal;
      setConflictModal(null);

      if (mediaType === "image") {
        pendingPlacementRef.current = { placement, from, to };
        fileInputRef.current?.click();
      } else {
        doInsertDrawing(placement, from, to);
      }
    },
    [conflictModal, doInsertDrawing]
  );

  if (!editor) return null;

  return (
    <div className="relative w-full">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {conflictModal && (
        <InsertConflictModal
          mediaType={conflictModal.mediaType}
          onChoose={handleConflictChoose}
          onCancel={() => setConflictModal(null)}
        />
      )}

      {slashMenu && (
        <SlashMenu
          state={slashMenu}
          editor={editor}
          onClose={() => setSlashMenu(null)}
          onImageUpload={handleImageButtonClick}
          onInsertDrawing={handleDrawingButtonClick}
        />
      )}

      <EditorToolbar editor={editor} onImageUpload={handleImageButtonClick} onInsertDrawing={handleDrawingButtonClick} />

      <EditorContent editor={editor} className="notion-editor focus:outline-none" />
    </div>
  );
}
