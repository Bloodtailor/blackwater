// Everything the site issues (M6a; FREE-ISSUE REWORK M13, DESIGN §10): the
// doors and their found openers, the wall lockers, the draught dispensaries,
// the Pile's breaker, and the string lights power brings up. Nothing costs
// points anymore — the site issues, it does not sell. Pacing comes from the
// bell (one issue per station per shift bell) and from what the belt carries
// (dynamite / keys / slugs, economy/inventory.ts). Visual identities per
// LORE §4. All positions derive from node/edge data + SDF probes.

import * as THREE from 'three';
import { NODES, ZONE_HUBS, type CaveNode, type PerkId, type VendorId } from '../cave/data';
import { sdf } from '../cave/sdf';
import { doorPlacement, openDoor, type Door } from '../cave/doors';
import { GraphPath } from '../zombies/pathing';
import { TUNING } from '../tuning';
import { softDotTexture } from '../effects/atmosphere';
import { PERK_INFO, type Perks } from './perks';
import { BellIssue, type Inventory } from './inventory';
import type { Weapons, GunId } from '../player/weapons';
import type { InteractSystem } from './interact';

export interface ShopCtx {
  scene: THREE.Scene;
  interact: InteractSystem;
  doors: Door[];
  inventory: Inventory;
  /** Current shift-bell number (the round counter until M14). */
  bell: () => number;
  perks: Perks;
  weapons: Weapons;
  toast: (msg: string) => void;
  /** Main applies side effects (vitals refresh, HUD icons). */
  onPerkBought: (id: PerkId) => void;
  /** Main grants the consumable (battery / chemlights / reel). */
  onVendor: (v: VendorId) => boolean; // false = at cap, refuse the issue
  onPowerOn: () => void;
  /** The Abyss hatch's toll: five bells, +5 shifts (main owns the drama). */
  onHatchToll: () => void;
}

const VENDOR_LABEL: Record<VendorId, { name: string }> = {
  battery: { name: 'DRY-CELL' },
  chemlights: { name: 'CHEMLIGHTS ×10' },
  reel: { name: 'GUIDE REEL +200m' },
};

function labelTexture(lines: string[], accent = '#e8f0e6'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8, 14, 14, 0.88)';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(120, 140, 130, 0.5)';
  g.strokeRect(3, 3, 250, 122);
  g.fillStyle = accent;
  g.textAlign = 'center';
  g.font = '26px Consolas, monospace';
  const y0 = 64 - (lines.length - 1) * 16;
  lines.forEach((l, i) => g.fillText(l, 128, y0 + i * 32 + 8, 240));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Nearest wall from a node center (16 horizontal probes), for mounting
 *  lockers/vendors flush to real rock. `exclude` keeps a second fixture off
 *  the first one's wall. (Exported: the photograph and future props mount
 *  the same way.) */
export function wallSpot(n: CaveNode, exclude?: THREE.Vector3): { pos: THREE.Vector3; inward: THREE.Vector3 } {
  const maxR = n.radius * Math.max(...(n.stretch ?? [1, 1, 1])) * 1.4;
  let bestT = Infinity;
  let bestDir: THREE.Vector3 | null = null;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    if (exclude && dir.dot(exclude) > 0.4) continue;
    for (let t = 0.6; t < maxR; t += 0.3) {
      const d = sdf(n.pos[0] + dir.x * t, n.pos[1], n.pos[2] + dir.z * t);
      if (d >= -0.2) {
        if (t < bestT) {
          bestT = t;
          bestDir = dir;
        }
        break;
      }
    }
  }
  const dir = bestDir ?? new THREE.Vector3(0, 0, 1);
  const t = Number.isFinite(bestT) ? bestT : n.radius * 0.7;
  const pos = new THREE.Vector3(n.pos[0] + dir.x * (t - 0.45), n.pos[1], n.pos[2] + dir.z * (t - 0.45));
  return { pos, inward: dir.clone().negate() };
}

export function orientToWall(g: THREE.Object3D, spot: { pos: THREE.Vector3; inward: THREE.Vector3 }): void {
  g.position.copy(spot.pos);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spot.inward);
}

export class Shops {
  powered = false;
  private grinds: { door: Door; t: number; mats: THREE.Material[] }[] = [];
  private lights = new THREE.Group();
  private poweredMats: THREE.MeshStandardMaterial[] = [];
  private puffPoints: THREE.Points;
  private puffVels: Float32Array;
  private puffLife = 0;
  private puffMat: THREE.PointsMaterial;

  constructor(private ctx: ShopCtx) {
    this.buildDoors();
    this.buildWallBuysAndPerks();
    this.buildPower();
    this.buildStringLights();
    // door silt puff (cosmetic-scale, §10.3)
    const N = 48;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.puffVels = new Float32Array(N * 3);
    this.puffMat = new THREE.PointsMaterial({
      size: 0.6,
      map: softDotTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0x9a9585,
    });
    this.puffPoints = new THREE.Points(geo, this.puffMat);
    this.puffPoints.frustumCulled = false;
    this.puffPoints.visible = false;
    ctx.scene.add(this.puffPoints);
  }

  // ── doors (M13): found openers, and one door that charges time ──
  private buildDoors(): void {
    for (const d of this.ctx.doors) {
      if (d.kind === 'powerGate') continue; // opens with power, untouched
      const place = doorPlacement(d.edge);
      const inv = this.ctx.inventory;
      this.ctx.interact.add({
        id: `door:${d.id}`,
        pos: place.pos,
        prompt: () => {
          if (d.open) return null;
          if (d.kind === 'debris') {
            const has = inv.dynamite > 0;
            return {
              text: 'BLAST THE CHOKE CLEAR · 1 DYNAMITE',
              holdSec: TUNING.interact.doorHoldSec,
              enabled: has,
              sub: has ? `${inv.dynamite} on the belt` : 'FIND BLASTING STOCK',
            };
          }
          if (d.kind === 'grate') {
            const has = inv.hasKey(d.id);
            return {
              text: has ? `UNLOCK THE GRATE — ${inv.keys.get(d.id)}` : 'CUT THE GRATE',
              holdSec: TUNING.interact.doorHoldSec,
              enabled: has,
              sub: has ? undefined : 'LOCKED — ITS KEY HANGS SOMEWHERE',
            };
          }
          // the pressure hatch: free to crank; the site charges time
          return {
            text: 'CRANK THE HATCH — FIVE BELLS',
            holdSec: TUNING.interact.doorHoldSec,
            enabled: true,
            sub: 'THE SITE CHARGES TIME · +5 SHIFTS',
          };
        },
        execute: () => {
          if (d.open) return;
          if (d.kind === 'debris') {
            if (!inv.useDynamite()) return;
            this.grindOpen(d);
            this.ctx.toast('THE CHOKE COMES DOWN');
          } else if (d.kind === 'grate') {
            if (!inv.hasKey(d.id)) return;
            this.grindOpen(d);
            this.ctx.toast('THE GRATE SWINGS WIDE');
          } else {
            this.grindOpen(d);
            this.ctx.onHatchToll();
          }
        },
      });
    }
  }

  /** Grind a door open: plug (collision + zombie pathing) clears shortly in,
   *  the visual crumbles/fades, and a silt puff sells the work. */
  grindOpen(d: Door): void {
    if (d.open) return;
    openDoor(this.ctx.doors, d.id); // state + SDF plug + pathing, hides group…
    d.group.visible = true; // …but we keep the visual for the crumble
    const mats = new Set<THREE.Material>();
    d.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) {
        m.transparent = true;
        mats.add(m);
      }
    });
    this.grinds.push({ door: d, t: 0, mats: [...mats] });
    const p = doorPlacement(d.edge);
    this.spawnPuff(p.pos, p.blockR);
  }

  private spawnPuff(pos: [number, number, number], r: number): void {
    const posAttr = this.puffPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const rr = r * 0.6 * Math.cbrt(Math.random());
      posAttr.setXYZ(i, pos[0] + rr * Math.sin(b) * Math.cos(a), pos[1] + rr * Math.cos(b), pos[2] + rr * Math.sin(b) * Math.sin(a));
      this.puffVels[i * 3] = (Math.random() - 0.5) * 1.2;
      this.puffVels[i * 3 + 1] = Math.random() * 0.5;
      this.puffVels[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    posAttr.needsUpdate = true;
    this.puffLife = 1.5;
    this.puffPoints.visible = true;
  }

  // ── wall buys & perk stations ──
  private buildWallBuysAndPerks(): void {
    for (const n of NODES) {
      let firstWallDir: THREE.Vector3 | undefined;
      if (n.tags.includes('perk') && n.contents?.perk) {
        const spot = wallSpot(n);
        firstWallDir = spot.inward.clone().negate();
        this.buildPerkStation(n.contents.perk, spot);
      }
      if (n.tags.includes('wallBuy')) {
        if (n.contents?.wallBuy) {
          const spot = wallSpot(n, firstWallDir);
          firstWallDir = firstWallDir ?? spot.inward.clone().negate();
          this.buildGunLocker(n.contents.wallBuy as GunId, spot);
        }
        if (n.contents?.vendor) {
          const spot = wallSpot(n, firstWallDir);
          this.buildVendor(n.contents.vendor, spot);
        }
      }
    }
  }

  private lockerFrame(w: number, h: number): THREE.Group {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x39434a, roughness: 0.6, metalness: 0.55, flatShading: true });
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), steel);
    g.add(back);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.28), steel);
      side.position.set((s * w) / 2, 0, 0.14);
      g.add(side);
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.26), steel);
    shelf.position.set(0, -h * 0.32, 0.13);
    g.add(shelf);
    return g;
  }

  /** Every issuing station (debug reset walks this). */
  readonly issues: BellIssue[] = [];

  private buildGunLocker(id: GunId, spot: { pos: THREE.Vector3; inward: THREE.Vector3 }): void {
    const def = this.ctx.weapons; // for owns/refill
    const g = this.lockerFrame(1.15, 1.5);
    const name = gunName(id);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.5),
      new THREE.MeshBasicMaterial({ map: labelTexture([name, 'FREE ISSUE']), transparent: true }),
    );
    label.position.set(0, 0.28, 0.06);
    g.add(label);
    // painted outline: a pale bar where the gun hangs (silhouette-lite)
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x5a5142, roughness: 0.9 }),
    );
    bar.position.set(0, -0.15, 0.1);
    g.add(bar);
    orientToWall(g, spot);
    this.ctx.scene.add(g);
    // the gun itself is free issue; AMMO obeys the bell (M13)
    const ammoBell = new BellIssue();
    this.issues.push(ammoBell);
    this.ctx.interact.add({
      id: `gun:${id}`,
      pos: [spot.pos.x, spot.pos.y, spot.pos.z],
      prompt: () => {
        const slot = def.slots.find((s) => s.def.id === id);
        if (!slot) return { text: `TAKE THE ${name}`, holdSec: 0, enabled: true, sub: 'FREE ISSUE' };
        const can = ammoBell.canIssue(this.ctx.bell());
        return {
          text: `${slot.def.name} AMMO`,
          holdSec: 0,
          enabled: can,
          sub: can ? 'ONE PULL PER MAN PER BELL' : 'ISSUED THIS BELL — WAIT FOR THE NEXT',
        };
      },
      execute: () => {
        const slot = def.slots.find((s) => s.def.id === id);
        if (slot) {
          if (!ammoBell.issue(this.ctx.bell())) return;
          def.refill(id);
          this.ctx.toast(`${slot.def.name} — AMMO ISSUED`);
        } else {
          def.give(id);
          this.ctx.toast(`${name} — OFF THE RACK`);
        }
      },
    });
  }

  private buildVendor(v: VendorId, spot: { pos: THREE.Vector3; inward: THREE.Vector3 }): void {
    const g = this.lockerFrame(0.7, 0.9);
    const info = VENDOR_LABEL[v];
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.32),
      new THREE.MeshBasicMaterial({ map: labelTexture([info.name, 'ONE PER BELL']), transparent: true }),
    );
    label.position.set(0, 0.14, 0.05);
    g.add(label);
    orientToWall(g, spot);
    this.ctx.scene.add(g);
    const bell = new BellIssue();
    this.issues.push(bell);
    this.ctx.interact.add({
      id: `vendor:${v}:${spot.pos.x.toFixed(0)}`,
      pos: [spot.pos.x, spot.pos.y, spot.pos.z],
      prompt: () => {
        const can = bell.canIssue(this.ctx.bell());
        return { text: info.name, holdSec: 0, enabled: can, sub: can ? 'ONE PULL PER MAN PER BELL' : 'ISSUED THIS BELL — WAIT FOR THE NEXT' };
      },
      execute: () => {
        if (!bell.canIssue(this.ctx.bell())) return;
        if (!this.ctx.onVendor(v)) {
          this.ctx.toast('NO ROOM IN THE KIT');
          return;
        }
        bell.issue(this.ctx.bell());
        this.ctx.toast(`${info.name} — ISSUED`);
      },
    });
  }

  private buildPerkStation(id: PerkId, spot: { pos: THREE.Vector3; inward: THREE.Vector3 }): void {
    const info = PERK_INFO[id];
    const g = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0x6a5a34, roughness: 0.45, metalness: 0.7, flatShading: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.05, 10), brass);
    body.position.y = -0.2;
    g.add(body);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.4, 10),
      new THREE.MeshStandardMaterial({ color: 0x8fb8ae, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.5 }),
    );
    glass.position.y = 0.5;
    g.add(glass);
    const capMat = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.5, emissive: info.color, emissiveIntensity: 0 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10), capMat);
    cap.position.y = 0.76;
    g.add(cap);
    this.poweredMats.push(capMat);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.4),
      new THREE.MeshBasicMaterial({ map: labelTexture([info.name, 'DRAUGHT']), transparent: true }),
    );
    label.position.set(0, 1.15, 0);
    g.add(label);
    orientToWall(g, spot);
    label.lookAt(spot.pos.clone().add(spot.inward.clone().multiplyScalar(3)));
    this.ctx.scene.add(g);
    // M13: one filled flask per rack, free with the Pile live — the 4-cap
    // and Second Wind's refill-after-use live in Perks (vendState)
    this.ctx.interact.add({
      id: `perk:${id}`,
      pos: [spot.pos.x, spot.pos.y, spot.pos.z],
      prompt: () => {
        if (!this.powered) return { text: info.name, holdSec: 0, enabled: false, sub: 'THE RACK IS DARK — NO POWER' };
        const state = this.ctx.perks.vendState(id);
        if (state === 'owned') return { text: info.name, holdSec: 0, enabled: false, sub: 'ALREADY DOSED' };
        if (state === 'capped') return { text: info.name, holdSec: 0, enabled: false, sub: 'FOUR IS THE RATION' };
        return { text: `TAKE THE FLASK — ${info.name}`, holdSec: 0, enabled: true, sub: 'DRINK IT DOWN' };
      },
      execute: () => {
        if (!this.powered || this.ctx.perks.vendState(id) !== 'ok') return;
        this.ctx.perks.buy(id);
        this.ctx.onPerkBought(id);
        this.ctx.toast(`${info.name} — ${info.blurb}`);
      },
    });
  }

  // ── power ──
  private buildPower(): void {
    const n = NODES.find((x) => x.tags.includes('power'));
    if (!n) return;
    const spot = wallSpot(n);
    const g = new THREE.Group();
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.25, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x2e3a40, roughness: 0.55, metalness: 0.5, flatShading: true }),
    );
    g.add(board);
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x5a2020, roughness: 0.5, emissive: 0x5a2020, emissiveIntensity: 0.5 });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.06), stripMat);
    strip.position.set(0, 0.45, 0.14);
    g.add(strip);
    const lever = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.55, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x71322c, roughness: 0.6, metalness: 0.5 }),
    );
    lever.position.set(0, -0.1, 0.2);
    lever.rotation.x = 0.5;
    g.add(lever);
    this.poweredStrip = stripMat;
    this.poweredLever = lever;
    orientToWall(g, spot);
    this.ctx.scene.add(g);
    this.ctx.interact.add({
      id: 'power',
      pos: [spot.pos.x, spot.pos.y, spot.pos.z],
      prompt: () => (this.powered ? null : { text: 'RESTART THE PILE', holdSec: TUNING.interact.powerHoldSec, enabled: true }),
      execute: () => this.setPowered(true),
    });
  }

  private poweredStrip: THREE.MeshStandardMaterial | null = null;
  private poweredLever: THREE.Mesh | null = null;

  setPowered(on: boolean): void {
    if (this.powered === on) return;
    this.powered = on;
    this.lights.visible = on;
    for (const m of this.poweredMats) m.emissiveIntensity = on ? 0.75 : 0;
    if (this.poweredStrip) {
      this.poweredStrip.color.setHex(on ? 0x2a7a8a : 0x5a2020);
      this.poweredStrip.emissive.setHex(on ? 0x3fc8e8 : 0x5a2020);
      this.poweredStrip.emissiveIntensity = on ? 1.2 : 0.5;
    }
    if (this.poweredLever) this.poweredLever.rotation.x = on ? -0.5 : 0.5;
    if (on) {
      // the Bench's grate grinds open with power, never re-closes (§10.4).
      // (The current user map carries no powerGate edge — this binds to any
      // that exist, so the mechanic is live the moment the map gains one.)
      for (const d of this.ctx.doors) if (d.kind === 'powerGate' && !d.open) this.grindOpen(d);
      this.ctx.toast('THE PILE IS LIVE');
      this.ctx.onPowerOn();
    }
  }

  // ── string lights: cherenkov-tinted bulbs tracing the two main arteries ──
  private buildStringLights(): void {
    const graph = new GraphPath(() => true); // arteries assume doors get opened
    const P = TUNING.power;
    const arteries: [string, string][] = [
      [ZONE_HUBS.sinkhole, ZONE_HUBS.galleries],
      [ZONE_HUBS.galleries, ZONE_HUBS.maze],
    ];
    const bulbs: number[] = [];
    const cablePts: THREE.Vector3[] = [];
    for (const [a, b] of arteries) {
      const path = graph.findPath(a, b);
      if (!path) continue;
      const pts = graph.expand(path);
      let carry = 0;
      let prevBulb: THREE.Vector3 | null = null;
      for (let i = 1; i < pts.length; i++) {
        const A = new THREE.Vector3(...pts[i - 1]);
        const B = new THREE.Vector3(...pts[i]);
        const segLen = A.distanceTo(B);
        let t = carry;
        while (t < segLen) {
          const p = A.clone().lerp(B, t / Math.max(segLen, 1e-6));
          // hang from the ceiling: march up to rock, drop the bulb below it
          let cy = p.y;
          for (let up = 0.3; up < 8; up += 0.3) {
            if (sdf(p.x, p.y + up, p.z) >= -0.1) {
              cy = p.y + up - P.bulbBelowCeilingM;
              break;
            }
            cy = p.y + up;
          }
          const bulb = new THREE.Vector3(p.x, cy, p.z);
          bulbs.push(bulb.x, bulb.y, bulb.z);
          if (prevBulb) cablePts.push(prevBulb, bulb);
          prevBulb = bulb;
          t += P.lightSpacingM;
        }
        carry = t - segLen;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bulbs), 3));
    const mat = new THREE.PointsMaterial({
      size: 0.5,
      map: softDotTexture(),
      transparent: true,
      opacity: 0.95,
      color: 0x7fd8ea,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pointsObj = new THREE.Points(geo, mat);
    pointsObj.frustumCulled = false;
    this.lights.add(pointsObj);
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePts);
    const cable = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x1e4a52, transparent: true, opacity: 0.5 }));
    cable.frustumCulled = false;
    this.lights.add(cable);
    this.lights.visible = false;
    this.ctx.scene.add(this.lights);
  }

  update(dt: number): void {
    // door grind animations
    for (let i = this.grinds.length - 1; i >= 0; i--) {
      const gr = this.grinds[i];
      gr.t += dt / TUNING.interact.doorGrindSec;
      gr.door.group.position.y -= 0.7 * dt;
      gr.door.group.rotation.z += 0.15 * dt;
      const o = Math.max(0, 1 - gr.t);
      for (const m of gr.mats) (m as THREE.Material & { opacity: number }).opacity = o;
      if (gr.t >= 1) {
        gr.door.group.visible = false;
        this.grinds.splice(i, 1);
      }
    }
    // silt puff
    if (this.puffLife > 0) {
      this.puffLife -= dt;
      const posAttr = this.puffPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + this.puffVels[i * 3] * dt,
          posAttr.getY(i) + this.puffVels[i * 3 + 1] * dt,
          posAttr.getZ(i) + this.puffVels[i * 3 + 2] * dt,
        );
      }
      posAttr.needsUpdate = true;
      this.puffMat.opacity = Math.min(0.7, this.puffLife);
      if (this.puffLife <= 0) this.puffPoints.visible = false;
    }
  }
}

function gunName(id: GunId): string {
  switch (id) {
    case 'speargun': return 'SPEARGUN';
    case 'pneuDriver': return 'PNEU-DRIVER';
    case 'flechette': return 'FLECHETTE SCATTER';
    case 'harpoon': return 'HARPOON RIFLE';
    case 'lineLance': return 'LINE LANCE';
    default: return 'WRIST DART';
  }
}
