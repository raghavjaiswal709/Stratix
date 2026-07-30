"use client";

import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAROUSEL_TEMPLATE } from "@/lib/prompt-templates/carousel-template";
import { VIDEO_TEMPLATE } from "@/lib/prompt-templates/video-template";
import { MOTION_TIMELINE_TEMPLATE } from "@/lib/prompt-templates/motion-timeline-template";
import { buildPrompt } from "@/lib/buildPrompt";
import { CarouselPromptForm } from "./CarouselPromptForm";
import { VideoPromptForm } from "./VideoPromptForm";
import { PromptOutput } from "./PromptOutput";

type Mode = "carousel" | "video" | "motion";

const MOTION_PACE_OPTIONS = ["Balanced", "Subtle / editorial", "Punchy / high-energy"] as const;

const STYLE_OPTIONS = ["Auto (recommended)", "notebook-doodle", "editorial-serif"] as const;
const STORAGE_KEY = "stratix:content-creator:prompt-builder";
const MIN_TOPIC_LENGTH = 3;

export function PromptBuilder() {
  const [mode, setMode] = useState<Mode>("carousel");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState<string>(STYLE_OPTIONS[0]);
  const [part, setPart] = useState("");
  const [book, setBook] = useState("");
  const [author, setAuthor] = useState("");
  const [point, setPoint] = useState("");
  const [slides, setSlides] = useState(10);
  const [carouselLanguage, setCarouselLanguage] = useState("Hinglish");
  const [duration, setDuration] = useState(45);
  const [videoLanguage, setVideoLanguage] = useState("Hinglish");
  const [motionPace, setMotionPace] = useState<string>(MOTION_PACE_OPTIONS[0]);
  const [motionNotes, setMotionNotes] = useState("");
  const [output, setOutput] = useState<string | null>(null);

  // Hydrate last-used selections (§3.6 nice-to-have) post-mount only, so the
  // SSR and first client render both start from the same hardcoded defaults.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.mode === "carousel" || saved.mode === "video" || saved.mode === "motion") setMode(saved.mode);
      if (typeof saved.topic === "string") setTopic(saved.topic);
      if (typeof saved.style === "string") setStyle(saved.style);
      if (typeof saved.part === "string") setPart(saved.part);
      if (typeof saved.book === "string") setBook(saved.book);
      if (typeof saved.author === "string") setAuthor(saved.author);
      if (typeof saved.point === "string") setPoint(saved.point);
      if (typeof saved.slides === "number") setSlides(saved.slides);
      if (typeof saved.carouselLanguage === "string") setCarouselLanguage(saved.carouselLanguage);
      if (typeof saved.duration === "number") setDuration(saved.duration);
      if (typeof saved.videoLanguage === "string") setVideoLanguage(saved.videoLanguage);
      if (typeof saved.motionPace === "string") setMotionPace(saved.motionPace);
      if (typeof saved.motionNotes === "string") setMotionNotes(saved.motionNotes);
    } catch {
      // corrupt/blocked storage — keep defaults
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          topic,
          style,
          part,
          book,
          author,
          point,
          slides,
          carouselLanguage,
          duration,
          videoLanguage,
          motionPace,
          motionNotes,
        })
      );
    } catch {
      // quota/blocked storage — not essential, ignore
    }
  }, [mode, topic, style, part, book, author, point, slides, carouselLanguage, duration, videoLanguage, motionPace, motionNotes]);

  const trimmedTopic = topic.trim();
  const trimmedBook = book.trim();
  const trimmedAuthor = author.trim();
  const trimmedPoint = point.trim();
  const canBuild =
    mode === "carousel"
      ? trimmedBook.length > 0 && trimmedAuthor.length > 0 && trimmedPoint.length >= MIN_TOPIC_LENGTH
      : mode === "motion"
      ? true
      : trimmedTopic.length >= MIN_TOPIC_LENGTH;

  function handleBuild() {
    if (!canBuild) return;
    // The motion timeline prompt needs no topic — its inputs are the layout
    // JSON and the transcript the user pastes underneath it.
    if (mode === "motion") {
      setOutput(
        buildPrompt(MOTION_TIMELINE_TEMPLATE, {
          PACE: motionPace,
          NOTES: motionNotes.trim(),
        })
      );
      return;
    }
    if (mode === "carousel") {
      setOutput(
        buildPrompt(CAROUSEL_TEMPLATE, {
          BOOK: trimmedBook,
          AUTHOR: trimmedAuthor,
          POINT: trimmedPoint,
          SLIDES: slides,
          LANGUAGE: carouselLanguage,
        })
      );
      return;
    }
    setOutput(
      buildPrompt(VIDEO_TEMPLATE, {
        TOPIC: trimmedTopic,
        STYLE: style,
        DURATION: duration,
        LANGUAGE: videoLanguage,
        PART: part.trim(),
      })
    );
  }

  function handleReset() {
    setTopic("");
    setStyle(STYLE_OPTIONS[0]);
    setPart("");
    setBook("");
    setAuthor("");
    setPoint("");
    setSlides(10);
    setCarouselLanguage("Hinglish");
    setDuration(45);
    setVideoLanguage("Hinglish");
    setMotionPace(MOTION_PACE_OPTIONS[0]);
    setMotionNotes("");
    setOutput(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Banner info */}
      <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl space-y-2">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-white/50" />
          <span className="text-[11px] font-bold text-white uppercase tracking-wider">Prompt Builder</span>
        </div>
        <p className="text-[11px] text-white/40 leading-relaxed">
          Assembles a ready-to-paste meta-prompt from the Carousel or Video Reel template. Pick your options, hit Build Prompt, then copy the result into your own AI chat or image generator — nothing here calls an AI or generates an image.
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        {(["carousel", "video", "motion"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer border",
              mode === m
                ? "bg-white/[0.10] text-white border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.04] border-transparent"
            )}
          >
            {m === "carousel" ? "Carousel" : m === "video" ? "Video Reel" : "Motion Sync"}
          </button>
        ))}
      </div>

      {/* Shared + mode-specific fields */}
      <div className="space-y-3">
        {mode === "motion" ? (
          <>
            <div className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-1.5">
              <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider block">
                What this prompt does
              </span>
              <p className="text-[10.5px] text-white/40 leading-relaxed">
                It turns a decomposed motion-video batch plus a word-level transcript into a timeline Stratix can play
                back frame-accurately. Build it, copy it, then paste it into an AI chat followed by the layout JSON (Motion
                Video → Copy JSON) and your timestamped CSV. Paste the JSON it returns into Motion Video → AI Timeline.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
                Animation pace
              </label>
              <select
                value={motionPace}
                onChange={(e) => setMotionPace(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.10] text-white/70 focus:outline-none focus:border-white/[0.25] cursor-pointer appearance-none pr-6"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                }}
              >
                {MOTION_PACE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#1a1a1a] text-white">
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
                Direction notes <span className="text-white/30 normal-case font-normal">(optional)</span>
              </label>
              <textarea
                value={motionNotes}
                onChange={(e) => setMotionNotes(e.target.value)}
                placeholder="e.g. hold slide 1 through the whole hook; no camera moves on the chart slides"
                className="w-full min-h-[64px] resize-y px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.25]"
              />
            </div>
          </>
        ) : mode === "carousel" ? (
          <CarouselPromptForm
            book={book}
            onBookChange={setBook}
            author={author}
            onAuthorChange={setAuthor}
            point={point}
            onPointChange={setPoint}
            slides={slides}
            onSlidesChange={setSlides}
            language={carouselLanguage}
            onLanguageChange={setCarouselLanguage}
          />
        ) : (
          <>
            <div>
              <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
                Topic <span className="text-white/30 normal-case font-normal">(required)</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Stop Loss, Options Trading, Why RBI Cuts Rates"
                className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.25]"
              />
              <div className="mt-1 px-0.5">
                <span className={cn("text-[10px]", canBuild ? "text-white/25" : "text-amber-400/70")}>
                  {canBuild ? `${trimmedTopic.length} characters` : `Enter at least ${MIN_TOPIC_LENGTH} characters`}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.10] text-white/70 focus:outline-none focus:border-white/[0.25] cursor-pointer appearance-none pr-6"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                }}
              >
                {STYLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} className="bg-[#1a1a1a] text-white">
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <VideoPromptForm
              duration={duration}
              onDurationChange={setDuration}
              language={videoLanguage}
              onLanguageChange={setVideoLanguage}
            />

            <div>
              <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
                Part / Episode <span className="text-white/30 normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={part}
                onChange={(e) => setPart(e.target.value)}
                placeholder='e.g. "Part 4" or "E6"'
                className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.25]"
              />
            </div>
          </>
        )}
      </div>

      {/* Build + Reset */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleBuild}
          disabled={!canBuild}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all active:scale-95 cursor-pointer border border-transparent",
            canBuild
              ? "bg-white text-black hover:bg-white/90 shadow-[0_4px_12px_rgba(255,255,255,0.12)]"
              : "bg-white/[0.06] text-white/25 cursor-not-allowed"
          )}
        >
          <Wand2 className="h-4 w-4" />
          Build Prompt
        </button>
        <button
          type="button"
          onClick={handleReset}
          title="Reset to defaults"
          className="px-3 py-3 rounded-xl text-[11px] font-semibold text-white/40 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition cursor-pointer"
        >
          Reset
        </button>
      </div>

      {/* Output */}
      <PromptOutput text={output} />
    </div>
  );
}
