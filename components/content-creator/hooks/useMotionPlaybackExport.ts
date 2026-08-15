"use client";

import { useCallback, useEffect, useMemo, type RefObject } from "react";
import {
  playTransitionSfx,
  playAudioFile,
  sampleTimeline,
  wordAt,
  DEFAULT_TRANSITION_AUDIO_MAP,
  type AudioSfxType,
  type CompiledTimeline,
  type TranscriptWord,
} from "@/lib/motion-timeline";
import type {
  AspectRatio,
  HookVideoEntry,
  MotionSlide,
  MotionVideoData,
  PosterColors,
  PosterConfig,
  PosterElement,
} from "../types";
import { drawPoster } from "../canvas/drawPoster";
import { drawMotionTimelineFrame } from "../canvas/drawMotionTimelineFrame";
import { drawVideoCover } from "../canvas/canvasUtils";

/**
 * MP4 only, by preference order. See the module-level doc comment in
 * ContentCreatorPage.tsx for why.
 */
const MP4_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1.4d0028,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

/**
 * Motion playback (play/pause, the clock, the render loop) and export
 * (timeline video + single-slide video). This is where nearly every other
 * motion hook's state converges, so its parameter list is deliberately flat
 * rather than artificially grouped.
 */
export function useMotionPlaybackExport({
  creatorMode,
  canvasRef,
  loadedImagesRef,
  colors,
  config,
  ar,
  scale: _scale,
  motionSlides,
  activeMotionIndex,
  setActiveMotionIndex,
  motionData,
  activeMotionSlideId,
  setMotionData,
  motionTimeline,
  motionTimeMs,
  setMotionTimeMs,
  isPlayingMotion,
  setIsPlayingMotion,
  isExportingTimeline,
  setIsExportingTimeline,
  timelineExportElapsed: _timelineExportElapsed,
  setTimelineExportElapsed,
  motionExportSpeed,
  motionAnimFrameRef,
  motionTimeRef,
  motionClockOriginRef,
  motionLoopRef,
  motionSpeedRef,
  ensureMotionMix,
  seekMotionTo,
  ensureMotionAssets,
  motionAudioRef,
  motionMusicRef,
  motionMixRef,
  motionHookEnabled,
  motionHooks,
  motionSelectedHookId,
  motionHookVideoRef,
  isHookPhasePlaying,
  setIsHookPhasePlaying,
  motionOverlayVideoElsRef,
  motionLayerImgElsRef,
  motionAssetVersion,
  motionOverlayVideoVersion,
  motionTranscript,
  motionCaptions,
  motionCaptionPosition,
  motionCaptionBgOpacity,
  motionCaptionLeadMs,
  motionPaperCutStyle,
  motionWholeImageMotion,
  motionZigzagMotion,
  motionZoneBorder,
  motionHideImageCaptions,
  motionSfxEnabled,
  motionSfxVolume,
  motionLastSceneIndexRef,
  motionZoneVisibleRef,
  motionZoneSeededSceneRef,
  motionZoneFlourishRef,
  motionCurrentZoneVisibleRef,
  motionCurrentZoneIdRef,
  motionCurrentZoneSceneRef,
  setElementBounds,
  setSegmentError,
  setIsRecordingVideo,
}: {
  creatorMode: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  loadedImagesRef: RefObject<Record<string, HTMLImageElement>>;
  colors: PosterColors;
  config: PosterConfig;
  ar: AspectRatio;
  scale: number;
  motionSlides: MotionSlide[];
  activeMotionIndex: number;
  setActiveMotionIndex: (index: number) => void;
  motionData: MotionVideoData;
  activeMotionSlideId: string;
  setMotionData: (updater: MotionVideoData | ((prev: MotionVideoData) => MotionVideoData)) => void;
  motionTimeline: CompiledTimeline | null;
  motionTimeMs: number;
  setMotionTimeMs: (ms: number) => void;
  isPlayingMotion: boolean;
  setIsPlayingMotion: (playing: boolean) => void;
  isExportingTimeline: boolean;
  setIsExportingTimeline: (exporting: boolean) => void;
  timelineExportElapsed: number | null;
  setTimelineExportElapsed: (ms: number | null) => void;
  motionExportSpeed: number;
  motionAnimFrameRef: RefObject<number | null>;
  motionTimeRef: RefObject<number>;
  motionClockOriginRef: RefObject<number>;
  motionLoopRef: RefObject<boolean>;
  motionSpeedRef: RefObject<number>;
  ensureMotionMix: () => { ctx: AudioContext; dest: MediaStreamAudioDestinationNode; voiceGain: GainNode; musicGain: GainNode; sfxGain: GainNode; hookGain: GainNode; voiceEl: HTMLAudioElement | null; musicEl: HTMLAudioElement | null; hookEl: HTMLVideoElement | null } | null;
  seekMotionTo: (ms: number) => void;
  ensureMotionAssets: (slides: MotionSlide[], timeoutMs?: number) => Promise<boolean>;
  motionAudioRef: RefObject<HTMLAudioElement | null>;
  motionMusicRef: RefObject<HTMLAudioElement | null>;
  motionMixRef: RefObject<unknown | null>;
  motionHookEnabled: boolean;
  motionHooks: HookVideoEntry[];
  motionSelectedHookId: string | null;
  motionHookVideoRef: RefObject<HTMLVideoElement | null>;
  isHookPhasePlaying: boolean;
  setIsHookPhasePlaying: (playing: boolean) => void;
  motionOverlayVideoElsRef: RefObject<Record<string, HTMLVideoElement>>;
  motionLayerImgElsRef: RefObject<Record<string, Record<string, HTMLImageElement>>>;
  motionAssetVersion: number;
  motionOverlayVideoVersion: number;
  motionTranscript: TranscriptWord[] | null;
  motionCaptions: boolean;
  motionCaptionPosition: "top" | "bottom";
  motionCaptionBgOpacity: number;
  motionCaptionLeadMs: number;
  motionPaperCutStyle: boolean;
  motionWholeImageMotion: boolean;
  motionZigzagMotion: boolean;
  /** Off by default: gates the always-on black rotating border + diagonal shine on the current zone. */
  motionZoneBorder: boolean;
  motionHideImageCaptions: boolean;
  motionSfxEnabled: boolean;
  motionSfxVolume: number;
  motionLastSceneIndexRef: RefObject<number>;
  motionZoneVisibleRef: RefObject<Record<string, boolean>>;
  motionZoneSeededSceneRef: RefObject<number>;
  motionZoneFlourishRef: RefObject<Record<string, number>>;
  motionCurrentZoneVisibleRef: RefObject<Record<string, boolean>>;
  motionCurrentZoneIdRef: RefObject<string | null>;
  motionCurrentZoneSceneRef: RefObject<number>;
  setElementBounds: (bounds: PosterElement[]) => void;
  setSegmentError: (msg: string | null) => void;
  setIsRecordingVideo: (recording: boolean) => void;
}) {
  const scale = _scale;

  /**
   * Plays one hook clip to completion, drawing its frames into the same
   * canvas the timeline renders into (cover-fit — see drawVideoCover — since
   * a hook's own resolution may not match the fixed export canvas) and
   * routing its audio through the same mixing graph the voiceover/music use,
   * so during export it lands in the same recording as whatever follows it.
   * Branches rAF vs setInterval exactly like the main clock effect above and
   * for the same reason: a backgrounded export tab throttles rAF but not an
   * interval on a tab that is audibly playing.
   */
  const playHookPhase = useCallback(
    (hookEl: HTMLVideoElement, exporting: boolean): Promise<void> => {
      return new Promise((resolve) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d") ?? null;
        if (!canvas || !ctx) {
          resolve();
          return;
        }
        const W = Math.max(1, Math.round(ar.w));
        const H = Math.max(1, Math.round(ar.h));
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;

        const mix = ensureMotionMix();
        if (mix && mix.hookEl !== hookEl) {
          try {
            mix.ctx.createMediaElementSource(hookEl).connect(mix.hookGain);
            mix.hookEl = hookEl;
          } catch {
            /* already routed through another graph — leave it on the default output */
          }
        }

        let settled = false;
        let rafId: number | null = null;
        let intervalId: number | null = null;
        let safetyTimer: number | null = null;

        const finish = () => {
          if (settled) return;
          settled = true;
          if (rafId != null) cancelAnimationFrame(rafId);
          if (intervalId != null) window.clearInterval(intervalId);
          if (safetyTimer != null) window.clearTimeout(safetyTimer);
          hookEl.removeEventListener("ended", finish);
          hookEl.pause();
          resolve();
        };

        const draw = () => {
          if (settled) return;
          try {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, W, H);
            drawVideoCover(ctx, hookEl, W, H);
          } catch (err) {
            console.warn("Hook frame draw failed, continuing:", err);
          }
        };

        hookEl.addEventListener("ended", finish);
        try {
          hookEl.currentTime = 0;
        } catch {
          /* not seekable yet */
        }
        void hookEl.play().catch((err) => {
          console.warn("Hook video could not play, skipping it:", err);
          finish();
        });

        // A hook that never fires "ended" — a decode stall, a malformed file
        // — must not hang playback or an export forever.
        const safetyMs = (Number.isFinite(hookEl.duration) && hookEl.duration > 0 ? hookEl.duration * 1000 : 15000) + 2000;
        safetyTimer = window.setTimeout(finish, safetyMs);

        if (exporting) {
          intervalId = window.setInterval(draw, 1000 / 30);
        } else {
          const tick = () => {
            if (settled) return;
            draw();
            rafId = requestAnimationFrame(tick);
          };
          rafId = requestAnimationFrame(tick);
        }
      });
    },
    [ar, ensureMotionMix, canvasRef]
  );

  /**
   * Shared by every play/pause control (the timeline panel's and the
   * scrubber's). Pausing is always immediate; starting fresh from the very
   * top with a hook selected plays the hook first and only flips
   * isPlayingMotion once it finishes — resuming from mid-scrub never
   * replays the hook.
   */
  const handleToggleMotionPlay = useCallback(() => {
    if (isPlayingMotion) {
      setIsPlayingMotion(false);
      return;
    }
    const hook = motionHookEnabled ? motionHooks.find((h) => h.id === motionSelectedHookId) : undefined;
    const atStart = motionTimeRef.current < 50;
    if (hook && atStart && motionHookVideoRef.current && !isHookPhasePlaying) {
      setIsHookPhasePlaying(true);
      void playHookPhase(motionHookVideoRef.current, false).finally(() => {
        setIsHookPhasePlaying(false);
        setIsPlayingMotion(true);
      });
      return;
    }
    setIsPlayingMotion(true);
  }, [isPlayingMotion, motionHookEnabled, motionHooks, motionSelectedHookId, isHookPhasePlaying, playHookPhase, setIsPlayingMotion, motionTimeRef, motionHookVideoRef, setIsHookPhasePlaying]);

  /**
   * Plays a zone-transition SFX through the same graph the voiceover and
   * music already go through, so it is both audible live and — critically —
   * present in the exported MP4. Routing it through this project's own
   * private AudioContext (the sfx module's fallback) would only ever reach
   * the speakers: MediaRecorder captures `mix.dest`, and a second, unrelated
   * AudioContext has no way to feed into that stream.
   */
  const playMotionSfx = useCallback(
    (sfx: AudioSfxType, volume: number) => {
      const mix = ensureMotionMix();
      void playTransitionSfx(sfx, volume, mix?.ctx, mix?.sfxGain);
    },
    [ensureMotionMix]
  );

  /** A second, fixed chime layered under the whoosh on every slide load — see /public/text.mp3. */
  const playMotionSlideChime = useCallback(
    (volume: number) => {
      const mix = ensureMotionMix();
      void playAudioFile("/text.mp3", volume, mix?.ctx, mix?.sfxGain);
    },
    [ensureMotionMix]
  );

  // 60 FPS motion clock. Free-running when no timeline is applied (the
  // procedural preview loops forever); bounded by the timeline's duration
  // otherwise, and slaved to the voiceover whenever one is loaded — audio is
  // the only clock that cannot drift against itself.
  useEffect(() => {
    if (creatorMode !== "motion" || !isPlayingMotion) return;

    // Belt-and-suspenders against a stale loop outliving its effect — e.g. a
    // dev-mode Fast Refresh remount racing this cleanup with the previous
    // instance's still-queued frame. cancelAnimationFrame below is the real
    // guard; this is what stops that frame from calling setState even if the
    // cancel loses the race, which is what "Maximum update depth exceeded"
    // looks like from the outside: two ticking loops each advancing the clock.
    let cancelled = false;

    const audio = motionAudioRef.current;
    const music = motionMusicRef.current;
    const duration = motionTimeline?.durationMs ?? 0;
    const speed = Math.max(0.01, motionSpeedRef.current);
    motionClockOriginRef.current = performance.now() - motionTimeRef.current / speed;

    // Routing both sources through the mixer here, rather than only at export,
    // means what you hear while scrubbing is exactly what gets recorded.
    ensureMotionMix();

    if (motionTimeline) {
      if (audio) {
        void audio.play().catch(() => {
          /* autoplay refused — the performance clock carries on alone */
        });
      }
      if (music) {
        void music.play().catch(() => {});
      }
    }

    const advance = (value: number) => {
      if (cancelled) return;
      motionTimeRef.current = value;
      setMotionTimeMs(value);
    };

    /** One clock step, shared by both drivers below. False means stop entirely. */
    const step = (now: number): boolean => {
      // Audio position is already in timeline time whatever the playback rate,
      // so it needs no scaling; the wall clock does.
      const fromAudio = audio && !audio.paused && !audio.ended ? audio.currentTime * 1000 : null;
      let t = fromAudio ?? (now - motionClockOriginRef.current) * speed;

      if (duration > 0 && t >= duration) {
        if (motionLoopRef.current) {
          t = 0;
          motionClockOriginRef.current = now;
          [audio, music].forEach((el) => {
            if (!el) return;
            try {
              el.currentTime = 0;
            } catch {
              /* ignore */
            }
            void el.play().catch(() => {});
          });
        } else {
          advance(duration);
          setIsPlayingMotion(false);
          return false;
        }
      }

      advance(t);
      return true;
    };

    if (isExportingTimeline) {
      // requestAnimationFrame is throttled to roughly once a second — or
      // paused outright — the instant this tab loses focus, while the
      // <audio> element backing the clock keeps playing regardless of tab
      // visibility. That mismatch is exactly what let an export freeze on
      // its video track mid-recording with the audio carrying on
      // underneath: motionTimeMs stopped advancing, so the render effect
      // below had nothing to react to, while the recorder's audio track
      // kept rolling untouched. setInterval does not share that throttling
      // on a tab that is audibly playing — which an export always is — so
      // the recording clock is driven by it instead. A few milliseconds of
      // jitter against vsync is invisible in a captured stream; a clock
      // that never stalls is worth far more here than one that is only
      // perfectly smooth while the tab stays focused.
      const fps = Math.max(12, Math.min(60, Math.round(motionTimeline?.fps ?? 30)));
      const intervalId = window.setInterval(() => {
        if (cancelled) return;
        try {
          if (!step(performance.now())) window.clearInterval(intervalId);
        } catch (err) {
          // One bad tick must not end the recording — the interval keeps
          // firing regardless and the clock carries on from the next one.
          console.warn("Motion export clock tick failed, continuing:", err);
        }
      }, 1000 / fps);

      return () => {
        cancelled = true;
        window.clearInterval(intervalId);
        audio?.pause();
        music?.pause();
      };
    }

    const tick = (now: number) => {
      if (cancelled) return;
      try {
        if (!step(now)) return;
      } catch (err) {
        console.warn("Motion clock tick failed, continuing:", err);
      }
      if (!cancelled) motionAnimFrameRef.current = requestAnimationFrame(tick);
    };

    motionAnimFrameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (motionAnimFrameRef.current) cancelAnimationFrame(motionAnimFrameRef.current);
      audio?.pause();
      music?.pause();
    };
  }, [creatorMode, isPlayingMotion, motionTimeline, ensureMotionMix, isExportingTimeline, motionAudioRef, motionMusicRef, motionSpeedRef, motionClockOriginRef, motionTimeRef, setMotionTimeMs, motionLoopRef, setIsPlayingMotion, motionAnimFrameRef]);

  // Render canvas on motionTimeMs change when in motion mode
  useEffect(() => {
    if (creatorMode !== "motion" || !canvasRef.current) return;
    // The hook pre-roll (playHookPhase) owns the canvas and draws its own
    // frames directly while it runs — motionTimeMs isn't moving during that
    // phase, but this effect can still re-run from an unrelated dependency
    // change, and painting scene 0 over the hook mid-playback would flicker.
    if (isHookPhasePlaying) return;

    // Timeline applied: the whole batch is one video. The frame decides which
    // slide is on screen, so the slide switcher follows playback rather than
    // driving it.
    if (motionTimeline) {
      // A single bad frame — a transient image-decode race, a stray NaN, an
      // out-of-range canvas call — must not end the whole recording. The
      // clock effect above keeps advancing motionTimeMs regardless of what
      // happens in here, so swallowing the error and trying again on the
      // next tick is what stops one glitch from freezing the rest of an
      // export while its audio track keeps rolling underneath.
      try {
        const frame = sampleTimeline(motionTimeline, motionTimeMs);

        // The topmost sampled scene is the one actually settling into place —
        // mid-transition that is frame.scenes[frame.scenes.length - 1],
        // otherwise it is the only entry — and its `layers` are what the
        // viewer is actually looking at. Hoisted out of the SFX-only branch
        // below (it used to live there alone) because the always-on
        // current-zone tracking further down needs it too, regardless of
        // whether SFX is enabled or the video is even playing.
        const topScene = frame.scenes[frame.scenes.length - 1];
        const activeSlide = motionSlides[frame.activeSlideIndex];
        // Under wholeImageMotion (on by default), drawScene freezes every
        // small, non-collage layer at rest from frame 0 regardless of its own
        // cues — see isBigCollageElement in drawMotionTimelineFrame.ts. Firing
        // a whoosh — or treating it as the current zone — for that layer's
        // programmed-but-suppressed entrance would be for a "zone" that never
        // visibly appears. Mirrored here rather than reworking the renderer
        // to report back what it actually drew.
        const isBigZoneLayer = (layerId: string): boolean => {
          if (!motionWholeImageMotion) return true;
          const layer = activeSlide?.layers.find((l) => l.id === layerId);
          if (!layer) return true;
          const objType = layer.objectType || "";
          if (["collage-part", "photo", "illustration", "panel", "banner"].includes(objType)) return true;
          return (layer.w ?? 0) * (layer.h ?? 0) >= 0.1;
        };

        // Scene- AND zone-appearance SFX. Only while actually playing, so
        // scrubbing the timeline while paused stays silent — matches the old
        // scene-only behaviour this replaces.
        if (isPlayingMotion && motionSfxEnabled) {
          const sfxScene = motionTimeline.scenes[frame.activeSceneIndex];
          if (sfxScene) {
            const sceneSfx = sfxScene.enter?.soundEffect || DEFAULT_TRANSITION_AUDIO_MAP[sfxScene.enter?.type] || "whoosh";

            if (frame.activeSceneIndex !== motionLastSceneIndexRef.current) {
              playMotionSfx(sceneSfx, motionSfxVolume);
              playMotionSlideChime(motionSfxVolume);
              motionLastSceneIndexRef.current = frame.activeSceneIndex;
            }

            // A fresh scene index — whether reached by natural playback, a
            // seek, or a loop restart — re-seeds silently instead of comparing
            // against a stale or empty map, so landing mid-scene with several
            // elements already on screen does not fire a burst for all of them
            // at once. Only a crossing seen on a LATER frame counts as a real
            // "zone appearing" — see the refs' declaration above.
            const reseeding = motionZoneSeededSceneRef.current !== frame.activeSceneIndex;
            if (reseeding) {
              motionZoneVisibleRef.current = {};
              motionZoneSeededSceneRef.current = frame.activeSceneIndex;
            }
            Object.entries(topScene?.layers ?? {}).forEach(([layerId, state]) => {
              if (!isBigZoneLayer(layerId)) return;
              const visible = state.opacity * state.wipe > 0.05;
              const wasVisible = motionZoneVisibleRef.current[layerId] ?? false;
              if (!reseeding && visible && !wasVisible) {
                playMotionSfx(sceneSfx, motionSfxVolume);
                motionZoneFlourishRef.current[layerId] = motionTimeMs;
              }
              motionZoneVisibleRef.current[layerId] = visible;
            });
          }
        } else if (!isPlayingMotion) {
          motionLastSceneIndexRef.current = -1;
          motionZoneSeededSceneRef.current = -1;
        }

        // Which single zone reads as "current" right now, for the persistent
        // black rotating border + diagonal shine (drawActiveZoneOverlay).
        // Independent of the SFX bookkeeping above, which goes silent
        // whenever paused or muted — this must keep working regardless, so
        // scrubbing the timeline in the editor shows the same thing the
        // export will. Exactly one zone at a time: whichever just appeared
        // most recently, falling back to any other still-visible big zone if
        // that one leaves, mirroring the flourish's own crossing-detection
        // above but with its own independent frame-to-frame memory (see the
        // refs' declaration).
        const currentZoneReseeding = motionCurrentZoneSceneRef.current !== frame.activeSceneIndex;
        motionCurrentZoneSceneRef.current = frame.activeSceneIndex;
        const currentZoneVisibleNow: Record<string, boolean> = {};
        Object.entries(topScene?.layers ?? {}).forEach(([layerId, state]) => {
          if (isBigZoneLayer(layerId)) currentZoneVisibleNow[layerId] = state.opacity * state.wipe > 0.05;
        });
        if (currentZoneReseeding) {
          // Landing mid-scene — via a seek, a loop restart, or just opening
          // the editor — picks whatever is already on screen rather than
          // showing nothing until the next fresh entrance.
          motionCurrentZoneIdRef.current = Object.keys(currentZoneVisibleNow).find((id) => currentZoneVisibleNow[id]) ?? null;
        } else {
          Object.entries(currentZoneVisibleNow).forEach(([layerId, visible]) => {
            const wasVisible = motionCurrentZoneVisibleRef.current[layerId] ?? false;
            if (visible && !wasVisible) motionCurrentZoneIdRef.current = layerId;
          });
          if (motionCurrentZoneIdRef.current && !currentZoneVisibleNow[motionCurrentZoneIdRef.current]) {
            motionCurrentZoneIdRef.current = Object.keys(currentZoneVisibleNow).find((id) => currentZoneVisibleNow[id]) ?? null;
          }
        }
        motionCurrentZoneVisibleRef.current = currentZoneVisibleNow;

        // Keeps every active overlay's <video> seeked to its place in the
        // clip (looping past the clip's own native duration if the overlay's
        // window is longer than its source) and paused whenever it leaves
        // that window, so an off-screen clip stops decoding. A small drift
        // tolerance avoids fighting the browser's own frame-to-frame advance
        // with a hard seek every single frame.
        const activeOverlayIds = new Set(frame.activeOverlays.map((o) => o.id));
        frame.activeOverlays.forEach((o) => {
          const video = motionOverlayVideoElsRef.current[o.id];
          if (!video) return;
          const nativeDurMs = video.duration;
          const loopedMs = Number.isFinite(nativeDurMs) && nativeDurMs > 0 ? o.localTimeMs % (nativeDurMs * 1000) : o.localTimeMs;
          const targetSec = Math.max(0, loopedMs / 1000);
          if (isPlayingMotion) {
            if (video.paused) {
              try {
                video.currentTime = targetSec;
              } catch {
                /* not seekable yet */
              }
              void video.play().catch(() => {});
            } else if (Math.abs(video.currentTime - targetSec) > 0.15) {
              try {
                video.currentTime = targetSec;
              } catch {
                /* not seekable yet */
              }
            }
          } else {
            // Paused/scrubbing: only ever seek, never play — otherwise the
            // clip runs to completion under its own clock while the frozen
            // playhead sits still, showing whatever frame it happened to be
            // on rather than the one the timeline claims. motionAssetVersion's
            // sibling (motionOverlayVideoVersion, bumped on `seeked`) repaints
            // once the seek actually lands, since it typically hasn't by the
            // time this same tick's drawMotionTimelineFrame call below runs.
            if (!video.paused) video.pause();
            if (Math.abs(video.currentTime - targetSec) > 0.001) {
              try {
                video.currentTime = targetSec;
              } catch {
                /* not seekable yet */
              }
            }
          }
        });
        Object.entries(motionOverlayVideoElsRef.current).forEach(([id, video]) => {
          if (!activeOverlayIds.has(id) && !video.paused) video.pause();
        });

        const bounds = drawMotionTimelineFrame(
          canvasRef.current,
          frame,
          {
            slides: motionSlides,
            layerImgEls: motionLayerImgElsRef.current,
            bgImgs: loadedImagesRef.current,
            overlayVideoEls: motionOverlayVideoElsRef.current,
          },
          { w: ar.w, h: ar.h },
          {
            activeLayerId: motionData.activeLayerId,
            showSelection: !isPlayingMotion && !isExportingTimeline,
            words: motionTranscript ?? undefined,
            captions: motionCaptions,
            captionPosition: motionCaptionPosition,
            captionBgOpacity: motionCaptionBgOpacity,
            captionLeadMs: motionCaptionLeadMs,
            paperCutStyle: motionPaperCutStyle,
            wholeImageMotion: motionWholeImageMotion,
            zigzagMotion: motionZigzagMotion,
            hideImageCaptions: motionHideImageCaptions,
            zoneFlourishes: motionZoneFlourishRef.current,
            // Always on — the diagonal shine drawActiveZoneOverlay paints for
            // this doesn't depend on motionZoneBorder, only the rotating
            // border half of that effect does (see zoneBorderEnabled below).
            currentZoneLayerId: motionCurrentZoneIdRef.current,
            zoneBorderEnabled: motionZoneBorder,
          },
          (sceneIndex) => motionTimeline.scenes[sceneIndex]?.intro
        );
        if (!isPlayingMotion && !isExportingTimeline) {
          setElementBounds(bounds);
        }
        if (frame.activeSlideIndex !== activeMotionIndex && motionSlides[frame.activeSlideIndex]) {
          setActiveMotionIndex(frame.activeSlideIndex);
        }
      } catch (err) {
        console.warn("Motion frame render failed, skipping this frame:", err);
      }
      return;
    }

    const dataWithTime = {
      ...motionData,
      timeMs: motionTimeMs,
      layerImgEls: motionLayerImgElsRef.current[activeMotionSlideId] || {},
      paperCutStyle: motionPaperCutStyle,
    };
    const bgImg = motionData.backgroundUrl ? loadedImagesRef.current[motionData.backgroundUrl] : null;
    const bounds = drawPoster(canvasRef.current, dataWithTime, ar, colors, config, bgImg, "motion");
    if (!isPlayingMotion && !isExportingTimeline) {
      setElementBounds(bounds);
    }
  }, [
    creatorMode,
    motionTimeMs,
    motionData,
    motionSlides,
    activeMotionIndex,
    activeMotionSlideId,
    motionTimeline,
    isPlayingMotion,
    isExportingTimeline,
    // A paused canvas has no other reason to redraw, so a late-decoding image
    // would otherwise never appear until the playhead moved.
    motionAssetVersion,
    motionOverlayVideoVersion,
    motionTranscript,
    motionCaptions,
    motionCaptionPosition,
    motionCaptionBgOpacity,
    motionCaptionLeadMs,
    motionPaperCutStyle,
    motionWholeImageMotion,
    motionZigzagMotion,
    motionZoneBorder,
    motionHideImageCaptions,
    motionSfxEnabled,
    motionSfxVolume,
    playMotionSfx,
    playMotionSlideChime,
    isHookPhasePlaying,
    ar,
    colors,
    config,
    canvasRef, loadedImagesRef, motionLayerImgElsRef, motionOverlayVideoElsRef,
    setActiveMotionIndex, setElementBounds,
    motionLastSceneIndexRef, motionZoneSeededSceneRef, motionZoneVisibleRef, motionZoneFlourishRef,
    motionCurrentZoneSceneRef, motionCurrentZoneVisibleRef, motionCurrentZoneIdRef,
  ]);

  const motionActiveWord = useMemo(
    () => (motionTranscript ? wordAt(motionTranscript, motionTimeMs) : null),
    [motionTranscript, motionTimeMs]
  );

  /**
   * Confirms audio is actually flowing before the recorder starts rolling.
   *
   * `AudioContext.resume()` and `<audio>.play()` both return promises that
   * settle on their own schedule, and nothing upstream of this used to wait
   * for either one — a MediaRecorder started on a fixed timer could start
   * capturing while the mix graph was still "suspended" or the element had
   * not yet produced a single sample. That gap is silent and invisible in
   * every later frame of the recording, which is exactly what "the voiceover
   * is sometimes missing" looks like: not corrupted, just never there.
   * Polling real state instead of guessing a delay is what closes it.
   */
  const waitForAudioReady = useCallback(async (timeoutMs: number): Promise<boolean> => {
    const audio = motionAudioRef.current;
    const music = motionMusicRef.current;
    if (!audio && !music) return true; // nothing loaded — a silent export is correct here

    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const mix = motionMixRef.current as { ctx: AudioContext; dest: MediaStreamAudioDestinationNode } | null;
      const ctxRunning = mix?.ctx.state === "running";
      const audioFlowing = !audio || (!audio.paused && audio.readyState >= 2);
      const musicFlowing = !music || (!music.paused && music.readyState >= 2);
      const hasLiveTrack =
        !!mix && mix.dest.stream.getAudioTracks().some((t) => t.readyState === "live" && t.enabled);

      if (ctxRunning && audioFlowing && musicFlowing && hasLiveTrack) return true;
      await new Promise((r) => window.setTimeout(r, 40));
    }
    return false;
  }, [motionAudioRef, motionMusicRef, motionMixRef]);

  /**
   * Records the timeline end to end.
   *
   * MediaRecorder captures a live canvas, so this runs in real time — the clip
   * takes as long as the video does. The voiceover, when loaded, is captured
   * off the same <audio> element that is driving the clock, which is what makes
   * the exported file self-consistent instead of merely close.
   */
  const handleExportTimelineVideo = async () => {
    if (!canvasRef.current || !motionTimeline || isExportingTimeline) return;
    const duration = motionTimeline.durationMs;
    const speed = Math.max(0.25, Math.min(4, motionExportSpeed));

    setIsExportingTimeline(true);
    setTimelineExportElapsed(0);
    setMotionData((prev) => ({ ...prev, activeLayerId: undefined }));

    // A loop restart mid-take would splice the opening frames onto the end.
    const restoreLoop = motionLoopRef.current;
    motionLoopRef.current = false;

    // Every pixel of every slide has to be decoded before the tape rolls. This
    // is the difference between a recording that opens on the first poster and
    // one that opens on black while the images are still arriving — and unlike
    // playback, an export cannot be re-watched once it is wrong.
    const assetsReady = await ensureMotionAssets(motionSlides);
    if (!assetsReady) {
      setSegmentError(
        "Some slide images were still loading after 30s — recording anyway, and any unfinished slide will hold on its full poster instead of animating."
      );
    }

    // Overlay clips need their own metadata (duration, dimensions) before
    // drawVideoCover or the per-frame sync loop can trust them — same
    // reasoning as the image preload above, just for whichever clips are on
    // this timeline. A stalled one must not hold the export hostage any
    // longer than a stalled image does.
    const overlayVideosPending = Object.values(motionOverlayVideoElsRef.current).filter((v) => v.readyState < 1);
    if (overlayVideosPending.length > 0) {
      await Promise.race([
        Promise.all(
          overlayVideosPending.map(
            (v) =>
              new Promise<void>((resolve) => {
                const onReady = () => {
                  v.removeEventListener("loadedmetadata", onReady);
                  resolve();
                };
                v.addEventListener("loadedmetadata", onReady);
              })
          )
        ),
        new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
      ]);
    }

    // A hook plays before the real timeline, inside the very same recording
    // — see playHookPhase. Resolved once, up front, so every branch below
    // agrees on whether there is one; metadata (duration/videoWidth) has to
    // be loaded before drawVideoCover or the safety timeout in playHookPhase
    // can trust it, so a hook picked and exported in the same instant still
    // gets a brief chance to finish loading rather than silently vanishing.
    const selectedHook = motionHookEnabled ? motionHooks.find((h) => h.id === motionSelectedHookId) : undefined;
    const hookEl = selectedHook ? motionHookVideoRef.current : null;
    if (hookEl && hookEl.readyState < 1) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          hookEl.removeEventListener("loadedmetadata", onReady);
          resolve();
        };
        hookEl.addEventListener("loadedmetadata", onReady);
        window.setTimeout(() => {
          hookEl.removeEventListener("loadedmetadata", onReady);
          resolve();
        }, 4000);
      });
    }
    const willPlayHook = !!hookEl && hookEl.readyState >= 1;
    if (selectedHook && !willPlayHook) {
      console.warn("Hook video metadata never loaded in time — exporting without the hook.");
    }

    seekMotionTo(0);

    let progressTimer: number | null = null;
    const finish = () => {
      if (progressTimer !== null) window.clearInterval(progressTimer);
      motionLoopRef.current = restoreLoop;
      setIsExportingTimeline(false);
      setTimelineExportElapsed(null);
    };

    try {
      const canvas = canvasRef.current;

      if (willPlayHook) {
        // Paint one black frame synchronously so the very first frame
        // captureStream sees is real, not stale/garbage — playHookPhase
        // takes over painting actual frames a moment later. The main
        // timeline's own frame 0 must not appear here: it hasn't "started"
        // yet in any sense a viewer should see.
        const W = Math.max(1, Math.round(ar.w));
        const H = Math.max(1, Math.round(ar.h));
        if (canvas.width !== W) canvas.width = W;
        if (canvas.height !== H) canvas.height = H;
        const warmCtx = canvas.getContext("2d");
        if (warmCtx) {
          warmCtx.setTransform(1, 0, 0, 1, 0, 0);
          warmCtx.fillStyle = "#000000";
          warmCtx.fillRect(0, 0, W, H);
        }
      } else {
        setIsPlayingMotion(true);
        // Wait for the rewound frame to be on the canvas before recording —
        // but never wait forever. A backgrounded or throttled tab stops
        // firing animation frames entirely, and a bare double-rAF await
        // there leaves the export wedged on "RECORDING 0:00" with no error
        // and no way out.
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          requestAnimationFrame(() => requestAnimationFrame(done));
          window.setTimeout(done, 250);
        });
      }

      const stream = canvas.captureStream(motionTimeline.fps);

      // One mixed audio track, not one per source: the voiceover, the music
      // bed and (while it plays) the hook are all summed in the graph and
      // captured together.
      const mix = ensureMotionMix();
      if (mix) {
        mix.dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      } else if (!willPlayHook) {
        const audio = motionAudioRef.current as (HTMLAudioElement & { captureStream?: () => MediaStream }) | null;
        if (audio?.captureStream) {
          try {
            audio.captureStream().getAudioTracks().forEach((track) => stream.addTrack(track));
          } catch {
            /* video-only export — the timeline is still frame-accurate */
          }
        }
      }

      const mimeType = MP4_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mimeType) {
        throw new Error(
          "This browser cannot record MP4. Chrome 126+, Edge or Safari can — open the app there and export again."
        );
      }

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
      // Set when the hook plays fine but the main timeline's own audio never
      // confirms ready below — the hook's few seconds are already inside
      // `chunks` by then, so onstop has to know to throw them away rather
      // than download a recording that silently loses its voiceover.
      let discardRecording = false;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (discardRecording) return;
        const blob = new Blob(chunks, { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const tag = speed === 1 ? "" : `-${String(speed).replace(".", "_")}x`;
        a.href = url;
        a.download = `stratix-motion-synced${tag}-${Date.now()}.mp4`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        finish();
      };

      recorder.start();

      if (willPlayHook && hookEl) {
        // Guards the render effect off the canvas for the same reason the
        // live preview does (see its isHookPhasePlaying check) — with
        // isPlayingMotion still false here, nothing is driving motionTimeMs,
        // but an unrelated re-render could still fire that effect and paint
        // the timeline's frame 0 over the hook mid-playback without it.
        setIsHookPhasePlaying(true);
        try {
          await playHookPhase(hookEl, true);
        } finally {
          setIsHookPhasePlaying(false);
        }
      }

      // Exactly the pre-hook single-phase export from here on — the main
      // timeline starts recording only once any hook has already finished,
      // into the very same recorder/stream/chunks above.
      setIsPlayingMotion(true);
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        requestAnimationFrame(() => requestAnimationFrame(done));
        window.setTimeout(done, 250);
      });

      const hasAudioSource = !!motionAudioRef.current || !!motionMusicRef.current;
      let audioConfirmed = await waitForAudioReady(1500);
      if (hasAudioSource && !audioConfirmed) {
        // One nudge before giving up — a dropped play() promise or a context
        // that needed a second resume() is recoverable, not a hard failure.
        seekMotionTo(0);
        motionAudioRef.current?.play().catch(() => {});
        motionMusicRef.current?.play().catch(() => {});
        audioConfirmed = await waitForAudioReady(1500);
      }
      if (hasAudioSource && !audioConfirmed) {
        discardRecording = true;
        if (recorder.state !== "inactive") recorder.stop();
        setSegmentError(
          "Could not confirm the voiceover was actually playing before recording started, so the export was cancelled rather than risk a silent video. Press Play once to warm up audio, then Export again."
        );
        finish();
        return;
      }

      // Confirmed a moment ago in waitForAudioReady, but the track list is
      // rebuilt above — a source that was live then and silently dropped its
      // track since (device change, element reset) must not still export as
      // if nothing were wrong.
      if (hasAudioSource && stream.getAudioTracks().length === 0) {
        throw new Error(
          "A voiceover or music file is loaded, but no audio track could be attached to the recording. Reload the audio file and export again."
        );
      }

      const startedAt = performance.now();
      progressTimer = window.setInterval(() => {
        setTimelineExportElapsed((performance.now() - startedAt) * speed);
      }, 100);

      // Recording happens in real time, so a 2x export finishes in half the
      // wall time. A short tail keeps the final frame (and any exit fade).
      window.setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, duration / speed + 300);
    } catch (e: any) {
      console.error("Failed to record synced motion video:", e);
      setSegmentError(e?.message || "Failed to record the video.");
      finish();
    }
  };

  // Motion Video Recording Exporter
  const handleExportMotionVideo = async () => {
    if (!canvasRef.current) return;
    setIsRecordingVideo(true);

    // Selection handles are editor chrome; without this they get recorded into
    // the exported clip.
    const restoreSelection = motionData.activeLayerId;
    setMotionData((prev) => ({ ...prev, activeLayerId: undefined, isExporting: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const canvas = canvasRef.current;
      const stream = canvas.captureStream(60);
      const mimeType = MP4_MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      if (!mimeType) {
        throw new Error(
          "This browser cannot record MP4. Chrome 126+, Edge or Safari can — open the app there and export again."
        );
      }
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/mp4" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const slideName = (motionData.fileName || "").replace(/\.[^.]+$/, "") || `slide-${activeMotionIndex + 1}`;
        a.href = url;
        a.download = `stratix-motion-${slideName}-${Date.now()}.mp4`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setIsRecordingVideo(false);
        setMotionData((prev) => ({ ...prev, activeLayerId: restoreSelection, isExporting: false }));
      };

      recorder.start();
      setTimeout(() => {
        recorder.stop();
      }, 5000);
    } catch (e) {
      console.error("Failed to record motion video:", e);
      setIsRecordingVideo(false);
      setMotionData((prev) => ({ ...prev, activeLayerId: restoreSelection, isExporting: false }));
    }
  };

  return {
    playHookPhase,
    handleToggleMotionPlay,
    playMotionSfx,
    playMotionSlideChime,
    motionActiveWord,
    waitForAudioReady,
    handleExportTimelineVideo,
    handleExportMotionVideo,
    scale,
  };
}

export type MotionPlaybackExportState = ReturnType<typeof useMotionPlaybackExport>;
