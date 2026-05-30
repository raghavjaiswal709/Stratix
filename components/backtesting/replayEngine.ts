// ─── replayEngine.ts ──────────────────────────────────────────────────────────
// Pure state management for bar-by-bar chart replay.
// All mutations return a new state object — no side effects.

import type { ReplayState, ReplaySpeed } from "./types";

// Auto-play interval per speed level (milliseconds between candle reveals)
export const SPEED_INTERVALS: Record<string, number> = {
  "0.5": 2000,
  "1":   1000,
  "2":   500,
  "5":   200,
  "10":  100,
  "max": 16,  // ~60fps
};

// Return a blank replay state (replay not active)
export function initialReplayState(): ReplayState {
  return {
    active:         false,
    playing:        false,
    startIdx:       0,
    currentIdx:     0,
    speed:          1,
    selectingStart: false,
  };
}

// Enter "select start bar" mode — user will click a candle to begin replay
export function enterSelectMode(state: ReplayState): ReplayState {
  return { ...state, selectingStart: true, playing: false };
}

// Confirm the selected start bar and activate replay at that position
export function confirmStartBar(state: ReplayState, idx: number): ReplayState {
  return {
    ...state,
    active:         true,
    playing:        false,
    startIdx:       idx,
    currentIdx:     idx,
    selectingStart: false,
  };
}

// Reveal the next candle (returns unchanged state if already at the end)
export function stepForward(state: ReplayState, maxIdx: number): ReplayState {
  if (!state.active || state.currentIdx >= maxIdx) return state;
  return { ...state, currentIdx: state.currentIdx + 1 };
}

// Hide the last revealed candle (returns unchanged state if at start)
export function stepBack(state: ReplayState): ReplayState {
  if (!state.active || state.currentIdx <= state.startIdx) return state;
  return { ...state, currentIdx: state.currentIdx - 1, playing: false };
}

// Jump back to the replay start position
export function jumpToStart(state: ReplayState): ReplayState {
  if (!state.active) return state;
  return { ...state, currentIdx: state.startIdx, playing: false };
}

// Begin auto-play
export function startPlaying(state: ReplayState): ReplayState {
  if (!state.active) return state;
  return { ...state, playing: true };
}

// Pause auto-play without exiting replay
export function pausePlaying(state: ReplayState): ReplayState {
  return { ...state, playing: false };
}

// Stop replay entirely and reset all state
export function stopReplay(): ReplayState {
  return initialReplayState();
}

// Change auto-play speed
export function setSpeed(state: ReplayState, speed: ReplaySpeed): ReplayState {
  return { ...state, speed };
}
