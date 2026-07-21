// M15.5 (DESIGN §11.1) — the Undertow's invariants:
//  • the flow field reaches every node the passage graph can (no dead vectors)
//  • distances shrink monotonically along next-hops (the water goes HOME)
//  • door state is respected at build time
//  • the pull never points into rock (honest water through real tunnels)
//  • the surge cadence: trapezoid envelope, period in [min, max]

import { beforeAll, describe, expect, it } from 'vitest';
import { EDGES, NODES } from '../cave/data';
import { initSdf, sdf } from '../cave/sdf';
import { TUNING } from '../tuning';
import { buildFlowField, edgePolyline, pullAt, Undertow } from './undertow';

beforeAll(() => initSdf());

const HOME = NODES.find((n) => n.tags.includes('heart'))!.id;
const allOpen = (): boolean => true;
const doorsClosed = (e: (typeof EDGES)[number]): boolean => !e.door;

// reachable set over a given openness (BFS)
function reachable(isOpen: (e: (typeof EDGES)[number]) => boolean): Set<string> {
  const seen = new Set<string>([HOME]);
  const queue = [HOME];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const e of EDGES) {
      if (!isOpen(e)) continue;
      const other = e.a === cur ? e.b : e.b === cur ? e.a : null;
      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

describe('the flow field', () => {
  it('covers every reachable node — no dead vectors', () => {
    const field = buildFlowField(HOME, allOpen);
    for (const id of reachable(allOpen)) {
      if (id === HOME) continue;
      expect(field.next.get(id), `next-hop missing for ${id}`).toBeTruthy();
    }
  });

  it('shrinks distance along every next-hop (monotone toward home)', () => {
    const field = buildFlowField(HOME, allOpen);
    for (const [id, nh] of field.next) {
      expect(field.dist.get(nh)!, `${id}→${nh}`).toBeLessThan(field.dist.get(id)!);
    }
  });

  it('respects door state at build time', () => {
    const closed = buildFlowField(HOME, doorsClosed);
    const open = buildFlowField(HOME, allOpen);
    const canReachClosed = reachable(doorsClosed);
    // with doors shut the field still covers the whole closed-doors component…
    for (const id of canReachClosed) {
      if (id !== HOME) expect(closed.next.get(id), `closed-field missing ${id}`).toBeTruthy();
    }
    // …and the open field covers at least as much
    expect(open.next.size).toBeGreaterThanOrEqual(closed.next.size);
  });

  it('never pulls into rock along passage samples', () => {
    const field = buildFlowField(HOME, allOpen);
    let checked = 0;
    for (const e of EDGES) {
      const pts = edgePolyline(e);
      for (const f of [0.35, 0.5, 0.65]) {
        // arc-length sample point
        let total = 0;
        const segs: number[] = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
          segs.push(L);
          total += L;
        }
        let want = total * f;
        let p: [number, number, number] | null = null;
        for (let i = 0; i < segs.length; i++) {
          if (want <= segs[i]) {
            const t = segs[i] > 0 ? want / segs[i] : 0;
            p = [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, pts[i][2] + (pts[i + 1][2] - pts[i][2]) * t];
            break;
          }
          want -= segs[i];
        }
        if (!p || sdf(p[0], p[1], p[2]) > -0.5) continue; // sample sits in/near rock (thin sliver) — skip
        const dir = pullAt(field, p[0], p[1], p[2]);
        if (!dir) continue;
        // half a metre down the pull must still be water
        const q: [number, number, number] = [p[0] + dir[0] * 0.5, p[1] + dir[1] * 0.5, p[2] + dir[2] * 0.5];
        expect(sdf(q[0], q[1], q[2]), `pull at ${e.a}~${e.b}@${f} exits water`).toBeLessThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(60); // the sweep actually covered the cave
  });

  it('gives no pull at the home chamber', () => {
    const field = buildFlowField(HOME, allOpen);
    const home = NODES.find((n) => n.id === HOME)!;
    expect(pullAt(field, home.pos[0], home.pos[1], home.pos[2])).toBeNull();
  });
});

describe('the surge clock', () => {
  it('runs first-delay → surge (trapezoid) → wait in [min,max]', () => {
    const U = TUNING.undertow;
    const ut = new Undertow(() => 0.5);
    ut.arm(HOME, allOpen);
    // quiet until the first delay elapses
    let tick = ut.update(U.firstDelaySec - 1, true);
    expect(tick.envelope).toBe(0);
    expect(tick.started).toBe(false);
    tick = ut.update(1.01, true);
    expect(tick.started).toBe(true);
    expect(tick.first).toBe(true);
    // mid-surge the envelope is full
    tick = ut.update(U.surgeSec / 2, true);
    expect(tick.envelope).toBe(1);
    // after surgeSec it ends and schedules the next wait in [min,max]
    ut.update(U.surgeSec, true);
    expect(ut.surging).toBe(false);
    expect(ut.waitT).toBeGreaterThanOrEqual(U.periodMinSec);
    expect(ut.waitT).toBeLessThanOrEqual(U.periodMaxSec);
    // the second surge is not `first`
    ut.update(ut.waitT + 0.01, true);
    expect(ut.surging).toBe(true);
  });

  it('holds still and kills a surge when inactive', () => {
    const ut = new Undertow(() => 0.5);
    ut.arm(HOME, allOpen);
    ut.forceSurge();
    expect(ut.surging).toBe(true);
    const tick = ut.update(0.016, false);
    expect(tick.envelope).toBe(0);
    expect(ut.surging).toBe(false);
  });
});
