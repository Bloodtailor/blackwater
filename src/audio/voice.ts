// Lowe's voice (M8b). Two layers:
//
//   VoiceQueue  — pure logic, unit-tested: LORE §2.1 anti-spam. Silence is
//                 the default: every line plays at most once per run, ambient
//                 lines obey a global ≥120 s cooldown AND a ~40% roll at
//                 request time (a failed roll discards the line — Lowe just
//                 doesn't say it this run), priority tapeReact > event >
//                 ambient, and NOTHING plays below the surface. Regulator in.
//
//   VoicePlayer — DOM/WebAudio side: plays `public/audio/vo/<id>.mp3` when
//                 the generated manifest lists it, else a radio-squelch +
//                 subtitle-timer fallback (the mandated no-blocking path —
//                 the fiction reads even before ElevenLabs assets exist).

import { TUNING } from '../tuning';
import { SETTINGS } from '../ui/settings';
import type { AudioEngine } from './engine';
import { estimateSpeechSec, LOWE_LINES, type VoLine } from './lines';
import { radioSquelch } from './sfx';

const CAT_PRIORITY = { tapeReact: 0, event: 1, ambient: 2 } as const;

export class VoiceQueue {
  readonly played = new Set<string>();
  readonly queue: VoLine[] = [];
  /** Seconds left on the global ambient cooldown. */
  ambientCooldown = 0;
  /** Seconds left of the currently-speaking line. */
  speakT = 0;
  current: VoLine | null = null;
  private lines: Map<string, VoLine>;

  constructor(lines: VoLine[] = LOWE_LINES, private rand: () => number = Math.random) {
    this.lines = new Map(lines.map((l) => [l.id, l]));
  }

  /** Ask for a line. Returns why it didn't queue, or 'queued'. */
  request(id: string): 'queued' | 'unknown' | 'already' | 'cooldown' | 'rolled-off' {
    const line = this.lines.get(id);
    if (!line) return 'unknown';
    if (this.played.has(id) || this.queue.includes(line) || this.current === line) return 'already';
    if (line.cat === 'ambient' && !line.forced) {
      if (this.ambientCooldown > 0) return 'cooldown';
      if (this.rand() > TUNING.voice.ambientChance) return 'rolled-off';
    }
    this.queue.push(line);
    this.queue.sort((a, b) => CAT_PRIORITY[a.cat] - CAT_PRIORITY[b.cat]);
    return 'queued';
  }

  /**
   * Advance. Returns a line the caller must START PLAYING now, or null.
   * `surfaced` = head above water (the only place Lowe speaks);
   * `blocked` = something louder is running (a tape).
   */
  update(dt: number, surfaced: boolean, blocked = false): VoLine | null {
    this.ambientCooldown = Math.max(0, this.ambientCooldown - dt);
    if (this.current) {
      this.speakT -= dt;
      // submerging mid-line: he stops talking (regulator back in); the line
      // counts as said — Lowe does not repeat himself
      if (this.speakT <= 0 || !surfaced) this.current = null;
    }
    if (!surfaced || blocked || this.current || this.queue.length === 0) return null;
    const line = this.queue.shift()!;
    this.played.add(line.id);
    this.current = line;
    this.speakT = estimateSpeechSec(line.text);
    if (line.cat === 'ambient') this.ambientCooldown = TUNING.voice.ambientCooldownSec;
    return line;
  }

  /** Real audio knows its own length — trust it over the estimate. */
  setSpeakSeconds(sec: number): void {
    if (this.current) this.speakT = sec;
  }
}

/** Generated-asset manifest (written by scripts/generate-vo.mjs). Absent =
 *  run entirely on fallbacks. */
export interface VoManifest {
  vo: Record<string, string>; // line id → url
  tapes: Record<string, string>; // tape id → url
  music?: string[];
}

export async function loadManifest(): Promise<VoManifest | null> {
  try {
    const res = await fetch('/audio/manifest.json');
    if (!res.ok) return null;
    return (await res.json()) as VoManifest;
  } catch {
    return null;
  }
}

export class VoicePlayer {
  private el: HTMLAudioElement | null = null;
  onEnded: (() => void) | null = null;

  constructor(
    private getEngine: () => AudioEngine | null,
    private manifest: () => VoManifest | null,
    /** 'surface' = Lowe (speaks only above water, through the air bus);
     *  'master' = REMORA (in-helmet speaker — the water never touches it). */
    private bus: 'surface' | 'master' = 'surface',
  ) {}

  private out(e: AudioEngine): AudioNode {
    return this.bus === 'master' ? e.master : e.surface;
  }

  /** Start a line. Returns real duration when known (else null → caller keeps
   *  its estimate). */
  play(line: VoLine): number | null {
    const e = this.getEngine();
    const url = this.manifest()?.vo[line.id];
    if (url && e && e.running && typeof (e.ctx as AudioContext).createMediaElementSource === 'function') {
      this.stop();
      const el = new Audio(url);
      el.volume = 1;
      const src = (e.ctx as AudioContext).createMediaElementSource(el);
      const g = (e.ctx as AudioContext).createGain();
      g.gain.value = SETTINGS.volumeVo;
      src.connect(g);
      g.connect(this.out(e));
      el.addEventListener('ended', () => this.onEnded?.());
      void el.play().catch(() => this.onEnded?.());
      this.el = el;
      return null; // duration via ended event
    }
    // fallback: a soft radio squelch marks the line; the subtitle carries it
    if (e && e.running) radioSquelch(e.ctx, this.out(e), SETTINGS.volumeVo);
    return null;
  }

  stop(): void {
    if (this.el) {
      this.el.pause();
      this.el = null;
    }
  }
}
