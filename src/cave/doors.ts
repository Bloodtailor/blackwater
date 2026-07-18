// Doors: debris chokes, grates, and the pressure hatch (DESIGN §10.3), plus
// the power gate at the Bench. Visual meshes here; collision comes from door
// plug spheres fed into the SDF (setDoorBlocks). Buy-open flow lands in M6 —
// M2 provides state + debug open.

import * as THREE from 'three';
import { EDGES, getNode, type CaveEdge } from './data';
import { setDoorBlocks, type DoorBlock } from './sdf';
import { TUNING } from '../tuning';

export interface Door {
  id: string;
  edge: CaveEdge;
  kind: 'debris' | 'grate' | 'hatch' | 'powerGate';
  cost: number;
  open: boolean;
  group: THREE.Group;
}

// Pure placement math (three-free callers: tests).
export function doorPlacement(e: CaveEdge): { pos: [number, number, number]; dir: [number, number, number]; blockR: number } {
  const pts: [number, number, number][] = [getNode(e.a).pos, ...(e.waypoints ?? []), getNode(e.b).pos];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    segLens.push(l);
    total += l;
  }
  let half = total * (e.door?.at ?? 0.5);
  let seg = 0;
  while (seg < segLens.length - 1 && half > segLens[seg]) {
    half -= segLens[seg];
    seg++;
  }
  const t = segLens[seg] > 0 ? half / segLens[seg] : 0;
  const a = pts[seg];
  const b = pts[seg + 1];
  const pos: [number, number, number] = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const dl = segLens[seg] || 1;
  const dir: [number, number, number] = [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl, (b[2] - a[2]) / dl];
  const g = TUNING.geometry;
  const tunnelR = e.width === 'open' ? g.radiusOpen : e.width === 'squeeze' ? g.radiusSqueeze : g.radiusNormal;
  return { pos, dir, blockR: tunnelR + g.doorBlockPad };
}

export function doorEdges(): CaveEdge[] {
  return EDGES.filter((e) => e.door || e.powerGate);
}

export function computeDoorBlocks(doors: { edge: CaveEdge; open: boolean }[]): DoorBlock[] {
  return doors
    .filter((d) => !d.open)
    .map((d) => {
      const p = doorPlacement(d.edge);
      return {
        id: `${d.edge.a}→${d.edge.b}`,
        c: p.pos,
        axis: p.dir,
        r: p.blockR,
        halfLen: TUNING.geometry.doorBlockHalfLen,
      };
    });
}

function debrisMesh(radius: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.97, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const r = 0.45 + Math.abs(Math.sin(i * 7.31)) * 0.65;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    const ang = i * 2.399; // golden angle scatter across the disc
    const rad = Math.abs(Math.sin(i * 3.7)) * radius * 0.75;
    rock.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, Math.sin(i * 5.1) * 0.35);
    rock.rotation.set(i, i * 1.7, i * 0.6);
    g.add(rock);
  }
  return g;
}

function grateMesh(radius: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4045, roughness: 0.55, metalness: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.85, 0.12, 8, 24), mat);
  g.add(ring);
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, radius * 1.7, 0.12), mat);
    bar.position.x = (i - 2) * radius * 0.38;
    g.add(bar);
  }
  return g;
}

function hatchMesh(radius: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x39424a, roughness: 0.5, metalness: 0.7 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, 0.35, 24), body);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.35, 0.09, 8, 20),
    new THREE.MeshStandardMaterial({ color: 0x71322c, roughness: 0.6, metalness: 0.5 }),
  );
  wheel.position.z = 0.35;
  g.add(wheel);
  return g;
}

export function buildDoors(scene: THREE.Scene): Door[] {
  const doors: Door[] = [];
  const Z = new THREE.Vector3(0, 0, 1);
  for (const e of doorEdges()) {
    const kind: Door['kind'] = e.powerGate ? 'powerGate' : e.door!.kind;
    const { pos, dir, blockR } = doorPlacement(e);
    const visualR = blockR - 0.6;
    const group = kind === 'debris' ? debrisMesh(visualR) : kind === 'hatch' ? hatchMesh(visualR) : grateMesh(visualR);
    group.position.set(...pos);
    group.quaternion.setFromUnitVectors(Z, new THREE.Vector3(...dir));
    scene.add(group);
    doors.push({ id: `${e.a}→${e.b}`, edge: e, kind, cost: e.door?.cost ?? 0, open: false, group });
  }
  setDoorBlocks(computeDoorBlocks(doors));
  return doors;
}

export function openDoor(doors: Door[], id: string): boolean {
  const d = doors.find((x) => x.id === id);
  if (!d || d.open) return false;
  d.open = true;
  d.group.visible = false;
  setDoorBlocks(computeDoorBlocks(doors));
  return true;
}

export function openAllDoors(doors: Door[]): void {
  for (const d of doors) {
    d.open = true;
    d.group.visible = false;
  }
  setDoorBlocks([]);
}
