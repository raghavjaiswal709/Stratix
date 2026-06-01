"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
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
// Shared between DrawingModal (image overlay) and DrawingView (inline note block)
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

  // Initialize canvas — no initialized-guard so React 18 StrictMode's
  // double-invocation works correctly: cleanup sets cancelled=true so the
  // stale async load aborts, and the second (real) mount re-initializes fresh.
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
            ctx.strokeRect(
              start.x,
              start.y,
              pt.x - start.x,
              pt.y - start.y
            );
            break;
          case "circle": {
            const rx = (pt.x - start.x) / 2;
            const ry = (pt.y - start.y) / 2;
            ctx.ellipse(
              start.x + rx,
              start.y + ry,
              Math.abs(rx),
              Math.abs(ry),
              0,
              0,
              2 * Math.PI
            );
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

      if (
        (tool === "rect" ||
          tool === "circle" ||
          tool === "line" ||
          tool === "arrow") &&
        start
      ) {
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
            mainCtx.strokeRect(
              start.x,
              start.y,
              pt.x - start.x,
              pt.y - start.y
            );
            break;
          case "circle": {
            const rx = (pt.x - start.x) / 2;
            const ry = (pt.y - start.y) / 2;
            mainCtx.ellipse(
              start.x + rx,
              start.y + ry,
              Math.abs(rx),
              Math.abs(ry),
              0,
              0,
              2 * Math.PI
            );
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
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap bg-card/60 border border-border rounded-xl px-3 py-2">
        {/* Tools */}
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

        {/* Colors */}
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

        {/* Line widths */}
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
              <div
                className="rounded-full bg-current"
                style={{ width: w + 4, height: Math.min(w, 8) }}
              />
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Actions */}
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

      {/* ── Canvas area ── */}
      <div
        className="relative w-full rounded-xl overflow-hidden border border-border"
        style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
      >
        <canvas
          ref={mainRef}
          width={canvasWidth}
          height={canvasHeight}
          className="absolute inset-0 w-full h-full"
        />
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
// Full-screen modal for drawing on top of an image
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 max-w-[95vw] max-h-[95vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Draw on Image</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {dims ? (
          <DrawingCanvas
            backgroundSrc={imageSrc}
            canvasWidth={dims.w}
            canvasHeight={dims.h}
            onSave={onSave}
            onCancel={onClose}
          />
        ) : (
          <div className="flex items-center justify-center w-64 h-40 text-muted-foreground text-sm">
            Loading…
          </div>
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

// ── FigureExtension ───────────────────────────────────────────────────────
// Custom TipTap node for image + caption + drawing
const FigureExtension = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      caption: { default: "" },
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
          };
        },
      },
      // Also parse plain <img> tags (backward compat)
      {
        tag: "img[src]:not([data-drawing])",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            src: e.getAttribute("src") || "",
            caption: e.getAttribute("alt") || "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(
        { "data-figure": "true" },
        {
          "data-src": HTMLAttributes.src,
          "data-caption": HTMLAttributes.caption,
        }
      ),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});

// ── FigureView ────────────────────────────────────────────────────────────
function FigureView({
  node,
  updateAttributes,
  selected,
  deleteNode,
}: ReactNodeViewProps) {
  const [showDraw, setShowDraw] = useState(false);
  const attrs = node.attrs as { src: string; caption: string };

  return (
    <NodeViewWrapper as="figure" className="my-3 group relative block">
      {/* Image with hover overlay */}
      <div className="relative rounded-xl overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attrs.src}
          alt={attrs.caption}
          className="w-full h-auto block rounded-xl"
          draggable={false}
        />
        {/* Selection ring */}
        {selected && (
          <div className="absolute inset-0 ring-2 ring-white/30 ring-offset-1 rounded-xl pointer-events-none" />
        )}
        {/* Hover actions */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end gap-2 p-2">
          <button
            contentEditable={false}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowDraw(true);
            }}
            className="flex items-center gap-1 bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Draw
          </button>
          <button
            contentEditable={false}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteNode();
            }}
            className="flex items-center gap-1 bg-red-500/70 hover:bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Caption input */}
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

      {/* Draw modal */}
      {showDraw && (
        <DrawingModal
          imageSrc={attrs.src}
          onSave={(merged) => {
            updateAttributes({ src: merged });
            setShowDraw(false);
          }}
          onClose={() => setShowDraw(false)}
        />
      )}
    </NodeViewWrapper>
  );
}

// ── DrawingExtension ──────────────────────────────────────────────────────
// Standalone drawing canvas block embedded in the note
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
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes({
        "data-drawing": "true",
        src: HTMLAttributes.data || "",
        "data-w": HTMLAttributes.canvasWidth,
        "data-h": HTMLAttributes.canvasHeight,
        style: "border-radius:8px;display:block;max-width:100%",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawingView);
  },
});

// ── DrawingView ───────────────────────────────────────────────────────────
function DrawingView({
  node,
  updateAttributes,
  selected,
  deleteNode,
}: ReactNodeViewProps) {
  const [editing, setEditing] = useState(false);
  const attrs = node.attrs as {
    data: string;
    canvasWidth: number;
    canvasHeight: number;
  };

  return (
    <NodeViewWrapper className="my-3 group relative block">
      {!editing ? (
        /* Preview mode */
        <div className="relative rounded-xl overflow-hidden border border-border">
          {attrs.data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attrs.data}
              alt="drawing"
              className="w-full h-auto block rounded-xl"
              draggable={false}
            />
          ) : (
            <div
              className="w-full flex items-center justify-center bg-muted/30 rounded-xl text-muted-foreground text-sm"
              style={{ minHeight: 120 }}
            >
              <PenLine className="h-5 w-5 mr-2 opacity-40" />
              Empty drawing
            </div>
          )}
          {selected && (
            <div className="absolute inset-0 ring-2 ring-white/30 ring-offset-1 rounded-xl pointer-events-none" />
          )}
          {/* Hover actions */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end gap-2 p-2">
            <button
              contentEditable={false}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditing(true);
              }}
              className="flex items-center gap-1 bg-black/60 hover:bg-black/80 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              contentEditable={false}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteNode();
              }}
              className="flex items-center gap-1 bg-red-500/70 hover:bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : (
        /* Edit mode */
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <DrawingCanvas
            initialDataUrl={attrs.data || undefined}
            canvasWidth={attrs.canvasWidth}
            canvasHeight={attrs.canvasHeight}
            onSave={(dataUrl) => {
              updateAttributes({ data: dataUrl });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

// ── EditorToolbar ─────────────────────────────────────────────────────────
type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

interface EditorToolbarProps {
  editor: EditorInstance;
  onImageUpload: () => void;
  onInsertDrawing: () => void;
}

function EditorToolbar({
  editor,
  onImageUpload,
  onInsertDrawing,
}: EditorToolbarProps) {
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
              if (e.key === "Escape") {
                setLinkMode(false);
                setLinkUrl("");
              }
            }}
            className="flex-1 text-xs bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 outline-none text-foreground placeholder:text-muted-foreground"
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              applyLink();
            }}
            className="text-xs text-white/65 font-semibold hover:text-white/70"
          >
            Apply
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setLinkMode(false);
              setLinkUrl("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <TBtn
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn
            active={editor.isActive("heading", { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            title="Heading 1"
          >
            <Heading1 className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            title="Heading 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <List className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            <Quote className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="Code block"
          >
            <Code className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Divider"
          >
            <Minus className="h-3.5 w-3.5" />
          </TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn
            active={editor.isActive("link")}
            onClick={() => {
              const existing = editor.getAttributes("link").href ?? "";
              setLinkUrl(existing);
              setLinkMode(true);
            }}
            title="Link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </TBtn>

          <div className="w-px h-4 bg-border mx-0.5" />

          <TBtn active={false} onClick={onImageUpload} title="Upload image">
            <ImageIcon className="h-3.5 w-3.5" />
          </TBtn>
          <TBtn
            active={false}
            onClick={onInsertDrawing}
            title="Insert drawing canvas"
          >
            <PenLine className="h-3.5 w-3.5" />
          </TBtn>
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
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
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
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Insert {label}
        </h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          A selected {label === "image" ? "image or drawing" : "drawing or image"} is already selected.
          Where would you like to place the new {label}?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onChoose("above")}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted text-sm font-medium text-foreground transition-colors"
          >
            Add above selected
          </button>
          <button
            onClick={() => onChoose("below")}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted text-sm font-medium text-foreground transition-colors"
          >
            Add below selected
          </button>
          <button
            onClick={() => onChoose("replace")}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-sm font-medium text-red-400 transition-colors"
          >
            Replace selected
          </button>
          <button
            onClick={onCancel}
            className="w-full text-center px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors mt-1"
          >
            Cancel — I&apos;ll reposition and try again
          </button>
        </div>
      </div>
    </div>
  );
  return ReactDOM.createPortal(modal, document.body);
}

// ── RichEditor ────────────────────────────────────────────────────────────
interface RichEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function RichEditor({ content, onChange }: RichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conflict-resolution state: set when user tries to insert while a
  // figure/drawing node is selected — stores the node's position range.
  const [conflictModal, setConflictModal] = useState<{
    mediaType: "image" | "drawing";
    from: number;
    to: number;
  } | null>(null);

  // After user picks placement from conflict modal, store it here so the
  // async file-upload handler can read it without stale closure risk.
  const pendingPlacementRef = useRef<{
    placement: InsertPlacement;
    from: number;
    to: number;
  } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      FigureExtension,
      DrawingExtension,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") return "Heading";
          return "Start writing…";
        },
      }),
    ],
    content,
    editable: true,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });
  // No content-sync effect needed — the parent passes key={noteId} so the
  // editor remounts fresh on every note switch. A sync effect would cause
  // setContent() → onUpdate → onChange → persistSave on every view, which
  // would falsely update updatedAt and re-sort notes the user didn't edit.

  // ── Conflict detection helper ───────────────────────────────────────────
  const getConflict = useCallback(
    (mediaType: "image" | "drawing") => {
      if (!editor) return null;
      const { selection } = editor.state;
      if (
        selection instanceof NodeSelection &&
        (selection.node.type.name === "figure" ||
          selection.node.type.name === "drawing")
      ) {
        return { mediaType, from: selection.from, to: selection.to };
      }
      return null;
    },
    [editor]
  );

  // ── Do the actual node insertion at a resolved position ─────────────────
  const doInsertNode = useCallback(
    (
      nodeDesc: Record<string, unknown>,
      placement: InsertPlacement,
      from: number,
      to: number
    ) => {
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

  // ── Image upload handler ─────────────────────────────────────────────────
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

  // ── Image button click: check conflict first ─────────────────────────────
  const handleImageButtonClick = useCallback(() => {
    const conflict = getConflict("image");
    if (conflict) {
      setConflictModal(conflict);
    } else {
      fileInputRef.current?.click();
    }
  }, [getConflict]);

  // ── Drawing insertion ────────────────────────────────────────────────────
  const doInsertDrawing = useCallback(
    (placement?: InsertPlacement, from?: number, to?: number) => {
      if (!editor) return;
      const nodeDesc = {
        type: "drawing",
        attrs: { data: "", canvasWidth: 800, canvasHeight: 400 },
      };
      if (placement && from !== undefined && to !== undefined) {
        doInsertNode(nodeDesc, placement, from, to);
      } else {
        editor.chain().focus().insertContent(nodeDesc).run();
      }
    },
    [editor, doInsertNode]
  );

  // ── Drawing button click: check conflict first ───────────────────────────
  const handleDrawingButtonClick = useCallback(() => {
    const conflict = getConflict("drawing");
    if (conflict) {
      setConflictModal(conflict);
    } else {
      doInsertDrawing();
    }
  }, [getConflict, doInsertDrawing]);

  // ── Conflict modal resolution ────────────────────────────────────────────
  const handleConflictChoose = useCallback(
    (placement: InsertPlacement) => {
      if (!conflictModal) return;
      const { mediaType, from, to } = conflictModal;
      setConflictModal(null);

      if (mediaType === "image") {
        // Store placement so handleFileUpload can use it
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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Conflict resolution modal */}
      {conflictModal && (
        <InsertConflictModal
          mediaType={conflictModal.mediaType}
          onChoose={handleConflictChoose}
          onCancel={() => setConflictModal(null)}
        />
      )}

      {/* Always-visible toolbar */}
      <EditorToolbar
        editor={editor}
        onImageUpload={handleImageButtonClick}
        onInsertDrawing={handleDrawingButtonClick}
      />

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className="notion-editor focus:outline-none"
      />
    </div>
  );
}
