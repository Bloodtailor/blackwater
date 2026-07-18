import { describe, expect, it } from 'vitest';
import { lightFactor, Vitals, type VitalsEnv } from './vitals';
import { TUNING } from '../tuning';

const under: VitalsEnv = { headAbove: false, sprinting: false, moving: false, zone: 'galleries' };

function tick(v: Vitals, env: VitalsEnv, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) v.update(dt, env);
}

describe('vitals', () => {
  it('air drains at 1/s calm and refills at 25/s', () => {
    const v = new Vitals();
    tick(v, under, 10);
    expect(v.air).toBeCloseTo(90, 0);
    tick(v, { ...under, headAbove: true }, 2);
    expect(v.air).toBeCloseTo(100, 0);
  });

  it('sprint and deep zones drain faster', () => {
    const v = new Vitals();
    tick(v, { ...under, sprinting: true, moving: true, zone: 'abyss' }, 10);
    // 1/s * 1.6 sprint * 1.25 abyss = 2/s
    expect(v.air).toBeCloseTo(80, 0);
  });

  it('drowning damages and can kill; god prevents it', () => {
    const v = new Vitals();
    v.air = 1;
    tick(v, under, 4); // 1 s of air left + 3 s drowning = 45 damage
    expect(v.hp).toBeLessThan(TUNING.health.max);
    expect(v.dead).toBe(false);
    tick(v, under, 6); // 90 more damage — lethal
    expect(v.dead).toBe(true);
    const g = new Vitals();
    g.god = true;
    g.air = 0;
    tick(g, under, 20);
    expect(g.dead).toBe(false);
  });

  it('health regens after the delay, not before', () => {
    const v = new Vitals();
    v.damage(40);
    tick(v, under, TUNING.health.regenDelay - 1);
    expect(v.hp).toBeCloseTo(60, 0);
    tick(v, under, TUNING.health.regenDuration + TUNING.health.regenDelay);
    expect(v.hp).toBe(TUNING.health.max);
  });

  it('battery drains only while on and dims per curve', () => {
    const v = new Vitals();
    v.flashlightOn = false;
    tick(v, under, 10);
    expect(v.battery).toBe(1);
    expect(lightFactor(1, 0)).toBe(1);
    expect(lightFactor(0.35, 0)).toBeGreaterThan(0.45);
    expect(lightFactor(0.35, 0)).toBeLessThan(1);
    expect(lightFactor(0.1, 0.9)).toBeLessThan(0.2);
    expect(lightFactor(0, 0)).toBe(0);
  });
});
