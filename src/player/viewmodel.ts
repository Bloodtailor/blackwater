// First-person viewmodels (user 2026-07-20: "we need models for the guns and
// the knifing animation"). Procedural low-poly rigs in the murk palette,
// camera-parented: swim bob, fire kick, reload dip, a knife swing that
// sweeps the screen, and a REACH ARC that draws the knife's true range in
// the water for its duration (the honest-tells doctrine applied to melee).

import * as THREE from 'three';
import { TUNING } from '../tuning';
import type { GunId } from './weapons';

const STEEL = 0x39434a;
const WOOD = 0x4a3d28;
const RUBBER = 0x23262b;
const BRASS = 0x6a5a34;
const PAP_GLOW = 0x3fc8e8;

export class ViewModel {
  private root = new THREE.Group();
  private models = new Map<GunId, THREE.Group>();
  private papStrips = new Map<GunId, THREE.MeshStandardMaterial>();
  private currentId: GunId | null = null;
  private currentPapped = false;
  private knife: THREE.Group;
  private arc: THREE.Mesh;
  private arcMat: THREE.MeshBasicMaterial;
  private kickT = 0;
  private swingT = -1; // -1 = idle
  private reloadDip = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.root.position.set(0.27, -0.24, -0.5);
    this.root.rotation.y = -0.06;
    camera.add(this.root);
    this.knife = this.buildKnife();
    this.knife.visible = false;
    camera.add(this.knife);
    // the reach arc: a thin horizontal band at EXACTLY knife range, spanning
    // the swing's arc — visible for the swing's duration
    const K = TUNING.weapons.knife;
    const arcRad = THREE.MathUtils.degToRad(K.arcDeg * 2);
    this.arcMat = new THREE.MeshBasicMaterial({ color: 0xd8f2e8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    this.arc = new THREE.Mesh(new THREE.TorusGeometry(K.rangeM, 0.015, 5, 28, arcRad), this.arcMat);
    // torus arc starts at +X in its XY plane: first center it on +Y (Rz),
    // then lay it flat with +Y mapped dead ahead (Rx −90°) — quaternions,
    // because Euler-order guessing put the arc off-screen (verified)
    this.arc.quaternion
      .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 - arcRad / 2));
    this.arc.position.set(0, -0.15, 0);
    this.arc.visible = false;
    camera.add(this.arc);
  }

  private mat(color: number, metal = 0.55): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: metal, flatShading: true });
  }

  private box(g: THREE.Group, color: number, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.mat(color));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  private tube(g: THREE.Group, color: number, r: number, len: number, x: number, y: number, z: number, alongX = false): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), this.mat(color));
    if (alongX) m.rotation.z = Math.PI / 2;
    else m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  private buildKnife(): THREE.Group {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.045, 0.2), this.mat(0xb8c4c8, 0.85));
    blade.position.z = -0.16;
    g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.06, 4), this.mat(0xb8c4c8, 0.85));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.29;
    g.add(tip);
    this.box(g, RUBBER, 0.03, 0.06, 0.1, 0, -0.01, -0.03);
    return g;
  }

  /** One low-poly rig per gun — silhouettes, not replicas. */
  private buildModel(id: GunId): THREE.Group {
    const g = new THREE.Group();
    switch (id) {
      case 'wristDart': {
        this.box(g, RUBBER, 0.09, 0.05, 0.16, 0, -0.02, 0.02); // the bracer
        this.box(g, STEEL, 0.03, 0.03, 0.2, 0, 0.02, -0.05); // rail
        this.tube(g, BRASS, 0.006, 0.1, 0, 0.02, -0.17); // the dart
        break;
      }
      case 'speargun': {
        this.box(g, WOOD, 0.05, 0.07, 0.3, 0, -0.02, 0.05); // stock
        this.tube(g, STEEL, 0.02, 0.32, 0, 0.02, -0.12); // barrel
        this.tube(g, 0xb8c4c8, 0.007, 0.5, 0, 0.03, -0.28); // the spear
        this.box(g, RUBBER, 0.09, 0.02, 0.03, 0, 0.02, -0.24); // band anchor
        break;
      }
      case 'pneuDriver': {
        this.box(g, STEEL, 0.09, 0.11, 0.26, 0, 0, 0); // receiver
        this.tube(g, STEEL, 0.015, 0.14, 0, 0.03, -0.19); // stub barrel
        this.tube(g, BRASS, 0.03, 0.14, 0.07, -0.02, 0.04, true); // air canister
        this.box(g, RUBBER, 0.035, 0.09, 0.05, 0, -0.09, 0.06); // grip
        break;
      }
      case 'flechette': {
        this.box(g, STEEL, 0.15, 0.08, 0.22, 0, 0, 0); // wide body
        for (const dx of [-0.045, 0, 0.045]) this.tube(g, RUBBER, 0.014, 0.1, dx, 0.01, -0.16); // bores
        this.box(g, WOOD, 0.05, 0.06, 0.12, 0, -0.06, 0.1);
        break;
      }
      case 'harpoon': {
        this.tube(g, STEEL, 0.025, 0.48, 0, 0.01, -0.15); // long barrel
        this.box(g, WOOD, 0.05, 0.08, 0.24, 0, -0.04, 0.12); // heavy stock
        this.tube(g, 0xb8c4c8, 0.01, 0.2, 0, 0.03, -0.42); // the bolt head
        this.box(g, STEEL, 0.03, 0.1, 0.06, 0, -0.1, -0.02); // fore grip
        break;
      }
      case 'lineLance': {
        const pole = this.tube(g, BRASS, 0.014, 0.85, 0.02, 0.03, -0.3);
        pole.rotation.x = Math.PI / 2 - 0.12; // angled ahead
        this.box(g, RUBBER, 0.04, 0.04, 0.14, 0, -0.03, 0.05); // grip wrap
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), this.mat(0xb8c4c8, 0.85));
        tip.rotation.x = -Math.PI / 2 - 0.12;
        tip.position.set(0.02, 0.115, -0.7);
        g.add(tip);
        break;
      }
      case 'twinfish': {
        const pistol = (px: number): void => {
          this.box(g, STEEL, 0.045, 0.07, 0.14, px, 0, 0);
          this.tube(g, STEEL, 0.012, 0.1, px, 0.025, -0.11);
          this.tube(g, 0xb8c4c8, 0.005, 0.16, px, 0.035, -0.16); // spearlet
          this.box(g, RUBBER, 0.03, 0.07, 0.04, px, -0.06, 0.05);
        };
        pistol(0); // right hand
        pistol(-0.54); // LEFT hand — both fish visible (akimbo reads)
        break;
      }
      case 'arcProjector': {
        this.box(g, STEEL, 0.1, 0.1, 0.24, 0, 0, 0);
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12), this.mat(BRASS, 0.8));
        coil.position.set(0, 0.01, -0.14);
        g.add(coil);
        for (const dx of [-0.03, 0.03]) this.tube(g, 0xb8c4c8, 0.006, 0.12, dx, 0.01, -0.22); // prongs
        break;
      }
      case 'vortexMaw': {
        this.box(g, STEEL, 0.09, 0.09, 0.2, 0, 0, 0.04);
        const maw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 8, 1, true), this.mat(0x2a3a49, 0.6));
        maw.rotation.x = Math.PI / 2; // flares FORWARD, open mouth
        maw.position.set(0, 0.01, -0.16);
        g.add(maw);
        break;
      }
      case 'sonicLance': {
        this.tube(g, STEEL, 0.018, 0.3, 0, 0, -0.08);
        for (const dx of [-0.025, 0.025]) this.box(g, 0xb8c4c8, 0.012, 0.03, 0.22, dx, 0.01, -0.32); // fork tines
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), this.mat(BRASS, 0.7));
        disc.rotation.x = Math.PI / 2;
        disc.position.set(0, 0, -0.2);
        g.add(disc);
        break;
      }
      case 'bangStick': {
        const pole = this.tube(g, WOOD, 0.016, 0.7, 0.02, 0.02, -0.26);
        pole.rotation.x = Math.PI / 2 - 0.1;
        const shell = this.tube(g, BRASS, 0.028, 0.12, 0.02, 0.085, -0.56);
        shell.rotation.x = Math.PI / 2 - 0.1;
        this.box(g, RUBBER, 0.04, 0.04, 0.12, 0, -0.03, 0.04);
        break;
      }
    }
    // every gun carries a hidden cherenkov strip — lit when papped
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x1e3a42, roughness: 0.5, emissive: PAP_GLOW, emissiveIntensity: 0 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.16), stripMat);
    strip.position.set(0, 0.05, -0.02);
    g.add(strip);
    this.papStrips.set(id, stripMat);
    return g;
  }

  setWeapon(id: GunId, papped: boolean): void {
    if (id === this.currentId && papped === this.currentPapped) return;
    for (const m of this.models.values()) m.visible = false;
    let model = this.models.get(id);
    if (!model) {
      model = this.buildModel(id);
      this.models.set(id, model);
      this.root.add(model);
    }
    model.visible = true;
    const strip = this.papStrips.get(id);
    if (strip) strip.emissiveIntensity = papped ? 1.2 : 0;
    this.currentId = id;
    this.currentPapped = papped;
    this.kickT = 0.18; // the swap beat reads as raising the gun
  }

  kick(strength = 1): void {
    this.kickT = 0.12 * strength;
  }

  /** The knife swing: sweeps across the view and flashes the reach arc. */
  swingKnife(): void {
    this.swingT = 0;
    this.knife.visible = true;
    this.arc.visible = true;
  }

  get swinging(): boolean {
    return this.swingT >= 0;
  }

  update(dt: number, opts: { reloading: boolean; speedM: number; time: number; hidden: boolean }): void {
    this.root.visible = !opts.hidden;
    // swim bob: subtle, speed-scaled
    const bob = Math.min(1, opts.speedM / 4);
    this.root.position.x = 0.27 + Math.sin(opts.time * 3.1) * 0.006 * bob;
    this.root.position.y = -0.24 + Math.sin(opts.time * 6.2) * 0.008 * bob + (opts.reloading ? -0.06 : 0);
    // reload dip: the muzzle drops while hands work
    const dipTarget = opts.reloading ? 0.5 : 0;
    this.reloadDip += (dipTarget - this.reloadDip) * Math.min(1, dt * 8);
    this.root.rotation.x = -this.reloadDip;
    // fire kick: a short shove back toward the shoulder
    this.kickT = Math.max(0, this.kickT - dt);
    this.root.position.z = -0.5 + (this.kickT > 0 ? this.kickT * 0.45 : 0);
    // knife swing: right-high → left-low across the view center
    if (this.swingT >= 0) {
      const K = 0.28; // swing seconds
      this.swingT += dt;
      const t = Math.min(1, this.swingT / K);
      const ease = t * t * (3 - 2 * t);
      this.knife.position.set(0.38 - ease * 0.62, 0.08 - ease * 0.3, -0.42);
      this.knife.rotation.z = 0.5 - ease * 1.6;
      this.knife.rotation.y = -0.4 + ease * 0.9;
      this.arcMat.opacity = 0.5 * (1 - t);
      if (t >= 1) {
        this.swingT = -1;
        this.knife.visible = false;
        this.arc.visible = false;
      }
    }
  }
}
