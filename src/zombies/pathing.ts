// Zombie pathing (DESIGN §8, §16): A* on the authored cave graph, then local
// steering inside chambers. Pure logic, no three dependency (unit-testable).
//
// Closed doors block zombies exactly like players (DESIGN §5 door rule:
// zombies never open doors) — the isEdgeOpen callback reads live door state,
// so a bought-open door unblocks pathing the moment it grinds open. The SDF
// door plugs are the physical backstop if a stale path ever tries anyway.

import { buildAdjacency, getNode, NODES, type Adjacency, type CaveEdge } from '../cave/data';

export type Vec3 = [number, number, number];

export class GraphPath {
  private adj: Adjacency;

  constructor(private isEdgeOpen: (e: CaveEdge) => boolean) {
    this.adj = buildAdjacency();
  }

  /** Node ids from `from` to `to` (inclusive), or null if unreachable. */
  findPath(from: string, to: string): string[] | null {
    if (from === to) return [from];
    const goal = getNode(to).pos;
    const h = (id: string): number => {
      const p = getNode(id).pos;
      return Math.hypot(p[0] - goal[0], p[1] - goal[1], p[2] - goal[2]);
    };
    const open = new Map<string, number>([[from, h(from)]]); // id → f
    const g = new Map<string, number>([[from, 0]]);
    const came = new Map<string, string>();
    const closed = new Set<string>();
    while (open.size > 0) {
      let cur = '';
      let best = Infinity;
      for (const [id, f] of open) {
        if (f < best) {
          best = f;
          cur = id;
        }
      }
      if (cur === to) {
        const path = [to];
        let n = to;
        while (came.has(n)) {
          n = came.get(n)!;
          path.push(n);
        }
        return path.reverse();
      }
      open.delete(cur);
      closed.add(cur);
      const gCur = g.get(cur)!;
      for (const { edge, other, length } of this.adj[cur] ?? []) {
        if (closed.has(other) || !this.isEdgeOpen(edge)) continue;
        const tentative = gCur + length;
        if (tentative < (g.get(other) ?? Infinity)) {
          came.set(other, cur);
          g.set(other, tentative);
          open.set(other, tentative + h(other));
        }
      }
    }
    return null;
  }

  /** The edge between two adjacent nodes (as stored — a/b order preserved). */
  edgeBetween(a: string, b: string): CaveEdge | null {
    for (const { edge, other } of this.adj[a] ?? []) if (other === b) return edge;
    return null;
  }

  /**
   * Expand a node path into a swimmable waypoint polyline: node centers plus
   * every edge waypoint, ordered along travel (edge waypoints are authored
   * a→b; traversing b→a reverses them).
   */
  expand(path: string[]): Vec3[] {
    const pts: Vec3[] = [];
    for (let i = 0; i < path.length; i++) {
      pts.push([...getNode(path[i]).pos]);
      if (i + 1 >= path.length) break;
      const e = this.edgeBetween(path[i], path[i + 1]);
      if (e?.waypoints) {
        const wps = e.a === path[i] ? e.waypoints : [...e.waypoints].reverse();
        for (const w of wps) pts.push([...w]);
      }
    }
    return pts;
  }
}

/** Nearest graph node to a world position (region-independent fallback). */
export function nearestNodeId(x: number, y: number, z: number): string {
  let best = '';
  let bestD = Infinity;
  for (const n of NODES) {
    if (n.teaser || n.kind === 'audio') continue; // dressing, not destinations
    const d = (n.pos[0] - x) ** 2 + (n.pos[1] - y) ** 2 + (n.pos[2] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

/** Resolve an SDF region ref (`node` or `a~b` edge) to a graph node id,
 *  picking whichever endpoint is closer for edge refs. Non-graph refs (the
 *  sky shaft) fall back to the nearest node. */
export function refToNodeId(ref: string, x: number, y: number, z: number): string {
  const tilde = ref.indexOf('~');
  if (tilde < 0) return NODES.some((n) => n.id === ref) ? ref : nearestNodeId(x, y, z);
  const a = ref.slice(0, tilde);
  const b = ref.slice(tilde + 1);
  const pa = getNode(a).pos;
  const pb = getNode(b).pos;
  const da = (pa[0] - x) ** 2 + (pa[1] - y) ** 2 + (pa[2] - z) ** 2;
  const db = (pb[0] - x) ** 2 + (pb[1] - y) ** 2 + (pb[2] - z) ** 2;
  return da <= db ? a : b;
}
