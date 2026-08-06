import { DEFAULT_EASE, type EaseName } from "./easing";
import type { CameraChannel, ChannelName, Channels, Keyframe } from "./types";

/**
 * The cue library.
 *
 * Cues are the shorthand an external AI is expected to write ("fadeInUp at
 * 12480ms") instead of hand-rolling keyframes. Each one expands into plain
 * keyframes on independent channels, so a cue is never a special case at
 * render time — by the time anything is drawn, only keyframes exist.
 *
 * CUE_DOCS below is the single source of truth for the catalog printed into
 * the meta-prompt, so the prompt can never drift from what this file accepts.
 */

export interface NormalizedCue {
  action: string;
  atMs: number;
  durMs: number;
  ease?: EaseName;
  params: Record<string, number | string>;
}

export interface CueExpansion {
  channels: Channels;
  cameraChannels?: Partial<Record<CameraChannel, Keyframe[]>>;
}

const kf = (tMs: number, value: number, ease: EaseName, source: string): Keyframe => ({
  tMs,
  value,
  ease,
  source,
});

function num(cue: NormalizedCue, key: string, fallback: number): number {
  const raw = cue.params[key];
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/** Oscillates `channel` between `base` and `peak` for `cycles` full cycles. */
function oscillate(
  cue: NormalizedCue,
  base: number,
  peak: number,
  cycles: number,
  ease: EaseName
): Keyframe[] {
  const out: Keyframe[] = [kf(cue.atMs, base, "linear", cue.action)];
  const step = cue.durMs / (cycles * 2);
  for (let i = 1; i <= cycles * 2; i++) {
    out.push(kf(cue.atMs + step * i, i % 2 === 1 ? peak : base, ease, cue.action));
  }
  return out;
}

type CueBuilder = (cue: NormalizedCue, defaults: CueDefaults) => CueExpansion;

export interface CueDefaults {
  ease: EaseName;
  distancePct: number;
}

/** Enter cues share one body: opacity 0→1 plus an optional offset settling to 0. */
function enterFrom(axis: "xPct" | "yPct", sign: 1 | -1): CueBuilder {
  return (cue, defaults) => {
    const dist = num(cue, "distancePct", defaults.distancePct) * sign;
    const ease = cue.ease ?? "easeOutCubic";
    return {
      channels: {
        opacity: [
          kf(cue.atMs, 0, "linear", cue.action),
          kf(cue.atMs + cue.durMs * 0.75, 1, "easeOutQuad", cue.action),
        ],
        [axis]: [kf(cue.atMs, dist, "linear", cue.action), kf(cue.atMs + cue.durMs, 0, ease, cue.action)],
      },
    };
  };
}

/** Exit cues mirror `enterFrom`: opacity 1→0 while sliding away along one axis. */
function exitTo(axis: "xPct" | "yPct", sign: 1 | -1): CueBuilder {
  return (cue, defaults) => {
    const dist = num(cue, "distancePct", defaults.distancePct) * sign;
    const ease = cue.ease ?? "easeInCubic";
    return {
      channels: {
        opacity: [
          kf(cue.atMs, 1, "linear", cue.action),
          kf(cue.atMs + cue.durMs, 0, "easeInQuad", cue.action),
        ],
        [axis]: [kf(cue.atMs, 0, "linear", cue.action), kf(cue.atMs + cue.durMs, dist, ease, cue.action)],
      },
    };
  };
}

export const CUE_BUILDERS: Record<string, CueBuilder> = {
  /* ── visibility ─────────────────────────────────────────────────────── */
  show: (cue) => ({ channels: { opacity: [kf(cue.atMs, 1, "step", cue.action)] } }),
  hide: (cue) => ({ channels: { opacity: [kf(cue.atMs, 0, "step", cue.action)] } }),

  fadeIn: (cue) => ({
    channels: {
      opacity: [
        kf(cue.atMs, 0, "linear", cue.action),
        kf(cue.atMs + cue.durMs, 1, cue.ease ?? "easeOutCubic", cue.action),
      ],
    },
  }),
  fadeOut: (cue) => ({
    channels: {
      opacity: [
        kf(cue.atMs, 1, "linear", cue.action),
        kf(cue.atMs + cue.durMs, 0, cue.ease ?? "easeInCubic", cue.action),
      ],
    },
  }),

  /* ── directional entrances / exits ──────────────────────────────────── */
  // "Up" = travels upward into place, so it starts below its rest position.
  fadeInUp: enterFrom("yPct", 1),
  fadeInDown: enterFrom("yPct", -1),
  fadeInLeft: enterFrom("xPct", -1),
  fadeInRight: enterFrom("xPct", 1),
  slideOutUp: exitTo("yPct", -1),
  slideOutDown: exitTo("yPct", 1),
  slideOutLeft: exitTo("xPct", -1),
  slideOutRight: exitTo("xPct", 1),

  popIn: (cue) => {
    const from = num(cue, "fromScale", 0.86);
    return {
      channels: {
        opacity: [
          kf(cue.atMs, 0, "linear", cue.action),
          kf(cue.atMs + cue.durMs * 0.5, 1, "easeOutQuad", cue.action),
        ],
        scale: [
          kf(cue.atMs, from, "linear", cue.action),
          kf(cue.atMs + cue.durMs, 1, cue.ease ?? "easeOutBack", cue.action),
        ],
      },
    };
  },
  popOut: (cue) => {
    const to = num(cue, "toScale", 0.9);
    return {
      channels: {
        opacity: [
          kf(cue.atMs, 1, "linear", cue.action),
          kf(cue.atMs + cue.durMs, 0, "easeInQuad", cue.action),
        ],
        scale: [
          kf(cue.atMs, 1, "linear", cue.action),
          kf(cue.atMs + cue.durMs, to, cue.ease ?? "easeInBack", cue.action),
        ],
      },
    };
  },

  /* ── paper (collage-part combo) ─────────────────────────────────────── */
  // A cut-paper block, not a headline or an icon: bigger travel, a tilt that
  // settles rather than a pure fade, sized for a large collage-part layer
  // rather than the small-graphic/text defaults used elsewhere in this file.
  paperDropIn: (cue) => {
    const dist = num(cue, "distancePct", 9);
    const fromScale = num(cue, "fromScale", 0.9);
    const fromRotateDeg = num(cue, "fromRotateDeg", -6);
    const ease = cue.ease ?? "easeOutBack";
    return {
      channels: {
        opacity: [
          kf(cue.atMs, 0, "linear", cue.action),
          kf(cue.atMs + cue.durMs * 0.45, 1, "easeOutQuad", cue.action),
        ],
        // Drops from above, like fadeInDown — negative yPct is up (§ enterFrom).
        yPct: [
          kf(cue.atMs, -dist, "linear", cue.action),
          kf(cue.atMs + cue.durMs, 0, ease, cue.action),
        ],
        scale: [
          kf(cue.atMs, fromScale, "linear", cue.action),
          kf(cue.atMs + cue.durMs, 1, ease, cue.action),
        ],
        // Tilts in, overshoots a little the other way as it "lands", then
        // settles flat — the wobble that reads as a dropped photo, not a slide.
        rotate: [
          kf(cue.atMs, fromRotateDeg, "linear", cue.action),
          kf(cue.atMs + cue.durMs * 0.72, -fromRotateDeg * 0.22, "easeOutCubic", cue.action),
          kf(cue.atMs + cue.durMs, 0, "easeInOutSine", cue.action),
        ],
      },
    };
  },
  paperDropOut: (cue) => {
    const dist = num(cue, "distancePct", 9);
    const toScale = num(cue, "toScale", 0.92);
    const toRotateDeg = num(cue, "toRotateDeg", 6);
    const ease = cue.ease ?? "easeInCubic";
    return {
      channels: {
        opacity: [
          kf(cue.atMs, 1, "linear", cue.action),
          kf(cue.atMs + cue.durMs, 0, "easeInQuad", cue.action),
        ],
        yPct: [
          kf(cue.atMs, 0, "linear", cue.action),
          kf(cue.atMs + cue.durMs, dist, ease, cue.action),
        ],
        scale: [
          kf(cue.atMs, 1, "linear", cue.action),
          kf(cue.atMs + cue.durMs, toScale, ease, cue.action),
        ],
        rotate: [
          kf(cue.atMs, 0, "linear", cue.action),
          kf(cue.atMs + cue.durMs, toRotateDeg, ease, cue.action),
        ],
      },
    };
  },

  /* ── scale ──────────────────────────────────────────────────────────── */
  zoomIn: (cue) => ({
    channels: {
      scale: [
        kf(cue.atMs, num(cue, "from", 1), "linear", cue.action),
        kf(cue.atMs + cue.durMs, num(cue, "to", 1.08), cue.ease ?? "easeInOutSine", cue.action),
      ],
    },
  }),
  zoomOut: (cue) => ({
    channels: {
      scale: [
        kf(cue.atMs, num(cue, "from", 1.08), "linear", cue.action),
        kf(cue.atMs + cue.durMs, num(cue, "to", 1), cue.ease ?? "easeInOutSine", cue.action),
      ],
    },
  }),
  // The workhorse for word-level sync: a scale hit that returns to rest, so it
  // can be dropped on a stressed word without disturbing anything around it.
  emphasize: (cue) => {
    const amount = num(cue, "amount", 1.06);
    return {
      channels: {
        scale: [
          kf(cue.atMs, 1, "linear", cue.action),
          kf(cue.atMs + cue.durMs * 0.4, amount, cue.ease ?? "easeOutBack", cue.action),
          kf(cue.atMs + cue.durMs, 1, "easeInOutSine", cue.action),
        ],
      },
    };
  },
  pulse: (cue) => ({
    channels: {
      scale: oscillate(cue, 1, num(cue, "amount", 1.04), Math.max(1, Math.round(num(cue, "cycles", 2))), "easeInOutSine"),
    },
  }),

  /* ── position ───────────────────────────────────────────────────────── */
  shake: (cue) => ({
    channels: {
      xPct: oscillate(cue, 0, num(cue, "amountPct", 1.2), Math.max(1, Math.round(num(cue, "cycles", 3))), "easeInOutSine"),
    },
  }),
  float: (cue) => ({
    channels: {
      yPct: oscillate(cue, 0, -num(cue, "amountPct", 1.2), Math.max(1, Math.round(num(cue, "cycles", 1))), "easeInOutSine"),
    },
  }),
  drift: (cue) => {
    const dx = num(cue, "dxPct", 0);
    const dy = num(cue, "dyPct", 0);
    const ease = cue.ease ?? "linear";
    const channels: Channels = {};
    if (dx !== 0) channels.xPct = [kf(cue.atMs, 0, "linear", cue.action), kf(cue.atMs + cue.durMs, dx, ease, cue.action)];
    if (dy !== 0) channels.yPct = [kf(cue.atMs, 0, "linear", cue.action), kf(cue.atMs + cue.durMs, dy, ease, cue.action)];
    return { channels };
  },
  moveTo: (cue) => {
    const dx = num(cue, "xPct", 0);
    const dy = num(cue, "yPct", 0);
    const ease = cue.ease ?? DEFAULT_EASE;
    return {
      channels: {
        xPct: [kf(cue.atMs + cue.durMs, dx, ease, cue.action)],
        yPct: [kf(cue.atMs + cue.durMs, dy, ease, cue.action)],
      },
    };
  },

  /* ── rotation ───────────────────────────────────────────────────────── */
  spin: (cue) => ({
    channels: {
      rotate: [
        kf(cue.atMs, num(cue, "from", 0), "linear", cue.action),
        kf(cue.atMs + cue.durMs, num(cue, "to", 360), cue.ease ?? "easeInOutCubic", cue.action),
      ],
    },
  }),
  tilt: (cue) => {
    const deg = num(cue, "deg", 3);
    return {
      channels: {
        rotate: [
          kf(cue.atMs, 0, "linear", cue.action),
          kf(cue.atMs + cue.durMs * 0.45, deg, cue.ease ?? "easeOutBack", cue.action),
          kf(cue.atMs + cue.durMs, 0, "easeInOutSine", cue.action),
        ],
      },
    };
  },

  /* ── reveal / blur ──────────────────────────────────────────────────── */
  // Text layers are bitmap cut-outs, so there is no per-letter typing; a
  // directional clip reveal is the closest honest equivalent and reads the
  // same on screen.
  wipeIn: (cue) => ({
    channels: {
      opacity: [kf(cue.atMs, 1, "step", cue.action)],
      wipe: [kf(cue.atMs, 0, "linear", cue.action), kf(cue.atMs + cue.durMs, 1, cue.ease ?? "easeOutCubic", cue.action)],
    },
  }),
  wipeOut: (cue) => ({
    channels: {
      wipe: [kf(cue.atMs, 1, "linear", cue.action), kf(cue.atMs + cue.durMs, 0, cue.ease ?? "easeInCubic", cue.action)],
    },
  }),

  // Same reveal as wipeIn — 0→1 on the wipe channel — but the compiler tags
  // the track "zigzag" (see compile.ts) so the renderer cuts a torn-paper
  // edge instead of a straight one. The look for a decomposed graphic that
  // belongs to the page rather than to a spoken word: it arrives like a cut
  // sheet being slid into place, not typed on.
  zigzagIn: (cue) => ({
    channels: {
      opacity: [kf(cue.atMs, 1, "step", cue.action)],
      wipe: [kf(cue.atMs, 0, "linear", cue.action), kf(cue.atMs + cue.durMs, 1, cue.ease ?? "easeOutCubic", cue.action)],
    },
  }),
  zigzagOut: (cue) => ({
    channels: {
      wipe: [kf(cue.atMs, 1, "linear", cue.action), kf(cue.atMs + cue.durMs, 0, cue.ease ?? "easeInCubic", cue.action)],
    },
  }),
  blurIn: (cue) => ({
    channels: {
      opacity: [kf(cue.atMs, 0, "linear", cue.action), kf(cue.atMs + cue.durMs * 0.7, 1, "easeOutQuad", cue.action)],
      blur: [
        kf(cue.atMs, num(cue, "amount", 8), "linear", cue.action),
        kf(cue.atMs + cue.durMs, 0, cue.ease ?? "easeOutCubic", cue.action),
      ],
    },
  }),
  blurOut: (cue) => ({
    channels: {
      opacity: [kf(cue.atMs, 1, "linear", cue.action), kf(cue.atMs + cue.durMs, 0, "easeInQuad", cue.action)],
      blur: [
        kf(cue.atMs, 0, "linear", cue.action),
        kf(cue.atMs + cue.durMs, num(cue, "amount", 8), cue.ease ?? "easeInCubic", cue.action),
      ],
    },
  }),
  dim: (cue) => ({
    channels: {
      opacity: [
        kf(cue.atMs, 1, "linear", cue.action),
        kf(cue.atMs + cue.durMs, num(cue, "to", 0.45), cue.ease ?? "easeInOutSine", cue.action),
      ],
    },
  }),
  undim: (cue) => ({
    channels: {
      opacity: [
        kf(cue.atMs, num(cue, "from", 0.45), "linear", cue.action),
        kf(cue.atMs + cue.durMs, 1, cue.ease ?? "easeInOutSine", cue.action),
      ],
    },
  }),
};

/** Camera-only cues. Written on a scene's `camera`, never on a track. */
export const CAMERA_CUE_BUILDERS: Record<string, (cue: NormalizedCue) => Partial<Record<CameraChannel, Keyframe[]>>> = {
  kenBurns: (cue) => ({
    zoom: [
      kf(cue.atMs, num(cue, "from", 1.0), "linear", cue.action),
      kf(cue.atMs + cue.durMs, num(cue, "to", 1.08), cue.ease ?? "easeInOutSine", cue.action),
    ],
    panXPct: [
      kf(cue.atMs, 0, "linear", cue.action),
      kf(cue.atMs + cue.durMs, num(cue, "panXPct", 0), cue.ease ?? "easeInOutSine", cue.action),
    ],
    panYPct: [
      kf(cue.atMs, 0, "linear", cue.action),
      kf(cue.atMs + cue.durMs, num(cue, "panYPct", 0), cue.ease ?? "easeInOutSine", cue.action),
    ],
  }),
  cameraZoom: (cue) => ({
    zoom: [
      kf(cue.atMs, num(cue, "from", 1), "linear", cue.action),
      kf(cue.atMs + cue.durMs, num(cue, "to", 1.1), cue.ease ?? "easeInOutSine", cue.action),
    ],
  }),
  // A fast in-and-out zoom, for landing on a single emphasised word.
  cameraPunch: (cue) => {
    const amount = num(cue, "amount", 1.05);
    return {
      zoom: [
        kf(cue.atMs, 1, "linear", cue.action),
        kf(cue.atMs + cue.durMs * 0.35, amount, cue.ease ?? "easeOutCubic", cue.action),
        kf(cue.atMs + cue.durMs, 1, "easeInOutSine", cue.action),
      ],
    };
  },
  cameraPan: (cue) => ({
    panXPct: [
      kf(cue.atMs, num(cue, "fromXPct", 0), "linear", cue.action),
      kf(cue.atMs + cue.durMs, num(cue, "toXPct", 0), cue.ease ?? "easeInOutSine", cue.action),
    ],
    panYPct: [
      kf(cue.atMs, num(cue, "fromYPct", 0), "linear", cue.action),
      kf(cue.atMs + cue.durMs, num(cue, "toYPct", 0), cue.ease ?? "easeInOutSine", cue.action),
    ],
  }),
};

export const CUE_NAMES = Object.keys(CUE_BUILDERS);
export const CAMERA_CUE_NAMES = Object.keys(CAMERA_CUE_BUILDERS);

/** Channels each cue writes to — used to report overlapping cues. */
export const CUE_CHANNELS: Record<string, ChannelName[]> = {
  show: ["opacity"], hide: ["opacity"], fadeIn: ["opacity"], fadeOut: ["opacity"],
  fadeInUp: ["opacity", "yPct"], fadeInDown: ["opacity", "yPct"],
  fadeInLeft: ["opacity", "xPct"], fadeInRight: ["opacity", "xPct"],
  slideOutUp: ["opacity", "yPct"], slideOutDown: ["opacity", "yPct"],
  slideOutLeft: ["opacity", "xPct"], slideOutRight: ["opacity", "xPct"],
  popIn: ["opacity", "scale"], popOut: ["opacity", "scale"],
  paperDropIn: ["opacity", "yPct", "scale", "rotate"], paperDropOut: ["opacity", "yPct", "scale", "rotate"],
  zoomIn: ["scale"], zoomOut: ["scale"], emphasize: ["scale"], pulse: ["scale"],
  shake: ["xPct"], float: ["yPct"], drift: ["xPct", "yPct"], moveTo: ["xPct", "yPct"],
  spin: ["rotate"], tilt: ["rotate"],
  wipeIn: ["opacity", "wipe"], wipeOut: ["wipe"],
  zigzagIn: ["opacity", "wipe"], zigzagOut: ["wipe"],
  blurIn: ["opacity", "blur"], blurOut: ["opacity", "blur"],
  dim: ["opacity"], undim: ["opacity"],
};

export interface CueDoc {
  name: string;
  params: string;
  description: string;
}

/** Catalog rendered verbatim into the meta-prompt. */
export const CUE_DOCS: CueDoc[] = [
  { name: "show", params: "—", description: "Snap to fully visible at atMs (no fade). durMs ignored." },
  { name: "hide", params: "—", description: "Snap to invisible at atMs. Use to clear an element instantly." },
  { name: "fadeIn", params: "—", description: "Opacity 0 → 1 across durMs." },
  { name: "fadeOut", params: "—", description: "Opacity 1 → 0 across durMs." },
  { name: "fadeInUp", params: "distancePct", description: "Rises into place from below while fading in. Best default for a line of text arriving on its word." },
  { name: "fadeInDown", params: "distancePct", description: "Drops into place from above while fading in." },
  { name: "fadeInLeft", params: "distancePct", description: "Enters from the left while fading in." },
  { name: "fadeInRight", params: "distancePct", description: "Enters from the right while fading in." },
  { name: "slideOutUp", params: "distancePct", description: "Exits upward while fading out." },
  { name: "slideOutDown", params: "distancePct", description: "Exits downward while fading out." },
  { name: "slideOutLeft", params: "distancePct", description: "Exits to the left while fading out." },
  { name: "slideOutRight", params: "distancePct", description: "Exits to the right while fading out." },
  { name: "popIn", params: "fromScale", description: "Scales up from fromScale (default 0.86) with an overshoot while fading in. Good for badges, icons, numbers." },
  { name: "popOut", params: "toScale", description: "Shrinks away while fading out." },
  { name: "paperDropIn", params: "distancePct, fromScale, fromRotateDeg", description: "A cut-paper block drops in from above, tilted, fading in and settling flat with a small rotational wobble as it lands. Sized for a large collage-part layer (bigger travel than fadeInDown/popIn) — THE entrance for a collage part." },
  { name: "paperDropOut", params: "distancePct, toScale, toRotateDeg", description: "Mirror of paperDropIn: the block tilts, shrinks slightly and slides down out of frame while fading." },
  { name: "zoomIn", params: "from, to", description: "Continuous scale ramp, e.g. from 1 to 1.08 over a whole sentence." },
  { name: "zoomOut", params: "from, to", description: "Continuous scale ramp downward." },
  { name: "emphasize", params: "amount", description: "Scale hit up to amount (default 1.06) and back to rest. THE cue for landing on a stressed word." },
  { name: "pulse", params: "amount, cycles", description: "Repeated scale breathing between 1 and amount." },
  { name: "shake", params: "amountPct, cycles", description: "Horizontal jitter, for tension/warning beats." },
  { name: "float", params: "amountPct, cycles", description: "Gentle vertical drift, for idle ambience while a line is being spoken." },
  { name: "drift", params: "dxPct, dyPct", description: "Linear travel by dx/dy percent of canvas over durMs — use for slow parallax on background graphics." },
  { name: "moveTo", params: "xPct, yPct", description: "Move to an absolute offset from the element's rest position by atMs+durMs." },
  { name: "spin", params: "from, to", description: "Rotation in degrees." },
  { name: "tilt", params: "deg", description: "Rotate to deg and back — a nudge, not a spin." },
  { name: "wipeIn", params: "(track.wipeFrom)", description: "Directional clip reveal, 0 → 100%. Reads like text being written on. Direction comes from the track's wipeFrom." },
  { name: "wipeOut", params: "(track.wipeFrom)", description: "Directional clip hide, 100% → 0." },
  { name: "zigzagIn", params: "(track.wipeFrom)", description: "Directional reveal with a torn-paper zigzag edge instead of a straight one, 0 → 100%. Reads like a cut sheet sliding into place. Direction comes from the track's wipeFrom (left/right for \"from the sides\")." },
  { name: "zigzagOut", params: "(track.wipeFrom)", description: "Zigzag-edged clip hide, 100% → 0." },
  { name: "blurIn", params: "amount", description: "Comes into focus from amount px of blur (default 8) while fading in." },
  { name: "blurOut", params: "amount", description: "Blurs away while fading out." },
  { name: "dim", params: "to", description: "Fade down to a partial opacity (default 0.45) and stay there — for de-emphasising an element while another one speaks." },
  { name: "undim", params: "from", description: "Return from a dimmed opacity to full." },
];

export const CAMERA_CUE_DOCS: CueDoc[] = [
  { name: "kenBurns", params: "from, to, panXPct, panYPct", description: "Slow zoom from→to with an optional pan across the whole scene. The default ambience for a talking-head narration slide." },
  { name: "cameraZoom", params: "from, to", description: "Zoom the whole frame." },
  { name: "cameraPunch", params: "amount", description: "Fast zoom in and back out — a percussive hit on one word." },
  { name: "cameraPan", params: "fromXPct, toXPct, fromYPct, toYPct", description: "Pan the frame. Positive X moves the view right (content slides left)." },
];
