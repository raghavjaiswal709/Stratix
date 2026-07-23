// Generic, parameterized background-music renderer shared by every built-in
// "trending track" preset (see reelMusicPresets.ts). Entirely synthesized —
// detuned pads over a chord loop, an optional rhythmic sub-bass pulse layer,
// and a synthesized-impulse reverb — so every track is original generated
// audio with zero copyright/licensing risk and zero network fetch. Rendered
// once, at the exact reel duration, so there's no loop-seam to hide.

export interface MusicPreset {
  id: string;
  name: string;
  mood: string;
  /** Chord progression, cycled — each chord is a list of note frequencies (Hz). */
  chords: number[][];
  /** Seconds per chord — smaller = faster/busier feel. */
  chordLen: number;
  waveform: OscillatorType;
  lowpassHz: number;
  /** 0-1 wet reverb amount. */
  reverbMix: number;
  /** Peak gain per pad note. */
  notePeak: number;
  /** Detune spread across the chord's notes, in cents — chorus/width. */
  detuneSpread: number;
  /** Adds a rhythmic one-octave-down pulse under the pads — for punchier presets. */
  bassPulse: boolean;
  pulsesPerChord: number;
  pulseWave: OscillatorType;
  pulsePeak: number;
}

function createReverbImpulse(ctx: OfflineAudioContext, duration = 2.2, decay = 3.0): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function addBassPulses(
  offline: OfflineAudioContext,
  destination: AudioNode,
  rootFreq: number,
  chordStart: number,
  chordLen: number,
  pulsesPerChord: number,
  waveform: OscillatorType,
  peak: number
) {
  if (pulsesPerChord <= 0) return;
  const pulseInterval = chordLen / pulsesPerChord;
  for (let p = 0; p < pulsesPerChord; p++) {
    const pt = chordStart + p * pulseInterval;
    const osc = offline.createOscillator();
    osc.type = waveform;
    osc.frequency.value = rootFreq / 2; // one octave down from the pad chord
    const gain = offline.createGain();
    const decayEnd = pt + Math.min(pulseInterval * 0.85, 0.55);
    gain.gain.setValueAtTime(0, pt);
    gain.gain.linearRampToValueAtTime(peak, pt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, decayEnd);
    osc.connect(gain).connect(destination);
    osc.start(pt);
    osc.stop(decayEnd + 0.05);
  }
}

export async function renderMusicTrack(preset: MusicPreset, durationSec: number, sampleRate = 44100): Promise<AudioBuffer> {
  const totalSamples = Math.max(1, Math.ceil(durationSec * sampleRate));
  const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

  const master = offline.createGain();
  master.gain.setValueAtTime(0, 0);
  master.connect(offline.destination);

  const lowpass = offline.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = preset.lowpassHz;
  lowpass.Q.value = 0.4;

  const dry = offline.createGain();
  dry.gain.value = 0.85;
  const wet = offline.createGain();
  wet.gain.value = preset.reverbMix;

  const convolver = offline.createConvolver();
  convolver.buffer = createReverbImpulse(offline);

  lowpass.connect(dry).connect(master);
  lowpass.connect(convolver);
  convolver.connect(wet).connect(master);

  // Bass pulses bypass the pad's lowpass/reverb chain — routed straight to
  // master so the rhythm stays punchy/dry instead of washing out.
  const bassBus = offline.createGain();
  bassBus.gain.value = 1;
  bassBus.connect(master);

  const { chordLen, chords } = preset;
  const overlap = Math.min(chordLen * 0.32, 1.4);
  const attack = Math.min(chordLen * 0.4, 1.7);
  const release = Math.min(chordLen * 0.42, 1.9);

  let t = 0;
  let chordIndex = 0;
  while (t < durationSec) {
    const chord = chords[chordIndex % chords.length];
    const segStart = Math.max(0, chordIndex === 0 ? 0 : t - overlap);
    const segEnd = t + chordLen + overlap;
    const attackEnd = segStart + attack;
    const fadeStart = Math.max(attackEnd + 0.3, segEnd - release);

    chord.forEach((freq, ni) => {
      const osc = offline.createOscillator();
      osc.type = preset.waveform;
      osc.frequency.value = freq;
      const spread = preset.detuneSpread;
      osc.detune.value = (ni % 2 === 0 ? -spread : spread) * 0.5 + (chordIndex % 2 === 0 ? spread * 0.25 : -spread * 0.25);

      const noteGain = offline.createGain();
      noteGain.gain.setValueAtTime(0, segStart);
      noteGain.gain.linearRampToValueAtTime(preset.notePeak, attackEnd);
      noteGain.gain.setValueAtTime(preset.notePeak, fadeStart);
      noteGain.gain.linearRampToValueAtTime(0, segEnd);

      osc.connect(noteGain).connect(lowpass);
      osc.start(segStart);
      osc.stop(segEnd + 0.05);
    });

    if (preset.bassPulse) {
      addBassPulses(offline, bassBus, chord[0], t, chordLen, preset.pulsesPerChord, preset.pulseWave, preset.pulsePeak);
    }

    t += chordLen;
    chordIndex++;
  }

  const fadeInEnd = Math.min(1.2, durationSec / 4);
  master.gain.linearRampToValueAtTime(1, fadeInEnd);
  const fadeOutStart = Math.max(fadeInEnd, durationSec - 1.3);
  master.gain.setValueAtTime(1, fadeOutStart);
  master.gain.linearRampToValueAtTime(0, Math.max(fadeOutStart + 0.05, durationSec));

  return offline.startRendering();
}

// Kept as a thin, explicit default for callers that just want "some music" —
// mirrors the single hand-tuned bed this file originally shipped with.
export const FALLBACK_PRESET: MusicPreset = {
  id: "fallback-ambient",
  name: "Ambient Bed",
  mood: "Default",
  chords: [
    [220.0, 261.63, 329.63, 392.0],
    [174.61, 220.0, 261.63, 329.63],
    [261.63, 329.63, 392.0, 493.88],
    [196.0, 246.94, 293.66, 329.63],
  ],
  chordLen: 4.2,
  waveform: "triangle",
  lowpassHz: 2600,
  reverbMix: 0.32,
  notePeak: 0.05,
  detuneSpread: 8,
  bassPulse: false,
  pulsesPerChord: 0,
  pulseWave: "sine",
  pulsePeak: 0.08,
};

export async function synthesizeAmbientBed(durationSec: number, sampleRate = 44100): Promise<AudioBuffer> {
  return renderMusicTrack(FALLBACK_PRESET, durationSec, sampleRate);
}
