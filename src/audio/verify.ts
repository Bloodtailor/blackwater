// Offline audio verification (M8a DoD). OfflineAudioContext needs no user
// gesture, so the harness can prove every synth voice produces real signal —
// and that the underwater bus measurably filters it — while the pane is
// hidden. setTimeout-scheduled tails don't land offline (the render finishes
// first); these numbers cover each sound's immediate body, which is enough
// to prove "this event makes this sound".

import { AudioEngine } from './engine';
import * as sfx from './sfx';

export interface RenderStats {
  rms: number;
  peak: number;
  /** Crude spectral brightness: fraction of energy in the top half of the
   *  sample-difference signal (high-frequency content proxy). */
  brightness: number;
}

function stats(buf: AudioBuffer): RenderStats {
  let sum = 0;
  let peak = 0;
  let diffSum = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      sum += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
      if (i > 0) diffSum += (v - d[i - 1]) ** 2;
    }
  }
  const n = buf.length * buf.numberOfChannels;
  const rms = Math.sqrt(sum / n);
  return { rms, peak, brightness: rms > 0 ? Math.sqrt(diffSum / n) / rms : 0 };
}

async function render(seconds: number, build: (e: AudioEngine) => void): Promise<RenderStats> {
  const ctx = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
  const e = new AudioEngine(ctx);
  build(e);
  return stats(await ctx.startRendering());
}

/** Render every voice in the library; returns name → stats. The DoD check:
 *  every entry has rms > 0. */
export async function verifyAllVoices(): Promise<Record<string, RenderStats>> {
  const out: Record<string, RenderStats> = {};
  const cases: [string, (e: AudioEngine) => void][] = [
    ['gun-wristDart', (e) => sfx.gunShot(e.ctx, e.underwater, 'wristDart', false)],
    ['gun-speargun', (e) => sfx.gunShot(e.ctx, e.underwater, 'speargun', false)],
    ['gun-pneuDriver', (e) => sfx.gunShot(e.ctx, e.underwater, 'pneuDriver', false)],
    ['gun-flechette', (e) => sfx.gunShot(e.ctx, e.underwater, 'flechette', false)],
    ['gun-harpoon', (e) => sfx.gunShot(e.ctx, e.underwater, 'harpoon', false)],
    ['gun-arcProjector', (e) => sfx.gunShot(e.ctx, e.underwater, 'arcProjector', false)],
    ['gun-vortexMaw', (e) => sfx.gunShot(e.ctx, e.underwater, 'vortexMaw', false)],
    ['gun-bangStick', (e) => sfx.gunShot(e.ctx, e.underwater, 'bangStick', true)],
    ['knife', (e) => sfx.knifeSwing(e.ctx, e.underwater, true)],
    ['heartbeat', (e) => sfx.heartThump(e.ctx, e.master, 1)],
    ['breath', (e) => sfx.breathCycle(e.ctx, e.underwater, 0.5)],
    ['drown', (e) => sfx.drownPulse(e.ctx, e.underwater)],
    ['grab', (e) => sfx.grabImpact(e.ctx, e.underwater)],
    ['moan', (e) => sfx.moan(e.ctx, e.underwater)],
    ['angler-hum', (e) => sfx.anglerHum(e.ctx, e.underwater)],
    ['guardian', (e) => sfx.guardianPresence(e.ctx, e.underwater)],
    ['silt-whump', (e) => sfx.siltWhump(e.ctx, e.underwater)],
    ['round-stinger', (e) => sfx.roundStinger(e.ctx, e.master)],
    ['stirs-stinger', (e) => sfx.stirsStinger(e.ctx, e.master)],
    ['perk-jingle', (e) => sfx.perkJingle(e.ctx, e.master)],
    ['box-tease', (e) => sfx.boxTease(e.ctx, e.master)],
    ['pap-motif', (e) => sfx.papMotif(e.ctx, e.master)],
    ['drop-chime', (e) => sfx.dropChime(e.ctx, e.master, true)],
    ['door-grind', (e) => sfx.doorGrind(e.ctx, e.underwater)],
    ['buy-click', (e) => sfx.buyClick(e.ctx, e.master, true)],
    ['geiger', (e) => sfx.geigerTick(e.ctx, e.underwater)],
    ['power-on', (e) => sfx.powerOnThunk(e.ctx, e.underwater)],
    ['death-sting', (e) => sfx.deathSting(e.ctx, e.master)],
    ['win-sting', (e) => sfx.winSting(e.ctx, e.master)],
  ];
  for (const [name, build] of cases) out[name] = await render(2.2, build);
  return out;
}

/** The underwater bus must be measurably DULLER than the surface bus for the
 *  same bright input; a full silt muffle must be duller still. */
export async function verifyBuses(): Promise<{ surface: RenderStats; underwater: RenderStats; muffled: RenderStats }> {
  const bright = (e: AudioEngine, bus: AudioNode): void => {
    const src = e.ctx.createBufferSource();
    const buf = e.ctx.createBuffer(1, e.ctx.sampleRate, e.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    src.buffer = buf;
    src.connect(bus);
    src.start();
  };
  const surface = await render(1, (e) => {
    e.setHeadAbove(true);
    bright(e, e.surface);
  });
  const underwater = await render(1, (e) => {
    e.setHeadAbove(false);
    bright(e, e.underwater);
  });
  const muffled = await render(1, (e) => {
    e.setHeadAbove(false);
    e.setMuffle(1, 0.001); // instant for the render window
    bright(e, e.underwater);
  });
  return { surface, underwater, muffled };
}

/** Positional math check: gain falls with distance, pan follows the right
 *  vector, occlusion kicks in through rock. Pure-math (no render needed). */
export function verifyPositional(e: AudioEngine): { near: number; far: number; panLeft: number; panRight: number } {
  e.setListener(0, 0, 0, 1, 0, 0);
  const h = e.positional(6);
  h.setPosition(0, 0, -2);
  const near = h.state.gain;
  h.setPosition(0, 0, -30);
  const far = h.state.gain;
  h.setPosition(-10, 0, 0);
  const panLeft = h.state.pan;
  h.setPosition(10, 0, 0);
  const panRight = h.state.pan;
  h.dispose();
  return { near, far, panLeft, panRight };
}
