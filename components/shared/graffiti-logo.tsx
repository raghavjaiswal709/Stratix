"use client";

import { CSSProperties } from "react";

interface GraffitiLogoProps {
  /** Font size in px (everything else scales from this). */
  size?: number;
  /** Extra classes on the wrapper. */
  className?: string;
  /** Show the spray-paint drips under the wordmark. */
  drips?: boolean;
}

// Build a thick "sticker" outline ring out of 12 directional shadows so the
// wordmark gets the classic double-outline graffiti look without a custom font.
function outlineRing(radius: number, color: string): string {
  const steps = 12;
  const ring: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = (Math.cos(a) * radius).toFixed(2);
    const y = (Math.sin(a) * radius).toFixed(2);
    ring.push(`${x}px ${y}px 0 ${color}`);
  }
  return ring.join(", ");
}

/**
 * Stratix street / graffiti wordmark.
 * Pure CSS (no external font): heavy italic skew, white fill, a layered dark
 * "sticker" outline, a 3D extruded drop, an emerald spray glow, and paint
 * drips bleeding from the letters — monochrome + emerald brand system.
 */
export function GraffitiLogo({ size = 28, className = "", drips = false }: GraffitiLogoProps) {
  const stroke = Math.max(1, size * 0.045);
  const extrude = Math.max(1, size * 0.05);

  const textStyle: CSSProperties = {
    fontSize: `${size}px`,
    lineHeight: 1,
    fontWeight: 900,
    fontStyle: "italic",
    letterSpacing: "-0.05em",
    fontFamily: '"Arial Black", "Archivo Black", system-ui, sans-serif',
    color: "#ffffff",
    WebkitTextStroke: `${stroke}px rgba(0,0,0,0.92)`,
    transform: "skewX(-11deg) rotate(-3deg)",
    display: "inline-block",
    paddingRight: "0.14em",
    textShadow: [
      // sticker double-outline (two rings)
      outlineRing(size * 0.07, "rgba(0,0,0,0.95)"),
      outlineRing(size * 0.12, "rgba(0,0,0,0.55)"),
      // 3D extrusion (dark steps down-right)
      `${extrude}px ${extrude}px 0 rgba(0,0,0,0.6)`,
      `${extrude * 1.9}px ${extrude * 1.9}px 0 rgba(0,0,0,0.45)`,
      `${extrude * 2.8}px ${extrude * 2.8}px ${extrude * 2.2}px rgba(0,0,0,0.7)`,
      // emerald spray halo + white core glow
      `0 0 ${size * 0.85}px rgba(16,185,129,0.5)`,
      `0 0 ${size * 0.35}px rgba(255,255,255,0.3)`,
    ].join(", "),
  };

  return (
    <span className={`relative inline-flex flex-col items-start select-none ${className}`}>
      <span style={textStyle}>STRATIX</span>
      {drips && (
        <span className="absolute left-0 right-0" style={{ bottom: -size * 0.22, height: size * 0.6 }} aria-hidden>
          <Drip left="14%" h={size * 0.32} w={size * 0.06} />
          <Drip left="33%" h={size * 0.6} w={size * 0.075} />
          <Drip left="55%" h={size * 0.42} w={size * 0.065} />
          <Drip left="72%" h={size * 0.7} w={size * 0.08} />
          <Drip left="90%" h={size * 0.3} w={size * 0.055} />
        </span>
      )}
    </span>
  );
}

interface GraffitiMarkProps {
  /** Tile size in px. */
  size?: number;
  className?: string;
}

/**
 * Graffiti "S" monogram tile — the icon counterpart to the wordmark.
 * A glass squircle holding a heavy italic skewed "S" with a layered outline,
 * 3D extrude, emerald spray glow and a small drip.
 */
export function GraffitiMark({ size = 32, className = "" }: GraffitiMarkProps) {
  const letter = size * 0.66;
  const stroke = Math.max(1, letter * 0.06);
  const extrude = Math.max(1, letter * 0.05);

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "radial-gradient(120% 120% at 30% 20%, rgba(16,185,129,0.18), rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.02))",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 22px rgba(16,185,129,0.25)",
      }}
    >
      <span
        style={{
          fontSize: `${letter}px`,
          lineHeight: 1,
          fontWeight: 900,
          fontStyle: "italic",
          fontFamily: '"Arial Black", "Archivo Black", system-ui, sans-serif',
          color: "#ffffff",
          WebkitTextStroke: `${stroke}px rgba(0,0,0,0.92)`,
          transform: "skewX(-11deg) rotate(-3deg)",
          display: "inline-block",
          textShadow: [
            outlineRing(letter * 0.05, "rgba(0,0,0,0.9)"),
            `${extrude}px ${extrude}px 0 rgba(0,0,0,0.55)`,
            `${extrude * 1.8}px ${extrude * 1.8}px ${extrude * 1.6}px rgba(0,0,0,0.65)`,
            `0 0 ${letter * 0.65}px rgba(16,185,129,0.55)`,
          ].join(", "),
        }}
      >
        S
      </span>
      {/* small drip from the S */}
      <span
        className="absolute"
        style={{
          left: "46%",
          bottom: size * 0.06,
          width: size * 0.05,
          height: size * 0.2,
          borderRadius: "0 0 999px 999px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.8), rgba(16,185,129,0.6))",
          transform: "skewX(-10deg)",
        }}
      />
    </span>
  );
}

function Drip({ left, h, w }: { left: string; h: number; w: number }) {
  return (
    <span
      className="absolute top-0"
      style={{
        left,
        width: w,
        height: h,
        borderRadius: "0 0 999px 999px",
        background: "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.5) 40%, rgba(16,185,129,0.6) 100%)",
        boxShadow: "0 0 10px rgba(16,185,129,0.45)",
        transform: "skewX(-10deg)",
      }}
    >
      {/* paint bead at the tip */}
      <span
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom: -w * 0.8,
          width: w * 1.9,
          height: w * 1.9,
          borderRadius: "999px",
          background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.7), rgba(16,185,129,0.75))",
          boxShadow: "0 0 10px rgba(16,185,129,0.5)",
        }}
      />
    </span>
  );
}
