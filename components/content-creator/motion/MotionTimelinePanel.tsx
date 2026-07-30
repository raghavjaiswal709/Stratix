"use client";

import { useRef } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Music,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { CompiledTimeline, TimelineReport, TranscriptWord } from "@/lib/motion-timeline";

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

  onCopyPrompt: () => void;
  copiedPrompt: boolean;

  onExport: () => void;
  isExporting: boolean;
  exportElapsedMs: number | null;
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
    onCopyPrompt,
    copiedPrompt,
    onExport,
    isExporting,
    exportElapsedMs,
  } = props;

  const csvInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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
          <span className="text-xs font-bold text-white uppercase tracking-wider">AI Timeline</span>
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
        Copy the prompt below, paste it into any capable AI chat together with this batch&rsquo;s layout JSON and your
        word-level transcript CSV, then paste the timeline it returns back in here. Playback and export then follow that
        timeline to the millisecond.
      </p>

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

      {/* Optional inputs — transcript & audio */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <FileSpreadsheet className="h-3 w-3 text-white/40" />
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Transcript</span>
          </div>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
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
            <button
              onClick={() => csvInputRef.current?.click()}
              className="w-full py-1.5 rounded-md text-[9.5px] font-semibold border border-white/[0.10] bg-white/[0.03] hover:bg-white/[0.08] text-white/60 hover:text-white transition cursor-pointer"
            >
              Load CSV
            </button>
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

      {/* Export */}
      {timeline && (
        <button
          onClick={onExport}
          disabled={isExporting}
          className="w-full py-3 rounded-xl text-[12px] font-bold border border-white/[0.12] bg-white text-black hover:bg-white/90 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                RECORDING {formatTimecode(exportElapsedMs ?? 0)} / {formatTimecode(duration)}
              </span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span>EXPORT SYNCED VIDEO ({formatTimecode(duration)})</span>
            </>
          )}
        </button>
      )}
      {timeline && (
        <p className="text-[9px] text-white/30 leading-relaxed">
          Records in real time from the live canvas{audioName ? ", with your voiceover on the audio track" : ""}. Keep
          this tab in the foreground until it finishes.
        </p>
      )}
    </div>
  );
}
