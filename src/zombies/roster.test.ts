// M14.5 (DESIGN §8.6) — the crew book's invariants:
//  • 41 men, unique names, the T6 canon rows exactly as the tape reads them
//  • determinism: the same book every build (same seed → same man)
//  • one-of-each: the watch bill can never put two of one man in the water
//  • drop consistency: a carrier always maps to a real drop (always drops)
//  • watch-bill balance: carriers walk fewer watches; overrides respected

import { describe, expect, it } from 'vitest';
import { TUNING } from '../tuning';
import { buildCrew, CARRY_DROP, CREW, mulberry32, Roster } from './roster';

describe('the crew book', () => {
  it('holds exactly 41 men with unique names (the Lamp Man holds no row)', () => {
    expect(CREW.length).toBe(41);
    expect(new Set(CREW.map((p) => p.name)).size).toBe(41);
    // void #9 discipline: no row may ever be the Lamp Man
    expect(CREW.some((p) => p.name.toLowerCase().includes('lamp man'))).toBe(false);
  });

  it('matches the T6 duty-roster read verbatim (LORE §5)', () => {
    const first = CREW.slice(0, 6).map((p) => `${p.name}, ${p.role}`);
    expect(first).toEqual([
      'Albrecht, forward watch',
      'Ames, galley',
      'Barrow, lamps',
      'Bell, stores',
      'Calloway, drill',
      'Carver, drill',
    ]);
    expect(CREW[6].name).toBe('Deem'); // the tape cuts off mid-name
  });

  it('is deterministic — the same book every build', () => {
    expect(buildCrew()).toEqual(buildCrew());
    // and the PRNG itself repeats
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('keeps every man inside the stat variance band', () => {
    const v = TUNING.roster.statVariance;
    for (const p of CREW) {
      expect(p.speedMult).toBeGreaterThanOrEqual(1 - v);
      expect(p.speedMult).toBeLessThanOrEqual(1 + v);
      expect(p.hpMult).toBeGreaterThanOrEqual(1 - v);
      expect(p.hpMult).toBeLessThanOrEqual(1 + v);
      expect(p.voice.rate).toBeGreaterThanOrEqual(TUNING.roster.voiceRateMin);
      expect(p.voice.rate).toBeLessThanOrEqual(TUNING.roster.voiceRateMax);
      expect([1, 2, 3]).toContain(p.voice.sample);
    }
  });

  it('carries per canon: Barrow the dry-cell, Bell the ammo, the pile watch the slug', () => {
    expect(CREW.find((p) => p.name === 'Barrow')?.carry).toBe('dryCell');
    expect(CREW.find((p) => p.name === 'Bell')?.carry).toBe('ammo');
    const pile = CREW.filter((p) => p.role === 'pile watch');
    expect(pile.length).toBe(1);
    expect(pile[0].carry).toBe('slug');
    // exactly three carriers — supplies only, progression stays placed
    expect(CREW.filter((p) => p.carry).length).toBe(3);
  });

  it('maps every carry to a real drop (the carrier ALWAYS drops)', () => {
    for (const p of CREW) {
      if (p.carry) expect(CARRY_DROP[p.carry]).toBeTruthy();
    }
  });

  it('balances via the watch bill: carriers walk fewer watches', () => {
    for (const p of CREW) {
      if (p.carry) expect(p.weight).toBeLessThan(0.5);
      else expect(p.weight).toBe(1);
    }
  });
});

describe('the watch bill (Roster)', () => {
  it('never puts two of one man on watch', () => {
    const r = new Roster();
    const rng = mulberry32(7);
    const seen = new Set<string>();
    for (let i = 0; i < 41; i++) {
      const p = r.checkout(rng);
      expect(p).not.toBeNull();
      expect(seen.has(p!.name)).toBe(false);
      seen.add(p!.name);
    }
    // the whole complement is out — the site has nobody left to send
    expect(r.checkout(rng)).toBeNull();
    expect(r.checkoutByName('Barrow')).toBeNull();
  });

  it('returns a man below and lets him walk again (watch count grows)', () => {
    const r = new Roster();
    const p = r.checkoutByName('Barrow');
    expect(p?.name).toBe('Barrow');
    expect(r.timesOnWatch('Barrow')).toBe(1);
    r.return('Barrow');
    expect(r.onWatch.has('Barrow')).toBe(false);
    expect(r.checkoutByName('Barrow')?.name).toBe('Barrow');
    expect(r.timesOnWatch('Barrow')).toBe(2);
  });

  it('respects weight overrides (0 strikes a man from the bill)', () => {
    const r = new Roster();
    for (const p of CREW) if (p.name !== 'Ames') r.weightOverrides.set(p.name, 0);
    const rng = mulberry32(3);
    expect(r.checkout(rng)?.name).toBe('Ames');
    // everyone else struck and Ames on watch: nobody to send
    expect(r.checkout(rng)).toBeNull();
  });
});
