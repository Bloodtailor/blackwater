// Air, health, battery — pure logic, no three dependency (unit-testable).
// Numbers all come from tuning.ts (DESIGN §6.2–§6.4).

import { TUNING } from '../tuning';
import type { Zone } from '../cave/data';

export interface VitalsEnv {
  headAbove: boolean; // head above a water line (surface or pocket)
  sprinting: boolean;
  moving: boolean;
  zone: Zone;
}

export class Vitals {
  air: number = TUNING.air.capacity;
  hp: number = TUNING.health.max;
  battery = 1; // 0..1 fraction
  flashlightOn = true;
  dead = false;
  // debug flags
  god = false;
  infiniteAir = false;
  infiniteBattery = false;

  private sinceDamage = Infinity;

  update(dt: number, env: VitalsEnv): void {
    if (this.dead) return;
    // air
    if (env.headAbove) {
      this.air = Math.min(TUNING.air.capacity, this.air + TUNING.air.refillPerSec * dt);
    } else if (!this.infiniteAir) {
      const mult = (env.sprinting && env.moving ? TUNING.air.sprintMult : 1) * TUNING.air.zoneMult[env.zone];
      this.air = Math.max(0, this.air - TUNING.air.drainPerSec * mult * dt);
      if (this.air <= 0) this.damage(TUNING.air.drownHpPerSec * dt);
    }
    // battery
    if (this.flashlightOn && !this.infiniteBattery) {
      this.battery = Math.max(0, this.battery - dt / TUNING.light.batterySeconds);
      if (this.battery <= 0) this.flashlightOn = false;
    }
    // regen
    this.sinceDamage += dt;
    if (this.hp < TUNING.health.max && this.sinceDamage >= TUNING.health.regenDelay) {
      this.hp = Math.min(TUNING.health.max, this.hp + (TUNING.health.max / TUNING.health.regenDuration) * dt);
    }
  }

  damage(amount: number): void {
    if (this.god || this.dead) return;
    this.hp -= amount;
    this.sinceDamage = 0;
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
// Full above dimBelow; linear dim to 45% down to flickerBelow; below that it
// flickers (caller passes a random sample per frame).
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
