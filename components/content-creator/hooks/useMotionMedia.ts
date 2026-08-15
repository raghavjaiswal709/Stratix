"use client";

import { useCallback, useEffect, type RefObject } from "react";
import { uploadMotionAssetToR2 } from "@/lib/motion-assets";
import { parseTranscriptFile } from "@/lib/motion-timeline/transcript";
import type { TranscriptWord } from "@/lib/motion-timeline";

/**
 * Transcript / voiceover audio / background music upload+clear handlers for
 * motion mode, plus the small effects that keep volume, export speed, and
 * element cleanup in sync. Operates entirely on refs/state owned by
 * useMotionCore, passed in.
 */
export function useMotionMedia({
  motionAudioRef,
  motionAudioUrlRef,
  motionAudioR2UrlRef,
  setMotionAudioR2Url,
  setMotionAudioName,
  motionMusicRef,
  motionMusicUrlRef,
  motionMusicR2UrlRef,
  setMotionMusicR2Url,
  setMotionMusicName,
  motionMixRef,
  motionCsvR2UrlRef,
  setMotionCsvR2Url,
  motionTranscriptRawTextRef,
  setMotionTranscriptRawText,
  setMotionTranscript,
  setMotionTranscriptName,
  setMotionTranscriptNote,
  setSegmentError,
  seekMotionTo,
  motionMusicVolume,
  motionExportSpeed,
  motionSpeedRef,
}: {
  motionAudioRef: RefObject<HTMLAudioElement | null>;
  motionAudioUrlRef: RefObject<string | null>;
  motionAudioR2UrlRef: RefObject<string | null>;
  setMotionAudioR2Url: (url: string | null) => void;
  setMotionAudioName: (name: string | null) => void;
  motionMusicRef: RefObject<HTMLAudioElement | null>;
  motionMusicUrlRef: RefObject<string | null>;
  motionMusicR2UrlRef: RefObject<string | null>;
  setMotionMusicR2Url: (url: string | null) => void;
  setMotionMusicName: (name: string | null) => void;
  motionMixRef: RefObject<unknown | null>;
  motionCsvR2UrlRef: RefObject<string | null>;
  setMotionCsvR2Url: (url: string | null) => void;
  motionTranscriptRawTextRef: RefObject<string | null>;
  setMotionTranscriptRawText: (text: string | null) => void;
  setMotionTranscript: (words: TranscriptWord[] | null) => void;
  setMotionTranscriptName: (name: string | null) => void;
  setMotionTranscriptNote: (note: string | null) => void;
  setSegmentError: (msg: string | null) => void;
  seekMotionTo: (ms: number) => void;
  motionMusicVolume: number;
  motionExportSpeed: number;
  motionSpeedRef: RefObject<number>;
}) {
  const handleMotionTranscriptFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      motionTranscriptRawTextRef.current = text;
      setMotionTranscriptRawText(text);

      const parsed = parseTranscriptFile(text);
      if (parsed.words.length === 0) {
        setMotionTranscript(null);
        setMotionTranscriptName(null);
        setMotionTranscriptNote(
          `${file.name}: ${parsed.warnings[0] || "no timed words found in that file."}`
        );
        return;
      }
      setMotionTranscript(parsed.words);
      setMotionTranscriptName(file.name);
      setMotionTranscriptNote(
        [parsed.unit === "s" ? "Read as seconds." : "Read as milliseconds.", ...parsed.warnings].join(" ")
      );

      // Upload CSV voiceover file to Cloudflare R2 in background
      try {
        const r2Url = await uploadMotionAssetToR2(file, "motion-csv");
        motionCsvR2UrlRef.current = r2Url;
        setMotionCsvR2Url(r2Url);
      } catch (err) {
        console.warn("Could not upload CSV voiceover to Cloudflare R2:", err);
      }
    } catch (err: any) {
      setMotionTranscript(null);
      setMotionTranscriptName(null);
      setMotionTranscriptNote(`Could not read ${file.name}: ${err?.message || "unknown error"}.`);
    }
  }, [motionCsvR2UrlRef, motionTranscriptRawTextRef, setMotionCsvR2Url, setMotionTranscript, setMotionTranscriptName, setMotionTranscriptNote, setMotionTranscriptRawText]);

  const clearMotionTranscript = useCallback(() => {
    setMotionTranscript(null);
    setMotionTranscriptName(null);
    setMotionTranscriptNote(null);
    motionTranscriptRawTextRef.current = null;
    setMotionTranscriptRawText(null);
    motionCsvR2UrlRef.current = null;
    setMotionCsvR2Url(null);
  }, [motionCsvR2UrlRef, motionTranscriptRawTextRef, setMotionCsvR2Url, setMotionTranscript, setMotionTranscriptName, setMotionTranscriptNote, setMotionTranscriptRawText]);

  const handleMotionAudioFile = useCallback(async (file: File) => {
    if (motionAudioUrlRef.current && motionAudioUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionAudioUrlRef.current);
    }
    motionAudioRef.current?.pause();

    const localUrl = URL.createObjectURL(file);
    motionAudioUrlRef.current = localUrl;
    const audio = new Audio(localUrl);
    audio.preload = "auto";
    motionAudioRef.current = audio;
    setMotionAudioName(file.name);
    seekMotionTo(0);

    // Upload voiceover audio file to Cloudflare R2 in background
    try {
      const r2Url = await uploadMotionAssetToR2(file, "motion-audio");
      motionAudioR2UrlRef.current = r2Url;
      setMotionAudioR2Url(r2Url);
    } catch (err) {
      console.warn("Could not upload voiceover audio to Cloudflare R2:", err);
    }
  }, [motionAudioR2UrlRef, motionAudioRef, motionAudioUrlRef, seekMotionTo, setMotionAudioName, setMotionAudioR2Url]);

  const clearMotionAudio = useCallback(() => {
    motionAudioRef.current?.pause();
    if (motionAudioUrlRef.current && motionAudioUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionAudioUrlRef.current);
    }
    motionAudioUrlRef.current = null;
    motionAudioRef.current = null;
    motionAudioR2UrlRef.current = null;
    setMotionAudioR2Url(null);
    setMotionAudioName(null);
  }, [motionAudioR2UrlRef, motionAudioRef, motionAudioUrlRef, setMotionAudioName, setMotionAudioR2Url]);

  const handleMotionMusicFile = useCallback(async (file: File) => {
    if (motionMusicUrlRef.current && motionMusicUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionMusicUrlRef.current);
    }
    motionMusicRef.current?.pause();
    motionMixRef.current = null;

    const localUrl = URL.createObjectURL(file);
    motionMusicUrlRef.current = localUrl;
    const audio = new Audio(localUrl);
    audio.preload = "auto";
    audio.loop = true;
    motionMusicRef.current = audio;
    setMotionMusicName(file.name);

    // Upload background music file to Cloudflare R2 in background
    try {
      const r2Url = await uploadMotionAssetToR2(file, "motion-music");
      motionMusicR2UrlRef.current = r2Url;
      setMotionMusicR2Url(r2Url);
    } catch (err) {
      console.warn("Could not upload background music to Cloudflare R2:", err);
    }
  }, [motionMixRef, motionMusicR2UrlRef, motionMusicRef, motionMusicUrlRef, setMotionMusicName, setMotionMusicR2Url]);

  const clearMotionMusic = useCallback(() => {
    motionMusicRef.current?.pause();
    if (motionMusicUrlRef.current && motionMusicUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(motionMusicUrlRef.current);
    }
    motionMusicUrlRef.current = null;
    motionMusicRef.current = null;
    motionMusicR2UrlRef.current = null;
    setMotionMusicR2Url(null);
    motionMixRef.current = null;
    setMotionMusicName(null);
  }, [motionMixRef, motionMusicR2UrlRef, motionMusicRef, motionMusicUrlRef, setMotionMusicName, setMotionMusicR2Url]);

  /**
   * One combined picker for both files an auto-sync project needs, instead
   * of hunting down which of two buttons a given file goes in. Each
   * selection is routed by its own extension/MIME type — CSV-like text to
   * the transcript slot, anything audio to the voiceover slot — so a
   * multi-select of both files at once lands each one correctly on its own.
   */
  const handleMotionCombinedFiles = useCallback(
    (files: File[]) => {
      const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|flac|webm)$/i;
      const CSV_EXT = /\.(csv|tsv|txt|srt|vtt|json)$/i;

      let csvFile: File | null = null;
      let audioFile: File | null = null;
      const extras: string[] = [];
      const unrecognized: string[] = [];

      files.forEach((file) => {
        const isAudio = file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
        const isCsvLike =
          !isAudio && (file.type.startsWith("text/") || file.type === "application/json" || CSV_EXT.test(file.name));

        if (isAudio) {
          if (!audioFile) audioFile = file;
          else extras.push(file.name);
        } else if (isCsvLike) {
          if (!csvFile) csvFile = file;
          else extras.push(file.name);
        } else {
          unrecognized.push(file.name);
        }
      });

      if (csvFile) void handleMotionTranscriptFile(csvFile);
      if (audioFile) void handleMotionAudioFile(audioFile);

      if (unrecognized.length > 0 || extras.length > 0) {
        const parts: string[] = [];
        if (unrecognized.length > 0) {
          parts.push(
            `couldn't tell what ${unrecognized.join(", ")} ${
              unrecognized.length === 1 ? "is" : "are"
            } — rename with a .csv or .wav/.mp3 extension and pick it on its own`
          );
        }
        if (extras.length > 0) {
          parts.push(`only the first CSV and the first audio file are used — ignored ${extras.join(", ")}`);
        }
        setSegmentError(parts.join("; ") + ".");
      }
    },
    [handleMotionTranscriptFile, handleMotionAudioFile, setSegmentError]
  );

  // Live volume: the gain node when the graph exists, the element otherwise.
  useEffect(() => {
    const mix = motionMixRef.current as { musicGain: GainNode } | null;
    if (mix) mix.musicGain.gain.value = motionMusicVolume;
    else if (motionMusicRef.current) motionMusicRef.current.volume = motionMusicVolume;
  }, [motionMusicVolume, motionMixRef, motionMusicRef]);

  // Only the voiceover tracks export speed — the render clock is slaved to
  // its currentTime (see the "Audio position is already in timeline time"
  // comment in useMotionPlaybackExport), so it has to actually play faster
  // to keep the timeline in sync. Music and SFX are not sync-critical, and
  // scaling their playbackRate would pitch-shift them (chipmunk at >1x,
  // droning at <1x) — always audibly wrong — so music is pinned to its own
  // natural rate regardless of export speed. SFX are unaffected for the same
  // reason: playTransitionSfx/playAudioFile never read motionSpeedRef.
  useEffect(() => {
    motionSpeedRef.current = motionExportSpeed;
    const rate = Math.max(0.25, Math.min(4, motionExportSpeed));
    if (motionAudioRef.current) {
      try {
        motionAudioRef.current.playbackRate = rate;
      } catch {
        /* rate out of range for this element */
      }
    }
    if (motionMusicRef.current) {
      try {
        motionMusicRef.current.playbackRate = 1;
      } catch {
        /* ignore */
      }
    }
  }, [motionExportSpeed, motionSpeedRef, motionAudioRef, motionMusicRef]);

  useEffect(() => {
    return () => {
      motionMusicRef.current?.pause();
      if (motionMusicUrlRef.current) URL.revokeObjectURL(motionMusicUrlRef.current);
      void (motionMixRef.current as { ctx: AudioContext } | null)?.ctx.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      motionAudioRef.current?.pause();
      if (motionAudioUrlRef.current) URL.revokeObjectURL(motionAudioUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    handleMotionTranscriptFile,
    clearMotionTranscript,
    handleMotionAudioFile,
    clearMotionAudio,
    handleMotionMusicFile,
    clearMotionMusic,
    handleMotionCombinedFiles,
  };
}

export type MotionMediaState = ReturnType<typeof useMotionMedia>;
