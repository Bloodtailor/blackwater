// Chalk COLUMNS (user rework 2026-07-18: the floor-standing rock piles told
// you which way was down — columns span floor to ceiling like the rock
// pillars, so they're orientation-neutral). Same silt-trap mechanic (DESIGN
// §7.2): pale, shimmering while armed, detonate on touch/shot, re-arm on full
// clear. Placed by PROBING THE SDF for real floor and ceiling (M3 lesson).

import * as THREE from 'three';
import { EDGES, getNode, NODES } from './data';
import { sdf } from './sdf';
import { softDotTexture } from '../effects/atmosphere';

export interface MoundSpot {
  nodeId: string;
  /** Column endpoints: floor anchor and ceiling anchor. */
  base: [number, number, number];
  top: [number, number, number];
}

/** Squared distance from a point to the column's axis segment (touch check). */
export function columnDistSq(spot: MoundSpot, x: number, y: number, z: number): number {
  const [ax, ay, az] = spot.base;
  const abx = spot.top[0] - ax, aby = spot.top[1] - ay, abz = spot.top[2] - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby + (z - az) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = x - (ax + abx * t), dy = y - (ay + aby * t), dz = z - (az + abz * t);
  return dx * dx + dy * dy + dz * dz;
}

// Pure placement (three-free): deterministic off-center spot with clearance
// from every authored path (a trap you must be able to swim wide of), floor
// and ceiling found by marching the SDF.
export function placeMounds(): MoundSpot[] {
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
  const clearanceAt = (px: number, pz: number, yLo: number, yHi: number): number => {
    let best = Infinity;
    for (const [sx, sy, sz] of pathSamples) {
      if (sy < yLo - 2 || sy > yHi + 2) continue;
      const d = Math.hypot(sx - px, sz - pz);
      if (d < best) best = d;
    }
    return best;
  };

  const spots: MoundSpot[] = [];
  for (const n of NODES.filter((n) => n.tags.includes('chalkMound'))) {
    const s = n.stretch ?? [1, 1, 1];
    const rx = n.radius * s[0];
    const ry = n.radius * s[1];
    const rz = n.radius * s[2];
    // try a few angles; take the first with path clearance (or the best)
    let bx = n.pos[0];
    let bz = n.pos[2];
    let bestClear = -Infinity;
    for (let k = 0; k < 6; k++) {
      const ang = n.pos[0] * 1.3 + n.pos[2] * 0.7 + k * 1.9;
      const cx = n.pos[0] + Math.cos(ang) * rx * 0.4;
      const cz = n.pos[2] + Math.sin(ang) * rz * 0.4;
      if (sdf(cx, n.pos[1], cz) > -0.6) continue; // inside rock/pillar
      const clear = clearanceAt(cx, cz, n.pos[1] - ry, n.pos[1] + ry);
      if (clear > bestClear) {
        bestClear = clear;
        bx = cx;
        bz = cz;
      }
      if (clear >= 1.3) break;
    }
    let yF = n.pos[1];
    const yMin = n.pos[1] - ry * 1.6;
    while (yF > yMin && sdf(bx, yF - 0.25, bz) < -0.35) yF -= 0.25;
    let yC = n.pos[1];
    const yMax = n.pos[1] + ry * 1.6;
    while (yC < yMax && sdf(bx, yC + 0.25, bz) < -0.35) yC += 0.25;
    spots.push({ nodeId: n.id, base: [bx, yF - 0.3, bz], top: [bx, yC + 0.3, bz] });
  }
  return spots;
}

export interface MoundVisual {
  spot: MoundSpot;
  group: THREE.Group;
  shimmer: THREE.Points;
}

export function buildMounds(scene: THREE.Scene, spots: MoundSpot[]): MoundVisual[] {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xded8c6, // pale chalk — the only pale thing down there
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
    emissive: 0x0e0d0a, // barely-there lift so the silhouette reads in murk
  });
  return spots.map((spot) => {
    const group = new THREE.Group();
    const seed = spot.base[0] * 2.1 + spot.base[2];
    const height = spot.top[1] - spot.base[1];
    // bulged column: stacked squashed bulbs floor to ceiling — no up, no down
    const bulbs = Math.max(4, Math.ceil(height / 0.55));
    for (let i = 0; i < bulbs; i++) {
      const t = bulbs > 1 ? i / (bulbs - 1) : 0;
      const r = 0.42 + 0.2 * Math.sin(seed * 2 + i * 1.7) + 0.1 * Math.sin(i * 4.1);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.3, r), 9, 7), mat);
      bulb.scale.y = 0.7;
      bulb.position.set(
        Math.sin(seed * 3 + i * 2.4) * 0.14,
        t * height,
        Math.cos(seed * 2 + i * 1.9) * 0.14,
      );
      group.add(bulb);
    }
    // faint particle shimmer along the column (armed tell)
    const count = 20;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 * 2.7;
      const r = 0.6 + Math.random() * 0.5;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (i / count) * height;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const shimmer = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: softDotTexture(),
        color: 0xf2ecda,
        size: 0.05,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    group.add(shimmer);
    group.position.set(...spot.base);
    scene.add(group);
    return { spot, group, shimmer };
  });
}

/** Sync visuals to armed state: a blown column sheds its crust (thins); the
 *  shimmer is the armed tell. */
export function syncMounds(visuals: MoundVisual[], armed: Map<string, boolean>, time: number): void {
  for (const v of visuals) {
    const isArmed = armed.get(v.spot.nodeId) ?? true;
    const target = isArmed ? 1 : 0.68;
    v.group.scale.x += (target - v.group.scale.x) * 0.05;
    v.group.scale.z = v.group.scale.x;
    v.shimmer.visible = isArmed;
    if (isArmed) {
      (v.shimmer.material as THREE.PointsMaterial).opacity = 0.35 + 0.2 * Math.sin(time * 2.1 + v.spot.base[0]);
    }
  }
}
