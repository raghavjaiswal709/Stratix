// Reels are always exported at Instagram/TikTok's native 1080x1920 (9:16),
// independent of whichever poster aspect ratio is currently selected in the
// main editor — the whole point is "convert to reels format".
export const REEL_W = 1080;
export const REEL_H = 1920;
export const REEL_FPS = 30;

export type TransitionStyle =
  | "crossfade"
  | "push"
  | "zoomPunch"
  | "whooshCut"
  | "slideUp"
  | "slideDown"
  | "irisCircle"
  | "diagonalWipe"
  | "flashCut"
  | "glitch"
  | "blurDissolve"
  | "spinZoom"
  | "splitReveal"
  | "cardFlip";
export type MotionIntensity = "off" | "subtle" | "standard";

export const TRANSITION_LABELS: Record<TransitionStyle, string> = {
  crossfade: "Crossfade",
  push: "Push",
  zoomPunch: "Zoom Punch",
  whooshCut: "Whoosh Cut",
  slideUp: "Slide Up",
  slideDown: "Slide Down",
  irisCircle: "Iris Circle",
  diagonalWipe: "Diagonal Wipe",
  flashCut: "Flash Cut",
  glitch: "Glitch",
  blurDissolve: "Blur Dissolve",
  spinZoom: "Spin Zoom",
  splitReveal: "Split Reveal",
  cardFlip: "Card Flip",
};

export const MOTION_LABELS: Record<MotionIntensity, string> = {
  off: "Off",
  subtle: "Subtle",
  standard: "Standard",
};

/** One rendered poster, ready to become a reel slide. */
export interface ReelSlideSource {
  title: string;
  dataUrl: string;
}

/** A slide with its own timing, once loaded into the studio. */
export interface ReelSlide {
  title: string;
  image: HTMLImageElement;
  duration: number; // seconds this slide is the primary/held frame
}

export interface ReelExportSettings {
  transitionStyle: TransitionStyle;
  transitionDuration: number; // seconds, applies between every pair of slides
  motionIntensity: MotionIntensity;
  musicEnabled: boolean;
  musicVolume: number; // 0-1
  /** One of MUSIC_PRESETS' ids (reelMusicPresets.ts) — the built-in "no upload needed" tracks. */
  selectedTrackId: string;
  /** If set, overrides selectedTrackId entirely. */
  customMusicFile: File | null;
  whooshEnabled: boolean;
  whooshVolume: number; // 0-1
}

export const DEFAULT_TRACK_ID = "corporate-motivation";

export const DEFAULT_REEL_SETTINGS: ReelExportSettings = {
  transitionStyle: "crossfade",
  transitionDuration: 0.5,
  motionIntensity: "subtle",
  musicEnabled: true,
  musicVolume: 0.4,
  selectedTrackId: DEFAULT_TRACK_ID,
  customMusicFile: null,
  whooshEnabled: true,
  whooshVolume: 0.55,
};

export type ReelExportStage =
  | "idle"
  | "preparing-audio"
  | "rendering"
  | "finalizing"
  | "done"
  | "error"
  | "cancelled";

export interface ReelExportProgress {
  stage: ReelExportStage;
  fraction: number; // 0-1
  message: string;
}

export interface ReelExportResult {
  blob: Blob;
  url: string;
  mimeType: string;
  fileExtension: string;
  durationSec: number;
}

/** Precomputed per-slide timeline: when each slide's hold segment starts/ends,
 *  and the total visible window (incoming transition + hold + outgoing
 *  transition) used to drive one continuous Ken Burns move per slide. */
export interface ReelTimelineSlide {
  holdStart: number;
  holdEnd: number;
  visibleStart: number; // holdStart minus incoming transition (0 for first slide)
  visibleEnd: number; // holdEnd plus outgoing transition (0 for last slide)
}

export interface ReelTimeline {
  slides: ReelTimelineSlide[];
  transitionDuration: number;
  totalDuration: number;
}

export function buildReelTimeline(durations: number[], transitionDuration: number): ReelTimeline {
  const n = durations.length;
  const slides: ReelTimelineSlide[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const holdStart = cursor;
    const holdEnd = holdStart + Math.max(0, durations[i]);
    slides.push({
      holdStart,
      holdEnd,
      visibleStart: i === 0 ? holdStart : holdStart - transitionDuration,
      visibleEnd: i === n - 1 ? holdEnd : holdEnd + transitionDuration,
    });
    cursor = holdEnd + (i < n - 1 ? transitionDuration : 0);
  }
  return { slides, transitionDuration, totalDuration: cursor };
}
