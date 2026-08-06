export * from "./types";
export * from "./easing";
export { CUE_DOCS, CAMERA_CUE_DOCS, CUE_NAMES, CAMERA_CUE_NAMES, type CueDoc } from "./cues";
export { parseLooseJson } from "./parse";
export { compileTimeline, parseMotionTimeline, type TimelineSlideLike, type CompileOptions } from "./compile";
export { sampleTimeline, sampleChannel, findSceneIndex } from "./sample";
export {
  parseSyncManifest,
  extractManifestLines,
  bindBeatToSlide,
  SYNC_MANIFEST_FORMAT,
  type SyncManifest,
  type ManifestBeat,
  type ManifestElement,
  type ManifestParseResult,
  type Binding,
} from "./manifest";
export { buildTimelineFromManifest, type BuildOptions, type BuildResult, type BuildReport } from "./build";
export {
  autoSyncTimeline,
  type AutoSyncOptions,
  type AutoSyncResult,
  type AutoSyncReport,
  type AutoSyncSceneReport,
} from "./autosync";
export {
  buildTranscriptIndex,
  locatePhrase,
  tokenize,
  normalizeToken as normalizePrintedToken,
  type TranscriptIndex,
  type PhraseLocation,
} from "./text-match";
export {
  parseTranscriptCsv,
  parseTranscriptFile,
  wordAt,
  findWordTime,
  type TranscriptWord,
  type TranscriptParseResult,
  type WordMatch,
} from "./transcript";
