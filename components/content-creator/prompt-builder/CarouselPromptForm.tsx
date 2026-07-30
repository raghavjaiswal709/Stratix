"use client";

import { Minus, Plus } from "lucide-react";

const CAROUSEL_LANGUAGES = ["Hinglish", "English"] as const;

export function CarouselPromptForm({
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

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">
          Book <span className="text-white/30 normal-case font-normal">(required)</span>
        </label>
        <input
          type="text"
          value={book}
          onChange={(e) => onBookChange(e.target.value)}
          placeholder="e.g. Trading in the Zone"
          className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.25]"
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
          className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.25]"
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
          className="w-full px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.25] resize-none"
        />
      </div>

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
