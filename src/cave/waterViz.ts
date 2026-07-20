// Water surface meshes, shared by the game and the level editor so what you
// edit is exactly what you swim (user 2026-07-19 water rework):
//  • room pools: the room's own ellipse cross-section at its `water` fill
//    fraction, tilted to its falseUp
//  • tunnel air gaps: thin ribbons hugging the ceiling, following the passage
//  • slide plunge lines: a disc where the chute crosses its `waterY`

import * as THREE from 'three';
import { EDGES, NODES, edgeRadius, getNode, roomWaterPlane } from './data';

export function buildWaterSurfaces(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const zAxis = new THREE.Vector3(0, 0, 1);

  for (const n of NODES) {
    const pl = roomWaterPlane(n);
    if (!pl || n.water === undefined) continue;
    const rel = 2 * n.water - 1;
    if (rel <= -1 || rel >= 1) continue; // surface misses the room (lives down a shaft, or room is brim-full)
    const s = n.stretch ?? [1, 1, 1];
    const chord = Math.sqrt(1 - rel * rel);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 24), material);
    disc.geometry.scale(chord * n.radius * s[0] * 1.08, chord * n.radius * s[2] * 1.08, 1);
    disc.quaternion.setFromUnitVectors(zAxis, new THREE.Vector3(...pl.up).normalize());
    disc.position.set(...pl.p);
    group.add(disc);
  }

  for (const e of EDGES) {
    let pts: [number, number, number][];
    try {
      pts = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
    } catch {
      continue; // dangling edge mid-edit
    }
    if (e.airGap !== undefined) {
      const r = edgeRadius(e.width);
      const gap = Math.min(e.airGap, r * 1.6);
      // surface width where a plane `gap` below the ceiling cuts a bore of radius r
      const drop = r - gap;
      const width = 2 * Math.sqrt(Math.max(0.05, r * r - drop * drop));
      for (let i = 1; i < pts.length; i++) {
        const a = new THREE.Vector3(...pts[i - 1]);
        const b = new THREE.Vector3(...pts[i]);
        const t = b.clone().sub(a);
        const len = t.length();
        if (len < 0.01) continue;
        t.divideScalar(len);
        if (Math.abs(t.y) > 0.92) continue; // near-vertical stretch: no meaningful surface
        const up = new THREE.Vector3(0, 1, 0);
        const normal = up.clone().addScaledVector(t, -t.y).normalize();
        const side = normal.clone().cross(t);
        const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(len, width), material);
        ribbon.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, side, normal));
        ribbon.position.copy(a).add(b).multiplyScalar(0.5);
        ribbon.position.y += r - gap;
        group.add(ribbon);
      }
    } else if (e.slide && e.waterY !== undefined) {
      const w = e.waterY;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay, az] = pts[i - 1];
        const [bx, by, bz] = pts[i];
        if ((ay - w) * (by - w) > 0) continue;
        const t = (w - ay) / (by - ay || 1);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(2.8, 20), material);
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(ax + (bx - ax) * t, w, az + (bz - az) * t);
        group.add(disc);
        break;
      }
    }
  }
  return group;
}
