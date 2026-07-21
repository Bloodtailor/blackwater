// M13 availability sims (replaces the M6a affordability sims — nothing costs
// points anymore). The question changes from "can a killing player AFFORD the
// arc?" to "can a searching player REACH the arc without a single kill?"
// (DESIGN §4: the game is winnable with zero kills; §10.3: openers are found).

import { describe, expect, it } from 'vitest';
import { EDGES, NODES, type CaveEdge } from '../cave/data';
import { BellIssue, Inventory } from './inventory';

interface SimDoor {
  id: string;
  kind: 'debris' | 'grate' | 'hatch' | 'powerGate';
  open: boolean;
}

/** Zero-kill reachability fixpoint: walk the graph, take what you find,
 *  open what your belt allows. `allowSqueeze=false` models a player who
 *  refuses every free-alternate crack — the found items alone must carry
 *  the main artery. */
function simulate(allowSqueeze: boolean, withPickups: boolean): Set<string> {
  const doors = new Map<string, SimDoor>();
  for (const e of EDGES) {
    if (e.door) doors.set(`${e.a}→${e.b}`, { id: `${e.a}→${e.b}`, kind: e.door.kind, open: false });
    else if (e.powerGate) doors.set(`${e.a}→${e.b}`, { id: `${e.a}→${e.b}`, kind: 'powerGate', open: false });
  }
  const adj = new Map<string, { other: string; edge: CaveEdge; door: SimDoor | undefined }[]>();
  for (const e of EDGES) {
    const d = doors.get(`${e.a}→${e.b}`);
    for (const [from, to] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from)!.push({ other: to, edge: e, door: d });
    }
  }

  const reachable = new Set<string>(['sink-platform']);
  let dynamite = 0;
  const keys = new Set<string>();
  const consumedPickups = new Set<string>();

  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    // flood fill through open passages
    const stack = [...reachable];
    while (stack.length) {
      const id = stack.pop()!;
      for (const { other, edge, door } of adj.get(id) ?? []) {
        if (!allowSqueeze && edge.width === 'squeeze') continue;
        if (door && !door.open) continue;
        if (!reachable.has(other)) {
          reachable.add(other);
          stack.push(other);
          changed = true;
        }
      }
    }
    // collect what the reachable world offers
    if (withPickups) {
      for (const n of NODES) {
        const p = n.contents?.pickup;
        if (!p || !reachable.has(n.id) || consumedPickups.has(n.id)) continue;
        consumedPickups.add(n.id);
        if (p.kind === 'dynamite') dynamite++;
        else if (p.kind === 'key' && p.keyFor) keys.add(p.keyFor);
        changed = true;
      }
    }
    const powerReached = NODES.some((n) => n.tags.includes('power') && reachable.has(n.id));
    // open what the belt allows, at doors touching the reachable region
    for (const d of doors.values()) {
      if (d.open) continue;
      const [a, b] = d.id.split('→');
      if (!reachable.has(a) && !reachable.has(b)) continue;
      if (d.kind === 'hatch') d.open = true; // free — the site charges time
      else if (d.kind === 'debris' && dynamite > 0) {
        dynamite--;
        d.open = true;
      } else if (d.kind === 'grate' && keys.has(d.id)) d.open = true;
      else if (d.kind === 'powerGate' && powerReached) d.open = true;
      if (d.open) changed = true;
    }
    if (!changed) break;
  }
  return reachable;
}

describe('M13 pickup data integrity', () => {
  const pickups = NODES.filter((n) => n.contents?.pickup && !n.teaser);

  it('places ≥4 dynamite, exactly 2 keys, ≥3 slugs', () => {
    expect(pickups.filter((n) => n.contents!.pickup!.kind === 'dynamite').length).toBeGreaterThanOrEqual(4);
    expect(pickups.filter((n) => n.contents!.pickup!.kind === 'key').length).toBe(2);
    expect(pickups.filter((n) => n.contents!.pickup!.kind === 'slug').length).toBeGreaterThanOrEqual(3);
  });

  it('every key matches a real grate door, and every grate has a key', () => {
    const grateIds = EDGES.filter((e) => e.door?.kind === 'grate').map((e) => `${e.a}→${e.b}`);
    const keyFors = pickups.filter((n) => n.contents!.pickup!.kind === 'key').map((n) => n.contents!.pickup!.keyFor);
    expect(new Set(keyFors)).toEqual(new Set(grateIds));
  });

  it('has at least as many dynamite charges as debris chokes (one can be missed)', () => {
    const debris = EDGES.filter((e) => e.door?.kind === 'debris').length;
    const charges = pickups.filter((n) => n.contents!.pickup!.kind === 'dynamite').length;
    expect(charges).toBeGreaterThan(debris);
  });
});

describe('M13 zero-kill availability (the §4 arc is reachable by searching, never by killing)', () => {
  const tagReached = (reach: Set<string>, tag: string): number => NODES.filter((n) => n.tags.includes(tag as never) && reach.has(n.id)).length;

  it('a no-squeeze player reaches power, every draught rack, the Bench, and the Heart on found items alone', () => {
    const reach = simulate(false, true);
    expect(tagReached(reach, 'power')).toBe(1);
    expect(tagReached(reach, 'perk')).toBe(NODES.filter((n) => n.tags.includes('perk')).length);
    expect(tagReached(reach, 'pap')).toBe(1);
    expect(tagReached(reach, 'heart')).toBe(1);
  });

  it('with ZERO pickups found, the free alternates still carry the whole run (no softlock, §5 two-route rule)', () => {
    const reach = simulate(true, false);
    expect(tagReached(reach, 'power')).toBe(1);
    expect(tagReached(reach, 'pap')).toBe(1);
    expect(tagReached(reach, 'heart')).toBe(1);
  });

  it('a slug is reachable before the Abyss (the Bench is never a round trip)', () => {
    const reach = simulate(false, true);
    const slugAbove = NODES.some((n) => n.contents?.pickup?.kind === 'slug' && n.zone !== 'abyss' && reach.has(n.id));
    expect(slugAbove).toBe(true);
  });
});

describe('the belt and the bell', () => {
  it('inventory consumes dynamite and slugs, keeps keys', () => {
    const inv = new Inventory();
    expect(inv.useDynamite()).toBe(false);
    inv.addDynamite();
    expect(inv.useDynamite()).toBe(true);
    expect(inv.useDynamite()).toBe(false);
    inv.addKey('a→b', 'TEST');
    expect(inv.hasKey('a→b')).toBe(true);
    inv.addSlug();
    expect(inv.useSlug()).toBe(true);
    expect(inv.useSlug()).toBe(false);
    expect(inv.hasKey('a→b')).toBe(true); // the key stays on the ring
  });

  it('a station issues once per bell, again after the bell changes, and reset forgives', () => {
    const b = new BellIssue();
    expect(b.issue(3)).toBe(true);
    expect(b.canIssue(3)).toBe(false);
    expect(b.issue(3)).toBe(false);
    expect(b.issue(4)).toBe(true); // next bell
    b.reset();
    expect(b.canIssue(4)).toBe(true); // the tease refunds the bell
  });
});
