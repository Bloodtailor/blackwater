// The specials (DESIGN §8.2–§8.3): the Angler (a lure that reads as somebody's
// chemlight), the Silt Shade (alive exactly as long as its silt-out), and the
// Guardians (the condemned hard-suits, still walking their posts). Plus the
// Cathedral's biolum field — the faint light that makes lights-off play
// readable in the Abyss. All numbers in tuning.specials.

import * as THREE from 'three';
import { NODES, type CaveNode } from '../cave/data';
import { resolveCollision, sdf } from '../cave/sdf';
import { TUNING } from '../tuning';
import { softDotTexture } from '../effects/atmosphere';
import type { SiltSystem } from '../effects/silt';

export type SpecialKind = 'angler' | 'shade' | 'guardian';

export interface Special {
  kind: SpecialKind;
  group: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  maxHp: number;
  state: 'idle' | 'windup' | 'attack' | 'aggro' | 'returning' | 'dead';
  stateT: number;
  phase: number;
  home: THREE.Vector3;
  meshes: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
  hitFlash: number;
  /** Shade: the silt-out chamber that owns it. */
  chamberId?: string;
  /** Guardian: post node id (respawn-next-round). */
  postId?: string;
  /** Angler: dash target once the windup commits. */
  lungeTarget?: THREE.Vector3;
  calmT: number;
  lureLight?: THREE.PointLight;
  fade: number;
}

export interface SpecialCtx {
  playerPos: THREE.Vector3;
  playerDead: boolean;
  time: number;
  lampOn: boolean;
  sprinting: boolean;
  /** A special's hit lands on the player. */
  onHit: (damage: number, fromDir: THREE.Vector3, airLoss: number) => void;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class SpecialManager {
  readonly specials: Special[] = [];
  /** Guardians downed this round — they walk again next round. */
  private downedPosts: string[] = [];
  private ray = new THREE.Raycaster();
  private vTmp = new THREE.Vector3();
  private vTmp2 = new THREE.Vector3();
  private qTmp = new THREE.Quaternion();
  private shootables: THREE.Mesh[] = [];

  constructor(
    private scene: THREE.Scene,
    private silt: SiltSystem,
    private hooks: { toast: (m: string) => void; award: (n: number) => void; dropBattery: (pos: THREE.Vector3) => void },
  ) {
    for (const n of NODES.filter((x) => x.tags.includes('guardianPost'))) this.spawnGuardian(n);
    this.buildBiolum();
  }

  // ── builders ──

  private mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...opts });
  }

  private register(s: Special): void {
    for (const m of s.meshes) {
      m.userData.special = s;
      this.shootables.push(m);
    }
    this.specials.push(s);
    this.scene.add(s.group);
  }

  private makeSpecial(kind: SpecialKind, group: THREE.Group, hp: number, home: THREE.Vector3): Special {
    const meshes: THREE.Mesh[] = [];
    const mats: THREE.MeshStandardMaterial[] = [];
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        meshes.push(mesh);
        mats.push(mesh.material as THREE.MeshStandardMaterial);
      }
    });
    return {
      kind,
      group,
      pos: group.position,
      vel: new THREE.Vector3(),
      hp,
      maxHp: hp,
      state: 'idle',
      stateT: 0,
      phase: Math.random() * 20,
      home,
      meshes,
      mats,
      hitFlash: 0,
      calmT: 0,
      fade: 1,
    };
  }

  /** The Angler: near-black body, a chemlight-green lure on a stalk. */
  spawnAngler(nodeId: string): Special {
    const n = NODES.find((x) => x.id === nodeId) ?? NODES[0];
    const g = new THREE.Group();
    const body = this.mat(0x0b1012, { roughness: 0.6, metalness: 0.2 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 1.4), body);
    g.add(torso);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), body);
    jaw.position.set(0, -0.24, -0.75);
    g.add(jaw);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), body);
    tail.position.set(0, 0.05, 0.9);
    g.add(tail);
    // the stalk + the lie: a glow that reads EXACTLY like a chemlight
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.9, 5), body);
    stalk.rotation.x = 0.9;
    stalk.position.set(0, 0.55, -0.85);
    g.add(stalk);
    const lureSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: softDotTexture(), color: 0x8fd44a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    lureSprite.scale.setScalar(0.55);
    lureSprite.position.set(0, 0.92, -1.2);
    g.add(lureSprite);
    const lure = new THREE.PointLight(0x6fd44a, 2.5, 7, 2);
    lure.position.copy(lureSprite.position);
    g.add(lure);
    g.position.set(n.pos[0], n.pos[1], n.pos[2]);
    const s = this.makeSpecial('angler', g, TUNING.specials.angler.hp, g.position.clone());
    s.lureLight = lure;
    this.register(s);
    return s;
  }

  /** The Silt Shade: a darker patch of the cloud, and it moves. */
  private spawnShade(chamberId: string, at: THREE.Vector3): Special {
    const g = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), this.mat(0x04070a, { transparent: true, opacity: 0.9 }));
    inner.scale.set(0.7, 1.15, 0.7);
    g.add(inner);
    const outer = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.75, 1),
      this.mat(0x060b10, { transparent: true, opacity: 0.35, depthWrite: false }),
    );
    outer.scale.set(0.8, 1.25, 0.8);
    g.add(outer);
    g.position.copy(at);
    const s = this.makeSpecial('shade', g, TUNING.specials.shade.hp, at.clone());
    s.chamberId = chamberId;
    this.register(s);
    return s;
  }

  /** A Guardian: the condemned suit at its post. */
  private spawnGuardian(n: CaveNode): Special {
    const g = new THREE.Group();
    const suit = this.mat(0x2c3833, { metalness: 0.45, roughness: 0.7 });
    const brass = this.mat(0x54492a, { metalness: 0.7, roughness: 0.45 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.1, 8), suit);
    g.add(torso);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), brass);
    helm.position.y = 0.85;
    g.add(helm);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.06), this.mat(0x05080a, { roughness: 0.3, metalness: 0.1 }));
    face.position.set(0, 0.85, 0.3);
    g.add(face);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.95, 0.2), suit);
      arm.position.set(sx * 0.62, -0.05, 0);
      g.add(arm);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.26), suit);
      leg.position.set(sx * 0.22, -1.0, 0);
      g.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.4), brass);
      boot.position.set(sx * 0.22, -1.5, 0.05);
      g.add(boot);
    }
    // find the post's floor
    let floorY = n.pos[1] - n.radius * 0.5;
    for (let d = 0.4; d < n.radius * 2.2; d += 0.25) {
      if (sdf(n.pos[0], n.pos[1] - d, n.pos[2]) >= -0.1) {
        floorY = n.pos[1] - d + 1.65;
        break;
      }
    }
    g.position.set(n.pos[0] + 1.5, floorY, n.pos[2]);
    const s = this.makeSpecial('guardian', g, TUNING.specials.guardian.hp, new THREE.Vector3(n.pos[0], floorY, n.pos[2]));
    s.postId = n.id;
    this.register(s);
    return s;
  }

  /** The Cathedral's own light: a static biolum field for lights-off play. */
  private buildBiolum(): void {
    const cath = NODES.find((n) => n.id === 'cathedral');
    if (!cath) return;
    const B = TUNING.specials.biolum;
    const st = cath.stretch ?? [1, 1, 1];
    const pts: number[] = [];
    let seed = 1234;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < B.count; i++) {
      const a = rand() * Math.PI * 2;
      const b = Math.acos(2 * rand() - 1);
      const r = Math.cbrt(rand());
      const x = cath.pos[0] + Math.sin(b) * Math.cos(a) * cath.radius * st[0] * 0.92 * r;
      const y = cath.pos[1] + Math.cos(b) * cath.radius * st[1] * 0.92 * r;
      const z = cath.pos[2] + Math.sin(b) * Math.sin(a) * cath.radius * st[2] * 0.92 * r;
      if (sdf(x, y, z) < -0.4) pts.push(x, y, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    const mat = new THREE.PointsMaterial({
      size: B.sizeM,
      map: softDotTexture(),
      color: 0x3fae8a,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cloud = new THREE.Points(geo, mat);
    cloud.frustumCulled = false;
    this.scene.add(cloud);
  }

  // ── lifecycle ──

  get anglerAlive(): boolean {
    return this.specials.some((s) => s.kind === 'angler' && s.state !== 'dead');
  }

  /** Round rollover: guardian respawns + the Angler's spawn roll. */
  onRoundStart(round: number, playerPos: THREE.Vector3): void {
    for (const postId of this.downedPosts) {
      const n = NODES.find((x) => x.id === postId);
      if (n) this.spawnGuardian(n); // the suit walks its post again
    }
    this.downedPosts = [];
    const A = TUNING.specials.angler;
    if (round >= A.fromRound && !this.anglerAlive && Math.random() < A.spawnChanceAtRoundStart) {
      const darks = NODES.filter(
        (n) =>
          (n.zone === 'maze' || n.zone === 'throat' || n.zone === 'abyss') &&
          !n.dry &&
          Math.hypot(n.pos[0] - playerPos.x, n.pos[1] - playerPos.y, n.pos[2] - playerPos.z) > A.minSpawnDistM,
      );
      if (darks.length) this.spawnAngler(darks[Math.floor(Math.random() * darks.length)].id);
    }
  }

  update(dt: number, ctx: SpecialCtx): void {
    // Shade lifecycle: an active silt-out in the PLAYER's chamber grows one;
    // when its cloud settles (or is cleared), the Shade dies with it.
    const S = TUNING.specials.shade;
    const pc = this.silt.chamberAt(ctx.playerPos.x, ctx.playerPos.y, ctx.playerPos.z);
    if (pc && this.silt.siltouts.has(pc)) {
      const age = this.silt.siltouts.get(pc) ?? 0;
      const existing = this.specials.some((s) => s.kind === 'shade' && s.chamberId === pc && s.state !== 'dead');
      if (age >= S.spawnDelaySec && !existing && !ctx.playerDead) {
        // it forms at the edge of what you can see
        this.vTmp.set(ctx.playerPos.x + (Math.random() - 0.5) * 8, ctx.playerPos.y + (Math.random() - 0.5) * 3, ctx.playerPos.z + (Math.random() - 0.5) * 8);
        if (sdf(this.vTmp.x, this.vTmp.y, this.vTmp.z) < -0.6) this.spawnShade(pc, this.vTmp);
      }
    }
    for (const s of this.specials) {
      if (s.kind === 'shade' && s.state !== 'dead' && s.chamberId && !this.silt.siltouts.has(s.chamberId)) {
        s.state = 'dead'; // the silt lies down and takes it along
        s.stateT = 0;
      }
    }

    for (let i = this.specials.length - 1; i >= 0; i--) {
      const s = this.specials[i];
      s.stateT += dt;
      s.hitFlash = Math.max(0, s.hitFlash - dt * 4);
      for (const m of s.mats) m.emissive.setScalar(s.hitFlash * 0.4);
      if (s.state === 'dead') {
        s.fade -= dt / 1.6;
        s.pos.y -= dt * 0.3;
        for (const m of s.mats) {
          m.transparent = true;
          m.opacity = Math.max(0, Math.min(m.opacity, s.fade));
        }
        if (s.lureLight) s.lureLight.intensity = Math.max(0, s.fade * 2.5);
        if (s.fade <= 0) {
          this.scene.remove(s.group);
          this.shootables = this.shootables.filter((m) => m.userData.special !== s);
          this.specials.splice(i, 1);
        }
        continue;
      }
      if (ctx.playerDead) continue;
      const dist = s.pos.distanceTo(ctx.playerPos);
      if (s.kind === 'angler') this.updateAngler(s, dt, ctx, dist);
      else if (s.kind === 'shade') this.updateShade(s, dt, ctx, dist);
      else this.updateGuardian(s, dt, ctx, dist);
    }
  }

  private updateAngler(s: Special, dt: number, ctx: SpecialCtx, dist: number): void {
    const A = TUNING.specials.angler;
    if (s.lureLight) s.lureLight.intensity = 2.5 + Math.sin(ctx.time * 2.1 + s.phase) * 0.6;
    if (s.state === 'idle') {
      // hold near the lure spot, bobbing — a chemlight somebody left
      this.vTmp.copy(s.home).sub(s.pos);
      this.vTmp.y += Math.sin(ctx.time * 0.9 + s.phase) * A.lureBobAmp;
      s.vel.lerp(this.vTmp.clampLength(0, A.cruiseSpeed), Math.min(1, dt * 2));
      if (dist < A.lungeTriggerM) {
        s.state = 'windup';
        s.stateT = 0;
      }
    } else if (s.state === 'windup') {
      s.vel.multiplyScalar(Math.max(0, 1 - 4 * dt)); // the light goes still
      if (s.stateT >= A.lungeWindupSec) {
        s.state = 'attack';
        s.stateT = 0;
        s.lungeTarget = ctx.playerPos.clone();
      }
    } else if (s.state === 'attack' && s.lungeTarget) {
      this.vTmp.copy(s.lungeTarget).sub(s.pos);
      const d = this.vTmp.length();
      s.vel.copy(this.vTmp.normalize().multiplyScalar(A.lungeSpeed));
      if (dist < 1.2) {
        this.vTmp.copy(ctx.playerPos).sub(s.pos).normalize();
        ctx.onHit(A.damage, this.vTmp.clone(), 0);
        s.state = 'idle';
        // it relocates — the light reappears somewhere else nearby
        s.home.set(s.pos.x + (Math.random() - 0.5) * 12, s.pos.y + (Math.random() - 0.5) * 4, s.pos.z + (Math.random() - 0.5) * 12);
      } else if (d < 0.6 || s.stateT > 2.2) {
        s.state = 'idle';
        s.home.set(s.pos.x + (Math.random() - 0.5) * 10, s.pos.y + (Math.random() - 0.5) * 3, s.pos.z + (Math.random() - 0.5) * 10);
      }
    }
    s.pos.addScaledVector(s.vel, dt);
    resolveCollision(s.pos, 0.5);
    this.faceVel(s, dt);
  }

  private updateShade(s: Special, dt: number, ctx: SpecialCtx, dist: number): void {
    const S = TUNING.specials.shade;
    s.calmT = Math.max(0, s.calmT - dt);
    this.vTmp.copy(ctx.playerPos).sub(s.pos).normalize().multiplyScalar(S.speed);
    s.vel.lerp(this.vTmp, Math.min(1, dt * 3));
    s.pos.addScaledVector(s.vel, dt);
    resolveCollision(s.pos, 0.45);
    // it exists only inside its cloud — pull back toward the chamber center
    const ch = this.silt.chambers.find((c) => c.id === s.chamberId);
    if (ch) {
      const dx = (s.pos.x - ch.c[0]) / ch.rx;
      const dy = (s.pos.y - ch.c[1]) / ch.ry;
      const dz = (s.pos.z - ch.c[2]) / ch.rz;
      if (dx * dx + dy * dy + dz * dz > 1) {
        s.pos.set(s.pos.x - dx * ch.rx * 0.03, s.pos.y - dy * ch.ry * 0.03, s.pos.z - dz * ch.rz * 0.03);
      }
    }
    s.group.rotation.y += dt * 0.8;
    s.group.rotation.x = Math.sin(ctx.time * 1.3 + s.phase) * 0.2;
    if (dist < 1.2 && s.calmT <= 0) {
      this.vTmp.copy(ctx.playerPos).sub(s.pos).normalize();
      ctx.onHit(S.damage, this.vTmp.clone(), 0);
      s.calmT = S.grabCooldownSec;
    }
  }

  private updateGuardian(s: Special, dt: number, ctx: SpecialCtx, dist: number): void {
    const G = TUNING.specials.guardian;
    const homeDist = s.pos.distanceTo(s.home);
    // sensory tiers: proximity < lamp < sprint+lamp (DESIGN §8.3)
    const provoked =
      dist < G.proximityAggroM ||
      (ctx.lampOn && dist < G.lightAggroM) ||
      (ctx.lampOn && ctx.sprinting && dist < G.sprintLightAggroM);
    if (provoked) s.calmT = G.calmSec;
    else s.calmT = Math.max(0, s.calmT - dt);
    const aggro = s.calmT > 0 && homeDist < G.leashM;

    if (s.state === 'windup') {
      s.vel.multiplyScalar(Math.max(0, 1 - 5 * dt));
      if (s.stateT >= G.attackWindupSec) {
        if (dist < G.attackRangeM * 1.5) {
          this.vTmp.copy(ctx.playerPos).sub(s.pos).normalize();
          ctx.onHit(G.damage, this.vTmp.clone().multiplyScalar(G.hitShove).normalize(), G.hitAirLoss);
        }
        s.state = 'aggro';
        s.stateT = 0;
      }
    } else if (aggro) {
      s.state = 'aggro';
      if (dist < G.attackRangeM) {
        s.state = 'windup';
        s.stateT = 0;
      } else {
        this.vTmp.copy(ctx.playerPos).sub(s.pos).normalize().multiplyScalar(G.aggroSpeed);
        s.vel.lerp(this.vTmp, Math.min(1, dt * 2.2));
      }
    } else {
      // the patrol: a slow circuit of the post, forever
      s.state = 'returning';
      const ang = ctx.time * 0.25 + s.phase;
      this.vTmp.set(s.home.x + Math.cos(ang) * 2.2, s.home.y, s.home.z + Math.sin(ang) * 2.2).sub(s.pos);
      const d = this.vTmp.length();
      s.vel.lerp(this.vTmp.normalize().multiplyScalar(Math.min(G.patrolSpeed * Math.max(1, homeDist / 6), d * 2)), Math.min(1, dt * 1.5));
    }
    s.pos.addScaledVector(s.vel, dt);
    resolveCollision(s.pos, 0.7);
    this.faceVel(s, dt, s.state === 'aggro' || s.state === 'windup' ? ctx.playerPos : undefined);
    // the walk: ponderous bob
    s.group.rotation.z = Math.sin(ctx.time * 2.2 + s.phase) * 0.05;
  }

  private faceVel(s: Special, dt: number, at?: THREE.Vector3): void {
    this.vTmp2.copy(at ? this.vTmp.copy(at).sub(s.pos) : s.vel);
    this.vTmp2.y *= s.kind === 'guardian' ? 0.2 : 1; // suits stay upright
    if (this.vTmp2.lengthSq() < 0.01) return;
    this.qTmp.setFromUnitVectors(Z_AXIS, this.vTmp2.normalize());
    s.group.quaternion.slerp(this.qTmp, Math.min(1, dt * 3));
  }

  // ── combat interface ──

  raycastShot(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { special: Special; dist: number; point: [number, number, number] } | null {
    this.ray.set(origin, dir);
    this.ray.far = maxDist;
    for (const s of this.specials) if (s.state !== 'dead') s.group.updateWorldMatrix(false, true);
    const hits = this.ray.intersectObjects(this.shootables, false);
    for (const h of hits) {
      const s = h.object.userData.special as Special | undefined;
      if (!s || s.state === 'dead') continue;
      return { special: s, dist: h.distance, point: [h.point.x, h.point.y, h.point.z] };
    }
    return null;
  }

  /** Nearest live special inside a melee reach-and-arc (knife/stab paths). */
  nearestInArc(origin: THREE.Vector3, dir: THREE.Vector3, rangeM: number, arcDeg: number): Special | null {
    const cosArc = Math.cos(THREE.MathUtils.degToRad(arcDeg));
    let best: Special | null = null;
    let bestD = Infinity;
    for (const s of this.specials) {
      if (s.state === 'dead') continue;
      this.vTmp.copy(s.pos).sub(origin);
      const d = this.vTmp.length() - 0.6;
      if (d > rangeM || d >= bestD) continue;
      if (this.vTmp.normalize().dot(dir) < cosArc) continue;
      best = s;
      bestD = d;
    }
    return best;
  }

  applyDamage(s: Special, dmg: number): 'hit' | 'killed' {
    if (s.state === 'dead') return 'hit';
    s.hp -= dmg;
    s.hitFlash = 1;
    if (s.hp > 0) return 'hit';
    s.hp = 0;
    s.state = 'dead';
    s.stateT = 0;
    if (s.kind === 'angler') {
      this.hooks.dropBattery(s.pos.clone());
      this.hooks.award(TUNING.specials.angler.killPoints);
      this.hooks.toast('THE LIGHT WAS NEVER A LIGHT');
    } else if (s.kind === 'shade') {
      this.hooks.award(TUNING.specials.shade.killPoints);
    } else {
      this.hooks.award(TUNING.specials.guardian.killPoints);
      if (s.postId) this.downedPosts.push(s.postId);
      this.hooks.toast('THE SUIT SETTLES — UNTIL NEXT SHIFT');
    }
    return 'killed';
  }

  /** Debug. */
  killAllSpecials(): void {
    for (const s of this.specials) if (s.state !== 'dead') this.applyDamage(s, s.hp + 1);
  }
}
