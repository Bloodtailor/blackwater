// Radio logs (M8b, LORE §5). Six waterproof reel-to-reel bricks at the
// tape-tagged spots. Pickup is a one-second interact; the tape AUTO-PLAYS the
// next time Lowe's head is above water and it's SAFE (no enemy within ~20 m).
// Dive = tension, breathe = story. Subtitled, skippable (B), pauses if you
// submerge mid-play and resumes at the next safe surfacing.
//
// TapeDeck is pure logic (unit-tested); TapeProps is the three.js side.

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { getNode } from '../cave/data';
import { sdf } from '../cave/sdf';
import { SETTINGS } from '../ui/settings';
import type { AudioEngine } from '../audio/engine';
import { estimateSpeechSec, TAPES, type TapeScript } from '../audio/lines';
import type { VoManifest } from '../audio/voice';
import { tapeClick } from '../audio/sfx';
import type { InteractSystem } from '../economy/interact';

export interface TapePlayback {
  tape: TapeScript;
  t: number; // seconds into the tape (fallback clock)
  durSec: number;
  paused: boolean;
}

export class TapeDeck {
  /** Recovered tape ids, in pickup order (pause-menu list reads this). */
  readonly collected: string[] = [];
  /** Waiting to play (FIFO — story order is pickup order). */
  readonly pending: TapeScript[] = [];
  playing: TapePlayback | null = null;
  /** Set when a tape finishes: the Lowe reaction to queue. */
  onFinished: ((tape: TapeScript) => void) | null = null;
  onStart: ((tape: TapeScript) => void) | null = null;
  onPauseChange: ((paused: boolean) => void) | null = null;

  collect(id: string): boolean {
    if (this.collected.includes(id)) return false;
    const tape = TAPES.find((t) => t.id === id);
    if (!tape) return false;
    this.collected.push(id);
    this.pending.push(tape);
    return true;
  }

  /** `safe` = head above water AND no enemy within tapeSafeRadiusM. */
  update(dt: number, surfaced: boolean, safe: boolean): void {
    const p = this.playing;
    if (p) {
      // submerging (or danger arriving) pauses the reel — it waits for you
      const shouldPause = !surfaced;
      if (shouldPause !== p.paused) {
        p.paused = shouldPause;
        this.onPauseChange?.(p.paused);
      }
      if (!p.paused) {
        p.t += dt;
        if (p.t >= p.durSec) this.finish();
      }
      return;
    }
    if (surfaced && safe && this.pending.length > 0) {
      const tape = this.pending.shift()!;
      this.playing = { tape, t: 0, durSec: estimateSpeechSec(tape.text), paused: false };
      this.onStart?.(this.playing.tape);
    }
  }

  /** B key — skip the rest; the reaction still queues (he heard enough). */
  skip(): boolean {
    if (!this.playing) return false;
    this.finish();
    return true;
  }

  /** Real audio reports its true length. */
  setDuration(sec: number): void {
    if (this.playing) this.playing.durSec = sec;
  }

  private finish(): void {
    const tape = this.playing!.tape;
    this.playing = null;
    this.onFinished?.(tape);
  }
}

/** The world-side: props, pickups, audio element playback. */
export class TapeProps {
  private els = new Map<string, HTMLAudioElement>();

  constructor(
    scene: THREE.Scene,
    interact: InteractSystem,
    private deck: TapeDeck,
    private getEngine: () => AudioEngine | null,
    private manifest: () => VoManifest | null,
    toast: (m: string) => void,
  ) {
    for (const tape of TAPES) {
      const n = getNode(tape.nodeId);
      // rest the brick on the floor: probe straight down from mid-room
      let y = n.pos[1];
      for (let d = 0; d < n.radius + 2; d += 0.25) {
        if (sdf(n.pos[0], n.pos[1] - d, n.pos[2]) > -0.3) {
          y = n.pos[1] - d + 0.35;
          break;
        }
      }
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.12, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x4a4d38, roughness: 0.85, metalness: 0.2 }),
      );
      g.add(body);
      for (const sx of [-0.07, 0.07]) {
        const reel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.015, 12),
          new THREE.MeshStandardMaterial({ color: 0x22231c, roughness: 0.6 }),
        );
        reel.position.set(sx, 0.065, 0);
        g.add(reel);
      }
      // the red REC dot — a tiny emissive bead, the only warm thing on it
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x661111, emissive: 0xcc2211, emissiveIntensity: 1.4 }),
      );
      dot.position.set(0.11, 0.03, 0.105);
      g.add(dot);
      g.position.set(n.pos[0] + n.radius * 0.3, y, n.pos[2]);
      g.rotation.y = Math.random() * Math.PI;
      scene.add(g);

      interact.add({
        id: `tape-${tape.id}`,
        pos: [g.position.x, g.position.y, g.position.z],
        prompt: () => (this.deck.collected.includes(tape.id) ? null : { text: `RECOVER ${tape.title}`, holdSec: 0, enabled: true }),
        execute: () => {
          if (this.deck.collect(tape.id)) {
            g.visible = false;
            toast(`TAPE RECOVERED — ${tape.title}`);
            const e = this.getEngine();
            if (e && e.running) tapeClick(e.ctx, e.bus);
          }
        },
      });
    }

    deck.onStart = (tape) => this.startAudio(tape);
    deck.onPauseChange = (paused) => {
      const el = this.currentEl();
      if (el) {
        if (paused) el.pause();
        else void el.play().catch(() => {});
      }
    };
  }

  private currentEl(): HTMLAudioElement | null {
    const p = this.deck.playing;
    return p ? (this.els.get(p.tape.id) ?? null) : null;
  }

  private startAudio(tape: TapeScript): void {
    const e = this.getEngine();
    const url = this.manifest()?.tapes[tape.id];
    // no asset / no engine / offline verification ctx → the subtitle clock carries it
    if (!url || !e || !e.running || typeof (e.ctx as AudioContext).createMediaElementSource !== 'function') return;
    const el = new Audio(url);
    const ctx = e.ctx as AudioContext;
    const src = ctx.createMediaElementSource(el);
    const g = ctx.createGain();
    g.gain.value = SETTINGS.volumeVo;
    src.connect(g);
    g.connect(e.surface); // tapes play at the surface, in air
    el.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(el.duration) && el.duration > 0) this.deck.setDuration(el.duration);
    });
    this.els.set(tape.id, el);
    void el.play().catch(() => {});
  }

  stopAudio(): void {
    const el = this.currentEl();
    if (el) el.pause();
  }
}

/** Safe-surfacing check (§5 playback spec): head above AND nothing hostile
 *  inside the radius. Pure — testable. */
export function tapeSafe(
  playerPos: { x: number; y: number; z: number },
  hostiles: { pos: { x: number; y: number; z: number }; state: string }[],
): boolean {
  const r = TUNING.voice.tapeSafeRadiusM;
  for (const h of hostiles) {
    if (h.state === 'dead') continue;
    const dx = h.pos.x - playerPos.x;
    const dy = h.pos.y - playerPos.y;
    const dz = h.pos.z - playerPos.z;
    if (dx * dx + dy * dy + dz * dz < r * r) return false;
  }
  return true;
}
