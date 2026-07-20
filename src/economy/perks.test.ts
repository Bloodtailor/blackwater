import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { ALL_PERKS, PERK_INFO, Perks } from './perks';

describe('draughts (DESIGN §10.5)', () => {
  it('nine perks exist at the DESIGN prices', () => {
    expect(ALL_PERKS.length).toBe(9);
    expect(PERK_INFO.barnacleHide.cost).toBe(2500);
    expect(PERK_INFO.deepPockets.cost).toBe(4000);
    expect(PERK_INFO.secondWind.cost).toBe(1500);
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

describe('affordability simulation (M6a DoD: power by round ~6 is comfortable)', () => {
  // Conservative income model: every zombie killed by body-shot Wrist Darts
  // (10/hit) plus the 60 kill bonus; no headshots, no melee bonus.
  const dartHits = (round: number): number => {
    const Z = TUNING.zombies;
    const hp = Z.baseHp * Z.hpGrowth ** (Math.min(round, Z.lateRound) - 1) * Z.hpGrowthLate ** Math.max(0, round - Z.lateRound);
    return Math.ceil(hp / TUNING.weapons.wristDart.damage);
  };
  const roundIncome = (round: number): number => {
    const count = Math.min(TUNING.rounds.baseCount + TUNING.rounds.perRound * round, TUNING.rounds.countCap);
    return count * (dartHits(round) * TUNING.economy.hit + TUNING.economy.kill);
  };

  it('the power route (door 750 + a gun) clears comfortably by round 3', () => {
    let bank = TUNING.economy.startPoints;
    for (let r = 1; r <= 3; r++) bank += roundIncome(r);
    const powerPath = 750 + TUNING.economy.gunCost.speargun; // main artery + a real gun
    expect(bank).toBeGreaterThan(powerPath * 2); // comfortable, not knife-edge
  });

  it('2–3 perks by rounds 8–10 fits the §4 winning arc', () => {
    let bank = TUNING.economy.startPoints;
    for (let r = 1; r <= 9; r++) bank += roundIncome(r);
    const spent =
      750 + // sink→gal door
      1250 + // gal→maze door
      TUNING.economy.gunCost.pneuDriver +
      PERK_INFO.barnacleHide.cost +
      PERK_INFO.ironLungs.cost +
      PERK_INFO.secondWind.cost;
    expect(bank).toBeGreaterThan(spent);
  });
});
