// The Drowned — procedural drift-swimmer rig (DESIGN §8.1, LORE §4).
// Site personnel, 40 years down: 1968 denim/canvas work gear, tool belts,
// faces ruined by water (a pale blank — murk is the art style; silhouettes
// carry). Variants are deliberately FEW: the same men recur, and Lowe
// notices ("You again. Barrow, was it") — the small model count is canon.

import * as THREE from 'three';

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

// The three men of the complement (skin, shirt, pants, accent/hat, scale).
// Murk palette: dark, desaturated 1968 workwear — pale skin carries the
// silhouette; nothing may read saturated (DESIGN §15).
const VARIANTS = [
  { skin: 0x5f6d58, shirt: 0x1e2b38, pants: 0x1b2530, accent: 0x120e09, scale: 1.0, hat: false }, // denim coverall
  { skin: 0x66735f, shirt: 0x3b3627, pants: 0x202e3c, accent: 0x0f0c08, scale: 0.94, hat: false }, // canvas shirt
  { skin: 0x57644f, shirt: 0x23262b, pants: 0x1f2328, accent: 0x453c1c, scale: 1.08, hat: true }, // big man, hard hat
];

export const DROWNED_VARIANTS = VARIANTS.length;

export function buildDrowned(variant: number): DrownedRig {
  if (!unitBox) unitBox = new THREE.BoxGeometry(1, 1, 1);
  const v = VARIANTS[variant % VARIANTS.length];
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true });
    mats.push(m);
    return m;
  };
  const skin = mat(v.skin);
  const shirt = mat(v.shirt);
  const pants = mat(v.pants);
  const accent = mat(v.accent);

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
  body.scale.setScalar(v.scale);
  group.add(body);

  // torso: chest + hips + tool belt. Origin = chest center.
  part(shirt, 0.52, 0.62, 0.3, 0, 0, 0, body);
  part(pants, 0.44, 0.34, 0.27, 0, -0.48, 0, body);
  part(accent, 0.5, 0.09, 0.33, 0, -0.33, 0, body); // the belt
  const head = part(skin, 0.24, 0.28, 0.25, 0, 0.5, 0.02, body);
  head.userData.head = true;
  if (v.hat) part(accent, 0.3, 0.1, 0.31, 0, 0.68, 0.02, body);

  // limbs pivot at shoulder/hip groups so they can sway
  const limb = (m: THREE.MeshStandardMaterial, skinM: THREE.MeshStandardMaterial, x: number, y: number, len: number, thick: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    part(m, thick, len * 0.72, thick, 0, -len * 0.36, 0, g);
    part(skinM, thick * 0.85, len * 0.3, thick * 0.85, 0, -len * 0.85, 0, g); // hand/boot
    body.add(g);
    return g;
  };
  const armL = limb(shirt, skin, -0.33, 0.26, 0.62, 0.13);
  const armR = limb(shirt, skin, 0.33, 0.26, 0.62, 0.13);
  const legL = limb(pants, accent, -0.14, -0.66, 0.7, 0.15);
  const legR = limb(pants, accent, 0.14, -0.66, 0.7, 0.15);

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
