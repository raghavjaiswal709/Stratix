// 10 built-in "trending" background tracks — no upload required. All are
// procedurally synthesized (reelMusicSynth.ts renders them on demand), so
// there's real stylistic variety (tempo, timbre, chord mood, reverb, an
// optional rhythmic bass pulse) with zero copyright risk and zero network
// fetch. Two are tuned specifically for trading/finance content (Corporate
// Motivation, News Pulse) since that's this app's actual audience.
import { renderMusicTrack, type MusicPreset } from "./reelMusicSynth";

const MINOR_POP = [
  [220.0, 261.63, 329.63, 392.0], // Am7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [196.0, 246.94, 293.66, 329.63], // G6
];
const BRIGHT_MAJOR = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [349.23, 440.0, 523.25, 659.25], // Fmaj7
  [392.0, 493.88, 587.33, 739.99], // Gmaj7
  [220.0, 261.63, 329.63, 392.0], // Am7
];
const JAZZY_9THS = [
  [220.0, 261.63, 329.63, 493.88], // Am9-ish
  [174.61, 220.0, 293.66, 392.0], // Fmaj9-ish
  [246.94, 311.13, 369.99, 440.0], // B7-ish
  [196.0, 246.94, 329.63, 440.0], // G9-ish
];
const DARK_MINOR = [
  [220.0, 261.63, 311.13, 369.99],
  [196.0, 233.08, 277.18, 349.23],
  [174.61, 220.0, 261.63, 311.13],
  [207.65, 246.94, 293.66, 349.23],
];
const CINEMATIC = [
  [220.0, 261.63, 329.63, 440.0],
  [196.0, 246.94, 293.66, 392.0],
  [174.61, 220.0, 261.63, 349.23],
  [246.94, 293.66, 369.99, 440.0],
];
const TENSE_NEWS = [
  [220.0, 246.94, 293.66, 349.23],
  [196.0, 233.08, 277.18, 329.63],
  [174.61, 220.0, 261.63, 311.13],
  [196.0, 246.94, 293.66, 349.23],
];

export const MUSIC_PRESETS: MusicPreset[] = [
  {
    id: "corporate-motivation",
    name: "Corporate Motivation",
    mood: "Uplifting",
    chords: BRIGHT_MAJOR,
    chordLen: 4.0,
    waveform: "triangle",
    lowpassHz: 3200,
    reverbMix: 0.26,
    notePeak: 0.055,
    detuneSpread: 6,
    bassPulse: true,
    pulsesPerChord: 2,
    pulseWave: "sine",
    pulsePeak: 0.09,
  },
  {
    id: "neon-nights",
    name: "Neon Nights",
    mood: "Synthwave",
    chords: MINOR_POP,
    chordLen: 3.2,
    waveform: "sawtooth",
    lowpassHz: 2200,
    reverbMix: 0.36,
    notePeak: 0.04,
    detuneSpread: 10,
    bassPulse: true,
    pulsesPerChord: 4,
    pulseWave: "sine",
    pulsePeak: 0.1,
  },
  {
    id: "golden-hour",
    name: "Golden Hour",
    mood: "Chill Lo-Fi",
    chords: JAZZY_9THS,
    chordLen: 5.0,
    waveform: "sine",
    lowpassHz: 2000,
    reverbMix: 0.4,
    notePeak: 0.055,
    detuneSpread: 5,
    bassPulse: false,
    pulsesPerChord: 0,
    pulseWave: "sine",
    pulsePeak: 0,
  },
  {
    id: "trap-bounce",
    name: "Trap Bounce",
    mood: "Trap",
    chords: DARK_MINOR,
    chordLen: 3.6,
    waveform: "triangle",
    lowpassHz: 2600,
    reverbMix: 0.18,
    notePeak: 0.042,
    detuneSpread: 7,
    bassPulse: true,
    pulsesPerChord: 3,
    pulseWave: "sine",
    pulsePeak: 0.12,
  },
  {
    id: "cinematic-rise",
    name: "Cinematic Rise",
    mood: "Epic",
    chords: CINEMATIC,
    chordLen: 6.0,
    waveform: "triangle",
    lowpassHz: 2800,
    reverbMix: 0.5,
    notePeak: 0.05,
    detuneSpread: 12,
    bassPulse: false,
    pulsesPerChord: 0,
    pulseWave: "sine",
    pulsePeak: 0,
  },
  {
    id: "lofi-chill",
    name: "Lo-Fi Chill",
    mood: "Jazzy",
    chords: JAZZY_9THS,
    chordLen: 4.6,
    waveform: "sine",
    lowpassHz: 1800,
    reverbMix: 0.35,
    notePeak: 0.05,
    detuneSpread: 4,
    bassPulse: false,
    pulsesPerChord: 0,
    pulseWave: "sine",
    pulsePeak: 0,
  },
  {
    id: "dark-trap",
    name: "Dark Trap",
    mood: "Moody",
    chords: DARK_MINOR,
    chordLen: 3.8,
    waveform: "triangle",
    lowpassHz: 1600,
    reverbMix: 0.3,
    notePeak: 0.048,
    detuneSpread: 14,
    bassPulse: true,
    pulsesPerChord: 2,
    pulseWave: "sine",
    pulsePeak: 0.11,
  },
  {
    id: "feel-good-pop",
    name: "Feel Good Pop",
    mood: "Upbeat Pop",
    chords: BRIGHT_MAJOR,
    chordLen: 3.0,
    waveform: "square",
    lowpassHz: 3000,
    reverbMix: 0.2,
    notePeak: 0.032,
    detuneSpread: 6,
    bassPulse: true,
    pulsesPerChord: 4,
    pulseWave: "sine",
    pulsePeak: 0.095,
  },
  {
    id: "ambient-dreams",
    name: "Ambient Dreams",
    mood: "Ethereal",
    chords: CINEMATIC,
    chordLen: 7.0,
    waveform: "sine",
    lowpassHz: 2400,
    reverbMix: 0.55,
    notePeak: 0.045,
    detuneSpread: 9,
    bassPulse: false,
    pulsesPerChord: 0,
    pulseWave: "sine",
    pulsePeak: 0,
  },
  {
    id: "news-pulse",
    name: "News Pulse",
    mood: "Tense",
    chords: TENSE_NEWS,
    chordLen: 2.6,
    waveform: "triangle",
    lowpassHz: 2800,
    reverbMix: 0.18,
    notePeak: 0.045,
    detuneSpread: 8,
    bassPulse: true,
    pulsesPerChord: 4,
    pulseWave: "triangle",
    pulsePeak: 0.085,
  },
];

export function getMusicPreset(id: string): MusicPreset {
  return MUSIC_PRESETS.find((p) => p.id === id) ?? MUSIC_PRESETS[0];
}

export async function synthesizeTrackById(id: string, durationSec: number, sampleRate = 44100) {
  return renderMusicTrack(getMusicPreset(id), durationSec, sampleRate);
}
