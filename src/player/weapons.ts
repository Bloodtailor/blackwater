// The arsenal (DESIGN §10.1, M6a): slot-based weapons with the five wall guns,
// each mechanically distinct — single (speargun), auto (Pneu-Driver), spread
// (Flechette), pierce (Harpoon), stab (Line Lance). Box guns + PaP are M6b.
// This file owns ammo/cooldown/reload/switch state and input wiring; main
// executes the actual rays via the zombie manager.
//
// Bindings: LMB fire (hold = auto for auto guns) · RMB / V knife · R reload ·
// 1/2/3 + wheel switch. All clear of the T/X line keys (user 2026-07-19).

import * as THREE from 'three';
import { TUNING } from '../tuning';

export type GunId =
  | 'wristDart'
  | 'speargun'
  | 'pneuDriver'
  | 'flechette'
  | 'harpoon'
  | 'lineLance'
  | 'twinfish'
  | 'arcProjector'
  | 'vortexMaw'
  | 'sonicLance'
  | 'bangStick';

export const WALL_GUNS: GunId[] = ['speargun', 'pneuDriver', 'flechette', 'harpoon', 'lineLance'];
export const BOX_GUNS: GunId[] = ['twinfish', 'arcProjector', 'vortexMaw', 'sonicLance', 'bangStick'];

export interface WeaponDef {
  id: GunId;
  name: string;
  damage: number;
  headshotMult: number;
  magSize: number;
  reserveMax: number;
  fireDelaySec: number;
  reloadSec: number;
  rangeM: number;
  auto: boolean;
  pellets: number; // >1 = scatter
  spreadDeg: number;
  pierce: number; // bodies a shot passes through
  burst: number; // rays per trigger (Twinfish: both hands)
  burstSpreadDeg: number;
  /** Arc Projector: chain lightning off the first body hit. */
  chainCount: number;
  chainRadiusM: number;
  chainFalloff: number;
  /** Vortex Maw: drag everything near the impact toward it. */
  vortexRadiusM: number;
  vortexPullSec: number;
  vortexPullSpeed: number;
  /** Stab weapons swing at melee range instead of casting a ray. */
  stabRangeM?: number;
  stabPierce?: number;
  tracer: number; // tracer color
  tracerLifeSec: number; // heavier guns leave longer streaks
  papped: boolean;
}

const GUN_META: Record<GunId, { name: string; tracer: number; life?: number }> = {
  wristDart: { name: 'WRIST DART', tracer: 0xd8e8c8 },
  speargun: { name: 'SPEARGUN', tracer: 0xc8d8e8, life: 0.2 },
  pneuDriver: { name: 'PNEU-DRIVER', tracer: 0xd8e0c0, life: 0.08 },
  flechette: { name: 'FLECHETTE SCATTER', tracer: 0xe8d8b8 },
  harpoon: { name: 'HARPOON RIFLE', tracer: 0xb8d0e0, life: 0.3 },
  lineLance: { name: 'LINE LANCE', tracer: 0xe0e0d0 },
  twinfish: { name: 'TWINFISH', tracer: 0xd0e0d8, life: 0.15 },
  arcProjector: { name: 'ARC PROJECTOR', tracer: 0x9fe8f8, life: 0.25 },
  vortexMaw: { name: 'VORTEX MAW', tracer: 0x8fa8d8, life: 0.3 },
  sonicLance: { name: 'SONIC LANCE', tracer: 0xe8f0f8, life: 0.35 },
  bangStick: { name: 'BANG STICK', tracer: 0xe8d0b0 },
};

// The Bench's renames + per-gun quirks (DESIGN §10.6). Flavor stays inside
// the glossary: 41 is public canon; the count that comes out wrong is not.
const PAP_META: Record<GunId, { name: string; quirk: (d: WeaponDef) => void }> = {
  wristDart: { name: 'THE RECOVERY', quirk: (d) => (d.magSize = 16) },
  speargun: { name: "NEPTUNE'S WRIT", quirk: (d) => (d.pierce = 2) },
  pneuDriver: { name: 'THE COMPLEMENT', quirk: (d) => (d.fireDelaySec *= 0.85) },
  flechette: { name: 'FORTY-ONE PIECES', quirk: (d) => (d.pellets += 2) },
  harpoon: { name: "CORMORANT'S BILL", quirk: (d) => (d.pierce = 5) },
  lineLance: { name: 'THE LONG SHIFT', quirk: (d) => (d.stabPierce = 3) },
  twinfish: { name: 'BOTH HANDS FULL', quirk: (d) => (d.burst = 3) },
  arcProjector: { name: 'CHERENKOV CHOIR', quirk: (d) => (d.chainCount = 6) },
  vortexMaw: { name: 'THE UNDERTOW', quirk: (d) => (d.vortexRadiusM = 14) },
  sonicLance: { name: 'THE ECHO', quirk: (d) => (d.fireDelaySec *= 0.8) },
  bangStick: { name: 'FULL STOP', quirk: (d) => (d.stabPierce = 3) },
};

export function weaponDef(id: GunId): WeaponDef {
  const t = TUNING.weapons[id] as Record<string, number | undefined>;
  const meta = GUN_META[id];
  return {
    id,
    name: meta.name,
    tracer: meta.tracer,
    tracerLifeSec: meta.life ?? 0.12,
    damage: t.damage ?? 0,
    headshotMult: t.headshotMult ?? 1,
    magSize: t.magSize ?? Infinity,
    reserveMax: t.reserveMax ?? 0,
    fireDelaySec: t.fireDelaySec ?? 0.5,
    reloadSec: t.reloadSec ?? 0,
    rangeM: t.rangeM ?? 45,
    auto: id === 'pneuDriver',
    pellets: t.pellets ?? 1,
    spreadDeg: t.spreadDeg ?? 0,
    pierce: t.pierce ?? 1,
    burst: t.burst ?? 1,
    burstSpreadDeg: t.burstSpreadDeg ?? 0,
    chainCount: t.chainCount ?? 0,
    chainRadiusM: t.chainRadiusM ?? 0,
    chainFalloff: t.chainFalloff ?? 1,
    vortexRadiusM: t.vortexRadiusM ?? 0,
    vortexPullSec: t.vortexPullSec ?? 0,
    vortexPullSpeed: t.vortexPullSpeed ?? 0,
    stabRangeM: t.stabRangeM,
    stabPierce: t.stabPierce,
    papped: false,
  };
}

/** The Bench's work (DESIGN §10.6): ×2.5 damage, bigger mag, rename, quirk —
 *  and the universal rule (papped projectiles emit light) keys off `papped`. */
export function papDef(base: WeaponDef): WeaponDef {
  const P = TUNING.pap;
  const d: WeaponDef = { ...base };
  d.name = PAP_META[base.id].name;
  d.damage = Math.round(base.damage * P.damageMult);
  if (Number.isFinite(base.magSize)) d.magSize = Math.round(base.magSize * P.magMult);
  d.reserveMax = Math.round(base.reserveMax * P.reserveMult);
  d.papped = true;
  // papped tracers burn bright toward cherenkov white-cyan
  d.tracer = 0xbafcff;
  d.tracerLifeSec = Math.max(base.tracerLifeSec, 0.25);
  PAP_META[base.id].quirk(d);
  return d;
}

export interface WeaponSlot {
  def: WeaponDef;
  mag: number;
  reserve: number;
}

/** Perk-driven multipliers (Greased Gears, Trigger Fish). */
export interface FireMods {
  reloadMult: number;
  fireDelayMult: number;
}

export class Weapons {
  slots: WeaponSlot[] = [];
  cur = 0;
  maxSlots = 2; // Deep Pockets sets 3
  reloading = false;
  private reloadT = 0;
  private fireT = 0;
  private meleeT = 0;
  private fireQueued = false;
  private meleeQueued = false;
  private fireHeld = false;

  constructor() {
    this.give('wristDart');
    this.fireT = 0; // the starting sidearm is already in hand
  }

  get current(): WeaponSlot {
    return this.slots[this.cur];
  }

  /** Wire mouse input. Fires only under pointer lock (the first click just
   *  captures the mouse) and never through the death screen. */
  bindMouse(dom: HTMLElement, allowed: () => boolean): void {
    dom.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== dom || !allowed()) return;
      if (e.button === 0) {
        this.fireQueued = true;
        this.fireHeld = true;
      }
      if (e.button === 2) this.meleeQueued = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (document.pointerLockElement !== dom || !allowed() || this.slots.length < 2) return;
      this.switchTo((this.cur + (e.deltaY > 0 ? 1 : this.slots.length - 1)) % this.slots.length);
    });
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!allowed()) return;
      if (e.code === 'Digit1') this.switchTo(0);
      else if (e.code === 'Digit2') this.switchTo(1);
      else if (e.code === 'Digit3') this.switchTo(2);
    });
  }

  switchTo(i: number): void {
    if (i === this.cur || i < 0 || i >= this.slots.length) return;
    this.cur = i;
    this.reloading = false; // switching abandons the reload (BO1 rule)
    this.fireT = 0.25; // raise-the-gun beat REPLACES the old gun's delay
  }

  owns(id: GunId): boolean {
    return this.slots.some((s) => s.def.id === id);
  }

  /** Buy/give a gun: fills a free slot or replaces the current one. */
  give(id: GunId): void {
    const slot: WeaponSlot = { def: weaponDef(id), mag: 0, reserve: 0 };
    slot.mag = slot.def.magSize;
    slot.reserve = slot.def.reserveMax;
    const existing = this.slots.findIndex((s) => s.def.id === id);
    if (existing >= 0) {
      this.cur = existing;
      this.refill(id);
      return;
    }
    if (this.slots.length < this.maxSlots) {
      this.slots.push(slot);
      this.cur = this.slots.length - 1;
    } else {
      this.slots[this.cur] = slot;
    }
    this.reloading = false;
    this.fireT = 0.25; // fresh gun, fresh raise beat (no carried delay)
  }

  /** Wall ammo (half gun cost): reserve to max, mag untouched. */
  refill(id: GunId): void {
    const s = this.slots.find((x) => x.def.id === id);
    if (s) s.reserve = s.def.reserveMax;
  }

  /** Max Ammo drop: everything full, papped included. */
  refillAll(): void {
    for (const s of this.slots) {
      if (Number.isFinite(s.def.magSize)) s.mag = s.def.magSize;
      s.reserve = s.def.reserveMax;
    }
  }

  /** The Bench upgrades a slot in place, with full ammo (the slot is pinned
   *  at pay time — switching guns mid-work upgrades the one on the bench). */
  papSlot(s: WeaponSlot): void {
    if (s.def.papped) return;
    s.def = papDef(s.def);
    s.mag = s.def.magSize;
    s.reserve = s.def.reserveMax;
    if (s === this.current) this.reloading = false;
  }

  /** Second Wind wake: sidearm only (DESIGN §10.5). */
  stripToSidearm(): void {
    this.slots = [];
    this.cur = 0;
    this.give('wristDart');
  }

  queueMelee(): void {
    this.meleeQueued = true;
  }

  /** Tests/harness: queue a shot as if LMB was clicked. */
  queueFireForTest(): void {
    this.fireQueued = true;
  }

  setFireHeldForTest(v: boolean): void {
    this.fireHeld = v;
  }

  startReload(mods?: FireMods): void {
    const s = this.current;
    if (this.reloading || s.mag >= s.def.magSize || s.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = s.def.reloadSec * (mods?.reloadMult ?? 1);
  }

  /** Advance timers; returns what triggers THIS frame. `fire` is the slot
   *  that shot (ammo already consumed); `rays` is how many barrels went off
   *  (Twinfish with one spear left fires one hand). */
  update(dt: number, mods: FireMods = { reloadMult: 1, fireDelayMult: 1 }): { fire: WeaponSlot | null; rays: number; melee: boolean } {
    this.fireT = Math.max(0, this.fireT - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    const s = this.current;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const take = Math.min(s.def.magSize - s.mag, s.reserve);
        s.mag += take;
        s.reserve -= take;
        this.reloading = false;
      }
    }
    let fire: WeaponSlot | null = null;
    let rays = 0;
    const wantsFire = this.fireQueued || (this.fireHeld && s.def.auto);
    this.fireQueued = false;
    if (wantsFire && !this.reloading && this.fireT <= 0) {
      if (s.mag > 0) {
        rays = Number.isFinite(s.mag) ? Math.min(s.def.burst, s.mag) : s.def.burst;
        if (Number.isFinite(s.mag)) s.mag -= rays;
        this.fireT = s.def.fireDelaySec * mods.fireDelayMult;
        fire = s;
      } else {
        this.startReload(mods); // dry click auto-reloads if there's reserve
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
    return { fire, rays, melee };
  }
}

/** The universal PaP rule (DESIGN §10.6): papped projectiles EMIT LIGHT.
 *  A small pool of real point lights that flare at impact and die fast. */
export class ImpactGlow {
  private pool: { light: THREE.PointLight; t: number }[] = [];

  constructor(private scene: THREE.Scene) {}

  spawn(pos: [number, number, number]): void {
    const P = TUNING.pap;
    let slot = this.pool.find((p) => p.t <= 0);
    if (!slot) {
      if (this.pool.length >= 3) slot = this.pool[0]; // steal the oldest
      else {
        const light = new THREE.PointLight(0x9ff0ff, 0, P.impactLightRadiusM, 2);
        this.scene.add(light);
        slot = { light, t: 0 };
        this.pool.push(slot);
      }
    }
    slot.light.position.set(pos[0], pos[1], pos[2]);
    slot.t = P.impactLightSec;
  }

  update(dt: number): void {
    const P = TUNING.pap;
    for (const p of this.pool) {
      if (p.t <= 0) continue;
      p.t -= dt;
      p.light.intensity = Math.max(0, p.t / P.impactLightSec) * P.impactLightIntensity;
    }
  }
}

/** Short-lived dart tracers — a thin bright line from muzzle to impact. */
export class TracerFx {
  private pool: { line: THREE.Line; mat: THREE.LineBasicMaterial; t: number; life: number }[] = [];

  constructor(private scene: THREE.Scene) {}

  spawn(from: THREE.Vector3 | [number, number, number], to: [number, number, number], color = 0xd8e8c8, lifeSec = 0.12): void {
    let slot = this.pool.find((p) => p.t <= 0);
    if (!slot) {
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.scene.add(line);
      slot = { line, mat, t: 0, life: 0.12 };
      this.pool.push(slot);
    }
    slot.mat.color.setHex(color);
    const posAttr = slot.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fx = Array.isArray(from) ? from[0] : from.x;
    const fy = Array.isArray(from) ? from[1] : from.y;
    const fz = Array.isArray(from) ? from[2] : from.z;
    posAttr.setXYZ(0, fx, fy, fz);
    posAttr.setXYZ(1, to[0], to[1], to[2]);
    posAttr.needsUpdate = true;
    slot.line.visible = true;
    slot.t = lifeSec;
    slot.life = lifeSec;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.t <= 0) continue;
      p.t -= dt;
      p.mat.opacity = Math.max(0, p.t / p.life) * 0.8;
      if (p.t <= 0) p.line.visible = false;
    }
  }
}
