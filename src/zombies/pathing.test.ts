import { describe, expect, it } from 'vitest';
import { EDGES, getNode, ZONE_HUBS, type CaveEdge } from '../cave/data';
import { GraphPath, nearestNodeId, refToNodeId } from './pathing';

const allClosed = (e: CaveEdge): boolean => !e.door && !e.powerGate;
const allOpen = (): boolean => true;

describe('zombie graph pathing (DESIGN §5 door rule, §8)', () => {
  it('reaches every zone hub from the surface with ALL doors closed (free alternates)', () => {
    const g = new GraphPath(allClosed);
    for (const hub of Object.values(ZONE_HUBS)) {
      const path = g.findPath(ZONE_HUBS.sinkhole, hub);
      expect(path, `no doors-closed path to ${hub}`).not.toBeNull();
    }
  });

  it('never crosses a closed door edge', () => {
    const g = new GraphPath(allClosed);
    const doorPairs = new Set(EDGES.filter((e) => e.door || e.powerGate).map((e) => `${e.a}|${e.b}`));
    for (const hub of Object.values(ZONE_HUBS)) {
      const path = g.findPath(ZONE_HUBS.sinkhole, hub)!;
      for (let i = 1; i < path.length; i++) {
        expect(doorPairs.has(`${path[i - 1]}|${path[i]}`) || doorPairs.has(`${path[i]}|${path[i - 1]}`)).toBe(false);
      }
    }
  });

  it('open doors shorten (or preserve) the route', () => {
    const closed = new GraphPath(allClosed);
    const open = new GraphPath(allOpen);
    const len = (g: GraphPath, to: string): number => {
      const pts = g.expand(g.findPath(ZONE_HUBS.sinkhole, to)!);
      let l = 0;
      for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      return l;
    };
    for (const hub of [ZONE_HUBS.galleries, ZONE_HUBS.maze, ZONE_HUBS.abyss]) {
      expect(len(open, hub)).toBeLessThanOrEqual(len(closed, hub) + 0.01);
    }
  });

  it('expands edge waypoints in travel order (reversed when walking b→a)', () => {
    const g = new GraphPath(allOpen);
    const e = EDGES.find((x) => (x.waypoints?.length ?? 0) >= 2)!;
    const fwd = g.expand([e.a, e.b]);
    const rev = g.expand([e.b, e.a]);
    expect(fwd[1]).toEqual(e.waypoints![0]);
    expect(rev[1]).toEqual(e.waypoints![e.waypoints!.length - 1]);
  });

  it('nearestNodeId / refToNodeId resolve positions to graph nodes', () => {
    const hub = getNode(ZONE_HUBS.maze);
    expect(nearestNodeId(hub.pos[0], hub.pos[1], hub.pos[2])).toBe(hub.id);
    const e = EDGES[0];
    const pa = getNode(e.a).pos;
    expect(refToNodeId(`${e.a}~${e.b}`, pa[0], pa[1], pa[2])).toBe(e.a);
    // non-graph refs (the sky shaft) fall back to the nearest node
    expect(() => refToNodeId('sky-shaft', 0, 5, 0)).not.toThrow();
  });
});
