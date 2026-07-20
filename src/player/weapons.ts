// Starter weapons (M5): the Wrist Dart (weak dart pistol) and the Dive Knife
// (melee, always available) — DESIGN §10.1. The full arsenal + distinct-feel
// pass is M6; this file owns ammo/cooldown/reload state and input wiring.
// v1 darts are hitscan with a tracer; M6's feel pass owns projectiles.
//
// Bindings (controls rework 2026-07-19 — combat set stays clear of T/X line
// keys): LMB fire · RMB / V knife · R reload. F stays flashlight-only.

import * as THREE from 'three';
import { TUNING } from '../tuning';

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  headshotMult: number;
  magSize: number;
  reserveMax: number;
  fireDelaySec: number;
  reloadSec: number;
  rangeM: number;
}

export function wristDartDef(): WeaponDef {
  const W = TUNING.weapons.wristDart;
  return { id: 'wristDart', name: 'WRIST DART', ...W };
}

export class Weapons {
  def: WeaponDef = wristDartDef();
  mag: number = this.def.magSize;
  reserve: number = this.def.reserveMax;
  reloading = false;
  private reloadT = 0;
  private fireT = 0;
  private meleeT = 0;
  private fireQueued = false;
  private meleeQueued = false;

  /** Wire mouse input. Fires only under pointer lock (the first click just
   *  captures the mouse) and never through the death screen. */
  bindMouse(dom: HTMLElement, allowed: () => boolean): void {
    dom.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== dom || !allowed()) return;
      if (e.button === 0) this.fireQueued = true;
      if (e.button === 2) this.meleeQueued = true;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  queueMelee(): void {
    this.meleeQueued = true;
  }

  /** Tests/harness: queue a shot as if LMB was clicked. */
  queueFireForTest(): void {
    this.fireQueued = true;
  }

  startReload(): void {
    if (this.reloading || this.mag >= this.def.magSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = this.def.reloadSec;
  }

  /** Advance timers; returns which actions trigger THIS frame. */
  update(dt: number): { fire: boolean; melee: boolean } {
    this.fireT = Math.max(0, this.fireT - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(this.def.magSize - this.mag, this.reserve);
        this.mag += take;
        this.reserve -= take;
        this.reloading = false;
      }
    }
    let fire = false;
    if (this.fireQueued) {
      this.fireQueued = false;
      if (!this.reloading && this.fireT <= 0) {
        if (this.mag > 0) {
          this.mag--;
          this.fireT = this.def.fireDelaySec;
          fire = true;
        } else {
          this.startReload(); // dry click auto-reloads if there's reserve
        }
      }
    }
    let melee = false;
    if (this.meleeQueued) {
      this.meleeQueued = false;
      if (this.meleeT <= 0) {
        this.meleeT = TUNING.weapons.knife.cooldownSec;
        melee = true;
      }
    }
    return { fire, melee };
  }
}

/** Short-lived dart tracers — a thin bright line from muzzle to impact. */
export class TracerFx {
  private pool: { line: THREE.Line; mat: THREE.LineBasicMaterial; t: number }[] = [];

  constructor(private scene: THREE.Scene) {}

  spawn(from: THREE.Vector3, to: [number, number, number]): void {
    let slot = this.pool.find((p) => p.t <= 0);
    if (!slot) {
      const mat = new THREE.LineBasicMaterial({ color: 0xd8e8c8, transparent: true, opacity: 0.8 });
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.scene.add(line);
      slot = { line, mat, t: 0 };
      this.pool.push(slot);
    }
    const posAttr = slot.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, from.x, from.y, from.z);
    posAttr.setXYZ(1, to[0], to[1], to[2]);
    posAttr.needsUpdate = true;
    slot.line.visible = true;
    slot.t = 0.12;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.t <= 0) continue;
      p.t -= dt;
      p.mat.opacity = Math.max(0, p.t / 0.12) * 0.8;
      if (p.t <= 0) p.line.visible = false;
    }
  }
}
