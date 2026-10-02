import { LEVELS_STATEMENT_TEMPLATES } from "./constants";
import type { LevelsSlide } from "./types";

/**
 * Tidies a template that had a placeholder resolve to nothing — an unselected
 * timeframe otherwise leaves "KEY LEVELS FOR XAUUSD ON" or "XAUUSD ·  — QML"
 * on the image.
 */
function tidyStatement(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    // "A · — B" (a separator left stranded by an empty segment) → "A — B"
    .replace(/([·—:,-])\s*(?=[·—:,-])/g, "")
    // "FOR ON H1" → "ON H1"
    .replace(/\b(FOR|ON|AT|IN)\s+(?=(ON|AT|IN)\b)/gi, "")
    // a connector or separator left hanging off the end
    .replace(/[\s·—:,-]*\b(FOR|ON|AT|IN)\s*$/i, "")
    .replace(/[\s·—:,-]+$/, "")
    .replace(/^[\s·—:,-]+/, "")
    .trim();
}

/**
 * Turns a slide's instrument / timeframe / levels / bias selection into the
 * headline that goes on the image, so the daily post doesn't get retyped.
 */
export function buildLevelsStatement(slide: LevelsSlide, templateId: string): string {
  const template =
    LEVELS_STATEMENT_TEMPLATES.find((t) => t.id === templateId) ?? LEVELS_STATEMENT_TEMPLATES[0];

  const vars: Record<string, string> = {
    INSTRUMENT: slide.instrument || "",
    TIMEFRAME: slide.timeframe || "",
    LEVELS: slide.levels.join(", "),
    BIAS: slide.bias || "",
  };

  // Nothing selected at all — a bare "KEY LEVELS FOR" helps no one.
  if (!vars.INSTRUMENT && !vars.TIMEFRAME && !vars.LEVELS) return "";

  return tidyStatement(template.pattern.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? ""));
}

/** The Instagram caption for the whole carousel — one numbered line per slide. */
export function buildCarouselCaption(slides: LevelsSlide[], templateId: string): string {
  const lines = slides
    .map((s) => buildLevelsStatement(s, templateId))
    .filter(Boolean)
    .map((line, i) => `${i + 1}. ${line}`);

  const notes = slides.map((s) => s.note.trim()).filter(Boolean);
  const instruments = [...new Set(slides.map((s) => s.instrument).filter(Boolean))];
  const tags = [...new Set(slides.flatMap((s) => s.levels))];
  const hashtags = [...instruments, ...tags]
    .map((t) => `#${t.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`)
    .filter((t) => t.length > 1);

  return [
    lines.join("\n"),
    notes.length ? `\n${notes.join("\n")}` : "",
    "\nNot financial advice. Levels are for education only.",
    hashtags.length ? `\n${hashtags.join(" ")} #trading #forex #priceaction` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
