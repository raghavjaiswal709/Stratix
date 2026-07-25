"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Layers, Tags, Gauge, CheckCircle2, type LucideIcon } from "lucide-react";
import { ShootingStarMagnet } from "@/components/trade/dashboard/portfolio-ai";

const PHASES: { label: string; icon: LucideIcon }[] = [
  { label: "Scanning articles for gold, forex & crypto relevance…", icon: Search },
  { label: "Classifying by impact tier…", icon: Layers },
  { label: "Tagging sentiment per instrument…", icon: Tags },
  { label: "Scoring market impact…", icon: Gauge },
  { label: "Finalizing results…", icon: CheckCircle2 },
];

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

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => (p + 1) % PHASES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-6 overflow-hidden rounded-2xl border border-white/[0.12] py-16 px-6"
      style={{
        background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.03), transparent 70%), #0c0d12",
      }}
    >
      {/* High-Speed Bouncy Shooting Star Magnet Animation */}
      <div className="my-2 flex items-center justify-center">
        <ShootingStarMagnet />
      </div>

      {/* Live counter + progress bar */}
      <div className="flex w-64 flex-col items-center gap-2">
        <div className="flex items-baseline gap-1.5 font-mono">
          <motion.span
            key={Math.round(progress)}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="text-lg font-bold text-white tabular-nums"
          >
            {Math.min(articleCount, Math.round((progress / 96) * articleCount)) || 0}
          </motion.span>
          <span className="text-xs text-white/40">/ {articleCount > 0 ? articleCount : "—"} articles</span>
        </div>
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-white"
            animate={{ width: `${progress}%` }}
            transition={{ ease: "easeOut", duration: 0.15 }}
          />
          <motion.div
            className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/50 to-transparent"
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
            className="text-xs font-medium tracking-wide text-white/80"
          >
            {PHASES[phase].label}
          </motion.p>
        </AnimatePresence>
      </div>

      <p className="relative text-[10px] text-white/30">AI is filtering news — this usually takes a few seconds</p>
    </div>
  );
}
