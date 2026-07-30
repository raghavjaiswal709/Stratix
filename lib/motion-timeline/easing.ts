/**
 * Easing curves the timeline compiler accepts by name.
 *
 * Every name here is quoted verbatim in the meta-prompt
 * (lib/prompt-templates/motion-timeline-template.ts) — an external AI is only
 * allowed to emit these strings, and anything else falls back to
 * DEFAULT_EASE with a warning rather than breaking playback.
 */

export type EaseName =
  | "linear"
  | "step"
  | "easeInSine" | "easeOutSine" | "easeInOutSine"
  | "easeInQuad" | "easeOutQuad" | "easeInOutQuad"
  | "easeInCubic" | "easeOutCubic" | "easeInOutCubic"
  | "easeInQuart" | "easeOutQuart" | "easeInOutQuart"
  | "easeInExpo" | "easeOutExpo" | "easeInOutExpo"
  | "easeInBack" | "easeOutBack" | "easeInOutBack"
  | "easeOutElastic"
  | "easeOutBounce";

export const DEFAULT_EASE: EaseName = "easeInOutCubic";

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const n1 = 7.5625;
const d1 = 2.75;

function bounceOut(x: number): number {
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

export const EASING: Record<EaseName, (x: number) => number> = {
  linear: (x) => x,
  // Holds the previous keyframe's value and snaps at the target time — this is
  // what makes `show`/`hide` cues instantaneous instead of a 1-frame ramp.
  step: (x) => (x < 1 ? 0 : 1),

  easeInSine: (x) => 1 - Math.cos((x * Math.PI) / 2),
  easeOutSine: (x) => Math.sin((x * Math.PI) / 2),
  easeInOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,

  easeInQuad: (x) => x * x,
  easeOutQuad: (x) => 1 - (1 - x) * (1 - x),
  easeInOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),

  easeInCubic: (x) => x * x * x,
  easeOutCubic: (x) => 1 - Math.pow(1 - x, 3),
  easeInOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),

  easeInQuart: (x) => x * x * x * x,
  easeOutQuart: (x) => 1 - Math.pow(1 - x, 4),
  easeInOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),

  easeInExpo: (x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)),
  easeOutExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  easeInOutExpo: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,

  easeInBack: (x) => c3 * x * x * x - c1 * x * x,
  easeOutBack: (x) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2),
  easeInOutBack: (x) =>
    x < 0.5
      ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,

  easeOutElastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1),

  easeOutBounce: bounceOut,
};

export const EASE_NAMES = Object.keys(EASING) as EaseName[];

/** Case-insensitive lookup; returns null when the name is not a known curve. */
export function resolveEase(name: unknown): EaseName | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  const hit = EASE_NAMES.find((e) => e.toLowerCase() === trimmed.toLowerCase());
  return hit ?? null;
}

export function applyEase(name: EaseName, t: number): number {
  const fn = EASING[name] ?? EASING[DEFAULT_EASE];
  return fn(Math.min(1, Math.max(0, t)));
}
