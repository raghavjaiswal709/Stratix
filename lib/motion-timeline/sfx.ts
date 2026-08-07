import type { AudioSfxType } from "./types";

/** Cache of synthesized audio buffers by SFX type and sample rate. */
const bufferCache = new Map<string, AudioBuffer>();

/** Converts an AudioBuffer to a downloadable PCM 16-bit WAV Blob. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  let channels: Float32Array[] = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function writeString(str: string) {
    for (let i = 0; i < str.length; i++) {
      out.setUint8(pos++, str.charCodeAt(i));
    }
  }

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  writeString("RIFF");
  setUint32(length - 8);
  writeString("WAVE");
  writeString("fmt ");
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  writeString("data");
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out.buffer], { type: "audio/wav" });
}

/** Synthesizes high-quality transition SFX buffers using Web Audio API OfflineAudioContext. */
export async function synthesizeSfxBuffer(sfx: AudioSfxType, sampleRate = 44100): Promise<AudioBuffer> {
  const cacheKey = `${sfx}:${sampleRate}`;
  if (bufferCache.has(cacheKey)) {
    return bufferCache.get(cacheKey)!;
  }

  let duration = 0.45;
  if (sfx === "glitch") duration = 0.38;
  else if (sfx === "flash") duration = 0.28;
  else if (sfx === "pop") duration = 0.18;
  else if (sfx === "shutter") duration = 0.22;
  else if (sfx === "riser") duration = 0.65;
  else if (sfx === "impact") duration = 0.55;

  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const offline = new OfflineAudioContext(1, length, sampleRate);

  const noiseBuffer = offline.createBuffer(1, length, sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  switch (sfx) {
    case "whoosh": {
      // Smooth rising-then-falling bandpass noise sweep
      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const sweep = offline.createBiquadFilter();
      sweep.type = "bandpass";
      sweep.Q.value = 0.85;
      sweep.frequency.setValueAtTime(260, 0);
      sweep.frequency.exponentialRampToValueAtTime(4600, duration * 0.45);
      sweep.frequency.exponentialRampToValueAtTime(180, duration);

      const highShelf = offline.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 3200;
      highShelf.gain.value = 4;

      const env = offline.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(0.95, duration * 0.15);
      env.gain.linearRampToValueAtTime(0, duration);

      noise.connect(sweep).connect(highShelf).connect(env).connect(offline.destination);
      noise.start(0);
      break;
    }
    case "glitch": {
      // Bitcrushed pulse bursts with random pitch shifts
      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = offline.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 4.5;
      filter.frequency.setValueAtTime(1200, 0);
      filter.frequency.setValueAtTime(3400, duration * 0.25);
      filter.frequency.setValueAtTime(800, duration * 0.5);
      filter.frequency.setValueAtTime(5200, duration * 0.75);

      const osc = offline.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, 0);
      osc.frequency.linearRampToValueAtTime(45, duration);

      const env = offline.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(0.85, 0.03);
      env.gain.setValueAtTime(0.1, duration * 0.35);
      env.gain.setValueAtTime(0.9, duration * 0.45);
      env.gain.linearRampToValueAtTime(0, duration);

      noise.connect(filter).connect(env);
      osc.connect(env);
      env.connect(offline.destination);
      noise.start(0);
      osc.start(0);
      break;
    }
    case "flash": {
      // High-frequency bright pop with metallic ringing decay
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1800, 0);
      osc.frequency.exponentialRampToValueAtTime(400, duration);

      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const highpass = offline.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 4000;

      const env = offline.createGain();
      env.gain.setValueAtTime(1, 0);
      env.gain.exponentialRampToValueAtTime(0.001, duration);

      osc.connect(env);
      noise.connect(highpass).connect(env);
      env.connect(offline.destination);
      osc.start(0);
      noise.start(0);
      break;
    }
    case "zoom": {
      // Sub-bass pitch drop + fast noise rush
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(320, 0);
      osc.frequency.exponentialRampToValueAtTime(40, duration);

      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const sweep = offline.createBiquadFilter();
      sweep.type = "lowpass";
      sweep.frequency.setValueAtTime(400, 0);
      sweep.frequency.exponentialRampToValueAtTime(3800, duration * 0.4);
      sweep.frequency.exponentialRampToValueAtTime(200, duration);

      const env = offline.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(0.9, 0.08);
      env.gain.linearRampToValueAtTime(0, duration);

      osc.connect(env);
      noise.connect(sweep).connect(env);
      env.connect(offline.destination);
      osc.start(0);
      noise.start(0);
      break;
    }
    case "whip": {
      // High-speed resonant air whip pass
      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = offline.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 3.2;
      filter.frequency.setValueAtTime(500, 0);
      filter.frequency.exponentialRampToValueAtTime(6500, duration * 0.5);
      filter.frequency.exponentialRampToValueAtTime(300, duration);

      const env = offline.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(0.9, duration * 0.2);
      env.gain.linearRampToValueAtTime(0, duration);

      noise.connect(filter).connect(env).connect(offline.destination);
      noise.start(0);
      break;
    }
    case "spin": {
      // Swirling double-frequency vortex
      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const f1 = offline.createBiquadFilter();
      f1.type = "bandpass";
      f1.Q.value = 2.0;
      f1.frequency.setValueAtTime(400, 0);
      f1.frequency.exponentialRampToValueAtTime(3200, duration * 0.5);
      f1.frequency.exponentialRampToValueAtTime(300, duration);

      const osc = offline.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(120, 0);
      osc.frequency.exponentialRampToValueAtTime(800, duration * 0.5);
      osc.frequency.exponentialRampToValueAtTime(90, duration);

      const env = offline.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(0.85, duration * 0.25);
      env.gain.linearRampToValueAtTime(0, duration);

      noise.connect(f1).connect(env);
      osc.connect(env);
      env.connect(offline.destination);
      noise.start(0);
      osc.start(0);
      break;
    }
    case "iris": {
      // Mechanical aperture click + resonant sweep
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(900, 0);
      osc.frequency.exponentialRampToValueAtTime(200, duration);

      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = offline.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 5.0;
      filter.frequency.setValueAtTime(2200, 0);
      filter.frequency.linearRampToValueAtTime(600, duration);

      const env = offline.createGain();
      env.gain.setValueAtTime(0.9, 0);
      env.gain.exponentialRampToValueAtTime(0.001, duration);

      osc.connect(env);
      noise.connect(filter).connect(env);
      env.connect(offline.destination);
      osc.start(0);
      noise.start(0);
      break;
    }
    case "pop": {
      // Punchy resonant bubble pop
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, 0);
      osc.frequency.exponentialRampToValueAtTime(120, duration);

      const env = offline.createGain();
      env.gain.setValueAtTime(1, 0);
      env.gain.exponentialRampToValueAtTime(0.001, duration);

      osc.connect(env).connect(offline.destination);
      osc.start(0);
      break;
    }
    case "riser": {
      // Tension elevator riser sweep
      const osc = offline.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(80, 0);
      osc.frequency.exponentialRampToValueAtTime(1400, duration * 0.85);

      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = offline.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(200, 0);
      filter.frequency.exponentialRampToValueAtTime(4500, duration * 0.85);

      const env = offline.createGain();
      env.gain.setValueAtTime(0.05, 0);
      env.gain.linearRampToValueAtTime(0.9, duration * 0.85);
      env.gain.linearRampToValueAtTime(0, duration);

      osc.connect(env);
      noise.connect(filter).connect(env);
      env.connect(offline.destination);
      osc.start(0);
      noise.start(0);
      break;
    }
    case "impact": {
      // Sub-bass impact thud
      const osc = offline.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, 0);
      osc.frequency.exponentialRampToValueAtTime(30, duration);

      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const lowpass = offline.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 280;

      const env = offline.createGain();
      env.gain.setValueAtTime(1, 0);
      env.gain.exponentialRampToValueAtTime(0.001, duration);

      osc.connect(env);
      noise.connect(lowpass).connect(env);
      env.connect(offline.destination);
      osc.start(0);
      noise.start(0);
      break;
    }
    case "shutter": {
      // Double camera shutter click
      const osc = offline.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(1200, 0);
      osc.frequency.setValueAtTime(800, 0.08);

      const env = offline.createGain();
      env.gain.setValueAtTime(0.8, 0);
      env.gain.setValueAtTime(0.01, 0.05);
      env.gain.setValueAtTime(0.9, 0.08);
      env.gain.exponentialRampToValueAtTime(0.001, duration);

      osc.connect(env).connect(offline.destination);
      osc.start(0);
      break;
    }
    case "breeze":
    default: {
      // Soft atmospheric breeze dissolve
      const noise = offline.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = offline.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 0.5;
      filter.frequency.setValueAtTime(800, 0);
      filter.frequency.linearRampToValueAtTime(1800, duration * 0.5);
      filter.frequency.linearRampToValueAtTime(600, duration);

      const env = offline.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(0.5, duration * 0.5);
      env.gain.linearRampToValueAtTime(0, duration);

      noise.connect(filter).connect(env).connect(offline.destination);
      noise.start(0);
      break;
    }
  }

  const rendered = await offline.startRendering();
  bufferCache.set(cacheKey, rendered);
  return rendered;
}

let activeAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!activeAudioCtx || activeAudioCtx.state === "closed") {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    activeAudioCtx = new AudioCtx();
  }
  if (activeAudioCtx.state === "suspended") {
    activeAudioCtx.resume().catch(() => {});
  }
  return activeAudioCtx;
}

/** Loads an SFX AudioBuffer from public/sfx/sfx_<type>.wav file, with synthesis fallback. */
export async function loadSfxBuffer(sfx: AudioSfxType, ctx: AudioContext): Promise<AudioBuffer> {
  const cacheKey = `file:${sfx}:${ctx.sampleRate}`;
  if (bufferCache.has(cacheKey)) {
    return bufferCache.get(cacheKey)!;
  }

  try {
    const res = await fetch(`/sfx/sfx_${sfx}.wav`);
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      bufferCache.set(cacheKey, decoded);
      return decoded;
    }
  } catch (err) {
    console.warn(`Failed to fetch /sfx/sfx_${sfx}.wav, falling back to synthesized buffer`, err);
  }

  return synthesizeSfxBuffer(sfx, ctx.sampleRate);
}

/**
 * Plays the specified transition sound effect immediately with volume control.
 *
 * Takes an optional external AudioContext + destination node so a caller that
 * owns a recording graph (see ContentCreatorPage's motion mix) can route the
 * SFX into the same MediaStreamAudioDestinationNode the exporter captures.
 * Without that, the whoosh only ever reaches the live speakers — never the
 * exported MP4, since MediaRecorder only captures what is actually connected
 * to the stream it was handed, and this module's own default AudioContext is
 * a separate audio graph the recorder never sees. Falls back to a private
 * context (and the plain speakers) when no external one is supplied, so a
 * standalone "preview this sound" button still works without a recording
 * graph behind it.
 */
export async function playTransitionSfx(
  sfx: AudioSfxType,
  volume = 0.6,
  externalCtx?: AudioContext,
  destination?: AudioNode
) {
  try {
    const ctx = externalCtx ?? getAudioContext();
    const buf = await loadSfxBuffer(sfx, ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gainNode = ctx.createGain();
    gainNode.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gainNode).connect(destination ?? ctx.destination);
    src.start();
  } catch (err) {
    console.warn("Failed to play transition SFX:", err);
  }
}

/** Cache of decoded arbitrary audio files (as opposed to the named SFX catalog above), keyed by URL + sample rate. */
const fileBufferCache = new Map<string, AudioBuffer>();

/** Loads and decodes an arbitrary audio file (e.g. a user-supplied chime) from a public/ URL. No synth fallback — a missing file just fails to play. */
export async function loadAudioFileBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  const cacheKey = `${url}:${ctx.sampleRate}`;
  const cached = fileBufferCache.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  fileBufferCache.set(cacheKey, decoded);
  return decoded;
}

/**
 * Plays an arbitrary audio file (e.g. a user-supplied slide chime) once, with
 * the same external-context/destination routing as playTransitionSfx — see
 * its own doc comment for why that matters for the export. Silently no-ops
 * on a missing or unreadable file rather than throwing, same as a failed SFX
 * fetch, so one missing asset never breaks playback of everything else.
 */
export async function playAudioFile(url: string, volume = 0.6, externalCtx?: AudioContext, destination?: AudioNode) {
  try {
    const ctx = externalCtx ?? getAudioContext();
    const buf = await loadAudioFileBuffer(url, ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gainNode = ctx.createGain();
    gainNode.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gainNode).connect(destination ?? ctx.destination);
    src.start();
  } catch (err) {
    console.warn(`Failed to play audio file ${url}:`, err);
  }
}

/** Preloads all SFX audio files into Web Audio bufferCache to guarantee instant zero-latency playback on zone transitions. */
export async function preloadAllSfxFiles() {
  try {
    const ctx = getAudioContext();
    const allSfx: AudioSfxType[] = [
      "whoosh",
      "glitch",
      "flash",
      "zoom",
      "whip",
      "spin",
      "iris",
      "pop",
      "riser",
      "impact",
      "shutter",
      "breeze",
    ];
    await Promise.all(allSfx.map((sfx) => loadSfxBuffer(sfx, ctx).catch(() => {})));
  } catch (err) {
    console.warn("Failed preloading SFX files:", err);
  }
}

/** Triggers a browser file download for a single synthesized audio SFX. */
export async function downloadSfxFile(sfx: AudioSfxType) {
  const buf = await synthesizeSfxBuffer(sfx);
  const blob = audioBufferToWav(buf);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sfx_${sfx}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Downloads all 12 audio sound effect files sequentially for local usage. */
export async function downloadAllSfxFiles() {
  const allSfx: AudioSfxType[] = [
    "whoosh",
    "glitch",
    "flash",
    "zoom",
    "whip",
    "spin",
    "iris",
    "pop",
    "riser",
    "impact",
    "shutter",
    "breeze",
  ];
  for (const sfx of allSfx) {
    await downloadSfxFile(sfx);
    await new Promise((res) => setTimeout(res, 200));
  }
}
