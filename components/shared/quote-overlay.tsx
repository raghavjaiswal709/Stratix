"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Shuffle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { StratixWordmark } from "./stratix-logo";
import { HftBackground } from "./hft-background";
import type { Quote } from "./quotes-data";

// Cinematic full-screen quote experience. Loaded lazily (next/dynamic) so
// none of this — framer-motion choreography, the HFT canvas — ever ships in
// the dashboard's critical chunk. `quotes` comes from the caller (admin-
// managed, see /admin/quotes) so this component has no data source of its own.

function randomIndex(length: number, exclude?: number): number {
  let i = Math.floor(Math.random() * length);
  if (exclude !== undefined && length > 1) {
    while (i === exclude) i = Math.floor(Math.random() * length);
  }
  return i;
}

export function QuoteOverlay({ quotes, onClose }: { quotes: Quote[]; onClose: () => void }) {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(() => randomIndex(quotes.length));
  const [visible, setVisible] = useState(true);
  // Framer's `animate` prop on the outer shell would silently never resolve
  // past `initial` in this component (motion value stuck at opacity 0 despite
  // a correct visible=true target — reproducible even in isolation), so the
  // outer open/close fade is plain CSS instead. `entered` flips true one
  // frame after mount so the fade-in actually transitions rather than
  // starting already-at-100%.
  const [entered, setEntered] = useState(false);
  const open = entered && visible;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const quote = quotes[index];
  const words = useMemo(() => quote.text.split(" "), [quote]);

  // Long quotes tighten the per-word stagger so the reveal always lands
  // between ~0.9s and ~1.8s regardless of quote length.
  const stagger = prefersReducedMotion ? 0 : Math.min(0.055, Math.max(0.022, 1.25 / words.length));
  const revealDelay = prefersReducedMotion ? 0 : 0.5;
  const authorDelay = revealDelay + words.length * stagger + 0.3;

  // Fade out, then unmount on a fixed timer — deliberately NOT tied to a
  // framer-motion completion callback: with the nested AnimatePresence below,
  // exit/complete callbacks can silently never fire, leaving a full-screen
  // invisible overlay blocking the app.
  const closingRef = useRef(false);
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    window.setTimeout(onClose, 320);
  }, [onClose]);
  const nextQuote = useCallback(() => setIndex((i) => randomIndex(quotes.length, i)), [quotes.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        nextQuote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, nextQuote]);

  const wordVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1 },
      }
    : {
        hidden: { opacity: 0, y: "0.55em", filter: "blur(12px)", scale: 0.96 },
        show: {
          opacity: 1,
          y: "0em",
          filter: "blur(0px)",
          scale: 1,
          transition: { type: "spring" as const, damping: 26, stiffness: 280 },
        },
      };

  return (
    // Outer shell open/close uses plain CSS transitions rather than framer's
    // `animate` prop — driving it through framer here left the motion value
    // stuck at its `initial` opacity despite a correct animate target,
    // independent of the nested AnimatePresence below. CSS transitions on a
    // boolean class/style flip are unambiguous and side-step the issue
    // entirely. Inner content (word reveal, quote-switch choreography)
    // still uses framer-motion, untouched.
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 transition-opacity ease-in-out ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      style={{ transitionDuration: prefersReducedMotion ? "0ms" : "320ms" }}
      onClick={close}
    >
      <HftBackground />

      {/* Vignette — pulls the eye to center, dims the canvas edges */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.75)_100%)]" />

      <div
        className="relative z-10 max-w-4xl w-full text-center transition-all ease-out"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.96)",
          filter: open ? "blur(0px)" : "blur(4px)",
          transitionDuration: prefersReducedMotion ? "0ms" : "320ms",
        }}
        onClick={(e) => e.stopPropagation()}
      >
            <button
              onClick={close}
              className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors hover:bg-white/10 rounded-full"
              aria-label="Close quote"
            >
              <X className="w-8 h-8" />
            </button>

            {/* Graffiti Stratix logo */}
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, rotate: -6 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 14 }}
              className="flex justify-center mb-10 md:mb-14"
            >
              <StratixWordmark size={40} glow tone="light" className="md:scale-125" />
            </motion.div>

            {/* Keyed by quote index — switching quotes plays a full
                exit → enter choreography via AnimatePresence. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                exit={
                  prefersReducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: -16, filter: "blur(10px)", transition: { duration: 0.28, ease: "easeIn" } }
                }
              >
                <div className="text-white relative">
                  <motion.span
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: -12 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 160, damping: 18, delay: revealDelay * 0.4 }}
                    className="absolute -top-10 -left-6 text-white/[0.08] text-8xl font-serif select-none"
                  >
                    &ldquo;
                  </motion.span>

                  <motion.h1
                    initial="hidden"
                    animate="show"
                    transition={{ staggerChildren: stagger, delayChildren: revealDelay }}
                    className="relative text-3xl md:text-5xl font-bold tracking-tight leading-[1.15]"
                    aria-label={quote.text}
                  >
                    {words.map((word, i) => (
                      <motion.span
                        key={`${index}-${i}`}
                        variants={wordVariants}
                        className="inline-block whitespace-pre bg-clip-text text-transparent bg-gradient-to-b from-white to-white/65 will-change-transform"
                      >
                        {word}
                        {i < words.length - 1 ? " " : ""}
                      </motion.span>
                    ))}

                    {/* Light sweep across the text once the words settle */}
                    {!prefersReducedMotion && (
                      <motion.span
                        initial={{ x: "-130%", opacity: 0 }}
                        animate={{ x: "130%", opacity: [0, 1, 0] }}
                        transition={{ delay: authorDelay + 0.1, duration: 1.1, ease: "easeInOut" }}
                        className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12"
                      />
                    )}
                  </motion.h1>

                  <motion.span
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: 12 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 160, damping: 18, delay: authorDelay * 0.7 }}
                    className="absolute -bottom-10 -right-6 text-white/[0.06] text-8xl font-serif select-none"
                  >
                    &rdquo;
                  </motion.span>
                </div>

                {/* Author attribution — lines draw outward, name fades up */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: authorDelay, duration: 0.5, ease: "easeOut" }}
                  className="mt-8 flex items-center justify-center gap-3"
                >
                  <motion.span
                    initial={prefersReducedMotion ? undefined : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: authorDelay + 0.15, duration: 0.5, ease: "easeOut" }}
                    className="h-px w-8 origin-right bg-gradient-to-r from-transparent to-white/30"
                  />
                  <motion.span
                    initial={prefersReducedMotion ? undefined : { letterSpacing: "0.45em", opacity: 0 }}
                    animate={{ letterSpacing: "0.25em", opacity: 1 }}
                    transition={{ delay: authorDelay + 0.1, duration: 0.7, ease: "easeOut" }}
                    className="text-sm md:text-base font-medium uppercase text-white/55"
                  >
                    {quote.author}
                  </motion.span>
                  <motion.span
                    initial={prefersReducedMotion ? undefined : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: authorDelay + 0.15, duration: 0.5, ease: "easeOut" }}
                    className="h-px w-8 origin-left bg-gradient-to-l from-transparent to-white/30"
                  />
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: authorDelay + 0.35, duration: 0.5 }}
              className="mt-10 flex items-center justify-center gap-3"
            >
              <motion.button
                onClick={close}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.04 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium tracking-wide transition-colors border border-white/10 hover:border-white/30 text-lg shadow-[0_0_40px_rgba(255,255,255,0.06)] hover:shadow-[0_0_60px_rgba(255,255,255,0.12)]"
              >
                Enter Dashboard
              </motion.button>
              <motion.button
                onClick={nextQuote}
                whileHover={prefersReducedMotion ? undefined : { scale: 1.06, rotate: 8 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="p-4 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 hover:border-white/25 text-white/60 hover:text-white transition-colors"
                aria-label="Show another quote"
                title="Another quote (Space)"
              >
                <Shuffle className="w-5 h-5" />
              </motion.button>
            </motion.div>

            {/* Counter + keyboard hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: authorDelay + 0.6, duration: 0.6 }}
              className="mt-6 text-[11px] font-mono tracking-widest text-white/25 select-none"
            >
              {String(index + 1).padStart(3, "0")} / {quotes.length}
              <span className="mx-3 text-white/15">·</span>
              ENTER to begin
              <span className="mx-3 text-white/15">·</span>
              SPACE for another
            </motion.p>
      </div>
    </div>
  );
}
