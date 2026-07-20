// The easter egg (M8b, LORE §6): three wind-up tin divers hidden in dead
// ends, each with a faint music-box shimmer (≤8 m findability). Wind all
// three and the rec-room jukebox wakes: ONE track, game-wide, through the
// underwater DSP — muffled, far away, everywhere. Once per run.
//
// Track source: a random file from public/music/easteregg/ (tracks.json is
// listed live by the dev server / written at build — drop MP3s in, zero code).

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { getNode } from '../cave/data';
import { sdf } from '../cave/sdf';
import { SETTINGS } from '../ui/settings';
import type { AudioEngine, PositionalHandle } from '../audio/engine';
import { toyShimmer, toyWind, type StopFn } from '../audio/sfx';
import type { InteractSystem } from '../economy/interact';

const TOY_COLORS = [0xa03028, 0x2a4f9e, 0xc9a72c]; // painted tin: red/blue/yellow
const TOY_NODES = ['gal-spur-toy', 'mz-d1', 'abyss-toy'];

export class Toys {
  wound = 0;
  jukeboxOn = false;
  /** Filename the jukebox chose (verification + "now playing"). */
  lastTrack: string | null = null;
  /** Lowe line + toast hooks (main wires them). */
  onWind: ((count: number) => void) | null = null;
  onJukebox: (() => void) | null = null;
  private shimmers: { handle: PositionalHandle; stop: StopFn }[] = [];
  private shimmerStarted = false;
  private jukeboxGlow: THREE.MeshStandardMaterial | null = null;
  private trackEl: HTMLAudioElement | null = null;
  private toyPos: THREE.Vector3[] = [];
  /** Per-toy wind closures (interact executes + the debug wind-all button). */
  private winders: (() => void)[] = [];

  windAll(): void {
    for (const w of this.winders) w();
  }

  constructor(
    scene: THREE.Scene,
    interact: InteractSystem,
    private getEngine: () => AudioEngine | null,
  ) {
    TOY_NODES.forEach((nodeId, i) => {
      const n = getNode(nodeId);
      let y = n.pos[1];
      for (let d = 0; d < n.radius + 2; d += 0.25) {
        if (sdf(n.pos[0], n.pos[1] - d, n.pos[2]) > -0.3) {
          y = n.pos[1] - d + 0.3;
          break;
        }
      }
      const g = new THREE.Group();
      const tin = new THREE.MeshStandardMaterial({ color: TOY_COLORS[i], roughness: 0.4, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.16, 10), tin);
      g.add(body);
      const helm = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xb8a25a, roughness: 0.3, metalness: 0.8 }),
      );
      helm.position.y = 0.12;
      g.add(helm);
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.012), tin);
      key.position.set(0, 0.02, -0.085);
      g.add(key);
      g.position.set(n.pos[0] - n.radius * 0.25, y, n.pos[2] + n.radius * 0.2);
      scene.add(g);
      this.toyPos.push(g.position.clone());

      let woundThis = false;
      const wind = (): void => {
        if (woundThis) return;
        woundThis = true;
        this.wound++;
        key.rotation.x = 1.1; // the key has been turned
        const e = this.getEngine();
        if (e && e.running) toyWind(e.ctx, e.bus);
        const s = this.shimmers[i];
        if (s) {
          s.stop();
          s.handle.dispose();
        }
        this.onWind?.(this.wound);
        if (this.wound >= 3) this.wakeJukebox();
      };
      this.winders.push(wind);
      interact.add({
        id: `toy-${i}`,
        pos: [g.position.x, g.position.y, g.position.z],
        prompt: () => (woundThis ? null : { text: 'WIND THE DIVER', holdSec: 0, enabled: true }),
        execute: wind,
      });
    });

    // the jukebox: chrome-and-walnut, bubble arch, dead until the toys wake it
    const jb = getNode('gal-rec');
    let jy = jb.pos[1];
    for (let d = 0; d < jb.radius + 2; d += 0.25) {
      if (sdf(jb.pos[0], jb.pos[1] - d, jb.pos[2]) > -0.3) {
        jy = jb.pos[1] - d + 0.55;
        break;
      }
    }
    const jg = new THREE.Group();
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.0, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x3d2b1c, roughness: 0.6, metalness: 0.15 }),
    );
    jg.add(cab);
    this.jukeboxGlow = new THREE.MeshStandardMaterial({ color: 0x201810, emissive: 0xff9a3c, emissiveIntensity: 0 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16, Math.PI), this.jukeboxGlow);
    arch.position.y = 0.5;
    jg.add(arch);
    const chrome = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.08, 0.47),
      new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.25, metalness: 0.9 }),
    );
    chrome.position.y = -0.46;
    jg.add(chrome);
    jg.position.set(jb.pos[0] - jb.radius * 0.4, jy, jb.pos[2] - jb.radius * 0.3);
    scene.add(jg);
  }

  /** Shimmer loops need a live engine — start them on the first update after
   *  audio wakes (and only for still-unwound toys). */
  update(): void {
    const e = this.getEngine();
    if (!this.shimmerStarted && e && e.running) {
      this.shimmerStarted = true;
      this.toyPos.forEach((p, i) => {
        const h = e.positional(TUNING.voice.shimmerRefDistM);
        h.setPosition(p.x, p.y, p.z);
        this.shimmers[i] = { handle: h, stop: toyShimmer(e.ctx, h.input) };
      });
      // any toy wound before audio woke: silence it immediately
      this.shimmers.forEach((s, i) => {
        if (i < this.wound) {
          s.stop();
          s.handle.dispose();
        }
      });
    }
  }

  private wakeJukebox(): void {
    if (this.jukeboxOn) return;
    this.jukeboxOn = true;
    if (this.jukeboxGlow) this.jukeboxGlow.emissiveIntensity = 1.2;
    this.onJukebox?.();
    void this.playRandomTrack();
  }

  private async playRandomTrack(): Promise<void> {
    const e = this.getEngine();
    if (!e || !e.running) return;
    let tracks: string[] = [];
    try {
      const res = await fetch('/music/easteregg/tracks.json');
      if (res.ok) tracks = (await res.json()) as string[];
    } catch {
      // no listing — the jukebox hums to itself
    }
    if (tracks.length === 0) return;
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    this.lastTrack = pick;
    const ctx = e.ctx as AudioContext;
    // offline verification contexts can't host media elements — the pick
    // still registers (lastTrack) so the harness can assert the choice
    if (typeof ctx.createMediaElementSource !== 'function') return;
    const el = new Audio(`/music/easteregg/${encodeURIComponent(pick)}`);
    const src = ctx.createMediaElementSource(el);
    const g = ctx.createGain();
    g.gain.value = TUNING.voice.jukeboxGain * SETTINGS.volumeMusic;
    src.connect(g);
    g.connect(e.underwater); // game-wide through the water — the LORE ask
    this.trackEl = el;
    void el.play().catch(() => {});
  }

  /** Debug/win-screen: stop the song. */
  stopMusic(): void {
    this.trackEl?.pause();
    this.trackEl = null;
  }
}
