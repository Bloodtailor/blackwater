import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { BOX_GUNS, papDef, WALL_GUNS, weaponDef, Weapons } from '../player/weapons';

describe('the Bench (DESIGN §10.6)', () => {
  it('×2.5 damage, ×1.5 mag/reserve, renamed, papped flag', () => {
    const base = weaponDef('speargun');
    const p = papDef(base);
    expect(p.damage).toBe(Math.round(base.damage * 2.5));
    expect(p.magSize).toBe(Math.round(base.magSize * 1.5));
    expect(p.reserveMax).toBe(Math.round(base.reserveMax * 1.5));
    expect(p.name).toBe("NEPTUNE'S WRIT");
    expect(p.papped).toBe(true);
    expect(base.papped).toBe(false); // transform never mutates the base
  });

  it('every gun has a rename and a quirk that changes something', () => {
    for (const id of ['wristDart', ...WALL_GUNS, ...BOX_GUNS] as const) {
      const base = weaponDef(id);
      const p = papDef(base);
      expect(p.name).not.toBe(base.name);
      // the quirk moved at least one mechanical field
      const quirked =
        p.pierce !== base.pierce ||
        p.pellets !== base.pellets ||
        p.burst !== base.burst ||
        p.chainCount !== base.chainCount ||
        p.vortexRadiusM !== base.vortexRadiusM ||
        p.stabPierce !== base.stabPierce ||
        p.fireDelaySec !== base.fireDelaySec * 1 && p.fireDelaySec < base.fireDelaySec ||
        p.magSize !== Math.round(base.magSize * TUNING.pap.magMult);
      expect(quirked, `${id} has no quirk`).toBe(true);
    }
  });

  it('papSlot upgrades in place with full ammo; the Line Lance stays bottomless', () => {
    const w = new Weapons();
    w.give('speargun');
    w.update(0.3);
    w.current.mag = 1;
    w.papSlot(w.current);
    expect(w.current.def.papped).toBe(true);
    expect(w.current.mag).toBe(w.current.def.magSize);
    w.give('lineLance');
    w.papSlot(w.current);
    expect(w.current.mag).toBe(Infinity);
  });

  it('Twinfish fires both hands per trigger and one hand on the last spear', () => {
    const w = new Weapons();
    w.give('twinfish');
    w.update(0.3);
    w.queueFireForTest();
    let r = w.update(0.016);
    expect(r.rays).toBe(2);
    expect(w.current.mag).toBe(TUNING.weapons.twinfish.magSize - 2);
    w.current.mag = 1;
    w.queueFireForTest();
    r = w.update(TUNING.weapons.twinfish.fireDelaySec + 0.01);
    expect(r.rays).toBe(1);
    expect(w.current.mag).toBe(0);
  });
});

describe('drops (DESIGN §10.7)', () => {
  it('weights cover all six and pity math holds', () => {
    const W = TUNING.drops.weights;
    expect(Object.keys(W).sort()).toEqual(['batterySurge', 'clearWaters', 'doublePoints', 'instaKill', 'maxAmmo', 'pressureWave']);
    expect(TUNING.drops.pityKills).toBeGreaterThan(1 / TUNING.drops.chance / 2); // pity is a floor, not the norm
    expect(W.pressureWave).toBeLessThan(W.maxAmmo); // the room-clear stays rare
  });
});
