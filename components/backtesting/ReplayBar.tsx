"use client";

// ─── ReplayBar ────────────────────────────────────────────────────────────────
// Premium Curved Apple Liquid Glass floating player at the bottom middle of the chart canvas.
// Utilizes high-translucency blur, glossy reflection shadows, and custom media controls.

import type { ReplayState, ReplaySpeed } from "./types";
import {
  Play, Pause, ChevronsLeft, ChevronLeft, ChevronRight, Square, Star
} from "lucide-react";

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
    <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4.5 py-2 bg-black/30 backdrop-blur-[20px] border rounded-full z-35 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all duration-300 font-mono text-[9px] pointer-events-auto select-none ${
      selectingStart ? "border-[#F0B90B] bg-[#F0B90B]/10" : "border-white/10 border-t-white/20"
    }`}>

      {/* ── Select-start-bar toggle ───────────────────────────────────── */}
      <button
        disabled={!hasData || (active && playing)}
        onClick={onSelectStart}
        className={`px-3 py-1 text-[10px] font-bold rounded-full border transition-all duration-150 active:scale-95 disabled:opacity-30 cursor-pointer focus:outline-none focus-visible:outline-none ${
          selectingStart
            ? "bg-[#F0B90B] text-black border-[#F0B90B] shadow-[0_0_12px_rgba(240,185,11,0.4)]"
            : "bg-white/5 text-[#F0B90B] border-[#F0B90B]/30 hover:bg-[#F0B90B]/10 hover:border-[#F0B90B] hover:text-[#F0B90B]"
        }`}
        title="Click a candle on the chart to set the replay start point"
      >
        <span>+ Start</span>
      </button>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="h-5 w-px bg-white/10 shrink-0" />

      {/* ── Transport buttons ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <CtrlBtn title="Jump to start" disabled={!active || atStart} onClick={onJumpToStart}>
          <ChevronsLeft className="w-3.5 h-3.5" />
        </CtrlBtn>
        <CtrlBtn title="Previous candle" disabled={!active || atStart || playing} onClick={onPrev}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </CtrlBtn>

        {playing ? (
          <CtrlBtn title="Pause" disabled={!active} onClick={onPause} highlight>
            <Pause className="w-3.5 h-3.5 fill-black text-black" />
          </CtrlBtn>
        ) : (
          <CtrlBtn title="Play" disabled={!active || atEnd} onClick={onPlay} highlight>
            <Play className="w-3.5 h-3.5 fill-black text-black ml-0.5" />
          </CtrlBtn>
        )}

        <CtrlBtn title="Next candle" disabled={!active || atEnd || playing} onClick={onNext}>
          <ChevronRight className="w-3.5 h-3.5" />
        </CtrlBtn>
        <CtrlBtn title="Stop replay — returns to full chart" disabled={!active} onClick={onStop}>
          <Square className="w-2.5 h-2.5 fill-red-500 text-red-500" />
        </CtrlBtn>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="h-5 w-px bg-white/10 shrink-0" />

      {/* ── Speed selector ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-[8px] text-gray-400 uppercase tracking-widest font-bold">Speed</span>
        <div className="flex gap-0.5 rounded-full overflow-hidden border border-white/10 bg-white/5 p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={String(s)}
              disabled={!active}
              onClick={() => onSpeedChange(s)}
              className={`px-2.5 py-0.5 text-[8px] font-bold rounded-full transition-all disabled:opacity-30 cursor-pointer focus:outline-none ${
                speed === s
                  ? "bg-[#F0B90B] text-black shadow-[0_2px_8px_rgba(240,185,11,0.2)]"
                  : "bg-transparent text-gray-400 hover:text-white"
              }`}
            >
              {s === "max" ? "Max" : `${s}x`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Candle info ───────────────────────────────────────────────── */}
      {active && currentCandle && (
        <>
          <div className="h-5 w-px bg-white/10 shrink-0" />
          <div className="flex items-center gap-3.5 text-[10px] font-mono leading-none select-text">
            <span className="text-gray-400">
              Bar <b className="text-white">{revealed}</b>
              {"/"}{totalCandles - startIdx - 1}
            </span>
            <span className="text-gray-400">
              {new Date(currentCandle.time * 1000).toISOString().replace("T", " ").slice(0, 16)}
            </span>
            <span className="text-[#F0B90B] font-bold">{currentCandle.close.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Small capsule button component ───────────────────────────────────────────

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
      className={`w-7.5 h-7.5 flex items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-20 cursor-pointer focus:outline-none focus-visible:outline-none ${
        highlight
          ? "bg-[#F0B90B] text-black hover:bg-[#d8a609] border border-[#F0B90B] shadow-[0_0_12px_rgba(240,185,11,0.3)]"
          : "bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 border border-white/10"
      }`}
    >
      {children}
    </button>
  );
}
