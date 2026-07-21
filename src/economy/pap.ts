// The Bench (DESIGN §10.6, LORE §4): the forward machine-shop rig that bathes
// a weapon in the Pile's output. ×2.5 damage, bigger mag, a new name, a
// per-gun quirk — and every papped projectile EMITS LIGHT (the universal
// rule; main owns the impact glow). Needs power: the user's current map has
// no powerGate edge, so the machine itself stays cold until the Pile is live
// (same design intent, no map edit — logged in the worklog).

import * as THREE from 'three';
import { NODES } from '../cave/data';
import { sdf } from '../cave/sdf';
import { TUNING } from '../tuning';
import type { Weapons, WeaponSlot } from '../player/weapons';
import type { Inventory } from './inventory';
import type { InteractSystem } from './interact';

export class PapBench {
  state: 'idle' | 'working' = 'idle';
  private t = 0;
  private benched: WeaponSlot | null = null;
  private glowMat: THREE.MeshStandardMaterial | null = null;
  private roller: THREE.Mesh | null = null;

  constructor(
    scene: THREE.Scene,
    interact: InteractSystem,
    private inventory: Inventory,
    private weapons: Weapons,
    private powered: () => boolean,
    private toast: (m: string) => void,
  ) {
    const node = NODES.find((n) => n.tags.includes('pap'));
    if (!node) return;
    const g = new THREE.Group();
    let floorY = node.pos[1] - node.radius * 0.5;
    for (let d = 0.4; d < node.radius * 2.2; d += 0.25) {
      if (sdf(node.pos[0], node.pos[1] - d, node.pos[2]) >= -0.1) {
        floorY = node.pos[1] - d + 0.1;
        break;
      }
    }
    g.position.set(node.pos[0], floorY, node.pos[2]);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2e3a40, roughness: 0.5, metalness: 0.6, flatShading: true });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 0.8), steel);
    base.position.y = 0.42;
    g.add(base);
    this.roller = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.35, metalness: 0.8 }),
    );
    this.roller.rotation.z = Math.PI / 2;
    this.roller.position.y = 1.0;
    g.add(this.roller);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), steel);
      post.position.set(s * 0.72, 1.0, 0);
      g.add(post);
    }
    // cherenkov strip: cold until powered, working pulse while it runs
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0x1e3a42, roughness: 0.5, emissive: 0x3fc8e8, emissiveIntensity: 0 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.7), this.glowMat);
    strip.position.y = 0.88;
    g.add(strip);
    scene.add(g);
    interact.add({
      id: 'pap',
      pos: [g.position.x, g.position.y + 0.9, g.position.z],
      prompt: () => {
        if (this.state === 'working') return { text: 'THE BENCH IS WORKING…', holdSec: 0, enabled: false };
        if (!this.powered()) return { text: 'THE BENCH', holdSec: 0, enabled: false, sub: 'COLD — THE PILE IS DOWN' };
        const s = this.weapons.current;
        if (s.def.papped) return { text: s.def.name, holdSec: 0, enabled: false, sub: 'ALREADY WORKED' };
        // M13 (DESIGN §10.6): the fee is a fuel slug, found in the world
        const has = this.inventory.slugs > 0;
        return {
          text: `WORK THE ${s.def.name} · 1 FUEL SLUG`,
          holdSec: 0,
          enabled: has,
          sub: has ? 'PROPERTY CORMORANT' : 'NO SLUG ON THE BELT — THE PILE MAKES THEM',
        };
      },
      execute: () => {
        if (this.state !== 'idle' || !this.powered() || this.weapons.current.def.papped) return;
        if (!this.inventory.useSlug()) return;
        this.benched = this.weapons.current;
        this.state = 'working';
        this.t = 0;
        this.toast('THE BENCH TAKES THE SLUG — AND THE GUN');
      },
    });
  }

  setPowered(on: boolean): void {
    if (this.glowMat) this.glowMat.emissiveIntensity = on ? 0.6 : 0;
  }

  update(dt: number, time: number): void {
    if (this.state === 'working' && this.benched) {
      this.t += dt;
      if (this.glowMat) this.glowMat.emissiveIntensity = 0.9 + 0.5 * Math.sin(time * 9);
      if (this.roller) this.roller.rotation.x += dt * 10;
      if (this.t >= TUNING.pap.benchSec) {
        const oldName = this.benched.def.name;
        this.weapons.papSlot(this.benched);
        this.toast(`${oldName} → ${this.benched.def.name}`);
        this.benched = null;
        this.state = 'idle';
        if (this.glowMat) this.glowMat.emissiveIntensity = 0.6;
      }
    }
  }
}
