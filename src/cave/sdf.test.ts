import { beforeAll, describe, expect, it } from 'vitest';
import { EDGES, getNode, NODES } from './data';
import { initSdf, sdf, setDoorBlocks } from './sdf';
import { computeDoorBlocks, doorEdges, doorPlacement } from './doors';

// Sample points every ~1 m along an edge's full polyline.
function samplePolyline(e: (typeof EDGES)[number]): [number, number, number][] {
  const pts = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
  const out: [number, number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay, az] = pts[i - 1];
    const [bx, by, bz] = pts[i];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.max(2, Math.ceil(len));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t]);
    }
  }
  return out;
}

describe('cave SDF traversability', () => {
  beforeAll(() => {
    initSdf();
    setDoorBlocks([]);
  });

  it('every node center is inside passable space (pillars keep clear of centers)', () => {
    for (const n of NODES) {
      const [x, y, z] = n.pos;
      expect(sdf(x, y, z, false), n.id).toBeLessThan(-0.4);
    }
  });

  it('every edge is passable along its FULL polyline (no doors)', () => {
    for (const e of EDGES) {
      for (const [x, y, z] of samplePolyline(e)) {
        expect(sdf(x, y, z, false), `${e.a}~${e.b} @ (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)})`).toBeLessThan(-0.2);
      }
    }
  });

  it('closed doors block their own passage', () => {
    const doors = doorEdges().map((edge) => ({ edge, open: false }));
    setDoorBlocks(computeDoorBlocks(doors));
    for (const e of doorEdges()) {
      const { pos } = doorPlacement(e);
      expect(sdf(pos[0], pos[1], pos[2], true), `${e.a}→${e.b} should be plugged`).toBeGreaterThan(-0.35);
    }
    setDoorBlocks([]);
    for (const e of doorEdges()) {
      const { pos } = doorPlacement(e);
      expect(sdf(pos[0], pos[1], pos[2], true), `${e.a}→${e.b} should be open`).toBeLessThan(-0.4);
    }
  });

  // The user-found bug (2026-07-18): a spherical door plug sealed the free
  // squeeze NEXT to the hatch. Plugs are discs now — with ALL doors closed,
  // every non-door passage must remain fully swimmable end to end.
  it('with all doors closed, every non-door edge stays fully passable', () => {
    const doors = doorEdges().map((edge) => ({ edge, open: false }));
    setDoorBlocks(computeDoorBlocks(doors));
    const doorSet = new Set(doorEdges());
    for (const e of EDGES) {
      if (doorSet.has(e)) continue;
      for (const [x, y, z] of samplePolyline(e)) {
        expect(sdf(x, y, z, true), `${e.a}~${e.b} choked near a door plug @ (${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)})`).toBeLessThan(-0.2);
      }
    }
    setDoorBlocks([]);
  });

  it('dry pockets have swimmable water below and air headroom above their water line', () => {
    for (const n of NODES.filter((n) => n.dry)) {
      const ry = n.radius * (n.stretch?.[1] ?? 1);
      const level = n.pos[1] - ry * 0.35;
      expect(sdf(n.pos[0], level - 0.5, n.pos[2], false), `${n.id} below line`).toBeLessThan(-0.3);
      expect(sdf(n.pos[0], level + 0.6, n.pos[2], false), `${n.id} above line`).toBeLessThan(-0.2);
    }
  });
});
