// The Undertow (M15.5, DESIGN §11.1): the moment the Heart is lifted, the
// cave starts INHALING — every so often the ambient current is overridden by
// a far stronger one that pulls the player back toward the apse, wherever
// they are. The route home is COMPUTED, not faked: one Dijkstra flow field
// from the Heart's chamber over the passage graph (door state respected at
// grab time), and the pull always runs ALONG the local passage polyline down
// that field — honest physical water through real tunnels, never at rock.
//
// THREE-free (Vec3 tuples) — unit-tested in undertow.test.ts. The pull is
// position-only and rides the shared current sampler (current.ts override),
// so every particle in the water visibly inhales too: the honest tell.

import { EDGES, NODES, type CaveEdge } from '../cave/data';
import { regionAt } from '../cave/sdf';
import { TUNING } from '../tuning';

export type Vec3 = [number, number, number];

export interface FlowField {
  /** Node id → polyline distance to the home chamber (m). */
  dist: Map<string, number>;
  /** Node id → the neighbor one hop closer to home (absent at home / unreachable). */
  next: Map<string, string>;
  homeId: string;
}

const nodeById = new Map(NODES.map((n) => [n.id, n]));

/** Full passage polyline of an edge, a → b. */
export function edgePolyline(e: CaveEdge): Vec3[] {
  const a = nodeById.get(e.a)!;
  const b = nodeById.get(e.b)!;
  return [a.pos as Vec3, ...((e.waypoints ?? []) as Vec3[]), b.pos as Vec3];
}

function polylineLength(pts: Vec3[]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
  }
  return L;
}

/**
 * One-time Dijkstra from the home chamber over the OPEN passage graph —
 * squeezes included (water flows anywhere; the squeeze pin-guard damps the
 * pull at the consumer). Door state is whatever `isEdgeOpen` says at call
 * time: the field is built once, at Heart-grab (DESIGN §11.1).
 */
export function buildFlowField(homeId: string, isEdgeOpen: (e: CaveEdge) => boolean): FlowField {
  const dist = new Map<string, number>();
  const next = new Map<string, string>();
  const adj = new Map<string, { to: string; len: number }[]>();
  for (const e of EDGES) {
    if (!isEdgeOpen(e)) continue;
    const len = polylineLength(edgePolyline(e));
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push({ to: e.b, len });
    adj.get(e.b)!.push({ to: e.a, len });
  }
  dist.set(homeId, 0);
  // simple O(n²) Dijkstra — the cave holds well under a hundred nodes
  const open = new Set<string>([homeId]);
  const done = new Set<string>();
  while (open.size > 0) {
    let cur: string | null = null;
    let best = Infinity;
    for (const id of open) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        cur = id;
      }
    }
    if (cur === null) break;
    open.delete(cur);
    done.add(cur);
    for (const { to, len } of adj.get(cur) ?? []) {
      if (done.has(to)) continue;
      const nd = best + len;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        next.set(to, cur); // one hop closer to home
        open.add(to);
      }
    }
  }
  return { dist, next, homeId };
}

/**
 * The pull direction at a point: a unit vector ALONG the local passage,
 * headed down the flow field. Null = no pull (home chamber, off-graph, or a
 * region the field never reached).
 */
export function pullAt(field: FlowField, x: number, y: number, z: number): Vec3 | null {
  const ref = regionAt(x, y, z)?.ref;
  if (!ref) return null;
  const tilde = ref.indexOf('~');
  if (tilde >= 0) {
    // inside a passage: run the polyline toward the endpoint closer to home
    const aId = ref.slice(0, tilde);
    const bId = ref.slice(tilde + 1);
    const e = EDGES.find((ed) => (ed.a === aId && ed.b === bId) || (ed.a === bId && ed.b === aId));
    if (!e) return null;
    const da = field.dist.get(e.a);
    const db = field.dist.get(e.b);
    if (da === undefined && db === undefined) return null;
    const towardA = (da ?? Infinity) <= (db ?? Infinity);
    const pts = edgePolyline(e);
    // nearest segment, then its tangent oriented homeward
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i];
      const [bx, by, bz] = pts[i + 1];
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const len2 = abx * abx + aby * aby + abz * abz || 1;
      let t = ((x - ax) * abx + (y - ay) * aby + (z - az) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = (x - (ax + abx * t)) ** 2 + (y - (ay + aby * t)) ** 2 + (z - (az + abz * t)) ** 2;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const [ax, ay, az] = pts[bestI];
    const [bx, by, bz] = pts[bestI + 1];
    // polyline runs a→b; toward a = backward along the segment
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    if (towardA) {
      dx = -dx;
      dy = -dy;
      dz = -dz;
    }
    const L = Math.hypot(dx, dy, dz) || 1;
    return [dx / L, dy / L, dz / L];
  }
  // inside a chamber: head for the mouth of the passage toward the next hop
  if (ref === field.homeId) return null;
  const nh = field.next.get(ref);
  if (!nh) return null;
  const e = EDGES.find((ed) => (ed.a === ref && ed.b === nh) || (ed.a === nh && ed.b === ref));
  if (!e) return null;
  const pts = edgePolyline(e);
  // first polyline point past this chamber, from the chamber's side
  const target = e.a === ref ? pts[Math.min(1, pts.length - 1)] : pts[Math.max(pts.length - 2, 0)];
  const dx = target[0] - x;
  const dy = target[1] - y;
  const dz = target[2] - z;
  const L = Math.hypot(dx, dy, dz) || 1;
  return [dx / L, dy / L, dz / L];
}

export interface SurgeTick {
  /** Envelope 0..1 (trapezoid ramp) — 0 means quiet water. */
  envelope: number;
  /** True exactly once, on the tick a surge begins. */
  started: boolean;
  /** True on the FIRST surge of the run (the voice lines' cue). */
  first: boolean;
}

/** The surge clock: armed at Heart-grab, a timed inhale forever after. */
export class Undertow {
  field: FlowField | null = null;
  /** Seconds until the next surge begins (while quiet). */
  waitT = 0;
  /** Seconds into the current surge (while surging). */
  surgeT = -1; // <0 = not surging
  /** Debug: let the clock run without the Ascent. */
  debugActive = false;
  private firstDone = false;

  constructor(private rng: () => number = Math.random) {}

  get armed(): boolean {
    return this.field !== null;
  }

  get surging(): boolean {
    return this.surgeT >= 0;
  }

  arm(homeId: string, isEdgeOpen: (e: CaveEdge) => boolean): void {
    this.field = buildFlowField(homeId, isEdgeOpen);
    this.waitT = TUNING.undertow.firstDelaySec;
    this.surgeT = -1;
    this.firstDone = false;
  }

  /** Debug: begin a surge right now. */
  forceSurge(): void {
    if (this.field) this.surgeT = 0;
  }

  /** Trapezoid envelope for the current surge. */
  private envelopeAt(t: number): number {
    const U = TUNING.undertow;
    if (t < 0 || t >= U.surgeSec) return 0;
    const up = Math.min(1, t / U.rampSec);
    const down = Math.min(1, (U.surgeSec - t) / U.rampSec);
    return Math.min(up, down);
  }

  /** Advance the clock. `active` false (not ascending / dead / won) holds
   *  everything still and kills any running surge. */
  update(dt: number, active: boolean): SurgeTick {
    if (!this.field || !(active || this.debugActive)) {
      this.surgeT = -1;
      return { envelope: 0, started: false, first: false };
    }
    const U = TUNING.undertow;
    let started = false;
    let first = false;
    if (this.surgeT < 0) {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        this.surgeT = 0;
        started = true;
        first = !this.firstDone;
        this.firstDone = true;
      }
    } else {
      this.surgeT += dt;
      if (this.surgeT >= U.surgeSec) {
        this.surgeT = -1;
        this.waitT = U.periodMinSec + this.rng() * (U.periodMaxSec - U.periodMinSec);
      }
    }
    return { envelope: this.envelopeAt(this.surgeT), started, first };
  }
}
