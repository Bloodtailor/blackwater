// Depth ambience + audio-emitter nodes (user 2026-07-20).
//
// DEPTH BEDS: three looping ambience layers crossfaded by depth, on the SAME
// band boundaries as the ambient current (tuning.player.currentDepth) — where
// the current gets stronger, the water sounds like it: pressure and menace
// rise together, literally and mentally. Beds ride the underwater bus, so
// they duck automatically when the head breaks water.
//
// EMITTER NODES: layout nodes with an `audio` field (usually kind 'audio',
// buried in solid rock) loop a positional sample — machinery, airflow, the
// site settling — leaking through the walls via the honest SDF occlusion
// filter. `radiusM` is the audible range; `falloff` shapes the curve
// (refDist = radiusM / falloff, default 3 — higher = tighter to the wall).

import { TUNING } from '../tuning';
import { audioNodes, type CaveNode } from '../cave/data';
import type { AudioEngine, PositionalHandle } from './engine';
import { SAMPLES } from './samples';
import type { StopFn } from './sfx';

const BED_NAMES = ['ambient-shallow', 'ambient-mid', 'ambient-deep'] as const;

/** Synth fallback bed: a slow-breathing filtered-noise drone; darker and
 *  heavier per tier (used per-bed when its generated sample is missing). */
function synthBed(ctx: BaseAudioContext, out: AudioNode, tier: number): StopFn {
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = [520, 300, 160][tier];
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = [0.16, 0.22, 0.3][tier];
  const lfo = ctx.createOscillator();
  lfo.frequency.value = [0.09, 0.06, 0.045][tier];
  const lfoG = ctx.createGain();
  lfoG.gain.value = f.frequency.value * 0.4;
  lfo.connect(lfoG);
  lfoG.connect(f.frequency);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start();
  lfo.start();
  return () => {
    try {
      src.stop();
      lfo.stop();
    } catch {
      // already stopped
    }
    g.disconnect();
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Emitter {
  node: CaveNode;
  handle: PositionalHandle | null;
  stop: StopFn | null;
}

export class Ambience {
  private bedGains: GainNode[] = [];
  private bedStops: StopFn[] = [];
  /** True while a bed is on its bridging synth (samples decode ~2 s after
   *  ensure(); latching the synth FOREVER was the bug that kept the
   *  generated beds silent for entire runs — user 2026-07-21). */
  private bedSynth: boolean[] = [];
  private started = false;
  private emitters: Emitter[] = [];
  /** Current bed weights (instrumentation/verification). */
  readonly weights = [0, 0, 0];

  private start(e: AudioEngine): void {
    this.started = true;
    BED_NAMES.forEach((name, tier) => {
      const g = e.ctx.createGain();
      g.gain.value = 0.0001;
      g.connect(e.underwater);
      this.bedGains.push(g);
      // the synth only BRIDGES until the generated bed decodes — update()
      // swaps it out the moment SAMPLES.ready flips
      const sampled = SAMPLES.loop(e.ctx, g, name, { gain: 1, fadeSec: 0.5 });
      this.bedStops.push(sampled ?? synthBed(e.ctx, g, tier));
      this.bedSynth.push(sampled === null);
    });
    this.emitters = audioNodes().map((node) => ({ node, handle: null, stop: null }));
  }

  update(e: AudioEngine | null, px: number, py: number, pz: number, submerged: boolean): void {
    if (!e || !e.running) return;
    if (!this.started) this.start(e);
    const D = TUNING.player.currentDepth;
    const A = TUNING.audio;
    const depth = -py;
    const half = D.blendM / 2;
    const deep = smoothstep(D.midToDeepM - half, D.midToDeepM + half, depth);
    const shallow = 1 - smoothstep(D.shallowToMidM - half, D.shallowToMidM + half, depth);
    const mid = Math.max(0, 1 - shallow - deep);
    const base = A.ambienceGain * (submerged ? 1 : 0.25);
    // deeper beds run HOTTER (user 2026-07-20: it should sound scarier the
    // deeper you go — the pressure gets louder, not just darker)
    const tierGain = [1, 1.35, 1.7];
    [shallow, mid, deep].forEach((w, i) => {
      this.weights[i] = w;
      this.bedGains[i]?.gain.setTargetAtTime(Math.max(0.0001, w * base * tierGain[i]), e.ctx.currentTime, 0.8);
      // the generated bed decoded since we started? swap the bridge out
      if (this.bedSynth[i] && SAMPLES.ready(BED_NAMES[i])) {
        this.bedStops[i]();
        this.bedStops[i] = SAMPLES.loop(e.ctx, this.bedGains[i], BED_NAMES[i], { gain: 1, fadeSec: 0.5 })!;
        this.bedSynth[i] = false;
      }
    });

    // emitters: attach within earshot, follow position, detach far away.
    // A node's `stretch` shapes the zone (user 2026-07-20): distances are
    // measured in stretched space, and the positional handle is fed a
    // VIRTUAL source at that distance along the true direction — pan stays
    // honest, gain follows the ellipsoid.
    for (const em of this.emitters) {
      const a = em.node.audio!;
      const [x, y, z] = em.node.pos;
      const st = em.node.stretch;
      const realD = Math.hypot(x - px, y - py, z - pz);
      let d = realD;
      let vx = x;
      let vy = y;
      let vz = z;
      if (st && realD > 1e-4) {
        d = Math.hypot((x - px) / st[0], (y - py) / st[1], (z - pz) / st[2]);
        const k = d / realD;
        vx = px + (x - px) * k;
        vy = py + (y - py) * k;
        vz = pz + (z - pz) * k;
      }
      if (!em.handle && d < a.radiusM * 1.5) {
        // SAMPLE ONLY (user 2026-07-21: the synth-bed stand-in at the pile
        // machinery sounded wrong — deleted). Not decoded yet = stay silent;
        // we simply retry next tick until the real sound exists.
        const h = e.positional(a.radiusM / (a.falloff ?? 3));
        h.setPosition(vx, vy, vz);
        const stop = SAMPLES.loop(e.ctx, h.input, a.sample, { gain: A.emitterGain, fadeSec: 1.5 });
        if (stop) {
          em.stop = stop;
          em.handle = h;
        } else {
          h.dispose();
        }
      } else if (em.handle && d > a.radiusM * 2) {
        em.stop?.();
        const h = em.handle;
        window.setTimeout(() => h.dispose(), 2500);
        em.handle = null;
        em.stop = null;
      } else if (em.handle) {
        em.handle.setPosition(vx, vy, vz);
      }
    }
  }

  /** Active emitter count (verification). */
  get activeEmitters(): number {
    return this.emitters.filter((e) => e.handle).length;
  }
}
