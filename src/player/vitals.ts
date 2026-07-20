// Air, heart rate, health, battery — pure logic, no three dependency
// (unit-testable). Numbers all come from tuning.ts (DESIGN §6.2–§6.4).
//
// Heart rate IS the oxygen clock (user redesign 2026-07-18): drain scales
// with HR; sprint/lunge/damage raise HR with a couple seconds of lag; the
// reserve breath is the flashing-red last tank.

import { TUNING } from '../tuning';
import type { Zone } from '../cave/data';

export interface VitalsEnv {
  headAbove: boolean; // head above a water line (surface or pocket)
  sprinting: boolean;
  moving: boolean;
  zone: Zone;
}

/** The slice of perk effects vitals cares about (economy/perks.ts computes
 *  the full set; defaults = no perks). */
export interface VitalsMods {
  maxHp: number;
  airCap: number;
  drainMult: number;
  sprintDrainMult: number;
}

export class Vitals {
  air: number = TUNING.air.capacity;
  hp: number = TUNING.health.max;
  battery = 1; // 0..1 fraction
  hr: number = TUNING.hr.rest;
  reserve = 0; // 0..1 while the last breath is burning
  inReserve = false;
  flashlightOn = true;
  dead = false;
  /** Perk effects (Barnacle Hide, Iron Lungs, Fin Kick) — main keeps this
   *  pointed at the live Perks.mods. */
  mods: VitalsMods = { maxHp: TUNING.health.max, airCap: TUNING.air.capacity, drainMult: 1, sprintDrainMult: 1 };
  // debug flags
  god = false;
  infiniteAir = false;
  infiniteBattery = false;

  private reserveArmed = true;
  private spike = 0; // transient bpm added to the HR target (lunges, hits)
  private sprintLoad = 0; // 0..1, builds over sustained sprint
  private sinceDamage = Infinity;

  update(dt: number, env: VitalsEnv): void {
    if (this.dead) return;
    const H = TUNING.hr;

    // ── heart rate: target from load, approached with lag ──
    const sprintingNow = env.sprinting && env.moving && !env.headAbove;
    this.sprintLoad = Math.min(1, Math.max(0, this.sprintLoad + (sprintingNow ? dt : -dt) / H.sprintLoadTime));
    this.spike = Math.max(0, this.spike - (this.spike * dt) / H.spikeDecayTau);
    let target = H.rest + (H.sprintTarget - H.rest) * this.sprintLoad + this.spike;
    if (this.inReserve) target = Math.max(target, H.panicTarget);
    target = Math.min(target, H.max);
    const tau = target > this.hr ? H.riseTau : H.fallTau;
    this.hr += ((target - this.hr) * dt) / tau;

    // ── air: two-stage tank, HR-scaled drain (Iron Lungs / Fin Kick mods) ──
    const A = TUNING.air;
    if (env.headAbove) {
      this.air = Math.min(this.mods.airCap, this.air + A.refillPerSec * dt);
      this.inReserve = false;
      if (this.air >= A.reserveRearmAt) this.reserveArmed = true;
    } else if (!this.infiniteAir) {
      if (this.air > 0) {
        const drain =
          A.drainPerSec * (this.hr / H.rest) * A.zoneMult[env.zone] * this.mods.drainMult * (env.sprinting ? this.mods.sprintDrainMult : 1);
        this.air = Math.max(0, this.air - drain * dt);
        if (this.air <= 0 && this.reserveArmed) {
          this.inReserve = true;
          this.reserveArmed = false;
          this.reserve = 1;
        }
      } else if (this.inReserve) {
        this.reserve -= dt / A.reserveSeconds;
        if (this.reserve <= 0) {
          this.reserve = 0;
          this.inReserve = false;
        }
      } else {
        this.damage(A.drownHpPerSec * dt, false);
      }
    }

    // ── battery ──
    if (this.flashlightOn && !this.infiniteBattery) {
      this.battery = Math.max(0, this.battery - dt / TUNING.light.batterySeconds);
      if (this.battery <= 0) this.flashlightOn = false;
    }

    // ── health regen (to the perk-modified max) ──
    this.sinceDamage += dt;
    if (this.hp < this.mods.maxHp && this.sinceDamage >= TUNING.health.regenDelay) {
      this.hp = Math.min(this.mods.maxHp, this.hp + (this.mods.maxHp / TUNING.health.regenDuration) * dt);
    }
  }

  onLunge(): void {
    this.spike = Math.min(this.spike + TUNING.hr.lungeSpike, TUNING.hr.spikeCap);
  }

  /** A Drowned grab: 35 HP, the regulator rip (−8 air), HR spike (§6.2). */
  grabbed(): void {
    if (this.god || this.dead) return;
    if (!this.infiniteAir) this.air = Math.max(0, this.air - TUNING.air.grabLoss);
    this.damage(TUNING.health.grabDamage);
  }

  damage(amount: number, hrSpike = true): void {
    if (this.god || this.dead) return;
    this.hp -= amount;
    this.sinceDamage = 0;
    if (hrSpike) this.spike = Math.min(this.spike + TUNING.hr.damageSpike, TUNING.hr.spikeCap);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  get lowAir(): boolean {
    return this.air <= TUNING.air.lowThreshold;
  }
}

// Flashlight output as a fraction of full intensity. Pure — testable.
export function lightFactor(battery: number, rand: number): number {
  const L = TUNING.light;
  if (battery <= 0) return 0;
  if (battery >= L.dimBelow) return 1;
  if (battery >= L.flickerBelow) {
    const t = (battery - L.flickerBelow) / (L.dimBelow - L.flickerBelow);
    return 0.45 + 0.55 * t;
  }
  return rand < 0.75 ? 0.35 : 0.08; // flicker: mostly weak-on, stutters off
}
