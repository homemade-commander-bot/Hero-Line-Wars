// ---------------------------------------------------------------------------
// Synthesized medieval-fantasy SFX. No audio files — everything is WebAudio
// oscillators and filtered noise, so the repo stays asset-free.
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = localStorage.getItem('hlw-muted') === '1';
let lastPlay: Record<string, number> = {};

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem('hlw-muted', m ? '1' : '0');
  if (master) master.gain.value = m ? 0 : 0.5;
}

/** Must be called from a user gesture once (browser autoplay policy). */
export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch { /* audio unavailable; play silent */ }
}

function now() { return ctx!.currentTime; }

function tone(freq: number, dur: number, type: OscillatorType, vol: number, glideTo?: number, delay = 0) {
  if (!ctx || !master) return;
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, filterFreq: number, vol: number, type: BiquadFilterType = 'lowpass', delay = 0) {
  if (!ctx || !master) return;
  const t0 = now() + delay;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

/** Rate-limit identical sounds (mass deaths etc). */
function gate(name: string, minGap: number): boolean {
  const t = performance.now();
  if (lastPlay[name] && t - lastPlay[name] < minGap * 1000) return false;
  lastPlay[name] = t;
  return true;
}

export const sfx = {
  click() { if (!gate('click', 0.03)) return; tone(950, 0.06, 'square', 0.12, 700); },
  coin() { if (!gate('coin', 0.05)) return; tone(988, 0.07, 'sine', 0.16); tone(1319, 0.12, 'sine', 0.14, undefined, 0.05); },
  income() { tone(784, 0.1, 'sine', 0.2); tone(988, 0.1, 'sine', 0.2, undefined, 0.08); tone(1175, 0.16, 'sine', 0.2, undefined, 0.16); },
  swing() { if (!gate('swing', 0.06)) return; noise(0.09, 2400, 0.14, 'highpass'); },
  bow() { if (!gate('bow', 0.06)) return; tone(1500, 0.05, 'sine', 0.1, 600); noise(0.05, 3000, 0.07, 'highpass'); },
  hit() { if (!gate('hit', 0.05)) return; noise(0.07, 500, 0.18); tone(150, 0.07, 'triangle', 0.14, 90); },
  death() { if (!gate('death', 0.08)) return; noise(0.18, 800, 0.14); tone(220, 0.18, 'sawtooth', 0.08, 70); },
  bigDeath() { noise(0.4, 400, 0.3); tone(110, 0.5, 'sawtooth', 0.2, 40); },
  cast() { if (!gate('cast', 0.08)) return; tone(500, 0.16, 'sine', 0.16, 1200); noise(0.14, 1800, 0.1, 'bandpass'); },
  ult() {
    tone(110, 0.8, 'sawtooth', 0.22, 440);
    tone(220, 0.8, 'square', 0.1, 880, 0.05);
    noise(0.7, 900, 0.16, 'bandpass', 0.1);
    tone(880, 0.5, 'sine', 0.18, 1760, 0.45);
  },
  explode() { if (!gate('explode', 0.1)) return; noise(0.35, 300, 0.3); tone(90, 0.3, 'sine', 0.26, 40); },
  horn() { if (!gate('horn', 0.25)) return; tone(196, 0.5, 'sawtooth', 0.13); tone(247, 0.5, 'sawtooth', 0.1); tone(294, 0.5, 'sawtooth', 0.08); },
  levelup() { tone(523, 0.1, 'square', 0.12); tone(659, 0.1, 'square', 0.12, undefined, 0.09); tone(784, 0.22, 'square', 0.14, undefined, 0.18); },
  forge() { tone(1568, 0.3, 'sine', 0.22, 1200); noise(0.12, 4000, 0.14, 'highpass'); tone(784, 0.2, 'triangle', 0.12, undefined, 0.1); },
  castleHit() { if (!gate('castleHit', 0.18)) return; tone(70, 0.25, 'sine', 0.24, 45); noise(0.16, 250, 0.16); },
  volley() { for (let i = 0; i < 4; i++) noise(0.07, 2600, 0.06, 'highpass', i * 0.05); },
  repair() { tone(440, 0.1, 'triangle', 0.16); tone(587, 0.16, 'triangle', 0.16, undefined, 0.1); },
  upgrade() { tone(262, 0.16, 'square', 0.14); tone(330, 0.16, 'square', 0.14, undefined, 0.13); tone(392, 0.16, 'square', 0.14, undefined, 0.26); tone(523, 0.3, 'square', 0.16, undefined, 0.39); },
  heroDeath() { tone(440, 0.7, 'sawtooth', 0.2, 110); noise(0.5, 600, 0.2); },
  heroSpawn() { tone(523, 0.3, 'sine', 0.16, 1047); },
  twilight() { tone(98, 1.4, 'sawtooth', 0.22, 65); tone(147, 1.4, 'sawtooth', 0.12, 98, 0.1); noise(1.0, 300, 0.1, 'lowpass', 0.2); },
  underdog() { tone(330, 0.3, 'triangle', 0.18, 660); tone(440, 0.4, 'triangle', 0.16, 880, 0.2); },
  deny() { if (!gate('deny', 0.15)) return; tone(180, 0.12, 'square', 0.1, 140); },
  victory() {
    const seq = [523, 659, 784, 1047, 784, 1047];
    seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.7 : 0.18, 'square', 0.16, undefined, i * 0.16));
  },
  defeat() {
    const seq = [392, 370, 330, 262];
    seq.forEach((f, i) => tone(f, i === seq.length - 1 ? 0.9 : 0.3, 'sawtooth', 0.16, undefined, i * 0.28));
  },
};

export type SfxName = keyof typeof sfx;
