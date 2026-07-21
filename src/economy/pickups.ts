// World pickups (M13, DESIGN §10.3/§10.6, LORE §4 v3 rows): dynamite crates,
// brass grate keys on their hook boards, fuel slugs. Placed by data
// (`contents.pickup` on nodes), rested on real rock via SDF probes — nothing
// hand-placed. E takes it onto the belt; empty dead ends finally pay.

import * as THREE from 'three';
import { NODES, type CaveNode } from '../cave/data';
import { sdf } from '../cave/sdf';
import { wallSpot, orientToWall } from './shops';
import type { InteractSystem } from './interact';
import type { Inventory } from './inventory';

function floorRest(n: CaveNode, dx = 0, dz = 0): THREE.Vector3 {
  let y = n.pos[1];
  for (let d = 0; d < n.radius + 2; d += 0.25) {
    if (sdf(n.pos[0] + dx, n.pos[1] - d, n.pos[2] + dz) > -0.3) {
      y = n.pos[1] - d + 0.3;
      break;
    }
  }
  return new THREE.Vector3(n.pos[0] + dx, y, n.pos[2] + dz);
}

function dynamiteCrate(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.9, flatShading: true });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.4), wood);
  g.add(crate);
  const red = new THREE.MeshStandardMaterial({ color: 0x8a2f24, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), red);
    stick.rotation.z = Math.PI / 2;
    stick.position.set(0, 0.19, (i - 1) * 0.09);
    g.add(stick);
  }
  const fuse = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.012, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xcabfa5, roughness: 0.9 }),
  );
  fuse.position.set(0.2, 0.24, 0);
  g.add(fuse);
  return g;
}

function keyBoard(): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.62, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x4a3d2a, roughness: 0.85, flatShading: true }),
  );
  g.add(board);
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x9a7d3a, roughness: 0.35, metalness: 0.8 });
  // more hooks than keys (LORE §4 v3) — one key hangs, the rest are empty
  for (let i = 0; i < 6; i++) {
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6), brassMat);
    hook.position.set(((i % 3) - 1) * 0.15, 0.18 - Math.floor(i / 3) * 0.28, 0.05);
    hook.rotation.x = 0.5;
    g.add(hook);
  }
  const key = new THREE.Group();
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12), brassMat);
  key.add(bow);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6), brassMat);
  shaft.position.y = -0.1;
  key.add(shaft);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.014), brassMat);
  bit.position.set(0.02, -0.16, 0);
  key.add(bit);
  const tag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xcabfa5, roughness: 0.9, side: THREE.DoubleSide }),
  );
  tag.position.set(-0.06, -0.05, 0.01);
  tag.rotation.z = 0.4;
  key.add(tag);
  key.position.set(-0.15, 0.16, 0.06);
  key.name = 'key';
  g.add(key);
  return g;
}

function slugProp(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.34, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.4, metalness: 0.75 }),
  );
  g.add(body);
  const seam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.092, 0.092, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0x1e3a42, emissive: 0x3fc8e8, emissiveIntensity: 0.9, roughness: 0.4 }),
  );
  g.add(seam);
  const wrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.094, 0.094, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0xcabfa5, roughness: 0.95 }),
  );
  wrap.position.y = -0.1;
  g.add(wrap);
  return g;
}

export function buildPickups(scene: THREE.Scene, interact: InteractSystem, inv: Inventory, toast: (m: string) => void): number {
  let placed = 0;
  for (const n of NODES) {
    const p = n.contents?.pickup;
    if (!p || n.teaser) continue;
    placed++;
    let group: THREE.Group;
    let pos: THREE.Vector3;
    if (p.kind === 'key') {
      // keys hang on their board on a wall (site rooms)
      group = keyBoard();
      const spot = wallSpot(n);
      orientToWall(group, spot);
      pos = spot.pos;
    } else {
      group = p.kind === 'dynamite' ? dynamiteCrate() : slugProp();
      pos = floorRest(n, n.radius * 0.3, -n.radius * 0.25);
      group.position.copy(pos);
      group.rotation.y = Math.random() * Math.PI * 2;
    }
    scene.add(group);
    let taken = false;
    const label = p.kind === 'dynamite' ? 'DYNAMITE — BLASTING · CORMORANT' : p.kind === 'slug' ? 'FUEL SLUG — CORMORANT OUTPUT' : `BRASS KEY — ${p.label ?? 'UNTAGGED'}`;
    interact.add({
      id: `pickup:${n.id}`,
      pos: [pos.x, pos.y, pos.z],
      prompt: () => (taken ? null : { text: `TAKE — ${label}`, holdSec: 0, enabled: true }),
      execute: () => {
        if (taken) return;
        taken = true;
        if (p.kind === 'dynamite') {
          inv.addDynamite();
          // the crate stays; the sticks leave it
          group.traverse((o) => {
            if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).color?.getHex() === 0x8a2f24) o.visible = false;
          });
        } else if (p.kind === 'slug') {
          inv.addSlug();
          group.visible = false;
        } else if (p.keyFor) {
          inv.addKey(p.keyFor, p.label ?? 'KEY');
          const k = group.getObjectByName('key');
          if (k) k.visible = false; // the hook goes empty
        }
        toast(`${label} — ON THE BELT`);
      },
    });
  }
  return placed;
}
