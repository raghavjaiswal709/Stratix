"use client";

// ─── ReplayBar ────────────────────────────────────────────────────────────────
// Control bar for bar-by-bar replay. Shows play/pause/step/stop buttons,
// speed selector, current candle timestamp, and select-start-bar toggle.

import type { ReplayState, ReplaySpeed } from "./types";

const SPEEDS: ReplaySpeed[] = [0.5, 1, 2, 5, 10, "max"];

interface Props {
  replay:           ReplayState;
  currentCandle:    { time: number; close: number } | null; // last visible candle
  totalCandles:     number;
  hasData:          boolean;
  onSelectStart:    () => void;
  onPlay:           () => void;
  onPause:          () => void;
  onNext:           () => void;
  onPrev:           () => void;
  onJumpToStart:    () => void;
  onStop:           () => void;
  onSpeedChange:    (speed: ReplaySpeed) => void;
}

export function ReplayBar({
  replay, currentCandle, totalCandles, hasData,
  onSelectStart, onPlay, onPause, onNext, onPrev, onJumpToStart, onStop,
  onSpeedChange,
}: Props) {
  const { active, playing, currentIdx, startIdx, speed, selectingStart } = replay;
  const atEnd    = active && currentIdx >= totalCandles - 1;
  const atStart  = active && currentIdx <= startIdx;
  const revealed = active ? currentIdx - startIdx : 0;

  return (
    <div className={`shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#2a2a2a] ${
      selectingStart ? "bg-[#1a1500]" : "bg-[#0f0f0f]"
    } transition-colors`}>

      {/* ── Select-start-bar toggle ───────────────────────────────────── */}
      <button
        disabled={!hasData || (active && playing)}
        onClick={onSelectStart}
        className={`px-3 py-1.5 text-[11px] font-semibold rounded-md border transition-colors disabled:opacity-30 ${
          selectingStart
            ? "bg-[#F0B90B] text-black border-[#F0B90B]"
            : "bg-[#161616] text-[#F0B90B] border-[#F0B90B]/40 hover:border-[#F0B90B]"
        }`}
        title="Click a candle on the chart to set the replay start point"
      >
        {selectingStart ? "▸ Click a candle…" : "✦ Set Start Bar"}
      </button>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="h-5 w-px bg-[#2a2a2a]" />

      {/* ── Transport buttons ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        <CtrlBtn title="Jump to start"  disabled={!active || atStart} onClick={onJumpToStart}>◀◀</CtrlBtn>
        <CtrlBtn title="Previous candle" disabled={!active || atStart || playing} onClick={onPrev}>◀</CtrlBtn>

        {playing ? (
          <CtrlBtn title="Pause" disabled={!active} onClick={onPause} highlight>⏸</CtrlBtn>
        ) : (
          <CtrlBtn title="Play" disabled={!active || atEnd} onClick={onPlay} highlight>▶</CtrlBtn>
        )}

        <CtrlBtn title="Next candle" disabled={!active || atEnd || playing} onClick={onNext}>▶▶</CtrlBtn>
        <CtrlBtn title="Stop replay — returns to full chart" disabled={!active} onClick={onStop}>⏹</CtrlBtn>
      </div>

      {/* ── Speed selector ────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-[#4a5568] uppercase tracking-widest">Speed</span>
        <div className="flex gap-px rounded-md overflow-hidden border border-[#2a2a2a]">
          {SPEEDS.map((s) => (
            <button
              key={String(s)}
              disabled={!active}
              onClick={() => onSpeedChange(s)}
              className={`px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-30 ${
                speed === s
                  ? "bg-[#F0B90B] text-black"
                  : "bg-[#161616] text-[#8a9bb0] hover:bg-[#1e1e1e]"
              }`}
            >
              {s === "max" ? "Max" : `${s}x`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Candle info ───────────────────────────────────────────────── */}
      {active && currentCandle && (
        <div className="ml-auto flex items-center gap-3 text-[11px] font-mono">
          <span className="text-[#4a5568]">
            Bar <span className="text-[#8a9bb0]">{revealed}</span>
            {" / "}{totalCandles - startIdx - 1}
          </span>
          <span className="text-[#4a5568]">
            {new Date(currentCandle.time * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC
          </span>
          <span className="text-[#F0B90B] font-bold">{currentCandle.close.toFixed(2)}</span>
        </div>
      )}

      {/* ── Select-start-bar hint ─────────────────────────────────────── */}
      {selectingStart && (
        <div className="ml-auto text-[11px] text-[#F0B90B] animate-pulse font-medium">
          👆 Click any candle to set replay start point
        </div>
      )}
    </div>
  );
}

// ─── Small button component ───────────────────────────────────────────────────

function CtrlBtn({
  children, title, disabled, onClick, highlight,
}: {
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center rounded text-[13px] transition-colors disabled:opacity-30 ${
        highlight
          ? "bg-[#F0B90B]/20 text-[#F0B90B] hover:bg-[#F0B90B]/30 border border-[#F0B90B]/40"
          : "bg-[#161616] text-[#8a9bb0] hover:bg-[#1e1e1e] hover:text-[#d1d5db] border border-[#2a2a2a]"
      }`}
    >
      {children}
    </button>
  );
}
