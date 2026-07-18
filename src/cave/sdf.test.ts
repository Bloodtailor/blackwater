import { beforeAll, describe, expect, it } from 'vitest';
import { EDGES, getNode, NODES } from './data';
import { initSdf, regionAt, sdf, setDoorBlocks } from './sdf';
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

  // Air/water rework (user 2026-07-18): every air region declares waterY;
  // there must be real air space above the line (or above the flat floor),
  // and where the line cuts the cavity, swimmable water below it.
  it('air regions hold air above their line and water below where it cuts', () => {
    for (const n of NODES.filter((n) => n.dry)) {
      expect(n.waterY, `${n.id} declares waterY`).toBeDefined();
      const w = n.waterY!;
      const ry = n.radius * (n.stretch?.[1] ?? 1);
      const floorY = n.floor !== undefined ? n.pos[1] - ry * n.floor : undefined;
      // effective cavity bottom: the flat floor if the room has one
      const effBottom = floorY ?? n.pos[1] - ry;
      const probeY = w > effBottom ? w + 0.5 : Math.max(effBottom + 0.6, Math.min(n.pos[1], effBottom + 2));
      expect(sdf(n.pos[0], probeY, n.pos[2], false), `${n.id} air space @y=${probeY.toFixed(1)}`).toBeLessThan(-0.15);
      // open-water pool only where the line sits above the effective bottom
      // (bells keep their pool down the entrance shaft instead)
      if (w > effBottom) {
        expect(sdf(n.pos[0], w - 0.6, n.pos[2], false), `${n.id} pool below line`).toBeLessThan(-0.15);
      }
    }
  });

  it('flat-floored rooms really are flat: floor height varies little across the room', () => {
    for (const n of NODES.filter((n) => n.floor !== undefined)) {
      const s = n.stretch ?? [1, 1, 1];
      const ry = n.radius * s[1];
      const floorY = n.pos[1] - ry * n.floor!;
      // sample the walkable disc at half radius in 4 directions: the surface
      // must sit near floorY everywhere (soft edges allowed at the rim)
      for (const [dx, dz] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]] as const) {
        const px = n.pos[0] + dx * n.radius * s[0];
        const pz = n.pos[2] + dz * n.radius * s[2];
        let y = n.pos[1];
        while (y > floorY - 3 && sdf(px, y - 0.2, pz, false) < -0.25) y -= 0.2;
        if (Math.abs(y - floorY) >= 1.1) {
          // a deep spot is fine ONLY if it's a passage mouth (entrance shaft,
          // slide chute) cutting through the floor
          const reg = regionAt(px, y + 0.4, pz);
          expect(reg?.ref.includes('~'), `${n.id} floor @(${dx},${dz}) found ${y.toFixed(1)} vs ${floorY.toFixed(1)} and not a passage mouth (${reg?.ref})`).toBe(true);
        }
      }
    }
  });
});
