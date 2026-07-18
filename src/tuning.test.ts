import { describe, expect, it } from 'vitest';
import { TUNING } from './tuning';

describe('tuning invariants', () => {
  it('sprint is faster than base swim', () => {
    expect(TUNING.player.sprintSpeed).toBeGreaterThan(TUNING.player.swimSpeed);
  });

  it('zombie speed cap stays below player sprint (always escapable, for air)', () => {
    expect(TUNING.zombies.speedCap).toBeLessThan(TUNING.player.sprintSpeed);
  });

  it('air refills much faster than it drains', () => {
    expect(TUNING.air.refillPerSec).toBeGreaterThan(TUNING.air.drainPerSec * 10);
  });
});
