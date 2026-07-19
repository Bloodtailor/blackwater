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
   * Part of an AIR region (air bell / dry passage). Requires `waterY`: the
   * absolute y of this region's local water surface. Air must be physically
   * coherent (user rework 2026-07-18).
   */
  dry?: boolean;
  /** Local water surface (absolute y, world units) for dry regions. */
  waterY?: number;
  /**
   * DECEPTION (user 2026-07-19): this region's "up" is a lie. The flat floor
   * tilts to this vector, spikes grow along it, and the camera orients itself
   * to it — the room looks level while the water surface and bubbles (which
   * stay honest) look wrong. Normalized at load.
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
  /** Water surface override for this passage (absolute y, world units) —
   *  a slide's plunge line, or a thin breathing gap along a tunnel top. */
  waterY?: number;
  /** Deceptive reference-up for this passage (see CaveNode.falseUp). */
  falseUp?: [number, number, number];
}

interface Layout {
  nodes: CaveNode[];
  edges: CaveEdge[];
  zoneHubs: Record<Zone, string>;
}

const layout = layoutJson as unknown as Layout;

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
export function buildAirWaterMap(): Map<string, number> {
  const map = new Map<string, number>();
  for (const n of NODES) {
    if (n.dry && n.waterY !== undefined) map.set(n.id, n.waterY);
  }
  for (const e of EDGES) {
    const ref = `${e.a}~${e.b}`;
    if (e.waterY !== undefined) {
      map.set(ref, e.waterY);
      continue;
    }
    const a = getNode(e.a);
    const b = getNode(e.b);
    if (a.dry && b.dry) map.set(ref, Math.min(a.waterY ?? Infinity, b.waterY ?? Infinity));
    else if (a.dry && a.waterY !== undefined) map.set(ref, a.waterY);
    else if (b.dry && b.waterY !== undefined) map.set(ref, b.waterY);
  }
  return map;
}

/** Region ref → deceptive reference-up (the camera orients to it; water and
 *  bubbles stay honest). Regions absent from the map use true world up. */
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
