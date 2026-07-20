// Requisition Roulette (DESIGN §10.2, LORE §4): the crew's supply-lottery
// ritual. Several crates exist across the site — one is live (warm light
// through the slats). A pull cycles the requisition, offers a weapon for a
// few seconds, and now and then the pull is a wind-up toy diver instead: the
// fee comes back, the crate goes cold, and another crate wakes somewhere
// else. No one explains who moves it.

import * as THREE from 'three';
import { NODES, type CaveNode } from '../cave/data';
import { sdf } from '../cave/sdf';
import { TUNING } from '../tuning';
import { softDotTexture } from '../effects/atmosphere';
import { BOX_GUNS, WALL_GUNS, weaponDef, type GunId, type Weapons } from '../player/weapons';
import type { Points } from './points';
import type { InteractSystem } from './interact';

type BoxState = 'idle' | 'spinning' | 'offering';

interface Crate {
  node: CaveNode;
  group: THREE.Group;
  glow: THREE.PointsMaterial; // warm light through the slats (live crate)
  toy: THREE.Group; // sits in the crate once the box abandons it
  lid: THREE.Mesh;
  card: THREE.Sprite; // the rising requisition card (faces the diver)
  cardMat: THREE.SpriteMaterial;
}

function cardTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20, 24, 20, 0.92)';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#8a8570';
  g.strokeRect(2, 2, 252, 60);
  g.fillStyle = '#ffe9a8';
  g.textAlign = 'center';
  g.font = '22px Consolas, monospace';
  g.fillText(text, 128, 40, 244);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MysteryBox {
  state: BoxState = 'idle';
  activeIdx = 0;
  spinsAtSpot = 0;
  offered: GunId | null = null;
  private t = 0;
  private cycleT = 0;
  private crates: Crate[] = [];
  /** Forced relocation on the next resolve (debug). */
  forceMoveNext = false;

  constructor(
    scene: THREE.Scene,
    private interact: InteractSystem,
    private points: Points,
    private weapons: Weapons,
    private toast: (m: string) => void,
  ) {
    const spots = NODES.filter((n) => n.tags.includes('boxSpot'));
    for (const node of spots) {
      const crate = this.buildCrate(node);
      scene.add(crate.group);
      this.crates.push(crate);
      this.interact.add({
        id: `box:${node.id}`,
        pos: [crate.group.position.x, crate.group.position.y + 0.7, crate.group.position.z],
        reachM: 3.4, // it's a whole crate on a cart
        prompt: () => this.promptFor(crate),
        execute: () => this.executeAt(crate),
      });
    }
    this.syncLive();
  }

  private buildCrate(node: CaveNode): Crate {
    const g = new THREE.Group();
    // find the real floor: march the SDF down from the node center (the M3
    // lesson — scan the field, don't trust node math)
    let floorY = node.pos[1] - node.radius * 0.55;
    for (let d = 0.4; d < node.radius * 2.2; d += 0.25) {
      if (sdf(node.pos[0], node.pos[1] - d, node.pos[2]) >= -0.1) {
        floorY = node.pos[1] - d + 0.12;
        break;
      }
    }
    g.position.set(node.pos[0], floorY, node.pos[2]);
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3d28, roughness: 0.85, flatShading: true });
    const stripe = new THREE.MeshStandardMaterial({ color: 0x8a7a2c, roughness: 0.7 });
    // slatted crate on a cart
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.72), wood);
      slat.position.y = 0.12 + i * 0.22;
      g.add(slat);
    }
    for (const s of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.76), stripe);
      band.position.set(s * 0.45, 0.45, 0);
      g.add(band);
    }
    const cart = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 0.85), new THREE.MeshStandardMaterial({ color: 0x33383c, roughness: 0.6, metalness: 0.5 }));
    cart.position.y = -0.03;
    g.add(cart);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 0.76), wood);
    lid.position.y = 0.98;
    g.add(lid);
    // warm light through the slats: a soft glow sprite inside
    const glowMat = new THREE.PointsMaterial({
      size: 1.6,
      map: softDotTexture(),
      color: 0xffc878,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.55, 0]), 3));
    const glow = new THREE.Points(glowGeo, glowMat);
    glow.frustumCulled = false;
    g.add(glow);
    // the wind-up toy diver (LORE motif): tiny tin figure, hidden until the
    // crate goes cold
    const toy = new THREE.Group();
    const tin = new THREE.MeshStandardMaterial({ color: 0xa03028, roughness: 0.4, metalness: 0.3 });
    const tinB = new THREE.MeshStandardMaterial({ color: 0x2858a0, roughness: 0.4, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.09), tin);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tinB);
    helm.position.y = 0.14;
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.02), tinB);
    key.position.set(0, 0.02, -0.08);
    toy.add(body, helm, key);
    toy.position.y = 1.0;
    toy.visible = false;
    g.add(toy);
    // requisition card (rises while spinning/offering; a sprite so it always
    // faces the diver — a fixed plane read edge-on from most approaches)
    const cardMat = new THREE.SpriteMaterial({ map: cardTexture('—'), transparent: true, depthWrite: false });
    const card = new THREE.Sprite(cardMat);
    card.scale.set(1.1, 0.28, 1);
    card.position.y = 0.9;
    card.visible = false;
    g.add(card);
    return { node, group: g, glow: glowMat, toy, lid, card, cardMat };
  }

  get liveCrate(): Crate {
    return this.crates[this.activeIdx];
  }

  private syncLive(): void {
    this.crates.forEach((c, i) => {
      c.glow.opacity = i === this.activeIdx ? 0.85 : 0;
    });
  }

  private promptFor(c: Crate): { text: string; holdSec: number; enabled: boolean; sub?: string } | null {
    if (c !== this.liveCrate) {
      return c.toy.visible ? { text: 'THE CRATE IS COLD', holdSec: 0, enabled: false, sub: 'a toy diver sits where the stock was' } : null;
    }
    const cost = TUNING.economy.boxCost;
    if (this.state === 'spinning') return { text: 'REQUISITION PENDING…', holdSec: 0, enabled: false };
    if (this.state === 'offering' && this.offered) {
      return { text: `TAKE ${weaponDef(this.offered).name}`, holdSec: 0, enabled: true, sub: `${Math.ceil(TUNING.box.takeSec - this.t)}s before it sinks back` };
    }
    const afford = this.points.canAfford(cost);
    return { text: `REQUISITION ROULETTE · ${cost}`, holdSec: 0, enabled: afford, sub: afford ? 'one pull per man per bell' : `NEED ${cost}` };
  }

  private executeAt(c: Crate): void {
    if (c !== this.liveCrate) return;
    if (this.state === 'offering' && this.offered) {
      this.weapons.give(this.offered);
      this.toast(`${weaponDef(this.offered).name} — SIGNED FOR`);
      this.offered = null;
      this.finishSpin();
      return;
    }
    if (this.state !== 'idle' || !this.points.spend(TUNING.economy.boxCost)) return;
    this.state = 'spinning';
    this.t = 0;
    this.cycleT = 0;
    this.spinsAtSpot++;
    c.card.visible = true;
    c.lid.position.y = 1.25; // lid lifts
  }

  private rollGun(): GunId {
    const pool: { id: GunId; w: number }[] = [
      ...WALL_GUNS.map((id) => ({ id, w: 1 })),
      ...BOX_GUNS.map((id) => ({ id, w: TUNING.box.boxGunWeight })),
    ];
    let total = 0;
    for (const p of pool) total += p.w;
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.w;
      if (r <= 0) return p.id;
    }
    return pool[pool.length - 1].id;
  }

  private finishSpin(): void {
    const c = this.liveCrate;
    this.state = 'idle';
    c.card.visible = false;
    c.card.position.y = 0.9;
    c.lid.position.y = 0.98;
  }

  /** The tease: the pull is a toy diver; the fee comes back; the crate goes
   *  cold and another wakes. */
  private moveOut(): void {
    const c = this.liveCrate;
    this.points.award(TUNING.economy.boxCost); // the site refunds the ritual
    this.toast('A WIND-UP TOY DIVER — THE CRATE GOES COLD');
    c.toy.visible = true;
    this.finishSpin();
    const others = this.crates.map((_, i) => i).filter((i) => i !== this.activeIdx);
    this.activeIdx = others[Math.floor(Math.random() * others.length)];
    this.spinsAtSpot = 0;
    this.liveCrate.toy.visible = false; // the new crate is stocked again
    this.syncLive();
  }

  update(dt: number, time: number): void {
    const c = this.liveCrate;
    if (this.state === 'spinning') {
      this.t += dt;
      this.cycleT -= dt;
      c.card.position.y = 0.9 + Math.min(0.5, this.t * 0.4);
      if (this.cycleT <= 0) {
        // the requisition flickers through the stock list
        this.cycleT = 0.16;
        const all = [...WALL_GUNS, ...BOX_GUNS];
        this.setCard(weaponDef(all[Math.floor(Math.random() * all.length)]).name);
      }
      if (this.t >= TUNING.box.spinSec) {
        const B = TUNING.box;
        const tease =
          this.forceMoveNext ||
          (this.spinsAtSpot > B.moveFreeSpins && (Math.random() < B.moveChance || this.spinsAtSpot >= B.moveGuaranteedSpin));
        this.forceMoveNext = false;
        if (tease) {
          this.moveOut();
        } else {
          this.state = 'offering';
          this.t = 0;
          this.offered = this.rollGun();
          this.setCard(weaponDef(this.offered).name);
        }
      }
    } else if (this.state === 'offering') {
      this.t += dt;
      c.card.position.y = 1.4 + 0.04 * Math.sin(time * 2);
      if (this.t >= TUNING.box.takeSec) {
        // unclaimed: the requisition sinks back into stores
        this.toast('THE REQUISITION LAPSED');
        this.offered = null;
        this.finishSpin();
      }
    }
  }

  private setCard(text: string): void {
    const c = this.liveCrate;
    c.cardMat.map?.dispose();
    c.cardMat.map = cardTexture(text);
    c.cardMat.needsUpdate = true;
  }
}
