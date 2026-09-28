// Original, quiet sonic signature. Synthesized locally; no downloads or audio permissions.
export const FIRST_LIGHT_SOUND_KEY = "altara_first_light_sound_v1";

export function readFirstLightSoundPreference() {
  try { return localStorage.getItem(FIRST_LIGHT_SOUND_KEY) === "on"; } catch (_) { return false; }
}

export function saveFirstLightSoundPreference(enabled) {
  try { localStorage.setItem(FIRST_LIGHT_SOUND_KEY, enabled ? "on" : "off"); } catch (_) {}
}

export function playFirstLightSound() {
  let context;
  let master;
  let stopped = false;
  let cleanup;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(cleanup);
    if (!context) return;
    // A short release avoids clicks when skipping or muting.
    const now = context.currentTime;
    master?.gain.cancelScheduledValues(now);
    master?.gain.setTargetAtTime(0, now, 0.025);
    cleanup = setTimeout(() => { void context.close().catch(() => {}); }, 120);
  };
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return stop;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = 0.3;
    master.connect(context.destination);
    const begin = () => {
      if (stopped || context.state !== "running") return;
      const start = context.currentTime + 0.025;
      // A small stereo room gives the felt/glass tones depth without a long tail.
      let seed = 17431;
      const noise = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2147483648 - 1;
      };
      const room = context.createConvolver();
      const impulse = context.createBuffer(2, Math.floor(context.sampleRate * 0.85), context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        let softened = 0;
        for (let i = 0; i < data.length; i++) {
          softened = softened * 0.65 + noise() * 0.35;
          const t = i / context.sampleRate;
          data[i] = softened * Math.exp(-t * 8) * Math.min(t / 0.018, 1);
        }
      }
      room.buffer = impulse;
      const wet = context.createGain();
      wet.gain.value = 0.2;
      room.connect(wet);
      wet.connect(master);
      // Global release also fades the room before the real login is revealed.
      master.gain.setValueAtTime(0.3, start);
      master.gain.setValueAtTime(0.3, start + 1.85);
      master.gain.linearRampToValueAtTime(0, start + 2.58);

      const voice = (frequency, offset, level, attack, duration, pan, partials) => {
        const position = context.createStereoPanner();
        position.pan.value = pan;
        position.connect(master);
        position.connect(room);
        for (const [ratio, weight, decay] of partials) {
          const tone = context.createOscillator();
          const envelope = context.createGain();
          const at = start + offset;
          tone.type = "sine";
          tone.frequency.value = frequency * ratio;
          envelope.gain.setValueAtTime(0, at);
          envelope.gain.linearRampToValueAtTime(level * weight, at + attack);
          envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration * decay);
          tone.connect(envelope);
          envelope.connect(position);
          tone.start(at);
          tone.stop(at + duration * decay + 0.02);
        }
      };
      // Low, rounded bloom under the first light; no percussive bass hit.
      voice(146.832, 0, 0.22, 0.32, 2.45, 0, [[1, 1, 1], [2, 0.2, 0.8], [3, 0.045, 0.55]]);
      voice(220, 0.08, 0.09, 0.4, 2.2, -0.12, [[1, 1, 1], [2, 0.1, 0.7]]);
      // Three gently rising felt-glass notes, ending as the wordmark settles.
      const glass = [[1, 1, 1], [2, 0.24, 0.65], [3.005, 0.065, 0.4], [4.01, 0.025, 0.25]];
      voice(440, 0.16, 0.24, 0.025, 1.9, -0.23, glass);
      voice(554.365, 0.43, 0.19, 0.035, 1.7, 0.2, glass);
      voice(659.255, 0.78, 0.17, 0.045, 1.65, 0.06, glass);
      voice(880, 0.81, 0.035, 0.09, 1.25, -0.16, [[1, 1, 1], [2, 0.08, 0.5]]);

      // A very quiet, band-limited breath follows the light spreading outward.
      const air = context.createBufferSource();
      const airBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const airData = airBuffer.getChannelData(0);
      for (let i = 0; i < airData.length; i++) airData[i] = noise();
      air.buffer = airBuffer;
      const airFilter = context.createBiquadFilter();
      airFilter.type = "bandpass";
      airFilter.frequency.setValueAtTime(700, start);
      airFilter.frequency.exponentialRampToValueAtTime(2200, start + 0.85);
      airFilter.Q.value = 0.6;
      const breath = context.createGain();
      breath.gain.setValueAtTime(0, start);
      breath.gain.linearRampToValueAtTime(0.016, start + 0.38);
      breath.gain.linearRampToValueAtTime(0, start + 0.95);
      air.connect(airFilter);
      airFilter.connect(breath);
      breath.connect(master);
      air.start(start);
    };
    // Never wait for audio to show login, or play late after an autoplay rejection.
    if (context.state === "running") begin();
    else void context.resume().then(begin).catch(stop);
    cleanup = setTimeout(stop, 2700);
  } catch (_) { stop(); }
  return stop;
}
