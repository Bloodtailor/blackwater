import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { Weapons } from './weapons';

describe('starter weapons (DESIGN §10.1)', () => {
  it('firing consumes the mag and respects the fire delay', () => {
    const w = new Weapons();
    w.queueFireForTest();
    expect(w.update(0.016).fire).toBe(true);
    expect(w.mag).toBe(TUNING.weapons.wristDart.magSize - 1);
    w.queueFireForTest();
    expect(w.update(0.016).fire).toBe(false); // still in fire delay
    w.queueFireForTest();
    expect(w.update(TUNING.weapons.wristDart.fireDelaySec).fire).toBe(true);
  });

  it('reload refills the mag from reserve', () => {
    const w = new Weapons();
    w.mag = 2;
    w.startReload();
    expect(w.reloading).toBe(true);
    w.update(TUNING.weapons.wristDart.reloadSec + 0.01);
    expect(w.mag).toBe(TUNING.weapons.wristDart.magSize);
    expect(w.reserve).toBe(TUNING.weapons.wristDart.reserveMax - (TUNING.weapons.wristDart.magSize - 2));
  });

  it('dry fire auto-reloads; a fully dry gun stays dry', () => {
    const w = new Weapons();
    w.mag = 0;
    w.queueFireForTest();
    expect(w.update(0.016).fire).toBe(false);
    expect(w.reloading).toBe(true);
    const dry = new Weapons();
    dry.mag = 0;
    dry.reserve = 0;
    dry.queueFireForTest();
    expect(dry.update(0.016).fire).toBe(false);
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
