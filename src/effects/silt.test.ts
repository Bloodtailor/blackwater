import { describe, expect, it } from 'vitest';
import { SiltSystem, chambersFromNodes, type SiltChamber } from './silt';
import { NODES } from '../cave/data';
import { TUNING } from '../tuning';

const room = (id: string, mound = true, silty = true, r = 5, c: [number, number, number] = [0, 0, 0]): SiltChamber => ({
  id,
  c,
  rx: r,
  ry: r,
  rz: r,
  silty,
  mound,
});

function tick(s: SiltSystem, seconds: number): void {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) s.update(dt);
}

describe('chamber data', () => {
  it('builds chambers from every siltyFloor/chalkMound node', () => {
    const chambers = chambersFromNodes(NODES);
    const tagged = NODES.filter((n) => n.tags.includes('siltyFloor') || n.tags.includes('chalkMound'));
    expect(chambers.length).toBe(tagged.length);
    expect(chambers.filter((c) => c.mound).length).toBeGreaterThanOrEqual(6); // DESIGN §7.2: 6–10 mounds
  });

  it('finds the smallest containing chamber', () => {
    const s = new SiltSystem([room('big', false, true, 10), room('small', false, true, 3)]);
    expect(s.chamberAt(1, 0, 0)).toBe('small');
    expect(s.chamberAt(8, 0, 0)).toBe('big');
    expect(s.chamberAt(30, 0, 0)).toBeNull();
  });
});

describe('ambient stir (§7.1)', () => {
  it('stirs up under disturbance and settles over the settle time', () => {
    const s = new SiltSystem([room('a')]);
    for (let t = 0; t < TUNING.silt.stirSec; t += 1 / 30) s.disturb('a', 1 / 30);
    expect(s.stir.get('a')).toBeGreaterThan(0.8);
    const clear = 25;
    expect(s.visibilityAt('a', clear)).toBeLessThan(TUNING.silt.ambientVisM + 2);
    tick(s, TUNING.silt.ambientSettleSec + 1);
    expect(s.stir.has('a')).toBe(false);
    expect(s.visibilityAt('a', clear)).toBe(clear);
  });

  it('ignores disturbance in non-silty chambers', () => {
    const s = new SiltSystem([room('m', true, false)]);
    s.disturb('m', 1);
    expect(s.stir.size).toBe(0);
  });
});

describe('silt-out & mound re-arm (§7.2)', () => {
  it('detonation collapses visibility, fades over 75 s, re-arms the mound', () => {
    const s = new SiltSystem([room('a')]);
    expect(s.detonate('a')).toBe(true);
    expect(s.detonate('a')).toBe(false); // already blown
    expect(s.armed.get('a')).toBe(false);
    expect(s.visibilityAt('a', 25)).toBe(TUNING.silt.siltoutVisM);
    expect(s.siltoutAt('a')).toBe(true);
    tick(s, TUNING.silt.siltoutFadeSec / 2);
    const midVis = s.visibilityAt('a', 25);
    expect(midVis).toBeGreaterThan(TUNING.silt.siltoutVisM);
    expect(midVis).toBeLessThan(25 * 0.6); // stays thick most of the fade
    tick(s, TUNING.silt.siltoutFadeSec / 2 + 1);
    expect(s.siltoutAt('a')).toBe(false);
    expect(s.visibilityAt('a', 25)).toBe(25);
    expect(s.armed.get('a')).toBe(true); // fully cleared → re-armed
  });

  it('non-mound chambers cannot detonate but can be force-silted (debug/drops)', () => {
    const s = new SiltSystem([room('x', false)]);
    expect(s.detonate('x')).toBe(false);
    s.forceSiltout('x');
    expect(s.siltoutAt('x')).toBe(true);
  });

  it('clearAll settles everything instantly and re-arms mounds (Clear Waters)', () => {
    const s = new SiltSystem([room('a'), room('b', true, true, 4, [20, 0, 0])]);
    s.detonate('a');
    s.disturb('b', 3);
    s.clearAll();
    expect(s.siltouts.size).toBe(0);
    expect(s.stir.size).toBe(0);
    expect(s.armed.get('a')).toBe(true);
  });

  it('thickness peaks at detonation and thins as the silt clears', () => {
    const s = new SiltSystem([room('a')]);
    s.detonate('a');
    expect(s.thicknessAt('a')).toBe(1);
    tick(s, TUNING.silt.siltoutFadeSec * 0.75);
    expect(s.thicknessAt('a')).toBeLessThan(0.6);
    expect(s.thicknessAt(null)).toBe(0);
  });
});
