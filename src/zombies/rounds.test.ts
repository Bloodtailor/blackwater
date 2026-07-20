import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { caveStirsThreshold, roundCount, roundHp, roundSpeed, RoundSystem } from './rounds';

describe('round curves (DESIGN §8.1/§9)', () => {
  it('spawn counts: 6+4N capped at 60', () => {
    expect(roundCount(1)).toBe(10);
    expect(roundCount(5)).toBe(26);
    expect(roundCount(13)).toBe(58);
    expect(roundCount(14)).toBe(60);
    expect(roundCount(40)).toBe(60);
  });

  it('HP: 150 ×1.12 through 20, ×1.18 after (the wall)', () => {
    expect(roundHp(1)).toBeCloseTo(150);
    expect(roundHp(2)).toBeCloseTo(150 * 1.12);
    expect(roundHp(20)).toBeCloseTo(150 * 1.12 ** 19);
    expect(roundHp(22)).toBeCloseTo(150 * 1.12 ** 19 * 1.18 ** 2);
    // the wall is steeper than the pre-wall curve
    expect(roundHp(26) / roundHp(25)).toBeGreaterThan(roundHp(19) / roundHp(18));
  });

  it('speed: 2.8 +0.12/round capped at 5.5 (player sprint 6.5 — escapable)', () => {
    expect(roundSpeed(1)).toBeCloseTo(2.8);
    expect(roundSpeed(11)).toBeCloseTo(4.0);
    expect(roundSpeed(40)).toBe(5.5);
    expect(roundSpeed(40)).toBeLessThan(TUNING.player.sprintSpeed);
  });

  it('Cave Stirs threshold: max(3, 15%) capped at 10', () => {
    expect(caveStirsThreshold(10)).toBe(3); // 15% of 10 = 1.5 → min 3
    expect(caveStirsThreshold(40)).toBe(6);
    expect(caveStirsThreshold(60)).toBe(9);
    expect(caveStirsThreshold(200)).toBe(10); // cap
  });
});

describe('RoundSystem state machine (DESIGN §9)', () => {
  it('round 1 starts after the first-round grace', () => {
    const r = new RoundSystem();
    expect(r.round).toBe(0);
    const ev = r.update(TUNING.rounds.firstRoundDelaySec + 0.1, 0);
    expect(ev.roundStarted).toBe(1);
    expect(r.phase).toBe('active');
    expect(r.toSpawn).toBe(10);
  });

  it('spawn pacing respects the alive cap and the interval', () => {
    const r = new RoundSystem();
    r.startRound(1);
    expect(r.wantSpawn(0)).toBe(true); // first spawn immediate
    expect(r.wantSpawn(1)).toBe(false); // interval gate
    r.update(TUNING.rounds.spawnEverySec + 0.01, 1);
    expect(r.wantSpawn(TUNING.rounds.aliveCap)).toBe(false); // cap gate
    expect(r.wantSpawn(1)).toBe(true);
    expect(r.toSpawn).toBe(8);
  });

  it('clearing the round opens a 40 s intermission, then the next round', () => {
    const r = new RoundSystem();
    r.startRound(1);
    while (r.wantSpawn(0)) r.update(TUNING.rounds.spawnEverySec, 0);
    expect(r.toSpawn).toBe(0);
    let ev = r.update(0.016, 0); // all dead
    expect(r.phase).toBe('intermission');
    expect(r.intermissionT).toBeCloseTo(TUNING.rounds.intermissionSec, 1);
    ev = r.update(TUNING.rounds.intermissionSec + 0.1, 0);
    expect(ev.roundStarted).toBe(2);
  });

  it('the Cave Stirs: a stalled near-empty round auto-advances after 45 s', () => {
    const r = new RoundSystem();
    r.startRound(1); // total 10, threshold 3
    r.toSpawn = 0; // everything spawned…
    let ev = r.update(0.016, 4); // 4 alive: above threshold — no countdown
    expect(r.caveStirsActive).toBe(false);
    ev = r.update(0.016, 3); // at threshold → countdown starts
    expect(ev.caveStirsStarted).toBe(true);
    expect(r.caveStirsActive).toBe(true);
    // hold the round open (crawler-keeping attempt): countdown expires…
    ev = r.update(TUNING.rounds.caveStirs.countdownSec - 1, 3);
    expect(ev.roundStarted).toBeUndefined();
    ev = r.update(1.1, 3);
    // …and the next round begins REGARDLESS, survivors carried
    expect(ev.roundStarted).toBe(2);
    expect(r.phase).toBe('active');
    expect(r.toSpawn).toBe(roundCount(2));
    // survivors count against the cap: with 3 carried + cap 9, only 6 slots
    let spawns = 0;
    for (let i = 0; i < 50; i++) {
      if (r.wantSpawn(3 + spawns)) spawns++;
      r.update(TUNING.rounds.spawnEverySec, 3 + spawns);
      if (3 + spawns >= TUNING.rounds.aliveCap) break;
    }
    expect(3 + spawns).toBe(TUNING.rounds.aliveCap);
  });

  it('killing the stragglers before the countdown ends cancels it', () => {
    const r = new RoundSystem();
    r.startRound(1);
    r.toSpawn = 0;
    r.update(0.016, 2); // countdown starts
    expect(r.caveStirsActive).toBe(true);
    r.update(0.016, 0); // all recovered → normal intermission
    expect(r.phase).toBe('intermission');
    expect(r.caveStirsActive).toBe(false);
  });

  it('paused freezes timers and spawning (debug / playtest)', () => {
    const r = new RoundSystem();
    r.paused = true;
    expect(r.update(999, 0)).toEqual({});
    expect(r.round).toBe(0);
    expect(r.wantSpawn(0)).toBe(false);
  });
});
