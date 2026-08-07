import { REEL_FPS, REEL_H, REEL_W, buildReelTimeline, type ReelExportProgress, type ReelExportResult, type ReelExportSettings } from "./reelTypes";
import { drawReelFrame } from "./reelRenderer";
import { synthesizeWhooshBuffer } from "./reelWhoosh";
import { loadSfxBuffer } from "@/lib/motion-timeline";
import { synthesizeTrackById } from "./reelMusicPresets";
import { createTicker } from "./reelTicker";
import { finalizeMp4Duration } from "./reelMp4Duration";

// mp4 (H.264 + AAC) is tried first — it's the format every device, editor,
// and social platform accepts without a second thought, and unlike webm it
// also gets a correct, immediately-seekable duration baked into the file
// with no post-processing. An earlier version of this exporter saw a
// corrupted mp4 duration and blamed the muxer, but that was actually the
// render loop stalling under requestAnimationFrame's tab-visibility
// throttling (see reelTicker.ts) — once pacing moved to a Worker timer, mp4
// output measured accurate to within ~10ms in testing.
//
// Within mp4, High Profile (avc1.64...) is tried before Main/Baseline: at
// the same videoBitsPerSecond, High Profile's extra encoding tools (CABAC,
// B-frames) buy noticeably better quality per bit than Baseline, which this
// export explicitly should not give up. Baseline/generic strings remain as
// fallbacks for engines that report support for mp4 but reject the High
// Profile codec string specifically. webm is kept only as the last-resort
// fallback for engines that don't support mp4 MediaRecorder output at all
// (older Firefox).
const MIME_CANDIDATES: { mimeType: string; fileExtension: string }[] = [
  { mimeType: "video/mp4;codecs=avc1.640028,mp4a.40.2", fileExtension: "mp4" }, // High Profile L4.0
  { mimeType: "video/mp4;codecs=avc1.4d0028,mp4a.40.2", fileExtension: "mp4" }, // Main Profile L4.0
  { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", fileExtension: "mp4" }, // Baseline L3.0
  { mimeType: "video/mp4;codecs=avc1,mp4a.40.2", fileExtension: "mp4" },
  { mimeType: "video/mp4", fileExtension: "mp4" },
  { mimeType: "video/webm;codecs=vp9,opus", fileExtension: "webm" },
  { mimeType: "video/webm;codecs=vp8,opus", fileExtension: "webm" },
  { mimeType: "video/webm", fileExtension: "webm" },
];

export function pickSupportedMimeType(): { mimeType: string; fileExtension: string } {
  if (typeof MediaRecorder !== "undefined") {
    for (const candidate of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
    }
  }
  // Last resort — let the browser pick its own default container.
  return { mimeType: "", fileExtension: "webm" };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ReelExportCancelledError extends Error {
  constructor() {
    super("Reel export cancelled");
    this.name = "ReelExportCancelledError";
  }
}

export interface ExportReelParams {
  canvas: HTMLCanvasElement;
  images: (HTMLImageElement | HTMLCanvasElement)[];
  slideDurations: number[];
  settings: ReelExportSettings;
  onProgress?: (progress: ReelExportProgress) => void;
  signal?: AbortSignal;
}

export async function exportReel({ canvas, images, slideDurations, settings, onProgress, signal }: ExportReelParams): Promise<ReelExportResult> {
  if (images.length === 0 || images.length !== slideDurations.length) {
    throw new Error("Reel export needs at least one slide with a matching duration.");
  }
  const report = (progress: ReelExportProgress) => onProgress?.(progress);
  const throwIfCancelled = () => {
    if (signal?.aborted) throw new ReelExportCancelledError();
  };

  canvas.width = REEL_W;
  canvas.height = REEL_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  const timeline = buildReelTimeline(slideDurations, settings.transitionDuration);

  report({ stage: "preparing-audio", fraction: 0, message: "Preparing audio…" });

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const audioCtxCreatedAtPerf = performance.now();

  let cleanupDone = false;
  const audioSources: AudioScheduledSourceNode[] = [];
  const cleanup = () => {
    if (cleanupDone) return;
    cleanupDone = true;
    for (const src of audioSources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    audioCtx.close().catch(() => {});
  };

  try {
    await audioCtx.resume();
    throwIfCancelled();

    // Prepare every audio buffer BEFORE anchoring the audio/video sync clock —
    // decodeAudioData/OfflineAudioContext rendering can take a non-trivial
    // amount of real wall-clock time, and computing the sync anchor before
    // that work would leave it stale: sources scheduled against a `startAt`
    // already in the past start immediately (per spec), while the video loop
    // would still compute a timeline position far ahead of frame 0 — an
    // instant, uncorrectable desync. Anchor only once everything is ready.
    let musicBuffer: AudioBuffer | null = null;
    let musicShouldLoop = false;
    if (settings.musicEnabled) {
      if (settings.customMusicFile) {
        try {
          const arrayBuffer = await settings.customMusicFile.arrayBuffer();
          musicBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          musicShouldLoop = musicBuffer.duration < timeline.totalDuration;
        } catch {
          report({ stage: "preparing-audio", fraction: 0.2, message: "Custom track failed to decode — using default music bed…" });
          musicBuffer = null;
        }
      }
      if (!musicBuffer) {
        musicBuffer = await synthesizeTrackById(settings.selectedTrackId, timeline.totalDuration, audioCtx.sampleRate);
        musicShouldLoop = false;
      }
      throwIfCancelled();
    }

    let whooshBuffer: AudioBuffer | null = null;
    if (settings.whooshEnabled && timeline.slides.length > 1) {
      try {
        whooshBuffer = await loadSfxBuffer("whoosh", audioCtx);
      } catch {
        whooshBuffer = await synthesizeWhooshBuffer(0.42, audioCtx.sampleRate);
      }
      throwIfCancelled();
    }

    const destination = audioCtx.createMediaStreamDestination();
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(destination);

    // Anchor point: from here on it's synchronous node setup only, so this
    // stays accurate through recorder.start() and the first rAF tick.
    const leadIn = 0.15;
    const startAt = audioCtx.currentTime + leadIn;
    const videoStartPerf = audioCtxCreatedAtPerf + startAt * 1000;

    if (musicBuffer) {
      const musicSource = audioCtx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = musicShouldLoop;
      if (musicShouldLoop) {
        musicSource.loopStart = 0;
        musicSource.loopEnd = musicBuffer.duration;
      }
      const musicGain = audioCtx.createGain();
      musicGain.gain.value = Math.max(0, Math.min(1, settings.musicVolume));
      musicSource.connect(musicGain).connect(limiter);
      musicSource.start(startAt);
      musicSource.stop(startAt + timeline.totalDuration + 0.05);
      audioSources.push(musicSource);
    }

    if (whooshBuffer) {
      for (let i = 0; i < timeline.slides.length - 1; i++) {
        const transitionStart = Math.max(0, timeline.slides[i].holdEnd - 0.05);
        const whooshSource = audioCtx.createBufferSource();
        whooshSource.buffer = whooshBuffer;
        whooshSource.playbackRate.value = 0.94 + Math.random() * 0.14;
        const whooshGain = audioCtx.createGain();
        whooshGain.gain.value = Math.max(0, Math.min(1, settings.whooshVolume));
        whooshSource.connect(whooshGain).connect(limiter);
        whooshSource.start(startAt + transitionStart);
        audioSources.push(whooshSource);
      }
    }

    // Paint the opening frame now so the recorder never captures a blank
    // canvas during the audio-scheduling lead-in.
    drawReelFrame({ ctx, images, timeline, time: 0, motionIntensity: settings.motionIntensity, transitionStyle: settings.transitionStyle });

    const { mimeType, fileExtension } = pickSupportedMimeType();
    const videoStream = canvas.captureStream(REEL_FPS);
    const combinedStream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recorderStopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = (ev) => reject((ev as unknown as { error?: Error }).error || new Error("MediaRecorder error"));
    });

    let ticker: { stop: () => void } | null = null;
    let cancelled = false;
    const watchdog = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, timeline.totalDuration * 1000 + 10_000);

    const abortListener = () => {
      cancelled = true;
      ticker?.stop();
      if (recorder.state !== "inactive") recorder.stop();
    };
    signal?.addEventListener("abort", abortListener);

    recorder.start(250);

    // Paced from a Web Worker ticker rather than requestAnimationFrame: rAF
    // callbacks are suspended outright while a tab isn't visible/foregrounded
    // (scheduling is tied to the compositor, which doesn't run for hidden
    // pages), which can silently stall this loop for many seconds if the user
    // switches tabs mid-export — a worker's timers keep running regardless.
    // `elapsed` is still measured from real performance.now() deltas either
    // way, so content stays correct; this only changes how reliably the loop
    // notices it's done and stops the recording at the right wall-clock time.
    const frameIntervalMs = 1000 / REEL_FPS;
    await new Promise<void>((resolveLoop) => {
      const tick = () => {
        if (cancelled) {
          ticker?.stop();
          resolveLoop();
          return;
        }
        const now = performance.now();
        const elapsed = (now - videoStartPerf) / 1000;
        const t = Math.max(0, Math.min(elapsed, timeline.totalDuration));
        drawReelFrame({ ctx, images, timeline, time: t, motionIntensity: settings.motionIntensity, transitionStyle: settings.transitionStyle });
        report({
          stage: "rendering",
          fraction: timeline.totalDuration > 0 ? t / timeline.totalDuration : 1,
          message: `Rendering ${t.toFixed(1)}s / ${timeline.totalDuration.toFixed(1)}s`,
        });
        if (elapsed >= timeline.totalDuration) {
          ticker?.stop();
          resolveLoop();
          return;
        }
      };
      ticker = createTicker(frameIntervalMs, tick);
    });

    signal?.removeEventListener("abort", abortListener);
    clearTimeout(watchdog);

    if (cancelled) {
      cleanup();
      throw new ReelExportCancelledError();
    }

    report({ stage: "finalizing", fraction: 1, message: "Finalizing video…" });
    await sleep(200); // let the last frame(s) flush into the stream before stopping
    if (recorder.state !== "inactive") recorder.stop();
    await recorderStopped;

    cleanup();

    if (chunks.length === 0) throw new Error("Recording produced no data — try again.");
    let blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
    const actualExt = (recorder.mimeType || mimeType || "").includes("mp4") ? "mp4" : fileExtension;

    if (actualExt === "mp4") {
      report({ stage: "finalizing", fraction: 1, message: "Fixing video duration for playback on every device…" });
      blob = await finalizeMp4Duration(blob);
    }
    const url = URL.createObjectURL(blob);

    report({ stage: "done", fraction: 1, message: "Reel ready." });
    return { blob, url, mimeType: recorder.mimeType || mimeType, fileExtension: actualExt, durationSec: timeline.totalDuration };
  } catch (err) {
    cleanup();
    if (err instanceof ReelExportCancelledError) {
      report({ stage: "cancelled", fraction: 0, message: "Cancelled." });
    } else {
      report({ stage: "error", fraction: 0, message: err instanceof Error ? err.message : "Export failed." });
    }
    throw err;
  }
}
