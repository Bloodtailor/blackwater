// Analytic signed distance field of the passable cave volume, derived from
// the graph (data.ts). Convention: d < 0 inside water/passable space, d > 0
// inside rock. The SAME field drives mesh generation (mesh.ts) and collision
// (main), so the two can never disagree. Three-free: testable in node.

import { EDGES, getNode, NODES, SKY_SHAFT, type CaveEdge, type Zone } from './data';
import { fbm } from '../util/noise';
import { TUNING } from '../tuning';

export interface PrimRegion {
  zone: Zone;
  width: 'chamber' | 'open' | 'normal' | 'squeeze';
  ref: string;
}

interface Prim extends PrimRegion {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  r: number;
  noiseAmp: number;
}

export interface DoorBlock {
  id: string;
  c: [number, number, number];
  r: number;
}

const G = TUNING.geometry;
const BIG = 8;
const HASH_CELL = 4;

let prims: Prim[] = [];
let hash = new Map<number, number[]>();
let doorBlocks: DoorBlock[] = [];
export let bounds = { min: [0, 0, 0] as [number, number, number], max: [0, 0, 0] as [number, number, number] };

function widthRadius(w: CaveEdge['width']): number {
  return w === 'open' ? G.radiusOpen : w === 'squeeze' ? G.radiusSqueeze : G.radiusNormal;
}

function noiseAmpFor(r: number): number {
  return Math.min(Math.max(r * G.noiseAmpFactor, 0.12), G.noiseAmpMax);
}

function hashKey(ix: number, iy: number, iz: number): number {
  return (ix + 128) + (iy + 128) * 512 + (iz + 128) * 262144;
}

export function initSdf(): void {
  prims = [];
  for (const n of NODES) {
    const [x, y, z] = n.pos;
    prims.push({ ax: x, ay: y, az: z, bx: x, by: y, bz: z, r: n.radius, noiseAmp: noiseAmpFor(n.radius), zone: n.zone, width: 'chamber', ref: n.id });
  }
  prims.push({
    ax: SKY_SHAFT.a[0], ay: SKY_SHAFT.a[1], az: SKY_SHAFT.a[2],
    bx: SKY_SHAFT.b[0], by: SKY_SHAFT.b[1], bz: SKY_SHAFT.b[2],
    r: SKY_SHAFT.r, noiseAmp: noiseAmpFor(SKY_SHAFT.r), zone: 'sinkhole', width: 'chamber', ref: 'sky-shaft',
  });
  for (const e of EDGES) {
    const pts: [number, number, number][] = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
    const r = widthRadius(e.width);
    for (let i = 1; i < pts.length; i++) {
      prims.push({
        ax: pts[i - 1][0], ay: pts[i - 1][1], az: pts[i - 1][2],
        bx: pts[i][0], by: pts[i][1], bz: pts[i][2],
        r, noiseAmp: noiseAmpFor(r), zone: getNode(e.a).zone, width: e.width, ref: `${e.a}~${e.b}`,
      });
    }
  }
  // spatial hash + world bounds
  hash = new Map();
  const mn: [number, number, number] = [Infinity, Infinity, Infinity];
  const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  prims.forEach((p, idx) => {
    const pad = p.r + G.noiseAmpMax + 1.2;
    const lo = [Math.min(p.ax, p.bx) - pad, Math.min(p.ay, p.by) - pad, Math.min(p.az, p.bz) - pad];
    const hi = [Math.max(p.ax, p.bx) + pad, Math.max(p.ay, p.by) + pad, Math.max(p.az, p.bz) + pad];
    for (let a = 0; a < 3; a++) {
      mn[a] = Math.min(mn[a], lo[a]);
      mx[a] = Math.max(mx[a], hi[a]);
    }
    for (let ix = Math.floor(lo[0] / HASH_CELL); ix <= Math.floor(hi[0] / HASH_CELL); ix++)
      for (let iy = Math.floor(lo[1] / HASH_CELL); iy <= Math.floor(hi[1] / HASH_CELL); iy++)
        for (let iz = Math.floor(lo[2] / HASH_CELL); iz <= Math.floor(hi[2] / HASH_CELL); iz++) {
          const key = hashKey(ix, iy, iz);
          const list = hash.get(key);
          if (list) list.push(idx);
          else hash.set(key, [idx]);
        }
  });
  bounds = { min: mn, max: mx };
}

export function setDoorBlocks(blocks: DoorBlock[]): void {
  doorBlocks = blocks;
}

export function getDoorBlocks(): DoorBlock[] {
  return doorBlocks;
}

function segDist(px: number, py: number, pz: number, p: Prim): number {
  const abx = p.bx - p.ax, aby = p.by - p.ay, abz = p.bz - p.az;
  const apx = px - p.ax, apy = py - p.ay, apz = pz - p.az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Core field. withDoors: closed doors carve solid plugs (CSG subtract).
export function sdf(x: number, y: number, z: number, withDoors = true): number {
  const list = hash.get(hashKey(Math.floor(x / HASH_CELL), Math.floor(y / HASH_CELL), Math.floor(z / HASH_CELL)));
  let d = BIG;
  if (list) {
    const noise = fbm(x * G.noiseFreq, y * G.noiseFreq, z * G.noiseFreq);
    for (const idx of list) {
      const p = prims[idx];
      const di = segDist(x, y, z, p) - p.r - noise * p.noiseAmp;
      if (di < d) d = di;
    }
  }
  if (withDoors) {
    for (const b of doorBlocks) {
      const dx = x - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz) - b.r;
      if (-dd > d) d = -dd;
    }
  }
  return d;
}

export function regionAt(x: number, y: number, z: number): PrimRegion | null {
  const list = hash.get(hashKey(Math.floor(x / HASH_CELL), Math.floor(y / HASH_CELL), Math.floor(z / HASH_CELL)));
  if (!list || list.length === 0) return null;
  let best = Infinity;
  let bestPrim: Prim | null = null;
  for (const idx of list) {
    const p = prims[idx];
    const di = segDist(x, y, z, p) - p.r;
    if (di < best) {
      best = di;
      bestPrim = p;
    }
  }
  return bestPrim ? { zone: bestPrim.zone, width: bestPrim.width, ref: bestPrim.ref } : null;
}

const EPS = 0.15;
export function gradient(x: number, y: number, z: number, out: [number, number, number]): void {
  out[0] = sdf(x + EPS, y, z) - sdf(x - EPS, y, z);
  out[1] = sdf(x, y + EPS, z) - sdf(x, y - EPS, z);
  out[2] = sdf(x, y, z + EPS) - sdf(x, y, z - EPS);
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= len;
  out[1] /= len;
  out[2] /= len;
}

// Push a point back inside passable space with `clearance` from the wall.
// Returns true if a correction was applied.
export function resolveCollision(pos: { x: number; y: number; z: number }, clearance: number): boolean {
  let corrected = false;
  const g: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const d = sdf(pos.x, pos.y, pos.z);
    if (d <= -clearance) break;
    gradient(pos.x, pos.y, pos.z, g);
    const push = d + clearance + 0.01;
    pos.x -= g[0] * push;
    pos.y -= g[1] * push;
    pos.z -= g[2] * push;
    corrected = true;
  }
  return corrected;
}
