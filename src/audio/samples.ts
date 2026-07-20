// SampleBank (M8b generation round): generated ElevenLabs SFX, played through
// the same buses/positional inputs as the synth. Per-sound quality gate, per
// the plan: every sfx.ts voice ASKS the bank first and falls back to its M8a
// synth when the sample is missing — delete a file you don't like and that
// one sound reverts, nothing else changes.

export interface SfxEntry {
  url: string;
  loop?: boolean;
}

export class SampleBank {
  /** name → entry, from manifest.json's sfx section (null until init). */
  manifest: Record<string, SfxEntry> | null = null;
  /** Playback counts per name (verification + M9 logs). */
  readonly playCounts = new Map<string, number>();
  private buffers = new Map<string, AudioBuffer | 'pending' | 'failed'>();

  async init(): Promise<void> {
    try {
      const res = await fetch('/audio/manifest.json');
      if (!res.ok) return;
      const j = (await res.json()) as { sfx?: Record<string, SfxEntry> };
      this.manifest = j.sfx ?? null;
    } catch {
      this.manifest = null; // no generated assets — synth carries everything
    }
  }

  /** Decode everything up front (call once a context exists — ~40 small
   *  files; first-play misses fall back to synth otherwise). */
  warm(ctx: BaseAudioContext): void {
    if (!this.manifest) return;
    for (const name of Object.keys(this.manifest)) void this.load(ctx, name);
  }

  private async load(ctx: BaseAudioContext, name: string): Promise<void> {
    if (this.buffers.has(name)) return;
    this.buffers.set(name, 'pending');
    try {
      const url = this.manifest?.[name]?.url;
      if (!url) throw new Error('no entry');
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
    } catch {
      this.buffers.set(name, 'failed'); // synth covers this sound for the run
    }
  }

  private buffer(ctx: BaseAudioContext, name: string): AudioBuffer | null {
    if (!this.manifest?.[name]) return null;
    const b = this.buffers.get(name);
    if (b === undefined) {
      void this.load(ctx, name); // late warm — this occurrence goes to synth
      return null;
    }
    return b instanceof AudioBuffer ? b : null;
  }

  /** One-shot. True = the sample played (synth should stay quiet). */
  play(ctx: BaseAudioContext, out: AudioNode, name: string, opts: { gain?: number; rateJitter?: number } = {}): boolean {
    const buf = this.buffer(ctx, name);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rateJitter) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * opts.rateJitter;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g);
    g.connect(out);
    src.start();
    src.onended = () => g.disconnect();
    this.playCounts.set(name, (this.playCounts.get(name) ?? 0) + 1);
    return true;
  }

  /** Looped sample (angler hum, guardian presence, toy shimmer). Null = use
   *  the synth loop instead. */
  loop(ctx: BaseAudioContext, out: AudioNode, name: string, opts: { gain?: number; fadeSec?: number } = {}): (() => void) | null {
    const buf = this.buffer(ctx, name);
    if (!buf) return null;
    const fade = opts.fadeSec ?? 1.2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(opts.gain ?? 1, ctx.currentTime, fade / 3);
    src.connect(g);
    g.connect(out);
    src.start();
    this.playCounts.set(name, (this.playCounts.get(name) ?? 0) + 1);
    return () => {
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      setTimeout(() => {
        try {
          src.stop();
        } catch {
          // already stopped
        }
        g.disconnect();
      }, 2000);
    };
  }
}

export const SAMPLES = new SampleBank();
