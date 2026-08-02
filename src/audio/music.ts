// ONE SONG (M12, DESIGN §14): a single global music slot. Every song —
// jukebox, the lull, Moonlight at the Waterline, anything future — plays
// through here, and starting one stops whatever else was
// playing (the user heard the lull and the jukebox collide; never again).
//
// The lull is special: it is what silence grows when left alone. It may only
// START after a real quiet stretch — no music AND no dialog — and it yields
// instantly to any explicit song. Logic is pure and unit-tested; the element
// factory is injected (main wires the real Audio → engine.music path; tests
// wire a stub).

export type MusicSource = 'jukebox' | 'lull' | 'moonlight' | 'menu';

export interface TrackHandle {
  stop(): void;
}

/** Builds and starts a real track. Null = audio can't run right now. */
export type TrackFactory = (url: string, gain: number, loop: boolean, onEnded: () => void) => TrackHandle | null;

export class MusicDirector {
  current: { id: MusicSource; name: string; handle: TrackHandle } | null = null;
  /** Seconds with NO music and NO dialog (main feeds dialog state). */
  quietT = 0;
  /** Lull spacing; main seeds the opening grace. */
  lullCooldown = 0;
  /** Fires whenever the slot empties (track ended or stopped) — menus use
   *  it to re-sync their theme. */
  onStopped: (() => void) | null = null;
  private factory: TrackFactory | null = null;

  wire(factory: TrackFactory): void {
    this.factory = factory;
  }

  get playing(): boolean {
    return this.current !== null;
  }

  /** Start an explicit song. Stops whatever else is playing first. */
  play(id: MusicSource, url: string, gain: number, opts: { loop?: boolean; name?: string } = {}): boolean {
    if (!this.factory) return false;
    this.stop();
    const handle = this.factory(url, gain, opts.loop ?? false, () => {
      if (this.current?.id === id) {
        this.current = null;
        this.onStopped?.();
      }
    });
    if (!handle) return false;
    this.current = { id, name: opts.name ?? url.split('/').pop() ?? url, handle };
    return true;
  }

  /** Stop the current song (optionally only if it's `id`). */
  stop(id?: MusicSource): void {
    if (!this.current) return;
    if (id && this.current.id !== id) return;
    this.current.handle.stop();
    this.current = null;
    this.onStopped?.();
  }

  /** Tick the quiet clock. `dialogActive` = tape/Lowe/REMORA speaking. */
  update(dt: number, dialogActive: boolean): void {
    this.lullCooldown = Math.max(0, this.lullCooldown - dt);
    this.quietT = this.playing || dialogActive ? 0 : this.quietT + dt;
  }

  /** The lull — only into true, earned quiet. */
  tryLull(url: string, gain: number, afterSec: number, cooldownSec: number): boolean {
    if (this.playing || this.quietT < afterSec || this.lullCooldown > 0) return false;
    if (!this.play('lull', url, gain)) return false;
    this.lullCooldown = cooldownSec;
    this.quietT = 0;
    return true;
  }
}

export const MUSIC = new MusicDirector();
