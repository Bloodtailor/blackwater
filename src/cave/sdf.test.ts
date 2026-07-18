import { beforeAll, describe, expect, it } from 'vitest';
import { EDGES, getNode, NODES } from './data';
import { initSdf, sdf, setDoorBlocks } from './sdf';
import { computeDoorBlocks, doorEdges, doorPlacement } from './doors';

describe('cave SDF traversability', () => {
  beforeAll(() => {
    initSdf();
    setDoorBlocks([]);
  });

  it('every node center is inside passable space', () => {
    for (const n of NODES) {
      const [x, y, z] = n.pos;
      expect(sdf(x, y, z, false), n.id).toBeLessThan(-0.4);
    }
  });

  it('every edge segment midpoint is passable', () => {
    for (const e of EDGES) {
      const pts = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
      for (let i = 1; i < pts.length; i++) {
        const mx = (pts[i - 1][0] + pts[i][0]) / 2;
        const my = (pts[i - 1][1] + pts[i][1]) / 2;
        const mz = (pts[i - 1][2] + pts[i][2]) / 2;
        expect(sdf(mx, my, mz, false), `${e.a}~${e.b} seg ${i}`).toBeLessThan(-0.2);
      }
    }
  });

  it('closed doors block their passage', () => {
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

  it('door plugs never choke a neighboring free route (alternate stays passable)', () => {
    const doors = doorEdges().map((edge) => ({ edge, open: false }));
    setDoorBlocks(computeDoorBlocks(doors));
    // With ALL doors closed, the free alternates must still be swimmable:
    // squeeze crack into the galleries, and the abyss squeeze bypass.
    const freeRoutes: [string, [number, number, number]][] = [
      ['sink-crack squeeze wp', [7, -12, 0]],
      ['abyss squeeze wp', [9, -72.5, 43.5]],
    ];
    for (const [name, p] of freeRoutes) {
      expect(sdf(p[0], p[1], p[2], true), name).toBeLessThan(-0.45);
    }
    setDoorBlocks([]);
  });
});
