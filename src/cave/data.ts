// THE MAP LOADER. The layout itself lives in `layout.json` (single source of
// truth, DESIGN.md §16 rule 1) in WORLD units — what you see in game is what
// the file says; there is no hidden scaling step anymore. Edit it three ways:
//  • the visual editor: run the game with `?edit=1` (recommended)
//  • by hand (docs/MAPPING.md explains every field)
//  • ask a build session
// Renderer, collision, pathing, spawning, the map viewer, and the editor all
// read the arrays exported here. The editor SAVES by writing layout.json
// through the dev server (/__layout).
//
// History: the layout was authored in compact coordinates and scaled ×1.7 at
// load (M2.5). On 2026-07-19 the scaled result was dumped to layout.json and
// the scale retired, so editor coordinates = game coordinates forever.

import layoutJson from './layout.json';
import { TUNING } from '../tuning';

export type Zone = 'sinkhole' | 'galleries' | 'maze' | 'throat' | 'abyss';

export type NodeTag =
  | 'airPocket'
  | 'ambushPocket'
  | 'burrow'
  | 'landmark'
  | 'siltyFloor'
  | 'chalkMound'
  | 'perk'
  | 'wallBuy'
  | 'boxSpot'
  | 'power'
  | 'pap'
  | 'heart'
  | 'tape'
  | 'cache'
  | 'tieOff'
  | 'poster'
  | 'toy'
  | 'jukebox'
  | 'guardianPost'
  | 'surface'; // head-above-water here (platform / open pool)

export type PerkId =
  | 'barnacleHide'
  | 'secondWind'
  | 'greasedGears'
  | 'triggerFish'
  | 'deepPockets'
  | 'ironLungs'
  | 'catEyes'
  | 'finKick'
  | 'steadyHands';

export type WeaponId = 'speargun' | 'pneuDriver' | 'flechette' | 'harpoon' | 'lineLance';
export type VendorId = 'battery' | 'chemlights' | 'reel';

export interface CaveNode {
  id: string;
  pos: [number, number, number];
  radius: number;
  /** Per-axis multipliers of radius — rooms are ellipsoids, not spheres. */
  stretch?: [number, number, number];
  /** Rock columns floor-to-ceiling inside the chamber (count). */
  pillars?: number;
  /**
   * Part of an AIR region (air bell / dry passage). Air must be physically
   * coherent (user rework 2026-07-18). No `water` field = the room is ALL
   * air (user 2026-07-19: fully-dry rooms shouldn't need a water line).
   */
  dry?: boolean;
  /**
   * Local water level as a FILL FRACTION of the room along its up axis
   * (falseUp if set — tilted rooms carry tilted water), like `floor`:
   * 0 = surface at the room's bottom, 0.5 = half full, 1 = full. Slightly
   * negative (≥ −0.5) puts the surface below the room, down its entrance
   * shaft — connected passages inherit it so you surface in the shaft.
   * Replaces the absolute `waterY` (user 2026-07-19: an absolute height
   * stopped making sense once water could tilt and rooms could move).
   */
  water?: number;
  /** @deprecated legacy absolute water height — auto-migrated to `water` at load. */
  waterY?: number;
  /**
   * DECEPTION (user 2026-07-19): this region's "up" is a lie. The flat floor
   * tilts to this vector, spikes grow along it, the camera orients itself to
   * it, AND the water surface tilts with it (user round 8: a flat pool in a
   * tilted room broke the illusion) — the room looks level and only the
   * bubbles (which stay honest) betray true up. Normalized at load.
   */
  falseUp?: [number, number, number];
  /**
   * Flat(ter) floor: carve the room's bottom at pos − up·(ry·floor) with a
   * soft blend. Walkable-room rule: the floor should sit ~one tunnel-radius
   * below arriving passage centerlines so mouths meet floors flush.
   */
  floor?: number;
  /** Stalactites + stalagmites (count) — air rooms only. */
  spikes?: number;
  zone: Zone;
  tags: NodeTag[];
  contents?: {
    perk?: PerkId;
    wallBuy?: WeaponId;
    vendor?: VendorId;
    landmarkName?: string;
    burrowActiveFromRound?: number;
    tape?: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
    poster?: 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G10' | 'G11' | 'G12' | 'G13';
    toyColor?: 'red' | 'blue' | 'yellow';
    cache?: 'battery' | 'chemlights';
  };
}

export interface CaveEdge {
  a: string;
  b: string;
  width: 'open' | 'normal' | 'squeeze';
  waypoints?: [number, number, number][];
  tilt?: { maxDeg: number };
  door?: { cost: number; kind: 'debris' | 'grate' | 'hatch'; at?: number }; // at: arc fraction along the passage (default 0.5)
  powerGate?: boolean; // PaP grate: opens with power, not points
  gateAt?: number; // powerGate arc fraction along the passage (default 0.5)
  /** Wet one-way slide (user 2026-07-18): walking here loses all traction and
   *  gravity hauls you down the shaft; you cannot climb back up. */
  slide?: boolean;
  /**
   * Thin breathing gap along the tunnel CEILING: this many meters of air
   * under the rock, following the passage profile (slopes and all).
   * Replaces edge `waterY` for tunnels (user 2026-07-19: an absolute plane
   * only made air where the tunnel happened to cross it).
   */
  airGap?: number;
  /** SLIDES ONLY: the plunge line — absolute y where the chute hits its pool. */
  waterY?: number;
  /** Deceptive reference-up for this passage — camera orientation only; an
   *  `airGap` surface follows the tunnel geometry regardless. */
  falseUp?: [number, number, number];
}

interface Layout {
  nodes: CaveNode[];
  edges: CaveEdge[];
  zoneHubs: Record<Zone, string>;
}

// Playtest mode (?playtest=1, editor "TEST" button): the editor stashes its
// UNSAVED working layout in sessionStorage and the game loads that instead of
// layout.json — try the edit without committing it.
function loadLayout(): Layout {
  // typeof guards: Vitest imports this module in plain node (no window)
  if (typeof location !== 'undefined' && typeof sessionStorage !== 'undefined' && new URLSearchParams(location.search).has('playtest')) {
    try {
      const raw = sessionStorage.getItem('bw-test-layout');
      if (raw) return JSON.parse(raw) as Layout;
    } catch {
      // fall through to the saved file
    }
  }
  return layoutJson as unknown as Layout;
}
const layout = loadLayout();

export const NODES: CaveNode[] = layout.nodes;
export const EDGES: CaveEdge[] = layout.edges;
export const ZONE_HUBS: Record<Zone, string> = layout.zoneHubs;

// Normalize direction fields defensively (hand-edited files, editor drafts).
const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
for (const n of NODES) if (n.falseUp) n.falseUp = norm(n.falseUp);
for (const e of EDGES) if (e.falseUp) e.falseUp = norm(e.falseUp);

// Legacy water migration (2026-07-19): absolute node `waterY` → relative
// `water` fill fraction; non-slide edge `waterY` → `airGap`. Keeps old JSON
// exports loadable; layout.json itself is migrated on disk.
for (const n of NODES) {
  if (n.waterY !== undefined && n.water === undefined) {
    const up = n.falseUp ?? [0, 1, 0];
    const ry = n.radius * (n.stretch?.[1] ?? 1);
    // signed distance from center to the old plane (through (cx,waterY,cz))
    const d = up[1] * (n.waterY - n.pos[1]);
    const frac = (d / ry + 1) / 2;
    if (frac > -0.5) n.water = Math.round(Math.min(1, frac) * 1000) / 1000;
  }
  n.waterY = undefined;
}
for (const e of EDGES) {
  if (!e.slide && e.waterY !== undefined) {
    if (e.airGap === undefined) e.airGap = 0.5; // best guess for hand-me-downs
    e.waterY = undefined;
  }
}

// ── Helpers (graph utilities shared by all systems) ──

let nodeMap = new Map(NODES.map((n) => [n.id, n]));

export function getNode(id: string): CaveNode {
  const n = nodeMap.get(id);
  if (!n) throw new Error(`unknown cave node: ${id}`);
  return n;
}

/** The editor mutates NODES live (add/delete/rename) — call this after any
 *  structural change so id lookups stay fresh. */
export function refreshNodeMap(): void {
  nodeMap = new Map(NODES.map((n) => [n.id, n]));
}

export function edgeLength(e: CaveEdge): number {
  const pts: [number, number, number][] = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const dz = pts[i][2] - pts[i - 1][2];
    len += Math.hypot(dx, dy, dz);
  }
  return len;
}

export interface Adjacency {
  [nodeId: string]: { edge: CaveEdge; other: string; length: number }[];
}

export function buildAdjacency(edges: CaveEdge[] = EDGES): Adjacency {
  const adj: Adjacency = {};
  for (const n of NODES) adj[n.id] = [];
  for (const e of edges) {
    const len = edgeLength(e);
    adj[e.a].push({ edge: e, other: e.b, length: len });
    adj[e.b].push({ edge: e, other: e.a, length: len });
  }
  return adj;
}

/**
 * Region ref (node id / `a~b` edge ref, as produced by sdf regionAt) → local
 * water surface y. Refs absent from the map are fully flooded (no surface).
 * The physical rule (user rework 2026-07-18): air regions carry their own
 * water line; transition passages inherit it so you surface exactly where the
 * shaft breaches the pool.
 */
/** A region's local water surface. Three shapes (user 2026-07-19 rework):
 *  `plane` — a room's (possibly tilted) pool; `air` — the whole region is
 *  breathable, no water anywhere; `gap` — a thin air layer hugging a tunnel
 *  ceiling, following the passage profile. */
export type WaterSurface =
  | { kind: 'plane'; y: number; up: [number, number, number]; c: [number, number] }
  | { kind: 'air' }
  | { kind: 'gap'; pts: [number, number, number][]; r: number; gap: number };

/** Effectively "no water below you anywhere in this region". Finite so the
 *  physics (buoyancy distances, splash checks) stay well-behaved. */
export const AIR_LEVEL_Y = -100000;

/** The plane of a dry room's pool: point + normal, from its `water` fraction
 *  along its (false) up. Null when the room holds no water. */
export function roomWaterPlane(n: CaveNode): { p: [number, number, number]; up: [number, number, number]; ry: number } | null {
  if (!n.dry || n.water === undefined) return null;
  const up = n.falseUp ?? [0, 1, 0];
  const ry = n.radius * (n.stretch?.[1] ?? 1);
  const d = ry * (2 * n.water - 1);
  return { p: [n.pos[0] + up[0] * d, n.pos[1] + up[1] * d, n.pos[2] + up[2] * d], up, ry };
}

/** Tunnel bore radius for a width class (mirrors the SDF's carve radii). */
export function edgeRadius(width: CaveEdge['width']): number {
  return width === 'open' ? TUNING.geometry.radiusOpen : width === 'squeeze' ? TUNING.geometry.radiusSqueeze : TUNING.geometry.radiusNormal;
}

/** Height of the local water surface at world (x,y,z) — the y you compare
 *  your head against. Planes tilt; gaps follow the tunnel; air is bottomless. */
export function waterSurfaceLevel(ws: WaterSurface, x: number, y: number, z: number): number {
  if (ws.kind === 'air') return AIR_LEVEL_Y;
  if (ws.kind === 'plane') {
    if (Math.abs(ws.up[1]) < 0.2) return ws.y; // near-horizontal "up": treat as flat
    return ws.y - (ws.up[0] * (x - ws.c[0]) + ws.up[2] * (z - ws.c[1])) / ws.up[1];
  }
  // gap: nearest polyline point → local ceiling minus the air gap
  let best = Infinity;
  let ceilY = y;
  for (let i = 1; i < ws.pts.length; i++) {
    const [ax, ay, az] = ws.pts[i - 1];
    const [bx, by, bz] = ws.pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2));
    const qx = ax + dx * t;
    const qy = ay + dy * t;
    const qz = az + dz * t;
    const d2 = (x - qx) ** 2 + (y - qy) ** 2 + (z - qz) ** 2;
    if (d2 < best) {
      best = d2;
      ceilY = qy + ws.r;
    }
  }
  return ceilY - ws.gap;
}

function planeFor(n: CaveNode): WaterSurface | undefined {
  if (!n.dry) return undefined;
  const pl = roomWaterPlane(n);
  if (!pl) return { kind: 'air' }; // dry + no water field = ALL air
  return { kind: 'plane', y: pl.p[1], up: pl.up, c: [pl.p[0], pl.p[2]] };
}

export function buildAirWaterMap(): Map<string, WaterSurface> {
  const map = new Map<string, WaterSurface>();
  for (const n of NODES) {
    const ws = planeFor(n);
    if (ws) map.set(n.id, ws);
  }
  for (const e of EDGES) {
    const ref = `${e.a}~${e.b}`;
    if (e.airGap !== undefined) {
      map.set(ref, { kind: 'gap', pts: [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos], r: edgeRadius(e.width), gap: e.airGap });
      continue;
    }
    if (e.slide && e.waterY !== undefined) {
      const a = getNode(e.a).pos;
      const b = getNode(e.b).pos;
      map.set(ref, { kind: 'plane', y: e.waterY, up: [0, 1, 0], c: [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2] });
      continue;
    }
    // passages inherit their dry endpoints' water so you surface exactly
    // where the shaft breaches the pool. A real pool plane beats "all air";
    // with two planes, the lower one wins at the passage midpoint.
    const sa = planeFor(getNode(e.a));
    const sb = planeFor(getNode(e.b));
    const planes = [sa, sb].filter((s): s is Extract<WaterSurface, { kind: 'plane' }> => s?.kind === 'plane');
    if (planes.length === 2) {
      const a = getNode(e.a).pos;
      const b = getNode(e.b).pos;
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const mz = (a[2] + b[2]) / 2;
      map.set(ref, waterSurfaceLevel(planes[0], mx, my, mz) <= waterSurfaceLevel(planes[1], mx, my, mz) ? planes[0] : planes[1]);
    } else if (planes.length === 1) {
      map.set(ref, planes[0]);
    } else if (sa?.kind === 'air' || sb?.kind === 'air') {
      map.set(ref, { kind: 'air' });
    }
  }
  return map;
}

/** Region ref → deceptive reference-up (the camera orients to it and the
 *  water tilts with it; only bubbles stay honest). Regions absent from the
 *  map use true world up. */
export function buildFalseUpMap(): Map<string, [number, number, number]> {
  const m = new Map<string, [number, number, number]>();
  for (const n of NODES) if (n.falseUp) m.set(n.id, n.falseUp);
  for (const e of EDGES) if (e.falseUp) m.set(`${e.a}~${e.b}`, e.falseUp);
  return m;
}

/** Edge ref (`a~b`, as regionAt reports) → full polyline. Used by the squeeze
 *  view-cone to know the passage direction at any point along it. */
export function buildEdgePolylines(): Map<string, [number, number, number][]> {
  const m = new Map<string, [number, number, number][]>();
  for (const e of EDGES) {
    m.set(`${e.a}~${e.b}`, [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos]);
  }
  return m;
}

/** Slide regions: edge ref → unit downhill vector (walk mode loses traction here). */
export function buildSlideRegions(): Map<string, [number, number, number]> {
  const map = new Map<string, [number, number, number]>();
  for (const e of EDGES) {
    if (!e.slide) continue;
    const a = getNode(e.a).pos;
    const b = getNode(e.b).pos;
    const high = a[1] >= b[1] ? a : b;
    const low = a[1] >= b[1] ? b : a;
    const d: [number, number, number] = [low[0] - high[0], low[1] - high[1], low[2] - high[2]];
    const len = Math.hypot(...d) || 1;
    map.set(`${e.a}~${e.b}`, [d[0] / len, d[1] / len, d[2] / len]);
  }
  return map;
}

// The cenote mouth: an open shaft of sky above the platform. Part of the map
// (the sinkhole is open-air, LORE §3); carved by the SDF like everything else.
export const SKY_SHAFT = { a: [0, 1, 0] as [number, number, number], b: [0, 26, 0] as [number, number, number], r: 10 };

export const ZONE_COLORS: Record<Zone, number> = {
  sinkhole: 0x4fc3f7,
  galleries: 0x81c784,
  maze: 0xffb74d,
  throat: 0xba68c8,
  abyss: 0x5c6bc0,
};
