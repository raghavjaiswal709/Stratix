"use client";

const VIDEO_LANGUAGES = ["Hinglish", "English"] as const;

export function VideoPromptForm({
  duration,
  onDurationChange,
  language,
  onLanguageChange,
}: {
  duration: number;
  onDurationChange: (n: number) => void;
  language: string;
  onLanguageChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Duration</label>
          <span className="text-[11px] font-bold text-white tabular-nums">{duration}s</span>
        </div>
        <input
          type="range"
          min={40}
          max={60}
          step={1}
          value={duration}
          onChange={(e) => onDurationChange(Number(e.target.value))}
          style={{ accentColor: "#ffffff" }}
          className="w-full cursor-pointer"
        />
        <div className="flex items-center justify-between text-[9.5px] text-white/25 mt-0.5">
          <span>40s</span>
          <span>60s</span>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest block mb-1.5">Language</label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] border border-white/[0.10] text-white/70 focus:outline-none focus:border-white/[0.25] cursor-pointer appearance-none pr-6"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23ffffff44' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
          }}
        >
          {VIDEO_LANGUAGES.map((opt) => (
            <option key={opt} value={opt} className="bg-[#1a1a1a] text-white">
              {opt}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
