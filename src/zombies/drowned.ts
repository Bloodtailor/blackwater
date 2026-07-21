// The Drowned — procedural drift-swimmer rig (DESIGN §8.1, LORE §4).
// Site personnel, 40 years down: 1968 denim/canvas work gear, tool belts,
// faces ruined by water (a pale blank — murk is the art style; silhouettes
// carry). M14.5 (DESIGN §8.6): the few-variants doctrine is superseded —
// every rig is A MAN from the crew book (roster.ts), deterministic from his
// rigSeed: build, palette, and exactly ONE gear prop from his role. Strong
// enough to RECOGNIZE run after run ("You again. Barrow, was it") — the
// recurrence of individuals is the §1.1 wrongness made visceral.

import * as THREE from 'three';
import { mulberry32, type CrewProfile } from './roster';

export interface DrownedRig {
  group: THREE.Group;
  /** Inner body frame: built standing (+Y head, faces +Z). The group carries
   *  position + travel heading; `body` carries the swim-prone pitch. */
  body: THREE.Group;
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Per-rig materials (cloned so corpses can fade out independently). */
  mats: THREE.MeshStandardMaterial[];
  /** All meshes, for weapon raycasts (head mesh has userData.head). */
  meshes: THREE.Mesh[];
}

// One shared unit-box geometry; every part is a scaled instance of it.
let unitBox: THREE.BoxGeometry | null = null;

// Base workwear cuts the crew's gear varies around (skin, shirt, pants,
// accent). Murk palette: dark, desaturated 1968 workwear — pale skin carries
// the silhouette; nothing may read saturated (DESIGN §15).
const BASE_KITS = [
  { skin: 0x5f6d58, shirt: 0x1e2b38, pants: 0x1b2530, accent: 0x120e09 }, // denim coverall
  { skin: 0x66735f, shirt: 0x3b3627, pants: 0x202e3c, accent: 0x0f0c08 }, // canvas shirt
  { skin: 0x57644f, shirt: 0x23262b, pants: 0x1f2328, accent: 0x453c1c }, // dark wool
];

/** Deterministic per-man color: base kit color nudged in hue/lightness by
 *  his seed — enough to tell Carver's denim from Flores's, never saturated. */
function crewColor(base: number, rng: () => number): number {
  const c = new THREE.Color(base);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(
    (hsl.h + (rng() * 2 - 1) * 0.05 + 1) % 1,
    Math.min(0.45, Math.max(0, hsl.s + (rng() * 2 - 1) * 0.08)),
    Math.min(0.42, Math.max(0.04, hsl.l + (rng() * 2 - 1) * 0.06)),
  );
  return c.getHex();
}

export function buildDrowned(crew: CrewProfile): DrownedRig {
  if (!unitBox) unitBox = new THREE.BoxGeometry(1, 1, 1);
  const rng = mulberry32(crew.rigSeed);
  const kit = BASE_KITS[Math.floor(rng() * BASE_KITS.length)];
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true });
    mats.push(m);
    return m;
  };
  const skin = mat(crewColor(kit.skin, rng));
  const shirt = mat(crewColor(kit.shirt, rng));
  const pants = mat(crewColor(kit.pants, rng));
  const accent = mat(crewColor(kit.accent, rng));
  // build: per-man silhouette — height, shoulder width, limb length
  const scale = 0.9 + rng() * 0.2;
  const torsoW = 0.9 + rng() * 0.22;
  const limbLen = 0.92 + rng() * 0.18;

  const meshes: THREE.Mesh[] = [];
  const part = (m: THREE.MeshStandardMaterial, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D): THREE.Mesh => {
    const mesh = new THREE.Mesh(unitBox!, m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  const group = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  group.add(body);

  // torso: chest + hips + tool belt. Origin = chest center.
  part(shirt, 0.52 * torsoW, 0.62, 0.3, 0, 0, 0, body);
  part(pants, 0.44 * torsoW, 0.34, 0.27, 0, -0.48, 0, body);
  part(accent, 0.5 * torsoW, 0.09, 0.33, 0, -0.33, 0, body); // the belt
  const head = part(skin, 0.24, 0.28, 0.25, 0, 0.5, 0.02, body);
  head.userData.head = true;

  // limbs pivot at shoulder/hip groups so they can sway
  const limb = (m: THREE.MeshStandardMaterial, skinM: THREE.MeshStandardMaterial, x: number, y: number, len: number, thick: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    part(m, thick, len * 0.72, thick, 0, -len * 0.36, 0, g);
    part(skinM, thick * 0.85, len * 0.3, thick * 0.85, 0, -len * 0.85, 0, g); // hand/boot
    body.add(g);
    return g;
  };
  const armX = 0.33 * torsoW;
  const armL = limb(shirt, skin, -armX, 0.26, 0.62 * limbLen, 0.13);
  const armR = limb(shirt, skin, armX, 0.26, 0.62 * limbLen, 0.13);
  const legL = limb(pants, accent, -0.14, -0.66, 0.7 * limbLen, 0.15);
  const legR = limb(pants, accent, 0.14, -0.66, 0.7 * limbLen, 0.15);

  // ── the gear prop: exactly ONE per man, from his role (DESIGN §8.6).
  // A carrier's equipment is ALWAYS visible — consistency is absolute. ──
  const pale = mat(crewColor(0x6e7263, rng)); // faded issue-equipment grey-green
  const role = crew.role;
  if (role === 'lamps') {
    // Barrow: the dry-cell on his chest and the lamp above it — the man who
    // always has his battery, because a lamps-man without one isn't one
    part(pale, 0.18, 0.22, 0.12, 0.14 * torsoW, 0.05, 0.19, body);
    part(accent, 0.1, 0.1, 0.08, 0.14 * torsoW, 0.24, 0.19, body);
  } else if (role === 'stores') {
    // the satchel, slung at the hip
    part(pale, 0.24, 0.3, 0.14, -0.3 * torsoW, -0.42, 0.1, body);
  } else if (role === 'pile watch') {
    // the output-slug canister on his back
    part(pale, 0.16, 0.42, 0.16, 0, 0.05, -0.26, body);
  } else if (role === 'drill') {
    part(accent, 0.3, 0.1, 0.31, 0, 0.68, 0.02, body); // hard hat
  } else if (role === 'forward watch' || role === 'hull watch') {
    part(shirt, 0.26, 0.08, 0.27, 0, 0.66, 0.02, body); // watch cap
  } else if (role === 'galley' || role === 'mess') {
    part(pale, 0.4 * torsoW, 0.5, 0.04, 0, -0.18, 0.17, body); // apron
  } else if (role === 'winch' || role === 'rigging' || role === 'boats') {
    part(accent, 0.26, 0.12, 0.26, -0.26 * torsoW, 0.28, -0.08, body); // rope coil, shouldered
  } else if (role === 'infirmary') {
    part(pale, 0.2, 0.24, 0.12, 0.3 * torsoW, -0.44, 0.08, body); // kit box
  } else if (role === 'comms') {
    part(accent, 0.1, 0.16, 0.09, 0.16 * torsoW, 0.12, 0.18, body); // handset on strap
  } else if (role === 'survey') {
    part(pale, 0.1, 0.5, 0.1, 0.12, 0.1, -0.24, body); // chart tube on back
  } else if (role === 'blasting') {
    part(accent, 0.2, 0.16, 0.14, 0.28 * torsoW, -0.42, 0.06, body); // charge satchel
  } else if (role === 'quartermaster') {
    part(pale, 0.2, 0.26, 0.03, -0.2 * torsoW, -0.04, 0.17, body); // the clipboard
  } else if (role === 'diving') {
    part(pale, 0.14, 0.44, 0.14, -0.12, 0.02, -0.25, body); // spare bottle
  } else {
    // workshop / fitter / machinist / stray roles: a tool off the belt
    part(accent, 0.07, 0.24, 0.07, 0.24 * torsoW, -0.42, 0.12, body);
  }

  for (const mesh of meshes) mesh.userData.rigGroup = group;
  return { group, body, head, armL, armR, legL, legR, mats, meshes };
}

export type DrownedPose = 'swim' | 'reach' | 'pause' | 'limp' | 'crawl';

/**
 * Procedural drift-swim animation. `t` is world time + per-zombie phase;
 * `speed01` scales limb effort. Poses ease into each other because every
 * target is approached with the same damped lerp.
 */
export function animateDrowned(rig: DrownedRig, t: number, speed01: number, pose: DrownedPose, dt: number): void {
  // Sign conventions (verified visually, M5): the group's +Z faces travel;
  // bodyPitch POSITIVE tips the head toward travel (prone swim). Limb
  // rotation.x NEGATIVE swings a hanging limb toward travel — so dangling
  // arms on a prone body are ≈ −1.3, a grab-reach is ≈ −2.5, trailing legs
  // are ≈ 0. Head rotation.x NEGATIVE lifts the ruined face at the player.
  const k = Math.min(1, dt * 5); // ease rate for pose blending
  const s = Math.sin(t * 1.7);
  const c = Math.sin(t * 1.7 + Math.PI / 2);
  let armLX = 0, armRX = 0, armZ = 0, legLX = 0, legRX = 0, headX = 0, bodyPitch = 0, roll = 0;
  switch (pose) {
    case 'swim':
      // drift-walk: arms dangle and sway, legs slow alternate kick, the head
      // lifts to keep the face on you
      bodyPitch = 1.15;
      armLX = -1.3 + 0.25 * s * (0.4 + speed01);
      armRX = -1.3 + 0.25 * c * (0.4 + speed01);
      armZ = 0.2;
      legLX = 0.3 * s * (0.5 + speed01);
      legRX = -0.3 * s * (0.5 + speed01);
      headX = -0.75 + 0.1 * c;
      roll = 0.1 * Math.sin(t * 0.9);
      break;
    case 'reach':
      // the grab: both arms extend toward you, firm and unhurried — the way
      // a recovery diver takes hold of a body (LORE §2)
      bodyPitch = 1.3;
      armLX = -2.5;
      armRX = -2.45;
      armZ = 0.1;
      headX = -0.95;
      break;
    case 'pause':
      // remembering a task at an old workstation: upright, arms half-raised
      bodyPitch = 0.15;
      armLX = -0.5 + 0.05 * s;
      armRX = -0.45 + 0.05 * c;
      armZ = 0.08;
      headX = -0.1; // looking at the station, not at you
      break;
    case 'crawl':
      // hauling out of the pool onto dry rock
      bodyPitch = 0.6;
      armLX = -1.6 + 0.5 * s;
      armRX = -1.6 + 0.5 * c;
      legLX = 0.3 * s;
      legRX = -0.3 * s;
      headX = -0.8;
      break;
    case 'limp':
      // corpse drift: everything hangs
      bodyPitch = 0.9;
      armLX = -1.1;
      armRX = -0.9;
      armZ = 0.35;
      legLX = 0.15;
      legRX = 0.05;
      headX = 0.35;
      roll = 0.4;
      break;
  }
  const ease = (o: THREE.Object3D, x: number, z: number): void => {
    o.rotation.x += (x - o.rotation.x) * k;
    o.rotation.z += (z - o.rotation.z) * k;
  };
  ease(rig.armL, armLX, armZ);
  ease(rig.armR, armRX, -armZ);
  ease(rig.legL, legLX, 0.06);
  ease(rig.legR, legRX, -0.06);
  ease(rig.head, headX, 0);
  rig.body.rotation.x += (bodyPitch - rig.body.rotation.x) * k;
  rig.body.rotation.z += (roll - rig.body.rotation.z) * k;
}
