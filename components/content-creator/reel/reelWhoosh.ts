// A short, punchy "whoosh" transition sound, synthesized entirely in-browser
// (filtered noise burst with a rising-then-falling bandpass sweep) so every
// reel gets a transition SFX with zero licensing risk and zero network
// dependency. Rendered once per export and re-triggered at each transition.
export async function synthesizeWhooshBuffer(duration = 0.42, sampleRate = 44100): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const offline = new OfflineAudioContext(1, length, sampleRate);

  const noiseBuffer = offline.createBuffer(1, length, sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const noise = offline.createBufferSource();
  noise.buffer = noiseBuffer;

  const sweep = offline.createBiquadFilter();
  sweep.type = "bandpass";
  sweep.Q.value = 0.85;
  sweep.frequency.setValueAtTime(280, 0);
  sweep.frequency.exponentialRampToValueAtTime(4500, duration * 0.42);
  sweep.frequency.exponentialRampToValueAtTime(200, duration);

  const highShelf = offline.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 3000;
  highShelf.gain.value = 4;

  const envelope = offline.createGain();
  envelope.gain.setValueAtTime(0, 0);
  envelope.gain.linearRampToValueAtTime(1, duration * 0.14);
  envelope.gain.linearRampToValueAtTime(0, duration);

  noise.connect(sweep).connect(highShelf).connect(envelope).connect(offline.destination);
  noise.start(0);
  noise.stop(duration);

  return offline.startRendering();
}
