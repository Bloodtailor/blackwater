// Synthesized SFX library (M8a). Every sound in the game, built from
// oscillators + shaped noise — these double as M8b's per-sound fallbacks
// when a generated asset disappoints (PLAN risk note).
//
// All one-shots take a destination node (a bus or a positional input) and
// self-clean when the envelope dies. Loops return a stop() handle.

import { TUNING } from '../tuning';
import { SAMPLES } from './samples';

export type StopFn = () => void;

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface NoiseOpts {
  filter?: BiquadFilterType;
  hz?: number;
  q?: number;
  attack?: number;
  hold?: number;
  release?: number;
  gain?: number;
  rate?: number;
}

/** Filtered-noise one-shot with an A/H/R envelope. */
function noiseBurst(ctx: BaseAudioContext, out: AudioNode, o: NoiseOpts): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  src.playbackRate.value = o.rate ?? 1;
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.value = o.hz ?? 800;
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  const a = o.attack ?? 0.005;
  const h = o.hold ?? 0.02;
  const r = o.release ?? 0.15;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.5, t + a);
  g.gain.setValueAtTime(o.gain ?? 0.5, t + a + h);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + a + h + r + 0.05);
  src.onended = () => g.disconnect();
}

interface ToneOpts {
  type?: OscillatorType;
  hz: number;
  hzEnd?: number;
  attack?: number;
  hold?: number;
  release?: number;
  gain?: number;
  detune?: number;
}

function tone(ctx: BaseAudioContext, out: AudioNode, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.value = o.hz;
  if (o.detune) osc.detune.value = o.detune;
  const t = ctx.currentTime;
  const a = o.attack ?? 0.005;
  const h = o.hold ?? 0.05;
  const r = o.release ?? 0.2;
  if (o.hzEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.hzEnd), t + a + h + r);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + a);
  g.gain.setValueAtTime(o.gain ?? 0.3, t + a + h);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + a + h + r + 0.05);
  osc.onended = () => g.disconnect();
}

// ── weapons (one voice per gun family; papped adds a bright zing) ──
export function gunShot(ctx: BaseAudioContext, out: AudioNode, gunId: string, papped: boolean): void {
  const v = TUNING.audio.sfxGain;
  const sampleId = gunId === 'twinfish' ? 'gun-speargun' : `gun-${gunId}`;
  if (SAMPLES.play(ctx, out, sampleId, { gain: 0.8 * v, rateJitter: 0.05 })) {
    if (papped) tone(ctx, out, { hz: 1568, hzEnd: 2093, release: 0.1, gain: 0.08 * v });
    return;
  }
  switch (gunId) {
    case 'wristDart':
      noiseBurst(ctx, out, { hz: 2400, q: 2, release: 0.06, gain: 0.25 * v });
      tone(ctx, out, { hz: 900, hzEnd: 300, release: 0.05, gain: 0.12 * v });
      break;
    case 'pneuDriver':
      noiseBurst(ctx, out, { hz: 1800, q: 1.5, release: 0.05, gain: 0.22 * v });
      tone(ctx, out, { type: 'square', hz: 420, hzEnd: 200, release: 0.04, gain: 0.08 * v });
      break;
    case 'speargun':
    case 'twinfish':
      noiseBurst(ctx, out, { hz: 900, q: 1, release: 0.12, gain: 0.4 * v });
      tone(ctx, out, { hz: 240, hzEnd: 90, release: 0.12, gain: 0.25 * v });
      break;
    case 'flechette':
      noiseBurst(ctx, out, { filter: 'lowpass', hz: 1400, release: 0.18, gain: 0.55 * v });
      tone(ctx, out, { hz: 140, hzEnd: 60, release: 0.16, gain: 0.3 * v });
      break;
    case 'harpoon':
    case 'sonicLance':
      noiseBurst(ctx, out, { filter: 'lowpass', hz: 900, release: 0.3, gain: 0.6 * v });
      tone(ctx, out, { hz: 110, hzEnd: 45, release: 0.3, gain: 0.4 * v });
      break;
    case 'arcProjector':
      noiseBurst(ctx, out, { hz: 3200, q: 4, release: 0.22, gain: 0.35 * v });
      tone(ctx, out, { type: 'sawtooth', hz: 1200, hzEnd: 500, release: 0.2, gain: 0.12 * v });
      break;
    case 'vortexMaw':
      tone(ctx, out, { hz: 300, hzEnd: 950, attack: 0.05, release: 0.35, gain: 0.3 * v });
      noiseBurst(ctx, out, { hz: 600, q: 2, attack: 0.05, release: 0.3, gain: 0.25 * v });
      break;
    case 'bangStick':
      noiseBurst(ctx, out, { filter: 'lowpass', hz: 700, release: 0.4, gain: 0.8 * v });
      tone(ctx, out, { hz: 80, hzEnd: 35, release: 0.4, gain: 0.5 * v });
      break;
    default:
      noiseBurst(ctx, out, { hz: 1100, release: 0.1, gain: 0.35 * v });
      tone(ctx, out, { hz: 200, hzEnd: 80, release: 0.1, gain: 0.2 * v });
  }
  if (papped) tone(ctx, out, { hz: 1568, hzEnd: 2093, release: 0.1, gain: 0.08 * v });
}

export function knifeSwing(ctx: BaseAudioContext, out: AudioNode, hit: boolean): void {
  const v = TUNING.audio.sfxGain;
  if (SAMPLES.play(ctx, out, 'knife-swing', { gain: 0.6 * v, rateJitter: 0.08 })) {
    if (hit && !SAMPLES.play(ctx, out, 'knife-hit', { gain: 0.8 * v })) noiseBurst(ctx, out, { filter: 'lowpass', hz: 500, release: 0.12, gain: 0.4 * v });
    return;
  }
  noiseBurst(ctx, out, { hz: 1600, q: 0.8, attack: 0.02, release: 0.1, gain: 0.2 * v, rate: 1.4 });
  if (hit) noiseBurst(ctx, out, { filter: 'lowpass', hz: 500, release: 0.12, gain: 0.4 * v });
}

export function reloadClack(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.sfxGain;
  if (SAMPLES.play(ctx, out, 'reload', { gain: 0.5 * v })) return;
  noiseBurst(ctx, out, { hz: 2800, q: 6, release: 0.04, gain: 0.18 * v });
  setTimeout(() => noiseBurst(ctx, out, { hz: 2200, q: 6, release: 0.05, gain: 0.22 * v }), 140);
}

// ── the body ──
export function heartThump(ctx: BaseAudioContext, out: AudioNode, intensity: number): void {
  if (SAMPLES.play(ctx, out, 'heartbeat', { gain: intensity })) return;
  tone(ctx, out, { hz: 55, hzEnd: 38, release: 0.12, gain: 0.5 * intensity });
  setTimeout(() => tone(ctx, out, { hz: 48, hzEnd: 34, release: 0.1, gain: 0.32 * intensity }), 180);
}

/** One breath cycle: regulator draw (inhale) + bubble exhale. Synced by the
 *  director to the same clock as the visible bubble stream. */
export function breathCycle(ctx: BaseAudioContext, out: AudioNode, panic: number): void {
  const v = TUNING.audio.breathGain * (0.6 + 0.4 * panic);
  if (SAMPLES.play(ctx, out, panic > 0.45 ? 'breath-panic' : 'breath-calm', { gain: 0.55 * v, rateJitter: 0.04 })) return;
  noiseBurst(ctx, out, { filter: 'bandpass', hz: 1100 + panic * 500, q: 0.7, attack: 0.15, hold: 0.35 - panic * 0.15, release: 0.25, gain: 0.16 * v });
  const exhaleDelay = (0.9 - panic * 0.35) * 1000;
  setTimeout(() => {
    noiseBurst(ctx, out, { filter: 'highpass', hz: 2000, attack: 0.05, hold: 0.4, release: 0.5, gain: 0.1 * v });
    // a few bubble blips riding the hiss
    for (let i = 0; i < 4; i++) {
      setTimeout(() => tone(ctx, out, { hz: 700 + Math.random() * 900, hzEnd: 1400 + Math.random() * 800, release: 0.06, gain: 0.05 * v }), i * 110 + Math.random() * 60);
    }
  }, exhaleDelay);
}

export function drownPulse(ctx: BaseAudioContext, out: AudioNode): void {
  if (SAMPLES.play(ctx, out, 'drown-pulse', { gain: 0.7 })) return;
  tone(ctx, out, { hz: 220, hzEnd: 90, attack: 0.02, release: 0.5, gain: 0.25 });
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 400, attack: 0.05, release: 0.5, gain: 0.3 });
}

// ── the world ──
export function grabImpact(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.sfxGain;
  if (SAMPLES.play(ctx, out, 'grab', { gain: 0.9 * v, rateJitter: 0.06 })) return;
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 350, release: 0.25, gain: 0.7 * v });
  tone(ctx, out, { hz: 90, hzEnd: 50, release: 0.25, gain: 0.4 * v });
}

/** `voice` (M14.5, DESIGN §8.6): a man's fixed moan identity from the crew
 *  book — same sample, same pitch, every watch. Omitted = anonymous. */
export function moan(ctx: BaseAudioContext, out: AudioNode, voice?: { sample: number; rate: number }): void {
  const sample = voice?.sample ?? 1 + Math.floor(Math.random() * 3);
  if (SAMPLES.play(ctx, out, `moan-${sample}`, { gain: TUNING.audio.moanGain * 2.2, rateJitter: 0.05, rate: voice?.rate })) return;
  // wet, muffled: two detuned saws through a slow-swept vowel-ish bandpass
  const t = ctx.currentTime;
  const dur = 1.4 + Math.random() * 1.2;
  const base = (82 + Math.random() * 50) * (voice?.rate ?? 1);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(300 + Math.random() * 200, t);
  f.frequency.linearRampToValueAtTime(500 + Math.random() * 400, t + dur * 0.6);
  f.frequency.linearRampToValueAtTime(250, t + dur);
  f.Q.value = 1.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(TUNING.audio.moanGain, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  f.connect(g);
  g.connect(out);
  for (const det of [0, 9 + Math.random() * 8]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * (0.82 + Math.random() * 0.1), t + dur);
    osc.detune.value = det;
    osc.connect(f);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc.onended = () => osc.disconnect();
  }
}

/** The Angler's lure hum: a quiet, faintly WRONG dyad (a flat tritone-ish
 *  interval that never resolves — LORE: subtly wrong color temperature,
 *  but for the ear). Loop until stopped. */
export function anglerHum(ctx: BaseAudioContext, out: AudioNode): StopFn {
  const sampled = SAMPLES.loop(ctx, out, 'angler-hum', { gain: TUNING.audio.anglerGain * 2, fadeSec: 2 });
  if (sampled) return sampled;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(TUNING.audio.anglerGain, ctx.currentTime, 1.2);
  g.connect(out);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.17;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 4;
  lfo.connect(lfoG);
  const oscs = [196, 271].map((hz) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz;
    lfoG.connect(o.detune);
    o.connect(g);
    o.start();
    return o;
  });
  lfo.start();
  return () => {
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => {
      for (const o of oscs) o.stop();
      lfo.stop();
      g.disconnect();
    }, 2000);
  };
}

/** The Lamp Man's jumpscare (M15, DESIGN §8.5): a violent sting — noise
 *  slam, a shriek that bends wrong, and a sub drop into the reserve alarm. */
export function lampScare(ctx: BaseAudioContext, out: AudioNode): void {
  if (SAMPLES.play(ctx, out, 'lamp-scare', { gain: 1.2 })) return;
  const t = ctx.currentTime;
  noiseBurst(ctx, out, { filter: 'highpass', hz: 900, attack: 0.005, release: 0.5, gain: 0.9 });
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 300, attack: 0.005, release: 0.9, gain: 0.9 });
  // the shriek: fast upward bend that lands flat (wrongness in the interval)
  tone(ctx, out, { hz: 620, hzEnd: 1370, attack: 0.005, release: 0.55, gain: 0.5 });
  tone(ctx, out, { hz: 660, hzEnd: 1310, attack: 0.005, release: 0.55, gain: 0.4 });
  // the floor falls out
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(120, t);
  sub.frequency.exponentialRampToValueAtTime(28, t + 1.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.8, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  sub.connect(g);
  g.connect(out);
  sub.start(t);
  sub.stop(t + 1.3);
  sub.onended = () => g.disconnect();
}

/** The vortex inhale (M15, DESIGN §8.2): the water pulls INWARD. One-shot
 *  whoosh at the grab; the drag itself is vortexDrag's loop. */
export function vortexGrab(ctx: BaseAudioContext, out: AudioNode): void {
  if (SAMPLES.play(ctx, out, 'vortex-grab', { gain: 1.1 })) return;
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 500, attack: 0.5, hold: 0.3, release: 0.4, gain: 0.9 });
  tone(ctx, out, { hz: 50, hzEnd: 130, attack: 0.5, release: 0.7, gain: 0.5 });
}

/** The carry: turbulent rumble + rising water-rush, until released. */
export function vortexDrag(ctx: BaseAudioContext, out: AudioNode): StopFn {
  const sampled = SAMPLES.loop(ctx, out, 'vortex-drag', { gain: 1.0, fadeSec: 0.3 });
  if (sampled) return sampled;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(0.7, ctx.currentTime, 0.25);
  g.connect(out);
  // turbulence: looped noise through a wobbling low bandpass
  const dur = 2;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 160;
  f.Q.value = 1.2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 2.3;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 70;
  lfo.connect(lfoG);
  lfoG.connect(f.frequency);
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.value = 38;
  const subG = ctx.createGain();
  subG.gain.value = 0.5;
  sub.connect(subG);
  subG.connect(g);
  src.connect(f);
  f.connect(g);
  src.start();
  lfo.start();
  sub.start();
  return () => {
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    setTimeout(() => {
      src.stop();
      lfo.stop();
      sub.stop();
      g.disconnect();
    }, 800);
  };
}

/** The Undertow surge (M15.5, DESIGN §11.1): an enormous distant machine
 *  spinning up — the amb-machinery pump is the same machine's voice, and for
 *  eight seconds the whole soundscape reads as one vast intake. */
export function undertowSurge(ctx: BaseAudioContext, out: AudioNode): void {
  if (SAMPLES.play(ctx, out, 'undertow-surge', { gain: 1.2 })) return;
  const t = ctx.currentTime;
  const U = TUNING.undertow;
  const dur = U.surgeSec + 1.5;
  // the intake: broadband water-rush swelling in and out
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 420, attack: U.rampSec, hold: dur - U.rampSec * 2, release: U.rampSec, gain: 0.55 });
  // the machine: a sub drone glissing up as it spins to speed
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(24, t);
  sub.frequency.exponentialRampToValueAtTime(52, t + dur * 0.6);
  sub.frequency.setValueAtTime(52, t + dur * 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + U.rampSec);
  g.gain.setValueAtTime(0.5, t + dur - U.rampSec);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  // the stroke: a slow amplitude pump quickening as it winds up
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(0.9, t);
  lfo.frequency.linearRampToValueAtTime(1.8, t + dur);
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.22;
  lfo.connect(lfoG);
  lfoG.connect(g.gain);
  sub.connect(g);
  g.connect(out);
  sub.start(t);
  lfo.start(t);
  sub.stop(t + dur + 0.1);
  lfo.stop(t + dur + 0.1);
  sub.onended = () => g.disconnect();
}

/** Guardian presence: sub-bass breathing loop + slow metallic groan. */
export function guardianPresence(ctx: BaseAudioContext, out: AudioNode): StopFn {
  const sampled = SAMPLES.loop(ctx, out, 'guardian-presence', { gain: TUNING.audio.guardianGain * 1.5, fadeSec: 2.5 });
  if (sampled) return sampled;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(TUNING.audio.guardianGain, ctx.currentTime, 1.5);
  g.connect(out);
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 31;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.11;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.5;
  lfo.connect(lfoG);
  const subG = ctx.createGain();
  subG.gain.value = 0.6;
  lfoG.connect(subG.gain);
  sub.connect(subG);
  subG.connect(g);
  sub.start();
  lfo.start();
  const iv = window.setInterval(() => {
    if (Math.random() < 0.4) noiseBurst(ctx, g, { filter: 'bandpass', hz: 180 + Math.random() * 120, q: 8, attack: 0.4, hold: 0.5, release: 1.2, gain: 0.5 });
  }, 3500);
  return () => {
    window.clearInterval(iv);
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
    setTimeout(() => {
      sub.stop();
      lfo.stop();
      g.disconnect();
    }, 2500);
  };
}

export function siltWhump(ctx: BaseAudioContext, out: AudioNode): void {
  if (SAMPLES.play(ctx, out, 'silt-whump', { gain: 1.1 })) return;
  // the whump + the tinnitus dip's ring (§14)
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 220, attack: 0.01, hold: 0.15, release: 0.9, gain: 0.9 });
  tone(ctx, out, { hz: 46, hzEnd: 28, release: 1.0, gain: 0.5 });
  setTimeout(() => tone(ctx, out, { hz: 3800, attack: 0.02, hold: 1.6, release: 1.4, gain: 0.028 }), 200);
}

// ── music-ish stingers & motifs (minor, dark, original) ──
const ST = { d3: 146.8, f3: 174.6, gs3: 207.7, a3: 220, c4: 261.6, d4: 293.7, e4: 329.6, f4: 349.2, a4: 440, d5: 587.3 };

/** Round-change stinger: somber low horn, minor second bloom. */
export function roundStinger(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.musicGain;
  if (SAMPLES.play(ctx, out, 'stinger-round', { gain: v })) return;
  for (const [hz, delay, gain] of [
    [ST.d3, 0, 0.3],
    [ST.a3, 0.05, 0.2],
    [ST.f3, 0.4, 0.24],
    [ST.gs3, 1.1, 0.14],
  ] as const) {
    setTimeout(() => tone(ctx, out, { type: 'sawtooth', hz, attack: 0.3, hold: 0.9, release: 1.6, gain: gain * v, detune: Math.random() * 10 - 5 }), delay * 1000);
  }
}

/** The shift bell (M12, DESIGN §14): one unhurried toll of the site's watch
 *  bell. M14 makes it THE shift-change sound; the Abyss hatch rings five. */
export function shiftBell(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.bellGain;
  if (SAMPLES.play(ctx, out, 'shift-bell', { gain: v })) return;
  // struck-bell synth: two inharmonic partials + a strike transient
  tone(ctx, out, { type: 'sine', hz: 220, attack: 0.004, hold: 0.4, release: 2.6, gain: 0.34 * v });
  tone(ctx, out, { type: 'sine', hz: 553, attack: 0.004, hold: 0.2, release: 1.8, gain: 0.16 * v, detune: 8 });
  noiseBurst(ctx, out, { filter: 'bandpass', hz: 2400, attack: 0.002, hold: 0.02, release: 0.12, gain: 0.12 * v });
}

/** Five bells, one after another — the Abyss hatch's toll (M13 consumes). */
export function bellSequence(ctx: BaseAudioContext, out: AudioNode, count = 5, spacingSec = 1.6): void {
  for (let i = 0; i < count; i++) setTimeout(() => shiftBell(ctx, out), i * spacingSec * 1000);
}

/** The Cave Stirs: a rising unresolved swell. */
export function stirsStinger(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.musicGain;
  if (SAMPLES.play(ctx, out, 'stinger-stirs', { gain: v })) return;
  tone(ctx, out, { type: 'sawtooth', hz: ST.d3, hzEnd: ST.f3, attack: 1.2, hold: 1.2, release: 1.2, gain: 0.22 * v });
  tone(ctx, out, { type: 'sine', hz: ST.d4, hzEnd: ST.e4, attack: 1.4, hold: 1.0, release: 1.2, gain: 0.12 * v });
}

/** Perk jingle: four dark music-box notes (short, dark-goofy, §14). */
export function perkJingle(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.musicGain;
  if (SAMPLES.play(ctx, out, 'perk-jingle', { gain: 1.8 * v })) return;
  const seq = [ST.d4, ST.f4, ST.a4, ST.d5];
  seq.forEach((hz, i) => setTimeout(() => tone(ctx, out, { type: 'triangle', hz, attack: 0.005, hold: 0.05, release: 0.6, gain: 0.2 * v }), i * 190));
  setTimeout(() => tone(ctx, out, { type: 'triangle', hz: ST.c4, attack: 0.005, hold: 0.08, release: 1.0, gain: 0.16 * v }), 4 * 190 + 120);
}

/** Requisition Roulette tease: a little cranked music-box turn. */
export function boxTease(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.musicGain;
  if (SAMPLES.play(ctx, out, 'box-tease', { gain: 2.0 * v })) return;
  const seq = [ST.a4, ST.f4, ST.e4, ST.f4, ST.a4, ST.d5];
  seq.forEach((hz, i) => setTimeout(() => tone(ctx, out, { type: 'triangle', hz, attack: 0.004, hold: 0.03, release: 0.4, gain: 0.14 * v }), i * 150));
}

/** PaP motif: a slow choir-ish groan bloom (detuned voices through lowpass). */
export function papMotif(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.musicGain;
  if (SAMPLES.play(ctx, out, 'pap-motif', { gain: 1.8 * v })) return;
  for (const [hz, det] of [
    [ST.d3, 0],
    [ST.d3, 12],
    [ST.a3, -8],
    [ST.f3, 6],
    [ST.d4, -4],
  ] as const) {
    tone(ctx, out, { type: 'sawtooth', hz, attack: 0.9, hold: 1.4, release: 1.5, gain: 0.1 * v, detune: det });
  }
}

export function dropChime(ctx: BaseAudioContext, out: AudioNode, good: boolean): void {
  const v = TUNING.audio.sfxGain;
  if (good && SAMPLES.play(ctx, out, 'drop-chime', { gain: 1.3 * v })) return;
  tone(ctx, out, { type: 'triangle', hz: good ? ST.a4 : ST.gs3, attack: 0.005, hold: 0.05, release: 0.5, gain: 0.25 * v });
  setTimeout(() => tone(ctx, out, { type: 'triangle', hz: good ? ST.d5 : ST.d3, attack: 0.005, hold: 0.06, release: 0.7, gain: 0.22 * v }), 130);
}

export function doorGrind(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.sfxGain;
  if (SAMPLES.play(ctx, out, 'door-grind', { gain: 0.9 * v })) return;
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 300, attack: 0.1, hold: 1.2, release: 0.8, gain: 0.6 * v });
  noiseBurst(ctx, out, { filter: 'bandpass', hz: 900, q: 3, attack: 0.2, hold: 1.0, release: 0.6, gain: 0.2 * v, rate: 0.7 });
  tone(ctx, out, { hz: 60, hzEnd: 40, attack: 0.1, hold: 1.2, release: 0.8, gain: 0.3 * v });
}

export function buyClick(ctx: BaseAudioContext, out: AudioNode, ok: boolean): void {
  if (SAMPLES.play(ctx, out, ok ? 'buy-accept' : 'buy-deny', { gain: 1.1 * TUNING.audio.sfxGain })) return;
  const v = TUNING.audio.sfxGain;
  if (ok) {
    tone(ctx, out, { type: 'square', hz: 660, release: 0.06, gain: 0.08 * v });
    setTimeout(() => tone(ctx, out, { type: 'square', hz: 880, release: 0.08, gain: 0.08 * v }), 70);
  } else {
    tone(ctx, out, { type: 'square', hz: 220, hzEnd: 180, release: 0.12, gain: 0.1 * v });
  }
}

/** Geiger crackle near the Pile (flavor ONLY — no mechanic, §14). */
export function geigerTick(ctx: BaseAudioContext, out: AudioNode): void {
  if (SAMPLES.play(ctx, out, 'geiger', { gain: 0.45, rateJitter: 0.1 })) return;
  noiseBurst(ctx, out, { filter: 'highpass', hz: 3000, attack: 0.001, hold: 0.004, release: 0.015, gain: 0.12 });
}

export function powerOnThunk(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.sfxGain;
  if (SAMPLES.play(ctx, out, 'power-on', { gain: 0.9 * v })) return;
  noiseBurst(ctx, out, { filter: 'lowpass', hz: 200, release: 0.4, gain: 0.7 * v });
  tone(ctx, out, { hz: 50, hzEnd: 60, attack: 0.2, hold: 1.5, release: 1.5, gain: 0.2 * v });
  setTimeout(() => tone(ctx, out, { type: 'sine', hz: 120, attack: 0.5, hold: 2.0, release: 2.0, gain: 0.06 * v }), 400);
}

export function deathSting(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.musicGain;
  if (SAMPLES.play(ctx, out, 'death-sting', { gain: v })) return;
  tone(ctx, out, { type: 'sawtooth', hz: ST.d3, hzEnd: ST.d3 * 0.5, attack: 0.05, hold: 1.0, release: 2.5, gain: 0.3 * v });
  tone(ctx, out, { type: 'sawtooth', hz: ST.gs3, hzEnd: ST.gs3 * 0.5, attack: 0.05, hold: 1.0, release: 2.5, gain: 0.2 * v });
}

/** Fallback VO marker: a soft radio squelch + breathy crackle so subtitle
 *  changes are audible before generated voice assets exist. */
export function radioSquelch(ctx: BaseAudioContext, out: AudioNode, vol = 1): void {
  if (SAMPLES.play(ctx, out, 'radio-squelch', { gain: 0.6 * vol })) return;
  noiseBurst(ctx, out, { filter: 'bandpass', hz: 1900, q: 5, attack: 0.005, hold: 0.03, release: 0.08, gain: 0.12 * vol });
  setTimeout(() => noiseBurst(ctx, out, { filter: 'bandpass', hz: 1400, q: 2, attack: 0.02, hold: 0.25, release: 0.3, gain: 0.05 * vol }), 90);
}

/** Tape handling: the pickup clunk + reel squeak. */
export function tapeClick(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.sfxGain;
  if (SAMPLES.play(ctx, out, 'tape-click', { gain: 0.6 * v })) return;
  noiseBurst(ctx, out, { hz: 2400, q: 7, release: 0.04, gain: 0.2 * v });
  setTimeout(() => tone(ctx, out, { type: 'triangle', hz: 1100, hzEnd: 1500, release: 0.12, gain: 0.06 * v }), 110);
}

/** The toy divers' music-box shimmer (LORE §4: findability ≤8 m). Sparse,
 *  detuned, slightly wrong — loops until wound. */
export function toyShimmer(ctx: BaseAudioContext, out: AudioNode): StopFn {
  const sampled = SAMPLES.loop(ctx, out, 'toy-shimmer', { gain: 0.5, fadeSec: 1.5 });
  if (sampled) return sampled;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  g.connect(out);
  const notes = [1174.7, 987.8, 1318.5, 880, 1567.98];
  let i = 0;
  const step = (): void => {
    // one faint note, then a gap — a mechanism turning over in its sleep
    if (Math.random() < 0.75) {
      tone(ctx, g, { type: 'triangle', hz: notes[i % notes.length] * (1 + (Math.random() - 0.5) * 0.01), attack: 0.004, hold: 0.02, release: 0.9, gain: 0.09 });
      i += Math.random() < 0.8 ? 1 : 2;
    }
  };
  const iv = window.setInterval(step, 700);
  return () => {
    window.clearInterval(iv);
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    setTimeout(() => g.disconnect(), 1500);
  };
}

/** Winding a toy: ratchet clicks then a spring release. */
export function toyWind(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.sfxGain;
  if (SAMPLES.play(ctx, out, 'toy-wind', { gain: 0.7 * v })) return;
  for (let i = 0; i < 6; i++) {
    setTimeout(() => noiseBurst(ctx, out, { hz: 3000 - i * 120, q: 8, release: 0.03, gain: 0.1 * v }), i * 90);
  }
  setTimeout(() => tone(ctx, out, { type: 'triangle', hz: 1567.98, attack: 0.005, hold: 0.05, release: 0.8, gain: 0.12 * v }), 640);
}

export function winSting(ctx: BaseAudioContext, out: AudioNode): void {
  const v = TUNING.audio.musicGain;
  if (SAMPLES.play(ctx, out, 'win-sting', { gain: v })) return;
  const seq = [ST.d3, ST.a3, ST.d4, ST.f4, ST.a4];
  seq.forEach((hz, i) => setTimeout(() => tone(ctx, out, { type: 'triangle', hz, attack: 0.02, hold: 0.4, release: 2.0, gain: 0.2 * v }), i * 260));
}
