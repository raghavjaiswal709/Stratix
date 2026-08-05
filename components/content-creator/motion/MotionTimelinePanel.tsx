"use client";

import { useRef } from "react";
import {
  AlertCircle,
  Captions,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Gauge,
  Music,
  Music2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Type,
  Wand2,
} from "lucide-react";
import type { AutoSyncReport, CompiledTimeline, TimelineReport, TranscriptWord } from "@/lib/motion-timeline";

/** The speeds people actually reach for, plus the slider for everything else. */
const SPEED_PRESETS = [1, 1.3, 1.5, 1.7, 2] as const;

/** mm:ss.cc — centiseconds, because sync arguments happen below the second. */
export function formatTimecode(ms: number): string {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

export interface MotionTimelinePanelProps {
  slideCount: number;
  timelineText: string;
  onTimelineTextChange: (value: string) => void;
  timeline: CompiledTimeline | null;
  report: TimelineReport | null;
  onApply: () => void;
  onClear: () => void;

  /** Slides + CSV → timeline, with nothing in between. */
  onAutoSync: () => void;
  textOnlySync: boolean;
  onTextOnlySyncChange: (value: boolean) => void;
  introCard: boolean;
  onIntroCardChange: (value: boolean) => void;
  captions: boolean;
  onCaptionsChange: (value: boolean) => void;
  onCopySpeechPrompt: () => void;
  copiedSpeechPrompt: boolean;
  autoSyncReport: AutoSyncReport | null;
  autoSyncNote: string | null;

  /** PART D of the video prompt — drives the local, zero-token build. */
  manifestText: string;
  onManifestTextChange: (value: string) => void;
  onBuildFromManifest: () => void;
  manifestNote: string | null;
  manifestWarnings: string[];

  timeMs: number;
  onSeek: (ms: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  loop: boolean;
  onToggleLoop: () => void;

  transcript: TranscriptWord[] | null;
  transcriptName: string | null;
  transcriptNote: string | null;
  onTranscriptFile: (file: File) => void;
  onClearTranscript: () => void;
  activeWord: TranscriptWord | null;

  audioName: string | null;
  onAudioFile: (file: File) => void;
  onClearAudio: () => void;

  musicName: string | null;
  onMusicFile: (file: File) => void;
  onClearMusic: () => void;
  musicVolume: number;
  onMusicVolumeChange: (value: number) => void;

  exportSpeed: number;
  onExportSpeedChange: (value: number) => void;

  onCopyPrompt: () => void;
  copiedPrompt: boolean;

  onExport: () => void;
  isExporting: boolean;
  exportElapsedMs: number | null;
  /** Non-null while slide images are still decoding. */
  assetProgress: { done: number; total: number } | null;
}

export function MotionTimelinePanel(props: MotionTimelinePanelProps) {
  const {
    slideCount,
    timelineText,
    onTimelineTextChange,
    timeline,
    report,
    onApply,
    onClear,
    onAutoSync,
    textOnlySync,
    onTextOnlySyncChange,
    introCard,
    onIntroCardChange,
    captions,
    onCaptionsChange,
    onCopySpeechPrompt,
    copiedSpeechPrompt,
    autoSyncReport,
    autoSyncNote,
    manifestText,
    onManifestTextChange,
    onBuildFromManifest,
    manifestNote,
    manifestWarnings,
    timeMs,
    onSeek,
    isPlaying,
    onTogglePlay,
    loop,
    onToggleLoop,
    transcript,
    transcriptName,
    transcriptNote,
    onTranscriptFile,
    onClearTranscript,
    activeWord,
    audioName,
    onAudioFile,
    onClearAudio,
    musicName,
    onMusicFile,
    onClearMusic,
    musicVolume,
    onMusicVolumeChange,
    exportSpeed,
    onExportSpeedChange,
    onCopyPrompt,
    copiedPrompt,
    onExport,
    isExporting,
    exportElapsedMs,
    assetProgress,
  } = props;

  const csvInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const errors = report?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = report?.issues.filter((i) => i.level === "warning") ?? [];
  const duration = timeline?.durationMs ?? 0;
  const progress = duration > 0 ? Math.min(1, timeMs / duration) : 0;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-white/50" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Timeline</span>
        </div>
        <span
          className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
            timeline
              ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
              : "text-white/40 bg-white/[0.04] border-white/[0.08]"
          }`}
        >
          {timeline ? "SYNCED PLAYBACK" : "NOT APPLIED"}
        </span>
      </div>

      <p className="text-[10.5px] text-white/45 leading-relaxed">
        Load the word-level transcript and hit auto-sync. Stratix reads the words your decomposer already found on each
        poster, finds where the voiceover says them, and cuts the whole video to that &mdash; no AI, no manifest, no
        tokens. Every millisecond traces back to a row in your CSV.
      </p>

      {/* Step 1 — before any of this exists, the script and the slides have to
          be written to match each other. */}
      <div className="rounded-lg border border-white/[0.10] bg-white/[0.02] p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-white/45 uppercase tracking-widest">
            Step 1 &middot; Speech &amp; breakdown
          </label>
          <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded border border-white/[0.10] bg-white/[0.04] text-white/40">
            PROMPT
          </span>
        </div>
        <p className="text-[9.5px] text-white/40 leading-snug">
          The Hinglish script prompt &mdash; opens by recapping yesterday, and mixes Hindi with the English words
          people actually say out loud.
        </p>
        <button
          onClick={onCopySpeechPrompt}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10.5px] font-bold border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.10] text-white transition cursor-pointer"
        >
          {copiedSpeechPrompt ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">COPIED &mdash; PASTE INTO YOUR AI</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>COPY SPEECH PROMPT</span>
            </>
          )}
        </button>
      </div>

      {/* Step two — the CSV the whole sync is derived from, and the audio it came from */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FileSpreadsheet className="h-3 w-3 text-white/40" />
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Transcript</span>
          </div>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.srt,.vtt,.json,text/csv,text/plain,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onTranscriptFile(file);
              e.target.value = "";
            }}
          />
          {transcript ? (
            <>
              <p className="text-[9.5px] text-white/60 truncate" title={transcriptName ?? ""}>
                {transcriptName}
              </p>
              <p className="text-[9px] text-white/30">{transcript.length} words</p>
              {transcriptNote && <p className="text-[9px] text-amber-300/60 leading-snug">{transcriptNote}</p>}
              <button
                onClick={onClearTranscript}
                className="text-[9px] text-white/35 hover:text-white/70 cursor-pointer underline underline-offset-2"
              >
                remove
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => csvInputRef.current?.click()}
                className="w-full py-1.5 rounded-md text-[9.5px] font-semibold border border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.08] text-white/60 hover:text-white transition cursor-pointer"
              >
                Load CSV
              </button>
              {/* A file that failed to parse used to land here silently — the
                  reason was set and never rendered, so the disabled auto-sync
                  button was the only symptom. */}
              {transcriptNote && (
                <p className="text-[9px] text-red-300/80 leading-snug break-words">{transcriptNote}</p>
              )}
            </>
          )}
        </div>

        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Music className="h-3 w-3 text-white/40" />
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Voiceover</span>
          </div>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAudioFile(file);
              e.target.value = "";
            }}
          />
          {audioName ? (
            <>
              <p className="text-[9.5px] text-white/60 truncate" title={audioName}>
                {audioName}
              </p>
              <p className="text-[9px] text-white/30">Drives the clock &amp; is muxed into the export</p>
              <button
                onClick={onClearAudio}
                className="text-[9px] text-white/35 hover:text-white/70 cursor-pointer underline underline-offset-2"
              >
                remove
              </button>
            </>
          ) : (
            <button
              onClick={() => audioInputRef.current?.click()}
              className="w-full py-1.5 rounded-md text-[9.5px] font-semibold border border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.08] text-white/60 hover:text-white transition cursor-pointer"
            >
              Load audio
            </button>
          )}
        </div>
      </div>

      {/* Background music — a bed under the narration, mixed into the export */}
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Music2 className="h-3 w-3 text-white/40" />
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Background music</span>
          </div>
          {musicName && (
            <span className="text-[9px] font-mono text-white/45 tabular-nums">{Math.round(musicVolume * 100)}%</span>
          )}
        </div>
        <input
          ref={musicInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onMusicFile(file);
            e.target.value = "";
          }}
        />
        {musicName ? (
          <>
            <p className="text-[9.5px] text-white/60 truncate" title={musicName}>
              {musicName}
            </p>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(musicVolume * 100)}
              onChange={(e) => onMusicVolumeChange(Number(e.target.value) / 100)}
              className="w-full cursor-pointer"
              style={{ accentColor: "#ffffff" }}
              aria-label="Background music volume"
            />
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/30">Loops under the voiceover</span>
              <button
                onClick={onClearMusic}
                className="text-[9px] text-white/35 hover:text-white/70 cursor-pointer underline underline-offset-2"
              >
                remove
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => musicInputRef.current?.click()}
            className="w-full py-1.5 rounded-md text-[9.5px] font-semibold border border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.08] text-white/60 hover:text-white transition cursor-pointer"
          >
            Load music &mdash; starts at 20%
          </button>
        )}
      </div>

      {/* Primary path — slides + CSV, nothing else */}
      <div className="rounded-lg border border-white/[0.14] bg-white/[0.04] p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-white/55 uppercase tracking-widest">
            Auto-sync &middot; slides &times; transcript
          </label>
          <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90">
            NO AI
          </span>
        </div>

        <button
          onClick={onAutoSync}
          disabled={slideCount === 0 || !transcript?.length || !!assetProgress}
          title={
            slideCount === 0
              ? "Upload and decompose your posters first"
              : !transcript?.length
              ? "Load the word-level transcript CSV first"
              : "Cut the video to the voiceover"
          }
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-bold border border-white/[0.12] bg-white text-black hover:bg-white/90 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30"
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span>
            AUTO-SYNC {slideCount} SLIDE{slideCount === 1 ? "" : "S"} TO THE VOICEOVER
          </span>
        </button>

        {/* What gets synced. Images have nothing quotable in them, so pacing
            them across the slide is guesswork; by default they simply arrive
            with the slide and only the words wait for their cue. */}
        <button
          onClick={() => onTextOnlySyncChange(!textOnlySync)}
          className="w-full flex items-start gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1.5 text-left hover:bg-white/[0.05] transition cursor-pointer"
        >
          <span
            className={`mt-[1px] h-3.5 w-6 shrink-0 rounded-full border transition relative ${
              textOnlySync ? "border-emerald-500/40 bg-emerald-500/25" : "border-white/[0.12] bg-white/[0.06]"
            }`}
          >
            <span
              className={`absolute top-[1px] h-[10px] w-[10px] rounded-full bg-white transition-all ${
                textOnlySync ? "left-[13px]" : "left-[1px]"
              }`}
            />
          </span>
          <span className="min-w-0">
            <span className="block text-[9.5px] font-bold text-white/80">Sync text only &middot; images land with the slide</span>
            <span className="block text-[9px] text-white/40 leading-snug">
              {textOnlySync
                ? "Every image is up from the first frame of its slide, settling in like paper. Only the words wait for the voiceover."
                : "Images are paced across the slide alongside the text, as before."}
            </span>
          </span>
        </button>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onIntroCardChange(!introCard)}
            title="Open on a black card with white type over the recap, before the first poster"
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition cursor-pointer ${
              introCard ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <Type className={`h-3 w-3 shrink-0 ${introCard ? "text-emerald-300/90" : "text-white/35"}`} />
            <span className={`text-[9px] font-bold ${introCard ? "text-emerald-200/90" : "text-white/55"}`}>
              Intro card
            </span>
          </button>
          <button
            onClick={() => onCaptionsChange(!captions)}
            title="Burn word-by-word captions along the bottom of the video"
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition cursor-pointer ${
              captions ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <Captions className={`h-3 w-3 shrink-0 ${captions ? "text-emerald-300/90" : "text-white/35"}`} />
            <span className={`text-[9px] font-bold ${captions ? "text-emerald-200/90" : "text-white/55"}`}>
              Captions
            </span>
          </button>
        </div>

        {autoSyncNote && <p className="text-[9.5px] text-white/55 leading-snug">{autoSyncNote}</p>}

        {autoSyncReport && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                { label: "Confidence", value: `${Math.round(autoSyncReport.confidence * 100)}%` },
                {
                  label: "On their word",
                  value: `${autoSyncReport.anchoredElements}/${autoSyncReport.totalElements}`,
                },
                { label: "Runtime", value: formatTimecode(autoSyncReport.durationMs) },
              ].map((stat) => (
                <div key={stat.label} className="rounded-md bg-white/[0.03] border border-white/[0.06] py-1.5">
                  <div className="text-[11px] font-bold text-white font-mono">{stat.value}</div>
                  <div className="text-[8.5px] uppercase tracking-wider text-white/30">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Per-slide proof: where the cut landed, and on which words. */}
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {autoSyncReport.scenes.map((scene) => (
                <button
                  key={scene.slideIndex}
                  onClick={() => onSeek(scene.startMs)}
                  title="Jump to this slide"
                  className="w-full text-left rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 hover:bg-white/[0.05] transition cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-white/70 tabular-nums">
                      {formatTimecode(scene.startMs)}
                    </span>
                    <span className="text-[9px] font-bold text-white/85 truncate flex-1">{scene.label}</span>
                    <span
                      title={
                        scene.placedBy === "text"
                          ? "Placed by its own printed words"
                          : scene.placedBy === "bracketed"
                          ? `Its own text was not spoken, but both edges are exact — start: ${scene.edges.start}, end: ${scene.edges.end}`
                          : "No text of its own and no confident neighbour — this one is worth checking"
                      }
                      className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                        scene.placedBy === "text"
                          ? "text-emerald-300/90 bg-emerald-500/10 border-emerald-500/25"
                          : scene.placedBy === "bracketed"
                          ? "text-white/60 bg-white/[0.06] border-white/[0.12]"
                          : "text-amber-300/80 bg-amber-500/10 border-amber-500/25"
                      }`}
                    >
                      {scene.placedBy === "text"
                        ? `${Math.round(scene.coverage * 100)}% MATCH`
                        : scene.placedBy === "bracketed"
                        ? "LOCKED BY NEIGHBOURS"
                        : "CHECK THIS"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[9px] text-white/30 shrink-0 tabular-nums">
                      {scene.anchoredCount}/{scene.elementCount}
                    </span>
                    <span className="text-[9px] text-white/40 italic truncate">&ldquo;{scene.openingLine}&rdquo;</span>
                  </div>
                </button>
              ))}
            </div>

            {autoSyncReport.warnings.length > 0 && (
              <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1 [scrollbar-width:thin]">
                {autoSyncReport.warnings.map((w, i) => (
                  <p key={i} className="text-[9px] text-amber-200/70 leading-snug">
                    {w}
                  </p>
                ))}
              </div>
            )}

            {autoSyncReport.silentText.length > 0 && (
              <p className="text-[9px] text-white/35 leading-snug">
                Never spoken:{" "}
                {autoSyncReport.silentText.slice(0, 4).map((t) => `"${t.slice(0, 24)}"`).join(", ")}
                {autoSyncReport.silentText.length > 4 ? ` +${autoSyncReport.silentText.length - 4} more` : ""}.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <div className="h-px flex-1 bg-white/[0.07]" />
        <span className="text-[8.5px] uppercase tracking-widest text-white/20">or drive it from a manifest</span>
        <div className="h-px flex-1 bg-white/[0.07]" />
      </div>

      {/* Second path — build locally from the manifest */}
      <div className="rounded-lg border border-white/[0.10] bg-white/[0.02] p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
            Sync manifest &middot; PART D
          </label>
          <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90">
            0 TOKENS
          </span>
        </div>
        <textarea
          value={manifestText}
          onChange={(e) => onManifestTextChange(e.target.value)}
          spellCheck={false}
          placeholder={'{\n  "format": "stratix.sync.manifest",\n  "beats": [ … ]\n}'}
          className="w-full h-24 resize-y rounded-lg border border-white/[0.10] bg-black/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/[0.28] [scrollbar-width:thin]"
        />
        <button
          onClick={onBuildFromManifest}
          disabled={!manifestText.trim() || !transcript?.length}
          title={!transcript?.length ? "Load the word-level transcript CSV first" : "Build the timeline from the manifest"}
          className="w-full py-2 rounded-lg text-[11px] font-bold border border-white/[0.12] bg-white text-black hover:bg-white/90 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30"
        >
          BUILD SYNCED TIMELINE
        </button>
        {manifestNote && <p className="text-[9.5px] text-white/50 leading-snug">{manifestNote}</p>}
        {manifestWarnings.length > 0 && (
          <div className="space-y-0.5 max-h-28 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {manifestWarnings.map((w, i) => (
              <p key={i} className="text-[9px] text-amber-200/70 leading-snug">
                {w}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <div className="h-px flex-1 bg-white/[0.07]" />
        <span className="text-[8.5px] uppercase tracking-widest text-white/20">or hand it to an AI</span>
        <div className="h-px flex-1 bg-white/[0.07]" />
      </div>

      {/* Step 1 — the prompt */}
      <button
        onClick={onCopyPrompt}
        disabled={slideCount === 0}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.10] text-white"
      >
        {copiedPrompt ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-emerald-400">PROMPT + LAYOUT JSON COPIED — NOW ADD YOUR CSV</span>
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            <span>COPY AI PROMPT + LAYOUT JSON</span>
          </>
        )}
      </button>

      {/* Step 2 — paste the answer */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-white/25 uppercase tracking-widest block">
          Paste the timeline JSON the AI returned
        </label>
        <textarea
          value={timelineText}
          onChange={(e) => onTimelineTextChange(e.target.value)}
          spellCheck={false}
          placeholder={'{\n  "format": "stratix.motion.timeline",\n  "version": 1,\n  "scenes": [ … ]\n}'}
          className="w-full h-28 resize-y rounded-lg border border-white/[0.10] bg-black/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/[0.28] [scrollbar-width:thin]"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onApply}
            disabled={!timelineText.trim()}
            className="flex-1 py-2 rounded-lg text-[11px] font-bold border border-white/[0.12] bg-white text-black hover:bg-white/90 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30"
          >
            APPLY TIMELINE
          </button>
          <button
            onClick={onClear}
            disabled={!timelineText.trim() && !timeline}
            title="Clear the timeline and go back to loop preview"
            className="px-3 py-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.06] border border-white/[0.08] transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Validation */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span className="text-[10px] font-bold text-red-300 uppercase tracking-wider">
              Not applied — {errors.length} problem{errors.length === 1 ? "" : "s"}
            </span>
          </div>
          {errors.map((issue, i) => (
            <p key={i} className="text-[10px] text-red-200/90 leading-snug break-words">
              {issue.where ? <span className="font-mono text-red-300/70">{issue.where}: </span> : null}
              {issue.message}
            </p>
          ))}
        </div>
      )}

      {report && errors.length === 0 && (
        <div className="rounded-lg border border-white/[0.08] bg-black/30 p-2.5 space-y-2">
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {[
              { label: "Scenes", value: String(report.sceneCount) },
              { label: "Tracks", value: String(report.trackCount) },
              { label: "Cues", value: String(report.cueCount) },
              { label: "Length", value: formatTimecode(report.durationMs) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-md bg-white/[0.03] border border-white/[0.06] py-1.5">
                <div className="text-[11px] font-bold text-white font-mono">{stat.value}</div>
                <div className="text-[8.5px] uppercase tracking-wider text-white/30">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Sync proof: how many cues were retimed off the transcript, and how
              far off the authored times were. A high drift is not a problem —
              it is the fix working. */}
          {report.wordKeyedCues > 0 && (
            <div className="flex items-center justify-between rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
              <span className="text-[9.5px] text-white/45">
                <span className="font-mono text-white/80">{report.syncedCues}</span>
                <span className="text-white/25">/{report.wordKeyedCues}</span> cues locked to their spoken word
              </span>
              {report.maxDriftMs > 0 && (
                <span className="text-[9px] font-mono text-emerald-300/70" title="Largest timing correction applied">
                  −{formatTimecode(report.maxDriftMs)} drift
                </span>
              )}
            </div>
          )}

          {report.unmatchedWords.length > 0 && (
            <p className="text-[9.5px] text-amber-200/70 leading-snug">
              Not spoken in the transcript: {report.unmatchedWords.slice(0, 8).map((w) => `"${w}"`).join(", ")}
              {report.unmatchedWords.length > 8 ? ` +${report.unmatchedWords.length - 8} more` : ""}. Those cues kept
              their authored times.
            </p>
          )}

          {transcript && transcript.length === 0 && (
            <p className="text-[9.5px] text-amber-200/70 leading-snug">
              No transcript loaded — cue times are taken on trust instead of resolved against the audio.
            </p>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto pr-1 [scrollbar-width:thin]">
              <div className="flex items-center gap-1.5">
                <TriangleAlert className="h-3 w-3 text-amber-400" />
                <span className="text-[9.5px] font-bold text-amber-300/90 uppercase tracking-wider">
                  {warnings.length} warning{warnings.length === 1 ? "" : "s"} — applied anyway
                </span>
              </div>
              {warnings.map((issue, i) => (
                <p key={i} className="text-[9.5px] text-amber-200/70 leading-snug break-words pl-4">
                  {issue.where ? <span className="font-mono text-amber-300/50">{issue.where}: </span> : null}
                  {issue.message}
                </p>
              ))}
            </div>
          )}

          {report.untouchedLayers.length > 0 && (
            <p className="text-[9.5px] text-white/35 leading-snug">
              {report.untouchedLayers.length} element{report.untouchedLayers.length === 1 ? "" : "s"} never animated —
              they render static, exactly as uploaded.
            </p>
          )}
        </div>
      )}

      {/* Transport */}
      {timeline && (
        <div className="rounded-lg border border-white/[0.08] bg-black/30 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onTogglePlay}
              title={isPlaying ? "Pause" : "Play"}
              className="h-8 w-8 rounded-lg flex items-center justify-center border border-white/[0.12] bg-white/[0.06] hover:bg-white/[0.12] text-white transition cursor-pointer"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => onSeek(0)}
              title="Back to start"
              className="h-8 w-8 rounded-lg flex items-center justify-center border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-white/60 hover:text-white transition cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onToggleLoop}
              title={loop ? "Looping" : "Play once"}
              className={`h-8 w-8 rounded-lg flex items-center justify-center border transition cursor-pointer ${
                loop
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-white/[0.08] bg-white/[0.03] text-white/40 hover:text-white/70"
              }`}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>

            <div className="ml-auto font-mono text-[11px] text-white/70 tabular-nums">
              {formatTimecode(timeMs)}
              <span className="text-white/25"> / {formatTimecode(duration)}</span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(1, Math.round(duration))}
            step={10}
            value={Math.round(Math.min(timeMs, duration))}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full cursor-pointer"
            style={{ accentColor: "#ffffff" }}
          />

          {/* Scene ruler — proportional, click to jump to a scene */}
          <div className="flex gap-px h-5 rounded overflow-hidden border border-white/[0.06]">
            {timeline.scenes.map((scene) => {
              const width = duration > 0 ? ((scene.endMs - scene.startMs) / duration) * 100 : 0;
              const isActive = timeMs >= scene.startMs && timeMs < scene.endMs;
              return (
                <button
                  key={scene.index}
                  onClick={() => onSeek(scene.startMs)}
                  title={`${scene.label} · slide ${scene.slideIndex + 1} · ${formatTimecode(scene.startMs)}`}
                  style={{ width: `${width}%` }}
                  className={`h-full text-[8px] font-bold transition cursor-pointer overflow-hidden ${
                    isActive ? "bg-white/[0.22] text-white" : "bg-white/[0.05] text-white/35 hover:bg-white/[0.10]"
                  }`}
                >
                  {scene.slideIndex + 1}
                </button>
              );
            })}
          </div>

          {/* Playhead position as a hairline over the ruler's own track */}
          <div className="relative h-0.5 rounded bg-white/[0.06]">
            <div className="absolute inset-y-0 left-0 bg-white/50 rounded" style={{ width: `${progress * 100}%` }} />
          </div>

          {transcript && transcript.length > 0 && (
            <div className="pt-1 border-t border-white/[0.06]">
              <div className="text-[8.5px] uppercase tracking-wider text-white/25 mb-0.5">Spoken now</div>
              <div className="text-[12px] font-semibold text-white/85 truncate">
                {activeWord ? activeWord.text || "—" : <span className="text-white/25">—</span>}
                {activeWord && (
                  <span className="ml-2 font-mono text-[9.5px] text-white/30">
                    {formatTimecode(activeWord.startMs)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}


      {/* Export speed */}
      {timeline && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3 w-3 text-white/40" />
              <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Export speed</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-white tabular-nums">
              {exportSpeed.toFixed(2).replace(/0$/, "")}&times;
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => onExportSpeedChange(preset)}
                className={`py-1.5 rounded-md text-[9.5px] font-bold border transition cursor-pointer ${
                  Math.abs(exportSpeed - preset) < 0.001
                    ? "border-white/[0.28] bg-white text-black"
                    : "border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                {preset}&times;
              </button>
            ))}
          </div>

          <input
            type="range"
            min={50}
            max={300}
            step={5}
            value={Math.round(exportSpeed * 100)}
            onChange={(e) => onExportSpeedChange(Number(e.target.value) / 100)}
            className="w-full cursor-pointer"
            style={{ accentColor: "#ffffff" }}
            aria-label="Custom export speed"
          />

          <div className="flex items-center justify-between text-[9px] text-white/35">
            <span>0.5&times; slower</span>
            <span className="font-mono text-white/55 tabular-nums">
              final length {formatTimecode(duration / Math.max(0.25, exportSpeed))}
            </span>
            <span>3&times; faster</span>
          </div>
        </div>
      )}

      {/* Export */}
      {timeline && (
        <button
          onClick={onExport}
          disabled={isExporting || !!assetProgress}
          className="w-full py-3 rounded-xl text-[12px] font-bold border border-white/[0.12] bg-white text-black hover:bg-white/90 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {assetProgress ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                PREPARING IMAGES {assetProgress.done}/{assetProgress.total}
              </span>
            </>
          ) : isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                RECORDING {formatTimecode(exportElapsedMs ?? 0)} / {formatTimecode(duration)}
              </span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span>
                EXPORT MP4 ({formatTimecode(duration / Math.max(0.25, exportSpeed))}
                {exportSpeed !== 1 ? ` @ ${exportSpeed.toFixed(2).replace(/0$/, "")}×` : ""})
              </span>
            </>
          )}
        </button>
      )}
      {timeline && (
        <p className="text-[9px] text-white/30 leading-relaxed">
          H.264 MP4, recorded in real time from the live canvas
          {audioName || musicName
            ? ` with ${[audioName ? "your voiceover" : null, musicName ? "the music bed" : null]
                .filter(Boolean)
                .join(" and ")} mixed onto one audio track`
            : ""}
          . At {exportSpeed.toFixed(2).replace(/0$/, "")}&times; this takes about{" "}
          {formatTimecode(duration / Math.max(0.25, exportSpeed))} — keep this tab in the foreground until it finishes.
        </p>
      )}
    </div>
  );
}
