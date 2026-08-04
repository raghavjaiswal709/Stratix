/**
 * The sync manifest — the missing link in the motion pipeline.
 *
 * The video prompt already decides, at the moment it writes the script, which
 * drawn object each spoken word is about ("the leaking bucket enters on
 * `balti`"). Until now that decision was thrown away and a second AI was asked
 * to rediscover it from OCR text and pixel boxes — which it cannot do for a
 * graphic, because a decomposed graphic carries no words at all. That is why
 * the piggy bank never landed on "piggy bank".
 *
 * So the video prompt now emits that decision as JSON, this module binds it to
 * the decomposed layers, and `buildTimelineFromManifest` turns it into a
 * timeline directly. The second AI pass — and its ~40k-token layout dump —
 * disappears entirely.
 */

import { parseLooseJson } from "./parse";
import type { TimelineSlideLike } from "./compile";

export const SYNC_MANIFEST_FORMAT = "stratix.sync.manifest";

/** What an element *is*, in the vocabulary the video prompt is told to use. */
export type ManifestKind =
  | "headline"
  | "subhead"
  | "caption"
  | "badge"
  | "footer"
  | "object"
  | "chart"
  | "accent"
  | "logo";

const TEXT_KINDS = new Set<ManifestKind>(["headline", "subhead", "caption", "badge", "footer"]);

/** The 9-cell grid `_position_label` in scripts/motion_segment.py emits. */
const POSITIONS = new Set([
  "top-left", "top-center", "top-right",
  "middle-left", "middle-center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

export interface ManifestElement {
  /** Human name — "leaking bucket". Never matched against anything. */
  label: string;
  kind: ManifestKind;
  /** Grid cell, in the same vocabulary the decomposer labels layers with. */
  pos: string;
  /** Approximate width as a percentage of the frame, for size-based binding. */
  sizePct: number | null;
  /** Verbatim on-screen copy, for text elements — the strongest binding signal. */
  text: string;
  /** The spoken word this element enters on. */
  word: string;
  /** Entrance cue name, from the renderer's own catalog. */
  in: string;
  /** Optional word to land an `emphasize` hit on. */
  hit: string | null;
  /** Optional word at which the element leaves. */
  out: string | null;
}

export interface ManifestBeat {
  /** 1-based beat number — also the slide it maps to, unless `slide` overrides. */
  beat: number;
  /** Explicit 1-based slide number, when the beats and slides do not line up. */
  slide: number | null;
  label: string;
  /** The exact spoken line for this beat — used to find the scene's start. */
  line: string;
  elements: ManifestElement[];
}

export interface SyncManifest {
  language: string | null;
  beats: ManifestBeat[];
}

export interface ManifestParseResult {
  manifest: SyncManifest | null;
  warnings: string[];
  error: string | null;
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v.trim() : fallback);
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;

function normalizeKind(raw: string): ManifestKind {
  const k = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (k.startsWith("head") || k === "title") return "headline";
  if (k.startsWith("sub")) return "subhead";
  if (k.startsWith("cap") || k === "body" || k === "label") return "caption";
  if (k.startsWith("badge") || k === "tag" || k === "eyebrow") return "badge";
  if (k.startsWith("foot") || k === "handle") return "footer";
  if (k.startsWith("chart") || k.startsWith("diagram") || k.startsWith("graph")) return "chart";
  if (k.startsWith("accent") || k.startsWith("callout") || k.startsWith("arrow") || k.startsWith("underline")) return "accent";
  if (k.startsWith("logo") || k.startsWith("watermark")) return "logo";
  return "object";
}

function normalizePos(raw: string): string {
  const p = raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "");
  if (POSITIONS.has(p)) return p;
  // "centre", "center", "middle" all mean the same cell; a bare row or column
  // resolves to its centre so a sloppy manifest still binds.
  const row = /top|upper/.test(p) ? "top" : /bottom|lower/.test(p) ? "bottom" : "middle";
  const col = /left/.test(p) ? "left" : /right/.test(p) ? "right" : "center";
  return `${row}-${col}`;
}

/**
 * Reads the SYNC MANIFEST block out of whatever the user pasted — a fenced
 * JSON block, the whole chat answer, or the bare object.
 */
export function parseSyncManifest(raw: string): ManifestParseResult {
  const text = (raw ?? "").trim();
  if (!text) return { manifest: null, warnings: [], error: "Nothing pasted yet." };

  const { value, error } = parseLooseJson<Record<string, unknown>>(text);
  if (!value) return { manifest: null, warnings: [], error: error ?? "Could not read this as JSON." };

  const warnings: string[] = [];
  const format = str(value.format);
  if (format && format !== SYNC_MANIFEST_FORMAT) {
    warnings.push(`Unexpected format "${format}" — read it as a sync manifest anyway.`);
  }

  const rawBeats = Array.isArray(value.beats) ? value.beats : Array.isArray(value.scenes) ? value.scenes : null;
  if (!rawBeats || rawBeats.length === 0) {
    return { manifest: null, warnings, error: "No `beats` array found in the manifest." };
  }

  const beats: ManifestBeat[] = [];
  rawBeats.forEach((rb: unknown, i) => {
    if (!rb || typeof rb !== "object") return;
    const b = rb as Record<string, unknown>;

    const rawElements = Array.isArray(b.elements) ? b.elements : Array.isArray(b.layers) ? b.layers : [];
    const elements: ManifestElement[] = [];

    rawElements.forEach((re: unknown, ei) => {
      if (!re || typeof re !== "object") return;
      const e = re as Record<string, unknown>;
      const word = str(e.word) || str(e.trigger) || str(e.onWord);
      const label = str(e.label) || str(e.name) || str(e.text) || `element ${ei + 1}`;

      if (!word) {
        warnings.push(`Beat ${i + 1} · "${label}" has no trigger word — it will hold static.`);
        return;
      }
      elements.push({
        label,
        kind: normalizeKind(str(e.kind) || str(e.type) || "object"),
        pos: normalizePos(str(e.pos) || str(e.position) || "middle-center"),
        sizePct: num(e.sizePct ?? e.size ?? e.widthPct),
        text: str(e.text),
        word,
        in: str(e.in) || str(e.action) || str(e.entrance) || "fadeInUp",
        hit: str(e.hit) || str(e.emphasis) || null,
        out: str(e.out) || str(e.exit) || null,
      });
    });

    if (elements.length === 0) {
      warnings.push(`Beat ${i + 1} has no usable elements — skipped.`);
      return;
    }

    beats.push({
      beat: num(b.beat) ?? i + 1,
      slide: num(b.slide),
      label: str(b.label) || str(b.name) || `Beat ${i + 1}`,
      line: str(b.line) || str(b.script) || str(b.voiceover) || "",
      elements,
    });
  });

  if (beats.length === 0) return { manifest: null, warnings, error: "No beat in the manifest had usable elements." };

  return { manifest: { language: str(value.language) || null, beats }, warnings, error: null };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Binding — manifest element → decomposed layer
 * ────────────────────────────────────────────────────────────────────────*/

/** Structural view of one decomposed layer, as the binder needs it. */
export interface BindableLayer {
  id: string;
  type?: string;
  role?: string;
  text?: string;
  positionLabel?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();

/** Token-overlap similarity, 0–1. Cheap, and enough to beat OCR noise. */
function textScore(a: string, b: string): number {
  const at = norm(a).split(" ").filter(Boolean);
  const bt = norm(b).split(" ").filter(Boolean);
  if (at.length === 0 || bt.length === 0) return 0;

  const bset = new Set(bt);
  let hits = 0;
  at.forEach((t) => {
    if (bset.has(t)) hits++;
    // OCR routinely mangles one character of a word; a shared 4-char prefix
    // still identifies it.
    else if (t.length >= 4 && bt.some((u) => u.length >= 4 && (u.startsWith(t.slice(0, 4)) || t.startsWith(u.slice(0, 4))))) hits += 0.6;
  });
  return hits / Math.max(at.length, bt.length);
}

function positionOf(layer: BindableLayer): string {
  if (layer.positionLabel && POSITIONS.has(layer.positionLabel)) return layer.positionLabel;
  const cx = (layer.x ?? 0) + (layer.w ?? 0) / 2;
  const cy = (layer.y ?? 0) + (layer.h ?? 0) / 2;
  const row = cy < 0.33 ? "top" : cy < 0.7 ? "middle" : "bottom";
  const col = cx < 0.33 ? "left" : cx < 0.67 ? "center" : "right";
  return `${row}-${col}`;
}

/** Distance between two grid cells, 0 (same) to 4 (opposite corners). */
function gridDistance(a: string, b: string): number {
  const idx = (p: string) => {
    const [row, col] = p.split("-");
    return [
      row === "top" ? 0 : row === "middle" ? 1 : 2,
      col === "left" ? 0 : col === "center" ? 1 : 2,
    ];
  };
  const [ar, ac] = idx(a);
  const [br, bc] = idx(b);
  return Math.abs(ar - br) + Math.abs(ac - bc);
}

/** Roles the decomposer assigns, ranked against each manifest kind. */
const ROLE_AFFINITY: Record<ManifestKind, string[]> = {
  headline: ["title", "heading"],
  subhead: ["subtitle", "heading", "body"],
  caption: ["body", "caption", "subtitle"],
  badge: ["badge", "tag", "eyebrow", "footer-badge"],
  footer: ["footer", "footer-badge", "footer-graphic"],
  object: ["graphic"],
  chart: ["graphic", "banner"],
  accent: ["icon", "banner", "graphic"],
  logo: ["icon", "footer-graphic", "header-graphic"],
};

function score(el: ManifestElement, layer: BindableLayer): number {
  const wantsText = TEXT_KINDS.has(el.kind);
  const isText = (layer.type ?? "graphic") === "text";

  // A text element can never be a graphic blob, or vice versa. Hard reject —
  // binding a headline to a background shape is worse than leaving it static.
  if (wantsText !== isText) return -1;

  let s = 0;

  // Verbatim copy is decisive when it is available: OCR read the same words.
  if (wantsText && el.text) {
    const t = textScore(el.text, layer.text ?? "");
    if (t >= 0.5) s += 6 * t;
    else s += 2 * t;
  }

  const affinity = ROLE_AFFINITY[el.kind].indexOf(layer.role ?? "");
  if (affinity === 0) s += 2.5;
  else if (affinity > 0) s += 1.5;

  s += 2 - gridDistance(el.pos, positionOf(layer)) * 0.8;

  if (el.sizePct !== null && layer.w !== undefined) {
    const delta = Math.abs(el.sizePct / 100 - layer.w);
    s += Math.max(0, 1.2 - delta * 3);
  }

  return s;
}

export interface Binding {
  element: ManifestElement;
  layerId: string | null;
  confidence: number;
}

/**
 * Greedy best-first assignment: the most confident pair is locked in first, so
 * a headline that OCR read perfectly claims its layer before a vague "accent"
 * can steal it. Every layer binds at most once.
 */
export function bindBeatToSlide(elements: ManifestElement[], layers: BindableLayer[]): Binding[] {
  const pairs: Array<{ ei: number; li: number; s: number }> = [];
  elements.forEach((el, ei) => {
    layers.forEach((layer, li) => {
      const s = score(el, layer);
      if (s > 0) pairs.push({ ei, li, s });
    });
  });
  pairs.sort((a, b) => b.s - a.s);

  const takenEl = new Set<number>();
  const takenLayer = new Set<number>();
  const out: Binding[] = elements.map((element) => ({ element, layerId: null, confidence: 0 }));

  pairs.forEach(({ ei, li, s }) => {
    if (takenEl.has(ei) || takenLayer.has(li)) return;
    takenEl.add(ei);
    takenLayer.add(li);
    out[ei] = { element: elements[ei], layerId: layers[li].id, confidence: s };
  });

  return out;
}

/** The slide a beat drives — explicit `slide` wins, else beat order. */
export function slideIndexForBeat(beat: ManifestBeat, order: number, slideCount: number): number {
  const raw = beat.slide !== null ? beat.slide - 1 : order;
  return Math.max(0, Math.min(slideCount - 1, raw));
}

export function layersOf(slide: TimelineSlideLike): BindableLayer[] {
  return (slide.layers ?? []) as BindableLayer[];
}
