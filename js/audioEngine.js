const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
export const audio = new AudioContextCtor();
export const masterGain = audio.createGain();
masterGain.gain.value = 1;
masterGain.connect(audio.destination);

const activeVoices = new Map();
let synthType = "triangle";

// C3(MIDI48) - B4(MIDI71) の24サンプルを MIDIノート番号 → AudioBuffer でマップ
const voiceBuffers = new Map();

const VOICE_PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export async function loadVoiceSamples() {
  const loads = [];
  for (let oct = 3; oct <= 4; oct++) {
    for (let pc = 0; pc < 12; pc++) {
      const midi = (oct + 1) * 12 + pc; // C3=48, C4=60
      const name = `${VOICE_PC_NAMES[pc]}${oct}`;
      loads.push((async () => {
        try {
          const res = await fetch(`audio/voice/${encodeURIComponent(name)}.wav`);
          if (!res.ok) return;
          const arrayBuffer = await res.arrayBuffer();
          voiceBuffers.set(midi, await audio.decodeAudioData(arrayBuffer));
        } catch {
          // ignore missing files
        }
      })());
    }
  }
  await Promise.all(loads);
}

// 同じピッチクラスで最近傍のサンプルを返す
function findVoiceBuffer(midi) {
  if (voiceBuffers.has(midi)) return { buf: voiceBuffers.get(midi), refMidi: midi };
  const pc = ((midi % 12) + 12) % 12;
  let bestMidi = null;
  let bestDist = Infinity;
  for (const m of voiceBuffers.keys()) {
    if (((m % 12) + 12) % 12 === pc) {
      const dist = Math.abs(m - midi);
      if (dist < bestDist) { bestDist = dist; bestMidi = m; }
    }
  }
  if (bestMidi !== null) return { buf: voiceBuffers.get(bestMidi), refMidi: bestMidi };
  return null;
}

function hardStop(voice) {
  if (voice.src) {
    try { voice.src.stop(); } catch { /* ignore */ }
    return;
  }
  const now = audio.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.05);
    voice.osc.stop(now + 0.15);
    if (voice.lfo) voice.lfo.stop(now + 0.15);
  } catch { /* ignore */ }
}

export async function ensureAudioStarted() {
  if (audio.state !== "running") {
    try {
      await audio.resume();
    } catch {
      // ignore
    }
  }
}

export function setSynthType(type) {
  synthType = type || "triangle";
}

export function setMasterVolume(value) {
  const v = Math.max(0, Math.min(1, Number(value)));
  masterGain.gain.value = v;
}

export function startNote(midi, velocity = 0.9) {
  // 同じキーの既存ボイスを即停止してから新規発音
  const existing = activeVoices.get(midi);
  if (existing) {
    activeVoices.delete(midi);
    hardStop(existing);
  }

  if (synthType === "voice") {
    const result = findVoiceBuffer(midi);
    if (!result) return;

    const src = audio.createBufferSource();
    src.buffer = result.buf;
    // C3-B4範囲内は rate=1.0、範囲外はオクターブシフト
    src.playbackRate.value = midiToFreq(midi) / midiToFreq(result.refMidi);

    const gain = audio.createGain();
    gain.gain.value = Math.max(0.04, Math.min(1, velocity)) * 0.4;
    src.connect(gain).connect(masterGain);
    src.start();

    src.onended = () => {
      if (activeVoices.get(midi)?.src === src) activeVoices.delete(midi);
    };
    activeVoices.set(midi, { src, gain });
    return;
  }

  const now = audio.currentTime;
  const freq = midiToFreq(midi);
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  const isTheremin = synthType === "theremin";
  osc.type = isTheremin ? "sine" : synthType;
  osc.frequency.value = freq;

  let lfo = null;
  if (isTheremin) {
    lfo = audio.createOscillator();
    const lfoGain = audio.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 6;
    lfoGain.gain.value = freq * 0.015;
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start(now);
  }

  const amp = Math.max(0.04, Math.min(1, velocity));
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(amp * 0.4, now + 0.01);
  gain.gain.setTargetAtTime(amp * 0.18, now + 0.05, 0.18);

  osc.connect(gain).connect(masterGain);
  osc.start(now);

  activeVoices.set(midi, { osc, gain, lfo });
}

export function stopNote(midi) {
  const voice = activeVoices.get(midi);
  if (!voice) return;
  activeVoices.delete(midi);

  if (voice.src) {
    try { voice.src.stop(); } catch { /* ignore */ }
    return;
  }

  const now = audio.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.05);
    voice.osc.stop(now + 0.15);
    if (voice.lfo) voice.lfo.stop(now + 0.15);
  } catch {
    // ignore
  }
}

export function allNotesOff() {
  for (const [, voice] of [...activeVoices.entries()]) {
    hardStop(voice);
  }
  activeVoices.clear();
}
