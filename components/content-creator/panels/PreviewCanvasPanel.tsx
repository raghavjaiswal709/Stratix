"use client";

import type { RefObject } from "react";
import { ChevronLeft, ChevronRight, Clapperboard, Download, ImagePlus, LayoutGrid, Loader2, RefreshCw, Upload } from "lucide-react";
import type { AspectRatio, CreatorMode, NewsItem, PosterColors, PosterElement } from "../types";
import { TimelineEditor } from "../motion/TimelineEditor";

/** The right-side interactive canvas preview: toolbar, batch pagination, canvas + drag/drop, motion TimelineEditor, bottom hint. */
export function PreviewCanvasPanel({
  panelCollapsed,
  setPanelCollapsed,
  colors,
  isBatchMode,
  download,
  rendered,
  newsData,
  setShowReelStudio,
  zipIncludedIndices,
  downloadAll,
  downloadingZip,
  scale,
  visibleNewsPosition,
  visibleNewsCount,
  goToPrevVisibleNews,
  goToNextVisibleNews,
  creatorMode,
  setShowGridView,
  previewRef,
  setIsDraggingCanvasOver,
  isDraggingCanvasOver,
  handleWatermarkFiles,
  processImageFile,
  ar,
  canvasRef,
  elementBounds,
  activeNewsIndex,
  setImageWheelRef,
  handleElementClick,
  handleLogoMouseDown,
  handleStartMotionLayerDrag,
  handleImageMouseDown,
  isDraggingLogo,
  isDraggingMotionLayer,
  isDraggingImage,
  handleImageDragOver,
  handleImageDragLeave,
  handleImageDrop,
  imageFileRef,
  motionDoc,
  applyMotionDocEdit,
  beginMotionGesture,
  motionTimeMs,
  seekMotionTo,
  isPlayingMotion,
  isHookPhasePlaying,
  handleToggleMotionPlay,
  motionTranscript,
  motionSlides,
  motionHistoryTick,
  motionUndoRef,
  motionRedoRef,
  undoMotionEdit,
  redoMotionEdit,
  motionSaveState,
}: {
  panelCollapsed: boolean;
  setPanelCollapsed: (collapsed: boolean) => void;
  colors: PosterColors;
  isBatchMode: boolean;
  download: () => void;
  rendered: boolean;
  newsData: NewsItem[];
  setShowReelStudio: (show: boolean) => void;
  zipIncludedIndices: number[];
  downloadAll: () => void;
  downloadingZip: boolean;
  scale: number;
  visibleNewsPosition: number;
  visibleNewsCount: number;
  goToPrevVisibleNews: () => void;
  goToNextVisibleNews: () => void;
  creatorMode: CreatorMode;
  setShowGridView: (show: boolean) => void;
  previewRef: RefObject<HTMLDivElement | null>;
  setIsDraggingCanvasOver: (v: boolean) => void;
  isDraggingCanvasOver: boolean;
  handleWatermarkFiles: (files: FileList | File[]) => void;
  processImageFile: (file: File) => void;
  ar: AspectRatio;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  elementBounds: PosterElement[];
  activeNewsIndex: number;
  setImageWheelRef: (node: HTMLDivElement | null) => void;
  handleElementClick: (fieldId: string) => void;
  handleLogoMouseDown: (e: React.MouseEvent, box: PosterElement) => void;
  handleStartMotionLayerDrag: (e: React.MouseEvent<HTMLDivElement>, hit: PosterElement) => void;
  handleImageMouseDown: (e: React.MouseEvent, box: PosterElement) => void;
  isDraggingLogo: boolean;
  isDraggingMotionLayer: boolean;
  isDraggingImage: boolean;
  handleImageDragOver: (e: React.DragEvent<HTMLElement>, accentColor: string) => void;
  handleImageDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleImageDrop: (e: React.DragEvent<HTMLElement>) => void;
  imageFileRef: RefObject<HTMLInputElement | null>;
  motionDoc: any;
  applyMotionDocEdit: (next: any, opts?: { commit?: boolean }) => void;
  beginMotionGesture: () => void;
  motionTimeMs: number;
  seekMotionTo: (ms: number) => void;
  isPlayingMotion: boolean;
  isHookPhasePlaying: boolean;
  handleToggleMotionPlay: () => void;
  motionTranscript: any;
  motionSlides: { fileName?: string }[];
  motionHistoryTick: number;
  motionUndoRef: RefObject<any[]>;
  motionRedoRef: RefObject<any[]>;
  undoMotionEdit: () => void;
  redoMotionEdit: () => void;
  motionSaveState: "idle" | "dirty" | "saving" | "saved" | "error";
}) {
  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-background relative"
    >
      {panelCollapsed && (
        <button
          onClick={() => setPanelCollapsed(false)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-8 h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-r-xl transition-all duration-200 text-white/60 hover:text-white cursor-pointer group shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md"
          title="Expand Panel"
        >
          <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
      {/* Apple liquid glass backdrop glow circles — sized down on mobile.
          At w-96 (384px) these overflow a ~375px-wide phone viewport; that
          overflow is invisible on its own (this column is overflow-hidden)
          but any focus event elsewhere on the page makes the browser
          auto-scroll this container to reveal it, permanently shifting the
          whole preview (toolbar, canvas, everything) sideways with no way
          to scroll it back. Keeping them within the container's own width
          means there's never any overflow to scroll to. */}
      <div
        className="absolute top-1/4 left-1/4 w-48 h-48 md:w-96 md:h-96 rounded-full blur-[128px] pointer-events-none"
        style={{ backgroundColor: colors.accent, opacity: 0.035 }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-48 h-48 md:w-96 md:h-96 rounded-full blur-[128px] pointer-events-none"
        style={{ backgroundColor: colors.accent, opacity: 0.035 }}
      />

      {/* Preview toolbar */}
      <div
        className="flex items-center justify-between px-4 py-1.5 border-b shrink-0 z-10"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex items-center gap-2 min-w-0 shrink">
          <ImagePlus className="h-4 w-4 shrink-0 text-white/50" />
          {/* Redundant next to the icon once space is tight — icon alone
              reads fine at a glance, full label comes back at sm+. */}
          <span
            className="hidden sm:inline text-[12px] font-bold uppercase tracking-wider text-white whitespace-nowrap"
          >
            Interactive Preview
          </span>
          <span
            className="text-[9px] px-2 py-0.5 rounded-md border font-semibold uppercase tracking-wider shrink-0"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#d1d5db",
            }}
          >
            {Math.round(scale * 100)}%
          </span>
        </div>
        {isBatchMode ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={download}
              disabled={!rendered || newsData.length === 0}
              title="Download current poster"
              className="flex items-center gap-1.5 px-2.5 xs:px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 text-white whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline">Download Current</span>
            </button>
            <button
              onClick={() => setShowReelStudio(true)}
              disabled={!rendered || newsData.length === 0 || zipIncludedIndices.length === 0}
              title={zipIncludedIndices.length === 0 ? "Nothing selected — check at least one item below" : "Convert the selected posters into a 9:16 reel with music & transitions"}
              className="flex items-center gap-1.5 px-2.5 xs:px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer border border-white/10 bg-white/5 hover:bg-white/10 text-white whitespace-nowrap"
            >
              <Clapperboard className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden xs:inline">Create Reel</span>
            </button>
            <button
              onClick={downloadAll}
              disabled={!rendered || newsData.length === 0 || downloadingZip || zipIncludedIndices.length === 0}
              title={zipIncludedIndices.length === 0 ? "Nothing selected — check at least one item below" : `Download ${zipIncludedIndices.length} selected poster${zipIncludedIndices.length === 1 ? "" : "s"} as a ZIP`}
              className="flex items-center gap-1.5 px-3 xs:px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 border border-transparent shadow-[0_2px_8px_rgba(255,255,255,0.1)] whitespace-nowrap"
            >
              {downloadingZip ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span className="hidden xs:inline">Packaging ZIP...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden xs:inline">Download All Batch</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={download}
            disabled={!rendered}
            title="Download PNG"
            className="flex items-center gap-1.5 px-3 xs:px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40 active:scale-95 cursor-pointer bg-white text-black hover:bg-white/90 border border-transparent shadow-[0_2px_8px_rgba(255,255,255,0.1)] shrink-0 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden xs:inline">Download PNG</span>
          </button>
        )}
      </div>

      {/* Batch pagination header (News/Facts/Learnings only) */}
      {isBatchMode && newsData.length > 0 && (
        <div
          className="flex items-center justify-between gap-2 px-5 py-2.5 border-b shrink-0 bg-white/[0.01] z-10"
          style={{ borderColor: "rgba(255, 255, 255, 0.04)" }}
        >
          <div className="text-[11px] text-[#787870] font-bold uppercase tracking-wider whitespace-nowrap truncate min-w-0">
            POSTER <span className="text-white font-bold">{(visibleNewsPosition === -1 ? 0 : visibleNewsPosition) + 1}</span> OF <span className="text-white font-bold">{visibleNewsCount}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={visibleNewsPosition <= 0}
              onClick={goToPrevVisibleNews}
              title="Previous poster"
              className="flex items-center gap-1 px-2 xs:px-2.5 py-1 rounded-lg border border-white/[0.08] hover:bg-white/5 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer text-white whitespace-nowrap"
            >
              <ChevronLeft className="h-3 w-3 shrink-0 xs:hidden" />
              <span className="hidden xs:inline">Previous</span>
            </button>
            <button
              disabled={visibleNewsPosition === -1 || visibleNewsPosition >= visibleNewsCount - 1}
              onClick={goToNextVisibleNews}
              title="Next poster"
              className="flex items-center gap-1 px-2 xs:px-2.5 py-1 rounded-lg border border-white/[0.08] hover:bg-white/5 transition-all text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer text-white whitespace-nowrap"
            >
              <ChevronRight className="h-3 w-3 shrink-0 xs:hidden" />
              <span className="hidden xs:inline">Next</span>
            </button>

            {creatorMode === "watermark" && newsData.length > 0 && (
              <button
                onClick={() => setShowGridView(true)}
                title="Open Grid View to manage and rearrange images"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/15 hover:bg-red-500/25 text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap shadow-sm"
              >
                <LayoutGrid className="h-3 w-3 shrink-0" />
                <span>Grid View ({newsData.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Canvas preview area with direct Drag & Drop image upload */}
      <div
        ref={previewRef}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingCanvasOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingCanvasOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingCanvasOver(false);
          if (e.dataTransfer.files?.length) {
            if (creatorMode === "watermark") {
              handleWatermarkFiles(e.dataTransfer.files);
            } else {
              processImageFile(e.dataTransfer.files[0]);
            }
          }
        }}
        className={`relative flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-4 md:p-6 select-none z-10 transition-colors ${
          isDraggingCanvasOver ? "bg-red-500/10 border-2 border-dashed border-red-500/50" : ""
        }`}
      >
        {/* Direct Poster Drag-and-Drop Dropzone Overlay */}
        {isDraggingCanvasOver && (
          <div className="absolute inset-4 z-50 rounded-2xl border-4 border-dashed border-red-500 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center text-white space-y-3 pointer-events-none animate-in fade-in duration-150">
            <div className="p-4 rounded-full bg-red-500/20 border border-red-500/30 text-red-400">
              <Upload className="h-10 w-10 animate-bounce" />
            </div>
            <p className="text-lg font-bold text-white">Drop Image(s) Direct onto Poster</p>
            <p className="text-xs text-white/60">Release to add logo watermark to image(s)</p>
          </div>
        )}
        {/* Carousel nav — real app buttons, not baked into the poster image.
            Changes which poster is being previewed/edited/exported. */}
        {isBatchMode && visibleNewsCount > 1 && (
          <>
            <button
              onClick={goToPrevVisibleNews}
              disabled={visibleNewsPosition <= 0}
              aria-label="Previous poster"
              title="Previous poster"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer border border-white/[0.1] bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToNextVisibleNews}
              disabled={visibleNewsPosition === -1 || visibleNewsPosition >= visibleNewsCount - 1}
              aria-label="Next poster"
              title="Next poster"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer border border-white/[0.1] bg-black/50 backdrop-blur-sm text-white/80 hover:bg-black/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        <div
          style={{
            width: ar.w * scale,
            height: ar.h * scale,
            flexShrink: 0,
            position: "relative",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: ar.w,
              height: ar.h,
              transformOrigin: "top left",
              transform: `scale(${scale})`,
              display: "block",
              borderRadius: 2,
              boxShadow: `0 0 0 1px ${colors.accent}40, 0 24px 64px rgba(0,0,0,0.6)`,
            }}
          />
          {/* Interactive Element Boundaries Overlay */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: ar.w * scale,
              height: ar.h * scale,
              pointerEvents: "none",
            }}
          >
            {elementBounds.map((box, i) => {
              const isWatermarkLogo = box.id === "watermarkLogo";
              const isNewsImage = box.id === "imageUrl" && isBatchMode;
              const hasImage = isNewsImage && !!newsData[activeNewsIndex]?.imageUrl;
              return (
                <div
                  key={`${box.id}-${i}-${box.x}-${box.y}`}
                  ref={hasImage ? setImageWheelRef : undefined}
                  onClick={() => handleElementClick(box.id)}
                  onMouseDown={
                    isWatermarkLogo
                      ? (e) => handleLogoMouseDown(e, box)
                      : creatorMode === "motion"
                      ? (e) => handleStartMotionLayerDrag(e, box)
                      : hasImage
                      ? (e) => handleImageMouseDown(e, box)
                      : undefined
                  }
                  className={`absolute pointer-events-auto border border-dashed group transition-all duration-200 rounded ${
                    isWatermarkLogo
                      ? "border-red-500/40 bg-red-500/[0.08] hover:border-red-500 hover:bg-red-500/20"
                      : creatorMode === "motion"
                      ? "border-purple-500/40 bg-purple-500/[0.05] hover:border-purple-500 hover:bg-purple-500/15"
                      : "border-transparent"
                  }`}
                  style={{
                    left: box.x * scale,
                    top: box.y * scale,
                    width: box.w * scale,
                    height: box.h * scale,
                    cursor: isWatermarkLogo
                      ? (isDraggingLogo ? "grabbing" : "move")
                      : creatorMode === "motion"
                      ? (isDraggingMotionLayer ? "grabbing" : "move")
                      : hasImage
                      ? (isDraggingImage ? "grabbing" : "grab")
                      : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isWatermarkLogo) {
                      e.currentTarget.style.borderColor = colors.accent;
                      e.currentTarget.style.backgroundColor = `${colors.accent}15`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isWatermarkLogo) {
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                  onDragOver={box.id === "imageUrl" ? (e) => handleImageDragOver(e, colors.accent) : undefined}
                  onDragLeave={box.id === "imageUrl" ? handleImageDragLeave : undefined}
                  onDrop={box.id === "imageUrl" ? handleImageDrop : undefined}
                >
                  {/* Floating badge tooltip on hover */}
                  <div
                    className="absolute opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none px-2 py-0.5 rounded text-[8.5px] font-bold tracking-wider uppercase z-20 whitespace-nowrap"
                    style={{
                      top: "-20px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(255, 255, 255, 0.9)",
                      color: "#000000",
                      fontFamily: "var(--font-sans), sans-serif",
                      boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                    }}
                  >
                    {isWatermarkLogo
                      ? "Drag Logo Anywhere on Image"
                      : hasImage
                      ? "Drag to Pan · Scroll to Zoom"
                      : `Edit ${box.label}`}
                  </div>

                  {/* Dedicated replace-image button — only once an image exists;
                      clicking the box itself now pans, so replacement needs its
                      own affordance, always visible in the corner. */}
                  {hasImage && (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        imageFileRef.current?.click();
                      }}
                      title="Change image"
                      className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-all opacity-0 group-hover:opacity-100"
                      style={{
                        background: "rgba(10,10,10,0.65)",
                        color: "rgba(255,255,255,0.9)",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      <Upload className="h-2.5 w-2.5" />
                      Change Image
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline editor — macro (scenes) over micro (elements and their
          cues), directly under the frame it is editing. */}
      {creatorMode === "motion" && motionDoc && motionDoc.scenes.length > 0 && (
        <TimelineEditor
          doc={motionDoc}
          onChange={applyMotionDocEdit}
          onBeginGesture={beginMotionGesture}
          timeMs={motionTimeMs}
          onSeek={seekMotionTo}
          isPlaying={isPlayingMotion || isHookPhasePlaying}
          onTogglePlay={handleToggleMotionPlay}
          words={motionTranscript ?? []}
          slideNames={motionSlides.map((s) => s.fileName || "")}
          canUndo={motionHistoryTick >= 0 && motionUndoRef.current.length > 0}
          canRedo={motionHistoryTick >= 0 && motionRedoRef.current.length > 0}
          onUndo={undoMotionEdit}
          onRedo={redoMotionEdit}
          saveState={motionSaveState}
        />
      )}

      {/* Bottom hint */}
      <div
        className="hidden sm:flex items-center justify-center gap-1.5 px-3 py-2.5 border-t shrink-0 z-10"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}
      >
        <span
          className="text-[9px] uppercase tracking-[0.15em] text-[#787870] text-center truncate"
        >
          {isBatchMode
            ? "Click Next/Previous or select items in the sidebar to cycle through the batch"
            : "Click any element on the poster to customize it in the sidebar"
          }
        </span>
      </div>
    </div>
  );
}
