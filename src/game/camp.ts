// Lowe's camp (M16.5, user 2026-07-21: "the starting room should also look
// very nice"): the recovery diver's shore station on the sinkhole platform.
// A cot, the work table with his ledger, stacked requisition crates, the
// standing work lamp (the camp's warm glow), and the small kit that a
// methodical man lays out and squares off. All procedural; every prop rests
// on the real floor by SDF probe. LORE §2: he keeps things in order.

import * as THREE from 'three';
import { NODES } from '../cave/data';
import { sdf } from '../cave/sdf';

/** Floor height at x/z near the platform: march down from high in the open
 *  cenote air and take the first AIR→ROCK crossing. (Probing from a fixed
 *  start height buried every prop when the start point was already inside
 *  the rising shore slope.) */
function floorAt(x: number, z: number, fromY: number): number | null {
  let wasAir = false;
  for (let d = 0; d < 12; d += 0.12) {
    const s = sdf(x, fromY - d, z);
    if (s < -0.5) wasAir = true;
    else if (wasAir && s > -0.25) return fromY - d;
  }
  return null;
}

export function buildCamp(scene: THREE.Scene): void {
  const n = NODES.find((x) => x.tags.includes('surface'));
  if (!n) return;
  const root = new THREE.Group();
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0x5a5844, roughness: 0.95 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3d2c, roughness: 0.9 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x4e4a38, roughness: 0.85 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x3a3f42, roughness: 0.6, metalness: 0.4 });
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xc9c2a8, roughness: 0.9 });

  // prop placer: rests `build`'s group on the real floor at (dx, dz) from
  // the platform node; skips silently if there's no dry floor there
  const at = (dx: number, dz: number, rotY: number, build: (g: THREE.Group) => void): void => {
    const x = n.pos[0] + dx;
    const z = n.pos[2] + dz;
    const fy = floorAt(x, z, n.pos[1] + 6);
    if (fy === null) return;
    const g = new THREE.Group();
    build(g);
    g.position.set(x, fy, z);
    g.rotation.y = rotY;
    root.add(g);
  };

  // ── the work table: legs, top, the ledger and squared papers ──
  at(1.0, -1.6, 0.4, (g) => {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.8), woodMat);
    top.position.y = 0.78;
    g.add(top);
    for (const [sx, sz] of [[-0.68, -0.32], [0.68, -0.32], [-0.68, 0.32], [0.68, 0.32]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), woodMat);
      leg.position.set(sx, 0.39, sz);
      g.add(leg);
    }
    // the ledger: open, dead center — the tally lives here
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.26), paperMat);
    ledger.position.set(0.1, 0.83, 0);
    g.add(ledger);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.035, 0.26), new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 0.8 }));
    spine.position.set(0.1, 0.832, 0);
    g.add(spine);
    // squared paper stack + a mug
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.3), paperMat);
    stack.position.set(-0.45, 0.84, -0.15);
    g.add(stack);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 10), steelMat);
    mug.position.set(-0.35, 0.86, 0.22);
    g.add(mug);
    // the camp stool
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.45, 8), canvasMat);
    stool.position.set(0.15, 0.22, 0.75);
    g.add(stool);
  });

  // ── the cot: frame + taut canvas + folded blanket, squared away ──
  at(2.7, 1.7, -1.15, (g) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.75), woodMat);
    frame.position.y = 0.32;
    g.add(frame);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.05, 0.68), canvasMat);
    bed.position.y = 0.38;
    g.add(bed);
    for (const [sx, sz] of [[-0.85, -0.28], [0.85, -0.28], [-0.85, 0.28], [0.85, 0.28]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.07), woodMat);
      leg.position.set(sx, 0.16, sz);
      g.add(leg);
    }
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.62), new THREE.MeshStandardMaterial({ color: 0x44503e, roughness: 0.95 }));
    blanket.position.set(-0.6, 0.44, 0);
    g.add(blanket);
  });

  // ── crate stacks: the requisitions, stencil-dark ──
  const crate = (g: THREE.Group, x: number, y: number, z: number, w: number, rot = 0): void => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, 0.6), crateMat);
    c.position.set(x, y + 0.21, z);
    c.rotation.y = rot;
    g.add(c);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.05, 0.62), woodMat);
    strap.position.set(x, y + 0.21, z);
    strap.rotation.y = rot;
    g.add(strap);
  };
  at(-0.4, 2.7, 0.7, (g) => {
    crate(g, 0, 0, 0, 0.85);
    crate(g, 0.05, 0.42, 0.02, 0.85, 0.12);
    crate(g, 0.95, 0, 0.1, 0.7, -0.2);
  });

  // ── the standing work lamp: the camp's warm heart ──
  at(1.9, 0.2, 0, (g) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.9, 8), steelMat);
    pole.position.y = 0.95;
    g.add(pole);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 10, 1, true), steelMat);
    hood.position.y = 1.92;
    g.add(hood);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xd8a850, emissiveIntensity: 1.6 }),
    );
    bulb.position.y = 1.85;
    g.add(bulb);
    const light = new THREE.PointLight(0xf0d8a0, 2.4, 12, 1.6);
    light.position.y = 1.86;
    g.add(light);
    // the battery box it runs from, cable sagging
    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.2), steelMat);
    cell.position.set(0.3, 0.12, 0.15);
    g.add(cell);
  });

  // ── the kit: duffel, rope coil, jerry can — squared off in a row ──
  at(0.2, -2.9, 1.9, (g) => {
    const duffel = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), canvasMat);
    duffel.rotation.z = Math.PI / 2;
    duffel.position.y = 0.18;
    g.add(duffel);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14), new THREE.MeshStandardMaterial({ color: 0x6a5f45, roughness: 0.95 }));
    coil.rotation.x = Math.PI / 2;
    coil.position.set(0.55, 0.06, 0);
    g.add(coil);
    const can = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.16), new THREE.MeshStandardMaterial({ color: 0x4e5238, roughness: 0.7, metalness: 0.2 }));
    can.position.set(0.95, 0.2, 0.05);
    g.add(can);
  });

  scene.add(root);
}
