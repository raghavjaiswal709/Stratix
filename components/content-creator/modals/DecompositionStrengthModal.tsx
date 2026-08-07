"use client";

import { useEffect, useState } from "react";
import { Layers, Scissors, ScanSearch, X } from "lucide-react";
import type { DecompositionStrength } from "../types";

/**
 * How deep to cut, asked once per upload.
 *
 * There is no right default here, which is exactly why it is a question. The
 * three settings are not quality levels — they are different readings of the
 * same poster, and the one you want depends on what you are about to do with
 * it:
 *
 *   Low       The design system's own unit. A collage part is ONE element,
 *             addressed by its caption, never broken into the objects drawn
 *             inside it. Three parts give three cards and three captions —
 *             which is the whole deck for a paper-cut reel.
 *   Standard  Those cards, plus the few props each one draws, for a scene
 *             where something inside a card should move on its own.
 *   High      Every shape the drawing can be separated into.
 *
 * See scripts/collage_zones.py · STRENGTH_PROFILES for what each one measures.
 */

const OPTIONS: {
  id: DecompositionStrength;
  label: string;
  headline: string;
  detail: string;
  Icon: typeof Layers;
}[] = [
  {
    id: "low",
    label: "Low",
    headline: "One element per collage part",
    detail:
      "Each part is cut whole, edge to edge, with its caption read verbatim and bound to it. A 3-part slide gives 3 cards + 3 captions. Captions never animate on their own.",
    Icon: Layers,
  },
  {
    id: "standard",
    label: "Standard",
    headline: "Parts, plus the props inside them",
    detail:
      "Everything Low gives, and the few distinct objects each drawing can be separated into — enough to animate something inside a card without shredding it.",
    Icon: Scissors,
  },
  {
    id: "high",
    label: "High",
    headline: "Every shape it can isolate",
    detail:
      "The finest cut available: every distinct shape inside every part becomes its own layer. Most layers, longest run, most to tidy up afterwards.",
    Icon: ScanSearch,
  },
];

export function DecompositionStrengthModal({
  fileCount,
  initial = "low",
  onCancel,
  onConfirm,
}: {
  fileCount: number;
  initial?: DecompositionStrength;
  onCancel: () => void;
  onConfirm: (strength: DecompositionStrength) => void;
}) {
  const [choice, setChoice] = useState<DecompositionStrength>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm(choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choice, onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-zinc-950/95 shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-sm font-bold text-white">Decomposition strength</h2>
            <p className="text-[11px] text-white/50 mt-0.5">
              {fileCount} image{fileCount === 1 ? "" : "s"} ready — how deep should each one be cut?
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1 rounded text-white/40 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-4 space-y-2">
          {OPTIONS.map(({ id, label, headline, detail, Icon }) => {
            const active = choice === id;
            return (
              <button
                key={id}
                onClick={() => setChoice(id)}
                aria-pressed={active}
                className={`w-full text-left rounded-xl border p-3 flex gap-3 transition-colors cursor-pointer ${
                  active
                    ? "border-white/40 bg-white/[0.09]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20"
                }`}
              >
                <div
                  className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center border ${
                    active ? "border-white/30 bg-white/15 text-white" : "border-white/10 bg-white/5 text-white/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-bold text-white">{label}</span>
                    <span className="text-[10.5px] text-white/55">{headline}</span>
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-white/45 mt-1">{detail}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 p-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(choice)}
            className="px-4 py-1.5 rounded-lg text-[11px] font-bold text-zinc-950 bg-white hover:bg-white/90 cursor-pointer"
          >
            Decompose
          </button>
        </div>
      </div>
    </div>
  );
}
