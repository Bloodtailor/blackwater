// Drops (DESIGN §10.7): ~2% per kill + a pity timer. Max Ammo · Double
// Points (60 s) · Insta-Kill (30 s) · Clear Waters (silt settles instantly,
// mounds re-arm, slight vis boost) · Battery Surge · Pressure Wave (kill all
// alive, rare). Floating pickups at the corpse; effects run on timers here;
// main reads the flags (instaKill damage, clearWaters vis).

import * as THREE from 'three';
import { TUNING } from '../tuning';

export type DropId = 'maxAmmo' | 'doublePoints' | 'instaKill' | 'clearWaters' | 'batterySurge' | 'pressureWave';

export interface DropCtx {
  scene: THREE.Scene;
  toast: (m: string) => void;
  applyMaxAmmo: () => void;
  applyBatterySurge: () => void;
  applyPressureWave: () => void;
  applyClearWaters: () => void; // the instant settle + re-arm
  setPointsMultiplier: (m: number) => void;
}

const DROP_LOOK: Record<DropId, { label: string; color: string }> = {
  maxAmmo: { label: 'AMMO', color: '#ffe9a8' },
  doublePoints: { label: '×2', color: '#7ce8a9' },
  instaKill: { label: '☠', color: '#ff7a5c' },
  clearWaters: { label: 'CLEAR', color: '#9fe8f8' },
  batterySurge: { label: 'CELL', color: '#b8d477' },
  pressureWave: { label: 'WAVE', color: '#d89ff8' },
};

function dropTexture(id: DropId): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = DROP_LOOK[id].color;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 112, 112);
  g.fillStyle = DROP_LOOK[id].color;
  g.textAlign = 'center';
  g.font = 'bold 34px Consolas, monospace';
  g.fillText(DROP_LOOK[id].label, 64, 76, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface WorldDrop {
  id: DropId;
  sprite: THREE.Sprite;
  t: number;
  baseY: number;
}

export class Drops {
  private world: WorldDrop[] = [];
  private killsSinceDrop = 0;
  private textures = new Map<DropId, THREE.CanvasTexture>();
  /** Active effect timers (seconds left). */
  readonly timers = { doublePoints: 0, instaKill: 0, clearWaters: 0 };

  constructor(private ctx: DropCtx) {}

  get instaKill(): boolean {
    return this.timers.instaKill > 0;
  }

  get clearWaters(): boolean {
    return this.timers.clearWaters > 0;
  }

  /** A zombie died at `pos` — maybe the site sheds a requisition. */
  onKill(pos: THREE.Vector3): void {
    this.killsSinceDrop++;
    const D = TUNING.drops;
    if (Math.random() < D.chance || this.killsSinceDrop >= D.pityKills) {
      this.spawn(this.roll(), pos);
      this.killsSinceDrop = 0;
    }
  }

  roll(): DropId {
    const W = TUNING.drops.weights;
    const ids = Object.keys(W) as DropId[];
    let total = 0;
    for (const id of ids) total += W[id];
    let r = Math.random() * total;
    for (const id of ids) {
      r -= W[id];
      if (r <= 0) return id;
    }
    return ids[0];
  }

  spawn(id: DropId, pos: THREE.Vector3): void {
    let tex = this.textures.get(id);
    if (!tex) {
      tex = dropTexture(id);
      this.textures.set(id, tex);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.setScalar(0.55);
    sprite.position.copy(pos);
    this.ctx.scene.add(sprite);
    this.world.push({ id, sprite, t: 0, baseY: pos.y });
  }

  private apply(id: DropId): void {
    const D = TUNING.drops;
    switch (id) {
      case 'maxAmmo':
        this.ctx.applyMaxAmmo();
        this.ctx.toast('MAX AMMO — THE LOCKERS PROVIDE');
        break;
      case 'doublePoints':
        this.timers.doublePoints = D.doublePointsSec;
        this.ctx.setPointsMultiplier(2);
        this.ctx.toast('DOUBLE POINTS');
        break;
      case 'instaKill':
        this.timers.instaKill = D.instaKillSec;
        this.ctx.toast('INSTA-KILL');
        break;
      case 'clearWaters':
        this.timers.clearWaters = D.clearWatersSec;
        this.ctx.applyClearWaters();
        this.ctx.toast('CLEAR WATERS — THE SILT LIES DOWN');
        break;
      case 'batterySurge':
        this.ctx.applyBatterySurge();
        this.ctx.toast('BATTERY SURGE');
        break;
      case 'pressureWave':
        this.ctx.applyPressureWave();
        this.ctx.toast('PRESSURE WAVE');
        break;
    }
  }

  /** Debug: apply immediately, no pickup swim. */
  force(id: DropId): void {
    this.apply(id);
  }

  update(dt: number, playerPos: THREE.Vector3, time: number): void {
    const D = TUNING.drops;
    // pickups
    for (let i = this.world.length - 1; i >= 0; i--) {
      const w = this.world[i];
      w.t += dt;
      w.sprite.position.y = w.baseY + 0.12 * Math.sin(time * 2 + i);
      const lifeLeft = D.despawnSec - w.t;
      if (lifeLeft < 8) w.sprite.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(time * 5)); // blink out
      if (w.sprite.position.distanceTo(playerPos) <= D.pickupRadiusM) {
        this.apply(w.id);
        this.remove(i);
        continue;
      }
      if (w.t >= D.despawnSec) this.remove(i);
    }
    // effect timers
    if (this.timers.doublePoints > 0) {
      this.timers.doublePoints -= dt;
      if (this.timers.doublePoints <= 0) this.ctx.setPointsMultiplier(1);
    }
    if (this.timers.instaKill > 0) this.timers.instaKill -= dt;
    if (this.timers.clearWaters > 0) this.timers.clearWaters -= dt;
  }

  private remove(i: number): void {
    const w = this.world[i];
    this.ctx.scene.remove(w.sprite);
    w.sprite.material.dispose();
    this.world.splice(i, 1);
  }
}
