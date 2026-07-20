// WebAudio engine (M8a). One context, two buses:
//
//   voices → [underwater bus: low-pass + convolver]  ┐
//   voices → [surface bus: light room verb]          ├→ master gain → out
//
// The head-above transition crossfades the buses — that lift IS the
// surface-relief feeling (DESIGN §14). Positional voices get per-voice
// distance gain + stereo pan + an occlusion low-pass driven by an SDF ray
// (sound through rock is duller and quieter; §13 honest-sound rule).
//
// The context starts suspended (browser autoplay policy) and resumes on the
// same first click that enters fullscreen.

import { TUNING } from '../tuning';
import { SETTINGS } from '../ui/settings';
import { sdf } from '../cave/sdf';

export interface PositionalHandle {
  /** Per-voice input node — connect your synth output here. */
  input: GainNode;
  /** Re-aim at a (possibly moving) source. Cheap; call every frame or so. */
  setPosition(x: number, y: number, z: number): void;
  /** Disconnect the chain (call when the voice ends). */
  dispose(): void;
  /** Last computed values (instrumentation / tests). */
  readonly state: { gain: number; pan: number; occluded: number };
}

export class AudioEngine {
  /** Live games get an AudioContext; verification renders the same graph
   *  offline (OfflineAudioContext needs no user gesture). */
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  /** Everything below the waterline routes here: low-pass + convolver. */
  readonly underwater: GainNode;
  /** Head-above-water bus: bright, light room. */
  readonly surface: GainNode;
  /** MUSIC bus (user 2026-07-20: "music in open air should sound normal").
   *  Music used to ride the underwater bus, which ducks to 25% the moment
   *  the head breaks water — songs went near-silent exactly where they
   *  should shine. This bus never ducks: open air = full and bright,
   *  submerged = muffled (low-pass) but at full level. */
  readonly music: GainNode;
  private musicFilter: BiquadFilterNode;
  /** Post-filter analyser for verification (RMS of what's actually audible). */
  readonly analyser: AnalyserNode;
  private uwFilter: BiquadFilterNode;
  private uwGain: GainNode;
  private sfGain: GainNode;
  /** Extra muffle during a silt-out ("sound goes cottony", §7.2). */
  private muffle: BiquadFilterNode;
  private headAbove = false;
  private listener = { pos: [0, 0, 0] as [number, number, number], right: [1, 0, 0] as [number, number, number] };
  private positionals = new Set<PositionalHandle>();

  constructor(ctx?: BaseAudioContext) {
    this.ctx = ctx ?? new AudioContext();
    const A = TUNING.audio;
    this.master = this.ctx.createGain();
    this.master.gain.value = SETTINGS.volumeMaster;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // ── underwater bus: heavy low-pass, wet convolver, silt muffle ──
    this.underwater = this.ctx.createGain();
    this.uwFilter = this.ctx.createBiquadFilter();
    this.uwFilter.type = 'lowpass';
    this.uwFilter.frequency.value = A.underwaterLowpassHz;
    this.uwFilter.Q.value = 0.5;
    this.muffle = this.ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000; // open until a silt-out closes it
    const uwVerb = this.ctx.createConvolver();
    uwVerb.buffer = impulse(this.ctx, 1.6, 3.5); // long dull tail
    const uwWet = this.ctx.createGain();
    uwWet.gain.value = 0.5;
    this.uwGain = this.ctx.createGain();
    this.uwGain.gain.value = 1;
    this.underwater.connect(this.uwFilter);
    this.uwFilter.connect(this.muffle);
    this.muffle.connect(this.uwGain);
    this.muffle.connect(uwVerb);
    uwVerb.connect(uwWet);
    uwWet.connect(this.uwGain);
    this.uwGain.connect(this.master);

    // ── surface bus: light short room ──
    this.surface = this.ctx.createGain();
    const sfVerb = this.ctx.createConvolver();
    sfVerb.buffer = impulse(this.ctx, 0.4, 6);
    const sfWet = this.ctx.createGain();
    sfWet.gain.value = 0.15;
    this.sfGain = this.ctx.createGain();
    this.sfGain.gain.value = 0; // start underwater-weighted; spawn corrects
    this.surface.connect(this.sfGain);
    this.surface.connect(sfVerb);
    sfVerb.connect(sfWet);
    sfWet.connect(this.sfGain);
    this.sfGain.connect(this.master);

    // ── music bus: constant level, water only changes the TONE ──
    this.music = this.ctx.createGain();
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = A.musicLowpassHz; // spawn is underwater-weighted
    this.musicFilter.Q.value = 0.4;
    this.music.connect(this.musicFilter);
    this.musicFilter.connect(this.master);
  }

  /** Call from a real user gesture (the play click). */
  resume(): void {
    if (this.ctx.state !== 'running' && this.ctx instanceof AudioContext) void this.ctx.resume();
  }

  get running(): boolean {
    // offline contexts count as running: the graph builds and renders
    return this.ctx.state === 'running' || !(this.ctx instanceof AudioContext);
  }

  setMasterVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** The bus every non-positional game sound should join. */
  get bus(): GainNode {
    return this.headAbove ? this.surface : this.underwater;
  }

  /** Head-above transition: crossfade the buses over ~120 ms — quick enough
   *  to read as "breaking the surface", slow enough not to click. */
  setHeadAbove(above: boolean): void {
    if (above === this.headAbove) return;
    this.headAbove = above;
    const t = this.ctx.currentTime;
    this.uwGain.gain.setTargetAtTime(above ? 0.25 : 1, t, 0.06);
    this.sfGain.gain.setTargetAtTime(above ? 1 : 0.02, t, 0.06);
    // music never ducks — the surface just takes the pillow off the speaker
    this.musicFilter.frequency.setTargetAtTime(above ? 20000 : TUNING.audio.musicLowpassHz, t, 0.1);
  }

  /** Silt-out muffle 0..1 → the world goes cottony. */
  setMuffle(amount: number, timeConstant = 0.3): void {
    const A = TUNING.audio;
    const hz = 20000 - (20000 - A.siltMuffleHz) * Math.min(1, Math.max(0, amount));
    this.muffle.frequency.setTargetAtTime(hz, this.ctx.currentTime, timeConstant);
  }

  setListener(px: number, py: number, pz: number, rightX: number, rightY: number, rightZ: number): void {
    this.listener.pos = [px, py, pz];
    this.listener.right = [rightX, rightY, rightZ];
    for (const h of this.positionals) h.setPosition(NaN, 0, 0); // re-aim from cached source pos
  }

  /** A positional voice: distance gain, stereo pan, SDF-ray occlusion. */
  positional(refDistM = 6): PositionalHandle {
    const input = this.ctx.createGain();
    const occl = this.ctx.createBiquadFilter();
    occl.type = 'lowpass';
    occl.frequency.value = 20000;
    const dist = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    input.connect(occl);
    occl.connect(dist);
    dist.connect(pan);
    pan.connect(this.underwater); // world sounds live underwater by nature
    const state = { gain: 1, pan: 0, occluded: 0 };
    const src: [number, number, number] = [0, 0, 0];
    const self = this;
    let occlT = -1; // occlusion is ray-marched at most 4×/s
    const handle: PositionalHandle = {
      input,
      state,
      setPosition(x: number, y: number, z: number): void {
        if (!Number.isNaN(x)) {
          src[0] = x;
          src[1] = y;
          src[2] = z;
        }
        const L = self.listener;
        const dx = src[0] - L.pos[0];
        const dy = src[1] - L.pos[1];
        const dz = src[2] - L.pos[2];
        const d = Math.hypot(dx, dy, dz);
        state.gain = 1 / (1 + (d * d) / (refDistM * refDistM));
        state.pan = d > 0.3 ? Math.max(-1, Math.min(1, (dx * L.right[0] + dy * L.right[1] + dz * L.right[2]) / d)) : 0;
        const now = self.ctx.currentTime;
        if (now - occlT > 0.25) {
          occlT = now;
          state.occluded = rockBetween(L.pos, src) ? 1 : 0;
        }
        const t = self.ctx.currentTime;
        dist.gain.setTargetAtTime(state.gain * (state.occluded ? TUNING.audio.occlusionGain : 1), t, 0.08);
        pan.pan.setTargetAtTime(state.pan, t, 0.08);
        occl.frequency.setTargetAtTime(state.occluded ? TUNING.audio.occlusionLowpassHz : 20000, t, 0.12);
      },
      dispose(): void {
        self.positionals.delete(handle);
        try {
          pan.disconnect();
          input.disconnect();
        } catch {
          // already gone
        }
      },
    };
    this.positionals.add(handle);
    return handle;
  }

  /** RMS of the mastered output over the last analyser window (verification:
   *  proves an event actually made sound). */
  rms(): number {
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }
}

/** Straight-line SDF march listener→source: any solid rock on the way? */
function rockBetween(a: [number, number, number], b: [number, number, number]): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.5) return false;
  const n = Math.min(24, Math.ceil(len / 0.8));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (sdf(a[0] + dx * t, a[1] + dy * t, a[2] + dz * t) > 0.15) return true;
  }
  return false;
}

/** Procedural exponential-decay noise impulse (the convolver "room"). */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-decay * i) / len);
  }
  return buf;
}
