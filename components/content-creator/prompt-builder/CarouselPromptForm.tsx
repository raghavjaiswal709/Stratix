"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const CAROUSEL_LANGUAGES = ["Hinglish", "English"] as const;

export type CarouselSource = "concept" | "book";

// Two independent carousel generators share this form. "concept" is the default
// general explainer and needs nothing but a topic; "book" swaps in the
// book-insight fields. Only the selected source's fields are rendered — and only
// its params are sent — so a built prompt never carries the other mode's inputs.
export function CarouselPromptForm({
  source,
  onSourceChange,
  topic,
  onTopicChange,
  description,
  onDescriptionChange,
  book,
  onBookChange,
  author,
  onAuthorChange,
  point,
  onPointChange,
  slides,
  onSlidesChange,
  language,
  onLanguageChange,
}: {
  source: CarouselSource;
  onSourceChange: (v: CarouselSource) => void;
  topic: string;
  onTopicChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  book: string;
  onBookChange: (v: string) => void;
  author: string;
  onAuthorChange: (v: string) => void;
  point: string;
  onPointChange: (v: string) => void;
  slides: number;
  onSlidesChange: (n: number) => void;
  language: string;
  onLanguageChange: (v: string) => void;
}) {
  const selectArrowStyle = {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
  } as const;

  const inputClass =
    "w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.25]";

  return (
    <div className="space-y-3">
      {/* Source selector — which carousel generator to build from */}
      <div>
        <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
          Explain from
        </label>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          {(
            [
              { id: "concept", label: "Concept / Fact" },
              { id: "book", label: "Book Insight" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSourceChange(opt.id)}
              className={cn(
                "flex-1 px-2.5 py-1.5 rounded-md text-[10.5px] font-bold uppercase tracking-wider transition-all cursor-pointer border",
                source === opt.id
                  ? "bg-white/[0.10] text-white border-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                  : "text-white/40 hover:text-white/70 hover:bg-white/[0.04] border-transparent"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-0.5 text-[10px] text-white/30 leading-relaxed">
          {source === "concept"
            ? "Explains any concept, rule, event or fact. Only a topic is needed — no book or author involved."
            : "Builds the carousel around one insight from a real book, opening on a book + author hook."}
        </p>
      </div>

      {source === "concept" ? (
        <>
          <div>
            <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
              Topic <span className="text-white/30 normal-case font-normal">(required)</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
              placeholder="e.g. Closing Auction, Why RBI Cuts Rates, How to file your ITR"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
              Description / Angle <span className="text-white/30 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="e.g. focus on what actually changes for a normal SIP investor — skip the trader detail"
              rows={3}
              className={cn(inputClass, "resize-none")}
            />
            <span className="mt-1 px-0.5 block text-[10px] text-white/25">
              Leave blank and the angle gets picked for you.
            </span>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
              Book <span className="text-white/30 normal-case font-normal">(required)</span>
            </label>
            <input
              type="text"
              value={book}
              onChange={(e) => onBookChange(e.target.value)}
              placeholder="e.g. Trading in the Zone"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
              Author <span className="text-white/30 normal-case font-normal">(required)</span>
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => onAuthorChange(e.target.value)}
              placeholder="e.g. Mark Douglas"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
              Point / Insight <span className="text-white/30 normal-case font-normal">(required)</span>
            </label>
            <textarea
              value={point}
              onChange={(e) => onPointChange(e.target.value)}
              placeholder="e.g. Regression to the mean — extreme performances tend to be followed by more average ones, a statistical fact often misread as a trader's skill improving or declining."
              rows={3}
              className={cn(inputClass, "resize-none")}
            />
          </div>
        </>
      )}

      <div>
        <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">Slides</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSlidesChange(Math.max(6, slides - 1))}
            disabled={slides <= 6}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-white/60 border border-white/[0.10] bg-white/[0.05] hover:bg-white/[0.10] active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-8 text-center text-[13px] font-bold text-white tabular-nums">{slides}</span>
          <button
            type="button"
            onClick={() => onSlidesChange(Math.min(12, slides + 1))}
            disabled={slides >= 12}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-white/60 border border-white/[0.10] bg-white/[0.05] hover:bg-white/[0.10] active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] text-white/25">6–12 slides (cover + outro included)</span>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">Language</label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.10] text-white/70 focus:outline-none focus:border-white/[0.25] cursor-pointer appearance-none pr-6"
          style={selectArrowStyle}
        >
          {CAROUSEL_LANGUAGES.map((opt) => (
            <option key={opt} value={opt} className="bg-[#1a1a1a] text-white">
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
