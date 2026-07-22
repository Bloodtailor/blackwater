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
  /** Per-sample peak-normalization gain (generated masters ship with wildly
   *  varying headroom — some sat so low the user couldn't hear the box/PaP/
   *  round stingers at all). Computed once at decode. */
  private normGain = new Map<string, number>();

  private initPromise: Promise<void> | null = null;

  init(): Promise<void> {
    this.initPromise ??= (async () => {
      try {
        // no-cache = revalidate: a browser that heuristically cached the old
        // bytes kept serving REGENERATED sounds stale (user 2026-07-21: "the
        // old machine sound is still playing"). ETag revalidation is cheap.
        const res = await fetch('/audio/manifest.json', { cache: 'no-cache' });
        if (!res.ok) return;
        const j = (await res.json()) as { sfx?: Record<string, SfxEntry> };
        this.manifest = j.sfx ?? null;
      } catch {
        this.manifest = null; // no generated assets — synth carries everything
      }
    })();
    return this.initPromise;
  }

  /** Decode everything up front (call once a context exists — ~40 small
   *  files; first-play misses fall back to synth otherwise). AWAITS the
   *  manifest fetch: a fast DIVE click used to race it, warm() no-opped, and
   *  every once-per-run sound (the box tease, the PaP motif) fell back to
   *  the quiet synth forever — the user's "box and pap make no sound"
   *  (2026-07-21). */
  warm(ctx: BaseAudioContext): void {
    void (async () => {
      await (this.initPromise ?? this.init());
      if (!this.manifest) {
        console.warn('[BLACKWATER audio] no sample manifest — EVERYTHING on synth fallbacks');
        return;
      }
      const names = Object.keys(this.manifest);
      await Promise.all(names.map((name) => this.load(ctx, name)));
      // the decode report: per-browser truth in one console line (2026-07-21:
      // Chrome/Edge behaved differently on the same build — stop guessing)
      const failed = names.filter((n) => this.buffers.get(n) === 'failed');
      const decoded = names.filter((n) => this.buffers.get(n) instanceof AudioBuffer);
      console.info(
        `[BLACKWATER audio] samples decoded ${decoded.length}/${names.length}` +
          (failed.length ? ` — FAILED (synth fallback): ${failed.join(', ')}` : ''),
      );
    })();
  }

  private loads = new Map<string, Promise<void>>();

  private load(ctx: BaseAudioContext, name: string): Promise<void> {
    // share the in-flight promise: two warm() callers used to race, and the
    // second's decode report counted 0/52 (early-return on 'pending')
    let p = this.loads.get(name);
    if (!p) {
      p = this.loadInner(ctx, name);
      this.loads.set(name, p);
    }
    return p;
  }

  private async loadInner(ctx: BaseAudioContext, name: string): Promise<void> {
    if (this.buffers.has(name)) return;
    this.buffers.set(name, 'pending');
    try {
      const url = this.manifest?.[name]?.url;
      if (!url) throw new Error('no entry');
      const res = await fetch(url, { cache: 'no-cache' }); // revalidate — never serve a stale regeneration
      if (!res.ok) throw new Error(String(res.status));
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
      // normalize toward peak 0.9: boost quiet masters (up to ×16), never cut
      let peak = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i += 4) {
          const a = Math.abs(d[i]);
          if (a > peak) peak = a;
        }
      }
      this.normGain.set(name, Math.min(16, Math.max(1, 0.9 / Math.max(peak, 1e-4))));
    } catch {
      this.buffers.set(name, 'failed'); // synth covers this sound for the run
    }
  }

  /** Is this sample decoded and playable right now? (Ambience uses this to
   *  swap its bridging synth out the moment the real bed arrives.) */
  ready(name: string): boolean {
    return this.buffers.get(name) instanceof AudioBuffer;
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
  play(ctx: BaseAudioContext, out: AudioNode, name: string, opts: { gain?: number; rateJitter?: number; rate?: number } = {}): boolean {
    const buf = this.buffer(ctx, name);
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // fixed per-voice rate (M14.5 crew voices) × the usual human jitter
    const jitter = opts.rateJitter ? 1 + (Math.random() * 2 - 1) * opts.rateJitter : 1;
    src.playbackRate.value = (opts.rate ?? 1) * jitter;
    const g = ctx.createGain();
    g.gain.value = (opts.gain ?? 1) * (this.normGain.get(name) ?? 1);
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
    g.gain.setTargetAtTime((opts.gain ?? 1) * (this.normGain.get(name) ?? 1), ctx.currentTime, fade / 3);
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
