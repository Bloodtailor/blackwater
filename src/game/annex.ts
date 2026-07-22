// The Museum Annex (M16, DESIGN §12.1): a dry, lit, TRUE safe zone off the
// rec room — by design the best-dressed space in the game (poured floor,
// museum spots, brass rail, glass cases) — whose exhibits mirror what the
// player has actually gathered THIS run: tapes, tin divers, draught flasks,
// the weapon rack, the photograph wall, figures of the deep ones with
// plaques in a neat hand nobody identifies, and a roped-off Heart replica.
//
// Plus the morale button: `MORALE NIGHT — AUTHORIZED PERSONNEL`. Press it
// and the figures dance, a mirror ball drops, the light goes saturated, and
// the party record plays. Press it again to stop, sheepishly.
//
// Zero gameplay impact; zombies never enter (the `museum` flag strips the
// room from their graphs in zombies.ts). Everything procedural.

import * as THREE from 'three';
import { NODES, type PerkId } from '../cave/data';
import { sdf } from '../cave/sdf';
import type { InteractSystem } from '../economy/interact';
import { ALL_PERKS, PERK_INFO } from '../economy/perks';
import { BOX_GUNS, WALL_GUNS, type GunId } from '../player/weapons';
import { GALLERY } from './gallery';
import { buildDrowned, animateDrowned } from '../zombies/drowned';
import { CREW } from '../zombies/roster';

export interface AnnexState {
  tapesCollected: () => string[];
  toysWound: () => number;
  perksOwned: (id: PerkId) => boolean;
  gunOwned: (id: GunId) => boolean;
  /** The party record wants the music slot (true) / gives it back (false). */
  onParty: (on: boolean) => void;
  onFirstEntry: () => void;
  toast: (m: string) => void;
}

const RACK_GUNS: GunId[] = ['wristDart', ...WALL_GUNS, ...BOX_GUNS];

/** A little engraved plaque — the neat hand nobody identifies. */
function plaqueTexture(text: string, sub?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a4232';
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#6a5f42';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 244, 84);
  g.fillStyle = '#d8cfae';
  g.textAlign = 'center';
  g.font = 'italic 26px Georgia, serif';
  g.fillText(text, 128, sub ? 42 : 56, 230);
  if (sub) {
    g.font = 'italic 17px Georgia, serif';
    g.fillText(sub, 128, 72, 230);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Exhibit {
  group: THREE.Group;
  /** Refresh visibility from run state; called ~1 Hz. */
  refresh?: () => void;
}

export class Annex {
  partyOn = false;
  entered = false;
  /** Debug: show everything regardless of what the run gathered. */
  unlockAll = false;

  private root = new THREE.Group();
  private exhibits: Exhibit[] = [];
  private figures: { group: THREE.Group; baseY: number; phase: number }[] = [];
  private mirrorBall: THREE.Group;
  private partyLights: THREE.PointLight[] = [];
  private spots: THREE.SpotLight[] = [];
  private photoWall = new THREE.Group();
  private photosShown = 0;
  private refreshT = 0;
  private center: THREE.Vector3;
  private hx: number;
  private hz: number;

  constructor(
    scene: THREE.Scene,
    interact: InteractSystem,
    private state: AnnexState,
  ) {
    const n = NODES.find((x) => x.museum);
    if (!n) {
      // no museum room authored — the whole system stays dormant
      this.center = new THREE.Vector3();
      this.hx = this.hz = 0;
      this.mirrorBall = new THREE.Group();
      return;
    }
    this.center = new THREE.Vector3(n.pos[0], n.pos[1], n.pos[2]);
    const st = n.stretch ?? [1, 1, 1];
    this.hx = n.radius * st[0];
    this.hz = n.radius * st[2];
    // find the real floor by probe (the carve owns the truth, not the math)
    let fy = n.pos[1] - n.radius * st[1];
    for (let d = 0.3; d < n.radius * st[1] * 2; d += 0.15) {
      if (sdf(n.pos[0], n.pos[1] - d, n.pos[2]) >= -0.1) {
        fy = n.pos[1] - d;
        break;
      }
    }
    const cx = this.center.x;
    const cz = this.center.z;

    // ── the poured floor: glossy, the cleanest surface in the cave ──
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.08, 28),
      new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.15, metalness: 0.35 }),
    );
    floor.scale.set(this.hx * 0.86, 1, this.hz * 0.88);
    floor.position.set(cx - 0.8, fy + 0.05, cz);
    this.root.add(floor);

    // ── the ROOM (user 2026-07-21: "an actual room, not a circular cave"):
    // a paneled wall ring hugging the rock (the pool arc stays open — the
    // cave shows only where you swam in) and a suspended light coffer. The
    // rock still owns collision; the panels sit close enough to it that
    // nothing can walk behind them. ──
    const plaster = new THREE.MeshStandardMaterial({ color: 0x7d786a, roughness: 0.8 });
    const plasterAlt = new THREE.MeshStandardMaterial({ color: 0x726d60, roughness: 0.85 });
    const baseboard = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7 });
    const trimBrass = new THREE.MeshStandardMaterial({ color: 0x8f7a3f, metalness: 0.75, roughness: 0.35 });
    {
      const SEGS = 22;
      const wallH = 2.7;
      // the pool/entrance sits east (+x): leave that arc open
      for (let i = 0; i < SEGS; i++) {
        const ang = (i / SEGS) * Math.PI * 2;
        // opening toward +x (angle 0): skip ±3 segments of arc
        const a0 = Math.atan2(Math.sin(ang), Math.cos(ang));
        if (Math.abs(a0) < 0.62) continue;
        const px = cx + Math.cos(ang) * this.hx * 0.88;
        const pz = cz + Math.sin(ang) * this.hz * 0.9;
        const segW = ((Math.PI * 2) / SEGS) * ((this.hx + this.hz) / 2) * 0.94;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(segW, wallH, 0.07), i % 2 ? plaster : plasterAlt);
        panel.position.set(px, fy + wallH / 2 + 0.06, pz);
        panel.rotation.y = -ang + Math.PI / 2;
        this.root.add(panel);
        const base = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.18, 0.09), baseboard);
        base.position.set(px, fy + 0.15, pz);
        base.rotation.y = -ang + Math.PI / 2;
        this.root.add(base);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(segW, 0.05, 0.09), trimBrass);
        trim.position.set(px, fy + wallH + 0.04, pz);
        trim.rotation.y = -ang + Math.PI / 2;
        this.root.add(trim);
      }
      // the light coffer: a level rectangular frame with two glowing panels,
      // hung dead center — the constructed ceiling the cave never had
      const coffer = new THREE.Group();
      const beamMat = new THREE.MeshStandardMaterial({ color: 0x35312a, roughness: 0.6, metalness: 0.3 });
      for (const [w, d, x, z] of [
        [7.4, 0.16, 0, -2.1] as const,
        [7.4, 0.16, 0, 2.1] as const,
        [0.16, 4.36, -3.62, 0] as const,
        [0.16, 4.36, 3.62, 0] as const,
      ]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), beamMat);
        beam.position.set(x, 0, z);
        coffer.add(beam);
      }
      const glowMat = new THREE.MeshStandardMaterial({ color: 0xf2e8cc, emissive: 0xcfc09a, emissiveIntensity: 0.9, roughness: 0.4 });
      for (const zOff of [-1.05, 1.05]) {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.06, 1.9), glowMat);
        pane.position.set(0, 0.02, zOff);
        coffer.add(pane);
      }
      for (const [x, z] of [[-3.4, -2], [3.4, -2], [-3.4, 2], [3.4, 2]]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), beamMat);
        rod.position.set(x, 0.6, z);
        coffer.add(rod);
      }
      coffer.position.set(cx - 0.8, fy + 3.35, cz);
      this.root.add(coffer);
    }

    // ── museum lighting: warm spots, always on (the room has its own way) ──
    const addSpot = (x: number, z: number, tx: number, tz: number): void => {
      const s = new THREE.SpotLight(0xf0e2c0, 5.5, 11, Math.PI / 5, 0.5, 1.6);
      s.position.set(x, fy + 4.0, z);
      s.target.position.set(tx, fy + 0.6, tz);
      this.root.add(s);
      this.root.add(s.target);
      this.spots.push(s);
    };
    addSpot(cx - 2, cz - 1.5, cx - 3, cz - 4); // the plinth row
    addSpot(cx - 3.5, cz + 1.5, cx - 5.5, cz + 3.5); // shelves
    addSpot(cx - 1, cz + 0.5, cx - 2.5, cz + 0.5); // the Heart replica
    const fill = new THREE.PointLight(0xe8dcc0, 2.8, 16, 1.6);
    fill.position.set(cx - 1.5, fy + 3.2, cz);
    this.root.add(fill);

    // ── shared builders ──
    const brass = new THREE.MeshStandardMaterial({ color: 0x8f7a3f, metalness: 0.75, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2226, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfd8e0, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const pedestal = (x: number, z: number, h = 1.0, w = 0.66): THREE.Group => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), dark);
      base.position.y = h / 2;
      g.add(base);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.05, w + 0.08), brass);
      cap.position.y = h + 0.025;
      g.add(cap);
      g.position.set(x, fy + 0.09, z);
      this.root.add(g);
      return g;
    };
    const glassCase = (over: THREE.Group, w: number, h: number): void => {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), glassMat);
      glass.position.y = 1.05 + h / 2;
      over.add(glass);
    };
    const plaque = (onto: THREE.Group, text: string, sub?: string): void => {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.19),
        new THREE.MeshStandardMaterial({ map: plaqueTexture(text, sub), roughness: 0.6 }),
      );
      p.position.set(0, 0.72, 0.34);
      p.rotation.x = -0.25;
      onto.add(p);
    };
    const railPost = (x: number, z: number): void => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), brass);
      post.position.set(x, fy + 0.52, z);
      this.root.add(post);
    };
    const railRun = (x1: number, z1: number, x2: number, z2: number): void => {
      railPost(x1, z1);
      railPost(x2, z2);
      const len = Math.hypot(x2 - x1, z2 - z1);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), brass);
      bar.position.set((x1 + x2) / 2, fy + 0.93, (z1 + z2) / 2);
      bar.rotation.z = Math.PI / 2;
      bar.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      this.root.add(bar);
    };

    // ── the plinth row: figures of the deep ones (north side) ──
    const figure = (x: number, z: number, build: (g: THREE.Group) => void, text: string, sub?: string): void => {
      const ped = pedestal(x, z);
      const fig = new THREE.Group();
      build(fig);
      fig.position.y = 1.08;
      ped.add(fig);
      glassCase(ped, 0.9, 1.1);
      plaque(ped, text, sub);
      this.figures.push({ group: fig, baseY: 1.08, phase: Math.random() * 7 });
    };
    const zRow = cz - 4.2;
    figure(cx - 1.2, zRow, (g) => {
      // the Drowned: an actual crew rig, scaled to a figurine — Barrow, of course
      const rig = buildDrowned(CREW[2]);
      animateDrowned(rig, 0, 0, 'pause', 10); // settle into the standing pose
      rig.group.scale.setScalar(0.42);
      rig.group.position.y = 0.42;
      g.add(rig.group);
    }, 'THE COMPLEMENT', 'FULL');
    figure(cx - 3.0, zRow, (g) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.5), new THREE.MeshStandardMaterial({ color: 0x0b1012, roughness: 0.6, metalness: 0.2 }));
      body.position.y = 0.3;
      g.add(body);
      const lure = new THREE.PointLight(0x6fd44a, 0.5, 1.6, 2);
      lure.position.set(0, 0.52, -0.3);
      g.add(lure);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshStandardMaterial({ color: 0x8fd44a, emissive: 0x4a8f2a }));
      dot.position.copy(lure.position);
      g.add(dot);
    }, 'THE LIGHT');
    figure(cx - 4.8, zRow, (g) => {
      const darkFig = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1 });
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.32, 0.09), darkFig);
      t.position.y = 0.42;
      g.add(t);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.08), darkFig);
      h.position.y = 0.63;
      g.add(h);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.06), darkFig);
        leg.position.set(sx * 0.04, 0.13, 0);
        g.add(leg);
      }
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), new THREE.MeshStandardMaterial({ color: 0x8fd44a, emissive: 0x4a8f2a }));
      dot.position.set(0.12, 0.26, 0.03);
      g.add(dot);
    }, 'THE OTHER LIGHT');
    figure(cx - 6.6, zRow + 0.6, (g) => {
      const suit = new THREE.MeshStandardMaterial({ color: 0x2c3833, metalness: 0.45, roughness: 0.7 });
      const brassy = new THREE.MeshStandardMaterial({ color: 0x54492a, metalness: 0.7, roughness: 0.45 });
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.32, 8), suit);
      torso.position.y = 0.36;
      g.add(torso);
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), brassy);
      helm.position.y = 0.6;
      g.add(helm);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.08), suit);
        leg.position.set(sx * 0.06, 0.12, 0);
        g.add(leg);
      }
    }, 'RETURNED', 'EMPTY');
    railRun(cx - 7.3, zRow + 1.4, cx - 0.4, zRow + 1.4);

    // ── the Heart replica, roped off (room center — clear of the rack) ──
    {
      const ped = pedestal(cx - 3.2, cz + 1.2, 0.8, 0.9);
      const heart = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.34, 1),
        new THREE.MeshStandardMaterial({ color: 0x8f2f2a, emissive: 0x5f1512, roughness: 0.5 }),
      );
      heart.position.y = 1.2;
      ped.add(heart);
      plaque(ped, 'THERMAL-1', 'REPLICA');
      this.figures.push({ group: (() => { const g = new THREE.Group(); g.add(heart); ped.add(g); return g; })(), baseY: 0, phase: 3 });
      for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) railPost(cx - 3.2 + dx, cz + 1.2 + dz);
    }

    // ── shelves (south side): tapes ×6, toys ×3, flasks ×9 ──
    const shelf = (x: number, z: number, w: number): THREE.Group => {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.42), dark);
      g.add(board);
      const capB = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.05), brass);
      capB.position.set(0, 0.02, 0.21);
      g.add(capB);
      g.position.set(x, fy + 1.25, z);
      this.root.add(g);
      return g;
    };
    const zShelf = cz + 4.4;
    {
      const g = shelf(cx - 1.6, zShelf, 2.6);
      const tapes: THREE.Mesh[] = [];
      for (let i = 0; i < 6; i++) {
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x4a5230, roughness: 0.7 }));
        tape.position.set(-1.05 + i * 0.42, 0.13, 0);
        g.add(tape);
        tapes.push(tape);
      }
      this.exhibits.push({
        group: g,
        refresh: () => {
          const got = this.state.tapesCollected();
          tapes.forEach((t, i) => (t.visible = this.unlockAll || got.includes(`T${i + 1}`)));
        },
      });
    }
    {
      const g = shelf(cx - 4.6, zShelf, 1.6);
      const toyColors = [0xa03028, 0x2f4f8f, 0xc8a828];
      const toys: THREE.Group[] = [];
      for (let i = 0; i < 3; i++) {
        const toy = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: toyColors[i], roughness: 0.4, metalness: 0.3 }));
        body.position.y = 0.13;
        toy.add(body);
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshStandardMaterial({ color: 0xc8c0a0, metalness: 0.5, roughness: 0.4 }));
        helm.position.y = 0.27;
        toy.add(helm);
        toy.position.set(-0.5 + i * 0.5, 0.03, 0);
        g.add(toy);
        toys.push(toy);
        this.figures.push({ group: toy, baseY: 0.03, phase: i * 2.1 });
      }
      this.exhibits.push({ group: g, refresh: () => toys.forEach((t, i) => (t.visible = this.unlockAll || this.state.toysWound() > i)) });
    }
    {
      const g = shelf(cx - 6.9, zShelf - 1.2, 2.2);
      const flasks: THREE.Mesh[] = [];
      ALL_PERKS.forEach((id, i) => {
        const flask = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.07, 0.22, 7),
          new THREE.MeshStandardMaterial({ color: PERK_INFO[id].color, roughness: 0.3, metalness: 0.2 }),
        );
        flask.position.set(-0.9 + i * 0.225, 0.14, 0);
        g.add(flask);
        flasks.push(flask);
      });
      this.exhibits.push({
        group: g,
        refresh: () => ALL_PERKS.forEach((id, i) => (flasks[i].visible = this.unlockAll || this.state.perksOwned(id))),
      });
    }

    // ── the weapon rack (west wall) ──
    {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 4.6), dark);
      g.add(board);
      const guns: THREE.Group[] = [];
      RACK_GUNS.forEach((_id, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const gun = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: 0x323a40, metalness: 0.4, roughness: 0.5 }));
        gun.add(body);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0x241e14, roughness: 0.8 }));
        grip.position.set(0, -0.12, 0.2);
        gun.add(grip);
        gun.position.set(0.15, 0.85 - row * 0.62, -1.7 + col * 1.12);
        g.add(gun);
        guns.push(gun);
      });
      g.position.set(cx - this.hx * 0.72, fy + 1.5, cz + 0.4);
      this.root.add(g);
      this.exhibits.push({ group: g, refresh: () => RACK_GUNS.forEach((id, i) => (guns[i].visible = this.unlockAll || this.state.gunOwned(id))) });
    }

    // ── the photograph wall grows in update() (GALLERY fills during play) ──
    this.photoWall.position.set(cx + this.hx * 0.52, fy + 1.7, cz - 2.6);
    this.photoWall.rotation.y = -Math.PI / 2.6;
    this.root.add(this.photoWall);

    // ── the mirror ball (hidden until the party) ──
    this.mirrorBall = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.32, 1),
      new THREE.MeshStandardMaterial({ color: 0xc8d0d8, metalness: 0.95, roughness: 0.12, flatShading: true }),
    );
    this.mirrorBall.add(ball);
    const ballLight = new THREE.PointLight(0xffffff, 2.2, 9, 1.6);
    this.mirrorBall.add(ballLight);
    this.mirrorBall.position.set(cx - 3, fy + 3.6, cz - 0.5);
    this.mirrorBall.visible = false;
    this.root.add(this.mirrorBall);
    for (const [color, dx, dz] of [
      [0xd83a3a, -5.5, 2] as const,
      [0x3a68d8, -0.8, -2.5] as const,
      [0x3ad86a, -3, 3.5] as const,
    ]) {
      const pl = new THREE.PointLight(color, 0, 10, 1.4);
      pl.position.set(cx + dx, fy + 2.6, cz + dz);
      this.root.add(pl);
      this.partyLights.push(pl);
    }

    // ── the morale button: big, red, guarded ──
    {
      const stand = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.05, 8), dark);
      post.position.y = 0.52;
      stand.add(post);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.34), brass);
      box.position.y = 1.1;
      stand.add(box);
      const button = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 0.07, 10),
        new THREE.MeshStandardMaterial({ color: 0xb82820, emissive: 0x3a0805, roughness: 0.35 }),
      );
      button.position.y = 1.21;
      stand.add(button);
      // the flip-cover, propped open
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.3), new THREE.MeshStandardMaterial({ color: 0x7a2a20, roughness: 0.5, transparent: true, opacity: 0.9 }));
      cover.position.set(0, 1.27, -0.17);
      cover.rotation.x = -1.9;
      stand.add(cover);
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.14),
        new THREE.MeshStandardMaterial({ map: plaqueTexture('MORALE NIGHT', 'AUTHORIZED PERSONNEL'), roughness: 0.5 }),
      );
      plate.position.set(0, 0.82, 0.12);
      plate.rotation.x = -0.5;
      stand.add(plate);
      // west of center — well clear of the entrance pool on the east side
      const bx = cx - 0.4;
      const bz = cz + 2.4;
      stand.position.set(bx, fy + 0.08, bz);
      this.root.add(stand);
      interact.add({
        id: 'morale-button',
        pos: [bx, fy + 1.25, bz],
        prompt: () => ({ text: this.partyOn ? 'END MORALE NIGHT' : 'MORALE NIGHT', holdSec: 0, enabled: true, sub: this.partyOn ? 'somehow worse' : 'authorized personnel' }),
        execute: () => this.setParty(!this.partyOn),
      });
    }

    scene.add(this.root);
    // exhibits start honest (empty run = empty cases)
    for (const e of this.exhibits) e.refresh?.();
  }

  setParty(on: boolean): void {
    if (on === this.partyOn) return;
    this.partyOn = on;
    this.mirrorBall.visible = on;
    for (const pl of this.partyLights) pl.intensity = on ? 3.2 : 0;
    for (const s of this.spots) s.intensity = on ? 2.2 : 5.5;
    this.state.onParty(on);
    this.state.toast(on ? 'MORALE NIGHT' : 'MORALE NIGHT — CONCLUDED');
  }

  /** Is a world position inside the annex room (roughly)? */
  contains(p: THREE.Vector3): boolean {
    if (this.hx === 0) return false;
    const dx = (p.x - this.center.x) / this.hx;
    const dz = (p.z - this.center.z) / this.hz;
    return dx * dx + dz * dz < 1.15 && Math.abs(p.y - this.center.y) < 5;
  }

  update(dt: number, time: number, playerPos: THREE.Vector3, musicIsParty: boolean): void {
    if (this.hx === 0) return;
    // first entry (VO cue) — once per run
    if (!this.entered && this.contains(playerPos)) {
      this.entered = true;
      this.state.onFirstEntry();
    }
    // if the music slot got stolen (jukebox, Moonlight), the party ends too
    if (this.partyOn && !musicIsParty) this.setParty(false);
    // exhibit refresh at 1 Hz — cases fill as the run gathers
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 1;
      for (const e of this.exhibits) e.refresh?.();
      // the photograph wall grows
      const items = GALLERY.items;
      while (this.photosShown < items.length && this.photosShown < 24) {
        const i = this.photosShown++;
        const tex = new THREE.TextureLoader().load(items[i].url);
        tex.colorSpace = THREE.SRGBColorSpace;
        const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
        ph.position.set(0, 0.9 - Math.floor(i / 6) * 0.62, -1.85 + (i % 6) * 0.74);
        this.photoWall.add(ph);
      }
    }
    // the party: figures dance, the ball spins
    if (this.partyOn) {
      this.mirrorBall.rotation.y += dt * 1.6;
      this.partyLights.forEach((pl, i) => {
        pl.intensity = 2.4 + Math.sin(time * 3.1 + i * 2.1) * 1.2;
      });
      for (const f of this.figures) {
        f.group.position.y = f.baseY + Math.abs(Math.sin(time * 3.4 + f.phase)) * 0.12;
        f.group.rotation.y = Math.sin(time * 2.2 + f.phase) * 0.7;
      }
    } else {
      for (const f of this.figures) {
        f.group.position.y = f.baseY;
        f.group.rotation.y *= Math.max(0, 1 - dt * 3); // settle, sheepishly
      }
    }
  }
}
