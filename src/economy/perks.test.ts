import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { ALL_PERKS, Perks } from './perks';

describe('draughts (DESIGN §10.5; M13: found flasks — costs are dead)', () => {
  it('nine perks exist', () => {
    expect(ALL_PERKS.length).toBe(9);
  });

  it('four is the ration: the 5th perk is refused', () => {
    const p = new Perks();
    expect(p.buy('barnacleHide')).toBe('ok');
    expect(p.buy('ironLungs')).toBe('ok');
    expect(p.buy('finKick')).toBe('ok');
    expect(p.buy('steadyHands')).toBe('ok');
    expect(p.buy('catEyes')).toBe('capped');
    expect(p.buy('barnacleHide')).toBe('owned');
    expect(p.owned.size).toBe(TUNING.perks.cap);
  });

  it('mods reflect owned perks and reset on clear', () => {
    const p = new Perks();
    expect(p.mods.maxHp).toBe(TUNING.health.max);
    expect(p.mods.slots).toBe(2);
    p.buy('barnacleHide');
    p.buy('ironLungs');
    p.buy('deepPockets');
    expect(p.mods.maxHp).toBe(TUNING.perks.barnacleHide.maxHp);
    expect(p.mods.airCap).toBe(TUNING.perks.ironLungs.airCap);
    expect(p.mods.drainMult).toBeCloseTo(TUNING.perks.ironLungs.drainMult);
    expect(p.mods.slots).toBe(3);
    p.clear();
    expect(p.mods.maxHp).toBe(TUNING.health.max);
  });

  it('Second Wind consumes and is re-buyable', () => {
    const p = new Perks();
    p.buy('secondWind');
    expect(p.owned.has('secondWind')).toBe(true);
    p.consumeSecondWind();
    expect(p.owned.has('secondWind')).toBe(false);
    expect(p.buy('secondWind')).toBe('ok'); // re-buyable after use
  });
});

// The M6a affordability sims lived here until M13 deleted the points economy —
// their successor is economy/availability.test.ts (zero-kill reachability).
