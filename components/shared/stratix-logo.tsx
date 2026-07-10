"use client";

import type { CSSProperties } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Stratix brand system — monochrome liquid glass + emerald momentum accent.
// Both primitives read `var(--foreground)` (flips white/near-black with the
// app's .dark class) so they render correctly in dark AND light mode without
// a JS theme read. Pass tone="light" to force light-on-dark rendering for
// fixed-dark surfaces (e.g. the quote overlay, whose backdrop stays near-
// black regardless of the app's theme setting).
//
// StratixMark     : app icon — glass squircle holding a stroked "S" glyph.
// StratixWordmark  : refined Inter wordmark with gradient fill + accent tick.
// ─────────────────────────────────────────────────────────────────────────

type Tone = "auto" | "light" | "dark";

// Resolves the base glyph/text color for a given tone: "auto" defers to the
// live theme via the CSS variable; "light"/"dark" pin it for fixed-color
// surfaces that don't follow the app theme.
function toneColor(tone: Tone): string {
  if (tone === "light") return "#f5f5f5";
  if (tone === "dark") return "#0a0a0a";
  return "var(--foreground)";
}

interface StratixMarkProps {
  /** Tile size in px. */
  size?: number;
  className?: string;
  /** Force light/dark rendering instead of following the app theme. */
  tone?: Tone;
}

export function StratixMark({ size = 32, className = "", tone = "auto" }: StratixMarkProps) {
  const fg = toneColor(tone);
  const uid = tone; // gradient/filter ids just need to be unique per tone variant on the page
  // Bold "ribbon" glyph: the same S centerline drawn three times — a soft
  // dark extrusion beneath, a thick gradient ribbon on top, and a thin
  // bright bevel highlight along its upper edge — the layering is what
  // sells "engraved glass icon" instead of "a thin line that looks like S".
  const ribbon = Math.max(2.6, size * 0.2);
  const highlight = ribbon * 0.34;
  const path =
    "M16.6 8C16.6 5.9 14.6 4.4 12 4.4C9.2 4.4 7 5.9 7 8C7 12.2 17 10.6 17 15.8C17 18 14.7 19.6 12 19.6C9.3 19.6 7.1 18.1 7.1 15.9";

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden select-none ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: [
          `radial-gradient(120% 140% at 22% 12%, color-mix(in srgb, ${fg} 14%, transparent), transparent 55%)`,
          `linear-gradient(155deg, color-mix(in srgb, ${fg} 9%, transparent), color-mix(in srgb, ${fg} 3%, transparent) 60%)`,
        ].join(", "),
        border: `1px solid color-mix(in srgb, ${fg} 20%, transparent)`,
        boxShadow: [
          `inset 0 1.5px 0 color-mix(in srgb, ${fg} 30%, transparent)`,
          "inset 0 -8px 14px rgba(0,0,0,0.38)",
          "inset 0 0 0 1px rgba(0,0,0,0.25)",
          "0 6px 20px rgba(0,0,0,0.45)",
          "0 0 24px rgba(16,185,129,0.16)",
        ].join(", "),
      }}
      aria-hidden
    >
      {/* soft emerald floor glow inside the tile */}
      <span
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: "58%",
          background: "radial-gradient(80% 100% at 50% 100%, rgba(16,185,129,0.26), transparent 70%)",
        }}
      />
      {/* diagonal glass sheen */}
      <span
        className="absolute pointer-events-none"
        style={{
          top: "-45%",
          left: "-25%",
          width: "70%",
          height: "190%",
          background: `linear-gradient(115deg, color-mix(in srgb, ${fg} 22%, transparent), transparent 55%)`,
          transform: "rotate(-8deg)",
        }}
      />
      {/* hairline bezel ring for a machined/engraved edge */}
      <span
        className="absolute inset-[1px] pointer-events-none"
        style={{
          borderRadius: size * 0.27,
          border: `1px solid color-mix(in srgb, ${fg} 9%, transparent)`,
        }}
      />

      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        style={{ position: "relative", zIndex: 1 }}
      >
        <defs>
          <linearGradient id={`sx-s-${uid}`} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={fg} />
            <stop offset="0.55" stopColor={fg} />
            <stop offset="1" stopColor="#34d399" />
          </linearGradient>
        </defs>

        {/* extrusion shadow — gives the ribbon physical depth */}
        <path
          d={path}
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={ribbon}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(0.55, 1.1)"
        />
        {/* the ribbon itself */}
        <path
          d={path}
          stroke={`url(#sx-s-${uid})`}
          strokeWidth={ribbon}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 6px rgba(16,185,129,0.5))" }}
        />
        {/* bevel highlight along the upper-left edge */}
        <path
          d={path}
          stroke={`color-mix(in srgb, ${fg} 75%, white)`}
          strokeWidth={highlight}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
          transform="translate(-0.45, -0.7)"
        />
        {/* live node at the glyph's terminal — ties into the trading motif */}
        <circle cx="7.1" cy="15.9" r={ribbon * 0.42} fill="#34d399" />
        <circle cx="7.1" cy="15.9" r={ribbon * 0.42} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" />
        <circle cx="7.1" cy="15.9" r={ribbon * 0.85} fill="#34d399" opacity="0.2" />
      </svg>
    </span>
  );
}

interface StratixWordmarkProps {
  /** Font size in px. */
  size?: number;
  className?: string;
  /** Soft glow + emerald baseline accent for hero placements (quote screen). */
  glow?: boolean;
  /** Force light/dark rendering instead of following the app theme. */
  tone?: Tone;
}

export function StratixWordmark({ size = 20, className = "", glow = false, tone = "auto" }: StratixWordmarkProps) {
  const fg = toneColor(tone);

  const textStyle: CSSProperties = {
    fontSize: `${size}px`,
    lineHeight: 1,
    fontWeight: 750,
    letterSpacing: "0.22em",
    fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
    backgroundImage: `linear-gradient(180deg, ${fg} 20%, color-mix(in srgb, ${fg} 62%, transparent) 100%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    // pull back the trailing tracking gap so the mark centers optically
    marginRight: "-0.22em",
    ...(glow
      ? {
          filter: [
            `drop-shadow(0 0 18px color-mix(in srgb, ${fg} 22%, transparent))`,
            "drop-shadow(0 2px 24px rgba(16,185,129,0.16))",
          ].join(" "),
        }
      : {}),
  };

  return (
    <span className={`relative inline-flex flex-col items-center select-none ${className}`}>
      <span style={textStyle}>
        STRATI
        <span
          style={{
            backgroundImage: "linear-gradient(135deg, #6ee7b7 0%, #10b981 70%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          X
        </span>
      </span>
      {glow && (
        <span
          className="pointer-events-none rounded-full"
          style={{
            marginTop: size * 0.42,
            height: 1.5,
            width: "62%",
            background: [
              "linear-gradient(90deg, transparent,",
              `color-mix(in srgb, ${fg} 38%, transparent) 30%,`,
              "rgba(16,185,129,0.65) 50%,",
              `color-mix(in srgb, ${fg} 38%, transparent) 70%, transparent)`,
            ].join(" "),
            boxShadow: "0 0 14px rgba(16,185,129,0.35)",
          }}
          aria-hidden
        />
      )}
    </span>
  );
}
