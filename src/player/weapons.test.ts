import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { Weapons } from './weapons';

describe('starter weapon fire/reload (M5)', () => {
  it('firing consumes the mag and respects the fire delay', () => {
    const w = new Weapons();
    w.queueFireForTest();
    expect(w.update(0.016).fire).not.toBeNull();
    expect(w.current.mag).toBe(TUNING.weapons.wristDart.magSize - 1);
    w.queueFireForTest();
    expect(w.update(0.016).fire).toBeNull(); // still in fire delay
    w.queueFireForTest();
    expect(w.update(TUNING.weapons.wristDart.fireDelaySec).fire).not.toBeNull();
  });

  it('reload refills the mag from reserve (Greased Gears halves the wait)', () => {
    const w = new Weapons();
    w.current.mag = 2;
    w.startReload({ reloadMult: 0.5, fireDelayMult: 1 });
    expect(w.reloading).toBe(true);
    w.update(TUNING.weapons.wristDart.reloadSec * 0.5 + 0.01);
    expect(w.current.mag).toBe(TUNING.weapons.wristDart.magSize);
    expect(w.current.reserve).toBe(TUNING.weapons.wristDart.reserveMax - (TUNING.weapons.wristDart.magSize - 2));
  });

  it('dry fire auto-reloads; a fully dry gun stays dry', () => {
    const w = new Weapons();
    w.current.mag = 0;
    w.queueFireForTest();
    expect(w.update(0.016).fire).toBeNull();
    expect(w.reloading).toBe(true);
    const dry = new Weapons();
    dry.current.mag = 0;
    dry.current.reserve = 0;
    dry.queueFireForTest();
    expect(dry.update(0.016).fire).toBeNull();
    expect(dry.reloading).toBe(false);
  });

  it('knife respects its cooldown', () => {
    const w = new Weapons();
    w.queueMelee();
    expect(w.update(0.016).melee).toBe(true);
    w.queueMelee();
    expect(w.update(0.016).melee).toBe(false);
    w.queueMelee();
    expect(w.update(TUNING.weapons.knife.cooldownSec).melee).toBe(true);
  });
});

describe('the arsenal (M6a): slots, buy/replace/refill, switching', () => {
  it('two slots, then buying replaces the current gun (BO1 rule)', () => {
    const w = new Weapons(); // slot 0: wristDart
    w.give('speargun');
    expect(w.slots.length).toBe(2);
    expect(w.current.def.id).toBe('speargun');
    w.give('flechette'); // full → replaces current (speargun)
    expect(w.slots.length).toBe(2);
    expect(w.slots.map((s) => s.def.id).sort()).toEqual(['flechette', 'wristDart']);
  });

  it('Deep Pockets opens a third slot', () => {
    const w = new Weapons();
    w.give('speargun');
    w.maxSlots = 3;
    w.give('harpoon');
    expect(w.slots.length).toBe(3);
  });

  it('buying an owned gun just restocks it', () => {
    const w = new Weapons();
    w.give('speargun');
    w.current.reserve = 3;
    w.give('speargun');
    expect(w.slots.length).toBe(2);
    expect(w.current.reserve).toBe(TUNING.weapons.speargun.reserveMax);
  });

  it('switching changes the live gun and abandons a reload', () => {
    const w = new Weapons();
    w.give('pneuDriver');
    w.current.mag = 1;
    w.startReload();
    expect(w.reloading).toBe(true);
    w.switchTo(0);
    expect(w.reloading).toBe(false);
    expect(w.current.def.id).toBe('wristDart');
  });

  it('auto guns fire on hold; semis need fresh clicks', () => {
    const w = new Weapons();
    w.give('pneuDriver');
    w.update(0.3); // raise-the-gun beat (a fresh gun never fires frame 1)
    w.setFireHeldForTest(true);
    expect(w.update(0.016).fire).not.toBeNull();
    expect(w.update(TUNING.weapons.pneuDriver.fireDelaySec + 0.01).fire).not.toBeNull(); // held → keeps firing
    w.switchTo(0); // wrist dart is semi
    w.update(0.3);
    expect(w.update(0.3).fire).toBeNull(); // held but no fresh click
  });

  it('a new gun replaces the old fire delay with the raise beat (carried-delay bug)', () => {
    const w = new Weapons();
    w.give('speargun');
    w.update(0.3);
    w.queueFireForTest();
    expect(w.update(0.016).fire).not.toBeNull(); // speargun shot → 0.75 s delay pending
    w.give('pneuDriver'); // raise beat (0.25) must REPLACE the 0.75, not extend it
    w.update(0.26);
    w.queueFireForTest();
    expect(w.update(0.016).fire).not.toBeNull();
  });

  it('Second Wind strips to the sidearm', () => {
    const w = new Weapons();
    w.give('speargun');
    w.stripToSidearm();
    expect(w.slots.length).toBe(1);
    expect(w.current.def.id).toBe('wristDart');
    expect(w.current.mag).toBe(TUNING.weapons.wristDart.magSize);
  });

  it('the Line Lance never runs dry (no ammo economy)', () => {
    const w = new Weapons();
    w.give('lineLance');
    w.update(0.3); // raise beat
    w.queueFireForTest();
    const r = w.update(0.016);
    expect(r.fire?.def.stabRangeM).toBe(TUNING.weapons.lineLance.stabRangeM);
    expect(w.current.mag).toBe(Infinity);
  });
});
