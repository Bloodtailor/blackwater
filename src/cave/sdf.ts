// Analytic signed distance field of the passable cave volume, derived from
// the graph (data.ts). Convention: d < 0 inside water/passable space, d > 0
// inside rock. The SAME field drives mesh generation (mesh.ts) and collision
// (main), so the two can never disagree. Three-free: testable in node.
//
// Shape language (M2.5, user feedback): chambers are ELLIPSOIDS (per-axis
// stretch), big rooms get large-scale wall warp so nothing reads as a sphere,
// rooms can contain solid rock PILLARS, and door plugs are flat DISCS aligned
// to the tunnel so they never bulge into neighboring passages.

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
  r: number; // capsule radius (segments) / nominal radius (chambers)
  rx: number; ry: number; rz: number; // ellipsoid radii (chambers)
  ellipsoid: boolean;
  solid: boolean; // pillars: subtract from passable space
  broad: number; // large-scale wall-warp amplitude (big chambers)
  noiseAmp: number;
}

export interface DoorBlock {
  id: string;
  c: [number, number, number];
  axis: [number, number, number];
  r: number;
  halfLen: number;
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

function segPrim(base: Omit<Prim, 'rx' | 'ry' | 'rz' | 'ellipsoid' | 'solid' | 'broad'>, solid = false): Prim {
  return { ...base, rx: base.r, ry: base.r, rz: base.r, ellipsoid: false, solid, broad: 0 };
}

export function initSdf(): void {
  prims = [];

  // Edge polylines first: pillars must keep guaranteed clearance from every
  // authored path (a pillar in a tunnel mouth is a softlock; the swim/pathing
  // systems assume polylines are swimmable).
  const pathSamples: [number, number, number][] = [];
  for (const e of EDGES) {
    const pts: [number, number, number][] = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, az] = pts[i - 1];
      const [bx, by, bz] = pts[i];
      const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        pathSamples.push([ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t]);
      }
    }
  }
  const horizClearanceTo = (px: number, pz: number, yLo: number, yHi: number): number => {
    let best = Infinity;
    for (const [sx, sy, sz] of pathSamples) {
      if (sy < yLo - 2 || sy > yHi + 2) continue;
      const d = Math.hypot(sx - px, sz - pz);
      if (d < best) best = d;
    }
    return best;
  };

  for (const n of NODES) {
    const s = n.stretch ?? [1, 1, 1];
    const rx = n.radius * s[0];
    const ry = n.radius * s[1];
    const rz = n.radius * s[2];
    const maxR = Math.max(rx, ry, rz);
    prims.push({
      ax: n.pos[0], ay: n.pos[1], az: n.pos[2],
      bx: n.pos[0], by: n.pos[1], bz: n.pos[2],
      r: n.radius, rx, ry, rz,
      ellipsoid: true,
      solid: false,
      broad: n.radius >= 4 ? Math.min(maxR * 0.15, 3.5) : 0,
      noiseAmp: noiseAmpFor(Math.min(rx, ry, rz)),
      zone: n.zone, width: 'chamber', ref: n.id,
    });
    // pillars: deterministic solid columns, mid-band of the room only, shrunk
    // or skipped so they always clear every authored path by ≥1.1 m.
    if (n.pillars) {
      const yLo = n.pos[1] - ry;
      const yHi = n.pos[1] + ry;
      for (let i = 0; i < n.pillars; i++) {
        const ang = i * 2.399 + n.pos[0] * 0.7 + n.pos[2] * 0.3;
        const rr = 0.3 + 0.3 * Math.abs(Math.sin(i * 5.7 + n.pos[1]));
        const px = n.pos[0] + Math.cos(ang) * rx * rr;
        const pz = n.pos[2] + Math.sin(ang) * rz * rr;
        const want = 0.7 + 0.7 * Math.abs(Math.sin(i * 3.1 + n.pos[2]));
        const pr = Math.min(want, horizClearanceTo(px, pz, yLo, yHi) - 1.1);
        if (pr < 0.4) continue;
        prims.push(segPrim({
          ax: px, ay: n.pos[1] - ry * 0.95, az: pz,
          bx: px, by: n.pos[1] + ry * 0.95, bz: pz,
          r: pr, noiseAmp: 0.3, zone: n.zone, width: 'chamber', ref: `${n.id}-pillar${i}`,
        }, true));
      }
    }
  }
  prims.push(segPrim({
    ax: SKY_SHAFT.a[0], ay: SKY_SHAFT.a[1], az: SKY_SHAFT.a[2],
    bx: SKY_SHAFT.b[0], by: SKY_SHAFT.b[1], bz: SKY_SHAFT.b[2],
    r: SKY_SHAFT.r, noiseAmp: noiseAmpFor(SKY_SHAFT.r), zone: 'sinkhole', width: 'chamber', ref: 'sky-shaft',
  }));
  for (const e of EDGES) {
    const pts: [number, number, number][] = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
    const r = widthRadius(e.width);
    for (let i = 1; i < pts.length; i++) {
      prims.push(segPrim({
        ax: pts[i - 1][0], ay: pts[i - 1][1], az: pts[i - 1][2],
        bx: pts[i][0], by: pts[i][1], bz: pts[i][2],
        r, noiseAmp: noiseAmpFor(r), zone: getNode(e.a).zone, width: e.width, ref: `${e.a}~${e.b}`,
      }));
    }
  }
  // spatial hash + world bounds
  hash = new Map();
  const mn: [number, number, number] = [Infinity, Infinity, Infinity];
  const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  prims.forEach((p, idx) => {
    const maxR = Math.max(p.rx, p.ry, p.rz);
    const pad = maxR + p.broad + G.noiseAmpMax + 1.2;
    const lo = [Math.min(p.ax, p.bx) - pad, Math.min(p.ay, p.by) - pad, Math.min(p.az, p.bz) - pad];
    const hi = [Math.max(p.ax, p.bx) + pad, Math.max(p.ay, p.by) + pad, Math.max(p.az, p.bz) + pad];
    if (!p.solid) {
      for (let a = 0; a < 3; a++) {
        mn[a] = Math.min(mn[a], lo[a]);
        mx[a] = Math.max(mx[a], hi[a]);
      }
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

// Ellipsoid SDF approximation (good near the surface, exact at center line).
function ellipsoidDist(px: number, py: number, pz: number, p: Prim): number {
  const dx = px - p.ax, dy = py - p.ay, dz = pz - p.az;
  const k0 = Math.sqrt((dx / p.rx) ** 2 + (dy / p.ry) ** 2 + (dz / p.rz) ** 2);
  if (k0 < 1e-4) return -Math.min(p.rx, p.ry, p.rz);
  const k1 = Math.sqrt((dx / (p.rx * p.rx)) ** 2 + (dy / (p.ry * p.ry)) ** 2 + (dz / (p.rz * p.rz)) ** 2);
  return (k0 * (k0 - 1)) / k1;
}

// Core field. withDoors: closed doors add flat disc plugs (CSG subtract).
export function sdf(x: number, y: number, z: number, withDoors = true): number {
  const list = hash.get(hashKey(Math.floor(x / HASH_CELL), Math.floor(y / HASH_CELL), Math.floor(z / HASH_CELL)));
  let d = BIG;
  if (list) {
    const noise = fbm(x * G.noiseFreq, y * G.noiseFreq, z * G.noiseFreq);
    let broadNoise: number | null = null;
    // pass 1: union of passable space
    for (const idx of list) {
      const p = prims[idx];
      if (p.solid) continue;
      const base = p.ellipsoid ? ellipsoidDist(x, y, z, p) : segDist(x, y, z, p) - p.r;
      let di = base - noise * p.noiseAmp;
      if (p.broad > 0) {
        if (broadNoise === null) broadNoise = fbm(x * 0.06 + 31.7, y * 0.06, z * 0.06, 2);
        di -= broadNoise * p.broad;
      }
      if (di < d) d = di;
    }
    // pass 2: subtract solid pillars
    for (const idx of list) {
      const p = prims[idx];
      if (!p.solid) continue;
      const ds = segDist(x, y, z, p) - p.r - noise * p.noiseAmp;
      if (-ds > d) d = -ds;
    }
  }
  if (withDoors) {
    for (const b of doorBlocks) {
      const rx = x - b.c[0], ry = y - b.c[1], rz = z - b.c[2];
      const axial = rx * b.axis[0] + ry * b.axis[1] + rz * b.axis[2];
      const ox = rx - axial * b.axis[0], oy = ry - axial * b.axis[1], oz = rz - axial * b.axis[2];
      const radial = Math.sqrt(ox * ox + oy * oy + oz * oz);
      const dd = Math.max(Math.abs(axial) - b.halfLen, radial - b.r);
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
    if (p.solid) continue;
    const di = p.ellipsoid ? ellipsoidDist(x, y, z, p) : segDist(x, y, z, p) - p.r;
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
