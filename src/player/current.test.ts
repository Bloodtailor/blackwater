import { describe, expect, it } from 'vitest';
import { currentDepthFactor, sampleCurrent } from './current';
import { TUNING } from '../tuning';

const D = TUNING.player.currentDepth;

describe('current depth bands (user spec 2026-07-18)', () => {
  it('holds the tuned factor in the heart of each band', () => {
    expect(currentDepthFactor(-5)).toBeCloseTo(D.shallowFactor, 2); // 0–50 m
    expect(currentDepthFactor(-75)).toBeCloseTo(D.midFactor, 2); // 50–100 m
    expect(currentDepthFactor(-120)).toBeCloseTo(D.deepFactor, 2); // 100 m+
  });

  it('blends softly across each boundary (monotonic, no step)', () => {
    let prev = currentDepthFactor(-30);
    for (let d = 30; d <= 130; d += 1) {
      const f = currentDepthFactor(-d);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9); // rises smoothly
      expect(Math.abs(f - prev)).toBeLessThan(0.08); // no jump per metre
      prev = f;
    }
  });

  it('scales the sampled current magnitude', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    let magShallow = 0;
    let magDeep = 0;
    for (let i = 0; i < 40; i++) {
      sampleCurrent(i * 7, -10, i * 3, 5, a);
      sampleCurrent(i * 7, -120, i * 3, 5, b);
      magShallow += Math.hypot(a.x, a.y, a.z);
      magDeep += Math.hypot(b.x, b.y, b.z);
    }
    expect(magDeep / magShallow).toBeGreaterThan(1.5); // ≈ deep/shallow ratio
  });
});
