// Shift-clock tests (M14 rewrite — the old intermission/Cave Stirs suite
// died with the mechanics it pinned).

import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { mobCap, roundHp, roundSpeed, ShiftSystem } from './rounds';

const S = TUNING.shifts;

describe('the shift clock (DESIGN §9: pure time)', () => {
  it('shift 1 starts after the grace, then shifts advance on shiftSec alone', () => {
    const sys = new ShiftSystem();
    expect(sys.shift).toBe(0);
    let ev = sys.update(S.firstShiftDelaySec + 0.01);
    expect(ev.roundStarted).toBe(1);
    // half a shift: nothing
    ev = sys.update(S.shiftSec / 2);
    expect(ev.roundStarted).toBeUndefined();
    // the rest: the bell
    ev = sys.update(S.shiftSec / 2 + 0.01);
    expect(ev.roundStarted).toBe(2);
  });

  it('kills and alive counts are irrelevant — the clock never consults them', () => {
    const sys = new ShiftSystem();
    sys.update(S.firstShiftDelaySec + 0.01);
    // a packed cave and zero kills: the bells keep coming regardless
    let bells = 0;
    for (let t = 0; t < S.shiftSec * 3; t += 1) {
      if (sys.update(1).roundStarted) bells++;
    }
    expect(bells).toBe(3);
  });

  it('startRound jumps (the hatch tolls +5) and restarts the clock whole', () => {
    const sys = new ShiftSystem();
    sys.update(S.firstShiftDelaySec + 0.01);
    const ev = sys.startRound(sys.shift + 5);
    expect(ev.roundStarted).toBe(6);
    expect(sys.shiftT).toBe(S.shiftSec);
  });

  it('paused freezes the clock and the spawner', () => {
    const sys = new ShiftSystem();
    sys.update(S.firstShiftDelaySec + 0.01);
    sys.paused = true;
    expect(sys.update(999).roundStarted).toBeUndefined();
    expect(sys.wantSpawnPack(0)).toBe(0);
  });
});

describe('the population (mob cap + packs)', () => {
  it('mob cap grows with the shift and respects the hard cap', () => {
    expect(mobCap(0)).toBe(0);
    expect(mobCap(1)).toBe(Math.floor(S.capBase + S.capPerShift));
    expect(mobCap(999)).toBe(S.hardCap);
    for (let s = 1; s < 40; s++) expect(mobCap(s + 1)).toBeGreaterThanOrEqual(mobCap(s));
  });

  it('packs are 1..packMax, never exceed remaining room, and pace themselves', () => {
    const sys = new ShiftSystem();
    sys.update(S.firstShiftDelaySec + 0.01);
    sys.startRound(10); // plenty of cap
    const cap = mobCap(10);
    for (let i = 0; i < 60; i++) {
      sys.update(S.spawnCooldownSec + 0.01);
      const pack = sys.wantSpawnPack(0);
      expect(pack).toBeGreaterThanOrEqual(1);
      expect(pack).toBeLessThanOrEqual(S.packMax);
      // immediately after a grant, the cooldown blocks the next
      expect(sys.wantSpawnPack(0)).toBe(0);
    }
    // near the cap, the pack shrinks to the room left (re-pin the shift —
    // the loop's updates advanced the clock past 10)
    sys.startRound(10);
    sys.update(S.spawnCooldownSec + 0.01);
    expect(sys.wantSpawnPack(cap - 1)).toBe(1);
    sys.update(S.spawnCooldownSec + 0.01);
    expect(sys.wantSpawnPack(cap)).toBe(0);
  });

  it('HP/speed curves stand (the wall past lateRound included)', () => {
    expect(roundHp(1)).toBe(TUNING.zombies.baseHp);
    expect(roundHp(21) / roundHp(20)).toBeCloseTo(TUNING.zombies.hpGrowthLate);
    expect(roundSpeed(99)).toBe(TUNING.zombies.speedCap);
  });
});
