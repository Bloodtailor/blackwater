import { describe, expect, it } from 'vitest';
import { lightFactor, Vitals, type VitalsEnv } from './vitals';
import { TUNING } from '../tuning';

const under: VitalsEnv = { headAbove: false, sprinting: false, moving: false, zone: 'galleries' };
const sprintU: VitalsEnv = { ...under, sprinting: true, moving: true };
const surface: VitalsEnv = { ...under, headAbove: true };

function tick(v: Vitals, env: VitalsEnv, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) v.update(dt, env);
}

describe('heart rate', () => {
  it('rests at 60 and climbs slowly under sustained sprint (with lag)', () => {
    const v = new Vitals();
    expect(v.hr).toBe(TUNING.hr.rest);
    tick(v, sprintU, 2);
    expect(v.hr).toBeLessThan(100); // lag: nowhere near target yet
    tick(v, sprintU, 20);
    expect(v.hr).toBeGreaterThan(125); // sustained sprint approaches target
    tick(v, under, 30);
    expect(v.hr).toBeLessThan(80); // recovers, slower than the rise
  });

  it('damage and lunges spike HR with a delay of a couple seconds', () => {
    const v = new Vitals();
    v.damage(10);
    const immediately = v.hr;
    expect(immediately).toBeLessThan(70); // not instant
    tick(v, under, 2.5);
    expect(v.hr).toBeGreaterThan(72); // reflected a beat or two later
    const l = new Vitals();
    l.onLunge();
    tick(l, under, 2.5);
    expect(l.hr).toBeGreaterThan(68);
  });

  it('higher HR burns oxygen faster', () => {
    const calm = new Vitals();
    tick(calm, under, 20);
    const worked = new Vitals();
    worked.hr = 150; // pinned high at start; drifts down but stays elevated
    tick(worked, under, 20);
    expect(worked.air).toBeLessThan(calm.air - 8);
  });
});

describe('air & the reserve breath', () => {
  it('tank empties into a flashing reserve that burns fast, then drowning', () => {
    const v = new Vitals();
    v.air = 0.5;
    tick(v, under, 1);
    expect(v.inReserve).toBe(true);
    expect(v.reserve).toBeGreaterThan(0.8);
    expect(v.hp).toBe(TUNING.health.max); // reserve protects you
    tick(v, under, TUNING.air.reserveSeconds + 0.5);
    expect(v.inReserve).toBe(false);
    tick(v, under, 2);
    expect(v.hp).toBeLessThan(TUNING.health.max); // now you drown
  });

  it('reserve pins heart rate near panic', () => {
    const v = new Vitals();
    v.air = 0.1;
    tick(v, under, 5);
    expect(v.inReserve).toBe(true);
    expect(v.hr).toBeGreaterThan(120);
  });

  it('reserve re-arms only after refilling past the threshold', () => {
    const v = new Vitals();
    v.air = 0.5;
    tick(v, under, 1.5);
    expect(v.inReserve).toBe(true);
    tick(v, surface, 1); // breathe: exits reserve, air ~25 (< rearm 50)
    expect(v.inReserve).toBe(false);
    v.air = 0.1; // dip again before reaching the re-arm threshold
    tick(v, under, 2);
    expect(v.inReserve).toBe(false); // no second reserve
    tick(v, surface, 3); // refill past 50
    v.air = 0.1;
    tick(v, under, 2);
    expect(v.inReserve).toBe(true); // re-armed
  });

  it('surfacing refills at 25/s', () => {
    const v = new Vitals();
    v.air = 40;
    tick(v, surface, 2);
    expect(v.air).toBeCloseTo(90, 0);
  });
});

describe('health & battery', () => {
  it('health regens after the delay, not before', () => {
    const v = new Vitals();
    v.damage(40);
    tick(v, surface, TUNING.health.regenDelay - 1);
    expect(v.hp).toBeCloseTo(60, 0);
    tick(v, surface, TUNING.health.regenDuration + TUNING.health.regenDelay);
    expect(v.hp).toBe(TUNING.health.max);
  });

  it('god mode prevents drowning death', () => {
    const g = new Vitals();
    g.god = true;
    g.air = 0;
    tick(g, under, 30);
    expect(g.dead).toBe(false);
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
