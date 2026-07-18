import { afterEach, describe, expect, it } from 'vitest';
import { TiltSystem, buildTiltRegions } from './tilt';
import { SETTINGS } from '../ui/settings';
import { TUNING } from '../tuning';

afterEach(() => {
  SETTINGS.maxTiltDeg = 180;
});

function run(t: TiltSystem, seconds: number, ref: string | null, relevel = false, t0 = 0): number {
  const dt = 1 / 30;
  for (let time = t0; time < t0 + seconds; time += dt) t.update(dt, ref, relevel, time);
  return t.rollDeg;
}

describe('tilt regions from edge data', () => {
  it('maps tilt edges and the junction nodes inside tilt runs', () => {
    const r = buildTiltRegions();
    expect(r.get('throat-rim~throat-mid')).toBe(180); // the bore
    expect(r.get('gal-box~mz-gate')).toBe(90);
    expect(r.get('throat-mid')).toBe(180); // interior node: drift continues through it
    expect(r.get('chim-2')).toBe(180);
    expect(r.has('mz-e')).toBe(false); // junction with a single tilt edge stays calm
    expect(r.has('throat-rim')).toBe(false);
  });
});

describe('tilt drift, decay, re-level (§6.5)', () => {
  const regions = new Map([['bore', 180], ['mild', 30]]);

  it('drifts at the drift rate inside a zone and clamps at the zone max', () => {
    const t = new TiltSystem(regions, 4.7); // fixed phase: deterministic drift
    run(t, 3, 'bore');
    expect(Math.abs(t.rollDeg)).toBeGreaterThan(30); // ~15°/s, steady early sign
    run(t, 120, 'bore', false, 3);
    expect(Math.abs(t.rollDeg)).toBeLessThanOrEqual(180); // clamped at full inversion
    const m = new TiltSystem(regions, 4.7);
    run(m, 120, 'mild');
    expect(Math.abs(m.rollDeg)).toBeLessThanOrEqual(30);
  });

  it('the accessibility cap overrides every zone max', () => {
    SETTINGS.maxTiltDeg = 20;
    const t = new TiltSystem(regions, 4.7);
    run(t, 60, 'bore');
    expect(Math.abs(t.rollDeg)).toBeLessThanOrEqual(20);
    SETTINGS.maxTiltDeg = 0; // full motion-sickness opt-out
    const z = new TiltSystem(regions, 4.7);
    run(z, 10, 'bore');
    expect(z.rollDeg).toBe(0);
  });

  it('decays slowly outside a zone, re-levels fast on X', () => {
    const t = new TiltSystem(regions, 4.7);
    t.rollDeg = 40;
    run(t, 2, null);
    expect(t.rollDeg).toBeCloseTo(40 - TUNING.tilt.decayDegPerSec * 2, 0); // 2°/s: you carry it with you
    t.rollDeg = 90;
    run(t, 1, 'bore', true); // X held wins even inside the zone
    expect(t.rollDeg).toBeCloseTo(90 - TUNING.tilt.relevelDegPerSec, -1);
    run(t, 2, null, true);
    expect(t.rollDeg).toBe(0);
  });
});
