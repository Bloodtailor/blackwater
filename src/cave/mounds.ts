// Chalk mounds (DESIGN §7.2, LORE §4): pale bulbous stacked flowstone with a
// faint shimmer — the silt trap. One mound per chalkMound-tagged node, placed
// by PROBING THE SDF for the actual floor (M3 lesson: never trust node math
// for anything that sits on geometry). Detonation/re-arm state lives in the
// silt system; meshes here just sync to it.

import * as THREE from 'three';
import { NODES } from './data';
import { sdf } from './sdf';
import { softDotTexture } from '../effects/atmosphere';

export interface MoundSpot {
  nodeId: string;
  /** Base of the stack (on the floor). */
  base: [number, number, number];
  /** Touch-detection point (mid-height). */
  center: [number, number, number];
  height: number;
}

// Pure placement (three-free): deterministic off-center spot, floor via SDF.
export function placeMounds(): MoundSpot[] {
  const spots: MoundSpot[] = [];
  for (const n of NODES.filter((n) => n.tags.includes('chalkMound'))) {
    const s = n.stretch ?? [1, 1, 1];
    const rx = n.radius * s[0];
    const ry = n.radius * s[1];
    const rz = n.radius * s[2];
    // deterministic horizontal offset: guards the room without centering it
    const ang = n.pos[0] * 1.3 + n.pos[2] * 0.7;
    let bx = n.pos[0] + Math.cos(ang) * rx * 0.35;
    let bz = n.pos[2] + Math.sin(ang) * rz * 0.35;
    // if that spot is inside rock (pillar, wall bulge), fall back to center
    if (sdf(bx, n.pos[1], bz) > -0.5) {
      bx = n.pos[0];
      bz = n.pos[2];
    }
    // march down to the floor
    let y = n.pos[1];
    const yMin = n.pos[1] - ry * 1.6;
    while (y > yMin && sdf(bx, y - 0.25, bz) < -0.35) y -= 0.25;
    const height = 1.1 + 0.5 * Math.abs(Math.sin(ang * 2.7));
    spots.push({
      nodeId: n.id,
      base: [bx, y - 0.2, bz],
      center: [bx, y - 0.2 + height * 0.45, bz],
      height,
    });
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
    // stacked, flattened, shrinking bulbs
    let y = 0;
    const bulbs = 4 + (Math.abs(Math.floor(seed)) % 2);
    for (let i = 0; i < bulbs; i++) {
      const t = i / bulbs;
      const r = (0.62 - 0.42 * t) * (spot.height / 1.4);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), mat);
      bulb.scale.y = 0.62;
      bulb.position.set(
        Math.sin(seed * 3 + i * 2.4) * 0.12,
        y + r * 0.45,
        Math.cos(seed * 2 + i * 1.9) * 0.12,
      );
      y += r * 0.72;
      group.add(bulb);
    }
    // faint particle shimmer (armed tell — learnable at a glance)
    const count = 16;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.5;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * spot.height * 1.2;
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

/** Sync mound visuals to armed state: blown mounds slump; shimmer is the armed tell. */
export function syncMounds(visuals: MoundVisual[], armed: Map<string, boolean>, time: number): void {
  for (const v of visuals) {
    const isArmed = armed.get(v.spot.nodeId) ?? true;
    const targetY = isArmed ? 1 : 0.55;
    v.group.scale.y += (targetY - v.group.scale.y) * 0.05;
    v.shimmer.visible = isArmed;
    if (isArmed) {
      (v.shimmer.material as THREE.PointsMaterial).opacity = 0.35 + 0.2 * Math.sin(time * 2.1 + v.spot.base[0]);
    }
  }
}
