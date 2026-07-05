"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Layers, Tags, Gauge, CheckCircle2, type LucideIcon } from "lucide-react";

const PHASES: { label: string; icon: LucideIcon }[] = [
  { label: "Scanning articles for gold, forex & crypto relevance…", icon: Search },
  { label: "Classifying by impact tier…", icon: Layers },
  { label: "Tagging sentiment per instrument…", icon: Tags },
  { label: "Scoring market impact…", icon: Gauge },
  { label: "Finalizing results…", icon: CheckCircle2 },
];

// Rings rotate at different radii/speeds/directions with 1-2 orbiting
// satellite nodes each — purely decorative, but gives the "AI actively
// working" impression real network-progress events can't (the backend
// doesn't stream progress, so this is a simulated but purposeful animation).
const RINGS = [
  { size: 96, duration: 6, reverse: false, satellites: 1 },
  { size: 152, duration: 9, reverse: true, satellites: 2 },
  { size: 208, duration: 13, reverse: false, satellites: 1 },
];

function useDriftingParticles(count: number) {
  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${8 + ((i * 37) % 84)}%`,
        top: `${10 + ((i * 53) % 80)}%`,
        delay: (i % 6) * 0.6,
        duration: 5 + (i % 4),
      })),
    [count]
  );
}

// Simulated progress — asymptotically approaches ~96% and never quite
// finishes on its own (there's no real backend progress stream); it just
// gets unmounted the moment the actual fetch resolves, so it always reads
// as "still working" rather than falsely reporting completion.
function useSimulatedProgress(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsedSec = (Date.now() - start) / 1000;
      const tau = 6;
      setProgress(Math.min(96, 96 * (1 - Math.exp(-elapsedSec / tau))));
    }, 120);
    return () => clearInterval(id);
  }, []);
  return progress;
}

export function AiFilteringOverlay({ articleCount }: { articleCount: number }) {
  const [phase, setPhase] = useState(0);
  const progress = useSimulatedProgress();
  const particles = useDriftingParticles(10);
  const PhaseIcon = PHASES[phase].icon;

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => (p + 1) % PHASES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative flex flex-col items-center justify-center gap-7 overflow-hidden rounded-2xl border border-emerald-500/[0.15] py-24 px-6"
      style={{
        background: "radial-gradient(circle at 50% 35%, rgba(16,185,129,0.06), rgba(0,0,0,0) 60%), #0a0c0a",
      }}
    >
      {/* Circuit-grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16,185,129,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.5) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Vertical scanning sweep */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 h-32 bg-gradient-to-b from-transparent via-emerald-400/[0.06] to-transparent"
        animate={{ top: ["-15%", "115%"] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
      />

      {/* Ambient drifting particles */}
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="pointer-events-none absolute h-[3px] w-[3px] rounded-full bg-emerald-400/60"
          style={{ left: p.left, top: p.top }}
          animate={{ opacity: [0, 0.9, 0], y: [0, -14, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
        />
      ))}

      {/* Orbital core */}
      <div className="relative flex h-56 w-56 items-center justify-center">
        {RINGS.map((ring, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-emerald-400/20"
            style={{ width: ring.size, height: ring.size }}
            animate={{ rotate: ring.reverse ? -360 : 360 }}
            transition={{ duration: ring.duration, repeat: Infinity, ease: "linear" }}
          >
            {Array.from({ length: ring.satellites }, (_, s) => (
              <span
                key={s}
                className="absolute h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_2px_rgba(52,211,153,0.7)]"
                style={{
                  top: -3,
                  left: "50%",
                  transform: `rotate(${(360 / ring.satellites) * s}deg) translateX(0px)`,
                  transformOrigin: `1px ${ring.size / 2 + 3}px`,
                }}
              />
            ))}
          </motion.div>
        ))}

        {/* Outer pulse wash */}
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full border border-emerald-400/25"
            initial={{ width: 40, height: 40, opacity: 0.6 }}
            animate={{ width: 224, height: 224, opacity: 0 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut", delay: i * 0.85 }}
          />
        ))}

        {/* Glowing core */}
        <motion.div
          className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/50"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.35), rgba(16,185,129,0.05) 70%)" }}
          animate={{ scale: [1, 1.1, 1], boxShadow: ["0 0 20px rgba(16,185,129,0.25)", "0 0 40px rgba(16,185,129,0.5)", "0 0 20px rgba(16,185,129,0.25)"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
              transition={{ duration: 0.35 }}
            >
              <PhaseIcon className="h-6 w-6 text-emerald-300" />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Live counter + progress bar */}
      <div className="flex w-64 flex-col items-center gap-2">
        <div className="flex items-baseline gap-1.5 font-mono">
          <motion.span
            key={Math.round(progress)}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="text-lg font-bold text-emerald-300 tabular-nums"
          >
            {Math.min(articleCount, Math.round((progress / 96) * articleCount)) || 0}
          </motion.span>
          <span className="text-xs text-white/25">/ {articleCount > 0 ? articleCount : "—"} articles</span>
        </div>
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-300"
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.15 }}
          />
          <motion.div
            className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ left: ["-10%", "110%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>

      {/* Cycling phase text */}
      <div className="flex h-5 items-center overflow-hidden text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-xs font-medium tracking-wide text-emerald-300/90"
          >
            {PHASES[phase].label}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="relative text-[10px] text-white/25">AI is working — this usually takes a few seconds</p>
    </div>
  );
}
